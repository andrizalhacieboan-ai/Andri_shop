import { verifyToken } from './auth.js';
export function getSession(req) {
  const a = req.headers.authorization || '';
  return verifyToken(a.startsWith('Bearer ') ? a.slice(7) : '');
}
