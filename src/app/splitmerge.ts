// A route cut in two where the pointer is, and two routes that meet made one. The pure part (the design changed in place);
// the plan and the selection bar call it.
import { type BankRamps, type Design, type DRoute, type DSeg, freeName, toRoutes } from './design';
import { follow, type Pose } from './planner';
import { joinedEnds, joinProblem, reversedRoute } from './routeedits';
import { joinAnchors, reverseAnchors, splitAnchors } from './twfollow';
import { cutLength, joinCuts, reverseCuts, splitCuts } from './routecuts';
import { routeLength } from '../route/route';
import type { RouteEnds } from '../route/route';

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const segLen = (sg: DSeg) => (sg.kind === 'straight' ? sg.studs : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180);
export const routeStuds = (r: DRoute) => r.segs.reduce((t, sg) => t + segLen(sg), 0);

/** How far along a route (studs) the point on its centre line nearest p is, and how far off (studs). Curves are looked along every quarter stud. */
export function nearestAlong(r: DRoute, p: [number, number]): { s: number; dist: number } {
  let best = { s: 0, dist: Infinity }, q: Pose = { x: r.x, y: r.y, heading: r.heading }, acc = 0;
  const see = (pt: Pose, s: number) => { const d = Math.hypot(pt.x - p[0], pt.y - p[1]); if (d < best.dist) best = { s, dist: d }; };
  see(q, 0);
  for (const sg of r.segs) {
    if (sg.kind === 'straight') {
      const u = [-Math.sin((q.heading * Math.PI) / 180), Math.cos((q.heading * Math.PI) / 180)], t = Math.min(sg.studs, Math.max(0, (p[0] - q.x) * u[0] + (p[1] - q.y) * u[1]));
      see(follow(q, [{ kind: 'straight', studs: t }]), acc + t);
    } else {
      const n = Math.max(1, Math.ceil(segLen(sg) / 0.25));
      for (let k = 1; k <= n; k++) see(follow(q, [{ ...sg, angle: (sg.angle * k) / n }]), acc + (segLen(sg) * k) / n);
    }
    q = follow(q, [sg]); acc += segLen(sg);
  }
  return best;
}

/** Why a route can't be cut at s studs along it (undefined: it can): each half must be at least a stud long. */
export function splitProblem(r: DRoute, s: number): string | undefined {
  const L = routeStuds(r);
  if (s < 1 || s > L - 1) return `${r.name || 'the route'} is ${+L.toFixed(1)} studs long: cut it at least a stud in from either end`;
  return undefined;
}

const hasRamp = (sg: Extract<DSeg, { kind: 'curve' }>, w: 'start' | 'end') => ['both', w].includes(sg.bankRamps ?? 'both');
const rampsOf = (start: boolean, end: boolean): BankRamps => (start && end ? 'both' : start ? 'start' : end ? 'end' : 'none');

/** Route r's segments cut at s studs along: the two lists (a curve cut in two keeps its radius, its angle shared by length; a bank holds across the cut). */
export function cutSegs(segs: DSeg[], s: number): [DSeg[], DSeg[]] {
  const first: DSeg[] = [], second: DSeg[] = [];
  let acc = 0;
  for (const sg of segs) {
    const l = segLen(sg);
    if (acc + l <= s + 1e-9) first.push({ ...sg });
    else if (acc >= s - 1e-9) second.push({ ...sg });
    else {
      const f = (s - acc) / l;
      if (sg.kind === 'straight') { first.push({ kind: 'straight', studs: r6(sg.studs * f) }); second.push({ kind: 'straight', studs: r6(sg.studs * (1 - f)) }); }
      else {
        const x: DSeg = { ...sg, angle: r6(sg.angle * f) }, y: DSeg = { ...sg, angle: r6(sg.angle * (1 - f)) };
        if (sg.bank) { x.bankRamps = rampsOf(hasRamp(sg, 'start'), false); y.bankRamps = rampsOf(false, hasRamp(sg, 'end')); if (x.bankRamps === 'both') delete x.bankRamps; if (y.bankRamps === 'both') delete y.bankRamps; }
        first.push(x); second.push(y);
      }
    }
    acc += l;
  }
  return [first, second];
}

