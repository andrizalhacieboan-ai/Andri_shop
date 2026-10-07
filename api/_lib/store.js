// Order store — dual mode:
//  • TURSO_DATABASE_URL terisi → Turso (persisten, klaim atomik)
//  • kosong                    → in-memory (hanya untuk dev lokal; di Vercel data hilang antar-invocation!)
import crypto from 'crypto';
import { isDbEnabled, getDb, initDb } from './db.js';

const memoryOrders = new Map();
const MEMORY_TTL = 2 * 60 * 60 * 1000;
const STALE_CLAIM_MIN = 2; // order 'provisioning' > 2 menit dianggap macet → boleh diklaim ulang

const safeParse = s => { try { return JSON.parse(s); } catch { return null; } };

export async function saveOrder(orderId, d) {
  if (!isDbEnabled()) { memoryOrders.set(orderId, { ...d, createdAt: Date.now() }); return; }
  await initDb();
  await getDb().execute({
    sql: 'INSERT INTO orders (order_id, ram_key, username, months, amount, status, password, owner) VALUES (?,?,?,?,?,?,?,?)',
    args: [orderId, d.ramKey, d.username, d.months, d.amount, 'pending', d.password, d.owner || null],
  });
}

export async function getOrder(orderId) {
  if (!orderId) return null;
  if (!isDbEnabled()) {
    const o = memoryOrders.get(orderId);
    if (!o) return null;
    if (Date.now() - o.createdAt > MEMORY_TTL && o.status !== 'done') { memoryOrders.delete(orderId); return null; }
    return o;
  }
  await initDb();
  const { rows } = await getDb().execute({ sql: 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', args: [String(orderId)] });
  const r = rows[0];
  if (!r) return null;
  return {
    orderId: r.order_id, ramKey: r.ram_key, username: r.username,
    months: Number(r.months), amount: Number(r.amount),
    status: r.status, password: r.password,
    credentials: r.credentials ? safeParse(r.credentials) : null,
    createdAt: r.created_at,
  };
}

export async function updateOrder(orderId, patch) {
  if (!isDbEnabled()) { const o = memoryOrders.get(orderId); if (o) Object.assign(o, patch); return; }
  await initDb();
  const f = ['updated_at = CURRENT_TIMESTAMP'], a = [];
  if (patch.status !== undefined) { f.push('status = ?'); a.push(patch.status); }
  if (patch.credentials !== undefined) {
    f.push('credentials = ?');
    a.push(typeof patch.credentials === 'string' ? patch.credentials : JSON.stringify(patch.credentials));
  }
  a.push(orderId);
  await getDb().execute({ sql: `UPDATE orders SET ${f.join(', ')} WHERE order_id = ?`, args: a });
}

// Klaim atomik: hanya SATU request yang lolos → tidak ada dobel-create panel.
export async function claimOrder(orderId) {
  if (!isDbEnabled()) {
    const o = memoryOrders.get(orderId);
    if (!o || !['pending', 'paid'].includes(o.status)) return false;
    o.status = 'provisioning'; return true;
  }
  await initDb();
  const r = await getDb().execute({
    sql: `UPDATE orders SET status = 'provisioning', updated_at = CURRENT_TIMESTAMP
          WHERE order_id = ? AND (status IN ('pending','paid')
             OR (status = 'provisioning' AND updated_at < datetime('now', ?)))`,
    args: [orderId, `-${STALE_CLAIM_MIN} minutes`],
  });
  return r.rowsAffected > 0;
}

// Password acak yang aman (crypto, bukan Math.random)
export function generatePassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: len }, () => chars[crypto.randomInt(chars.length)]).join('');
}
