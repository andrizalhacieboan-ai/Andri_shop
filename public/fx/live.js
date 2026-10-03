/* ANDRI STORE — data real-time (Turso + Pterodactyl) menggantikan data contoh di dashboard. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const session = () => { try { return JSON.parse(localStorage.getItem('andri_session') || sessionStorage.getItem('andri_session') || 'null'); } catch { return null; } };
  const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  const POLL_MS = 10000;
  let days = 30, busy = false, lastSig = {}, readIds = new Set(), isAdmin = false;

  /* Sisipkan Bearer token ke semua panggilan /api */
  const _fetch = window.fetch.bind(window);
  window.fetch = (u, o = {}) => {
    const s = session();
    if (s && s.token && String(u).startsWith('/api')) o = { ...o, headers: { ...(o.headers || {}), Authorization: 'Bearer ' + s.token } };
    return _fetch(u, o);
  };

  const s0 = session();
  if (!s0 || !s0.token) { try { localStorage.removeItem('andri_session'); sessionStorage.removeItem('andri_session'); } catch {} location.replace('halaman_login.html'); return; }
  isAdmin = s0.role === 'admin';

  /* ---------- Pill status LIVE ---------- */
  const pill = document.createElement('div');
  pill.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:70;font:700 10px Inter,sans-serif;letter-spacing:.06em;padding:7px 12px;border-radius:999px;background:rgba(23,23,23,.88);color:#fff;display:flex;gap:7px;align-items:center;backdrop-filter:blur(8px);pointer-events:none';
  pill.innerHTML = '<span id="lvDot" style="width:7px;height:7px;border-radius:50%;background:#f59e0b"></span><span id="lvTxt">MENGHUBUNGKAN…</span>';
  document.body.appendChild(pill);
  const status = (ok, txt) => { $('lvDot').style.background = ok ? '#10b981' : '#ef4444'; $('lvTxt').textContent = txt; };

  /* ---------- Helper kartu statistik ---------- */
  function setCard(viewId, label, newLabel, value, sub) {
    const view = $(viewId); if (!view) return;
    const span = [...view.querySelectorAll('.glass-card span')].find(x => ['runtime vps', 'server online', 'server offline', 'pendapatan', 'total server', 'total pendapatan', 'cpu & ram usage', 'total order', 'ram terpakai'].includes(x.textContent.trim().toLowerCase()) && (x.textContent.trim().toLowerCase() === label.toLowerCase() || x.textContent.trim().toLowerCase() === (newLabel || '').toLowerCase()));
    if (!span) return;
    if (newLabel) span.textContent = newLabel;
    const card = span.closest('.glass-card'), val = card.querySelector('h3,h4'), subEl = card.querySelector('h3 ~ div, h4 ~ p, h4 ~ div');
    if (val && val.textContent !== value) { val.textContent = value; val.classList.remove('fx-flash'); void val.offsetWidth; val.classList.add('fx-flash'); }
    if (subEl && sub != null && subEl.dataset.v !== sub) { subEl.dataset.v = sub; subEl.innerHTML = sub; }
  }
  const dotSub = (txt, c = 'text-emerald-600') => `<i class="fa-solid fa-circle ${c}" style="font-size:7px"></i><span>${txt}</span>`;

  /* Placeholder agar angka contoh tidak sempat tampil */
  function blank() {
    if (isAdmin) {
      setCard('view-overview', 'Pendapatan', null, '…', dotSub('memuat…', 'text-neutral-400'));
      setCard('view-overview', 'Runtime VPS', 'Total Order', '…', dotSub('memuat…', 'text-neutral-400'));
      setCard('view-overview', 'Server Online', null, '…', dotSub('memuat…', 'text-neutral-400'));
      setCard('view-overview', 'Server Offline', null, '…', dotSub('memuat…', 'text-neutral-400'));
    }
  }

  /* ---------- Terapkan data ---------- */
  function apply(d) {
    // Order (milik sendiri / semua untuk admin); order WhatsApp lokal tetap dipertahankan
    orders = [...d.orders, ...orders.filter(o => o.method === 'WhatsApp')];
    renderOrderHistory();

    if (!d.admin) {
      users = [{ id: 1, username: s0.name, email: s0.email, product: d.orders[0]?.product || '—', role: 'user', status: 'active', joined: '', avatar: AVATAR_FALLBACK }];
      notifications = notifications.filter(n => n.local);
      renderUsers(); renderOverviewUsers(); renderNotifications();
      return;
    }
    const st = d.stats, p = d.ptero || {};

    // Overview
    setCard('view-overview', 'Pendapatan', null, rp(st.revenue), dotSub(`${rp(st.revenueToday)} hari ini`));
    setCard('view-overview', 'Total Order', 'Total Order', `${st.ordersDone} Order`, dotSub(`${st.ordersToday} hari ini • ${st.ordersOpen} menunggu`));
    if (p.ok) {
      const note = p.approx ? ' (estimasi)' : '';
      setCard('view-overview', 'Server Online', null, `${p.online} Server`, dotSub(`dari ${p.serversTotal} server${note}`));
      setCard('view-overview', 'Server Offline', null, `${p.offline} Server`, dotSub(`${p.suspended} suspended • ${p.installing} installing`, 'text-neutral-500'));
    } else {
      setCard('view-overview', 'Server Online', null, '—', dotSub(p.error || 'Pterodactyl tidak terhubung', 'text-red-500'));
      setCard('view-overview', 'Server Offline', null, '—', dotSub('periksa PTERO_DOMAIN / API key', 'text-red-500'));
    }

    // User dari database
    users = d.users.map(u => ({ id: u.id, username: u.username, email: u.email, product: u.product, role: u.role, status: 'active', joined: u.joined ? new Date(u.joined).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }) : '', avatar: AVATAR_FALLBACK }));
    renderUsers(); renderOverviewUsers();

    // Notifikasi transaksi dari database
    notifications = d.notifications.map(n => {
      const x = n.details || {};
      return { id: n.id, icon: 'fa-cart-shopping', bg: 'bg-emerald-50', color: 'text-emerald-600', title: n.title,
        desc: `${x.username || ''} • ${x.months || 1} bln • ${rp(x.amount)} • Server #${x.serverId || '-'}`,
        time: new Date(n.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        unread: !n.read && !readIds.has(n.id) };
    });
    renderNotifications();

    // Grafik pendapatan & order
    const sig = JSON.stringify(d.series);
    if (trafficChart && sig !== lastSig.series) {
      lastSig.series = sig;
      const ds = trafficChart.data.datasets;
      trafficChart.data.labels = d.series.labels;
      ds[0].label = 'Pendapatan (Rp)'; ds[0].data = d.series.revenue;
      ds[1].label = 'Order'; ds[1].data = d.series.count; ds[1].yAxisID = 'y1';
      trafficChart.options.scales.y1 = { position: 'right', display: false, beginAtZero: true, grid: { drawOnChartArea: false } };
      trafficChart.options.scales.y.beginAtZero = true;
      trafficChart.options.plugins.tooltip = { callbacks: { label: c => c.datasetIndex === 0 ? ' ' + rp(c.parsed.y) : ' ' + c.parsed.y + ' order' } };
      trafficChart.update();
    }
    const t = document.querySelector('#view-overview h3.text-lg'); if (t && /Traffic/.test(t.textContent)) { t.textContent = 'Pendapatan & Order Real-time'; t.nextElementSibling.textContent = 'Diambil langsung dari database transaksi ANDRI STORE'; }

    window.__live = d; applyAnalytics();

    status(true, `LIVE • ${new Date().toLocaleTimeString('id-ID')}`);
  }

  function applyAnalytics() {
    const d = window.__live; if (!d || !d.admin) return;
    const p = d.ptero || {}, st = d.stats;
    setCard('view-analytics', 'Runtime VPS', 'Server Online', p.ok ? `${p.online}/${p.serversTotal}` : '—', p.ok ? `<span class="text-emerald-600">${p.serversTotal ? Math.round(p.online / p.serversTotal * 100) : 0}% operasional</span>` : `<span class="text-red-500">${p.error || ''}</span>`);
    setCard('view-analytics', 'Total Server', null, p.ok ? `${p.serversTotal} Server` : '—', p.ok ? `<span>${p.nodes} node • ${p.pteroUsers} user panel</span>` : '');
    setCard('view-analytics', 'Total Pendapatan', null, rp(st.revenue), `<span class="text-emerald-600">${st.ordersDone} transaksi selesai</span>`);
    const memPct = p.ok && p.nodeMemoryMb ? Math.round(p.nodeAllocMemMb / p.nodeMemoryMb * 100) : null;
    setCard('view-analytics', 'CPU & RAM Usage', 'RAM Terpakai', p.ok ? `${(p.ramUsedMb / 1024).toFixed(1)} GB` : '—', p.ok ? `<span>CPU rata-rata ${p.cpuAvg}%${memPct != null ? ' • alokasi RAM ' + memPct + '%' : ''}</span>` : '');
    if (typeof analyticsLineChart !== 'undefined' && analyticsLineChart && JSON.stringify(d.series) !== lastSig.an) {
      lastSig.an = JSON.stringify(d.series);
      const ds = analyticsLineChart.data.datasets;
      analyticsLineChart.data.labels = d.series.labels;
      ds[0].label = 'Pendapatan (Rp)'; ds[0].data = d.series.revenue; ds[1].label = 'Order'; ds[1].data = d.series.count; ds[1].yAxisID = 'y1';
      analyticsLineChart.options.scales.y1 = { position: 'right', display: false, beginAtZero: true, grid: { drawOnChartArea: false } };
      analyticsLineChart.update();
      const h = analyticsLineChart.canvas.closest('.glass-panel').querySelector('h3'); if (h) { h.textContent = 'Pendapatan & Order Harian'; h.nextElementSibling.textContent = 'Data transaksi real-time'; }
    }
    if (typeof analyticsPieChart !== 'undefined' && analyticsPieChart && JSON.stringify(d.byProduct) !== lastSig.pie) {
      lastSig.pie = JSON.stringify(d.byProduct);
      const rows = d.byProduct.length ? d.byProduct : [{ label: 'Belum ada transaksi', count: 1 }];
      const pal = ['#171717', '#d97706', '#a8a29e', '#3f6212', '#0369a1', '#9d174d', '#6d28d9', '#b45309', '#0f766e', '#525252', '#be123c'];
      analyticsPieChart.data.labels = rows.map(r => r.label.replace('Panel Pterodactyl ', '').replace('Panel ', ''));
      analyticsPieChart.data.datasets[0].data = rows.map(r => r.count);
      analyticsPieChart.data.datasets[0].backgroundColor = rows.map((_, i) => pal[i % pal.length]);
      analyticsPieChart.update();
    }
  }

  /* ---------- Polling ---------- */
  async function pull() {
    if (busy || document.hidden) return; busy = true;
    try {
      const r = await fetch('/api/live?days=' + days);
      if (r.status === 401) { localStorage.removeItem('andri_session'); sessionStorage.removeItem('andri_session'); location.replace('halaman_login.html'); return; }
      const d = await r.json();
      if (d.success) apply(d); else status(false, (d.message || 'GAGAL').slice(0, 42).toUpperCase());
    } catch { status(false, 'OFFLINE — MENCOBA LAGI'); }
    finally { busy = false; }
  }

  /* ---------- Hook ke fungsi dashboard ---------- */
  const hook = (n, fn) => { const o = window[n]; if (typeof o === 'function') window[n] = function () { const r = o.apply(this, arguments); try { fn.apply(this, arguments); } catch (e) {} return r; }; };
  hook('updateChartData', v => { days = parseInt(v) || 30; lastSig = {}; pull(); });
  hook('switchTab', t => { if (t === 'analytics') setTimeout(applyAnalytics, 150); });
  hook('readNotification', i => { const n = notifications[i]; if (n && n.id) readIds.add(n.id); });
  hook('markAllNotifRead', () => { notifications.forEach(n => n.id && readIds.add(n.id)); if (isAdmin) fetch('/api/admin/notifications', { method: 'POST' }).catch(() => {}); });
  // Status pesanan ditentukan otomatis oleh pembayaran → aksi manual dinonaktifkan
  window.toggleOrderStatus = () => showToast('Status pesanan ditentukan otomatis oleh pembayaran.', 'info');
  window.deleteOrder = () => showToast('Riwayat transaksi tersimpan permanen di database.', 'info');

  /* ---------- Mulai (setelah init bawaan dashboard selesai) ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    users = []; if (isAdmin) { notifications = []; }
    orders = orders.filter(o => o.method === 'WhatsApp');
    try { renderUsers(); renderOverviewUsers(); renderNotifications(); renderOrderHistory(); } catch (e) {}
    blank();
    pull(); setInterval(pull, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  });
})();
