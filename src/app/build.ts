// Solving and building a design: what the canvas draws over the track
// (flangeway cuts, check rails, crossings, points, the tubes that grip), and
// the pieces: a switch wherever routes split (base and moving parts), the
// rest as fixed trackwork. Runs in the worker (and in tests).
import { Scad, R, T, type Man } from '../geom/scad';
import { sweepRoute } from '../geom/sweep';
import { DEFAULTS as TRACK_DEFAULTS, PLATE_H, Track } from '../geom/track';
import { CROSSING_DEFAULTS, crossingPiece } from '../geom/crossing';
import { arena, type Wasm } from '../geom/kernel';
import { stlBytes } from '../geom/stl';
import { solve } from '../route/solver';
import { railPoint, routeLat, routeLength, routePose, routeSOf, type Pose } from '../route/route';
import { reversedRoute } from '../switch/reverse';
import { BASE_DEFAULTS, switchGeometry } from '../switch/base';
import { switchGlobals } from '../switch/context';
import { planPieces, subRoute, toFrame } from '../switch/pieces';
import { networkBody, networkSplits, type SplitParts } from '../switch/network';
import { blocks as tileBlocks, cropRoutes, nearCell, planCuts, routesBox, type Rect } from './tiles';
import type { CheckRail, Split } from '../route/solver';
import { planSections } from './sections';
import type { Route } from '../route/route';
import { cutPiece, type CutLine } from '../geom/cutter';
import { pathSplit } from '../geom/pathsplit';
import { type Design, OPTION_DEFAULTS, toRoutes } from './design';

/** An item of trackwork the hand edits apply to: a check rail, a flangeway cut, a points set. */
export interface TrackworkItem {
  kind: 'check' | 'groove' | 'points' | 'throw'; key: string; at: [number, number]; pts: [number, number][]; off?: boolean; len?: number; toe?: number; dir?: [number, number];
  /** a lever ('throw'): its points' frame (mm, degrees), side (+1 right), the track's edge beside it and the pivot's y (in the frame), the longest tines, and its settings now */
  lever?: { frame: Pose; side: number; stockX: number; edge: number; minD: number; pivotY: number; maxTine: number; leverOffset: number; springLength: number; edited: boolean };
}

/** A built piece: its mesh in the design (for the view) and its STL (in its own frame, to print). */
export interface Piece { name: string; color: number; positions: Float32Array; stl: Uint8Array }

// Pieces built before, by what they were built from: an edit rebuilds only
// the pieces it changes (the worker keeps this between builds).
const memo = new Map<string, unknown>();
function cached<T>(key: string, f: () => T): T {
  if (memo.has(key)) { const v = memo.get(key) as T; memo.delete(key); memo.set(key, v); return v; }
  const v = f();
  memo.set(key, v);
  if (memo.size > 120) memo.delete(memo.keys().next().value!);
  return v;
}
const stlOf = new WeakMap<Man, Uint8Array>();

/**
 * Routes drawn the wrong way round for points: one that starts on another
 * track heading back along it (it's a branch that merges, drawn from the
 * merge), or ends on one heading back along it (a branch drawn from its far
 * end), is turned round, so the solver sees the points either way it was
 * drawn. (Everything else goes by where things are, not which way a route
 * runs.)
 */
function orient(routes: Route[]): Route[] {
  const out = [...routes];
  const onOpposite = (q: Pose, k: number) => out.some((a, i) => {
    if (i === k || Math.abs(routeLat(a, [q[0], q[1]])) > 0.01) return false;
    const pa = routePose(a, routeSOf(a, [q[0], q[1]]));
    const dh = Math.abs((((pa[2] - q[2]) % 360) + 540) % 360 - 180);
    return Math.hypot(pa[0] - q[0], pa[1] - q[1]) < 0.01 && dh > 179.5;
  });
  out.forEach((rt, k) => {
    const st = rt.start, e = routePose(rt, routeLength(rt));
    if (onOpposite(st, k) || onOpposite(e, k)) out[k] = reversedRoute(rt);
  });
  return out;
}

