// Where My templates are kept: the browser's IndexedDB (room for as many as the disk allows, not localStorage's ~5 MB shared
// with the design and its undo history). mytemplates.ts reads and writes through a plain getItem/setItem, so this keeps a
// copy in memory, read once when the page opens, and writes each change through to the database behind it. Templates kept in
// localStorage by an older version move across on the first open (and leave localStorage). With no IndexedDB (some private
// windows) it falls back to localStorage, as before.
import { MINE_KEY, type StorageLike } from './mytemplates';

const DB = 'btd', STORE = 'kv';

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = idb.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
    r.onblocked = () => no(new Error('the database is held open by another tab'));
  });
}
function req<T>(r: IDBRequest<T>): Promise<T> { return new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
function done(t: IDBTransaction): Promise<void> { return new Promise((ok, no) => { t.oncomplete = () => ok(); t.onerror = () => no(t.error); t.onabort = () => no(t.error ?? new Error('aborted')); }); }

/**
 * The store for My templates: IndexedDB with a copy in memory, else localStorage, else undefined (the browser keeps
 * nothing). failed is told when a write the memory copy already took couldn't be kept (the disk full, say).
 */
export async function openMineStore(failed: (why: string) => void, idb: IDBFactory | undefined = globalThis.indexedDB, ls: Storage | undefined = (() => { try { return globalThis.localStorage; } catch { return undefined; } })()): Promise<StorageLike | undefined> {
  let db: IDBDatabase | undefined;
  try { if (idb) db = await openDb(idb); } catch { db = undefined; }
  if (!db) return ls;
  const mem = new Map<string, string>();
  try {
    const v = await req(db.transaction(STORE).objectStore(STORE).get(MINE_KEY));
    if (typeof v === 'string') mem.set(MINE_KEY, v);
    else {
      // (first open since they moved: bring localStorage's across)
      const old = ls?.getItem(MINE_KEY);
      if (old) {
        const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(old, MINE_KEY); await done(t);
        mem.set(MINE_KEY, old); try { ls?.removeItem(MINE_KEY); } catch { /* (left there: harmless) */ }
      }
    }
  } catch { return ls; }
  // (ask the browser not to clear them when the disk runs low; it may say no, and that's fine)
  void navigator.storage?.persist?.().catch(() => undefined);
  // (other tabs: each keeps its own copy, so a change is told to the others, which take it; else one tab's save could
  // write over another's)
  let chan: BroadcastChannel | undefined;
  try { chan = new BroadcastChannel('btd-my-templates'); chan.onmessage = (e: MessageEvent<{ k: string; v: string }>) => { if (e.data && typeof e.data.k === 'string' && typeof e.data.v === 'string') mem.set(e.data.k, e.data.v); }; } catch { chan = undefined; }
  let queue = Promise.resolve();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      const before = mem.get(k);
      mem.set(k, v);
      try { chan?.postMessage({ k, v }); } catch { /* (no other tabs told: each still reads the database when it opens) */ }
      queue = queue.then(async () => { const t = db!.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); await done(t); }).catch((err: unknown) => {
        if (mem.get(k) === v) { if (before === undefined) mem.delete(k); else mem.set(k, before); }
        failed(err instanceof Error && err.name === 'QuotaExceededError' ? 'the browser has no room left to keep it: free some disk space' : `the browser wouldn't keep it (${err instanceof Error ? err.message : String(err)})`);
      });
    },
  };
}
