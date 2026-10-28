const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const client = require('prom-client');
const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { authorize } = require('./policy');

const config = {
  port: Number(process.env.PORT || 8080),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  authUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
  productUrl: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002',
  orderUrl: process.env.ORDER_SERVICE_URL || 'http://localhost:4003',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()),
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 300),
  authRateLimitPerMinute: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE || 30),
};

if (process.env.NODE_ENV === 'production' && config.jwtSecret.startsWith('dev-')) {
  throw new Error('JWT_SECRET must be set to a strong value in production');
}

// Redis backs the rate limiter so the limit is shared by every gateway replica.
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });
redis.on('error', (err) => console.error('redis error', err.message));

// rate-limit-redis loads its Lua script at startup; if Redis is briefly unreachable that rejection
// is unhandled and would crash the gateway. Log instead: the limiter fails open (passOnStoreError)
// and /ready reports 503 until Redis is back, so the orchestrator holds traffic.
process.on('unhandledRejection', (reason) => console.error('unhandled rejection:', reason && reason.message ? reason.message : reason));

client.collectDefaultMetrics({ prefix: 'gateway_' });
const httpDuration = new client.Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'Gateway request duration in seconds',
  labelNames: ['upstream', 'method', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(morgan('tiny', { skip: (req) => ['/health', '/ready', '/metrics'].includes(req.path) }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'api-gateway' }));
app.get('/ready', async (_req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', error: err.message });
  }
});
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const limiter = (prefix, max) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true, // fail open if Redis is down
    message: { error: 'Too many requests, slow down.' },
    store: new RedisStore({ prefix: `rl:${prefix}:`, sendCommand: (...args) => redis.call(...args) }),
  });

app.use('/api/auth', limiter('auth', config.authRateLimitPerMinute));
app.use('/api', limiter('api', config.rateLimitPerMinute));

// Authentication + authorization. Identity headers a client sends are ALWAYS discarded;
// only values derived from a verified JWT are forwarded to services.
app.use('/api', (req, res, next) => {
  for (const h of Object.keys(req.headers)) if (h.startsWith('x-user-')) delete req.headers[h];

  let user = null;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const claims = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'] });
      user = { id: claims.sub, role: claims.role || 'user', email: claims.email || '' };
    } catch {
      user = null; // expired/invalid -> treated as anonymous; protected routes answer 401
    }
  }
  const denied = authorize({ method: req.method, path: req.path === '/' ? req.baseUrl : req.originalUrl.split('?')[0], user });
  if (denied) return res.status(denied.status).json({ error: denied.error });

  req.user = user;
  if (user) {
    req.headers['x-user-id'] = String(user.id);
    req.headers['x-user-role'] = user.role;
    req.headers['x-user-email'] = user.email;
  }
  next();
});

// One proxy per upstream. `pathFilter` selects requests; `pathRewrite` maps the public
// path to the service's own path. Anything not listed here (e.g. /internal/*) is a 404.
function upstream(name, target, filter, rewrite) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter: filter,
    pathRewrite: rewrite,
    proxyTimeout: 15000,
    timeout: 20000,
    on: {
      proxyReq: (proxyReq, req) => {
        req.__start = process.hrtime.bigint();
        proxyReq.setHeader('x-forwarded-for', req.ip);
      },
      proxyRes: (proxyRes, req) => {
        const seconds = Number(process.hrtime.bigint() - (req.__start || process.hrtime.bigint())) / 1e9;
        httpDuration.observe({ upstream: name, method: req.method, status: proxyRes.statusCode }, seconds);
      },
      error: (err, _req, res) => {
        console.error(`upstream ${name} error:`, err.message);
        if (res && !res.headersSent && typeof res.writeHead === 'function') {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `${name} service unavailable` }));
        }
      },
    },
  });
}

app.use(upstream('auth', config.authUrl, '/api/auth', { '^/api/auth': '' }));
app.use(upstream('product', config.productUrl, ['/api/products', '/api/categories'], { '^/api': '' }));
app.use(upstream('order', config.orderUrl, ['/api/cart', '/api/orders'], { '^/api': '' }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const server = app.listen(config.port, () => console.log(`api-gateway listening on :${config.port}`));
const shutdown = () => {
  server.close(async () => {
    await redis.quit().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
