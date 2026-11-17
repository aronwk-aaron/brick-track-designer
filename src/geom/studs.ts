// No split studs: a cut between parts never leaves part of a stud on either side. The studs are found on the piece
// before it's cut (whole circles of a stud's size half way up the heights studs stand at: the bed's top, and each
// ballast step a plate below it); a stud a cut went through comes off down to the surface it stands on, or (if asked)
// goes whole to the part its middle is on, standing a little over the next part's edge.
// (A few slices only, let go as it goes: dozens through a yard's piece, kept to the end, ran the kernel out of memory.)
import type { Scad, Man } from './scad';
import { T } from './scad';
import { arena } from './kernel';

type Pt = [number, number];

/**
 * Studs never overlap or touch: none stands closer to another, middle to middle, than a stud's width and half a
 * millimetre (mm; studD: a stud's nominal width, 4.8). Where two would, the one there first stays, whole.
 */
export const studApart = (studD: number) => studD + 0.5;
/** Studs' places as they're taken, to keep the next ones clear of them (in cells, so only the ones near a spot are looked at). */
export class StudPlaces {
  private cells = new Map<string, { p: Pt; src?: string }[]>();
  constructor(private cell = 8) {}
  /** src: what it's a stud of, for near() to leave its own kind out. */
  add(q: Pt, src?: string) { const k = `${Math.floor(q[0] / this.cell)},${Math.floor(q[1] / this.cell)}`, c = this.cells.get(k); if (c) c.push({ p: q, src }); else this.cells.set(k, [{ p: q, src }]); }
  /** Is there one closer than d (no more than a cell) to q? notSrc: not counting the ones of this kind (its own, taken when it was built before). */
  near(q: Pt, d: number, notSrc?: string): boolean {
    const i = Math.floor(q[0] / this.cell), j = Math.floor(q[1] / this.cell);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++)
      if (this.cells.get(`${a},${b}`)?.some((e) => (notSrc === undefined || e.src !== notSrc) && Math.hypot(e.p[0] - q[0], e.p[1] - q[1]) < d)) return true;
    return false;
  }
}
export interface Stud { c: Pt; mid: number }

/** The heights half way up the studs on m: on surfaces a plate apart, from the bed's top (top) down to m's bottom. */
const mids = (m: Man, top: number, plate: number, h: number) => {
  const out: number[] = [];
  for (let z = top + h / 2; z > m.boundingBox().min[2]; z -= plate) out.push(Math.round(z * 1000) / 1000);
  return out;
};

/** The middles of the arcs of radius r in an outline: where five corners or more in a row (no two further apart than a 24-sided circle's are) lie round one middle, the outline bulging out there. */
function arcs(p0: Pt[], r: number): Pt[] {
  // (corners along a straight side left out: a slice has them where its triangles' edges cross it)
  const p = p0.filter((B, i) => { const A = p0[(i + p0.length - 1) % p0.length], C = p0[(i + 1) % p0.length]; return Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) > 1e-3 * Math.hypot(C[0] - A[0], C[1] - A[1]); });
  const out: Pt[] = [], votes = new Map<string, { c: Pt; n: number }>();
  if (p.length < 7) return out;
  for (let i = 0; i < p.length; i++) {
    const A = p[i], B = p[(i + 1) % p.length], C = p[(i + 2) % p.length];
    if (Math.hypot(A[0] - B[0], A[1] - B[1]) > r * 0.45 || Math.hypot(C[0] - B[0], C[1] - B[1]) > r * 0.45) continue;
    const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
    // (bulging out: a hollow of a stud's size cut into the outline isn't one)
    if (d < 1e-9) continue;
    const a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
    const cx = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, cy = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d;
    if (Math.abs(Math.hypot(A[0] - cx, A[1] - cy) - r) > 0.08) continue;
    const key = `${Math.round(cx * 5)},${Math.round(cy * 5)}`, v = votes.get(key) ?? { c: [cx, cy] as Pt, n: 0 };
    v.n++; votes.set(key, v);
  }
  for (const v of votes.values()) if (v.n >= 5 && !out.some((q) => Math.hypot(q[0] - v.c[0], q[1] - v.c[1]) < 0.5)) out.push(v.c);
  return out;
}

/**
 * The studs on m (r: a stud's radius, h: how far it stands up), on the bed's top (top) or a plate (plate) or more below.
 * joined: also the ones run into something beside them (a ballast step's stud against the points' bed, wider than the
 * sleepers): not a circle of their own in the slice, found by the arc of one in a bigger outline (five corners or more
 * in a row round the same middle, at a stud's radius).
 */
export function findStuds(s: Scad, m: Man, r: number, h: number, top: number, plate: number, joined = false): Stud[] {
  return arena(s.w, () => {
    const full = Math.PI * r * r, out: Stud[] = [];
    // (each slice let go once read: a yard's piece is big)
    const outlines = (z: number) => { const sl = m.slice(z), ps = sl.toPolygons() as Pt[][]; sl.delete(); return ps; };
    for (const z of mids(m, top, plate, h)) for (const p of outlines(z)) {
      if (p.length < 12) continue;
      // (its middle: the middle of its box. The mean of its outline's points was off where the outline has more points on
      // one side (a cut or a wall met there): 0.1 mm on the R40 triple crossover's branches' slanted sleepers, over the
      // 0.08 allowed, so three studs a cut went through weren't found, and were left as rings)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (p.some((q) => Math.abs(Math.hypot(q[0] - cx, q[1] - cy) - r) > 0.08)) { if (joined) for (const c of arcs(p, r)) out.push({ c, mid: z }); continue; }
      // (an outline, not a hole: a pin hole the size of a stud isn't one)
      const a = p.reduce((t, q, k) => { const n = p[(k + 1) % p.length]; return t + q[0] * n[1] - n[0] * q[1]; }, 0) / 2;
      if (a > 0.95 * full && a < 1.01 * full) out.push({ c: [cx, cy], mid: z });
    }
    return out;
  }, () => []);
}

