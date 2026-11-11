// (expert) A track's own settings over the design's (overrides.ts, routeown.ts): what's in force at each level, what a
// track can't have of its own and why, which tracks are one part and whose settings that part takes, a file's own
// settings read and held to their ranges.
import { describe, expect, it } from 'vitest';
import { bankRolls, type Design, type DRoute, OPTION_DEFAULTS, readDesign, TEMPLATES } from '../src/app/design';
import { clampDesign } from '../src/app/limits';
import { hasPartOwn, ignoredOwn, inForce, inForceAll, liveOwn, partGroups, partsOf, resolveOptions, sourceOf, withoutPartOwn } from '../src/app/overrides';
import { BANK_KEYS, cleanOwn, OWN_CHOICES, OWN_LABELS, OWN_RANGES, PART_KEYS, ROUTE_KEYS } from '../src/app/routeown';
import { optionForm } from '../src/app/settings';

const straight = (name: string, x: number, y = 0, extra: Partial<DRoute> = {}): DRoute => ({ name, x, y, heading: 0, segs: [{ kind: 'straight', studs: 32 }], ...extra });
const design = (routes: DRoute[], options: Design['options'] = {}): Design => ({ version: 1, gaugeStuds: 4, options, routes });

describe('the settings in force on a track', () => {
  const d = design([straight('A', 0, 0, { own: { ballast: 'buddy', sleeperGapStuds: 3 } }), straight('B', 24)], { ballast: 'ballast', printBedX: 200 });
  it('the defaults, the design\'s over them, the track\'s own over those, a feature\'s over all', () => {
    expect(resolveOptions(design([straight('A', 0)]), 0)).toEqual(OPTION_DEFAULTS);
    expect(resolveOptions(d, 1)).toMatchObject({ ballast: 'ballast', printBedX: 200, sleeperGapStuds: OPTION_DEFAULTS.sleeperGapStuds });
    expect(resolveOptions(d, 0)).toMatchObject({ ballast: 'buddy', printBedX: 200, sleeperGapStuds: 3 });
    expect(resolveOptions(d, 0, { sleeperGapStuds: 4 })).toMatchObject({ ballast: 'buddy', sleeperGapStuds: 4 });
    expect(resolveOptions(d, d.routes[0])).toEqual(resolveOptions(d, 0));
  });
  it('says where each value comes from', () => {
    expect(sourceOf(d, 0, 'ballast')).toBe('route');
    expect(sourceOf(d, 1, 'ballast')).toBe('design');
    expect(sourceOf(d, 1, 'grip')).toBe('default');
    expect(sourceOf(d, 0, 'sleeperGapStuds', { sleeperGapStuds: 5 })).toBe('feature');
    expect(sourceOf(d, 0, 'printBedX', { printBedX: 100 } as never)).toBe('design');
  });
  it('only the settings a track may have apply below the design: the rest are ignored, and the card can say why', () => {
    const r = straight('A', 0, 0, { own: { ballast: 'ballast', printBedX: 100, joint: 'butt' } as never });
    const dd = design([r]);
    expect(resolveOptions(dd, 0)).toMatchObject({ ballast: 'ballast', printBedX: OPTION_DEFAULTS.printBedX, joint: OPTION_DEFAULTS.joint });
    expect(resolveOptions(dd, 0, { joint: 'butt', flangeway: 5 })).toMatchObject({ joint: OPTION_DEFAULTS.joint, flangeway: OPTION_DEFAULTS.flangeway });
    expect(ignoredOwn(r)).toEqual([{ key: 'printBedX', why: 'set for the whole design: parts that meet must agree' }, { key: 'joint', why: 'set for the whole design: parts that meet must agree' }]);
    // (a monorail beam has none of them)
    const m = straight('M', 0, 0, { system: 'monorail', own: { ballast: 'ballast' } });
    expect(resolveOptions(design([m]), 0).ballast).toBe(OPTION_DEFAULTS.ballast);
    expect(ignoredOwn(m)).toEqual([{ key: 'ballast', why: 'a monorail beam has none of these' }]);
  });
  it('a track\'s own the same as the design\'s is no setting of its own', () => {
    const dd = design([straight('A', 0, 0, { own: { ballast: 'ballast', grip: OPTION_DEFAULTS.grip } })], { ballast: 'ballast' });
    expect(liveOwn(dd, dd.routes[0])).toEqual({});
    expect(hasPartOwn(dd)).toBe(false);
    // (its banks' ramps are its own, never a part's: no group build for them)
    expect(hasPartOwn(design([straight('A', 0, 0, { own: { bankClimb: 300 } })]))).toBe(false);
    expect(hasPartOwn(d)).toBe(true);
  });
  it('a track\'s own bank ramps are what its banked curves are ramped by', () => {
    const r: DRoute = { name: 'B', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }, { kind: 'curve', radius: 40, angle: 90, bank: 5 }, { kind: 'straight', studs: 48 }] };
    const dd = design([r]), own = design([{ ...r, own: { bankRampStuds: 8, bankClimb: 20 } }]), viaDesign = design([r], { bankRampStuds: 8, bankClimb: 20 });
    expect(bankRolls(own, own.routes[0])).toEqual(bankRolls(viaDesign, viaDesign.routes[0]));
    expect(bankRolls(own, own.routes[0])).not.toEqual(bankRolls(dd, dd.routes[0]));
  });
});

