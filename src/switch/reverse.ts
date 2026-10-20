// A route run the other way: from its end, turned round, its segments in
// reverse order (a curve turns the other way when run backwards).
import type { Route } from '../route/route';
import { routeLength, routePose } from '../route/route';

export function reversedRoute(rt: Route): Route {
  const e = routePose(rt, routeLength(rt));
  return {
    ...rt,
    start: [e[0], e[1], ((e[2] + 360) % 360) - 180],
    segments: [...rt.segments].reverse().map((sg) => (sg.kind === 'straight' ? { ...sg } : { ...sg, angle: -sg.angle })),
  };
}
