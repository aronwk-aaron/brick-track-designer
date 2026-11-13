// Double slips (and single slips), found in a design's routes: two tracks that cross,
// with a slip road leaving one track and joining the other. What makes one is
// worked out from the routes alone, for any crossing angle and slip radius: the
// crossing's centre and angle, the slip roads' radius, the bisector of the two
// tracks, and each points set's place, the acute frog its blades must clear,
// which side of its track is outside (away from the other track), and whether
// its end meets another slip's at an X (two diagonals crossing: an X centre).
// From that come the points' and levers' settings the reference R104 double slip
// has (slipTrackwork), so a slip drawn as plain routes is built as the reference's
// is; a hand edit of any of them wins over what's worked out.
import type { Pt, Route } from '../route/route';
import { railPoint, routeLength, routePose, worldToPose } from '../route/route';
import type { Solution } from '../route/solver';
import { reversedRoute } from './reverse';
import { sharedLead, subRoute, toFrame } from './pieces';

/** One points set of a slip: a slip road leaving (or joining) one of its tracks. */
export interface SlipSet {
  /** the solver's split (sol.splits index) */
  split: number;
  /** its toe, as the hand edits key it (mm, rounded) */
  key: string;
  /** the track it's on, the other track, its slip road (route indices) */
  track: number; other: number; road: number;
  /** the road joins the track here (trailing, as drawn) */
  merge: boolean;
  /** along its points' frame from where the routes part (mm): the acute frog (where the other track's rail crosses this one's), the length its routes share first */
  frogS: number; lead: number;
  /** the solver's points span (mm, from where the routes part) */
  span: number;
  /** the side of its track away from the other track, in its points' own frame (looking the way the routes part) */
  outside: 'left' | 'right';
  /** its end of the slip meets another slip's on another diagonal (an X centre) */
  inner: boolean;
}
export interface DoubleSlip {
  /** the two tracks (route indices), the first the one its first road leaves */
  tracks: [number, number];
  /** its slip roads: two for a double slip, one for a single slip */
  roads: number[];
  /** where the tracks' centre lines cross (mm), at what angle (degrees) */
  centre: Pt; angle: number;
  /** the slip roads' radius (mm, the tightest curve on them) */
  radius: number;
  /** the heading of the bisector of the two tracks at the centre (degrees, between them) */
  bisector: number;
  sets: SlipSet[];
}

const keyOf = (q: [number, number]) => `${Math.round(q[0])},${Math.round(q[1])}`;
const toeOf = (routes: Route[], sp: Solution['splits'][number]): [number, number] => {
  const q = routePose(routes[sp.routes[0]], sp.merge ? sp.spans[0][1] : sp.spans[0][0]);
  return [q[0], q[1]];
};
/** Where two routes' centre lines cross (the nearest crossing to pt): [point, s on a, s on b], or undefined. */
function centreCross(a: Route, b: Route, pt: Pt, within: number): [Pt, number, number] | undefined {
  const step = 4, win = (rt: Route) => { const m = nearestS(rt, pt), L = routeLength(rt); return [Math.max(0, m - within), Math.min(L, m + within)]; };
  const [a0, a1] = win(a), [b0, b1] = win(b);
  const qs: [number, ReturnType<typeof routePose>][] = [];
  for (let t = b0; t < b1 - 1e-9; t += step) qs.push([t, routePose(b, t)]);
  qs.push([b1, routePose(b, b1)]);
  let best: [Pt, number, number] | undefined, bestD = Infinity;
  for (let s = a0; s < a1 - 1e-9; s += step) {
    const p0 = routePose(a, s), p1 = routePose(a, Math.min(a1, s + step)), ds = Math.min(a1, s + step) - s;
    for (let k = 0; k + 1 < qs.length; k++) {
      const [t, q0] = qs[k], q1 = qs[k + 1][1], dt = qs[k + 1][0] - t;
      const d = (p1[0] - p0[0]) * (q1[1] - q0[1]) - (p1[1] - p0[1]) * (q1[0] - q0[0]);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((q0[0] - p0[0]) * (q1[1] - q0[1]) - (q0[1] - p0[1]) * (q1[0] - q0[0])) / d;
      const v = ((q0[0] - p0[0]) * (p1[1] - p0[1]) - (q0[1] - p0[1]) * (p1[0] - p0[0])) / d;
      if (u < -1e-9 || u > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) continue;
      const x: Pt = [p0[0] + u * (p1[0] - p0[0]), p0[1] + u * (p1[1] - p0[1])], dd = Math.hypot(x[0] - pt[0], x[1] - pt[1]);
      if (dd < bestD) { bestD = dd; best = [x, s + u * ds, t + v * dt]; }
    }
  }
  return best;
}

