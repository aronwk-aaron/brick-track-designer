// Solving and building a design: what the canvas draws over the track
// (flangeway cuts, check rails, crossings, points, the tubes that grip), and
// the pieces: a switch wherever routes split (base and moving parts), the
// rest as fixed trackwork. Runs in the worker (and in tests).
import { Scad, R, T, type Man } from '../geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../geom/crossing';
import type { Wasm } from '../geom/kernel';
import { stlBytes } from '../geom/stl';
import { solve } from '../route/solver';
import { railPoint, routeLength, type Pose } from '../route/route';
import { BASE_DEFAULTS, switchGeometry } from '../switch/base';
import { planPieces, subRoute } from '../switch/pieces';
import { networkPiece } from '../switch/network';
import { type Design, OPTION_DEFAULTS, toRoutes } from './design';

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
  const overlay = {
    grooves: sol.grooves.map((gr) => along(gr.route, gr.side * g, gr.s0, gr.s1)),
    checkRails: sol.checkRails.map((c) => along(c.route, c.offset + c.width / 2, c.s0, c.s1)),
    crossings: sol.crossings.map((c) => c.point),
    splits: sol.splits.map((sp) => railPoint(routes[sp.routes[0]], sp.spans[0][0], 0)),
    grips: [] as [number, number][],
  };
  // Pieces: a switch wherever routes split, the rest as fixed trackwork.
  const scad = new Scad(w), pieces: Piece[] = [];
  const params = { ...BASE_DEFAULTS, ...o, gaugeStuds: design.gaugeStuds, studGrip: design.grip ?? 'edges', pointsPieces: design.pointsPieces ?? 1 };

  let pc = planPieces(routes, sol.splits, params);
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
    const net = cached(`net:${JSON.stringify({ routes, params, copt })}`, () => { const grips: [number, number][] = []; return { ...networkPiece(scad, routes, sol, params, copt, grips), grips }; });
    overlay.grips.push(...net.grips);
    add('track', 0x6f7780, net.body, net.body);
    for (const m of net.moving) add(m.name, m.color, m.local, m.world);
    pc = { switches: [], rest: [], warnings: [...net.warnings] };
    pc.warnings.push(...(fitsBed(net.body) ? [] : [`the piece doesn't fit the ${o.printBedX} x ${o.printBedY} print bed (cutting a piece with built-in points comes later)`]));
  }
  if (pc.rest.length) {
    const copt = { ...CROSSING_DEFAULTS, gaugeStuds: design.gaugeStuds, grip: design.grip ?? 'edges', flangeway: o.flangeway, flangewayDepth: o.flangewayDepth, checkRailW: o.checkRailW };
    // Does a piece fit the print bed (either way round)?
    const fits = (m: Man) => {
      const b = m.boundingBox(), w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
      return (w <= o.printBedX && h <= o.printBedY) || (w <= o.printBedY && h <= o.printBedX);
    };
    const rest = pc.rest;
    const built = cached(`cx:${JSON.stringify({ rest, copt, solverOpts })}`, () => { const grips: [number, number][] = []; return { m: crossingPiece(scad, rest, copt, solve(rest, solverOpts), grips), grips }; });
    const whole = built.m;
    overlay.grips.push(...built.grips);
    if (fits(whole) || pc.rest.length > 1) {
      if (!fits(whole)) pc.warnings.push(`the fixed trackwork doesn't fit the ${o.printBedX} x ${o.printBedY} print bed, and pieces with crossings aren't split yet`);
      add('track', 0x6f7780, whole, whole);
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
    const gm = cached(`sw:${JSON.stringify({ routes: sw.routes, sets: sw.sets, params })}`, () => {
      const g = switchGeometry(scad, sw.plan);
      return { bases: g.basePieces(), grips: g.grips, sets: sw.sets.map((_, k) => ({ thr: g.throwPart(k), pp: g.pointsParts(k), print: g.leverPrint(), lever: g.leverPart(k) })) };
    });
    const bases = gm.bases;
    // (its tubes, for the plan's grip marks, in the design's frame)
    const cz = Math.cos((sw.pose[2] * Math.PI) / 180), sz = Math.sin((sw.pose[2] * Math.PI) / 180);
    for (const [x, y] of gm.grips) overlay.grips.push([sw.pose[0] + x * cz - y * sz, sw.pose[1] + x * sz + y * cz]);
    bases.forEach((m, j) => add(bases.length > 1 ? `${tag}-base${j + 1}` : `${tag}-base`, 0x6f7780, m, place(m, sw.pose)));
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
    switches: network ? sol.splits.length : pc.switches.length, pieces: pieces.length, warnings: pc.warnings,
  };
  return { overlay, pieces, info };
}
