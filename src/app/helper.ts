// A helper worker for a big build (parallel.ts): builds the jobs it's given
// in a kernel of its own.
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { kernel, KERNEL_FULL, setKernelFull } from '../geom/kernel';
import { serveHelper, type ToHelper } from './parallel';

// (as the build's own worker: stopped when the kernel's memory is nearly gone)
setKernelFull(KERNEL_FULL);
const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);
const serve = kernel(wasmUrl).then((w) => serveHelper(w, post));
// (no kernel (it couldn't be loaded): gone, so the build doesn't wait on this helper)
self.onmessage = async (e: MessageEvent<ToHelper>) => { try { (await serve)(e.data); } catch { post({ gone: true }); } };
