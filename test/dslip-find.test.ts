// Double slips found in plain routes (switch/dslip.ts), and their points, levers and check rails worked out as the
// reference R104 double slip's: the same as they were once set by hand in its template.
import { describe, expect, it } from 'vitest';
import { type Design, OPTION_DEFAULTS, slipXYard, TEMPLATES, toRoutes } from '../src/app/design';
import { solve } from '../src/route/solver';
import { findDoubleSlips, slipTrackwork, underHand } from '../src/switch/dslip';

// (solved as the build solves it: its check rails as long as the options make them)
const found = (d: Design) => { const o = { ...OPTION_DEFAULTS, ...d.options }, routes = toRoutes(d), sol = solve(routes, { gauge: 40, step: 0.5, flangeway: o.flangeway, checkRailLen: o.checkRailLen, checkRailW: o.checkRailW }), ds = findDoubleSlips(routes, sol); return { routes, ds, tw: slipTrackwork(routes, sol, ds) }; };
/** The R104 double slip's trackwork as it was set by hand (hand 1: the diagonal crossing to the left). */
const handR104 = (hand: 1 | -1) => {
  const side = (s: 'left' | 'right'): 'left' | 'right' => (hand === 1 ? s : s === 'left' ? 'right' : 'left'), th = (s: 'left' | 'right') => ({ side: side(s), leverOffset: 24, leverAt: 5.5 });
  const pt = (toe: number) => ({ toe, heel: 18, single: 'straight' });
  return { points: { '0,-160': pt(67), [`${64 * hand},-160`]: pt(78), [`${-64 * hand},160`]: pt(78), '0,160': pt(67) },
    throw: { '0,-160': th('left'), [`${64 * hand},-160`]: th('right'), [`${-64 * hand},160`]: th('right'), '0,160': th('left') },
    check: { [`${-15 * hand},-101`]: { d1: -9 }, [`${15 * hand},101`]: { d0: -9 }, [`${52 * hand},-88`]: { d1: -9 }, [`${-52 * hand},88`]: { d0: -9 } } };
};

describe('double slips found in plain routes', () => {
  for (const hand of [1, -1] as const) it(`the R104 double slip (${hand === 1 ? 'left' : 'right'}): one, at 21.75 degrees on R104, its trackwork as the reference's`, () => {
    const { ds, tw } = found(TEMPLATES[`Double slip R104 ${hand === 1 ? 'left' : 'right'}`]);
    expect(ds).toHaveLength(1);
    expect(ds[0].roads).toHaveLength(2);
    expect(ds[0].angle).toBeCloseTo(21.75, 1);
    expect(ds[0].radius / 8).toBeCloseTo(104, 3);
    expect(ds[0].bisector).toBeCloseTo(10.87 * hand, 1);
    expect(Math.hypot(...ds[0].centre)).toBeLessThan(0.5);
    expect(ds[0].sets.every((s) => !s.inner)).toBe(true);
    expect(tw).toEqual(handR104(hand));
  });
  it('a 45-degree R40 double slip: its points at its ends, before the frogs; nothing worked out (the build places its levers)', () => {
    const { ds, tw } = found(TEMPLATES['Double slip (45°, R40)']);
    expect(ds).toHaveLength(1);
    expect(ds[0].angle).toBeCloseTo(45, 3);
    expect(tw.points).toEqual({});
    expect(tw.throw).toEqual({});
  });
  it('the X yard: a full double slip at each of the eight places a diagonal crosses a track; the four by its centre with an inner end there', () => {
    const { ds, tw } = found(slipXYard());
    expect(ds).toHaveLength(8);
    expect(ds.every((x) => x.roads.length === 2 && x.sets.length === 4)).toBe(true);
    // (the diagonals cross between the third and fourth tracks, at (40, 144) studs: the slips on those tracks have their inner end there)
    const inner = ds.filter((x) => x.sets.some((st) => st.inner));
    expect(inner.map((x) => x.centre.map((v) => Math.round(v / 8)).join(',')).sort()).toEqual(['32,124', '32,164', '48,124', '48,164']);
    expect(inner.every((x) => x.sets.filter((st) => st.inner).length === 2)).toBe(true);
    // (32 sets; where two slips meet end to end along a diagonal, its two sets there share a toe, and so one hand edit's key)
    expect(ds.flatMap((x) => x.sets)).toHaveLength(32);
    expect(Object.keys(tw.points)).toHaveLength(23);
  });
  it('the double slip crossover: four double slips, each with its inner end where the diagonals cross', () => {
    const { ds } = found(TEMPLATES['Double slip crossover R104']);
    expect(ds).toHaveLength(4);
    expect(ds.map((x) => x.centre.map((v) => Math.round(v / 8)).join(',')).sort()).toEqual(['0,0', '0,40', '16,0', '16,40']);
    expect(ds.every((x) => x.sets.filter((st) => st.inner).length === 2)).toBe(true);
  });
  it('hand edits win: the points\' and check rails\' field by field, a lever\'s whole', () => {
    const { tw } = found(TEMPLATES['Double slip R104 left']);
    const m = underHand<Parameters<typeof underHand>[0]>({ throw: { '0,-160': { side: 'right' } }, points: { '0,160': { toe: 60 } } }, tw);
    expect(m.throw!['0,-160']).toEqual({ side: 'right' });
    expect(m.throw!['0,160']).toEqual(tw.throw['0,160']);
    expect(m.points!['0,160']).toEqual({ toe: 60, heel: 18, single: 'straight' });
    expect(m.check).toEqual(tw.check);
  });
});
