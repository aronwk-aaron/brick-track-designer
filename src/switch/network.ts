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
import { type BaseParams, switchGeometry, switchPlan } from './base';
import { subRoute, toFrame } from './pieces';

export interface NetworkPart { name: string; color: number; local: Man; world: Man }

const LOCAL_LEN = 400; // (how much of each route the points' frame looks at)

export function networkPiece(s: Scad, routes: Route[], sol: Solution, p: BaseParams, copt: CrossingOptions, grips?: [number, number][]) {
  const warnings: string[] = [];
  const railCuts = new Map<number, Man[]>(), innerEnds = new Set<string>(), adds: Man[] = [], cuts: Man[] = [];
  const moving: NetworkPart[] = [];
  const place = (m: Man, P: Pose) => T(R(m, [0, 0, P[2]]), [P[0], P[1], 0]);
  const addCut = (i: number, m: Man) => { if (!railCuts.has(i)) railCuts.set(i, []); railCuts.get(i)!.push(m); };
  sol.splits.forEach((sp, n) => {
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
    // (the lever: the branch's own setting, else the options', else the main route's side)
    const own = routes[j].throwSide && routes[j].throwSide !== 'auto' ? routes[j].throwSide : p.throwSide;
    const tside = own === 'left' ? -1 : own === 'right' ? 1 : bRight ? -1 : 1;
    const plan = switchPlan(local, [[0, 1, 2, tside]], p);
    warnings.push(...plan.warnings.filter((w) => !/print bed/.test(w)));
    const gm = switchGeometry(s, plan), mech = gm.mech(0);
    // which design route (and which way round) each frame route is
    const worldOf = (rt: Route) => (rt === local[0] ? (bRight ? j : i) : bRight ? i : j);
    adds.push(place(mech.bed, P), place(mech.arm, P));
    cuts.push(place(mech.pockets, P), place(mech.channel, P));
    const stock = place(mech.stockCut, P);
    for (let k = 0; k < routes.length; k++) addCut(k, stock);
    for (const [rt, cut] of mech.bladeRails) addCut(worldOf(rt), place(cut, P));
    innerEnds.add(sp.merge ? `${j}:end` : `${j}:start`);
    const tag = sol.splits.length > 1 ? `points${n + 1}` : 'points';
    const pp = gm.pointsParts(0);
    pp.forEach((m, k) => moving.push({ name: `${tag}${pp.length > 1 ? (k === 0 ? '-a' : '-b') : ''}`, color: 0x4682b4, local: m, world: place(m, P) }));
    const thr = gm.throwPart(0);
    moving.push({ name: `${tag}-throw`, color: 0xe8892b, local: thr, world: place(thr, P) });
    moving.push({ name: `${tag}-lever`, color: 0xd4af37, local: gm.leverPrint(), world: place(gm.leverPart(0), P) });
  });
  const body = crossingPiece(s, routes, copt, sol, grips, { railCuts, innerEnds, adds, cuts });
  return { body, moving, warnings };
}
