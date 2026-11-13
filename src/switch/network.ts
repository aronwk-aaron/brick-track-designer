// A whole track network as one piece, with points built in wherever routes
// split or merge: the fixed trackwork (geom/crossing.ts: rails, frogs,
// check rails, bed, ends, underside) plus, at each split, one points set's
// machinery (switch/base.ts, worked out in the split's own frame): the raised
// bed with its pockets, the blades in place of the rails they replace, the
// planed stock feet, the throw arm and its channel; and the moving parts.
// This is how switches that cross other track or each other (a crossover)
// come out as one piece.
import { type CrossingOptions, crossingPiece } from '../geom/crossing';
import { segDist } from '../geom/pathsplit';
import { R, T, type Man, type Scad } from '../geom/scad';
import type { Pose, Pt, Route } from '../route/route';
import { poseToWorld, railOffsetOf, railPoint, routeLat, routeLength, routePose, routeSOf, worldToPose } from '../route/route';
import type { Solution } from '../route/solver';
import { reversedRoute } from './reverse';
import { type BaseParams, fdbFootprint, type SetOver, type SetSpec, switchGeometry, switchPlan, type SwitchPlan, thirdRailAt } from './base';
import { bladeEdit, gridLever, sharedLead, subRoute, type ThrowEdit, toFrame, twoLevers } from './pieces';
import { gridIn, sprungOnGrid, switchGlobals } from './context';

export interface NetworkPart { name: string; color: number; local: Man; world: Man; turn?: { at: [number, number]; by: number; swing?: number; tilt?: [[number, number], [number, number]] };
  /** (a slider; a lever) how it moves from as assembled to its other end: build.ts Piece */
  slide?: Slide; hinge?: Hinge }
export interface Slide { dir: [number, number]; by: number }
export interface Hinge { at: [number, number, number]; axis: [number, number]; by: number }
/** How a points set's throw moves (base.ts throwMove), in the design: its slider's slide, its lever's hinge; its frame P. */
export function throwMoves(mv: { slide: number; lever?: { at: [number, number, number]; turn: number } }, P: Pose): { slide: Slide; hinge?: Hinge } {
  const a = (P[2] * Math.PI) / 180, at = mv.lever && poseToWorld(P, [mv.lever.at[0], mv.lever.at[1]]);
  return { slide: { dir: [Math.cos(a), Math.sin(a)], by: mv.slide }, ...(mv.lever && at && { hinge: { at: [at[0], at[1], mv.lever.at[2]], axis: [-Math.sin(a), Math.cos(a)], by: mv.lever.turn } }) };
}

const LOCAL_LEN = 400; // (how much of each route the points' frame looks at)

/** One split's points, in the design's frame: what it adds to and cuts from the piece, and its moving parts. */
export interface SplitParts {
  /** all it's made from (the routes near it, its set, the parameters), as a key for what's built from it */
  key: string;
  toe: [number, number];
  /** the points' frame (at the split, heading the way the routes part), and its set's values in it (where the lever is) */
  frame: Pose; set: SwitchPlan['sets'][number];
  adds: Man[]; cuts: Man[];
  /** (sprung blades on track alone) added after the underside's cut: what the slider rests on over the hollow */
  rests?: Man;
  /** (the lever in a housing at a corner) the arm there and the run out to it, as rectangles [x0, x1, y0, y1] in the frame: hollow underneath */
  armRects?: [number, number, number, number][];
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
  /** (its arm under other track) where that track's studs stand on the arm, in the design's frame */
  studsOn?: (q: [number, number]) => boolean;
  moving: NetworkPart[];
}

/** Each split's points (see SplitParts). Two branches leaving a route at
 * the same point, one each side, make one true three-way (its other splits,
 * the branches' from each other, are part of it). planOnly: only where
 * their levers are (levers), for the plan; none of the parts built. */
