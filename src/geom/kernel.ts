// The manifold-3d kernel, loaded once (WASM). Works in Node and in a Web
// Worker.
import Module from 'manifold-3d';

export type Wasm = Awaited<ReturnType<typeof Module>>;
let loaded: Promise<Wasm> | undefined;

// In the browser, pass the URL of manifold.wasm (Vite: import
// 'manifold-3d/manifold.wasm?url').
export function kernel(wasmUrl?: string): Promise<Wasm> {
  loaded ??= withMemory(() => Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined)).then((w) => {
    w.setup();
    patch(w);
    return w;
  }, (err) => {
    // (it didn't load (offline, and not kept by the browser): said as that, and tried again the next time it's asked for)
    loaded = undefined;
    throw new KernelNotLoaded(err);
  });
  return loaded;
}
/** The kernel couldn't be loaded (its file not fetched): nothing wrong with the design. */
export class KernelNotLoaded extends Error {
  constructor(cause?: unknown) { super('the geometry kernel couldn\'t be loaded (are you offline?): reload the page once you\'re connected', { cause }); this.name = 'KernelNotLoaded'; }
}

// The kernel's memory: it only grows, to 4 GB at most. With nearly all of it taken the kernel doesn't fail, it
// crawls (a build that had taken 45 s was still "Building" ten minutes on, nothing said): so it's watched, and a
// build that takes it past FULL is stopped with KernelFull, which the page treats as a broken kernel (a new worker,
// its memory empty, and the build once more).
let memory: WebAssembly.Memory | undefined;
/** The kernel's memory now (bytes; 0 before it's loaded). */
export const kernelBytes = () => memory?.buffer.byteLength ?? 0;
/** More of the kernel's memory in use than this, in the page's workers: the build's stopped (KernelFull). */
export const KERNEL_FULL = 3.6e9;
// (no limit till it's set: the page's workers set it (worker.ts, helper.ts), where a build that crawls is waited on;
// a test that puts a whole yard together in one kernel may take all 4 GB and still end)
let full = Infinity;
/** The limit set (the workers: KERNEL_FULL; tests: what they like); hands back the one it was. */
export function setKernelFull(bytes: number) { const was = full; full = bytes; return was; }
export class KernelFull extends Error {
  constructor() { super('the geometry kernel ran out of memory'); this.name = 'KernelFull'; }
}
/** Is it the kernel's own failure (it trapped, threw one of its own, or ran out of memory): no use going on in this worker? */
export const kernelBroke = (err: unknown) => !(err instanceof KernelNotLoaded) && (err instanceof WebAssembly.RuntimeError || typeof err === 'number' || err instanceof KernelFull);
/** load run with the kernel's memory caught as its module's set up (it isn't handed out otherwise). */
async function withMemory<T>(load: () => Promise<T>): Promise<T> {
  const WA = WebAssembly as unknown as Record<string, unknown>, saved = { instantiate: WA.instantiate, instantiateStreaming: WA.instantiateStreaming };
  const catching = (f: unknown) => typeof f !== 'function' ? f : async (...a: unknown[]) => {
    const r = (await (f as (...b: unknown[]) => Promise<unknown>).apply(WebAssembly, a)) as { instance?: WebAssembly.Instance; exports?: WebAssembly.Exports };
    for (const v of Object.values((r.instance ?? (r as WebAssembly.Instance)).exports ?? {})) if (v instanceof WebAssembly.Memory) memory = v;
    return r;
  };
  WA.instantiate = catching(saved.instantiate); WA.instantiateStreaming = catching(saved.instantiateStreaming);
  try { return await load(); } finally { WA.instantiate = saved.instantiate; WA.instantiateStreaming = saved.instantiateStreaming; }
}

