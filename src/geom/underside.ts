// A track-only piece's underside on the stud grid (track_lib.scad's
// stud_spots(), ported): hollow like a LEGO plate where there is floor over
// the studs, with anti-stud tubes along the piece's edges and every 4 studs
// and thin posts elsewhere; loose recesses for studs wholly under the piece
// but off the hollow; gripping round sockets for the rest.
import { clipNear, T, type CS, type Man, type Scad } from './scad';
import { getSocketShape, PLATE_H, STUD, type Track } from './track';

/** A grid spot: position and its place on the grid. */
export type Spot = [number, number, number, number];

export const BOTTOM_WALL = 1.39, TUBE_OD = 6.51, TUBE_ID = 4.8, ANTISTUD_FIT = 0.06, POST_D = 3;

export interface Underside {
  /** What to take out of the piece. */
  cut: Man;
  /** The tubes and posts to add back (the sleepers may already be hollow underneath), up to the sleepers' top. */
  tubes?: Man;
  /** Where the gripping tubes are. */
  grips: [number, number][];
  /** Each tube's and post's plan, with its centre and whether it's a gripping tube (to drop any that hold on to nothing). */
  shapes?: { c: [number, number]; tube: boolean; cs: CS }[];
}

/**
 * stud_spots(spots, bed, u, v, h, turn, solid). bed(x, y, m): is the point
 * at least m inside the bed (and clear of the end connectors' bases);
 * solid(x, y): is there floor over the spot. grip 'all': a gripping socket
 * at every spot (and no tubes).
 */
export function studSpots(s: Scad, t: Track, spots: Spot[], bed: (x: number, y: number, m: number) => boolean,
  u: [number, number], v: [number, number], h: number, turn = 0, solid: (x: number, y: number) => boolean = () => true,
  grip: 'edges' | 'all' = 'edges'): Underside {
  const W = s.w, recessW = t.o.studD + 1.0;
  // (everything cut is the same height: drawn in plan, unioned there and
  // extruded once, much faster than hundreds of solids)
  const sq2 = (w: number, x: number, y: number) => W.CrossSection.square([w, w], true).rotate(turn).translate([x, y]);
  const socket = (x: number, y: number) => (getSocketShape() === 'round' ? W.CrossSection.circle(t.c.studSocketW / 2, 24).translate([x, y]) : sq2(t.c.studSocketW, x, y));
  const recess = (x: number, y: number) => (getSocketShape() === 'round' ? W.CrossSection.circle(recessW / 2, 24).translate([x, y]) : sq2(recessW, x, y));
  const extrudeCut = (cs: CS[]) => T(s.extrude(W.CrossSection.union(cs), h), [0, 0, -0.01]);
  if (grip === 'all') return { cut: extrudeCut(spots.map(([x, y]) => socket(x, y))), grips: [] };
  const at = (q: Spot | [number, number], a: number, b: number): [number, number] =>
    [q[0] + STUD * (a * u[0] + b * v[0]), q[1] + STUD * (a * u[1] + b * v[1])];
  const k4 = 4 - BOTTOM_WALL;
  const hollowAt = (q: [number, number]) => solid(q[0], q[1])
    && [-1, 1].every((a) => [-1, 1].every((b) => bed(q[0] + k4 * (a * u[0] + b * v[0]), q[1] + k4 * (a * u[1] + b * v[1]), BOTTOM_WALL - 0.001)));
  const hol = spots.map((q) => hollowAt([q[0], q[1]]));
  const under = (q: [number, number]) => bed(q[0], q[1], recessW / 2);
  const mod4 = (n: number) => ((n % 4) + 4) % 4;
  const corners: { c: [number, number]; tube: boolean }[] = [];
  spots.forEach((p, k) => {
    const c = at(p, 0.5, 0.5);
    if (!(under([p[0], p[1]]) && under(at(p, 1, 0)) && under(at(p, 0, 1)) && under(at(p, 1, 1)) && solid(c[0], c[1]))) return;
    let edge = false;
    for (let a = -1; a <= 2 && !edge; a++) for (let b = -1; b <= 2 && !edge; b++)
      if ((a < 0 || a > 1 || b < 0 || b > 1) && !bed(...at(p, a, b), 0)) edge = true;
    const lattice = mod4(p[2]) === 0 && mod4(p[3]) === 0;
    const allHollow = hol[k] && hollowAt(at(p, 1, 0)) && hollowAt(at(p, 0, 1)) && hollowAt(at(p, 1, 1));
    if (edge || lattice || allHollow) corners.push({ c, tube: edge || lattice });
  });
  const shape = (q: { c: [number, number]; tube: boolean }): CS => (q.tube
    ? W.CrossSection.circle((TUBE_OD - ANTISTUD_FIT) / 2, 24).subtract(W.CrossSection.circle(TUBE_ID / 2, 24))
    : W.CrossSection.circle(POST_D / 2, 24)).translate(q.c);
  const tubes = corners.length ? s.extrude(W.CrossSection.union(corners.map(shape)), PLATE_H) : undefined;
  const squares = spots.filter((_, k) => hol[k])
    .map(([x, y]) => W.CrossSection.square([STUD + 0.002, STUD + 0.002], true).rotate(turn).translate([x, y]));
  const plan: CS[] = [];
  if (squares.length) {
    let hollow = W.CrossSection.union(squares).offset(-BOTTOM_WALL, 'Miter', 1000);
    if (corners.length) hollow = hollow.subtract(W.CrossSection.union(corners.map(shape)));
    plan.push(hollow);
  }
  spots.forEach((p, k) => { if (!hol[k]) plan.push(under([p[0], p[1]]) ? recess(p[0], p[1]) : socket(p[0], p[1])); });
  return { cut: extrudeCut(plan), tubes, shapes: corners.map((q) => ({ ...q, cs: shape(q) })), grips: corners.filter((q) => q.tube).map((q) => q.c) };
}

