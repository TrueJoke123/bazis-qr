import { prepare, edgesOf, fmt, esc } from './model.js';
import { drawingSVG, holeTable, edgeTable } from './drawing.js';
import { SIZES, labelHTML } from './labels.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const BASE = location.origin + location.pathname.replace(/index\.html$/, '');
let model = null, viewer = null, current = '3d';

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } }
};
const partUrl = p => `${BASE}?m=${encodeURIComponent(model.id)}&d=${p.n}`;

function toast(html, ms = 2600) {
  const t = $('#toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
}

// ------------------------------------------------------------ главная
async function home() {
  $('#home').hidden = false;
  let list = [];
  try { list = await (await fetch('models/index.json', { cache: 'no-cache' })).json(); } catch { list = []; }
  $('#home').innerHTML = `<div class="doc"><h1>Модели</h1>
    ${list.length ? '<div class="mlist">' + list.map(m => `<a class="mcard" href="?m=${encodeURIComponent(m.id)}"><b>${esc(m.name)}</b><span>${esc(m.order || '')}</span><small>${m.parts} дет. · ${new Date(m.date).toLocaleDateString('ru-RU')}</small></a>`).join('') + '</div>'
      : '<p class="muted">Пока нет моделей. Запустите в Базисе скрипт «BazisQR_Выгрузка».</p>'}</div>`;
}

// ------------------------------------------------------------ вкладки
function showTab(t) {
  current = t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.page').forEach(s => { s.hidden = s.id !== 'tab-' + t; });
  if (t === '3d' && viewer) viewer.resize();
  if (t === 'parts') renderParts();
  if (t === 'spec') renderSpec();
  if (t === 'check') renderCheck();
  if (t === 'labels') renderLabels();
  const u = new URL(location.href);
  if (t === '3d') u.searchParams.delete('tab'); else u.searchParams.set('tab', t);
  history.replaceState(null, '', u);
}

function blockOptions(sel, val) {
  sel.innerHTML = `<option value="">Все блоки</option>` + model.blocks.map(b => `<option${b === val ? ' selected' : ''}>${esc(b)}</option>`).join('');
}

// ------------------------------------------------------------ карточка детали
function partCard(p) {
  const card = $('#card');
  if (!p) { card.hidden = true; return; }
  const ed = edgesOf(p);
  const emat = [...new Set(ed.map(e => e.mat + (e.t ? ' ' + fmt(e.t) : '')))].join(', ');
  const chk = store.get('bqr-check-' + model.id, {});
  if (p.buy) {
    const f = model.furn[p.fi] || {};
    card.innerHTML = `<div class="ch"><b>Фурнитура</b><button class="x" data-act="close">✕</button></div><div class="cn">${esc(f.name || p.name)}</div><div class="cm">${esc(p.mat)}</div>`;
  } else {
    card.innerHTML = `<div class="ch"><span class="num">${p.n}</span><b>${esc(p.label)}</b>${chk[p.n] ? '<span class="ok">✓ есть</span>' : ''}<button class="x" data-act="close">✕</button></div>
      ${p.des && p.name && p.des !== p.name ? `<div class="cm">${esc(p.name)}</div>` : ''}
      <div class="cd">${fmt(p.L)} × ${fmt(p.W)} × ${fmt(p.t)} мм</div>
      <div class="cm">${esc(p.mat)}</div>
      <div class="cm">Кромка: ${esc(emat || 'нет')}</div>
      <div class="cm">Блок: ${esc(p.block)} · отверстий: ${p.holes.length}${p.cuts ? ' · пазов: ' + p.cuts.length : ''}</div>
      <div class="cb"><button data-act="draw">Чертёж</button><button data-act="ghost">${viewer.ghost ? 'Показать все' : 'Только она'}</button>${!chk[p.n] ? '<button data-act="mark">Отметить ✓</button>' : ''}</div>`;
  }
  card.hidden = false;
  card.onclick = e => {
    const a = e.target.dataset.act; if (!a) return;
    if (a === 'close') { viewer.select(null); partCard(null); }
    if (a === 'draw') openDrawing(p);
    if (a === 'ghost') { viewer.select(p, { ghost: !viewer.ghost }); partCard(p); }
    if (a === 'mark') { markScanned(p.n); partCard(p); }
  };
}

function pick(p, opts) {
  viewer.select(p, opts);
  partCard(p);
}

// ------------------------------------------------------------ чертёж
function openDrawing(p, mirror = false) {
  $('#mTitle').textContent = `№${p.n} · ${p.label} · ${fmt(p.L)}×${fmt(p.W)}×${fmt(p.t)}`;
  $('#mTools').innerHTML = `<button id="mMir">${mirror ? 'Сторона A' : 'Сторона B'}</button><button id="mPrint">Печать</button>`;
  $('#mBody').innerHTML = `<div class="dwrap">${drawingSVG(p, { mirror })}</div>
    <div class="dinfo"><div>${esc(p.mat)} · ${fmt(p.t)} мм${p.block !== '—' ? ' · ' + esc(p.block) : ''}</div>${edgeTable(p)}
    ${p.cuts ? `<p>Пазы: ${p.cuts.map(esc).join(', ')}</p>` : ''}
    <h3>Отверстия</h3>${holeTable(p, mirror)}
    <p class="muted">X, Y — от левого нижнего угла на виде. Сплошные — на видимой пласти, пунктир — на обратной, жёлтые — в торец.</p></div>`;
  $('#modal').hidden = false;
  $('#mMir').onclick = () => openDrawing(p, !mirror);
  $('#mPrint').onclick = () => { document.body.classList.add('print-modal'); print(); document.body.classList.remove('print-modal'); };
}
$('#mClose').onclick = () => { $('#modal').hidden = true; };
$('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').hidden = true; };

