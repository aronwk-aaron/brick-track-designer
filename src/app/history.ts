// Undo and redo: the designs as JSON, the current one last; a step for each change let go of, the oldest dropped
// past a limit, and whatever was undone forgotten once a new change is made.
export class History {
  private past: string[];
  private future: string[] = [];
  constructor(first: string, private limit = 200) { this.past = [first]; }

  /** Rebuilt from kept steps (see toStored). */
  static from(past: string[], future: string[], limit = 200): History {
    const h = new History(past[0], limit);
    h.past = past.slice(); h.future = future.slice();
    return h;
  }
  /** The steps, oldest first (copies). */
  steps(): { past: string[]; future: string[] } { return { past: this.past.slice(), future: this.future.slice() }; }
  /** The design as it is now. */
  get current(): string { return this.past[this.past.length - 1]; }
  get canUndo(): boolean { return this.past.length > 1; }
  get canRedo(): boolean { return this.future.length > 0; }

  /** A change: a new step (none if nothing changed), and nothing left to redo. */
  record(json: string): void {
    if (json === this.current) return;
    this.past.push(json);
    this.future.length = 0;
    if (this.past.length > this.limit) this.past.shift();
  }
  /** The current step replaced (a change that isn't a step of its own: the design's name). */
  amend(json: string): void { this.past[this.past.length - 1] = json; }
  /** Back a step: the design to show, or undefined at the first. */
  undo(): string | undefined {
    if (!this.canUndo) return undefined;
    this.future.push(this.past.pop()!);
    return this.current;
  }
  /** Forward again: the design to show, or undefined with nothing undone. */
  redo(): string | undefined {
    const j = this.future.pop();
    if (j === undefined) return undefined;
    this.past.push(j);
    return j;
  }
}

// ---------- kept across a reload ----------
// The history is kept in the browser beside the design (its own key), as JSON: the steps, the hash of the current
// design, and the size held to a budget by dropping the oldest steps. What's read back is used only if its current
// step is the design that's stored (a different tab or an older save would make undo jump to somewhere else).

export const HISTORY_KEY = 'btd-history';
/** About 1 MB of text in all (the steps; the design's own is kept apart). */
export const HISTORY_BUDGET = 1_000_000;
export type HistoryStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A short hash of a design's text (FNV-1a, with its length): to tell whether two are the same without keeping both. */
export function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${h.toString(16)}:${text.length}`;
}

interface Kept { v: 1; hash: string; past: string[]; future: string[] }

/** The history as text for keeping: the steps within budget (oldest undo steps first to go, then the furthest redo ones; the current one always stays). */
export function keptHistory(h: History, budget = HISTORY_BUDGET): string {
  const { past, future } = h.steps();
  let size = [...past, ...future].reduce((a, j) => a + j.length, 0), from = 0, to = 0;
  while (size > budget && from < past.length - 1) size -= past[from++].length;
  while (size > budget && to < future.length) size -= future[to++].length;
  const kept: Kept = { v: 1, hash: hashOf(h.current), past: past.slice(from), future: future.slice(to) };
  return JSON.stringify(kept);
}

/** Keep the history: false if the browser wouldn't (it's tried again with half the budget, then given up on and the old one removed). Never throws. */
export function saveHistory(store: HistoryStore, h: History, budget = HISTORY_BUDGET): boolean {
  for (let b = budget; b >= 50_000; b = Math.floor(b / 2)) {
    try { store.setItem(HISTORY_KEY, keptHistory(h, b)); return true; } catch { /* (over the browser's room: less) */ }
  }
  try { store.removeItem(HISTORY_KEY); } catch { /* fine */ }
  return false;
}

/** The kept history, if there is one that's of this design (its current step's hash is the design text's); else undefined, and the kept one removed. Never throws. */
export function loadHistory(store: HistoryStore, designText: string | null, limit = 200): History | undefined {
  let raw: string | null;
  try { raw = store.getItem(HISTORY_KEY); } catch { return undefined; }
  if (raw === null) return undefined;
  try {
    const k = JSON.parse(raw) as Partial<Kept>;
    const ok = k && k.v === 1 && Array.isArray(k.past) && Array.isArray(k.future) && k.past.length > 0 && [...k.past, ...k.future].every((j) => typeof j === 'string');
    if (ok && designText !== null && k.hash === hashOf(designText) && k.past!.at(-1) === designText) return History.from(k.past!, k.future!, limit);
  } catch { /* not ours: dropped */ }
  try { store.removeItem(HISTORY_KEY); } catch { /* fine */ }
  return undefined;
}
