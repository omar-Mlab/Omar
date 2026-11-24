/* =========================================================
   geo.js — Geotechnical department
   workflow rules, payments, transfers/RV, screens
   ========================================================= */
'use strict';

/* ---------- money ---------- */
const geoRecC = p => p.payments.reduce((s, x) => s + toCents(x.amount), 0);
const geoRemC = p => toCents(p.total) - geoRecC(p);
const geoReceived = p => fromCents(geoRecC(p));
const geoRemaining = p => fromCents(geoRemC(p));
const geoPct = p => toCents(p.total) > 0 ? Math.min(100, Math.round(geoRecC(p) / toCents(p.total) * 1000) / 10) : 0;

/* ---------- workflow helpers ---------- */
const geoPos = k => S.geoStatuses.findIndex(s => s.key === k);
function geoBefore(key, ref) {
  if (key in CORE_RANK) return CORE_RANK[key] < CORE_RANK[ref];
  return geoPos(key) < geoPos(ref);
}
const reachedReportDone = p => !!p.flags.reportDone || ((p.status in CORE_RANK) && CORE_RANK[p.status] >= CORE_RANK.reportdone);
const geoDeletable = p => geoBefore(p.status, 'reportdone') && !p.transfer && !p.flags.reportDone;
const geoLabel = k => statusDef('geo', k).label;

function rvState(p) {
  if (!p.transfer) return p.status === 'finished' ? 'missing' : null;
  const t = p.transfer;
  if (!t.rv) return 'missing';
  if (!t.date || t.amount === null || t.amount === undefined || t.amount === '' || !t.method) return 'incomplete';
  return 'registered';
}
const RV_STATE_LABEL = { registered: 'RV Registered', missing: 'RV Missing', incomplete: 'Incomplete Transfer' };
function rvBadge(p) {
  const st = rvState(p);
  if (!st) return '';
  const cls = st === 'registered' ? 'ok' : st === 'missing' ? 'danger' : 'warn';
  return `<span class="pill ${cls}">${st === 'registered' ? ic('check') : ic('alert')}${RV_STATE_LABEL[st]}</span>`;
}

function setGeoStatus(p, to, reason = '') {
  const from = p.status;
  p.status = to;
  p.statusHistory.push({ from, to, at: nowISO(), reason });
  if (to === 'reportdone') p.flags.reportDone = true;
  p.updatedAt = nowISO();
  logAct('geo', p, 'status', `Status: ${geoLabel(from)} → ${geoLabel(to)}${reason ? ' (' + reason + ')' : ''}`);
}
function maybeAutoUrgent(p) {
  if (S.autoUrgent && p.payments.length > 0 && geoBefore(p.status, 'urgent') && !p.archived) {
    setGeoStatus(p, 'urgent', 'Automatic — first payment recorded');
    toast(`${p.gsi} moved to ${geoLabel('urgent')} (first payment recorded)`);
    return true;
  }
  return false;
}
function checkAutoFullyDone(p) {
  if (S.autoFullyDone && p.status === 'reportdone' && toCents(p.total) > 0 && geoRemC(p) === 0) {
    setGeoStatus(p, 'fullydone', 'Automatic — Report Done and fully paid');
    toast(`${p.gsi} is now ${geoLabel('fullydone')}`, 'ok');
    return true;
  }
  return false;
}
/* Fully Done can never stay with a balance (protected rule) */
function enforceFullyDone(p) {
  if (p.status === 'fullydone' && geoRemC(p) !== 0) {
    setGeoStatus(p, 'reportdone', 'Automatic — balance is no longer zero');
    toast(`${p.gsi} moved back to ${geoLabel('reportdone')}: balance is not zero`, 'warn', 5000);
  }
}
function fullyDoneProblems(p) {
  const r = [];
  if (!reachedReportDone(p)) r.push(`The project has not reached ${geoLabel('reportdone')}.`);
  if (toCents(p.total) <= 0) r.push('Total Payment is not set.');
  else if (geoRemC(p) > 0) r.push(`Remaining balance: <b>${fmtMoney(geoRemaining(p))}</b>.`);
  else if (geoRemC(p) < 0) r.push(`Total Received is more than Total Payment by <b>${fmtMoney(-geoRemaining(p))}</b>. Fix the payments first.`);
  return r;
}

/* ---------- create / edit ---------- */
function gsiTaken(gsi, exceptId) { return D.geo.find(p => p.id !== exceptId && norm(p.gsi) === norm(gsi)); }

ACT.geoAdd = () => geoAddProject();
async function geoAddProject() {
  const statusOpts = S.geoStatuses.map(s => ({ v: s.key, l: s.label }));
  const fields = [
    { name: 'gsi', label: 'GSI Number', required: true, placeholder: 'Unique project number' },
    { name: 'consultant', label: 'Consultant Name', list: 'dl-consultant' },
    { name: 'owner', label: 'Owner Name', list: 'dl-owner' },
    { name: 'location', label: 'Location', list: 'dl-location' },
    { name: 'total', label: 'Total Payment', type: 'money', required: true, hint: 'Agreed project amount' },
    { name: 'p1amount', label: 'First Payment Amount', type: 'money', hint: 'Optional — any agreed amount' },
    { name: 'p1date', label: 'First Payment Date', type: 'date', value: todayISO() },
    { name: 'status', label: 'Current Status', type: 'select', options: statusOpts, value: 'meps' },
    { type: 'html', name: '_hint', html: '<div id="autoHint" class="hint-box" hidden></div>' },
    { name: 'note', label: 'Notes (optional)', type: 'textarea', rows: 2 },
    { name: 'files', label: 'Attachments (optional)', type: 'files' },
    ...customFieldSpecs('geo')
  ];
  const v = await formDialog({
    title: '+ Add New Project', fields, okText: 'Create Project', wide: true,
    onChange: form => {
      const amt = parseNum($('[name=p1amount]', form).value);
      const st = $('[name=status]', form).value;
      const box = $('#autoHint', form);
      if (amt > 0 && S.autoUrgent && geoBefore(st, 'urgent')) { box.hidden = false; box.innerHTML = `${ic('zap')} Recording the first payment will move this project to <b>${esc(geoLabel('urgent'))}</b> automatically.`; }
      else box.hidden = true;
    },
    validate: async v => {
      if (gsiTaken(v.gsi)) return `GSI Number <b>${esc(v.gsi)}</b> already exists.`;
      if (v.p1amount > 0 && !v.p1date) return 'First Payment Date is required when a first payment is entered.';
      if (v.p1amount > v.total && !(await confirmDlg(`First payment (${fmtMoney(v.p1amount)}) is more than the Total Payment (${fmtMoney(v.total)}). Continue?`))) return 'Please check the amounts.';
      return null;
    }
  });
  if (!v) return;
  const p = normalizeGeo({ id: uid(), gsi: v.gsi, consultant: v.consultant, owner: v.owner, location: v.location, total: v.total || 0, status: 'meps', favorite: false, archived: false, createdAt: nowISO(), updatedAt: nowISO() });
  p.statusHistory.push({ from: null, to: 'meps', at: nowISO(), reason: 'Created' });
  if (v.note) p.notes.push({ id: uid(), text: v.note, at: nowISO() });
  await addAttachments(p, v.files);
  await applyCustomValues('geo', p, v);
  D.geo.push(p);
  logAct('geo', p, 'create', 'Project created');
  if (v.p1amount > 0) addPaymentRecord(p, { amount: v.p1amount, date: v.p1date, desc: 'First Payment', note: '' });
  save();
  if (v.status !== 'meps') await geoChangeStatus(p, v.status);
  if (v.p1amount > 0) maybeAutoUrgent(p);
  save(); refreshDatalists();
  toast('Project created', 'ok');
  nav('#/geo/p/' + p.id);
}

