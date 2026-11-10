// A big build shared out: its heavy jobs that don't depend on each other
// (build.ts BuildJob: the tiles of a yard, the sections of a piece built in
// sections) built in helper workers at once, each with its own kernel, and
// handed back as plain data; then the build itself, which finds them all
// done. The same code builds each job wherever it's built, so the pieces come
// out as a build in one worker makes them.
import { kernelBroke, type Wasm } from '../geom/kernel';
import { type BuildJob, buildDesign, buildJobs, holdJobs, jobDone, mayHaveJobs } from './build';
import type { Design } from './design';

/** To a helper: the design (it works out its jobs, then says it's ready), a job to build (by its key), or stop. */
export type ToHelper = { design: Design } | { run: string };
/** From a helper: ready for jobs; a job built (or not: error, and fatal when its kernel's broken); or gone (it crashed). */
export type FromHelper = { ready: true } | { key: string; part?: unknown; error?: string; fatal?: boolean } | { gone: true };
/** A helper worker, as the build sees it. */
export interface HelperPort { post(m: ToHelper): void; listen(f: (m: FromHelper) => void): void; close(): void }

/**
 * How many helpers: one per core but one (the page's), at most 4. (Each has
 * a kernel of its own, a GB or two at its biggest on a yard's tiles.)
 */
export const helperCount = (cores: number) => Math.max(0, Math.min(4, (cores || 1) - 1));

/** The build stopped for a newer one (cancelled() said so). */
export const CANCELLED = { cancelled: true };

/**
 * buildDesign, its jobs built by helpers (spawn starts one) when it has two
 * or more to do. cancelled: checked while it waits on the helpers (a newer
 * build wanted): it stops them and throws CANCELLED.
 */
export async function buildShared(w: Wasm, design: Design, spawn: () => HelperPort, helpers: number,
  report: (what: string, frac: number) => void = () => {}, early?: (overlay: unknown) => void, cancelled: () => boolean = () => false) {
  let sentEarly = false;
  // (the helpers started before the plan's worked out here: each works out its own copy meanwhile, as long as this
  // one takes (a yard's: tens of seconds), not after it)
  const crew = helpers > 0 && mayHaveJobs(design) ? startHelpers(design, spawn, helpers) : undefined;
  let jobs: BuildJob[];
  try { jobs = crew ? buildJobs(w, design, early && ((ov) => { sentEarly = true; early(ov); })) : []; } catch (err) { crew?.close(); throw err; }
  if (!crew || jobs.length < 2) { crew?.close(); return buildDesign(w, design, report, sentEarly ? undefined : early); }
  holdJobs(true);
  try {
    await crew.run(jobs, report, cancelled);
    // (then the build, the jobs found done: the last tenth of the bar)
    return buildDesign(w, design, (what, frac) => report(what, 0.9 + 0.1 * frac), sentEarly ? undefined : early);
  } finally { holdJobs(false); }
}

/**
 * n helpers started on the design (each works out its jobs, then says it's ready). run: build the jobs in them, the
 * longest first, each helper given the next as it finishes one, each result kept for the build (jobDone); no more
 * helpers kept than there are jobs. close: stop them all.
 */
function startHelpers(design: Design, spawn: () => HelperPort, n: number) {
  const ports: HelperPort[] = [], ready: HelperPort[] = [], gone = new Set<HelperPort>();
  let onMessage: ((p: HelperPort, m: FromHelper) => void) | undefined;
  for (let k = 0; k < n; k++) {
    const p = spawn();
    ports.push(p);
    p.listen((m) => {
      if (onMessage) { onMessage(p, m); return; }
      // (before the jobs are known: ready ones wait; one that's gone is left out)
      if ('ready' in m) ready.push(p); else if ('gone' in m || ('fatal' in m && m.fatal)) gone.add(p);
    });
    p.post({ design });
  }
  const close = () => { for (const p of ports) p.close(); };
  const run = (jobs: BuildJob[], report: (what: string, frac: number) => void, cancelled: () => boolean) => {
    const queue = [...jobs].sort((a, b) => b.cost - a.cost), total = jobs.reduce((t, j) => t + j.cost, 0) || 1;
    const cost = new Map(jobs.map((j) => [j.key, j.cost]));
    // (no more helpers than jobs: the rest stopped)
    const crew = ports.filter((p) => !gone.has(p)).slice(0, jobs.length);
    for (const p of ports) if (!crew.includes(p)) p.close();
    let done = 0, doneCost = 0, live = crew.length;
    return new Promise<void>((resolve, reject) => {
      let over = false;
      const finish = (err?: unknown) => {
        if (over) return;
        over = true; clearInterval(watch);
        close();
        if (err) reject(err); else resolve();
      };
      // (a newer build wanted: stop)
      const watch = setInterval(() => { if (cancelled()) finish(CANCELLED); }, 50);
      const next = (p: HelperPort) => {
        const j = queue.shift();
        if (j) { p.post({ run: j.key }); return; }
        p.close(); live--;
        if (live === 0) finish();
      };
      report(`Building ${jobs.length} parts in ${crew.length} workers`, 0.05);
      onMessage = (p, m) => {
        if (over || gone.has(p) || !crew.includes(p)) return;
        if ('ready' in m) { next(p); return; }
        if ('gone' in m || ('fatal' in m && m.fatal)) {
          // (its kernel broke, or it crashed: what it was building is left to the build itself, which says what went wrong)
          gone.add(p); p.close(); live--;
          if (live === 0) finish();
          return;
        }
        // (a job that failed is built again by the build itself, which says how it failed)
        if (m.part !== undefined) jobDone(m.key, m.part);
        done++; doneCost += cost.get(m.key) ?? 0;
        report(`Building the track: ${done} of ${jobs.length} parts done`, 0.05 + 0.85 * (doneCost / total));
        next(p);
      };
      if (live === 0) { finish(); return; }
      // (the ones ready already: to work)
      for (const p of ready.splice(0)) if (crew.includes(p)) next(p);
    });
  };
  return { run, close };
}

/**
 * A helper's side: post sends a message back (with the buffers to hand
 * over). Returns what to do with each message it gets.
 */
export function serveHelper(w: Wasm, post: (m: FromHelper, transfer: ArrayBuffer[]) => void) {
  let jobs = new Map<string, BuildJob>();
  return (m: ToHelper) => {
    if ('design' in m) {
      try { jobs = new Map(buildJobs(w, m.design).map((j) => [j.key, j])); } catch { /* (none: each job it's sent fails, and the build makes it) */ }
      post({ ready: true }, []);
      return;
    }
    const j = jobs.get(m.run);
    if (!j) { post({ key: m.run, error: 'not a job here' }, []); return; }
    try {
      const part = j.run();
      post({ key: m.run, part }, buffersOf(part));
    } catch (err) {
      const fatal = kernelBroke(err);
      post({ key: m.run, error: String(err instanceof Error ? err.message : err), fatal }, []);
    }
  };
}

/** The typed arrays' buffers in a job's result (to hand over, not copy). */
function buffersOf(v: unknown, out: ArrayBuffer[] = []): ArrayBuffer[] {
  if (ArrayBuffer.isView(v)) { if (v.buffer instanceof ArrayBuffer && !out.includes(v.buffer)) out.push(v.buffer); }
  else if (Array.isArray(v)) for (const x of v) buffersOf(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) buffersOf(x, out);
  return out;
}