const endsOf = (e: RouteEnds | undefined): [boolean, boolean] => [e === 'both' || e === 'start', e === 'both' || e === 'end'];
const endsFrom = (start: boolean, end: boolean): RouteEnds => (start && end ? 'both' : start ? 'start' : end ? 'end' : 'none');

/**
 * Route i cut at s studs along it (whole studs: rounded): the first half keeps its name and place in the list, the second is a new route
 * after it, starting where the first ends. What's on the track goes with it: the guard rails' and third rail's settings on both (their
 * pointed ends the cut routes' far ends only), buffer stops and the second end on the half that has that end, the lever's side with the
 * first (the route's start), a monorail's or a grade's height at the cut on both sides, hand edits by where they are (splitAnchors),
 * hand cuts each on its own half (splitCuts).
 * Returns the two names, or why not.
 */
export function splitRoute(d: Design, i: number, at: number): { first: string; second: string } | { problem: string } {
  const r = d.routes[i];
  if (!r) return { problem: 'no such route' };
  const s = Math.round(at), problem = splitProblem(r, s);
  if (problem) return { problem };
  const L = routeStuds(r), rts = toRoutes(d), rt = rts[i], name = r.name || String(i), nb = freeName(d, 'T');
  const [sa, sb] = cutSegs(r.segs, s), cut = follow(r, sa);
  splitAnchors(d, name, nb, s * 8, routeLength(rt), rt);
  const b: DRoute = { ...structuredClone(r), name: nb, x: r6(cut.x), y: r6(cut.y), heading: r6(norm180(cut.heading)), segs: sb };
  delete b.startEnd; delete b.throwSide;
  const a = r;
  // (its hand cuts: each half its own, the second's from its own start)
  if (r.cuts) { const [ca, cb] = splitCuts(r.cuts, s); if (ca) a.cuts = ca; else delete a.cuts; if (cb) b.cuts = cb; else delete b.cuts; }
  a.segs = sa; delete a.endEnd;
  if (r.endEnd) b.endEnd = r.endEnd;
  for (const k of ['guardRailEnds', 'dualPlainEnds'] as const) {
    if (r[k] === undefined) continue;
    const [st, en] = endsOf(r[k]);
    a[k] = endsFrom(st, false); b[k] = endsFrom(false, en);
    if (a[k] === 'none') delete a[k];
    if (b[k] === 'none') delete b[k];
  }
  // (a height: its start to its end, evenly; the cut's is between)
  if (r.monoHeight !== undefined && r.monoHeightEnd !== undefined) {
    const h = r6(r.monoHeight + (r.monoHeightEnd - r.monoHeight) * (s / L));
    a.monoHeightEnd = h; b.monoHeight = h;
  }
  d.routes.splice(i + 1, 0, b);
  return { first: name, second: nb };
}

/** The end of a route (studs): its pose facing out. */
const endPose = (r: DRoute, which: 'start' | 'end'): Pose => {
  if (which === 'start') return { x: r.x, y: r.y, heading: norm180(r.heading + 180) };
  const e = follow(r, r.segs); return { ...e, heading: norm180(e.heading) };
};
/** Which ends of routes i and j meet (same point, tracks running on into each other), if they do: i's, then j's. */
export function meeting(d: Design, i: number, j: number): ['start' | 'end', 'start' | 'end'] | undefined {
  const a = d.routes[i], b = d.routes[j];
  if (!a || !b || i === j) return undefined;
  for (const ea of ['end', 'start'] as const) for (const eb of ['start', 'end'] as const) {
    const p = endPose(a, ea), q = endPose(b, eb);
    if (Math.hypot(p.x - q.x, p.y - q.y) < 0.05 && Math.abs(norm180(p.heading - q.heading - 180)) < 0.5) return [ea, eb];
  }
  return undefined;
}

/** Why routes i and j can't be made one track (undefined: they can): they don't meet, or joinProblem (heights that don't run on from each other aside). */
export function mergeProblem(d: Design, i: number, j: number): string | undefined {
  const m = meeting(d, i, j);
  if (!m) return "they don't meet end to end, on the same line";
  const a = m[0] === 'end' ? d.routes[i] : reversedRoute(d.routes[i]), b = m[1] === 'start' ? d.routes[j] : reversedRoute(d.routes[j]);
  // (heights: a's end height must be b's start height: then the two are one slope)
  const why = joinProblem(d, a, b, false);
  if (why) return why;
  if ((a.monoHeightEnd ?? a.monoHeight) !== b.monoHeight) return 'their heights differ where they meet';
  return undefined;
}

