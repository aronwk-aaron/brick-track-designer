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
import { routeLength, routePose } from '../route/route';
import type { Solution } from '../route/solver';
import { reversedRoute } from './reverse';
import { type BaseParams, switchGeometry, switchPlan, type SwitchPlan } from './base';
import { gridLever, subRoute, type ThrowEdit, toFrame } from './pieces';

export interface NetworkPart { name: string; color: number; local: Man; world: Man }

const LOCAL_LEN = 400; // (how much of each route the points' frame looks at)

/** One split's points, in the design's frame: what it adds to and cuts from the piece, and its moving parts. */
export interface SplitParts {
  toe: [number, number];
  /** the points' frame (at the split, heading the way the routes part), and its set's values in it (where the lever is) */
  frame: Pose; set: SwitchPlan['sets'][number];
  adds: Man[]; cuts: Man[];
  /** cut from every route's rails (the planed stock feet) */
  stock: Man;
  /** cut from one route's rails (by route index): the rails the blades replace */
  bladeCuts: [number, Man][];
  /** the route end that starts (or ends) at the points: no connector there */
  inner: string;
  moving: NetworkPart[];
}

/** Each split's points (see SplitParts). */
export function networkSplits(s: Scad, routes: Route[], sol: Solution, p: BaseParams, toeShift: (at: [number, number]) => number = () => 0,
  throwEdit: (at: [number, number]) => ThrowEdit | undefined = () => undefined, gridLevers = false) {
  const warnings: string[] = [];
  const place = (m: Man, P: Pose) => T(R(m, [0, 0, P[2]]), [P[0], P[1], 0]);
  const splits = sol.splits.map((sp, n): SplitParts => {
    const [i, j] = sp.routes;
    // the points' frame: at the split, looking the way the routes part
    const parentDir = sp.merge ? reversedRoute(routes[i]) : routes[i];
    const childDir = sp.merge ? reversedRoute(routes[j]) : routes[j];
    const sa = sp.merge ? routeLength(routes[i]) - sp.spans[0][1] : sp.spans[0][0];
    const P = routePose(parentDir, sa);
    const frame = (rt: Route): Route => ({ ...rt, start: toFrame(P, rt.start) });
    const A = frame(subRoute(parentDir, sa, Math.min(routeLength(parentDir), sa + LOCAL_LEN), 'A'));
    const B = frame(subRoute(childDir, 0, Math.min(routeLength(childDir), LOCAL_LEN), 'B'));
    const far = Math.min(routePose(A, routeLength(A))[1], routePose(B, routeLength(B))[1]);
    const xAt = (rt: Route) => { let lo = 0, hi = routeLength(rt); for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (routePose(rt, m)[1] < far) lo = m; else hi = m; } return routePose(rt, lo)[0]; };
    const bRight = xAt(B) > xAt(A);
    const local = bRight ? [B, A] : [A, B];
    // (the lever: as moved by hand, else the branch's own setting, else the options', else the main route's side)
    const ed = throwEdit([P[0], P[1]]);
    const ownR = ed?.side ?? routes[j].throwSide;
    const own = ownR && ownR !== 'auto' ? ownR : p.throwSide;
    const tside = own === 'left' ? -1 : own === 'right' ? 1 : bRight ? -1 : 1;
    const over = { ...(ed?.leverOffset !== undefined && { leverOffset: ed.leverOffset }), ...(ed?.springLength !== undefined && { springLength: ed.springLength }) };
    let plan = switchPlan(local, [[0, 1, 2 + toeShift([P[0], P[1]]), tside, undefined, over]], p);
    // (the lever on a stud of the design's grid, unless moved by hand)
    if (gridLevers && !(ed?.leverOffset !== undefined && ed?.springLength !== undefined)) {
      const g2 = gridLever(P, plan.sets[0], ed ?? {});
      if (g2.leverOffset !== undefined) plan = switchPlan(local, [[0, 1, 2 + toeShift([P[0], P[1]]), tside, undefined, g2]], p);
    }
    warnings.push(...plan.warnings.filter((w) => !/print bed/.test(w)));
    const gm = switchGeometry(s, plan), mech = gm.mech(0);
    // which design route (and which way round) each frame route is
    const worldOf = (rt: Route) => (rt === local[0] ? (bRight ? j : i) : bRight ? i : j);
    const moving: NetworkPart[] = [];
    const tag = sol.splits.length > 1 ? `points${n + 1}` : 'points';
    const pp = gm.pointsParts(0);
    pp.forEach((m, k) => moving.push({ name: `${tag}${pp.length > 1 ? (k === 0 ? '-a' : '-b') : ''}`, color: 0x4682b4, local: m, world: place(m, P) }));
    const thr = gm.throwPart(0);
    moving.push({ name: `${tag}-throw`, color: 0xe8892b, local: gm.throwPrint(0), world: place(thr, P) });
    moving.push({ name: `${tag}-lever`, color: 0xd4af37, local: gm.leverPrint(), world: place(gm.leverPart(0), P) });
    if (p.throwModule) { const br = gm.bracketPart(0); moving.push({ name: `${tag}-bracket`, color: 0x8a8f99, local: br, world: place(br, P) }); }
    return {
      toe: [P[0], P[1]], frame: P, set: plan.sets[0],
      adds: [place(mech.bed, P), place(mech.arm, P)], cuts: [place(mech.pockets, P), place(mech.channel, P)],
      stock: place(mech.stockCut, P),
      bladeCuts: mech.bladeRails.map(([rt, cut]) => [worldOf(rt), place(cut, P)] as [number, Man]),
      inner: sp.merge ? `${j}:end` : `${j}:start`,
      moving,
    };
  });
  return { splits, warnings };
}