ACT.geoEdit = el => geoEditProject(geoById(el.dataset.id));
async function geoEditProject(p) {
  if (!p) return;
  const fields = [
    { name: 'gsi', label: 'GSI Number', required: true, value: p.gsi },
    { name: 'consultant', label: 'Consultant Name', list: 'dl-consultant', value: p.consultant },
    { name: 'owner', label: 'Owner Name', list: 'dl-owner', value: p.owner },
    { name: 'location', label: 'Location', list: 'dl-location', value: p.location },
    { name: 'total', label: 'Total Payment', type: 'money', required: true, value: p.total },
    ...customFieldSpecs('geo', p)
  ];
  const v = await formDialog({ title: 'Edit Project', fields, wide: true, validate: v => gsiTaken(v.gsi, p.id) ? `GSI Number <b>${esc(v.gsi)}</b> already exists.` : null });
  if (!v) return;
  const changes = [];
  [['gsi', 'GSI Number'], ['consultant', 'Consultant'], ['owner', 'Owner'], ['location', 'Location'], ['total', 'Total Payment']].forEach(([k, l]) => {
    if (String(p[k] ?? '') !== String(v[k] ?? '')) { changes.push(`${l}: "${p[k] ?? ''}" → "${v[k] ?? ''}"`); p[k] = v[k]; }
  });
  await applyCustomValues('geo', p, v);
  p.updatedAt = nowISO();
  if (changes.length) logAct('geo', p, 'edit', 'Edited — ' + changes.join('; '));
  enforceFullyDone(p); checkAutoFullyDone(p);
  save(); refreshDatalists(); render(); toast('Saved', 'ok');
}

/* ---------- payments (never overwritten — each payment is its own record) ---------- */
function addPaymentRecord(p, { amount, date, desc, note }) {
  const pay = { id: uid(), amount, date, desc: desc || 'Payment', note: note || '', createdAt: nowISO() };
  p.payments.push(pay);
  p.updatedAt = nowISO();
  logAct('geo', p, 'payment', `Payment added: ${fmtMoney(amount)} — ${pay.desc} — ${fmtDate(date)}`);
  return pay;
}
function defaultPayDesc(p) {
  const n = p.payments.length;
  return n === 0 ? 'First Payment' : n === 1 ? 'Second Payment' : 'Additional Payment';
}
ACT.geoPay = el => geoRecordPayment(geoById(el.dataset.id));
async function geoRecordPayment(p) {
  if (!p) return;
  const isFirst = p.payments.length === 0;
  const v = await formDialog({
    title: 'Record Payment — ' + p.gsi,
    intro: `<div class="mini-fin"><span>Total <b>${fmtMoney(p.total)}</b></span><span>Received <b>${fmtMoney(geoReceived(p))}</b></span><span>Remaining <b>${fmtMoney(geoRemaining(p))}</b></span></div>`,
    fields: [
      { name: 'amount', label: 'Payment Amount', type: 'money', required: true },
      { name: 'date', label: 'Payment Date', type: 'date', required: true, value: todayISO() },
      { name: 'desc', label: 'Payment Description', list: 'dl-paydesc', value: defaultPayDesc(p) },
      { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2 }
    ],
    okText: 'Save Payment',
    validate: async v => {
      if (!(v.amount > 0)) return 'Payment Amount must be more than zero.';
      if (p.payments.some(x => toCents(x.amount) === toCents(v.amount) && x.date === v.date) &&
        !(await confirmDlg(`A payment of ${fmtMoney(v.amount)} on ${fmtDate(v.date)} already exists for this project. Record it again?`, { title: 'Possible duplicate' }))) return 'Payment not saved (possible duplicate).';
      if (toCents(v.amount) > geoRemC(p) &&
        !(await confirmDlg(`This payment is more than the remaining balance (${fmtMoney(geoRemaining(p))}). Continue?`))) return 'Please check the amount.';
      return null;
    }
  });
  if (!v) return false;
  addPaymentRecord(p, v);
  if (isFirst) maybeAutoUrgent(p);
  checkAutoFullyDone(p);
  save(); render(); toast('Payment recorded', 'ok');
  return true;
}
ACT.geoPayEdit = async el => {
  const p = geoById(el.dataset.id); const pay = p && p.payments.find(x => x.id === el.dataset.pay);
  if (!pay) return;
  const v = await formDialog({
    title: 'Edit Payment', fields: [
      { name: 'amount', label: 'Payment Amount', type: 'money', required: true, value: pay.amount },
      { name: 'date', label: 'Payment Date', type: 'date', required: true, value: pay.date },
      { name: 'desc', label: 'Payment Description', list: 'dl-paydesc', value: pay.desc },
      { name: 'note', label: 'Note', type: 'textarea', rows: 2, value: pay.note }
    ], validate: v => v.amount > 0 ? null : 'Payment Amount must be more than zero.'
  });
  if (!v) return;
  const old = `${fmtMoney(pay.amount)} / ${fmtDate(pay.date)} / ${pay.desc}`;
  Object.assign(pay, { amount: v.amount, date: v.date, desc: v.desc || 'Payment', note: v.note, editedAt: nowISO() });
  logAct('geo', p, 'payment-edit', `Payment edited: ${old} → ${fmtMoney(pay.amount)} / ${fmtDate(pay.date)} / ${pay.desc}`);
  p.updatedAt = nowISO();
  enforceFullyDone(p); checkAutoFullyDone(p);
  save(); render(); toast('Payment updated', 'ok');
};
ACT.geoPayDel = async el => {
  const p = geoById(el.dataset.id); const pay = p && p.payments.find(x => x.id === el.dataset.pay);
  if (!pay) return;
  if (!(await confirmDlg(`Delete the payment of <b>${fmtMoney(pay.amount)}</b> (${esc(pay.desc)}, ${fmtDate(pay.date)})?<br><br>This is recorded in the activity history.`, { danger: true, okText: 'Delete Payment' }))) return;
  p.payments = p.payments.filter(x => x.id !== pay.id);
  logAct('geo', p, 'payment-delete', `Payment deleted: ${fmtMoney(pay.amount)} — ${pay.desc} — ${fmtDate(pay.date)}`);
  p.updatedAt = nowISO();
  enforceFullyDone(p);
  save(); render();
};

