// No split studs: a cut between parts never leaves part of a stud on either side. The studs are found on the piece
// before it's cut (whole circles of a stud's size half way up the heights studs stand at: the bed's top, and each
// ballast step a plate below it); a stud a cut went through comes off down to the surface it stands on, or (if asked)
// goes whole to the part its middle is on, standing a little over the next part's edge.
// (A few slices only, let go as it goes: dozens through a yard's piece, kept to the end, ran the kernel out of memory.)
import type { Scad, Man } from './scad';
import { T } from './scad';
import { arena } from './kernel';

type Pt = [number, number];
export interface Stud { c: Pt; mid: number }

/** The heights half way up the studs on m: on surfaces a plate apart, from the bed's top (top) down to m's bottom. */
const mids = (m: Man, top: number, plate: number, h: number) => {
  const out: number[] = [];
  for (let z = top + h / 2; z > m.boundingBox().min[2]; z -= plate) out.push(Math.round(z * 1000) / 1000);
  return out;
};

/** The studs on m (r: a stud's radius, h: how far it stands up), on the bed's top (top) or a plate (plate) or more below. */
export function findStuds(s: Scad, m: Man, r: number, h: number, top: number, plate: number): Stud[] {
  return arena(s.w, () => {
    const full = Math.PI * r * r, out: Stud[] = [];
    for (const z of mids(m, top, plate, h)) for (const p of m.slice(z).toPolygons() as Pt[][]) {
      if (p.length < 12) continue;
      const cx = p.reduce((t, q) => t + q[0], 0) / p.length, cy = p.reduce((t, q) => t + q[1], 0) / p.length;
      if (p.some((q) => Math.abs(Math.hypot(q[0] - cx, q[1] - cy) - r) > 0.08)) continue;
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
  const less = parts.map((p, i) => arena(s.w, () => {
    const bb = p.boundingBox(), cut: Man[] = [], slices = new Map<number, ReturnType<Man['slice']>>();
    for (const st of studs) {
      if (st.c[0] < bb.min[0] - r || st.c[0] > bb.max[0] + r || st.c[1] < bb.min[1] - r || st.c[1] > bb.max[1] + r) continue;
      let sl = slices.get(st.mid);
      if (!sl) { sl = p.slice(st.mid); slices.set(st.mid, sl); }
      const a = sl.intersect(s.w.CrossSection.circle(r + 0.05, 32).translate(st.c)).area();
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
