// A whole track network as one piece, with points built in wherever routes
// split or merge: the fixed trackwork (geom/crossing.ts: rails, frogs,
// check rails, bed, ends, underside) plus, at each split, one points set's
// machinery (switch/base.ts, worked out in the split's own frame): the raised
// bed with its pockets, the blades in place of the rails they replace, the
// planed stock feet, the throw arm and its channel; and the moving parts.
// This is how switches that cross other track or each other (a crossover)
// come out as one piece.
import { type CrossingOptions, crossingPiece } from '../geom/crossing';
import { R, T, type Man, type Scad } from '../geom/scad';
import type { Pose, Route } from '../route/route';
import { railPoint, routeLat, routeLength, routePose, routeSOf } from '../route/route';
import type { Solution } from '../route/solver';
import { reversedRoute } from './reverse';
import { type BaseParams, type SetSpec, switchGeometry, switchPlan, type SwitchPlan } from './base';
import { gridLever, subRoute, type ThrowEdit, toFrame } from './pieces';

export interface NetworkPart { name: string; color: number; local: Man; world: Man; turn?: { at: [number, number]; by: number; swing?: number } }

const LOCAL_LEN = 400; // (how much of each route the points' frame looks at)

/** One split's points, in the design's frame: what it adds to and cuts from the piece, and its moving parts. */
export interface SplitParts {
  /** all it's made from (the routes near it, its set, the parameters), as a key for what's built from it */
  key: string;
  toe: [number, number];
  /** the points' frame (at the split, heading the way the routes part), and its set's values in it (where the lever is) */
  frame: Pose; set: SwitchPlan['sets'][number];
  adds: Man[]; cuts: Man[];
  /** cut from every route's rails (the planed stock feet) */
  stock: Man;
  /** cut from one route's rails (by route index): the rails the blades replace */
  bladeCuts: [number, Man][];
  /** the route ends that start (or end) at the points: no connector there */
  inner: string[];
  /** the solver's split it is (sol.splits index; a three-way's first) */
  src: number;
  /** (throw_ballast) the steps round the lever's arm: their outermost outline [x0, x1, y0, y1], in the points' frame */
  stepRect?: [number, number, number, number];
  moving: NetworkPart[];
}

/** Each split's points (see SplitParts). Two branches leaving a route at
 * the same point, one each side, make one true three-way (its other splits,
 * the branches' from each other, are part of it). */
