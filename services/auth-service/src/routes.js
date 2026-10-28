const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('./db');
const redis = require('./redis');
const config = require('./config');
const { validateRegister, validateLogin } = require('./validation');

const router = express.Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// A pre-computed hash so login takes the same time whether or not the user exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const refreshKey = (token) => `refresh:${sha256(token)}`;

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

function signAccess(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email, name: user.name }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.accessTtl,
  });
}

async function issueTokens(user) {
  const refreshToken = crypto.randomBytes(40).toString('hex');
  await redis.set(refreshKey(refreshToken), user.id, 'EX', config.refreshTtlSeconds);
  return { accessToken: signAccess(user), refreshToken, expiresIn: config.accessTtlSeconds };
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const errors = validateRegister(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const { name, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
         RETURNING id, name, email, role`,
        [name.trim(), email.toLowerCase(), hash]
      );
      const user = rows[0];
      res.status(201).json({ user: publicUser(user), ...(await issueTokens(user)) });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Email is already registered' });
      throw err;
    }
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const errors = validateLogin(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const email = req.body.email.toLowerCase();
    const failKey = `login:fail:${email}`;
    const failures = Number((await redis.get(failKey)) || 0);
    if (failures >= config.maxLoginFailures) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const ok = await bcrypt.compare(req.body.password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      await redis.multi().incr(failKey).expire(failKey, config.loginLockSeconds).exec();
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await redis.del(failKey);
    res.json({ user: publicUser(user), ...(await issueTokens(user)) });
  })
);

// Refresh-token rotation: each refresh token can be used exactly once.
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken !== 'string') return res.status(400).json({ error: 'refreshToken is required' });

    const key = refreshKey(refreshToken);
    const userId = await redis.get(key);
    if (!userId) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    await redis.del(key);

    const { rows } = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [userId]);
    if (!rows[0]) return res.status(401).json({ error: 'User no longer exists' });
    res.json({ user: publicUser(rows[0]), ...(await issueTokens(rows[0])) });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken === 'string') await redis.del(refreshKey(refreshToken));
    res.status(204).end();
  })
);

// Trusts the identity headers injected by the API gateway (service is not publicly exposed).
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const id = req.headers['x-user-id'];
    if (!id) return res.status(401).json({ error: 'Unauthenticated' });
    const { rows } = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(rows[0]) });
  })
);

module.exports = router;
