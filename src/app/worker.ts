// Solves and builds a design off the main thread (src/app/build.ts), a big
// one's heavy jobs shared out among helper workers (parallel.ts, helper.ts).
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { kernel } from '../geom/kernel';
import type { Design } from './design';
import { buildShared, CANCELLED, type FromHelper, helperCount, type HelperPort } from './parallel';

const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);
const spawn = (): HelperPort => {
  const wk = new Worker(new URL('./helper.ts', import.meta.url), { type: 'module' });
  return {
    post: (m) => wk.postMessage(m),
    listen: (f) => { wk.onmessage = (e: MessageEvent<FromHelper>) => f(e.data); wk.onerror = () => f({ gone: true }); },
    close: () => wk.terminate(),
  };
};
// (the build going now: a newer one stops it while it waits on its helpers)
let current = 0;
self.onmessage = async (e: MessageEvent<{ id: number; design: Design }>) => {
  const { id, design } = e.data;
  current = id;
  post({ id, progress: 'Starting', frac: 0 }); // (picked up: the page knows this worker isn't stuck)
  try {
    const { overlay, pieces, info } = await buildShared(await kernel(wasmUrl), design, spawn, helperCount(navigator.hardwareConcurrency),
      (progress, frac) => post({ id, progress, frac }), (early) => post({ id, early }), () => current !== id);
    post({ id, overlay, pieces, info }, pieces.flatMap((p) => [p.positions.buffer, p.stl.buffer, ...(p.supports ? [p.supports.buffer] : [])]));
  } catch (err) {
    if (err === CANCELLED) return;
    // (a crash inside the kernel leaves it broken for every build after: the page starts a new worker)
    const fatal = err instanceof WebAssembly.RuntimeError || typeof err === 'number';
    post({ id, fatal, error: String(err instanceof Error ? err.message : typeof err === 'number' ? 'the geometry kernel failed' : err) });
  }
};