/** The piece's body with the given splits' points built in (routes and splits by the same route indices). */
export function networkBody(s: Scad, routes: Route[], sol: Solution, copt: CrossingOptions, splits: SplitParts[], grips?: [number, number][],
  more: { cuts?: Man[]; innerEnds?: Set<string>; gridPose?: Pose } = {}) {
  const railCuts = new Map<number, Man[]>(), innerEnds = new Set<string>(more.innerEnds), adds: Man[] = [], cuts: Man[] = [];
  const addCut = (i: number, m: Man) => { if (!railCuts.has(i)) railCuts.set(i, []); railCuts.get(i)!.push(m); };
  for (const sp of splits) {
    adds.push(...sp.adds); cuts.push(...sp.cuts);
    for (let k = 0; k < routes.length; k++) addCut(k, sp.stock);
    for (const [i, cut] of sp.bladeCuts) addCut(i, cut);
    innerEnds.add(sp.inner);
  }
  // (a broken solid would empty the whole piece it meets: leave any out)
  const ok = (m: Man) => m.status() === 'NoError';
  for (const [i, ms] of railCuts) railCuts.set(i, ms.filter(ok));
  // (the throw arms hollow underneath with tubes, like the bed: out to the stud line past the lever)
  const hollows = splits.map((sp) => {
    const v = sp.set, xEnd = v.leverX + v.throwDir * 10, xOut = v.throwDir * Math.ceil((v.throwDir * xEnd) / 8 - 1e-6) * 8, hw = 12;
    return { P: sp.frame, r: [Math.min(v.throwStockX, xOut), Math.max(v.throwStockX, xOut), v.throwY - hw, v.throwY + hw] as [number, number, number, number] };
  });
  return crossingPiece(s, routes, copt, sol, grips, { railCuts, innerEnds, adds: adds.filter(ok), cuts: [...cuts, ...(more.cuts ?? [])].filter(ok), gridPose: more.gridPose, hollows });
}

export function networkPiece(s: Scad, routes: Route[], sol: Solution, p: BaseParams, copt: CrossingOptions, grips?: [number, number][],
  toeShift: (at: [number, number]) => number = () => 0, extraCuts: Man[] = []) {
  const { splits, warnings } = networkSplits(s, routes, sol, p, toeShift);
  const body = networkBody(s, routes, sol, copt, splits, grips, { cuts: extraCuts });
  return { body, moving: splits.flatMap((sp) => sp.moving), warnings };
}
