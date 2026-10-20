// Points taken out by hand, and forced where the solver wouldn't make them.
import { describe, expect, it } from 'vitest';
import type { Route } from '../src/route/route';
import { solve } from '../src/route/solver';
import { kernel } from '../src/geom/kernel';
import { buildDesign, droppedInner, type TrackworkItem } from '../src/app/build';
import { type Design, TEMPLATES, toRoutes } from '../src/app/design';

const main: Route = { id: 'Main', start: [0, 0, 0], segments: [{ kind: 'straight', length: 512 }] };
const branch = (x: number, y: number, h: number): Route => ({ id: 'Branch', start: [x, y, h], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: 128 }] });

describe('points taken out and forced (solver)', () => {
  it('a branch drawn on the track makes points; taken out, its rails are grooved as fixed track instead', () => {
    const rs = [main, branch(0, 128, 0)];
    const a = solve(rs, { step: 0.5 });
    expect(a.splits).toHaveLength(1);
    expect(a.near).toEqual([]);
    const b = solve(rs, { step: 0.5 }, { drop: (toe) => Math.hypot(toe[0], toe[1] - 128) < 1 });
    expect(b.splits).toHaveLength(0);
    expect(b.dropped).toHaveLength(1);
    // (the flangeways cut where the routes run together, which the points had taken care of)
    expect(b.grooves.length).toBeGreaterThan(a.grooves.length);
  });
  it('a three-way with one branch taken out is a two-way for the other', () => {
    const left = branch(0, 0, 0), right: Route = { id: 'Right', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: -22.5 }, { kind: 'straight', length: 128 }] };
    const rs = [main, left, right];
    expect(solve(rs, { step: 0.5 }).splits).toHaveLength(3);
    const b = solve(rs, { step: 0.5 }, { drop: (_, r) => r.includes(2) });
    expect(b.splits.map((sp) => sp.routes)).toEqual([[0, 1]]);
    expect(b.dropped).toHaveLength(2);
  });
  it('a branch a hair off the track is a near miss, made points only when forced', () => {
    const rs = [main, branch(0.3, 128, 0.6)];
    const a = solve(rs, { step: 0.5 });
    expect(a.splits).toHaveLength(0);
    expect(a.near).toHaveLength(1);
    expect(a.near![0]).toMatchObject({ routes: [0, 1], end: 'start', ok: true });
    expect(a.near![0].at[1]).toBeCloseTo(128, 3);
    const b = solve(rs, { step: 0.5 }, { force: (toe) => Math.hypot(toe[0], toe[1] - 128) < 1 });
    expect(b.splits).toHaveLength(1);
    expect(b.splits[0].forced).toBe(true);
  });
  it('a branch well off the track is a near miss that cannot be forced', () => {
    const rs = [main, branch(3, 128, 4)];
    const b = solve(rs, { step: 0.5 }, { force: () => true });
    expect(b.splits).toHaveLength(0);
    expect(b.near).toHaveLength(1);
    expect(b.near![0].ok).toBe(false);
  });
  it('track joined end to end, or crossing, is no near miss', () => {
    const on: Route = { id: 'On', start: [0, 512, 0], segments: [{ kind: 'straight', length: 128 }] };
    const across: Route = { id: 'X', start: [-64, 256, -90], segments: [{ kind: 'straight', length: 128 }] };
    expect(solve([main, on, across], { step: 0.5 }).near).toEqual([]);
  });
});

const BED = { printBedX: 600, printBedY: 600 };
const pointsOf = (b: ReturnType<typeof buildDesign>) => (b.overlay.items as TrackworkItem[]).filter((it) => it.kind === 'points');
/** Main, with a branch off its middle (at y = 16 studs: the toe at "0,128"), drawn x studs aside and h degrees off. */
const midBranch = (trackwork: Design['trackwork'] = {}, x = 0, h = 0): Design => ({ version: 1, gaugeStuds: 4, options: BED, trackwork, routes: [
  { name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
  { name: 'Branch', x, y: 16, heading: h, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 16 }] },
] });
const sn = Math.sin(Math.PI / 8), cs = Math.cos(Math.PI / 8);
/** A crossover: X off L (toe "0,32") merging into R. */
const crossover = (trackwork: Design['trackwork'] = {}, x = 0): Design => ({ version: 1, gaugeStuds: 4, options: { printBedX: 900, printBedY: 900 }, trackwork, routes: [
  { name: 'L', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 60 }] },
  { name: 'R', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 60 }] },
  { name: 'X', x, y: 4, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: (16 - 2 * 40 * (1 - cs)) / sn }, { kind: 'curve', radius: 40, angle: 22.5 }] },
] });

