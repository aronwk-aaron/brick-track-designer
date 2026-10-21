// A route that crosses (or runs over) itself, a loop drawn in one go: cut
// into routes that each don't, joined end to end, so the solver finds the
// crossings between them as it does between any two routes. (Swept whole,
// its rails ran through themselves and the kernel made nothing of it.)
import type { Route } from './route';
import { routeLength, routePose } from './route';
import { subRoute } from '../switch/pieces';

/** Each route, or the routes it's cut into where it meets itself (within gauge g of its own centre line, further than 3 g along it). */
export function splitSelfCrossing(routes: Route[], g: number): Route[] {
  return routes.flatMap((rt) => {
    const L = routeLength(rt), step = 4, pts: [number, number, number][] = [];
    for (let s = 0; s <= L + 1e-9; s += step) { const p = routePose(rt, Math.min(s, L)); pts.push([p[0], p[1], Math.min(s, L)]); }
    // (where it comes back near itself: each such pair of places along it)
    const pairs: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
      if (pts[j][2] - pts[i][2] > 3 * g && Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < g) pairs.push([pts[i][2], pts[j][2]]);
    if (!pairs.length) return [rt];
    // (a cut between the two places of every pair, as few as do it, each as far as it can be from all of them)
    const near = pairs.flat(), cuts: number[] = [];
    for (const [a, b] of [...pairs].sort((p, q) => p[1] - q[1])) {
      if (cuts.some((c) => c > a && c < b)) continue;
      let best = (a + b) / 2, bd = -1;
      for (let s = a + step; s < b; s += step) { const d = Math.min(...near.map((n) => Math.abs(n - s))); if (d > bd) { bd = d; best = s; } }
      cuts.push(best);
    }
    const at = [0, ...cuts.sort((p, q) => p - q), L];
    return at.slice(0, -1).map((s0, k) => subRoute(rt, s0, at[k + 1], `${rt.id}~${k + 1}`));
  });
}
