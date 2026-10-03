// POST /api/auth/register  { name, email, password }
import { getAdminAccount, createLimiter } from '../_lib/auth.js';
import { createUser } from '../_lib/users.js';
import { clientIp, methodNotAllowed } from '../_lib/http.js';

const limiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 6 });
const NAME_RE = /^[\p{L}\p{N} ._-]{3,40}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESERVED = new Set(['admin', 'administrator', 'root', 'owner']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);

  const ip = clientIp(req);
  if (limiter.status(ip).limited) {
    return res.status(429).json({ success: false, message: 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.' });
  }

  const name = String((req.body || {}).name || '').trim().replace(/\s+/g, ' ');
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');

  if (!NAME_RE.test(name)) return res.status(400).json({ success: false, message: 'Nama 3–40 karakter (huruf, angka, spasi, . _ -).' });
  if (!EMAIL_RE.test(email) || email.length > 100) return res.status(400).json({ success: false, message: 'Format email tidak valid.' });
  if (password.length < 8 || password.length > 100 || !/[A-Z]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return res.status(400).json({ success: false, message: 'Password harus 8+ karakter, ada huruf kapital, dan simbol.' });
  }

  const admin = getAdminAccount();
  if (RESERVED.has(name.toLowerCase()) || (admin && (name.toLowerCase() === admin.username || email === admin.email))) {
    return res.status(409).json({ success: false, message: 'Username / email ini tidak tersedia — gunakan yang lain!' });
  }

  limiter.hit(ip);
  const r = await createUser({ name, email, password });
  if (r.error === 'duplicate') {
    return res.status(409).json({ success: false, message: 'Username atau email sudah terdaftar.' });
  }
  return res.status(201).json({ success: true, user: r.user });
}
