// Fixed trackwork pieces from any set of routes: every route's rails laid in
// full, each route's flangeways cut into the other routes' rails (so frogs
// and crossings fall out of the geometry), check rails where the solver puts
// them, a track bed under all the routes, end connectors and breakaway
// supports at every route end, and square stud sockets on the grid of the
// first route's start, so the piece sits on plates and baseplates.
import type { Pose, Route } from '../route/route';
import { hasRoll, railPoint, routeLat, routeLength, routePose, routeRoll, routeSOf } from '../route/route';
import { solve, type Solution, type SolverOptions, SOLVER_DEFAULTS } from '../route/solver';
import { Scad, T, R, type CS, type Man, type Vec2 } from './scad';
import { type Bank, bankPoint, sweepRoute } from './sweep';
import { hollowGrid } from './underside';
import { type ExtraBuilt, extraRails } from './extrarails';
import { DEFAULTS, PLATE_H, RAIL_PROFILE, STUD, Track, type TrackOptions } from './track';
import { BUFFER_DEFAULTS, BUFFER_RAIL_END, type BufferOptions, bufferStop, couplerSupports, endAxleHoles, inBufferPost, trackSeat } from './extras';

export interface CrossingOptions extends TrackOptions {
  flangeway: number;       // 3 (LEGO drawing)
  flangewayDepth: number;  // 3, down from the rail top
  checkRailW: number;      // 1
  supports: boolean;       // breakaway print supports at the route ends
  /**
   * Underside: 'edges' is hollow like a LEGO plate, with anti-stud tubes that
   * grip along the edges and every 4 studs inside, and thin posts elsewhere;
   * 'all' has a gripping square socket at every stud (holds too hard).
   */
  grip: 'edges' | 'all';
  /** On ballast (switch.scad's generate_ballast), with the wider bottom ("buddy") layer, or none: track only. */
  ballast?: 'none' | 'ballast' | 'buddy';
  /** With ballast: the underside, anti-stud (hollow with tubes) or float (flat). */
  bottomStyle?: 'antistud' | 'float';
  /**
   * The studs on the bed (on the sleepers, between and beside the rails):
   * 'grid', on the baseplate's stud grid, wherever they're clear; 'follow',
   * in rows along each track, on lines across it a stud apart at its centre
   * line, as the OpenSCAD curves have them (straight rows across a curve that
   * LEGO tiles fit on), off the baseplate's grid on a curve.
   */
  curveStuds?: 'grid' | 'follow';
  /**
   * Track only: under the rails a solid bed ('bed', as LEGO's switches), or
   * where the track is plain, sleepers with gaps between them ('sleepers', as
   * LEGO's straights and curves: straight.scad's), sleeperWidthStuds wide and
   * sleeperGapStuds apart; the bed kept where it meets another route and
   * under the points.
   */
  sleepers?: 'bed' | 'sleepers';
  /** Track only: the underside's sockets on the baseplate's stud grid ('baseplate'), or in rows along the track and turned with it ('track', as LEGO track's: for track off the grid, or on other studs) */
  undersideGrid?: 'baseplate' | 'track';
  sleeperGapStuds?: number;
  /** (buffer.scad) Route ends that end in a buffer stop, by where they are (mm), and the buffers' settings. */
  buffers?: [number, number][]; buffer?: BufferOptions;
  /** (straight.scad's technic_axle_holes) On ballast with the buddy: LEGO axle holes through each end. */
  axleHoles?: boolean;
  /** (clip_and_peg_on_ballast) On ballast: the end connectors keep their snap peg and C-clip. */
  pegOnBallast?: boolean;
  /** (generate_track off, generate_ballast on) The ballast alone, with a seat (this much clear each side, mm) the separately printed track drops into. */
  ballastOnly?: number;
}

export const CROSSING_DEFAULTS: CrossingOptions = { ...DEFAULTS, flangeway: 3, flangewayDepth: 3, checkRailW: 1, supports: true, grip: 'edges' };

const RAIL_TOP = PLATE_H + 6.4;
const HEAD_HW = 1.25;
const END = 4;        // rails stop this far from a route end (the connector takes over)
const BED_END = 8;    // the track bed stops here (the connector's base is the rest)

/** Place a shape given in a pose's frame (origin at the pose, +y along the heading). */
const atPose = (m: Man, p: [number, number, number]) => T(R(m, [0, 0, p[2]]), [p[0], p[1], 0]);

// Banked track (curves.scad's bank_piece): the track bed (the bed, rails,
// check rails and the studs on it, and the ballast's top layer, which is the
// bed) turned along a banked route by its roll about the inner rail's foot,
// the gap opened under the raised side filled, and kept above z = 0: the
// ballast's lower layers and the underside stay flat on the baseplate.
// (A route's roll comes from its segments: see route.ts.)
const bankAt = (g: number): Bank => ({ pivotX: g, pivotZ: PLATE_H });
/** A shape in a route end's frame turned by roll degrees about the bank's pivot (as sweepRoute turns the track there). */
const bankTurn = (m: Man, b: Bank, roll: number): Man => {
  if (Math.abs(roll) < 1e-12) return m;
  const px = roll > 0 ? -b.pivotX : b.pivotX;
  return T(R(T(m, [-px, 0, -b.pivotZ]), [0, -roll, 0]), [px, 0, b.pivotZ]);
};
/** What of m is above z (banked track kept above the bed's bottom, as curves.scad's bank_piece). */
const aboveZ = (s: Scad, m: Man, z: number) => { const big = 1e5; return s.intersection(m, T(s.cube([2 * big, 2 * big, 400]), [-big, -big, z])); };
/** A banked route's bed: the bed's section run 20 mm down, swept turned, cut off at z = floor (0; on ballast a little into the layer under it, to fuse with it) (the gap under the raised side filled). */
function bankedBed(s: Scad, rt: Route, b: Bank, hw: number, floor = 0, s0 = 0, s1 = Infinity): Man {
  const big = 1e5;
  return s.intersection(sweepRoute(s, s.square([2 * hw, PLATE_H + 20]).translate([-hw, -20]), rt, s0, s1, b), T(s.cube([2 * big, 2 * big, 200]), [-big, -big, floor]));
}
/** A sleeper (in its frame, at its middle) on a banked route: turned by the roll there, filled under, cut off at z = 0. */
function bankedSleeper(s: Scad, m: Man, b: Bank, roll: number, sleeperLen: number, w: number): Man {
  if (Math.abs(roll) < 1e-9) return m;
  const fill = T(s.cube([sleeperLen, w, 20]), [-sleeperLen / 2, -w / 2, -20]);
  return aboveZ(s, bankTurn(s.union([m, fill]), b, roll), 0);
}
/** The top t of each banked route's bed, turned with it (kept clear of the underside's cuts: the inner side comes down to near the bottom). */
function bankedRoof(s: Scad, routes: Route[], b: Bank, hw: number, t: number): Man {
  return s.union(routes.filter(hasRoll).map((rt) => sweepRoute(s, s.square([2 * hw, 20 + t]).translate([-hw, PLATE_H - t]), rt, 0, Infinity, b)));
}
/** A connector (or anything at a route end, in its frame, y into the route) at a banked end: turned with the bed, filled under, cut off at z = 0. */
function bankedEnd(s: Scad, m: Man, b: Bank, roll: number, sleeperLen: number, start: boolean): Man {
  const fill = T(s.cube([sleeperLen, 8, 20]), [-sleeperLen / 2, start ? 0 : -8, -20]), big = 1e4;
  return s.intersection(bankTurn(s.union([m, fill]), b, roll), T(s.cube([2 * big, 2 * big, 200]), [-big, -big, 0]));
}
/** A route end's breakaway supports (down to z0) at a banked end: made longer, turned with the rail ends, cut off at z0. */
function bankedSupports(s: Scad, mk: (z0: number) => Man, b: Bank, roll: number, z0: number): Man {
  const big = 1e4;
  return s.intersection(bankTurn(mk(z0 - 15), b, roll), T(s.cube([2 * big, 2 * big, 200]), [-big, -big, z0]));
}
/** A stud on the bed at q, on a banked route there: turned with the bed (undefined: level there). */
function bankedStud(routes: Route[], b: Bank, hw: number, q: [number, number], z: number, stud: Man): Man | undefined {
  const rt = routes.find((r2) => hasRoll(r2) && Math.abs(routeLat(r2, q)) <= hw);
  if (!rt) return undefined;
  const sq = routeSOf(rt, q), roll = routeRoll(rt, sq);
  if (Math.abs(roll) < 1e-9) return undefined;
  const [x, zz] = bankPoint(b, roll, routeLat(rt, q), z), p = railPoint(rt, sq, x);
  return T(R(stud, [0, -roll, routePose(rt, sq)[2]]), [p[0], p[1], zz]);
}

