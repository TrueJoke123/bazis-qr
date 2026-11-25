// QR-бирки для печати.
import { edgesOf, fmt, esc } from './model.js';

export const SIZES = {
  '58x40': { w: 58, h: 40, name: 'Термо 58×40' },
  '70x50': { w: 70, h: 50, name: 'Термо 70×50' },
  '100x70': { w: 100, h: 70, name: 'Термо 100×70' },
  'a4': { w: 70, h: 37, name: 'A4, 24 шт (70×37)', sheet: true }
};

export function qrSVG(text, cls = 'qr') {
  /* global qrcode */
  const q = qrcode(0, 'L'); q.addData(text); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg class="${cls}" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// Схема кромок: длинная сторона детали всегда горизонтально.
export function edgeScheme(p) {
  const ed = edgesOf(p), rot = p.dh > p.dw;
  // Поворот как на чертеже (по часовой): низ→лево, верх→право, лево→верх, право→низ.
  const map = rot ? { b: 'l', t: 'r', l: 't', r: 'b' } : { b: 'b', t: 't', l: 'l', r: 'r' };
  const s = {};
  for (const e of ed) { const k = map[e.side] || 'o'; s[k] = Math.max(s[k] || 0, e.t || 1); }
  const w = (k) => s[k] ? (s[k] >= 1.5 ? 5 : 3) : 0.6;
  return `<svg class="es" viewBox="0 0 64 34"><rect x="4" y="4" width="56" height="26" fill="#fff" stroke="#999" stroke-width="0.6"/>` +
    (s.t ? `<line x1="4" y1="4" x2="60" y2="4" stroke="#000" stroke-width="${w('t')}"/>` : '') +
    (s.b ? `<line x1="4" y1="30" x2="60" y2="30" stroke="#000" stroke-width="${w('b')}"/>` : '') +
    (s.l ? `<line x1="4" y1="4" x2="4" y2="30" stroke="#000" stroke-width="${w('l')}"/>` : '') +
    (s.r ? `<line x1="60" y1="4" x2="60" y2="30" stroke="#000" stroke-width="${w('r')}"/>` : '') +
    (s.o ? `<text x="32" y="21" font-size="9" text-anchor="middle">фигурн.</text>` : '') + '</svg>';
}

export function labelHTML(model, p, url, size) {
  const edges = edgesOf(p);
  const emat = [...new Set(edges.map(e => `${e.mat}${e.t ? ' ' + fmt(e.t) : ''}`))].join('; ');
  return `<div class="lbl" style="width:${size.w}mm;height:${size.h}mm">
    <div class="lt">
      <div class="ln">${p.n}</div>
      <div class="lname">${esc(p.label)}</div>
      <div class="ldim">${fmt(p.L)} × ${fmt(p.W)} × ${fmt(p.t)}</div>
      <div class="lmat">${esc(p.mat)}</div>
      <div class="ledge">${edgeScheme(p)}<span>${esc(emat || 'без кромки')}</span></div>
      <div class="lfoot">${esc(model.name)}${p.block && p.block !== '—' ? ' · ' + esc(p.block) : ''}${p.holes.length ? ' · отв. ' + p.holes.length : ''}</div>
    </div>
    <div class="lq">${qrSVG(url)}</div>
  </div>`;
}
