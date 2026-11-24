/* =========================================================
   settings.js — Settings & Customization
   (appearance, navigation, dashboard, statuses, custom fields,
    tables, financial display, security, settings backup)
   ========================================================= */
'use strict';

let setTab = 'appearance';
const SET_TABS = [['appearance', 'Appearance'], ['nav', 'Icons & Navigation'], ['dashboard', 'Dashboard'], ['statuses', 'Statuses'], ['fields', 'Custom Fields Manager'], ['tables', 'Tables & Cards'], ['financial', 'Financial'], ['security', 'Security'], ['sbackup', 'Settings Backup']];
const CF_TYPES = { text: 'Short Text', longtext: 'Long Text', number: 'Number', currency: 'Currency', date: 'Date', dropdown: 'Dropdown', multi: 'Multiple Selection', yesno: 'Yes / No', checkbox: 'Checkbox', file: 'File Attachment' };
const ACCENTS = ['#0f766e', '#0369a1', '#4338ca', '#7c3aed', '#be123c', '#c2410c', '#15803d', '#334155'];

function getPath(o, path) { return path.split('.').reduce((a, k) => a == null ? a : a[k], o); }
function setPath(o, path, v) { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }
const sIn = (path, extra = '') => `<input class="inp" data-s="${path}" value="${esc(getPath(S, path) ?? '')}" ${extra}>`;
const sChk = (path, label) => `<label class="cb"><input type="checkbox" data-s="${path}" data-type="bool" ${getPath(S, path) ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
const sColor = path => `<input type="color" class="swatch" data-s="${path}" value="${esc(getPath(S, path) || '#64748b')}">`;
const upDown = (list, i) => `<button class="icon-btn" data-act="sMove" data-list="${list}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button><button class="icon-btn" data-act="sMove" data-list="${list}" data-i="${i}" data-d="1" ${i === getPath(S, list).length - 1 ? 'disabled' : ''}>${ic('down')}</button>`;

