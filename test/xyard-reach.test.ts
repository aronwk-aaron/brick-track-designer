// The X yard's track graph: a train can go from any of its six tracks to any other, either way along the yard,
// through its centre too, without reversing (every crossing of a diagonal and a track a full double slip).
import { describe, expect, it } from 'vitest';
import { TEMPLATES, toRoutes } from '../src/app/design';
import { type Route, routeLat, routeLength, routePose, routeSOf } from '../src/route/route';

const NAME = 'X yard (6 tracks, double slips)';

/** Where a route's end lies on another route, tangent to it: [route, s, other route, its end's s]. */
function junctions(rts: Route[]) {
  const out: [number, number, number, number][] = [];
  rts.forEach((rj, j) => {
    for (const sj of [0, routeLength(rj)]) {
      const q = routePose(rj, sj);
      rts.forEach((ri, i) => {
        if (i === j) return;
        const si = routeSOf(ri, [q[0], q[1]]), L = routeLength(ri);
        if (si < -0.5 || si > L + 0.5 || Math.abs(routeLat(ri, [q[0], q[1]])) > 1) return;
        const p = routePose(ri, Math.max(0, Math.min(L, si)));
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1) return;
        const dh = ((((p[2] - q[2]) % 180) + 180) % 180);
        if (Math.min(dh, 180 - dh) < 1) out.push([i, si, j, sj]);
      });
    }
  });
  return out;
}

/** The tracks (T1 to T6) a train reaches, starting on track a at its end, going way d (+1: up the yard, -1: down). */
function reach(rts: Route[], js: ReturnType<typeof junctions>, a: number, d: 1 | -1) {
  const head = (r: number, s: number, dir: number) => (routePose(rts[r], s)[2] + (dir > 0 ? 0 : 180)) % 360;
  const same = (h: number, g: number) => { const x = (((h - g) % 360) + 360) % 360; return Math.min(x, 360 - x) < 1; };
  // (each junction both ways round: [route, s, other, other's s])
  const links = js.flatMap(([i, si, j, sj]) => [[i, si, j, sj], [j, sj, i, si]] as [number, number, number, number][]);
  const seen = new Set<string>(), got = new Set<number>([a]);
  const todo: [number, number, number][] = [[a, d > 0 ? 0 : routeLength(rts[a]), d]];
  while (todo.length) {
    const [r, s, dir] = todo.pop()!, k = `${r}:${s.toFixed(1)}:${dir}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (/^T\d$/.test(rts[r].id)) got.add(r);
    for (const [i, si, j, sj] of links) {
      if (i !== r || dir * (si - s) < -0.5) continue;
      // (on to the other route at the junction, going on the same way)
      for (const dj of [1, -1]) if (same(head(r, Math.max(0, Math.min(routeLength(rts[r]), si)), dir), head(j, Math.max(0, Math.min(routeLength(rts[j]), sj)), dj))) todo.push([j, sj, dj]);
    }
  }
  return got;
}

describe('the X yard: every track to every other', () => {
  const rts = toRoutes(structuredClone(TEMPLATES[NAME])), js = junctions(rts);
  const tracks = rts.flatMap((rt, i) => (/^T\d$/.test(rt.id) ? [i] : []));
  it('has its six tracks', () => expect(tracks.length).toBe(6));
  for (const d of [1, -1] as const) it(`from each track to each other, ${d > 0 ? 'up' : 'down'} the yard`, () => {
    const missing = tracks.flatMap((a) => { const got = reach(rts, js, a, d); return tracks.filter((b) => !got.has(b)).map((b) => `${rts[a].id} to ${rts[b].id}`); });
    expect(missing).toEqual([]);
  });
});
