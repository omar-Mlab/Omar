/* =========================================================
   exporters.js — Excel (XLSX), Word (DOCX), CSV, PDF (print),
   JSON. Works fully offline: XLSX/DOCX are built by hand.
   ========================================================= */
'use strict';

/* ---------- tiny ZIP writer (store, no compression) ---------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipBlob(files, mime) {
  const enc = new TextEncoder(); const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name); const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data; const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, a) => s + a.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: mime });
}
const xe = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function colLetter(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function excelSerial(iso) { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; }
const isISODate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/* ---------- cell text for CSV / DOCX / PDF ---------- */
function cellText(col, v) {
  if (v === null || v === undefined || v === '') return '';
  if (col.t === 'money') return fmtNum(v);
  if (col.t === 'num') return String(v);
  if (col.t === 'date') return isISODate(v) ? fmtDate(v) : String(v);
  return String(v);
}

/* ---------- XLSX ---------- */
function xlsxBlob(sheets) {
  const used = new Set();
  const names = sheets.map(s => { let n = (s.name || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31); let k = n, i = 2; while (used.has(k.toLowerCase())) k = n.slice(0, 28) + ' ' + i++; used.add(k.toLowerCase()); return k; });
  const moneyFmt = '#,##0' + (S.decimals > 0 ? '.' + '0'.repeat(S.decimals) : '');
  const dateFmt = { 'YYYY-MM-DD': 'yyyy-mm-dd', 'MM/DD/YYYY': 'mm/dd/yyyy', 'DD MMM YYYY': 'dd mmm yyyy' }[S.dateFormat] || 'dd/mm/yyyy';
  const files = [];
  files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
  files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
  files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xe(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  files.push({ name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="${xe(moneyFmt)}"/><numFmt numFmtId="165" formatCode="${xe(dateFmt)}"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` });
  sheets.forEach((s, si) => {
    const cols = s.cols;
    const widths = cols.map(c => Math.min(60, Math.max(c.h.length + 2, ...s.rows.slice(0, 300).map(r => cellText(c, r[c.k]).length + 2), c.t === 'money' ? 14 : 8)));
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>`;
    xml += `<row r="1">${cols.map((c, i) => `<c r="${colLetter(i)}1" t="inlineStr" s="1"><is><t>${xe(c.h)}</t></is></c>`).join('')}</row>`;
    s.rows.forEach((r, ri) => {
      const rn = ri + 2;
      xml += `<row r="${rn}">` + cols.map((c, i) => {
        const ref = colLetter(i) + rn; const v = r[c.k];
        if (v === null || v === undefined || v === '') return `<c r="${ref}" s="2"/>`;
        if ((c.t === 'money' || c.t === 'num') && isFinite(Number(v))) return `<c r="${ref}" s="${c.t === 'money' ? 3 : 2}"><v>${Number(v)}</v></c>`;
        if (c.t === 'date' && isISODate(v)) return `<c r="${ref}" s="4"><v>${excelSerial(v)}</v></c>`;
        return `<c r="${ref}" t="inlineStr" s="2"><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
      }).join('') + '</row>';
    });
    xml += `</sheetData>${s.rows.length ? `<autoFilter ref="A1:${colLetter(cols.length - 1)}${s.rows.length + 1}"/>` : ''}</worksheet>`;
    files.push({ name: `xl/worksheets/sheet${si + 1}.xml`, data: xml });
  });
  return zipBlob(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ---------- DOCX ---------- */
function docxBlob(title, sheets) {
  const run = (t, { b = false, sz = 18, color = '' } = {}) => `<w:r><w:rPr>${b ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
  const para = (inner, after = 80) => `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr>${inner}</w:p>`;
  const W = 15398;
  let body = para(run(S.appName, { b: true, sz: 20, color: '64748B' }), 0) + para(run(title, { b: true, sz: 32, color: '0F766E' }), 40) + para(run('Generated ' + fmtDateTime(nowISO()), { sz: 16, color: '64748B' }), 200);
  sheets.forEach(s => {
    const cols = printCols(s);
    const fz = cols.length > 9 ? 14 : 16;
    const cw = Math.floor(W / cols.length);
    body += para(run(s.name + (s.rows.length ? ` (${s.rows.length})` : ''), { b: true, sz: 24 }), 80);
    if (!s.rows.length) { body += para(run('No records', { sz: 16, color: '64748B' }), 200); return; }
    const bd = t => `<w:${t} w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>`;
    body += `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(bd).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cols.map(() => `<w:gridCol w:w="${cw}"/>`).join('')}</w:tblGrid>`;
    body += `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cols.map(c => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="0F766E"/></w:tcPr><w:p>${run(c.h, { b: true, sz: fz, color: 'FFFFFF' })}</w:p></w:tc>`).join('')}</w:tr>`;
    s.rows.forEach(r => {
      body += `<w:tr>${cols.map(c => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/></w:tcPr><w:p>${c.t === 'money' ? '<w:pPr><w:jc w:val="right"/></w:pPr>' : ''}${run(cellText(c, r[c.k]), { sz: fz })}</w:p></w:tc>`).join('')}</w:tr>`;
    });
    body += `</w:tbl>` + para('', 200);
  });
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipBlob([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/document.xml', data: doc }
  ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

/* ---------- CSV ---------- */
function csvBlob(sheets) {
  const q = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const out = [];
  sheets.forEach((s, i) => {
    if (sheets.length > 1) { if (i) out.push(''); out.push(q('### ' + s.name)); }
    out.push(s.cols.map(c => q(c.h)).join(','));
    s.rows.forEach(r => out.push(s.cols.map(c => q(c.t === 'money' || c.t === 'num' ? (r[c.k] ?? '') : cellText(c, r[c.k]))).join(',')));
  });
  return new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

/* ---------- PDF (via the phone's print → "Save as PDF") ---------- */
function printCols(s) { const p = s.cols.filter(c => c.p); return p.length ? p : s.cols; }
function printSheets(title, sheets) {
  const el = $('#print');
  const wide = sheets.some(s => printCols(s).length > 6);
  el.innerHTML = `<style>@page{size:A4 ${wide ? 'landscape' : 'portrait'};margin:12mm}</style>
    <div class="pr-head">${S.logo ? `<img src="${S.logo}" alt="">` : ''}<div><div class="pr-app">${esc(S.appName)}</div><h1>${esc(title)}</h1><div class="pr-date">Generated ${fmtDateTime(nowISO())}</div></div></div>
    ${sheets.map(s => { const cols = printCols(s); return `<h2>${esc(s.name)} <small>${s.rows.length}</small></h2>
      ${s.rows.length ? `<table><thead><tr>${cols.map(c => `<th>${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${s.rows.map(r => `<tr>${cols.map(c => `<td class="${c.t === 'money' ? 'num' : ''}">${esc(cellText(c, r[c.k]))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="pr-empty">No records</p>'}`; }).join('')}`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); el.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('printing') && !matchMedia('print').matches) done(); }, 1500); }, 100);
}

/* ---------- datasets ---------- */
function cfCols(dept) { return S.customFields.filter(f => f.dept === dept || f.dept === 'both').filter(f => f.type !== 'file').map(f => ({ h: f.label, k: 'cf_' + f.id, t: f.type === 'currency' ? 'money' : f.type === 'number' ? 'num' : f.type === 'date' ? 'date' : 'text', cf: f })); }
function cfVals(dept, p) { const o = {}; cfCols(dept).forEach(c => { const v = p.custom[c.cf.id]; o[c.k] = c.t === 'text' ? customValueText(c.cf, v) : (v ?? ''); }); return o; }
const geoCols = () => [
  { h: 'GSI Number', k: 'gsi', p: 1 }, { h: 'Consultant Name', k: 'consultant', p: 1 }, { h: 'Owner Name', k: 'owner', p: 1 }, { h: 'Location', k: 'location', p: 1 },
  { h: 'Status', k: 'status', p: 1 }, { h: 'Total Payment', k: 'total', t: 'money', p: 1 }, { h: 'Total Received', k: 'received', t: 'money', p: 1 },
  { h: 'Remaining Balance', k: 'remaining', t: 'money', p: 1 }, { h: 'Paid %', k: 'pct', t: 'num' },
  { h: 'Permit Date', k: 'permit', t: 'date' }, { h: 'Start Date', k: 'start', t: 'date' }, { h: 'Schedule Date', k: 'schedule', t: 'date' }, { h: 'Report Date', k: 'report', t: 'date' },
  { h: 'RV Number', k: 'rv', p: 1 }, { h: 'Transfer Date', k: 'tdate', t: 'date' }, { h: 'Transfer Amount', k: 'tamount', t: 'money' }, { h: 'Transfer Method', k: 'method' },
  { h: 'RV Registration Status', k: 'rvstatus' }, { h: 'Related Projects', k: 'related' }, { h: 'Archived / Cancelled', k: 'archived' }, { h: 'Created', k: 'created', t: 'date' },
  ...cfCols('geo')
];
function geoRow(p) {
  const t = p.transfer || {};
  return {
    gsi: p.gsi, consultant: p.consultant, owner: p.owner, location: p.location, status: geoLabel(p.status),
    total: Number(p.total) || 0, received: geoReceived(p), remaining: geoRemaining(p), pct: geoPct(p),
    permit: p.dates.permit || '', start: p.dates.start || '', schedule: p.dates.schedule || '', report: p.dates.report || '',
    rv: t.rv || '', tdate: t.date || '', tamount: t.amount ?? '', method: t.method || '', rvstatus: p.transfer ? RV_STATE_LABEL[rvState(p)] : '',
    related: t.related || '', archived: p.cancelled ? 'Cancelled' : p.archived ? 'Archived' : '', created: (p.createdAt || '').slice(0, 10), ...cfVals('geo', p)
  };
}
const payCols = [{ h: 'GSI Number', k: 'gsi', p: 1 }, { h: 'Owner Name', k: 'owner', p: 1 }, { h: '#', k: 'n', t: 'num', p: 1 }, { h: 'Payment Date', k: 'date', t: 'date', p: 1 }, { h: 'Payment Amount', k: 'amount', t: 'money', p: 1 }, { h: 'Payment Description', k: 'desc', p: 1 }, { h: 'Note', k: 'note', p: 1 }];
const payRows = list => list.flatMap(p => [...p.payments].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((x, i) => ({ gsi: p.gsi, owner: p.owner, n: i + 1, date: x.date, amount: x.amount, desc: x.desc, note: x.note })));
const matCols = () => [
  { h: 'Project Number', k: 'ref', p: 1 }, { h: 'Owner Name', k: 'owner', p: 1 }, { h: 'Consultant Name', k: 'consultant', p: 1 }, { h: 'Location', k: 'location', p: 1 },
  { h: 'Number of Cores', k: 'cores', t: 'num' }, { h: 'Basement', k: 'basement' }, { h: 'Ground Floor', k: 'ground' }, { h: 'Additional Floors', k: 'floors', t: 'num' }, { h: 'Roof', k: 'roof' },
  { h: 'Total Floors', k: 'tfloors', t: 'num', p: 1 }, { h: 'Building', k: 'building' }, { h: 'Total Payment', k: 'total', t: 'money', p: 1 }, { h: 'Lab M', k: 'labM', t: 'money', p: 1 },
  { h: 'Remaining', k: 'remaining', t: 'money', p: 1 }, { h: 'Status', k: 'status', p: 1 }, { h: 'First Payment', k: 'p1', t: 'money' }, { h: 'First Payment Status', k: 'p1s' },
  { h: 'Second Payment', k: 'p2', t: 'money' }, { h: 'Second Payment Status', k: 'p2s' }, { h: 'Lab Transfer Status', k: 'labs' },
  { h: 'Transfer Date', k: 'tdate', t: 'date' }, { h: 'Transfer Amount', k: 'tamount', t: 'money' }, { h: 'Transfer Reference', k: 'tref' }, { h: 'Archived', k: 'archived' }, ...cfCols('mat')
];
function matRow(p) {
  const a = p.approved, t = p.transfer || {}, yn = b => b ? 'Yes' : 'No';
  return { ref: p.ref, owner: p.owner, consultant: p.consultant, location: p.location, cores: p.cores ?? '', basement: yn(p.basement), ground: yn(p.ground), floors: p.floors || 0, roof: yn(p.roof),
    tfloors: matFloors(p), building: matFloorsText(p), total: Number(p.total) || 0, labM: Number(p.labM) || 0, remaining: matRemaining(p), status: matLabel(p.status),
    p1: a.p1Amount ?? '', p1s: a.p1Status || '', p2: a.p2Amount ?? '', p2s: a.p2Status || '', labs: a.labStatus || '', tdate: t.date || '', tamount: t.amount ?? '', tref: t.ref || '', archived: p.archived ? 'Yes' : '', ...cfVals('mat', p) };
}
const rvCols = () => [{ h: 'GSI Number', k: 'gsi', p: 1 }, { h: 'Consultant Name', k: 'consultant', p: 1 }, { h: 'Owner Name', k: 'owner', p: 1 }, { h: 'Location', k: 'location', p: 1 }, { h: 'RV Number', k: 'rv', p: 1 }, { h: 'Transfer Date', k: 'tdate', t: 'date', p: 1 }, { h: 'Transfer Amount', k: 'tamount', t: 'money', p: 1 }, { h: 'Transfer Method', k: 'method', p: 1 }, { h: 'RV Registration Status', k: 'rvstatus', p: 1 }, { h: 'Related Projects', k: 'related' }, { h: 'Notes', k: 'notes' }, { h: 'Current Status', k: 'status' }];
const rvRow = p => { const t = p.transfer || {}; return { gsi: p.gsi, consultant: p.consultant, owner: p.owner, location: p.location, rv: t.rv || '', tdate: t.date || '', tamount: t.amount ?? '', method: t.method || '', rvstatus: RV_STATE_LABEL[rvState(p)], related: t.related || '', notes: t.notes || '', status: geoLabel(p.status) }; };
const rvProjects = () => D.geo.filter(p => p.transfer || p.status === 'finished');

function kvSheet(name, pairs) { return { name, cols: [{ h: 'Field', k: 'f', p: 1 }, { h: 'Value', k: 'v', p: 1 }], rows: pairs.filter(x => x[1] !== '' && x[1] !== undefined && x[1] !== null).map(([f, v]) => ({ f, v: String(v) })) }; }

function buildDataset(scope, opts = {}) {
  const geoActive = D.geo;
  switch (scope) {
    case 'all': return { title: 'All Application Data', sheets: [{ name: 'Geotechnical', cols: geoCols(), rows: geoSorted(geoActive, 'gsi').map(geoRow) }, { name: 'Payments', cols: payCols, rows: payRows(geoSorted(geoActive, 'gsi')) }, { name: 'RV Records', cols: rvCols(), rows: geoSorted(rvProjects(), 'gsi').map(rvRow) }, { name: 'Material', cols: matCols(), rows: matSorted(D.mat, 'ref').map(matRow) }], json: { kind: 'full-backup', data: D, settings: settingsForExport() } };
    case 'geo': return { title: 'Geotechnical Projects', sheets: [{ name: 'Geotechnical', cols: geoCols(), rows: geoSorted(geoActive, 'gsi').map(geoRow) }, { name: 'Payments', cols: payCols, rows: payRows(geoSorted(geoActive, 'gsi')) }], json: { kind: 'geo', data: { geo: D.geo } } };
    case 'geo-status': {
      const l = geoSorted(D.geo.filter(p => p.status === opts.status && !p.archived), 'gsi');
      return { title: 'Geotechnical — ' + geoLabel(opts.status), sheets: [{ name: geoLabel(opts.status), cols: geoCols(), rows: l.map(geoRow) }, { name: 'Payments', cols: payCols, rows: payRows(l) }], json: { kind: 'geo', data: { geo: l } } };
    }
    case 'geo-one': {
      const p = geoById(opts.ids[0]); const r = geoRow(p);
      return { title: 'Project ' + p.gsi, sheets: [kvSheet('Project', geoCols().map(c => [c.h, cellText(c, r[c.k])])), { name: 'Payment History', cols: payCols, rows: payRows([p]) },
        { name: 'Status History', cols: [{ h: 'Date & Time', k: 'at', p: 1 }, { h: 'From', k: 'from', p: 1 }, { h: 'To', k: 'to', p: 1 }, { h: 'Reason', k: 'reason', p: 1 }], rows: p.statusHistory.map(h => ({ at: fmtDateTime(h.at), from: h.from ? geoLabel(h.from) : '', to: geoLabel(h.to), reason: h.reason || '' })) },
        { name: 'Notes', cols: [{ h: 'Date', k: 'at', p: 1 }, { h: 'Note', k: 'text', p: 1 }], rows: p.notes.map(n => ({ at: fmtDateTime(n.at), text: n.text })) }], json: { kind: 'geo', data: { geo: [p] } } };
    }
    case 'mat': return { title: 'Material Projects', sheets: [{ name: 'Material', cols: matCols(), rows: matSorted(D.mat, 'ref').map(matRow) }], json: { kind: 'mat', data: { mat: D.mat } } };
    case 'mat-status': { const l = matSorted(D.mat.filter(p => p.status === opts.status && !p.archived), 'ref'); return { title: 'Material — ' + matLabel(opts.status), sheets: [{ name: matLabel(opts.status), cols: matCols(), rows: l.map(matRow) }], json: { kind: 'mat', data: { mat: l } } }; }
    case 'mat-one': { const p = matById(opts.ids[0]); const r = matRow(p); return { title: 'Material ' + p.ref, sheets: [kvSheet('Project', matCols().map(c => [c.h, cellText(c, r[c.k])])), { name: 'Notes', cols: [{ h: 'Date', k: 'at', p: 1 }, { h: 'Note', k: 'text', p: 1 }], rows: p.notes.map(n => ({ at: fmtDateTime(n.at), text: n.text })) }], json: { kind: 'mat', data: { mat: [p] } } }; }
    case 'rv': { const l = geoSorted(rvProjects(), 'gsi'); return { title: 'RV Records', sheets: [{ name: 'RV Records', cols: rvCols(), rows: (opts.rows || l).map(rvRow) }, { name: 'RV Audit History', cols: [{ h: 'GSI Number', k: 'gsi', p: 1 }, { h: 'Date & Time', k: 'at', p: 1 }, { h: 'Action', k: 'action', p: 1 }, { h: 'Changes', k: 'ch', p: 1 }], rows: l.flatMap(p => p.rvHistory.map(h => ({ gsi: p.gsi, at: fmtDateTime(h.at), action: h.action, ch: h.changes.map(c => `${c.field}: "${c.old}" → "${c.new}"`).join('; ') }))) }], json: { kind: 'rv', records: l.map(p => ({ id: p.id, gsi: p.gsi, transfer: p.transfer, rvHistory: p.rvHistory })) } }; }
    case 'fin': {
      const sum = geoSorted(D.geo, 'gsi').map(p => ({ gsi: p.gsi, consultant: p.consultant, owner: p.owner, status: geoLabel(p.status), total: Number(p.total) || 0, received: geoReceived(p), remaining: geoRemaining(p), pct: geoPct(p), n: p.payments.length }));
      return { title: 'Financial Records', sheets: [
        { name: 'Geo Financial Summary', cols: [{ h: 'GSI Number', k: 'gsi', p: 1 }, { h: 'Consultant', k: 'consultant', p: 1 }, { h: 'Owner', k: 'owner', p: 1 }, { h: 'Status', k: 'status', p: 1 }, { h: 'Total Payment', k: 'total', t: 'money', p: 1 }, { h: 'Total Received', k: 'received', t: 'money', p: 1 }, { h: 'Remaining Balance', k: 'remaining', t: 'money', p: 1 }, { h: 'Paid %', k: 'pct', t: 'num', p: 1 }, { h: 'Payments', k: 'n', t: 'num' }], rows: sum },
        { name: 'Geo Payments', cols: payCols, rows: payRows(geoSorted(D.geo, 'gsi')) },
        { name: 'Material Financial', cols: [{ h: 'Project Number', k: 'ref', p: 1 }, { h: 'Owner', k: 'owner', p: 1 }, { h: 'Status', k: 'status', p: 1 }, { h: 'Total Payment', k: 'total', t: 'money', p: 1 }, { h: 'Lab M', k: 'labM', t: 'money', p: 1 }, { h: 'Remaining', k: 'remaining', t: 'money', p: 1 }, { h: 'First Payment', k: 'p1', t: 'money' }, { h: 'First Payment Status', k: 'p1s' }, { h: 'Second Payment', k: 'p2', t: 'money' }, { h: 'Second Payment Status', k: 'p2s' }, { h: 'Transfer Amount', k: 'tamount', t: 'money', p: 1 }, { h: 'Transfer Date', k: 'tdate', t: 'date', p: 1 }], rows: matSorted(D.mat, 'ref').map(matRow) }
      ], json: { kind: 'financial', geo: sum, payments: payRows(D.geo), material: D.mat.map(matRow) } };
    }
    case 'settings': return { title: 'Application Settings', sheets: [kvSheet('Settings', [['Application Name', S.appName], ['Theme', S.theme], ['Accent', S.accent], ['Currency', S.currency], ['Decimals', S.decimals], ['Number Format', S.numberFormat], ['Date Format', S.dateFormat], ['Custom Fields', S.customFields.map(f => f.label).join(', ')], ['Geotechnical Statuses', S.geoStatuses.map(s => s.label).join(' → ')], ['Material Statuses', S.matStatuses.map(s => s.label).join(' → ')]])], json: { kind: 'settings', settings: settingsForExport() } };
  }
}
function settingsForExport() { const s = clone(S); delete s.security; return s; }
const SCOPE_FILE = { all: 'All-Data', geo: 'Geotechnical', 'geo-status': 'Geo-Status', 'geo-one': 'Project', mat: 'Material', 'mat-status': 'Material-Status', 'mat-one': 'Material-Project', rv: 'RV-Records', fin: 'Financial', settings: 'Settings' };

async function exportScope(scope, fmt, opts = {}) {
  try {
    const ds = buildDataset(scope, opts);
    let name = 'MLOps_' + SCOPE_FILE[scope];
    if (opts.status) name += '-' + (scope.startsWith('geo') ? geoLabel(opts.status) : matLabel(opts.status)).replace(/\W+/g, '');
    if (opts.ids) name += '-' + String(scope === 'geo-one' ? geoById(opts.ids[0]).gsi : matById(opts.ids[0]).ref).replace(/[^\w-]+/g, '_');
    name += '_' + fileStamp();
    if (fmt === 'pdf') return printSheets(ds.title, ds.sheets);
    let blob;
    if (fmt === 'xlsx') blob = xlsxBlob(ds.sheets);
    else if (fmt === 'docx') blob = docxBlob(ds.title, ds.sheets);
    else if (fmt === 'csv') blob = csvBlob(ds.sheets);
    else if (fmt === 'json') blob = new Blob([JSON.stringify({ app: 'ML-OPS', schema: SCHEMA, exportedAt: nowISO(), ...ds.json }, null, 1)], { type: 'application/json' });
    downloadBlob(blob, name + '.' + fmt);
    if (scope === 'all' && fmt === 'json') { S.backup.lastDownload = nowISO(); save(); }
    toast('Exported: ' + name + '.' + fmt, 'ok', 3500);
    return blob;
  } catch (e) { console.error(e); toast('Export failed: ' + e.message, 'danger', 6000); }
}
