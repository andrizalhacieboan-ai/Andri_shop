// GET /api/auth/me  (Header: Authorization: Bearer <token>)
import { verifyToken } from '../_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verifyToken(token);

  if (!payload) return res.status(401).json({ success: false, message: 'Token tidak valid atau kedaluwarsa' });

  return res.status(200).json({
    success: true,
    user: { name: payload.name, email: payload.email, role: payload.role, expiresAt: payload.exp },
  });
}
