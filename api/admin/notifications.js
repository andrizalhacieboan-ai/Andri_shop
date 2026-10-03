// GET  /api/admin/notifications  → daftar 20 notifikasi terbaru (khusus admin, pakai Bearer token)
// POST /api/admin/notifications  → tandai semua dibaca
import { verifyToken } from '../_lib/auth.js';
import { listNotifications, markAllRead } from '../_lib/notify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ success: false, message: 'Akses ditolak. Khusus Admin.' });
  }

  try {
    if (req.method === 'GET') {
      const notifications = await listNotifications(20);
      return res.status(200).json({ success: true, notifications });
    }
    if (req.method === 'POST') {
      await markAllRead();
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Gagal memuat notifikasi' });
  }
}