describe('points taken out and forced (pieces)', { timeout: 60000 }, () => {
  it('a switch taken out is plain fixed track, with no connector where the branch starts on the main line', async () => {
    const b = buildDesign(await kernel(), midBranch({ points: { '0,128': { off: true } } }));
    expect(b.info.warnings).toEqual([]);
    expect(b.info.switches).toBe(0);
    expect(b.pieces.map((p) => p.name)).toEqual(['track']);
    expect(pointsOf(b)).toMatchObject([{ key: '0,128', off: true, routes: ['Main', 'Branch'] }]);
    // (no connector where the branch starts on the main line: its rails run on to its start, as at points)
    const rs = toRoutes(midBranch()), sol = solve(rs, { gauge: 40, step: 0.5 }, { drop: () => true });
    expect([...droppedInner(rs, sol.dropped!, rs)]).toEqual(['1:start']);
    // (and with both routes starting together, both ends keep theirs)
    const lego = toRoutes(TEMPLATES['Left switch (LEGO)']);
    expect([...droppedInner(lego, solve(lego, { gauge: 40, step: 0.5 }, { drop: () => true }).dropped!, lego)]).toEqual([]);
  });
  it('the LEGO switch taken out (both routes starting together) is one piece of track', async () => {
    const b = buildDesign(await kernel(), { ...TEMPLATES['Left switch (LEGO)'], options: BED, trackwork: { points: { '0,0': { off: true } } } });
    expect(b.info.warnings).toEqual([]);
    expect(b.pieces.map((p) => p.name)).toEqual(['track']);
  });
  it("a three-way with a branch taken out is a two-way (the branch's rails through it as fixed track)", async () => {
    for (const drop of ['Right', 'Straight']) {
      const b = buildDesign(await kernel(), { ...TEMPLATES['Three-way switch (one throw)'], options: BED, trackwork: { points: { '0,0': { drop: [drop] } } } });
      expect(b.info.warnings).toEqual([]);
      expect(b.info.switches).toBe(1);
      expect(b.pieces.filter((p) => /throw/.test(p.name))).toHaveLength(1);
      const pts = pointsOf(b);
      expect(pts.filter((it) => !it.off).map((it) => it.routes)).toEqual([drop === 'Right' ? ['Straight', 'Left'] : ['Left', 'Right']]);
      expect(pts.filter((it) => it.off)).toHaveLength(2);
    }
  });
  it("a crossover with one end's points taken out keeps the other's (one network piece)", async () => {
    const b = buildDesign(await kernel(), crossover({ points: { '0,32': { off: true } } }));
    expect(b.info.warnings).toEqual([]);
    expect(b.info.switches).toBe(1);
    expect(b.pieces.map((p) => p.name)).toEqual(['track', 'points-a', 'points-b', 'points-throw', 'points-lever']);
    expect(pointsOf(b).map((it) => [it.key, !!it.off])).toEqual([['128,468', false], ['0,32', true]]);
  });
  it('a branch a hair off the track: offered, and a switch when forced', async () => {
    const w = await kernel();
    const a = buildDesign(w, midBranch({}, 0.03, 0.6));
    expect(a.info.switches).toBe(0);
    expect(pointsOf(a)).toMatchObject([{ key: '0,128', cand: { ok: true } }]);
    const b = buildDesign(w, midBranch({ points: { '0,128': { force: true } } }, 0.03, 0.6));
    expect(b.info.warnings).toEqual([]);
    expect(b.info.switches).toBe(1);
    expect(b.pieces.map((p) => p.name)).toEqual(['switch-base', 'switch-points-a', 'switch-points-b', 'switch-throw', 'switch-lever']);
    expect(pointsOf(b)).toMatchObject([{ key: '0,128', forced: true }]);
  });
  it('points forced at a crossover drawn a hair off (both ends), and at a branch drawn backwards', async () => {
    const w = await kernel();
    const b = buildDesign(w, crossover({ points: { '0,32': { force: true }, '128,468': { force: true } } }, 0.02));
    expect(b.info.warnings).toEqual([]);
    expect(b.info.switches).toBe(2);
    // (a branch drawn from where it merges, heading back along the main line: turned round, as an exact one is)
    const back = buildDesign(w, { version: 1, gaugeStuds: 4, options: BED, trackwork: { points: { '0,384': { force: true } } }, routes: [
      { name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
      { name: 'Back', x: 0.02, y: 48, heading: 180, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 16 }] },
    ] });
    expect(back.info.warnings).toEqual([]);
    expect(back.info.switches).toBe(1);
  });
  it('points forced where the branch is too far off: a warning, no switch', async () => {
    const b = buildDesign(await kernel(), midBranch({ points: { '0,128': { force: true } } }, 0.3, 3));
    expect(b.info.switches).toBe(0);
    expect(b.info.warnings.join()).toMatch(/points forced at 0,128: .*not built/);
    expect(pointsOf(b)).toMatchObject([{ key: '0,128', forced: true, cand: { ok: false } }]);
  });
});
