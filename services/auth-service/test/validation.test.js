const test = require('node:test');
const assert = require('node:assert');
const { validateRegister, validateLogin } = require('../src/validation');

test('register accepts a valid payload', () => {
  const errors = validateRegister({ name: 'Asha', email: 'asha@example.com', password: 'Secret123' });
  assert.deepStrictEqual(errors, {});
});

test('register rejects weak password, bad email and short name', () => {
  const errors = validateRegister({ name: 'A', email: 'nope', password: 'short' });
  assert.ok(errors.name && errors.email && errors.password);
});

test('register rejects password without a digit', () => {
  assert.ok(validateRegister({ name: 'Asha', email: 'a@b.co', password: 'onlyletters' }).password);
});

test('login requires email and password', () => {
  assert.ok(validateLogin({}).email);
  assert.ok(validateLogin({ email: 'a@b.co' }).password);
  assert.deepStrictEqual(validateLogin({ email: 'a@b.co', password: 'x' }), {});
});
