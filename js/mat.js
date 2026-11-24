/* =========================================================
   mat.js — Material department (lightweight)
   quotations, floors calculation, Lab M, transfers
   ========================================================= */
'use strict';

const matFloors = p => (p.basement ? 1 : 0) + (p.ground ? 1 : 0) + (Number(p.floors) || 0) + (p.roof ? 1 : 0);
function matFloorsText(p) {
  const parts = [];
  if (p.basement) parts.push('Basement');
  if (p.ground) parts.push('Ground');
  const n = Number(p.floors) || 0;
  if (n) parts.push(`${n} Floor${n === 1 ? '' : 's'}`);
  if (p.roof) parts.push('Roof');
  const t = matFloors(p);
  return parts.length ? `${parts.join(' + ')} — Total: ${t} Floor${t === 1 ? '' : 's'}` : '—';
}
const matRemC = p => toCents(p.total) - toCents(p.labM);
const matRemaining = p => fromCents(matRemC(p));
const matLabel = k => statusDef('mat', k).label;
const matPos = k => S.matStatuses.findIndex(s => s.key === k);
const refTaken = (ref, exceptId) => D.mat.find(p => p.id !== exceptId && norm(p.ref) === norm(ref));

function matFields(p = {}) {
  return [
    { name: 'ref', label: 'Project Number / Reference', required: true, value: p.ref || '' },
    { name: 'owner', label: 'Owner Name', list: 'dl-owner', value: p.owner || '' },
    { name: 'consultant', label: 'Consultant Name', list: 'dl-consultant', value: p.consultant || '' },
    { name: 'location', label: 'Location', list: 'dl-location', value: p.location || '' },
    { name: 'cores', label: 'Number of Cores', type: 'int', value: p.cores ?? '' },
    { name: 'basement', label: 'Basement', type: 'yesno', value: p.basement ?? null },
    { name: 'ground', label: 'Ground Floor', type: 'yesno', value: p.ground ?? null },
    { name: 'floors', label: 'Additional Floors', type: 'int', value: p.floors ?? '' },
    { name: 'roof', label: 'Roof', type: 'yesno', value: p.roof ?? null },
    { type: 'html', name: '_fl', html: '<div id="floorCalc" class="calc-box"></div>' },
    { name: 'total', label: 'Total Payment', type: 'money', value: p.total ?? '' },
    { name: 'labM', label: 'Lab M', type: 'money', value: p.labM ?? '' },
    { type: 'html', name: '_rem', html: '<div id="remCalc" class="calc-box"></div>' },
    ...customFieldSpecs('mat', p)
  ];
}
function matLiveCalc(form) {
  const yes = n => $(`[name=${n}]`, form).value === 'yes';
  const tmp = { basement: yes('basement'), ground: yes('ground'), floors: parseInt($('[name=floors]', form).value, 10) || 0, roof: yes('roof') };
  $('#floorCalc', form).innerHTML = `${ic('layers')} ${esc(matFloorsText(tmp))}`;
  const tot = parseNum($('[name=total]', form).value) || 0, lab = parseNum($('[name=labM]', form).value) || 0;
  $('#remCalc', form).innerHTML = `Remaining = Total Payment − Lab M = <b>${fmtMoney(fromCents(toCents(tot) - toCents(lab)))}</b>`;
}
function applyMat(p, v) {
  ['ref', 'owner', 'consultant', 'location'].forEach(k => p[k] = v[k]);
  p.cores = v.cores; p.basement = !!v.basement; p.ground = !!v.ground; p.floors = v.floors || 0; p.roof = !!v.roof;
  p.total = v.total || 0; p.labM = v.labM || 0;
}

