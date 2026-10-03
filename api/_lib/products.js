// Harga tidak boleh dikirim dari frontend (bisa dimanipulasi)!
export const PRODUCTS = {
  "1gb": { label: "Panel Pterodactyl 1 GB", price: 3000 },
  "2gb": { label: "Panel Pterodactyl 2 GB", price: 5000 },
  "3gb": { label: "Panel Pterodactyl 3 GB", price: 6000 },
  "4gb": { label: "Panel Pterodactyl 4 GB", price: 7000 },
  "5gb": { label: "Panel Pterodactyl 5 GB", price: 9000 },
  "6gb": { label: "Panel Pterodactyl 6 GB", price: 11000 },
  "7gb": { label: "Panel Pterodactyl 7 GB", price: 13000 },
  "8gb": { label: "Panel Pterodactyl 8 GB", price: 15000 },
  "9gb": { label: "Panel Pterodactyl 9 GB", price: 17000 },
  "10gb": { label: "Panel Pterodactyl 10 GB", price: 19000 },
  unlimited: { label: "Panel Unlimited Node", price: 18000 },
};

export const DURATION_DISCOUNT = { 1: 0, 3: 0.05, 6: 0.10 };

export function computeTotal(ramKey, months) {
  const p = PRODUCTS[ramKey];
  if (!p) return null;
  const m = DURATION_DISCOUNT[months] !== undefined ? months : 1;
  const subtotal = p.price * m;
  return { total: Math.round(subtotal * (1 - DURATION_DISCOUNT[m])), label: p.label, months: m };
}
