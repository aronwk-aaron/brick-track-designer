// The trackwork solver: given any set of routes, where their rails cross, where
// the wheel flanges of one route have to pass through another's rails
// (flangeway grooves), where check rails go, and where routes split.
//
// It works the way switch.scad builds its trackwork: every rail is laid in
// full, and each route's flangeways (the band just inside each of its rails
// where the wheel flanges run) are cut into every other route's rails, so
// frogs and crossings fall out of the geometry, whatever the layout.
import { type Pt, type Route, railPolyline, routeLat, routeLength, routePose } from './route';

export interface SolverOptions {
  gauge: number;        // rail centre to rail centre, mm (40 = LEGO)
  headHw: number;       // rail head half-width (1.25)
  flangeway: number;    // flangeway width (3, LEGO drawing)
  checkRailLen: number; // minimum check rail length (30)
  checkRailW: number;   // check rail width (1)
  checkAngle: number;   // crossings sharper than this (degrees) get check rails
  step: number;         // sampling step along rails, mm
}

export const SOLVER_DEFAULTS: SolverOptions = {
  gauge: 40, headHw: 1.25, flangeway: 3, checkRailLen: 30, checkRailW: 1, checkAngle: 45, step: 0.25,
};

export type Side = -1 | 1;  // -1 = left rail, +1 = right rail

export interface RailRef { route: number; side: Side; s: number }

/** Where two rails of different routes cross. */
export interface Crossing { a: RailRef; b: RailRef; point: Pt; angle: number }

/** A stretch of a rail cut by another route's flangeway. */
export interface Groove { route: number; side: Side; s0: number; s1: number; by: number }

/** A check rail inside a route's rail (side), over [s0, s1]: its edges at offset and offset + width from the centre line. */
export interface CheckRail { route: number; side: Side; s0: number; s1: number; offset: number; width: number }

/** Two routes that leave a shared stretch: points up to where they part. */
export interface Split { routes: [number, number]; s: number }

export interface Solution {
  crossings: Crossing[];
  grooves: Groove[];
  checkRails: CheckRail[];
  splits: Split[];
}

const sides: Side[] = [-1, 1];

/** Intersection of segments p1-p2 and p3-p4, as [t, u] along each, or undefined. */
function segX(p1: Pt, p2: Pt, p3: Pt, p4: Pt): [number, number] | undefined {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return undefined;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? [t, u] : undefined;
}

/** Is point p within route j's flangeways (inside either of its rails), where route j runs? */
function inFlangeway(rt: Route, p: Pt, o: SolverOptions): boolean {
  const lat = Math.abs(routeLat(rt, p));
  const g = o.gauge / 2;
  return lat <= g - o.headHw + 1e-9 && lat >= g - o.headHw - o.flangeway - 1e-9;
}

