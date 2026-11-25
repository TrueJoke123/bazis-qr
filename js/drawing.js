// Чертёж детали: контур, кромки, присадка, ординатные размеры, таблица отверстий.
import { elemPoints, edgesOf, fmt, esc } from './model.js';

const EDGE_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0ca678'];

export function edgeLegend(p) {
  const mats = [];
  for (const e of edgesOf(p)) {
    const key = e.mat + '|' + e.t;
    if (!mats.find(m => m.key === key)) mats.push({ key, mat: e.mat, t: e.t, w: e.w, sign: e.sign, color: EDGE_COLORS[mats.length % EDGE_COLORS.length], len: 0 });
    mats.find(m => m.key === key).len += e.len;
  }
  return mats;
}

// Система координат вида: длинная сторона горизонтально, (u, v) от левого нижнего угла.
export function viewMap(p, mirror) {
  const rot = p.dh > p.dw + 0.01;
  const W = rot ? p.dh : p.dw, H = rot ? p.dw : p.dh;
  const uv = (x, y) => {
    let u = rot ? y - p.bb.y0 : x - p.bb.x0;
    const v = rot ? p.bb.x1 - x : y - p.bb.y0;
    if (mirror) u = W - u;
    return [u, v];
  };
  const dir = (dx, dy) => { let du = rot ? dy : dx; const dv = rot ? -dx : dy; if (mirror) du = -du; return [du, dv]; };
  return { W, H, uv, dir, rot };
}