ACT.matAdd = async () => {
  const v = await formDialog({
    title: '+ Add New Material Project', wide: true, okText: 'Create', fields: [...matFields(), { name: 'status', label: 'Status', type: 'select', value: 'quoted', options: S.matStatuses.filter(s => s.key !== 'finished').map(s => ({ v: s.key, l: s.label })) }],
    onChange: matLiveCalc,
    validate: v => refTaken(v.ref) ? `Project Number <b>${esc(v.ref)}</b> already exists.` : null
  });
  if (!v) return;
  const p = normalizeMat({ id: uid(), status: v.status || 'quoted', favorite: false, archived: false, createdAt: nowISO(), updatedAt: nowISO() });
  applyMat(p, v);
  await applyCustomValues('mat', p, v);
  p.statusHistory.push({ from: null, to: p.status, at: nowISO(), reason: 'Created' });
  D.mat.push(p);
  logAct('mat', p, 'create', 'Material project created');
  save(); refreshDatalists(); toast('Material project created', 'ok');
  nav('#/mat/p/' + p.id);
};
ACT.matEdit = async el => {
  const p = matById(el.dataset.id); if (!p) return;
  const v = await formDialog({ title: 'Edit Material Project', wide: true, fields: matFields(p), onChange: matLiveCalc, validate: v => refTaken(v.ref, p.id) ? `Project Number <b>${esc(v.ref)}</b> already exists.` : null });
  if (!v) return;
  const before = JSON.stringify([p.ref, p.owner, p.consultant, p.location, p.cores, p.basement, p.ground, p.floors, p.roof, p.total, p.labM]);
  applyMat(p, v);
  await applyCustomValues('mat', p, v);
  if (before !== JSON.stringify([p.ref, p.owner, p.consultant, p.location, p.cores, p.basement, p.ground, p.floors, p.roof, p.total, p.labM])) logAct('mat', p, 'edit', 'Project details edited');
  p.updatedAt = nowISO(); save(); refreshDatalists(); render(); toast('Saved', 'ok');
};
ACT.matApproved = async el => {
  const p = matById(el.dataset.id); if (!p) return;
  const a = p.approved;
  const st = ['Pending', 'Received'];
  const v = await formDialog({
    title: 'Approved — Payments', fields: [
      { name: 'p1Amount', label: 'First Payment Amount', type: 'money', value: a.p1Amount ?? '' },
      { name: 'p1Status', label: 'First Payment Status', type: 'select', options: st, value: a.p1Status || 'Pending' },
      { name: 'p2Amount', label: 'Second Payment Amount', type: 'money', value: a.p2Amount ?? '' },
      { name: 'p2Status', label: 'Second Payment Status', type: 'select', options: st, value: a.p2Status || 'Pending' },
      { name: 'labStatus', label: 'Laboratory Transfer Status', type: 'select', options: ['Pending', 'Partial', 'Transferred'], value: a.labStatus || 'Pending' }
    ]
  });
  if (!v) return;
  p.approved = { ...a, ...v };
  logAct('mat', p, 'payment', `Approved payments updated — 1st ${v.p1Amount !== null ? fmtMoney(v.p1Amount) : '—'} (${v.p1Status}), 2nd ${v.p2Amount !== null ? fmtMoney(v.p2Amount) : '—'} (${v.p2Status}), Lab transfer: ${v.labStatus}`);
  p.updatedAt = nowISO(); save(); render();
};
async function matTransferForm(p) {
  const t = p.transfer || {};
  const v = await formDialog({
    title: 'Laboratory Transfer — ' + p.ref, okText: 'Save Transfer', fields: [
      { name: 'date', label: 'Transfer Date', type: 'date', required: true, value: t.date || todayISO() },
      { name: 'amount', label: 'Transfer Amount', type: 'money', required: true, value: t.amount ?? (p.labM || '') },
      { name: 'ref', label: 'Transfer Reference (optional)', value: t.ref || '' },
      { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2, value: t.note || '' }
    ]
  });
  if (!v) return false;
  p.transfer = { ...t, ...v, updatedAt: nowISO() };
  logAct('mat', p, 'transfer', `Transfer ${t.date ? 'edited' : 'registered'}: ${fmtMoney(v.amount)} on ${fmtDate(v.date)}${v.ref ? ' — Ref ' + v.ref : ''}`);
  return true;
}
ACT.matTransfer = async el => { const p = matById(el.dataset.id); if (p && await matTransferForm(p)) { p.updatedAt = nowISO(); save(); render(); } };
async function matChangeStatus(p, to) {
  if (!p || to === p.status) return false;
  if (to === 'finished' && !(await matTransferForm(p))) return false;
  const from = p.status;
  p.status = to;
  p.statusHistory.push({ from, to, at: nowISO() });
  logAct('mat', p, 'status', `Status: ${matLabel(from)} → ${matLabel(to)}`);
  p.updatedAt = nowISO(); save();
  if (to === 'approved' && !p.approved.p1Status) setTimeout(() => ACT.matApproved({ dataset: { id: p.id } }), 50);
  toast(`${p.ref} → ${matLabel(to)}`, 'ok');
  return true;
}
ACT.matStatus = async el => {
  const p = matById(el.dataset.id); if (!p) return;
  const to = await chooseDlg('Change Status — ' + p.ref, S.matStatuses.map(s => ({ value: s.key, label: s.label, color: s.color, disabled: s.key === p.status, hint: s.key === p.status ? 'Current status' : s.key === 'finished' ? 'Asks for transfer details' : '' })));
  if (to && await matChangeStatus(p, to)) render();
};
ACT.matNext = async el => { const p = matById(el.dataset.id); const nx = p && S.matStatuses[matPos(p.status) + 1]; if (nx && await matChangeStatus(p, nx.key)) render(); };
ACT.matArchive = async el => {
  const p = matById(el.dataset.id); if (!p) return;
  p.archived = !p.archived; logAct('mat', p, 'archive', p.archived ? 'Archived' : 'Restored from archive'); save(); render();
};
ACT.matDelete = async el => {
  const p = matById(el.dataset.id); if (!p) return;
  if (p.status === 'finished' || p.transfer) { await alertDlg('Finished projects or projects with a laboratory transfer cannot be deleted. Use Archive instead.', 'Deletion not allowed'); return; }
  if (!(await confirmDlg(`Permanently delete <b>${esc(p.ref)}</b>?`, { danger: true, okText: 'Delete permanently' }))) return;
  D.deleted.unshift({ at: nowISO(), dept: 'mat', ref: p.ref, status: matLabel(p.status), total: p.total });
  logAct('mat', p, 'delete', 'Material project deleted');
  D.mat = D.mat.filter(x => x.id !== p.id); D.recent = D.recent.filter(r => r.id !== p.id);
  save(); toast('Deleted'); nav('#/mat');
};

