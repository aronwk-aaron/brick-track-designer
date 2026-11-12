// Studs never overlap or touch, on any part: no two closer, middle to middle, than a stud's width and half a
// millimetre (geom/studs.ts studApart). Nor do the anti-stud tubes underneath, nor the pins of the single rows: no two
// closer than their own width and 0.4 mm (two rows' pins can be nearer than a pitch where the rows meet at an angle,
// a crossing's ends at its corners: each is still its own row's).
// Found in the part's file itself, as it's printed: the round outlines of a stud's size in a slice half a millimetre
// under each flat top (whole circles and the arcs of ones run into each other alike), and the tubes' and pins' in a
// slice half a millimetre above its bottom. Nor is a pin that near a tube.
import type { Wasm } from '../src/geom/kernel';
import type { Piece } from '../src/app/build';
import { studApart } from '../src/geom/studs';
import { STUD } from '../src/geom/track';
import { TUBE_OD } from '../src/geom/underside';

type Pt = [number, number];
/** (mm) How much closer than the rule two may be found before it's said: the files are single precision. */
const SLACK = 0.02;
/** (mm) Tubes and pins: this much between two of them, at least. */
const GAP = 0.4;

/** The circles of radius r (give or take tol) among a slice's outlines: the middles that enough of an outline's corners lie round. */
export function circlesIn(polys: Pt[][], r: number, tol: number): Pt[] {
  const out: Pt[] = [];
  for (const p0 of polys) {
    // (points along a straight side taken out: a slice through a mesh has them where its triangles' edges cross it)
    const p = p0.filter((B, i) => { const A = p0[(i + p0.length - 1) % p0.length], C = p0[(i + 1) % p0.length]; return Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) > 1e-3 * Math.hypot(C[0] - A[0], C[1] - A[1]); });
    // (outlines only: a hole of a stud's size is a pin's hole)
    if (p.length < 7 || p.reduce((t, q, i) => { const m = p[(i + 1) % p.length]; return t + q[0] * m[1] - m[0] * q[1]; }, 0) <= 0) continue;
    const votes = new Map<string, { c: Pt; n: number }>();
    for (let i = 0; i < p.length; i++) {
      const A = p[i], B = p[(i + 1) % p.length], C = p[(i + 2) % p.length];
      const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
      // (round the outside of it: a hollow the same size cut into an outline, where the underside makes room for a stud, isn't one)
      if (d < 1e-9) continue;
      const a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
      const cx = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, cy = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d;
      if (Math.abs(Math.hypot(A[0] - cx, A[1] - cy) - r) > tol) continue;
      // (three corners next to each other on a 24- or 32-sided circle of this size, not three far apart that happen to fit)
      if (Math.hypot(A[0] - B[0], A[1] - B[1]) > r * 0.45 || Math.hypot(C[0] - B[0], C[1] - B[1]) > r * 0.45) continue;
      const key = `${Math.round(cx * 10)},${Math.round(cy * 10)}`, v = votes.get(key) ?? { c: [cx, cy] as Pt, n: 0 };
      v.n++; votes.set(key, v);
    }
    for (const v of votes.values()) if (v.n >= 5 && !out.some((o) => Math.hypot(o[0] - v.c[0], o[1] - v.c[1]) < 0.2)) out.push(v.c);
  }
  return out;
}
/** Each of ps within lim of one of qs (two kinds: a single row's pins and the hollow's tubes). */
const across = (ps: Pt[], qs: Pt[], lim: number, what: string, name: string) => {
  const out: string[] = [];
  for (const p of ps) for (const q of qs) {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < lim) out.push(`${name}: ${what} ${d.toFixed(2)} mm apart at ${p.map((v) => v.toFixed(1)).join(', ')} and ${q.map((v) => v.toFixed(1)).join(', ')}`);
  }
  return out;
};
const pairs = (ps: Pt[], lim: number, what: string, name: string) => {
  const out: string[] = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const d = Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]);
    if (d < lim) out.push(`${name}: ${what} ${d.toFixed(2)} mm apart at ${ps[i].map((v) => v.toFixed(1)).join(', ')} and ${ps[j].map((v) => v.toFixed(1)).join(', ')}`);
  }
  return out;
};

/** A part's studs, tubes and pins (o: the stud's width and fit, the anti-stud fit, it was built with). */
export function studsOf(w: Wasm, p: Piece, o: { studD: number; studFit: number; antistudFit?: number }) {
  const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge();
  const m = new w.Manifold(mesh), z0 = m.boundingBox().min[2], fit = o.antistudFit ?? 0.06;
  // (the flat tops: faces looking straight up, a stud's top or more of them at one height)
  const tops = new Map<number, number>();
  for (let j = 0; j < P.length; j += 9) {
    if (Math.abs(P[j + 2] - P[j + 5]) > 1e-4 || Math.abs(P[j + 2] - P[j + 8]) > 1e-4) continue;
    const a = ((P[j + 3] - P[j]) * (P[j + 7] - P[j + 1]) - (P[j + 6] - P[j]) * (P[j + 4] - P[j + 1])) / 2;
    if (a > 0) { const z = Math.round(P[j + 2] * 100) / 100; tops.set(z, (tops.get(z) ?? 0) + a); }
  }
  const studs: Pt[][] = [];
  for (const [z, a] of tops) if (a >= 15 && z - z0 >= 1.5) { const cs = circlesIn(m.slice(z - 0.5).toPolygons() as Pt[][], (o.studD + o.studFit) / 2, 0.03); if (cs.length) studs.push(cs); }
  const low = m.slice(z0 + 0.5).toPolygons() as Pt[][];
  const out = { studs, tubes: circlesIn(low, (TUBE_OD - fit) / 2, 0.02), pins: circlesIn(low, (STUD - o.studD - fit) / 2, 0.02) };
  m.delete();
  return out;
}

/** What's wrong with a build's parts, in words (none: nothing): studs, tubes or pins that touch or overlap. */
export function studFaults(w: Wasm, pieces: Piece[], optsOf: (p: Piece) => { studD: number; studFit: number; antistudFit?: number }): string[] {
  const out: string[] = [];
  for (const p of pieces) {
    // (the parts with studs or an underside for them: track, switch bases, ballast, lids and decks, the lever's bracket;
    // not bought track, nor the blades, sliders and levers)
    if (p.lego || !/track|switch-base|ballast|deck|lid|bracket/.test(p.name)) continue;
    const o = optsOf(p), s = studsOf(w, p, o);
    for (const level of s.studs) out.push(...pairs(level, studApart(o.studD) - SLACK, 'studs', p.name));
    const tubeD = TUBE_OD - (o.antistudFit ?? 0.06), pinD = STUD - o.studD - (o.antistudFit ?? 0.06);
    out.push(...pairs(s.tubes, tubeD + GAP, 'tubes', p.name), ...pairs(s.pins, pinD + GAP, 'pins', p.name));
    // (nor a single row's pin and a tube: a tube in the hollow beside a short piece's row stood 4 mm from a pin, one lump)
    out.push(...across(s.pins, s.tubes, (pinD + tubeD) / 2 + GAP, 'a pin and a tube', p.name));
  }
  return out;
}
