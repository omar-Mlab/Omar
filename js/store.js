/* =========================================================
   store.js — database (IndexedDB on the device), settings,
   automatic saving, daily snapshots, activity history
   ========================================================= */
'use strict';

const SCHEMA = 1;
let D = null;   // all business data
let S = null;   // all settings

/* ---------- Geotechnical workflow (core rules use these keys) ---------- */
const GEO_CORE = [
  { key: 'meps',       label: 'On MEPS',     color: '#64748b', icon: 'file' },
  { key: 'permit',     label: 'Permit Done', color: '#0284c7', icon: 'checkCircle' },
  { key: 'urgent',     label: 'Urgent',      color: '#dc2626', icon: 'zap' },
  { key: 'onsite',     label: 'On-Site',     color: '#d97706', icon: 'truck' },
  { key: 'reporting',  label: 'Reporting',   color: '#7c3aed', icon: 'file' },
  { key: 'reportdone', label: 'Report Done', color: '#0d9488', icon: 'check' },
  { key: 'fullydone',  label: 'Fully Done',  color: '#16a34a', icon: 'dollar' },
  { key: 'finished',   label: 'Finished',    color: '#0f766e', icon: 'flag' }
];
const CORE_RANK = { meps: 0, permit: 1, urgent: 2, onsite: 3, reporting: 4, reportdone: 5, fullydone: 6, finished: 7 };
// status → [date key, required date label]
const STATUS_DATE = { permit: ['permit', 'Permit Date'], onsite: ['start', 'Start Date'], reporting: ['schedule', 'Schedule Date'], reportdone: ['report', 'Report Date'] };
const MAT_CORE = [
  { key: 'quoted',   label: 'Quoted',   color: '#64748b', icon: 'file' },
  { key: 'approved', label: 'Approved', color: '#0284c7', icon: 'checkCircle' },
  { key: 'finished', label: 'Finished', color: '#16a34a', icon: 'flag' }
];

const NAV_DEFAULT = [
  { key: 'dashboard', label: 'Dashboard',  icon: 'home' },
  { key: 'geo',       label: 'Geotechnical', icon: 'layers' },
  { key: 'mat',       label: 'Material', icon: 'flask' },
  { key: 'rv',        label: 'RV Tracking', icon: 'receipt' },
  { key: 'stats',     label: 'Project Statistics', icon: 'chart' },
  { key: 'data',      label: 'Data Management', icon: 'database' },
  { key: 'fav',       label: 'Favorites', icon: 'star' },
  { key: 'recent',    label: 'Recently Viewed', icon: 'clock' },
  { key: 'settings',  label: 'Settings & Customization', icon: 'sliders' }
];
const WIDGETS = { search: 'Quick Search', quickadd: 'Quick Add Project', shortcuts: 'Department Shortcuts', quick: 'Quick Actions', recent: 'Recently Viewed Projects', favorites: 'Favorites', attention: 'Needs Attention (Urgent / Missing RV)' };
const RV_COLUMNS = { gsi: 'GSI Number', consultant: 'Consultant Name', owner: 'Owner Name', location: 'Location', rv: 'RV Number', tdate: 'Transfer Date', tamount: 'Transfer Amount', method: 'Transfer Method', rvstatus: 'RV Registration Status', notes: 'Notes' };

