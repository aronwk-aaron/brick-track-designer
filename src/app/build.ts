// Solving and building a design: what the canvas draws over the track
// (flangeway cuts, check rails, crossings, points, the tubes that grip), and
// the pieces: a switch wherever routes split (base and moving parts), the
// rest as fixed trackwork. Runs in the worker (and in tests).
import { Scad, R, T, type Man } from '../geom/scad';
import { sweepRoute } from '../geom/sweep';
import { DEFAULTS as TRACK_DEFAULTS, PLATE_H, Track } from '../geom/track';
import { CROSSING_DEFAULTS, crossingPiece } from '../geom/crossing';
import type { Wasm } from '../geom/kernel';
import { stlBytes } from '../geom/stl';
import { solve } from '../route/solver';
import { railPoint, routeLength, type Pose } from '../route/route';
import { BASE_DEFAULTS, switchGeometry } from '../switch/base';
import { planPieces, subRoute } from '../switch/pieces';
import { networkPiece } from '../switch/network';
import { cutPiece, type CutLine } from '../geom/cutter';
import { type Design, OPTION_DEFAULTS, toRoutes } from './design';

/** An item of trackwork the hand edits apply to: a check rail, a flangeway cut, a points set. */
export interface TrackworkItem { kind: 'check' | 'groove' | 'points'; key: string; at: [number, number]; pts: [number, number][]; off?: boolean; len?: number; toe?: number }

/** A built piece: its mesh in the design (for the view) and its STL (in its own frame, to print). */
export interface Piece { name: string; color: number; positions: Float32Array; stl: Uint8Array }

// Pieces built before, by what they were built from: an edit rebuilds only
// the pieces it changes (the worker keeps this between builds).
const memo = new Map<string, unknown>();
function cached<T>(key: string, f: () => T): T {
  if (memo.has(key)) { const v = memo.get(key) as T; memo.delete(key); memo.set(key, v); return v; }
  const v = f();
  memo.set(key, v);
  if (memo.size > 48) memo.delete(memo.keys().next().value!);
  return v;
}
const stlOf = new WeakMap<Man, Uint8Array>();