function matText(p) {
  const L = [`*${p.ref}*  —  ${matLabel(p.status)}${p.archived ? ' (Archived)' : ''}`];
  if (p.owner) L.push(`Owner: ${p.owner}`);
  if (p.consultant) L.push(`Consultant: ${p.consultant}`);
  if (p.location) L.push(`Location: ${p.location}`);
  if (p.cores !== null && p.cores !== undefined && p.cores !== '') L.push(`Number of Cores: ${p.cores}`);
  L.push(`Building: ${matFloorsText(p)}`);
  L.push(`Total Payment: ${fmtMoney(p.total)}`);
  L.push(`Lab M: ${fmtMoney(p.labM)}`);
  L.push(`Remaining: ${fmtMoney(matRemaining(p))}`);
  const a = p.approved;
  if (a.p1Amount != null || a.p2Amount != null) L.push(`1st Payment: ${a.p1Amount != null ? fmtMoney(a.p1Amount) : '—'} (${a.p1Status || 'Pending'}) | 2nd Payment: ${a.p2Amount != null ? fmtMoney(a.p2Amount) : '—'} (${a.p2Status || 'Pending'}) | Lab Transfer: ${a.labStatus || 'Pending'}`);
  if (p.transfer) L.push(`Transfer: ${fmtDate(p.transfer.date)} — ${fmtMoney(p.transfer.amount)}${p.transfer.ref ? ' — Ref ' + p.transfer.ref : ''}`);
  customFieldsFor('mat').forEach(cf => { const s = customValueText(cf, p.custom[cf.id]); if (s && cf.type !== 'file') L.push(`${cf.label}: ${s}`); });
  return L.join('\n');
}
ACT.matCopy = async el => { const p = matById(el.dataset.id); if (p && await copyText(matText(p))) toast('Copied', 'ok'); };
ACT.matShare = async el => { const p = matById(el.dataset.id); if (p && !(await shareText(matText(p), p.ref))) { await copyText(matText(p)); toast('Copied'); } };
ACT.matCopyStatus = async el => {
  const key = el.dataset.status;
  const list = matSorted(D.mat.filter(p => key === 'archived' ? p.archived : (p.status === key && !p.archived)));
  if (!list.length) return toast('No projects in this list');
  if (await copyText(listText(key === 'archived' ? 'Archived Material' : 'Material — ' + matLabel(key), list, matText))) toast(`${list.length} copied`, 'ok');
};

