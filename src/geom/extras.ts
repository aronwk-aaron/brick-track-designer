// Small pieces of the OpenSCAD library the fixed trackwork (crossing.ts) and
// the switch bases (switch/base.ts) share: buffer stops (buffer.scad), LEGO
// Technic axle holes through the piece ends (straight.scad's
// technic_axle_holes, track_lib.scad's technic_hole), the breakaway supports
// under a snap peg and C-clip left above the bed on ballast
// (coupler_supports), and the seat a separately printed track drops into
// (generate_track / generate_ballast apart, track_fit_tol).
import { Scad, T, R, type Man } from './scad';
import { PLATE_H, STUD, type Track } from './track';

/** buffer.scad's settings. */
export interface BufferOptions {
  postPlates: number;   // 8: the posts' height above the ballast top, plates
  beamBottom: number;   // 2: the beam's bottom above the rail top, mm
  beamTop: number;      // 12: the beam's top above the rail top, mm
  pinHoles: boolean;    // true: Technic pin holes through the posts at beam height
}
export const BUFFER_DEFAULTS: BufferOptions = { postPlates: 8, beamBottom: 2, beamTop: 12, pinHoles: true };
/** How deep the buffer is (buffer_depth): its last two studs. */
export const BUFFER_DEPTH = 2 * STUD;
/** How far in from a buffered end the rails stop (they run 0.5 mm into the posts: far_rail_y = L - 2 studs + 0.5). */
export const BUFFER_RAIL_END = BUFFER_DEPTH - 0.5;

/** The posts' x range (each side, mirrored): 2 studs wide on the grid, over each rail. */
export function bufferPostX(t: Track): [number, number] {
  const x0 = Math.floor((t.c.railOffset - 4) / STUD) * STUD;
  return [x0, x0 + 2 * STUD];
}

/**
 * buffer_stop(), in its end's frame: the end at y = 0, the piece towards -y
 * (buffer.scad's frame with L = 0). Without ballast, stud recesses under the
 * slab (square, as every socket here).
 */
export function bufferStop(t: Track, bo: BufferOptions, onBallast: boolean): Man {
  const s = t.s, c = t.c, y0 = -BUFFER_DEPTH, L = 0;
  const railTop = PLATE_H + 6.4, postZ1 = PLATE_H + bo.postPlates * PLATE_H;
  const [px0, px1] = bufferPostX(t), bz0 = railTop + bo.beamBottom, bz1 = railTop + bo.beamTop;
  const parts: Man[] = [T(s.cube([c.sleeperLen, BUFFER_DEPTH, PLATE_H]), [-c.sleeperLen / 2, y0, 0])];
  for (const sg of [-1, 1]) {
    parts.push(T(s.cube([px1 - px0, BUFFER_DEPTH, postZ1]), [sg > 0 ? px0 : -px1, y0, 0]));
    for (const x of [px0 + 4, px1 - 4]) for (const y of [y0 + 4, L - 4]) parts.push(T(t.stud(), [sg * x, y, postZ1]));
  }
  if (bz1 > bz0) parts.push(T(s.cube([2 * px0 + 0.02, STUD, bz1 - bz0]), [-px0 - 0.01, y0, bz0]));
  const cuts: Man[] = [];
  if (bo.pinHoles)
    for (const sg of [-1, 1]) for (const x of [px0 + 4, px1 - 4])
      cuts.push(T(R(s.cylinder(BUFFER_DEPTH + 2, 2.5, 2.5, 32), [-90, 0, 0]), [sg * x, y0 - 1, (bz0 + bz1) / 2]));
  if (!onBallast)
    for (let x = -c.sleeperLen / 2 + 4; x <= c.sleeperLen / 2 + 1e-9; x += STUD) for (const y of [y0 + 4, L - 4])
      cuts.push(T(t.studSocket(t.o.studH + 0.2), [x, y, -0.01]));
  return s.difference(s.union(parts), cuts);
}

/** Is q (in the end's frame, as bufferStop's) where a stud on the bed would stand in a post? */
export function inBufferPost(t: Track, q: [number, number], r: number): boolean {
  const [px0, px1] = bufferPostX(t);
  return q[1] > -BUFFER_DEPTH - r && q[1] < r && Math.abs(q[0]) > px0 - r && Math.abs(q[0]) < px1 + r;
}

/** technic_hole(): the cross-shaped hole for a LEGO axle, 10 mm long (along z), centred. */
export function technicHole(s: Scad): Man {
  return s.union([s.cube([5, 2, 10], true), s.cube([2, 5, 10], true)]);
}

/**
 * The axle holes through one end (straight.scad's, with ballast and buddy):
 * under the outermost between-rails stud spots, 4 mm in from the end, at
 * z = -0.8, along the track. In the end's frame with the piece towards +y
 * (a start; an end's frame turned round).
 */
export function endAxleHoles(t: Track): Man {
  const raw = t.c.betweenRailsRaw, xs = raw.length > 1 ? [raw[0], raw[raw.length - 1]] : raw;
  return t.s.union(xs.map((x) => T(R(technicHole(t.s), [90, 0, 0]), [x, 4, -0.8])));
}

/** coupler_supports(z0): breakaway supports under the snap peg and C-clip tab, from z0 up to z = 0 (full_endpoint's frame). */
export function couplerSupports(t: Track, z0: number): Man | undefined {
  if (!t.c.hasCoupler) return undefined;
  return t.s.union([
    T(t.railSupport(3, -z0, false), [-t.c.couplerX - 1.5, -5, z0]),
    T(t.railSupport(8, -z0, false), [t.c.couplerX - 4, -5, z0]),
  ]);
}

/**
 * The seat a separately printed track drops into: the track's outline from
 * above, tol mm bigger all round, from z = 0 up (everything of the piece
 * there is the track's). Cut from the piece on ballast, it leaves the
 * ballast alone.
 */
export function trackSeat(s: Scad, track: Man, tol: number): Man {
  let cs = track.project();
  if (tol > 0) cs = cs.offset(tol, 'Miter', 2);
  return s.extrude(cs, 200);
}
