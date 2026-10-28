const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegister(body) {
  const { name, email, password } = body || {};
  const errors = {};
  if (typeof name !== 'string' || name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) errors.email = 'A valid email is required';
  if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must be 8+ characters and include a letter and a number';
  }
  return errors;
}

function validateLogin(body) {
  const { email, password } = body || {};
  const errors = {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) errors.email = 'A valid email is required';
  if (typeof password !== 'string' || password.length === 0) errors.password = 'Password is required';
  return errors;
}

module.exports = { validateRegister, validateLogin };
