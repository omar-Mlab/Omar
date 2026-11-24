/* =========================================================
   app.js — layout, routing, theme, app lock, start-up
   ========================================================= */
'use strict';

const APP_VERSION = '1.0.0';
const navDef = key => S.nav.find(n => n.key === key) || NAV_DEFAULT.find(n => n.key === key);

/* ---------- theme ---------- */
function applyTheme() {
  const dark = S.theme === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--accent', S.accent);
  root.dataset.sidebar = S.sidebarStyle;
  document.title = S.appName;
  const mt = $('meta[name=theme-color]'); if (mt) mt.content = dark ? '#0b1220' : S.accent;
  const fav = $('link[rel=icon]'); if (fav) fav.href = S.appIcon || 'icons/icon-192.png';
}

/* ---------- shell (sidebar + top bar) ---------- */
let deferredInstall = null;
function renderShell() {
  const cur = currentRoute().section;
  $('#sidebar').innerHTML = `
    <div class="sb-head"><img src="${S.appIcon || S.logo || 'icons/icon-192.png'}" alt=""><div><b>${esc(S.shortName)}</b><small>${esc(S.appName)}</small></div></div>
    <nav>${S.nav.filter(n => !n.hidden).map(n => `<a class="sb-item ${cur === n.key ? 'on' : ''}" href="#/${n.key}" title="${esc(n.label)}">${ic(n.icon, '', n.color)}<span>${esc(n.label)}</span></a>`).join('')}
      ${S.shortcuts.length ? `<div class="sb-sep"></div>${S.shortcuts.map(sc => `<a class="sb-item" href="javascript:void 0" data-act="shortcut" data-sid="${sc.id}" title="${esc(sc.label)}">${ic(sc.icon || 'link', '', sc.color || '')}<span>${esc(sc.label)}</span></a>`).join('')}` : ''}
    </nav>
    <div class="sb-foot">
      ${deferredInstall ? `<button class="btn sm primary block" data-act="install">${ic('download')} Install App</button>` : ''}
      ${S.security.enabled ? `<button class="sb-item" data-act="lockNow">${ic('lock')}<span>Lock</span></button>` : ''}
    </div>`;
  $('#topbar').innerHTML = `
    <button class="icon-btn menu-btn" data-act="drawer" aria-label="Menu">${ic('menu')}</button>
    <div class="tb-title">${esc(pageTitle())}</div>
    <span id="saveState" class="save-state saved"></span>
    <button class="icon-btn" data-act="search" aria-label="Search">${ic('search')}</button>`;
  setSaveState(savePending ? 'saving' : 'saved');
}
function pageTitle() { const r = currentRoute(); return r.section === 'dashboard' ? S.shortName : (navDef(r.section) || {}).label || S.shortName; }
ACT.drawer = () => document.body.classList.toggle('drawer-open');
ACT.install = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; renderShell(); };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (S) renderShell(); });

/* ---------- routing ---------- */
function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const section = parts[0] || 'dashboard';
  return { section, sub: parts[1] || '', id: parts[2] ? decodeURIComponent(parts[2]) : '', raw: location.hash };
}
let lastRouteRaw = null;
function render() {
  if (!D) return;
  const r = currentRoute();
  const changed = r.raw !== lastRouteRaw;
  if (changed) {
    lastRouteRaw = r.raw;
    listQuery.geo = listQuery.mat = ''; listSort.geo = listSort.mat = null;
    if (pendingFilter) { listQuery[pendingFilter.dept] = pendingFilter.q; listSort[pendingFilter.dept] = pendingFilter.sort || null; pendingFilter = null; }
    if (r.sub === 'p' && (r.section === 'geo' || r.section === 'mat') && projById(r.section, r.id)) touchRecent(r.section, r.id);
    document.body.classList.remove('drawer-open');
  }
  let html = '', bind = null;
  switch (r.section) {
    case 'geo':
      if (r.sub === 's') { html = viewGeoStatus(r.id, listQuery.geo); bind = () => bindList('geo'); }
      else if (r.sub === 'p') html = viewGeoDetails(r.id);
      else { html = viewGeoHome(); bind = bindGeoHome; }
      break;
    case 'mat':
      if (r.sub === 's') { html = viewMatStatus(r.id, listQuery.mat); bind = () => bindList('mat'); }
      else if (r.sub === 'p') html = viewMatDetails(r.id);
      else { html = viewMatHome(); bind = bindMatHome; }
      break;
    case 'rv': html = viewRV(); bind = bindRV; break;
    case 'stats': html = viewStats(); break;
    case 'data': html = viewData(); bind = bindData; break;
    case 'fav': html = viewFav(); break;
    case 'recent': html = viewRecent(); break;
    case 'settings': html = viewSettings(); bind = bindSettings; break;
    default: html = viewDashboard();
  }
  const main = $('#main');
  const y = changed ? 0 : window.scrollY;
  main.innerHTML = html + `<div id="datalists" hidden>${datalistsHTML()}</div>`;
  if (bind) bind();
  if (changed) { renderShell(); window.scrollTo(0, 0); } else window.scrollTo(0, y);
}
function renderKeepFocus(id) {
  const el = document.getElementById(id);
  const pos = el ? el.selectionStart : null;
  render();
  const n = document.getElementById(id);
  if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
}
window.addEventListener('hashchange', render);
ACT.go = el => nav(el.dataset.h);
/* keep a small stack of visited screens so “back” returns to where you came from */
const routeStack = [location.hash || '#/'];
window.addEventListener('hashchange', () => {
  const h = location.hash || '#/';
  if (routeStack.length > 1 && routeStack[routeStack.length - 2] === h) routeStack.pop(); else routeStack.push(h);
  if (routeStack.length > 50) routeStack.shift();
});
ACT.back = () => {
  const r = currentRoute();
  if (routeStack.length > 1) history.back();
  else if (r.section === 'geo' && geoById(r.id)) nav('#/geo/s/' + geoById(r.id).status);
  else if (r.section === 'mat' && matById(r.id)) nav('#/mat/s/' + matById(r.id).status);
  else nav('#/' + r.section);
};

