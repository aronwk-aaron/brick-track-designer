// Splitting a design into printable pieces: wherever routes split (one starts
// on another, or several start together), a switch piece with working points
// (switch.scad's layout: the routes from the split, in its frame, up to where
// their ends are clear of each other); what's left of the routes is the
// fixed trackwork piece (crossings and plain track).
import type { Pose, Pt, Route, Segment } from '../route/route';
import type { SetOver } from './base';
import { heightAt, poseToWorld, rollPart, routeLat, routeLength, routePose, routeSOf, segLength, segStarts, subExtra, subHand, worldToPose } from '../route/route';
import type { Split } from '../route/solver';
import { type BaseParams, BASE_DEFAULTS, type SetSpec, switchPlan, type SwitchPlan } from './base';
import { gridIn, sprungOnGrid } from './context';

const rad = (d: number) => (d * Math.PI) / 180;
const cosd = (d: number) => Math.cos(rad(d));

/** The part of segment sg from l0 to l1 along it. */
function part(sg: Segment, l0: number, l1: number): Segment {
  const out: Segment = sg.kind === 'straight' ? { kind: 'straight', length: l1 - l0 } : { kind: 'arc', radius: sg.radius, angle: (Math.sign(sg.angle) * (l1 - l0) * 180) / (Math.PI * sg.radius) };
  const roll = rollPart(sg.roll, l0, l1);
  if (roll) out.roll = roll;
  return out;
}
/** (expert) A stretch's hand edits, if the route has any there. */
const hand = (rt: Route, s0: number, s1: number) => { const h = subHand(rt.hand, s0, s1); return h ? { hand: h } : {}; };
/** A route's stretch from arc length s0 to s1, as a route of its own. */
export function subRoute(rt: Route, s0: number, s1: number, id = rt.id): Route {
  const st = segStarts(rt), segments: Segment[] = [];
  rt.segments.forEach((sg, i) => {
    const a = Math.max(s0, st[i]), b = Math.min(s1, st[i] + segLength(sg));
    if (b > a + 1e-6) segments.push(part(sg, a - st[i], b - st[i]));
  });
  const f = rt.sleeperFrame;
  return { id, start: routePose(rt, s0), segments, ...(f && { sleeperFrame: { ...f, s0: f.s0 + s0 } }), ...(rt.extra && { extra: subExtra(rt.extra, s0, s1) }), ...hand(rt, s0, s1), ...(rt.grade && { grade: [heightAt(rt, s0), heightAt(rt, s1)] as [number, number] }), ...(rt.gauge !== undefined && { gauge: rt.gauge }) };
}
/** A pose in frame P's coordinates (P at the origin heading +y). */
export function toFrame(P: Pose, q: Pose): Pose {
  return [...worldToPose(P, [q[0], q[1]]), q[2] - P[2]];
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
  /** Where each set's points are in the design (where its branch leaves): the key its hand edits go by. */
  setAts: [number, number][];
}
/**
 * A points set's lever on a stud of the design's grid (studs at 4 + 8k mm:
 * the track's centre lines run between them), so its arm sits square on the
 * studs: the lever offset and tine length that put it there, nearest where
 * it would be, in frame P. keep: the settings already chosen by hand.
 */
