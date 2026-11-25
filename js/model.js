// Разбор данных модели: контуры, габариты, присадка по деталям, блоки.

const TOL = 0.6;

export function arcPoints(x1, y1, x2, y2, cx, cy, ccw) {
  const r = Math.hypot(x1 - cx, y1 - cy);
  let a1 = Math.atan2(y1 - cy, x1 - cx), a2 = Math.atan2(y2 - cy, x2 - cx);
  if (ccw) { while (a2 <= a1 + 1e-9) a2 += Math.PI * 2; }
  else { while (a2 >= a1 - 1e-9) a2 -= Math.PI * 2; }
  const n = Math.max(3, Math.ceil(Math.abs(a2 - a1) / (Math.PI / 24)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a1 + (a2 - a1) * i / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

export function circlePoints(cx, cy, r, n = 48) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

// Точки одного элемента контура в его собственном направлении.
export function elemPoints(e) {
  if (e[0] === 'L') return [[e[1], e[2]], [e[3], e[4]]];
  if (e[0] === 'A') return arcPoints(e[1], e[2], e[3], e[4], e[5], e[6], e[7]);
  if (e[0] === 'C') { const p = circlePoints(e[1], e[2], e[3]); p.push(p[0]); return p; }
  return [];
}

export function elemLength(e) {
  const p = elemPoints(e); let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
}

const near = (a, b) => Math.abs(a[0] - b[0]) < TOL && Math.abs(a[1] - b[1]) < TOL;

// Собирает элементы в замкнутые контуры (полилинии).
export function buildLoops(c) {
  const segs = [], loops = [];
  c.forEach((e, i) => {
    if (e[0] === 'C') loops.push({ pts: circlePoints(e[1], e[2], e[3]), circle: true });
    else if (e[0] === 'L' || e[0] === 'A') { const p = elemPoints(e); if (p.length > 1) segs.push({ p, used: false, i }); }
  });
  for (const s0 of segs) {
    if (s0.used) continue;
    s0.used = true;
    const pts = s0.p.slice();
    let guard = 0;
    while (!near(pts[0], pts[pts.length - 1]) && guard++ < 5000) {
      const end = pts[pts.length - 1];
      let found = null, rev = false;
      for (const s of segs) {
        if (s.used) continue;
        if (near(s.p[0], end)) { found = s; break; }
        if (near(s.p[s.p.length - 1], end)) { found = s; rev = true; break; }
      }
      if (!found) break;
      found.used = true;
      const add = rev ? found.p.slice().reverse() : found.p;
      for (let k = 1; k < add.length; k++) pts.push(add[k]);
    }
    if (pts.length > 2 && near(pts[0], pts[pts.length - 1])) pts.pop();
    if (pts.length > 2) loops.push({ pts, circle: false });
  }
  loops.forEach(l => { l.area = polyArea(l.pts); });
  loops.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  return loops;
}

export function polyArea(p) {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] * p[i][1] - p[i][0] * p[j][1]);
  return s / 2;
}

export function inPoly(x, y, p) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}

function distSeg(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
function distPoly(x, y, p) {
  let d = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) d = Math.min(d, distSeg(x, y, p[j], p[i]));
  return d;
}

// Матрица ЛСК детали: m = [o(3), ax(3), ay(3), az(3)]
export function toGlobal(m, x, y, z) {
  return [m[0] + x * m[3] + y * m[6] + z * m[9], m[1] + x * m[4] + y * m[7] + z * m[10], m[2] + x * m[5] + y * m[8] + z * m[11]];
}
function toLocal(m, p) {
  const dx = p[0] - m[0], dy = p[1] - m[1], dz = p[2] - m[2];
  return [dx * m[3] + dy * m[4] + dz * m[5], dx * m[6] + dy * m[7] + dz * m[8], dx * m[9] + dy * m[10] + dz * m[11]];
}
function dirLocal(m, d) {
  return [d[0] * m[3] + d[1] * m[4] + d[2] * m[5], d[0] * m[6] + d[1] * m[7] + d[2] * m[8], d[0] * m[9] + d[1] * m[10] + d[2] * m[11]];
}

// Толщина откладывается от пласти в +Z или −Z — выбираем по габариту из Базиса.
function pickZ(part, bb) {
  if (!part.gab) return 0;
  let best = 0, err = Infinity;
  for (const z0 of [0, -part.t, -part.t / 2]) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const x of [bb.x0, bb.x1]) for (const y of [bb.y0, bb.y1]) for (const z of [z0, z0 + part.t]) {
      const g = toGlobal(part.m, x, y, z);
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g[k]); mx[k] = Math.max(mx[k], g[k]); }
    }
    let e = 0;
    for (let k = 0; k < 3; k++) e += Math.abs(mn[k] - part.gab[k]) + Math.abs(mx[k] - part.gab[k + 3]);
    if (e < err - 0.01) { err = e; best = z0; }
  }
  return best;
}

export function blockOf(p) {
  const m = /(ШК-\d+[А-Яа-яA-Za-z]?)\s*$/.exec(p.name || '');
  if (m) return m[1];
  const segs = (p.path || '').split(' / ').filter(Boolean);
  return segs.length ? segs[segs.length - 1] : '—';
}