/* ---------- status changes ---------- */
ACT.geoStatus = async el => {
  const p = geoById(el.dataset.id); if (!p) return;
  const items = S.geoStatuses.map(s => ({ value: s.key, label: s.label, color: s.color, hint: s.key === p.status ? 'Current status' : (STATUS_DATE[s.key] ? 'Asks for ' + STATUS_DATE[s.key][1] : s.key === 'finished' ? 'Opens the transfer form (RV)' : s.key === 'fullydone' ? 'Needs Report Done + zero balance' : (s.dateLabel ? 'Asks for ' + s.dateLabel : '')), disabled: s.key === p.status }));
  const to = await chooseDlg('Change Status — ' + p.gsi, items);
  if (to && await geoChangeStatus(p, to)) { render(); }
};
ACT.geoNext = async el => {
  const p = geoById(el.dataset.id); if (!p) return;
  const nx = S.geoStatuses[geoPos(p.status) + 1];
  if (nx && await geoChangeStatus(p, nx.key)) render();
};
async function geoChangeStatus(p, to) {
  if (!p || to === p.status) return false;
  const def = statusDef('geo', to);
  if (p.status === 'finished' && !(await confirmDlg(`<b>${esc(p.gsi)}</b> is Finished. Its RV & transfer record stays saved permanently in RV Tracking.<br><br>Move it to <b>${esc(def.label)}</b>?`))) return false;
  if (!def.core && Array.isArray(def.requiredFields) && def.requiredFields.length) {
    const missing = def.requiredFields.map(id => S.customFields.find(f => f.id === id)).filter(cf => cf && customValueText(cf, p.custom[cf.id]) === '');
    if (missing.length) { await alertDlg(`Fill these fields before moving to <b>${esc(def.label)}</b>:<ul>${missing.map(m => `<li>${esc(m.label)}</li>`).join('')}</ul>`, 'Required fields'); return false; }
  }
  if (to === 'fullydone') {
    const probs = fullyDoneProblems(p);
    if (probs.length) { await alertDlg(`<b>${esc(p.gsi)}</b> cannot be marked <b>${esc(def.label)}</b>:<ul>${probs.map(x => `<li>${x}</li>`).join('')}</ul>`, 'Not allowed'); return false; }
  }
  let dateKey = null, dateVal = null;
  if (STATUS_DATE[to] || (!def.core && def.dateLabel)) {
    const [k, label] = STATUS_DATE[to] || ['cs_' + to, def.dateLabel];
    dateKey = k;
    dateVal = await promptDate(label, p.dates[k] || todayISO(), `Moving <b>${esc(p.gsi)}</b> to <b>${esc(def.label)}</b>.`);
    if (!dateVal) return false;
  }
  if (to === 'finished' && !(await geoTransferForm(p, { entering: true }))) return false;
  if (dateKey) {
    if (p.dates[dateKey] && p.dates[dateKey] !== dateVal) logAct('geo', p, 'date', `${dateLabelFor(dateKey)}: ${fmtDate(p.dates[dateKey])} → ${fmtDate(dateVal)}`);
    p.dates[dateKey] = dateVal;
  }
  setGeoStatus(p, to);
  if (to === 'reportdone') checkAutoFullyDone(p);
  save();
  toast(`${p.gsi} → ${statusDef('geo', p.status).label}`, 'ok');
  return true;
}
function dateLabelFor(k) {
  const core = Object.values(STATUS_DATE).find(x => x[0] === k);
  if (core) return core[1];
  if (k.startsWith('cs_')) { const s = statusDef('geo', k.slice(3)); return s.dateLabel || s.label + ' Date'; }
  return k;
}
ACT.geoDates = async el => {
  const p = geoById(el.dataset.id); if (!p) return;
  const keys = Object.values(STATUS_DATE).map(x => x[0]);
  S.geoStatuses.filter(s => !s.core && s.dateLabel).forEach(s => keys.push('cs_' + s.key));
  const v = await formDialog({ title: 'Important Dates — ' + p.gsi, fields: keys.map(k => ({ name: k, label: dateLabelFor(k), type: 'date', value: p.dates[k] || '' })) });
  if (!v) return;
  keys.forEach(k => {
    if ((p.dates[k] || '') !== (v[k] || '')) { logAct('geo', p, 'date', `${dateLabelFor(k)}: ${fmtDate(p.dates[k])} → ${fmtDate(v[k])}`); if (v[k]) p.dates[k] = v[k]; else delete p.dates[k]; }
  });
  p.updatedAt = nowISO(); save(); render();
};

