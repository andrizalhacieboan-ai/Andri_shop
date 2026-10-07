// GET /api/live?days=30 — satu endpoint real-time untuk dashboard (Turso + Pterodactyl)
//   admin → statistik penuh, semua user, semua order, notifikasi, status panel
//   user  → hanya order miliknya
import { getSession } from './_lib/guard.js';
import { isDbEnabled, getDb, initDb } from './_lib/db.js';
import { getPteroSnapshot } from './_lib/ptero-live.js';
import { explainDbError } from './_lib/env.js';
import { PRODUCTS } from './_lib/products.js';

const iso = s => (s ? String(s).replace(' ', 'T') + 'Z' : null);
const safeParse = s => { try { return JSON.parse(s); } catch { return null; } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const s = getSession(req);
  if (!s) return res.status(401).json({ success: false, message: 'Sesi tidak valid' });
  if (!isDbEnabled()) return res.status(503).json({ success: false, message: 'Turso belum dikonfigurasi (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN)' });

  try {
    await initDb();
    const db = getDb(), admin = s.role === 'admin';
    const days = Math.min(Math.max(parseInt(req.query?.days) || 30, 1), 365);
    const monthly = days > 31, fmt = monthly ? '%Y-%m' : '%Y-%m-%d';
    const owner = s.username || s.sub;

    const stmts = [
      admin
        ? { sql: 'SELECT * FROM orders ORDER BY created_at DESC LIMIT 60', args: [] }
        : { sql: 'SELECT * FROM orders WHERE owner = ? ORDER BY created_at DESC LIMIT 60', args: [owner] },
    ];
    if (admin) stmts.push(
      "SELECT COALESCE(SUM(amount),0) v, COUNT(*) c FROM orders WHERE status='done'",
      "SELECT COALESCE(SUM(amount),0) v, COUNT(*) c FROM orders WHERE status='done' AND date(created_at,'+7 hours') = date('now','+7 hours')",
      "SELECT COUNT(*) c FROM orders WHERE status IN ('pending','paid','provisioning')",
      { sql: "SELECT strftime(?, created_at,'+7 hours') d, COALESCE(SUM(amount),0) rev, COUNT(*) c FROM orders WHERE status='done' AND created_at >= datetime('now', ?) GROUP BY d", args: [fmt, `-${days} days`] },
      "SELECT ram_key k, COUNT(*) c, COALESCE(SUM(amount),0) rev FROM orders WHERE status='done' GROUP BY ram_key ORDER BY c DESC",
      'SELECT id, name, username, email, role, created_at FROM users ORDER BY id DESC LIMIT 200',
      "SELECT owner, ram_key FROM orders WHERE status='done' AND owner IS NOT NULL ORDER BY created_at DESC LIMIT 500",
      'SELECT * FROM notifications ORDER BY id DESC LIMIT 20',
    );
    const [rs, ptero] = await Promise.all([db.batch(stmts, 'read'), admin ? getPteroSnapshot() : null]);

    const orders = rs[0].rows.filter(r => r.status !== 'cancelled').map(r => {
      const cred = r.credentials ? safeParse(r.credentials) : null;
      return {
        id: Number(String(r.order_id).split('-')[1]) || Date.parse(iso(r.created_at)), orderId: r.order_id,
        product: PRODUCTS[r.ram_key]?.label || r.ram_key, qty: 1, months: Number(r.months),
        method: 'QRIS (Pakasir)', customer: r.username, total: Number(r.amount), date: iso(r.created_at),
        status: r.status === 'done' ? 'paid' : 'pending', credentials: r.status === 'done' ? cred : null,
      };
    });
    const out = { success: true, admin, at: Date.now(), orders };
    if (!admin) return res.status(200).json(out);

    // deret waktu (WIB) — isi hari/bulan kosong dengan 0
    const map = new Map(rs[4].rows.map(r => [r.d, r]));
    const wib = new Date(Date.now() + 7 * 3600e3), labels = [], revenue = [], count = [];
    for (let i = monthly ? 11 : days - 1; i >= 0; i--) {
      const d = new Date(wib);
      if (monthly) d.setUTCMonth(d.getUTCMonth() - i, 1); else d.setUTCDate(d.getUTCDate() - i);
      const k = d.toISOString().slice(0, monthly ? 7 : 10), r = map.get(k);
      labels.push(monthly ? d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }));
      revenue.push(r ? Number(r.rev) : 0); count.push(r ? Number(r.c) : 0);
    }
    const lastProd = new Map();
    rs[7].rows.forEach(r => { if (!lastProd.has(r.owner)) lastProd.set(r.owner, PRODUCTS[r.ram_key]?.label || r.ram_key); });

    Object.assign(out, {
      stats: {
        revenue: Number(rs[1].rows[0].v), ordersDone: Number(rs[1].rows[0].c), revenueToday: Number(rs[2].rows[0].v), ordersToday: Number(rs[2].rows[0].c),
        ordersOpen: Number(rs[3].rows[0].c), users: rs[6].rows.length,
      },
      series: { labels, revenue, count },
      byProduct: rs[5].rows.map(r => ({ label: PRODUCTS[r.k]?.label || r.k, count: Number(r.c), revenue: Number(r.rev) })),
      users: rs[6].rows.map(u => ({ id: Number(u.id), username: u.username, email: u.email, role: u.role, joined: iso(u.created_at), product: lastProd.get(u.username) || '—' })),
      notifications: rs[8].rows.map(n => ({ id: Number(n.id), title: n.title, details: safeParse(n.details), read: !!Number(n.is_read), createdAt: iso(n.created_at) })),
      ptero,
    });
    return res.status(200).json(out);
  } catch (e) {
    console.error('LIVE ERROR:', e.message);
    return res.status(500).json({ success: false, message: explainDbError(e) || 'Gagal memuat data real-time' });
  }
}