/* global click handler for data-act */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault(); e.stopPropagation();
  Promise.resolve(fn(el)).catch(err => { console.error(err); toast('Error: ' + err.message, 'danger', 6000); });
});
$('#scrim') && $('#scrim').addEventListener('click', () => document.body.classList.remove('drawer-open'));

/* ---------- app lock ---------- */
let locked = false, lastActivity = Date.now(), hiddenAt = null, wrongTries = 0, lockUntil = 0;
function showLock() {
  locked = true;
  const L = $('#lock');
  L.hidden = false;
  L.innerHTML = `<div class="lock-box">
    <img src="${S.appIcon || S.logo || 'icons/icon-192.png'}" alt="">
    <h2>${esc(S.shortName)}</h2><p class="muted">Enter PIN</p>
    <div class="pin-dots" id="pinDots"></div>
    <input id="pinInput" type="password" inputmode="numeric" autocomplete="off" class="pin-input" placeholder="PIN or recovery code">
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✓'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>
    <div id="pinErr" class="dangerc small"></div></div>`;
  const inp = $('#pinInput', L);
  const tryIt = () => {
    if (Date.now() < lockUntil) { $('#pinErr').textContent = `Too many attempts. Wait ${Math.ceil((lockUntil - Date.now()) / 1000)} s.`; return; }
    if (checkPin(inp.value.trim())) { wrongTries = 0; locked = false; L.hidden = true; L.innerHTML = ''; lastActivity = Date.now(); render(); return; }
    wrongTries++; inp.value = '';
    if (wrongTries >= 5) { lockUntil = Date.now() + 30000; wrongTries = 0; }
    $('#pinErr').textContent = 'Wrong PIN';
    L.querySelector('.lock-box').classList.add('shake'); setTimeout(() => L.querySelector('.lock-box') && L.querySelector('.lock-box').classList.remove('shake'), 400);
  };
  $$('[data-k]', L).forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === 'C') inp.value = ''; else if (k === '✓') return tryIt(); else inp.value += k;
    $('#pinErr').textContent = '';
    if (/^\d{4,8}$/.test(inp.value) && inp.value.length >= 4 && hashPin(inp.value, S.security.salt) === S.security.hash) tryIt();
  });
  inp.onkeydown = e => { if (e.key === 'Enter') tryIt(); };
  inp.oninput = () => { if (/^\d{4,8}$/.test(inp.value) && hashPin(inp.value, S.security.salt) === S.security.hash) tryIt(); };
  $('#main').innerHTML = '';
  modalStack.slice().forEach(w => closeModal(w, true));
}
ACT.lockNow = () => { if (S.security.enabled) showLock(); };
['pointerdown', 'keydown', 'scroll'].forEach(ev => window.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
setInterval(() => { if (S && S.security.enabled && !locked && Date.now() - lastActivity > S.security.autoLockMin * 60000) showLock(); }, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); flushSave(); }
  else if (S && S.security.enabled && !locked && hiddenAt && Date.now() - hiddenAt > S.security.autoLockMin * 60000) showLock();
});
window.addEventListener('pagehide', () => flushSave());

/* ---------- start ---------- */
async function start() {
  try { await loadStore(); } catch (e) { console.error(e); D = emptyData(); S = defaultSettings(); toast('Could not open the database', 'danger', 6000); }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => S.theme === 'auto' && applyTheme());
  renderShell();
  if (S.security.enabled && S.security.hash) showLock(); else render();
  dailySnapshot();
  refreshStorageInfo();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  }
}
start();