function defaultSettings() {
  return {
    appName: 'Material Lab – Operations Manager',
    shortName: 'ML Ops',
    logo: null, appIcon: null,
    theme: 'light', accent: '#0f766e', sidebarStyle: 'full',
    dashboard: Object.keys(WIDGETS).map(k => ({ key: k, on: k !== 'attention' })),
    nav: NAV_DEFAULT.map(n => ({ ...n, color: '', hidden: false })),
    shortcuts: [],
    geoStatuses: GEO_CORE.map(s => ({ ...s, core: true })),
    matStatuses: MAT_CORE.map(s => ({ ...s, core: true })),
    autoUrgent: true, autoFullyDone: true,
    customFields: [],
    cards: {
      geo: { consultant: true, owner: true, location: true, financial: true, dates: true },
      mat: { consultant: true, owner: true, location: true, financial: true, floors: true }
    },
    sort: { geo: 'updated', mat: 'updated' },
    rvColumns: Object.keys(RV_COLUMNS).map(k => ({ key: k, on: true })),
    savedFilters: [],
    currency: 'AED', decimals: 2, numberFormat: 'en', dateFormat: 'DD/MM/YYYY',
    paymentDescriptions: ['First Payment', 'Second Payment', 'Partial Payment', 'Additional Payment', 'Final Payment'],
    paymentCategories: [],
    transferMethods: ['Bank Transfer', 'Cash', 'Cheque', 'Online'],
    security: { enabled: false, salt: '', hash: '', recoveryHash: '', autoLockMin: 5 },
    backup: { lastDownload: null, lastSnapshot: null }
  };
}
function emptyData() {
  return { schema: SCHEMA, geo: [], mat: [], activity: [], recent: [], deleted: [], createdAt: nowISO() };
}

/* Merge saved settings with defaults so new options appear after updates */
function mergeSettings(saved) {
  const d = defaultSettings();
  if (!saved || typeof saved !== 'object') return d;
  const s = { ...d, ...saved };
  s.cards = { geo: { ...d.cards.geo, ...(saved.cards || {}).geo }, mat: { ...d.cards.mat, ...(saved.cards || {}).mat } };
  s.sort = { ...d.sort, ...(saved.sort || {}) };
  s.security = { ...d.security, ...(saved.security || {}) };
  s.backup = { ...d.backup, ...(saved.backup || {}) };
  // nav: keep saved order, add any new items
  const nav = Array.isArray(saved.nav) ? saved.nav.filter(n => NAV_DEFAULT.some(x => x.key === n.key)) : [];
  NAV_DEFAULT.forEach(n => { if (!nav.some(x => x.key === n.key)) nav.push({ ...n, color: '', hidden: false }); });
  s.nav = nav;
  const dash = Array.isArray(saved.dashboard) ? saved.dashboard.filter(w => WIDGETS[w.key]) : [];
  Object.keys(WIDGETS).forEach(k => { if (!dash.some(w => w.key === k)) dash.push({ key: k, on: k !== 'attention' }); });
  s.dashboard = dash;
  const rvc = Array.isArray(saved.rvColumns) ? saved.rvColumns.filter(c => RV_COLUMNS[c.key]) : [];
  Object.keys(RV_COLUMNS).forEach(k => { if (!rvc.some(c => c.key === k)) rvc.push({ key: k, on: true }); });
  s.rvColumns = rvc;
  // statuses: core statuses can never be removed
  const fixStatuses = (list, core) => {
    const out = Array.isArray(list) ? list.filter(x => x && x.key) : [];
    core.forEach(c => { if (!out.some(x => x.key === c.key)) out.push({ ...c, core: true }); });
    out.forEach(x => { if (core.some(c => c.key === x.key)) x.core = true; });
    return out;
  };
  s.geoStatuses = fixStatuses(saved.geoStatuses, GEO_CORE);
  s.matStatuses = fixStatuses(saved.matStatuses, MAT_CORE);
  ['customFields', 'shortcuts', 'savedFilters', 'paymentDescriptions', 'paymentCategories', 'transferMethods'].forEach(k => { if (!Array.isArray(s[k])) s[k] = d[k]; });
  return s;
}

