/* =========================================================
   views.js — Dashboard, Global Search, Quick Actions,
   RV Tracking, Project Statistics, Favorites, Recently Viewed
   ========================================================= */
'use strict';

/* ---------- Dashboard ---------- */
function viewDashboard() {
  const W = {
    search: () => `<div class="searchbar big" data-act="search" role="button">${ic('search')}<span>Search GSI, RV, consultant, owner, location…</span></div>`,
    quickadd: () => `<div class="two"><button class="btn primary xl" data-act="geoAdd">${ic('plus')} Geotechnical Project</button><button class="btn xl" data-act="matAdd">${ic('plus')} Material Project</button></div>`,
    shortcuts: () => `<div class="shortcuts">
        ${['geo', 'mat', 'rv'].filter(k => !navDef(k).hidden).map(k => `<button class="shortcut" data-act="go" data-h="#/${k}">${ic(navDef(k).icon, '', navDef(k).color)}<span>${esc(navDef(k).label)}</span></button>`).join('')}
        ${S.shortcuts.map(sc => `<button class="shortcut" data-act="shortcut" data-sid="${sc.id}">${ic(sc.icon || 'link', '', sc.color || '')}<span>${esc(sc.label)}</span></button>`).join('')}</div>`,
    quick: () => `<div class="sec-title">Quick Actions</div><div class="quick-grid">${quickActions().map(q => `<button class="quick" data-act="${q.act}" ${q.h ? `data-h="${q.h}"` : ''}>${ic(q.icon)}<span>${esc(q.label)}</span></button>`).join('')}</div>`,
    recent: () => { const l = recentList().slice(0, 5); return `<div class="sec-title">Recently Viewed <a href="#/recent">All</a></div>${l.length ? `<div class="mini-list">${l.map(miniRow).join('')}</div>` : '<div class="empty sm">Opened projects appear here</div>'}`; },
    favorites: () => { const l = favList().slice(0, 6); return `<div class="sec-title">Favorites <a href="#/fav">All</a></div>${l.length ? `<div class="mini-list">${l.map(miniRow).join('')}</div>` : '<div class="empty sm">Tap ☆ on a project to add it here</div>'}`; },
    attention: () => { const u = D.geo.filter(p => p.status === 'urgent' && !p.archived).length; const m = rvProjects().filter(p => rvState(p) !== 'registered').length; return `<div class="two"><button class="att-tile" data-act="go" data-h="#/geo/s/urgent">${ic('zap')}<span>${esc(geoLabel('urgent'))}</span><b>${u}</b></button><button class="att-tile ${m ? 'bad' : ''}" data-act="rvMissing">${ic('alert')}<span>RV Missing / Incomplete</span><b>${m}</b></button></div>`; }
  };
  const last = S.backup.lastDownload ? new Date(S.backup.lastDownload) : null;
  const needBackup = (D.geo.length || D.mat.length) && (!last || Date.now() - last > 7 * 86400000);
  return `
  <div class="hello">${S.logo ? `<img class="logo-lg" src="${S.logo}" alt="">` : ''}<div><h1>${esc(S.appName)}</h1><div class="muted">${fmtDate(todayISO())}</div></div></div>
  ${needBackup ? `<div class="banner warn">${ic('download')}<div>${last ? 'Last backup download: ' + fmtDate(localISO(last)) : 'No backup downloaded yet'}. Keep a copy outside the phone.</div><button class="btn sm" data-act="backupNow">Backup now</button></div>` : ''}
  ${S.dashboard.filter(w => w.on && W[w.key]).map(w => `<div class="widget">${W[w.key]()}</div>`).join('')}`;
}
function quickActions() {
  return [
    { act: 'geoAdd', icon: 'layers', label: 'Add Geotechnical Project' },
    { act: 'matAdd', icon: 'flask', label: 'Add Material Project' },
    { act: 'quickPay', icon: 'dollar', label: 'Record Payment' },
    { act: 'searchGsi', icon: 'hash', label: 'Search GSI' },
    { act: 'searchRv', icon: 'receipt', label: 'Search RV Number' },
    { act: 'go', h: '#/geo/s/finished', icon: 'flag', label: 'View Finished Projects' },
    { act: 'go', h: '#/rv', icon: 'list', label: 'Open RV Tracking' }
  ];
}
function recentList() { return D.recent.map(r => ({ dept: r.dept, p: projById(r.dept, r.id) })).filter(x => x.p); }
function favList() { return [...D.geo.filter(p => p.favorite).map(p => ({ dept: 'geo', p })), ...D.mat.filter(p => p.favorite).map(p => ({ dept: 'mat', p }))]; }
function miniRow({ dept, p }) {
  const id = dept === 'geo' ? p.gsi : p.ref;
  const sub = [p.consultant, p.owner, p.location].filter(Boolean).join(' · ');
  const rem = dept === 'geo' ? geoRemaining(p) : matRemaining(p);
  return `<button class="mini" data-act="${dept === 'geo' ? 'openGeo' : 'openMat'}" data-id="${p.id}"><span class="mini-main"><b>${esc(id)}</b><small>${esc(sub || '—')}</small></span><span class="mini-side">${badge(dept, p.status)}<small>Rem. ${fmtMoney(rem)}</small></span></button>`;
}
ACT.rvMissing = () => { rvFilter = 'missing'; nav('#/rv'); };
ACT.shortcut = el => {
  const sc = S.shortcuts.find(x => x.id === el.dataset.sid); if (!sc) return;
  if (/^https?:/i.test(sc.target)) window.open(sc.target, '_blank'); else nav(sc.target.startsWith('#') ? sc.target : '#/' + sc.target);
};