// Freeing kernel memory. The kernel's solids live in WASM memory until their
// JS handles are deleted; the garbage collector only gets to them after a
// build ends, so a big build (a yard, in tiles) would run out of memory
// part way. arena() records every solid and cross-section made while f runs
// and deletes them all afterwards, except the ones kept (a kept solid holds
// on to what it was made from inside the kernel, so that's safe).
export type Handle = { delete(): void; isDeleted?(): boolean };
let recording: Set<Handle> | undefined;
// (every solid noted once, by whoever was recording when it was made (no one: made outside, never deleted here): a
// call that hands back a solid made before (a union of one thing can) doesn't make it the caller's to delete)
const seen = new WeakSet<object>();
const patched = new WeakSet<object>();
let calls = 0;
// (the solids worked out: asked something that needs their triangles. Till then a solid is only the booleans to do,
// and holds on to what they're done to)
const worked = new WeakSet<object>();
const WORKS_OUT = new Set(['numTri', 'numVert', 'numEdge', 'boundingBox', 'volume', 'surfaceArea', 'getMesh', 'isEmpty', 'status', 'genus', 'decompose', 'slice', 'project']);
/** Has the solid been worked out (or is it a cross-section, which always is)? */
export const isWorked = (h: unknown) => worked.has(h as object) || typeof (h as { numTri?: unknown }).numTri !== 'function';
function patch(w: Wasm) {
  if (patched.has(w)) return;
  patched.add(w);
  const classes = [w.Manifold, w.CrossSection] as unknown as (Record<string, unknown> & { prototype: Record<string, unknown> })[];
  const isOne = (v: unknown) => classes.some((c) => v instanceof (c as unknown as new () => object));
  const one = (x: unknown) => {
    if (!isOne(x) || seen.has(x as object)) return;
    seen.add(x as object);
    recording?.add(x as Handle);
  };
  const note = (r: unknown) => { if (Array.isArray(r)) r.forEach(one); else one(r); };
  const wrap = (obj: Record<string, unknown>, solids: boolean) => {
    for (const k of Object.getOwnPropertyNames(obj)) {
      if (k.startsWith('_') || k === 'constructor' || k === 'delete' || k === 'prototype') continue;
      const d = Object.getOwnPropertyDescriptor(obj, k);
      if (!d || typeof d.value !== 'function' || !d.writable) continue;
      const f = d.value as (...a: unknown[]) => unknown;
      if (solids && k === 'boundingBox') rawBox = f as typeof rawBox;
      const works = WORKS_OUT.has(k);
      const carry = solids ? CARRY[k] : undefined;
      obj[k] = function (this: unknown, ...a: unknown[]) {
        // (every so often: is the kernel's memory nearly gone?)
        if ((++calls & 31) === 0 && memory && memory.buffer.byteLength > full) throw new KernelFull();
        const r = f.apply(this, a); if (works && this && typeof this === 'object') worked.add(this); note(r);
        // (a part's supports go through what the part goes through: Supports, below)
        return carry && carried ? carry(w, this, a, r) : r;
      };
    }
  };
  // (the instances' methods are on the kernel's own class prototypes, not on
  // the JS constructors' .prototype: found from an instance of each)
  const solidProto = Object.getPrototypeOf(w.Manifold.cube([1, 1, 1])) as Record<string, unknown>, sectionProto = Object.getPrototypeOf(w.CrossSection.square([1, 1])) as Record<string, unknown>;
  for (const c of classes) wrap(c, c === (w.Manifold as unknown));
  wrap(solidProto, true);
  if (sectionProto !== solidProto) wrap(sectionProto, false);
}
/**
 * The kept ones of what was made worked out now, before the rest is deleted. The kernel puts off each boolean till
 * its result is asked about, and works out a chain of them in one go where nothing else holds its steps: with the
 * steps deleted first it grouped them differently, and the same piece came out a few mm3 different. Worked out
 * with everything still there, it's what it was.
 */
