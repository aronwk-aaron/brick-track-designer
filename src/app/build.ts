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
import { railPoint, routeLength, routePose, type Pose } from '../route/route';
import { BASE_DEFAULTS, switchGeometry } from '../switch/base';
import { planPieces, subRoute } from '../switch/pieces';
import { networkBody, networkSplits, type SplitParts } from '../switch/network';
import { blocks as tileBlocks, cropRoutes, nearCell, planCuts, routesBox, type Rect } from './tiles';
import type { CheckRail } from '../route/solver';
import type { Route } from '../route/route';
import { cutPiece, type CutLine } from '../geom/cutter';
import { type Design, OPTION_DEFAULTS, toRoutes } from './design';

/** An item of trackwork the hand edits apply to: a check rail, a flangeway cut, a points set. */
export interface TrackworkItem {
  kind: 'check' | 'groove' | 'points' | 'throw'; key: string; at: [number, number]; pts: [number, number][]; off?: boolean; len?: number; toe?: number; dir?: [number, number];
  /** a lever ('throw'): its points' frame (mm, degrees), side (+1 right), the track's edge beside it and the pivot's y (in the frame), the longest tines, and its settings now */
  lever?: { frame: Pose; side: number; edge: number; pivotY: number; maxTine: number; leverOffset: number; springLength: number; edited: boolean };
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
  if (memo.size > 400) memo.delete(memo.keys().next().value!);
  return v;
}
const stlOf = new WeakMap<Man, Uint8Array>();