/* ---------- Finished: transfer form & RV ---------- */
function rvOwners(rv, exceptId) { return D.geo.filter(p => p.id !== exceptId && p.transfer && p.transfer.rv && norm(p.transfer.rv) === norm(rv)); }
ACT.geoTransfer = async el => { const p = geoById(el.dataset.id); if (p && await geoTransferForm(p, {})) { save(); render(); } };
async function geoTransferForm(p, { entering = false } = {}) {
  const t = p.transfer || {};
  const notDone = entering && p.status !== 'fullydone';
  const v = await formDialog({
    title: (entering ? 'Transfer to Laboratory — ' : 'Edit Transfer / RV — ') + p.gsi, wide: true,
    intro: notDone ? `<div class="banner warn">${ic('alert')}<div>This project is not <b>${esc(geoLabel('fullydone'))}</b>${geoRemC(p) ? ` — remaining balance <b>${fmtMoney(geoRemaining(p))}</b>` : ''}. You can still register the transfer.</div></div>` : '',
    fields: [
      { name: 'rv', label: 'RV Number', value: t.rv || '', placeholder: 'Critical tracking number', hint: 'Leave empty only if not available yet — it will be flagged as Missing RV.' },
      { name: 'date', label: 'Transfer Date', type: 'date', value: t.date || (entering ? todayISO() : '') },
      { name: 'amount', label: 'Transfer Amount', type: 'money', value: t.amount ?? (entering ? geoReceived(p) : '') },
      { name: 'method', label: 'Transfer Method', list: 'dl-method', value: t.method || '' },
      { name: 'related', label: 'Related Projects (same transfer)', type: 'textarea', rows: 2, value: t.related || '', placeholder: 'Other GSI numbers included in this transfer' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, value: t.notes || '' }
    ],
    okText: entering ? 'Register Transfer' : 'Save',
    validate: async v => {
      if (v.rv) {
        const dup = rvOwners(v.rv, p.id);
        if (dup.length && !(await confirmDlg(`RV Number <b>${esc(v.rv)}</b> is already registered for: <b>${dup.map(d => esc(d.gsi)).join(', ')}</b>.<br><br>Use the same RV (e.g. same transfer)?`, { title: 'Duplicate RV Number', okText: 'Yes, same RV' }))) return 'Please check the RV Number.';
      }
      const missing = [!v.rv && 'RV Number', !v.date && 'Transfer Date', v.amount === null && 'Transfer Amount', !v.method && 'Transfer Method'].filter(Boolean);
      if (missing.length && !(await confirmDlg(`Missing: <b>${missing.join(', ')}</b>.<br><br>Save as an <b>${v.rv ? 'Incomplete Transfer' : 'Missing RV'}</b> record? It will stay flagged in RV Tracking until completed.`, { title: 'Incomplete transfer', okText: 'Save flagged record' }))) return 'Complete the missing details.';
      return null;
    }
  });
  if (!v) return false;
  const labels = { rv: 'RV Number', date: 'Transfer Date', amount: 'Transfer Amount', method: 'Transfer Method', related: 'Related Projects', notes: 'Notes' };
  const changes = [];
  Object.keys(labels).forEach(k => { const o = t[k] ?? ''; const n = v[k] ?? ''; if (String(o) !== String(n)) changes.push({ field: labels[k], old: o, new: n }); });
  const created = !p.transfer;
  p.transfer = { ...t, rv: v.rv, date: v.date, amount: v.amount, method: v.method, related: v.related, notes: v.notes, createdAt: t.createdAt || nowISO(), updatedAt: nowISO() };
  p.transfer.incomplete = rvState(p) !== 'registered';
  if (created || changes.length) {
    p.rvHistory.push({ at: nowISO(), action: created ? 'created' : 'edited', changes });
    logAct('geo', p, created ? 'rv-create' : 'rv-edit', (created ? 'Transfer registered' : 'Transfer edited') + (v.rv ? ` — RV ${v.rv}` : ' — RV missing') + (changes.length && !created ? ': ' + changes.map(c => `${c.field} "${c.old}" → "${c.new}"`).join('; ') : ''));
  }
  p.updatedAt = nowISO();
  return true;
}

/* ---------- archive / cancel / delete ---------- */
ACT.geoArchive = async el => {
  const p = geoById(el.dataset.id); if (!p) return;
  if (p.archived) { p.archived = false; p.cancelled = false; logAct('geo', p, 'archive', 'Restored from archive'); save(); render(); toast('Restored'); return; }
  if (!(await confirmDlg(`Archive <b>${esc(p.gsi)}</b>? It will be hidden from status lists. Payments and RV records are kept and you can restore it anytime.`, { okText: 'Archive' }))) return;
  p.archived = true; p.archivedAt = nowISO();
  logAct('geo', p, 'archive', 'Project archived'); save(); render();
};
ACT.geoCancel = async el => {
  const p = geoById(el.dataset.id); if (!p) return;
  const v = await formDialog({ title: 'Cancel Project — ' + p.gsi, intro: 'The project will be marked Cancelled and archived. Financial history and RV records are kept.', fields: [{ name: 'reason', label: 'Reason', type: 'textarea', rows: 2 }], okText: 'Cancel Project', danger: true });
  if (!v) return;
  p.cancelled = true; p.archived = true; p.cancelReason = v.reason; p.archivedAt = nowISO();
  logAct('geo', p, 'archive', 'Project cancelled' + (v.reason ? ': ' + v.reason : '')); save(); render();
};
ACT.geoDelete = async el => {
  const p = geoById(el.dataset.id); if (!p) return;
  if (!geoDeletable(p)) { await alertDlg(`Projects that reached <b>${esc(geoLabel('reportdone'))}</b> or have a transfer/RV record cannot be deleted. Use <b>Archive</b> or <b>Cancel</b> instead.`, 'Deletion not allowed'); return; }
  if (!(await confirmDlg(`Permanently delete <b>${esc(p.gsi)}</b> and its ${p.payments.length} payment record(s)?<br><br>This cannot be undone.`, { danger: true, okText: 'Delete permanently', title: 'Delete project' }))) return;
  D.deleted.unshift({ at: nowISO(), dept: 'geo', ref: p.gsi, status: geoLabel(p.status), total: p.total, received: geoReceived(p) });
  logAct('geo', p, 'delete', `Project deleted (status ${geoLabel(p.status)}, received ${fmtMoney(geoReceived(p))})`);
  D.geo = D.geo.filter(x => x.id !== p.id);
  D.recent = D.recent.filter(r => r.id !== p.id);
  save(); toast('Project deleted'); nav('#/geo');
};
ACT.fav = el => {
  const p = el.dataset.dept === 'mat' ? matById(el.dataset.id) : geoById(el.dataset.id); if (!p) return;
  p.favorite = !p.favorite; save(); render();
};

