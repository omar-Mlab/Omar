/* =========================================================
   datamgmt.js — Data Management: export, import & restore,
   automatic snapshots, activity history, storage status
   ========================================================= */
'use strict';

let dmTab = 'export';
let storageInfo = null;
async function refreshStorageInfo() {
  try {
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    storageInfo = { persisted, usage: est ? est.usage : null, quota: est ? est.quota : null, snaps: await getSnapshots() };
  } catch (e) { storageInfo = { snaps: [] }; }
}
function viewData() {
  const tabs = [['export', 'Export'], ['import', 'Import & Restore'], ['backup', 'Backups'], ['activity', 'Activity History']];
  const si = storageInfo || { snaps: [] };
  let body = '';
  if (dmTab === 'export') {
    const scopes = [['all', 'All Application Data'], ['geo', 'Geotechnical Projects'], ['mat', 'Material Projects'], ['rv', 'RV Records'], ['fin', 'Financial Records'], ['settings', 'Application Settings']];
    body = `
      <section class="card"><h2>Full Backup</h2>
        <p class="muted">A JSON backup contains everything (projects, payments, RV records, attachments, settings). Keep a copy on Google Drive or email it to yourself every week.</p>
        <div class="row-actions"><button class="btn primary" data-act="backupNow">${ic('download')} Download Full Backup</button><button class="btn" data-act="backupShare">${ic('share')} Share Backup (Drive / WhatsApp)</button></div>
        <div class="muted small">Last downloaded: ${S.backup.lastDownload ? fmtDateTime(S.backup.lastDownload) : 'never'}</div>
      </section>
      ${scopes.map(([k, l]) => `<section class="card exp"><h3>${esc(l)}</h3><div class="fmt-row">${(k === 'settings' ? ['json', 'xlsx', 'pdf'] : ['xlsx', 'csv', 'pdf', 'docx', 'json']).map(f => `<button class="btn sm" data-act="exp" data-scope="${k}" data-f="${f}">${f.toUpperCase()}</button>`).join('')}</div></section>`).join('')}
      <section class="card exp"><h3>Projects by Status</h3>
        <div class="form-grid"><div class="field"><label>Status</label><select id="expStatus" class="sel">
          <optgroup label="Geotechnical">${S.geoStatuses.map(s => `<option value="geo:${s.key}">${esc(s.label)}</option>`).join('')}</optgroup>
          <optgroup label="Material">${S.matStatuses.map(s => `<option value="mat:${s.key}">${esc(s.label)}</option>`).join('')}</optgroup></select></div></div>
        <div class="fmt-row">${['xlsx', 'csv', 'pdf', 'docx', 'json'].map(f => `<button class="btn sm" data-act="expStatus" data-f="${f}">${f.toUpperCase()}</button>`).join('')}</div></section>
      <div class="muted small">Individual projects: open the project → More → Export. PDF opens the print screen — choose “Save as PDF”.</div>`;
  } else if (dmTab === 'import') {
    body = `
      <section class="card"><h2>Import a Backup File</h2>
        <p class="muted">Choose a JSON backup exported from this app. The file is checked first, and nothing is overwritten without your confirmation. A safety snapshot is taken before any change.</p>
        <button class="btn primary" data-act="importFile">${ic('upload')} Choose Backup File…</button>
        <input type="file" id="importInput" accept=".json,application/json" hidden>
        <ul class="muted small"><li>Merge — adds only new projects (duplicates are skipped)</li><li>Restore Full Application Data / one department</li><li>Restore RV Records</li><li>Import Application Settings</li></ul>
      </section>`;
  } else if (dmTab === 'backup') {
    body = `
      <section class="card"><h2>Storage on this phone</h2>
        ${kv('Database', idb ? 'IndexedDB (device database)' : 'Browser storage')}
        ${kv('Protected from automatic clearing', si.persisted === true ? '<span class="okc">Yes</span>' : si.persisted === false ? '<span class="warnc">Not yet — install the app to the home screen</span>' : 'Unknown')}
        ${si.usage != null ? kv('Space used', fmtSize(si.usage) + (si.quota ? ' of ' + fmtSize(si.quota) : '')) : ''}
        ${kv('Projects', `${D.geo.length} Geotechnical · ${D.mat.length} Material`)}
        ${kv('Last saved', lastSavedAt ? fmtDateTime(lastSavedAt.toISOString()) : '—')}
      </section>
      <section class="card"><h2>Backup Schedule</h2>
        ${kv('Daily automatic backup', 'On — a snapshot is kept inside the app every day (last 10 kept)')}
        ${kv('Weekly manual download', S.backup.lastDownload ? 'Last: ' + fmtDate(S.backup.lastDownload) : '<span class="warnc">Never</span>')}
        ${kv('Before major changes', 'Automatic snapshot before every import / restore')}
        <div class="row-actions"><button class="btn" data-act="snapNow">${ic('refresh')} Take snapshot now</button><button class="btn primary" data-act="backupNow">${ic('download')} Download Full Backup</button></div>
      </section>
      <section class="card"><h2>Internal Snapshots <small>${si.snaps.length}</small></h2>
        ${si.snaps.length ? si.snaps.map(s => `<div class="snap"><div><b>${fmtDateTime(s.at)}</b><small>${esc(s.reason)} · ${s.geo} Geo · ${s.mat} Material</small></div>
          <button class="btn sm" data-act="snapDownload" data-sid="${s.id}">${ic('download')}</button><button class="btn sm" data-act="snapRestore" data-sid="${s.id}">Restore</button></div>`).join('') : '<div class="empty sm">No snapshots yet</div>'}
        <div class="muted small">Snapshots live on this phone only. They protect against mistakes, not against losing the phone — download backups too.</div>
      </section>`;
  } else {
    const acts = D.activity.slice(0, 400);
    body = `
      <section class="card"><h2>Activity History <small>${D.activity.length}</small></h2>
        <div class="searchbar">${ic('search')}<input id="actQ" type="search" placeholder="Filter (GSI, type, text)…"></div>
        <div id="actList">${actRows(acts)}</div></section>
      <section class="card"><h2>Deletion Log <small>${D.deleted.length}</small></h2>
        ${D.deleted.length ? D.deleted.map(d => `<div class="hist"><b>${fmtDateTime(d.at)}</b> — ${d.dept === 'geo' ? 'Geotechnical' : 'Material'} <b>${esc(d.ref)}</b> (${esc(d.status)})${d.total != null ? ' · Total ' + fmtMoney(d.total) : ''}${d.received != null ? ' · Received ' + fmtMoney(d.received) : ''}</div>`).join('') : '<div class="empty sm">No deletions</div>'}</section>`;
  }
  return `<div class="page-head"><h1>${ic(navDef('data').icon)} ${esc(navDef('data').label)}</h1></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${dmTab === k ? 'on' : ''}" data-act="dmTab" data-t="${k}">${l}</button>`).join('')}</div>${body}`;
}
function actRows(list) {
  return list.length ? list.map(a => `<div class="hist"><b>${fmtDateTime(a.at)}</b> ${a.ref ? `<a href="#/${a.dept}/p/${a.pid}">${esc(a.ref)}</a>` : ''} <span class="pill sm">${esc(a.type)}</span> ${esc(a.text)}</div>`).join('') : '<div class="empty sm">No activity</div>';
}
function bindData() {
  const q = $('#actQ');
  if (q) q.oninput = () => { const t = norm(q.value); $('#actList').innerHTML = actRows(D.activity.filter(a => !t || norm(a.ref + ' ' + a.type + ' ' + a.text).includes(t)).slice(0, 400)); };
  const inp = $('#importInput');
  if (inp) inp.onchange = () => { if (inp.files[0]) handleImport(inp.files[0]); inp.value = ''; };
}
ACT.dmTab = async el => { dmTab = el.dataset.t; if (dmTab === 'backup') await refreshStorageInfo(); render(); };
ACT.exp = el => exportScope(el.dataset.scope, el.dataset.f);
ACT.expStatus = el => { const [dept, status] = $('#expStatus').value.split(':'); exportScope(dept + '-status', el.dataset.f, { status }); };
ACT.backupNow = () => exportScope('all', 'json');
ACT.backupShare = async () => {
  const blob = new Blob([JSON.stringify({ app: 'ML-OPS', schema: SCHEMA, exportedAt: nowISO(), kind: 'full-backup', data: D, settings: settingsForExport() })], { type: 'application/json' });
  const name = `MLOps_All-Data_${fileStamp()}.json`;
  if (await shareBlob(blob, name, 'ML Ops backup')) { S.backup.lastDownload = nowISO(); save(); toast('Backup shared', 'ok'); }
  else { downloadBlob(blob, name); S.backup.lastDownload = nowISO(); save(); toast('Sharing not available — file downloaded instead'); }
};
ACT.snapNow = async () => { await makeSnapshot('Manual snapshot'); await refreshStorageInfo(); render(); toast('Snapshot saved', 'ok'); };
ACT.snapDownload = async el => {
  const s = (await getSnapshots()).find(x => x.id === el.dataset.sid); if (!s) return;
  const o = JSON.parse(s.json);
  downloadBlob(new Blob([JSON.stringify({ app: 'ML-OPS', schema: SCHEMA, exportedAt: s.at, kind: 'full-backup', data: o.data, settings: o.settings })], { type: 'application/json' }), `MLOps_Snapshot_${s.at.slice(0, 10)}.json`);
};
ACT.snapRestore = async el => {
  const s = (await getSnapshots()).find(x => x.id === el.dataset.sid); if (!s) return;
  if (!(await confirmDlg(`Restore the snapshot from <b>${fmtDateTime(s.at)}</b> (${s.geo} Geo, ${s.mat} Material)?<br><br>Current data will be replaced. A snapshot of the current data is taken first.`, { danger: true, okText: 'Restore snapshot' }))) return;
  await makeSnapshot('Before snapshot restore');
  const o = JSON.parse(s.json);
  D = o.data; ['geo', 'mat', 'activity', 'recent', 'deleted'].forEach(k => { if (!Array.isArray(D[k])) D[k] = []; });
  D.geo.forEach(normalizeGeo); D.mat.forEach(normalizeMat);
  const sec = S.security, bk = S.backup;
  S = mergeSettings({ ...o.settings, security: sec, backup: bk });
  logAct('', null, 'restore', 'Snapshot restored: ' + fmtDateTime(s.at));
  save(); applyTheme(); renderShell(); await refreshStorageInfo(); render(); toast('Snapshot restored', 'ok');
};

/* ---------- import & restore ---------- */
ACT.importFile = () => $('#importInput').click();
function validateBackup(o) {
  const errors = [];
  if (!o || typeof o !== 'object') return { errors: ['Not a valid JSON object'] };
  if (o.app !== 'ML-OPS') errors.push('This file was not exported from this app.');
  const data = o.data || {};
  const geo = Array.isArray(data.geo) ? data.geo : [];
  const mat = Array.isArray(data.mat) ? data.mat : [];
  const rv = Array.isArray(o.records) ? o.records : geo.filter(p => p.transfer).map(p => ({ id: p.id, gsi: p.gsi, transfer: p.transfer, rvHistory: p.rvHistory || [] }));
  geo.forEach((p, i) => {
    if (!p || typeof p.id !== 'string' || typeof p.gsi !== 'string' || !p.gsi.trim()) errors.push(`Geotechnical record #${i + 1}: missing ID or GSI Number`);
    else if (p.payments && !Array.isArray(p.payments)) errors.push(`${p.gsi}: invalid payments`);
    else if ((p.payments || []).some(x => !isFinite(Number(x.amount)))) errors.push(`${p.gsi}: invalid payment amount`);
  });
  mat.forEach((p, i) => { if (!p || typeof p.id !== 'string' || typeof p.ref !== 'string') errors.push(`Material record #${i + 1}: missing ID or Project Number`); });
  const dupG = geo.map(p => norm(p.gsi)).filter((g, i, a) => a.indexOf(g) !== i);
  if (dupG.length) errors.push('Duplicate GSI Numbers inside the file: ' + [...new Set(dupG)].join(', '));
  return { errors, kind: o.kind, geo, mat, rv, settings: o.settings || null, full: o.kind === 'full-backup', exportedAt: o.exportedAt, raw: o };
}
async function handleImport(file) {
  let o;
  try { o = JSON.parse(await readFileAsText(file)); } catch (e) { return alertDlg('This file is not a valid JSON backup.', 'Import failed'); }
  const b = validateBackup(o);
  if (b.errors.length) return alertDlg(`The file failed validation — nothing was imported:<ul>${b.errors.slice(0, 12).map(e => `<li>${esc(e)}</li>`).join('')}</ul>`, 'Invalid backup');
  const newGeo = b.geo.filter(p => !geoById(p.id) && !gsiTaken(p.gsi));
  const newMat = b.mat.filter(p => !matById(p.id) && !refTaken(p.ref));
  const items = [];
  if (b.geo.length || b.mat.length) items.push({ value: 'merge', label: 'Merge — add new projects only', icon: 'plus', hint: `${newGeo.length} new Geo, ${newMat.length} new Material · ${b.geo.length - newGeo.length + b.mat.length - newMat.length} duplicates skipped` });
  if (b.full) items.push({ value: 'full', label: 'Restore Full Application Data', icon: 'refresh', danger: true, hint: `Replaces everything with this backup (${b.geo.length} Geo, ${b.mat.length} Material)` });
  if (b.geo.length) items.push({ value: 'geo', label: 'Restore Geotechnical data only', icon: 'layers', hint: `Replaces Geotechnical projects (${b.geo.length})` });
  if (b.mat.length) items.push({ value: 'mat', label: 'Restore Material data only', icon: 'flask', hint: `Replaces Material projects (${b.mat.length})` });
  if (b.rv.length) items.push({ value: 'rv', label: 'Restore RV Records', icon: 'receipt', hint: `${b.rv.length} RV record(s) — attaches missing RV records to matching projects` });
  if (b.settings) items.push({ value: 'settings', label: 'Import Application Settings', icon: 'sliders', hint: 'Appearance, statuses, custom fields… (projects untouched)' });
  if (!items.length) return alertDlg('The file contains no data to import.', 'Nothing to import');
  const choice = await chooseDlg('Import Backup', items, { subtitle: `File checked ✓ · exported ${b.exportedAt ? fmtDateTime(b.exportedAt) : 'unknown date'}` });
  if (!choice) return;
  const ok = choice === 'merge' ? true : await confirmDlg({ full: 'Replace <b>all</b> current data and settings with this backup?', geo: 'Replace <b>all Geotechnical projects</b> with the ones in this backup?', mat: 'Replace <b>all Material projects</b> with the ones in this backup?', rv: 'Attach RV records from the backup to projects that do not have one? Existing RV records are never overwritten.', settings: 'Replace your settings with the ones in this file? Projects, payments and RV records are not affected.' }[choice] + '<br><br>A safety snapshot of the current data is taken first.', { danger: choice !== 'rv', okText: 'Continue' });
  if (!ok) return;
  await makeSnapshot('Before import (' + choice + ')');
  let msg = '';
  if (choice === 'merge') {
    newGeo.forEach(p => { normalizeGeo(p); const seen = new Set(); p.payments = p.payments.filter(x => { const k = x.id || (x.date + '|' + x.amount); if (seen.has(k)) return false; seen.add(k); return true; }); D.geo.push(p); });
    newMat.forEach(p => D.mat.push(normalizeMat(p)));
    msg = `${newGeo.length} Geotechnical and ${newMat.length} Material project(s) added.`;
  } else if (choice === 'full') {
    D = { ...emptyData(), ...b.raw.data }; ['geo', 'mat', 'activity', 'recent', 'deleted'].forEach(k => { if (!Array.isArray(D[k])) D[k] = []; });
    D.geo.forEach(normalizeGeo); D.mat.forEach(normalizeMat);
    if (b.settings) S = mergeSettings({ ...b.settings, security: S.security, backup: S.backup });
    msg = 'Full data restored.';
  } else if (choice === 'geo') { D.geo = b.geo.map(normalizeGeo); msg = `${D.geo.length} Geotechnical project(s) restored.`; }
  else if (choice === 'mat') { D.mat = b.mat.map(normalizeMat); msg = `${D.mat.length} Material project(s) restored.`; }
  else if (choice === 'rv') {
    let att = 0, same = 0, conflict = 0, nf = 0;
    b.rv.forEach(r => {
      const p = geoById(r.id) || D.geo.find(x => norm(x.gsi) === norm(r.gsi));
      if (!p) { nf++; return; }
      if (!p.transfer) { p.transfer = r.transfer; p.rvHistory = [...(r.rvHistory || []), { at: nowISO(), action: 'restored from backup', changes: [] }]; logAct('geo', p, 'rv-restore', 'RV record restored from backup' + (r.transfer.rv ? ': ' + r.transfer.rv : '')); att++; }
      else if (norm(p.transfer.rv) === norm(r.transfer.rv)) same++; else conflict++;
    });
    msg = `${att} RV record(s) attached · ${same} already present · ${conflict} kept (different RV already registered) · ${nf} project(s) not found.`;
  } else if (choice === 'settings') { S = mergeSettings({ ...b.settings, security: S.security, backup: S.backup }); msg = 'Settings imported.'; }
  logAct('', null, 'import', 'Import: ' + msg);
  save(); applyTheme(); renderShell(); refreshDatalists(); render();
  alertDlg(esc(msg), 'Import complete');
}
