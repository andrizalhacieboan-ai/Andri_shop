import { cancelPayment } from "../_lib/pakasir.js";
import { getOrder, updateOrder } from "../_lib/store.js";

export default async function handler(req, res) {
  const { orderId } = req.body || {};
  const order = await getOrder(orderId);
  if (!order) return res.status(404).json({ success: false, message: "Order tidak ditemukan" });
  if (order.status === "done") return res.status(400).json({ success: false, message: "Order sudah lunas & panel sudah dibuat" });
  try {
    await cancelPayment(orderId, order.amount);
    await updateOrder(orderId, { status: "cancelled" });
    return res.status(200).json({ success: true, cancelled: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
