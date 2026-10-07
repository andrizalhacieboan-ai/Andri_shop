// GET /api/health — cek konfigurasi & koneksi (tanpa membocorkan nilai rahasia).
// Buka https://DOMAIN-ANDA/api/health setelah deploy untuk melihat penyebab masalah dengan cepat.
import { isDbEnabled, getDb, initDb } from './_lib/db.js';
import { explainDbError } from './_lib/env.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const e = process.env, has = k => !!(e[k] && e[k].length);
  const out = {
    env: {
      TURSO_DATABASE_URL: has('TURSO_DATABASE_URL'), TURSO_AUTH_TOKEN: has('TURSO_AUTH_TOKEN'),
      AUTH_SECRET: has('AUTH_SECRET') && e.AUTH_SECRET.length >= 16,
      ADMIN_USERNAME: has('ADMIN_USERNAME'), ADMIN_PASSWORD: has('ADMIN_PASSWORD'),
      PTERO_DOMAIN: has('PTERO_DOMAIN'), PTERO_API_KEY: has('PTERO_API_KEY'), PTERO_CLIENT_API_KEY: has('PTERO_CLIENT_API_KEY'),
    },
    turso_url_scheme: has('TURSO_DATABASE_URL') ? e.TURSO_DATABASE_URL.split(':')[0] : null,
    db: { ok: false }, hints: [],
  };
  if (!has('TURSO_DATABASE_URL')) out.hints.push('Isi TURSO_DATABASE_URL (libsql://nama-db-akun.turso.io).');
  else if (!/^(libsql|https|wss|file)$/.test(out.turso_url_scheme)) out.hints.push('TURSO_DATABASE_URL harus diawali libsql:// atau https://');
  if (has('TURSO_DATABASE_URL') && !e.TURSO_DATABASE_URL.startsWith('file:') && !has('TURSO_AUTH_TOKEN')) out.hints.push('TURSO_AUTH_TOKEN kosong → Turso akan membalas 401.');
  if (!out.env.AUTH_SECRET) out.hints.push('AUTH_SECRET kosong/<16 karakter → token memakai secret bawaan (tidak aman).');
  if (isDbEnabled()) {
    try {
      await initDb();
      const r = await getDb().execute('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM orders) o');
      out.db = { ok: true, users: Number(r.rows[0].u), orders: Number(r.rows[0].o) };
    } catch (err) {
      out.db = { ok: false, error: explainDbError(err) || 'Koneksi database gagal' };
      out.hints.push(out.db.error);
      console.error('[health] db error:', err.message);
    }
  }
  res.status(out.db.ok ? 200 : 503).json(out);
}