export function settle(made: Iterable<Handle>, kept: Set<unknown>) {
  for (const h of made) if (kept.has(h) && !h.isDeleted?.()) (h as { numTri?: () => number }).numTri?.();
}
export function arena<T>(w: Wasm, f: () => T, keep: (r: T) => unknown[]): T {
  patch(w);
  const outer = recording, mine = new Set<Handle>();
  recording = mine;
  let r: T;
  try { r = f(); } catch (err) {
    // (it failed part way: what it made is left to whoever's recording outside, which may yet look at it)
    if (outer) for (const h of mine) outer.add(h);
    throw err;
  } finally { recording = outer; }
  const kept = new Set(keep(r));
  // (a kept part's supports kept with it)
  for (const k of [...kept]) { const sp = k && typeof k === 'object' ? sups.get(k) : undefined; if (sp) kept.add(sp); }
  settle(mine, kept);
  for (const h of mine) if (!kept.has(h) && !h.isDeleted?.()) h.delete();
  // (the kept ones it made belong to whoever's recording outside, if anyone; a kept one made before stays whose it was)
  if (outer) for (const h of mine) if (kept.has(h)) outer.add(h);
  return r;
}

/**
 * f run with every solid and cross-section it makes noted in `into`, none deleted: for whoever owns them to delete
 * when they're done with (the build's cache, by what each kept piece still uses: app/solidcache.ts).
 */
export function recordInto<T>(into: Set<Handle>, f: () => T): T {
  const outer = recording;
  recording = into;
  try { return f(); } finally { recording = outer; }
}

/** A solid or cross-section made with new, which the kernel's patched methods don't see: noted as their results are. */
export function made<T extends object>(x: T): T {
  if (!seen.has(x)) { seen.add(x); recording?.add(x as unknown as Handle); }
  return x;
}

/** Is it a kernel solid or cross-section (something to delete)? */
export const isHandle = (x: unknown): x is Handle => !!x && typeof x === 'object' && typeof (x as Handle).delete === 'function' && typeof (x as Handle).isDeleted === 'function';

/** The solids and cross-sections in a value: itself, or in its arrays, objects, maps and sets, however deep. */
export function handlesIn(v: unknown, out = new Set<Handle>(), walked = new Set<object>()): Set<Handle> {
  if (!v || typeof v !== 'object' || ArrayBuffer.isView(v) || v instanceof ArrayBuffer || walked.has(v)) return out;
  walked.add(v);
  if (isHandle(v)) { out.add(v); const sp = sups.get(v); if (sp) out.add(sp); return out; }
  if (Array.isArray(v) || v instanceof Set) for (const x of v) handlesIn(x, out, walked);
  else if (v instanceof Map) for (const [k, x] of v) { handlesIn(k, out, walked); handlesIn(x, out, walked); }
  else for (const x of Object.values(v)) handlesIn(x, out, walked);
  return out;
}

/** Delete them (the ones not deleted already). */
export function free(hs: Iterable<Handle>) { for (const h of hs) if (!h.isDeleted?.()) h.delete(); }

/**
 * A solid as a fresh one from its own mesh, its triangles only: none of the
 * record of what it was made from (the runs of triangles from each original
 * solid, which a part cut from a part cut from a piece has thousands of). The
 * kernel's decompose() goes through that record for every body it finds:
 * on such a part it took most of a gigabyte, and a few of them ran the
 * kernel out of memory (it aborts).
 */
export function flat<M>(w: Wasm, m: M, supports = true): M {
  const g = (m as unknown as { getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array; mergeFromVert: Uint32Array; mergeToVert: Uint32Array } }).getMesh();
  const mesh = new w.Mesh({ numProp: g.numProp, vertProperties: g.vertProperties, triVerts: g.triVerts, mergeFromVert: g.mergeFromVert, mergeToVert: g.mergeToVert });
  const out = made(new w.Manifold(mesh));
  // (its supports with it, flat too; supports false: the part alone)
  const sp = supports ? supportsOf(m as unknown as Solid) : undefined;
  if (sp) sups.set(out, flat(w, sp));
  return out as unknown as M;
}

