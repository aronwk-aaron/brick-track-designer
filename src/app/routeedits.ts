// A route turned end for end, or mirrored: its track, and with it everything on its card that's said by its ends
// (start, end) or its sides (left, right), so it stays the track it was.
import type { BankRamps, DRoute } from './design';
import { reversed } from './planner';

const otherEnd = <T extends string | undefined>(e: T): T => (e === 'start' ? 'end' : e === 'end' ? 'start' : e) as T;
const otherSide = <T extends string | undefined>(s: T): T => (s === 'left' ? 'right' : s === 'right' ? 'left' : s) as T;

/**
 * The same track drawn from its other end (a start dragged onto another track's end, to join them): its start and
 * end swapped, and so what each ends in (a buffer stop), the ends its guard rails come to a point at, the ends its
 * third rail stops short of, its banked curves' ramps, and its heights (a grade runs the other way); the rail both
 * gauges share is on the other side, facing along it. (Its lever's side is by the points, not the route: kept.)
 */
export function reversedRoute(r: DRoute): DRoute {
  const rev = reversed(r);
  const out: DRoute = { ...r, ...rev, segs: rev.segs.map((sg) => (sg.kind === 'curve' && sg.bankRamps ? { ...sg, bankRamps: otherEnd(sg.bankRamps) as BankRamps } : sg)) };
  delete out.startEnd; delete out.endEnd;
  if (r.endEnd) out.startEnd = r.endEnd;
  if (r.startEnd) out.endEnd = r.startEnd;
  if (r.guardRailEnds) out.guardRailEnds = otherEnd(r.guardRailEnds);
  if (r.dualPlainEnds) out.dualPlainEnds = otherEnd(r.dualPlainEnds);
  // (the shared rail left out is the right one: said here only where there's a third rail, or it was said)
  if (r.dualGauge || r.dualShared) out.dualShared = otherSide(r.dualShared ?? 'right');
  if (r.monoHeight !== undefined && r.monoHeightEnd !== undefined) { out.monoHeight = r.monoHeightEnd; out.monoHeightEnd = r.monoHeight; }
  return out;
}

/**
 * Mirror a route left to right about the line x = px (studs), in place: its start and heading, its curves the other
 * way, and its sides with them (the rail both gauges share, its lever's side where it branches).
 */
export function mirrorRoute(r: DRoute, px: number) {
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  r.x = r3(2 * px - r.x); r.heading = r3(-r.heading);
  for (const sg of r.segs) if (sg.kind === 'curve') sg.angle = -sg.angle;
  if (r.dualGauge || r.dualShared) r.dualShared = otherSide(r.dualShared ?? 'right');
  if (r.throwSide) r.throwSide = otherSide(r.throwSide);
}
