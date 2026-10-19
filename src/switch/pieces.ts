// Splitting a design into printable pieces: wherever routes split (one starts
// on another, or several start together), a switch piece with working points
// (switch.scad's layout: the routes from the split, in its frame, up to where
// their ends are clear of each other); what's left of the routes is the
// fixed trackwork piece (crossings and plain track).
import type { Pose, Pt, Route, Segment } from '../route/route';
import { routeLat, routeLength, routePose, segLength, segStarts } from '../route/route';
import type { Split } from '../route/solver';
import { type BaseParams, BASE_DEFAULTS, type SetSpec, switchPlan, type SwitchPlan } from './base';

const rad = (d: number) => (d * Math.PI) / 180;
const sind = (d: number) => Math.sin(rad(d)), cosd = (d: number) => Math.cos(rad(d));

/** The part of segment sg from l0 to l1 along it. */
function part(sg: Segment, l0: number, l1: number): Segment {
  return sg.kind === 'straight' ? { kind: 'straight', length: l1 - l0 } : { kind: 'arc', radius: sg.radius, angle: (Math.sign(sg.angle) * (l1 - l0) * 180) / (Math.PI * sg.radius) };
}
/** A route's stretch from arc length s0 to s1, as a route of its own. */
export function subRoute(rt: Route, s0: number, s1: number, id = rt.id): Route {
  const st = segStarts(rt), segments: Segment[] = [];
  rt.segments.forEach((sg, i) => {
    const a = Math.max(s0, st[i]), b = Math.min(s1, st[i] + segLength(sg));
    if (b > a + 1e-6) segments.push(part(sg, a - st[i], b - st[i]));
  });
  return { id, start: routePose(rt, s0), segments };
}
/** A pose in frame P's coordinates (P at the origin heading +y). */
export function toFrame(P: Pose, q: Pose): Pose {
  const dx = q[0] - P[0], dy = q[1] - P[1];
  return [dx * cosd(P[2]) + dy * sind(P[2]), -dx * sind(P[2]) + dy * cosd(P[2]), q[2] - P[2]];
}