// Supports. A part's breakaway print supports (the small loose bits printed with it: under rail ends, in sprung
// blades' pockets) are solids of their own, never part of the part's solid: a support that was unioned into its part
// and touched it became the part (not shown or counted as a support, not broken off, and hiding an overhang). They
// are carried with the part instead: noted here against the part's solid, and put through whatever the part is put
// through, by the kernel's own methods (patch): moved as it's moved, cut as it's cut (a cut cuts both), joined when
// parts are joined, and, where a part is taken apart into its bodies (decompose), each support with the body nearest
// it. So no builder or cutter has to pass them along, and none can forget to. The part's solid is the part alone:
// its triangles, volume and slices are without its supports; only its box is with them (boundingBox: the room it
// takes on the print bed, as ever). They're owned with their part (arena's kept, handlesIn), and made the part's
// file's loose bodies, kept clear of the part, in one place (geom/supports.ts finishSupports).
type Solid = InstanceType<Wasm['Manifold']>;
const sups = new WeakMap<object, Solid>();
/** (is any solid carrying supports yet: till then nothing's looked up) */
let carried = false;
/** A part's supports (one solid, its bodies the supports); undefined: it has none. */
export function supportsOf(m: Solid): Solid | undefined {
  const sp = sups.get(m);
  return sp && !(sp as unknown as Handle).isDeleted?.() && !sp.isEmpty() ? sp : undefined;
}
let rawBox: ((this: Solid) => { min: number[]; max: number[] }) | undefined;
/** A part's own box, without its supports (boundingBox is with them). */
export const partBox = (m: Solid): { min: number[]; max: number[] } => (rawBox ? rawBox.call(m) : m.boundingBox() as { min: number[]; max: number[] });
/** A support, to be joined to its part as any solid is (a union): an empty part carrying it. */
export function asSupport(w: Wasm, support: Solid): Solid {
  const none = w.Manifold.union([]) as Solid, inner = has(support);
  // (a support with supports of its own: all of them)
  const all = inner ? support.add(inner) : support;
  sups.delete(all); sups.set(none, all); carried = true;
  return none;
}
/** part with these supports (and its own): a solid of its own (part itself with none to add). */
export function withSupports(w: Wasm, part: Solid, supports: Solid | undefined): Solid {
  return supports ? part.add(asSupport(w, supports)) : part;
}
/** The supports of r set: sp's (undefined or empty: none). */
const give = <R>(r: R, sp: Solid | undefined): R => { if (sp && r && typeof r === 'object') sups.set(r, sp); return r; };
const has = (x: unknown): Solid | undefined => (x && typeof x === 'object' ? sups.get(x) : undefined);
/** (a solid of its own, the same shape: no two parts share a supports solid, each owner deletes its own) */
const own = (sp: Solid) => sp.translate([0, 0, 0]);
const joined = (w: Wasm, sps: (Solid | undefined)[]) => { const l = sps.filter((x): x is Solid => !!x); return l.length > 1 ? w.Manifold.union(l) as Solid : l.length ? own(l[0]) : undefined; };
const boxGap = (a: { min: ArrayLike<number>; max: ArrayLike<number> }, b: { min: ArrayLike<number>; max: ArrayLike<number> }) =>
  Math.hypot(Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]), Math.max(0, a.min[1] - b.max[1], b.min[1] - a.max[1]), Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2]));
