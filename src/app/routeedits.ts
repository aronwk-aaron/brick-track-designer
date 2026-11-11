// A route turned end for end, or mirrored: its track, and with it everything on its card that's said by its ends
// (start, end) or its sides (left, right), so it stays the track it was.
import type { RouteEnds } from '../route/route';
import { type BankRamps, type Design, type DRoute, dualRailOffsets, isMono, RAIL_DEFAULTS, routeGaugeStuds } from './design';
import { follow, reversed } from './planner';
import { cutLength, reverseCuts } from './routecuts';
import { reverseStretches } from './stretches';

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
  if (r.stretches) { const st = reverseStretches(r.stretches, cutLength(r)); if (st) out.stretches = st; else delete out.stretches; }
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

/**
 * A dual-gauge route's narrow gauge: its gauge (studs), and how far its middle is to the right of the route's own,
 * facing along the route as drawn (studs: the shared rail's side, or 0 centred). Undefined: no dual gauge, or it isn't
 * built (design.ts dualRailOffsets).
 */
export function narrowOf(d: Design, r: DRoute): { gaugeStuds: number; off: number } | undefined {
  if (!dualRailOffsets(d, r).length) return undefined;
  const gs = routeGaugeStuds(d, r), n = r.dualGaugeStuds ?? RAIL_DEFAULTS.dualGaugeStuds, sh = r.dualShared ?? RAIL_DEFAULTS.dualShared;
  return { gaugeStuds: n, off: sh === 'centre' ? 0 : ((sh === 'right' ? 1 : -1) * (gs - n)) / 2 };
}

/**
 * Two tracks that can't be made one (joinProblem) but whose ends still belong together: dual-gauge track, and one of
 * its two gauges carrying on from its end alone (where the gauges part: the standard gauge on its middle, the narrow
 * gauge where the dual-gauge track's narrow gauge lies). They stay two routes, their ends met. Returns which of the
 * two is the dual-gauge one and how far the other's middle is to the right of its middle, facing along the dual-gauge
 * route as drawn (studs); undefined: not such a pair.
 */
export function gaugeMeet(d: Design, a: DRoute, b: DRoute): { dual: 'a' | 'b'; off: number } | undefined {
  if (isMono(a) || isMono(b)) return undefined;
  const na = narrowOf(d, a), nb = narrowOf(d, b);
  if (!!na === !!nb || (na ? b : a).dualGauge) return undefined;
  const dual = na ? a : b, other = na ? b : a, n = (na ?? nb)!, g = routeGaugeStuds(d, other);
  if (g === routeGaugeStuds(d, dual)) return { dual: na ? 'a' : 'b', off: 0 };
  return g === n.gaugeStuds ? { dual: na ? 'a' : 'b', off: n.off } : undefined;
}

type End = 'start' | 'end';
/** A route's end: where it is, and the way the route runs there as drawn (studs, degrees). */
const endOf = (r: DRoute, end: End) => (end === 'start' ? { x: r.x, y: r.y, heading: r.heading } : follow(r, r.segs));
const right = (h: number): [number, number] => [Math.cos((h * Math.PI) / 180), Math.sin((h * Math.PI) / 180)];
const norm = (h: number) => ((h % 360) + 540) % 360 - 180;

/**
 * Where route mine's end (mineEnd) goes to meet route fixed's end (fixedEnd), as gaugeMeet has them: the place (studs),
 * and the heading mine arrives with (into fixed's track). The narrow gauge's middle is beside the dual-gauge track's,
 * so the two ends are a little apart across the track. Undefined: not such a pair.
 */
export function gaugeMeetPose(d: Design, fixed: DRoute, fixedEnd: End, mine: DRoute, mineEnd: End): { x: number; y: number; heading: number } | undefined {
  const m = gaugeMeet(d, fixed, mine);
  if (!m) return undefined;
  const e = endOf(fixed, fixedEnd), arrive = norm(fixedEnd === 'start' ? e.heading : e.heading + 180);
  // (the dual-gauge route's own way along, at the meeting: fixed's, or mine's as it arrives)
  const along = m.dual === 'a' ? e.heading : mineEnd === 'end' ? arrive : arrive + 180, rv = right(along), k = m.dual === 'a' ? m.off : -m.off;
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
  return { x: r6(e.x + k * rv[0]), y: r6(e.y + k * rv[1]), heading: arrive };
}

