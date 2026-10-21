// A helper worker for a big build (parallel.ts): builds the jobs it's given
// in a kernel of its own.
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { kernel } from '../geom/kernel';
import { serveHelper, type ToHelper } from './parallel';

const serve = kernel(wasmUrl).then((w) => serveHelper(w, (m, transfer) => (self as unknown as Worker).postMessage(m, transfer)));
self.onmessage = async (e: MessageEvent<ToHelper>) => (await serve)(e.data);