/** (mm3) A body this small is a chip, not a part (the cutters drop loose bits of 1 to 20 mm3). */
const CHIP = 20;
type Carry = (w: Wasm, self: unknown, a: unknown[], r: unknown) => unknown;
/** moved: the supports moved the same way */
const moved = (k: string): Carry => (_w, self, a, r) => { const sp = has(self); return sp && r !== self ? give(r, (sp as unknown as Record<string, (...b: unknown[]) => Solid>)[k](...a)) : r; };
/** unchanged in shape: the supports as they are */
const same: Carry = (_w, self, _a, r) => { const sp = has(self); return sp && r !== self ? give(r, own(sp)) : r; };
/** the solids a call was given: two, or a list */
const listOf = (a: unknown[]) => (Array.isArray(a[0]) ? a[0] : a) as Solid[];
const CARRY: Record<string, Carry> = {
  translate: moved('translate'), rotate: moved('rotate'), scale: moved('scale'), mirror: moved('mirror'), transform: moved('transform'), warp: moved('warp'), warpBatch: moved('warpBatch'),
  refine: same, refineToLength: same, refineToTolerance: same, simplify: same, setTolerance: same, asOriginal: same, calculateNormals: same, calculateCurvature: same, smoothOut: same, smoothByNormals: same, withContext: same,
  // (cut as the part is: by the other solid, not by its supports)
  subtract: moved('subtract'), trimByPlane: moved('trimByPlane'),
  intersect: (w, self, a, r) => { const sp = has(self), so = has(a[0]); return sp || so ? give(r, joined(w, [sp?.intersect(a[0] as Solid), so?.intersect(self as Solid)])) : r; },
  add: (w, self, a, r) => { const sp = has(self), so = has(a[0]); return (sp || so) && r !== self && r !== a[0] ? give(r, joined(w, [sp, so])) : r; },
  split: (_w, self, a, r) => { const sp = has(self); if (sp) { const [x, y] = sp.split(a[0] as Solid); give((r as Solid[])[0], x); give((r as Solid[])[1], y); } return r; },
  splitByPlane: (_w, self, a, r) => { const sp = has(self); if (sp) { const [x, y] = sp.splitByPlane(a[0] as [number, number, number], a[1] as number); give((r as Solid[])[0], x); give((r as Solid[])[1], y); } return r; },
  // (the class's own: of two solids or a list)
  union: (w, _self, a, r) => { const l = listOf(a); return l.some(has) && !l.includes(r as Solid) ? give(r, joined(w, l.map(has))) : r; },
  compose: (w, _self, a, r) => { const l = listOf(a); return l.some(has) && !l.includes(r as Solid) ? give(r, joined(w, l.map(has))) : r; },
  difference: (w, _self, a, r) => { const l = listOf(a), sp = has(l[0]); return sp && r !== l[0] ? give(r, l.length > 1 ? w.Manifold.difference([sp, ...l.slice(1)]) as Solid : own(sp)) : r; },
  intersection: (w, _self, a, r) => { const l = listOf(a); return l.some(has) && !l.includes(r as Solid) ? give(r, joined(w, l.map((m, i) => { const sp = has(m); return sp && (w.Manifold.intersection([sp, ...l.filter((_, j) => j !== i)]) as Solid); }))) : r; },
  // (each support with the body nearest it: the one it's printed for)
  decompose: (w, self, _a, r) => {
    const sp = has(self), bodies = r as Solid[];
    if (!sp || !bodies.length || sp.isEmpty()) return r;
    if (bodies.length === 1) return [give(bodies[0], own(sp))];
    // (not with a chip of the part a cut left, CHIP mm3 or less, which is dropped next: its supports would go with it)
    const boxes = bodies.map((b) => b.boundingBox()), mine: Solid[][] = bodies.map(() => []), real = bodies.map((b) => b.volume() > CHIP), from = real.some((x) => x) ? real : real.map(() => true);
    for (const one of sp.decompose()) { const sb = one.boundingBox(); let best = from.indexOf(true); boxes.forEach((bx, k) => { if (from[k] && boxGap(sb, bx) < boxGap(sb, boxes[best])) best = k; }); mine[best].push(one); }
    bodies.forEach((b, k) => give(b, joined(w, mine[k])));
    return r;
  },
  // (the room it takes: with its supports)
  boundingBox: (_w, self, _a, r) => {
    const sp = has(self);
    if (!sp || (sp as unknown as Handle).isDeleted?.() || sp.isEmpty()) return r;
    const p = r as { min: number[]; max: number[] }, q = sp.boundingBox() as { min: number[]; max: number[] };
    if ((self as Solid).isEmpty()) return q;
    return { min: p.min.map((v, k) => Math.min(v, q.min[k])), max: p.max.map((v, k) => Math.max(v, q.max[k])) };
  },
};

