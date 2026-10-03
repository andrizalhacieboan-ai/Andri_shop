import { simulatePayment } from "../_lib/pakasir.js";
import { getOrder } from "../_lib/store.js";

export default async function handler(req, res) {
  // Double gate: env + runtime — jangan sampai bisa dipakai di produksi
  if (process.env.PAYMENT_SIMULATION !== "true" || process.env.NODE_ENV === "production") {
    return res.status(403).json({ success: false, message: "Simulasi dinonaktifkan" });
  }
  const { orderId } = req.body || {};
  const order = await getOrder(orderId);
  if (!order) return res.status(404).json({ success: false, message: "Order tidak ditemukan" });
  try {
    const result = await simulatePayment(orderId, order.amount);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