export function networkSplits(s: Scad, routes: Route[], sol: Solution, p: BaseParams, toeShift: (at: [number, number]) => number = () => 0,
  throwEdit: (at: [number, number]) => ThrowEdit | undefined = () => undefined, gridLevers = false) {
  const warnings: string[] = [];
  const place = (m: Man, P: Pose) => T(R(m, [0, 0, P[2]]), [P[0], P[1], 0]);
  // ---- which splits make a three-way ----
  const toeOf = (sp: Solution['splits'][number]) => { const s0 = sp.merge ? sp.spans[0][1] : sp.spans[0][0], q = routePose(routes[sp.routes[0]], s0); return [q[0], q[1]] as [number, number]; };
  const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1;
  const groups: { main: number; kids: number[] }[] = [], taken = new Set<number>();
  sol.splits.forEach((sp, k) => {
    if (taken.has(k)) return;
    const toe = toeOf(sp);
    const mates = sol.splits.map((o, m) => m).filter((m) => m !== k && !taken.has(m) && sol.splits[m].routes[0] === sp.routes[0] && !!sol.splits[m].merge === !!sp.merge && near(toeOf(sol.splits[m]), toe));
    if (mates.length !== 1) { groups.push({ main: k, kids: [] }); return; }
    const trio = [sp.routes[0], sp.routes[1], sol.splits[mates[0]].routes[1]];
    // (and the branches' split from each other, at the same point)
    const inside = sol.splits.map((o, m) => m).filter((m) => m !== k && m !== mates[0] && !taken.has(m) && sol.splits[m].routes.every((r) => trio.includes(r)) && near(toeOf(sol.splits[m]), toe));
    groups.push({ main: k, kids: [mates[0], ...inside] });
    taken.add(k); taken.add(mates[0]); inside.forEach((m) => taken.add(m));
  });
  // (points with another track's rail between their stock rails, toe to heels: their blades would lie on it. Say so:
  // a switch whose points start in another's frog, or a tandem's second points in the first's lead, as drawn, can't work)
  const G = ((p.gaugeStuds + 1) * 8) / 2;
  const through = (k: number, rt: Route) => {
    const sp = sol.splits[k], A = routes[sp.routes[0]], [s0, s1] = sp.spans[0], lo = s0 + (sp.merge ? 0 : 4), hi = s1 - (sp.merge ? 4 : 0);
    const a0 = routePose(A, lo), a1 = routePose(A, hi), box = [Math.min(a0[0], a1[0]) - 2 * G, Math.min(a0[1], a1[1]) - 2 * G, Math.max(a0[0], a1[0]) + 2 * G, Math.max(a0[1], a1[1]) + 2 * G];
    return [-G, G].some((o) => {
      const L = routeLength(rt);
      for (let t = 0; t <= L; t += 2) {
        const q = railPoint(rt, t, o);
        if (q[0] < box[0] || q[0] > box[2] || q[1] < box[1] || q[1] > box[3]) continue;
        const sa = routeSOf(A, q);
        if (sa > lo && sa < hi && Math.abs(routeLat(A, q)) < G - 1.25) return true;
      }
      return false;
    });
  };
  const studsAt = (k: number) => { const q = toeOf(sol.splits[k]); return `${(q[0] / 8).toFixed(0)}, ${(q[1] / 8).toFixed(0)} (studs)`; };
  // (the plate-style blade plates are cut clear of other track running past, their pins and posts moved to keep them strong
  // (switch/base.ts, fdbLayout): only where that can't be done is it said, once the points are worked out, below)
  const fdb = p.mechStyle === 'plates';
  /** The other routes near a group's points (any of their centre line within a few gauges of the points' span). */
  const nearby = (gr: { main: number; kids: number[] }) => {
    const sp = sol.splits[gr.main], A = routes[sp.routes[0]], [s0, s1] = sp.spans[0], mine = new Set([gr.main, ...gr.kids].flatMap((k) => sol.splits[k].routes));
    const ps = [0, 0.25, 0.5, 0.75, 1].map((t) => routePose(A, Math.max(0, Math.min(routeLength(A), s0 - 16 + (s1 - s0 + 32) * t))));
    const box = [Math.min(...ps.map((q) => q[0])) - 3 * G - 16, Math.min(...ps.map((q) => q[1])) - 3 * G - 16, Math.max(...ps.map((q) => q[0])) + 3 * G + 16, Math.max(...ps.map((q) => q[1])) + 3 * G + 16];
    return routes.flatMap((rt, r) => {
      if (mine.has(r)) return [];
      for (let t = 0; t <= routeLength(rt); t += 4) { const q = routePose(rt, t); if (q[0] >= box[0] && q[0] <= box[2] && q[1] >= box[1] && q[1] <= box[3]) return [r]; }
      return [];
    });
  };
  const throughWarnings = (gr: { main: number; kids: number[] }, blocked: boolean) => {
    const sp = sol.splits[gr.main], mine = new Set([gr.main, ...gr.kids].flatMap((k) => sol.splits[k].routes));
    const hits = routes.flatMap((rt, r) => (!mine.has(r) && through(gr.main, rt) ? [r] : []));
    if (fdb && !blocked) return;
    // (a branch taken out of these very points (trackwork drop), its rails run through as fixed track: said as that)
    const toe = toeOf(sp), takenOut = (r: number) => (sol.dropped ?? []).some((dp) => dp.routes.includes(r) && near(toeOf(dp), toe));
    if (hits.some((r) => !takenOut(r)))
      warnings.push(`the points at ${studsAt(gr.main)} have another track's rail between their stock rails (in another switch's frog or points?): their blades would hit it; move them along`);
    if (hits.some(takenOut))
      warnings.push(`the points at ${studsAt(gr.main)} have a branch taken out of them whose rails still run through them: their blades would hit those rails; take the branch out of the drawing, or put the points back`);
  };
  for (const gr of groups) {
    const sp = sol.splits[gr.main];
    // (a route of theirs that ends (or joins the next) before the points are done with it: its end connector on the blades)
    const left = sp.routes.map((r, n) => (sp.merge ? sp.spans[n][0] : routeLength(routes[r]) - sp.spans[n][1]));
    if (Math.min(...left) < 24) warnings.push(`a track ends in the points at ${studsAt(gr.main)}: carry it on past the frog`);
  }
  const built: SplitParts[] = [];
  for (const gr of groups) {
    const sp = sol.splits[gr.main], n = built.length;
    const [i, j] = sp.routes, j2 = gr.kids.length ? sol.splits[gr.kids[0]].routes[1] : -1;
    // the points' frame: at the split, looking the way the routes part
    const dirOf = (r: number) => (sp.merge ? reversedRoute(routes[r]) : routes[r]);
    const sa = sp.merge ? routeLength(routes[i]) - sp.spans[0][1] : sp.spans[0][0];
    const P = routePose(dirOf(i), sa);
    const frame = (rt: Route): Route => ({ ...rt, start: toFrame(P, rt.start) });
    const A = frame(subRoute(dirOf(i), sa, Math.min(routeLength(dirOf(i)), sa + LOCAL_LEN), 'A'));
    const kidRt = (r: number, id: string) => frame(subRoute(dirOf(r), 0, Math.min(routeLength(dirOf(r)), LOCAL_LEN), id));
    const B = kidRt(j, 'B'), C = j2 >= 0 ? kidRt(j2, 'C') : undefined;
    const all = C ? [A, B, C] : [A, B];
    const far = Math.min(...all.map((rt) => routePose(rt, routeLength(rt))[1]));
    const xAt = (rt: Route) => { let lo = 0, hi = routeLength(rt); for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (routePose(rt, m)[1] < far) lo = m; else hi = m; } return routePose(rt, lo)[0]; };
    // right to left; a three-way only with the main route between its branches
    const local = [...all].sort((a, b) => xAt(b) - xAt(a));
    const three = !!C && local[1] === A;
    if (C && !three) warnings.push('two branches leave one side of a route at the same point: not built as a three-way');
    const bRight = xAt(B) > xAt(A);
    const pair = bRight ? [B, A] : [A, B];
    const rts = three ? local : pair;
    // (the lever: as moved by hand, else the branch's own setting, else the options', else the main route's side)
    const ed = throwEdit([P[0], P[1]]);
    const ownR = ed?.side ?? routes[j].throwSide;
    const own = ownR && ownR !== 'auto' ? ownR : p.throwSide;
    const tside = own === 'left' ? -1 : own === 'right' ? 1 : three ? 1 : bRight ? -1 : 1;
    const over = { ...(ed?.leverOffset !== undefined && { leverOffset: ed.leverOffset }), ...(ed?.springLength !== undefined && { springLength: ed.springLength }) };
    const spec = (o: typeof over): SetSpec => (three ? [0, 2, 2 + toeShift([P[0], P[1]]), tside, 1, o] : [0, 1, 2 + toeShift([P[0], P[1]]), tside, undefined, o]);
    // (the other track near the points, in their frame; with two branches one side not built as a three-way, the other branch too)
    const foreign = [...nearby(gr), ...(C && !three ? [j2] : [])].map((r) => ({ ...routes[r], start: toFrame(P, routes[r].start) }));
    let used = spec(over), plan = switchPlan(rts, [used], p, 1, foreign);
    // (the lever on a stud of the design's grid, unless moved by hand)
    if (gridLevers && !(ed?.leverOffset !== undefined && ed?.springLength !== undefined)) {
      const g2 = gridLever(P, plan.sets[0], ed ?? {});
      if (g2.leverOffset !== undefined) { used = spec(g2); plan = switchPlan(rts, [used], p, 1, foreign); }
    }
    throughWarnings(gr, !!plan.sets[0].fdb?.some((f) => f.blocked));
    warnings.push(...plan.warnings.filter((w) => !/print bed/.test(w)), ...plan.notes.filter((w) => !warnings.includes(w)));
    const gm = switchGeometry(s, plan), mech = gm.mech(0);
    // which design route (and which way round) each frame route is
    const worldOf = (rt: Route) => (rt === A ? i : rt === B ? j : j2);
    const moving: NetworkPart[] = [];
    const tag = `points${groups.length > 1 ? n + 1 : ''}`;
    const pts = gm.pointsParts(0);
    const turns = gm.pointsTurns(0), cz = Math.cos((P[2] * Math.PI) / 180), sz = Math.sin((P[2] * Math.PI) / 180);
    pts.forEach((m, k) => moving.push({ name: `${tag}${pts.length > 1 ? (k === 0 ? '-a' : '-b') : ''}`, color: 0x4682b4, local: m, world: place(m, P),
      ...(turns?.[k] && { turn: { at: [P[0] + turns[k].at[0] * cz - turns[k].at[1] * sz, P[1] + turns[k].at[0] * sz + turns[k].at[1] * cz] as [number, number], by: turns[k].by, swing: turns[k].swing } }) }));
    gm.holdParts(0).forEach((m, k) => moving.push({ name: `${tag}-holddown-${k === 0 ? 'a' : 'b'}`, color: 0x4682b4, local: gm.holdPrint(m), world: place(m, P) }));
    // (Peco's spring: printed flat and straight, as assembled squeezed between its pins)
    const spr = gm.springPart(0), sprP = gm.springPrint(0);
    if (spr && sprP) moving.push({ name: `${tag}-spring`, color: 0xc0392b, local: sprP, world: place(spr, P) });
    const thr = gm.throwPart(0);
    moving.push({ name: `${tag}-throw`, color: 0xe8892b, local: gm.throwPrint(0), world: place(thr, P) });
    moving.push({ name: `${tag}-lever`, color: 0xd4af37, local: gm.leverPrint(0), world: place(gm.leverPart(0), P) });
    if (p.throwModule) { const br = gm.bracketPart(0); moving.push({ name: `${tag}-bracket`, color: 0x8a8f99, local: br, world: place(br, P) }); }
    const end = sp.merge ? 'end' : 'start';
    built.push({
      key: JSON.stringify({ rts, used, p, P, routes: [i, j, j2], end, n, of: groups.length }),
      toe: [P[0], P[1]], frame: P, set: plan.sets[0], src: gr.main,
      adds: [place(mech.bed, P), place(mech.arm, P), ...mech.steps.map((m) => place(m, P))], cuts: [place(mech.pockets, P), place(mech.channel, P)],
      ...(mech.stepRect && { stepRect: mech.stepRect }),
      stock: place(mech.stockCut, P),
      bladeCuts: mech.bladeRails.map(([rt, cut]) => [worldOf(rt), place(cut, P)] as [number, Man]),
      inner: [`${j}:${end}`, ...(j2 >= 0 ? [`${j2}:${end}`] : [])],
      moving,
    });
  }
  return { splits: built, warnings };
}

