import { describe, expect, it } from 'vitest';
import { buildDesign } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';
import { kernel } from '../src/geom/kernel';
import { BT_LEAD } from '../src/app/boughtswitch';
import { routeLength, routePose } from '../src/route/route';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
type Built = ReturnType<typeof buildDesign>;
const count = (b: Built, part: string) => b.pieces.filter((p) => p.lego?.some((l) => l.part === part)).length;
const printed = (b: Built) => b.pieces.filter((p) => !p.lego);
const withOpts = (d: Design, o: Partial<PieceOptions>): Design => ({ ...d, options: { ...d.options, ...o } as Design['options'] });

describe('switches bought as track pieces, as plain track is', { timeout: 600000 }, () => {
  it('LEGO\'s switch points (the LEGO templates): bought, nothing printed; Printed: built as a switch', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      const l = buildDesign(w, TEMPLATES['Left switch (LEGO)']), r = buildDesign(w, TEMPLATES['Right switch (LEGO)']);
      expect(l.info.warnings).toEqual([]);
      expect([count(l, '53407'), count(l, '53404'), printed(l).length]).toEqual([1, 0, 0]);
      expect([count(r, '53407'), count(r, '53404'), printed(r).length]).toEqual([0, 1, 0]);
      const p = buildDesign(w, withOpts(TEMPLATES['Left switch (LEGO)'], { legoTrack: 'print' }));
      expect(count(p, '53407')).toBe(0);
      expect(p.pieces.some((q) => /points/.test(q.name))).toBe(true);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
  it('the track on from it bought or printed as it would be; drawn the other way (merging in), the same', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      // (the switch, 16 more studs of straight, and an R40 curve back to parallel, 16 studs over: all LEGO's)
      const d: Design = { version: 1, gaugeStuds: 4, routes: [
        { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }] },
        { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }, { kind: 'curve', radius: 40, angle: -22.5 }] },
      ] };
      const b = buildDesign(w, d);
      expect(b.info.warnings).toEqual([]);
      expect([count(b, '53407'), count(b, '53401'), count(b, '53400'), printed(b).length]).toEqual([1, 1, 1, 0]);
      // (the end of the branch: 12.955 + 3.045 = 16 studs over)
      const rts = toRoutes(d), e = routePose(rts[1], routeLength(rts[1]));
      expect(Math.abs(e[0]) / 8).toBeCloseTo(16, 2);
      // (each route drawn from its far end: the switch merging in)
      const back: Design = { version: 1, gaugeStuds: 4, routes: [
        { name: 'Straight', x: 0, y: 48, heading: 180, segs: [{ kind: 'straight', studs: 48 }] },
        { name: 'Branch', x: e[0] / 8, y: e[1] / 8, heading: e[2] + 180, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'curve', radius: 40, angle: 14.3699 }, { kind: 'curve', radius: 40, angle: -36.8699 }] },
      ] };
      const bk = buildDesign(w, back);
      expect([count(bk, '53407'), count(bk, '53401'), count(bk, '53400'), printed(bk).length]).toEqual([1, 1, 1, 0]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
  it('BrickTracks\' R104 switch: bought; LEGO\'s only: printed', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      const d: Design = { version: 1, gaugeStuds: 4, routes: [
        { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] },
        { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: BT_LEAD / 8 }] },
      ] };
      const b = buildDesign(w, d);
      expect(b.info.warnings).toEqual([]);
      expect([count(b, 'BrickTracks R104 switch right'), printed(b).length]).toEqual([1, 0]);
      const lo = buildDesign(w, withOpts(d, { legoTrack: 'lego-only' }));
      expect(count(lo, 'BrickTracks R104 switch right')).toBe(0);
      expect(lo.pieces.some((q) => /points/.test(q.name))).toBe(true);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
  it('a switch that isn\'t exactly theirs, or with other track over it, printed', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      // (the wye: not theirs; the R40 crossover: each switch's branch runs into the other's)
      const wye = buildDesign(w, TEMPLATES['Wye switch']);
      expect(wye.pieces.filter((p) => p.lego?.some((l) => /53407|53404|switch/.test(l.part)))).toHaveLength(0);
      const short: Design = { version: 1, gaugeStuds: 4, routes: [
        { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] },
        { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }] },
      ] };
      expect(count(buildDesign(w, short), '53407')).toBe(0);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
  it('on ballast: its ballast printed alone, seated for its underside, clear of the switch as bought', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      for (const ballast of ['ballast', 'buddy'] as const) {
        const b = buildDesign(w, withOpts(TEMPLATES['Left switch (LEGO)'], { ballast }));
        expect(b.info.warnings).toEqual([]);
        expect(count(b, '53407')).toBe(1);
        // (cut for the print bed: the switch is longer than it)
        const seats = printed(b);
        expect(seats.length).toBeGreaterThan(0);
        for (const p of seats) expect(p.name).toMatch(/^switch-ballast\d*$/);
        const man = (p: Built['pieces'][number]) => { const m = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(p.positions), triVerts: new Uint32Array(p.positions.length / 3).map((_, i) => i) }); m.merge(); return new w.Manifold(m); };
        const sw = man(b.pieces.find((p) => p.lego)!);
        for (const p of seats) {
          const m = man(p);
          expect(m.decompose()).toHaveLength(1);
          expect(m.boundingBox().min[2]).toBeCloseTo(ballast === 'buddy' ? -6.4 : -3.2, 1);
          expect(sw.intersect(m).volume()).toBeLessThan(0.01);
          // (up to the sleepers' top between the switch's sleepers, as under a curve)
          expect(m.boundingBox().max[2]).toBeCloseTo(3.2, 1);
        }
      }
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
});
