import { describe, expect, it } from 'vitest';
import { addCircle, bandHalf, circleRoute, cleanPieces, defaultPieces, pieceFit, piecesText } from '../src/app/circle';
import { routeLength } from '../src/route/route';
import { toRoutes, type Design } from '../src/app/design';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { tightBox } from '../src/geom/bedfit';
import { prints } from './assembled.shared';
import { stlPositions } from './assembly.shared';

describe('a full circle', () => {
  it('uses the usual pieces', () => {
    expect([24, 40, 56, 120, 121, 152].map(defaultPieces)).toEqual([16, 16, 16, 32, 64, 64]);
    expect(piecesText(32)).toBe('32 pieces · 11.25° each');
    expect(piecesText(16)).toBe('16 pieces · 22.5° each');
    expect(piecesText(64)).toBe('64 pieces · 5.625° each');
    expect([2, 4.4, 500, NaN].map(cleanPieces)).toEqual([4, 4, 128, 16]);
  });
  it('is equal curves that add up to 360 degrees, and close on themselves', () => {
    const r = circleRoute('C', 152, 32);
    expect(r.segs.length).toBe(32);
    expect(r.segs.every((s) => s.kind === 'curve' && s.angle === 11.25 && s.radius === 152)).toBe(true);
    const [rt] = toRoutes({ version: 1, gaugeStuds: 4, routes: [r] });
    expect(routeLength(rt)).toBeCloseTo(2 * Math.PI * 152 * 8, 4);
  });
  it('is put clear of the routes there are', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }] };
    const i = addCircle(d, 'B', 40, 16);
    expect(i).toBe(1);
    const c = d.routes[1];
    expect(c.y).toBeLessThan(-40);
  });
  it('leaves Piece length alone for bought curves', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [], options: { splitTrack: 'lengths' } };
    addCircle(d, 'A', 104, 32);
    expect(d.options?.pieceLengthStuds).toBeUndefined();
  });
  it('raises Piece length when one piece is longer, never lowers it', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [], options: { splitTrack: 'lengths' } };
    addCircle(d, 'A', 152, 32);
    expect(d.options?.pieceLengthStuds).toBe(30);
    const e: Design = { version: 1, gaugeStuds: 4, routes: [], options: { splitTrack: 'lengths' } };
    addCircle(e, 'A', 40, 16);
    expect(e.options?.pieceLengthStuds).toBeUndefined();
    const f: Design = { version: 1, gaugeStuds: 4, routes: [], options: { splitTrack: 'lengths', pieceLengthStuds: 40 } };
    addCircle(f, 'A', 152, 32);
    expect(f.options?.pieceLengthStuds).toBe(40);
  });
});

