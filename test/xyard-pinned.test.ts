// The X yard stays as Aaron approved it (main 5669d85): its throws and levers aren't to move ("on the X, don't move the
// throws on the switches, leave them alone"). Each part's name, volume and box, as the app builds it, are pinned here
// (fixtures/xyard-parts.json, made from 5669d85; track2 to track5, track22 and track23 since given the studs outside their stock
// rails along the points, 13, 13, 11, 11, 29 and 29 of them, 34.66 mm3 each, their boxes as they were). A change to the double slips' generator that moves anything on the X
// yard fails this; such a change goes behind a guard that leaves the X yard's slips as they are.
// (track9's volume 216625.83 -> 216590.3 when blades' cuts started clear of the toe's own plane (switch/base.ts toeCut):
// its file's own volume, from its triangles, was 216589.97 before and is 216590.30 now. The 216625.83 was the file read
// back as a solid with a film of rail of no thickness in it, 35.86 too much; the film's gone, and the file reads back
// as it is. Its box, and every other part, as they were.)
// (track2 to track5, 2026-11-16, Aaron: "Fix them". The two studs a cut went through, one on each side's ballast step at
// (38.07, 249.34) and (601.93, 249.34), left in two till then (track2 and track3 had 0.83 of one each, track4 and track5
// the rest), come off as any stud a cut goes through does: track2 and track3 29.79 mm3 less each, track4 and track5
// 5.95 less each. Their boxes, and every other part's volume and box (the throws and levers among them), as they were.)
// (track6 to track21, the parts with its eight double slips: the studs outside their stock rails along the points, put in
// on the parts after the cuts, each standing free (crossing.ts studsAfter, build.ts standStuds): 25, 20, 23, 18, 26, 27, 21, 14, 18, 21, 15, 23, 19, 23,
// 21 and 26 of them, 340 in all, 34.66 mm3 each, each part's change a whole number of studs to 0.003 mm3 a stud, nothing
// taken from any part. Boxes, throws, levers and points as they were.)
// (track3, 2026-11-19, approved by Aaron: 86234.15 -> 86651.66, its edge rim back. The rim along its cut edges had come out
// empty (underside.ts edgeGrip: its outline's spike of no area grew to a negative area). Its box, and every other part, as
// they were.)
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { drop, solid } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const NAME = 'X yard (6 tracks, double slips)';
type Part = [name: string, volume: number, box: number[]];
const PINNED: Part[] = JSON.parse(fs.readFileSync(new URL('./fixtures/xyard-parts.json', import.meta.url), 'utf8'));

describe('the X yard is pinned', { timeout: 1200000 }, () => {
  it(`${NAME}: every part's volume and box as on 5669d85`, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(TEMPLATES[NAME]));
      const got: Part[] = b.pieces.map((p) => {
        const m = p.positions?.length ? solid(w, p.positions) : undefined;
        if (!m) return [p.name, p.positions?.length ? -1 : 0, []];
        const bb = m.boundingBox(), v = m.volume();
        drop(m);
        return [p.name, +v.toFixed(2), [...bb.min, ...bb.max].map((x) => +x.toFixed(2))];
      });
      expect(got.map((p) => p[0]), 'the same parts').toEqual(PINNED.map((p) => p[0]));
      const off: string[] = [];
      got.forEach(([n, v, bb], i) => {
        const [, v0, bb0] = PINNED[i];
        if (Math.abs(v - v0) > 0.05 + Math.abs(v0) * 1e-5) off.push(`${n}: volume ${v0} -> ${v}`);
        if (bb.length !== bb0.length || bb.some((x, k) => Math.abs(x - bb0[k]) > 0.02)) off.push(`${n}: box ${bb0.join(',')} -> ${bb.join(',')}`);
      });
      expect(off, 'parts changed').toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