/* ---------- notes & attachments (shared by both departments) ---------- */
async function addAttachments(p, files) {
  for (const f of files || []) {
    if (f.size > 8 * 1048576) { toast('Skipped (over 8 MB): ' + f.name, 'warn', 4000); continue; }
    p.attachments.push({ id: uid(), name: f.name, type: f.type, size: f.size, data: await readFileAsDataURL(f), at: nowISO() });
  }
}
const projById = (dept, id) => dept === 'mat' ? matById(id) : geoById(id);
ACT.noteAdd = async el => {
  const p = projById(el.dataset.dept, el.dataset.id); if (!p) return;
  const v = await formDialog({ title: 'Add Note', fields: [{ name: 'text', label: 'Note', type: 'textarea', rows: 4, required: true }] });
  if (!v) return;
  p.notes.push({ id: uid(), text: v.text, at: nowISO() });
  logAct(el.dataset.dept, p, 'note', 'Note added'); p.updatedAt = nowISO(); save(); render();
};
ACT.noteDel = async el => {
  const p = projById(el.dataset.dept, el.dataset.id); if (!p) return;
  if (!(await confirmDlg('Delete this note?', { danger: true, okText: 'Delete' }))) return;
  p.notes = p.notes.filter(n => n.id !== el.dataset.note); logAct(el.dataset.dept, p, 'note', 'Note deleted'); save(); render();
};
ACT.attAdd = async el => {
  const p = projById(el.dataset.dept, el.dataset.id); if (!p) return;
  const v = await formDialog({ title: 'Add Attachments', fields: [{ name: 'files', label: 'Files (max 8 MB each)', type: 'files', required: true }], okText: 'Upload' });
  if (!v) return;
  await addAttachments(p, v.files); logAct(el.dataset.dept, p, 'attachment', `${v.files.length} attachment(s) added`); save(); render();
};
ACT.attOpen = el => {
  const p = projById(el.dataset.dept, el.dataset.id); const a = p && (p.attachments.find(x => x.id === el.dataset.att) || (p.custom[el.dataset.att]));
  if (!a) return;
  const blob = dataURLtoBlob(a.data);
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) downloadBlob(blob, a.name);
};
ACT.attDel = async el => {
  const p = projById(el.dataset.dept, el.dataset.id); if (!p) return;
  const a = p.attachments.find(x => x.id === el.dataset.att); if (!a) return;
  if (!(await confirmDlg(`Delete attachment <b>${esc(a.name)}</b>?`, { danger: true, okText: 'Delete' }))) return;
  p.attachments = p.attachments.filter(x => x.id !== a.id); logAct(el.dataset.dept, p, 'attachment', 'Attachment deleted: ' + a.name); save(); render();
};

/* ---------- structured copy text (WhatsApp / email ready) ---------- */
function geoText(p) {
  const L = [];
  L.push(`*${p.gsi}*  —  ${geoLabel(p.status)}${p.cancelled ? ' (Cancelled)' : p.archived ? ' (Archived)' : ''}`);
  if (p.consultant) L.push(`Consultant: ${p.consultant}`);
  if (p.owner) L.push(`Owner: ${p.owner}`);
  if (p.location) L.push(`Location: ${p.location}`);
  L.push(`Total Payment: ${fmtMoney(p.total)}`);
  if (p.payments.length) {
    L.push('Payments:');
    [...p.payments].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach((x, i) => L.push(`  ${i + 1}. ${fmtDate(x.date)} — ${fmtMoney(x.amount)} (${x.desc})${x.note ? ' — ' + x.note : ''}`));
  } else L.push('Payments: none');
  L.push(`Total Received: ${fmtMoney(geoReceived(p))}`);
  L.push(`Remaining Balance: ${fmtMoney(geoRemaining(p))} (${geoPct(p)}% paid)`);
  const ds = Object.keys(p.dates).filter(k => p.dates[k]).map(k => `${dateLabelFor(k)}: ${fmtDate(p.dates[k])}`);
  if (ds.length) L.push(ds.join(' | '));
  if (p.transfer) {
    const t = p.transfer;
    L.push(`RV Number: ${t.rv || '⚠ MISSING'}`);
    L.push(`Transfer: ${fmtDate(t.date)} — ${t.amount !== null && t.amount !== undefined && t.amount !== '' ? fmtMoney(t.amount) : '—'} — ${t.method || '—'}`);
    if (t.related) L.push(`Related Projects: ${t.related}`);
  }
  customFieldsFor('geo').forEach(cf => { const s = customValueText(cf, p.custom[cf.id]); if (s && cf.type !== 'file') L.push(`${cf.label}: ${s}`); });
  return L.join('\n');
}
function listText(title, projects, fn) {
  return `*${title}* — ${projects.length} project(s)\n${fmtDate(todayISO())}\n\n` + projects.map(fn).join('\n\n────────────\n\n');
}
ACT.geoCopy = async el => { const p = geoById(el.dataset.id); if (p && await copyText(geoText(p))) toast('Project copied', 'ok'); };
ACT.geoShare = async el => { const p = geoById(el.dataset.id); if (!p) return; if (!(await shareText(geoText(p), p.gsi))) { await copyText(geoText(p)); toast('Copied (sharing not available)'); } };
ACT.geoCopyStatus = async el => {
  const key = el.dataset.status;
  const list = geoSorted(D.geo.filter(p => key === 'archived' ? p.archived : (p.status === key && !p.archived)));
  if (!list.length) return toast('No projects in this list');
  if (await copyText(listText(key === 'archived' ? 'Archived' : geoLabel(key), list, geoText))) toast(`${list.length} project(s) copied`, 'ok');
};
ACT.geoCopyAll = async () => {
  const groups = S.geoStatuses.map(s => [s, geoSorted(D.geo.filter(p => p.status === s.key && !p.archived))]).filter(g => g[1].length);
  if (!groups.length) return toast('No projects');
  const txt = `*All Geotechnical Projects* — ${groups.reduce((n, g) => n + g[1].length, 0)}\n${fmtDate(todayISO())}\n\n` +
    groups.map(([s, l]) => `══════ ${s.label.toUpperCase()} (${l.length}) ══════\n\n` + l.map(geoText).join('\n\n────────────\n\n')).join('\n\n');
  if (await copyText(txt)) toast('All Geotechnical projects copied', 'ok');
};

/* ---------- sorting & searching ---------- */
function geoSorted(list, mode = S.sort.geo) {
  const l = [...list];
  const key = p => {
    switch (mode) {
      case 'gsi': return p.gsi;
      case 'created': return p.createdAt;
      case 'remaining': return -geoRemC(p);
      case 'consultant': return norm(p.consultant);
      default: return '';
    }
  };
  if (mode === 'gsi' || mode === 'consultant') l.sort((a, b) => String(key(a)).localeCompare(String(key(b)), undefined, { numeric: true }));
  else if (mode === 'created') l.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  else if (mode === 'remaining') l.sort((a, b) => geoRemC(b) - geoRemC(a));
  else if (mode === 'date') l.sort((a, b) => (statusDateOf(a) || '9').localeCompare(statusDateOf(b) || '9'));
  else l.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return l;
}
function statusDateOf(p) {
  const sd = STATUS_DATE[p.status]; if (sd) return p.dates[sd[0]];
  if (p.status === 'finished' && p.transfer) return p.transfer.date;
  return p.dates['cs_' + p.status];
}
function geoMatch(p, q) {
  if (!q) return true;
  const hay = [p.gsi, p.consultant, p.owner, p.location, p.transfer && p.transfer.rv, p.transfer && p.transfer.related].map(norm).join(' | ');
  return norm(q).split(/\s+/).every(t => hay.includes(t));
}