/* ---------- Quick Actions (floating button, available on every screen) ---------- */
ACT.quickMenu = async () => {
  const items = quickActions().map(q => ({ value: q, label: q.label, icon: q.icon }));
  S.shortcuts.forEach(sc => items.push({ value: { act: 'shortcut', sid: sc.id }, label: sc.label, icon: sc.icon || 'link' }));
  const v = await chooseDlg('Quick Actions', items);
  if (!v) return;
  await pendingBack;
  ACT[v.act]({ dataset: { h: v.h, sid: v.sid } });
};
ACT.quickPay = async () => { const p = await pickProject('geo', 'Record Payment — choose project'); if (p) geoRecordPayment(p); };
ACT.searchGsi = () => openSearch('gsi');
ACT.searchRv = () => openSearch('rv');
ACT.search = () => openSearch('all');

/* ---------- Global search ---------- */
function searchResults(q, mode) {
  if (!q.trim()) return [];
  const t = norm(q);
  let geo = D.geo, mat = D.mat;
  if (mode === 'gsi') { geo = geo.filter(p => norm(p.gsi).includes(t)); mat = mat.filter(p => norm(p.ref).includes(t)); }
  else if (mode === 'rv') { geo = geo.filter(p => p.transfer && norm(p.transfer.rv).includes(t)); mat = []; }
  else if (mode === 'geo') { geo = geo.filter(p => geoMatch(p, q)); mat = []; }
  else { geo = geo.filter(p => geoMatch(p, q)); mat = mat.filter(p => matMatch(p, q)); }
  return [...geo.map(p => ({ dept: 'geo', p })), ...mat.map(p => ({ dept: 'mat', p }))].slice(0, 80);
}
function searchItem({ dept, p }, pick) {
  if (dept === 'geo') {
    const sd = STATUS_DATE[p.status];
    const dates = [sd && p.dates[sd[0]] ? `${sd[1]}: ${fmtDate(p.dates[sd[0]])}` : '', p.transfer && p.transfer.date ? `Transfer: ${fmtDate(p.transfer.date)}` : ''].filter(Boolean).join(' · ');
    return `<button class="sres" data-pick="${pick}" data-dept="geo" data-id="${p.id}">
      <div class="sres-top"><b>${esc(p.gsi)}</b>${badge('geo', p.status)}</div>
      <div class="sres-sub">${esc([p.consultant, p.owner, p.location].filter(Boolean).join(' · ') || '—')}</div>
      <div class="sres-fin"><span>Total ${fmtMoney(p.total)}</span><span>Received ${fmtMoney(geoReceived(p))}</span><span class="${geoRemC(p) > 0 ? 'dangerc' : 'okc'}">Remaining ${fmtMoney(geoRemaining(p))}</span></div>
      ${dates || p.transfer ? `<div class="sres-sub">${dates}${p.transfer ? ` · RV ${p.transfer.rv ? esc(p.transfer.rv) : '<span class="dangerc">missing</span>'}` : ''}</div>` : ''}</button>`;
  }
  return `<button class="sres" data-pick="${pick}" data-dept="mat" data-id="${p.id}">
    <div class="sres-top"><b>${esc(p.ref)}</b>${badge('mat', p.status)}<span class="pill">Material</span></div>
    <div class="sres-sub">${esc([p.owner, p.consultant, p.location].filter(Boolean).join(' · ') || '—')}</div>
    <div class="sres-fin"><span>Total ${fmtMoney(p.total)}</span><span>Lab M ${fmtMoney(p.labM)}</span><span>Remaining ${fmtMoney(matRemaining(p))}</span></div></button>`;
}
function searchModal(mode, title, onPick) {
  const ph = { all: 'GSI, RV, consultant, owner, location…', gsi: 'GSI / project number…', rv: 'RV Number…', geo: 'GSI, consultant, owner, location…' }[mode];
  const w = openModal(`
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x>${ic('x')}</button></div>
    <div class="modal-body"><div class="searchbar">${ic('search')}<input id="gsq" type="search" placeholder="${esc(ph)}" autocomplete="off"></div><div id="gsr" class="sres-list"></div></div>`, { wide: true });
  let done = false;
  const finish = (v, fromPop) => { if (done) return; done = true; closeModal(w, fromPop).then(() => onPick(v)); };
  w._dismiss = fromPop => finish(null, fromPop);
  $('[data-x]', w).onclick = () => finish(null);
  const inp = $('#gsq', w), out = $('#gsr', w);
  const run = () => {
    const r = searchResults(inp.value, mode);
    out.innerHTML = inp.value.trim() ? (r.length ? r.map(x => searchItem(x, 1)).join('') : '<div class="empty sm">No results</div>') : '<div class="empty sm">Start typing to search</div>';
    $$('[data-pick]', out).forEach(b => b.onclick = () => finish({ dept: b.dataset.dept, p: projById(b.dataset.dept, b.dataset.id) }));
  };
  inp.oninput = run; run();
  setTimeout(() => inp.focus(), 80);
}
function openSearch(mode) {
  const title = { all: 'Search', gsi: 'Search GSI', rv: 'Search RV Number' }[mode];
  searchModal(mode, title, r => { if (r) nav(`#/${r.dept}/p/${r.p.id}`); });
}
function pickProject(dept, title) { return new Promise(res => searchModal(dept, title, r => res(r ? r.p : null))); }