// ------------------------------------------------------------ список деталей
function renderParts() {
  const q = ($('#pSearch').value || '').toLowerCase(), b = $('#pBlock').value;
  const chk = store.get('bqr-check-' + model.id, {});
  const rows = model.own.filter(p => (!b || p.block === b) &&
    (!q || String(p.n) === q || (p.label + ' ' + p.name + ' ' + p.mat).toLowerCase().includes(q)));
  $('#pList').innerHTML = rows.map(p => `<div class="prow" data-n="${p.n}">
      <span class="num">${p.n}</span>
      <div class="pm"><b>${esc(p.label)}</b><small>${esc(p.mat)}${p.block !== '—' ? ' · ' + esc(p.block) : ''}</small></div>
      <div class="pd">${fmt(p.L)}×${fmt(p.W)}×${fmt(p.t)}<small>${p.holes.length ? 'отв. ' + p.holes.length : ''}${chk[p.n] ? ' <span class="ok">✓</span>' : ''}</small></div>
      <button data-act="draw" title="Чертёж">📐</button><button data-act="3d" title="Показать в 3D">3D</button></div>`).join('') || '<p class="muted">Ничего не найдено.</p>';
}
$('#pSearch').oninput = renderParts;
$('#pBlock').onchange = renderParts;
$('#pList').onclick = e => {
  const row = e.target.closest('.prow'); if (!row) return;
  const p = model.byN.get(+row.dataset.n);
  if (e.target.dataset.act === '3d') { showTab('3d'); pick(p, { ghost: true, focus: true }); }
  else openDrawing(p);
};

