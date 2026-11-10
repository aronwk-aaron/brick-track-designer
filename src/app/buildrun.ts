// One build at a time in a worker (worker.ts), as the page asks for them: a newer build's messages only, a worker
// that's busy with an older build replaced, and a worker whose kernel broke (out of memory, mostly) replaced and
// the build tried once more from nothing. No page here: the worker and the clock are handed in, so it's tested as
// it is (test/buildrun.test.ts).

/** A worker, as much of it as is used. */
export interface WorkerPort { postMessage(m: unknown): void; terminate(): void; onmessage: ((e: { data: BuildMessage }) => void) | null; onerror?: ((e: unknown) => void) | null; onmessageerror?: ((e: unknown) => void) | null }
/** What the worker says (worker.ts): picked up and progress, the plan's trackwork ahead of the pieces, the plan alone done, the pieces, or an error (fatal: its kernel's broken). */
export interface BuildMessage { id: number; progress?: string; frac?: number; early?: unknown; planDone?: boolean; error?: string; fatal?: boolean; [k: string]: unknown }
export interface RunnerOpts {
  spawn: () => WorkerPort;
  /** a message of the build asked for last (older builds' are dropped); a broken kernel's second failure comes as its error */
  message: (d: BuildMessage) => void;
  /** the build's being started again in a new worker, its kernel having broken */
  retrying?: () => void;
  /** how long a worker has to pick a build up before it's replaced (ms) */
  pickupMs?: number;
  setTimeout?: (f: () => void, ms: number) => unknown;
  clearTimeout?: (t: unknown) => void;
}

/** In plain words, what a broken kernel's error means (its own: "memory access out of bounds", "table index is out of bounds", a number). */
export const FATAL_TEXT = 'the geometry kernel ran out of memory or crashed on this design, twice (try Long track cut into: Track pieces, or a smaller layout)';

export class BuildRunner {
  private worker: WorkerPort;
  private seq = 0;
  private started = 0;
  private retried = -1;
  private last: { id: number; design: unknown; planOnly: boolean } | undefined;
  private check: unknown;
  private readonly later: (f: () => void, ms: number) => unknown;
  private readonly cancel: (t: unknown) => void;

  constructor(private o: RunnerOpts) {
    this.later = o.setTimeout ?? ((f, ms) => setTimeout(f, ms));
    this.cancel = o.clearTimeout ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
    this.worker = this.fresh();
  }

  /** The number of the build asked for last. */
  get id() { return this.seq; }

  private fresh(): WorkerPort {
    const w = this.o.spawn();
    w.onmessage = (e) => this.got(e.data);
    // (a worker that fails outright (its script, or the browser stopping it for the memory it took) says nothing more:
    // as a broken kernel, or the build would be waited for without end)
    const failed = () => { if (w === this.worker && this.last) this.got({ id: this.last.id, fatal: true, error: 'the worker stopped' }); };
    w.onerror = failed; w.onmessageerror = failed;
    return w;
  }
  private replace() { this.worker.terminate(); this.worker = this.fresh(); }
  private send() { const l = this.last!; this.worker.postMessage({ id: l.id, design: l.design, planOnly: l.planOnly }); }

  /** A number for a build that needs no worker (nothing to build): whatever's building is out of date from here. */
  skip(): number { this.cancel(this.check); this.last = undefined; return ++this.seq; }

  /**
   * Ask for a build (design: a copy the page won't change). A build still going is left a moment to pick this one
   * up (a build shared out among helpers does, and stops); a worker deep in an older build doesn't, and is replaced.
   */
  request(design: unknown, planOnly: boolean): number {
    const id = ++this.seq;
    this.last = { id, design, planOnly };
    this.send();
    this.cancel(this.check);
    this.check = this.later(() => {
      if (this.started >= id || id !== this.seq) return;
      this.replace(); this.send();
    }, this.o.pickupMs ?? 1000);
    return id;
  }

  /** Stop the build that's going: its worker replaced, its messages dropped. */
  stop() {
    this.cancel(this.check);
    this.seq++; this.last = undefined;
    this.replace();
  }

  private got(d: BuildMessage) {
    this.started = Math.max(this.started, d.id);
    if (d.id !== this.seq || !this.last) return; // (an older build's)
    if (d.fatal) {
      // (its kernel's broken for every build after: a new worker either way; the build tried once more in it, from
      // nothing, then given up on)
      this.replace();
      if (this.retried !== d.id) { this.retried = d.id; this.o.retrying?.(); this.send(); return; }
      this.o.message({ id: d.id, error: FATAL_TEXT, fatal: true });
      return;
    }
    this.o.message(d);
  }
}

/**
 * What a request for a build builds: just the plan's trackwork (planOnly) unless the 3D view is wanted: Auto on and the
 * 3D view showing, or force (Build pressed). Auto off, or the view hidden, never builds the parts by itself.
 */
export const planOnlyFor = (auto: boolean, show3d: boolean, force = false): boolean => !force && !(auto && show3d);
/** A parts build going when the 3D view is no longer wanted (Auto turned off, the view hidden): it's replaced by the plan alone. */
export const dropsBuild = (building: boolean, auto: boolean, show3d: boolean): boolean => building && !(auto && show3d);