describe('which tracks are one part', () => {
  it('tracks apart are parts of their own; beds within 2 studs of each other, or tracks that meet in points or cross, are one', () => {
    expect(partsOf(design([straight('A', 0), straight('B', 16)]))).toEqual([0, 1]);
    // (16 studs apart, both on ballast with its buddy layer: 32 mm between them)
    expect(partsOf(design([straight('A', 0), straight('B', 16)], { ballast: 'buddy' }))).toEqual([0, 1]);
    expect(partsOf(design([straight('A', 0), straight('B', 9)]))).toEqual([0, 0]);
    expect(partsOf(structuredClone(TEMPLATES['Left switch (LEGO)']))).toEqual([0, 0]);
    expect(partsOf(structuredClone(TEMPLATES['90° crossing']))).toEqual([0, 0]);
    expect(partsOf(structuredClone(TEMPLATES['Crossover (R40)']))).toEqual([0, 0, 0]);
  });
  it('tracks joined end to end are two parts (an ordinary track end between them), unless the gauges part there', () => {
    const a = straight('A', 0), b = straight('B', 0, 32), back: DRoute = { ...straight('C', 0, 64), heading: 180 };
    expect(partsOf(design([a, b]))).toEqual([0, 1]);
    // (a short track joined on between two: three parts, the outer two near each other only along the line)
    expect(partsOf(design([a, { ...b, segs: [{ kind: 'straight', studs: 4 }] }, straight('C', 0, 36)]))).toEqual([0, 1, 2]);
    // (the second drawn the other way: its end on the first's)
    expect(partsOf(design([a, back]))).toEqual([0, 1]);
    expect(partsOf(design([a, { ...b, gaugeStuds: 2 }]))).toEqual([0, 0]);
    expect(partsOf(design([{ ...a, dualGauge: true }, b]))).toEqual([0, 0]);
    // (a wye on another's end: the two leaving it are its points, one part; the track ending at the toe is a part of its own)
    expect(partsOf(design([a, { ...b, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }, { ...b, name: 'D', segs: [{ kind: 'curve', radius: 40, angle: -22.5 }] }]))).toEqual([0, 1, 1]);
    // (a branch leaving another's middle is points, one part)
    expect(partsOf(design([{ ...a, segs: [{ kind: 'straight', studs: 64 }] }, { ...b, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }]))).toEqual([0, 0]);
  });
  it('a track running past points within a lever\'s reach is one part with them', () => {
    // (a switch, and a straight beside it: 10 studs off, beds 2 studs apart, a lever's place between them; 16 off, clear)
    const sw = [{ ...straight('A', 0), segs: [{ kind: 'straight' as const, studs: 64 }] }, { ...straight('B', 0, 16), segs: [{ kind: 'curve' as const, radius: 40, angle: 22.5 }] }];
    for (const side of [-1, 1]) {
      expect(partsOf(design([...sw, straight('C', side * 10, 8)]))).toEqual([0, 0, 0]);
      expect(partsOf(design([...sw, straight('C', side * 16, 8)]))).toEqual([0, 0, 2]);
    }
    // (two plain tracks 10 studs apart: two parts, as ever)
    expect(partsOf(design([straight('A', 0), straight('C', -10)]))).toEqual([0, 1]);
    // (a siding joined onto the branch's end: a part of its own still)
    expect(partsOf(design([...structuredClone(TEMPLATES['Left switch (LEGO)']).routes, { name: 'S', x: -12.955183, y: 32.692665, heading: 22.5, segs: [{ kind: 'straight', studs: 16 }] }]))).toEqual([0, 0, 2]);
  });
  it('a part takes the settings of its first track with its own; the others are said by name', () => {
    const d = structuredClone(TEMPLATES['Left switch (LEGO)']);
    d.routes[1].own = { ballast: 'ballast' };
    const pg = partGroups(d);
    expect(pg.groups).toEqual([{ routes: [0, 1], options: { ...d.options, ballast: 'ballast' } }]);
    expect(pg.takes).toEqual([1, undefined]);
    expect(pg.warnings).toEqual(["Straight and Branch are one part (they meet in points or a crossing, or lie side by side): both take Branch's Ballast"]);
    expect(inForce(d, 0).ballast).toBe('ballast');
    d.routes[0].own = { ballast: 'buddy' };
    expect(partGroups(d).takes).toEqual([undefined, 0]);
    expect(inForce(d, 1).ballast).toBe('buddy');
    // (the same settings: nothing to say)
    d.routes[1].own = { ballast: 'buddy' };
    expect(partGroups(d).warnings).toEqual([]);
  });
  it('tracks joined end to end, one on ballast and the other not: the step in the rails is said', () => {
    const d = design([straight('A', 0, 0, { own: { ballast: 'ballast' } }), straight('B', 0, 32), straight('C', 24)]);
    expect(partGroups(d).warnings).toEqual(["A and B meet end to end, but A's ballast lifts it a plate (3.2 mm) higher: put a plate under B, or give both the same Ballast"]);
    d.routes[1].own = { ballast: 'buddy' };
    expect(partGroups(d).warnings).toEqual(["B and A meet end to end, but B's ballast lifts it a plate (3.2 mm) higher: put a plate under A, or give both the same Ballast"]);
    d.routes[0].own = { ballast: 'buddy' };
    expect(partGroups(d).warnings).toEqual([]);
    expect(partGroups(structuredClone(TEMPLATES['Station track on a solid bed, the line beyond on sleepers'])).warnings).toEqual([]);
  });
  it('parts that come out the same are built together; each track keeps its own banks', () => {
    const d = design([straight('A', 0), straight('B', 24, 0, { own: { ballast: 'ballast' } }), straight('C', 48), straight('D', 72, 0, { own: { ballast: 'ballast', bankClimb: 200 } })]);
    const pg = partGroups(d);
    expect(pg.groups.map((g) => g.routes)).toEqual([[0, 2], [1, 3]]);
    expect(pg.groups[0].options).toBe(d.options);
    expect(inForceAll(d).map((o) => [o.ballast, o.bankClimb])).toEqual([['none', 100], ['ballast', 100], ['none', 100], ['ballast', 200]]);
    expect(withoutPartOwn(d.routes[3])).toEqual({ ...d.routes[3], own: { bankClimb: 200 } });
    expect(withoutPartOwn(d.routes[1]).own).toBeUndefined();
  });
});