export function drawingSVG(p, { mirror = false } = {}) {
  const vm = viewMap(p, mirror);
  const W = vm.W, H = vm.H, f = Math.min(30, Math.max(7, Math.max(W, H) / 55));
  const P = (x, y) => { const [u, v] = vm.uv(x, y); return [u, H - v]; };
  const viewSide = mirror ? 'B' : 'A';
  const legend = edgeLegend(p);
  const colorOf = b => (legend.find(m => m.key === b.mat + '|' + b.t) || {}).color || '#e8590c';
  const butts = new Map(); for (const b of p.butts || []) butts.set(b.e, b);

  const padL = f * 7, padB = f * 7, padT = f * 3, padR = f * 3;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" class="drw" viewBox="${-padL} ${-padT} ${W + padL + padR} ${H + padT + padB}" font-family="Arial, sans-serif">`);
  out.push(`<rect x="${-padL}" y="${-padT}" width="${W + padL + padR}" height="${H + padT + padB}" fill="#fff"/>`);

  // Контур по элементам
  (p.c || []).forEach((e, i) => {
    const pts = elemPoints(e); if (pts.length < 2) return;
    const d = 'M' + pts.map(q => { const s = P(q[0], q[1]); return s[0].toFixed(2) + ' ' + s[1].toFixed(2); }).join(' L');
    const b = butts.get(i);
    out.push(`<path d="${d}" fill="none" stroke="#111" stroke-width="${f * 0.12}"/>`);
    if (b) out.push(`<path d="${d}" fill="none" stroke="${colorOf(b)}" stroke-width="${f * 0.55}" stroke-opacity="0.85" stroke-linecap="butt"/>`);
  });

  // Отверстия
  const fx = new Set(), fy = new Set();
  let k = 0;
  for (const h of p.holes) {
    k++;
    const [cx, cy] = P(h.lx, h.ly), r = h.dia / 2;
    if (h.side === 'E') {
      const [du, dv] = vm.dir(h.dx, h.dy), dx = du, dy = -dv, len = Math.max(h.dep, 3);
      const nx = -dy, ny = dx;
      const pts = [[cx + nx * r, cy + ny * r], [cx + nx * r + dx * len, cy + ny * r + dy * len], [cx - nx * r + dx * len, cy - ny * r + dy * len], [cx - nx * r, cy - ny * r]];
      out.push(`<polygon points="${pts.map(q => q[0].toFixed(2) + ',' + q[1].toFixed(2)).join(' ')}" fill="#fff3bf" stroke="#c92a2a" stroke-width="${f * 0.1}"/>`);
      out.push(`<text x="${(cx + dx * (len + f * 0.9)).toFixed(1)}" y="${(cy + dy * (len + f * 0.9) + f * 0.35).toFixed(1)}" font-size="${f * 0.8}" text-anchor="middle" fill="#c92a2a">${k}</text>`);
      continue;
    }
    const front = h.side === viewSide || h.through;
    if (front) { fx.add(Math.round(cx * 10) / 10); fy.add(Math.round(cy * 10) / 10); }
    out.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r}" fill="${front ? '#495057' : 'none'}" fill-opacity="${front ? 0.25 : 0}" stroke="${front ? '#212529' : '#868e96'}" stroke-width="${f * 0.1}" ${front ? '' : `stroke-dasharray="${f * 0.3} ${f * 0.2}"`}/>`);
    if (h.through) out.push(`<path d="M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cy + r}" stroke="#212529" stroke-width="${f * 0.08}"/>`);
    out.push(`<text x="${(cx + r + f * 0.2).toFixed(1)}" y="${(cy - r - f * 0.15).toFixed(1)}" font-size="${f * 0.75}" fill="#495057">${k}</text>`);
  }

  // Ординатные размеры отверстий лицевой стороны
  const tick = f * 0.08;
  const xs = [...fx].sort((a, b) => a - b), ys = [...fy].sort((a, b) => a - b);
  const yBase = H + f * 1.2;
  for (const x of xs) {
    out.push(`<path d="M${x} ${H}V${yBase}" stroke="#868e96" stroke-width="${tick}" stroke-dasharray="${f * 0.2} ${f * 0.15}"/>`);
    out.push(`<text transform="translate(${x + f * 0.3} ${yBase + f * 0.3}) rotate(90)" font-size="${f * 0.8}" fill="#343a40">${fmt(x)}</text>`);
  }
  const xBase = -f * 1.2;
  for (const y of ys) {
    out.push(`<path d="M0 ${y}H${xBase}" stroke="#868e96" stroke-width="${tick}" stroke-dasharray="${f * 0.2} ${f * 0.15}"/>`);
    out.push(`<text x="${xBase - f * 0.3}" y="${y + f * 0.3}" font-size="${f * 0.8}" text-anchor="end" fill="#343a40">${fmt(H - y)}</text>`);
  }

  // Габаритные размеры
  const yd = H + f * 5.3, xd = -f * 5.5, a = f * 0.6;
  out.push(`<path d="M0 ${H}V${yd + f * 0.5}M${W} ${H}V${yd + f * 0.5}M${-f * 0.1} ${0}H${xd - f * 0.5}M${-f * 0.1} ${H}H${xd - f * 0.5}" stroke="#495057" stroke-width="${tick}"/>`);
  out.push(`<path d="M0 ${yd}H${W}" stroke="#212529" stroke-width="${tick * 1.4}"/><path d="M0 ${yd}l${a} ${-a / 3}v${a * 2 / 3}zM${W} ${yd}l${-a} ${-a / 3}v${a * 2 / 3}z" fill="#212529"/>`);
  out.push(`<text x="${W / 2}" y="${yd - f * 0.35}" font-size="${f * 1.1}" text-anchor="middle" font-weight="bold">${fmt(W)}</text>`);
  out.push(`<path d="M${xd} 0V${H}" stroke="#212529" stroke-width="${tick * 1.4}"/><path d="M${xd} 0l${-a / 3} ${a}h${a * 2 / 3}zM${xd} ${H}l${-a / 3} ${-a}h${a * 2 / 3}z" fill="#212529"/>`);
  out.push(`<text transform="translate(${xd - f * 0.35} ${H / 2}) rotate(-90)" font-size="${f * 1.1}" text-anchor="middle" font-weight="bold">${fmt(H)}</text>`);
  out.push(`<text x="${W - f * 0.3}" y="${-f * 0.8}" font-size="${f * 0.9}" text-anchor="end" fill="#495057">Вид со стороны ${viewSide}</text>`);
  out.push('</svg>');
  return out.join('');
}

export function holeTable(p, mirror = false) {
  if (!p.holes.length) return '<p class="muted">Отверстий нет.</p>';
  const sideName = { A: 'Пласть A', B: 'Пласть B', E: 'Торец' };
  const vm = viewMap(p, mirror);
  const rows = p.holes.map((h, i) => {
    const [u, v] = vm.uv(h.lx, h.ly);
    return `<tr><td>${i + 1}</td><td>${sideName[h.side]}${h.through ? ', сквоз.' : ''}</td><td>${fmt(u)}</td><td>${fmt(v)}</td><td>${h.side === 'E' ? fmt(h.z) : ''}</td><td>${fmt(h.dia)}</td><td>${fmt(h.dep)}</td><td class="muted">${esc(h.f)}</td></tr>`;
  }).join('');
  return `<table class="tbl"><thead><tr><th>№</th><th>Где</th><th>X</th><th>Y</th><th title="Для торцевых: от пласти B">Z</th><th>Ø</th><th>Глуб.</th><th>Крепёж</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function edgeTable(p) {
  const lg = edgeLegend(p);
  if (!lg.length) return '<p class="muted">Без кромки.</p>';
  return '<div class="legend">' + lg.map(m => `<span><i style="background:${m.color}"></i>${esc(m.mat)} ${m.t ? fmt(m.t) + ' мм' : ''} — ${fmt(m.len / 1000)} м</span>`).join('') + '</div>';
}