/** What a network piece (switch/network.ts) adds to the fixed trackwork: points built in. */
export interface CrossingExtras {
  /** cuts to each route's rails only (by route index): blades replacing rails, planed stock feet */
  railCuts?: Map<number, Man[]>;
  /** route ends inside the piece ("i:start" / "i:end"), where a route starts or ends on another: no connector there */
  innerEnds?: Set<string>;
  /** added to the piece, and cut from it at the end */
  adds?: Man[]; cuts?: Man[];
  /** the stud grid's origin and heading (default: the first route's start), so tiles of one layout share it */
  gridPose?: Pose;
  /** more floor to hollow out underneath with tubes, like the track bed's (the throw arms): rectangles [x0, x1, y0, y1] in frame P */
  hollows?: { P: Pose; r: [number, number, number, number] }[];
  /** (sleepers) the lines the piece will be cut along (for the bed, the baseplates): the bed kept across each, so the parts have floor there to join with */
  bedAt?: { p: [number, number]; d: [number, number] }[];
}

/** Route ends that another route runs on from, end to end (a route drawn in two, the track into a wye's toe): "i:start" / "i:end". */
export function joinedEnds(routes: Route[]): Set<string> {
  const out = new Set<string>();
  const endsAll = routes.flatMap((rt, i) => { const a = routePose(rt, 0), b = routePose(rt, routeLength(rt)); return [{ k: `${i}:start`, p: a, leave: a[2] }, { k: `${i}:end`, p: b, leave: b[2] + 180 }]; });
  for (const a of endsAll) for (const b of endsAll)
    if (a !== b && Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 0.01 && Math.abs(((((a.leave - b.leave) % 360) + 540) % 360) - 180) > 179.5) out.add(a.k); // (leaving opposite ways: one runs on from the other; a loop's own ends too)
  return out;
}

/**
 * Sleeper centres along a route of length L (mm), as straight.scad's
 * sleeper_js: gapStuds apart, the first that far from the end connector (half
 * of it from an end that runs on into another route), spread round the middle
 * by whole studs, so on a straight that starts on the stud grid their posts are
 * on it too.
 */
export function sleeperSpots(L: number, in0: boolean, in1: boolean, gapStuds: number, wStuds: number): number[] {
  const sp = gapStuds + wStuds, ja = in0 ? sp / 2 : 1 + gapStuds + wStuds / 2, jb = in1 ? sp / 2 : 1 + gapStuds + wStuds / 2;
  const jMax = L / STUD - jb;
  if (jMax < ja - 1e-9) return [];
  const n = Math.floor((jMax - ja) / sp + 1e-9) + 1, j0 = ja + Math.floor(((jMax - ja) - (n - 1) * sp) / 2 + 1e-9);
  return Array.from({ length: n }, (_, k) => (j0 + k * sp) * STUD);
}

