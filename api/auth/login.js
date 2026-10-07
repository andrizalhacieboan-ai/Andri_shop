// POST /api/auth/login { username|email, password, remember }
// 1) akun admin dari ENV  2) akun pengguna dari Turso (hash scrypt)
import { getAdminAccount, safeEqual, signToken, isRateLimited, registerFailedAttempt, clearRateLimit } from '../_lib/auth.js';
import { isDbEnabled } from '../_lib/db.js';
import { explainDbError } from '../_lib/env.js';
import { findUser, verifyPassword } from '../_lib/users.js';

const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const ip = clientIp(req), rl = isRateLimited(ip);
  if (rl.limited) return res.status(429).json({ success: false, message: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(rl.retryAfterSec / 60)} menit.` });

  const { username, password, remember } = req.body || {};
  const input = String(username || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const pass = String(password || '');
  if (!input || !pass) return res.status(400).json({ success: false, message: 'Mohon isi username dan password!' });
  const days = remember ? 7 : 1;

  try {
    // — Admin (ENV) —
    const admin = getAdminAccount();
    if (admin.username && admin.password && (safeEqual(input, admin.username) || safeEqual(input, admin.email))) {
      if (safeEqual(pass, admin.password)) {
        clearRateLimit(ip);
        const token = signToken({ sub: 'admin', username: admin.username, role: 'admin', name: admin.name, email: admin.email }, days);
        return res.status(200).json({ success: true, token, expiresInDays: days, user: { name: admin.name, email: admin.email, role: 'admin' } });
      }
      registerFailedAttempt(ip);
      console.warn('[login] 401 admin_password_salah');
      return res.status(401).json({ success: false, message: 'Username atau password salah!' });
    }

    // — Pengguna (Turso) —
    if (!isDbEnabled()) return res.status(503).json({ success: false, message: 'Database belum dikonfigurasi (TURSO_DATABASE_URL).' });
    const u = await findUser(input);
    // verifikasi tetap dijalankan walau user tak ada → waktu respons seragam
    const ok = await verifyPassword(pass, u ? u.password_hash : 's1$00$00');
    if (!u || !ok) {
      console.warn(`[login] 401 ${!u ? 'user_tidak_ditemukan_di_database' : 'password_tidak_cocok'} (input=${input.includes('@') ? 'email' : 'username'})`);
      registerFailedAttempt(ip);
      return res.status(401).json({ success: false, message: 'Username atau password salah!' });
    }
    clearRateLimit(ip);
    const token = signToken({ sub: String(u.id), uid: Number(u.id), username: u.username, role: u.role, name: u.name, email: u.email }, days);
    return res.status(200).json({ success: true, token, expiresInDays: days, user: { name: u.name, email: u.email, role: u.role } });
  } catch (e) {
    console.error('LOGIN ERROR:', e.message);
    return res.status(500).json({ success: false, message: explainDbError(e) || 'Terjadi kesalahan server' });
  }
}
