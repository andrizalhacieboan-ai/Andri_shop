/* ANDRI STORE — motion layer (tanpa dependency). */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const root = document.documentElement;
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* 1) Intro curtain — sekali per sesi */
  try {
    if (!reduce && !sessionStorage.getItem('fx_seen')) {
      sessionStorage.setItem('fx_seen', '1');
      const el = document.createElement('div');
      el.id = 'fx-intro';
      el.innerHTML = '<div><div class="ring"></div><div class="word">' +
        [...'ANDRI STORE'].map((c, i) => `<span style="animation-delay:${.25 + i * .055}s">${c === ' ' ? '&nbsp;' : c}</span>`).join('') +
        '</div></div>';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2400);
    }
  } catch (e) {}

  if (reduce) return; // sisanya hanya untuk pengguna yang tidak membatasi gerakan

  /* 2) Scroll progress */
  const bar = document.createElement('div'); bar.id = 'fx-progress'; document.body.appendChild(bar);
  let tick = false;
  const upd = () => {
    const h = root.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(scrollY / h, 1) : 0})`; tick = false;
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });

  /* 3) Paralaks aurora (lerp halus) */
  if (fine) {
    let tx = 0, ty = 0, cx = 0, cy = 0, run = false;
    const loop = () => {
      cx += (tx - cx) * .06; cy += (ty - cy) * .06;
      root.style.setProperty('--px', cx.toFixed(3)); root.style.setProperty('--py', cy.toFixed(3));
      if (Math.abs(tx - cx) + Math.abs(ty - cy) > .002) requestAnimationFrame(loop); else run = false;
    };
    addEventListener('pointermove', e => {
      tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5;
      if (!run) { run = true; requestAnimationFrame(loop); }
    }, { passive: true });

    /* 4) Spotlight + tilt 3D (event delegation → kartu dinamis ikut bekerja) */
    let tilted = null;
    const reset = c => { c.classList.remove('fx-tilting'); c.style.transform = ''; };
    document.addEventListener('pointermove', e => {
      const c = e.target.closest && e.target.closest('.glass-card');
      if (tilted && tilted !== c) { reset(tilted); tilted = null; }
      if (!c) return;
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      c.style.setProperty('--mx', x + 'px'); c.style.setProperty('--my', y + 'px');
      if (r.width > 700 || r.height > 520 || c.closest('#aiChatDrawer,.modal')) return; // panel besar: spotlight saja
      c.classList.add('fx-tilting'); tilted = c;
      c.style.transform = `perspective(900px) rotateX(${((.5 - y / r.height) * 5).toFixed(2)}deg) rotateY(${((x / r.width - .5) * 6).toFixed(2)}deg) translateY(-3px)`;
    }, { passive: true });
    document.addEventListener('pointerleave', () => tilted && reset(tilted), true);
  }

  /* 5) Ripple tombol */
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('button,.cat-tab,.ptab');
    if (!b || b.disabled) return;
    const pos = getComputedStyle(b).position;
    if (pos !== 'static' && pos !== 'relative') return; // jangan ubah layout tombol absolute/fixed
    if (pos === 'static') b.style.position = 'relative';
    b.classList.add('fx-rip-host');
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2, d = document.createElement('span');
    d.className = 'fx-rip';
    d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(d); setTimeout(() => d.remove(), 800);
  }, { passive: true });

  /* 6) Count-up angka statistik */
  const seen = new WeakMap();
  function parse(t) {
    const m = t.match(/(\d[\d.,]*)/); if (!m) return null;
    const tok = m[1], rp = /^\s*Rp/i.test(t), dec = !rp && /\.\d{1,2}$/.test(tok) ? tok.split('.')[1].length : 0;
    const n = rp || !dec ? parseInt(tok.replace(/[.,]/g, ''), 10) : parseFloat(tok);
    if (!isFinite(n) || n === 0) return null;
    return { n, dec, rp, pre: t.slice(0, m.index), post: t.slice(m.index + tok.length) };
  }
  function count(el) {
    const orig = el.textContent, p = parse(orig.trim());
    if (!p || orig.length > 28) return;
    const t0 = performance.now(), dur = 1500;
    let last = '';
    (function step(now) {
      if (el.textContent !== last && last) return; // aplikasi mengubah teks → batalkan
      const k = Math.min((now - t0) / dur, 1), v = p.n * (1 - Math.pow(1 - k, 4));
      last = k >= 1 ? orig : p.pre + (p.dec ? v.toFixed(p.dec) : Math.round(v).toLocaleString(p.rp ? 'id-ID' : 'en-US').replace(/,/g, p.rp ? '.' : ',')) + p.post;
      el.textContent = last;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { io.unobserve(e.target); count(e.target); }
  }), { threshold: .4 });
  const armCounters = view => $$('.glass-card h3', view || document).forEach(h => {
    if (h.children.length || !parse(h.textContent.trim())) return;
    io.observe(h);
  });

  /* 7) Hook ke fungsi aplikasi (tanpa mengubah kode aslinya) */
  const wrap = (name, after) => {
    const fn = window[name]; if (typeof fn !== 'function') return;
    window[name] = function () { const r = fn.apply(this, arguments); try { after.apply(this, arguments); } catch (e) {} return r; };
  };
  wrap('switchTab', t => setTimeout(() => armCounters($('view-' + t)), 60));
  const $ = id => document.getElementById(id);
  const theming = () => { root.classList.add('fx-theming'); setTimeout(() => root.classList.remove('fx-theming'), 800); };
  ['toggleTheme', 'setTheme'].forEach(n => { const f = window[n]; if (typeof f === 'function') window[n] = function () { theming(); return f.apply(this, arguments); }; });
  setTimeout(() => armCounters(), 1300);

  /* 8) Chart.js: tumbuh bergilir per titik data */
  if (window.Chart) {
    const a = Chart.defaults.animation;
    a.duration = 1600; a.easing = 'easeOutQuart';
    a.delay = c => (c.type === 'data' && c.mode === 'default') ? c.dataIndex * 70 + c.datasetIndex * 160 : 0;
  }
})();
