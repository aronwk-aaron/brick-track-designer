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
    (self as unknown as Worker).postMessage({ id, overlay, pieces, info }, pieces.flatMap((p) => [p.positions.buffer, p.stl.buffer]));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err instanceof Error ? err.message : err) });
  }
};
