// The warnings about plain track: grades, banks, tracks over each other, the print bed, the tables (warnings.shared.ts).
import { describe, expect, it } from 'vitest';
import { C, D, fires, R, S, SWITCH } from './warnings.shared';
import type { Table } from '../src/app/tables';

const T = (x: number, y: number, w: number, h: number): Table => ({ shape: 'rect', x, y, w, h });

describe('warnings: plain track', { timeout: 600000 }, () => {
  it('a grade steeper than the standard, and one too steep for most trains', async () => {
    const grade = (studs: number, plates: number) => D([R('G', 0, 0, 0, [S(studs)], { monoHeight: 0, monoHeightEnd: plates })]);
    // (2.5%: a plate a 16-stud straight; 6 plates over 96 studs is the standard)
    await fires(/G climbs 3\.8%: steeper than the standard 2\.5%/, grade(64, 6), grade(96, 6));
    await fires(/G climbs 7\.5%: too steep for most LEGO trains/, grade(32, 6), grade(96, 6));
  });
  it('track on a grade where it crosses other track: built as if level', async () => {
    const g = R('G', 0, 0, 0, [S(96)], { monoHeight: 0, monoHeightEnd: 6 });
    await fires(/on a grade is still built as if level where it crosses or meets other track/, D([g, R('X', -24, 48, -90, [S(48)])]), D([g]));
  });
  it('a bank left out where other track comes near it', async () => {
    const curve = R('Curve', 0, 0, 0, [S(40), C(56, 90, { bank: 4 }), S(40)]);
    const a = await fires(/the bank on Curve is left out: another track comes within a sleeper's length/, D([curve, R('Cross', -70, 60, -90, [S(120)])]), D([curve]));
    // (and ringed on the plan, where it says)
    expect(a.issues.length).toBeGreaterThan(0);
  });
  it('a bank with too little track to ramp up in', async () => {
    await fires(/Curve: a bank's ramp at .* climbs 1 in \d+, steeper than 1 in 100: too little track there/,
      D([R('Curve', 0, 0, 0, [S(2), C(56, 30, { bank: 6 }), S(2)])]), D([R('Curve', 0, 0, 0, [S(40), C(56, 90, { bank: 4 }), S(40)])]));
  });
  it('tracks run over each other', async () => {
    const a = await fires(/tracks run over each other \(closer than their sleepers, nearly parallel\) at 0, 0/, D([R('A', 0, 0, 0, [S(64)]), R('B', 3, 0, 2, [S(64)])]), D([R('A', 0, 0, 0, [S(64)]), R('B', 16, 0, 0, [S(64)])]));
    expect(a.issues.some((q) => /Tracks run over each other here/.test(q.text))).toBe(true);
  });
  it('a part with nowhere left to cut it for the print bed', async () => {
    await fires(/some parts don't fit the 60 x 60 print bed: there's nowhere left to cut them/, D(SWITCH(), { printBedX: 60, printBedY: 60 }), D(SWITCH()));
  });
  it('a section (track pieces) with nowhere left to cut it for the print bed', async () => {
    const d = (bed: number) => D([R('Straight', 0, 0, 0, [S(64)]), R('Branch', 0, 16, 0, [C(40, 22.5), C(40, -22.5), S(16)])], { splitTrack: 'lengths', legoTrack: 'lego', ballast: 'ballast', printBedX: bed, printBedY: bed });
    await fires(/some sections don't fit the 100 x 100 print bed: there's nowhere left to cut them/, d(100), d(256));
  });
  it('tables, with long track cut to fill the bed: their seams aren\'t cut at', async () => {
    const line = [R('A', 0, 0, 0, [S(64)])], tables = [T(-16, -16, 32, 48), T(-16, 32, 32, 48)];
    await fires(/the tables cut the track at their seams only with Long track cut into: Track pieces/, D(line, {}, { tables }), D(line, { splitTrack: 'lengths' }, { tables }));
  });
  it('layered points on track alone: built in one piece', async () => {
    await fires(/layered points need ballast/, D(SWITCH(), { pointsModule: 'layers', ballast: 'none' }), D(SWITCH(), { pointsModule: 'layers', ballast: 'ballast' }));
  });
});