/**
 * A hollow underside on the stud grid (the ballast's bottom): cav is the
 * hollow (inside its rim), studs at wd(4 + 8i, 4 + 8j). 'edges': anti-stud
 * tubes where a stud next to the corner isn't wholly in the hollow (along
 * its edges) and every 4 studs inside, thin posts elsewhere (they hold the
 * roof up without touching the studs), and a socket for each stud not
 * wholly in the hollow; 'all': a tube at every corner and a socket at every
 * stud (holds too hard). cut: what to take out (the hollow and sockets);
 * tubes: the tubes and posts (in the hollow); grips: the tubes' centres.
 */
export function hollowGrid(s: Scad, t: Track, cav: CS, wd: (lx: number, ly: number) => [number, number], i0: number, i1: number, j0: number, j1: number,
  grip: 'edges' | 'all'): { cut: CS; tubes?: CS; grips: [number, number][] } {
  const W = s.w, studR = t.o.studD / 2 + 0.1;
  const deepC = new Map<string, boolean>(), nearCav = clipNear(W, cav, 4);
  const deep = (i: number, j: number) => {
    const k = `${i},${j}`;
    let v = deepC.get(k);
    if (v === undefined) { const q = wd(4 + i * STUD, 4 + j * STUD); v = W.CrossSection.circle(studR, 12).translate(q).subtract(nearCav(q)).area() < 0.01; deepC.set(k, v); }
    return v;
  };
  const tubeCS = (q: [number, number]) => W.CrossSection.circle((TUBE_OD - ANTISTUD_FIT) / 2, 24).subtract(W.CrossSection.circle((TUBE_ID + ANTISTUD_FIT) / 2, 24)).translate(q);
  const socks: CS[] = [], shapes: CS[] = [], grips: [number, number][] = [];
  // (square sockets, turned with the grid)
  const o0 = wd(0, 0), o1 = wd(1, 0), gridTurn = (Math.atan2(o1[1] - o0[1], o1[0] - o0[0]) * 180) / Math.PI;
  const mod4 = (n: number) => ((n % 4) + 4) % 4;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const sp = wd(4 + i * STUD, 4 + j * STUD), cn = wd(8 + i * STUD, 8 + j * STUD);
    if (grip === 'all' || !deep(i, j)) socks.push(getSocketShape() === 'round' ? W.CrossSection.circle(t.c.studSocketW / 2, 24).translate(sp) : W.CrossSection.square([t.c.studSocketW, t.c.studSocketW], true).rotate(gridTurn).translate(sp));
    if (grip === 'all') {
      const ring = tubeCS(cn);
      if (ring.intersect(nearCav(cn)).area() > 1) { shapes.push(ring); grips.push(cn); }
      continue;
    }
    if (!(deep(i, j) && deep(i + 1, j) && deep(i, j + 1) && deep(i + 1, j + 1))) continue;
    let edge = false;
    for (let a = -1; a <= 2 && !edge; a++) for (let b = -1; b <= 2 && !edge; b++)
      if ((a < 0 || a > 1 || b < 0 || b > 1) && !deep(i + a, j + b)) edge = true;
    if (edge || (mod4(i) === 0 && mod4(j) === 0)) { shapes.push(tubeCS(cn)); grips.push(cn); }
    else shapes.push(W.CrossSection.circle(POST_D / 2, 24).translate(cn));
  }
  return { cut: W.CrossSection.union([cav, ...socks]), tubes: shapes.length ? W.CrossSection.union(shapes).intersect(cav) : undefined, grips };
}

