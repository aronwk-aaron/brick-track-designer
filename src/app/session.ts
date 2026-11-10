// What's kept of the design between visits, and when to ask before losing it (no page here: main.ts acts on these).
// The browser keeps the design as it's worked on (one design, whichever tab wrote last), and what it was when it
// was last saved to a file, opened from one or loaded from a template: a design that's changed since has changes
// only the browser holds, and replacing it asks first. Another tab or window working on the design writes the
// same store: this one is told (the storage event), stops writing, and asks which to keep.

/** Has the design changes that aren't in a file (clean: as it was last saved, opened, or loaded from a template)? An empty plan has none. */
export function unsaved(designJson: string, cleanJson: string | null): boolean {
  let empty = false;
  try { const d = JSON.parse(designJson) as { routes?: unknown[]; tables?: unknown[] }; empty = !d.routes?.length && !d.tables?.length; } catch { /* (not a design: nothing to lose) */ }
  return !empty && designJson !== cleanJson;
}

/** The store written by this tab and by others: whether a change to it is another tab's newer design. */
export class TabStore {
  /** another tab's design, newer than this one's, while it's not been chosen between */
  other: string | undefined;
  private written: string | null;
  constructor(atStart: string | null) { this.written = atStart; }
  /** May this tab write the store now? Not while another tab's newer design is unanswered. */
  get mayWrite(): boolean { return this.other === undefined; }
  wrote(json: string) { this.written = json; }
  /** The store changed (a storage event: only other tabs' writes come as one). True if it's a design other than this tab's: ask. */
  changedElsewhere(newValue: string | null, mine: string): boolean {
    if (newValue === null || newValue === mine || newValue === this.written) return false;
    this.other = newValue;
    return true;
  }
  /** The choice made: this tab's design kept (it writes again, over the other), or the other's taken (returned, to load). */
  choose(which: 'mine' | 'other'): string | undefined { const o = this.other; this.other = undefined; return which === 'other' ? o : undefined; }
}
