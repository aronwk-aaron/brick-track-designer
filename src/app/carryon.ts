// A track drawn too short for the track that joins it: another track comes in alongside and reaches its line a
// little past its end, heading on along it (a crossover drawn on straights that stop short of where it lands). As
// drawn the two only run over each other there, with no points: rails through rails. What's meant is plain, that the
// one joins the other, so the short track is built on along its own line to the join and past the points there, and
// the build says which track to lengthen and by how much.
import type { Route } from '../route/route';
import { hasRoll, routeLength, routePose, routeSOf } from '../route/route';

/** (mm) How far a track is carried on at most: further, the other isn't joining it. */
const CARRY_MAX = 32 * 8;
/** (mm) How far past the join it's carried: the points done with it before its end connector. */
const CARRY_PAST = 24;
/** (mm, degrees) On its line, and heading along it: as exactly as points are found (solver.ts). */
const ON_LINE = 0.01, ALONG = 0.5;

const plain = (rt: Route) => !('elev' in rt) && !('grade' in rt) && !hasRoll(rt);
/** A route's end as a pose looking out of it: its start (turned round) or its end. */
const outOf = (rt: Route, end: 'start' | 'end') => { const p = routePose(rt, end === 'start' ? 0 : routeLength(rt)); return end === 'start' ? [p[0], p[1], p[2] + 180] : p; };

/**
 * The routes, each carried on to where another joins its line past its end (and CARRY_PAST on, to whole studs of its
 * length); said: what was lengthened, by how many studs, and where the other joins it.
 */
export function carriedOn(routes: Route[], gauge: number): { routes: Route[]; warnings: string[] } {
  const warnings: string[] = [], out = [...routes];
  const ends = routes.flatMap((rt, i) => (['start', 'end'] as const).map((end) => ({ i, end, p: outOf(rt, end) })));
  routes.forEach((a, i) => {
    if (!plain(a)) return;
    for (const end of ['start', 'end'] as const) {
      const A = outOf(a, end), h = (A[2] * Math.PI) / 180, u = [-Math.sin(h), Math.cos(h)];
      // (running on into another track already: that one is its line from here)
      if (ends.some((e) => e.i !== i && Math.hypot(e.p[0] - A[0], e.p[1] - A[1]) < 1)) continue;
      // (or starting or ending on another track, as a branch does: points there already, and its line that track's)
      if (routes.some((c, k) => { if (k === i) return false; const q = routePose(c, routeSOf(c, [A[0], A[1]])); return Math.hypot(q[0] - A[0], q[1] - A[1]) <= ON_LINE; })) continue;
      // (the furthest join on its line within reach: carried past them all)
      let far = 0, who = -1, at = [0, 0];
      for (const e of ends) {
        if (e.i === i || !plain(routes[e.i]) || (routes[e.i].gauge ?? gauge) !== (a.gauge ?? gauge)) continue;
        const dx = e.p[0] - A[0], dy = e.p[1] - A[1], ahead = dx * u[0] + dy * u[1], lat = Math.abs(dx * u[1] - dy * u[0]);
        const dh = Math.abs(((e.p[2] - A[2] + 540) % 360) - 180);
        if (!(ahead > 0.6 && ahead <= CARRY_MAX && lat <= ON_LINE && dh <= ALONG && ahead > far)) continue;
        // (and it comes in from beside this track: where it's nearest this track's end it's off this track's line, within
        // a sleeper's length of it. On the line there, it's a track this one starts or ends on (points already), or
        // track on in line after a gap: another piece of track, not one joining this)
        const b = routes[e.i], q = routePose(b, routeSOf(b, [A[0], A[1]])), qx = q[0] - A[0], qy = q[1] - A[1];
        const beside = Math.abs(qx * u[1] - qy * u[0]) > ON_LINE && Math.hypot(qx, qy) < gauge + 24;
        if (beside) { far = ahead; who = e.i; at = [e.p[0], e.p[1]]; }
      }
      if (who < 0) continue;
      const L = routeLength(out[i]), by = Math.ceil((L + far + CARRY_PAST) / 8 - 1e-6) * 8 - L;
      const more = { kind: 'straight' as const, length: by };
      out[i] = end === 'end' ? { ...out[i], segments: [...out[i].segments, more] }
        : { ...out[i], start: [out[i].start[0] + by * Math.sin((out[i].start[2] * Math.PI) / 180), out[i].start[1] - by * Math.cos((out[i].start[2] * Math.PI) / 180), out[i].start[2]], segments: [more, ...out[i].segments] };
      // (expert: its hand edits stay where they are on the ground: the stretch of the drawn route this now is, that much longer)
      { const h = out[i].hand; if (h) { const d = h.to >= h.from ? 1 : -1; out[i] = { ...out[i], hand: end === 'end' ? { ...h, to: h.to + d * by } : { ...h, from: h.from - d * by } }; } }
      const studs = (mm: number) => (mm / 8).toFixed(1).replace(/\.0$/, '');
      warnings.push(`${a.id} ${end === 'end' ? 'ends' : 'starts'} ${studs(far)} studs short of where ${routes[who].id} joins it at ${(at[0] / 8).toFixed(0)}, ${(at[1] / 8).toFixed(0)} (studs): it's built ${studs(by)} studs longer, past the points there; lengthen ${a.id} by ${studs(by)} studs`);
    }
  });
  return { routes: out, warnings };
}
