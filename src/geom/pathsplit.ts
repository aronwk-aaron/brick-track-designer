// Splitting a part that no straight cut can split (a crossover, say, where
// every line across or along it would run down some rail or through the
// points): along a path on the stud grid, stepping round what can't be cut.
// The path's edges each go where a cut can be made: not down a rail (no
// rail running within 12 mm along the edge), not through points or
// crossings; across a rail is fine. Found as the cheapest path from one
// side of the part to the other near where an even split would be, with as
// few turns as it can. Each straight run of it is joined as a straight cut
// would be (cutter.ts pathJoints).
import { T, type Man, type Scad } from './scad';
import type { Track } from './track';
import { jointKit, pathJoints, tidy, type Joint, type Run } from './cutter';
import type { Route } from '../route/route';
import { routeLength, routePose } from '../route/route';

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
/** How to join the parts (cutter.ts's joints): none given, they just butt together. */
export interface PathJoin { t: Track; joint: Joint; flatRails: boolean; /** where no rail-end tongue may go (cutter.ts cutPiece) */ noTongue?: (q: [number, number]) => boolean }

/**
 * Split m in two along a stud-grid path running in y (axis 0: the parts left
 * and right of it) or in x (axis 1), near `at`. railG: rails' offset from
 * the centre line; avoid: where no cut goes (Keep). o.join: the joints along
 * the cut's straight runs; o.window: where across the part the path may go
 * (default: within a third of its width of at). Returns the two parts (and
 * the path, and how many couplers and rail-end tongues join them), or
 * undefined when there's no path.
 */
export function pathSplit(s: Scad, m: Man, routes: Route[], railG: number, avoid: Keep[], axis: 0 | 1, at: number, o: { join?: PathJoin; window?: [number, number] } = {}) {
  const join = o.join;
  const bb = m.boundingBox();
  // rails as sampled points with their direction
  const rails: { p: [number, number]; d: [number, number] }[] = [];
  for (const rt of routes) {
    const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 3));
    for (let k = 0; k <= n; k++) {
      const p = routePose(rt, (L * k) / n), h = (p[2] * Math.PI) / 180, d: [number, number] = [-Math.sin(h), Math.cos(h)];
      for (const sd of [-1, 1]) rails.push({ p: [p[0] + sd * railG * Math.cos(h), p[1] + sd * railG * Math.sin(h)], d });
    }
  }
  // (all of it seen from above: a slice through the bed missed the ballast
  // between tracks, and holes, and the path went through them as if there
  // were nothing there to cut)
  const floor = m.project();
  const x0 = Math.floor(bb.min[0] / STEP) * STEP - STEP, x1 = Math.ceil(bb.max[0] / STEP) * STEP + STEP;
  const y0 = Math.floor(bb.min[1] / STEP) * STEP - STEP, y1 = Math.ceil(bb.max[1] / STEP) * STEP + STEP;
  const nx = Math.round((x1 - x0) / STEP) + 1, ny = Math.round((y1 - y0) / STEP) + 1;
  // which grid cells have track in them (worked out once: a cross-section per edge filled the kernel's memory)
  const filled = new Uint8Array(nx * ny);
  {
    const polys = floor.toPolygons() as [number, number][][];
    const inside = (q: [number, number]) => { let w = 0; for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) w ^= 1; } return w === 1; };
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
  const thick = new Uint8Array(nx * ny);
  const axles = !!kit && kit.kindOf(join!.joint, join!.flatRails) === 'axle';
  if (axles) {
    const polys = m.slice(kit!.axleZ).toPolygons() as [number, number][][];
    const inside = (q: [number, number]) => { let w = 0; for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) w ^= 1; } return w === 1; };
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
    if (avoid.some((q) => segDist([q[0], q[1]], a, b) < (q[2] ?? 22))) return Infinity;
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
  const j = join ? pathJoints(s, join.t, m, routes, runs, join.joint, join.flatRails, join.noTongue) : undefined;
  const body = j?.cut ? s.difference(m, [j.cut]) : m;
  let a = s.intersection(body, region(0)), b = s.difference(body, [region(0.1)]);
  if (j?.add[0].length) a = tidy(s, s.union([a, ...j.add[0]]));
  if (j?.add[1].length) b = tidy(s, s.union([b, ...j.add[1]]));
  return { parts: [a, b].filter((p) => p.volume() > 300), path, runs, couplers: j?.couplers ?? 0, tongues: j?.tongues ?? 0 };
}