function matSorted(list, mode = S.sort.mat) {
  const l = [...list];
  if (mode === 'ref') l.sort((a, b) => String(a.ref).localeCompare(String(b.ref), undefined, { numeric: true }));
  else if (mode === 'created') l.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  else if (mode === 'remaining') l.sort((a, b) => matRemC(b) - matRemC(a));
  else if (mode === 'consultant') l.sort((a, b) => norm(a.consultant).localeCompare(norm(b.consultant)));
  else l.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return l;
}
function matMatch(p, q) {
  if (!q) return true;
  const hay = [p.ref, p.owner, p.consultant, p.location, p.transfer && p.transfer.ref].map(norm).join(' | ');
  return norm(q).split(/\s+/).every(t => hay.includes(t));
}
function matCard(p) {
  const c = S.cards.mat;
  return `<div class="pcard ${p.archived ? 'archived' : ''}" data-act="openMat" data-id="${p.id}" style="--c:${esc(statusDef('mat', p.status).color)}">
    <div class="pc-top"><div class="pc-id">${esc(p.ref)}</div><button class="star ${p.favorite ? 'on' : ''}" data-act="fav" data-dept="mat" data-id="${p.id}">${ic('star')}</button></div>
    <div class="pc-meta">${badge('mat', p.status)}<span class="pill">Material</span>${p.archived ? '<span class="pill">Archived</span>' : ''}</div>
    ${c.owner && p.owner ? `<div class="pc-line">${ic('user')}${esc(p.owner)}</div>` : ''}
    ${c.consultant && p.consultant ? `<div class="pc-line">${ic('briefcase')}${esc(p.consultant)}</div>` : ''}
    ${c.location && p.location ? `<div class="pc-line">${ic('pin')}${esc(p.location)}</div>` : ''}
    ${c.floors ? `<div class="pc-line">${ic('layers')}${esc(matFloorsText(p))}${p.cores ? ` · ${p.cores} cores` : ''}</div>` : ''}
    ${c.financial ? `<div class="pc-fin-row"><span>Total ${fmtMoney(p.total)} · Lab M ${fmtMoney(p.labM)}</span><span class="rem">Rem. ${fmtMoney(matRemaining(p))}</span></div>` : ''}
  </div>`;
}
ACT.openMat = el => nav('#/mat/p/' + el.dataset.id);

