// Splitting a part that no straight cut can split (a crossover, say, where
// every line across or along it would run down some rail or through the
// points): along a path on the stud grid, stepping round what can't be cut.
// The path's edges each go where a cut can be made: not down a rail (no
// rail running within 12 mm along the edge), not through points or
// crossings; across a rail is fine. Found as the cheapest path from one
// side of the part to the other near where an even split would be, with as
// few turns as it can. Each straight run of it is joined as a straight cut
// would be (cutter.ts pathJoints).
import { T, type CS, type Man, type Scad } from './scad';
import { PLATE_H, type Track } from './track';
import { jointKit, pathJoints, tidy, type Joint, type Run } from './cutter';
import { findStuds, type Stud } from './studs';
import type { Route } from '../route/route';
import { railOffsetOf, routeLength, routePose } from '../route/route';

const STEP = 8;
/** What running along a part's edge, two studs or less in from it, costs (a stud's worth of cut is 1). */
const STRIP = 3;

/** Where no cut may go: within r of (x, y); r: for a stepped cut's edge (22 mm unless given), rLine: for a straight cut across the piece (32 mm unless given). */
export type Keep = [number, number, number?, number?];
/** How far a point is from the segment a-b. */
export const segDist = (q: [number, number], a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, k = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(q[0] - a[0] - k * dx, q[1] - a[1] - k * dy);
};
/**
 * Whether a point is inside polygons (even-odd), for points on rows every 2 mm from y0 to y1 (the grid's cells sampled
 * 2, 4 and 6 mm in): each row's crossings worked out once, sorted, then each point a binary search. (Testing each point
 * against every edge took minutes on a whole yard's piece.)
 */
function insideOf(polys: [number, number][][], y0: number, y1: number) {
  const rows: number[][] = Array.from({ length: Math.ceil((y1 - y0) / 2) + 2 }, () => []);
  for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi === yj) continue;
    const lo = Math.max(0, Math.ceil((Math.min(yi, yj) - y0) / 2 - 1e-9)), hi = Math.min(rows.length - 1, Math.floor((Math.max(yi, yj) - y0) / 2 + 1e-9));
    for (let r = lo; r <= hi; r++) { const y = y0 + 2 * r; if ((yi > y) !== (yj > y)) rows[r].push(((xj - xi) * (y - yi)) / (yj - yi) + xi); }
  }
  const sorted = rows.map((r) => Float64Array.from(r).sort());
  return (q: [number, number]) => {
    const r = Math.round((q[1] - y0) / 2), xs = sorted[r];
    if (!xs || Math.abs(y0 + 2 * r - q[1]) > 1e-6) throw new Error('insideOf: not on a row');
    let a = 0, b = xs.length;
    while (a < b) { const mid = (a + b) >> 1; if (xs[mid] < q[0]) a = mid + 1; else b = mid; }
    return (a & 1) === 1;
  };
}

/** How to join the parts (cutter.ts's joints): none given, they just butt together. */
export interface PathJoin { t: Track; joint: Joint; flatRails: boolean; /** where no rail-end tongue may go (cutter.ts cutPiece) */ noTongue?: (q: [number, number]) => boolean }
/** (taken: where the cuts of this piece so far put rail-end tongue joints, cutter.ts jointsNear; a split's own come back as tongueAt, for whoever keeps its parts to add) */

/**
 * Split m in two along a stud-grid path running in y (axis 0: the parts left
 * and right of it) or in x (axis 1), near `at`. railG: rails' offset from
 * the centre line; avoid: where no cut goes (Keep). o.join: the joints along
 * the cut's straight runs; o.window: where across the part the path may go
 * (default: within a third of its width of at). Returns the two parts (and
 * the path, and how many couplers and rail-end tongues join them), or
 * undefined when there's no path.
 */
