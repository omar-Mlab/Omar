/* =========================================================
   ui.js — modals, dialogs, forms, toasts, navigation helpers
   ========================================================= */
'use strict';

/* Click actions: any element with data-act="name" calls ACT[name](element) */
const ACT = {};

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg, kind = '', ms = 2600) {
  const t = $('#toast');
  t.className = 'show ' + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, ms);
}

/* ---------- navigation (hash routes, works with Android back button) ---------- */
let pendingBack = Promise.resolve();
async function nav(hash) {
  await pendingBack;
  if (location.hash === hash) render(); else location.hash = hash;
}

/* ---------- modals (bottom sheets on phone) ---------- */
const modalStack = [];
let suppressPop = 0, popResolver = null;
function openModal(html, { wide = false, onClose = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) wrap._dismiss && wrap._dismiss(); });
  $('#modals').appendChild(wrap);
  wrap._onClose = onClose;
  modalStack.push(wrap);
  history.pushState({ modal: modalStack.length }, '');
  requestAnimationFrame(() => wrap.classList.add('in'));
  return wrap;
}
function closeModal(wrap, fromPop = false) {
  const i = modalStack.indexOf(wrap);
  if (i < 0) return Promise.resolve();
  modalStack.splice(i, 1);
  wrap.remove();
  if (wrap._onClose) wrap._onClose();
  if (fromPop) return Promise.resolve();
  suppressPop++;
  pendingBack = new Promise(res => {
    popResolver = res;
    setTimeout(() => { if (popResolver === res) { popResolver = null; res(); } }, 400);
  });
  history.back();
  return pendingBack;
}
window.addEventListener('popstate', () => {
  if (suppressPop > 0) { suppressPop--; if (popResolver) { const r = popResolver; popResolver = null; r(); } return; }
  if (modalStack.length) { const top = modalStack[modalStack.length - 1]; top._dismiss ? top._dismiss(true) : closeModal(top, true); }
});

