// Exercises the real routes/Redis logic; only the Postgres query layer is replaced by an in-memory fake.
// Needs a Redis at REDIS_URL (default localhost:6379); the suite is skipped when none is reachable.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const redis = require('../src/redis');
const { pool } = require('../src/db');

const users = [];
pool.query = async (sql, params = []) => {
  if (/^INSERT INTO users/i.test(sql)) {
    const [name, email, password_hash] = params;
    if (users.some((u) => u.email === email)) throw Object.assign(new Error('duplicate'), { code: '23505' });
    const u = { id: `00000000-0000-0000-0000-${String(users.length + 1).padStart(12, '0')}`, name, email, password_hash, role: 'user' };
    users.push(u);
    return { rows: [u] };
  }
  if (/WHERE email = \$1/i.test(sql)) return { rows: users.filter((u) => u.email === params[0]) };
  if (/WHERE id = \$1/i.test(sql)) return { rows: users.filter((u) => u.id === params[0]) };
  if (/SELECT 1/i.test(sql)) return { rows: [{}] };
  throw new Error(`unexpected query: ${sql}`);
};

const { app } = require('../src/index');
let server;
let base;

async function req(method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test.before(async () => {
  try {
    await redis.ping();
  } catch {
    console.log('redis unavailable - skipping route tests');
    process.exitCode = 0;
    await redis.quit().catch(() => {});
    process.exit(0);
  }
  await redis.flushdb();
  server = http.createServer(app).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  await redis.quit().catch(() => {});
});

const creds = { name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'Passw0rd123' };

test('register validates input, normalises email, returns tokens', async () => {
  assert.strictEqual((await req('POST', '/register', { name: 'A', email: 'bad', password: '1' })).status, 400);
  const r = await req('POST', '/register', creds);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.user.email, 'ada@example.com');
  assert.strictEqual(r.body.user.role, 'user');
  const claims = jwt.verify(r.body.accessToken, 'test-secret');
  assert.strictEqual(claims.sub, r.body.user.id);
  assert.ok(!('password_hash' in r.body.user));
});

test('duplicate email -> 409', async () => {
  assert.strictEqual((await req('POST', '/register', creds)).status, 409);
});

test('login: wrong password 401, correct 200', async () => {
  assert.strictEqual((await req('POST', '/login', { email: creds.email, password: 'nope-nope1' })).status, 401);
  const ok = await req('POST', '/login', { email: creds.email, password: creds.password });
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.body.accessToken && ok.body.refreshToken);
});

test('refresh tokens rotate and are single-use', async () => {
  const { body } = await req('POST', '/login', { email: creds.email, password: creds.password });
  const first = await req('POST', '/refresh', { refreshToken: body.refreshToken });
  assert.strictEqual(first.status, 200);
  assert.notStrictEqual(first.body.refreshToken, body.refreshToken);
  assert.strictEqual((await req('POST', '/refresh', { refreshToken: body.refreshToken })).status, 401);
  assert.strictEqual((await req('POST', '/refresh', { refreshToken: first.body.refreshToken })).status, 200);
});

test('logout revokes the refresh token', async () => {
  const { body } = await req('POST', '/login', { email: creds.email, password: creds.password });
  const out = await fetch(base + '/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: body.refreshToken }),
  });
  assert.strictEqual(out.status, 204);
  assert.strictEqual((await req('POST', '/refresh', { refreshToken: body.refreshToken })).status, 401);
});

test('/me trusts gateway identity header only', async () => {
  assert.strictEqual((await req('GET', '/me')).status, 401);
  const reg = users[0];
  const me = await req('GET', '/me', null, { 'x-user-id': reg.id });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.user.email, 'ada@example.com');
});

test('account locks after 5 failed logins (Redis counter)', async () => {
  await req('POST', '/register', { name: 'Grace Hopper', email: 'grace@example.com', password: 'Passw0rd123' });
  for (let i = 0; i < 5; i++) {
    assert.strictEqual((await req('POST', '/login', { email: 'grace@example.com', password: 'wrong-pass1' })).status, 401);
  }
  // even the correct password is refused while locked
  assert.strictEqual((await req('POST', '/login', { email: 'grace@example.com', password: 'Passw0rd123' })).status, 429);
});

test('health and unknown routes', async () => {
  assert.strictEqual((await req('GET', '/health')).status, 200);
  assert.strictEqual((await req('GET', '/ready')).status, 200);
  assert.strictEqual((await req('GET', '/nope')).status, 404);
});