export function pathSplit(s: Scad, m: Man, routes: Route[], railG: number, avoid: Keep[], axis: 0 | 1, at: number, o: { join?: PathJoin; window?: [number, number]; taken?: [number, number][] } = {}) {
  const join = o.join;
  const bb = m.boundingBox();
  // rails as sampled points with their direction
  const rails: { p: [number, number]; d: [number, number] }[] = [];
  for (const rt of routes) {
    const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 3));
    for (let k = 0; k <= n; k++) {
      const p = routePose(rt, (L * k) / n), h = (p[2] * Math.PI) / 180, d: [number, number] = [-Math.sin(h), Math.cos(h)];
      for (const sd of [-1, 1]) rails.push({ p: [p[0] + sd * railOffsetOf(rt, railG) * Math.cos(h), p[1] + sd * railOffsetOf(rt, railG) * Math.sin(h)], d });
    }
  }
  // (all of it seen from above: a slice through the bed missed the ballast
  // between tracks, and holes, and the path went through them as if there
  // were nothing there to cut)
  // (as slices a few heights up it, together: projecting a whole yard's piece took minutes; these are at the bottom,
  // through the ballast's steps and the bed, and its top)
  // (and on up it every 3 mm: a part joined only higher up (a lever's arm over the ballast, ties over a gap) looked
  // to have a gap there, and the path ran down it, cutting nothing)
  const zs = [0.3, 1.5, 3.0, 4.5, 6].map((dz) => bb.min[2] + dz);
  for (let z = bb.min[2] + 9; z < bb.max[2] - 0.3; z += 3) zs.push(z);
  const floor = s.w.CrossSection.union(zs.filter((z) => z < bb.max[2]).map((z) => m.slice(z)));
  const x0 = Math.floor(bb.min[0] / STEP) * STEP - STEP, x1 = Math.ceil(bb.max[0] / STEP) * STEP + STEP;
  const y0 = Math.floor(bb.min[1] / STEP) * STEP - STEP, y1 = Math.ceil(bb.max[1] / STEP) * STEP + STEP;
  const nx = Math.round((x1 - x0) / STEP) + 1, ny = Math.round((y1 - y0) / STEP) + 1;
  // which grid cells have track in them (worked out once: a cross-section per edge filled the kernel's memory)
  const filled = new Uint8Array(nx * ny);
  {
    const inside = insideOf(floor.toPolygons() as [number, number][][], y0, y1);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      // (a cell has track if any of a few points in it is on the floor)
      const cx = x0 + i * STEP, cy = y0 + j * STEP;
      if ([[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]].some(([dx, dy]) => inside([cx + dx, cy + dy]))) filled[j * nx + i] = 1;
    }
  }
  const cellAt = (q: [number, number]) => { const i = Math.floor((q[0] - x0) / STEP), j = Math.floor((q[1] - y0) / STEP); return i >= 0 && j >= 0 && i < nx - 1 && j < ny - 1 && filled[j * nx + i] === 1; };
  // (joined with axles: where the bed's thick enough for one across the cut (solid at the axle's height), so the
  // cut keeps to it where it can and the parts get their axles; where only the ballast's thin outer step is, none fit)
  const kit = join ? jointKit(s, join.t, bb.min[2]) : undefined;
  // (the joints already in it, an earlier cut's axle holes and peg sockets: no cut through one. Holes in its
  // section at the axles' height and at the bed's, small ones (not the hollow underneath), kept a few mm clear of)
  const area = (pl: [number, number][]) => pl.reduce((t, q, k) => { const r2 = pl[(k + 1) % pl.length]; return t + q[0] * r2[1] - r2[0] * q[1]; }, 0) / 2;
  const holes: Keep[] = [];
  for (const z of [(bb.min[2] + 2 + PLATE_H) / 2, 1.0]) { // (the axles' height: as jointKit's, studs 1.8 high)
    for (const pl of m.slice(z).toPolygons() as [number, number][][]) {
      const a = area(pl);
      if (a >= 0 || -a > 400) continue; // (an outline, or the hollow)
      const xs = pl.map((q) => q[0]), ys = pl.map((q) => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const r = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
      // (a long thin one, a groove or a slot: kept clear of along its outline, not as one circle round all of it, which
      // shut a cut out of everywhere near it)
      if (r <= 8) holes.push([cx, cy, r + 3]);
      else pl.forEach((q, k) => {
        const q2 = pl[(k + 1) % pl.length], n = Math.max(1, Math.ceil(Math.hypot(q2[0] - q[0], q2[1] - q[1]) / 4));
        for (let t = 0; t < n; t++) holes.push([q[0] + ((q2[0] - q[0]) * t) / n, q[1] + ((q2[1] - q[1]) * t) / n, 3]);
      });
    }
  }
  const thick = new Uint8Array(nx * ny);
  const axles = !!kit && kit.kindOf(join!.joint, join!.flatRails) === 'axle';
  if (axles) {
    const inside = insideOf(m.slice(kit!.axleZ).toPolygons() as [number, number][][], y0, y1);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) if (filled[j * nx + i] && inside([x0 + i * STEP + 4, y0 + j * STEP + 4])) thick[j * nx + i] = 1;
  }
  const thickAt = (q: [number, number]) => { const i = Math.floor((q[0] - x0) / STEP), j = Math.floor((q[1] - y0) / STEP); return i >= 0 && j >= 0 && i < nx - 1 && j < ny - 1 && thick[j * nx + i] === 1; };
  // the cost of a cut along the edge from a to b: Infinity where it can't go
  const edgeCost = (a: [number, number], b: [number, number]) => {
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ed: [number, number] = [(b[0] - a[0]) / STEP, (b[1] - a[1]) / STEP];
    // (it must go through the part near where it aims, not round it: within the window, or a third of its width either side)
    const across = axis === 0 ? mid[0] : mid[1], half3 = (axis === 0 ? bb.max[0] - bb.min[0] : bb.max[1] - bb.min[1]) / 3;
    if (o.window ? across < o.window[0] - 1e-6 || across > o.window[1] + 1e-6 : Math.abs(across - at) > half3) return Infinity;
    // (the cells either side of the edge: nothing there, nothing to cut)
    const nrm: [number, number] = [-ed[1] * 4, ed[0] * 4];
    // (a little dearer the further from where it aims: but straight a stud or
    // three off it is better than a step to keep to it)
    const bias = Math.abs(across - at) / 32;
    const cellOff = (k: number) => cellAt([mid[0] + k * nrm[0], mid[1] + k * nrm[1]]);
    if (!cellOff(1) && !cellOff(-1)) return 0.05 + bias;
    // (the whole edge clear of each keep-out, not just its middle)
    if (avoid.some((q) => segDist([q[0], q[1]], a, b) < (q[2] ?? 22)) || holes.some((q) => segDist([q[0], q[1]], a, b) < q[2]!)) return Infinity;
    for (const r of rails) {
      if (Math.abs(r.p[0] - mid[0]) > 14 || Math.abs(r.p[1] - mid[1]) > 14) continue;
      // (a rail running along the edge, near it: no)
      // (running along it: within 10 degrees; a rail crossing at a shallower slant than that is cut across, as a crossover's middle has to be)
      const along = Math.abs(r.d[0] * ed[0] + r.d[1] * ed[1]) > Math.cos(Math.PI / 18);
      const off = Math.abs((r.p[0] - mid[0]) * -ed[1] + (r.p[1] - mid[1]) * ed[0]);
      if (along && off < 12) return Infinity;
    }
    // (and dearer along the part's edge, two studs or less in from it: it'd leave a strip there)
    const strip = [1, -1].some((sg) => cellOff(sg) && (!cellOff(3 * sg) || !cellOff(5 * sg)));
    // (through thin ballast, where no axle fits across: dearer, when the joints are axles)
    const thin = axles && !(thickAt([mid[0] + nrm[0], mid[1] + nrm[1]]) && thickAt([mid[0] - nrm[0], mid[1] - nrm[1]]));
    return 1 + bias + (strip ? STRIP : 0) + (thin ? THIN : 0);
  };
  // Dijkstra over the grid nodes and the way the path last went (a turn costs
  // more: a cut with as few steps as it can, not a staircase of little
  // tabs), from the bottom (or left) edge to the top (or right)
  // (and each run through the part two studs long at least, the steps too: no tabs a stud wide)
  const TURN = 6, RUN = 2, THIN = 1.5;
  const id = (i: number, j: number) => j * nx + i, pos = (i: number, j: number): [number, number] => [x0 + i * STEP, y0 + j * STEP];
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // (a state: the node, the way the path last went, and how many studs it's gone that way through the part (up to RUN))
  const NS = 4 * (RUN + 1), N = nx * ny * NS, st = (k: number, d: number, r = RUN) => k * NS + d * (RUN + 1) + r;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const heap: [number, number][] = [];
  const push = (d: number, k: number) => { heap.push([d, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m2 = c; if (l < heap.length && heap[l][0] < heap[m2][0]) m2 = l; if (r < heap.length && heap[r][0] < heap[m2][0]) m2 = r; if (m2 === c) break; [heap[m2], heap[c]] = [heap[c], heap[m2]]; c = m2; } } return top; };
  // (starting off heading across, the way the cut runs)
  const along = axis === 0 ? 2 : 0;
  if (axis === 0) for (let i = 0; i < nx; i++) { dist[st(id(i, 0), along)] = 0; push(0, st(id(i, 0), along)); }
  else for (let j = 0; j < ny; j++) { dist[st(id(0, j), along)] = 0; push(0, st(id(0, j), along)); }
  const costs = new Map<string, number>();
  const cost = (a: number, b: number) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    let c = costs.get(key);
    if (c === undefined) { c = edgeCost(pos(a % nx, Math.floor(a / nx)), pos(b % nx, Math.floor(b / nx))); costs.set(key, c); }
    return c;
  };
  let goal = -1;
  while (heap.length) {
    const [d, sk] = pop();
    if (done[sk]) continue;
    done[sk] = 1;
    const k = Math.floor(sk / NS), dk = Math.floor((sk % NS) / (RUN + 1)), rk = sk % (RUN + 1), i = k % nx, j = Math.floor(k / nx);
    if ((axis === 0 && j === ny - 1) || (axis === 1 && i === nx - 1)) { goal = sk; break; }
    dirs.forEach(([di, dj], nd) => {
      const i2 = i + di, j2 = j + dj;
      if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) return;
      const k2 = id(i2, j2), c = cost(k, k2);
      if (!Number.isFinite(c)) return;
      // (a turn only counts where the cut goes through the part: outside it, anywhere will do)
      const inside = c >= 1, turn = nd !== dk && inside;
      if (turn && rk < RUN) return;
      if (inside && nd === (dk ^ 1)) return; // (nor straight back the way it came)
      const s2 = st(k2, nd, !inside ? RUN : turn ? 1 : Math.min(RUN, rk + 1));
      if (done[s2]) return;
      const dc = d + c + (turn ? TURN : 0);
      if (dc < dist[s2]) { dist[s2] = dc; prev[s2] = sk; push(dc, s2); }
    });
  }
  if (goal < 0) return undefined;
  const path: [number, number][] = [];
  for (let sk = goal; sk >= 0; sk = prev[sk]) { const k = Math.floor(sk / NS); path.push(pos(k % nx, Math.floor(k / nx))); }
  path.reverse();
  return splitOnPath(s, m, routes, path, axis, join, o.taken);
}