/** The slips in a design: each slip road that leaves one track and joins another that crosses it, grouped by crossing. */
export function findDoubleSlips(routes: Route[], sol: Solution): DoubleSlip[] {
  const out: DoubleSlip[] = [];
  // (each road: the one split it leaves a track at, the one it joins another at)
  const roadsOf = new Map<number, { from: number; to: number }>();
  routes.forEach((_, r) => {
    const leaves = sol.splits.map((sp, k) => k).filter((k) => sol.splits[k].routes[1] === r && !sol.splits[k].merge);
    const joins = sol.splits.map((sp, k) => k).filter((k) => sol.splits[k].routes[1] === r && sol.splits[k].merge);
    if (leaves.length === 1 && joins.length === 1 && sol.splits[leaves[0]].routes[0] !== sol.splits[joins[0]].routes[0]) roadsOf.set(r, { from: leaves[0], to: joins[0] });
  });
  const used = new Set<number>();
  for (const [r, { from, to }] of roadsOf) {
    if (used.has(r)) continue;
    const a = sol.splits[from].routes[0], b = sol.splits[to].routes[0];
    // (the crossing it slips across: the tracks' centre lines' nearest the road's middle)
    const mid = routePose(routes[r], routeLength(routes[r]) / 2);
    const cx = centreCross(routes[a], routes[b], [mid[0], mid[1]], routeLength(routes[r]));
    if (!cx || Math.hypot(cx[0][0] - mid[0], cx[0][1] - mid[1]) > routeLength(routes[r])) continue;
    // (the road the other way, b to a, at the same crossing)
    const back = [...roadsOf].find(([r2, e]) => r2 !== r && !used.has(r2) && sol.splits[e.from].routes[0] === b && sol.splits[e.to].routes[0] === a
      && (() => { const m2 = routePose(routes[r2], routeLength(routes[r2]) / 2); return Math.hypot(cx[0][0] - m2[0], cx[0][1] - m2[1]) <= routeLength(routes[r2]); })());
    const roads = back ? [r, back[0]] : [r];
    roads.forEach((x) => used.add(x));
    const ha = routePose(routes[a], cx[1])[2], hb = routePose(routes[b], cx[2])[2];
    const dh = ((hb - ha + 540) % 360) - 180;
    // (the tightest curve on the roads)
    const radius = Math.min(...roads.flatMap((x) => routes[x].segments.flatMap((sg) => (sg.kind === 'arc' ? [sg.radius] : []))), Infinity);
    const splits = roads.flatMap((x) => [roadsOf.get(x)!.from, roadsOf.get(x)!.to]);
    const sets: SlipSet[] = splits.map((k) => {
      const sp = sol.splits[k], track = sp.routes[0], road = sp.routes[1], other = track === a ? b : a;
      const dirOf = (i: number) => (sp.merge ? reversedRoute(routes[i]) : routes[i]);
      const sa = sp.merge ? routeLength(routes[track]) - sp.spans[0][1] : sp.spans[0][0];
      const P = routePose(dirOf(track), sa);
      // (the acute frog: the first crossing of this track's rails with the other track's, along the points from where they part)
      const frogS = Math.min(...sol.crossings.flatMap((c) => {
        const mine = c.a.route === track && c.b.route === other ? c.a : c.b.route === track && c.a.route === other ? c.b : undefined;
        if (!mine) return [];
        const s = (sp.merge ? routeLength(routes[track]) - mine.s : mine.s) - sa;
        return s > 0 ? [s] : [];
      }), Infinity);
      const frog = frogS < Infinity ? routePose(dirOf(track), sa + frogS) : undefined;
      // (outside: away from the other track, where its centre line is at the frog)
      const oq = frog ? railPoint(routes[other], Math.max(0, Math.min(routeLength(routes[other]), nearestS(routes[other], [frog[0], frog[1]]))), 0) : [cx[0][0], cx[0][1]] as Pt;
      const outside = worldToPose(P, oq)[0] > 0 ? 'left' : 'right';
      const fr = (rt: Route): Route => ({ ...rt, start: toFrame(P, rt.start) });
      const A = fr(subRoute(dirOf(track), sa, Math.min(routeLength(dirOf(track)), sa + 400), 'A')), B = fr(subRoute(dirOf(road), 0, Math.min(routeLength(dirOf(road)), 400), 'B'));
      return { split: k, key: keyOf(toeOf(routes, sp)), track, other, road, merge: !!sp.merge, frogS, lead: sharedLead(A, B), span: sp.spans[0][1] - sp.spans[0][0], outside, inner: false };
    });
    const bis = ha + (Math.abs(dh) < 90 ? dh / 2 : (dh - Math.sign(dh) * 180) / 2);
    out.push({ tracks: [a, b], roads, centre: cx[0], angle: Math.abs(Math.abs(dh) < 90 ? dh : 180 - Math.abs(dh)), radius, bisector: bis, sets });
  }
  // (an X centre: a set's toe where another slip's, on another track, is too (two diagonals crossing there, as a double
  // slip crossover's middle). That end of the slip, both its sets there (by the bisector, which end), its inner sets)
  const toeAt = (st: SlipSet) => toeOf(routes, sol.splits[st.split]);
  const endOf = (ds: DoubleSlip, st: SlipSet) => { const q = toeAt(st), h = (ds.bisector * Math.PI) / 180; return Math.sign(-(q[0] - ds.centre[0]) * Math.sin(h) + (q[1] - ds.centre[1]) * Math.cos(h)); };
  for (const ds of out) {
    const xEnds = new Set(ds.sets.filter((st) => out.some((o) => o !== ds && o.sets.some((s2) => s2.track !== st.track && !ds.tracks.includes(s2.track)
      && Math.hypot(toeAt(s2)[0] - toeAt(st)[0], toeAt(s2)[1] - toeAt(st)[1]) < 4))).map((st) => endOf(ds, st)));
    for (const st of ds.sets) st.inner = xEnds.has(endOf(ds, st));
  }
  return out;
}
/** The arc length on a route nearest a point (coarse, then fine). */
function nearestS(rt: Route, q: Pt): number {
  const L = routeLength(rt);
  let best = 0, bd = Infinity;
  for (let s = 0; s <= L; s += 2) { const p = routePose(rt, s), d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = s; } }
  for (let s = Math.max(0, best - 2); s <= Math.min(L, best + 2); s += 0.05) { const p = routePose(rt, s), d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = s; } }
  return best;
}