/* ---------- IndexedDB key/value store ---------- */
let idb = null;
function idbOpen() {
  return new Promise(res => {
    try {
      if (!('indexedDB' in window)) return res(null);
      const r = indexedDB.open('ml-ops-db', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
function kvGet(k) {
  return new Promise(res => {
    if (!idb) { try { res(JSON.parse(localStorage.getItem('mlops_' + k))); } catch (e) { res(null); } return; }
    const t = idb.transaction('kv').objectStore('kv').get(k);
    t.onsuccess = () => res(t.result ?? null);
    t.onerror = () => res(null);
  });
}
function kvSet(k, v) {
  return new Promise((res, rej) => {
    if (!idb) { try { localStorage.setItem('mlops_' + k, JSON.stringify(v)); res(); } catch (e) { rej(e); } return; }
    const tx = idb.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(v, k);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

/* ---------- loading & automatic saving ---------- */
async function loadStore() {
  idb = await idbOpen();
  const data = await kvGet('data');
  const sett = await kvGet('settings');
  D = (data && typeof data === 'object') ? data : emptyData();
  ['geo', 'mat', 'activity', 'recent', 'deleted'].forEach(k => { if (!Array.isArray(D[k])) D[k] = []; });
  D.geo.forEach(normalizeGeo); D.mat.forEach(normalizeMat);
  S = mergeSettings(sett);
}
function normalizeGeo(p) {
  p.payments = p.payments || []; p.notes = p.notes || []; p.attachments = p.attachments || [];
  p.statusHistory = p.statusHistory || []; p.rvHistory = p.rvHistory || []; p.dates = p.dates || {};
  p.custom = p.custom || {}; p.flags = p.flags || {};
  return p;
}
function normalizeMat(p) {
  p.notes = p.notes || []; p.attachments = p.attachments || []; p.statusHistory = p.statusHistory || [];
  p.custom = p.custom || {}; p.approved = p.approved || {};
  return p;
}

let saveTimer = null, savePending = false;
function save() {
  savePending = true;
  setSaveState('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 250);
}
async function flushSave() {
  clearTimeout(saveTimer);
  if (!savePending) return;
  savePending = false;
  try {
    await kvSet('data', D);
    await kvSet('settings', S);
    setSaveState('saved');
    requestPersistence();
  } catch (e) {
    console.error(e);
    setSaveState('error');
    toast('Save failed: ' + (e && e.message ? e.message : 'storage error') + '. Export a backup now.', 'danger', 8000);
  }
}
let lastSavedAt = null;
function setSaveState(st) {
  const el = document.getElementById('saveState');
  if (st === 'saved') lastSavedAt = new Date();
  if (!el) return;
  el.className = 'save-state ' + st;
  el.innerHTML = st === 'saving' ? '<span class="dot"></span>Saving…'
    : st === 'error' ? ic('alert') + 'Not saved'
    : ic('check') + 'Saved' + (lastSavedAt ? ' ' + String(lastSavedAt.getHours()).padStart(2, '0') + ':' + String(lastSavedAt.getMinutes()).padStart(2, '0') : '');
}
let persistAsked = false;
async function requestPersistence() {
  if (persistAsked) return; persistAsked = true;
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
}

/* ---------- internal snapshots (automatic daily backup) ---------- */
async function getSnapshots() { return (await kvGet('snapshots')) || []; }
async function makeSnapshot(reason) {
  const list = await getSnapshots();
  list.unshift({ id: uid(), at: nowISO(), reason, geo: D.geo.length, mat: D.mat.length, json: JSON.stringify({ data: D, settings: S }) });
  while (list.length > 10) list.pop();
  await kvSet('snapshots', list);
  S.backup.lastSnapshot = nowISO();
  save();
}
async function dailySnapshot() {
  const last = S.backup.lastSnapshot ? new Date(S.backup.lastSnapshot) : null;
  if ((D.geo.length || D.mat.length) && (!last || (Date.now() - last) > 20 * 3600 * 1000)) {
    try { await makeSnapshot('Daily automatic backup'); } catch (e) { console.warn(e); }
  }
}

/* ---------- activity history ---------- */
function logAct(dept, p, type, text) {
  D.activity.unshift({ id: uid(), at: nowISO(), dept, pid: p ? p.id : null, ref: p ? (dept === 'geo' ? p.gsi : p.ref) : '', type, text });
  if (D.activity.length > 5000) D.activity.length = 5000;
}
function touchRecent(dept, id) {
  D.recent = D.recent.filter(r => !(r.dept === dept && r.id === id));
  D.recent.unshift({ dept, id, at: nowISO() });
  if (D.recent.length > 30) D.recent.length = 30;
  save();
}
const geoById = id => D.geo.find(p => p.id === id);
const matById = id => D.mat.find(p => p.id === id);
