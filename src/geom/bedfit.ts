// Whether a part fits the print bed, judged as it can be turned on it: a part's file is its own, and whoever prints
// it lays it on the bed whichever way it goes, so a long thin part that only goes on corner to corner fits too. One
// working for everything that asks (the build's cuts, the full circle's note, the monorail, the tests): the convex
// hull of the part's outline in plan, and its box at every angle. Plain numbers: no kernel.

export type Pt = [number, number];

export interface BedFit {
  /** it lies within the bed at some angle */
  fits: boolean;
  /** how far to turn it to lie within x by y (degrees, anticlockwise seen from above): 0 as it is, 90 the other way
   * round, anything else on the slant; where it doesn't fit, the angle it comes nearest at */
  angle: number;
  /** it fits as it is or a quarter turn round (angle 0 or 90): nothing to turn */
  square: boolean;
  /** its box at that angle, mm */
  size: Pt;
  /** how big it is for the bed at that angle: its box over the bed's, the worse way (1 or less: it fits) */
  over: number;
}

/** How far a printed piece of track's own ends reach past where it's cut, mm, across its sleepers' width: its end connectors (measured on built pieces). */
export const END_REACH = 7;

/** A fit this close to the bed's edge still counts (mm): numbers worked out twice differ by a hair. */
const EPS = 1e-6;

/**
 * The convex hull of points in plan, anticlockwise. pts: pairs, or a flat list `stride` numbers a point (a mesh's
 * corners, x and y first). The points well inside (within the eight-sided shape through the outermost ones) are
 * dropped first, so a mesh's hundred thousand corners cost one pass.
 */
