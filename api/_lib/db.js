// Turso (libSQL) — env: TURSO_DATABASE_URL (libsql://...) + TURSO_AUTH_TOKEN
import { createClient } from '@libsql/client';

let client = null;
let initPromise = null;

export function isDbEnabled() {
  return !!process.env.TURSO_DATABASE_URL;
}

export function getDb() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN, // tidak wajib untuk file: lokal
    });
  }
  return client;
}

// Buat tabel sekali per instance (idempotent: IF NOT EXISTS)
export function initDb() {
  if (!initPromise) {
    initPromise = getDb().batch([
      `CREATE TABLE IF NOT EXISTS orders (
        order_id    TEXT PRIMARY KEY,
        ram_key     TEXT NOT NULL,
        username    TEXT NOT NULL,
        months      INTEGER NOT NULL DEFAULT 1,
        amount      INTEGER NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','provisioning','done','cancelled')),
        password    TEXT NOT NULL,
        credentials TEXT,
        created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
      `CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        type       TEXT NOT NULL DEFAULT 'transaction',
        title      TEXT NOT NULL,
        details    TEXT,
        is_read    INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ], 'write').catch(err => { initPromise = null; throw err; });
  }
  return initPromise;
}