export function gridLever(P: Pose, v0: { leverX: number; throwY: number; leverY?: number; throwEdgeX: number; leverMinD: number; throwDir: number; pivotPt: [number, number] }, keep: ThrowEdit = {}): SetOver {
  // (a lever in a housing at a corner: where it is, not the throw bar)
  const v = { ...v0, throwY: v0.leverY ?? v0.throwY };
  const toW = (x: number, y: number) => poseToWorld(P, [x, y]);
  const toL = (q: [number, number]) => worldToPose(P, q);
  const snap = (q: [number, number]): [number, number] => [Math.round((q[0] - 4) / 8) * 8 + 4, Math.round((q[1] - 4) / 8) * 8 + 4];
  const edge = Math.abs(v.throwEdgeX), minD = Math.abs(v.leverMinD), maxTine = v.pivotPt[1] - 12.5;
  let best: SetOver | undefined, bestD = Infinity;
  for (let i = -2; i <= 3; i++) for (let j = -2; j <= 2; j++) {
    // (candidates round where it is: out from the least it may go, along within the tines' reach)
    const w = snap(toW(v.leverX + v.throwDir * 8 * i, v.throwY + 8 * j)), [lx, ly] = toL(w);
    if (Math.sign(lx) !== v.throwDir || Math.abs(lx) < Math.max(edge, minD) - 0.01) continue;
    const tine = v.pivotPt[1] - 2 - ly;
    if (tine < 16 || tine > maxTine + 0.01) continue;
    const d = Math.hypot(lx - v.leverX, ly - v.throwY);
    // (exact, not rounded: the arm right on the studs)
    if (d < bestD) { bestD = d; best = { leverOffset: Math.abs(lx) - edge, springLength: tine }; }
  }
  if (!best) return {};
  return { ...best, ...(keep.leverOffset !== undefined && { leverOffset: keep.leverOffset }), ...(keep.springLength !== undefined && { springLength: keep.springLength }) };
}

/** A points set's lever, as moved by hand: which side, how far out, and (by its tines' length) how far along. */
export interface ThrowEdit { side?: 'left' | 'right'; leverOffset?: number; springLength?: number; /** (the points' own hand edits, Trackwork.points single and heel: a single-point switch's moving blade; the blades lengthened, mm) */ single?: 'curved' | 'straight'; heel?: number;
  /** (expert, stage 5c) the throw bar moved along, whole studs (+: towards the heel); this set's own blade style and moving blades */
  throwShift?: number; /** (blades on top) the lever in a housing at a corner, studs along the points (Trackwork.throw leverAt) */ leverAt?: number; bladeStyle?: 'simple' | 'prototype' | 'sprung'; blades?: 1 | 2; /** (expert) this set's own mechanism */ mech?: 'tines' | 'plates'; each?: { left?: { leverOffset?: number }; right?: { leverOffset?: number } } }
/** A lever's hand edit: the points' own; for one of a three-way's two levers (blade 0 the left one's, 1 the right's) with its own over it (each). */
export const bladeEdit = (ed: ThrowEdit | undefined, blade: number | undefined): ThrowEdit | undefined => {
  const own = blade === undefined ? undefined : ed?.each?.[blade === 0 ? 'left' : 'right'];
  return own ? { ...ed, ...own } : ed;
};
export interface Pieces { switches: SwitchPiece[]; rest: Route[]; warnings: string[] }

/** Work out the switch pieces of a design and what's left over. */
/** How far two routes from the same start run together (mm), before they part: 0 for a branch that leaves at once. */
export function sharedLead(a: Route, b: Route): number {
  const L = Math.min(routeLength(a), routeLength(b));
  let t = 0;
  // (the same line: as close, and heading the same way; two curves parting at once differ in heading straight away)
  const same = (u: number) => {
    const q = routePose(b, u), sa = routeSOf(a, [q[0], q[1]]);
    return Math.abs(routeLat(a, [q[0], q[1]])) < 0.02 && Math.abs(((routePose(a, sa)[2] - q[2] + 540) % 360) - 180) < 0.02;
  };
  while (t < L && same(t + 0.5)) t += 0.5;
  return t;
}
/** A three-way's blades each on a slider and lever of its own (threeWayLevers 2): with blades on top only. As nail switches too (throwNail):
 * one slider has three positions and nothing to hold it at them without its lever, so each blade is on its own, pushed over by hand. */
