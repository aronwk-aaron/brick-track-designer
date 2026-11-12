// (expert) Sleepers edited by hand, the part the build and the plan share: a route's edits as that route runs, and
// the sleepers it has once they're applied to the ones the app lays. Numbers only, mm along the route.
import { handForward, handS, type HandSleeper, type Route, routeLength } from '../route/route';

/** A sleeper as laid: where (mm along the route), the edit that made it so (none: as the app lays it), and where the app had it (an added one: nowhere). */
export interface LaidSleeper { v: number; e?: HandSleeper; from?: number }

/** Has an edit a shape of its own (longer on a side, or square to the grid): built as a tie, not as an ordinary sleeper. */
export const shapedSleeper = (e: HandSleeper | undefined) => !!e && ((e.left ?? 0) > 0 || (e.right ?? 0) > 0 || !!e.square);

/**
 * A route's sleeper edits as it runs (mm from its own start, + towards its own end, its own left and right): the
 * drawn route's, turned round where this route runs the other way; only the ones along this stretch of it.
 */
export function localSleepers(rt: Route): HandSleeper[] {
  const h = rt.hand;
  if (!h?.sleepers?.length) return [];
  const fwd = handForward(h), L = routeLength(rt), out: HandSleeper[] = [];
  for (const e of h.sleepers) {
    const at = handS(h, e.at);
    // (one on the joint between two stretches is the later one's as drawn: each edit is made once)
    if (fwd ? at < 0 || at >= L : at <= 0 || at > L) continue;
    out.push({ ...e, at, ...(e.move !== undefined && { move: fwd ? e.move : -e.move }), ...((e.left !== undefined || e.right !== undefined) && { left: (fwd ? e.left : e.right) ?? 0, right: (fwd ? e.right : e.left) ?? 0 }) });
  }
  return out;
}

/**
 * The sleepers a route has with its edits made: each edit but an added one is of the nearest sleeper the app lays
 * (spots, mm) within tol of its place, one edit to a sleeper (the first); taken out, moved along, or kept with its
 * edit; then the added ones. In order along the route. lost: the edits no sleeper was found for.
 */
export function laySleepers(spots: number[], edits: HandSleeper[], tol: number): { laid: LaidSleeper[]; lost: HandSleeper[] } {
  const of = new Map<number, HandSleeper>(), lost: HandSleeper[] = [];
  for (const e of edits) {
    if (e.add) continue;
    let best = -1;
    spots.forEach((v, k) => { if (!of.has(k) && Math.abs(v - e.at) <= tol + 1e-6 && (best < 0 || Math.abs(v - e.at) < Math.abs(spots[best] - e.at) - 1e-9)) best = k; });
    if (best < 0) lost.push(e); else of.set(best, e);
  }
  const laid: LaidSleeper[] = [];
  spots.forEach((v, k) => { const e = of.get(k); if (!e) laid.push({ v, from: v }); else if (!e.off) laid.push({ v: v + (e.move ?? 0), e, from: v }); });
  for (const e of edits) if (e.add && !e.off) laid.push({ v: e.at + (e.move ?? 0), e });
  laid.sort((a, b) => a.v - b.v);
  return { laid, lost };
}