/**
 * Route b's track added to the end of route a (b's start or end, bEnd, meeting a's end): a gets b's track and what's on it, b goes.
 * (Hand edits, ends and guard rail ends as the drag-join always did.) Returns where a is in the list now.
 */
export function joinInto(d: Design, a: number, b: number, bEnd: 'start' | 'end'): number {
  const routes = d.routes, rb = routes[b];
  if (joinProblem(d, routes[a], rb)) return a;
  return joinWith(d, a, b, bEnd);
}
function joinWith(d: Design, a: number, b: number, bEnd: 'start' | 'end'): number {
  const routes = d.routes, rb = routes[b], rts = toRoutes(d);
  joinAnchors(d, routes[a].name || String(a), rb.name || String(b), routeLength(rts[a]), routeLength(rts[b]), bEnd === 'end');
  const more = bEnd === 'start' ? rb.segs.map((sg) => ({ ...sg })) : reversedRoute(rb).segs;
  // (their hand cuts: b's on from a's end; both cut by hand only: still two parts where they met, and still by hand only)
  if (routes[a].cuts || rb.cuts || routes[a].cutsLocked || rb.cutsLocked) {
    const both = !!routes[a].cutsLocked && !!rb.cutsLocked, lenB = cutLength(rb);
    const cuts = joinCuts(routes[a].cuts, bEnd === 'start' ? rb.cuts : reverseCuts(rb.cuts, lenB), cutLength(routes[a]), both);
    if (cuts) routes[a].cuts = cuts; else delete routes[a].cuts;
    if (both) routes[a].cutsLocked = true; else delete routes[a].cutsLocked;
  }
  const segs = routes[a].segs;
  for (const sg of more) {
    const last = segs[segs.length - 1], first = more[0];
    if (last?.kind === 'straight' && sg.kind === 'straight') last.studs = Math.round((last.studs + sg.studs) * 1e6) / 1e6;
    else if (sg === first && last?.kind === 'curve' && sg.kind === 'curve' && last.bank && last.bank === sg.bank && last.radius === sg.radius && Math.sign(last.angle) === Math.sign(sg.angle) && !hasRamp(last, 'end') && !hasRamp(sg, 'start')) {
      // (a banked curve cut in two, put back together: its bank held across the cut)
      last.angle = r6(last.angle + sg.angle);
      const re = rampsOf(hasRamp(last, 'start'), hasRamp(sg, 'end')); if (re === 'both') delete last.bankRamps; else last.bankRamps = re;
    } else segs.push(sg);
  }
  for (const k of ['guardRailEnds', 'dualPlainEnds'] as const) { const v = joinedEnds(routes[a][k], rb[k], bEnd); if (v === undefined || v === 'none') delete routes[a][k]; else routes[a][k] = v; }
  const far = bEnd === 'start' ? rb.endEnd : rb.startEnd;
  if (far) routes[a].endEnd = far; else delete routes[a].endEnd;
  routes.splice(b, 1);
  return b < a ? a - 1 : a;
}

/**
 * Two routes that meet made one (merge): as the drag-join, but from either route's either end: the one turned end for end first where it has
 * to be. The merged route is the first of the two in the list (its name too, unless the first was turned: then still the first's name).
 * Returns its place in the list, or why not.
 */
export function mergeRoutes(d: Design, i: number, j: number): { index: number } | { problem: string } {
  const problem = mergeProblem(d, i, j);
  if (problem) return { problem };
  const [ea, eb] = meeting(d, i, j)!;
  if (ea === 'start') { d.routes[i] = reversedRoute(d.routes[i]); reverseAnchors(d, d.routes[i].name || String(i)); }
  const a = d.routes[i], b = d.routes[j];
  const ha = a.monoHeight, hb = eb === 'start' ? b.monoHeightEnd ?? b.monoHeight : b.monoHeight;
  const idx = joinWith(d, i, j, eb);
  const m = d.routes[idx];
  // (a slope that ran on across the two: from where a began to where b ends)
  if (ha !== undefined || hb !== undefined) { if (ha !== undefined) m.monoHeight = ha; if (hb !== undefined && hb !== ha) m.monoHeightEnd = hb; else delete m.monoHeightEnd; }
  return { index: idx };
}
