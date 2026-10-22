// Track only with sleepers (straight.scad's), and the LEGO fit settings.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { CROSSING_DEFAULTS, crossingPiece, sleeperSpots } from '../src/geom/crossing';
import { buildDesign } from '../src/app/build';
import { type Design, TEMPLATES, toRoutes } from '../src/app/design';
import { subRoute } from '../src/switch/pieces';
import { reversedRoute } from '../src/switch/reverse';

const straight = (studs: number): Design => ({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }] }] });
const SLEEPERS = { ...CROSSING_DEFAULTS, sleepers: 'sleepers' as const, sleeperGapStuds: 2 };

describe('sleepers', { timeout: 120000 }, () => {
  it('fall where straight.scad puts them', () => {
    // (a 16-stud straight: LEGO's 4 sleepers, 4 studs apart, their posts on the grid)
    expect(sleeperSpots(128, false, false, 2, 2)).toEqual([32, 64, 96].map((v) => v));
    expect(sleeperSpots(256, false, false, 2, 2)).toEqual([4, 8, 12, 16, 20, 24, 28].map((j) => j * 8));
    // (1-stud ties, 1 stud apart; and half a gap from an end that runs on into another route)
    expect(sleeperSpots(128, false, false, 1, 1)).toEqual([2.5, 4.5, 6.5, 8.5, 10.5, 12.5].map((j) => j * 8));
    expect(sleeperSpots(128, true, true, 2, 2)[0]).toBe(16);
  });
  it('a stretch of a route, or the route turned round, keeps the whole route\'s sleepers', () => {
    const [rt] = toRoutes(straight(32)), full = { ...rt, sleeperFrame: { s0: 0, L: 256, in0: false, in1: true } };
    const sub = subRoute(full, 40, 200), back = reversedRoute(sub);
    expect(sub.sleeperFrame).toEqual({ s0: 40, L: 256, in0: false, in1: true });
    expect(back.sleeperFrame).toEqual({ s0: 56, L: 256, in0: true, in1: false });
  });
  it('a plain straight: sleepers with gaps between them, one body', async () => {
    const s = new Scad(await kernel()), rts = toRoutes(straight(32));
    const bed = crossingPiece(s, rts, CROSSING_DEFAULTS), sl = crossingPiece(s, rts, SLEEPERS);
    // (sliced through the sleepers, outside the rails: the bed one strip, the sleepers 7 apart)
    const strip = s.w.CrossSection.square([6, 400]).translate([25, -50]);
    const at = (m: typeof bed) => m.slice(1.5).intersect(strip).decompose().filter((p) => p.area() > 10);
    expect(at(bed)).toHaveLength(1);
    // (the 7 sleepers and the two end connectors)
    expect(at(sl)).toHaveLength(9);
    expect(sl.volume()).toBeLessThan(bed.volume() * 0.85);
    expect(sl.decompose().filter((p) => p.volume() > 200)).toHaveLength(1);
  });
  it('a curve has them too, and a crossing keeps its bed where the tracks meet', async () => {
    const s = new Scad(await kernel());
    const curve = toRoutes({ version: 1, gaugeStuds: 4, routes: [{ name: 'C', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 90 }] }] });
    const c = crossingPiece(s, curve, SLEEPERS);
    expect(c.decompose().filter((p) => p.volume() > 200)).toHaveLength(1);
    expect(c.volume()).toBeLessThan(crossingPiece(s, curve, CROSSING_DEFAULTS).volume() * 0.85);
    const x = toRoutes({ version: 1, gaugeStuds: 4, routes: [
      { name: 'A', x: 0, y: -24, heading: 0, segs: [{ kind: 'straight', studs: 48 }] },
      { name: 'B', x: 24, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 48 }] },
    ] });
    const piece = crossingPiece(s, x, SLEEPERS), mid = piece.slice(2.6);
    // (solid across the middle, where the beds meet: a square the sleepers' length each way all floor)
    const sq = s.w.CrossSection.square([30, 30], true);
    expect(sq.subtract(mid).area()).toBeLessThan(1);
    // (and gaps further out along each track)
    expect(s.w.CrossSection.square([40, 150], true).translate([0, -110]).intersect(mid).area()).toBeLessThan(40 * 150 * 0.8);
  });
  it('a plain track built in lengths: each length its own sleepers, none twice', async () => {
    const w = await kernel(), d = { ...straight(16), options: { sleepers: 'sleepers' as const, printBedX: 128, printBedY: 128, cutRails: 'flat' as const, joint: 'axle' as const } };
    const cut = buildDesign(w, d), whole = buildDesign(w, { ...d, options: { ...d.options, printBedX: 500, printBedY: 500 } });
    expect(cut.pieces).toHaveLength(2);
    // (the same plastic as the whole: the sleeper at the join not in both)
    // (the two end connectors at the join in place of track: a little more; a sleeper twice was 14% more)
    expect(Math.abs(cut.info.volume / whole.info.volume - 1)).toBeLessThan(0.02);
  });
  it('builds and cuts for a small bed', async () => {
    const b = buildDesign(await kernel(), { ...straight(64), options: { sleepers: 'sleepers', printBedX: 200, printBedY: 200 } });
    expect(b.info.warnings).toEqual([]);
    expect(b.pieces.length).toBeGreaterThan(2);
  });
});

