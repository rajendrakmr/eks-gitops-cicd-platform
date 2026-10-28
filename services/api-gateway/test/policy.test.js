const test = require('node:test');
const assert = require('node:assert');
const { authorize } = require('../src/policy');

const user = { id: '1', role: 'user' };
const admin = { id: '2', role: 'admin' };

test('catalog reads and login are public', () => {
  assert.strictEqual(authorize({ method: 'GET', path: '/api/products', user: null }), null);
  assert.strictEqual(authorize({ method: 'GET', path: '/api/products/abc123', user: null }), null);
  assert.strictEqual(authorize({ method: 'POST', path: '/api/auth/login', user: null }), null);
});

test('cart, orders and profile require authentication', () => {
  for (const path of ['/api/cart', '/api/orders', '/api/auth/me']) {
    assert.strictEqual(authorize({ method: 'GET', path, user: null }).status, 401);
    assert.strictEqual(authorize({ method: 'GET', path, user }), null);
  }
});

test('catalog writes are admin only', () => {
  assert.strictEqual(authorize({ method: 'POST', path: '/api/products', user: null }).status, 401);
  assert.strictEqual(authorize({ method: 'POST', path: '/api/products', user }).status, 403);
  assert.strictEqual(authorize({ method: 'DELETE', path: '/api/products/abc', user: admin }), null);
});
