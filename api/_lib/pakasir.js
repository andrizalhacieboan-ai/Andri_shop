import axios from "axios";
import QRCode from "qrcode";

const PAKASIR_BASE = "https://app.pakasir.com/api/v2";
const TIMEOUT = 20000;

const cfg = () => {
  const slug = process.env.PAKASIR_SLUG;
  const apiKey = process.env.PAKASIR_API_KEY;
  if (!slug || !apiKey) throw new Error("Konfigurasi PAKASIR_SLUG / PAKASIR_API_KEY belum diisi");
  return { slug, apiKey };
};

export async function createPayment(amount, method = "qris") {
  const { slug, apiKey } = cfg();
  if (!Number.isInteger(amount) || amount < 1000) throw new Error("Nominal pembayaran minimal Rp 1.000");
  const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  try {
    const res = await axios.post(
      `${PAKASIR_BASE}/create-transaction/${slug}/${orderId}`,
      { method, amount },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey
        },
        timeout: TIMEOUT
      }
    );

    const payment = res.data?.payment || res.data || {};
    const qrString = payment.payment_number || payment.qr_string || payment.payment_url || payment.qr_code;

    let qrBase64 = null;
    if (qrString) {
      qrBase64 = await QRCode.toDataURL(qrString, { width: 300, margin: 1 });
    }

    return {
      orderId,
      txnId: payment.txn_id || res.data?.txn_id,
      qrBase64,
      amount,
      raw: res.data
    };
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message || "Gagal membuat pembayaran Pakasir");
  }
}

export async function cekPaid(txnId) {
  const { slug, apiKey } = cfg();
  try {
    const res = await axios.get(
      `${PAKASIR_BASE}/transaction-status/${slug}/${txnId}`,
      {
        headers: { "X-Api-Key": apiKey },
        timeout: TIMEOUT
      }
    );
    const status = res.data?.status || "";
    return ["paid", "success", "completed"].includes(String(status).toLowerCase());
  } catch {
    return false; // Error jaringan transien → polling lanjut, jangan crash
  }
}

export async function cancelPayment(txnId) {
  const { slug, apiKey } = cfg();
  try {
    const res = await axios.post(
      `${PAKASIR_BASE}/cancel-transaction/${slug}/${txnId}`,
      {},
      {
        headers: { "X-Api-Key": apiKey },
        timeout: TIMEOUT
      }
    );
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || "Gagal membatalkan transaksi Pakasir");
  }
}

export async function getPaymentFee(amount) {
  if (!Number.isInteger(amount) || amount < 1) throw new Error("Nominal amount tidak valid");
  try {
    const res = await axios.get(
      `${PAKASIR_BASE}/payment-fee/${amount}`,
      { timeout: TIMEOUT }
    );
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || "Gagal mengambil data biaya pembayaran");
  }
}

// KEAMANAN: simulasi hanya aktif jika env PAYMENT_SIMULATION=true
export async function simulatePayment(txnId) {
  if (process.env.PAYMENT_SIMULATION !== "true") {
    throw new Error("Simulasi pembayaran dinonaktifkan di server ini");
  }
  const { slug, apiKey } = cfg();
  try {
    const res = await axios.post(
      `${PAKASIR_BASE}/paymentsimulation`,
      { project: slug, api_key: apiKey, txn_id: txnId },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey
        },
        timeout: TIMEOUT
      }
    );
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || "Gagal melakukan simulasi pembayaran");
  }
}
