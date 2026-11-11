// A piece too short for a row of studs at each end has one whole row, in its middle: the two ends' rows, closer than a
// stud's pitch, ran into each other (a 1.6-stud straight's were 4.8 mm apart, fused in pairs). Underneath it's a 1 x N
// plate's: one channel under the row, a pin between each two studs. A 2-stud straight, its rows a pitch apart, keeps both.
// And where two ends' rows cross (a switch cut short, its ends side by side at an angle), no stud stands in another.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache, type Piece } from '../src/app/build';
import { Scad } from '../src/geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../src/geom/crossing';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';
import { studFaults, studsOf } from './studs-apart.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const FITS = { studD: 4.8, studFit: APP.studFit, antistudFit: APP.antistudFit };
const printed = (name: string, more: Partial<PieceOptions> = {}): Design => ({ ...structuredClone(TEMPLATES[name]), options: { ...TEMPLATES[name].options, legoTrack: 'print', ...more } });
async function built(d: Design) {
  const saved = { ...OPTION_DEFAULTS };
  Object.assign(OPTION_DEFAULTS, APP);
  try {
    const w = await kernel();
    clearBuildCache();
    const b = buildDesign(w, d), track = b.pieces.filter((p) => !p.lego && /track/.test(p.name));
    return { w, b, track, studs: track.map((p) => studsOf(w, p, FITS)) };
  } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.02;

describe('short pieces: one row of studs', { timeout: 600000 }, () => {
  for (const [name, studs] of [['Straight, 1.33 studs', 1.333333], ['Straight, 1.37 studs', 1.372583], ['Straight, 1.6 studs', 1.6], ['Straight, 1.81 studs', 1.810015], ['Straight, 1.6 studs (BrickTracks S01)', 1.6]] as const)
    for (const grid of ['baseplate', 'track'] as const) it(`${name}, underside on the ${grid}'s grid: one row of six in its middle, a channel and its pins under it`, async () => {
      const r = await built(printed(name, { undersideGrid: grid }));
      expect(r.b.info.warnings).toEqual([]);
      expect(r.track.length).toBe(1);
      const s = r.studs[0], all = s.studs.flat(), mid = (studs * 8) / 2;
      // (the track runs along y from 0: the row across it at half its length, where a straight's studs are across)
      expect(all.map((q) => Math.round(q[0])).sort((a, b) => a - b)).toEqual([-28, -12, -4, 4, 12, 28]);
      for (const q of all) expect(near(q[1], mid), `a stud at y = ${q[1].toFixed(2)}, the middle at ${mid.toFixed(2)}`).toBe(true);
      // (underneath: a pin between each two studs of the row and its ends' walls, on the row's line; no tubes)
      expect(s.tubes).toEqual([]);
      expect(s.pins.map((q) => Math.round(q[0]) + 0).sort((a, b) => a - b)).toEqual([-24, -16, -8, 0, 8, 16, 24]);
      for (const q of s.pins) expect(near(q[1], mid), `a pin at y = ${q[1].toFixed(2)}`).toBe(true);
      expect(studFaults(r.w, r.b.pieces, () => FITS)).toEqual([]);
    });

  it('a 2-stud straight keeps a row at each end, a pitch apart', async () => {
    const r = await built(printed('Straight, 2 studs'));
    const all = r.studs[0].studs.flat();
    expect(all.length).toBe(12);
    expect(all.map((q) => Math.round(q[1])).sort((a, b) => a - b)).toEqual([4, 4, 4, 4, 4, 4, 12, 12, 12, 12, 12, 12]);
    expect(r.studs[0].pins.length).toBe(14);
  });

  it('a short piece among other track: its row in its middle, its channel and pins on the design\'s grid', async () => {
    // (the 1.6-stud straight 4 studs along from the grid's corner: its own row, 38.4 mm along, is off the baseplate's
    // studs; the row of them wholly under it is at 36, where its start's own row would be)
    const w = await kernel(), sc = new Scad(w), [rt] = toRoutes({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 4, heading: 0, segs: [{ kind: 'straight', studs: 1.6 }] }] });
    const m = crossingPiece(sc, [rt], { ...CROSSING_DEFAULTS, supports: false }, undefined, undefined, { gridPose: [0, 0, 0] });
    const mesh = m.getMesh(), positions = new Float32Array(mesh.triVerts.length * 3);
    mesh.triVerts.forEach((v: number, k: number) => { for (let c = 0; c < 3; c++) positions[3 * k + c] = mesh.vertProperties[v * mesh.numProp + c]; });
    const short = studsOf(w, { positions } as Piece, { studD: 4.8, studFit: CROSSING_DEFAULTS.studFit, antistudFit: CROSSING_DEFAULTS.antistudFit });
    expect(short.studs.flat().length).toBe(6);
    for (const q of short.studs.flat()) expect(near(q[1], 32 + 6.4), `a stud at y = ${q[1].toFixed(2)}`).toBe(true);
    expect(short.pins.length).toBe(7);
    for (const q of short.pins) expect(near(q[1], 36), `a pin at y = ${q[1].toFixed(2)}`).toBe(true);
    // (and on the track's own grid: under its own row)
    const own = crossingPiece(sc, [rt], { ...CROSSING_DEFAULTS, supports: false, undersideGrid: 'track' }, undefined, undefined, { gridPose: [0, 0, 0] });
    expect(own.volume()).toBeGreaterThan(m.volume() - 200);
  });

  it('a switch cut short (test print 4\'s coupons): no stud of one end stands in the other\'s', async () => {
    const r = await built(structuredClone(TEMPLATES['Test print 4: points three ways']));
    expect(studFaults(r.w, r.b.pieces, (p) => ({ ...FITS, ...TEMPLATES['Test print 4: points three ways'].kit?.find((k) => k.name === p.kit)?.options }))).toEqual([]);
  });
});
