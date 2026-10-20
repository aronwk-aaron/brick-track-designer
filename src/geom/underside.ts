// A track-only piece's underside on the stud grid (track_lib.scad's
// stud_spots(), ported): hollow like a LEGO plate where there is floor over
// the studs, with anti-stud tubes along the piece's edges and every 4 studs
// and thin posts elsewhere; loose recesses for studs wholly under the piece
// but off the hollow; gripping square sockets for the rest.
import { T, R, type CS, type Man, type Scad } from './scad';
import { PLATE_H, STUD, type Track } from './track';

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
  const socket = (x: number, y: number) => sq2(t.c.studSocketW, x, y);
  const recess = (x: number, y: number) => sq2(recessW, x, y);
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