/**
 * How far past the acute frog the reference's blades start (mm, from where the routes part to the blades' toe, as
 * switchPlan lays them: 2 mm in, then the routes' shared length, then the toe edit): the R104 double slip's are 13.1 and 13.8
 * past it on each track (67 and 78 mm toe edits, the diagonal's routes sharing 2 mm first, as sharedLead finds it): 13.5 gives both.
 */
export const PAST_FROG = 13.5;
/** The reference's blades lengthened at their heels (mm). */
export const SLIP_HEEL = 18;
/** The reference's levers: 7 studs from the track's centre line (leverOffset, mm), in a housing at the corner 5.5 studs in from the track's end. */
export const SLIP_LEVER_OFFSET = 24, SLIP_LEVER_AT = 5.5;
/** A check rail opposite an acute frog that runs on into the blade ends this much (mm) short of the blade's toe, at least 9 shorter, as the reference's does at its tongue's toe. */
const CHECK_BEFORE_TOE = 1, CHECK_SHORTER = 9;

type Tw = { points?: Record<string, object>; throw?: Record<string, object>; check?: Record<string, object> };
/**
 * The points', levers' and check rails' settings the reference's double slips have, for the slips found (findDoubleSlips),
 * keyed as the hand edits are. Where the other track's rail crosses in within the points (a slip at a shallow angle, as
 * the R104 one at 22.5 degrees), the points as the reference's: past the acute frog, one moving blade a set (the one by
 * the slip road's own stock rail: the other would lie where the other track's rails cross in), lengthened at the heel, the
 * lever outside in a housing at the corner, and the check rail there ended short of the blade. Elsewhere (a 45-degree
 * slip, its points at its ends before the frogs) only the lever: outside, 7 studs from its track's centre line.
 */
