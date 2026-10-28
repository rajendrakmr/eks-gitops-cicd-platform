const config = {
  port: Number(process.env.PORT || 4001),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/auth_db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  accessTtlSeconds: 15 * 60,
  refreshTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 7 * 24 * 3600),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@12345',
  maxLoginFailures: 5,
  loginLockSeconds: 15 * 60,
};

if (process.env.NODE_ENV === 'production' && config.jwtSecret.startsWith('dev-')) {
  throw new Error('JWT_SECRET must be set to a strong value in production');
}

module.exports = config;