export function solve(routes: Route[], opts: Partial<SolverOptions> = {}): Solution {
  const o = { ...SOLVER_DEFAULTS, ...opts };
  const g = o.gauge / 2;
  const rails = routes.map((rt) => Object.fromEntries(sides.map((sd) => [sd, railPolyline(rt, sd * g, o.step)])) as Record<Side, [number, number, number][]>);

  // Splits: routes that start together, up to where their centre lines are
  // far enough apart for their rails to stand separately (two heads and a
  // flangeway): the points' stretch, built in a later phase. Grooves there
  // are the points' business, not cut here.
  const splits: Split[] = [];
  for (let i = 0; i < routes.length; i++)
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i], b = routes[j];
      if (Math.hypot(a.start[0] - b.start[0], a.start[1] - b.start[1]) > 0.01 || Math.abs(a.start[2] - b.start[2]) > 0.01) continue;
      let s = 0;
      const L = Math.min(routeLength(a), routeLength(b));
      while (s < L) {
        const p = routePose(a, s);
        if (Math.abs(routeLat(b, [p[0], p[1]])) >= 2 * o.headHw + o.flangeway) break;
        s += o.step;
      }
      splits.push({ routes: [i, j], s });
    }

  // Rail crossings.
  const crossings: Crossing[] = [];
  for (let i = 0; i < routes.length; i++)
    for (let j = i + 1; j < routes.length; j++)
      for (const sa of sides)
        for (const sb of sides) {
          const A = rails[i][sa], B = rails[j][sb];
          for (let k = 0; k + 1 < A.length; k++)
            for (let m = 0; m + 1 < B.length; m++) {
              const p1: Pt = [A[k][1], A[k][2]], p2: Pt = [A[k + 1][1], A[k + 1][2]];
              const p3: Pt = [B[m][1], B[m][2]], p4: Pt = [B[m + 1][1], B[m + 1][2]];
              // quick reject on bounding boxes
              if (Math.max(p1[0], p2[0]) < Math.min(p3[0], p4[0]) || Math.max(p3[0], p4[0]) < Math.min(p1[0], p2[0])
                || Math.max(p1[1], p2[1]) < Math.min(p3[1], p4[1]) || Math.max(p3[1], p4[1]) < Math.min(p1[1], p2[1])) continue;
              const x = segX(p1, p2, p3, p4);
              if (!x) continue;
              const [t, u] = x;
              const da = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]), db = Math.atan2(p4[1] - p3[1], p4[0] - p3[0]);
              let ang = Math.abs(((da - db) * 180) / Math.PI) % 180;
              if (ang > 90) ang = 180 - ang;
              if (ang < 0.5) continue;  // rails running together (a split), not a crossing
              crossings.push({
                a: { route: i, side: sa, s: A[k][0] + t * (A[k + 1][0] - A[k][0]) },
                b: { route: j, side: sb, s: B[m][0] + u * (B[m + 1][0] - B[m][0]) },
                point: [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])],
                angle: ang,
              });
            }
        }

  // Grooves: where a rail's head runs through another route's flangeway.
  const grooves: Groove[] = [];
  for (let i = 0; i < routes.length; i++)
    for (const sd of sides)
      for (let j = 0; j < routes.length; j++) {
        if (j === i) continue;
        let open: number | undefined;
        const pts = railPolyline(routes[i], sd * g, o.step);
        for (const [s] of pts) {
          const cut = [-o.headHw, 0, o.headHw].some((d) => {
            const p = routePose(routes[i], s);
            const r = (Math.PI * p[2]) / 180, off = sd * g + d;
            return inFlangeway(routes[j], [p[0] + off * Math.cos(r), p[1] + off * Math.sin(r)], o);
          });
          if (cut && open === undefined) open = s;
          if (!cut && open !== undefined) { grooves.push({ route: i, side: sd, s0: open, s1: s, by: j }); open = undefined; }
        }
        if (open !== undefined) grooves.push({ route: i, side: sd, s0: open, s1: pts[pts.length - 1][0], by: j });
      }

  const inSplit = (gr: Groove) => splits.some((sp) => sp.routes.includes(gr.route) && sp.routes.includes(gr.by) && gr.s1 <= sp.s + 1e-6);
  for (let k = grooves.length - 1; k >= 0; k--) if (inSplit(grooves[k])) grooves.splice(k, 1);

  // Check rails (switch.scad's): opposite each sharp rail crossing, inside the
  // other rail of each of the two routes, check_rail_len long, centred on the
  // crossing; shortened to stay clear of every other rail's head (dropped
  // under 12mm), and overlapping ones on the same side of a route merged.
  // (switch.scad only shortens them with three or more routes; with two they
  // are always clear on a switch.)
  const raw: CheckRail[] = [];
  const clear = (r: number, span: [number, number], s: number) => {
    const p = routePose(routes[r], s), rr = (Math.PI * p[2]) / 180;
    const pts: Pt[] = [span[0] - 0.5, span[1] + 0.5].map((off) => [p[0] + off * Math.cos(rr), p[1] + off * Math.sin(rr)]);
    return routes.every((_, j) => j === r || pts.every((q) => sides.every((sd) => Math.abs(routeLat(routes[j], q) - sd * g) >= o.headHw + 0.3)));
  };
  for (const c of crossings) {
    if (c.angle >= o.checkAngle) continue;
    for (const ref of [c.a, c.b]) {
      const span: [number, number] = ref.side < 0
        ? [g - o.headHw - o.flangeway - o.checkRailW, g - o.headHw - o.flangeway]
        : [-g + o.headHw + o.flangeway, -g + o.headHw + o.flangeway + o.checkRailW];
      const reach = (dir: number) => {
        let d = 0;
        while (d < o.checkRailLen / 2 && clear(ref.route, span, ref.s + dir * (d + 1))) d += 1;
        return d;
      };
      const a = reach(-1), b = reach(+1);
      if (a + b >= 12) raw.push({ route: ref.route, side: (-ref.side) as Side, s0: ref.s - a, s1: ref.s + b, offset: span[0], width: o.checkRailW });
    }
  }
  const checkRails: CheckRail[] = [];
  for (const cr of raw) {
    const hit = checkRails.find((m) => m.route === cr.route && m.side === cr.side && cr.s0 <= m.s1 + 4 && cr.s1 >= m.s0 - 4);
    if (hit) { hit.s0 = Math.min(hit.s0, cr.s0); hit.s1 = Math.max(hit.s1, cr.s1); }
    else checkRails.push({ ...cr });
  }

  return { crossings, grooves, checkRails, splits };
}
