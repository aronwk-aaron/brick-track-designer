// "My templates": designs (or a selection of one) kept in this browser (localStorage, one key) to open or add to a design later.
// Each entry is versioned and read back through readDesign, so an old one keeps opening and a damaged one is listed as damaged
// (and can be deleted) rather than breaking the list. Every access is guarded: with no storage the browser works without it.
import { type Design, type DRoute, readDesign } from './design';
import type { Table } from './tables';
import { copyEdits, pasteEdits } from './twfollow';

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const MINE_KEY = 'btd-my-templates';
/** How much text the saved templates may take together: the browser keeps about 5 MB for the whole app (the design, its undo
 * history, the settings), so they get a fifth of it. No cap on how many: a template is a few KB. */
export const MINE_MAX_CHARS = 1_000_000;
/** Where they're kept, and what that means, said beside the list and on saving. */
export const KEPT_NOTE = "Kept in this browser only: clearing the browser's data for this site deletes them, and they don't move to another browser or computer. Export one to keep it as a file.";
export const UNAVAILABLE = "Saving templates isn't available in this browser window";

interface Stored { v: number; id: string; name: string; at: number; design: unknown }
export interface Mine { id: string; name: string; at: number; chars: number; design?: Design; /** why it can't be used */ damaged?: string }
export interface MineList { entries: Mine[]; chars: number; unavailable?: string }
export type Done = { ok: true; id: string; name: string } | { ok: false; why: string };

function readStored(st: StorageLike | undefined): { list: Stored[]; text: string; unavailable?: string } {
  if (!st) return { list: [], text: '', unavailable: UNAVAILABLE };
  let text: string | null;
  try { text = st.getItem(MINE_KEY); } catch { return { list: [], text: '', unavailable: UNAVAILABLE }; }
  if (!text) return { list: [], text: '' };
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v)) return { list: v.filter((e): e is Stored => !!e && typeof e === 'object' && typeof (e as Stored).id === 'string'), text };
  } catch { /* (unreadable as a whole: starts again) */ }
  return { list: [], text: '' };
}
const usable = (e: Stored) => typeof e.name === 'string' ? e.name : 'Template';

/** The saved templates, newest first, each read through readDesign. */
export function listMine(st: StorageLike | undefined): MineList {
  const { list, text, unavailable } = readStored(st);
  const entries = list.map((e): Mine => {
    const base = { id: e.id, name: usable(e), at: typeof e.at === 'number' ? e.at : 0, chars: JSON.stringify(e).length };
    if (typeof e.v !== 'number' || e.v > 1) return { ...base, damaged: 'it was saved by a newer version of Brick Track Designer' };
    try { return { ...base, design: readDesign(structuredClone(e.design)) }; } catch (err) { return { ...base, damaged: err instanceof Error ? err.message : "it isn't a design" }; }
  }).sort((a, b) => b.at - a.at);
  return { entries, chars: text.length, ...(unavailable && { unavailable }) };
}

/** A name not among names: as wanted, else "name 2", "name 3"… */
export function uniqueName(names: readonly string[], want: string): string {
  const base = want.trim() || 'Template', taken = new Set(names.map((n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let k = 2; ; k++) if (!taken.has(`${base} ${k}`.toLowerCase())) return `${base} ${k}`;
}

/** How much is used, in words: "3 templates, 120 KB of the 976 KB this browser keeps for them". */
export const usedText = (l: MineList) => `${l.entries.length} template${l.entries.length === 1 ? '' : 's'}, ${Math.ceil(l.chars / 1024)} KB of the ${Math.floor(MINE_MAX_CHARS / 1024)} KB this browser keeps for them`;

function write(st: StorageLike | undefined, list: Stored[]): string | undefined {
  if (!st) return UNAVAILABLE;
  const text = JSON.stringify(list);
  if (text.length > MINE_MAX_CHARS) return `that would take the saved templates to ${Math.ceil(text.length / 1024)} KB, over the ${Math.floor(MINE_MAX_CHARS / 1024)} KB it keeps: delete some first`;
  try { st.setItem(MINE_KEY, text); } catch { return "the browser has no room left to keep it (or won't let this page keep anything): delete a template, or free some space"; }
  return undefined;
}
const newId = (list: Stored[], now: number) => { let id = now.toString(36); while (list.some((e) => e.id === id)) id += 'x'; return id; };

/** Save a design as a template under a name (made unique). */
export function saveMine(st: StorageLike | undefined, name: string, design: Design, now = Date.now()): Done {
  const { list, unavailable } = readStored(st);
  if (unavailable) return { ok: false, why: unavailable };
  const nm = uniqueName(list.map(usable), name), id = newId(list, now);
  const why = write(st, [...list, { v: 1, id, name: nm, at: now, design: JSON.parse(JSON.stringify(design)) }]);
  return why ? { ok: false, why } : { ok: true, id, name: nm };
}
export function renameMine(st: StorageLike | undefined, id: string, name: string): Done {
  const { list, unavailable } = readStored(st);
  if (unavailable) return { ok: false, why: unavailable };
  const e = list.find((x) => x.id === id);
  if (!e) return { ok: false, why: "that template isn't there any more" };
  const nm = uniqueName(list.filter((x) => x !== e).map(usable), name);
  e.name = nm;
  const why = write(st, list);
  return why ? { ok: false, why } : { ok: true, id, name: nm };
}
export function deleteMine(st: StorageLike | undefined, id: string): Done {
  const { list, unavailable } = readStored(st);
  if (unavailable) return { ok: false, why: unavailable };
  const e = list.find((x) => x.id === id);
  if (!e) return { ok: false, why: "that template isn't there any more" };
  const why = write(st, list.filter((x) => x !== e));
  return why ? { ok: false, why } : { ok: true, id, name: usable(e) };
}
/** A .btd.json read into My templates: the file must be a design (the reason if not). Named by the design's name, else the file's. */
export function importMine(st: StorageLike | undefined, text: string, fileName: string, now = Date.now()): Done {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { ok: false, why: `${fileName} isn't a track design (.btd.json): it isn't JSON, or it's cut short` }; }
  let d: Design;
  try { d = readDesign(v); } catch (err) { return { ok: false, why: `${fileName}: ${err instanceof Error ? err.message : "isn't a track design"}` }; }
  if (!d.routes.length && !d.tables?.length) return { ok: false, why: `${fileName} has no routes or tables in it` };
  return saveMine(st, d.name || fileName.replace(/\.btd\.json$|\.json$/i, '') || 'Imported', d, now);
}

/** A design of just some of a design's routes and tables, what's attached to them with them (hand edits by the copy path), settings as the design's. */
export function designOfSelection(d: Design, routes: readonly number[], tables: readonly number[]): Design {
  const rs: DRoute[] = routes.map((i) => { const c = structuredClone(d.routes[i]); delete c.locked; return c; });
  const ts: Table[] = tables.map((k) => { const c = structuredClone(d.tables![k]); delete c.locked; return c; });
  const out: Design = { version: 1, gaugeStuds: d.gaugeStuds, ...(d.options && { options: structuredClone(d.options) }), routes: rs, ...(ts.length && { tables: ts }) };
  pasteEdits(out, copyEdits(d, routes.map((i) => d.routes[i].name || String(i))), new Map(), 0, 0);
  return out;
}