export function slipTrackwork(routes: Route[], sol: Solution, slips: DoubleSlip[]): Required<Tw> {
  const tw: Required<Tw> = { points: {}, throw: {}, check: {} };
  for (const ds of slips) for (const st of ds.sets) {
    // (the frog within the points' span, a little in from its end: a slip at 22.5 degrees on R40, its frog just at the
    // span's end (59.7 of 59 to 60 mm), keeps its points at its ends)
    const inside = st.frogS < st.span - 2;
    if (!inside) { tw.throw[st.key] = { side: st.outside, leverOffset: SLIP_LEVER_OFFSET }; continue; }
    const toe = Math.round(st.frogS + PAST_FROG - 2 - st.lead);
    tw.points[st.key] = { toe, heel: SLIP_HEEL, single: 'straight' };
    tw.throw[st.key] = { side: st.outside, leverOffset: SLIP_LEVER_OFFSET, leverAt: SLIP_LEVER_AT };
    // (the check rail on this track that would run on into the blade: ended short of its toe)
    const sp = sol.splits[st.split], L = routeLength(routes[st.track]), sa = sp.merge ? L - sp.spans[0][1] : sp.spans[0][0], toeS = sa + 2 + st.lead + toe;
    for (const cr of sol.checkRails) {
      if (cr.route !== st.track) continue;
      const c0 = sp.merge ? L - cr.s1 : cr.s0, c1 = sp.merge ? L - cr.s0 : cr.s1;
      if (!(c0 < toeS && c1 > toeS - CHECK_BEFORE_TOE)) continue;
      const by = -Math.max(CHECK_SHORTER, Math.round(c1 - toeS + CHECK_BEFORE_TOE));
      const key = keyOf(railPoint(routes[cr.route], (cr.s0 + cr.s1) / 2, cr.offset + cr.width / 2));
      tw.check[key] = sp.merge ? { d0: by } : { d1: by };
    }
  }
  return tw;
}
/** Hand edits over what's worked out: each item's own fields over the worked-out ones. */
export function underHand<T extends Tw>(hand: T, auto: Required<Tw>): T {
  const merge = (h: Record<string, object> | undefined, a: Record<string, object>) => {
    if (!Object.keys(a).length) return h;
    const o: Record<string, object> = { ...a };
    for (const [k, v] of Object.entries(h ?? {})) o[k] = { ...(a[k] ?? {}), ...v };
    return o;
  };
  const out = { ...hand } as T & Tw;
  const p = merge(hand.points, auto.points), t = merge(hand.throw, auto.throw), c = merge(hand.check, auto.check);
  if (p) out.points = p; if (t) out.throw = t; if (c) out.check = c;
  return out;
}
