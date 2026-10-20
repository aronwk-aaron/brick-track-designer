// Fixed trackwork pieces from any set of routes: every route's rails laid in
// full, each route's flangeways cut into the other routes' rails (so frogs
// and crossings fall out of the geometry), check rails where the solver puts
// them, a track bed under all the routes, end connectors and breakaway
// supports at every route end, and square stud sockets on the grid of the
// first route's start, so the piece sits on plates and baseplates.
import type { Pose, Route } from '../route/route';
import { railPoint, routeLat, routeLength, routePose } from '../route/route';
import { solve, type Solution, type SolverOptions, SOLVER_DEFAULTS } from '../route/solver';
import { Scad, T, R, type CS, type Man, type Vec2 } from './scad';
import { sweepRoute } from './sweep';
import { DEFAULTS, PLATE_H, RAIL_PROFILE, STUD, Track, type TrackOptions } from './track';

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
}

export const CROSSING_DEFAULTS: CrossingOptions = { ...DEFAULTS, flangeway: 3, flangewayDepth: 3, checkRailW: 1, supports: true, grip: 'edges' };

const RAIL_TOP = PLATE_H + 6.4;
const HEAD_HW = 1.25;
const END = 4;        // rails stop this far from a route end (the connector takes over)
const BED_END = 8;    // the track bed stops here (the connector's base is the rest)

/** Place a shape given in a pose's frame (origin at the pose, +y along the heading). */
const atPose = (m: Man, p: [number, number, number]) => T(R(m, [0, 0, p[2]]), [p[0], p[1], 0]);

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
}

