// Util auth: kredensial dari ENV, timing-safe compare, token HMAC, rate limit
import './env.js';
import crypto from 'crypto';

export function getAdminAccount() {
  return {
    username: String(process.env.ADMIN_USERNAME || '').toLowerCase(),
    email: String(process.env.ADMIN_EMAIL || '').toLowerCase(),
    password: String(process.env.ADMIN_PASSWORD || ''),
    name: String(process.env.ADMIN_NAME || 'Andri'),
  };
}

export function getAuthSecret() {
  let secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    console.warn('⚠️  AUTH_SECRET belum di-set / terlalu pendek — memakai secret dev. WAJIB diganti di produksi!');
    secret = 'andri-store-dev-secret-ganti-di-produksi';
  }
  return secret;
}

// Perbandingan anti timing-attack
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // samakan waktu eksekusi
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// Token HMAC-SHA256 (format mirip JWT, tanpa dependency): payload.signature
export function signToken(payload, days = 1) {
  const data = { ...payload, iat: Date.now(), exp: Date.now() + days * 86400000 };
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', getAuthSecret()).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// Rate limit sederhana in-memory (best-effort; di serverless reset saat instance dingin)
const attempts = new Map();
const WINDOW = 5 * 60 * 1000, MAX_FAIL = 5;

export function isRateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec) return { limited: false };
  if (now - rec.start > WINDOW) { attempts.delete(ip); return { limited: false }; }
  if (rec.count >= MAX_FAIL) {
    return { limited: true, retryAfterSec: Math.ceil((rec.start + WINDOW - now) / 1000) };
  }
  return { limited: false };
}
export function registerFailedAttempt(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.start > WINDOW) attempts.set(ip, { start: now, count: 1 });
  else rec.count++;
}
export function clearRateLimit(ip) { attempts.delete(ip); }
