// Solves and builds a design off the main thread: what the canvas draws over
// the track (flangeway cuts, check rails, crossings, points), the piece's mesh
// and its STL.
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { kernel } from '../geom/kernel';
import { Scad } from '../geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../geom/crossing';
import { stlBytes } from '../geom/stl';
import { solve } from '../route/solver';
import { railPoint } from '../route/route';
import { type Design, toRoutes } from './design';

self.onmessage = async (e: MessageEvent<{ id: number; design: Design }>) => {
  const { id, design } = e.data;
  try {
    const w = await kernel(wasmUrl);
    const t0 = performance.now();
    const routes = toRoutes(design).filter((r) => r.segments.length > 0);
    if (routes.length === 0) throw new Error('Draw some track: click a grid point to start, then click where it should go.');
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
    };
    const m = crossingPiece(new Scad(w), routes, { ...CROSSING_DEFAULTS, gaugeStuds: design.gaugeStuds }, sol);
    const mesh = m.getMesh();
    const positions = new Float32Array(mesh.triVerts.length * 3);
    mesh.triVerts.forEach((v, i) => positions.set(mesh.vertProperties.subarray(v * mesh.numProp, v * mesh.numProp + 3), i * 3));
    const stl = stlBytes(mesh);
    const box = m.boundingBox();
    const info = {
      ms: performance.now() - t0, tris: mesh.triVerts.length / 3, volume: m.volume(),
      size: [0, 1, 2].map((k) => box.max[k] - box.min[k]),
      crossings: sol.crossings.length, checkRails: sol.checkRails.length, splits: sol.splits.length,
    };
    m.delete();
    (self as unknown as Worker).postMessage({ id, overlay, positions, stl, info }, [positions.buffer, stl.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err instanceof Error ? err.message : err) });
  }
};