/**
 * Split m in two along a given path of stud-grid steps (from beyond one side of
 * it to beyond the other: running in y for axis 0, in x for axis 1), joined
 * along its straight runs as pathSplit's are.
 */
export function splitOnPath(s: Scad, m: Man, routes: Route[], path: [number, number][], axis: 0 | 1, join?: PathJoin, taken?: [number, number][]) {
  const bb = m.boundingBox();
  const x0 = Math.floor(bb.min[0] / STEP) * STEP - STEP, x1 = Math.ceil(bb.max[0] / STEP) * STEP + STEP;
  const y0 = Math.floor(bb.min[1] / STEP) * STEP - STEP, y1 = Math.ceil(bb.max[1] / STEP) * STEP + STEP;
  // the region on one side: the path closed round by the far side of the box
  const big = 4000;
  const poly: [number, number][] = axis === 0
    ? [[path[0][0], y0 - big], ...path, [path[path.length - 1][0], y1 + big], [x0 - big, y1 + big], [x0 - big, y0 - big]]
    : [[x0 - big, path[0][1]], ...path, [x1 + big, path[path.length - 1][1]], [x1 + big, y1 + big], [x0 - big, y1 + big]];
  const region = (grow: number) => T(s.extrude(s.polygon(poly).offset(grow, 'Miter', 10), 1000), [0, 0, -500]);
  // (the region's to the left of the path as it goes: the left side of each run is part a's)
  const runs: Run[] = [];
  for (let k = 1; k < path.length; k++) {
    const d: [number, number] = [Math.sign(path[k][0] - path[k - 1][0]), Math.sign(path[k][1] - path[k - 1][1])], last = runs[runs.length - 1];
    if (last && last.d[0] === d[0] && last.d[1] === d[1]) last.len += STEP; else runs.push({ p: path[k - 1], d, len: STEP });
  }
  const j = join ? pathJoints(s, join.t, m, routes, runs, join.joint, join.flatRails, join.noTongue, taken) : undefined;
  const body = j?.cut ? s.difference(m, [j.cut]) : m;
  let a = s.intersection(body, region(0)), b = s.difference(body, [region(0.1)]);
  if (j?.add[0].length) a = tidy(s, s.union([a, ...j.add[0]]));
  if (j?.add[1].length) b = tidy(s, s.union([b, ...j.add[1]]));
  return { parts: [a, b].filter((p) => p.volume() > 300), path, runs, couplers: j?.couplers ?? 0, tongues: j?.tongues ?? 0, holes: j?.holes ?? [], tongueAt: j?.tongueAt ?? [] };
}