/* ---------- screens ---------- */
function geoCard(p) {
  const c = S.cards.geo;
  const sd = STATUS_DATE[p.status];
  let dateLine = '';
  if (c.dates) {
    if (sd && p.dates[sd[0]]) dateLine = `<div class="pc-date ${p.status === 'reporting' ? 'big' : ''}">${ic('calendar')}${esc(sd[1])}: <b>${fmtDate(p.dates[sd[0]])}</b></div>`;
    else if (p.dates['cs_' + p.status]) dateLine = `<div class="pc-date">${ic('calendar')}${esc(dateLabelFor('cs_' + p.status))}: <b>${fmtDate(p.dates['cs_' + p.status])}</b></div>`;
  }
  const rv = p.transfer ? `<div class="pc-rv">${p.transfer.rv ? `RV <b>${esc(p.transfer.rv)}</b>` : ''} ${rvState(p) !== 'registered' ? rvBadge(p) : ''}</div>` : '';
  const pct = geoPct(p);
  return `<div class="pcard ${p.status === 'urgent' ? 'urgent' : ''} ${p.archived ? 'archived' : ''}" data-act="openGeo" data-id="${p.id}" style="--c:${esc(statusDef('geo', p.status).color)}">
    <div class="pc-top"><div class="pc-id">${esc(p.gsi)}</div>
      <button class="star ${p.favorite ? 'on' : ''}" data-act="fav" data-dept="geo" data-id="${p.id}" aria-label="Favorite">${ic('star')}</button></div>
    <div class="pc-meta">${badge('geo', p.status)}${p.cancelled ? '<span class="pill">Cancelled</span>' : p.archived ? '<span class="pill">Archived</span>' : ''}</div>
    ${c.consultant && p.consultant ? `<div class="pc-line">${ic('briefcase')}${esc(p.consultant)}</div>` : ''}
    ${c.owner && p.owner ? `<div class="pc-line">${ic('user')}${esc(p.owner)}</div>` : ''}
    ${c.location && p.location ? `<div class="pc-line">${ic('pin')}${esc(p.location)}</div>` : ''}
    ${dateLine}${rv}
    ${c.financial ? `<div class="pc-fin"><div class="bar"><i style="width:${pct}%"></i></div>
      <div class="pc-fin-row"><span>${fmtMoney(geoReceived(p))} / ${fmtMoney(p.total)}</span><span class="${geoRemC(p) > 0 ? 'rem' : 'paid'}">${geoRemC(p) > 0 ? 'Rem. ' + fmtMoney(geoRemaining(p)) : geoRemC(p) < 0 ? 'Over ' + fmtMoney(-geoRemaining(p)) : 'Paid'}</span></div></div>` : ''}
  </div>`;
}
ACT.openGeo = el => nav('#/geo/p/' + el.dataset.id);

function viewGeoHome(q = '') {
  const active = D.geo.filter(p => !p.archived);
  const arch = D.geo.filter(p => p.archived).length;
  const filters = S.savedFilters.filter(f => f.dept === 'geo');
  return `
  <div class="page-head"><h1>${ic(navDef('geo').icon)} ${esc(navDef('geo').label)}</h1></div>
  <button class="btn primary xl block" data-act="geoAdd">${ic('plus')} Add New Project</button>
  <div class="searchbar">${ic('search')}<input id="geoQ" type="search" placeholder="Search GSI, RV, consultant, owner, location…" value="${esc(q)}"></div>
  ${filters.length ? `<div class="chips">${filters.map(f => `<button class="chip" data-act="openFilter" data-fid="${f.id}">${ic('tag')}${esc(f.name)}</button>`).join('')}</div>` : ''}
  <div id="geoQres"></div>
  <div class="status-grid">
    ${S.geoStatuses.map(s => { const n = active.filter(p => p.status === s.key).length; return `
      <button class="status-tile ${s.key === 'urgent' && n ? 'hot' : ''}" data-act="go" data-h="#/geo/s/${s.key}" style="--c:${esc(s.color)}">
        <span class="st-ic">${ic(s.icon || 'circle')}</span><span class="st-label">${esc(s.label)}</span><span class="st-n">${n}</span></button>`; }).join('')}
    <button class="status-tile muted" data-act="go" data-h="#/geo/s/archived" style="--c:#94a3b8"><span class="st-ic">${ic('archive')}</span><span class="st-label">Archived / Cancelled</span><span class="st-n">${arch}</span></button>
  </div>
  <div class="row-actions">
    <button class="btn ghost" data-act="geoCopyAll">${ic('copy')} Copy All Geotechnical Projects</button>
    <button class="btn ghost" data-act="go" data-h="#/data">${ic('download')} Export</button>
  </div>`;
}
function bindGeoHome() {
  const inp = $('#geoQ'); if (!inp) return;
  const run = () => {
    const q = inp.value.trim(); const box = $('#geoQres');
    if (!q) { box.innerHTML = ''; return; }
    const res = geoSorted(D.geo.filter(p => geoMatch(p, q)));
    box.innerHTML = `<div class="sec-title">${res.length} result(s)</div><div class="cards">${res.slice(0, 60).map(geoCard).join('') || '<div class="empty">No matching projects</div>'}</div>`;
  };
  inp.oninput = run; run();
}

