const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const client = require('prom-client');

const config = require('./config');
const { pool, init } = require('./db');
const redis = require('./redis');
const routes = require('./routes');

client.collectDefaultMetrics({ prefix: 'auth_' });
const httpDuration = new client.Histogram({
  name: 'auth_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '50kb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny', { skip: (req) => req.path === '/health' || req.path === '/metrics' }));

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => end({ method: req.method, route: req.route ? req.baseUrl + req.route.path : 'unmatched', status: res.statusCode }));
  next();
});

// Liveness: process is up. Readiness: dependencies are reachable.
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));
app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
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

app.use('/', routes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function main() {
  await init();
  const server = app.listen(config.port, () => console.log(`auth-service listening on :${config.port}`));
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await Promise.allSettled([pool.end(), redis.quit()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('fatal', err);
    process.exit(1);
  });
}

module.exports = { app };
