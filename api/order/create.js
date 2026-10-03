import { createPayment } from "../_lib/pakasir.js";
import { computeTotal } from "../_lib/products.js";
import { saveOrder, generatePassword } from "../_lib/store.js";
import { sanitizeUsername } from "../_lib/pterodactyl.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method not allowed" });

  try {
    const { ramKey, username, months } = req.body || {};
    const uname = sanitizeUsername(username);
    if (uname.length < 3) return res.status(400).json({ success: false, message: "Username minimal 3 karakter (huruf kecil & angka)" });

    // Harga dihitung SERVER-SIDE — input frontend tidak dipercaya
    const calc = computeTotal(ramKey, months);
    if (!calc) return res.status(400).json({ success: false, message: "Paket tidak dikenal" });

    const payment = await createPayment(calc.total);
   await saveOrder(payment.orderId, {
      ramKey, username: uname, months: calc.months, amount: calc.total,
      status: "pending",
      password: generatePassword(),
    });

    return res.status(200).json({
      success: true,
      orderId: payment.orderId,
      amount: calc.total,
      productName: calc.label,
      months: calc.months,
      qrBase64: payment.qrBase64,
      expiresIn: 300,
    });
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message || "Gagal membuat pembayaran" });
  }
}
