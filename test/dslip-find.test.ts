// Double slips found in plain routes (switch/dslip.ts), and their points, levers and check rails worked out as the
// reference R104 double slip's: the same as they were once set by hand in its template.
import { describe, expect, it } from 'vitest';
import { type Design, OPTION_DEFAULTS, TEMPLATES, toRoutes } from '../src/app/design';
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
  it('a 45-degree R40 double slip: its points at its ends, before the frogs; only its levers worked out (outside)', () => {
    const { ds, tw } = found(TEMPLATES['Double slip (45°, R40)']);
    expect(ds).toHaveLength(1);
    expect(ds[0].angle).toBeCloseTo(45, 3);
    expect(tw.points).toEqual({});
    expect(tw.throw).toEqual({ '0,-133': { side: 'left', leverOffset: 24 }, '-94,94': { side: 'right', leverOffset: 24 }, '94,-94': { side: 'right', leverOffset: 24 }, '0,133': { side: 'left', leverOffset: 24 } });
  });
  it('the X yard: a slip at each slip road, double where both roads are drawn; the points as the hand-set ones', () => {
    const d = TEMPLATES['X yard (6 tracks, single slips)'], { ds, tw } = found(d);
    expect(ds).toHaveLength(8);
    expect(ds.filter((x) => x.roads.length === 2)).toHaveLength(2);
    expect(tw.points).toEqual(d.trackwork!.points);
    // (its hand-set check rails shorten those at the acute frogs at the slips' ends without points too: the worked-out ones, by
    // points only, among them; keyed a few mm along from where the hand-set ones were)
    const hand = Object.entries(d.trackwork!.check!).map(([k, v]) => [k.split(',').map(Number), v] as const);
    for (const [k, v] of Object.entries(tw.check)) {
      const q = k.split(',').map(Number), h = hand.find(([p]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 5);
      expect(h?.[1], k).toEqual(v);
    }
    expect(Object.keys(tw.check).length).toBeGreaterThanOrEqual(14);
  });
  it('hand edits win, field by field', () => {
    const { tw } = found(TEMPLATES['Double slip R104 left']);
    const m = underHand({ throw: { '0,-160': { side: 'right' as const } }, points: { '0,160': { toe: 60 } } }, tw);
    expect(m.throw!['0,-160']).toEqual({ side: 'right', leverOffset: 24, leverAt: 5.5 });
    expect(m.points!['0,160']).toEqual({ toe: 60, heel: 18, single: 'straight' });
    expect(m.check).toEqual(tw.check);
  });
});
