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
  it('R40 curves as LEGO\'s and R104 curves as BrickTracks\', a piece each; with ballast, the curves still bought, their ballast printed (seated for them), or on a flat underside BrickTracks\' own', async () => {
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
      // (LEGO's only: the R104 curves printed; Printed: nothing bought)
      const bl = buildDesign(w, { ...d('none'), options: { ballast: 'none', legoTrack: 'lego-only' } as Design['options'] });
      expect([count(bl, '53401'), count(bl, '53400'), count(bl, 'BrickTracks R104')]).toEqual([2, 4, 0]);
      expect(bl.pieces.filter((p) => !p.lego && p.name.startsWith('track')).length).toBeGreaterThan(0);
      const bp = buildDesign(w, { ...d('none'), options: { ballast: 'none', legoTrack: 'print' } as Design['options'] });
      expect(bp.pieces.filter((p) => p.lego)).toHaveLength(0);
      // (with ballast: each curve bought, and a printed ballast piece for it, clear of it; on the buddy layer, the buddy in it)
      const bb = buildDesign(w, d('buddy'));
      expect(bb.info.warnings).toEqual([]);
      expect(count(bb, '53401')).toBe(2);
      expect(count(bb, '53400')).toBe(4);
      expect(count(bb, 'BrickTracks R104')).toBe(4);
      const seats = bb.pieces.filter((p) => /-ballast$/.test(p.name));
      expect(seats).toHaveLength(8);
      const man = (p: (typeof bb.pieces)[number]) => { const m = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(p.positions), triVerts: new Uint32Array(p.positions.length / 3).map((_, i) => i) }); m.merge(); return new w.Manifold(m); };
      const bought = bb.pieces.filter((p) => p.lego?.some((l) => l.part !== '53401')).map(man);
      for (const p of seats) {
        const m = man(p);
        expect(m.decompose()).toHaveLength(1);
        expect(m.boundingBox().min[2]).toBeCloseTo(-6.4, 1);         // ballast and buddy, 3.2 each
        for (const t of bought) expect(t.intersect(m).volume()).toBeLessThan(0.01);
      }
      // (a flat underside: BrickTracks' curves on BrickTracks' own ballast and buddy; LEGO's R40 still on printed ballast)
      const bf = buildDesign(w, { ...d('buddy'), options: { ballast: 'buddy', bottomStyle: 'float' } as Design['options'] });
      expect(count(bf, 'BrickTracks R104 ballast')).toBe(4);
      expect(count(bf, 'BrickTracks R104 buddy')).toBe(4);
      expect(bf.pieces.filter((p) => /-ballast$/.test(p.name))).toHaveLength(4);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
});
