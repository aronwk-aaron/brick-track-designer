// A route run the other way: from its end, turned round, its segments in
// reverse order (a curve turns the other way when run backwards).
import type { Route } from '../route/route';
import { reversedExtra, routeLength, routePose } from '../route/route';

export function reversedRoute(rt: Route): Route {
  const e = routePose(rt, routeLength(rt));
  return {
    ...rt,
    start: [e[0], e[1], ((e[2] + 360) % 360) - 180],
    segments: [...rt.segments].reverse().map((sg) => (sg.kind === 'straight' ? { ...sg } : { ...sg, angle: -sg.angle })),
    // (the sleepers measured from the whole route's other end)
    ...(rt.sleeperFrame && { sleeperFrame: { s0: rt.sleeperFrame.L - rt.sleeperFrame.s0 - routeLength(rt), L: rt.sleeperFrame.L, in0: rt.sleeperFrame.in1, in1: rt.sleeperFrame.in0 } }),
    ...(rt.extra && { extra: reversedExtra(rt.extra) }),
  };
}
