// A route turned end for end, or mirrored: its track, and with it everything on its card that's said by its ends
// (start, end) or its sides (left, right), so it stays the track it was.
import type { RouteEnds } from '../route/route';
import { type BankRamps, type Design, type DRoute, isMono, routeGaugeStuds } from './design';
import { reversed } from './planner';
import { cutLength, reverseCuts } from './routecuts';

const otherEnd = <T extends string | undefined>(e: T): T => (e === 'start' ? 'end' : e === 'end' ? 'start' : e) as T;
const otherSide = <T extends string | undefined>(s: T): T => (s === 'left' ? 'right' : s === 'right' ? 'left' : s) as T;

/**
 * The same track drawn from its other end (a start dragged onto another track's end, to join them): its start and
 * end swapped, and so what each ends in (a buffer stop), the ends its guard rails come to a point at, the ends its
 * third rail stops short of, its banked curves' ramps, its hand cuts, and its heights (a grade runs the other way); the rail both
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
  // (its hand cuts: each as far from the new start as it was from the old end)
  if (r.cuts) { const cuts = reverseCuts(r.cuts, cutLength(r)); if (cuts) out.cuts = cuts; else delete out.cuts; }
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

/**
 * Why two routes can't be made one track (undefined: they can). A route is one system, one gauge, and has one set of
 * guard rails, third rail and monorail heights along its whole length, so two that differ would lose one's settings
 * (a bridge's guard rails, a narrow gauge's third rail) or have them stretched over the other's track.
 */
export function joinProblem(d: Design, a: DRoute, b: DRoute, heightsToo = true): string | undefined {
  if (isMono(a) !== isMono(b)) return 'one is monorail, the other train track';
  if (routeGaugeStuds(d, a) !== routeGaugeStuds(d, b)) return 'their gauges differ';
  const same = (...ks: (keyof DRoute)[]) => ks.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
  if (!!a.guardRails !== !!b.guardRails || (a.guardRails && !same('guardRailGapStuds', 'guardRailTaperStuds', 'guardRailTaperShape', 'guardRailNoseRampStuds'))) return 'their guard rails differ';
  if (!!a.dualGauge !== !!b.dualGauge || (a.dualGauge && !same('dualGaugeStuds', 'dualShared'))) return 'their third rails differ';
  if (heightsToo && isMono(a) && !same('monoHeight')) return 'their heights differ';
  return undefined;
}

/**
 * What a "which ends" setting (guard rails coming to a point, the third rail stopping short) is on two routes made one track, route b's
 * track added to the end of route a's: a's start stays the start; a's old end and b's end that met it are inside the track now (nothing
 * there); b's far end is the new end (bEnd: which end of b met a: 'start' leaves b's end as the far one).
 */
export function joinedEnds(a: RouteEnds | undefined, b: RouteEnds | undefined, bEnd: 'start' | 'end'): RouteEnds | undefined {
  if (a === undefined && b === undefined) return undefined;
  const has = (e: RouteEnds | undefined, w: 'start' | 'end') => e === 'both' || e === w;
  const start = has(a, 'start'), end = has(b, bEnd === 'start' ? 'end' : 'start');
  return start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
}
