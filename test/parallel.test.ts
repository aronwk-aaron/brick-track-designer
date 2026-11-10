// A big build shared out among helper workers (parallel.ts): the same pieces
// as built in one worker, and an edit leaves the jobs it doesn't touch done.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, buildJobs, clearBuildCache, jobDone } from '../src/app/build';
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

describe('builds shared out', { timeout: 900000 }, () => {
  it('its jobs built apart (as helpers do) give the pieces a build in one worker gives', async () => {
    const w = await kernel();
    clearBuildCache();
    const one = buildDesign(w, yard());
    clearBuildCache();
    const jobs = buildJobs(w, yard());
    expect(jobs.length).toBeGreaterThan(2);
    for (const j of jobs) jobDone(j.key, j.run());
    const shared = buildDesign(w, yard());
    same(one, shared);
    // (and none left to do now)
    expect(buildJobs(w, yard())).toHaveLength(0);
    clearBuildCache();
  });
  it('through helpers (serveHelper, buildShared), the progress bar going up as the parts are built', async () => {
    const w = await kernel();
    clearBuildCache();
    const one = buildDesign(w, yard());
    clearBuildCache();
    // (each helper in this thread, with its own copy of the jobs, as a worker has)
    const spawn = (): HelperPort => {
      let to: (m: FromHelper) => void = () => {};
      const serve = serveHelper(w, (m) => setTimeout(() => to(structuredClone(m))));
      return { post: (m: ToHelper) => setTimeout(() => serve(structuredClone(m))), listen: (f) => { to = f; }, close: () => { to = () => {}; } };
    };
    const said: [string, number][] = [];
    const shared = await buildShared(w, yard(), spawn, 3, (what, f) => said.push([what, f]));
    same(one, shared);
    // (the bar: up as the parts are built, then the build's own steps in its last tenth)
    const parts = said.filter(([what]) => /parts done/.test(what)).map(([, f]) => f);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((f, k) => k === 0 || f >= parts[k - 1])).toBe(true);
    expect(said.slice(said.length - 3).every(([, f]) => f >= 0.9)).toBe(true);
    clearBuildCache();
  });
  it('a lever moved: only the tiles near its points to build again', async () => {
    const w = await kernel();
    clearBuildCache();
    const all = buildJobs(w, yard()).length;
    for (const j of buildJobs(w, yard())) jobDone(j.key, j.run());
    // (the crossover's points at its start, on L at (0, 1600))
    const again = buildJobs(w, yard({ throw: { '0,1600': { leverOffset: 16 } } })).length;
    expect(again).toBeGreaterThan(0);
    expect(again).toBeLessThan(all / 2);
    clearBuildCache();
  });
});