describe('a file\'s own settings for a track', () => {
  it('keeps the ones a track may have, each a value it takes; numbers held to their ranges', () => {
    expect(cleanOwn({ ballast: 'ballast', joint: 'butt', sleepers: 'gravel', grip: 5, sleeperWidthStuds: 1, sleeperGapStuds: 99, bankClimb: 3.4, bankRampStuds: Number.NaN })).toEqual({ ballast: 'ballast', sleeperWidthStuds: 1, sleeperGapStuds: 6, bankClimb: 20 });
    for (const v of [undefined, null, 5, 'x', [], {}, { joint: 'butt' }]) expect(cleanOwn(v)).toBeUndefined();
    const d = readDesign({ version: 1, gaugeStuds: 4, routes: [straight('A', 0, 0, { own: { ballast: 'buddy', printBedX: 9 } as never }), straight('B', 24, 0, { own: 'all' as never })] });
    expect(d.routes[0].own).toEqual({ ballast: 'buddy' });
    expect('own' in d.routes[1]).toBe(false);
    // (an old file, none: as it was)
    expect(readDesign(structuredClone(TEMPLATES['Left switch (LEGO)']))).toEqual(TEMPLATES['Left switch (LEGO)']);
  });
  it('a design held to its ranges holds a track\'s own numbers too', () => {
    const d = clampDesign(design([straight('A', 0, 0, { own: { sleeperGapStuds: 0.4, bankRampStuds: 5000 } })]));
    expect(d.routes[0].own).toEqual({ sleeperGapStuds: 1, bankRampStuds: 200 });
  });
});

describe('a track\'s own settings are the Settings panel\'s', () => {
  const fields = optionForm(() => design([])).form.flatMap((s) => s.fields);
  it('each with the label, the choices and the range the panel has', () => {
    expect([...PART_KEYS, ...BANK_KEYS]).toEqual([...ROUTE_KEYS]);
    for (const k of ROUTE_KEYS) {
      const f = fields.find((x) => x.key === k)!;
      expect(f, k).toBeDefined();
      expect(OWN_LABELS[k], k).toBe(f.label);
      if (f.choices) expect([...(OWN_CHOICES[k] ?? [])].map(String).sort(), k).toEqual(f.choices.map((c) => c.v).sort());
      else expect([OWN_RANGES[k]?.min, OWN_RANGES[k]?.max, OWN_RANGES[k]?.step], k).toEqual([f.min, f.max, f.step]);
    }
  });
});
