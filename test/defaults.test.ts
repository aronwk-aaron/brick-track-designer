import { describe, expect, it } from 'vitest';
import { buildDesign } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions } from '../src/app/design';
import { kernel } from '../src/geom/kernel';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

describe('the app\'s defaults: like LEGO track', { timeout: 300000 }, () => {
  it('sleepers, the underside along the track, long track in 16-stud pieces', () => {
    expect(APP.sleepers).toBe('sleepers');
    expect(APP.undersideGrid).toBe('track');
    expect(APP.splitTrack).toBe('lengths');
    expect(APP.pieceLengthStuds).toBe(16);
    expect(APP.ballast).toBe('none');
    expect(APP.curveStuds).toBe('follow');
    expect(APP.legoTrack).toBe('lego');
  });
  it('a straight and a curve built with them: the straight as LEGO track, the curve printed in pieces with their rail-end supports apart', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const d: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }, { kind: 'curve', radius: 40, angle: 45 }] }] };
      const b = buildDesign(await kernel(), d);
      expect(b.info.warnings).toEqual([]);
      // (the 48-stud straight: three LEGO straights, not printed; the curve printed, each piece with its rail-end supports apart)
      const lego = b.pieces.filter((p) => p.lego), tr = b.pieces.filter((p) => !p.lego && p.name.startsWith('track'));
      expect(lego).toHaveLength(3);
      expect(lego.every((p) => p.lego!.some((l) => l.part === '53401'))).toBe(true);
      expect(tr.length).toBeGreaterThanOrEqual(2);
      for (const p of tr) expect(p.supports?.length ?? 0).toBeGreaterThan(0);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
});