/* ---------- RV Tracking ---------- */
let rvFilter = 'all', rvQuery = '';
function rvFiltered() {
  let l = rvProjects();
  if (rvFilter !== 'all') l = l.filter(p => rvState(p) === rvFilter);
  if (rvQuery.trim()) { const t = norm(rvQuery); l = l.filter(p => [p.transfer && p.transfer.rv, p.gsi, p.consultant, p.owner, p.location].map(norm).some(x => x.includes(t))); }
  return l.sort((a, b) => ((b.transfer && b.transfer.date) || '').localeCompare((a.transfer && a.transfer.date) || '') || String(a.gsi).localeCompare(String(b.gsi), undefined, { numeric: true }));
}
function viewRV() {
  const all = rvProjects();
  const cnt = k => all.filter(p => rvState(p) === k).length;
  const list = rvFiltered();
  const cols = S.rvColumns.filter(c => c.on);
  const cell = (p, k) => {
    const t = p.transfer || {};
    switch (k) {
      case 'gsi': return `<b>${esc(p.gsi)}</b>`;
      case 'consultant': return esc(p.consultant || ''); case 'owner': return esc(p.owner || ''); case 'location': return esc(p.location || '');
      case 'rv': return t.rv ? `<b class="sel-text">${esc(t.rv)}</b>` : '<span class="dangerc">⚠ Missing</span>';
      case 'tdate': return fmtDate(t.date); case 'tamount': return t.amount !== null && t.amount !== undefined && t.amount !== '' ? fmtMoney(t.amount) : '—';
      case 'method': return esc(t.method || '—'); case 'rvstatus': return rvBadge(p) || '';
      case 'notes': return esc([t.related ? 'Related: ' + t.related : '', t.notes].filter(Boolean).join(' · '));
    }
  };
  const chips = [['all', 'All Finished Projects', all.length], ['registered', 'RV Registered', cnt('registered')], ['missing', 'RV Missing', cnt('missing')], ['incomplete', 'Incomplete Transfer Details', cnt('incomplete')]];
  return `
  <div class="page-head"><h1>${ic(navDef('rv').icon)} ${esc(navDef('rv').label)}</h1></div>
  ${cnt('missing') || cnt('incomplete') ? `<div class="banner danger">${ic('alert')}<div><b>${cnt('missing')}</b> Finished project(s) without an RV Number · <b>${cnt('incomplete')}</b> with incomplete transfer details.</div></div>` : (all.length ? `<div class="banner ok">${ic('checkCircle')}<div>All Finished projects have a registered RV.</div></div>` : '')}
  <div class="chips">${chips.map(([k, l, n]) => `<button class="chip ${rvFilter === k ? 'on' : ''} ${k === 'missing' && n ? 'bad' : ''}" data-act="rvFilter" data-f="${k}">${esc(l)} <b>${n}</b></button>`).join('')}</div>
  <div class="searchbar">${ic('search')}<input id="rvQ" type="search" placeholder="Search RV, GSI, consultant, owner, location…" value="${esc(rvQuery)}"></div>
  <div class="row-actions">${['xlsx', 'csv', 'pdf', 'docx', 'json'].map(f => `<button class="btn sm ghost" data-act="rvExport" data-f="${f}">${ic('download')} ${f.toUpperCase()}</button>`).join('')}<button class="btn sm ghost" data-act="rvCopy">${ic('copy')} Copy</button></div>
  <div class="table-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th>${esc(RV_COLUMNS[c.key])}</th>`).join('')}</tr></thead>
    <tbody>${list.map(p => `<tr class="${rvState(p) === 'missing' ? 'row-bad' : rvState(p) === 'incomplete' ? 'row-warn' : ''}" data-act="openGeo" data-id="${p.id}">${cols.map(c => `<td>${cell(p, c.key)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="empty">No records</td></tr>`}</tbody></table></div>
  <div class="muted small">RV records are never deleted automatically and stay linked to their projects. Tap a row to open the project.</div>`;
}
function bindRV() { const q = $('#rvQ'); if (q) q.oninput = () => { rvQuery = q.value; renderKeepFocus('rvQ'); }; }
ACT.rvFilter = el => { rvFilter = el.dataset.f; render(); };
ACT.rvExport = el => exportScope('rv', el.dataset.f, { rows: rvFiltered() });
ACT.rvCopy = async () => {
  const l = rvFiltered(); if (!l.length) return toast('No records');
  const txt = `*RV Tracking* — ${l.length} record(s)\n${fmtDate(todayISO())}\n\n` + l.map(p => { const t = p.transfer || {}; return `*${p.gsi}* — RV: ${t.rv || '⚠ MISSING'}\n${[p.consultant, p.owner, p.location].filter(Boolean).join(' | ')}\nTransfer: ${fmtDate(t.date)} — ${t.amount !== undefined && t.amount !== null && t.amount !== '' ? fmtMoney(t.amount) : '—'} — ${t.method || '—'}${t.related ? '\nRelated: ' + t.related : ''}`; }).join('\n\n');
  if (await copyText(txt)) toast('Copied', 'ok');
};

/* ---------- Project Statistics ---------- */
function viewStats() {
  const g = D.geo.filter(p => !p.archived), m = D.mat.filter(p => !p.archived);
  const rv = rvProjects();
  const stat = (l, n, h, c = '') => `<button class="stat ${c}" ${h ? `data-act="go" data-h="${h}"` : ''}><span>${esc(l)}</span><b>${n}</b></button>`;
  return `
  <div class="page-head"><h1>${ic(navDef('stats').icon)} ${esc(navDef('stats').label)}</h1></div>
  <section class="card"><h2>Geotechnical</h2><div class="stats">
    ${stat('Total Geotechnical Projects', g.length, '#/geo', 'main')}
    ${S.geoStatuses.map(s => stat(s.label, g.filter(p => p.status === s.key).length, '#/geo/s/' + s.key)).join('')}
    ${stat('RV Registered', rv.filter(p => rvState(p) === 'registered').length, '#/rv', 'okb')}
    ${stat('RV Missing', rv.filter(p => rvState(p) === 'missing').length, '#/rv', 'badb')}
    ${stat('Incomplete Transfer', rv.filter(p => rvState(p) === 'incomplete').length, '#/rv')}
    ${stat('Archived / Cancelled', D.geo.length - g.length, '#/geo/s/archived')}
  </div></section>
  <section class="card"><h2>Material</h2><div class="stats">
    ${stat('Total Material Projects', m.length, '#/mat', 'main')}
    ${S.matStatuses.map(s => stat(s.label, m.filter(p => p.status === s.key).length, '#/mat/s/' + s.key)).join('')}
  </div></section>
  <div class="muted small">Counts are calculated live from the database (archived projects excluded).</div>`;
}

/* ---------- Favorites & Recently Viewed ---------- */
function viewFav() {
  const l = favList();
  return `<div class="page-head"><h1>${ic(navDef('fav').icon)} ${esc(navDef('fav').label)}</h1></div>
    <div class="cards">${l.map(x => x.dept === 'geo' ? geoCard(x.p) : matCard(x.p)).join('') || '<div class="empty">No favorites yet. Tap ☆ on any project.</div>'}</div>`;
}
function viewRecent() {
  const l = recentList();
  return `<div class="page-head"><h1>${ic(navDef('recent').icon)} ${esc(navDef('recent').label)}</h1>${l.length ? '<button class="btn sm ghost" data-act="clearRecent">Clear</button>' : ''}</div>
    <div class="cards">${l.map(x => x.dept === 'geo' ? geoCard(x.p) : matCard(x.p)).join('') || '<div class="empty">No recently viewed projects</div>'}</div>`;
}
ACT.clearRecent = () => { D.recent = []; save(); render(); };

/* ---------- Saved filters (views) ---------- */
ACT.saveFilter = async el => {
  const dept = el.dataset.dept, status = el.dataset.status;
  const lbl = status === 'archived' ? 'Archived' : statusDef(dept, status).label;
  const v = await formDialog({ title: 'Save this view', intro: `Saves the current list (${esc(lbl)}${listQuery[dept] ? `, filter "${esc(listQuery[dept])}"` : ''}) as a shortcut chip.`, fields: [{ name: 'name', label: 'Name', required: true, value: lbl + (listQuery[dept] ? ' · ' + listQuery[dept] : '') }] });
  if (!v) return;
  S.savedFilters.push({ id: uid(), name: v.name, dept, status, q: listQuery[dept] || '', sort: listSort[dept] || '' });
  save(); toast('View saved', 'ok');
};
ACT.openFilter = el => {
  const f = S.savedFilters.find(x => x.id === el.dataset.fid); if (!f) return;
  pendingFilter = f; nav(`#/${f.dept}/s/${f.status}`);
};
let pendingFilter = null;
