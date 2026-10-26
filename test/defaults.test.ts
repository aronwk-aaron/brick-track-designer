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
  it('a straight and an R40 curve built with them: all LEGO track, nothing printed', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const d: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }, { kind: 'curve', radius: 40, angle: 45 }] }] };
      const b = buildDesign(await kernel(), d);
      expect(b.info.warnings).toEqual([]);
      // (the 48-stud straight: three LEGO straights, the R40 45° curve two LEGO curves, none printed)
      const lego = b.pieces.filter((p) => p.lego), tr = b.pieces.filter((p) => !p.lego && p.name.startsWith('track'));
      expect(lego).toHaveLength(5);
      expect(lego.filter((p) => p.lego!.some((l) => l.part === '53401'))).toHaveLength(3);
      expect(lego.filter((p) => p.lego!.some((l) => l.part === '53400'))).toHaveLength(2);
      expect(tr).toHaveLength(0);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
  it('without ballast, R40 curves as LEGO\'s and R104 curves as BrickTracks\', a piece each; with ballast, curves printed', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const d = (ballast: string): Design => ({ version: 1, gaugeStuds: 4, options: { ballast } as Design['options'], routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }, { kind: 'curve', radius: 40, angle: 90 }, { kind: 'curve', radius: 104, angle: -45 }] }] });
      const w = await kernel(), b = buildDesign(w, d('none'));
      expect(b.info.warnings).toEqual([]);
      const count = (bb: typeof b, part: string) => bb.pieces.filter((p) => p.lego?.some((l) => l.part === part)).length;
      expect(count(b, '53401')).toBe(2);
      expect(count(b, '53400')).toBe(4);
      expect(count(b, 'BrickTracks R104')).toBe(4);
      const bb = buildDesign(w, d('ballast'));
      expect(count(bb, '53401')).toBe(2);
      expect(count(bb, '53400') + count(bb, 'BrickTracks R104')).toBe(0);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
});