/** A cut path drawn by hand (expert mode, app/cutpaths.ts), for the build: its corners (mm, on the stud grid, each run along a grid line), and its own joint if it has one. */
export interface HandPath { id: string; pts: [number, number][]; joint?: Joint; flatRails?: boolean }
/** What became of a hand path in a piece: made (it cut a part in two), or why not and where: 'edge', it ends inside a part; 'sliver', a side would be a sliver; 'two', a side would be in two bodies. */
export interface HandPathDone { id: string; made?: true; why?: 'edge' | 'sliver' | 'two'; at?: [number, number] }

/** (mm3) A side of a hand cut smaller than this is a sliver; a loose bit smaller than BIT isn't a body (a loose bit the piece had anyway; its supports are carried apart, kernel.ts Supports). */
const SLIVER = 2000, BIT = 600;
/** (mm) No joint of a hand cut within this of where another hand cut meets or crosses it. */
const GAP = 10;
/** (mm) A path's end this far inside a part, material all round, hasn't reached its edge (less: the cut is carried on to the edge). */
const END_IN = 4.5;
/** (mm) How far either side of a path a part's plan is looked at (what's asked of it is within END_IN of the path, and a mitred corner's reach more). */
const NEAR = 16;

/**
 * A piece cut along the hand paths that run through it: each path cuts every part it runs through from edge to
 * edge (carried straight on past its own ends), in the order given, and again after the others (a path from one
 * cut to another cuts the part between them once they're made). Not made, and said why: a path that ends inside a
 * part (or short of its edge), or would leave a sliver or a side in two bodies. join: the design's joints (a path's
 * own joint over it), along each path's runs as pathSplit's are; taken: cutter.ts jointsNear's, added to.
 *
 * A part is the same, to the last triangle, whatever is cut elsewhere in the piece and wherever those cuts are
 * moved to: its outline in plan is worked out from the paths, and it's cut from the whole piece in one go; each
 * path's joints are worked out on the whole piece too, once, and no joint is put within GAP of where another path
 * meets or crosses the cut. (Cut one after another, each from the last, the faces a far cut had crossed came out
 * in other triangles, and the joints a hair off.)
 */
