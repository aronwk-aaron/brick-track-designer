// The manifold-3d kernel, loaded once (WASM). Works in Node and in a Web
// Worker.
import Module from 'manifold-3d';

export type Wasm = Awaited<ReturnType<typeof Module>>;
let loaded: Promise<Wasm> | undefined;

// In the browser, pass the URL of manifold.wasm (Vite: import
// 'manifold-3d/manifold.wasm?url').
export function kernel(wasmUrl?: string): Promise<Wasm> {
  loaded ??= Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined).then((w) => {
    w.setup();
    return w;
  });
  return loaded;
}
