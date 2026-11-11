// A narrow-gauge track leaving dual-gauge track part way along it, the dual-gauge track carrying on: built as the
// narrow gauge's own points on dual-gauge track (the 'Dual gauge switch R36, narrow gauge branch' templates) between
// two places where the gauges part and meet again (design.ts GAUGE_SPLITS). The dual-gauge route's stretch round the
// toe is made a plain route of its gauge with a narrow-gauge route of its own alongside, where its narrow gauge lies
// (its rails the shared rail and the third rail); its third rail kept either side. The solver's points between that
// route and the branch (solver.ts onDual) and the narrow ends within the wider ones (route.ts hostedEnds) do the rest.
//
// Which rails cross which, and so where a frog is wanted (the branch's two rails: the one on the shared rail's side,
// its outer rail; the other, its inner rail, off the third rail):
//   - three rails, the branch away on the shared rail's side: its inner rail starts as the one blade, off the third
//     rail, and crosses the shared rail (one frog); its outer rail leaves the shared rail, both fixed, the branch's
//     flangeway cut through the shared rail. Built (onDual).
//   - three rails, the branch away on the third rail's side: its outer rail (off the shared rail) crosses the third
//     rail and then the far standard rail (two frogs), and the blade would close on the shared rail in the standard
//     gauge's flangeway. Not built: said (build.ts, the refused points), the narrow gauge running straight through.
//   - narrow gauge centred (four rails): both narrow rails are the narrow gauge's own; leaving either way one of them
//     crosses the standard rail on that side and a blade would have to close on a rail it has no room beside. Not
//     built: said, as above.
//   - a standard-gauge branch (not this: its own points on the standard rails). Away on the third rail's side: the
//     branch's inner rail crosses the third rail past the blades, a frog there (extrarails.ts clearStretches, built at
//     DUAL_CROSS or steeper). Away on the shared rail's side: the third rail would lie under the blades, with no room for
//     both: left out through the points and said (build.ts), narrow-gauge trains stopping there.
// Left and right are mirror images: which side is which comes from the dual-gauge route's shared rail and the way the
// branch turns, nothing else.
import { subRoute } from '../switch/pieces';
import { poseToWorld, type Pose, type Route, routeLat, routeLength, routePose, routeSOf, type Segment } from '../route/route';

/** (mm) a stretch is a whole number of these long: the joints either side clear of a stud, as every track end is */
const STRETCH_STEP = 32;

/** The route rt offset across by off (mm, + = right): its own track beside it, parallel. */
function offsetRoute(rt: Route, off: number, id: string, gauge: number): Route {
  const p = poseToWorld(rt.start, [off, 0]);
  const segments = rt.segments.map((sg): Segment => (sg.kind === 'straight' ? { kind: 'straight', length: sg.length } : { kind: 'arc', radius: sg.radius + Math.sign(sg.angle) * off, angle: sg.angle }));
  return { id, start: [p[0], p[1], rt.start[2]] as Pose, segments, gauge };
}
const dAng = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/**
 * The routes with each narrow-gauge branch part way along a dual-gauge route built as points (see above); gauge: the
 * design's (mm, rail centre to rail centre). Routes with nothing of the kind are returned as they were (the same array).
 */
export function dualBranches(routes: Route[], gauge: number): Route[] {
  let out = routes;
  for (let guard = 0; guard < 16; guard++) {
    const next = oneBranch(out, gauge);
    if (!next) return out;
    out = next;
  }
  return out;
}

function oneBranch(routes: Route[], gauge: number): Route[] | undefined {
  for (let di = 0; di < routes.length; di++) {
    const D = routes[di], x = D.extra;
    if (!x?.dual || D.grade || D.segments.some((sg) => sg.roll?.length)) continue;
    const gD = D.gauge ?? gauge, gN = (x.dualStuds + 1) * 8, LD = routeLength(D);
    if (gN >= gD) continue;
    // (the narrow gauge's middle, to the right of D's as it runs here: the shared rail's side, as drawn)
    const sharedRight = x.dualShared === 'right' ? x.to >= x.from : x.dualShared === 'left' ? x.to < x.from : undefined;
    const off = sharedRight === undefined ? 0 : (sharedRight ? 1 : -1) * (gD - gN) / 2;
    for (let ni = 0; ni < routes.length; ni++) {
      const N = routes[ni];
      if (ni === di || N.extra?.dual || (N.gauge ?? gauge) !== gN || N.grade || !N.segments.length) continue;
      const LN = routeLength(N);
      for (const end of ['start', 'end'] as const) {
        const P = routePose(N, end === 'start' ? 0 : LN), away = end === 'start' ? P[2] : P[2] + 180;
        const s = routeSOf(D, [P[0], P[1]]);
        // (part way along: at D's ends it's where the gauges part, route.ts hostedEnds)
        if (s < STRETCH_STEP / 2 || s > LD - STRETCH_STEP / 2) continue;
        const Q = routePose(D, s);
        if (Math.hypot(...poseToWorld(Q, [off, 0]).map((v, k) => v - P[k]) as [number, number]) > 0.05) continue;
        const dir = dAng(away, Q[2]) < 0.5 ? 1 : dAng(away, Q[2] + 180) < 0.5 ? -1 : 0;
        if (!dir) continue;
        // (how far along D the stretch runs: in whole steps, till D's track on from there is clear of the branch's (the
        // third rail is left out of track that runs beside another, extrarails.ts clearStretches), or to D's end)
        const near = (sl: number) => { for (let a = sl; a <= Math.min(sl + 400, dir > 0 ? LD - s : s); a += 4) { const q = routePose(D, s + dir * a); if (Math.abs(routeLat(N, [q[0], q[1]])) < gD + 24 + 4) return true; } return false; };
        let len = STRETCH_STEP;
        while (len < LD && near(len)) len += STRETCH_STEP;
        // (the stretch: s0 to s1 along D; to D's end if less than a step would be left)
        let s0 = dir > 0 ? s : s - len, s1 = dir > 0 ? s + len : s;
        if (dir < 0 && s0 < STRETCH_STEP) s0 = 0;
        if (dir > 0 && s1 > LD - STRETCH_STEP) s1 = LD;
        // (each part known by the drawn route's name and a number, as a route's tiles are: build.ts takes the number off)
        const base = D.id.replace(/~\d+$/, ''), ids = new Set(routes.map((r) => r.id));
        let k = 1;
        const id = () => { while (ids.has(`${base}~${k}`)) k++; ids.add(`${base}~${k}`); return `${base}~${k}`; };
        const plain = subRoute(D, s0, s1, id());
        delete plain.extra;
        const narrow = offsetRoute(plain, off, id(), gN);
        const before = s0 > 0 ? [subRoute(D, 0, s0, id())] : [], after = s1 < LD ? [subRoute(D, s1, LD, id())] : [];
        return [...routes.slice(0, di), ...before, plain, narrow, ...after, ...routes.slice(di + 1)];
      }
    }
  }
  return undefined;
}
