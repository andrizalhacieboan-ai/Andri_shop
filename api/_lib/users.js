// Akun pelanggan (JSON) — password di-hash dengan scrypt (bawaan Node, tanpa dependency).
import crypto from 'crypto';
import { promisify } from 'util';
import { db, save } from './jsondb.js';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [alg, s, h] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(h, 'base64');
    const key = await scrypt(password, Buffer.from(s, 'base64'), expected.length);
    return crypto.timingSafeEqual(key, expected);
  } catch { return false; }
}

// Hash palsu untuk menyamakan waktu respons saat user tidak ditemukan (anti user-enumeration)
export const DUMMY_HASH = await hashPassword(crypto.randomBytes(8).toString('hex'));

export function findUser(identifier) {
  const id = String(identifier || '').trim().toLowerCase();
  if (!id) return null;
  return Object.values(db().users).find(u => u.nameLower === id || u.email === id) || null;
}

export async function createUser({ name, email, password }) {
  const d = db();
  const nameLower = name.toLowerCase();
  const mail = email.toLowerCase();
  if (Object.values(d.users).some(u => u.nameLower === nameLower || u.email === mail)) {
    return { error: 'duplicate' };
  }
  const passwordHash = await hashPassword(password);
  // cek ulang setelah await (hash butuh waktu) agar tetap unik
  if (Object.values(d.users).some(u => u.nameLower === nameLower || u.email === mail)) {
    return { error: 'duplicate' };
  }
  d.seq.user += 1;
  const user = {
    id: `u_${d.seq.user}`, name, nameLower, email: mail, passwordHash,
    createdAt: new Date().toISOString(),
  };
  d.users[user.id] = user;
  save();
  return { user: { id: user.id, name: user.name, email: user.email } };
}