export const twoLevers = (p: { threeWayLevers?: number; mechStyle?: string; throwNail?: boolean }) => (p.threeWayLevers === 2 || !!p.throwNail) && p.mechStyle === 'plates';
/** toeShift: how far (mm) to move the points from where the branch leaves, by that point in the design (hand edits). */
export function planPieces(routes: Route[], splits: Split[], p: BaseParams = BASE_DEFAULTS, toeShift: (at: [number, number]) => number = () => 0,
  throwEdit: (at: [number, number]) => ThrowEdit | undefined = () => undefined, gridLevers = false): Pieces {
  const warnings: string[] = [], angled: string[] = [];
  const gw = routes.length && (p.generateBallast || p.undersideGrid !== 'track') ? routePose(routes[0], 0) : undefined;
  // (the ends must clear each other's base: the sleepers, or with ballast its widest layer)
  const sleeperLen = (p.gaugeStuds + 1) * 8 + 24;
  const endHw = p.generateBallast ? (sleeperLen + ((p.ballastBuddy ?? true) ? 32 : 16)) / 2 : sleeperLen / 2;
  // Splits by parent route, along it; those close together make one switch (a three-way).
  const byParent = new Map<number, { child: number; sa: number }[]>();
  for (const sp of splits) {
    if (sp.merge) continue; // (merging points: the network piece's)
    const [i, j] = sp.routes, sa = sp.spans[0][0];
    if (!byParent.has(i)) byParent.set(i, []);
    byParent.get(i)!.push({ child: j, sa });
  }
  const used = new Set<number>(); // children already in a switch
  const switches: SwitchPiece[] = [];
  for (const [parent, list] of byParent) {
    list.sort((a, b) => a.sa - b.sa);
    let s0 = 0; // (not cut at the joins: the switch starts where its parent route does)
    while (list.length) {
      const first = list.shift()!;
      if (used.has(first.child)) continue;
      const group = [first];
      while (list.length && list[0].sa - first.sa < 160 && group.length < 2) group.push(list.shift()!);
      const P = routePose(routes[parent], s0);
      // (planned with the design's stud grid in its frame, but lined up with the track, track alone: sprung blades'
      // slider on the grid's lines; at an angle to it, rigid blades (sprungOnGrid))
      const pg = sprungOnGrid(gw ? { ...p, grid: gridIn(P, gw) } : p);
      if (pg.angled) angled.push(`${(P[0] / 8).toFixed(0)}, ${(P[1] / 8).toFixed(0)}`);
      // The routes in the switch's frame: the parent on from the split, and
      // each child (with the parent's stretch up to it, for a later split).
      const frame = (rt: Route): Route => ({ ...rt, start: toFrame(P, rt.start) });
      const main = frame(subRoute(routes[parent], s0, routeLength(routes[parent]), 'main'));
      const kids = group.map((g) => {
        const lead = g.sa - s0;
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
      const together = kids.length === 2 && Math.abs(kids[0].lead - kids[1].lead) < 1 && pos(0) === 1;
      const atOf = (sa: number): [number, number] => { const q = routePose(routes[parent], sa); return [q[0], q[1]]; };
      const shift = (sa: number) => toeShift(atOf(sa));
      const setAts: [number, number][] = [];
      // (a lever to each blade (threeWayLevers 2, blades on top): two sets at the one toe, each one blade's, the left then the right)
      const own3 = together && twoLevers(pg.p);
      if (together) for (const b of own3 ? [0, 1] as const : [undefined]) { sets.push([0, 2, kids[0].lead + 12 + shift(kids[0].sa), undefined, 1, undefined, b]); setAts.push(atOf(kids[0].sa)); }
      else kids.forEach((kd, n) => {
        const ci = pos(n + 1), mi = pos(0);
        if (Math.abs(ci - mi) !== 1) { ok = false; return; }
        // (the throw on the main route's side, as switch.scad's)
        // (from where it leaves: a branch drawn running along the main route first leaves later)
        const toe = Math.max(kd.lead, sharedLead(main, kd.route)) + 12 + shift(kd.sa);
        sets.push(ci < mi ? [ci, mi, toe, -1] : [mi, ci, toe, +1]);
        setAts.push(atOf(kd.sa));
      });
      if (!ok) { warnings.push('two branches on the same side of one switch: not built as a switch'); continue; }
      // (the lever: as moved by hand, else the branch's own side, else the options')
      sets.forEach((st, n) => {
        const ed = bladeEdit(throwEdit(setAts[n]), st[6]);
        const own = ed?.side ?? routes[kids[Math.min(n, kids.length - 1)].child].throwSide;
        const side = own && own !== 'auto' ? own : p.throwSide;
        if ((side === 'left' || side === 'right') && st[6] === undefined) st[3] = side === 'right' ? 1 : -1;
        if (ed && (ed.leverOffset !== undefined || ed.springLength !== undefined || ed.single || ed.heel || ed.throwShift || ed.leverAt !== undefined)) st[5] = { ...(ed.leverOffset !== undefined && { leverOffset: ed.leverOffset }), ...(ed.springLength !== undefined && { springLength: ed.springLength }), ...(ed.single && { single: ed.single }), ...(ed.heel && { heelShift: ed.heel }), ...(ed.throwShift && { throwShift: ed.throwShift }), ...(ed.leverAt !== undefined && { leverAt: ed.leverAt * 8 }) };
      });
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
        const plan = switchPlan(rts, sets, pg.p);
        if (plan.frogs.some((f) => f.pt[1] + p.checkRailLen / 2 + 34 > L)) continue;
        built = { L, rts, plan };
      }
      if (!built) { warnings.push("a switch's routes don't part far enough before they end: not built as a switch"); continue; }
      // The routes to their ends: the switch and the track on from it are one
      // piece (it's split for the print bed only where it has to be).
      const whole = true;
      if (whole) built = { L: Math.max(...sorted.map((rt) => routePose(rt, routeLength(rt))[1])), rts: sorted, plan: switchPlan(sorted, sets, pg.p) };
      // (each lever on a stud of the design's grid, unless moved by hand)
      if (gridLevers) {
        let moved = false;
        sets.forEach((st, n) => {
          const ed = bladeEdit(throwEdit(setAts[n]), st[6]) ?? {};
          if (ed.leverOffset !== undefined && ed.springLength !== undefined) return;
          const g2 = gridLever(P, built!.plan.sets[n], ed);
          if (g2.leverOffset !== undefined) { st[5] = { ...g2, ...(ed.single && { single: ed.single }), ...(ed.heel && { heelShift: ed.heel }), ...(ed.throwShift && { throwShift: ed.throwShift }) }; moved = true; }
        });
        if (moved) built = { ...built, plan: switchPlan(sorted, sets, pg.p) };
      }
      // (but not switch.scad's print-bed guess, with its margins: the build cuts the base to the bed and says if a part still doesn't fit)
      warnings.push(...built.plan.warnings.filter((w) => !/print bed/.test(w)));
      for (const k of kids) used.add(k.child);
      const cutAt = (rt: Route) => (whole ? routeLength(rt) : sAtY(rt, built!.L));
      const covers: [number, number, number][] = [[parent, s0, s0 + cutAt(main)]];
      kids.forEach((k) => {
        const s = cutAt(k.route) - k.lead;
        covers.push([k.child, 0, Math.min(s, routeLength(routes[k.child]))]);
      });
      switches.push({ pose: P, routes: built.rts, sets, defaultThrowDir: 1, length: built.L, plan: built.plan, covers, setAts });
      s0 = s0 + cutAt(main); // (a later switch on the same route starts after this one)
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
  if (angled.length) warnings.push(`some switches' sprung blades are on thinner plates (2.3 mm), their slider over the studs: at an angle to the baseplate grid it can't lie between them (the switches at ${angled.slice(0, 4).join('; ')}${angled.length > 4 ? ' …' : ''}, in studs; Underside lined up with: The track itself keeps the full plates)`);
  return { switches, rest, warnings };
}

/** Is a point near a route's centre line (for checks). */
export const onRoute = (rt: Route, q: Pt, tol = 0.01) => Math.abs(routeLat(rt, q)) < tol;
