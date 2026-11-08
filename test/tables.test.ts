import { describe, expect, it } from 'vitest';
import { buildDesign, legoParts } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { onTable, type Table, tableAt } from '../src/app/tables';
import { kernel } from '../src/geom/kernel';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const withApp = async (f: () => Promise<void>) => { const saved = { ...OPTION_DEFAULTS }; Object.assign(OPTION_DEFAULTS, APP); try { await f(); } finally { Object.assign(OPTION_DEFAULTS, saved); } };

describe('tables: the track cut where they meet', { timeout: 900000 }, () => {
  it('a point on a rectangle, a ring section or any outline', () => {
    const r: Table = { shape: 'rect', x: 0, y: 0, w: 10, h: 20 }, a: Table = { shape: 'arc', cx: 0, cy: 0, r0: 10, r1: 20, a0: -45, a1: 90 }, p: Table = { shape: 'poly', pts: [[0, 0], [10, 0], [0, 10]] };
    expect([onTable(r, [5, 19]), onTable(r, [11, 5])]).toEqual([true, false]);
    expect([onTable(a, [15, 0]), onTable(a, [0, 15]), onTable(a, [-15, 0]), onTable(a, [5, 0]), onTable(a, [10, -10])]).toEqual([true, true, false, false, true]);
    expect([onTable(p, [2, 2]), onTable(p, [8, 8])]).toEqual([true, false]);
    expect(tableAt([r, a], [5 * 8, 5 * 8])).toBe(0);
    expect(tableAt([r, a], [-5 * 8, -5 * 8])).toBe(-1);
  });
  const two = (seam: number): Table[] => [{ shape: 'rect', x: -8, y: -8, w: 16, h: seam + 8 }, { shape: 'rect', x: -8, y: seam, w: 16, h: 80 }];
  const line = (tables: Table[], options: Partial<PieceOptions> = {}): Design => ({ version: 1, gaugeStuds: 4, tables, options: options as Design['options'], routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] }] });
  it('printed track: a joint at the seam, wherever it is', async () => withApp(async () => {
    const w = await kernel(), b = buildDesign(w, line(two(20), { legoTrack: 'print' }));
    expect(b.info.warnings).toEqual([]);
    // (pieces of 16 from the start, and one more joint at 20: 16, 4, 12, 16, 16)
    expect(b.pieces.filter((p) => /^track/.test(p.name))).toHaveLength(5);
  }));
  it('bought track: a seam at a joint, all bought; between joints, a warning and that piece printed', async () => withApp(async () => {
    const w = await kernel();
    const at = buildDesign(w, line(two(16)));
    expect(at.info.warnings).toEqual([]);
    expect(legoParts(at.pieces).find((p) => p.part === '53401')?.qty).toBe(4);
    const off = buildDesign(w, line(two(20)));
    expect(off.info.warnings.some((s) => /seam at 0, 20 \(studs\) isn't where two track pieces join/.test(s))).toBe(true);
    expect(legoParts(off.pieces).find((p) => p.part === '53401')?.qty).toBe(3);
  }));
  it('the return loops from LEGO\'s and BrickTracks\' track on their tables: all of it bought, only ballast printed', async () => withApp(async () => {
    const w = await kernel();
    for (const name of ['Double-track return loop (turning right)', 'Double-track return loop (turning left)']) {
      const b = buildDesign(w, TEMPLATES[name]);
      // (each switch's ballast one part, as the switch is: longer than the bed)
      expect(b.info.warnings.filter((s) => !/bought switch's ballast \(one part, as the switch is\) doesn't fit/.test(s))).toEqual([]);
      expect(b.pieces.filter((p) => !p.lego).every((p) => /ballast/.test(p.name))).toBe(true);
      const q = Object.fromEntries(legoParts(b.pieces).map((p) => [p.part, p.qty]));
      expect([q['53401'], q['BrickTracks R104'], q['BrickTracks R120'], q['BrickTracks R104B'], q['BrickTracks S08'], q['BrickTracks S04'], q['BrickTracks S01']]).toEqual([35, 28, 22, 2, 3, 1, 5]);
      expect((q['BrickTracks R104 switch right'] ?? 0) + (q['BrickTracks R104 switch left'] ?? 0)).toBe(2);
    }
  }));
});
