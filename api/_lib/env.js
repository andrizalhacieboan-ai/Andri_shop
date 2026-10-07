// Bersihkan env var dari kesalahan umum saat copy-paste ke dashboard Vercel:
// spasi/baris-baru di ujung, dan tanda kutip pembungkus  KEY="nilai"  (Vercel TIDAK membuangnya).
// Token Turso dengan kutip/newline → Turso membalas HTTP 401.
const KEYS = /^(TURSO_|ADMIN_|AUTH_SECRET|PTERO_|PAKASIR_|PANEL_|PAYMENT_)/;
for (const k of Object.keys(process.env)) {
  if (!KEYS.test(k) || typeof process.env[k] !== 'string') continue;
  let v = process.env[k].trim();
  if (v.length > 1 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) v = v.slice(1, -1).trim();
  process.env[k] = v;
}

// Terjemahkan error Turso/libSQL ke pesan yang bisa ditindaklanjuti (tanpa membocorkan rahasia)
export function explainDbError(e) {
  const m = String(e?.message || e);
  if (/401|unauthor|token|auth/i.test(m)) return 'Turso menolak akses (401): TURSO_AUTH_TOKEN salah/kedaluwarsa atau bukan milik database di TURSO_DATABASE_URL.';
  if (/404|not found|no such host|ENOTFOUND/i.test(m)) return 'Database Turso tidak ditemukan: periksa TURSO_DATABASE_URL.';
  if (/no such (table|column)/i.test(m)) return 'Skema tabel tidak cocok (database lama?). Gunakan database Turso baru/kosong.';
  return null;
}
