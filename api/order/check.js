import { cekPaid } from "../_lib/pakasir.js";
import { createPanel } from "../_lib/pterodactyl.js";
import { getOrder, updateOrder, claimOrder } from "../_lib/store.js";
import { saveNotification } from "../_lib/notify.js";
import { PRODUCTS } from "../_lib/products.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method not allowed" });

  const { orderId } = req.body || {};
  try {
    const order = await getOrder(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order tidak ditemukan atau kedaluwarsa" });

    if (order.status === "done")        return res.status(200).json({ success: true, paid: true, credentials: order.credentials });
    if (order.status === "provisioning") return res.status(200).json({ success: true, paid: true, provisioning: true });
    if (order.status === "cancelled")    return res.status(200).json({ success: true, paid: false, cancelled: true });

    const paid = await cekPaid(orderId, order.amount);
    if (!paid) return res.status(200).json({ success: true, paid: false });

    const claimed = await claimOrder(orderId); // anti dobel panel
    if (!claimed) return res.status(200).json({ success: true, paid: true, provisioning: true });

    const result = await createPanel(order.username, order.ramKey, order.password);
    if (!result.success) {
      await updateOrder(orderId, { status: "paid" }); // auto-retry poll berikutnya
      return res.status(500).json({ success: false, paid: true, message: result.message });
    }

    // ===== Hitung tanggal pembelian & EXPIRED (khusus langganan panel) =====
    const purchasedAt = new Date();
    const expiresAt = order.months > 0 ? (() => {
      const d = new Date(purchasedAt);
      d.setMonth(d.getMonth() + Number(order.months));
      return d;
    })() : null;

    const credentials = {
      ...result.data,
      purchasedAt: purchasedAt.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
    await updateOrder(orderId, { status: "done", credentials });

    const label = (PRODUCTS[order.ramKey] && PRODUCTS[order.ramKey].label) || order.ramKey;

    // ===== NOTIFIKASI LENGKAP KE ADMIN =====
    try {
      await saveNotification({
        type: "transaction",
        title: `Transaksi Baru Selesai — ${label}`,
        details: {
          orderId,
          productName: label,
          username: credentials.username,
          serverId: credentials.serverId,
          identifier: credentials.identifier || null,
          panelName: credentials.serverName,
          months: Number(order.months),
          amount: Number(order.amount),
          method: "QRIS (Pakasir)",
          purchasedAt: purchasedAt.toISOString(),
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          panelUrl: credentials.panelUrl,
        },
      });
    } catch (e) { console.error("NOTIF ADMIN ERROR:", e.message); } // gagal notif ≠ gagal order

    return res.status(200).json({ success: true, paid: true, credentials });
  } catch (err) {
    console.error("CHECK ORDER ERROR:", err.message);
    return res.status(500).json({ success: false, message: "Gagal mengecek order" });
  }
}