/** progress: what it's doing now (for the 3D view's status while it builds). */
export function buildDesign(w: Wasm, design: Design, report: (what: string, frac: number) => void = () => {}, early?: (overlay: unknown) => void) {
  // (progress: steps done of the steps there are, worked out as the plan firms up)
  let stepsDone = 0, steps = 3;
  const progress = (what: string) => { report(what, Math.min(0.97, stepsDone / steps)); stepsDone++; };
  const routes = orient(toRoutes(design).filter((r) => r.segments.length > 0));
  if (routes.length === 0) throw new Error('Draw some track: click a grid point to start, then click where it should go.');
  const t0 = performance.now();
  const gauge = (design.gaugeStuds + 1) * 8;
  const o = { ...OPTION_DEFAULTS, ...design.options };
  const solverOpts = { gauge, step: 0.5, flangeway: o.flangeway, checkRailLen: o.checkRailLen, checkRailW: o.checkRailW };
  progress('Working out the trackwork');
  const sol = solve(routes, solverOpts);
  // What the canvas draws over the track, in mm: flangeway cuts, check rails,
  // rail crossings and points.
  const g = gauge / 2;
  const along = (i: number, off: number, s0: number, s1: number) => {
    const n = Math.max(2, Math.ceil(s1 - s0));
    return Array.from({ length: n + 1 }, (_, k) => railPoint(routes[i], s0 + ((s1 - s0) * k) / n, off));
  };
  // Hand edits (design.trackwork), by where each item is.
  const tw = design.trackwork ?? {};
  const keyOf = (q: [number, number]) => `${Math.round(q[0])},${Math.round(q[1])}`;
  const items: TrackworkItem[] = [];
  /** Apply the check rail edits to a solution's check rails (in place), noting each for the Trackwork panel. */
  const editChecks = (rs: typeof routes, checks: typeof sol.checkRails) => {
    const out = checks.flatMap((cr) => {
      const mid = railPoint(rs[cr.route], (cr.s0 + cr.s1) / 2, cr.offset + cr.width / 2), key = keyOf(mid), e = tw.check?.[key] ?? {};
      if (e.off) { items.push({ kind: 'check', key, at: mid, pts: [], off: true, len: cr.s1 - cr.s0 }); return []; }
      const m = { ...cr, s0: cr.s0 - (e.d0 ?? 0), s1: cr.s1 + (e.d1 ?? 0), offset: cr.offset - cr.side * (e.shift ?? 0) };
      const n = Math.max(2, Math.ceil(m.s1 - m.s0));
      items.push({ kind: 'check', key, at: mid, len: m.s1 - m.s0, pts: Array.from({ length: n + 1 }, (_, k) => railPoint(rs[m.route], m.s0 + ((m.s1 - m.s0) * k) / n, m.offset + m.width / 2)) });
      return [m];
    });
    checks.splice(0, checks.length, ...out);
  };
  // Flangeway cuts lengthened by hand: the rail head cut down to the
  // flangeway's depth on along each end.
  const grooveCuts: Man[] = [];
  const scad0 = new Scad(w);
  for (const gr of sol.grooves) {
    const mid = railPoint(routes[gr.route], (gr.s0 + gr.s1) / 2, gr.side * g), key = keyOf(mid), e = tw.groove?.[key] ?? {};
    const d0 = Math.max(0, e.d0 ?? 0), d1 = Math.max(0, e.d1 ?? 0);
    const a0 = Math.max(0, gr.s0 - d0), a1 = Math.min(routeLength(routes[gr.route]), gr.s1 + d1);
    items.push({ kind: 'groove', key, at: mid, len: a1 - a0, pts: along(gr.route, gr.side * g, a0, a1) });
    const head = scad0.square([3.6, o.flangewayDepth + 1]).translate([gr.side * g - 1.8, PLATE_H + 6.4 - o.flangewayDepth]);
    if (d0 > 0) grooveCuts.push(sweepRoute(scad0, head, routes[gr.route], a0, gr.s0));
    if (d1 > 0) grooveCuts.push(sweepRoute(scad0, head, routes[gr.route], gr.s1, a1));
  }
  // Points moved along by hand.
  const splitAt = (sp: typeof sol.splits[number]) => railPoint(routes[sp.routes[0]], sp.merge ? sp.spans[0][1] : sp.spans[0][0], 0);
  for (const sp of sol.splits) {
    const at = splitAt(sp), key = keyOf(at), h = (routePose(routes[sp.routes[0]], sp.merge ? sp.spans[0][1] : sp.spans[0][0])[2] * Math.PI) / 180, k = sp.merge ? -1 : 1;
    // (dir: the way "moved along" goes, on the plan)
    items.push({ kind: 'points', key, at, pts: [at], toe: tw.points?.[key]?.toe ?? 0, dir: [-Math.sin(h) * k, Math.cos(h) * k] });
  }
  const toeShift = (q: [number, number]) => tw.points?.[keyOf(q)]?.toe ?? 0;
  const throwEdit = (q: [number, number]) => tw.throw?.[keyOf(q)];
  /** A points set's lever on the plan (it can be dragged there). */
  const leverItem = (key: string, P: Pose, v: { throwDir: number; leverX: number; throwY: number; throwStockX: number; throwEdgeX: number; leverMinD: number; tineLen: number; pivotPt: [number, number] }) => {
    const ca = Math.cos((P[2] * Math.PI) / 180), sa = Math.sin((P[2] * Math.PI) / 180);
    const wd = (x: number, y: number): [number, number] => [P[0] + x * ca - y * sa, P[1] + x * sa + y * ca];
    const ed = tw.throw?.[key];
    // (pts: the arm's outline, as built: from the stock rail out to the stud line past the lever, 3 studs wide)
    const xOut = v.throwDir * Math.ceil((v.throwDir * (v.leverX + v.throwDir * 10)) / 8 - 1e-6) * 8, hw = 12;
    items.push({ kind: 'throw', key, at: wd(v.leverX, v.throwY), pts: [wd(v.throwStockX, v.throwY - hw), wd(xOut, v.throwY - hw), wd(xOut, v.throwY + hw), wd(v.throwStockX, v.throwY + hw)],
      lever: { frame: P, side: v.throwDir, stockX: Math.abs(v.throwStockX), edge: Math.abs(v.throwEdgeX), minD: Math.abs(v.leverMinD), pivotY: v.pivotPt[1], maxTine: v.pivotPt[1] - 12.5,
        leverOffset: Math.round((Math.abs(v.leverX) - Math.abs(v.throwEdgeX)) * 100) / 100, springLength: Math.round(v.tineLen * 100) / 100, edited: !!ed } });
  };
  const overlay = {
    grooves: [] as [number, number][][],
    checkRails: [] as [number, number][][],
    crossings: sol.crossings.map((c) => c.point),
    splits: sol.splits.map(splitAt),
    grips: [] as [number, number][],
    items,
  };
  // Pieces: a switch wherever routes split, the rest as fixed trackwork.
  const scad = new Scad(w), pieces: Piece[] = [];
  const params = { ...BASE_DEFAULTS, ...o, gaugeStuds: design.gaugeStuds, studGrip: design.grip ?? 'edges', pointsPieces: design.pointsPieces ?? 1,
    generateBallast: o.ballast !== 'none', ballastBuddy: o.ballast === 'buddy', bottomStyle: o.bottomStyle,
    ...((o.pointsModule ?? 'built-in') !== 'built-in' && { mechFloor: 1.2 }), endSupports: o.endSupports !== false };

  let pc = planPieces(routes, sol.splits, params, toeShift, throwEdit, true);
  steps = 2 + pc.switches.length + (pc.rest.length ? 1 : 0);
  // Switches that merge back in, cross other track, or can't stand on their
  // own (a crossover, a switch on a crossing): the whole design as one
  // network piece with the points built in.
  const groupOf = (r: number) => pc.switches.findIndex((sw) => sw.covers.some((c) => c[0] === r));
  const network = sol.splits.length > 0 && (sol.splits.some((sp) => sp.merge) || pc.warnings.some((w2) => !/print bed/.test(w2))
    || sol.crossings.some((c) => groupOf(c.a.route) !== groupOf(c.b.route)));
  const place = (m: Man, P: Pose) => T(R(m, [0, 0, P[2]]), [P[0], P[1], 0]);
  let volume = 0;
  const fitsBed = (m: Man) => {
    const b = m.boundingBox(), w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
    return (w <= o.printBedX && h <= o.printBedY) || (w <= o.printBedY && h <= o.printBedX);
  };
  // Cut at baseplate edges (Piece options): the track (not the moving
  // parts) on the design's stud grid, every `baseplate` studs both ways.
  const bp = (o.baseplate ?? 0) * 8, bedWarnings = new Set<string>();
  const track = new Track(scad, { ...TRACK_DEFAULTS, gaugeStuds: design.gaugeStuds });
  // (how far each side of a centre line the track's base reaches: its sleepers, or its widest ballast layer)
  const bandHalf = (o.ballast === 'buddy' ? track.c.sleeperLen + 32 : o.ballast === 'ballast' ? track.c.sleeperLen + 16 : track.c.sleeperLen) / 2;
  // (what the joints stick out past a cut, both ends of a part: rail tongues, and the peg or dovetail)
  const jointRoom = (o.joint === 'dovetail' ? 14 : o.joint === 'butt' ? 2 : 8) - (o.cutRails === 'flat' && o.joint !== 'butt' ? 4 : 0);
  // (where no cut goes: the crossings, and every points set from before its toe to past its heels,
  // so a cut never runs through the blades' slots and leaves strips of track between them)
  // (a split along a path may go through a crossing, across its rails, as a cut down the middle of a crossover has to: only the points are kept clear)
  const pointsAvoid: [number, number][] = [];
  for (const sp of sol.splits) {
    const rt = routes[sp.routes[0]], [a0, a1] = sp.spans[0];
    for (let s2 = a0 - 8; s2 <= a1 + 8; s2 += 12) { const q = railPoint(rt, Math.max(0, Math.min(routeLength(rt), s2)), 0); pointsAvoid.push([q[0], q[1]]); }
  }
  const cutAvoid: [number, number][] = [...overlay.crossings, ...pointsAvoid];
  const addTrack = (name: string, world: Man, pieceRoutes: typeof routes) => {
    const bb = world.boundingBox(), b: Rect = [bb.min[0], bb.min[1], bb.max[0], bb.max[1]];
    if (!bp && fitsBed(world)) return add(name, 0x6f7780, world, world);
    // too big for the print bed (or at the baseplate edges): cut across the
    // track (tiles.ts planCuts), each part joined to the next like LEGO track
    const plan = planCuts(b, o.printBedX, o.printBedY, bp, (o.baseplateX ?? 0) * 8, (o.baseplateY ?? 0) * 8, cutAvoid, pieceRoutes, bandHalf, jointRoom, track.c.railOffset);
    // (baseplate edges always peg and clip; the cuts to fit the bed as chosen)
    const lj = (v: number) => (plan.edges?.has(v) ? { joint: 'lego' as const } : plan.combs?.has(v) ? { comb: true } : {});
    const lines: CutLine[] = [...plan.xs.map((x): CutLine => ({ p: [x, 0], d: [0, 1], ...lj(x) })), ...plan.ys.map((y): CutLine => ({ p: [0, y], d: [1, 0], ...lj(y) }))];
    steps++; progress(plan.why === 'bed' ? `Cutting ${name} to fit the print bed` : `Cutting ${name} at the baseplate edges`);
    const cells = cached(`cut:${bp}:${o.joint}:${o.cutRails}:${JSON.stringify(lines)}:${JSON.stringify(pieceRoutes)}:${world.volume().toFixed(3)}`, () => cutPiece(scad, track, world, pieceRoutes, lines, o.joint === 'ends' ? 'lego' : o.joint ?? 'lego', o.cutRails === 'flat'));
    // a part still too big: split along a stepped path on the stud grid that
    // goes only where a cut can be made (pathsplit.ts), as often as it takes
    // (pieces of track that don't touch are parts of their own; the small bits, the breakaway supports, stay with the biggest)
    const bodies = (m: Man): Man[] => {
      const all2 = m.decompose(), big2 = all2.filter((b2) => b2.volume() > 1000), small = all2.filter((b2) => b2.volume() <= 1000);
      if (big2.length <= 1) return [m];
      // (each small bit with the piece nearest it: the one it supports)
      const boxes = big2.map((b2) => b2.boundingBox()), groups: Man[][] = big2.map((b2) => [b2]);
      const gap = (a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }) =>
        Math.hypot(Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]), Math.max(0, a.min[1] - b.max[1], b.min[1] - a.max[1]));
      for (const sm of small) { const sb = sm.boundingBox(); let best = 0; boxes.forEach((bx, k) => { if (gap(sb, bx) < gap(sb, boxes[best])) best = k; }); groups[best].push(sm); }
      return groups.map((g2) => (g2.length > 1 ? scad.union(g2) : g2[0]));
    };
    const fitAll = (m: Man, depth = 0): Man[] => {
      if (depth === 0 || depth > 0) { const bs = bodies(m); if (bs.length > 1) return bs.flatMap((b2) => fitAll(b2, depth + 1)); }
      if (fitsBed(m) || depth > 5) return [m];
      const bb = m.boundingBox(), w2 = bb.max[0] - bb.min[0], h2 = bb.max[1] - bb.min[1];
      const tryAxis = (axis: 0 | 1) => pathSplit(scad, m, pieceRoutes, track.c.railOffset, pointsAvoid, axis, axis === 0 ? (bb.min[0] + bb.max[0]) / 2 : (bb.min[1] + bb.max[1]) / 2);
      // (across whichever side is too long: the longer one if it's longer than the bed, else the shorter)
      const big = Math.max(o.printBedX, o.printBedY), longX = w2 >= h2;
      const axis: 0 | 1 = Math.max(w2, h2) > big ? (longX ? 0 : 1) : (longX ? 1 : 0);
      // (no split that leaves a small piece: every part at least 6 studs each way)
      const small = (p2: Man) => { const b3 = p2.boundingBox(); return Math.min(b3.max[0] - b3.min[0], b3.max[1] - b3.min[1]) < 48; };
      const good = (g2: Man[] | undefined) => !!g2 && g2.length > 1 && !g2.flatMap(bodies).some(small);
      const got = tryAxis(axis);
      if (!good(got)) return [m];
      return got!.flatMap((p) => fitAll(p, depth + 1));
    };
    const all = cached(`fit:${o.printBedX}x${o.printBedY}:${bp}:${o.joint}:${o.cutRails}:${JSON.stringify(lines)}:${JSON.stringify(pieceRoutes)}:${world.volume().toFixed(3)}`, () => cells.flatMap((m) => arena(w, () => fitAll(m), (r) => r))); // (each cell's leftovers freed as it goes)
    all.forEach((m, k) => add(all.length > 1 ? `${name}${plan.why === 'baseplate' ? '-plate' : ''}${k + 1}` : name, 0x6f7780, m, m));
    if (all.some((m) => !fitsBed(m))) bedWarnings.add(`some parts don't fit the ${o.printBedX} x ${o.printBedY} print bed: there's nowhere left to cut them`);
  };
  /** A part as plain data (its mesh for the view, its STL, its volume, whether it fits the bed), so its solid can be let go. */
  const bake = (m: Man) => {
    const wm = m.getMesh(), positions = new Float32Array(wm.triVerts.length * 3);
    wm.triVerts.forEach((v, i) => positions.set(wm.vertProperties.subarray(v * wm.numProp, v * wm.numProp + 3), i * 3));
    return { positions, stl: stlBytes(wm), volume: m.volume(), fits: fitsBed(m) };
  };
  // ---- (prototype) layered: the piece in two layers stacked from the top ----
  // The lower layer (the ballast's bottom, with the pockets the moving parts
  // sit in) and the deck over it (the bed, rails and frogs, slotted for the
  // blades): the moving parts are dropped in and the deck laid on, held by
  // studs on the lower layer in sockets under the deck, as LEGO plates stack.
  const layered = (o.pointsModule ?? 'built-in') === 'layers' && o.ballast !== 'none';
  if ((o.pointsModule ?? 'built-in') === 'layers' && o.ballast === 'none') bedWarnings.add('layered points need ballast (the track alone is too thin to split): built in one piece');
  /**
   * Where the lid goes over a points set, in its frame: the bed across all its
   * routes from before the toe to past the heels, and the throw's arm out to
   * the stud line past the lever, on whole studs.
   */
  const lidRects = (frameRoutes: Route[], v: { toeY: number; pointsEndY: number; throwDir: number; leverX: number; throwY: number; throwStockX: number }) => {
    const y0 = Math.floor((v.toeY - 16) / 8) * 8, y1 = Math.ceil((v.pointsEndY + 12) / 8) * 8;
    let x0 = Infinity, x1 = -Infinity;
    for (const rt of frameRoutes) {
      const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 2));
      for (let k = 0; k <= n; k++) for (const off of [-track.c.sleeperLen / 2, track.c.sleeperLen / 2]) {
        const q = railPoint(rt, (L * k) / n, off);
        if (q[1] >= y0 && q[1] <= y1) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); }
      }
    }
    const xOut = v.throwDir * Math.ceil((v.throwDir * (v.leverX + v.throwDir * 10)) / 8 - 1e-6) * 8;
    return [
      [Math.floor(x0 / 8) * 8, Math.ceil(x1 / 8) * 8, Math.max(8, y0), y1],
      [Math.min(v.throwStockX, xOut), Math.max(v.throwStockX, xOut), v.throwY - 12, v.throwY + 12],
    ] as [number, number, number, number][];
  };
  /**
   * The piece and a lid over each points set (lidRects, in frame P): the lid
   * is everything above the moving parts there (bed, rails, frog, slotted for
   * the blades; the arm's top with the lever's ears), the piece keeps the
   * floor, the points' pockets and the throw's slot under it. Studs on the
   * piece in sockets under the lid hold it on.
   */
  const layerSplit = (whole: Man, lids: { P: Pose; rects: [number, number, number, number][] }[], gp: Pose) => {
    const zs = switchGlobals(params).cavityTop;
    const prisms = lids.flatMap(({ P, rects }) => rects.map((r) => place(T(scad.cube([r[1] - r[0], r[3] - r[2], 100 - zs]), [r[0], r[2], zs]), P)));
    const region = scad.union(prisms);
    let lower = scad.difference(whole, [region]), deck = scad.intersection(whole, region);
    // the studs that hold it: on a 2-stud lattice, where both are solid round them (and the lid thick enough over them)
    const bb = deck.boundingBox(), sl = lower.slice(zs - 0.3), d0 = deck.slice(zs + 0.3), d1 = deck.slice(zs + 2.3);
    const hd = (gp[2] * Math.PI) / 180, studs: Man[] = [], socks: Man[] = [];
    const reach = Math.ceil((Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) + Math.hypot(bb.min[0] - gp[0], bb.min[1] - gp[1])) / 8) + 2;
    const solid = (cs: typeof sl, q: [number, number]) => scad.w.CrossSection.circle(3.4, 16).translate(q).subtract(cs).area() < 0.01;
    for (let i = -reach; i <= reach; i += 2) for (let j = -reach; j <= reach; j += 2) {
      const lx = 4 + i * 8, ly = 4 + j * 8, q: [number, number] = [gp[0] + lx * Math.cos(hd) - ly * Math.sin(hd), gp[1] + lx * Math.sin(hd) + ly * Math.cos(hd)];
      if (q[0] < bb.min[0] || q[0] > bb.max[0] || q[1] < bb.min[1] || q[1] > bb.max[1]) continue;
      if (!(solid(sl, q) && solid(d0, q) && solid(d1, q))) continue;
      studs.push(T(track.stud(), [q[0], q[1], zs - 0.01]));
      socks.push(T(scad.cylinder(track.o.studH + 0.2, track.c.studSocketW / 2, track.c.studSocketW / 2, 24), [q[0], q[1], zs - 0.01]));
    }
    if (studs.length) { lower = scad.union([lower, ...studs]); deck = scad.difference(deck, socks); }
    return { lower, deck };
  };
  const add = (name: string, color: number, local: Man, world: Man) => {
    // (a part that comes apart into loose bits is no good to print: say so)
    const wm = world.getMesh(), positions = new Float32Array(wm.triVerts.length * 3);
    wm.triVerts.forEach((v, i) => positions.set(wm.vertProperties.subarray(v * wm.numProp, v * wm.numProp + 3), i * 3));
    let stl = stlOf.get(local);
    if (!stl) { stl = stlBytes(local.getMesh()); stlOf.set(local, stl); }
    pieces.push({ name, color, positions, stl: stl.slice() });
    volume += local.volume();
  };
  // A big piece in tiles (src/app/tiles.ts): each cell of the cuts built
  // from the track near it only, cut to the cell with its joints. false: it
  // needs no cutting (build it whole).
  const MARGIN = 72; // (past a cropped end's effects on the bed and underside)
  const BLOCK = 450; // (built together: about as much as builds quickly)
  const TILE_OVER = 8000; // mm of track: more, and it's built in tiles
  // In separate pieces with ordinary track ends, the 4DBrix way (sections.ts):
  // each section built from its own pieces of track, its cut ends given
  // standard end connectors.
  const sectioned = (name: string, all: Route[], checks: CheckRail[], splits: SplitParts[], solSplits: Split[], copt: typeof CROSSING_DEFAULTS, key: string) => {
    const room = Math.max(o.printBedX, o.printBedY) - 4;
    const plan = cached(`secplan:${key}:${room}:${bandHalf}`, () => planSections(all, solSplits, bandHalf, room));
    const gridPose = routePose(all[0], 0);
    steps += plan.sections.length;
    let n = 0;
    plan.sections.forEach((sec, si) => {
      progress(`Building ${name}: section ${si + 1} of ${plan.sections.length}`);
      const ps = sec.map((k) => plan.pieces[k]);
      const rts = ps.map(([i, a, b]) => (a === 0 && b === routeLength(all[i]) ? all[i] : { ...subRoute(all[i], a, b), throwSide: all[i].throwSide }));
      const pieceOf = (i: number, s: number) => ps.findIndex(([pi, a, b]) => pi === i && s >= a - 1e-6 && s <= b + 1e-6);
      const firstOf = (i: number) => ps.findIndex(([pi]) => pi === i);
      const cChecks = checks.flatMap((cr) => ps.flatMap(([pi, a, b], k) => {
        if (pi !== cr.route) return [];
        const s0 = Math.max(cr.s0, a), s1 = Math.min(cr.s1, b);
        return s1 > s0 ? [{ ...cr, route: k, s0: s0 - a, s1: s1 - a }] : [];
      }));
      // its points: those whose toe is on one of its pieces
      const mine = splits.flatMap((sp, k) => {
        const ss = solSplits[k], toeS = ss.merge ? ss.spans[0][1] : ss.spans[0][0];
        if (pieceOf(ss.routes[0], toeS) < 0) return [];
        const [j, end] = sp.inner.split(':'), jj = Number(j);
        const pj = end === 'start' ? pieceOf(jj, 0) : pieceOf(jj, routeLength(all[jj]));
        return [{ ...sp, inner: pj >= 0 ? `${pj}:${end}` : '-', bladeCuts: sp.bladeCuts.filter(([i]) => firstOf(i) >= 0).map(([i, m]) => [firstOf(i), m] as [number, Man]) }];
      });
      const sk = `sec:${key}:${JSON.stringify({ rts, cChecks, m: mine.map((x) => x.toe), copt, g: grooveCuts.length ? tw.groove : 0 })}`;
      let part: { ms: ReturnType<typeof bake>[]; grips: [number, number][] };
      try { part = cached(sk, () => arena(w, () => {
        const grips: [number, number][] = [];
        const cuts = grooveCuts.filter((m) => { const bb = m.boundingBox(); return rts.some((rt) => { const b2 = routesBox([rt], bandHalf + 8); return bb.max[0] >= b2[0] && bb.min[0] <= b2[2] && bb.max[1] >= b2[1] && bb.min[1] <= b2[3]; }); });
        const body = networkBody(scad, rts, { crossings: [], grooves: [], splits: [], checkRails: cChecks }, copt, mine, grips, { cuts, gridPose });
        if (body.numTri() === 0) return { ms: [], grips };
        // (and where it crosses a baseplate edge, cut there with peg and clip)
        let parts2 = [body];
        if (bp) {
          const bb = body.boundingBox(), ox = (o.baseplateX ?? 0) * 8, oy = (o.baseplateY ?? 0) * 8, lines: CutLine[] = [];
          for (let x = ox + Math.ceil((bb.min[0] + 1 - ox) / bp) * bp; x < bb.max[0] - 1; x += bp) lines.push({ p: [x, 0], d: [0, 1], joint: 'lego' });
          for (let y = oy + Math.ceil((bb.min[1] + 1 - oy) / bp) * bp; y < bb.max[1] - 1; y += bp) lines.push({ p: [0, y], d: [1, 0], joint: 'lego' });
          if (lines.length) parts2 = cutPiece(scad, track, body, rts, lines, 'lego', o.cutRails === 'flat');
        }
        return { ms: parts2.filter((m) => m.numTri() > 0).map(bake), grips };
      }, () => [])); } catch (err) {
        if (err instanceof WebAssembly.RuntimeError || typeof err === 'number') throw err;
        bedWarnings.add(`section ${si + 1} of ${name} failed to build: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      overlay.grips.push(...part.grips);
      for (const b2 of part.ms) {
        pieces.push({ name: `${name}${++n}`, color: 0x6f7780, positions: b2.positions.slice(), stl: b2.stl.slice() }); volume += b2.volume;
        if (!b2.fits) bedWarnings.add(`some sections don't fit the ${o.printBedX} x ${o.printBedY} print bed: there's nowhere to cut them with ordinary track ends (points, frogs and crossings stay whole)`);
      }
    });
  };
  const tiled = (name: string, all: Route[], checks: CheckRail[], splits: SplitParts[], copt: typeof CROSSING_DEFAULTS, key: string) => {
    let b = routesBox(all, track.c.sleeperLen / 2 + 24);
    for (const sp of splits) for (const m of sp.adds) { const bb = m.boundingBox(); b = [Math.min(b[0], bb.min[0]), Math.min(b[1], bb.min[1]), Math.max(b[2], bb.max[0]), Math.max(b[3], bb.max[1])]; }
    const plan = planCuts(b, o.printBedX, o.printBedY, bp, (o.baseplateX ?? 0) * 8, (o.baseplateY ?? 0) * 8, cutAvoid, all, bandHalf, jointRoom, track.c.railOffset);
    if (!plan.xs.length && !plan.ys.length) return false;
    // (only when it's big: in one build a piece is quicker, but a whole yard
    // runs the kernel out of memory)
    if (all.reduce((t, rt) => t + routeLength(rt), 0) < TILE_OVER) return false;
    const cs = tileBlocks(plan, b, BLOCK).filter((R) => R[2] > b[0] && R[0] < b[2] && R[3] > b[1] && R[1] < b[3]);
    const gridPose = routePose(all[0], 0);
    const splitBoxes = splits.map((sp) => [...sp.adds, ...sp.cuts, sp.stock].map((m) => m.boundingBox()));
    steps += cs.length;
    let n = 0;
    const out: ReturnType<typeof bake>[] = [];
    cs.forEach((R, ci) => {
      progress(`Building ${name}: part ${ci + 1} of ${cs.length}`);
      const cr = cropRoutes(all, R, MARGIN, checks);
      if (!cr.routes.length) return;
      // its cuts: those on and in the block, couplers along the block only
      // (so the blocks either side of an edge agree)
      const lines: CutLine[] = [
        ...plan.xs.filter((x) => x >= R[0] && x <= R[2]).map((x): CutLine => ({ p: [x, 0], d: [0, 1], span: [R[1], R[3]], ...(plan.edges?.has(x) ? { joint: 'lego' as const } : plan.combs?.has(x) ? { comb: true } : {}) })),
        ...plan.ys.filter((y) => y >= R[1] && y <= R[3]).map((y): CutLine => ({ p: [0, y], d: [1, 0], span: [R[0], R[2]], ...(plan.edges?.has(y) ? { joint: 'lego' as const } : plan.combs?.has(y) ? { comb: true } : {}) })),
      ];
      // the points near it, on the cropped routes
      const near = splits.flatMap((sp, k) => (splitBoxes[k].some((bb) => nearCell(bb, R, MARGIN)) ? [{ sp, k }] : []));
      const tileSplits = near.map(({ sp }): SplitParts => {
        const [j, end] = sp.inner.split(':'), kj = cr.map[Number(j)];
        const whole = kj >= 0 && (end === 'start' ? cr.ranges[kj][0] === 0 : cr.ranges[kj][1] === routeLength(all[Number(j)]));
        return { ...sp, inner: whole ? `${kj}:${end}` : '-', bladeCuts: sp.bladeCuts.filter(([i]) => cr.map[i] >= 0).map(([i, m]) => [cr.map[i], m] as [number, Man]) };
      });
      const tileCuts = grooveCuts.filter((m) => nearCell(m.boundingBox(), R, MARGIN));
      const tk = `tile:${key}:${JSON.stringify({ r: cr.routes, c: cr.checks, i: [...cr.inner], R, lines, near: near.map((x) => x.k), copt, joint: o.joint, cutRails: o.cutRails, g: grooveCuts.length ? tw.groove : 0 })}`;
      let part: { ms: ReturnType<typeof bake>[]; grips: [number, number][] };
      try { part = cached(tk, () => arena(w, () => {
        const grips: [number, number][] = [];
        const body = networkBody(scad, cr.routes, { crossings: [], grooves: [], splits: [], checkRails: cr.checks }, copt, tileSplits, grips, { cuts: tileCuts, innerEnds: cr.inner, gridPose });
        const got = cutPiece(scad, track, body, cr.routes, lines, o.joint === 'ends' ? 'lego' : o.joint ?? 'lego', o.cutRails === 'flat').filter((m) => {
          const bb = m.boundingBox(), cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
          return cx > R[0] && cx < R[2] && cy > R[1] && cy < R[3];
        });
        // (baked: the block's solids are all let go, a whole yard's would fill the kernel's memory)
        return { ms: got.filter((m) => m.numTri() > 0).map(bake), grips: grips.filter((q) => q[0] > R[0] && q[0] <= R[2] && q[1] > R[1] && q[1] <= R[3]) };
      }, () => [])); } catch (err) {
        if (err instanceof WebAssembly.RuntimeError || typeof err === 'number') throw err; // (the kernel's broken now: no use carrying on)
        bedWarnings.add(`part ${ci + 1} of ${name} (x ${Math.max(R[0], b[0]).toFixed(0)} to ${Math.min(R[2], b[2]).toFixed(0)}, y ${Math.max(R[1], b[1]).toFixed(0)} to ${Math.min(R[3], b[3]).toFixed(0)}) failed to build: ${err instanceof Error ? err.message : `kernel error ${String(err)}`}`);
        return;
      }
      overlay.grips.push(...part.grips);
      out.push(...part.ms);
    });
    for (const b2 of out) { pieces.push({ name: out.length > 1 ? `${name}${++n}` : name, color: 0x6f7780, positions: b2.positions.slice(), stl: b2.stl.slice() }); volume += b2.volume; }
    if (out.some((b2) => !b2.fits)) bedWarnings.add(plan.why === 'bed'
      ? `some parts don't fit the ${o.printBedX} x ${o.printBedY} print bed without cutting along the track (it isn't)`
      : `a baseplate's worth of track doesn't fit the ${o.printBedX} x ${o.printBedY} print bed without cutting along the track (it isn't)`);
    return true;
  };
  // ---- the trackwork first (what the plan shows and the hand edits work
  // on), sent on ahead of the pieces, which take longer ----
  const copt = { ...CROSSING_DEFAULTS, gaugeStuds: design.gaugeStuds, grip: design.grip ?? 'edges', flangeway: o.flangeway, flangewayDepth: o.flangewayDepth, checkRailW: o.checkRailW,
    ballast: o.ballast, bottomStyle: o.bottomStyle, supports: o.endSupports !== false };
  const tp = params;
  const netKey = JSON.stringify({ routes, tp, copt, tw });
  let net: ReturnType<typeof networkSplits> | undefined;
  if (network) {
    editChecks(routes, sol.checkRails);
    net = cached(`netsplits:${netKey}`, () => networkSplits(scad, routes, sol, tp, toeShift, throwEdit, true));
    for (const sp of net.splits) leverItem(keyOf(sp.toe), sp.frame, sp.set);
  }
  const rest = network ? [] : pc.rest;
  const restSol = rest.length ? solve(rest, solverOpts) : undefined;
  if (restSol) editChecks(rest, restSol.checkRails);
  if (!network) pc.switches.forEach((sw) => {
    sw.sets.forEach((_, k) => leverItem(keyOf(sw.setAts[k]), sw.pose, sw.plan.sets[k]));
    // its check rails, with the hand edits (keyed where they are in the design)
    const ca = Math.cos((sw.pose[2] * Math.PI) / 180), sa = Math.sin((sw.pose[2] * Math.PI) / 180);
    const toWorld = (q: [number, number]): [number, number] => [sw.pose[0] + q[0] * ca - q[1] * sa, sw.pose[1] + q[0] * sa + q[1] * ca];
    const cl = sw.plan.checkList, kept: typeof cl = [];
    for (const cr of cl) {
      const rt = sw.plan.routes[cr[0]], w2 = o.checkRailW / 2;
      const mid = toWorld(railPoint(rt, (cr[5] + cr[6]) / 2, cr[2] + w2)), key = keyOf(mid), e = tw.check?.[key] ?? {};
      if (e.off) { items.push({ kind: 'check', key, at: mid, pts: [], off: true, len: cr[6] - cr[5] }); continue; }
      const m: typeof cr = [cr[0], cr[1], cr[2] + cr[3] * (e.shift ?? 0), cr[3], cr[4], cr[5] - (e.d0 ?? 0), cr[6] + (e.d1 ?? 0)];
      const n2 = Math.max(2, Math.ceil(m[6] - m[5]));
      items.push({ kind: 'check', key, at: mid, len: m[6] - m[5], pts: Array.from({ length: n2 + 1 }, (_, k) => toWorld(railPoint(rt, m[5] + ((m[6] - m[5]) * k) / n2, m[2] + w2))) });
      kept.push(m);
    }
    cl.splice(0, cl.length, ...kept);
  });
  overlay.checkRails = items.filter((it) => it.kind === 'check' && !it.off).map((it) => it.pts);
  overlay.grooves = items.filter((it) => it.kind === 'groove').map((it) => it.pts);
  early?.(overlay);

  if (net) {
    steps = 3;
    progress(`Building the piece with its ${sol.splits.length} points`);
    if (o.joint === 'ends') sectioned('track', routes, sol.checkRails, net.splits, sol.splits, copt, netKey);
    else if (!tiled('track', routes, sol.checkRails, net.splits, copt, netKey)) {
      const whole = cached(`net:${netKey}`, () => { const grips: [number, number][] = []; return { body: networkBody(scad, routes, sol, copt, net.splits, grips, { cuts: grooveCuts }), grips }; });
      overlay.grips.push(...whole.grips);
      if (layered) {
        // (prototype) in two layers: the lower one and the deck, each cut for the bed on its own
        const lids = net.splits.map((sp, n2) => ({ P: sp.frame, rects: lidRects(sol.splits[n2].routes.map((ri) => ({ ...routes[ri], start: toFrame(sp.frame, routes[ri].start) })), sp.set) }));
        const ls = cached(`lay:${netKey}`, () => layerSplit(whole.body, lids, routePose(routes[0], 0)));
        addTrack('track', ls.lower, routes);
        // (each lid its own part)
        const lidParts = ls.deck.decompose().filter((m) => m.volume() > 20);
        lidParts.forEach((m, k) => add(`points${lidParts.length > 1 ? k + 1 : ''}-lid`, 0x6f7780, m, m));
      } else addTrack('track', whole.body, routes);
    }
    for (const sp of net.splits) for (const m of sp.moving) add(m.name, m.color, m.local, m.world);
    pc = { switches: [], rest: [], warnings: [...net.warnings] };

  }
  if (restSol) {
    progress('Building the track');
    // Does a piece fit the print bed (either way round)?
    const fits = (m: Man) => {
      const b = m.boundingBox(), w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
      return (w <= o.printBedX && h <= o.printBedY) || (w <= o.printBedY && h <= o.printBedX);
    };
    const restKey = JSON.stringify({ rest, copt, solverOpts, tw });
    const whole = () => cached(`cx:${restKey}`, () => { const grips: [number, number][] = []; return { m: crossingPiece(scad, rest, copt, restSol, grips, { cuts: grooveCuts }), grips }; });
    if (o.joint === 'ends') sectioned('track', rest, restSol.checkRails, [], [], copt, restKey);
    else if (pc.rest.length > 1 && tiled('track', rest, restSol.checkRails, [], copt, restKey)) { /* built in tiles */ }
    else if (pc.rest.length > 1 || fits(whole().m)) {
      overlay.grips.push(...whole().grips);
      addTrack('track', whole().m, rest);
    } else {
      // A plain track longer than the bed: in equal lengths, joined like
      // LEGO track pieces (rail-end tongues, peg and clip), each fitting it.
      const rt = pc.rest[0], L = routeLength(rt);
      for (let n = 2; n <= 20; n++) {
        const bits = Array.from({ length: n }, (_, k) => { const sub = subRoute(rt, (L * k) / n, (L * (k + 1)) / n); return cached(`cx1:${JSON.stringify({ sub, copt })}`, () => crossingPiece(scad, [sub], copt)); });
        if (bits.every(fits) || n === 20) { bits.forEach((m, k) => add(`track${k + 1}`, 0x6f7780, m, m)); break; }
      }
    }
  }
  pc.switches.forEach((sw, n) => {
    progress(`Building switch ${n + 1} of ${pc.switches.length}`);
    const tag = pc.switches.length > 1 ? `switch${n + 1}` : 'switch';
    const cl = sw.plan.checkList;
    const frameCuts = grooveCuts.map((m) => R(T(m, [-sw.pose[0], -sw.pose[1], 0]), [0, 0, -sw.pose[2]]));
    const gm = cached(`sw:${JSON.stringify({ routes: sw.routes, sets: sw.sets, params, cl, tw: tw.groove })}`, () => {
      const g = switchGeometry(scad, sw.plan, frameCuts);
      return { bases: g.basePieces(), whole: g.base(), grips: g.grips, sets: sw.sets.map((_, k) => ({ thr: g.throwPart(k), pp: g.pointsParts(k), print: g.leverPrint(), lever: g.leverPart(k) })) };
    });
    const bases = gm.bases;
    // (its tubes, for the plan's grip marks, in the design's frame)
    const cz = Math.cos((sw.pose[2] * Math.PI) / 180), sz = Math.sin((sw.pose[2] * Math.PI) / 180);
    for (const [x, y] of gm.grips) overlay.grips.push([sw.pose[0] + x * cz - y * sz, sw.pose[1] + x * sz + y * cz]);
    if (layered) {
      // (prototype) in two layers: the lower one and the deck, each cut for the bed on its own
      const lids = sw.sets.map((_, k) => ({ P: sw.pose, rects: lidRects(sw.plan.routes, sw.plan.sets[k]) }));
      const ls = cached(`lay:${JSON.stringify({ routes: sw.routes, sets: sw.sets, params, cl, tw: tw.groove })}`, () => layerSplit(place(gm.whole, sw.pose), lids, sw.pose));
      addTrack(`${tag}-base`, ls.lower, sw.covers.map(([ri, a, bb]) => subRoute(routes[ri], a, bb)));
      add(`${tag}-lid`, 0x6f7780, ls.deck, ls.deck);
    } else if (bp) addTrack(`${tag}-base`, place(gm.whole, sw.pose), sw.covers.map(([ri, a, bb]) => subRoute(routes[ri], a, bb)));
    else bases.forEach((m, j) => add(bases.length > 1 ? `${tag}-base${j + 1}` : `${tag}-base`, 0x6f7780, m, place(m, sw.pose)));
    gm.sets.forEach(({ thr, pp, print, lever }, k) => {
      const sfx = sw.sets.length > 1 ? `${k + 1}` : '';
      pp.forEach((pts, j) => add(`${tag}-points${sfx}${pp.length > 1 ? (j === 0 ? '-a' : '-b') : ''}`, 0x4682b4, pts, place(pts, sw.pose)));
      add(`${tag}-throw${sfx}`, 0xe8892b, thr, place(thr, sw.pose));
      add(`${tag}-lever${sfx}`, 0xd4af37, print, place(lever, sw.pose));
    });
  });
  const all = pieces.flatMap((p) => [p.positions]);
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const ps of all) for (let i = 0; i < ps.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], ps[i + k]); mx[k] = Math.max(mx[k], ps[i + k]); }
  const info = {
    ms: performance.now() - t0, volume,
    size: [0, 1, 2].map((k) => mx[k] - mn[k]),
    crossings: sol.crossings.length, checkRails: sol.checkRails.length, splits: sol.splits.length,
    switches: network ? sol.splits.length : pc.switches.length, pieces: pieces.length, warnings: [...pc.warnings, ...bedWarnings],
  };
  return { overlay, pieces, info };
}
