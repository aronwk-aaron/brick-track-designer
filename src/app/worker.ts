// Solves and builds a design off the main thread: the plan view (SVG), the
// piece's mesh and its STL.
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { kernel } from '../geom/kernel';
import { Scad } from '../geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../geom/crossing';
import { stlBytes } from '../geom/stl';
import { solve } from '../route/solver';
import { planSvg } from '../route/plan';
import { type Design, toRoutes } from './design';

self.onmessage = async (e: MessageEvent<{ id: number; design: Design }>) => {
  const { id, design } = e.data;
  try {
    const w = await kernel(wasmUrl);
    const t0 = performance.now();
    const routes = toRoutes(design).filter((r) => r.segments.length > 0);
    if (routes.length === 0) throw new Error('Add a route with at least one segment.');
    const gauge = (design.gaugeStuds + 1) * 8;
    const sol = solve(routes, { gauge, step: 0.5 });
    const svg = planSvg(routes, sol, { gauge });
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
    (self as unknown as Worker).postMessage({ id, svg, positions, stl, info }, [positions.buffer, stl.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err instanceof Error ? err.message : err) });
  }
};