/**
 * The parts cut from a piece, each less the studs (findStuds) a cut went through; giveBack: each given whole again the
 * ones whose middle it has. fits: whether a part still fits the print bed with them (a stud over its edge made it a
 * little bigger); if not, those stay off.
 */
export function wholeStuds(s: Scad, studs: Stud[], parts: Man[], r: number, h: number, giveBack = false, fits?: (m: Man) => boolean): Man[] {
  if (!studs.length) return parts;
  const full = Math.PI * r * r;
  const at = (c: Pt, z: number, rr: number, hh: number) => T(s.cylinder(hh, rr, rr, 32), [c[0], c[1], z]);
  // (first each part less the studs it has only part of; the ones whose middle it has noted, to give back whole)
  const mine: { c: Pt; z: number }[][] = parts.map(() => []);
  // (each part's slice at a stud height looked at first as plain points: only a stud something other than its own whole
  // outline comes within reach of is measured in the kernel. Measuring every stud there (a circle and its overlap each,
  // kept till the part was done) took the kernel's memory over its bound once more studs were found)
  // (inner: inside the kernel's 32-sided circle of that reach wherever round it)
  const reach = r + 0.05, inner = reach * Math.cos(Math.PI / 32) - 1e-6, CELL = 8;
  const less = parts.map((p, i) => arena(s.w, () => {
    const bb = p.boundingBox(), cut: Man[] = [], seen = new Map<number, { sl: ReturnType<Man['slice']>; polys: Pt[][]; cells: Map<string, number[]> }>();
    const sliceAt = (z: number) => {
      let e = seen.get(z);
      if (!e) {
        const sl = p.slice(z), polys = sl.toPolygons() as Pt[][], cells = new Map<string, number[]>();
        polys.forEach((pl, k) => {
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          for (const q of pl) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
          for (let a = Math.floor(x0 / CELL); a <= Math.floor(x1 / CELL); a++) for (let b = Math.floor(y0 / CELL); b <= Math.floor(y1 / CELL); b++) {
            const key = `${a},${b}`, l = cells.get(key); if (l) l.push(k); else cells.set(key, [k]);
          }
        });
        e = { sl, polys, cells }; seen.set(z, e);
      }
      return e;
    };
    const segD = (c: Pt, a: Pt, b: Pt) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / l2)) : 0;
      return Math.hypot(a[0] + t * dx - c[0], a[1] + t * dy - c[1]);
    };
    for (const st of studs) {
      if (st.c[0] < bb.min[0] - r || st.c[0] > bb.max[0] + r || st.c[1] < bb.min[1] - r || st.c[1] > bb.max[1] + r) continue;
      const { sl, polys, cells } = sliceAt(st.mid), c = st.c, near = new Set<number>();
      for (let a = Math.floor((c[0] - reach) / CELL); a <= Math.floor((c[0] + reach) / CELL); a++) for (let b = Math.floor((c[1] - reach) / CELL); b <= Math.floor((c[1] + reach) / CELL); b++)
        for (const k of cells.get(`${a},${b}`) ?? []) near.add(k);
      // (what of the slice comes within the circle measured: none, the part has none of the stud; only its own outline
      // (every point of it within reach of the middle), the stud whole or not, by that outline's area as the kernel's would be)
      let own = 0, other = false;
      for (const k of near) {
        const pl = polys[k];
        if (!pl.some((q, j) => segD(c, q, pl[(j + 1) % pl.length]) < reach)) continue;
        if (pl.every((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) <= inner)) own += pl.reduce((t, q, j) => { const n = pl[(j + 1) % pl.length]; return t + q[0] * n[1] - n[0] * q[1]; }, 0) / 2;
        else { other = true; break; }
      }
      if (!other && (own <= 0.02 * full || own >= 0.97 * full)) continue;
      const circ = s.w.CrossSection.circle(reach, 32).translate(c), x = sl.intersect(circ), a = x.area();
      circ.delete(); x.delete();
      if (a <= 0.02 * full || a >= 0.97 * full) continue;
      cut.push(at(st.c, st.mid - h / 2, r + 0.1, h + 1));
      if (sl.intersect(s.w.CrossSection.circle(0.4, 16).translate(st.c)).area() > 0.25) mine[i].push({ c: st.c, z: st.mid - h / 2 });
    }
    return cut.length ? s.difference(p, cut) : p;
  }, (q) => [q]));
  // (then, if asked (giveBack), each given back its own whole, where it's clear of every other part, and the part still fits the bed)
  if (!giveBack) return less;
  return less.map((q, i) => arena(s.w, () => {
    const add = mine[i].map(({ c, z }) => at(c, z, r, h)).filter((st) => {
      const sb = st.boundingBox();
      return less.every((o2, j) => { if (j === i) return true; const ob = o2.boundingBox(); return ob.min[0] > sb.max[0] || ob.max[0] < sb.min[0] || ob.min[1] > sb.max[1] || ob.max[1] < sb.min[1] || o2.intersect(st).volume() < 0.01; });
    });
    if (!add.length) return q;
    const withStuds = s.union([q, ...add]);
    return !fits || fits(withStuds) ? withStuds : q;
  }, (m) => [m]));
}
