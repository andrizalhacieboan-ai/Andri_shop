
import express from 'express';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Muat .env tanpa dependency (lokal; Vercel pakai dashboard env)
(() => {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) { console.warn('Gagal membaca .env:', e.message); }
})();

const app = express();
app.disable('x-powered-by');
app.use(express.json());

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function mountApi(dir, base) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await mountApi(full, `${base}/${entry.name}`);
    } else if (entry.name.endsWith('.js')) {
      const route = `${base}/${entry.name.slice(0, -3)}`;
      try {
        const mod = await import(pathToFileURL(full).href);
        if (typeof mod.default === 'function') {
          app.all(route, wrap(mod.default));
          console.log('✔ API:', route);
        }
      } catch (e) {
        console.error('✖ Gagal memuat endpoint', route, '→', e.message);
      }
    }
  }
}

await mountApi(path.join(process.cwd(), 'api'), '/api');

// File statis (HTML) dari folder public/
app.use(express.static(path.join(process.cwd(), 'public')));

// 404 JSON + error handler
app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' }));
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err.message);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
});

const PORT = process.env.PORT || 3000; 
app.listen(PORT, '0.0.0.0', () => {
  console.log(` ANDRI STORE API berjalan di port ${PORT}`);
  console.log('   Login : POST /api/auth/login');
  console.log('   Sesi  : GET  /api/auth/me');
});
