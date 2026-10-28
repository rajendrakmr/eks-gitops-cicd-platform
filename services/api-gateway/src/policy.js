// Access policy, kept separate from the server so it is trivially unit-testable.

const PUBLIC_ROUTES = [
  ['POST', /^\/api\/auth\/(register|login|refresh|logout)$/],
  ['GET', /^\/api\/products(\/[\w-]+)?$/],
  ['GET', /^\/api\/categories$/],
];

const isPublic = (method, path) => PUBLIC_ROUTES.some(([m, re]) => m === method && re.test(path));

// Writes to the catalog are admin only.
const requiresAdmin = (method, path) =>
  method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && /^\/api\/products(\/|$)/.test(path);

// Returns { status, error } when the request must be rejected, otherwise null.
function authorize({ method, path, user }) {
  if (isPublic(method, path) && !requiresAdmin(method, path)) return null;
  if (!user) return { status: 401, error: 'Authentication required' };
  if (requiresAdmin(method, path) && user.role !== 'admin') return { status: 403, error: 'Admin access required' };
  return null;
}

module.exports = { authorize, isPublic, requiresAdmin };
