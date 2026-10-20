// The trackwork solver: given any set of routes, where their rails cross, where
// the wheel flanges of one route have to pass through another's rails
// (flangeway grooves), where check rails go, and where routes split.
//
// It works the way switch.scad builds its trackwork: every rail is laid in
// full, and each route's flangeways (the band just inside each of its rails
// where the wheel flanges run) are cut into every other route's rails, so
// frogs and crossings fall out of the geometry, whatever the layout.
import { type Pt, type Route, railPolyline, routeLat, routeLength, routePose, routeSOf } from './route';

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
/** Two routes that run together and part: the points' stretch, as arc lengths along each ([a, b] = routes). */
export interface Split {
  routes: [number, number]; s: number; spans: [[number, number], [number, number]];
  /** The second route ends on the first, arriving the same way (it merges in: trailing points), instead of starting on it. */
  merge?: boolean;
}

export interface Solution {
  crossings: Crossing[];
  grooves: Groove[];
  checkRails: CheckRail[];
  splits: Split[];
}

const sides: Side[] = [-1, 1];

/** How far off the other route's heading a route may start (or end) on it and still make points, degrees: a branch drawn a hair off true (0.2 degrees, say) is meant as a switch, not a crossing. */
const SPLIT_ANGLE = 0.5;

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
  // Each route's box (its rails, and its flangeways beside them), grown by
  // pad: routes whose boxes don't meet can't cross, cut or crowd each other,
  // which on a big layout saves nearly all the work.
  const boxes = rails.map((r) => {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const sd of sides) for (const q of r[sd]) { b[0] = Math.min(b[0], q[1]); b[1] = Math.min(b[1], q[2]); b[2] = Math.max(b[2], q[1]); b[3] = Math.max(b[3], q[2]); }
    return b;
  });
  const pad = o.headHw + 1;
  const meet = (i: number, j: number) => boxes[i][0] - pad <= boxes[j][2] + pad && boxes[j][0] - pad <= boxes[i][2] + pad
    && boxes[i][1] - pad <= boxes[j][3] + pad && boxes[j][1] - pad <= boxes[i][3] + pad;
  const inBox = (j: number, q: Pt) => q[0] >= boxes[j][0] - pad && q[0] <= boxes[j][2] + pad && q[1] >= boxes[j][1] - pad && q[1] <= boxes[j][3] + pad;
  // a rail's samples in runs of CH segments, each with its box
  const CH = 16;
  const chunks = (A: [number, number, number][]) => {
    const out: { k0: number; k1: number; b: number[] }[] = [];
    for (let k0 = 0; k0 + 1 < A.length; k0 += CH) {
      const k1 = Math.min(A.length - 1, k0 + CH), b = [Infinity, Infinity, -Infinity, -Infinity];
      for (let k = k0; k <= k1; k++) { b[0] = Math.min(b[0], A[k][1]); b[1] = Math.min(b[1], A[k][2]); b[2] = Math.max(b[2], A[k][1]); b[3] = Math.max(b[3], A[k][2]); }
      out.push({ k0, k1, b });
    }
    return out;
  };
  const railChunks = rails.map((r) => Object.fromEntries(sides.map((sd) => [sd, chunks(r[sd])])) as Record<Side, ReturnType<typeof chunks>>);

  // Splits: a route that starts on another (at its start, or anywhere along
  // it, heading the same way), up to where their centre lines are far enough
  // apart for their rails to stand separately (two heads and a flangeway):
  // the points' stretch, built in a later phase. Grooves there are the
  // points' business, not cut here. (s: the stretch's end along the first.)
  const splits: Split[] = [];
  const apart = 2 * o.headHw + o.flangeway;
  for (let i = 0; i < routes.length; i++)
    for (let j = 0; j < routes.length; j++) {
      if (i === j) continue;
      const a = routes[i], b = routes[j];
      const st: Pt = [b.start[0], b.start[1]];
      if (Math.abs(routeLat(a, st)) > 0.01) continue;
      const sa = routeSOf(a, st);
      const pa = routePose(a, sa);
      if (Math.hypot(pa[0] - st[0], pa[1] - st[1]) > 0.01 || Math.abs(((pa[2] - b.start[2] + 540) % 360) - 180) > SPLIT_ANGLE) continue;
      if (sa < 1e-6 && j < i) continue;  // both start together: once, as (i < j)
      let t = 0;
      const L = Math.min(routeLength(b), routeLength(a) - sa);
      while (t < L) {
        const p = routePose(b, t);
        if (Math.abs(routeLat(a, [p[0], p[1]])) >= apart) break;
        t += o.step;
      }
      splits.push({ routes: [i, j], s: sa + t, spans: [[sa, sa + t], [0, t]] });
    }
  // Merges: a route that ends on another, arriving the way it runs (the
  // points seen from the other end).
  for (let i = 0; i < routes.length; i++)
    for (let j = 0; j < routes.length; j++) {
      if (i === j) continue;
      const a = routes[i], b = routes[j], Lb = routeLength(b), e = routePose(b, Lb);
      if (Math.abs(routeLat(a, [e[0], e[1]])) > 0.01) continue;
      const se = routeSOf(a, [e[0], e[1]]);
      const pa = routePose(a, se);
      if (Math.hypot(pa[0] - e[0], pa[1] - e[1]) > 0.01 || Math.abs(((pa[2] - e[2] + 540) % 360) - 180) > SPLIT_ANGLE) continue;
      if (se > routeLength(a) - 1e-6) continue; // (end to end: a join, not points)
      let t = 0;
      while (t < Math.min(Lb, se)) {
        const p = routePose(b, Lb - t);
        if (Math.abs(routeLat(a, [p[0], p[1]])) >= apart) break;
        t += o.step;
      }
      splits.push({ routes: [i, j], s: se - t, spans: [[se - t, se], [Lb - t, Lb]], merge: true });
    }

  // Rail crossings.
  const crossings: Crossing[] = [];
  for (let i = 0; i < routes.length; i++)
    for (let j = i + 1; j < routes.length; j++)
      for (const sa of sides)
        for (const sb of sides) {
          if (!meet(i, j)) continue;
          const A = rails[i][sa], B = rails[j][sb], found: [number, number, Crossing][] = [];
          for (const ca of railChunks[i][sa]) for (const cb of railChunks[j][sb]) {
            if (ca.b[2] < cb.b[0] || cb.b[2] < ca.b[0] || ca.b[3] < cb.b[1] || cb.b[3] < ca.b[1]) continue;
            for (let k = ca.k0; k < ca.k1; k++)
            for (let m = cb.k0; m < cb.k1; m++) {
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
              found.push([k, m, {
                a: { route: i, side: sa, s: A[k][0] + t * (A[k + 1][0] - A[k][0]) },
                b: { route: j, side: sb, s: B[m][0] + u * (B[m + 1][0] - B[m][0]) },
                point: [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])],
                angle: ang,
              }]);
            }
          }
          // (in the order of a plain pass along both rails)
          found.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
          crossings.push(...found.map((f) => f[2]));
        }

  // Grooves: where a rail's head runs through another route's flangeway.
  const grooves: Groove[] = [];
  for (let i = 0; i < routes.length; i++)
    for (const sd of sides) {
      const pts = rails[i][sd];
      // (the three points across the rail's head at each sample)
      const heads = pts.map(([s]) => {
        const p = routePose(routes[i], s), r = (Math.PI * p[2]) / 180;
        return [-o.headHw, 0, o.headHw].map((d): Pt => [p[0] + (sd * g + d) * Math.cos(r), p[1] + (sd * g + d) * Math.sin(r)]);
      });
      for (let j = 0; j < routes.length; j++) {
        if (j === i || !meet(i, j)) continue;
        let open: number | undefined;
        for (let n = 0; n < pts.length; n++) {
          const s = pts[n][0];
          const cut = heads[n].some((q) => inBox(j, q) && inFlangeway(routes[j], q, o));
          if (cut && open === undefined) open = s;
          if (!cut && open !== undefined) { grooves.push({ route: i, side: sd, s0: open, s1: s, by: j }); open = undefined; }
        }
        if (open !== undefined) grooves.push({ route: i, side: sd, s0: open, s1: pts[pts.length - 1][0], by: j });
      }
    }

  const inSplit = (gr: Groove) => splits.some((sp) => {
    const k = sp.routes.indexOf(gr.route);
    return k >= 0 && sp.routes[1 - k] === gr.by && gr.s0 >= sp.spans[k][0] - 1 && gr.s1 <= sp.spans[k][1] + 1e-6;
  });
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
    return routes.every((_, j) => j === r || pts.every((q) => !inBox(j, q)) || pts.every((q) => sides.every((sd) => Math.abs(routeLat(routes[j], q) - sd * g) >= o.headHw + 0.3)));
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
