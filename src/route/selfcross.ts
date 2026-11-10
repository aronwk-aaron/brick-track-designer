// A route that crosses (or runs over) itself, a loop drawn in one go: cut
// into routes that each don't, joined end to end, so the solver finds the
// crossings between them as it does between any two routes. (Swept whole,
// its rails ran through themselves and the kernel made nothing of it.)
import type { Route } from './route';
import { routeLength, routePose, segLength } from './route';
import { subRoute } from '../switch/pieces';

/** Each route, or the routes it's cut into where it meets itself (within gauge g of its own centre line, further than 3 g along it). */
export function splitSelfCrossing(routes: Route[], g0: number): Route[] {
  return routes.flatMap((rt) => {
    const g = rt.gauge ?? g0; // (its own gauge, mixed gauges)
    const L = routeLength(rt), step = 4, pts: [number, number, number][] = [];
    for (let s = 0; s <= L + 1e-9; s += step) { const p = routePose(rt, Math.min(s, L)); pts.push([p[0], p[1], Math.min(s, L)]); }
    // (where it comes back near itself: each such pair of places along it)
    const pairs: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
      if (pts[j][2] - pts[i][2] > 3 * g && Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < g) pairs.push([pts[i][2], pts[j][2]]);
    if (!pairs.length) return [rt];
    // (a cut between the two places of every pair, as few as do it, each as far as it can be from all of them)
    const joints: number[] = [];
    { let s0 = 0; for (const sg of rt.segments) { const len = segLength(sg), each = sg.kind === 'straight' ? 128 : (11.25 * Math.PI * sg.radius) / 180; for (let c = s0; c < s0 + len - 1e-6; c += each) joints.push(c); s0 += len; } }
    const near = pairs.flat().sort((p, q) => p - q), cuts: number[] = [];
    // (how far s is from the nearest of them: a binary search, not all of them each time (a helix comes near itself all the way round))
    const gap = (s: number) => {
      let lo = 0, hi = near.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (near[m] < s) lo = m + 1; else hi = m; }
      return Math.min(Math.abs(near[lo] - s), lo > 0 ? Math.abs(near[lo - 1] - s) : Infinity);
    };
    for (const [a, b] of [...pairs].sort((p, q) => p[1] - q[1])) {
      if (cuts.some((c) => c > a && c < b)) continue;
      let best = (a + b) / 2, bd = -1;
      // (in its middle half: near either end, as round a helix where it's near itself all the way, it cut off next to nothing)
      for (let s = a + (b - a) / 4; s < b - (b - a) / 4; s += step) { const d = gap(s); if (d > bd) { bd = d; best = s; } }
      // (on a joint between its pieces, if one is near: each segment's start, every 11.25° of a curve, every 16 studs of a straight, as bought track's)
      const j = joints.filter((v) => v > a && v < b).sort((p, q) => Math.abs(p - best) - Math.abs(q - best))[0];
      cuts.push(j !== undefined && Math.abs(j - best) < (b - a) / 4 ? j : best);
    }
    const at = [0, ...cuts.sort((p, q) => p - q), L];
    return at.slice(0, -1).map((s0, k) => subRoute(rt, s0, at[k + 1], `${rt.id}~${k + 1}`));
  });
}
