import { describe, expect, it } from 'vitest';
import { buildDesign } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions } from '../src/app/design';
import { freeStart, PALETTE, placePart } from '../src/app/palette';
import { kernel } from '../src/geom/kernel';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
type Built = ReturnType<typeof buildDesign>;
const count = (b: Built, part: string) => b.pieces.reduce((t, p) => t + (p.lego?.filter((l) => l.part === part).reduce((u, l) => u + l.qty, 0) ?? 0), 0);

describe('the parts palette', { timeout: 600000 }, () => {
  it('lays each part on the selected route\'s end, a switch\'s branch as a new route', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [] };
    let at = placePart(d, 'lego-straight', undefined).next;
    expect(d.routes.length).toBe(1);
    at = placePart(d, 'lego-switch-l', at).next;
    expect([d.routes.length, at, d.routes[0].segs.length]).toEqual([2, 0, 2]);
    // (the branch starts where the switch does: 16 studs on)
    expect([d.routes[1].x, d.routes[1].y, d.routes[1].heading]).toEqual([d.routes[0].x, d.routes[0].y + 16, 0]);
    placePart(d, 'lego-r40', 1, -1);
    expect(d.routes[1].segs.at(-1)).toEqual({ kind: 'curve', radius: 40, angle: -22.5 });
    for (const p of PALETTE) expect(p.segs(1).length).toBeGreaterThan(0);
  });
  it('built, what is laid is bought: LEGO\'s straights, switch and curves; BrickTracks\' switch, curves and straights', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      const lego: Design = { version: 1, gaugeStuds: 4, routes: [] };
      let at = placePart(lego, 'lego-straight', undefined).next;
      at = placePart(lego, 'lego-switch-r', at).next;
      placePart(lego, 'lego-straight', at);
      placePart(lego, 'lego-r40', 1, 1);
      const b = buildDesign(w, lego);
      expect([count(b, '53401'), count(b, '53404'), count(b, '53400'), b.pieces.filter((p) => !p.lego).length]).toEqual([2, 1, 1, 0]);

      const bt: Design = { version: 1, gaugeStuds: 4, routes: [] };
      at = placePart(bt, 'bt-s08', undefined).next;
      at = placePart(bt, 'bt-switch-l', at).next;
      placePart(bt, 'bt-s04', at);
      placePart(bt, 'bt-r104', 1, -1);
      const c = buildDesign(w, bt);
      expect([count(c, 'BrickTracks S08'), count(c, 'BrickTracks S04'), count(c, 'BrickTracks R104'), c.pieces.filter((p) => !p.lego).length]).toEqual([1, 1, 1, 0]);
      expect(c.pieces.some((p) => p.lego?.some((l) => /switch/i.test(l.name)))).toBe(true);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
});

describe('a new route by itself', () => {
  it('starts clear of the routes there are, not on one of them', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [] };
    expect(freeStart(d)).toEqual({ x: 0, y: 0, heading: 0 });
    // (+ Route twice: the second below the first, not the same track again)
    for (let k = 0; k < 3; k++) d.routes.push({ name: `R${k + 1}`, ...freeStart(d), segs: [{ kind: 'straight', studs: 16 }] });
    expect(d.routes.map((r) => [r.x, r.y])).toEqual([[0, 0], [0, -24], [0, -48]]);
  });
});