// ------------------------------------------------------------ спецификация
function renderSpec() {
  const groups = new Map();
  for (const p of model.own) {
    const g = groups.get(p.mat) || { mat: p.mat, rows: new Map(), area: 0, n: 0 };
    const key = [p.des, p.name, fmt(p.L), fmt(p.W), fmt(p.t), edgesOf(p).map(e => e.side + e.mat).sort().join()].join('|');
    const r = g.rows.get(key) || { p, ns: [], q: 0 };
    r.ns.push(p.n); r.q++; g.rows.set(key, r);
    g.area += Math.abs(p.outer.length ? polyArea2(p.outer) : p.L * p.W) / 1e6; g.n++;
    groups.set(p.mat, g);
  }
  const edgeSum = new Map();
  for (const p of model.own) for (const e of edgesOf(p)) {
    const k = e.mat + (e.t ? ' ' + fmt(e.t) + ' мм' : '');
    edgeSum.set(k, (edgeSum.get(k) || 0) + e.len / 1000);
  }
  const fast = countBy(model.fasteners.filter(f => !f.buy), f => f.name);
  const furn = countBy(model.furn, f => f.name);

  let h = `<div class="dochead"><h1>Спецификация</h1><button onclick="print()">Печать</button></div>
    <p class="muted">${esc(model.name)}${model.order ? ' · ' + esc(model.order) : ''} · ${model.own.length} деталей</p>`;
  for (const g of [...groups.values()].sort((a, b) => b.area - a.area)) {
    h += `<h2>${esc(g.mat)} <small>${g.n} шт · ${fmt(g.area)} м²</small></h2><table class="tbl"><thead><tr><th>№№</th><th>Обозначение</th><th>Наименование</th><th>Длина</th><th>Ширина</th><th>Толщ.</th><th>Кол.</th><th>Кромка</th></tr></thead><tbody>`;
    for (const r of g.rows.values()) {
      const em = [...new Set(edgesOf(r.p).map(e => e.mat))].join(', ');
      const sides = edgesOf(r.p).length;
      h += `<tr><td>${r.ns.join(', ')}</td><td>${esc(r.p.des)}</td><td>${esc(r.p.name)}</td><td>${fmt(r.p.L)}</td><td>${fmt(r.p.W)}</td><td>${fmt(r.p.t)}</td><td>${r.q}</td><td>${sides ? sides + ' ст. · ' + esc(em) : '—'}</td></tr>`;
    }
    h += '</tbody></table>';
  }
  if (edgeSum.size) h += `<h2>Кромка</h2><table class="tbl"><thead><tr><th>Материал</th><th>Длина, м</th></tr></thead><tbody>${[...edgeSum].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${fmt(v)}</td></tr>`).join('')}</tbody></table>`;
  if (furn.length) h += `<h2>Фурнитура</h2><table class="tbl"><thead><tr><th>Наименование</th><th>Кол.</th></tr></thead><tbody>${furn.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody></table>`;
  if (fast.length) h += `<h2>Крепёж</h2><table class="tbl"><thead><tr><th>Наименование</th><th>Кол.</th></tr></thead><tbody>${fast.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody></table>`;
  $('#tab-spec').innerHTML = h;
}
function polyArea2(p) { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return s / 2; }
function countBy(arr, f) {
  const m = new Map(); for (const x of arr) { const k = f(x) || '—'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
}

// ------------------------------------------------------------ чек-лист
const ckKey = () => 'bqr-check-' + model.id;
const modeKey = () => 'bqr-checkmode-' + model.id;
function markScanned(n) {
  const p = model.byN.get(n);
  if (!p) { toast(`Детали №${n} нет в этой модели`); return false; }
  const c = store.get(ckKey(), {}); const was = c[n]; c[n] = Date.now(); store.set(ckKey(), c);
  const done = Object.keys(c).length;
  toast(`${was ? 'Уже отмечена' : '✓ Отмечена'}: №${n} ${esc(p.label)} <b>${done}/${model.own.length}</b>`);
  if (navigator.vibrate) navigator.vibrate(was ? [40, 60, 40] : 60);
  if (current === 'check') refreshCheck();
  return true;
}
function parseScan(text) {
  text = String(text).trim();
  try { const u = new URL(text); const d = +u.searchParams.get('d'); const m = u.searchParams.get('m'); if (m && m !== model.id) return { other: m }; if (d) return { n: d }; } catch { /* не ссылка */ }
  if (/^\d+$/.test(text)) return { n: +text };
  return null;
}
function handleScan(text) {
  const r = parseScan(text);
  if (!r) { toast('Не понял код: ' + esc(text.slice(0, 40))); return; }
  if (r.other) { toast('Это бирка другой модели'); return; }
  markScanned(r.n);
}

// Обновляет только прогресс и список — камера и поле ввода не пересоздаются.
function refreshCheck() {
  if (!$('#ckList')) return renderCheck();
  const c = store.get(ckKey(), {}), onlyMissing = store.get('bqr-onlymiss', false);
  const b = $('#ckBlock').value;
  const list = model.own.filter(p => !b || p.block === b);
  const done = list.filter(p => c[p.n]).length;
  const pct = list.length ? Math.round(done / list.length * 100) : 0;
  $('#ckProg').innerHTML = `<div style="width:${pct}%"></div><span>${done} / ${list.length} деталей${done === list.length && list.length ? ' — всё на месте ✓' : ''}</span>`;
  $('#ckList').innerHTML = list.filter(p => !onlyMissing || !c[p.n]).map(p => `<div class="ckrow${c[p.n] ? ' done' : ''}" data-n="${p.n}"><span class="num">${p.n}</span><div class="pm"><b>${esc(p.label)}</b><small>${fmt(p.L)}×${fmt(p.W)}×${fmt(p.t)} · ${esc(p.mat)}</small></div><span class="st">${c[p.n] ? '✓' : ''}</span></div>`).join('');
}

function renderCheck() {
  const mode = store.get(modeKey(), false), onlyMissing = store.get('bqr-onlymiss', false);
  $('#tab-check').innerHTML = `<div class="dochead"><h1>Чек-лист</h1></div>
    <div class="progress" id="ckProg"></div>
    <div class="ckbar">
      <button id="ckScan" class="primary">📷 Сканировать</button>
      <input id="ckIn" placeholder="№ детали или сканер" inputmode="numeric">
      <select id="ckBlock"><option value="">Все блоки</option>${model.blocks.map(x => `<option>${esc(x)}</option>`).join('')}</select>
      <label><input type="checkbox" id="ckMode"${mode ? ' checked' : ''}> Отмечать при открытии по QR камерой телефона</label>
      <label><input type="checkbox" id="ckMiss"${onlyMissing ? ' checked' : ''}> Только недостающие</label>
      <button id="ckReset">Сбросить</button>
    </div>
    <div id="scanBox" hidden><video id="scanVid" playsinline muted></video><div id="scanAlt"></div><button id="scanStop">Остановить</button></div>
    <div class="cklist" id="ckList"></div>`;
  $('#ckIn').onkeydown = e => { if (e.key === 'Enter') { handleScan(e.target.value); e.target.value = ''; } };
  $('#ckBlock').onchange = refreshCheck;
  $('#ckMode').onchange = e => store.set(modeKey(), e.target.checked);
  $('#ckMiss').onchange = e => { store.set('bqr-onlymiss', e.target.checked); refreshCheck(); };
  $('#ckReset').onclick = () => { if (confirm('Сбросить все отметки этой модели?')) { store.set(ckKey(), {}); refreshCheck(); } };
  $('#ckScan').onclick = startScan;
  $('#ckList').onclick = e => {
    const row = e.target.closest('.ckrow'); if (!row) return;
    const n = +row.dataset.n, cc = store.get(ckKey(), {});
    if (cc[n]) { delete cc[n]; store.set(ckKey(), cc); refreshCheck(); } else markScanned(n);
  };
  refreshCheck();
  if (matchMedia('(pointer:fine)').matches) $('#ckIn').focus();
}

let scanStream = null, scanLib = null;
async function startScan() {
  const box = $('#scanBox'); box.hidden = false;
  $('#scanStop').onclick = stopScan;
  let last = '', lastT = 0;
  const hit = txt => { const now = Date.now(); if (txt === last && now - lastT < 2500) return; last = txt; lastT = now; handleScan(txt); };
  if ('BarcodeDetector' in window) {
    try {
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = $('#scanVid'); v.srcObject = scanStream; await v.play();
      const loop = async () => {
        if (!scanStream) return;
        try { const r = await det.detect(v); if (r[0]) hit(r[0].rawValue); } catch { /* кадр не готов */ }
        setTimeout(loop, 180);
      };
      loop(); return;
    } catch (e) { stopScan(); box.hidden = false; }
  }
  // Запасной вариант (iPhone): библиотека html5-qrcode
  $('#scanVid').hidden = true;
  if (!window.Html5Qrcode) await new Promise((ok, err) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
  scanLib = new window.Html5Qrcode('scanAlt');
  try { await scanLib.start({ facingMode: 'environment' }, { fps: 8, qrbox: 240 }, hit); }
  catch (e) { toast('Камера недоступна: ' + esc(e.message || e)); }
}
function stopScan() {
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  if (scanLib) { scanLib.stop().catch(() => {}); scanLib = null; }
  const box = $('#scanBox'); if (box) box.hidden = true;
}

// ------------------------------------------------------------ бирки
function renderLabels() {
  const size = store.get('bqr-lsize', '58x40'), b = $('#lBlock') ? $('#lBlock').value : '';
  const S = SIZES[size] || SIZES['58x40'];
  const list = model.own.filter(p => !b || p.block === b);
  $('#tab-labels').innerHTML = `<div class="dochead noprint"><h1>Бирки</h1>
      <select id="lSize">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}"${k === size ? ' selected' : ''}>${v.name}</option>`).join('')}</select>
      <select id="lBlock"><option value="">Все блоки</option>${model.blocks.map(x => `<option${x === b ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <button class="primary" onclick="print()">🖨 Печать (${list.length})</button></div>
    <p class="muted noprint">QR открывает деталь в 3D. В печати выберите масштаб 100% и без полей.</p>
    <div class="labels ${S.sheet ? 'sheet' : 'roll'}">${list.map(p => labelHTML(model, p, partUrl(p), S)).join('')}</div>`;
  let st = document.getElementById('pageSize');
  if (!st) { st = document.createElement('style'); st.id = 'pageSize'; document.head.appendChild(st); }
  st.textContent = S.sheet ? '@page { size: A4; margin: 8mm 0 0 0; }' : `@page { size: ${S.w}mm ${S.h}mm; margin: 0; }`;
  $('#lSize').onchange = e => { store.set('bqr-lsize', e.target.value); renderLabels(); };
  $('#lBlock').onchange = renderLabels;
}

// ------------------------------------------------------------ запуск
async function openModel(id) {
  document.body.classList.add('has-model');
  $('#tabs').hidden = false;
  let data;
  try {
    const r = await fetch('models/' + encodeURIComponent(id) + '.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch (e) {
    $('#home').hidden = false; $('#tabs').hidden = true;
    $('#home').innerHTML = `<div class="doc"><h1>Модель не найдена</h1><p class="muted">${esc(id)}</p><p><a href="./">← Все модели</a></p></div>`;
    return;
  }
  model = prepare(data);
  document.title = model.name + ' — BazisQR';
  $('#title').textContent = model.name + (model.order ? ' · ' + model.order : '');
  blockOptions($('#blockSel')); blockOptions($('#pBlock'));

  $('#tab-3d').hidden = false;
  $('#canvas').innerHTML = '<div class="loading">Загрузка 3D…</div>';
  try {
    const { Viewer } = await import('./viewer.js');
    $('#canvas').innerHTML = '';
    viewer = new Viewer($('#canvas'), model, p => pick(p));
  } catch (e) {
    $('#canvas').innerHTML = `<div class="loading">3D не загрузилось (нет интернета?). Детали, чертежи и бирки работают.<br><small>${esc(e.message)}</small></div>`;
    viewer = { select() {}, resize() {}, setBlock() {}, setExplode() {}, toggleHoles() {}, toggleFurn() {}, fit() {}, ghost: false };
  }
  $('#blockSel').onchange = e => viewer.setBlock(e.target.value);
  $('#bAll').onclick = () => { $('#blockSel').value = ''; viewer.setBlock(''); viewer.select(null); partCard(null); viewer.setExplode(0); $('#explode').value = 0; };
  $('#bHoles').onclick = e => { e.target.classList.toggle('on'); viewer.toggleHoles(e.target.classList.contains('on')); };
  $('#bFurn').onclick = e => { e.target.classList.toggle('on'); viewer.toggleFurn(e.target.classList.contains('on')); };
  $('#explode').oninput = e => viewer.setExplode(e.target.value / 100 * 0.8);
  document.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => viewer.fit(b.dataset.view); });
  document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });

  const d = +params.get('d');
  showTab(params.get('tab') || '3d');
  if (d && model.byN.get(d)) {
    const p = model.byN.get(d);
    pick(p, { ghost: true, focus: true });
    if (store.get(modeKey(), false)) markScanned(d);
  }
  // USB-сканер в 3D-режиме: цифры + Enter
  let buf = '', bt = 0;
  addEventListener('keydown', e => {
    if (current === 'check' || e.target.tagName === 'INPUT') return;
    const now = Date.now(); if (now - bt > 120) buf = ''; bt = now;
    if (e.key === 'Enter') { const r = buf; buf = ''; if (r.length > 1) { const x = parseScan(r); if (x && x.n) { pick(model.byN.get(x.n), { ghost: true, focus: true }); if (store.get(modeKey(), false)) markScanned(x.n); } } }
    else if (e.key.length === 1) buf += e.key;
  });
}

const mid = params.get('m');
if (mid) openModel(mid); else home();
