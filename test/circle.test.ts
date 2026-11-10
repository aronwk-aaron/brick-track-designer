import { describe, expect, it } from 'vitest';
import { addCircle, bandHalf, circleRoute, cleanPieces, defaultPieces, pieceFit, piecesText } from '../src/app/circle';
import { routeLength } from '../src/route/route';
import { toRoutes, type Design } from '../src/app/design';

describe('a full circle', () => {
  it('uses the usual pieces', () => {
    expect([24, 40, 56, 120, 121, 152].map(defaultPieces)).toEqual([16, 16, 32, 32, 64, 64]);
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
  it('sizes R152 pieces', () => {
    const a = pieceFit(152, 64, { ballast: 'buddy' }), b = pieceFit(152, 32, { ballast: 'buddy' });
    expect(a.length).toBeCloseTo(133, 0); expect(a.width).toBeGreaterThan(95); expect(a.width).toBeLessThan(105);
    expect(b.length).toBeGreaterThan(250); expect(b.length).toBeLessThan(262);
    expect(a.fit).toBe('fits');
    expect(b.fit).toBe('no');
    // (253 long on a 256 mm bed, but not square to it: the build cuts some of them in two, as a build showed)
    expect(pieceFit(152, 32, { ballast: 'none' }).fit).toBe('diagonal');
    expect(pieceFit(152, 64, { ballast: 'none' }).fit).toBe('fits');
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