/** grips, if given, gets the centres of the gripping stud sockets on the bed (mm). */
export function crossingPiece(s: Scad, routes: Route[], o: CrossingOptions = CROSSING_DEFAULTS, solution?: Solution, grips?: [number, number][], x: CrossingExtras = {}): Man {
  const t = new Track(s, o), c = t.c, g = c.railOffset;
  const sol = solution ?? solve(routes, { ...SOLVER_DEFAULTS, gauge: c.trackGauge, flangeway: o.flangeway, checkRailW: o.checkRailW } as SolverOptions);
  const rect = (x0: number, x1: number, z0: number, z1: number) => s.square([x1 - x0, z1 - z0]).translate([x0, z0]);

  // Each route's flangeways: the band just inside each rail, from flangeway
  // depth below the rail top up, swept along the whole route.
  const bands = routes.map((rt) => sweepRoute(s,
    rect(g - HEAD_HW - o.flangeway, g - HEAD_HW, RAIL_TOP - o.flangewayDepth, RAIL_TOP + 1)
      .add(rect(-g + HEAD_HW, -g + HEAD_HW + o.flangeway, RAIL_TOP - o.flangewayDepth, RAIL_TOP + 1)), rt));
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

  const parts: Man[] = [];
  routes.forEach((rt, i) => {
    const L = routeLength(rt);
    // Rails and this route's check rails, grooved by the other routes' flangeways.
    const p0 = routePose(rt, 0), p1 = routePose(rt, L);
    // Ends cut square to each end, as curves.scad does (so a curve's rails end
    // where the next piece's rail ends begin): boxes from the end in, in each
    // end's frame.
    const inStart = x.innerEnds?.has(`${i}:start`), inEnd = x.innerEnds?.has(`${i}:end`);
    const endBoxes = (depth: number) => {
      const w = c.sleeperLen + 2 * STUD;
      return [!inStart && atPose(T(s.cube([w, depth + 1, 30]), [-w / 2, -1, -5]), p0),
        !inEnd && atPose(T(s.cube([w, depth + 1, 30]), [-w / 2, -depth, -5]), p1)];
    };
    const rails = s.difference(s.union([-g, g].map((x) =>
      sweepRoute(s, s.polygon(RAIL_PROFILE.map(([px, py]) => [px + x, py + PLATE_H] as Vec2)), rt))), endBoxes(END));
    const checks = sol.checkRails.filter((cr) => cr.route === i)
      .map((cr) => sweepRoute(s, rect(cr.offset, cr.offset + cr.width, PLATE_H - 0.01, RAIL_TOP), rt, cr.s0, cr.s1));
    parts.push(s.difference(s.union([rails, ...checks]), [...othersBands(i), ...nearCuts(i, x.railCuts?.get(i) ?? [])]));
    // Track bed under the route.
    parts.push(s.difference(sweepRoute(s, rect(-c.sleeperLen / 2, c.sleeperLen / 2, 0, PLATE_H), rt), endBoxes(BED_END)));
    // End connectors and breakaway supports, at both ends.
    if (!inStart) parts.push(atPose(T(t.fullEndpoint(true, true), [0, 4, 0]), p0));
    if (!inEnd) parts.push(atPose(T(R(t.fullEndpoint(true, true), [0, 0, 180]), [0, -4, 0]), p1));
    if (o.supports) {
      if (!inStart) parts.push(atPose(s.union([t.startRailSupports(-0.02), t.supportFooting(-0.02, 0, -1)]), p0));
      if (!inEnd) parts.push(atPose(s.union([t.endRailSupports(-0.02), t.supportFooting(-0.02, 0, +1)]), p1));
    }
  });
  const body = s.union([...parts, ...(x.adds ?? [])]);

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
  if (o.grip === 'all') return s.difference(body, [...spots.map(({ x, y }) => socket(x, y)), ...(x.cuts ?? [])]);

  // 'edges': hollow like a LEGO plate, a rim round each route's bed (not
  // under the end connectors), with anti-stud tubes between the studs that
  // grip along the edges and every 4 studs inside; elsewhere thin posts hold
  // the roof up without touching the studs, so it is easy to pull off.
  // Spots not wholly in the hollow keep gripping square sockets, as before.
  const WALL = 1.39, TUBE_OD = 6.51 - 0.06, TUBE_ID = 4.8, POST_D = 3;
  const hw = c.sleeperLen / 2 - WALL;
  // each route's bed, less the rim, cut square to each end's frame (on a
  // curve a cut across the bed at one arc length isn't square to the end)
  const beds = routes.map((rt) => {
    const L = routeLength(rt), cut = BED_END + WALL;
    if (L <= 2 * cut) return undefined;
    const n = Math.max(2, Math.ceil(L));
    const side = (o2: number) => Array.from({ length: n + 1 }, (_, k) => railPoint(rt, (L * k) / n, o2) as Vec2);
    let bed = s.polygon([...side(-hw), ...side(hw).reverse()]);
    for (const [e, k] of [[routePose(rt, 0), 1], [routePose(rt, L), -1]] as const) {
      const big = 4 * (L + c.sleeperLen);
      // the half-plane beyond the cut, in the end's frame (+y into the route at the start)
      const keep = s.w.CrossSection.square([2 * big, big]).translate([-big, cut]).rotate(k > 0 ? 0 : 180).rotate(e[2]).translate([e[0], e[1]]);
      bed = bed.intersect(keep);
    }
    return bed;
  }).filter((b): b is NonNullable<typeof b> => !!b);
  const deepCache = new Map<string, boolean>();
  // a stud at spot (i, j) is wholly inside the hollow of some route's bed
  const deep = (i: number, j: number) => {
    const k = `${i},${j}`;
    let v = deepCache.get(k);
    if (v === undefined) {
      const pt = world(4 + i * STUD, 4 + j * STUD), m = o.studD / 2 + 0.1; // stud radius and a little clearance
      v = routes.some((rt) => {
        const lat = routeLat(rt, pt);
        if (Math.abs(lat) > hw - m) return false;
        // and clear of both ends' connectors (measured along each end's frame)
        const L = routeLength(rt);
        return [routePose(rt, 0), routePose(rt, L)].every((e, k) => {
          const dx = pt[0] - e[0], dy = pt[1] - e[1];
          if (Math.hypot(dx, dy) > c.sleeperLen + 2 * STUD) return true;
          const hd = (e[2] * Math.PI) / 180, along = (-dx * Math.sin(hd) + dy * Math.cos(hd)) * (k ? -1 : 1);
          return along >= BED_END + WALL + m;
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
  return s.difference(body, [...cuts, ...(x.cuts ?? [])]);
}
