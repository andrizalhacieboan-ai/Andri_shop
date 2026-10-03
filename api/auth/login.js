// POST /api/auth/login  { username, password, remember }
// Cocokkan username ATAU email + password admin (dari ENV, timing-safe).
import { getAdminAccount, safeEqual, signToken, isRateLimited, registerFailedAttempt, clearRateLimit } from '../_lib/auth.js';

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || 'unknown';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const ip = clientIp(req);
  const rl = isRateLimited(ip);
  if (rl.limited) {
    return res.status(429).json({
      success: false,
      message: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(rl.retryAfterSec / 60)} menit.`,
    });
  }

  const { username, password, remember } = req.body || {};
  const input = String(username || '').trim().toLowerCase();
  const pass = String(password || '');
  if (!input || !pass) {
    return res.status(400).json({ success: false, message: 'Mohon isi username dan password!' });
  }

  const admin = getAdminAccount();
  if (!admin.password || !admin.username) {
    return res.status(500).json({ success: false, message: 'Server belum dikonfigurasi (ADMIN_USERNAME / ADMIN_PASSWORD).' });
  }
  const isMatch = (safeEqual(input, admin.username) || safeEqual(input, admin.email))
               && safeEqual(pass, admin.password);

  if (!isMatch) {
    registerFailedAttempt(ip);
    return res.status(401).json({ success: false, message: 'Username atau password salah!' });
  }

  clearRateLimit(ip);
  const days = remember ? 7 : 1;
  const token = signToken({ sub: 'admin', role: 'admin', name: admin.name, email: admin.email }, days);

  return res.status(200).json({
    success: true,
    token,
    expiresInDays: days,
    user: { name: admin.name, email: admin.email, role: 'admin' },
  });
}
