// The X yard stays as Aaron approved it (main 5669d85): its throws and levers aren't to move ("on the X, don't move the
// throws on the switches, leave them alone"). Each part's name, volume and box, as the app builds it, are pinned here
// (fixtures/xyard-parts.json, made from 5669d85). A change to the double slips' generator that moves anything on the X
// yard fails this; such a change goes behind a guard that leaves the X yard's slips as they are.
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