describe('what a piece means for the bed', () => {
  it('works out the base half-width as the build does', () => {
    expect(bandHalf(4, 'none')).toBe(32);
    expect(bandHalf(4, 'ballast')).toBe(40);
    expect(bandHalf(4, 'buddy')).toBe(48);
  });
  it('sizes R152 pieces as they are built', () => {
    const a = pieceFit(152, 64, { ballast: 'buddy' }), b = pieceFit(152, 32, { ballast: 'buddy' });
    // (a built piece's tightest box: 136.46 x 97.39 and 258.58 x 101.62)
    expect(a.length).toBeCloseTo(136.5, 0); expect(a.width).toBeCloseTo(97.4, 0);
    expect(b.length).toBeCloseTo(258.6, 0); expect(b.width).toBeCloseTo(101.6, 0);
    expect(a.fit).toBe('fits');
    // (longer than a 256 mm bed, but it goes on corner to corner, and the build leaves it whole)
    expect(b.fit).toBe('diagonal');
    expect(b.text).toMatch(/turned diagonally/);
    expect(pieceFit(152, 32, { ballast: 'none' }).fit).toBe('diagonal');
    expect(pieceFit(152, 64, { ballast: 'none' }).fit).toBe('fits');
    // (other beds: 250 x 210 no way, 330 x 320 along it)
    expect(pieceFit(152, 32, { ballast: 'buddy', printBedX: 250, printBedY: 210 }).fit).toBe('no');
    expect(pieceFit(152, 32, { ballast: 'buddy', printBedX: 330, printBedY: 320 }).fit).toBe('fits');
  });
  it('says fits, diagonal or no', () => {
    expect(pieceFit(40, 16, { ballast: 'none' }).fit).toBe('fits');
    expect(pieceFit(152, 16, {}).fit).toBe('no');
    expect(pieceFit(152, 16, { printBedX: 256, printBedY: 256 }).text).toMatch(/doesn't fit/);
    expect(pieceFit(40, 16, {}).text).toMatch(/fits the 256 × 256 mm bed/);
    // a long thin piece fits a long thin bed only slanted
    const l = pieceFit(104, 32, { ballast: 'none' });
    expect(pieceFit(104, 32, { ballast: 'none', printBedX: l.length - 3, printBedY: l.length - 3 }).fit).toMatch(/diagonal|no|fits/);
  });
});

// (found with an R152 circle of 32 pieces on a 256 x 256 bed: 54 parts, the pieces lying at an angle on the plan cut in
// two for their boxes there, though each is the piece that fits, turned)
describe('a circle\'s pieces on the bed, as built', { timeout: 600000 }, () => {
  /** A quarter of an R152 circle of 32 pieces (8 of them, lying from square to the plan round to square again), on ballast with a buddy strip. */
  const quarter = (printBedX: number, printBedY: number): Design => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [], options: { splitTrack: 'lengths', legoTrack: 'lego', ballast: 'buddy', sleepers: 'sleepers', printBedX, printBedY } };
    addCircle(d, 'C', 152, 32);
    d.routes[0].segs = d.routes[0].segs.slice(0, 8);
    return d;
  };
  it('are whole on a 256 x 256 bed, the ones lying at an angle turned in their files', async () => {
    const w = await kernel();
    clearBuildCache();
    try {
      const b = buildDesign(w, quarter(256, 256));
      expect(b.info.warnings).toEqual([]);
      expect(b.pieces.map((p) => p.name)).toEqual(Array.from({ length: 8 }, (_, k) => `track${k + 1}`));
      // (each the same piece: 258.6 x 101.6 at its tightest, as the Full circle panel says)
      const said = pieceFit(152, 32, { ballast: 'buddy' });
      expect(said.fit).toBe('diagonal');
      for (const p of b.pieces) {
        const t = tightBox(stlPositions(p.stl), 3).size;
        expect(t[0], p.name).toBeCloseTo(said.length, 0); expect(t[1], p.name).toBeCloseTo(said.width, 0);
        // (its file within the bed as it lies)
        expect(prints(w, p, 256, 256), p.name).toEqual([]);
      }
      // (some lie along the plan and fit as they are; the rest are turned, and said to be)
      expect(b.info.turned).toBe(b.pieces.filter((p) => p.bedTurn).length);
      expect(b.info.turned).toBeGreaterThan(0); expect(b.info.turned).toBeLessThan(8);
    } finally { clearBuildCache(); }
  });
  it('are cut in two equal pieces each, at ordinary track ends, on a 250 x 210 bed', async () => {
    const w = await kernel();
    clearBuildCache();
    try {
      const b = buildDesign(w, quarter(250, 210));
      expect(b.info.warnings).toEqual([]);
      expect(b.pieces.length).toBe(16);
      const said = pieceFit(152, 64, { ballast: 'buddy' });
      for (const p of b.pieces) {
        const t = tightBox(stlPositions(p.stl), 3).size;
        expect(t[0], p.name).toBeCloseTo(said.length, 0); expect(t[1], p.name).toBeCloseTo(said.width, 0);
        expect(prints(w, p, 250, 210), p.name).toEqual([]);
      }
    } finally { clearBuildCache(); }
  });
});