function viewMatHome() {
  const active = D.mat.filter(p => !p.archived);
  const filters = S.savedFilters.filter(f => f.dept === 'mat');
  return `
  <div class="page-head"><h1>${ic(navDef('mat').icon)} ${esc(navDef('mat').label)}</h1></div>
  <button class="btn primary xl block" data-act="matAdd">${ic('plus')} Add New Material Project</button>
  <div class="searchbar">${ic('search')}<input id="matQ" type="search" placeholder="Search project number, owner, consultant, location…"></div>
  ${filters.length ? `<div class="chips">${filters.map(f => `<button class="chip" data-act="openFilter" data-fid="${f.id}">${ic('tag')}${esc(f.name)}</button>`).join('')}</div>` : ''}
  <div id="matQres"></div>
  <div class="status-grid">
    ${S.matStatuses.map(s => `<button class="status-tile" data-act="go" data-h="#/mat/s/${s.key}" style="--c:${esc(s.color)}"><span class="st-ic">${ic(s.icon || 'circle')}</span><span class="st-label">${esc(s.label)}</span><span class="st-n">${active.filter(p => p.status === s.key).length}</span></button>`).join('')}
    <button class="status-tile muted" data-act="go" data-h="#/mat/s/archived" style="--c:#94a3b8"><span class="st-ic">${ic('archive')}</span><span class="st-label">Archived</span><span class="st-n">${D.mat.filter(p => p.archived).length}</span></button>
  </div>
  <div class="row-actions"><button class="btn ghost" data-act="go" data-h="#/data">${ic('download')} Export Material Projects</button></div>`;
}
function bindMatHome() {
  const inp = $('#matQ'); if (!inp) return;
  inp.oninput = () => {
    const q = inp.value.trim(); const box = $('#matQres');
    if (!q) { box.innerHTML = ''; return; }
    const res = matSorted(D.mat.filter(p => matMatch(p, q)));
    box.innerHTML = `<div class="sec-title">${res.length} result(s)</div><div class="cards">${res.map(matCard).join('') || '<div class="empty">No matching projects</div>'}</div>`;
  };
}
function viewMatStatus(key, q = '') {
  const isArch = key === 'archived';
  const s = isArch ? { label: 'Archived', color: '#94a3b8' } : statusDef('mat', key);
  const all = D.mat.filter(p => isArch ? p.archived : (p.status === key && !p.archived));
  const mode = listSort.mat || S.sort.mat;
  const list = matSorted(all.filter(p => matMatch(p, q)), mode);
  const sorts = [['updated', 'Last updated'], ['ref', 'Project Number'], ['created', 'Newest first'], ['remaining', 'Highest remaining'], ['consultant', 'Consultant']];
  return `
  <div class="page-head"><button class="icon-btn" data-act="go" data-h="#/mat">${ic('left')}</button><h1><span class="dot-lg" style="background:${esc(s.color)}"></span>${esc(s.label)} <small>${all.length}</small></h1></div>
  <div class="toolbar"><div class="searchbar grow">${ic('search')}<input id="listQ" type="search" placeholder="Filter this list…" value="${esc(q)}"></div>
    <select id="listSort" class="sel">${sorts.map(([v, l]) => `<option value="${v}" ${mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <div class="row-actions">
    ${!isArch ? `<button class="btn primary" data-act="matAdd">${ic('plus')} Add</button>` : ''}
    <button class="btn ghost" data-act="matCopyStatus" data-status="${esc(key)}">${ic('copy')} Copy All in ${esc(s.label)}</button>
    <button class="btn ghost" data-act="saveFilter" data-dept="mat" data-status="${esc(key)}">${ic('tag')} Save view</button>
  </div>
  <div class="cards">${list.map(matCard).join('') || '<div class="empty">No projects</div>'}</div>`;
}
function viewMatDetails(id) {
  const p = matById(id);
  if (!p) return `<div class="empty">Project not found. <a href="#/mat">Back</a></div>`;
  const next = S.matStatuses[matPos(p.status) + 1];
  const a = p.approved;
  const cfs = customFieldsFor('mat');
  return `
  <div class="page-head"><button class="icon-btn" data-act="back">${ic('left')}</button><h1 class="sel-text">${esc(p.ref)}</h1>
    <button class="star big ${p.favorite ? 'on' : ''}" data-act="fav" data-dept="mat" data-id="${p.id}">${ic('star')}</button></div>
  <div class="detail-status">${badge('mat', p.status)}<span class="pill">Material</span>${p.archived ? '<span class="pill">Archived</span>' : ''}</div>
  <div class="action-bar">
    ${next && !p.archived ? `<button class="btn primary" data-act="matNext" data-id="${p.id}">${ic('right')} Move to ${esc(next.label)}</button>` : ''}
    <button class="btn" data-act="matStatus" data-id="${p.id}">${ic('flag')} Change Status</button>
    <button class="btn" data-act="matEdit" data-id="${p.id}">${ic('edit')} Edit</button>
    <button class="btn" data-act="matCopy" data-id="${p.id}">${ic('copy')} Copy</button>
    <button class="btn" data-act="matMore" data-id="${p.id}">${ic('more')} More</button>
  </div>
  <section class="card"><h2>Basic Information</h2>
    ${kv('Project Number / Reference', esc(p.ref))}${kv('Owner Name', esc(p.owner || '—'))}${kv('Consultant Name', esc(p.consultant || '—'))}${kv('Location', esc(p.location || '—'))}${kv('Number of Cores', esc(p.cores ?? '—'))}
  </section>
  <section class="card"><div class="card-head"><h2>Building Configuration</h2><button class="btn sm" data-act="matEdit" data-id="${p.id}">${ic('edit')} Edit</button></div>
    ${kv('Basement', p.basement ? 'Yes' : 'No')}${kv('Ground Floor', p.ground ? 'Yes' : 'No')}${kv('Additional Floors', esc(p.floors || 0))}${kv('Roof', p.roof ? 'Yes' : 'No')}
    <div class="calc-box">${ic('layers')} ${esc(matFloorsText(p))}</div>
  </section>
  <section class="card"><h2>Financial</h2>
    <div class="fin-grid three"><div><span>Total Payment</span><b>${fmtMoney(p.total)}</b></div><div><span>Lab M</span><b>${fmtMoney(p.labM)}</b></div><div><span>Remaining</span><b class="okc">${fmtMoney(matRemaining(p))}</b></div></div>
  </section>
  ${p.status !== 'quoted' || a.p1Status ? `<section class="card"><div class="card-head"><h2>Approved — Payments</h2><button class="btn sm" data-act="matApproved" data-id="${p.id}">${ic('edit')} Edit</button></div>
    ${kv('First Payment Amount', a.p1Amount != null ? fmtMoney(a.p1Amount) : '—')}${kv('First Payment Status', esc(a.p1Status || 'Pending'))}
    ${kv('Second Payment Amount', a.p2Amount != null ? fmtMoney(a.p2Amount) : '—')}${kv('Second Payment Status', esc(a.p2Status || 'Pending'))}
    ${kv('Laboratory Transfer Status', esc(a.labStatus || 'Pending'))}</section>` : ''}
  ${p.transfer ? `<section class="card"><div class="card-head"><h2>Laboratory Transfer</h2><button class="btn sm" data-act="matTransfer" data-id="${p.id}">${ic('edit')} Edit</button></div>
    ${kv('Transfer Date', fmtDate(p.transfer.date))}${kv('Transfer Amount', fmtMoney(p.transfer.amount))}${kv('Transfer Reference', esc(p.transfer.ref || '—'))}${p.transfer.note ? kv('Note', esc(p.transfer.note)) : ''}</section>` : ''}
  ${cfs.length ? `<section class="card"><h2>Additional Fields</h2>${cfs.map(cf => kv(cf.label, cf.type === 'file' && p.custom[cf.id] ? `<a href="javascript:void 0" data-act="attOpen" data-dept="mat" data-id="${p.id}" data-att="${cf.id}">${esc(p.custom[cf.id].name)}</a>` : esc(customValueText(cf, p.custom[cf.id]) || '—'))).join('')}</section>` : ''}
  ${notesSection('mat', p)}
  ${attachmentsSection('mat', p)}
  <section class="card"><h2>Status History</h2>${p.statusHistory.slice().reverse().map(h => `<div class="hist"><b>${fmtDateTime(h.at)}</b> — ${h.from ? esc(matLabel(h.from)) + ' → ' : ''}${esc(matLabel(h.to))}</div>`).join('')}</section>
  ${activitySection(D.activity.filter(x => x.pid === p.id).slice(0, 25))}`;
}
ACT.matMore = async el => {
  const p = matById(el.dataset.id); if (!p) return;
  const canDel = !(p.status === 'finished' || p.transfer);
  const v = await chooseDlg(p.ref, [
    { value: 'share', label: 'Share (WhatsApp, email…)', icon: 'share' },
    { value: 'approved', label: 'Edit Approved Payments', icon: 'dollar' },
    { value: 'transfer', label: p.transfer ? 'Edit Laboratory Transfer' : 'Register Laboratory Transfer', icon: 'receipt' },
    { value: 'xlsx', label: 'Export — Excel', icon: 'download' }, { value: 'pdf', label: 'Export — PDF', icon: 'download' },
    { value: 'docx', label: 'Export — Word', icon: 'download' }, { value: 'json', label: 'Export — JSON', icon: 'download' },
    { value: 'archive', label: p.archived ? 'Restore from Archive' : 'Archive', icon: 'archive' },
    { value: 'delete', label: 'Delete Permanently', icon: 'trash', danger: true, disabled: !canDel, hint: canDel ? '' : 'Not allowed — use Archive' }
  ]);
  const fake = { dataset: { id: p.id } };
  if (v === 'share') ACT.matShare(fake);
  else if (v === 'approved') ACT.matApproved(fake);
  else if (v === 'transfer') ACT.matTransfer(fake);
  else if (['xlsx', 'pdf', 'docx', 'json'].includes(v)) exportScope('mat-one', v, { ids: [p.id] });
  else if (v === 'archive') ACT.matArchive(fake);
  else if (v === 'delete') ACT.matDelete(fake);
};
