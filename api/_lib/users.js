// Akun pengguna di Turso. Password di-hash scrypt + salt acak (tidak pernah disimpan polos).
import crypto from 'crypto';
import { getDb, initDb } from './db.js';

const scrypt = (p, s) => new Promise((ok, no) => crypto.scrypt(p, s, 64, (e, k) => e ? no(e) : ok(k)));

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `s1$${salt}$${(await scrypt(pw, salt)).toString('hex')}`;
}
export async function verifyPassword(pw, stored) {
  const [v, salt, h] = String(stored || '').split('$');
  if (v !== 's1' || !salt || !h) return false;
  const k = await scrypt(pw, salt), b = Buffer.from(h, 'hex');
  return b.length === k.length && crypto.timingSafeEqual(b, k);
}

export function validateSignup({ name, email, password }) {
  const username = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!/^[a-z0-9 ._-]{3,30}$/.test(username)) return 'Nama/username 3–30 karakter (huruf, angka, spasi, . _ -)';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ''))) return 'Format email tidak valid';
  const p = String(password || '');
  if (p.length < 8 || !/[A-Z]/.test(p) || !/[^A-Za-z0-9\s]/.test(p)) return 'Password minimal 8 karakter, ada huruf kapital dan simbol';
  return null;
}

export async function createUser({ name, email, password }) {
  await initDb();
  const username = String(name).trim().toLowerCase().replace(/\s+/g, ' ');
  try {
    const r = await getDb().execute({
      sql: "INSERT INTO users (name, username, email, password_hash, role) VALUES (?,?,?,?, 'user')",
      args: [String(name).trim(), username, String(email).trim().toLowerCase(), await hashPassword(password)],
    });
    return { id: Number(r.lastInsertRowid), name: String(name).trim(), username, email: String(email).trim().toLowerCase(), role: 'user' };
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) throw Object.assign(new Error('Username atau email sudah terdaftar'), { code: 'DUP' });
    throw e;
  }
}

export async function findUser(identifier) {
  await initDb();
  const id = String(identifier || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const { rows } = await getDb().execute({ sql: 'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1', args: [id, id] });
  return rows[0] || null;
}