export function networkSplits(s: Scad, routes: Route[], sol: Solution, p: BaseParams, toeShift: (at: [number, number]) => number = () => 0,
  throwEdit: (at: [number, number]) => ThrowEdit | undefined = () => undefined, gridLevers = false, planOnly = false) {
  const warnings: string[] = [];
  const place = (m: Man, P: Pose) => T(R(m, [0, 0, P[2]]), [P[0], P[1], 0]);
  // ---- which splits make a three-way ----
  const toeOf = (sp: Solution['splits'][number]) => { const s0 = sp.merge ? sp.spans[0][1] : sp.spans[0][0], q = routePose(routes[sp.routes[0]], s0); return [q[0], q[1]] as [number, number]; };
  const near = (a: [number, number], b: [number, number], within = 1) => Math.hypot(a[0] - b[0], a[1] - b[1]) < within;
  // (the underside on the design's stud grid (the first route's start), but lined up with the track, track alone: each
  // set planned with it in its frame, so the sprung slider's throw line is on the grid and what it rests on keeps clear
  // of the baseplate's studs; sets at an angle to the grid, rigid blades (sprungOnGrid))
  const gw = routes.length && (p.generateBallast || p.undersideGrid !== 'track') ? routePose(routes[0], 0) : undefined;
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
  const G0 = ((p.gaugeStuds + 1) * 8) / 2, G = G0;
  const through = (k: number, rt: Route) => {
    const sp = sol.splits[k], A = routes[sp.routes[0]], [s0, s1] = sp.spans[0], lo = s0 + (sp.merge ? 0 : 4), hi = s1 - (sp.merge ? 4 : 0), G = railOffsetOf(A, G0), Gr = railOffsetOf(rt, G0);
    const a0 = routePose(A, lo), a1 = routePose(A, hi), box = [Math.min(a0[0], a1[0]) - 2 * G, Math.min(a0[1], a1[1]) - 2 * G, Math.max(a0[0], a1[0]) + 2 * G, Math.max(a0[1], a1[1]) + 2 * G];
    return [-Gr, Gr].some((o) => {
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
  /** Half a LEGO train's width (6 studs) past its track's centre line, and a little room: what a lever keeps clear of (mm). */
  const TRAIN_HW = 26;
  /** The levers' arms placed so far (in the design's frame, from the stock rail out past the lever): another lever's
   * arm, 3 studs wide, kept clear of (with a little room). */
  const arms: [[number, number], [number, number]][] = [];
  const ARM_GAP = 12 + 12 + 4;
  const armOf = (pl: SwitchPlan, P: Pose): [[number, number], [number, number]] => {
    const d = pl.setData[0], h = (P[2] * Math.PI) / 180, w2 = (x: number): [number, number] => [P[0] + x * Math.cos(h) - d.leverY * Math.sin(h), P[1] + x * Math.sin(h) + d.leverY * Math.cos(h)];
    return [w2(d.armX0), w2(d.armX1)];
  };
  const segGap = (a: [[number, number], [number, number]], b: [[number, number], [number, number]]) => {
    const cross = (p: [number, number], q: [number, number], r: [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    if (Math.sign(cross(a[0], a[1], b[0])) !== Math.sign(cross(a[0], a[1], b[1])) && Math.sign(cross(b[0], b[1], a[0])) !== Math.sign(cross(b[0], b[1], a[1]))) return 0;
    return Math.min(segDist(a[0], b[0], b[1]), segDist(a[1], b[0], b[1]), segDist(b[0], a[0], a[1]), segDist(b[1], a[0], a[1]));
  };
  /** Whether a points set's lever (standing up past the rails, its knob some 8 across) is where a train on other track (foreign, in the points' frame) would hit it, or its arm too near another's. The arm under it is low, as sleepers are: trains pass over that. */
  const inWay = (pl: SwitchPlan, foreign: Route[], P: Pose, sleepers = false): 'train' | 'lever' | undefined => {
    const d = pl.setData[0], lever: [number, number] = [d.leverX, d.leverY], arm = armOf(pl, P);
    if (foreign.some((rt) => {
      for (let t = 0; t <= routeLength(rt); t += 2) {
        const q = routePose(rt, t);
        if (Math.hypot(q[0] - lever[0], q[1] - lever[1]) < TRAIN_HW + 8) return true;
      }
      return false;
    })) return 'train';
    // (nor its housing on other track's sleepers: a yard's slips, their diagonal's ends midway between two tracks 16
    // apart. Its ballast is fine to stand on, as long as its sleepers are kept clear. Then it goes further out
    // (placeLever), its slider under that track to a lever past it, or beside its throw bar)
    // (not another gauge's track: dual gauge track shares its sleepers, and the lever stands on them as on its own)
    // (only for a lever whose housing was set at a corner by hand (leverAt): elsewhere as before)
    const sl = (2 * G + 24) / 2 + 1, xo = d.throwDir * Math.ceil((d.throwDir * (d.leverX + d.throwDir * 10)) / 8 - 1e-6) * 8;
    if (sleepers) for (let k = 0; k <= 8; k++) for (const y of [d.leverY - 12, d.leverY, d.leverY + 12])
      for (const x of [d.leverX - d.throwDir * 12 + ((xo - d.leverX + d.throwDir * 12) * k) / 8])
      if (foreign.some((rt) => { if ((rt.gauge ?? 0) !== (pl.routes[0].gauge ?? 0)) return false; const sq = routeSOf(rt, [x, y]); return sq > 0 && sq < routeLength(rt) && Math.abs(routeLat(rt, [x, y])) < sl; })) return 'train';
    return arms.some((q) => segGap(q, arm) < ARM_GAP) ? 'lever' : undefined;
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
  /** blocked: whether the points' blades are crossed (worked out with them); undefined: not worked out (a three-way's on tines): any rail between the stock rails is said. */
  const throughWarnings = (gr: { main: number; kids: number[] }, blocked: boolean | undefined) => {
    const sp = sol.splits[gr.main], mine = new Set([gr.main, ...gr.kids].flatMap((k) => sol.splits[k].routes));
    const hits = routes.flatMap((rt, r) => (!mine.has(r) && through(gr.main, rt) ? [r] : []));
    if (blocked === false) return;
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
    // (which, and by how much: 3 studs of track past the points, for its end connector)
    const short = sp.routes.flatMap((r, n) => (left[n] < 24 ? [`${routes[r].id.replace(/~\d+$/, '')} by ${Math.ceil((24 - left[n]) / 8 - 1e-6)} stud${Math.ceil((24 - left[n]) / 8 - 1e-6) === 1 ? '' : 's'}`] : []));
    if (short.length) warnings.push(`a track ends in the points at ${studsAt(gr.main)}: carry it on past the frog: lengthen ${short.join(', ')}`);
  }
  // (each points set planned first; then the levers placed, the most hemmed in first, so one with few clear spots isn't
  // left with none by its neighbours; then built in the design's order)
  // (a three-way with a lever to each blade (threeWayLevers 2): planned and built as two sets at the one toe, each one
  // blade's with its own slider and lever on its own side; blade: which, else undefined)
  const prepOf = (gr: (typeof groups)[number], blade: 0 | 1 | undefined) => {
    const sp = sol.splits[gr.main];
    const [i, j] = sp.routes, j2 = gr.kids.length ? sol.splits[gr.kids[0]].routes[1] : -1;
    // the points' frame: at the split, looking the way the routes part
    const dirOf = (r: number) => (sp.merge ? reversedRoute(routes[r]) : routes[r]);
    const sa = sp.merge ? routeLength(routes[i]) - sp.spans[0][1] : sp.spans[0][0];
    const P = routePose(dirOf(i), sa);
    const frame = (rt: Route): Route => ({ ...rt, start: toFrame(P, rt.start) });
    const A = frame(subRoute(dirOf(i), sa, Math.min(routeLength(dirOf(i)), sa + LOCAL_LEN), 'A'));
    const kidRt = (r: number, id: string) => frame(subRoute(dirOf(r), 0, Math.min(routeLength(dirOf(r)), LOCAL_LEN), id));
    const B = kidRt(j, 'B'), C = j2 >= 0 ? kidRt(j2, 'C') : undefined;
    // (a branch drawn running along the route first (a double slip's slip road): the points where it leaves)
    const lead = sharedLead(A, B);
    const all = C ? [A, B, C] : [A, B];
    const far = Math.min(...all.map((rt) => routePose(rt, routeLength(rt))[1]));
    const xAt = (rt: Route) => { let lo = 0, hi = routeLength(rt); for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (routePose(rt, m)[1] < far) lo = m; else hi = m; } return routePose(rt, lo)[0]; };
    // right to left; a three-way only with the main route between its branches
    const local = [...all].sort((a, b) => xAt(b) - xAt(a));
    const three = !!C && local[1] === A;
    if (C && !three && blade === undefined) warnings.push('two branches leave one side of a route at the same point: not built as a three-way');
    const bRight = xAt(B) > xAt(A);
    const pair = bRight ? [B, A] : [A, B];
    const rts = three ? local : pair;
    // (the lever: as moved by hand, else the branch's own setting, else the options', else the main route's side)
    const ed = bladeEdit(throwEdit([P[0], P[1]]), blade);
    const ownR = ed?.side ?? (ed?.awayFrom ? (worldToPose(P, ed.awayFrom)[0] > 0 ? 'left' : 'right') : undefined) ?? routes[j].throwSide;
    const own0 = ownR && ownR !== 'auto' ? ownR : p.throwSide;
    if (blade !== undefined && !three) return undefined;
    const own = blade === undefined ? own0 : blade === 0 ? 'left' : 'right';
    const tside = own === 'left' ? -1 : own === 'right' ? 1 : three ? 1 : bRight ? -1 : 1;
    const over: SetOver = { ...(ed?.leverOffset !== undefined && { leverOffset: ed.leverOffset }), ...(ed?.springLength !== undefined && { springLength: ed.springLength }), ...(ed?.single && { single: ed.single }), ...(ed?.heel && { heelShift: ed.heel }), ...(ed?.throwShift && { throwShift: ed.throwShift }), ...(ed?.leverAt !== undefined && { leverAt: ed.leverAt * 8 }) };
    const specOf = (o: SetOver, ts: number): SetSpec => (three ? [0, 2, 2 + toeShift([P[0], P[1]]), ts, 1, o, blade] : [0, 1, 2 + lead + toeShift([P[0], P[1]]), ts, undefined, o]);
    const spec = (o: SetOver) => specOf(o, tside);
    // (the other track near the points, in their frame; with two branches one side not built as a three-way, the other branch too)
    const foreign = [...nearby(gr), ...(C && !three ? [j2] : [])].map((r) => ({ ...routes[r], start: toFrame(P, routes[r].start) }));
    const used = spec(over);
    const blockedOf = (pl: SwitchPlan) => (pl.p.mechStyle === 'plates' ? !!pl.sets[0].fdb?.some((f, b) => f.blocked && b !== pl.sets[0].fixed) : three ? undefined : pl.sets[0].crossBlocked);
    // (a double slip's points: other track's rails cross the blades' plates near the heels. Under the bed, on tines,
    // nothing of the points is on the bed but the blades, notched where those rails cross them)
    // (only where the track across them doesn't leave this very route at other points just before, facing the same
    // way: a tandem's first branch over its second points is a warning, as before)
    const tandem = nearby(gr).some((r) => sol.splits.some((o) => o.routes.includes(r) && o.routes.includes(i) && !!o.merge === !!sp.merge && near(toeOf(o), toeOf(sp), 240)));
    // (the blades as chosen, else, where they don't fit: first rigid blades on top, where the chosen shape's plate, with
    // its spring's pocket and the pocket's walls, doesn't fit beside other track's rails running between its stock rails
    // or other points' plates (keep: fdbLayout): a double slip's, a tandem's, a slip's; then on tines; said, where, below)
    // (points on routes with a gauge of their own, mixed gauges: built at that gauge; under 4 studs, one moving blade,
    // as a narrow-gauge design's)
    const gsOwn = A.gauge !== undefined ? A.gauge / 8 - 1 : p.gaugeStuds;
    const p00 = gsOwn === p.gaugeStuds ? p : { ...p, gaugeStuds: gsOwn, ...(gsOwn < 4 && { pointBlades: 1 as const }) };
    // (expert, stage 5c: this set's own blade shape and moving blades, over the design's)
    // (and its own mechanism: tines under the bed or blades on top, over the design's; not a three-way's, whose levers go by the design's)
    const p1 = ed?.bladeStyle || ed?.blades || (ed?.mech && !C && ed.mech !== p00.mechStyle) ? { ...p00, ...(ed.mech && !C && { mechStyle: ed.mech }), ...(ed.bladeStyle && { bladeStyle: ed.bladeStyle }), ...(ed.blades && { pointBlades: ed.blades }) } : p00;
    // (thrown by hand, no lever: a nail switch, this set alone)
    const p0 = ed?.nail && !C ? { ...p1, throwNail: true, nailNoSpring: true } : p1;
    const pg = sprungOnGrid(gw ? { ...p0, grid: gridIn(P, gw) } : p0);
    const choose = (keep: Pt[][]) => {
      let pp = pg.p, plan = switchPlan(rts, [used], pp, 1, foreign, keep), how: 'rigid' | 'tines' | 'angled' | undefined = pg.angled ? 'angled' : undefined;
      // (and where a dual-gauge track's third rail runs between the stock rails: a sprung plate cut back clear of it has no
      // room for its spring's pocket and the lip over its front)
      const third = rts.some((rt) => thirdRailAt(rt, plan.sets[0].sHeel, pg.p.gaugeStuds) !== undefined);
      if (pg.p.mechStyle === 'plates' && !three && (blockedOf(plan) || third) && pg.p.bladeStyle && pg.p.bladeStyle !== 'simple') {
        const p1 = { ...pg.p, bladeStyle: 'simple' as const }, plan1 = switchPlan(rts, [used], p1, 1, foreign, keep);
        if (blockedOf(plan1) === false || (third && !blockedOf(plan1))) { pp = p1; plan = plan1; how = 'rigid'; }
      }
      if (pg.p.mechStyle === 'plates' && !three && !tandem && blockedOf(plan)) {
        const p2 = { ...pg.p, mechStyle: 'tines' as const }, plan2 = switchPlan(rts, [used], p2, 1, foreign, keep);
        if (blockedOf(plan2) === false) { pp = p2; plan = plan2; how = 'tines'; }
      }
      return { pp, plan, how };
    };
    const c0 = choose([]);
    return { gr, blade, sp, i, j, j2, P, A, B, rts, three, own, ed, foreign, blockedOf, specOf, choose, keep: [] as Pt[][], how: c0.how, gm: undefined as { plan: SwitchPlan; gm: ReturnType<typeof switchGeometry> } | undefined, alone: !blockedOf(c0.plan), st: { tside, over, used, plan: c0.plan, pp: c0.pp } };
  };
  const preps = groups.flatMap((gr) => {
    const halves = twoLevers(p) && gr.kids.length ? [prepOf(gr, 0), prepOf(gr, 1)] : [];
    return halves[0] && halves[1] ? [halves[0], halves[1]] : [prepOf(gr, undefined)!];
  });
  // (blades on plates: neighbouring points' plates (a slip's, the next set's) clear of each other wherever each is between
  // closed and open, with their lips on the bed. Each set's plates as first planned, turned over their swing (fdbFootprint):
  // where two sets' meet, the room shared out, each keeping what's nearer its own blades' rails than the other's; the
  // other's share, a keep-out for its plates (fdbLayout cuts them clear by the clearance, moves the pin and the post,
  // or says it can't). Both planned against the other's first outline, so neither is left the less for going second;
  // that grown by 1, for a plate whose pin moves (it turns about another point))
  if (fdb || preps.some((q) => q.st.pp.mechStyle === 'plates')) {
    const W = s.w, c = p.pointClearance, foot = preps.map((q) => {
      if (q.st.pp.mechStyle !== 'plates') return undefined;
      const f = fdbFootprint(q.st.plan), wd = (r: Pt[]) => r.map((pt) => poseToWorld(q.P, pt) as [number, number]);
      if (!f.plates.length) return undefined;
      const area = W.CrossSection.union(f.plates.map((r) => s.polygon(wd(r))));
      // (each rail a thin strip along it)
      const strip = (r: Pt[]) => {
        const q = wd(r), nrm = q.map((_, k) => { const a = q[Math.max(0, k - 1)], e = q[Math.min(q.length - 1, k + 1)], l = Math.hypot(e[0] - a[0], e[1] - a[1]); return [-(e[1] - a[1]) / l * 0.1, (e[0] - a[0]) / l * 0.1]; });
        return s.polygon([...q.map((pt, k) => [pt[0] + nrm[k][0], pt[1] + nrm[k][1]] as [number, number]), ...q.map((pt, k) => [pt[0] - nrm[k][0], pt[1] - nrm[k][1]] as [number, number]).reverse()]);
      };
      return { area, rails: W.CrossSection.union(f.rails.map(strip)) };
    });
    const keeps = preps.map(() => [] as ReturnType<typeof W.CrossSection.union>[]);
    for (let a = 0; a < preps.length; a++) for (let b = a + 1; b < preps.length; b++) {
      const fa = foot[a], fb = foot[b];
      // (a three-way's two blades, a lever each: one set's plates, laid out together)
      if (!fa || !fb || preps[a].gr === preps[b].gr) continue;
      const x = fa.area.offset(c + 0.2, 'Round', 2, 24).intersect(fb.area.offset(c + 0.2, 'Round', 2, 24));
      if (x.area() < 1e-3) continue;
      // (nearer a's rails than b's: grown together, a step at a time)
      const nearA = W.CrossSection.union(Array.from({ length: 60 }, (_, k) => fa.rails.offset(0.5 * (k + 1), 'Round', 2, 24).subtract(fb.rails.offset(0.5 * (k + 1), 'Round', 2, 24))));
      keeps[a].push(fb.area.offset(1, 'Round', 2, 24).subtract(nearA).intersect(fa.area.offset(6, 'Round', 2, 24)));
      keeps[b].push(fa.area.offset(1, 'Round', 2, 24).intersect(nearA).intersect(fb.area.offset(6, 'Round', 2, 24)));
    }
    preps.forEach((q, k) => {
      const kk = W.CrossSection.union(keeps[k]);
      if (kk.area() < 1e-3) return;
      q.keep = (kk.toPolygons() as [number, number][][]).map((ring) => ring.map((pt) => worldToPose(q.P, pt)));
      const ch = q.choose(q.keep);
      q.st.plan = ch.plan; q.st.pp = ch.pp; q.how = ch.how;
    });
  }
  // (said once each, where)
  // (a note, not ringed on the plan as a problem: the places not in studsAt's words)
  const rigidAt = preps.filter((q) => q.how === 'rigid').map((q) => studsAt(q.gr.main).replace(' (studs)', ''));
  if (rigidAt.length) warnings.push(`some points' blades are rigid: the chosen shape's plate doesn't fit beside the other track's rails or the next points' blades there (the points at ${rigidAt.slice(0, 4).join('; ')}${rigidAt.length > 4 ? ' …' : ''}, in studs)`);
  const angledAt = preps.filter((q) => q.how === 'angled').map((q) => studsAt(q.gr.main).replace(' (studs)', ''));
  if (angledAt.length) warnings.push(`some points' sprung blades are on thinner plates (2.3 mm), their slider over the studs: at an angle to the baseplate grid it can't lie between them (the points at ${angledAt.slice(0, 4).join('; ')}${angledAt.length > 4 ? ' …' : ''}, in studs; Underside lined up with: The track itself keeps the full plates)`);
  if (preps.some((q) => q.how === 'tines')) warnings.push("a double slip's points are built on tines under the bed, the blades notched for the other track's flanges: blades on top don't fit between its rails");
  const crowded = preps.filter((q) => q.alone && q.keep.length && q.blockedOf(q.st.plan)).map((q) => studsAt(q.gr.main));
  if (crowded.length) warnings.push(`the points at ${crowded.slice(0, 4).join('; ')}${crowded.length > 4 ? ' …' : ''} have no room for their blades' plates beside the next points' blades: they'd hit; move them apart, or use 'tines' points`);
  /** How many places a points set's lever has clear of trains on other track (its side or the other, its slider moved along). */
  const room = (q: (typeof preps)[number]) => {
    const { own, rts, foreign, P, blockedOf, specOf, st, keep } = q;
    if (blockedOf(st.plan)) return Infinity;
    const sides = own === 'left' || own === 'right' ? [st.tside] : [st.tside, -st.tside], shifts = st.pp.mechStyle === 'plates' && q.ed?.throwShift === undefined ? [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5] : [0];
    let k = 0;
    for (const sh of shifts) for (const sd of sides) { const pl = switchPlan(rts, [specOf({ ...st.over, ...(sh && { throwShift: sh }) }, sd)], st.pp, 1, foreign, keep); if (!blockedOf(pl) && inWay(pl, foreign, P, q.ed?.leverAt !== undefined) !== 'train') k++; }
    return k;
  };
  const placeLever = (q: (typeof preps)[number]) => {
    const { gr, own, ed, rts, foreign, P, blockedOf, specOf, st, keep } = q;
    // (the lever and its arm clear of other track, where a train running on it would hit them: on the other side if
    // that's clear and the side wasn't set by hand; else said)
    // (or, with blades on top, the slider moved along a stud or two)
    // (or, where none of that clears, the lever further out, 1 to 10 studs, the nearest first: past the track beside it,
    // the slider under that track (base.ts: in two parts, with blades on top); not where the lever was moved by hand,
    // nor where the slider can't go under it)
    // (not for points already said to be blocked: moving their lever won't help them)
    const why0 = blockedOf(st.plan) ? undefined : inWay(st.plan, foreign, P, ed?.leverAt !== undefined);
    if (why0) {
      const sides = own === 'left' || own === 'right' ? [st.tside] : [st.tside, -st.tside], shifts = st.pp.mechStyle === 'plates' && ed?.throwShift === undefined ? [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5] : [0];
      const t0 = st.tside, base = st.over, out0 = base.leverOffset ?? st.pp.leverOffset;
      const outs = ed?.leverOffset !== undefined ? [0] : Array.from({ length: 11 }, (_, k) => k * 8);
      let found = false;
      // (a lever in a housing at a corner (leverAt) that's in the way there, where nothing clears it: beside its throw
      // bar instead, as without it (a yard's slips, end to end, their diagonal's ends between two tracks))
      const corners = base.leverAt !== undefined ? [true, false] : [true];
      for (const cn of corners) for (const ex of outs) for (const sh of shifts) for (const sd of sides) {
        if (found || (cn && ex === 0 && sh === 0 && sd === t0)) continue;
        const { leverAt: _la, ...rest } = base;
        const o2 = { ...(cn ? base : rest), ...(sh && { throwShift: sh }), ...(ex && { leverOffset: out0 + ex }) }, pl = switchPlan(rts, [specOf(o2, sd)], st.pp, 1, foreign, keep);
        if (ex && pl.sets[0].under && !pl.sets[0].underOk) continue;
        if (!blockedOf(pl) && !inWay(pl, foreign, P, ed?.leverAt !== undefined)) { st.tside = sd; st.over = o2; st.used = specOf(o2, sd); st.plan = pl; found = true; }
      }
      if (!found) {
        // (a three-way's two levers, one each side: its side isn't a choice)
        if (q.blade !== undefined) warnings.push(`the ${q.blade === 0 ? 'left' : 'right'} lever of the three-way at ${studsAt(gr.main)} is in the way of ${why0 === 'train' ? 'a train on another track' : 'another points\' lever'}: move the points, or set Three-way switches worked by to One lever`);
        else warnings.push(why0 === 'train' ? `the lever of the points at ${studsAt(gr.main)} is in the way of a train on another track: set its side on the route card, or move the points`
          : `the lever of the points at ${studsAt(gr.main)} is on another points' lever: set its side on the route card, or move the points`);
      }
    }
    // (the lever on a stud of the design's grid, unless moved by hand)
    if (gridLevers && !(ed?.leverOffset !== undefined && ed?.springLength !== undefined)) {
      const g2 = gridLever(P, st.plan.sets[0], ed ?? {});
      if (g2.leverOffset !== undefined) { st.used = specOf({ ...st.over, ...g2 }, st.tside); st.plan = switchPlan(rts, [st.used], st.pp, 1, foreign, keep); }
    }
    arms.push(armOf(st.plan, P));
  };
  // (only where some are in another's way does the order matter: then the ones with the fewest clear places first)
  const rooms = preps.map((q) => (inWay(q.st.plan, q.foreign, q.P, q.ed?.leverAt !== undefined) ? room(q) : Infinity));
  preps.map((_, k) => k).sort((a, b) => rooms[a] - rooms[b]).forEach((k) => placeLever(preps[k]));
  // (blades on top: two points' throws that run into each other, as a double slip's middle points' sliders cross under
  // its crossing, can't both move: no room for a throw there. Nail switches (Points with no room for a throw), their
  // sliders only under their own points; else said)
  if (fdb || preps.some((q) => q.st.pp.mechStyle === 'plates')) {
    // (only sets with another's points near theirs; their geometry kept for building them, below)
    const near2 = (a: Pose, b: Pose) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 300;
    const throwOf = (q: (typeof preps)[number]) => {
      if (q.st.pp.mechStyle !== 'plates' || q.three || q.st.pp.throwNail || !preps.some((o) => o !== q && near2(o.P, q.P))) return undefined;
      q.gm = { plan: q.st.plan, gm: switchGeometry(s, q.st.plan) };
      return place(q.gm.gm.throwPart(0), q.P);
    };
    const ths = preps.map(throwOf), bbs = ths.map((m) => m?.boundingBox());
    const meets = (a: number, b: number) => {
      const A = bbs[a], B = bbs[b];
      if (!A || !B || A.max[0] < B.min[0] || B.max[0] < A.min[0] || A.max[1] < B.min[1] || B.max[1] < A.min[1] || A.max[2] < B.min[2] || B.max[2] < A.min[2]) return false;
      return s.w.Manifold.intersection(ths[a]!, ths[b]!).volume() > 1;
    };
    // (two that run into each other: one of them moved along its points a stud or a few, where that clears them and
    // its lever stays clear of trains and the other levers (a double slip's with its levers outside: its sliders
    // staggered, each pair's one nearer its toes than the other's); not where the lever was moved by hand)
    for (let a = 0; a < preps.length; a++) for (let b = a + 1; b < preps.length; b++) {
      if (!meets(a, b)) continue;
      const tryMove = (k: number) => {
        const q = preps[k], ed = q.ed;
        if (ed?.springLength !== undefined || ed?.throwShift !== undefined) return false;
        const cur = (q.st.used[5] ?? {}) as SetOver, others = preps.flatMap((o, m) => (m === k ? [] : [armOf(o.st.plan, o.P)]));
        for (const sh of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
          const o2: SetOver = { ...cur, throwShift: (cur.throwShift ?? 0) + sh }, used = q.specOf(o2, q.st.tside), pl = switchPlan(q.rts, [used], q.st.pp, 1, q.foreign, q.keep);
          if (q.blockedOf(pl) || pl.setData[0].throwY === q.st.plan.setData[0].throwY) continue;
          const arm = armOf(pl, q.P);
          if (inWay(pl, q.foreign, q.P, ed?.leverAt !== undefined) === 'train' || others.some((o) => segGap(o, arm) < ARM_GAP)) continue;
          const gm = switchGeometry(s, pl), th = place(gm.throwPart(0), q.P), was = [ths[k], bbs[k]] as const;
          ths[k] = th; bbs[k] = th.boundingBox();
          if (preps.every((_, m) => m === k || !meets(k, m))) { q.st.over = o2; q.st.used = used; q.st.plan = pl; q.gm = { plan: pl, gm }; return true; }
          [ths[k], bbs[k]] = was;
        }
        return false;
      };
      if (!tryMove(b)) tryMove(a);
    }
    const clash = new Set<number>(), pairs: [number, number][] = [];
    for (let a = 0; a < preps.length; a++) for (let b = a + 1; b < preps.length; b++) if (meets(a, b)) { clash.add(a); clash.add(b); pairs.push([a, b]); }
    if ((p.boxedThrow ?? 'slider') === 'nail') for (const k of clash) {
      const q = preps[k];
      q.st.pp = { ...q.st.pp, throwNail: true };
      q.st.plan = switchPlan(q.rts, [q.st.used], q.st.pp, 1, q.foreign, q.keep);
    }
    else for (const [a, b] of pairs)
      warnings.push(`the throws of the points at ${studsAt(preps[a].gr.main)} and ${studsAt(preps[b].gr.main)} run into each other (their sliders cross): neither can move; set Points with no room for a throw to Nail switches, or Throw to Nail switch`);
  }
  const built: SplitParts[] = [];
  /** Each set's lever, where it is (the plan's, as built or not). */
  const levers: { toe: [number, number]; frame: Pose; set: SwitchPlan['sets'][number] }[] = [];
  // (planOnly: just the levers and what's said, for the plan; none of the parts built)
  if (planOnly) {
    for (const q of preps) {
      if (q.blade !== 1) throughWarnings(q.gr, q.blockedOf(q.st.plan));
      warnings.push(...q.st.plan.warnings.filter((w) => !/print bed/.test(w) && !(q.blade === 1 && warnings.includes(w))), ...q.st.plan.notes.filter((w) => !warnings.includes(w)));
      levers.push({ toe: [q.P[0], q.P[1]], frame: q.P, set: q.st.plan.sets[0] });
    }
    return { splits: built, levers, warnings };
  }
  // (each set's geometry, as built for the throws' check if its plan's the same; and the over-centre springs' pins on the
  // bed, in the design: another set's blade plate swinging over one (a double slip's sets are that close) is cut clear)
  // (the underside on the design's stud grid (the first route's start), but lined up with the track, track alone: each
  // set's frame given it, so what the slider rests on keeps clear of the baseplate's studs)
  const gms = preps.map((q) => (q.gm?.plan === q.st.plan ? q.gm.gm : switchGeometry(s, q.st.plan)));
  const ocPins = gms.map((gm, k) => { const o = gm.ocPinsAt(0); return o.at.map((pt) => ({ at: poseToWorld(preps[k].P, pt) as Pt, r: o.r, top: o.top })); });
  /** A blade (local: in its set's frame) clear of the other sets' spring pins, wherever it is as it turns from closed to open. */
  const clearOfPins = (n: number, m: Man, turn: { at: Pt; by: number } | undefined): Man => {
    const P = preps[n].P, bb = m.boundingBox();
    const cuts = ocPins.flatMap((pins, k) => (k === n ? [] : pins)).flatMap((pin) => {
      const q = worldToPose(P, pin.at) as Pt;
      if (q[0] < bb.min[0] - 30 || q[0] > bb.max[0] + 30 || q[1] < bb.min[1] - 30 || q[1] > bb.max[1] + 30) return [];
      const r = pin.r + p.pointClearance, h = pin.top + p.pointClearance + 10;
      const at = (t: number): Pt => { if (!turn) return q; const a = (-turn.by * t * Math.PI) / 180, dx = q[0] - turn.at[0], dy = q[1] - turn.at[1]; return [turn.at[0] + dx * Math.cos(a) - dy * Math.sin(a), turn.at[1] + dx * Math.sin(a) + dy * Math.cos(a)]; };
      return [s.w.Manifold.hull(Array.from({ length: 7 }, (_, t) => T(s.cylinder(h, r, r, 24), [...at(t / 6), -10]))).intersect(T(s.cube([400, 400, pin.top + p.pointClearance + 10]), [q[0] - 200, q[1] - 200, -10]))];
    });
    return cuts.length ? s.difference(m, cuts) : m;
  };
  // (neighbouring sets with their beds at different heights: sprung blades square to the baseplate grid lie on the bed as
  // it is, those at an angle to it on a bed 0.7 higher (base.ts, SHALLOW_SLIDER), and a slip's sets are near enough for
  // the higher bed to run under the next set's plates. Each set's raised bed gives way there, down to the other's own
  // bed, wherever that set's plates swing (fdbFootprint) and the clearance round them)
  const bedTops = preps.map((q) => switchGlobals(q.st.pp).bedTop);
  const plateRoom = preps.map((q) => {
    if (q.st.pp.mechStyle !== 'plates' || !preps.some((o, m) => o !== q && bedTops[m] > bedTops[preps.indexOf(q)] + 0.01)) return undefined;
    const f = fdbFootprint(q.st.plan);
    return f.plates.length ? s.w.CrossSection.union(f.plates.map((r) => s.polygon(r.map((pt) => poseToWorld(q.P, pt) as [number, number])))).offset(p.pointClearance + 0.2, 'Round', 2, 24) : undefined;
  });
  /** by: the sets it gives way to (what they're made from: part of what this set's built from, its key). */
  const bedClear = (n: number, bed: Man): { bed: Man; by: unknown[] } => {
    const bb = bed.boundingBox(), by: unknown[] = [];
    const cuts = plateRoom.flatMap((room, k) => {
      if (!room || k === n || bedTops[n] <= bedTops[k] + 0.01) return [];
      const rb = room.bounds();
      if (rb.min[0] > bb.max[0] || rb.max[0] < bb.min[0] || rb.min[1] > bb.max[1] || rb.max[1] < bb.min[1]) return [];
      by.push({ rts: preps[k].rts, used: preps[k].st.used, p: preps[k].st.pp, P: preps[k].P });
      return [T(s.extrude(room, bedTops[n] - bedTops[k] + 1), [0, 0, bedTops[k]])];
    });
    return { bed: cuts.length ? s.difference(bed, cuts) : bed, by };
  };
  for (const [n, q] of preps.entries()) {
    const { gr, sp, i, j, j2, P, A, B, rts, blockedOf } = q, { used, plan, pp } = q.st;
    if (q.blade !== 1) throughWarnings(gr, blockedOf(plan));
    warnings.push(...plan.warnings.filter((w) => !/print bed/.test(w) && !(q.blade === 1 && warnings.includes(w))), ...plan.notes.filter((w) => !warnings.includes(w)));
    const gm = gms[n], mech = gm.mech(0);
    // which design route (and which way round) each frame route is
    const worldOf = (rt: Route) => (rt === A ? i : rt === B ? j : j2);
    const moving: NetworkPart[] = [];
    const tag = `points${preps.length > 1 ? n + 1 : ''}`;
    const turns = gm.pointsTurns(0);
    const pts = gm.pointsParts(0).map((m, k) => clearOfPins(n, m, turns?.[k]));
    pts.forEach((m, k) => moving.push({ name: `${tag}${pts.length > 1 ? (k === 0 ? '-a' : '-b') : ''}`, color: 0x4682b4, local: m, world: place(m, P),
      ...(turns?.[k] && { turn: { at: poseToWorld(P, turns[k].at), by: turns[k].by, swing: turns[k].swing, ...(turns[k].tilt && { tilt: turns[k].tilt!.map((q) => poseToWorld(P, q)) as [[number, number], [number, number]] }) } }) }));
    // (Peco's spring: printed flat and straight, as assembled squeezed between its pins)
    const spr = gm.springPart(0), sprP = gm.springPrint(0);
    if (spr && sprP) moving.push({ name: `${tag}-spring`, color: 0xc0392b, local: sprP, world: place(spr, P) });
    const thr = gm.throwPart(0), mv = throwMoves(gm.throwMove(0), P);
    moving.push({ name: `${tag}-throw`, color: 0xe8892b, local: gm.throwPrint(0), world: place(thr, P), slide: mv.slide });
    // (the slider in two parts, its arm under other track: the piece with the posts, in after the bar)
    const thp = gm.throwPostsPart(0), thpP = gm.throwPostsPrint(0);
    if (thp && thpP) moving.push({ name: `${tag}-throw-posts`, color: 0xe8892b, local: thpP, world: place(thp, P), slide: mv.slide });
    // (the lever in a housing at a corner: the tie-rod out to it, on after the slider)
    const thr2 = gm.throwRodPart(0), thr2P = gm.throwRodPrint(0);
    if (thr2 && thr2P) moving.push({ name: `${tag}-throw-rod`, color: 0xe8892b, local: thr2P, world: place(thr2, P), slide: mv.slide });
    if (!gm.isNail(0)) moving.push({ name: `${tag}-lever`, color: 0xd4af37, local: gm.leverPrint(0), world: place(gm.leverPart(0), P), ...(mv.hinge && { hinge: mv.hinge }) });
    if (p.throwModule && !gm.isNail(0)) { const br = gm.bracketPart(0); moving.push({ name: `${tag}-bracket`, color: 0x8a8f99, local: br, world: place(br, P) }); }
    const end = sp.merge ? 'end' : 'start';
    // (its arm under other track: that track's studs on it, as on its bed (crossing.ts, where they're clear of its rails),
    // not on its own bed nor by the lever (its ears, its opening))
    const v0 = plan.sets[0], h = (P[2] * Math.PI) / 180, sl = (2 * G + 24) / 2;
    const studsOn = v0.under && v0.underOk ? (q: [number, number]) => {
      const dx = q[0] - P[0], dy = q[1] - P[1], x = dx * Math.cos(h) + dy * Math.sin(h), y = -dx * Math.sin(h) + dy * Math.cos(h);
      return Math.abs(y - v0.throwY) < 12 && v0.throwDir * (x - v0.throwStockX) > 0 && v0.throwDir * (v0.leverX - x) > 14
        && rts.every((rt) => Math.abs(routeLat(rt, [x, y])) > sl + 1);
    } : undefined;
    levers.push({ toe: [P[0], P[1]], frame: P, set: plan.sets[0] });
    const bed = bedClear(n, place(mech.bed, P));
    built.push({
      key: JSON.stringify({ rts, used, p: pp, P, routes: [i, j, j2], end, n, of: groups.length, ...(bed.by.length && { clear: bed.by }) }),
      toe: [P[0], P[1]], frame: P, set: plan.sets[0], src: gr.main,
      adds: [bed.bed, place(mech.arm, P), ...mech.steps.map((m) => place(m, P))], cuts: [place(mech.pockets, P), place(mech.channel, P)],
      ...(mech.rests && { rests: place(mech.rests, P) }),
      ...(mech.stepRect && { stepRect: mech.stepRect }),
      ...(mech.armRects.length && { armRects: mech.armRects }),
      ...(studsOn && { studsOn }),
      stock: place(mech.stockCut, P),
      bladeCuts: mech.bladeRails.map(([rt, cut]) => [worldOf(rt), place(cut, P)] as [number, Man]),
      inner: [`${j}:${end}`, ...(j2 >= 0 ? [`${j2}:${end}`] : [])],
      moving,
    });
  }
  // (two sets side by side, each with a spring (a double slip's middle points as nail switches, one blade each): where
  // one's spring or slider is in the other's parts, as assembled, they can't be put together: said, not left to be found)
  for (let a = 0; a < built.length; a++) for (let b = a + 1; b < built.length; b++) {
    const A = built[a].moving, B = built[b].moving, spring = (m: NetworkPart) => /-spring$/.test(m.name);
    if (!A.some(spring) && !B.some(spring)) continue;
    if (Math.hypot(built[a].toe[0] - built[b].toe[0], built[a].toe[1] - built[b].toe[1]) > 300) continue;
    const meet = (x: NetworkPart, y: NetworkPart) => {
      const p = x.world.boundingBox(), q = y.world.boundingBox();
      return [0, 1, 2].every((k) => p.min[k] <= q.max[k] && q.min[k] <= p.max[k]) && s.w.Manifold.intersection(x.world, y.world).volume() > 0.5;
    };
    if (A.some((x) => B.some((y) => meet(x, y))))
      warnings.push(`the points at ${studsAt(preps[a].gr.main)} and ${studsAt(preps[b].gr.main)} are too close for their springs: one's spring or slider is in the other's parts, and they can't be put together as built; set Throw to a lever`);
  }
  return { splits: built, levers, warnings };
}

/** The piece's body with the given splits' points built in (routes and splits by the same route indices). */
export function networkBody(s: Scad, routes: Route[], sol: Solution, copt: CrossingOptions, splits: SplitParts[], grips?: [number, number][],
  more: { cuts?: Man[]; keeps?: Man[]; innerEnds?: Set<string>; gridPose?: Pose; bedAt?: { p: [number, number]; d: [number, number]; len?: number }[] } = {}) {
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
  // (the lever in a housing at a corner: its own, armRects, below)
  const hollows = splits.filter((sp) => !sp.armRects).map((sp) => {
    const v = sp.set, xEnd = v.leverX + v.throwDir * 10, xOut = v.throwDir * Math.ceil((v.throwDir * xEnd) / 8 - 1e-6) * 8, hw = (v.armRect[3] - v.armRect[2]) / 2;
    return { P: sp.frame, r: [Math.min(v.throwStockX, xOut), Math.max(v.throwStockX, xOut), v.throwY - hw, v.throwY + hw] as [number, number, number, number] };
  });
  // (the lever in a housing at a corner: the arm there too, and the run between, out from the sleepers' ends)
  for (const sp of splits) for (const r of sp.armRects ?? []) hollows.push({ P: sp.frame, r });
  // (the cross-bar housing's far block)
  for (const sp of splits) if (!sp.armRects && sp.set.farRect) hollows.push({ P: sp.frame, r: sp.set.farRect });
  // (and the steps round them, on ballast)
  for (const sp of splits) if (sp.stepRect) hollows.push({ P: sp.frame, r: sp.stepRect });
  const blades = splits.flatMap((sp) => sp.bladeCuts.map(([, m]) => m)).filter(ok);
  const body = crossingPiece(s, routes, copt, sol, grips, { railCuts, innerEnds, adds: adds.filter(ok), ...(blades.length && { blades }), cuts: [...cuts, ...(more.cuts ?? [])].filter(ok), ...(more.keeps?.length && { keeps: more.keeps }), gridPose: more.gridPose, hollows, bedAt: more.bedAt,
    ...(splits.some((sp) => sp.studsOn) && { studsOn: (q: [number, number]) => splits.some((sp) => sp.studsOn?.(q)) }) });
  // (sprung blades on track alone: what the sliders rest on, after the underside's cut; on the stud corners of each
  // points set's own frame, so in line with the piece's underside where that frame is on its grid)
  const rests = splits.flatMap((sp) => (sp.rests && ok(sp.rests) ? [sp.rests] : []));
  return rests.length ? s.union([body, ...rests]) : body;
}

export function networkPiece(s: Scad, routes: Route[], sol: Solution, p: BaseParams, copt: CrossingOptions, grips?: [number, number][],
  toeShift: (at: [number, number]) => number = () => 0, extraCuts: Man[] = []) {
  const { splits, warnings } = networkSplits(s, routes, sol, p, toeShift);
  const body = networkBody(s, routes, sol, copt, splits, grips, { cuts: extraCuts });
  return { body, moving: splits.flatMap((sp) => sp.moving), warnings };
}
