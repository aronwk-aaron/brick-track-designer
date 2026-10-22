// The OpenSCAD library's extras in the app: buffer stops (buffer.scad), axle
// holes and the peg and clip on ballast (straight.scad), the track and
// ballast printed apart (generate_track / generate_ballast), labels (name,
// label_*), and the switches' throw_ballast and blade_disc_d.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, sizeOf, switchSize } from '../src/app/build';
import { type Design, type DRoute, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';

const BED = { printBedX: 600, printBedY: 600 };
const straight = (studs: number, more: Partial<DRoute> = {}, options: Partial<PieceOptions> = {}): Design =>
  ({ version: 1, gaugeStuds: 4, options: { ...BED, ...options }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }], ...more }] });
/** A part's height (its STL's top, lying on the bed). */
const top = (stl: Uint8Array) => {
  const d = new DataView(stl.buffer, stl.byteOffset), n = d.getUint32(80, true);
  let z1 = -Infinity;
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) z1 = Math.max(z1, d.getFloat32(84 + t * 50 + 20 + k * 12, true));
  return z1;
};
const vol = (b: ReturnType<typeof buildDesign>) => b.info.volume;

describe('the OpenSCAD extras', { timeout: 120000 }, () => {
  it('a route end in a buffer stop: no connector, posts 8 plates over the ballast top with studs, either end', async () => {
    const w = await kernel();
    const plain = buildDesign(w, straight(8)), end = buildDesign(w, straight(8, { endEnd: 'buffer' })), start = buildDesign(w, straight(8, { startEnd: 'buffer' }));
    for (const b of [end, start]) {
      expect(b.info.warnings).toEqual([]);
      expect(b.pieces.map((p) => p.name)).toEqual(['track']);
      // (post_z1 = 3.2 + 8 x 3.2, and a stud on it)
      expect(top(b.pieces[0].stl)).toBeCloseTo(3.2 + 8 * 3.2 + 1.8, 1);
      expect(vol(b)).toBeGreaterThan(vol(plain) + 4000);
    }
    // (the same buffer turned round)
    expect(vol(start)).toBeCloseTo(vol(end), -1);
    // (lower posts, no pin holes)
    const low = buildDesign(w, straight(8, { endEnd: 'buffer' }, { bufferPostPlates: 5, bufferBeamTop: 8, bufferPinHoles: false }));
    expect(top(low.pieces[0].stl)).toBeCloseTo(3.2 + 5 * 3.2 + 1.8, 1);
  });
  it('axle holes through the ends (with the buddy), and the peg and clip kept on ballast', async () => {
    const w = await kernel();
    const base = buildDesign(w, straight(16, {}, { ballast: 'buddy' }));
    const holes = buildDesign(w, straight(16, {}, { ballast: 'buddy', axleHoles: true }));
    const peg = buildDesign(w, straight(16, {}, { ballast: 'buddy', pegOnBallast: true }));
    // (two cross holes, 5 x 2 + 2 x 5 - 2 x 2 = 16 mm2 across, at each end: some of their 10 mm in the piece)
    expect(vol(base) - vol(holes)).toBeGreaterThan(4 * 16 * 3);
    expect(vol(base) - vol(holes)).toBeLessThan(4 * 16 * 10);
    // (the peg, the clip and their breakaway supports, at both ends)
    expect(vol(peg)).toBeGreaterThan(vol(base) + 20);
    // (no holes without the buddy, as straight.scad's)
    expect(vol(buildDesign(w, straight(16, {}, { ballast: 'ballast', axleHoles: true })))).toBeCloseTo(vol(buildDesign(w, straight(16, {}, { ballast: 'ballast' }))), 3);
  });
  it('the track and ballast printed apart: the track as without ballast, the ballast with a seat for it', async () => {
    const w = await kernel();
    const apart = buildDesign(w, straight(16, {}, { ballast: 'ballast', trackBallast: 'apart' }));
    const trackOnly = buildDesign(w, straight(16));
    const fused = buildDesign(w, straight(16, {}, { ballast: 'ballast' }));
    expect(apart.pieces.map((p) => p.name)).toEqual(['track-track', 'track-ballast']);
    expect(apart.pieces[0].stl.length).toBe(trackOnly.pieces[0].stl.length);
    // (the ballast alone: under 0 and the step's studs, a little less than the fused piece less the track)
    const ballast = apart.info.volume - trackOnly.info.volume;
    expect(ballast).toBeGreaterThan(0.3 * (fused.info.volume - trackOnly.info.volume));
    expect(ballast).toBeLessThan(fused.info.volume - trackOnly.info.volume + 1);
    expect(top(apart.pieces[1].stl)).toBeLessThan(top(fused.pieces[0].stl));
    // (with sleepers: the ballast's top layer stays between them, each sleeper in a pocket)
    const slept = buildDesign(w, straight(16, {}, { ballast: 'ballast', trackBallast: 'apart', sleepers: 'sleepers' }));
    const sleptTrack = buildDesign(w, straight(16, {}, { sleepers: 'sleepers' }));
    expect(slept.info.volume - sleptTrack.info.volume).toBeGreaterThan(ballast + 1000);
  });
  it('labels under a flat underside: none by default, engraved with text', async () => {
    const w = await kernel();
    const flat = buildDesign(w, straight(16, {}, { ballast: 'buddy', bottomStyle: 'float' }));
    const labelled = buildDesign(w, straight(16, {}, { ballast: 'buddy', bottomStyle: 'float', labelText: 'ARON-TRACKS', labelGauge: true }));
    expect(vol(labelled)).toBeLessThan(vol(flat) - 20);
    // (anti-stud undersides get none)
    const anti = buildDesign(w, straight(16, {}, { ballast: 'buddy' })), antiL = buildDesign(w, straight(16, {}, { ballast: 'buddy', labelText: 'ARON-TRACKS' }));
    expect(vol(antiL)).toBeCloseTo(vol(anti), 3);
    // (a curve: along it)
    const curve = (o: Partial<PieceOptions>) => buildDesign(w, { version: 1, gaugeStuds: 4, options: { ...BED, ballast: 'buddy', bottomStyle: 'float', ...o }, routes: [{ name: 'C', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }] });
    expect(vol(curve({ labelText: 'ARON-TRACKS' }))).toBeLessThan(vol(curve({})) - 20);
  });
  it('the labels\' size line', () => {
    const d = (segs: DRoute['segs']) => toRoutes({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs }] });
    expect(sizeOf(d([{ kind: 'straight', studs: 16 }]))).toBe('S16');
    expect(sizeOf(d([{ kind: 'curve', radius: 40, angle: -22.5 }]))).toBe('R40 22.5°');
    expect(sizeOf(toRoutes(TEMPLATES['90° crossing']))).toBe('X 90°');
    expect(switchSize(toRoutes(TEMPLATES['Left switch (LEGO)']))).toBe('LEFT R40 22.5°');
    expect(switchSize(toRoutes(TEMPLATES['Wye switch']))).toBe('WYE R40 22.5°');
  });
  it('a switch: the ballast round the lever (throw_ballast), and the tines\' pivot disc (blade_disc_d)', async () => {
    const w = await kernel();
    const sw = (o: Partial<PieceOptions>) => buildDesign(w, { ...TEMPLATES['Left switch (LEGO)'], options: { ...BED, ...o } });
    const base = (b: ReturnType<typeof buildDesign>) => b.pieces.filter((p) => /base/.test(p.name));
    const plain = sw({ ballast: 'buddy' }), steps = sw({ ballast: 'buddy', throwBallast: true });
    expect(steps.info.warnings).toEqual([]);
    expect(base(steps)[0].stl.length).not.toBe(base(plain)[0].stl.length);
    expect(vol(steps)).toBeGreaterThan(vol(plain) + 1000);
    // (track only: no ballast to carry round)
    expect(vol(sw({ throwBallast: true }))).toBeCloseTo(vol(sw({})), 3);
    const disc = (d: number) => sw({ mechStyle: 'tines', bladeDiscD: d }).pieces.filter((p) => /points/.test(p.name)).reduce((t, p) => t + p.stl.length, 0);
    expect(disc(18)).not.toBe(disc(14));
  });
});