function viewGeoStatus(key, q = '') {
  const isArch = key === 'archived';
  const s = isArch ? { label: 'Archived / Cancelled', color: '#94a3b8', icon: 'archive' } : statusDef('geo', key);
  const all = D.geo.filter(p => isArch ? p.archived : (p.status === key && !p.archived));
  const list = geoSorted(all.filter(p => geoMatch(p, q)), listSort.geo || S.sort.geo);
  const sorts = [['updated', 'Last updated'], ['gsi', 'GSI Number'], ['created', 'Newest first'], ['remaining', 'Highest remaining'], ['consultant', 'Consultant'], ['date', 'Status date']];
  return `
  <div class="page-head"><button class="icon-btn" data-act="go" data-h="#/geo">${ic('left')}</button>
    <h1><span class="dot-lg" style="background:${esc(s.color)}"></span>${esc(s.label)} <small>${all.length}</small></h1></div>
  <div class="toolbar">
    <div class="searchbar grow">${ic('search')}<input id="listQ" type="search" placeholder="Filter this list…" value="${esc(q)}"></div>
    <select id="listSort" class="sel">${sorts.map(([v, l]) => `<option value="${v}" ${(listSort.geo || S.sort.geo) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  </div>
  <div class="row-actions">
    ${!isArch ? `<button class="btn primary" data-act="geoAdd">${ic('plus')} Add Project</button>` : ''}
    <button class="btn ghost" data-act="geoCopyStatus" data-status="${esc(key)}">${ic('copy')} Copy All in ${esc(s.label)}</button>
    <button class="btn ghost" data-act="saveFilter" data-dept="geo" data-status="${esc(key)}">${ic('tag')} Save view</button>
  </div>
  ${key === 'finished' && all.some(p => rvState(p) !== 'registered') ? `<div class="banner danger">${ic('alert')}<div><b>${all.filter(p => rvState(p) === 'missing').length}</b> without RV Number, <b>${all.filter(p => rvState(p) === 'incomplete').length}</b> with incomplete transfer details. <a href="#/rv">Open RV Tracking</a></div></div>` : ''}
  <div class="cards">${list.map(geoCard).join('') || `<div class="empty">${q ? 'No matching projects' : 'No projects in this status'}</div>`}</div>`;
}
const listSort = { geo: null, mat: null };
function bindList(dept) {
  const q = $('#listQ'), so = $('#listSort');
  if (q) q.oninput = () => { listQuery[dept] = q.value; renderKeepFocus('listQ'); };
  if (so) so.onchange = () => { listSort[dept] = so.value; render(); };
}
const listQuery = { geo: '', mat: '' };

function kv(label, value, cls = '') { return `<div class="kv ${cls}"><span>${esc(label)}</span><b>${value}</b></div>`; }

function viewGeoDetails(id) {
  const p = geoById(id);
  if (!p) return `<div class="empty">Project not found. <a href="#/geo">Back</a></div>`;
  const s = statusDef('geo', p.status);
  const next = S.geoStatuses[geoPos(p.status) + 1];
  const rem = geoRemC(p);
  const acts = D.activity.filter(a => a.pid === p.id).slice(0, 25);
  const cfs = customFieldsFor('geo');
  const relatedLinks = p.transfer && p.transfer.related ? p.transfer.related.split(/[\s,;\n]+/).filter(Boolean).map(tok => { const m = D.geo.find(x => norm(x.gsi) === norm(tok) && x.id !== p.id); return m ? `<a href="#/geo/p/${m.id}">${esc(tok)}</a>` : esc(tok); }).join(', ') : '';
  const datesKeys = [...Object.values(STATUS_DATE).map(x => x[0]), ...Object.keys(p.dates).filter(k => k.startsWith('cs_'))];
  return `
  <div class="page-head"><button class="icon-btn" data-act="back">${ic('left')}</button>
    <h1 class="sel-text">${esc(p.gsi)}</h1>
    <button class="star big ${p.favorite ? 'on' : ''}" data-act="fav" data-dept="geo" data-id="${p.id}">${ic('star')}</button></div>
  <div class="detail-status" style="--c:${esc(s.color)}">${badge('geo', p.status)} ${p.cancelled ? '<span class="pill">Cancelled</span>' : p.archived ? '<span class="pill">Archived</span>' : ''} ${rvBadge(p)}</div>
  <div class="action-bar">
    <button class="btn primary" data-act="geoPay" data-id="${p.id}">${ic('dollar')} Record Payment</button>
    ${next && !p.archived ? `<button class="btn" data-act="geoNext" data-id="${p.id}">${ic('right')} Move to ${esc(next.label)}</button>` : ''}
    <button class="btn" data-act="geoStatus" data-id="${p.id}">${ic('flag')} Change Status</button>
    <button class="btn" data-act="geoEdit" data-id="${p.id}">${ic('edit')} Edit</button>
    <button class="btn" data-act="geoCopy" data-id="${p.id}">${ic('copy')} Copy</button>
    <button class="btn" data-act="geoMore" data-id="${p.id}">${ic('more')} More</button>
  </div>

  <section class="card"><h2>Basic Information</h2>
    ${kv('GSI Number', esc(p.gsi))}${kv('Consultant Name', esc(p.consultant || '—'))}${kv('Owner Name', esc(p.owner || '—'))}${kv('Location', esc(p.location || '—'))}
    ${kv('Created', fmtDateTime(p.createdAt))}
    ${p.cancelled ? kv('Cancel reason', esc(p.cancelReason || '—')) : ''}
  </section>

  <section class="card"><h2>Financial Summary</h2>
    <div class="fin-grid">
      <div><span>Total Payment</span><b>${fmtMoney(p.total)}</b></div>
      <div><span>Total Received</span><b class="okc">${fmtMoney(geoReceived(p))}</b></div>
      <div><span>Remaining Balance</span><b class="${rem > 0 ? 'dangerc' : 'okc'}">${fmtMoney(geoRemaining(p))}</b></div>
      <div><span>Payment Percentage</span><b>${geoPct(p)}%</b></div>
    </div>
    <div class="bar lg"><i style="width:${geoPct(p)}%"></i></div>
    ${p.status === 'reportdone' && rem !== 0 ? `<div class="hint-box">${ic('alert')} Becomes <b>${esc(geoLabel('fullydone'))}</b> automatically when the remaining balance reaches zero.</div>` : ''}
  </section>

  <section class="card"><div class="card-head"><h2>Payment History <small>${p.payments.length}</small></h2><button class="btn sm" data-act="geoPay" data-id="${p.id}">${ic('plus')} Add</button></div>
    ${p.payments.length ? `<div class="pay-list">${[...p.payments].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((x, i) => `
      <div class="pay"><div class="pay-n">${i + 1}</div><div class="pay-main"><b>${fmtMoney(x.amount)}</b><span>${esc(x.desc)} · ${fmtDate(x.date)}</span>${x.note ? `<small>${esc(x.note)}</small>` : ''}${x.editedAt ? `<small class="muted">edited ${fmtDateTime(x.editedAt)}</small>` : ''}</div>
      <button class="icon-btn" data-act="geoPayEdit" data-id="${p.id}" data-pay="${x.id}">${ic('edit')}</button>
      <button class="icon-btn" data-act="geoPayDel" data-id="${p.id}" data-pay="${x.id}">${ic('trash')}</button></div>`).join('')}</div>` : '<div class="empty sm">No payments recorded yet</div>'}
  </section>

  <section class="card"><div class="card-head"><h2>Important Dates</h2><button class="btn sm" data-act="geoDates" data-id="${p.id}">${ic('edit')} Edit</button></div>
    ${[...new Set(datesKeys)].map(k => kv(dateLabelFor(k), fmtDate(p.dates[k]), p.status === 'reporting' && k === 'schedule' ? 'hl' : '')).join('')}
    ${p.transfer ? kv('Transfer Date', fmtDate(p.transfer.date)) : ''}
  </section>

  ${p.transfer || p.status === 'finished' ? `<section class="card ${rvState(p) !== 'registered' ? 'warn-card' : ''}"><div class="card-head"><h2>RV & Transfer Information</h2><button class="btn sm" data-act="geoTransfer" data-id="${p.id}">${ic('edit')} ${p.transfer ? 'Edit' : 'Register'}</button></div>
    ${p.transfer ? `
      ${kv('RV Number', p.transfer.rv ? `<span class="sel-text">${esc(p.transfer.rv)}</span>` : '<span class="dangerc">⚠ Missing RV</span>')}
      ${kv('Transfer Date', fmtDate(p.transfer.date))}
      ${kv('Transfer Amount', p.transfer.amount !== null && p.transfer.amount !== undefined && p.transfer.amount !== '' ? fmtMoney(p.transfer.amount) : '—')}
      ${kv('Transfer Method', esc(p.transfer.method || '—'))}
      ${kv('RV Registration Status', rvBadge(p))}
      ${p.transfer.related ? kv('Related Projects', relatedLinks) : ''}
      ${p.transfer.notes ? kv('Notes', esc(p.transfer.notes)) : ''}
      ${p.rvHistory.length ? `<details class="sub"><summary>RV audit history (${p.rvHistory.length})</summary>${p.rvHistory.slice().reverse().map(h => `<div class="hist"><b>${fmtDateTime(h.at)}</b> — ${h.action}${h.changes.length ? '<ul>' + h.changes.map(c => `<li>${esc(c.field)}: "${esc(c.old)}" → "${esc(c.new)}"</li>`).join('') + '</ul>' : ''}</div>`).join('')}</details>` : ''}
    ` : `<div class="banner danger">${ic('alert')}<div>Finished without transfer details. Register the RV.</div></div>`}
  </section>` : ''}

  ${cfs.length ? `<section class="card"><div class="card-head"><h2>Additional Fields</h2><button class="btn sm" data-act="geoEdit" data-id="${p.id}">${ic('edit')} Edit</button></div>
    ${cfs.map(cf => kv(cf.label, cf.type === 'file' && p.custom[cf.id] ? `<a href="javascript:void 0" data-act="attOpen" data-dept="geo" data-id="${p.id}" data-att="${cf.id}">${esc(p.custom[cf.id].name)}</a>` : esc(customValueText(cf, p.custom[cf.id]) || '—'))).join('')}</section>` : ''}

  ${notesSection('geo', p)}
  ${attachmentsSection('geo', p)}

  <section class="card"><h2>Status History</h2>
    ${p.statusHistory.slice().reverse().map(h => `<div class="hist"><b>${fmtDateTime(h.at)}</b> — ${h.from ? esc(geoLabel(h.from)) + ' → ' : ''}${esc(geoLabel(h.to))}${h.reason ? ` <small class="muted">(${esc(h.reason)})</small>` : ''}</div>`).join('')}
  </section>
  ${activitySection(acts)}`;
}
function notesSection(dept, p) {
  return `<section class="card"><div class="card-head"><h2>Notes <small>${p.notes.length}</small></h2><button class="btn sm" data-act="noteAdd" data-dept="${dept}" data-id="${p.id}">${ic('plus')} Add</button></div>
    ${p.notes.length ? p.notes.slice().reverse().map(n => `<div class="note"><div><small>${fmtDateTime(n.at)}</small><p>${esc(n.text).replace(/\n/g, '<br>')}</p></div><button class="icon-btn" data-act="noteDel" data-dept="${dept}" data-id="${p.id}" data-note="${n.id}">${ic('trash')}</button></div>`).join('') : '<div class="empty sm">No notes</div>'}</section>`;
}
function attachmentsSection(dept, p) {
  return `<section class="card"><div class="card-head"><h2>Attachments <small>${p.attachments.length}</small></h2><button class="btn sm" data-act="attAdd" data-dept="${dept}" data-id="${p.id}">${ic('clip')} Add</button></div>
    ${p.attachments.length ? p.attachments.map(a => `<div class="att"><button class="att-open" data-act="attOpen" data-dept="${dept}" data-id="${p.id}" data-att="${a.id}">${ic('file')}<span>${esc(a.name)}<small>${fmtSize(a.size)} · ${fmtDate(a.at)}</small></span></button><button class="icon-btn" data-act="attDel" data-dept="${dept}" data-id="${p.id}" data-att="${a.id}">${ic('trash')}</button></div>`).join('') : '<div class="empty sm">No attachments</div>'}</section>`;
}
function activitySection(acts) {
  return `<section class="card"><h2>Activity</h2>${acts.length ? acts.map(a => `<div class="hist"><b>${fmtDateTime(a.at)}</b> — ${esc(a.text)}</div>`).join('') : '<div class="empty sm">No activity</div>'}</section>`;
}
ACT.geoMore = async el => {
  const p = geoById(el.dataset.id); if (!p) return;
  const del = geoDeletable(p);
  const v = await chooseDlg(p.gsi, [
    { value: 'share', label: 'Share (WhatsApp, email…)', icon: 'share' },
    { value: 'transfer', label: p.transfer ? 'Edit Transfer / RV' : 'Register Transfer / RV', icon: 'receipt' },
    { value: 'xlsx', label: 'Export project — Excel', icon: 'download' },
    { value: 'pdf', label: 'Export project — PDF', icon: 'download' },
    { value: 'docx', label: 'Export project — Word', icon: 'download' },
    { value: 'json', label: 'Export project — JSON', icon: 'download' },
    { value: 'archive', label: p.archived ? 'Restore from Archive' : 'Archive', icon: 'archive' },
    { value: 'cancel', label: 'Cancel Project', icon: 'x', disabled: p.cancelled },
    { value: 'delete', label: 'Delete Permanently', icon: 'trash', danger: true, hint: del ? 'Only allowed before Report Done' : 'Not allowed — use Archive or Cancel', disabled: !del }
  ]);
  const fake = { dataset: { id: p.id } };
  if (v === 'share') ACT.geoShare(fake);
  else if (v === 'transfer') ACT.geoTransfer(fake);
  else if (['xlsx', 'pdf', 'docx', 'json'].includes(v)) exportScope('geo-one', v, { ids: [p.id] });
  else if (v === 'archive') ACT.geoArchive(fake);
  else if (v === 'cancel') ACT.geoCancel(fake);
  else if (v === 'delete') ACT.geoDelete(fake);
};
