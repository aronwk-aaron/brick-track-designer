// Solving and building a design: what the canvas draws over the track
// (flangeway cuts, check rails, crossings, points, the tubes that grip), and
// the pieces: a switch wherever routes split (base and moving parts), the
// rest as fixed trackwork. Runs in the worker (and in tests).
import { Scad, R, T, type Man } from '../geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../geom/crossing';
import type { Wasm } from '../geom/kernel';
import { stlBytes } from '../geom/stl';
import { solve } from '../route/solver';
import { railPoint, type Pose } from '../route/route';
import { BASE_DEFAULTS, switchGeometry } from '../switch/base';
import { planPieces } from '../switch/pieces';
import { type Design, toRoutes } from './design';

/** A built piece: its mesh in the design (for the view) and its STL (in its own frame, to print). */
export interface Piece { name: string; color: number; positions: Float32Array; stl: Uint8Array }

export function buildDesign(w: Wasm, design: Design) {
  const routes = toRoutes(design).filter((r) => r.segments.length > 0);
  if (routes.length === 0) throw new Error('Draw some track: click a grid point to start, then click where it should go.');
  const t0 = performance.now();
  const gauge = (design.gaugeStuds + 1) * 8;
  const sol = solve(routes, { gauge, step: 0.5 });
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
  const params = { ...BASE_DEFAULTS, gaugeStuds: design.gaugeStuds, studGrip: design.grip ?? 'edges' };
  const pc = planPieces(routes, sol.splits, params);
  const place = (m: Man, P: Pose) => T(R(m, [0, 0, P[2]]), [P[0], P[1], 0]);
  let volume = 0;
  const add = (name: string, color: number, local: Man, world: Man) => {
    const wm = world.getMesh(), positions = new Float32Array(wm.triVerts.length * 3);
    wm.triVerts.forEach((v, i) => positions.set(wm.vertProperties.subarray(v * wm.numProp, v * wm.numProp + 3), i * 3));
    pieces.push({ name, color, positions, stl: stlBytes(local.getMesh()) });
    volume += local.volume();
  };
  if (pc.rest.length) {
    const restSol = solve(pc.rest, { gauge, step: 0.5 });
    const m = crossingPiece(scad, pc.rest, { ...CROSSING_DEFAULTS, gaugeStuds: design.gaugeStuds, grip: design.grip ?? 'edges' }, restSol, overlay.grips);
    add('track', 0x6f7780, m, m);
  }
  pc.switches.forEach((sw, n) => {
    const gm = switchGeometry(scad, sw.plan), tag = pc.switches.length > 1 ? `switch${n + 1}` : 'switch';
    const base = gm.base();
    add(`${tag}-base`, 0x6f7780, base, place(base, sw.pose));
    sw.sets.forEach((_, k) => {
      const sfx = sw.sets.length > 1 ? `${k + 1}` : '';
      const pts = gm.pointsPart(k), thr = gm.throwPart(k);
      add(`${tag}-points${sfx}`, 0x4682b4, pts, place(pts, sw.pose));
      add(`${tag}-throw${sfx}`, 0xe8892b, thr, place(thr, sw.pose));
      add(`${tag}-lever${sfx}`, 0xd4af37, gm.leverPrint(), place(gm.leverPart(k), sw.pose));
    });
  });
  const all = pieces.flatMap((p) => [p.positions]);
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const ps of all) for (let i = 0; i < ps.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], ps[i + k]); mx[k] = Math.max(mx[k], ps[i + k]); }
  const info = {
    ms: performance.now() - t0, volume,
    size: [0, 1, 2].map((k) => mx[k] - mn[k]),
    crossings: sol.crossings.length, checkRails: sol.checkRails.length, splits: sol.splits.length,
    switches: pc.switches.length, pieces: pieces.length, warnings: pc.warnings,
  };
  return { overlay, pieces, info };
}
