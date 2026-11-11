// (expert) A track's own settings over the design's (overrides.ts, routeown.ts): what's in force at each level, what a
// track can't have of its own and why, which tracks are one part and whose settings that part takes, a file's own
// settings read and held to their ranges.
import { describe, expect, it } from 'vitest';
import { bankRolls, type Design, type DRoute, OPTION_DEFAULTS, readDesign, TEMPLATES } from '../src/app/design';
import { clampDesign } from '../src/app/limits';
import { hasPartOwn, ignoredOwn, inForce, inForceAll, liveOwn, partGroups, partsOf, resolveOptions, sourceOf, withoutPartOwn } from '../src/app/overrides';
import { BANK_KEYS, cleanOwn, OWN_CHOICES, OWN_LABELS, OWN_RANGES, PART_KEYS, ROUTE_KEYS } from '../src/app/routeown';
import { optionForm } from '../src/app/settings';
import { cleanStretches, expandStretches, followStretches, joinStretches, liveStretches, lostStretches, reverseStretches, splitStretches, stretchProblem } from '../src/app/stretches';
import { alongAfter } from '../src/app/routecuts';
import { splitRoute } from '../src/app/splitmerge';
import { reversedRoute } from '../src/app/routeedits';

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

describe('stretches of a track with settings of their own', () => {
  const own = { ballast: 'ballast' } as const;
  it('a file\'s: whole studs, in order, none over another, only the settings a stretch may have', () => {
    expect(cleanStretches([{ from: 20.4, to: 30, own: { ballast: 'buddy', legoTrack: 'lego', bankClimb: 50, joint: 'butt' } }, { from: 4, to: 22, own }, { from: 5, to: 6, own }, 'x', { from: 'a', to: 3 }, { from: 40, to: 9000, own: 3 }]))
      .toEqual([{ from: 4, to: 22, own }, { from: 22, to: 30, own: { ballast: 'buddy' } }, { from: 40, to: 2000, own: {} }]);
    for (const v of [undefined, 5, [], [{ from: 3, to: 4, own }]]) expect(cleanStretches(v)).toBeUndefined();
    const d = readDesign({ version: 1, gaugeStuds: 4, routes: [straight('A', 0, 0, { stretches: [{ from: 8, to: 16, own: { ballast: 'buddy', printBedX: 9 } as never }] }), straight('B', 24, 0, { stretches: 'all' as never })] });
    expect(d.routes[0].stretches).toEqual([{ from: 8, to: 16, own: { ballast: 'buddy' } }]);
    expect('stretches' in d.routes[1]).toBe(false);
  });
  it('as built: on the track, an end under 2 studs from the track\'s end or the stretch before taken there', () => {
    const r = straight('A', 0, 0, { stretches: [{ from: 1, to: 10, own }, { from: 11, to: 20, own: {} }, { from: 24, to: 31, own }, { from: 40, to: 50, own }] });
    expect(liveStretches(r)).toEqual([{ from: 0, to: 10, own }, { from: 10, to: 20, own: {} }, { from: 24, to: 32, own }]);
    expect(lostStretches(r)).toEqual([{ from: 40, to: 50, own }]);
    expect(stretchProblem(r, 20, 21)).toBe('A stretch is at least 2 studs long');
    expect(stretchProblem(r, 31, 40)).toBe('The track is 32 studs long: a stretch starts at 0 to 30');
    expect(stretchProblem(r, 8, 12)).toBe('Stretches can\'t run over each other');
    expect(stretchProblem(r, 8, 11, 0)).toBeUndefined();
    expect(stretchProblem(r, 20, 24)).toBeUndefined();
  });
  it('go with the track: turned end for end, split, joined, a piece reshaped', () => {
    const st = [{ from: 4, to: 12, own }, { from: 20, to: 32, own: { sleepers: 'bed' as const } }];
    expect(reverseStretches(st, 32)).toEqual([{ from: 0, to: 12, own: { sleepers: 'bed' } }, { from: 20, to: 28, own }]);
    expect(reverseStretches(reverseStretches(st, 32), 32)).toEqual(st);
    const [a, b] = splitStretches(st, 24);
    expect(a).toEqual([{ from: 4, to: 12, own }, { from: 20, to: 24, own: { sleepers: 'bed' } }]);
    expect(b).toEqual([{ from: 0, to: 8, own: { sleepers: 'bed' } }]);
    expect(joinStretches(a, b, 24)).toEqual([{ from: 4, to: 12, own }, { from: 20, to: 24, own: { sleepers: 'bed' } }, { from: 24, to: 32, own: { sleepers: 'bed' } }]);
    // (the editor's own: Split and Merge, and turned end for end)
    const d = design([straight('A', 0, 0, { stretches: st })]);
    expect(splitRoute(d, 0, 24)).toEqual({ first: 'A', second: 'T2' });
    expect([d.routes[0].stretches, d.routes[1].stretches]).toEqual([a, b]);
    expect(reversedRoute(straight('A', 0, 0, { stretches: st })).stretches).toEqual(reverseStretches(st, 32));
    // (the first piece made 8 studs longer: a stretch in it stays, one past it moves on)
    const before = { segs: [{ kind: 'straight' as const, studs: 16 }, { kind: 'curve' as const, radius: 40, angle: 45 }] }, after = { segs: [{ kind: 'straight' as const, studs: 24 }, before.segs[1]] };
    expect(followStretches(st, alongAfter(before, after)!)).toEqual([{ from: 4, to: 12, own }, { from: 28, to: 40, own: { sleepers: 'bed' } }]);
    expect(alongAfter(before, before)).toBeUndefined();
  });
  it('for the build each stretch is a track of its own, with the settings in force on it as its own', () => {
    const plain = design([straight('A', 0), straight('B', 24)]);
    expect(expandStretches(plain).design).toBe(plain);
    const d = design([straight('A', 0, 0, { own: { grip: 'all' }, endEnd: 'buffer', cuts: [4, 20], stretches: [{ from: 8, to: 16, own }, { from: 16, to: 31, own: { ballast: 'none', sleepers: 'sleepers' } }] }), straight('', 24), straight('A (8 to 16)', 48)], { sleepers: 'sleepers', ballast: 'none' });
    const x = expandStretches(d);
    expect(x.design.routes.map((r) => [r.name, r.y, r.segs, r.own, r.cuts, r.endEnd, r.stretches])).toEqual([
      ['A', 0, [{ kind: 'straight', studs: 8 }], { grip: 'all' }, [4], undefined, undefined],
      ['A (8 to 16)\'', 8, [{ kind: 'straight', studs: 8 }], { grip: 'all', ballast: 'ballast' }, undefined, undefined, undefined],
      ['A (16 to 32)', 16, [{ kind: 'straight', studs: 16 }], { grip: 'all', ballast: 'none', sleepers: 'sleepers' }, [4], 'buffer', undefined],
      ['1', 0, [{ kind: 'straight', studs: 32 }], undefined, undefined, undefined, undefined],
      ['A (8 to 16)', 0, [{ kind: 'straight', studs: 32 }], undefined, undefined, undefined, undefined]]);
    expect(x.of).toEqual([0, 0, 0, 1, 2]);
    expect([...x.names]).toEqual([['A (16 to 32)', 'A'], ['A (8 to 16)\'', 'A']]);
    // (the design itself is left as it was; a stretch over the whole track: no cut, its settings the track's)
    expect(d.routes[0].stretches).toHaveLength(2);
    const whole = expandStretches(design([straight('A', 0, 0, { stretches: [{ from: 0, to: 40, own }] })]));
    expect(whole.design.routes).toEqual([straight('A', 0, 0, { own })]);
    // (the part rule goes by the pieces: a stretch joined on in line is a part of its own; pieces that come out the same are built together)
    expect(partGroups(x.design).groups.map((g) => g.routes)).toEqual([[0, 2], [1], [3, 4]]);
  });
});
