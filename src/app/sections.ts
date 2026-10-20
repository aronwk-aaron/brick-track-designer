// Splitting a layout the way 4DBrix splits theirs: into separate pieces
// whose every joint is an ordinary track end (each track cut square to
// itself, a standard end connector both sides), cut only where the track's
// base is clear of every other track's (never through points, frogs or
// crossings), plain stretches in lengths that fit the print bed.
import type { Route } from '../route/route';
import { routeLat, routeLength, routePose, railPoint } from '../route/route';
import type { Split } from '../route/solver';

/** A piece of one route: [route, from, to] (arc lengths). */
export type RoutePiece = [number, number, number];

/**
 * Where to cut: each route's pieces, and the pieces grouped into the
 * sections built together (those whose bases overlap). half: how far the
 * base reaches each side of a centre line; room: the longest plain piece.
 */
export function planSections(routes: Route[], splits: Split[], half: number, room: number, minPart = 40) {
  const boxes = routes.map((rt) => {
    const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 8)), b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let k = 0; k <= n; k++) { const p = routePose(rt, (L * k) / n); b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
    return [b[0] - half - 16, b[1] - half - 16, b[2] + half + 16, b[3] + half + 16];
  });
  const inBox = (j: number, q: [number, number]) => q[0] >= boxes[j][0] && q[0] <= boxes[j][2] && q[1] >= boxes[j][1] && q[1] <= boxes[j][3];
  // the points' stretches (and a connector's length past them), where no cut goes
  const busy = routes.map(() => [] as [number, number][]);
  for (const sp of splits) sp.routes.forEach((ri, k) => busy[ri].push([sp.spans[k][0] - 24, sp.spans[k][1] + 24]));
  /** Can route i be cut square at s: its base there (and a connector's depth either side) clear of every other track's base? */
  const free = (i: number, s: number) => {
    const rt = routes[i], L = routeLength(rt);
    if (s < minPart || s > L - minPart || busy[i].some(([a, b]) => s >= a && s <= b)) return false;
    for (const ds of [-10, 0, 10]) for (let o = -half; o <= half + 1e-9; o += 8) {
      const q = railPoint(rt, s + ds, o);
      for (let j = 0; j < routes.length; j++) if (j !== i && inBox(j, q) && Math.abs(routeLat(routes[j], q)) < half + 2) return false;
    }
    return true;
  };
  const pieces: RoutePiece[] = [];
  routes.forEach((rt, i) => {
    const L = routeLength(rt), step = 8, cuts: number[] = [];
    // free stretches along it (on the stud grid from its start)
    const ok: boolean[] = [];
    for (let s = 0; s <= L; s += step) ok.push(free(i, s));
    let k = 0;
    while (k < ok.length) {
      if (!ok[k]) { k++; continue; }
      let e = k; while (e + 1 < ok.length && ok[e + 1]) e++;
      const a = k * step, b = e * step;
      // cut where the free stretch starts and ends (so the busy parts are as
      // small as they can be), and across it every room or less
      if (b - a >= minPart) {
        const inner = b - a, n = Math.max(1, Math.ceil(inner / room));
        for (let m = 0; m <= n; m++) cuts.push(Math.round((a + (inner * m) / n) / step) * step);
      }
      k = e + 1;
    }
    const cs = [...new Set(cuts)].filter((c) => c >= minPart && c <= L - minPart).sort((p, q) => p - q);
    let s0 = 0;
    for (const c of cs) { if (c - s0 >= minPart) { pieces.push([i, s0, c]); s0 = c; } }
    pieces.push([i, s0, L]);
  });
  // sections: pieces whose bases overlap (union-find)
  const parent = pieces.map((_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  // (its base: points across it, every 6 mm along it, kept a hair inside its cut ends)
  const samples = pieces.map(([i, a, b]) => {
    const n = Math.max(1, Math.ceil((b - a) / 6)), out: [number, number][] = [];
    for (let k = 0; k <= n; k++) for (let o = -half; o <= half + 1e-9; o += 8) out.push(railPoint(routes[i], a + 0.5 + ((b - a - 1) * k) / n, o));
    return out;
  });
  const sAt = (i: number, q: [number, number]) => {
    // (the arc length along route i level with q: nearest sample)
    const rt = routes[i], L = routeLength(rt);
    let best = 0, bd = Infinity;
    for (let s = 0; s <= L; s += 2) { const p = railPoint(rt, s, 0), d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  for (let p = 0; p < pieces.length; p++) for (let r = p + 1; r < pieces.length; r++) {
    const [ip] = pieces[p], [ir, ar, br] = pieces[r];
    if (find(p) === find(r)) continue;
    if (ip === ir) continue; // (two pieces of one track join only at an ordinary end)
    const hit = samples[p].some((q) => inBox(ir, q) && Math.abs(routeLat(routes[ir], q)) < half && (() => { const s = sAt(ir, q); return s >= ar - 1 && s <= br + 1; })());
    if (hit) parent[find(p)] = find(r);
  }
  const groups = new Map<number, number[]>();
  pieces.forEach((_, k) => { const g = find(k); if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(k); });
  return { pieces, sections: [...groups.values()] };
}
