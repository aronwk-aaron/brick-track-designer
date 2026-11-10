// A big build shared out (parallel.ts), the rest of it (parallel.test.ts has the pieces compared): the helpers started
// while the plan's worked out, helpers that fail, a bought switch's ballast as a job, which designs are shared out.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, buildJobs, clearBuildCache, jobDone, mayHaveJobs } from '../src/app/build';
import { buildShared, type FromHelper, type HelperPort, serveHelper, type ToHelper } from '../src/app/parallel';
import type { Design } from '../src/app/design';

// (two tracks 500 studs long with a crossover between them: over 8 m of track, so built in tiles)
const sn = Math.sin(Math.PI / 8), c = Math.cos(Math.PI / 8);
const yard = (trackwork: Design['trackwork'] = {}): Design => ({ version: 1, gaugeStuds: 4, trackwork, routes: [
  { name: 'L', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 500 }] },
  { name: 'R', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 500 }] },
  { name: 'X', x: 0, y: 200, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: (16 - 2 * 40 * (1 - c)) / sn }, { kind: 'curve', radius: 40, angle: 22.5 }] },
] });
const same = (a: ReturnType<typeof buildDesign>, b: ReturnType<typeof buildDesign>) => {
  expect(b.pieces.map((p) => p.name)).toEqual(a.pieces.map((p) => p.name));
  expect(b.info.warnings).toEqual(a.info.warnings);
  expect(b.info.volume).toBeCloseTo(a.info.volume, 3);
  a.pieces.forEach((p, k) => { expect(b.pieces[k].positions).toEqual(p.positions); expect(b.pieces[k].stl).toEqual(p.stl); });
};

describe('builds shared out: the helpers', { timeout: 900000 }, () => {
  it('the helpers are started before the plan is worked out (they work out theirs meanwhile), and none for a design with nothing to share', async () => {
    const w = await kernel();
    clearBuildCache();
    let spawned = 0, atPlan = -1, closed = 0;
    const spawn = (): HelperPort => {
      spawned++;
      let to: (m: FromHelper) => void = () => {};
      const serve = serveHelper(w, (m) => setTimeout(() => to(structuredClone(m))));
      return { post: (m: ToHelper) => setTimeout(() => serve(structuredClone(m))), listen: (f) => { to = f; }, close: () => { closed++; to = () => {}; } };
    };
    const shared = await buildShared(w, yard(), spawn, 2, () => {}, () => { if (atPlan < 0) atPlan = spawned; });
    expect(atPlan).toBe(2); // (both going by the time the plan's trackwork was ready)
    expect(spawned).toBe(2);
    expect(closed).toBeGreaterThanOrEqual(2);
    expect(shared.pieces.length).toBeGreaterThan(10);
    // (a small design: built here, no helper started)
    spawned = 0;
    const small: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }] };
    expect((await buildShared(w, small, spawn, 2)).pieces.length).toBeGreaterThan(0);
    expect(spawned).toBe(0);
    clearBuildCache();
  });
  it('a helper that\'s gone before the jobs are known, and one that breaks on a job: the build makes what they didn\'t', async () => {
    const w = await kernel();
    clearBuildCache();
    const one = buildDesign(w, yard());
    clearBuildCache();
    let k = 0;
    const spawn = (): HelperPort => {
      const mine = k++;
      let to: (m: FromHelper) => void = () => {};
      const serve = serveHelper(w, (m) => setTimeout(() => to(structuredClone(m))));
      let ran = 0;
      return {
        post: (m: ToHelper) => setTimeout(() => {
          // (the first: crashed as it started; the second: its kernel breaks on its second job)
          if (mine === 0) { to({ gone: true }); return; }
          if (mine === 1 && 'run' in m && ++ran === 2) { to({ key: m.run, error: 'memory access out of bounds', fatal: true }); return; }
          serve(structuredClone(m));
        }),
        listen: (f) => { to = f; }, close: () => { to = () => {}; },
      };
    };
    same(one, await buildShared(w, yard(), spawn, 3));
    clearBuildCache();
  });
  it('a bought switch\'s ballast is a job too, and comes out as built in one worker', async () => {
    const w = await kernel();
    const d = (): Design => ({ version: 1, gaugeStuds: 4, options: { splitTrack: 'lengths', legoTrack: 'lego', ballast: 'ballast' }, routes: [
      { name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 256 }] },
      // (LEGO's switch at the start, and an R40 curve back to parallel)
      { name: 'Siding', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }, { kind: 'curve', radius: 40, angle: -22.5 }] },
    ] });
    clearBuildCache();
    const one = buildDesign(w, d());
    expect(one.pieces.some((p) => /^switch-bought/.test(p.name))).toBe(true);
    expect(one.pieces.some((p) => /^switch-ballast/.test(p.name))).toBe(true);
    clearBuildCache();
    const jobs = buildJobs(w, d());
    expect(jobs.filter((j) => /^bsw:/.test(j.key))).toHaveLength(1);
    for (const j of jobs) jobDone(j.key, j.run());
    same(one, buildDesign(w, d()));
    clearBuildCache();
  });
  it('which designs may have jobs to share out: 8 m of track, or 2 m cut into track pieces (the setting or its default)', () => {
    const line = (studs: number, options?: Design['options']): Design => ({ version: 1, gaugeStuds: 4, ...(options && { options }), routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }] }] });
    // (the tests' default: long track cut to fill the bed)
    expect([mayHaveJobs(line(100)), mayHaveJobs(line(999)), mayHaveJobs(line(1000))]).toEqual([false, false, true]);
    expect([mayHaveJobs(line(100, { splitTrack: 'lengths' })), mayHaveJobs(line(249, { splitTrack: 'lengths' })), mayHaveJobs(line(250, { splitTrack: 'lengths' }))]).toEqual([false, false, true]);
  });
});
