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
    patch(w);
    return w;
  });
  return loaded;
}

// Freeing kernel memory. The kernel's solids live in WASM memory until their
// JS handles are deleted; the garbage collector only gets to them after a
// build ends, so a big build (a yard, in tiles) would run out of memory
// part way. arena() records every solid and cross-section made while f runs
// and deletes them all afterwards, except the ones kept (a kept solid holds
// on to what it was made from inside the kernel, so that's safe).
type Handle = { delete(): void; isDeleted?(): boolean };
let recording: Set<Handle> | undefined;
// (made outside any arena: never deleted by one, even if an arena's call
// hands it back, as a union of one thing can)
const outside = new WeakSet<object>();
const patched = new WeakSet<object>();
function patch(w: Wasm) {
  if (patched.has(w)) return;
  patched.add(w);
  const classes = [w.Manifold, w.CrossSection] as unknown as (Record<string, unknown> & { prototype: Record<string, unknown> })[];
  const isHandle = (v: unknown) => classes.some((c) => v instanceof (c as unknown as new () => object));
  const one = (x: unknown) => {
    if (!isHandle(x)) return;
    if (!recording) outside.add(x as object);
    else if (!outside.has(x as object)) recording.add(x as Handle);
  };
  const note = (r: unknown) => { if (Array.isArray(r)) r.forEach(one); else one(r); };
  const wrap = (obj: Record<string, unknown>) => {
    for (const k of Object.getOwnPropertyNames(obj)) {
      if (k.startsWith('_') || k === 'constructor' || k === 'delete' || k === 'prototype') continue;
      const d = Object.getOwnPropertyDescriptor(obj, k);
      if (!d || typeof d.value !== 'function' || !d.writable) continue;
      const f = d.value as (...a: unknown[]) => unknown;
      obj[k] = function (this: unknown, ...a: unknown[]) { const r = f.apply(this, a); note(r); return r; };
    }
  };
  // (the instances' methods are on the kernel's own class prototypes, not on
  // the JS constructors' .prototype: found from an instance of each)
  const protos = new Set<Record<string, unknown>>([w.Manifold.cube([1, 1, 1]), w.CrossSection.square([1, 1])].map((x) => Object.getPrototypeOf(x)));
  for (const c of classes) wrap(c);
  for (const pr of protos) wrap(pr);
}
export function arena<T>(w: Wasm, f: () => T, keep: (r: T) => unknown[]): T {
  patch(w);
  const outer = recording, mine = new Set<Handle>();
  recording = mine;
  let r: T;
  try { r = f(); } finally { recording = outer; }
  const kept = new Set(keep(r));
  for (const h of mine) if (!kept.has(h) && !h.isDeleted?.()) h.delete();
  // (kept ones belong to whoever's recording outside, if anyone)
  if (outer) for (const h of kept) outer.add(h as Handle);
  else for (const h of kept) outside.add(h as object);
  return r;
}

/**
 * A solid as a fresh one from its own mesh, its triangles only: none of the
 * record of what it was made from (the runs of triangles from each original
 * solid, which a part cut from a part cut from a piece has thousands of). The
 * kernel's decompose() goes through that record for every body it finds:
 * on such a part it took most of a gigabyte, and a few of them ran the
 * kernel out of memory (it aborts).
 */
export function flat<M>(w: Wasm, m: M): M {
  const g = (m as unknown as { getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array; mergeFromVert: Uint32Array; mergeToVert: Uint32Array } }).getMesh();
  const mesh = new w.Mesh({ numProp: g.numProp, vertProperties: g.vertProperties, triVerts: g.triVerts, mergeFromVert: g.mergeFromVert, mergeToVert: g.mergeToVert });
  return new w.Manifold(mesh) as unknown as M;
}