/** The dual-gauge route ends that route i's end meets head on, within its rails: [the dual-gauge route, its end, i's end, how far i's middle is to the right of the dual-gauge route's facing along it (studs)]. */
function dualEndsAt(d: Design, i: number): [DRoute, End, End, number][] {
  const r = d.routes[i], out: [DRoute, End, End, number][] = [];
  if (isMono(r) || r.dualGauge) return out;
  d.routes.forEach((q, j) => {
    const n = j === i ? undefined : narrowOf(d, q);
    if (!n) return;
    for (const qe of ['start', 'end'] as End[]) for (const re of ['start', 'end'] as End[]) {
      const a = endOf(q, qe), b = endOf(r, re), rv = right(a.heading), fw = [-rv[1], rv[0]];
      // (head on: one runs on from the other, so of a start and an end the headings agree, of two alike they oppose)
      if (Math.abs(norm(a.heading - b.heading + (qe === re ? 180 : 0))) > 0.01) continue;
      const lat = (b.x - a.x) * rv[0] + (b.y - a.y) * rv[1], on = (b.x - a.x) * fw[0] + (b.y - a.y) * fw[1];
      if (Math.abs(on) < 0.01 && Math.abs(lat) <= (routeGaugeStuds(d, q) - routeGaugeStuds(d, r)) / 2 + 0.01) out.push([q, qe, re, lat]);
    }
  });
  return out;
}

/**
 * A route's gauge was changed on its card (it was `was` studs): where one of its ends sat on a dual-gauge track's end
 * as one of that track's gauges, it's moved across to sit there as the other (the narrow gauge beside the middle, on
 * the shared rail's side; the standard gauge on the middle), so a track drawn from a dual-gauge end and then made
 * narrow gauge has its rails on the dual-gauge track's. True if it moved.
 */
export function reseatOnDual(d: Design, i: number, was: number): boolean {
  const r = d.routes[i], now = routeGaugeStuds(d, r);
  // (its gauge as it was, for finding where it sat)
  const before: Design = { ...d, routes: d.routes.map((q, j) => (j === i ? { ...q, gaugeStuds: was } : q)) };
  for (const [q, qe, , lat] of dualEndsAt(before, i)) {
    const n = narrowOf(d, q)!, gq = routeGaugeStuds(d, q), offOf = (g: number) => (g === gq ? 0 : g === n.gaugeStuds ? n.off : undefined);
    const o0 = offOf(was), o1 = offOf(now);
    if (o0 === undefined || o1 === undefined || Math.abs(lat - o0) > 0.01 || o0 === o1) continue;
    const rv = right(endOf(q, qe).heading), r6 = (v: number) => Math.round(v * 1e6) / 1e6;
    r.x = r6(r.x + (o1 - o0) * rv[0]); r.y = r6(r.y + (o1 - o0) * rv[1]);
    return true;
  }
  return false;
}

/**
 * Narrower tracks that start within a dual-gauge track's end but not where its narrow gauge lies (or of another gauge
 * than it): their rails don't meet the dual-gauge track's. Each: where (studs), the route, and what to do, said plainly;
 * move: how far to move the route across to put it there (studs on the plan; undefined: another gauge, moving won't do).
 */
export function dualEndMismatches(d: Design): { at: [number, number]; route: number; text: string; move?: [number, number]; onto?: string }[] {
  const out: { at: [number, number]; route: number; text: string; move?: [number, number]; onto?: string }[] = [];
  d.routes.forEach((r, i) => {
    for (const [q, qe, re, lat] of dualEndsAt(d, i)) {
      const n = narrowOf(d, q)!, g = routeGaugeStuds(d, r);
      if (g === routeGaugeStuds(d, q)) continue;
      const e = endOf(r, re), name = r.name || String(i), dn = q.name || 'the dual-gauge track';
      if (g !== n.gaugeStuds) out.push({ at: [e.x, e.y], route: i, text: `${name} (gauge ${g}) meets ${dn}, whose narrow gauge is ${n.gaugeStuds} stud${n.gaugeStuds === 1 ? '' : 's'}: their rails don't line up` });
      else if (Math.abs(lat - n.off) > 0.01) {
        // (which way to move it, facing along its own track from this end)
        const by = n.off - lat, sameWay = qe !== re, side = (by > 0) === sameWay ? 'right' : 'left', st = Number(Math.abs(by).toFixed(2));
        const rv = right(endOf(q, qe).heading), r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
        out.push({ at: [e.x, e.y], route: i, move: [r6(by * rv[0]), r6(by * rv[1])], onto: dn,
          text: `${name}'s rails don't line up with ${dn}'s narrow gauge: move this end ${st} stud${st === 1 ? '' : 's'} to the ${side} (its card's Move onto the narrow gauge does it)` });
      }
    }
  });
  return out;
}