/* ---------- confirm / alert / choose ---------- */
function confirmDlg(msg, { title = 'Please confirm', okText = 'Confirm', danger = false, cancelText = 'Cancel' } = {}) {
  return new Promise(res => {
    const w = openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3></div>
      <div class="modal-body"><div class="msg">${msg}</div></div>
      <div class="modal-foot">
        <button class="btn ghost" data-r="0">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okText)}</button>
      </div>`);
    let done = false;
    const finish = (v, fromPop) => { if (done) return; done = true; closeModal(w, fromPop).then(() => res(v)); };
    w._dismiss = fromPop => finish(false, fromPop);
    $$('[data-r]', w).forEach(b => b.onclick = () => finish(b.dataset.r === '1'));
  });
}
function alertDlg(msg, title = 'Notice') {
  return new Promise(res => {
    const w = openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3></div>
      <div class="modal-body"><div class="msg">${msg}</div></div>
      <div class="modal-foot"><button class="btn primary" data-ok>OK</button></div>`);
    let done = false;
    const finish = fromPop => { if (done) return; done = true; closeModal(w, fromPop).then(() => res()); };
    w._dismiss = fromPop => finish(fromPop);
    $('[data-ok]', w).onclick = () => finish(false);
  });
}
/* items: [{value,label,icon,hint,danger,disabled,color}] */
function chooseDlg(title, items, { subtitle = '' } = {}) {
  return new Promise(res => {
    const w = openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x>${ic('x')}</button></div>
      ${subtitle ? `<div class="modal-sub">${subtitle}</div>` : ''}
      <div class="modal-body menu-list">
        ${items.map((it, i) => `<button class="menu-item ${it.danger ? 'danger' : ''}" data-i="${i}" ${it.disabled ? 'disabled' : ''}>
          ${it.icon ? ic(it.icon, '', it.color || '') : (it.color ? `<span class="dot-lg" style="background:${esc(it.color)}"></span>` : '')}
          <span class="mi-text"><b>${esc(it.label)}</b>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span>
        </button>`).join('')}
      </div>`);
    let done = false;
    const finish = (v, fromPop) => { if (done) return; done = true; closeModal(w, fromPop).then(() => res(v)); };
    w._dismiss = fromPop => finish(null, fromPop);
    $('[data-x]', w).onclick = () => finish(null);
    $$('[data-i]', w).forEach(b => b.onclick = () => finish(items[+b.dataset.i].value));
  });
}

/* ---------- form fields ---------- */
function optList(options) { return (options || []).map(o => typeof o === 'object' ? o : { v: o, l: o }); }
function fieldHTML(f) {
  const id = 'f_' + f.name;
  const req = f.required ? '<span class="req">*</span>' : '';
  const v = f.value ?? '';
  const lab = `<label for="${id}">${esc(f.label)}${req}</label>`;
  const hint = f.hint ? `<div class="hint">${f.hint}</div>` : '';
  const common = `id="${id}" name="${esc(f.name)}" ${f.readonly ? 'readonly' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}`;
  let input = '';
  switch (f.type) {
    case 'textarea': input = `<textarea ${common} rows="${f.rows || 3}">${esc(v)}</textarea>`; break;
    case 'money': case 'number':
      input = `<input ${common} type="text" inputmode="decimal" autocomplete="off" value="${v === null ? '' : esc(v)}">`; break;
    case 'int': input = `<input ${common} type="number" inputmode="numeric" min="0" step="1" value="${v === null ? '' : esc(v)}">`; break;
    case 'date': input = `<input ${common} type="date" value="${esc(v)}">`; break;
    case 'color': input = `<input ${common} type="color" value="${esc(v || '#0f766e')}">`; break;
    case 'password': input = `<input ${common} type="password" inputmode="${f.numeric ? 'numeric' : 'text'}" autocomplete="new-password">`; break;
    case 'select':
      input = `<select ${common}>${optList(f.options).map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`; break;
    case 'yesno': {
      const cur = v === true ? 'yes' : v === false ? 'no' : '';
      input = `<div class="seg" data-seg="${esc(f.name)}">
        <input type="hidden" name="${esc(f.name)}" value="${cur}">
        <button type="button" class="${cur === 'yes' ? 'on' : ''}" data-v="yes">Yes</button>
        <button type="button" class="${cur === 'no' ? 'on' : ''}" data-v="no">No</button></div>`; break;
    }
    case 'checkbox':
      return `<div class="field check ${f.full ? 'full' : ''}"><label class="cb"><input type="checkbox" name="${esc(f.name)}" ${v ? 'checked' : ''}> <span>${esc(f.label)}${req}</span></label>${hint}</div>`;
    case 'multi': {
      const arr = Array.isArray(v) ? v : [];
      input = `<div class="multi">${optList(f.options).map(o => `<label class="cb"><input type="checkbox" name="${esc(f.name)}" value="${esc(o.v)}" ${arr.includes(o.v) ? 'checked' : ''}> <span>${esc(o.l)}</span></label>`).join('')}</div>`; break;
    }
    case 'file': case 'files':
      input = `${f.current ? `<div class="hint">Current: ${esc(f.current)} <label class="cb inline"><input type="checkbox" name="${esc(f.name)}__remove"> remove</label></div>` : ''}
        <input ${common} type="file" ${f.type === 'files' ? 'multiple' : ''} ${f.accept ? `accept="${esc(f.accept)}"` : ''}>`; break;
    default:
      input = `<input ${common} type="text" autocomplete="off" value="${esc(v)}" ${f.list ? `list="${esc(f.list)}"` : ''}>`;
  }
  return `<div class="field ${f.full || f.type === 'textarea' ? 'full' : ''}">${lab}${input}${hint}</div>`;
}
function bindFormWidgets(root) {
  $$('[data-seg]', root).forEach(seg => {
    $$('button', seg).forEach(b => b.onclick = () => {
      const h = $('input', seg);
      const nv = h.value === b.dataset.v ? '' : b.dataset.v;
      h.value = nv;
      $$('button', seg).forEach(x => x.classList.toggle('on', x.dataset.v === nv));
      h.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}
function readForm(root, fields) {
  const out = {}, errors = [];
  for (const f of fields) {
    if (f.type === 'html') continue;
    const els = $$(`[name="${CSS.escape(f.name)}"]`, root);
    const el = els[0];
    let v;
    switch (f.type) {
      case 'money': case 'number': {
        const raw = el ? el.value.trim() : '';
        v = parseNum(raw);
        if (raw && v === null) errors.push(`${f.label}: please enter a valid number`);
        if (v !== null && f.type === 'money' && v < 0) errors.push(`${f.label}: cannot be negative`);
        break;
      }
      case 'int': v = el && el.value !== '' ? Math.max(0, parseInt(el.value, 10) || 0) : null; break;
      case 'checkbox': v = !!(el && el.checked); break;
      case 'yesno': v = el && el.value === 'yes' ? true : el && el.value === 'no' ? false : null; break;
      case 'multi': v = els.filter(x => x.checked).map(x => x.value); break;
      case 'file': v = el && el.files && el.files[0] ? el.files[0] : null; out[f.name + '__remove'] = !!$(`[name="${CSS.escape(f.name)}__remove"]`, root)?.checked; break;
      case 'files': v = el && el.files ? [...el.files] : []; break;
      default: v = el ? el.value.trim() : '';
    }
    if (f.required) {
      const empty = v === null || v === '' || (Array.isArray(v) && !v.length) || (f.type === 'file' && !v && !f.current);
      if (empty) errors.push(`${f.label} is required`);
    }
    out[f.name] = v;
  }
  return { values: out, errors };
}

/* fields: array of field specs; validate(values) → error string | null (may be async) */
function formDialog({ title, fields, okText = 'Save', validate = null, intro = '', wide = false, danger = false, onChange = null }) {
  return new Promise(res => {
    const w = openModal(`
      <form novalidate>
        <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-x>${ic('x')}</button></div>
        <div class="modal-body">
          ${intro ? `<div class="intro">${intro}</div>` : ''}
          <div class="form-grid">${fields.map(f => f.type === 'html' ? `<div class="field full">${f.html}</div>` : fieldHTML(f)).join('')}</div>
          <div class="form-error" hidden></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn ghost" data-x>Cancel</button>
          <button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(okText)}</button>
        </div>
      </form>`, { wide });
    bindFormWidgets(w);
    const form = $('form', w);
    if (onChange) { form.addEventListener('input', () => onChange(form)); form.addEventListener('change', () => onChange(form)); onChange(form); }
    let done = false;
    const finish = (v, fromPop) => { if (done) return; done = true; closeModal(w, fromPop).then(() => res(v)); };
    w._dismiss = fromPop => finish(null, fromPop);
    $$('[data-x]', w).forEach(b => b.onclick = () => finish(null));
    form.onsubmit = async e => {
      e.preventDefault();
      const { values, errors } = readForm(form, fields);
      const box = $('.form-error', w);
      let err = errors.length ? errors.join('<br>') : null;
      if (!err && validate) err = await validate(values);
      if (err) { box.innerHTML = err; box.hidden = false; box.scrollIntoView({ block: 'nearest' }); return; }
      finish(values);
    };
    const first = $('input:not([type=hidden]):not([readonly]),select,textarea', form);
    if (first && window.innerWidth > 700) setTimeout(() => first.focus(), 60);
  });
}
function promptDate(label, def, intro = '') {
  return formDialog({ title: label, intro, okText: 'Confirm', fields: [{ name: 'date', label, type: 'date', value: def || todayISO(), required: true }] })
    .then(v => v ? v.date : null);
}

/* ---------- datalists for consultant / owner / location suggestions ---------- */
function datalistsHTML() {
  const uniq = arr => [...new Set(arr.filter(Boolean).map(s => s.trim()))].sort((a, b) => a.localeCompare(b));
  const all = [...D.geo, ...D.mat];
  return `<datalist id="dl-consultant">${uniq(all.map(p => p.consultant)).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="dl-owner">${uniq(all.map(p => p.owner)).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="dl-location">${uniq(all.map(p => p.location)).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="dl-paydesc">${uniq([...S.paymentDescriptions, ...S.paymentCategories]).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="dl-method">${uniq(S.transferMethods).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
}
function refreshDatalists() { const el = $('#datalists'); if (el) el.innerHTML = datalistsHTML(); }

/* ---------- status badge ---------- */
function statusDef(dept, key) {
  const list = dept === 'geo' ? S.geoStatuses : S.matStatuses;
  return list.find(s => s.key === key) || { key, label: key, color: '#64748b', icon: 'circle' };
}
function badge(dept, key) {
  const s = statusDef(dept, key);
  return `<span class="badge" style="--c:${esc(s.color)}">${ic(s.icon || 'circle')}${esc(s.label)}</span>`;
}

/* ---------- custom fields in forms ---------- */
function customFieldsFor(dept) {
  return S.customFields.filter(f => !f.hidden && (f.dept === dept || f.dept === 'both')).sort((a, b) => (a.order || 0) - (b.order || 0));
}
function customFieldSpecs(dept, p) {
  return customFieldsFor(dept).map(cf => {
    const v = p && p.custom ? p.custom[cf.id] : undefined;
    const base = { name: 'cf_' + cf.id, label: cf.label, required: !!cf.required };
    switch (cf.type) {
      case 'longtext': return { ...base, type: 'textarea', value: v ?? '' };
      case 'number': return { ...base, type: 'number', value: v ?? '' };
      case 'currency': return { ...base, type: 'money', value: v ?? '' };
      case 'date': return { ...base, type: 'date', value: v ?? '' };
      case 'dropdown': return { ...base, type: 'select', value: v ?? '', options: [{ v: '', l: '—' }, ...cf.options] };
      case 'multi': return { ...base, type: 'multi', value: v || [], options: cf.options };
      case 'yesno': return { ...base, type: 'yesno', value: v ?? null };
      case 'checkbox': return { ...base, type: 'checkbox', value: !!v };
      case 'file': return { ...base, type: 'file', current: v && v.name ? v.name : '' };
      default: return { ...base, type: 'text', value: v ?? '' };
    }
  });
}
async function applyCustomValues(dept, p, values) {
  for (const cf of customFieldsFor(dept)) {
    const k = 'cf_' + cf.id;
    if (!(k in values)) continue;
    if (cf.type === 'file') {
      if (values[k]) {
        if (values[k].size > 8 * 1048576) { toast('File too large (max 8 MB): ' + values[k].name, 'danger'); continue; }
        p.custom[cf.id] = { name: values[k].name, type: values[k].type, size: values[k].size, data: await readFileAsDataURL(values[k]) };
      } else if (values[k + '__remove']) delete p.custom[cf.id];
    } else p.custom[cf.id] = values[k];
  }
}
function customValueText(cf, v) {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '';
  switch (cf.type) {
    case 'currency': return fmtMoney(v);
    case 'number': return fmtNum(v, Number.isInteger(+v) ? 0 : undefined);
    case 'date': return fmtDate(v);
    case 'multi': return v.join(', ');
    case 'yesno': return v === true ? 'Yes' : v === false ? 'No' : '';
    case 'checkbox': return v ? '✓' : '';
    case 'file': return v.name || '';
    default: return String(v);
  }
}