function viewSettings() {
  let b = '';
  switch (setTab) {
    case 'appearance': b = `
      <section class="card"><h2>Application</h2>
        <div class="srow"><label>Application Name</label>${sIn('appName')}</div>
        <div class="srow"><label>Short Name</label>${sIn('shortName', 'maxlength="14"')}</div>
        <div class="srow"><label>Company Logo</label><div class="img-pick">${S.logo ? `<img src="${S.logo}" alt="">` : '<span class="muted">None</span>'}<button class="btn sm" data-act="pickImg" data-k="logo">Upload</button>${S.logo ? '<button class="btn sm ghost" data-act="clearImg" data-k="logo">Remove</button>' : ''}</div></div>
        <div class="srow"><label>Application Icon</label><div class="img-pick">${S.appIcon ? `<img src="${S.appIcon}" alt="">` : `<img src="icons/icon-192.png" alt="">`}<button class="btn sm" data-act="pickImg" data-k="appIcon">Upload</button>${S.appIcon ? '<button class="btn sm ghost" data-act="clearImg" data-k="appIcon">Remove</button>' : ''}</div></div>
        <div class="hint">The icon is used inside the app and in the browser tab. The home-screen icon of an installed app is fixed at install time (reinstall to change it).</div>
      </section>
      <section class="card"><h2>Theme</h2>
        <div class="seg wide">${[['light', 'Light Mode'], ['dark', 'Dark Mode'], ['auto', 'Automatic']].map(([k, l]) => `<button class="${S.theme === k ? 'on' : ''}" data-act="sSet" data-k="theme" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="srow"><label>Accent Color</label><div class="accents">${ACCENTS.map(c => `<button class="acc ${S.accent === c ? 'on' : ''}" style="background:${c}" data-act="sSet" data-k="accent" data-v="${c}"></button>`).join('')}${sColor('accent')}</div></div>
        <div class="srow"><label>Sidebar Style</label><div class="seg">${[['full', 'Full'], ['compact', 'Compact (icons)']].map(([k, l]) => `<button class="${S.sidebarStyle === k ? 'on' : ''}" data-act="sSet" data-k="sidebarStyle" data-v="${k}">${l}</button>`).join('')}</div></div>
        <div class="hint">Compact sidebar applies on wide screens (tablet / desktop).</div>
      </section>`; break;
    case 'nav': b = `
      <section class="card"><h2>Menu Items</h2><div class="hint">Rename, reorder, hide, and change icons and icon colors.</div>
        ${S.nav.map((n, i) => `<div class="lrow"><button class="icon-pick" data-act="pickIcon" data-path="nav.${i}.icon" style="color:${esc(n.color || 'inherit')}">${ic(n.icon)}</button>
          <input class="inp grow" data-s="nav.${i}.label" value="${esc(n.label)}">
          <input type="color" class="swatch" data-s="nav.${i}.color" value="${esc(n.color || '#64748b')}" title="Icon color">
          ${['dashboard', 'settings'].includes(n.key) ? '<span class="icon-btn"></span>' : `<button class="icon-btn" data-act="sToggle" data-path="nav.${i}.hidden" title="Show / hide">${ic(n.hidden ? 'eyeOff' : 'eye')}</button>`}
          ${upDown('nav', i)}</div>`).join('')}
      </section>
      <section class="card"><div class="card-head"><h2>Custom Shortcuts</h2><button class="btn sm" data-act="scAdd">${ic('plus')} Add</button></div>
        ${S.shortcuts.length ? S.shortcuts.map((sc, i) => `<div class="lrow"><button class="icon-pick" data-act="pickIcon" data-path="shortcuts.${i}.icon">${ic(sc.icon || 'link')}</button><input class="inp grow" data-s="shortcuts.${i}.label" value="${esc(sc.label)}"><small class="muted">${esc(sc.target)}</small><button class="icon-btn" data-act="scDel" data-i="${i}">${ic('trash')}</button>${upDown('shortcuts', i)}</div>`).join('') : '<div class="empty sm">Shortcuts appear in the sidebar, dashboard and Quick Actions</div>'}
      </section>
      <button class="btn ghost" data-act="navReset">${ic('refresh')} Restore default menu & icons</button>`; break;
    case 'dashboard': b = `
      <section class="card"><h2>Dashboard Widgets</h2><div class="hint">Choose which widgets are visible and their order.</div>
        ${S.dashboard.map((w, i) => `<div class="lrow">${sChk(`dashboard.${i}.on`, WIDGETS[w.key])}<span class="grow"></span>${upDown('dashboard', i)}</div>`).join('')}
      </section>`; break;
    case 'statuses': b = `
      <section class="card"><h2>Workflow Automation</h2>
        ${sChk('autoUrgent', 'Move to Urgent automatically when the first payment is recorded')}
        ${sChk('autoFullyDone', 'Move to Fully Done automatically (Report Done + Total Received = Total Payment)')}
        <div class="hint">${ic('lock')} Protected rules (cannot be bypassed): Fully Done always requires Report Done and a zero balance; Finished/RV records are never deleted or detached; projects after Report Done cannot be deleted.</div>
      </section>
      ${statusEditor('geo', 'Geotechnical Statuses')}
      ${statusEditor('mat', 'Material Statuses')}`; break;
    case 'fields': {
      const fl = [...S.customFields].sort((a, b) => (a.order || 0) - (b.order || 0));
      b = `<section class="card"><div class="card-head"><h2>Custom Fields</h2><button class="btn sm primary" data-act="cfAdd">${ic('plus')} Add Field</button></div>
        ${fl.length ? fl.map((f, i) => `<div class="lrow ${f.hidden ? 'dim' : ''}"><div class="grow"><b>${esc(f.label)}</b><small class="muted"> ${CF_TYPES[f.type]} · ${f.dept === 'both' ? 'Geotechnical & Material' : f.dept === 'geo' ? 'Geotechnical' : 'Material'}${f.required ? ' · Required' : ''}${f.hidden ? ' · Hidden' : ''}</small></div>
          <button class="icon-btn" data-act="cfEdit" data-id="${f.id}">${ic('edit')}</button>
          <button class="icon-btn" data-act="cfHide" data-id="${f.id}">${ic(f.hidden ? 'eyeOff' : 'eye')}</button>
          <button class="icon-btn" data-act="cfMove" data-id="${f.id}" data-d="-1" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button>
          <button class="icon-btn" data-act="cfMove" data-id="${f.id}" data-d="1" ${i === fl.length - 1 ? 'disabled' : ''}>${ic('down')}</button></div>`).join('') : '<div class="empty sm">No custom fields yet</div>'}
        <div class="hint">Renaming or hiding a field never deletes its data. A field can only be deleted while it holds no data.</div></section>`; break;
    }
    case 'tables': b = `
      <section class="card"><h2>Project Cards — Geotechnical</h2>
        ${[['consultant', 'Consultant'], ['owner', 'Owner'], ['location', 'Location'], ['financial', 'Payment progress'], ['dates', 'Status date (Permit / Start / Schedule / Report)']].map(([k, l]) => sChk(`cards.geo.${k}`, l)).join('')}
        <div class="srow"><label>Default sorting</label>${sortSel('geo')}</div></section>
      <section class="card"><h2>Project Cards — Material</h2>
        ${[['owner', 'Owner'], ['consultant', 'Consultant'], ['location', 'Location'], ['floors', 'Building floors'], ['financial', 'Financial summary']].map(([k, l]) => sChk(`cards.mat.${k}`, l)).join('')}
        <div class="srow"><label>Default sorting</label>${sortSel('mat')}</div></section>
      <section class="card"><h2>RV Tracking Table Columns</h2>
        ${S.rvColumns.map((c, i) => `<div class="lrow">${sChk(`rvColumns.${i}.on`, RV_COLUMNS[c.key])}<span class="grow"></span>${upDown('rvColumns', i)}</div>`).join('')}</section>
      <section class="card"><h2>Saved Filters / Views</h2>
        ${S.savedFilters.length ? S.savedFilters.map((f, i) => `<div class="lrow"><input class="inp grow" data-s="savedFilters.${i}.name" value="${esc(f.name)}"><small class="muted">${f.dept === 'geo' ? 'Geo' : 'Material'}</small><button class="icon-btn" data-act="sfDel" data-i="${i}">${ic('trash')}</button></div>`).join('') : '<div class="empty sm">Use “Save view” on any status list</div>'}</section>`; break;
    case 'financial': b = `
      <section class="card"><h2>Financial Display</h2>
        <div class="srow"><label>Default Currency</label>${sIn('currency', 'maxlength="6"')}</div>
        <div class="srow"><label>Decimal Precision</label><select class="sel" data-s="decimals" data-type="int">${[0, 1, 2, 3].map(n => `<option ${S.decimals === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="srow"><label>Number Format</label><select class="sel" data-s="numberFormat">${[['en', '1,234.56'], ['plain', '1234.56'], ['space', '1 234.56'], ['eu', '1.234,56']].map(([k, l]) => `<option value="${k}" ${S.numberFormat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="srow"><label>Date Format</label><select class="sel" data-s="dateFormat">${['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD MMM YYYY'].map(k => `<option ${S.dateFormat === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="hint">Display preferences never change stored transaction values. Preview: <b>${fmtMoney(1234567.891)}</b> · <b>${fmtDate(todayISO())}</b></div></section>
      <section class="card"><h2>Lists</h2>
        <div class="srow col"><label>Payment Descriptions (one per line)</label><textarea class="inp" rows="5" data-s="paymentDescriptions" data-type="lines">${esc(S.paymentDescriptions.join('\n'))}</textarea></div>
        <div class="srow col"><label>Additional Payment Categories (one per line)</label><textarea class="inp" rows="3" data-s="paymentCategories" data-type="lines">${esc(S.paymentCategories.join('\n'))}</textarea></div>
        <div class="srow col"><label>Transfer Methods (one per line)</label><textarea class="inp" rows="4" data-s="transferMethods" data-type="lines">${esc(S.transferMethods.join('\n'))}</textarea></div></section>`; break;
    case 'security': {
      const sec = S.security;
      b = `<section class="card"><h2>App Lock</h2>
        ${sec.enabled ? `<div class="banner ok">${ic('lock')}<div>App lock is <b>ON</b>. The app asks for your PIN when opened.</div></div>
          <div class="srow"><label>Auto-lock after inactivity</label><select class="sel" data-s="security.autoLockMin" data-type="int">${[1, 2, 5, 10, 15, 30, 60].map(n => `<option value="${n}" ${sec.autoLockMin === n ? 'selected' : ''}>${n} min</option>`).join('')}</select></div>
          <div class="row-actions"><button class="btn" data-act="lockNow">${ic('lock')} Lock now</button><button class="btn" data-act="pinSet">Change PIN</button><button class="btn ghost danger-t" data-act="pinOff">Turn off</button></div>`
        : `<p class="muted">Protect the app with a PIN. You will get a recovery code in case you forget it.</p><button class="btn primary" data-act="pinSet">${ic('lock')} Set PIN</button>`}
        <div class="hint">Your data is stored only on this phone and is never sent to any server or public link. The PIN stops other people opening the app; for full protection also keep your phone's screen lock on.</div></section>`; break;
    }
    case 'sbackup': b = `
      <section class="card"><h2>Settings Backup</h2>
        <div class="row-actions col">
          <button class="btn" data-act="sExport" data-part="all">${ic('download')} Export Settings</button>
          <button class="btn" data-act="sImport">${ic('upload')} Import Settings</button>
          <button class="btn" data-act="sExport" data-part="fields">${ic('download')} Backup Custom Fields</button>
          <button class="btn" data-act="sExport" data-part="statuses">${ic('download')} Backup Custom Statuses</button>
          <button class="btn" data-act="sExport" data-part="appearance">${ic('download')} Backup Appearance Preferences</button>
          <button class="btn ghost danger-t" data-act="sReset">${ic('refresh')} Restore Default Settings</button>
        </div>
        <input type="file" id="sImportInput" accept=".json,application/json" hidden>
        <div class="hint">Restoring default settings never deletes projects, payments or RV records. Custom field data stays saved and reappears when the field is re-added from a settings backup.</div></section>`; break;
  }
  return `<div class="page-head"><h1>${ic(navDef('settings').icon)} ${esc(navDef('settings').label)}</h1></div>
    <div class="tabs scroll">${SET_TABS.map(([k, l]) => `<button class="tab ${setTab === k ? 'on' : ''}" data-act="setTab" data-t="${k}">${l}</button>`).join('')}</div>${b}
    <div class="muted small center">Version ${APP_VERSION}</div>`;
}
function sortSel(dept) {
  const o = dept === 'geo' ? [['updated', 'Last updated'], ['gsi', 'GSI Number'], ['created', 'Newest first'], ['remaining', 'Highest remaining'], ['consultant', 'Consultant'], ['date', 'Status date']] : [['updated', 'Last updated'], ['ref', 'Project Number'], ['created', 'Newest first'], ['remaining', 'Highest remaining'], ['consultant', 'Consultant']];
  return `<select class="sel" data-s="sort.${dept}">${o.map(([k, l]) => `<option value="${k}" ${S.sort[dept] === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
function statusEditor(dept, title) {
  const key = dept === 'geo' ? 'geoStatuses' : 'matStatuses';
  const list = S[key];
  const projects = dept === 'geo' ? D.geo : D.mat;
  return `<section class="card"><div class="card-head"><h2>${title}</h2><button class="btn sm" data-act="stAdd" data-dept="${dept}">${ic('plus')} Custom Status</button></div>
    ${list.map((s, i) => `<div class="lrow wrap"><button class="icon-pick" data-act="pickIcon" data-path="${key}.${i}.icon" style="color:${esc(s.color)}">${ic(s.icon || 'circle')}</button>
      <input class="inp grow" data-s="${key}.${i}.label" value="${esc(s.label)}">
      <input type="color" class="swatch" data-s="${key}.${i}.color" value="${esc(s.color)}">
      ${s.core ? `<span class="pill sm" title="${esc((GEO_CORE.concat(MAT_CORE)).find(c => c.key === s.key)?.label || '')}">core</span>` : `<button class="icon-btn" data-act="stEdit" data-dept="${dept}" data-i="${i}">${ic('edit')}</button><button class="icon-btn" data-act="stDel" data-dept="${dept}" data-i="${i}" ${projects.some(p => p.status === s.key) ? 'disabled title="In use"' : ''}>${ic('trash')}</button>`}
      ${upDown(key, i)}</div>`).join('')}
    <div class="hint">Core statuses can be renamed and recolored; their rules stay the same.</div></section>`;
}
function bindSettings() {
  $$('[data-s]').forEach(el => {
    const ev = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text') || (el.tagName === 'INPUT' && !el.type) || el.classList.contains('inp') ? 'change' : (el.type === 'color' ? 'change' : 'change');
    el.addEventListener(ev, () => {
      const t = el.dataset.type;
      let v = t === 'bool' ? el.checked : t === 'int' ? parseInt(el.value, 10) : t === 'lines' ? el.value.split('\n').map(x => x.trim()).filter(Boolean) : el.value;
      if (typeof v === 'string' && el.classList.contains('inp') && !v.trim() && /label|appName|shortName|name/.test(el.dataset.s)) { toast('Cannot be empty', 'warn'); el.value = getPath(S, el.dataset.s) ?? ''; return; }
      setPath(S, el.dataset.s, v);
      save(); applyTheme(); renderShell(); refreshDatalists();
      if (t === 'bool' || el.tagName === 'SELECT' || el.type === 'color') render();
    });
  });
  const si = $('#sImportInput');
  if (si) si.onchange = async () => { const f = si.files[0]; si.value = ''; if (f) importSettingsFile(f); };
}
ACT.setTab = el => { setTab = el.dataset.t; render(); };
ACT.sSet = el => { S[el.dataset.k] = el.dataset.v; save(); applyTheme(); renderShell(); render(); };
ACT.sToggle = el => { setPath(S, el.dataset.path, !getPath(S, el.dataset.path)); save(); renderShell(); render(); };
ACT.sMove = el => {
  const list = getPath(S, el.dataset.list), i = +el.dataset.i, j = i + (+el.dataset.d);
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]]; save(); renderShell(); render();
};
ACT.pickImg = el => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => { if (!inp.files[0]) return; S[el.dataset.k] = await resizeImage(inp.files[0], el.dataset.k === 'logo' ? 320 : 192); save(); applyTheme(); renderShell(); render(); };
  inp.click();
};
ACT.clearImg = el => { S[el.dataset.k] = null; save(); applyTheme(); renderShell(); render(); };
function chooseIcon(current) {
  return new Promise(res => {
    const w = openModal(`<div class="modal-head"><h3>Choose Icon</h3><button class="icon-btn" data-x>${ic('x')}</button></div>
      <div class="modal-body"><div class="icon-grid">${Object.keys(ICONS).map(k => `<button class="ig ${k === current ? 'on' : ''}" data-k="${k}" title="${k}">${ic(k)}</button>`).join('')}</div></div>`, { wide: true });
    let done = false;
    const finish = (v, fp) => { if (done) return; done = true; closeModal(w, fp).then(() => res(v)); };
    w._dismiss = fp => finish(null, fp);
    $('[data-x]', w).onclick = () => finish(null);
    $$('[data-k]', w).forEach(b => b.onclick = () => finish(b.dataset.k));
  });
}
ACT.pickIcon = async el => { const v = await chooseIcon(getPath(S, el.dataset.path)); if (v) { setPath(S, el.dataset.path, v); save(); renderShell(); render(); } };
ACT.navReset = async () => { if (await confirmDlg('Restore the default menu names, order, icons and colors?')) { S.nav = NAV_DEFAULT.map(n => ({ ...n, color: '', hidden: false })); save(); renderShell(); render(); } };
ACT.scAdd = async () => {
  const targets = [{ v: '#/geo', l: 'Geotechnical' }, ...S.geoStatuses.map(s => ({ v: '#/geo/s/' + s.key, l: 'Geotechnical › ' + s.label })), { v: '#/mat', l: 'Material' }, ...S.matStatuses.map(s => ({ v: '#/mat/s/' + s.key, l: 'Material › ' + s.label })), { v: '#/rv', l: 'RV Tracking' }, { v: '#/stats', l: 'Project Statistics' }, { v: '#/data', l: 'Data Management' }, { v: 'url', l: 'Web link (URL)…' }];
  const v = await formDialog({ title: 'Add Shortcut', fields: [{ name: 'label', label: 'Label', required: true }, { name: 'target', label: 'Opens', type: 'select', options: targets }, { name: 'url', label: 'URL (for web link)', placeholder: 'https://…' }],
    validate: v => v.target === 'url' && !/^https?:\/\//i.test(v.url) ? 'Enter a URL starting with https://' : null });
  if (!v) return;
  const icon = await chooseIcon('link');
  S.shortcuts.push({ id: uid(), label: v.label, target: v.target === 'url' ? v.url : v.target, icon: icon || 'link' });
  save(); renderShell(); render();
};
ACT.scDel = el => { S.shortcuts.splice(+el.dataset.i, 1); save(); renderShell(); render(); };
ACT.sfDel = el => { S.savedFilters.splice(+el.dataset.i, 1); save(); render(); };

/* ---------- statuses ---------- */
function statusFields(dept, s = {}) {
  const f = [{ name: 'label', label: 'Status name', required: true, value: s.label || '' }, { name: 'color', label: 'Color', type: 'color', value: s.color || '#64748b' }];
  if (dept === 'geo') {
    f.push({ name: 'dateLabel', label: 'Ask for a date when entering (optional)', value: s.dateLabel || '', placeholder: 'e.g. Sampling Date' });
    const cfs = S.customFields.filter(x => x.dept !== 'mat');
    if (cfs.length) f.push({ name: 'requiredFields', label: 'Required fields before entering', type: 'multi', value: s.requiredFields || [], options: cfs.map(x => ({ v: x.id, l: x.label })) });
  }
  return f;
}
ACT.stAdd = async el => {
  const dept = el.dataset.dept, key = dept === 'geo' ? 'geoStatuses' : 'matStatuses';
  const v = await formDialog({ title: 'Add Custom Status', fields: [...statusFields(dept), { name: 'after', label: 'Place after', type: 'select', options: S[key].map(s => ({ v: s.key, l: s.label })), value: S[key][0].key }] });
  if (!v) return;
  const s = { key: 'c_' + uid(), label: v.label, color: v.color, icon: 'tag', core: false, dateLabel: v.dateLabel || '', requiredFields: v.requiredFields || [] };
  const idx = S[key].findIndex(x => x.key === v.after);
  S[key].splice(idx + 1, 0, s); save(); render();
};
ACT.stEdit = async el => {
  const dept = el.dataset.dept, key = dept === 'geo' ? 'geoStatuses' : 'matStatuses', s = S[key][+el.dataset.i];
  const v = await formDialog({ title: 'Edit Status', fields: statusFields(dept, s) });
  if (!v) return;
  Object.assign(s, { label: v.label, color: v.color, dateLabel: v.dateLabel || '', requiredFields: v.requiredFields || [] }); save(); render();
};
ACT.stDel = async el => {
  const dept = el.dataset.dept, key = dept === 'geo' ? 'geoStatuses' : 'matStatuses', s = S[key][+el.dataset.i];
  if (!s || s.core) return;
  if ((dept === 'geo' ? D.geo : D.mat).some(p => p.status === s.key)) return alertDlg('Move the projects out of this status first.');
  if (await confirmDlg(`Delete status <b>${esc(s.label)}</b>?`, { danger: true, okText: 'Delete' })) { S[key].splice(+el.dataset.i, 1); save(); render(); }
};

/* ---------- custom fields manager ---------- */
const SAFE_TYPE_CHANGES = { text: ['longtext', 'dropdown'], longtext: ['text'], number: ['currency', 'text'], currency: ['number', 'text'], dropdown: ['text', 'multi'], yesno: ['checkbox'], checkbox: ['yesno'], date: ['text'], multi: [], file: [] };
function cfHasData(f) { return [...D.geo, ...D.mat].some(p => p.custom && p.custom[f.id] !== undefined && p.custom[f.id] !== '' && p.custom[f.id] !== null && !(Array.isArray(p.custom[f.id]) && !p.custom[f.id].length)); }
async function cfForm(f) {
  const hasData = f && cfHasData(f);
  const types = f && hasData ? [f.type, ...SAFE_TYPE_CHANGES[f.type]] : Object.keys(CF_TYPES);
  return formDialog({
    title: f ? 'Edit Field' : 'Add Custom Field', fields: [
      { name: 'label', label: 'Field name', required: true, value: f ? f.label : '' },
      { name: 'type', label: 'Type', type: 'select', options: types.map(t => ({ v: t, l: CF_TYPES[t] })), value: f ? f.type : 'text', hint: hasData ? 'This field has data — only safe type changes are offered.' : '' },
      { name: 'dept', label: 'Department', type: 'select', options: [{ v: 'geo', l: 'Geotechnical' }, { v: 'mat', l: 'Material' }, { v: 'both', l: 'Both' }], value: f ? f.dept : 'geo' },
      { name: 'options', label: 'Choices (for Dropdown / Multiple Selection) — one per line', type: 'textarea', rows: 3, value: f ? (f.options || []).join('\n') : '' },
      { name: 'required', label: 'Required', type: 'checkbox', value: f ? f.required : false },
      ...(f && !hasData ? [{ type: 'html', name: '_d', html: `<button type="button" class="btn sm ghost danger-t" id="cfDelBtn">${ic('trash')} Delete this field (it has no data)</button>` }] : [])
    ],
    validate: v => ['dropdown', 'multi'].includes(v.type) && !v.options.trim() ? 'Add at least one choice.' : null
  });
}
ACT.cfAdd = async () => {
  const v = await cfForm(null); if (!v) return;
  S.customFields.push({ id: 'f' + uid(), label: v.label, type: v.type, dept: v.dept, required: v.required, options: v.options.split('\n').map(x => x.trim()).filter(Boolean), hidden: false, order: S.customFields.length });
  save(); render(); toast('Field added', 'ok');
};
ACT.cfEdit = async el => {
  const f = S.customFields.find(x => x.id === el.dataset.id); if (!f) return;
  setTimeout(() => { const b = $('#cfDelBtn'); if (b) b.onclick = async () => { if (await confirmDlg(`Delete field <b>${esc(f.label)}</b>?`, { danger: true, okText: 'Delete' })) { S.customFields = S.customFields.filter(x => x.id !== f.id); save(); const top = modalStack[modalStack.length - 1]; if (top) top._dismiss(); render(); } }; }, 80);
  const v = await cfForm(f); if (!v || !S.customFields.includes(f)) return;
  Object.assign(f, { label: v.label, type: v.type, dept: v.dept, required: v.required, options: v.options.split('\n').map(x => x.trim()).filter(Boolean) });
  save(); render();
};
ACT.cfHide = el => { const f = S.customFields.find(x => x.id === el.dataset.id); if (f) { f.hidden = !f.hidden; save(); render(); } };
ACT.cfMove = el => {
  const fl = [...S.customFields].sort((a, b) => (a.order || 0) - (b.order || 0));
  const i = fl.findIndex(x => x.id === el.dataset.id), j = i + (+el.dataset.d);
  if (j < 0 || j >= fl.length) return;
  [fl[i], fl[j]] = [fl[j], fl[i]]; fl.forEach((f, k) => f.order = k); save(); render();
};

/* ---------- security (PIN) ---------- */
const hashPin = (pin, salt) => sha256Hex(salt + '|' + pin);
ACT.pinSet = async () => {
  if (S.security.enabled && !(await verifyPinDialog('Enter current PIN'))) return;
  const v = await formDialog({ title: 'Set PIN', intro: 'Use 4 to 8 digits.', fields: [{ name: 'a', label: 'New PIN', type: 'password', numeric: true, required: true }, { name: 'b', label: 'Repeat PIN', type: 'password', numeric: true, required: true }],
    validate: v => !/^\d{4,8}$/.test(v.a) ? 'PIN must be 4 to 8 digits.' : v.a !== v.b ? 'PINs do not match.' : null });
  if (!v) return;
  const salt = uid() + uid();
  const rec = Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 6).toUpperCase()).join('-');
  S.security = { ...S.security, enabled: true, salt, hash: hashPin(v.a, salt), recoveryHash: hashPin(rec, salt) };
  save(); render();
  await alertDlg(`PIN saved. Your recovery code is:<div class="rec-code sel-text">${rec}</div>Write it down somewhere safe. It unlocks the app if you forget the PIN.`, 'Recovery code');
};
ACT.pinOff = async () => { if (await verifyPinDialog('Enter PIN to turn off the lock')) { S.security.enabled = false; S.security.hash = ''; save(); render(); toast('App lock turned off'); } };
async function verifyPinDialog(title) {
  const v = await formDialog({ title, fields: [{ name: 'pin', label: 'PIN or recovery code', type: 'password', required: true }], validate: v => checkPin(v.pin) ? null : 'Wrong PIN.' });
  return !!v;
}
function checkPin(pin) { const s = S.security; return !!pin && (hashPin(pin, s.salt) === s.hash || hashPin(pin.toUpperCase(), s.salt) === s.recoveryHash); }

/* ---------- settings backup ---------- */
ACT.sExport = el => {
  const part = el.dataset.part;
  let payload;
  if (part === 'all') payload = { kind: 'settings', settings: settingsForExport() };
  else if (part === 'fields') payload = { kind: 'settings-part', part, settings: { customFields: S.customFields } };
  else if (part === 'statuses') payload = { kind: 'settings-part', part, settings: { geoStatuses: S.geoStatuses, matStatuses: S.matStatuses, autoUrgent: S.autoUrgent, autoFullyDone: S.autoFullyDone } };
  else payload = { kind: 'settings-part', part, settings: { appName: S.appName, shortName: S.shortName, logo: S.logo, appIcon: S.appIcon, theme: S.theme, accent: S.accent, sidebarStyle: S.sidebarStyle, nav: S.nav, dashboard: S.dashboard, shortcuts: S.shortcuts, cards: S.cards, rvColumns: S.rvColumns } };
  downloadBlob(new Blob([JSON.stringify({ app: 'ML-OPS', schema: SCHEMA, exportedAt: nowISO(), ...payload }, null, 1)], { type: 'application/json' }), `MLOps_Settings-${part}_${fileStamp()}.json`);
  toast('Settings exported', 'ok');
};
ACT.sImport = () => $('#sImportInput').click();
async function importSettingsFile(f) {
  let o; try { o = JSON.parse(await readFileAsText(f)); } catch (e) { return alertDlg('Not a valid JSON file.'); }
  if (o.app !== 'ML-OPS' || !o.settings || typeof o.settings !== 'object') return alertDlg('This file does not contain settings from this app.', 'Invalid file');
  if (!(await confirmDlg(`Import ${o.kind === 'settings-part' ? '<b>' + esc(o.part) + '</b> settings' : 'all settings'} from this file?<br>Projects, payments and RV records are not affected.`))) return;
  const sec = S.security, bk = S.backup;
  S = mergeSettings({ ...(o.kind === 'settings-part' ? S : {}), ...o.settings, security: sec, backup: bk });
  save(); applyTheme(); renderShell(); render(); toast('Settings imported', 'ok');
}
ACT.sReset = async () => {
  if (!(await confirmDlg('Restore all settings to default?<br><br>Projects, payments, RV records and app lock are kept. Custom field definitions are reset (their data stays saved).', { danger: true, okText: 'Restore defaults' }))) return;
  await makeSnapshot('Before settings reset');
  const sec = S.security, bk = S.backup;
  S = defaultSettings(); S.security = sec; S.backup = bk;
  save(); applyTheme(); renderShell(); render(); toast('Default settings restored');
};