const r1 = v => Math.round(v * 10) / 10;
export const fmt = v => String(r1(v)).replace('.', ',');

export function prepare(model) {
  for (const p of model.parts) {
    p.loops = buildLoops(p.c || []);
    const outer = p.loops.find(l => !l.circle) || p.loops[0];
    p.outer = outer ? outer.pts : [];
    const bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const l of p.loops) for (const q of l.pts) {
      bb.x0 = Math.min(bb.x0, q[0]); bb.y0 = Math.min(bb.y0, q[1]); bb.x1 = Math.max(bb.x1, q[0]); bb.y1 = Math.max(bb.y1, q[1]);
    }
    p.bb = bb;
    p.dw = bb.x1 - bb.x0; p.dh = bb.y1 - bb.y0;
    p.L = Math.max(p.dw, p.dh); p.W = Math.min(p.dw, p.dh);
    p.z0 = pickZ(p, bb);
    p.block = blockOf(p);
    p.holes = [];
    p.label = p.des || p.name || ('Деталь ' + (p.n || ''));
  }
  assignHoles(model);
  model.own = model.parts.filter(p => !p.buy).sort((a, b) => a.n - b.n);
  model.byN = new Map(model.own.map(p => [p.n, p]));
  model.blocks = [...new Set(model.own.map(p => p.block))].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  return model;
}

// Каждое отверстие крепежа относим к детали, в которую оно сверлится.
function assignHoles(model) {
  const own = model.parts.filter(p => !p.buy && p.outer.length > 2);
  for (const h of model.holes || []) {
    for (const p of own) {
      const q = toLocal(p.m, h.p), d = dirLocal(p.m, h.d);
      const z0 = p.z0, z1 = p.z0 + p.t;
      if (q[2] < z0 - 1 || q[2] > z1 + 1) continue;
      if (q[0] < p.bb.x0 - 1 || q[0] > p.bb.x1 + 1 || q[1] < p.bb.y0 - 1 || q[1] > p.bb.y1 + 1) continue;
      let side = null;
      if (Math.abs(d[2]) > 0.9) {
        const atTop = Math.abs(q[2] - z1) < 1.2 && d[2] < 0;
        const atBot = Math.abs(q[2] - z0) < 1.2 && d[2] > 0;
        if (!atTop && !atBot) continue;
        if (!inPoly(q[0], q[1], p.outer)) continue;
        side = atTop ? 'A' : 'B';
      } else if (Math.abs(d[2]) < 0.15) {
        if (distPoly(q[0], q[1], p.outer) > 1.5) continue;
        if (!inPoly(q[0] + d[0] * 3, q[1] + d[1] * 3, p.outer)) continue;
        side = 'E';
      } else continue;
      p.holes.push({
        side, x: q[0] - p.bb.x0, y: q[1] - p.bb.y0, z: side === 'E' ? q[2] - z0 : 0,
        lx: q[0], ly: q[1], dx: d[0], dy: d[1],
        dia: h.dia, dep: h.dep, through: side !== 'E' && h.dep >= p.t - 0.2,
        f: h.f >= 0 && model.fasteners[h.f] ? model.fasteners[h.f].name : ''
      });
      break;
    }
  }
  for (const p of own) p.holes.sort((a, b) => (a.side + a.x.toFixed(1).padStart(8) + a.y.toFixed(1).padStart(8))
    .localeCompare(b.side + b.x.toFixed(1).padStart(8) + b.y.toFixed(1).padStart(8)));
}

// К какой стороне габарита относится элемент контура (для схемы кромок на бирке).
export function elemSide(p, e) {
  const pts = elemPoints(e); if (!pts.length) return null;
  const m = pts[Math.floor(pts.length / 2)], bb = p.bb, t = 1.5;
  const mx = (pts[0][0] + pts[pts.length - 1][0]) / 2, my = (pts[0][1] + pts[pts.length - 1][1]) / 2;
  const x = e[0] === 'L' ? mx : m[0], y = e[0] === 'L' ? my : m[1];
  if (Math.abs(y - bb.y0) < t) return 'b';
  if (Math.abs(y - bb.y1) < t) return 't';
  if (Math.abs(x - bb.x0) < t) return 'l';
  if (Math.abs(x - bb.x1) < t) return 'r';
  return 'o';
}

// Кромки детали, сгруппированные по материалу.
export function edgesOf(p) {
  const res = [];
  for (const b of p.butts || []) {
    const e = (p.c || [])[b.e];
    if (!e) continue;
    res.push({ ...b, len: elemLength(e), side: elemSide(p, e), elem: e });
  }
  return res;
}

const PALETTE = ['#c8a77e', '#d9cbb3', '#8b6a4f', '#e8e2d6', '#a98467', '#b9b3a6', '#6f5b4b', '#d4b896', '#9c8f80', '#efe9dc'];
export function matColor(name) {
  const s = (name || '').toLowerCase();
  if (s.includes('бел')) return '#f1efe9';
  if (s.includes('черн') || s.includes('чёрн') || s.includes('антрацит')) return '#3b3b3d';
  if (s.includes('сер')) return '#9a9a9a';
  if (s.includes('хдф') || s.includes('двп')) return '#d8cfbf';
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