/**
 * Grip along a cut part's edges: where a piece was cut (for the bed or the
 * baseplates), its new edges had neither the rim nor the anti-stud tubes the
 * piece's own edges have, so the part sat loose on the plate. Adds the rim
 * round the whole of the part's outline (under its roof) and a tube at each
 * stud corner a stud in from it, wherever the part is hollow there. gp: the
 * stud grid (studs at 4 + 8k in its frame); bottom: the underside's z.
 */
export function edgeGrip(s: Scad, t: Track, part: Man, gp: [number, number, number], bottom: number): Man {
  const W = s.w, cavH = t.o.studH + 0.2;
  const roof = part.slice(bottom + cavH + 0.3), mid = part.slice(bottom + cavH / 2);
  if (roof.area() < 1) return part;
  const inner = roof.offset(-BOTTOM_WALL, 'Miter', 1000);
  // (the rim, only where it's hollow now)
  const rim = roof.subtract(inner).subtract(mid);
  const bb = roof.bounds(), h = (gp[2] * Math.PI) / 180;
  const toG = (x: number, y: number) => { const dx = x - gp[0], dy = y - gp[1]; return [(dx * Math.cos(h) + dy * Math.sin(h)) / STUD, (-dx * Math.sin(h) + dy * Math.cos(h)) / STUD]; };
  const cs = [toG(bb.min[0], bb.min[1]), toG(bb.max[0], bb.min[1]), toG(bb.min[0], bb.max[1]), toG(bb.max[0], bb.max[1])];
  const i0 = Math.floor(Math.min(...cs.map((q) => q[0]))) - 1, i1 = Math.ceil(Math.max(...cs.map((q) => q[0]))) + 1;
  const j0 = Math.floor(Math.min(...cs.map((q) => q[1]))) - 1, j1 = Math.ceil(Math.max(...cs.map((q) => q[1]))) + 1;
  const rings: CS[] = [], bores: CS[] = [];
  // (each test against the outlines near the spot only: clipNear)
  const nearInner = clipNear(W, inner, 4), nearRoof = clipNear(W, roof, 10.5), nearMid = clipNear(W, mid, 4);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const lx = i * STUD, ly = j * STUD, q: [number, number] = [gp[0] + lx * Math.cos(h) - ly * Math.sin(h), gp[1] + lx * Math.sin(h) + ly * Math.cos(h)];
    // (a stud in from the edge: the tube under the roof and clear of the rim, but within 10 mm of the outline)
    if (q[0] < bb.min[0] - 10 || q[0] > bb.max[0] + 10 || q[1] < bb.min[1] - 10 || q[1] > bb.max[1] + 10) continue; // (nowhere near it: the first test fails)
    if (W.CrossSection.circle(TUBE_OD / 2 + 0.2, 24).translate(q).subtract(nearInner(q)).area() > 0.01) continue;
    if (W.CrossSection.circle(10, 24).translate(q).subtract(nearRoof(q)).area() < 0.01) continue;
    // (and where it's hollow: not in a pocket, nor on a tube or post already there)
    const ring = W.CrossSection.circle((TUBE_OD - ANTISTUD_FIT) / 2, 24).subtract(W.CrossSection.circle((TUBE_ID + ANTISTUD_FIT) / 2, 24)).translate(q);
    if (ring.intersect(nearMid(q)).area() > 0.5) continue;
    rings.push(ring);
    // (a thin post already there, inside where the tube goes: taken out, or it'd stand in the tube where the stud goes)
    const bore = W.CrossSection.circle((TUBE_ID + ANTISTUD_FIT) / 2, 24).translate(q);
    if (bore.intersect(nearMid(q)).area() > 0.05) bores.push(bore);
  }
  const add = [rim.area() > 0.5 ? T(s.extrude(rim, cavH), [0, 0, bottom]) : undefined, rings.length ? T(s.extrude(W.CrossSection.union(rings), cavH), [0, 0, bottom]) : undefined].filter((m): m is Man => !!m);
  const out = add.length ? s.union([part, ...add]) : part;
  return bores.length ? s.difference(out, [T(s.extrude(W.CrossSection.union(bores), cavH + 0.01), [0, 0, bottom - 0.01])]) : out;
}
