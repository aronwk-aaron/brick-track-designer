// Undo and redo: the designs as JSON, the current one last; a step for each change let go of, the oldest dropped
// past a limit, and whatever was undone forgotten once a new change is made.
export class History {
  private past: string[];
  private future: string[] = [];
  constructor(first: string, private limit = 200) { this.past = [first]; }

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