/** The piece's body with the given splits' points built in (routes and splits by the same route indices). */
export function networkBody(s: Scad, routes: Route[], sol: Solution, copt: CrossingOptions, splits: SplitParts[], grips?: [number, number][],
  more: { cuts?: Man[]; innerEnds?: Set<string>; gridPose?: Pose; bedAt?: { p: [number, number]; d: [number, number]; len?: number }[] } = {}) {
  const railCuts = new Map<number, Man[]>(), innerEnds = new Set<string>(more.innerEnds), adds: Man[] = [], cuts: Man[] = [];
  const addCut = (i: number, m: Man) => { if (!railCuts.has(i)) railCuts.set(i, []); railCuts.get(i)!.push(m); };
  for (const sp of splits) {
    adds.push(...sp.adds); cuts.push(...sp.cuts);
    for (let k = 0; k < routes.length; k++) addCut(k, sp.stock);
    for (const [i, cut] of sp.bladeCuts) addCut(i, cut);
    for (const e of sp.inner) innerEnds.add(e);
  }
  // (a broken solid would empty the whole piece it meets: leave any out)
  const ok = (m: Man) => m.status() === 'NoError';
  for (const [i, ms] of railCuts) railCuts.set(i, ms.filter(ok));
  // (the throw arms hollow underneath with tubes, like the bed: out to the stud line past the lever)
  const hollows = splits.map((sp) => {
    const v = sp.set, xEnd = v.leverX + v.throwDir * 10, xOut = v.throwDir * Math.ceil((v.throwDir * xEnd) / 8 - 1e-6) * 8, hw = 12;
    return { P: sp.frame, r: [Math.min(v.throwStockX, xOut), Math.max(v.throwStockX, xOut), v.throwY - hw, v.throwY + hw] as [number, number, number, number] };
  });
  // (and the steps round them, on ballast)
  for (const sp of splits) if (sp.stepRect) hollows.push({ P: sp.frame, r: sp.stepRect });
  return crossingPiece(s, routes, copt, sol, grips, { railCuts, innerEnds, adds: adds.filter(ok), cuts: [...cuts, ...(more.cuts ?? [])].filter(ok), gridPose: more.gridPose, hollows, bedAt: more.bedAt });
}

export function networkPiece(s: Scad, routes: Route[], sol: Solution, p: BaseParams, copt: CrossingOptions, grips?: [number, number][],
  toeShift: (at: [number, number]) => number = () => 0, extraCuts: Man[] = []) {
  const { splits, warnings } = networkSplits(s, routes, sol, p, toeShift);
  const body = networkBody(s, routes, sol, copt, splits, grips, { cuts: extraCuts });
  return { body, moving: splits.flatMap((sp) => sp.moving), warnings };
}
