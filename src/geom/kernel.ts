// The manifold-3d kernel, loaded once (WASM). Works in Node and in a Web
// Worker.
import Module from 'manifold-3d';

export type Wasm = Awaited<ReturnType<typeof Module>>;
let loaded: Promise<Wasm> | undefined;

export function kernel(): Promise<Wasm> {
  loaded ??= Module().then((w) => {
    w.setup();
    return w;
  });
  return loaded;
}