/** Arc length where a route's centre line reaches y (it heads up the frame). */
function sAtY(rt: Route, y: number): number {
  let lo = 0, hi = routeLength(rt);
  for (let n = 0; n < 50; n++) { const mid = (lo + hi) / 2; if (routePose(rt, mid)[1] < y) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export interface SwitchPiece {
  /** Where the piece starts, in the design (its frame: the origin heading +y). */
  pose: Pose;
  /** Its routes in its frame, right to left, all ending level at y = length. */
  routes: Route[];
  sets: SetSpec[];
  defaultThrowDir: number;
  length: number;
  plan: SwitchPlan;
  /** The design's routes it covers: [route, s0, s1]. */
  covers: [number, number, number][];
}
export interface Pieces { switches: SwitchPiece[]; rest: Route[]; warnings: string[] }

/** Work out the switch pieces of a design and what's left over. */
export function planPieces(routes: Route[], splits: Split[], p: BaseParams = BASE_DEFAULTS): Pieces {
  const warnings: string[] = [];
  const sleeperLen = (p.gaugeStuds + 1) * 8 + 24, endHw = sleeperLen / 2;
  // Splits by parent route, along it; those close together make one switch (a three-way).
  const byParent = new Map<number, { child: number; sa: number }[]>();
  for (const sp of splits) {
    const [i, j] = sp.routes, sa = sp.spans[0][0];
    if (!byParent.has(i)) byParent.set(i, []);
    byParent.get(i)!.push({ child: j, sa });
  }
  const used = new Set<number>(); // children already in a switch
  const switches: SwitchPiece[] = [];
  for (const [parent, list] of byParent) {
    list.sort((a, b) => a.sa - b.sa);
    while (list.length) {
      const first = list.shift()!;
      if (used.has(first.child)) continue;
      const group = [first];
      while (list.length && list[0].sa - first.sa < 160 && group.length < 2) group.push(list.shift()!);
      const P = routePose(routes[parent], first.sa);
      // The routes in the switch's frame: the parent on from the split, and
      // each child (with the parent's stretch up to it, for a later split).
      const frame = (rt: Route): Route => ({ ...rt, start: toFrame(P, rt.start) });
      const main = frame(subRoute(routes[parent], first.sa, routeLength(routes[parent]), 'main'));
      const kids = group.map((g) => {
        const lead = g.sa - first.sa;
        const prefix = lead > 1e-6 ? subRoute(main, 0, lead).segments : [];
        return { ...g, lead, route: { id: `c${g.child}`, start: [0, 0, 0] as Pose, segments: [...prefix, ...routes[g.child].segments] } };
      });
      const frameRoutes = [main, ...kids.map((k) => k.route)];
      // Right to left, by where they are far out.
      const far = Math.min(...frameRoutes.map((rt) => routePose(rt, routeLength(rt))[1]));
      const xAt = (rt: Route) => routePose(rt, sAtY(rt, far))[0];
      const order = frameRoutes.map((_, k) => k).sort((a, b) => xAt(frameRoutes[b]) - xAt(frameRoutes[a]));
      const pos = (k: number) => order.indexOf(k);
      const sets: SetSpec[] = [];
      let ok = true;
      // Two branches leaving together, one each side: a true three-way (one
      // slider, three positions); otherwise a set per branch (a tandem
      // three-way when the second leaves further on).
      const together = kids.length === 2 && kids.every((k) => k.lead < 1) && pos(0) === 1;
      if (together) sets.push([0, 2, 12, undefined, 1]);
      else kids.forEach((kd, n) => {
        const ci = pos(n + 1), mi = pos(0);
        if (Math.abs(ci - mi) !== 1) { ok = false; return; }
        // (the throw on the main route's side, as switch.scad's)
        sets.push(ci < mi ? [ci, mi, kd.lead + 12, -1] : [mi, ci, kd.lead + 12, +1]);
      });
      if (!ok) { warnings.push('two branches on the same side of one switch: not built as a switch'); continue; }
      const sorted = order.map((k) => frameRoutes[k]);
      // Long enough for the frog and its check rails, and for the ends to be
      // clear of each other (switch.scad's auto length), on a 4-stud grid.
      let built: { L: number; rts: Route[]; plan: SwitchPlan } | undefined;
      for (let L = 64; L <= 1600 && !built; L += 32) {
        if (sorted.some((rt) => routePose(rt, routeLength(rt))[1] < L - 1e-6)) continue;
        const rts = sorted.map((rt) => subRoute(rt, 0, sAtY(rt, L)));
        const ends = rts.map((rt) => routePose(rt, routeLength(rt)));
        if (ends.some((e) => Math.abs(e[1] - L) > 0.05)) continue;
        let clear = true;
        for (let k = 0; k + 1 < ends.length; k++)
          if (Math.abs(ends[k][0] - ends[k + 1][0]) < endHw * (Math.abs(cosd(ends[k][2])) + Math.abs(cosd(ends[k + 1][2]))) + 2) clear = false;
        if (!clear) continue;
        const plan = switchPlan(rts, sets, p);
        if (plan.frogs.some((f) => f.pt[1] + p.checkRailLen / 2 + 34 > L)) continue;
        built = { L, rts, plan };
      }
      if (!built) { warnings.push("a switch's routes don't part far enough before they end: not built as a switch"); continue; }
      // Short stubs left over (under 8 studs): take the routes to their ends
      // instead (as LEGO's switch, whose curve ends past the straight).
      const whole = sorted.every((rt) => routeLength(rt) - sAtY(rt, built!.L) < 64);
      if (whole) built = { L: Math.max(...sorted.map((rt) => routePose(rt, routeLength(rt))[1])), rts: sorted, plan: switchPlan(sorted, sets, p) };
      warnings.push(...built.plan.warnings);
      for (const k of kids) used.add(k.child);
      const cutAt = (rt: Route) => (whole ? routeLength(rt) : sAtY(rt, built!.L));
      const covers: [number, number, number][] = [[parent, first.sa, first.sa + cutAt(main)]];
      kids.forEach((k) => {
        const s = cutAt(k.route) - k.lead;
        covers.push([k.child, 0, Math.min(s, routeLength(routes[k.child]))]);
      });
      switches.push({ pose: P, routes: built.rts, sets, defaultThrowDir: 1, length: built.L, plan: built.plan, covers });
    }
  }
  // What's left of each route: its stretches outside the switches.
  const rest: Route[] = [];
  routes.forEach((rt, i) => {
    const L = routeLength(rt);
    const cut = switches.flatMap((sw) => sw.covers.filter((c) => c[0] === i).map((c) => [c[1], c[2]] as [number, number])).sort((a, b) => a[0] - b[0]);
    let s = 0;
    for (const [a, b] of [...cut, [L, L] as [number, number]]) {
      if (a - s > 1) rest.push(subRoute(rt, s, a, `${rt.id}:${rest.length}`));
      s = Math.max(s, b);
    }
  });
  return { switches, rest, warnings };
}

/** Is a point near a route's centre line (for checks). */
export const onRoute = (rt: Route, q: Pt, tol = 0.01) => Math.abs(routeLat(rt, q)) < tol;
