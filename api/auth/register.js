// POST /api/auth/register { name, email, password } → akun tersimpan di Turso
import { getAdminAccount, isRateLimited, registerFailedAttempt } from '../_lib/auth.js';
import { isDbEnabled } from '../_lib/db.js';
import { explainDbError } from '../_lib/env.js';
import { validateSignup, createUser } from '../_lib/users.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  if (!isDbEnabled()) return res.status(503).json({ success: false, message: 'Database belum dikonfigurasi (TURSO_DATABASE_URL).' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const key = 'reg:' + ip, rl = isRateLimited(key);
  if (rl.limited) return res.status(429).json({ success: false, message: 'Terlalu banyak pendaftaran. Coba lagi beberapa menit lagi.' });

  const { name, email, password } = req.body || {};
  const err = validateSignup({ name, email, password });
  if (err) return res.status(400).json({ success: false, message: err });

  const admin = getAdminAccount();
  if ((admin.username && String(name).trim().toLowerCase() === admin.username) || (admin.email && String(email).trim().toLowerCase() === admin.email)) {
    return res.status(409).json({ success: false, message: 'Username / email ini milik Admin — gunakan yang lain!' });
  }
  try {
    registerFailedAttempt(key);
    const user = await createUser({ name, email, password });
    return res.status(201).json({ success: true, user: { name: user.name, username: user.username, email: user.email } });
  } catch (e) {
    if (e.code === 'DUP') return res.status(409).json({ success: false, message: e.message });
    console.error('REGISTER ERROR:', e.message);
    return res.status(500).json({ success: false, message: explainDbError(e) || 'Gagal mendaftar, coba lagi.' });
  }
}
