const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('./config');

const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
pool.on('error', (err) => console.error('pg pool error', err.message));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`waiting for postgres (${i + 1}/${retries}): ${err.message}`);
      await sleep(2000);
    }
  }
  throw new Error('postgres not reachable');
}

// Creates schema and seeds the admin user. An advisory lock makes this safe
// when several replicas boot at the same moment.
async function init() {
  await waitForDb();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(7001)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name          TEXT NOT NULL,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const hash = await bcrypt.hash(config.adminPassword, 10);
    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Admin', $1, $2, 'admin') ON CONFLICT (email) DO NOTHING`,
      [config.adminEmail.toLowerCase(), hash]
    );
  } finally {
    await client.query('SELECT pg_advisory_unlock(7001)').catch(() => {});
    client.release();
  }
}

module.exports = { pool, init };
