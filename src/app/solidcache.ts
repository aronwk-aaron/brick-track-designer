// The build's solids, owned: every solid the kernel makes lives in its memory (WASM, 4 GB at most) until it's
// deleted by hand; left to the garbage collector they never were in time, and each build left its solids behind till
// the kernel ran out (a dozen small builds in one worker: 2 GB). So every solid has an owner that deletes it:
//  - a cache entry (SolidCache: a piece built before, kept by what it was built from) owns the solids in its value,
//    and deletes them when it's dropped (not used for a few builds, or the cache full); what else its making made
//    is deleted once its value's solids are worked out;
//  - the build (buildScope) owns the rest of what it makes, and deletes it when it ends (its pieces are plain data
//    by then: meshes and files).
// An entry whose value has another entry's solid in it (a cut piece's parts, one of them the piece itself) depends
// on it: used when it's used, and dropped with it.
import { free, type Handle, handlesIn, isWorked, recordInto, settle } from '../geom/kernel';

interface Entry { v: unknown; own: Handle[]; /** what else its making made, kept till its value's worked out */ rest: Handle[]; keep: Set<Handle>; deps: Set<Entry>; used: number; live: boolean }
/** an entry kept this many builds after the last that used it (an undo or two finds its pieces built) */
const KEEP_BUILDS = 4;
const caches = new Set<SolidCache>();
const ownerOf = new WeakMap<object, Entry>();
/** the entries being made (one's making can ask for another) */
const making: Entry[] = [];
/** the entries with leftovers of their making still kept */
const unsettled = new Set<Entry>();
/** the build going on: its number, how deep (a build inside a build is part of it), the solids it owns */
let gen = 0, depth = 0, buildOwn: Set<Handle> | undefined;
/** a plan's solids (buildScope's park), kept for its jobs till the next plan */
let parked: Set<Handle> | undefined, parkedGen = 0;

const touch = (e: Entry) => { if (e.used === gen) return; e.used = gen; for (const d of e.deps) touch(d); };

export class SolidCache {
  private memo = new Map<string, Entry>();
  /** max: how many entries it keeps (the ones the build going on uses aside, while a plan's jobs wait on them) */
  constructor(private max: number) { caches.add(this); }

  /**
   * What f makes, kept under key: made once, found after. now: its value's solids are all used at once (a piece's
   * body, its cut parts), so they're worked out here and the rest of what f made deleted straight away; else the
   * rest is kept till the value's solids have all been worked out by whoever uses them (a switch's parts, some never
   * asked for: working them all out to delete the rest made a switch take half as long again). Either way a solid
   * is worked out with what it's made from still there (kernel.ts settle), so it comes out as it always did.
   */
  get<T>(key: string, f: () => T, now = false): T {
    let e = this.memo.get(key);
    if (e) { this.memo.delete(key); this.memo.set(key, e); touch(e); }
    else {
      e = { v: undefined, own: [], rest: [], keep: new Set(), deps: new Set(), used: gen, live: true };
      const made = new Set<Handle>();
      making.push(e);
      try { e.v = recordInto(made, f); } catch (err) {
        // (it failed part way: what it made goes with the build's own)
        if (buildOwn) for (const h of made) buildOwn.add(h); else free(made);
        throw err;
      } finally { making.pop(); }
      // (its value's solids its own; one made before is another entry's (it depends on that one), or the build's
      // till now (its own from here))
      const keep = e.keep = handlesIn(e.v);
      for (const h of keep) {
        if (made.has(h)) continue;
        const o = ownerOf.get(h);
        if (o && o !== e) e.deps.add(o);
        else if (buildOwn?.delete(h)) made.add(h);
      }
      for (const h of made) if (keep.has(h)) { e.own.push(h); ownerOf.set(h, e); } else if (!h.isDeleted?.()) e.rest.push(h);
      if (now) settle(made, keep);
      unsettled.add(e);
      settled(e);
      this.memo.set(key, e);
    }
    const outer = making[making.length - 1];
    if (outer && outer !== e) outer.deps.add(e);
    return e.v as T;
  }

  /** Forget everything, its solids deleted. */
  clear() { for (const e of [...this.memo.values()]) drop(e); }

  /** (for trim and drop) */
  entries() { return this.memo; }
  get limit() { return this.max; }
}

/** An entry's leftovers deleted, once its value's solids are all worked out (they need them no more). */
function settled(e: Entry) {
  for (const h of e.keep) if (!h.isDeleted?.() && !isWorked(h)) return;
  free(e.rest);
  e.rest = [];
  unsettled.delete(e);
}

/** Drop an entry: out of its cache, its solids deleted, and with it every entry that depends on it. */
function drop(e: Entry) {
  if (!e.live) return;
  e.live = false;
  for (const c of caches) for (const [k, x] of c.entries()) {
    if (x === e) c.entries().delete(k);
    else if (x.deps.has(e)) drop(x);
  }
  free(e.own); free(e.rest);
  e.own = []; e.rest = [];
  unsettled.delete(e);
}

/** After a build: the entries not used for a few builds dropped, then the oldest over each cache's size (but none a waiting plan's jobs may use: used since that plan). */
function trim() {
  for (const e of [...unsettled]) settled(e);
  for (const c of caches) {
    for (const e of [...c.entries().values()]) if (e.used < gen - KEEP_BUILDS) drop(e);
    // (the map's order: oldest used first)
    for (const e of [...c.entries().values()]) {
      if (c.entries().size <= c.limit) break;
      if (parked && e.used >= parkedGen) continue;
      drop(e);
    }
  }
}

/**
 * A build: f run owning the solids it makes outside the caches, deleted when it ends (however it ends), and the
 * caches trimmed. park: a plan (build.ts buildJobs), whose jobs are run afterwards and use its solids: kept till the
 * next plan. A build inside a build is part of it.
 */
export function buildScope<T>(f: () => T, park = false): T {
  if (depth) return f();
  depth++; gen++;
  const mine = new Set<Handle>();
  buildOwn = mine;
  if (park && parked) { free(parked); parked = undefined; }
  try { return recordInto(mine, f); } finally {
    depth--; buildOwn = undefined;
    if (park) { parked = mine; parkedGen = gen; } else free(mine);
    trim();
  }
}

/** A job of a plan run on its own (a helper worker's): what it makes deleted when it's done (its result is plain data). */
export function jobScope<T>(f: () => T): T {
  if (depth) return f();
  const mine = new Set<Handle>();
  try { return recordInto(mine, f); } finally { free(mine); }
}

/** Every cache emptied, and a plan's solids let go (tests: nothing left in the kernel between designs). */
export function clearSolids() {
  for (const c of caches) c.clear();
  if (parked) { free(parked); parked = undefined; }
}