export function buildDesign(w: Wasm, design: Design) {
  const routes = toRoutes(design).filter((r) => r.segments.length > 0);
  if (routes.length === 0) throw new Error('Draw some track: click a grid point to start, then click where it should go.');
  const t0 = performance.now();
  const gauge = (design.gaugeStuds + 1) * 8;
  const o = { ...OPTION_DEFAULTS, ...design.options };
  const solverOpts = { gauge, step: 0.5, flangeway: o.flangeway, checkRailLen: o.checkRailLen, checkRailW: o.checkRailW };
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
  for (const sp of sol.splits) { const at = splitAt(sp), key = keyOf(at); items.push({ kind: 'points', key, at, pts: [at], toe: tw.points?.[key]?.toe ?? 0 }); }
  const toeShift = (q: [number, number]) => tw.points?.[keyOf(q)]?.toe ?? 0;
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
  const params = { ...BASE_DEFAULTS, ...o, gaugeStuds: design.gaugeStuds, studGrip: design.grip ?? 'edges', pointsPieces: design.pointsPieces ?? 1 };

  let pc = planPieces(routes, sol.splits, params, toeShift);
  // Switches that merge back in, cross other track, or can't stand on their
  // own (a crossover, a switch on a crossing): the whole design as one
  // network piece with the points built in.
  const groupOf = (r: number) => pc.switches.findIndex((sw) => sw.covers.some((c) => c[0] === r));
  const network = sol.splits.length > 0 && (sol.splits.some((sp) => sp.merge) || pc.warnings.length > 0
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
    if (!bp) return add(name, 0x6f7780, world, world);
    const b = world.boundingBox(), lines: CutLine[] = [];
    const ox = (o.baseplateX ?? 0) * 8, oy = (o.baseplateY ?? 0) * 8;
    for (let x = ox + Math.ceil((b.min[0] + 1 - ox) / bp) * bp; x < b.max[0] - 1; x += bp) lines.push({ p: [x, 0], d: [0, 1] });
    for (let y = oy + Math.ceil((b.min[1] + 1 - oy) / bp) * bp; y < b.max[1] - 1; y += bp) lines.push({ p: [0, y], d: [1, 0] });
    const cells = cached(`cut:${bp}:${JSON.stringify(b)}:${JSON.stringify(pieceRoutes)}:${world.volume().toFixed(3)}`, () => cutPiece(scad, track, world, pieceRoutes, lines));
    cells.forEach((m, k) => add(cells.length > 1 ? `${name}-plate${k + 1}` : name, 0x6f7780, m, m));
    if (cells.some((m) => !fitsBed(m))) bedWarnings.add(`a baseplate's worth of track doesn't fit the ${o.printBedX} x ${o.printBedY} print bed: pick smaller baseplates`);
  };
  const add = (name: string, color: number, local: Man, world: Man) => {
    const wm = world.getMesh(), positions = new Float32Array(wm.triVerts.length * 3);
    wm.triVerts.forEach((v, i) => positions.set(wm.vertProperties.subarray(v * wm.numProp, v * wm.numProp + 3), i * 3));
    let stl = stlOf.get(local);
    if (!stl) { stl = stlBytes(local.getMesh()); stlOf.set(local, stl); }
    pieces.push({ name, color, positions, stl: stl.slice() });
    volume += local.volume();
  };
  if (network) {
    const copt = { ...CROSSING_DEFAULTS, gaugeStuds: design.gaugeStuds, grip: design.grip ?? 'edges', flangeway: o.flangeway, flangewayDepth: o.flangewayDepth, checkRailW: o.checkRailW };
    editChecks(routes, sol.checkRails);
    const net = cached(`net:${JSON.stringify({ routes, params, copt, tw })}`, () => { const grips: [number, number][] = []; return { ...networkPiece(scad, routes, sol, params, copt, grips, toeShift, grooveCuts), grips }; });
    overlay.grips.push(...net.grips);
    addTrack('track', net.body, routes);
    for (const m of net.moving) add(m.name, m.color, m.local, m.world);
    pc = { switches: [], rest: [], warnings: [...net.warnings] };
    pc.warnings.push(...(fitsBed(net.body) || bp ? [] : [`the piece doesn't fit the ${o.printBedX} x ${o.printBedY} print bed (cutting a piece with built-in points comes later)`]));
  }
  if (pc.rest.length) {
    const copt = { ...CROSSING_DEFAULTS, gaugeStuds: design.gaugeStuds, grip: design.grip ?? 'edges', flangeway: o.flangeway, flangewayDepth: o.flangewayDepth, checkRailW: o.checkRailW };
    // Does a piece fit the print bed (either way round)?
    const fits = (m: Man) => {
      const b = m.boundingBox(), w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
      return (w <= o.printBedX && h <= o.printBedY) || (w <= o.printBedY && h <= o.printBedX);
    };
    const rest = pc.rest;
    const restSol = solve(rest, solverOpts);
    editChecks(rest, restSol.checkRails);
    const built = cached(`cx:${JSON.stringify({ rest, copt, solverOpts, tw })}`, () => { const grips: [number, number][] = []; return { m: crossingPiece(scad, rest, copt, restSol, grips, { cuts: grooveCuts }), grips }; });
    const whole = built.m;
    overlay.grips.push(...built.grips);
    if (fits(whole) || pc.rest.length > 1) {
      if (!fits(whole) && !bp) pc.warnings.push(`the fixed trackwork doesn't fit the ${o.printBedX} x ${o.printBedY} print bed, and pieces with crossings aren't split yet`);
      addTrack('track', whole, rest);
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
    const tag = pc.switches.length > 1 ? `switch${n + 1}` : 'switch';
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
  overlay.checkRails = items.filter((it) => it.kind === 'check' && !it.off).map((it) => it.pts);
  overlay.grooves = items.filter((it) => it.kind === 'groove').map((it) => it.pts);
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
