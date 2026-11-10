// What the status line counts as a switch is the same however it's built: a three-way is one. Built with the track
// round it (a network piece) it was counted 3, the pairs of its routes that part there; built on its own, 1.
// (A tandem built on its own is one switch with two throws: build.test.ts.)
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { bufferEnds, type Design, setSystem, TEMPLATES } from '../src/app/design';

describe('switches counted', { timeout: 300000 }, () => {
  // (throws: its sliders; the reference three-ways have a lever to each blade (threeWayLevers 2), one switch all the same)
  for (const [name, n, throws] of [['Three-way R40', 1, 2], ['Three-way R104', 1, 2], ['Three-way switch (one throw)', 1, 1], ['Three-way, no gap', 1, 2], ['Three-way, 2-stud gap', 1, 2], ['Three-way, 4-stud gap', 1, 2],
    ['Switch R40 left', 1, 1], ['Double slip R40 45°', 4, 4], ['Crossover, 4-stud gap, left', 2, 2]] as const)
    it(`${name}: ${n}`, async () => {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(TEMPLATES[name]));
      expect(b.info.switches).toBe(n);
      expect(b.pieces.filter((p) => /-throw\d*$/.test(p.name))).toHaveLength(throws);
      clearBuildCache();
    });
});

describe('a route made monorail', () => {
  it('has no buffer stops: its ends ordinary again, none on the plan or in the build; made train track again, still none', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'Siding', x: 0, y: 0, heading: 0, startEnd: 'buffer', endEnd: 'buffer', segs: [{ kind: 'straight', studs: 16 }] }] };
    expect(bufferEnds(d)).toHaveLength(2);
    setSystem(d.routes[0], 'monorail');
    expect(d.routes[0]).toEqual({ name: 'Siding', x: 0, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 16 }] });
    expect(bufferEnds(d)).toEqual([]);
    setSystem(d.routes[0], 'train');
    expect(d.routes[0].system).toBeUndefined();
    expect(bufferEnds(d)).toEqual([]);
  });
  it('a design saved with a buffer stop on a monorail route: none built', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'M', x: 0, y: 0, heading: 0, system: 'monorail', endEnd: 'buffer', segs: [{ kind: 'straight', studs: 16 }] }] };
    expect(bufferEnds(d)).toEqual([]);
  });
});