export function hullOf(pts: ArrayLike<number> | Pt[], stride = 2): Pt[] {
  const flat = pts.length > 0 && typeof (pts as Pt[])[0] !== 'number';
  const n = flat ? pts.length : Math.floor(pts.length / stride);
  const X = (i: number) => (flat ? (pts as Pt[])[i][0] : (pts as ArrayLike<number>)[i * stride]);
  const Y = (i: number) => (flat ? (pts as Pt[])[i][1] : (pts as ArrayLike<number>)[i * stride + 1]);
  let idx: number[] = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(X(i)) && Number.isFinite(Y(i))) idx.push(i);
  if (idx.length > 64) {
    // (the outermost points eight ways, in order round)
    const dirs: Pt[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const ext = dirs.map(() => -1), val = dirs.map(() => -Infinity);
    for (const i of idx) for (let d = 0; d < 8; d++) { const v = X(i) * dirs[d][0] + Y(i) * dirs[d][1]; if (v > val[d]) { val[d] = v; ext[d] = i; } }
    const oct = ext.filter((e, k) => e !== ext[(k + 7) % 8]).map((e): Pt => [X(e), Y(e)]);
    if (oct.length >= 3) {
      const m = oct.length;
      idx = idx.filter((i) => {
        const x = X(i), y = Y(i);
        for (let k = 0; k < m; k++) { const a = oct[k], b = oct[(k + 1) % m]; if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) <= 1e-9) return true; }
        return false;
      });
    }
  }
  const p = idx.map((i): Pt => [X(i), Y(i)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let k = p.length - 1; k >= 0; k--) { const q = p[k]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return [...lower, ...upper];
}

/** The box of points turned by deg (anticlockwise): how wide and how deep. */
export function boxAt(pts: Pt[], deg: number): Pt {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { const u = x * c - y * s, v = x * s + y * c; if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; }
  return pts.length ? [x1 - x0, y1 - y0] : [0, 0];
}

/**
 * How a part goes on a bed x by y. pts: its outline in plan (any points that hold it: a mesh's corners will do; pairs,
 * or flat with `stride` numbers a point). As it is if that fits, else a quarter turn round, else at the angle that
 * leaves it most room (looked for a degree at a time, then closer). Nothing, or a bed of no size: it doesn't fit.
 */
export function bedFit(pts: ArrayLike<number> | Pt[], x: number, y: number, stride = 2): BedFit {
  const h = hullOf(pts, stride);
  if (!h.length || !(x > 0) || !(y > 0)) return { fits: false, angle: 0, square: true, size: h.length ? boxAt(h, 0) : [0, 0], over: Infinity };
  const over = (deg: number) => { const [w, d] = boxAt(h, deg); return Math.max(w / x, d / y); };
  const lim = 1 + EPS / Math.min(x, y);
  for (const a of [0, 90]) { const v = over(a); if (v <= lim) return { fits: true, angle: a, square: true, size: boxAt(h, a), over: v }; }
  let best = 0, bv = Infinity;
  for (let a = 0; a < 180; a++) { const v = over(a); if (v < bv - 1e-12) { bv = v; best = a; } }
  // (closer: between the degrees either side, by thirds)
  let lo = best - 1, hi = best + 1;
  for (let k = 0; k < 40; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (over(m1) <= over(m2)) hi = m2; else lo = m1; }
  const mid = (lo + hi) / 2;
  if (over(mid) < bv) { bv = over(mid); best = mid; }
  const angle = ((best % 180) + 180) % 180;
  return { fits: bv <= lim, angle, square: angle === 0 || angle === 90, size: boxAt(h, angle), over: bv };
}

/** Does a length by width rectangle go on a bed x by y, turned any way? */
export const rectFits = (l: number, w: number, x: number, y: number) => bedFit([[0, 0], [l, 0], [l, w], [0, w]], x, y).fits;

/**
 * The longest a strip w wide can be and still go on a bed x by y, turned any way (half a degree at a time): along the
 * bed's longer side, or corner to corner where that's longer.
 */
export function longestFit(w: number, x: number, y: number): number {
  let best = Math.max(w <= y + EPS ? x : 0, w <= x + EPS ? y : 0);
  for (let k = 1; k < 180; k++) {
    const t = (k * Math.PI) / 360, c = Math.cos(t), s = Math.sin(t), l = Math.min((x - w * s) / c, (y - w * c) / s);
    if (l > best) best = l;
  }
  return best;
}

/**
 * A part's tightest box, turned any way (the least area: one of its sides lies along one of the hull's): the longer
 * side first, and the angle it's turned by to lie so, its length along x.
 */
export function tightBox(pts: ArrayLike<number> | Pt[], stride = 2): { size: Pt; angle: number } {
  const h = hullOf(pts, stride);
  if (h.length < 2) return { size: [0, 0], angle: 0 };
  let best: Pt = [Infinity, Infinity], angle = 0;
  for (let k = 0; k < h.length; k++) {
    const a = h[k], b = h[(k + 1) % h.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
    const deg = (-Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, [w, d] = boxAt(h, deg);
    if (w * d < best[0] * best[1] - 1e-9) { best = w >= d ? [w, d] : [d, w]; angle = w >= d ? deg : deg + 90; }
  }
  return Number.isFinite(best[0]) ? { size: best, angle: ((angle % 180) + 180) % 180 } : { size: [0, 0], angle: 0 };
}

/**
 * A piece of track's outline in plan (mm): its base, `half` each side of its centre line, along a straight `len` long
 * (radius 0) or round an arc of that length; and its own ends, endHalf each side, reaching `reach` past each end (its
 * end connectors).
 */
export function trackOutline(radius: number, len: number, half: number, endHalf = half, reach = 0): Pt[] {
  const out: Pt[] = [];
  if (!(radius > 0)) { for (const y of [0, len]) for (const x of [-half, half]) out.push([x, y]); for (const y of [-reach, len + reach]) for (const x of [-endHalf, endHalf]) out.push([x, y]); return out; }
  const a = len / radius, steps = Math.max(8, Math.ceil((a * 180) / Math.PI));
  for (let i = 0; i <= steps; i++) { const t = (a * i) / steps; for (const r of [radius - half, radius + half]) out.push([r * Math.cos(t), r * Math.sin(t)]); }
  for (const [t, sg] of [[0, -1], [a, 1]]) for (const r of [radius - endHalf, radius + endHalf]) out.push([r * Math.cos(t) - sg * reach * Math.sin(t), r * Math.sin(t) + sg * reach * Math.cos(t)]);
  return out;
}

/** The longest piece of track (mm along it, up to max) whose outline (trackOutline) goes on a bed x by y, turned any way. 0: none does. */
export function longestTrack(radius: number, half: number, endHalf: number, reach: number, x: number, y: number, max = 4096): number {
  const top = radius > 0 ? Math.min(max, Math.PI * radius) : max, ok = (l: number) => bedFit(trackOutline(radius, l, half, endHalf, reach), x, y).fits;
  if (ok(top)) return top;
  let lo = 0, hi = top;
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}
