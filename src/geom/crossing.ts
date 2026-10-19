// Fixed trackwork pieces from any set of routes: every route's rails laid in
// full, each route's flangeways cut into the other routes' rails (so frogs
// and crossings fall out of the geometry), check rails where the solver puts
// them, a track bed under all the routes, end connectors and breakaway
// supports at every route end, and square stud sockets on the grid of the
// first route's start, so the piece sits on plates and baseplates.
import type { Route } from '../route/route';
import { routeLat, routeLength, routePose } from '../route/route';
import { solve, type Solution, type SolverOptions, SOLVER_DEFAULTS } from '../route/solver';
import { Scad, T, R, type Man, type Vec2 } from './scad';
import { sweepRoute } from './sweep';
import { DEFAULTS, PLATE_H, RAIL_PROFILE, STUD, Track, type TrackOptions } from './track';

export interface CrossingOptions extends TrackOptions {
  flangeway: number;       // 3 (LEGO drawing)
  flangewayDepth: number;  // 3, down from the rail top
  checkRailW: number;      // 1
  supports: boolean;       // breakaway print supports at the route ends
  /**
   * Underside: 'edges' grips the plate below only at stud spots along the
   * piece's edges, every 4 studs, with loose recesses everywhere else (a full
   * grid of gripping sockets holds too hard); 'all' grips at every spot.
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

export function crossingPiece(s: Scad, routes: Route[], o: CrossingOptions = CROSSING_DEFAULTS, solution?: Solution): Man {
  const t = new Track(s, o), c = t.c, g = c.railOffset;
  const sol = solution ?? solve(routes, { ...SOLVER_DEFAULTS, gauge: c.trackGauge, flangeway: o.flangeway, checkRailW: o.checkRailW } as SolverOptions);
  const rect = (x0: number, x1: number, z0: number, z1: number) => s.square([x1 - x0, z1 - z0]).translate([x0, z0]);

  // Each route's flangeways: the band just inside each rail, from flangeway
  // depth below the rail top up, swept along the whole route.
  const bands = routes.map((rt) => sweepRoute(s,
    rect(g - HEAD_HW - o.flangeway, g - HEAD_HW, RAIL_TOP - o.flangewayDepth, RAIL_TOP + 1)
      .add(rect(-g + HEAD_HW, -g + HEAD_HW + o.flangeway, RAIL_TOP - o.flangewayDepth, RAIL_TOP + 1)), rt));
  const othersBands = (i: number) => bands.filter((_, j) => j !== i);

  const parts: Man[] = [];
  routes.forEach((rt, i) => {
    const L = routeLength(rt);
    // Rails and this route's check rails, grooved by the other routes' flangeways.
    const p0 = routePose(rt, 0), p1 = routePose(rt, L);
    // Ends cut square to each end, as curves.scad does (so a curve's rails end
    // where the next piece's rail ends begin): boxes from the end in, in each
    // end's frame.
    const endBoxes = (depth: number) => {
      const w = c.sleeperLen + 2 * STUD;
      return [atPose(T(s.cube([w, depth + 1, 30]), [-w / 2, -1, -5]), p0),
        atPose(T(s.cube([w, depth + 1, 30]), [-w / 2, -depth, -5]), p1)];
    };
    const rails = s.difference(s.union([-g, g].map((x) =>
      sweepRoute(s, s.polygon(RAIL_PROFILE.map(([px, py]) => [px + x, py + PLATE_H] as Vec2)), rt))), endBoxes(END));
    const checks = sol.checkRails.filter((cr) => cr.route === i)
      .map((cr) => sweepRoute(s, rect(cr.offset, cr.offset + cr.width, PLATE_H - 0.01, RAIL_TOP), rt, cr.s0, cr.s1));
    parts.push(s.difference(s.union([rails, ...checks]), othersBands(i)));
    // Track bed under the route.
    parts.push(s.difference(sweepRoute(s, rect(-c.sleeperLen / 2, c.sleeperLen / 2, 0, PLATE_H), rt), endBoxes(BED_END)));
    // End connectors and breakaway supports, at both ends.
    parts.push(atPose(T(t.fullEndpoint(true, true), [0, 4, 0]), p0));
    parts.push(atPose(T(R(t.fullEndpoint(true, true), [0, 0, 180]), [0, -4, 0]), p1));
    if (o.supports) {
      parts.push(atPose(s.union([t.startRailSupports(-0.02), t.supportFooting(-0.02, 0, -1)]), p0));
      parts.push(atPose(s.union([t.endRailSupports(-0.02), t.supportFooting(-0.02, 0, +1)]), p1));
    }
  });
  const body = s.union(parts);

  // Square stud sockets on the grid of the first route's start, over the piece.
  const box = body.boundingBox();
  const p0 = routePose(routes[0], 0), h = (p0[2] * Math.PI) / 180;
  // (grid spots at 4 + 8k across and along, in that frame, as on a straight)
  const reach = Math.ceil((Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1]) + Math.hypot(box.min[0] - p0[0], box.min[1] - p0[1])) / STUD) + 2;
  // Grid spots under the piece, in the first route's start frame. A spot is on
  // the bed when it is within the sleepers' reach of some route; spots off it
  // (under the end connectors) keep gripping sockets, as before.
  const spots: { i: number; j: number; x: number; y: number }[] = [];
  for (let i = -reach; i <= reach; i++)
    for (let j = -reach; j <= reach; j++) {
      const lx = 4 + i * STUD, ly = 4 + j * STUD;
      const x = p0[0] + lx * Math.cos(h) - ly * Math.sin(h), y = p0[1] + lx * Math.sin(h) + ly * Math.cos(h);
      if (x < box.min[0] - 4 || x > box.max[0] + 4 || y < box.min[1] - 4 || y > box.max[1] + 4) continue;
      spots.push({ i, j, x, y });
    }
  const bedCache = new Map<string, boolean>();
  const onBed = (i: number, j: number) => {
    const k = `${i},${j}`;
    let v = bedCache.get(k);
    if (v === undefined) {
      const lx = 4 + i * STUD, ly = 4 + j * STUD;
      const x = p0[0] + lx * Math.cos(h) - ly * Math.sin(h), y = p0[1] + lx * Math.sin(h) + ly * Math.cos(h);
      v = routes.some((rt) => Math.abs(routeLat(rt, [x, y])) <= c.sleeperLen / 2 - 4 + 1e-6);
      bedCache.set(k, v);
    }
    return v;
  };
  // Edge spots: on the bed with neighbours off it. Grip at the corners first
  // (most neighbours off), then along the edges, keeping grips 4 studs apart.
  const offN = (i: number, j: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => !onBed(i + a, j + b)).length;
  const gripAt = new Set<string>();
  if (o.grip === 'edges') {
    const edge = spots.filter((p) => onBed(p.i, p.j) && offN(p.i, p.j) > 0)
      .sort((a, b) => offN(b.i, b.j) - offN(a.i, a.j) || a.j - b.j || a.i - b.i);
    const kept: { i: number; j: number }[] = [];
    for (const p of edge)
      if (kept.every((q) => Math.max(Math.abs(q.i - p.i), Math.abs(q.j - p.j)) >= 4)) { kept.push(p); gripAt.add(`${p.i},${p.j}`); }
  }
  const sockets: Man[] = spots.map(({ i, j, x, y }) => {
    const grip = o.grip === 'all' || !onBed(i, j) || gripAt.has(`${i},${j}`);
    return T(R(grip ? t.studSocket(o.studH + 0.21) : t.studRecess(o.studH + 0.21), [0, 0, p0[2]]), [x, y, -0.01]);
  });
  return s.difference(body, sockets);
}
