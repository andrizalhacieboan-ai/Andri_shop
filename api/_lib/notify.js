// Notifikasi admin — dual mode (Turso / in-memory)
import { isDbEnabled, getDb, initDb } from './db.js';

const memoryNotifs = [];
const safeParse = s => { try { return JSON.parse(s); } catch { return null; } };
const formatNotif = r => ({
  id: Number(r.id), type: r.type, title: r.title,
  details: r.details ? (typeof r.details === 'string' ? safeParse(r.details) : r.details) : null,
  read: !!Number(r.is_read), createdAt: r.created_at,
});

export async function saveNotification({ type = 'transaction', title, details }) {
  if (!isDbEnabled()) {
    memoryNotifs.unshift({ id: Date.now(), type, title, details, is_read: 0, created_at: new Date().toISOString() });
    return;
  }
  await initDb();
  await getDb().execute({
    sql: 'INSERT INTO notifications (type, title, details) VALUES (?,?,?)',
    args: [type, title, details ? JSON.stringify(details) : null],
  });
}

export async function listNotifications(limit = 20) {
  if (!isDbEnabled()) return memoryNotifs.slice(0, limit).map(formatNotif);
  await initDb();
  const { rows } = await getDb().execute({ sql: 'SELECT * FROM notifications ORDER BY id DESC LIMIT ?', args: [limit] });
  return rows.map(formatNotif);
}

export async function markAllRead() {
  if (!isDbEnabled()) { memoryNotifs.forEach(n => n.is_read = 1); return; }
  await initDb();
  await getDb().execute('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
}