export function cutOnPaths(s: Scad, m: Man, routes: Route[], paths: HandPath[], join: PathJoin | undefined, taken: [number, number][], flatOf: (m: Man) => Man = (x) => x): { parts: Man[]; done: HandPathDone[] } {
  const CS = s.w.CrossSection, big = 4000;
  const bb0 = m.boundingBox(), c0 = [(bb0.min[0] + bb0.max[0]) / 2, (bb0.min[1] + bb0.max[1]) / 2];
  const unit = (a: [number, number], b: [number, number]): [number, number] => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const prism = (cs: CS) => T(s.extrude(cs, 1000), [0, 0, -500]);
  const leg = (a: [number, number], b: [number, number], w: number) => { const d = unit(a, b); return s.polygon([[a[0] - d[1] * w, a[1] + d[0] * w], [a[0] + d[1] * w, a[1] - d[0] * w], [b[0] + d[1] * w, b[1] - d[0] * w], [b[0] - d[1] * w, b[1] + d[0] * w]]); };
  const inside = (f: CS, q: [number, number]) => CS.square([0.2, 0.2], true).translate(q).intersect(f).area() > 0.02;
  /** The plan left of a path as it goes: the path, carried straight on past both ends, closed round its left by a ring far outside the piece (anticlockwise from where it leaves to where it came in). */
  const leftOf = (pts: [number, number][]) => {
    const n = pts.length, d0 = unit(pts[1], pts[0]), d1 = unit(pts[n - 2], pts[n - 1]);
    const S: [number, number] = [pts[0][0] + d0[0] * big, pts[0][1] + d0[1] * big], E: [number, number] = [pts[n - 1][0] + d1[0] * big, pts[n - 1][1] + d1[1] * big];
    const aE = Math.atan2(E[1] - c0[1], E[0] - c0[0]), aS = Math.atan2(S[1] - c0[1], S[0] - c0[0]);
    const sweep = ((aS - aE) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI, steps = Math.max(1, Math.ceil(sweep / (Math.PI / 4)));
    const ring: [number, number][] = Array.from({ length: steps + 1 }, (_, k) => { const a = aE + (sweep * k) / steps; return [c0[0] + 3 * big * Math.cos(a), c0[1] + 3 * big * Math.sin(a)]; });
    return s.polygon([S, ...pts, E, ...ring]);
  };
  // (the piece's studs, and their radius: found once, if any path needs them)
  let studs0: Stud[] | undefined;
  const studR = join ? join.t.c.postD / 2 : 0, studs = () => (studs0 ??= join ? findStuds(s, m, studR, join.t.o.studH, PLATE_H, PLATE_H) : []);
  // (where each path is met or crossed by another: a corner or an end of the other on it, or the two crossing)
  const meets = new Map<string, [number, number][]>(paths.map((hp) => [hp.id, paths.filter((o) => o !== hp).flatMap((o) => {
    const out: [number, number][] = [...o.pts];
    for (let i = 1; i < hp.pts.length; i++) for (let k = 1; k < o.pts.length; k++) {
      const a = hp.pts[i - 1], b = hp.pts[i], c = o.pts[k - 1], d = o.pts[k], den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den, u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
    return out;
  })]));
  /** A path's own: the plan left of it (and that grown a hair, for the gap between the parts), and its joints, worked out on the whole piece along its runs, each run broken GAP either side of where another path meets it. */
  const own = new Map<string, { left: CS; leftGrown: CS; cut?: Man; add: [{ m: Man; fp: CS }[], { m: Man; fp: CS }[]] }>();
  const ownOf = (hp: HandPath) => {
    let o = own.get(hp.id);
    if (o) return o;
    const runs: Run[] = [], gaps = meets.get(hp.id) ?? [];
    for (let k = 1; k < hp.pts.length; k++) {
      const p = hp.pts[k - 1], d = unit(p, hp.pts[k]), len = Math.hypot(hp.pts[k][0] - p[0], hp.pts[k][1] - p[1]);
      const us = gaps.flatMap((q) => { const u = (q[0] - p[0]) * d[0] + (q[1] - p[1]) * d[1], v = Math.abs((q[0] - p[0]) * -d[1] + (q[1] - p[1]) * d[0]); return v < 1 && u > -GAP && u < len + GAP ? [u] : []; }).sort((a, b) => a - b);
      let u0 = 0;
      for (const u of [...us, Infinity]) {
        const u1 = Math.min(len, u - GAP);
        if (u1 - u0 > 4) runs.push({ p: [p[0] + d[0] * u0, p[1] + d[1] * u0], d, len: u1 - u0 });
        u0 = Math.max(u0, u + GAP);
      }
    }
    const jn = join && hp.joint ? { ...join, joint: hp.joint, flatRails: !!hp.flatRails } : join;
    const j = jn && runs.length ? pathJoints(s, jn.t, m, routes, runs, jn.joint, jn.flatRails, jn.noTongue) : undefined;
    if (j) taken.push(...j.tongueAt);
    // (a stud the path would go through, one not on the grid (on a branch's slanted sleepers): whole with the side
    // its middle is on, the cut going round it; so no stud is ever cut, or taken off for being cut)
    let left = leftOf(hp.pts);
    const fp = (x: Man) => ({ m: x, fp: x.project().offset(0.5, 'Round') }), mine: CS[] = [], theirs: CS[] = [];
    for (const st of studs()) for (let k = 1; k < hp.pts.length; k++) {
      const p = hp.pts[k - 1], d = unit(p, hp.pts[k]), len = Math.hypot(hp.pts[k][0] - p[0], hp.pts[k][1] - p[1]);
      const u = (st.c[0] - p[0]) * d[0] + (st.c[1] - p[1]) * d[1], v = (st.c[0] - p[0]) * -d[1] + (st.c[1] - p[1]) * d[0];
      if (u < -studR || u > len + studR || Math.abs(v) > studR + 0.15) continue;
      if (v >= 0) mine.push(CS.circle(studR + 0.05, 48).translate(st.c)); else theirs.push(CS.circle(studR + 0.15, 48).translate(st.c));
      break;
    }
    if (mine.length) left = left.add(CS.union(mine));
    if (theirs.length) left = left.subtract(CS.union(theirs));
    o = { left, leftGrown: left.offset(0.1, 'Miter', 10), cut: j?.cut, add: [(j?.add[0] ?? []).map(fp), (j?.add[1] ?? []).map(fp)] };
    own.set(hp.id, o);
    return o;
  };
  // (a part: its outline in plan, itself cut from the whole piece by it (no joints yet: what's decided on), and the
  // joints that are its: their holes, and their own parts)
  interface Leaf { reg: CS; man: Man; floor?: CS; cuts: Man[]; adds: { m: Man; fp: CS }[]; by: Set<string> }
  // (a part seen from above, as pathSplit sees it: slices up it together)
  const floorOf = (lf: Leaf) => {
    if (!lf.floor) { const bb = lf.man.boundingBox(), zs: number[] = []; for (let z = bb.min[2] + 0.3; z < bb.max[2] - 0.1; z += 1.5) zs.push(z); lf.floor = CS.union(zs.map((z) => lf.man.slice(z))); }
    return lf.floor;
  };
  const all = CS.square([bb0.max[0] - bb0.min[0] + 100, bb0.max[1] - bb0.min[1] + 100]).translate([bb0.min[0] - 50, bb0.min[1] - 50]);
  let parts: Leaf[] = [{ reg: all, man: m, cuts: [], adds: [], by: new Set() }];
  // (the loose bits the piece has anyway (not its breakaway supports, which are carried apart and cut with it): by size and place)
  let bits: { v: number; c: number[] }[] | undefined;
  const mid = (y: Man) => { const b = y.boundingBox(); return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; };
  const isBit = (y: Man) => { bits ??= flatOf(m).decompose().filter((x) => x.volume() < BIT).map((x) => ({ v: x.volume(), c: mid(x) })); const v = y.volume(), c = mid(y); return bits.some((b) => Math.abs(b.v - v) < 0.02 * b.v + 0.5 && Math.hypot(b.c[0] - c[0], b.c[1] - c[1], b.c[2] - c[2]) < 0.5); };
  const done = new Map<string, HandPathDone>();
  const not = (hp: HandPath, why: NonNullable<HandPathDone['why']>, at: [number, number]) => { if (!done.get(hp.id)?.made) done.set(hp.id, { id: hp.id, why, at }); };
  for (let round = 0, more = true; more && round < paths.length + 1; round++) {
    more = false;
    for (const hp of paths) {
      const line = CS.union(hp.pts.slice(1).map((q, k) => leg(hp.pts[k], q, 0.1))), next: Leaf[] = [];
      const ends: [[number, number], [number, number]][] = [[hp.pts[0], hp.pts[1]], [hp.pts[hp.pts.length - 1], hp.pts[hp.pts.length - 2]]];
      // (the plan within NEAR of the path, its corners and ends included, and of the lines its ends are carried on along)
      const wide = (a: [number, number], b2: [number, number]) => { const d = unit(a, b2); return leg([a[0] - d[0] * NEAR, a[1] - d[1] * NEAR], [b2[0] + d[0] * NEAR, b2[1] + d[1] * NEAR], NEAR); };
      const nearBy = CS.union([...hp.pts.slice(1).map((q, k) => wide(hp.pts[k], q)), ...ends.map(([e, b2]) => { const d = unit(b2, e); return wide(e, [e[0] + d[0] * big, e[1] + d[1] * big]); })]);
      const k0 = Math.floor((hp.pts.length - 1) / 2), at: [number, number] = [(hp.pts[k0][0] + hp.pts[k0 + 1][0]) / 2, (hp.pts[k0][1] + hp.pts[k0 + 1][1]) / 2];
      for (const lf of parts) {
        const bb = lf.man.boundingBox();
        // (a part this path made is its edge, not a cut through it)
        if (lf.by.has(hp.id) || !hp.pts.some((q, k) => k > 0 && Math.max(q[0], hp.pts[k - 1][0]) >= bb.min[0] && Math.min(q[0], hp.pts[k - 1][0]) <= bb.max[0] && Math.max(q[1], hp.pts[k - 1][1]) >= bb.min[1] && Math.min(q[1], hp.pts[k - 1][1]) <= bb.max[1])) { next.push(lf); continue; }
        // (does it run through this part: more than a touch along its edge)
        // (the part's plan taken in only beside the path and the lines it's carried on along, NEAR either side: all
        // that the questions below look at; taken in whole, a big part's plan, every stud and sleeper of it, cost
        // seconds each time, for every path and part)
        const fl = floorOf(lf).intersect(nearBy), deep = fl.offset(-1, 'Miter', 10);
        if (line.intersect(deep).area() < 0.2) { next.push(lf); continue; }
        // (an end inside the part, or short of its edge: carried straight on, it would cut into the part again further on)
        const inner = fl.offset(-END_IN, 'Miter', 10);
        const short = ends.find(([e, b]) => { if (inside(inner, e)) return true; const d = unit(b, e); return leg([e[0] + d[0] * 2, e[1] + d[1] * 2], [e[0] + d[0] * big, e[1] + d[1] * big], 0.1).intersect(deep).area() > 0.2; })?.[0];
        if (short) { not(hp, 'edge', short); next.push(lf); continue; }
        const o = ownOf(hp), regs = [lf.reg.intersect(o.left), lf.reg.subtract(o.leftGrown)], mans = regs.map((r) => flatOf(s.intersection(m, prism(r))));
        // (each side one body, and no sliver: loose bits under BIT are the piece's own, or bits put back at the end (below))
        const sides = mans.map((x) => x.decompose().filter((y) => y.volume() > 5));
        if (sides.some((bs) => !bs.length)) { next.push(lf); continue; } // (nothing one side: it only ran along the part's edge)
        const why = sides.some((bs) => bs.reduce((t, y) => t + y.volume(), 0) < SLIVER || bs.some((y) => y.volume() >= BIT && y.volume() < SLIVER)) ? 'sliver' as const
          : sides.some((bs) => bs.filter((y) => y.volume() >= BIT).length > 1) ? 'two' as const : undefined;
        if (why) { not(hp, why, at); next.push(lf); continue; }
        // (the joints along this stretch of the path: their holes, within the part; their own parts, each side's
        // with its side; and of the joints' parts the part had already, each with the side it's on)
        const here = o.cut ? s.intersection(o.cut, prism(lf.reg)) : undefined, over = (ad: { fp: CS }, r: CS) => ad.fp.intersect(r).area();
        regs.forEach((reg, k) => next.push({ reg, man: mans[k], cuts: here && here.numTri() > 0 ? [...lf.cuts, here] : lf.cuts, by: new Set([...lf.by, hp.id]),
          adds: [...lf.adds.filter((ad) => over(ad, reg) > over(ad, regs[1 - k])), ...o.add[k].filter((ad) => over(ad, lf.reg) > 0.5)] }));
        done.set(hp.id, { id: hp.id, made: true });
        more = true;
      }
      parts = next;
    }
  }
  const near = (a: Man, b: { min: number[]; max: number[] }) => { const x = a.boundingBox(); return [0, 1, 2].every((k) => x.max[k] >= b.min[k] - 1 && x.min[k] <= b.max[k] + 1); };
  const out = parts.map((lf) => {
    if (!lf.by.size) return lf.man;
    const bb = lf.man.boundingBox(), cuts = lf.cuts.filter((c) => near(c, bb)), body = cuts.length ? s.difference(lf.man, cuts) : lf.man;
    return flatOf(lf.adds.length ? tidy(s, s.union([body, ...lf.adds.map((ad) => ad.m)])) : body);
  });
  // (a small bit a cut took off something that's another part's, held by nothing on its own side (the far half of
  // a track end's tab, which reaches across the centre line): put back whole on the part
  // it was one with, joined across the cut's gap beside it, so the cut goes round it. One no part takes stays
  // where it is, loose)
  const kerf = paths.flatMap((hp) => { const o = own.get(hp.id); return o && done.get(hp.id)?.made ? [o.leftGrown.subtract(o.left)] : []; });
  if (kerf.length) {
    const gap = CS.union(kerf), bodiesOf = (x: Man) => x.decompose().filter((y) => y.volume() > 5), loose: { from: number; chip: Man }[] = [];
    parts.forEach((lf, i) => {
      if (!lf.by.size) return;
      const bs = bodiesOf(out[i]), chips = bs.filter((y) => y.volume() < BIT && !isBit(y));
      if (!chips.length || chips.length === bs.length) return;
      for (const c of chips) loose.push({ from: i, chip: c });
      out[i] = flatOf(s.union(bs.filter((y) => !chips.includes(y))));
    });
    for (const { from, chip } of loose) {
      const cb = chip.boundingBox(), fp = chip.project().offset(0.25, 'Miter', 10).intersect(gap);
      const bridge = fp.area() > 0.01 ? [s.intersection(m, T(s.extrude(fp, cb.max[2] - cb.min[2] + 0.02), [0, 0, cb.min[2] - 0.01]))] : [];
      let to = -1;
      for (let i = 0; i < out.length && to < 0; i++) {
        if (i === from || !parts[i].by.size || !near(out[i], cb)) continue;
        const u = flatOf(s.union([out[i], chip, ...bridge]));
        if (bodiesOf(u).length === bodiesOf(out[i]).length) { out[i] = u; to = i; }
      }
      if (to < 0) out[from] = flatOf(s.union([out[from], chip]));
    }
  }
  return { parts: out, done: [...done.values()] };
}