/** progress: what it's doing now (for the 3D view's status while it builds). */
export function buildDesign(w: Wasm, design: Design, report: (what: string, frac: number) => void = () => {}, early?: (overlay: unknown) => void) {
  // (progress: steps done of the steps there are, worked out as the plan firms up)
  let stepsDone = 0, steps = 3;
  const progress = (what: string) => { report(what, Math.min(0.97, stepsDone / steps)); stepsDone++; };
  const routes = toRoutes(design).filter((r) => r.segments.length > 0);
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
  const leverItem = (key: string, P: Pose, v: { throwDir: number; leverX: number; throwY: number; throwStockX: number; throwEdgeX: number; pivotPt: [number, number] }) => {
    const ca = Math.cos((P[2] * Math.PI) / 180), sa = Math.sin((P[2] * Math.PI) / 180);
    const wd = (x: number, y: number): [number, number] => [P[0] + x * ca - y * sa, P[1] + x * sa + y * ca];
    const ed = tw.throw?.[key];
    items.push({ kind: 'throw', key, at: wd(v.leverX, v.throwY), pts: [wd(v.throwStockX, v.throwY), wd(v.leverX, v.throwY)],
      lever: { frame: P, side: v.throwDir, edge: Math.abs(v.throwEdgeX), pivotY: v.pivotPt[1], maxTine: v.pivotPt[1] - 12.5,
        leverOffset: ed?.leverOffset ?? o.leverOffset, springLength: Math.min(ed?.springLength ?? o.springLength, v.pivotPt[1] - 12.5), edited: !!ed } });
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
    generateBallast: o.ballast !== 'none', ballastBuddy: o.ballast === 'buddy', bottomStyle: o.bottomStyle };

  let pc = planPieces(routes, sol.splits, params, toeShift, throwEdit);
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
  const addTrack = (name: string, world: Man, pieceRoutes: typeof routes) => {
    const b = world.boundingBox(), lines: CutLine[] = [];
    if (!bp) {
      if (fitsBed(world)) return add(name, 0x6f7780, world, world);
      // too big for the print bed: cut across, into equal parts that fit (the
      // way that needs fewest cuts), a few mm short for the joints
      const W = b.max[0] - b.min[0], H = b.max[1] - b.min[1], room = Math.max(o.printBedX, o.printBedY) - 8, small = Math.min(o.printBedX, o.printBedY) - 8;
      const nx = Math.max(1, Math.ceil(W / (H > W ? small : room))), ny = Math.max(1, Math.ceil(H / (H > W ? room : small)));
      // (moved off points and frogs: a cut wants plain track)
      const avoid = [...overlay.splits, ...overlay.crossings];
      const clearAt = (v: number, axis: 0 | 1) => {
        for (const dv of [0, 8, -8, 16, -16, 24, -24, 32, -32, 48, -48, 64, -64])
          if (avoid.every((q) => Math.abs(q[axis] - (v + dv)) > 45)) return v + dv;
        return v;
      };
      for (let k = 1; k < nx; k++) lines.push({ p: [clearAt(b.min[0] + (W * k) / nx, 0), 0], d: [0, 1] });
      for (let k = 1; k < ny; k++) lines.push({ p: [0, clearAt(b.min[1] + (H * k) / ny, 1)], d: [1, 0] });
      steps++; progress(`Cutting ${name} to fit the print bed`);
      const cells = cached(`bedcut:${JSON.stringify(lines)}:${JSON.stringify(pieceRoutes)}:${world.volume().toFixed(3)}`, () => cutPiece(scad, track, world, pieceRoutes, lines));
      cells.forEach((m, k) => add(cells.length > 1 ? `${name}${k + 1}` : name, 0x6f7780, m, m));
      if (cells.some((m) => !fitsBed(m))) bedWarnings.add(`some parts still don't fit the ${o.printBedX} x ${o.printBedY} print bed`);
      return;
    }
    const ox = (o.baseplateX ?? 0) * 8, oy = (o.baseplateY ?? 0) * 8;
    // at the baseplate edges, and, where a baseplate is bigger than the print
    // bed, across each baseplate too, on the stud grid, into parts that fit
    const kk = Math.max(1, Math.ceil(bp / (Math.min(o.printBedX, o.printBedY) - 8)));
    const sub = Array.from({ length: kk }, (_, i) => Math.round((i * bp) / kk / 8) * 8);
    for (let x = ox + Math.floor((b.min[0] - ox) / bp) * bp; x < b.max[0] - 1; x += bp)
      for (const dx of sub) if (x + dx > b.min[0] + 1 && x + dx < b.max[0] - 1) lines.push({ p: [x + dx, 0], d: [0, 1] });
    for (let y = oy + Math.floor((b.min[1] - oy) / bp) * bp; y < b.max[1] - 1; y += bp)
      for (const dy of sub) if (y + dy > b.min[1] + 1 && y + dy < b.max[1] - 1) lines.push({ p: [0, y + dy], d: [1, 0] });
    steps++; progress(`Cutting ${name} at the baseplate edges`);
    const cells = cached(`cut:${bp}:${JSON.stringify(b)}:${JSON.stringify(pieceRoutes)}:${world.volume().toFixed(3)}`, () => cutPiece(scad, track, world, pieceRoutes, lines));
    cells.forEach((m, k) => add(cells.length > 1 ? `${name}-plate${k + 1}` : name, 0x6f7780, m, m));
    if (cells.some((m) => !fitsBed(m))) bedWarnings.add(`a baseplate's worth of track doesn't fit the ${o.printBedX} x ${o.printBedY} print bed: pick a smaller print bed cut or smaller baseplates`);
  };
  const add = (name: string, color: number, local: Man, world: Man) => {
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
  const BLOCK = 600; // (built together: about as much as builds quickly)
  const TILE_OVER = 8000; // mm of track: more, and it's built in tiles
  const tiled = (name: string, all: Route[], checks: CheckRail[], splits: SplitParts[], copt: typeof CROSSING_DEFAULTS, key: string) => {
    let b = routesBox(all, track.c.sleeperLen / 2 + 16);
    for (const sp of splits) for (const m of sp.adds) { const bb = m.boundingBox(); b = [Math.min(b[0], bb.min[0]), Math.min(b[1], bb.min[1]), Math.max(b[2], bb.max[0]), Math.max(b[3], bb.max[1])]; }
    const plan = planCuts(b, o.printBedX, o.printBedY, bp, (o.baseplateX ?? 0) * 8, (o.baseplateY ?? 0) * 8, [...overlay.splits, ...overlay.crossings]);
    if (!plan.xs.length && !plan.ys.length) return false;
    // (only when it's big: in one build a piece is quicker, but a whole yard
    // runs the kernel out of memory)
    if (all.reduce((t, rt) => t + routeLength(rt), 0) < TILE_OVER) return false;
    const cs = tileBlocks(plan, b, BLOCK).filter((R) => R[2] > b[0] && R[0] < b[2] && R[3] > b[1] && R[1] < b[3]);
    const gridPose = routePose(all[0], 0);
    const splitBoxes = splits.map((sp) => [...sp.adds, ...sp.cuts, sp.stock].map((m) => m.boundingBox()));
    steps += cs.length;
    let n = 0;
    const out: Man[] = [];
    cs.forEach((R, ci) => {
      progress(`Building ${name}: part ${ci + 1} of ${cs.length}`);
      const cr = cropRoutes(all, R, MARGIN, checks);
      if (!cr.routes.length) return;
      // its cuts: those on and in the block, couplers along the block only
      // (so the blocks either side of an edge agree)
      const lines: CutLine[] = [
        ...plan.xs.filter((x) => x >= R[0] && x <= R[2]).map((x): CutLine => ({ p: [x, 0], d: [0, 1], span: [R[1], R[3]] })),
        ...plan.ys.filter((y) => y >= R[1] && y <= R[3]).map((y): CutLine => ({ p: [0, y], d: [1, 0], span: [R[0], R[2]] })),
      ];
      // the points near it, on the cropped routes
      const near = splits.flatMap((sp, k) => (splitBoxes[k].some((bb) => nearCell(bb, R, MARGIN)) ? [{ sp, k }] : []));
      const tileSplits = near.map(({ sp }): SplitParts => {
        const [j, end] = sp.inner.split(':'), kj = cr.map[Number(j)];
        const whole = kj >= 0 && (end === 'start' ? cr.ranges[kj][0] === 0 : cr.ranges[kj][1] === routeLength(all[Number(j)]));
        return { ...sp, inner: whole ? `${kj}:${end}` : '-', bladeCuts: sp.bladeCuts.filter(([i]) => cr.map[i] >= 0).map(([i, m]) => [cr.map[i], m] as [number, Man]) };
      });
      const tileCuts = grooveCuts.filter((m) => nearCell(m.boundingBox(), R, MARGIN));
      const tk = `tile:${key}:${JSON.stringify({ r: cr.routes, c: cr.checks, i: [...cr.inner], R, lines, near: near.map((x) => x.k), copt, g: grooveCuts.length ? tw.groove : 0 })}`;
      let part: { ms: Man[]; grips: [number, number][] };
      try { part = cached(tk, () => arena(w, () => {
        const grips: [number, number][] = [];
        const body = networkBody(scad, cr.routes, { crossings: [], grooves: [], splits: [], checkRails: cr.checks }, copt, tileSplits, grips, { cuts: tileCuts, innerEnds: cr.inner, gridPose });
        const got = cutPiece(scad, track, body, cr.routes, lines).filter((m) => {
          const bb = m.boundingBox(), cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
          return cx > R[0] && cx < R[2] && cy > R[1] && cy < R[3];
        });
        return { ms: got, grips: grips.filter((q) => q[0] > R[0] && q[0] <= R[2] && q[1] > R[1] && q[1] <= R[3]) };
      }, (r) => r.ms)); } catch (err) {
        bedWarnings.add(`part ${ci + 1} of ${name} (x ${Math.max(R[0], b[0]).toFixed(0)} to ${Math.min(R[2], b[2]).toFixed(0)}, y ${Math.max(R[1], b[1]).toFixed(0)} to ${Math.min(R[3], b[3]).toFixed(0)}) failed to build: ${err instanceof Error ? err.message : `kernel error ${String(err)}`}`);
        return;
      }
      overlay.grips.push(...part.grips);
      out.push(...part.ms.filter((m) => m.numTri() > 0));
    });
    out.forEach((m) => add(out.length > 1 ? `${name}${++n}` : name, 0x6f7780, m, m));
    if (out.some((m) => !fitsBed(m))) bedWarnings.add(plan.why === 'bed' ? `some parts still don't fit the ${o.printBedX} x ${o.printBedY} print bed`
      : `a baseplate's worth of track doesn't fit the ${o.printBedX} x ${o.printBedY} print bed: pick a smaller print bed cut or smaller baseplates`);
    return true;
  };
  // ---- the trackwork first (what the plan shows and the hand edits work
  // on), sent on ahead of the pieces, which take longer ----
  const copt = { ...CROSSING_DEFAULTS, gaugeStuds: design.gaugeStuds, grip: design.grip ?? 'edges', flangeway: o.flangeway, flangewayDepth: o.flangewayDepth, checkRailW: o.checkRailW };
  const tp = { ...params, generateBallast: false }; // (network pieces are track only so far)
  const netKey = JSON.stringify({ routes, tp, copt, tw });
  let net: ReturnType<typeof networkSplits> | undefined;
  if (network) {
    editChecks(routes, sol.checkRails);
    net = cached(`netsplits:${netKey}`, () => networkSplits(scad, routes, sol, tp, toeShift, throwEdit));
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
    if (!tiled('track', routes, sol.checkRails, net.splits, copt, netKey)) {
      const whole = cached(`net:${netKey}`, () => { const grips: [number, number][] = []; return { body: networkBody(scad, routes, sol, copt, net.splits, grips, { cuts: grooveCuts }), grips }; });
      overlay.grips.push(...whole.grips);
      addTrack('track', whole.body, routes);
    }
    for (const sp of net.splits) for (const m of sp.moving) add(m.name, m.color, m.local, m.world);
    pc = { switches: [], rest: [], warnings: [...net.warnings] };

  }
  if (params.generateBallast && (network || pc.rest.length)) pc.warnings.push('ballast is on switches only so far: crossings and plain track come out track only');
  if (restSol) {
    progress('Building the track');
    // Does a piece fit the print bed (either way round)?
    const fits = (m: Man) => {
      const b = m.boundingBox(), w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
      return (w <= o.printBedX && h <= o.printBedY) || (w <= o.printBedY && h <= o.printBedX);
    };
    const restKey = JSON.stringify({ rest, copt, solverOpts, tw });
    const whole = () => cached(`cx:${restKey}`, () => { const grips: [number, number][] = []; return { m: crossingPiece(scad, rest, copt, restSol, grips, { cuts: grooveCuts }), grips }; });
    if (pc.rest.length > 1 && tiled('track', rest, restSol.checkRails, [], copt, restKey)) { /* built in tiles */ }
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
    if (bp) addTrack(`${tag}-base`, place(gm.whole, sw.pose), sw.covers.map(([ri, a, bb]) => subRoute(routes[ri], a, bb)));
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
