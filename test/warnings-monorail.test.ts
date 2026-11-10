// The monorail's warnings (warnings.shared.ts); "experimental" and a beam into train track are in monorail.test.ts.
import { describe, expect, it } from 'vitest';
import { C, D, fires, MONO, R, S } from './warnings.shared';

describe('warnings: monorail', { timeout: 300000 }, () => {
  const level = D([R('A', 0, 0, 0, [S(32)], MONO)]);
  it('routes that meet at different heights', async () => {
    const two = (h: number) => D([R('A', 0, 0, 0, [S(32)], { ...MONO, monoHeight: 0 }), R('B', 0, 32, 0, [S(32)], { ...MONO, monoHeight: h })]);
    const a = await fires(/monorail A\+B: its height jumps at 0, 32 \(studs\), from 0 to 10 plates/, two(10), two(0));
    expect(a.issues.some((q) => /height jumps here/.test(q.text))).toBe(true);
  });
  it('a ramp steeper than LEGO\'s', async () => {
    const ramp = (studs: number) => D([R('A', 0, 0, 0, [S(studs)], { ...MONO, monoHeight: 0, monoHeightEnd: 30 })], { monoSupportStuds: 32 });
    await fires(/a monorail ramp at 0, 8 \(studs\) is 56° at its steepest, steeper than LEGO's monorail ramps \(21°\).*at least 62 studs long/, ramp(16), ramp(64));
  });
  it('raised with nothing under it', async () => {
    const up = (every: number) => D([R('A', 0, 0, 0, [S(32)], { ...MONO, monoHeight: 10 })], { monoSupportStuds: every });
    await fires(/monorail A is raised 10 plates with nothing under it: set Support every/, up(0), up(32));
  });
  it('points that aren\'t LEGO\'s shape', async () => {
    const lego = [S(2.8873016), C(22, 45), S(2.2010101)];
    await fires(/monorail points at 0, 0 \(studs\): points are LEGO's own shape, and these routes aren't: .*not built/, D([R('Main', 0, 0, 0, [S(32)], MONO), R('Branch', 0, 0, 0, [C(104, 8)], MONO)]),
      D([R('Main', 0, 0, 0, [S(32)], MONO), R('Branch', 0, 0, 0, lego, MONO)]));
    await fires(/monorail points at 0, 0 \(studs\): points are LEGO's own shape/, D([R('Main', 0, 0, 0, [S(24)], MONO), R('Branch', 0, 0, 0, lego, MONO)]), D([R('Main', 0, 0, 0, [S(32)], MONO), R('Branch', 0, 0, 0, lego, MONO)]));
  });
  it('points too big for the print bed', async () => {
    const pts = (bed: number) => D([R('Main', 0, 0, 0, [S(32)], MONO), R('Branch', 0, 0, 0, [S(2.8873016), C(22, 45), S(2.2010101)], MONO)], { printBedX: bed, printBedY: bed });
    await fires(/the monorail points \(monorail-points\) don't fit the 100 x 100 print bed: points aren't cut/, pts(100), pts(256));
  });
  it('beams that cross too close in height, or at too shallow an angle, or run along each other', async () => {
    const cross = (h: number) => D([R('A', 0, -24, 0, [S(48)], { ...MONO, monoHeight: 0 }), R('B', 24, 0, 90, [S(48)], { ...MONO, monoHeight: h })], { monoSupportStuds: 32 });
    const close = await fires(/monorail beams cross at 0, 0 \(studs\) 2 plates apart in height: too close to pass over each other/, cross(2), cross(0));
    // (said once: square across each other, they don't run along each other as well)
    expect(close.warnings.filter((s) => /monorail beams/.test(s))).toHaveLength(1);
    const two = (x: number, heading: number) => D([R('A', 0, -40, 0, [S(80)], MONO), R('B', x, -40, heading, [S(80)], MONO)]);
    await fires(/monorail beams cross at 0, -2 \(studs\) at 6°: too shallow for a level crossing/, two(4, 6), two(16, 0));
    await fires(/monorail beams run over each other at .*: they run along each other/, two(2, 0), two(16, 0));
  });
  it('a level crossing: said to be experimental', async () => {
    await fires(/monorail level crossings are experimental/, D([R('A', 0, -24, 0, [S(48)], MONO), R('B', 24, 0, 90, [S(48)], MONO)]), level);
  });
});
