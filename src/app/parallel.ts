// A big build shared out: its heavy jobs that don't depend on each other
// (build.ts BuildJob: the tiles of a yard, the sections of a piece built in
// sections) built in helper workers at once, each with its own kernel, and
// handed back as plain data; then the build itself, which finds them all
// done. The same code builds each job wherever it's built, so the pieces come
// out as a build in one worker makes them.
import type { Wasm } from '../geom/kernel';
import { type BuildJob, buildDesign, buildJobs, holdJobs, jobDone } from './build';
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
  const jobs = helpers > 0 ? buildJobs(w, design, early && ((ov) => { sentEarly = true; early(ov); })) : [];
  if (jobs.length < 2) return buildDesign(w, design, report, sentEarly ? undefined : early);
  holdJobs(true);
  try {
    await runJobs(jobs, design, spawn, Math.min(helpers, jobs.length), report, cancelled);
    // (then the build, the jobs found done: the last tenth of the bar)
    return buildDesign(w, design, (what, frac) => report(what, 0.9 + 0.1 * frac), sentEarly ? undefined : early);
  } finally { holdJobs(false); }
}

/** Build the jobs in n helpers, the longest first, each helper given the next as it finishes one; each kept for the build (jobDone). */
function runJobs(jobs: BuildJob[], design: Design, spawn: () => HelperPort, n: number, report: (what: string, frac: number) => void, cancelled: () => boolean) {
  const queue = [...jobs].sort((a, b) => b.cost - a.cost), total = jobs.reduce((t, j) => t + j.cost, 0) || 1;
  const cost = new Map(jobs.map((j) => [j.key, j.cost]));
  let done = 0, doneCost = 0, live = 0;
  const ports: HelperPort[] = [];
  return new Promise<void>((resolve, reject) => {
    let over = false;
    const finish = (err?: unknown) => {
      if (over) return;
      over = true; clearInterval(watch);
      for (const p of ports) p.close();
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
    report(`Building ${jobs.length} parts in ${n} workers`, 0.05);
    for (let k = 0; k < n; k++) {
      const p = spawn();
      ports.push(p); live++;
      let gone = false;
      p.listen((m) => {
        if (over || gone) return;
        if ('ready' in m) { next(p); return; }
        if ('gone' in m || ('fatal' in m && m.fatal)) {
          // (its kernel broke, or it crashed: what it was building is left to the build itself, which says what went wrong)
          gone = true; p.close(); live--;
          if (live === 0) finish();
          return;
        }
        // (a job that failed is built again by the build itself, which says how it failed)
        if (m.part !== undefined) jobDone(m.key, m.part);
        done++; doneCost += cost.get(m.key) ?? 0;
        report(`Building the track: ${done} of ${jobs.length} parts done`, 0.05 + 0.85 * (doneCost / total));
        next(p);
      });
      p.post({ design });
    }
  });
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
      const fatal = err instanceof WebAssembly.RuntimeError || typeof err === 'number';
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
