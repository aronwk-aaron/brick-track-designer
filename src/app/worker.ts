// Solves and builds a design off the main thread (src/app/build.ts).
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { kernel } from '../geom/kernel';
import type { Design } from './design';
import { buildDesign } from './build';

self.onmessage = async (e: MessageEvent<{ id: number; design: Design }>) => {
  const { id, design } = e.data;
  (self as unknown as Worker).postMessage({ id, progress: 'Starting', frac: 0 }); // (picked up: the page knows this worker isn't stuck)
  try {
    const { overlay, pieces, info } = buildDesign(await kernel(wasmUrl), design, (progress, frac) => (self as unknown as Worker).postMessage({ id, progress, frac }),
      (early) => (self as unknown as Worker).postMessage({ id, early }));
    (self as unknown as Worker).postMessage({ id, overlay, pieces, info }, pieces.flatMap((p) => [p.positions.buffer, p.stl.buffer, ...(p.supports ? [p.supports.buffer] : [])]));
  } catch (err) {
    // (a crash inside the kernel leaves it broken for every build after: the page starts a new worker)
    const fatal = err instanceof WebAssembly.RuntimeError || typeof err === 'number';
    (self as unknown as Worker).postMessage({ id, fatal, error: String(err instanceof Error ? err.message : typeof err === 'number' ? 'the geometry kernel failed' : err) });
  }
};