/** grips, if given, gets the centres of the gripping stud sockets on the bed (mm). */
export function crossingPiece(s: Scad, routes: Route[], o: CrossingOptions = CROSSING_DEFAULTS, solution?: Solution, grips?: [number, number][], x0: CrossingExtras = {}): Man {
  // (route ends that another route runs on from, end to end (a route drawn in two, the track into a wye's toe): inner
  // ends too, the piece one through there, not two connectors laid over each other inside it)
  const joined = new Set([...(x0.innerEnds ?? []), ...joinedEnds(routes)]);
  const x: CrossingExtras = { ...x0, innerEnds: joined };
  const t = new Track(s, o), c = t.c, g = c.railOffset;
  // (route ends that end in a buffer stop: no connector, the rails run into its posts, the bed and ballast to the end)
  const bufAt = (q: Pose) => !!o.buffers?.some((b) => Math.hypot(b[0] - q[0], b[1] - q[1]) < 0.5);
  const bufEnd = (i: number, end: 'start' | 'end') => !x.innerEnds?.has(`${i}:${end}`) && bufAt(end === 'start' ? routes[i].start : routePose(routes[i], routeLength(routes[i])));
  // (the ballast alone, printed apart from the track: no supports, the track's connectors with their peg and clip for its seat)
  const alone = o.ballastOnly !== undefined;
  if (alone) o = { ...o, supports: false };
  const sol = solution ?? solve(routes, { ...SOLVER_DEFAULTS, gauge: c.trackGauge, flangeway: o.flangeway, checkRailW: o.checkRailW } as SolverOptions);
  const rect = (x0: number, x1: number, z0: number, z1: number) => s.square([x1 - x0, z1 - z0]).translate([x0, z0]);

  // Each route's flangeways: the band just inside each rail, from flangeway
  // depth below the rail top up, swept along the whole route.
  const bands = routes.map((rt) => sweepRoute(s,
    rect(g - HEAD_HW - o.flangeway, g - HEAD_HW, RAIL_TOP - o.flangewayDepth, RAIL_TOP + 1)
      .add(rect(-g + HEAD_HW, -g + HEAD_HW + o.flangeway, RAIL_TOP - o.flangewayDepth, RAIL_TOP + 1)), rt, 0, Infinity, bankAt(g)));
  // (only the routes near enough to cut each other: on a big layout, every
  // route against every other is most of the work)
  const boxes = routes.map((rt) => {
    const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 4)), b = [Infinity, Infinity, -Infinity, -Infinity], pad = c.sleeperLen / 2 + 4;
    for (let k = 0; k <= n; k++) { const p = routePose(rt, (L * k) / n); b[0] = Math.min(b[0], p[0] - pad); b[1] = Math.min(b[1], p[1] - pad); b[2] = Math.max(b[2], p[0] + pad); b[3] = Math.max(b[3], p[1] + pad); }
    return b;
  });
  const meet = (a: number[], b: number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  const othersBands = (i: number) => bands.filter((_, j) => j !== i && meet(boxes[i], boxes[j]));
  const nearCuts = (i: number, ms: Man[]) => ms.filter((m) => { const bb = m.boundingBox(); return meet(boxes[i], [bb.min[0], bb.min[1], bb.max[0], bb.max[1]]); });

  // On ballast (track_lib.scad's, as the switches have it): two plates
  // thick, its top at the sleepers' top, the top layer as wide as the
  // sleepers and each step below a stud wider; with buddy, a wider bottom
  // layer under it.
  const onBallast = !!o.ballast && o.ballast !== 'none', buddy = o.ballast === 'buddy', antistud = (o.bottomStyle ?? 'antistud') === 'antistud';
  const topW = c.sleeperLen, midW = topW + 2 * STUD, botW = midW + 2 * STUD, thick = 2 * PLATE_H, bz0 = -PLATE_H;
  const buddyT = antistud ? PLATE_H : thick / 4, bottomZ = onBallast ? (buddy ? bz0 - buddyT : bz0) : 0;
  const parts: Man[] = [];
  // Track only with sleepers: where each route needs the bed after all (s ranges): near another route (their beds
  // meet: switches, crossings, tracks side by side), and under the points and the throw's floor
  const sleepered = !onBallast && o.sleepers === 'sleepers';
  // (as real turnouts: where tracks run close together at a small angle (points, crossovers), long ties across them
  // all with gaps between, frogs and all, not a solid bed; solid only by the points' parts, across tracks crossing at
  // an angle, and at the cuts)
  const headingDiff = (a: number, b: number) => { const d = Math.abs((((a - b) % 360) + 540) % 360 - 180); return Math.min(d, 180 - d); };
  const zoned = sleepered ? routes.map((_, i) => bedZones(i)) : [];
  const zones: [number, number][][] = zoned.map((z) => z.core);
  const tieZones: [number, number][][] = zoned.map((z) => z.tie);
  // (with sleepers: where each is, by route and along it, and its ends across the track (a long tie's reach further), for the underside)
  const sleeperAt: { i: number; v: number; lo: number; hi: number }[] = [];
  const inZone = (i: number, sAt: number, m = 0) => zones[i].some(([a, b]) => sAt >= a + m && sAt <= b - m);
  const inTie = (i: number, sAt: number) => tieZones[i].some(([a, b]) => sAt >= a && sAt <= b);
  // (a long tie square to a route at P, reaching lo to hi across it: too near an end connector to be built)
  const tieEnds = routes.flatMap((r2, k) => [!x.innerEnds?.has(`${k}:start`) && routePose(r2, 0), !x.innerEnds?.has(`${k}:end`) && routePose(r2, routeLength(r2))]).filter((e): e is Pose => !!e);
  // (a point o across the tie inside an end connector's box: the end's width across, its length in from the end and
  // the tie's half-width more)
  const inEndBox = (P: Pose, o2: number) => {
    const hd = (P[2] * Math.PI) / 180;
    return tieEnds.some((e) => {
      const dx = P[0] + Math.cos(hd) * o2 - e[0], dy = P[1] + Math.sin(hd) * o2 - e[1], he = (e[2] * Math.PI) / 180;
      return Math.abs(dx * Math.cos(he) + dy * Math.sin(he)) < c.sleeperLen / 2 + 2 && Math.abs(-dx * Math.sin(he) + dy * Math.cos(he)) < c.sleeperW / 2 + BED_END + 2;
    });
  };
  /** (the tie's reach, cut back short of any end connector out to the side; undefined: one is under its own track) */
  const tieClear = (P: Pose, lo: number, hi: number): [number, number] | undefined => {
    const half = c.sleeperLen / 2;
    let lo2 = lo, hi2 = hi;
    for (let o2 = -half; o2 <= half + 1e-9; o2 += 4) if (inEndBox(P, o2)) return undefined;
    for (let o2 = -half; o2 >= lo - 1e-9; o2 -= 4) if (inEndBox(P, o2)) { lo2 = o2 + 4; break; }
    for (let o2 = half; o2 <= hi + 1e-9; o2 += 4) if (inEndBox(P, o2)) { hi2 = o2 - 4; break; }
    // (whole studs across, from the track's own sleeper's ends)
    lo2 = -half - Math.floor((-half - lo2) / STUD + 1e-9) * STUD; hi2 = half + Math.floor((hi2 - half) / STUD + 1e-9) * STUD;
    return [lo2, hi2];
  };
  /** (a long tie on route i at v: its reach across, from the left of every track it runs under to the right) */
  const longTie = (i: number, v: number): [number, number] => {
    const rt = routes[i], P = routePose(rt, v), q = [P[0], P[1]] as Vec2, half = c.sleeperLen / 2;
    let lo = -half, hi = half;
    for (const [k, r2] of routes.entries()) {
      if (k === i) continue;
      const sk = routeSOf(r2, q), Lk = routeLength(r2);
      if (sk <= 0.01 || sk >= Lk - 0.01) continue;
      const lat = routeLat(r2, q), dh = headingDiff(P[2], routePose(r2, sk)[2]);
      if (Math.abs(lat) > 2 * c.sleeperLen || dh > 35) continue;
      const off = -lat / Math.cos((dh * Math.PI) / 180);
      lo = Math.min(lo, off - half); hi = Math.max(hi, off + half);
    }
    return [Math.max(lo, -2 * c.sleeperLen), Math.min(hi, 2 * c.sleeperLen)];
  };
  const tieStuds: Vec2[] = [];
  // (the long ties built so far, the lower routes' first: a route's spot under one of them, within half a tie spacing, is served)
  const tiesBuilt: { i: number; P: Pose; lo: number; hi: number }[] = [];
  const served = (i: number, q: Vec2) => tiesBuilt.some((tb) => {
    if (tb.i === i) return false;
    const dx = q[0] - tb.P[0], dy = q[1] - tb.P[1], hd = (tb.P[2] * Math.PI) / 180;
    const across = dx * Math.cos(hd) + dy * Math.sin(hd), along = -dx * Math.sin(hd) + dy * Math.cos(hd);
    return across >= tb.lo - 1 && across <= tb.hi + 1 && Math.abs(along) <= ((o.sleeperGapStuds ?? 2) + (o.sleeperWidthStuds ?? 2)) * STUD / 2 + 1;
  });
  // (each route's guard rails and third rail, if it has them: extrarails.ts)
  const extras = routes.map((_, i) => extraRails(s, t, routes, i, !!x.innerEnds?.has(`${i}:start`), !!x.innerEnds?.has(`${i}:end`)));
  routes.forEach((rt, i) => {
    const L = routeLength(rt), ex: ExtraBuilt | undefined = extras[i];
    // Rails and this route's check rails, grooved by the other routes' flangeways.
    const p0 = routePose(rt, 0), p1 = routePose(rt, L);
    // Ends cut square to each end, as curves.scad does (so a curve's rails end
    // where the next piece's rail ends begin): boxes from the end in, in each
    // end's frame.
    const bufS = bufEnd(i, 'start'), bufE = bufEnd(i, 'end');
    const inStart = x.innerEnds?.has(`${i}:start`) || bufS, inEnd = x.innerEnds?.has(`${i}:end`) || bufE;
    const endBoxes = (depth: number, bufDepth?: number) => {
      const w = c.sleeperLen + 2 * STUD;
      const box = (d: number, y: number) => T(s.cube([w, d + 1, 30]), [-w / 2, y, -5]);
      return [!inStart && atPose(box(depth, -1), p0), !inEnd && atPose(box(depth, -depth), p1),
        bufS && bufDepth !== undefined && atPose(box(bufDepth, -1), p0), bufE && bufDepth !== undefined && atPose(box(bufDepth, -bufDepth), p1)];
    };
    const rails = s.difference(s.union([-g, g].map((x) =>
      sweepRoute(s, s.polygon(RAIL_PROFILE.map(([px, py]) => [px + x, py + PLATE_H] as Vec2)), rt, 0, Infinity, bankAt(g)))), endBoxes(END, BUFFER_RAIL_END));
    const checks = sol.checkRails.filter((cr) => cr.route === i)
      .map((cr) => sweepRoute(s, rect(cr.offset, cr.offset + cr.width, PLATE_H - 0.01, RAIL_TOP), rt, cr.s0, cr.s1, bankAt(g)));
    const railsAll = s.difference(s.union([rails, ...checks]), [...othersBands(i), ...nearCuts(i, x.railCuts?.get(i) ?? [])]);
    parts.push(hasRoll(rt) ? aboveZ(s, railsAll, 0) : railsAll); // (banked: the rails' feet, run down through the bed, turned, kept above its bottom)
    const banked = hasRoll(rt), roll0 = banked ? routeRoll(rt, 0) : 0, roll1 = banked ? routeRoll(rt, L) : 0;
    const bedAlong = (a = 0, b = Infinity) => (banked ? bankedBed(s, rt, bankAt(g), c.sleeperLen / 2, onBallast ? -1 : 0, a, b) : sweepRoute(s, rect(-c.sleeperLen / 2, c.sleeperLen / 2, 0, PLATE_H), rt, a, b));
    // Track bed under the route (with sleepers: only where it needs it, sleepers elsewhere).
    if (!sleepered) parts.push(s.difference(bedAlong(), endBoxes(BED_END)));
    else {
      const bed = zones[i].map(([a, b]) => bedAlong(a, b));
      if (bed.length) parts.push(s.difference(s.union(bed), endBoxes(BED_END)));
      // (as the whole route has them, unless this stretch of it has an end connector of its own partway along it: a
      // plain track built in lengths, each a piece of its own, LEGO's way; then each piece's own, from its connectors)
      const in0 = x.innerEnds?.has(`${i}:start`) ?? false, in1 = x.innerEnds?.has(`${i}:end`) ?? false, wf = rt.sleeperFrame;
      const f = wf && (in0 || wf.s0 < 0.01) && (in1 || wf.s0 + L > wf.L - 0.01) ? wf : { s0: 0, L, in0, in1 };
      const spotsAll = sleeperSpots(f.L, f.in0, f.in1, o.sleeperGapStuds ?? 2, o.sleeperWidthStuds).map((v) => v - f.s0).filter((v) => v >= 0 && v <= L && !inZone(i, v));
      const at = spotsAll.filter((v) => !inTie(i, v));
      // (long ties: square to this route, out under the tracks beside it; clear of every end connector)
      for (const v of spotsAll.filter((v2) => inTie(i, v2))) {
        const P = routePose(rt, v), hd = (P[2] * Math.PI) / 180, n2: Vec2 = [Math.cos(hd), Math.sin(hd)], al: Vec2 = [-Math.sin(hd), Math.cos(hd)];
        if (served(i, [P[0], P[1]])) continue;
        const span = tieClear(P, ...longTie(i, v));
        if (!span) continue;
        tiesBuilt.push({ i, P, lo: span[0], hi: span[1] });
        sleeperAt.push({ i, v, lo: span[0], hi: span[1] });
        parts.push(atPose(T(s.cube([span[1] - span[0], c.sleeperW, PLATE_H]), [span[0], -c.sleeperW / 2, 0]), P));
        // (its studs: rows as a sleeper's, a stud apart across it)
        const nW = o.sleeperWidthStuds ?? 2;
        for (let r = 0; r < nW; r++) for (let lt = span[0] + STUD / 2; lt <= span[1] - STUD / 2 + 1e-9; lt += STUD) {
          const dy = (r - (nW - 1) / 2) * STUD;
          tieStuds.push([P[0] + n2[0] * lt + al[0] * dy, P[1] + n2[1] * lt + al[1] * dy]);
        }
      }
      // (banked: each sleeper turned by the roll at it)
      for (const v of at) sleeperAt.push({ i, v, lo: -c.sleeperLen / 2, hi: c.sleeperLen / 2 });
      if (at.length) parts.push(s.union(at.map((v) => { const P = routePose(rt, v), sl = t.sleeper(true, ex?.postOk(P)); return atPose(banked ? bankedSleeper(s, sl, bankAt(g), routeRoll(rt, v), c.sleeperLen, c.sleeperW) : sl, P); })));
    }
    // End connectors and breakaway supports, at both ends.
    // (on ballast: no peg and clip, no stud recesses, as the switches')
    const peg = !onBallast || !!o.pegOnBallast || alone;
    // (at a banked end, a route left banked to its end: turned with the bed)
    const conn0 = T(t.fullEndpoint(peg, !onBallast, ex?.xfs[0], ex?.guardX), [0, 4, 0]), conn1 = T(R(t.fullEndpoint(peg, !onBallast, ex?.xfs[1], ex?.guardX), [0, 0, 180]), [0, -4, 0]);
    if (!inStart) parts.push(atPose(roll0 ? bankedEnd(s, conn0, bankAt(g), roll0, c.sleeperLen, true) : conn0, p0));
    if (!inEnd) parts.push(atPose(roll1 ? bankedEnd(s, conn1, bankAt(g), roll1, c.sleeperLen, false) : conn1, p1));
    // (buffer stops, in their end's frame; the peg and clip above the bed on ballast held up by breakaway supports)
    if (bufS) parts.push(atPose(R(bufferStop(t, o.buffer ?? BUFFER_DEFAULTS, onBallast), [0, 0, 180]), p0));
    if (bufE) parts.push(atPose(bufferStop(t, o.buffer ?? BUFFER_DEFAULTS, onBallast), p1));
    if (onBallast && peg && o.supports) {
      const cs = couplerSupports(t, bottomZ - 0.02);
      if (cs && !inStart) parts.push(atPose(T(cs, [0, 4, 0]), p0));
      if (cs && !inEnd) parts.push(atPose(T(R(cs, [0, 0, 180]), [0, -4, 0]), p1));
    }
    if (o.supports) {
      const zs = bottomZ - 0.02;
      if (!inStart) parts.push(atPose(roll0 ? s.union([bankedSupports(s, (z) => t.startRailSupports(z, ex?.xfs[0]), bankAt(g), roll0, zs), t.supportFooting(zs, 0, -1)]) : s.union([t.startRailSupports(zs, ex?.xfs[0]), t.supportFooting(zs, 0, -1)]), p0));
      if (!inEnd) parts.push(atPose(roll1 ? s.union([bankedSupports(s, (z) => t.endRailSupports(z, ex?.xfs[1]), bankAt(g), roll1, zs), t.supportFooting(zs, 0, +1)]) : s.union([t.endRailSupports(zs, ex?.xfs[1]), t.supportFooting(zs, 0, +1)]), p1));
    }
    if (ex?.solid) parts.push(banked ? aboveZ(s, ex.solid, 0) : ex.solid); // (banked: turned with the track, kept above the bed's bottom)
  });
  // Studs on the bed, as on LEGO track's sleepers: on the stud grid (of the
  // grid pose), between and beside the rails, wherever they're clear of
  // every rail (and its flangeway), of the end connectors (which have their
  // own) and of the points (their parts lie on the bed).
  const addBoxes = (x.adds ?? []).map((m) => m.boundingBox());
  const bufPoses = routes.flatMap((rt, i) => [bufEnd(i, 'start') && reversePose(routePose(rt, 0)), bufEnd(i, 'end') && routePose(rt, routeLength(rt))]).filter((e): e is Pose => !!e);
  const studPts: [number, number][] = [];
  {
    const gp = x.gridPose ?? routePose(routes[0], 0), hd = (gp[2] * Math.PI) / 180, clearR = c.postD / 2 + HEAD_HW + 0.6;
    const bb0 = parts.length ? s.union(parts).boundingBox() : { min: [0, 0, 0], max: [0, 0, 0] };
    const reachS = Math.ceil((Math.hypot(bb0.max[0] - bb0.min[0], bb0.max[1] - bb0.min[1]) + Math.hypot(bb0.min[0] - gp[0], bb0.min[1] - gp[1])) / STUD) + 2;
    const ends = routes.flatMap((rt, i) => [!x.innerEnds?.has(`${i}:start`) && routePose(rt, 0), !x.innerEnds?.has(`${i}:end`) && routePose(rt, routeLength(rt))]).filter((e): e is Pose => !!e);
    // (the spots to try: the stud grid's, or along each track at the straight track's places across it, a stud apart along it)
    const spots: [number, number][] = [];
    if (o.curveStuds === 'follow') for (const rt of routes) {
      const L = routeLength(rt), lats: number[] = [];
      for (let lt = 4; lt <= c.sleeperLen / 2; lt += STUD) lats.push(lt, -lt);
      for (let sAt = 4; sAt <= L - 4 + 1e-9; sAt += STUD) for (const lt of lats) spots.push(railPoint(rt, sAt, lt) as [number, number]);
    } else for (let i = -reachS; i <= reachS; i++) for (let j = -reachS; j <= reachS; j++) {
      const lx = 4 + i * STUD, ly = 4 + j * STUD;
      spots.push([gp[0] + lx * Math.cos(hd) - ly * Math.sin(hd), gp[1] + lx * Math.sin(hd) + ly * Math.cos(hd)]);
    }
    const onTie = new Set<[number, number]>(tieStuds as [number, number][]);
    spots.push(...(tieStuds as [number, number][]));
    for (const q of spots) {
      if (q[0] < bb0.min[0] || q[0] > bb0.max[0] || q[1] < bb0.min[1] || q[1] > bb0.max[1]) continue;
      // (following the tracks: not two at one place, where tracks meet)
      if (o.curveStuds === 'follow' && studPts.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < c.postD + 0.6)) continue;
      // (on some route's bed, well inside it)
      if (!onTie.has(q) && !routes.some((r2, k) => Math.abs(routeLat(r2, q)) <= c.sleeperLen / 2 - c.postD / 2 - 0.5 && (!sleepered || inZone(k, routeSOf(r2, q), c.postD / 2 + 0.5)))) continue;
      // (clear of every rail and its flangeway)
      if (!routes.every((r2) => Math.abs(Math.abs(routeLat(r2, q)) - g) >= clearR)) continue;
      // (and of the guard rails and third rails)
      if (extras.some((ex) => ex && !ex.clearOf(q))) continue;
      // (clear of the end connectors: 8 mm in from each end)
      if (ends.some((e) => { const dx = q[0] - e[0], dy = q[1] - e[1]; return Math.hypot(dx, dy) < c.sleeperLen && Math.abs(-dx * Math.sin((e[2] * Math.PI) / 180) + dy * Math.cos((e[2] * Math.PI) / 180)) < 10; })) continue;
      if (addBoxes.some((bb) => q[0] > bb.min[0] - 3 && q[0] < bb.max[0] + 3 && q[1] > bb.min[1] - 3 && q[1] < bb.max[1] + 3)) continue;
      if (bufPoses.some((e) => inBufferPost(t, toLocal(e, q), c.postD / 2 + 0.6, (o.buffer ?? BUFFER_DEFAULTS).style ?? 'frame'))) continue;
      // (and of the check rails)
      if (sol.checkRails.some((cr) => {
        const rt = routes[cr.route], lat = routeLat(rt, q), mid = cr.offset + cr.width / 2;
        if (Math.abs(lat - mid) > c.postD / 2 + cr.width / 2 + 0.6) return false;
        const sq2 = routeSOf(rt, q); return sq2 >= cr.s0 - 3 && sq2 <= cr.s1 + 3;
      })) continue;
      studPts.push(q);
    }
  }
  const anyBank = routes.some(hasRoll), bedStud = t.stud(c.postD, c.postH);
  const bedStuds = studPts.length ? s.union(studPts.map(([px, py]) => (anyBank && bankedStud(routes, bankAt(g), c.sleeperLen / 2, [px, py], PLATE_H - 0.2, bedStud)) || T(t.stud(c.postD, c.postH), [px, py, PLATE_H - 0.2]))) : undefined;
  const body = s.union([...parts, ...(x.adds ?? []), bedStuds]);
  if (onBallast) return withAxleHoles(ballastPiece());

  // The underside, on the stud grid of the first route's start (spots at
  // 4 + 8k across and along in that frame, as on a straight).
  const box = body.boundingBox();
  const p0 = x.gridPose ?? routePose(routes[0], 0), h = (p0[2] * Math.PI) / 180;
  const reach = Math.ceil((Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1]) + Math.hypot(box.min[0] - p0[0], box.min[1] - p0[1])) / STUD) + 2;
  const world = (lx: number, ly: number): [number, number] => [p0[0] + lx * Math.cos(h) - ly * Math.sin(h), p0[1] + lx * Math.sin(h) + ly * Math.cos(h)];
  const spots: { i: number; j: number; x: number; y: number }[] = [];
  for (let i = -reach; i <= reach; i++)
    for (let j = -reach; j <= reach; j++) {
      const [x, y] = world(4 + i * STUD, 4 + j * STUD);
      if (x < box.min[0] - 4 || x > box.max[0] + 4 || y < box.min[1] - 4 || y > box.max[1] + 4) continue;
      spots.push({ i, j, x, y });
    }
  const cavH = o.studH + 0.21;
  const socket = (x: number, y: number) => T(R(t.studSocket(cavH), [0, 0, p0[2]]), [x, y, -0.01]);
  // (banked: the underside's hollows and sockets kept 0.8 mm under the bed's turned top, which comes down on the inner side)
  const roofed = (ms: Man[]) => (anyBank ? [s.difference(s.union(ms), [bankedRoof(s, routes, bankAt(g), c.sleeperLen / 2 + 1, 0.8)])] : ms);
  if (o.grip === 'all' && o.undersideGrid !== 'track') return s.difference(body, [...roofed(spots.map(({ x, y }) => socket(x, y))), ...(x.cuts ?? [])]);
  // 'edges': hollow like a LEGO plate, a rim round each route's bed (not
  // under the end connectors), with anti-stud tubes between the studs that
  // grip along the edges and every 4 studs inside; elsewhere thin posts hold
  // the roof up without touching the studs, so it is easy to pull off.
  // Spots not wholly in the hollow keep gripping square sockets, as before.
  const WALL = 1.39, TUBE_OD = 6.51 - (o.antistudFit ?? 0.06), TUBE_ID = 4.8, POST_D = 3;
  const hw = c.sleeperLen / 2 - WALL;
  // each route's bed, less the rim, cut square to each end's frame (on a
  // curve a cut across the bed at one arc length isn't square to the end)
  const beds = routes.map((rt) => {
    const L = routeLength(rt), cut = BED_END + WALL, i0 = routes.indexOf(rt);
    // (a buffered end has no connector: the hollow runs on under the buffer's slab to the rim at the end, as the rest)
    const cutAt = (k: number) => (bufEnd(i0, k > 0 ? 'start' : 'end') ? WALL : cut);
    if (L <= cutAt(1) + cutAt(-1)) return undefined;
    const n = Math.max(2, Math.ceil(L));
    const side = (o2: number, a = 0, b = L) => Array.from({ length: n + 1 }, (_, k) => railPoint(rt, a + ((b - a) * k) / n, o2) as Vec2);
    // (with sleepers, only where the bed is, a rim across each of its ends that isn't the route's end)
    const i = routes.indexOf(rt);
    if (sleepered && !zones[i].length) return undefined;
    let bed = !sleepered ? s.polygon([...side(-hw), ...side(hw).reverse()])
      : s.w.CrossSection.union(zones[i].map(([a, b]) => [a > 0 ? a + WALL : a, b < L ? b - WALL : b]).filter(([a, b]) => b > a + 1).map(([a, b]) => s.polygon([...side(-hw, a, b), ...side(hw, a, b).reverse()])));
    for (const [e, k] of [[routePose(rt, 0), 1], [routePose(rt, L), -1]] as const) {
      const big = 4 * (L + c.sleeperLen);
      // the half-plane beyond the cut, in the end's frame (+y into the route at the start)
      const keep = s.w.CrossSection.square([2 * big, big]).translate([-big, cutAt(k)]).rotate(k > 0 ? 0 : 180).rotate(e[2]).translate([e[0], e[1]]);
      bed = bed.intersect(keep);
    }
    return bed;
  }).filter((b): b is NonNullable<typeof b> => !!b);
  // (and the extra floor: each rectangle less the rim)
  const extra = (x.hollows ?? []).map(({ P, r }) => ({ P, r: [r[0] + WALL, r[1] - WALL, r[2] + WALL, r[3] - WALL] as const }))
    .filter(({ r }) => r[1] > r[0] && r[3] > r[2]);
  const inExtra = (pt: [number, number], m: number) => extra.some(({ P, r }) => {
    const dx = pt[0] - P[0], dy = pt[1] - P[1], hd = (P[2] * Math.PI) / 180;
    const lx = dx * Math.cos(hd) + dy * Math.sin(hd), ly = -dx * Math.sin(hd) + dy * Math.cos(hd);
    return lx >= r[0] + m && lx <= r[1] - m && ly >= r[2] + m && ly <= r[3] - m;
  });
  for (const { P, r } of extra) beds.push(s.w.CrossSection.square([r[1] - r[0], r[3] - r[2]]).translate([r[0], r[2]]).rotate(P[2]).translate([P[0], P[1]]));
  // (lined up with the track: hollow as LEGO track's underside, with anti-stud tubes in rows along each track a stud
  // apart, turned with it, between its rows of studs; none in the end connectors (they have their own), none two at a
  // place where tracks meet)
  if (o.undersideGrid === 'track') {
    const at: Vec2[] = [], tubesT: CS[] = [];
    for (const [ri, rt] of routes.entries()) {
      const L = routeLength(rt), m = TUBE_OD / 2 + 0.2;
      const lo = (bufEnd(ri, 'start') ? WALL : BED_END + WALL) + m, hi = L - (bufEnd(ri, 'end') ? WALL : BED_END + WALL) - m;
      for (let sAt = STUD; sAt <= L - STUD + 1e-9; sAt += STUD) {
        if (sAt < lo || sAt > hi) continue;
        if (sleepered && !zones[ri].some(([a, b]) => sAt >= (a > 0 ? a + WALL + m : a) && sAt <= (b < L ? b - WALL - m : b))) continue;
        for (let lt = 0; lt <= c.sleeperLen / 2 - STUD + 1e-9; lt += STUD) for (const sd of lt ? [-1, 1] : [1]) {
          const q = railPoint(rt, sAt, sd * lt) as Vec2;
          if (at.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < TUBE_OD + 0.5)) continue;
          at.push(q);
          tubesT.push(s.w.CrossSection.circle(TUBE_OD / 2, 24).subtract(s.w.CrossSection.circle(TUBE_ID / 2, 24)).translate(q));
        }
      }
    }
    // (and each sleeper hollow under it too, as LEGO's: two studs wide, a row of tubes down its middle; one stud wide,
    // a socket at each stud)
    const nW = o.sleeperWidthStuds ?? 2, socksT: Man[] = [];
    for (const { i, v, lo, hi } of sleeperAt) {
      const P = routePose(routes[i], v), toW = (lx: number, ly: number): Vec2 => { const h2 = (P[2] * Math.PI) / 180; return [P[0] + lx * Math.cos(h2) - ly * Math.sin(h2), P[1] + lx * Math.sin(h2) + ly * Math.cos(h2)]; };
      if (nW >= 2) {
        const ha = (nW * STUD) / 2 - WALL;
        beds.push(s.w.CrossSection.square([hi - lo - 2 * WALL, 2 * ha]).translate([lo + WALL, -ha]).rotate(P[2]).translate([P[0], P[1]]));
        for (let k = 0; k <= nW - 2; k++) for (let lt = lo + STUD; lt <= hi - STUD + 1e-9; lt += STUD)
          tubesT.push(s.w.CrossSection.circle(TUBE_OD / 2, 24).subtract(s.w.CrossSection.circle(TUBE_ID / 2, 24)).translate(toW(lt, (k - (nW - 2) / 2) * STUD)));
      } else for (let lt = lo + STUD / 2; lt <= hi - STUD / 2 + 1e-9; lt += STUD) {
        const q = toW(lt, 0); socksT.push(T(R(t.studSocket(cavH), [0, 0, P[2]]), [q[0], q[1], -0.01]));
      }
    }
    // (and under each end connector, a socket at each stud of its row, as the baseplate grid gives a track on it: the
    // breakaway supports under the rail ends stand in them, apart from the part)
    for (const [i, rt] of routes.entries()) {
      const L = routeLength(rt);
      for (const [end, sAt] of [['start', STUD / 2], ['end', L - STUD / 2]] as const) {
        if (x.innerEnds?.has(`${i}:${end}`) || bufEnd(i, end) || L < STUD) continue;
        const hd = routePose(rt, sAt)[2];
        for (let lt = STUD / 2; lt <= c.sleeperLen / 2 - STUD / 2 + 1e-9; lt += STUD) for (const sd of [-1, 1]) {
          const q = railPoint(rt, sAt, sd * lt); socksT.push(T(R(t.studSocket(cavH), [0, 0, hd]), [q[0], q[1], -0.01]));
        }
      }
    }
    const cutsT: Man[] = [...socksT];
    if (beds.length) {
      let hollow = s.w.CrossSection.union(beds);
      if (tubesT.length) hollow = hollow.subtract(s.w.CrossSection.union(tubesT));
      cutsT.push(T(s.extrude(hollow, cavH), [0, 0, -0.01]));
    }
    return s.difference(body, [...roofed(cutsT), ...(x.cuts ?? [])]);
  }
  const deepCache = new Map<string, boolean>();
  // a stud at spot (i, j) is wholly inside the hollow of some route's bed
  const deep = (i: number, j: number) => {
    const k = `${i},${j}`;
    let v = deepCache.get(k);
    if (v === undefined) {
      const pt = world(4 + i * STUD, 4 + j * STUD), m = o.studD / 2 + 0.1; // stud radius and a little clearance
      v = inExtra(pt, m) || routes.some((rt, ri) => {
        const lat = routeLat(rt, pt);
        if (Math.abs(lat) > hw - m) return false;
        if (sleepered) { const L = routeLength(rt), sq = routeSOf(rt, pt); if (!zones[ri].some(([a, b]) => sq >= (a > 0 ? a + WALL + m : a) && sq <= (b < L ? b - WALL - m : b))) return false; }
        // and clear of both ends' connectors (measured along each end's frame)
        const L = routeLength(rt);
        return [routePose(rt, 0), routePose(rt, L)].every((e, k) => {
          const dx = pt[0] - e[0], dy = pt[1] - e[1];
          if (Math.hypot(dx, dy) > c.sleeperLen + 2 * STUD) return true;
          const hd = (e[2] * Math.PI) / 180, along = (-dx * Math.sin(hd) + dy * Math.cos(hd)) * (k ? -1 : 1);
          return along >= (bufEnd(ri, k ? 'end' : 'start') ? WALL : BED_END + WALL) + m;
        });
      });
      deepCache.set(k, v);
    }
    return v;
  };
  const tubes: CS[] = [], posts: CS[] = [];
  for (const { i, j } of spots) {
    if (!(deep(i, j) && deep(i + 1, j) && deep(i, j + 1) && deep(i + 1, j + 1))) continue;
    const ring = [-1, 0, 1, 2].flatMap((a) => [-1, 0, 1, 2].map((b) => [a, b])).filter(([a, b]) => a < 0 || a > 1 || b < 0 || b > 1);
    const edge = ring.some(([a, b]) => !deep(i + a, j + b));
    const lattice = ((i % 4) + 4) % 4 === 0 && ((j % 4) + 4) % 4 === 0;
    const [x, y] = world(8 + i * STUD, 8 + j * STUD);
    if (edge || lattice) {
      tubes.push(s.w.CrossSection.circle(TUBE_OD / 2, 24).subtract(s.w.CrossSection.circle(TUBE_ID / 2, 24)).translate([x, y]));
      grips?.push([x, y]);
    } else posts.push(s.w.CrossSection.circle(POST_D / 2, 24).translate([x, y]));
  }
  const cuts: Man[] = [];
  if (beds.length) {
    let hollow = s.w.CrossSection.union(beds);
    if (tubes.length || posts.length) hollow = hollow.subtract(s.w.CrossSection.union([...tubes, ...posts]));
    cuts.push(T(s.extrude(hollow, cavH), [0, 0, -0.01]));
  }
  for (const { i, j, x, y } of spots) if (!deep(i, j)) cuts.push(socket(x, y));
  return s.difference(body, [...roofed(cuts), ...(x.cuts ?? [])]);

  /**
   * (sleepers) Where route i keeps its bed: the stretches (s ranges) near
   * another route (closer than a sleeper's length: their beds meet), or by the
   * points' parts and the throw's floor, a sleeper's half-width more each way.
   */
  function bedZones(i: number): { core: [number, number][]; tie: [number, number][] } {
    const rt = routes[i], L = routeLength(rt), step = 2, n = Math.max(1, Math.ceil(L / step));
    const ends = (k: number) => [routePose(routes[k], 0), routePose(routes[k], routeLength(routes[k]))];
    // (a route this one runs on from, end to end: not near it just there, where they join)
    const shared = routes.map((_, j) => (j === i ? [] : ends(i).filter((e) => ends(j).some((f) => Math.hypot(e[0] - f[0], e[1] - f[1]) < 0.01))));
    const near2 = routes.map((_, j) => j !== i && meet(boxes[i], boxes[j]));
    const addBb = (x.adds ?? []).map((m) => m.boundingBox());
    const hol = (x.hollows ?? []).map(({ P, r }) => ({ P, r }));
    const marked: number[] = [], tied: number[] = [];
    for (let k = 0; k <= n; k++) {
      const sAt = (L * k) / n, q = routePose(rt, sAt).slice(0, 2) as [number, number];
      // (where a sleeper here, across this route, would reach onto another route's bed: the square where two tracks
      // cross (as LEGO's crossing: solid in the middle, sleepers on its arms), or all along tracks side by side)
      const hd = (routePose(rt, sAt)[2] * Math.PI) / 180, nx = Math.cos(hd), ny = Math.sin(hd), half = c.sleeperLen / 2;
      const meets = (r2: Route, j: number) => near2[j] && !shared[j].some((e) => Math.hypot(q[0] - e[0], q[1] - e[1]) < c.sleeperLen)
          && [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].some((f) => Math.abs(routeLat(r2, [q[0] + nx * half * f, q[1] + ny * half * f])) < half + 1);
      // (a track beside this one at a small angle: long ties there; one crossing it at an angle: solid)
      const steep = (r2: Route) => headingDiff(routePose(rt, sAt)[2], routePose(r2, Math.min(Math.max(routeSOf(r2, q), 0), routeLength(r2)))[2]) > 35;
      const nearAny = routes.some((r2, j) => meets(r2, j));
      const near = routes.some((r2, j) => meets(r2, j) && steep(r2))
        || addBb.some((bb) => q[0] > bb.min[0] - c.sleeperLen / 2 && q[0] < bb.max[0] + c.sleeperLen / 2 && q[1] > bb.min[1] - c.sleeperLen / 2 && q[1] < bb.max[1] + c.sleeperLen / 2)
        || hol.some(({ P, r }) => {
          const dx = q[0] - P[0], dy = q[1] - P[1], hd = (P[2] * Math.PI) / 180;
          const lx = dx * Math.cos(hd) + dy * Math.sin(hd), ly = -dx * Math.sin(hd) + dy * Math.cos(hd), m = c.sleeperLen / 2;
          return lx >= r[0] - m && lx <= r[1] + m && ly >= r[2] - m && ly <= r[3] + m;
        });
      // (and across each cut line, the joint's room either side: a cut in a gap had nothing but the rails to join)
      const atCut = (x.bedAt ?? []).some((ln) => Math.abs((q[0] - ln.p[0]) * -ln.d[1] + (q[1] - ln.p[1]) * ln.d[0]) < 10);
      if (near || atCut) marked.push(sAt); else if (nearAny) tied.push(sAt);
    }
    const ranges = (vs: number[]) => {
      const grow = 2, out: [number, number][] = [];
      for (const v of vs) {
        const a = Math.max(0, v - grow), b = Math.min(L, v + grow), last = out[out.length - 1];
        if (last && a <= last[1] + step) last[1] = b; else out.push([a, b]);
      }
      return out;
    };
    return { core: ranges(marked), tie: ranges(tied) };
  }

  /** The piece on ballast: the layers under every route, studs on each step, and the underside (anti-stud or flat). */
  function ballastPiece(): Man {
    // (its own constants: it runs before the track-only underside's are set)
    const W = s.w, studR = t.o.studD / 2, RIM = 1.39;
    const layer2d = rect(-topW / 2, topW / 2, bz0, bz0 + thick).add(rect(-midW / 2, midW / 2, bz0, bz0 + thick / 2));
    // (a banked route's top layer above z = 0 is its bed, turned: only the layers below are swept here)
    const layers = routes.map((rt) => sweepRoute(s, hasRoll(rt) ? rect(-midW / 2, midW / 2, bz0, bz0 + thick / 2) : layer2d, rt));
    const buddies = buddy ? routes.map((rt) => sweepRoute(s, rect(-botW / 2, botW / 2, bottomZ, bz0), rt)) : [];
    // (the top layer cut back at each connector, which sits on the one below)
    const endCuts = routes.flatMap((rt, i) => [
      !x.innerEnds?.has(`${i}:start`) && !bufEnd(i, 'start') && atPose(T(s.cube([topW + STUD, 12, PLATE_H + 1]), [-(topW + STUD) / 2, -4, 0]), routePose(rt, 0)),
      !x.innerEnds?.has(`${i}:end`) && !bufEnd(i, 'end') && atPose(T(s.cube([topW + STUD, 12, PLATE_H + 1]), [-(topW + STUD) / 2, -8, 0]), routePose(rt, routeLength(rt))),
    ]);
    // studs along each step, about a stud apart, none under another route's higher layer
    const latOthers = (i: number, q: [number, number]) => Math.min(Infinity, ...routes.map((rt, j) => (j === i ? Infinity : Math.abs(routeLat(rt, q)))));
    const pts: [number, number, number][] = [];
    const row = (i: number, off: number, z: number, hwUp: number) => {
      const rt = routes[i], L = routeLength(rt);
      const rowL = L; // (near enough: studs a little under or over a stud apart on a curve)
      const n = Math.max(1, Math.round((rowL - 8) / STUD));
      for (let k = 0; k <= n; k++) {
        const q = railPoint(rt, 4 + (k * (L - 8)) / n, off);
        if (latOthers(i, q) > hwUp + studR + 0.5 && !pts.some((p) => Math.abs(p[2] - z) < 0.1 && Math.hypot(p[0] - q[0], p[1] - q[1]) < 6)) pts.push([q[0], q[1], z]);
      }
    };
    routes.forEach((_, i) => {
      for (const sd of [-1, 1]) {
        row(i, sd * (midW / 2 - 4), 0, topW / 2);
        if (buddy) row(i, sd * (botW / 2 - 4), bz0, midW / 2);
      }
    });
    const studs = s.union(pts.map(([px, py, z]) => T(t.stud(), [px, py, z - 0.01])));
    const ballastBody = s.difference(s.union([...layers, ...buddies]), endCuts);
    let out = s.union([body, ballastBody, studs]);
    // (the ballast alone: the seat, the outline of the track as printed on its own (its sleepers, if it has them, and its
    // connectors' peg and clip) a little bigger all round, from the bed up; of the track only what's under the bed (the
    // points' arms) kept)
    if (alone) {
      const own = crossingPiece(s, routes, { ...o, ballast: 'none', ballastOnly: undefined, supports: false, axleHoles: false }, sol, undefined, x0);
      const bb = body.boundingBox(), below = s.intersection(body, T(s.cube([bb.max[0] - bb.min[0] + 2, bb.max[1] - bb.min[1] + 2, 200]), [bb.min[0] - 1, bb.min[1] - 1, -200]));
      out = s.difference(s.union([below, ballastBody, studs]), [trackSeat(s, own, o.ballastOnly ?? 0)]);
    }
    if (antistud) {
      // hollow inside a rim, LEGO tubes on the stud grid (of the grid pose), a socket at every stud
      const wOut = buddy ? botW : midW;
      const outline = W.CrossSection.union([
        ...routes.map((rt) => {
          const L = routeLength(rt), n = Math.max(2, Math.ceil(L));
          const side = (o2: number) => Array.from({ length: n + 1 }, (_, k) => railPoint(rt, (L * k) / n, o2) as Vec2);
          return s.polygon([...side(-wOut / 2), ...side(wOut / 2).reverse()]);
        }),
        ...(x.hollows ?? []).map(({ P, r }) => s.w.CrossSection.square([r[1] - r[0], r[3] - r[2]]).translate([r[0], r[2]]).rotate(P[2]).translate([P[0], P[1]])),
      ]);
      const cav = outline.offset(-RIM, 'Miter', 1000), cavH = o.studH + 0.2;
      const bb = outline.bounds(), gp = x.gridPose ?? routePose(routes[0], 0), hd = (gp[2] * Math.PI) / 180;
      const reach2 = Math.ceil((Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) + Math.hypot(bb.min[0] - gp[0], bb.min[1] - gp[1])) / STUD) + 2;
      const wd = (lx: number, ly: number): [number, number] => [gp[0] + lx * Math.cos(hd) - ly * Math.sin(hd), gp[1] + lx * Math.sin(hd) + ly * Math.cos(hd)];
      // (only the grid spots over the outline's box)
      const toG = (q: [number, number]) => { const dx = q[0] - gp[0], dy = q[1] - gp[1]; return [(dx * Math.cos(hd) + dy * Math.sin(hd)) / STUD, (-dx * Math.sin(hd) + dy * Math.cos(hd)) / STUD]; };
      const cs = [toG([bb.min[0], bb.min[1]]), toG([bb.max[0], bb.min[1]]), toG([bb.min[0], bb.max[1]]), toG([bb.max[0], bb.max[1]])];
      const i0 = Math.floor(Math.min(...cs.map((q) => q[0]))) - 2, i1 = Math.ceil(Math.max(...cs.map((q) => q[0]))) + 1;
      const j0 = Math.floor(Math.min(...cs.map((q) => q[1]))) - 2, j1 = Math.ceil(Math.max(...cs.map((q) => q[1]))) + 1;
      void reach2;
      const hg = hollowGrid(s, t, cav, wd, i0, i1, j0, j1, o.grip);
      grips?.push(...hg.grips);
      const under = T(s.extrude(hg.cut, cavH + 0.01), [0, 0, bottomZ - 0.01]);
      const tubes = hg.tubes ? T(s.extrude(hg.tubes, cavH), [0, 0, bottomZ]) : undefined;
      out = s.union([s.difference(out, [under]), tubes]);
    }
    return s.difference(out, x.cuts ?? []);
  }

  /** (axleHoles, with ballast and buddy, the track on it) LEGO axle holes through every end, buffered ones too (as straight.scad's). */
  function withAxleHoles(m: Man): Man {
    if (!o.axleHoles || !buddy || alone) return m;
    const holes = endAxleHoles(t);
    return s.difference(m, routes.flatMap((rt, i) => [
      !x.innerEnds?.has(`${i}:start`) && atPose(holes, routePose(rt, 0)),
      !x.innerEnds?.has(`${i}:end`) && atPose(R(holes, [0, 0, 180]), routePose(rt, routeLength(rt))),
    ]));
  }
}

/** A pose turned round (the same place, heading the other way). */
const reversePose = (p: Pose): Pose => [p[0], p[1], p[2] + 180];
/** A point in a pose's frame (+y along its heading). */
const toLocal = (e: Pose, q: [number, number]): [number, number] => {
  const dx = q[0] - e[0], dy = q[1] - e[1], h = (e[2] * Math.PI) / 180;
  return [dx * Math.cos(h) + dy * Math.sin(h), -dx * Math.sin(h) + dy * Math.cos(h)];
};
