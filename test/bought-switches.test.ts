import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';
import { kernel } from '../src/geom/kernel';
import { BT_LEAD } from '../src/app/boughtswitch';
import { routeLength, routePose } from '../src/route/route';
import { assembledProblems } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
type Built = ReturnType<typeof buildDesign>;
const count = (b: Built, part: string) => b.pieces.filter((p) => p.lego?.some((l) => l.part === part)).length;
const printed = (b: Built) => b.pieces.filter((p) => !p.lego);
const withOpts = (d: Design, o: Partial<PieceOptions>): Design => ({ ...d, options: { ...d.options, ...o } as Design['options'] });

describe('switches bought as track pieces, as plain track is', { timeout: 600000 }, () => {
  it('LEGO\'s switch points (the LEGO templates, set to buy): bought, nothing printed; as the templates are, Printed: built as a switch', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      // (the templates print theirs: bought, set so)
      const l = buildDesign(w, withOpts(TEMPLATES['Left switch (LEGO)'], { legoTrack: 'lego' })), r = buildDesign(w, withOpts(TEMPLATES['Right switch (LEGO)'], { legoTrack: 'lego' }));
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
        const b = buildDesign(w, withOpts(TEMPLATES['Left switch (LEGO)'], { ballast, legoTrack: 'lego' }));
        expect(b.info.warnings).toEqual([]);
        expect(count(b, '53407')).toBe(1);
        // (one part, as the switch is; longer than the 256 mm bed, in two, cut across between its sleepers)
        const seats = printed(b);
        expect(seats.length).toBe(2);
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
  it('Bought track\'s ballast: Together, as before: under pieces side by side in one, cut for the bed', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      const d: Design = { version: 1, gaugeStuds: 4, options: { ballast: 'ballast' } as Design['options'], routes: [
        { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }, { kind: 'straight', studs: 4 }] },
        { name: 'B', x: 9, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }, { kind: 'straight', studs: 4 }] },
      ] };
      const each = buildDesign(w, d), together = buildDesign(w, withOpts(d, { boughtBallast: 'together' }));
      expect([each.info.warnings, together.info.warnings]).toEqual([[], []]);
      // (BrickTracks' 1/2 and 1/4 straights, two tracks 9 studs apart, their ballast meeting: 4 ballast parts, or one)
      expect(printed(each)).toHaveLength(4);
      expect(printed(together)).toHaveLength(1);
      const sw = buildDesign(w, withOpts(TEMPLATES['Left switch (LEGO)'], { ballast: 'ballast', boughtBallast: 'together', legoTrack: 'lego' }));
      expect(sw.info.warnings).toEqual([]);
      expect(printed(sw).length).toBeGreaterThan(1);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
  // (whose ground is whose where a bought switch's ballast meets other track's: under a track's own sleepers it's
  // that track's; the rest of the switch's band the switch's. Not the templates' designs: bought and printed track on
  // from each end of each make of switch, on ballast and with the buddy layer, each piece's ballast its own or
  // together: all of it goes together (assembled.shared.ts), the switch and the track at its ends as any two pieces)
  const LEAD = (8 - 104 * (1 - Math.cos(Math.PI / 8))) / Math.sin(Math.PI / 8);
  const beside: [string, Design['routes']][] = [
    ['their R104 switch, bought track on from every end', [
      { name: 'Lead', x: 0, y: -16, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
      { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }, { kind: 'straight', studs: 1.6 }, { kind: 'straight', studs: 8 }] },
      { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: LEAD }, { kind: 'curve', radius: 104, angle: -11.25 }] }]],
    ['their R104 switch the other hand, printed track on from every end', [
      { name: 'Lead', x: 8, y: -4, heading: 90, segs: [{ kind: 'curve', radius: 60, angle: 20 }] },
      { name: 'Straight', x: 8, y: -4, heading: 270, segs: [{ kind: 'straight', studs: 40 }, { kind: 'curve', radius: 60, angle: 15 }] },
      { name: 'Branch', x: 8, y: -4, heading: 270, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: LEAD }, { kind: 'curve', radius: 60, angle: 22.5 }] }]],
    // (left hand, printed track on from both far ends: each end's track a part of its own, cut apart down the gap between
    // them (build.ts partedAtSwitches). In one part it wouldn't slide onto the switch's two ends: 22 mm3 in the way)
    ['their R104 switch, left hand, printed track on from both far ends', [
      { name: 'Lead', x: 0, y: -16, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
      { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }, { kind: 'curve', radius: 60, angle: -15 }] },
      { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: LEAD }, { kind: 'curve', radius: 60, angle: -22.5 }] }]],
    ['LEGO\'s switch, left hand, printed track on from both far ends', [
      { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }, { kind: 'straight', studs: 13 }] },
      { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }, { kind: 'curve', radius: 60, angle: -22.5 }] }]],
    ['LEGO\'s switch, a LEGO curve and a printed straight on from it', [
      { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }, { kind: 'straight', studs: 13 }] },
      { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }, { kind: 'curve', radius: 40, angle: -22.5 }] }]],
  ];
  for (const [what, routes] of beside) for (const [ballast, boughtBallast] of [['ballast', 'each'], ['buddy', 'each'], ['ballast', 'together']] as const)
    it(`${what}, on ${ballast}, its ballast ${boughtBallast}: it all goes together`, async () => {
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        const w = await kernel();
        clearBuildCache();
        const d: Design = { version: 1, gaugeStuds: 4, options: { ballast, boughtBallast } as Design['options'], routes };
        const b = buildDesign(w, d);
        clearBuildCache();
        expect(b.info.warnings).toEqual([]);
        expect(b.pieces.filter((p) => /^switch-bought/.test(p.name))).toHaveLength(1);
        expect(b.pieces.some((p) => /^switch-ballast/.test(p.name))).toBe(true);
        expect(assembledProblems(w, b.pieces, { ...APP, ...d.options }).join('; ')).toBe('');
      } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
    });
  // (their switch's far ends are 8 studs apart, so on ballast the two tracks on from them share ground: built as one
  // section, they came as one part on both ends. Either hand, each make of ballast: no printed part has track just past
  // both far ends, each end has a part that does, and nothing's said)
  for (const hand of [1, -1]) it(`their R104 switch, ${hand > 0 ? 'left' : 'right'} hand: the printed track on from each far end is a part of its own`, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      const routes: Design['routes'] = [
        { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }, { kind: 'curve', radius: 60, angle: -15 * hand }] },
        { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 * hand }, { kind: 'straight', studs: LEAD }, { kind: 'curve', radius: 60, angle: -22.5 * hand }] }];
      // (4 mm past each far end, on its centre line: the straight's 40 studs on, the branch's 8 over and turned 22.5 degrees)
      const a = (22.5 * Math.PI) / 180, ends: [number, number][] = [[0, 324], [-hand * (64 + 4 * Math.sin(a)), 320 + 4 * Math.cos(a)]];
      const on = (p: Built['pieces'][number], q: [number, number]) => { const v = p.positions; for (let i = 0; i < v.length; i += 3) if (Math.abs(v[i] - q[0]) < 6 && Math.abs(v[i + 1] - q[1]) < 6) return true; return false; };
      for (const options of [{ ballast: 'ballast' }, { ballast: 'buddy' }, { ballast: 'ballast', boughtBallast: 'together' }, {}] as Design['options'][]) {
        clearBuildCache();
        const b = buildDesign(w, { version: 1, gaugeStuds: 4, options, routes });
        expect(b.info.warnings, JSON.stringify(options)).toEqual([]);
        const track = b.pieces.filter((p) => /^track[\d-]*$/.test(p.name));
        expect(track.filter((p) => ends.every((q) => on(p, q))).map((p) => p.name), JSON.stringify(options)).toEqual([]);
        for (const q of ends) expect(track.filter((p) => on(p, q)), JSON.stringify(options)).toHaveLength(1);
      }
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
