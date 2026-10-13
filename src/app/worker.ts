// Builds pieces off the main thread.
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { kernel } from '../geom/kernel';
import { buildRails, type RailsSpec } from '../geom/pieces';
import { stlBytes } from '../geom/stl';

self.onmessage = async (e: MessageEvent<RailsSpec>) => {
  const w = await kernel(wasmUrl);
  const t0 = performance.now();
  const m = buildRails(w, e.data);
  const mesh = m.getMesh();
  const ms = performance.now() - t0;
  const positions = new Float32Array(mesh.triVerts.length * 3);
  mesh.triVerts.forEach((v, i) => positions.set(mesh.vertProperties.subarray(v * mesh.numProp, v * mesh.numProp + 3), i * 3));
  const stl = stlBytes(mesh);
  (self as unknown as Worker).postMessage({ positions, stl, ms, tris: mesh.triVerts.length / 3, volume: m.volume() }, [positions.buffer, stl.buffer]);
  m.delete();
};
