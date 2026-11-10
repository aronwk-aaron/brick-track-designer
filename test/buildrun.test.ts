// The page's build runner (buildrun.ts): one build at a time in a worker, older builds' messages dropped, a stuck
// worker replaced, and a worker whose kernel broke replaced with the build tried once more, then given up on with a
// plain message: never tried over and over (a build that looked endless).
import { describe, expect, it } from 'vitest';
import { type BuildMessage, BuildRunner, FATAL_TEXT, type WorkerPort } from '../src/app/buildrun';

/** A runner on pretend workers and a pretend clock: the workers made, what each was sent, and the messages passed on. */
function rig() {
  const workers: (WorkerPort & { sent: { id: number; design: unknown; planOnly: boolean }[]; dead: boolean })[] = [];
  const timers: { f: () => void; ms: number; off: boolean }[] = [];
  const got: BuildMessage[] = [];
  let retries = 0;
  const runner = new BuildRunner({
    spawn: () => { const w = { sent: [] as { id: number; design: unknown; planOnly: boolean }[], dead: false, onmessage: null, postMessage(m: unknown) { this.sent.push(m as never); }, terminate() { this.dead = true; } }; workers.push(w); return w; },
    message: (d) => got.push(d),
    retrying: () => { retries++; },
    setTimeout: (f, ms) => { const t = { f, ms, off: false }; timers.push(t); return t; },
    clearTimeout: (t) => { if (t) (t as { off: boolean }).off = true; },
  });
  const say = (k: number, d: BuildMessage) => workers[k].onmessage!({ data: d });
  /** the clock run on: every timer still set goes off */
  const tick = () => { for (const t of timers.splice(0)) if (!t.off) t.f(); };
  return { runner, workers, got, say, tick, retries: () => retries };
}

describe('the build runner', () => {
  it('sends a build to its worker and passes on its messages', () => {
    const r = rig();
    const id = r.runner.request({ a: 1 }, false);
    expect(r.workers).toHaveLength(1);
    expect(r.workers[0].sent).toEqual([{ id, design: { a: 1 }, planOnly: false }]);
    r.say(0, { id, progress: 'Starting', frac: 0 });
    r.tick(); // (picked up in time: the worker's kept)
    r.say(0, { id, pieces: [] });
    expect(r.workers).toHaveLength(1);
    expect(r.got.map((d) => Object.keys(d).sort().join())).toEqual(['frac,id,progress', 'id,pieces']);
  });
  it('drops an older build\'s messages', () => {
    const r = rig();
    const a = r.runner.request({}, false), b = r.runner.request({}, true);
    r.say(0, { id: a, pieces: [] });
    expect(r.got).toHaveLength(0);
    r.say(0, { id: b, planDone: true });
    expect(r.got).toEqual([{ id: b, planDone: true }]);
    expect(r.workers[0].sent[1].planOnly).toBe(true);
  });
  it('replaces a worker that doesn\'t pick the build up (deep in an older one), once', () => {
    const r = rig();
    r.runner.request({ n: 1 }, false);
    r.say(0, { id: 1, progress: 'Starting' });
    const b = r.runner.request({ n: 2 }, false);
    r.tick(); // (no word of build 2 from the worker)
    expect(r.workers).toHaveLength(2);
    expect(r.workers[0].dead).toBe(true);
    expect(r.workers[1].sent).toEqual([{ id: b, design: { n: 2 }, planOnly: false }]);
    // (the new one is given its time: nothing more replaced however long it takes)
    r.tick(); r.tick();
    expect(r.workers).toHaveLength(2);
    // (and the old worker's late word is dropped)
    r.say(0, { id: 1, pieces: [] });
    r.say(1, { id: b, pieces: [] });
    expect(r.got.slice(1)).toEqual([{ id: b, pieces: [] }]);
  });
  it('a broken kernel: a new worker and the build once more; broken again, a plain message and a new worker for the next build', () => {
    const r = rig();
    const id = r.runner.request({ big: true }, false);
    r.say(0, { id, fatal: true, error: 'memory access out of bounds' });
    expect(r.retries()).toBe(1);
    expect(r.got).toHaveLength(0); // (not said yet: it's being tried again)
    expect(r.workers).toHaveLength(2);
    expect(r.workers[0].dead).toBe(true);
    expect(r.workers[1].sent).toEqual([{ id, design: { big: true }, planOnly: false }]);
    r.say(1, { id, fatal: true, error: 'table index is out of bounds' });
    // (given up on: said plainly, once; no third try)
    expect(r.retries()).toBe(1);
    expect(r.got).toEqual([{ id, error: FATAL_TEXT, fatal: true }]);
    expect(r.got[0].error).not.toMatch(/out of bounds|signature|table index/);
    // (the broken worker's gone, the new one idle till the next build)
    expect(r.workers).toHaveLength(3);
    expect(r.workers[1].dead).toBe(true);
    expect(r.workers[2].sent).toHaveLength(0);
    const next = r.runner.request({ small: true }, false);
    expect(r.workers[2].sent).toEqual([{ id: next, design: { small: true }, planOnly: false }]);
    r.say(2, { id: next, pieces: [] });
    expect(r.got[1]).toEqual({ id: next, pieces: [] });
  });
  it('a kernel that breaks on every build of a design never loops: two tries a build, however many builds', () => {
    const r = rig();
    for (let k = 0; k < 5; k++) {
      const id = r.runner.request({ k }, false), n = r.workers.length;
      r.say(n - 1, { id, fatal: true, error: 'unreachable' });
      r.say(n, { id, fatal: true, error: 'unreachable' });
      expect(r.workers).toHaveLength(n + 2);
      expect(r.got).toHaveLength(k + 1);
    }
    expect(r.retries()).toBe(5);
  });
  it('an ordinary error is passed on as it is, the worker kept', () => {
    const r = rig();
    const id = r.runner.request({}, false);
    r.say(0, { id, error: 'Draw some track', fatal: false });
    expect(r.got).toEqual([{ id, error: 'Draw some track', fatal: false }]);
    expect(r.workers).toHaveLength(1);
  });
  it('Stop: the worker replaced, the stopped build\'s messages dropped', () => {
    const r = rig();
    const id = r.runner.request({}, false);
    r.runner.stop();
    expect(r.workers[0].dead).toBe(true);
    expect(r.workers).toHaveLength(2);
    r.say(0, { id, pieces: [] });
    r.tick();
    expect(r.got).toHaveLength(0);
    expect(r.workers).toHaveLength(2);
  });
  it('nothing to build (skip): whatever was building is out of date', () => {
    const r = rig();
    const id = r.runner.request({}, false);
    expect(r.runner.skip()).toBe(id + 1);
    r.say(0, { id, pieces: [] });
    r.tick();
    expect(r.got).toHaveLength(0);
    expect(r.workers).toHaveLength(1);
  });
});
