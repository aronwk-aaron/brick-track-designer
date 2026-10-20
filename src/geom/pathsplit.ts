// Splitting a part that no straight cut can split (a crossover, say, where
// every line across or along it would run down some rail or through the
// points): along a path on the stud grid, stepping round what can't be cut.
// The path's edges each go where a cut can be made: not down a rail (no
// rail running within 12 mm along the edge), not through points or
// crossings; across a rail is fine. Found as the cheapest path from one
// side of the part to the other near where an even split would be.
import { T, type Man, type Scad } from './scad';
import type { Route } from '../route/route';
import { routeLength, routePose } from '../route/route';

const STEP = 8;

/**
 * Split m in two along a stud-grid path running in y (axis 0: the parts left
 * and right of it) or in x (axis 1), near `at`. railG: rails' offset from
 * the centre line; avoid: points where no cut goes near (45 mm). Returns
 * the two parts, or undefined when there's no path.
 */
export function pathSplit(s: Scad, m: Man, routes: Route[], railG: number, avoid: [number, number][], axis: 0 | 1, at: number): Man[] | undefined {
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
  const floor = m.slice(Math.min(1, (bb.min[2] + bb.max[2]) / 2));
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
  // the cost of a cut along the edge from a to b: Infinity where it can't go
  const edgeCost = (a: [number, number], b: [number, number]) => {
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ed: [number, number] = [(b[0] - a[0]) / STEP, (b[1] - a[1]) / STEP];
    // (it must go through the part near the middle, not round it: within a third of its width either side of where it aims)
    const across = axis === 0 ? mid[0] : mid[1], half3 = (axis === 0 ? bb.max[0] - bb.min[0] : bb.max[1] - bb.min[1]) / 3;
    if (Math.abs(across - at) > half3) return Infinity;
    // (the cells either side of the edge: nothing there, nothing to cut)
    const nrm: [number, number] = [-ed[1] * 4, ed[0] * 4];
    if (!cellAt([mid[0] + nrm[0], mid[1] + nrm[1]]) && !cellAt([mid[0] - nrm[0], mid[1] - nrm[1]])) return 0.05;
    if (avoid.some((q) => Math.hypot(q[0] - mid[0], q[1] - mid[1]) < 22)) return Infinity;
    for (const r of rails) {
      if (Math.abs(r.p[0] - mid[0]) > 14 || Math.abs(r.p[1] - mid[1]) > 14) continue;
      // (a rail running along the edge, near it: no)
      const along = Math.abs(r.d[0] * ed[0] + r.d[1] * ed[1]) > Math.cos(Math.PI / 4);
      const off = Math.abs((r.p[0] - mid[0]) * -ed[1] + (r.p[1] - mid[1]) * ed[0]);
      if (along && off < 12) return Infinity;
    }
    // (and a little dearer the further from where an even split would be)
    return 1 + Math.abs((axis === 0 ? mid[0] : mid[1]) - at) / 4; // (as straight down the middle as it can go)
  };
  // Dijkstra over the grid nodes, from the bottom (or left) edge to the top (or right)
  const id = (i: number, j: number) => j * nx + i, pos = (i: number, j: number): [number, number] => [x0 + i * STEP, y0 + j * STEP];
  const dist = new Float64Array(nx * ny).fill(Infinity), prev = new Int32Array(nx * ny).fill(-1), done = new Uint8Array(nx * ny);
  const heap: [number, number][] = [];
  const push = (d: number, k: number) => { heap.push([d, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m2 = c; if (l < heap.length && heap[l][0] < heap[m2][0]) m2 = l; if (r < heap.length && heap[r][0] < heap[m2][0]) m2 = r; if (m2 === c) break; [heap[m2], heap[c]] = [heap[c], heap[m2]]; c = m2; } } return top; };
  if (axis === 0) for (let i = 0; i < nx; i++) { dist[id(i, 0)] = 0; push(0, id(i, 0)); }
  else for (let j = 0; j < ny; j++) { dist[id(0, j)] = 0; push(0, id(0, j)); }
  const costs = new Map<string, number>();
  const cost = (a: number, b: number) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    let c = costs.get(key);
    if (c === undefined) { c = edgeCost(pos(a % nx, Math.floor(a / nx)), pos(b % nx, Math.floor(b / nx))); costs.set(key, c); }
    return c;
  };
  let goal = -1;
  while (heap.length) {
    const [d, k] = pop();
    if (done[k]) continue;
    done[k] = 1;
    const i = k % nx, j = Math.floor(k / nx);
    if ((axis === 0 && j === ny - 1) || (axis === 1 && i === nx - 1)) { goal = k; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i2 = i + di, j2 = j + dj;
      if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
      const k2 = id(i2, j2), c = cost(k, k2);
      if (!Number.isFinite(c) || done[k2]) continue;
      if (d + c < dist[k2]) { dist[k2] = d + c; prev[k2] = k; push(d + c, k2); }
    }
  }
  if (goal < 0) return undefined;
  const path: [number, number][] = [];
  for (let k = goal; k >= 0; k = prev[k]) path.push(pos(k % nx, Math.floor(k / nx)));
  path.reverse();
  // the region on one side: the path closed round by the far side of the box
  const big = 4000;
  const poly: [number, number][] = axis === 0
    ? [[path[0][0], y0 - big], ...path, [path[path.length - 1][0], y1 + big], [x0 - big, y1 + big], [x0 - big, y0 - big]]
    : [[x0 - big, path[0][1]], ...path, [x1 + big, path[path.length - 1][1]], [x1 + big, y1 + big], [x0 - big, y1 + big]];
  const region = (grow: number) => T(s.extrude(s.polygon(poly).offset(grow, 'Miter', 10), 1000), [0, 0, -500]);
  const a = s.intersection(m, region(0)), b = s.difference(m, [region(0.1)]);
  return [a, b].filter((p) => p.volume() > 300);
}
