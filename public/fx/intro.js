/* ANDRI STORE — video intro (glow ring). Dimuat di <head> agar tampil sebelum konten.
   Tampil sekali per sesi tab; paksa ulang dengan menambah ?intro pada URL. */
(function () {
  'use strict';
  var root = document.documentElement, force = /[?&]intro\b/.test(location.search);
  try { if (!force && sessionStorage.getItem('fx_seen')) return; sessionStorage.setItem('fx_seen', '1'); } catch (e) {}
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var css = '\
#fx-vid{position:fixed;inset:0;z-index:2147483000;overflow:hidden;\
background:linear-gradient(180deg,#25262b 0%,#1b1a1d 50%,#070609 100%);transition:opacity .9s cubic-bezier(.16,1,.3,1),transform .9s cubic-bezier(.16,1,.3,1),filter .9s ease}\
#fx-vid.out{opacity:0;transform:scale(1.05);filter:blur(6px);pointer-events:none}\
#fx-vid video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;opacity:0;transition:opacity .7s ease;\
-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 30%,#000 70%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 30%,#000 70%,transparent 100%)}\
#fx-vid.on video{opacity:1}\
@media (max-aspect-ratio:3/4){#fx-vid video{object-fit:cover;-webkit-mask-image:none;mask-image:none}}\
#fx-vid button{position:absolute;font:700 11px/1 Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#f3e3c8;\
background:rgba(20,18,16,.55);border:1px solid rgba(255,170,80,.35);border-radius:999px;padding:11px 18px;cursor:pointer;\
backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background .3s,border-color .3s,transform .3s}\
#fx-vid button:hover{background:rgba(255,150,50,.22);border-color:rgba(255,190,110,.7);transform:translateY(-1px)}\
#fx-vid .skip{right:max(18px,env(safe-area-inset-right));bottom:max(22px,env(safe-area-inset-bottom));opacity:0;animation:fxv-in .6s ease 1.2s forwards}\
#fx-vid .snd{left:max(18px,env(safe-area-inset-left));bottom:max(22px,env(safe-area-inset-bottom));opacity:0;animation:fxv-in .6s ease 1.2s forwards}\
#fx-vid .bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.07)}\
#fx-vid .bar i{display:block;height:100%;width:100%;transform:scaleX(0);transform-origin:0 50%;background:linear-gradient(90deg,#ff8a1f,#ffd08a);box-shadow:0 0 14px #ff8a1f}\
@keyframes fxv-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}\
html.fx-vidlock{overflow:hidden}\
html.fx-vidlock body *{animation-play-state:paused !important}';
  var st = document.createElement('style'); st.textContent = css; root.appendChild(st);
  root.classList.add('fx-vidlock');

  var o = document.createElement('div'); o.id = 'fx-vid'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Intro ANDRI STORE');
  o.innerHTML = '<video muted playsinline webkit-playsinline preload="auto" src="/fx/intro.mp4"></video>' +
    '<button type="button" class="snd" aria-label="Nyalakan suara">Suara</button>' +
    '<button type="button" class="skip" aria-label="Lewati intro">Lewati &rsaquo;</button>' +
    '<div class="bar"><i></i></div>';
  root.appendChild(o);

  var v = o.querySelector('video'), bar = o.querySelector('.bar i'), snd = o.querySelector('.snd'), done = false, guard;
  function finish() {
    if (done) return; done = true; clearTimeout(guard);
    o.classList.add('out');
    try { v.pause(); } catch (e) {}
    setTimeout(function () {
      root.classList.remove('fx-vidlock'); // animasi halaman dilanjutkan → konten masuk bergilir
      if (o.parentNode) o.parentNode.removeChild(o);
      if (st.parentNode) st.parentNode.removeChild(st);
      document.dispatchEvent(new Event('fx:intro-done'));
    }, 950);
  }
  v.addEventListener('playing', function () { clearTimeout(guard); o.classList.add('on'); });
  v.addEventListener('timeupdate', function () {
    if (!v.duration) return;
    bar.style.transform = 'scaleX(' + Math.min(v.currentTime / v.duration, 1) + ')';
    if (v.duration - v.currentTime < 0.6) finish(); // mulai memudar sebelum video benar-benar habis
  });
  v.addEventListener('ended', finish);
  v.addEventListener('error', finish);               // codec/jaringan gagal → langsung ke website
  guard = setTimeout(finish, 6000);                  // tak mulai main dalam 6 detik → lewati
  o.querySelector('.skip').addEventListener('click', finish);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Enter') finish(); });
  snd.addEventListener('click', function () {
    v.muted = !v.muted; snd.textContent = v.muted ? 'Suara' : 'Senyap';
    if (!v.muted) v.play().catch(function () {});
  });
  var p = v.play(); if (p && p.catch) p.catch(finish);
})();