describe('underside lined up with the track', { timeout: 120000 }, () => {
  it('an angled curve: sockets in rows along it (none on the baseplate grid), one body; the default as before', async () => {
    const w = await kernel(), d: Design = { version: 1, gaugeStuds: 4, options: { printBedX: 500, printBedY: 500 }, routes: [{ name: 'C', x: 0, y: 0, heading: 17, segs: [{ kind: 'straight', studs: 12 }, { kind: 'curve', radius: 40, angle: 45 }] }] };
    const grid = buildDesign(w, d), along = buildDesign(w, { ...d, options: { ...d.options, undersideGrid: 'track' } }), dflt = buildDesign(w, { ...d, options: { ...d.options, undersideGrid: 'baseplate' } });
    expect(along.info.warnings).toEqual([]);
    expect(along.pieces).toHaveLength(1);
    expect(dflt.info.volume).toBeCloseTo(grid.info.volume, 3);
    expect(Math.abs(along.info.volume - grid.info.volume)).toBeGreaterThan(50);
    // (with ballast it's the baseplate's grid regardless)
    const b1 = buildDesign(w, { ...d, options: { ...d.options, ballast: 'ballast' } }), b2 = buildDesign(w, { ...d, options: { ...d.options, ballast: 'ballast', undersideGrid: 'track' } });
    expect(b2.info.volume).toBeCloseTo(b1.info.volume, 3);
  });
});

describe('long track cut into track pieces', { timeout: 120000 }, () => {
  it('16-stud pieces cut square across each track, each with its connectors, none longer', async () => {
    const d: Design = { version: 1, gaugeStuds: 4, options: { splitTrack: 'lengths', pieceLengthStuds: 16 }, routes: [
      { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 56 }] }, { name: 'B', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }] };
    const b = buildDesign(await kernel(), d);
    expect(b.info.warnings).toEqual([]);
    // (56 studs: 16 + 16 + 16 + 8; 40: 16 + 16 + 8)
    expect(b.pieces).toHaveLength(7);
    for (const p of b.pieces) { let lo = 1e9, hi = -1e9; for (let i = 1; i < p.positions.length; i += 3) { lo = Math.min(lo, p.positions[i]); hi = Math.max(hi, p.positions[i]); } expect(hi - lo).toBeLessThan(16 * 8 + 12); }
  });
});

describe('rail tongues at cuts', { timeout: 120000 }, () => {
  it('only on rails crossing a cut square (plate-style): a 22.5° crossing cut for the bed, the slanted rails cut flat', async () => {
    const w = await kernel(), d = TEMPLATES['22.5° crossing'];
    const all = buildDesign(w, { ...d, options: { printBedX: 150, printBedY: 150 } }), square = buildDesign(w, { ...d, options: { printBedX: 150, printBedY: 150, tongueRails: 'square' } });
    expect(square.info.warnings).toEqual([]);
    expect(square.pieces.map((p) => p.name)).toEqual(all.pieces.map((p) => p.name));
    // (fewer tongue joints cut out of the rails: a little more plastic)
    expect(square.info.volume).toBeGreaterThan(all.info.volume + 20);
  });
});

describe('LEGO fit', { timeout: 120000 }, () => {
  it('a bigger stud fit makes the studs bigger; the default is as before', async () => {
    const w = await kernel(), d = straight(16);
    const v0 = buildDesign(w, d).info.volume, vDef = buildDesign(w, { ...d, options: { studFit: 0.18, antistudFit: 0.06 } }).info.volume;
    expect(vDef).toBeCloseTo(v0, 3);
    expect(buildDesign(w, { ...d, options: { studFit: 0.3 } }).info.volume).toBeGreaterThan(v0 + 1);
    // (a looser anti-stud fit: thinner tubes, less plastic)
    expect(buildDesign(w, { ...d, options: { antistudFit: 0.2 } }).info.volume).toBeLessThan(v0);
  });
});
