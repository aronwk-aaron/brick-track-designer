// Aaron's 196s R568 crossover (his saved design, trimmed to its south end: test/fixtures/196s-r568-south.btd.json;
// two straights 16 studs apart, R568 branches leaving each, on ballast with the buddy, 'edges' grip, anti-stud
// bottoms, a 64 baseplate, a 128 x 128 print bed, his levers' sides and offsets): "there aren't studs on the top of the
// outside of the rails where the switches are". The bed's studs stopped along the points: crossingPiece kept every stud
// out of the box round what the points add (their bed, out to the sleepers' ends, and the arm), so the row outside
// each stock rail broke off from the toe to the heel. Now it runs on, off only round the throw's arm (network.ts
// studsOffOf), along the curve too; none overlap or touch, none is cut.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { circlesIn, partStuds, studFaults, studsOf } from './studs-apart.shared';
import { drop, solid } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const D: Design = JSON.parse(fs.readFileSync(new URL('./fixtures/196s-r568-south.btd.json', import.meta.url), 'utf8'));
type Pt = [number, number];

describe('studs outside the rails along the points (196s R568)', { timeout: 600000 }, () => {
  it('the rows outside the stock rails run on along both points, clear of the throw\'s arm', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(D));
      const o = { studD: 4.8, studFit: 0.18 };
      // (the routes' middles: the straights at x = -64 and +64 mm, the branches round R568 = 4544.5 mm from y = 8)
      const R = 568.0625 * 8, arcs = [-64 + R, 64 - R];
      const lat = (q: Pt) => Math.min(Math.abs(Math.abs(q[0]) - 64), ...arcs.map((cx) => Math.abs(Math.hypot(q[0] - cx, q[1] - 8) - R)));
      // (the studs on the top, inside the sleepers' ends (32 out); no stud cut where the print bed's cuts part the track,
      // on the top or on the ballast's steps: each a stud's radius inside its part's box. One on the mid step beside a
      // branch, at 25.6, 153.6, ran into the points' bed and was cut at 152: a step's stud that runs into the track over
      // the step isn't made (crossing.ts))
      const cut: string[] = [];
      const top: Pt[] = b.pieces.filter((p) => /^track/.test(p.name)).flatMap((p) => {
        const P = p.positions, r = (o.studD + o.studFit) / 2 - 0.05, all = studsOf(w, p, o).studs.flat();
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
        for (const q of all) if (q[0] - r < x0 || q[0] + r > x1 || q[1] - r < y0 || q[1] + r > y1) cut.push(`${p.name}: ${q.map((v) => v.toFixed(1)).join(', ')}`);
        return all.filter((q) => lat(q) < 32);
      });
      expect(cut, 'studs cut by a part\'s edge').toEqual([]);
      expect(b.pieces.filter((p) => /^track/.test(p.name)).flatMap((p) => partStuds(w, p, o)), 'studs in part, on any level').toEqual([]);
      const near = (x: number, y: number) => top.some((q) => Math.abs(q[0] - x) < 0.3 && Math.abs(q[1] - y) < 0.3);
      // (the straights at x = -64 and +64 mm, their sleepers 64 wide: a row 28 out, past the stock rail; the points from
      // y 16 to 250, their throw's arm across y 16 to 40)
      const missing: string[] = [];
      for (const x of [-92, 92]) for (let y = 44; y <= 244; y += 8) if (!near(x, y)) missing.push(`${x}, ${y}`);
      expect(missing, 'outside the straights\' stock rails').toEqual([]);
      for (const x of [-92, 92]) for (const y of [20, 28, 36]) expect(near(x, y), `none on the arm at ${x}, ${y}`).toBe(false);
      // (and outside each branch's stock rail, on the side between the tracks: a row along the curve, 28 in from its middle)
      for (const cx of arcs) {
        const row = top.filter((q) => q[1] > 40 && q[1] < 250 && Math.abs(Math.abs(Math.hypot(q[0] - cx, q[1] - 8) - R) - 28) < 0.6);
        expect(row.length, `outside the branch's stock rail (round ${cx.toFixed(1)})`).toBeGreaterThanOrEqual(25);
      }
      expect(studFaults(w, b.pieces, () => o), 'studs that touch').toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });

  // (the whole design, built in sections: each route cut into pieces, the next piece of a points' own straight isn't
  // another track running through them (network.ts), and the rows run on along all four points)
  it('the whole design: the rows outside the straights\' stock rails along all four points', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const full: Design = JSON.parse(fs.readFileSync(new URL('./fixtures/196s-r568.btd.json', import.meta.url), 'utf8'));
      const b = buildDesign(w, full);
      const o = { studD: 4.8, studFit: 0.18 };
      const all: Pt[] = b.pieces.filter((p) => /^track/.test(p.name)).flatMap((p) => studsOf(w, p, o).studs.flat());
      expect(studFaults(w, b.pieces, () => o), 'studs that touch').toEqual([]);
      // (the points from 16 to 250 mm in from each end, their arms 16 to 40 in: 20 or more of each row's studs past the arm)
      for (const x of [-92, 92]) for (const [y0, y1] of [[44, 250], [1286, 1492]]) {
        const n = all.filter((q) => Math.abs(q[0] - x) < 0.3 && q[1] > y0 && q[1] < y1).length;
        expect(n, `outside the stock rail at x = ${x}, y ${y0} to ${y1}`).toBeGreaterThanOrEqual(20);
      }
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
  // (bought track on printed ballast, the ballast a part of its own: a LEGO switch's is longer than the bed and cut in
  // two across it, and its seat for the switch is wider than the sleepers. The cut went through a stud of each step,
  // left in two halves (the halves weren't looked at for studs), and the seat took a bite out of a mid-step stud beside
  // the branch, 0.1 of it left. Now no part has part of a stud: the halves are cut as any parts are (studs.ts), and a
  // step's stud the seat would bite isn't made (crossing.ts))
  it('a bought switch\'s ballast: no part of a stud on either half', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel(), o = { studD: 4.8, studFit: 0.18 };
      for (const ballast of ['ballast', 'buddy'] as const) {
        clearBuildCache();
        const d: Design = { version: 1, gaugeStuds: 4, options: { legoTrack: 'lego', ballast }, routes: [
          { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] },
          { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }] }] };
        const b = buildDesign(w, d), bal = b.pieces.filter((p) => /ballast/.test(p.name));
        expect(bal.length, `${ballast}: the ballast in two`).toBe(2);
        expect(bal.flatMap((p) => partStuds(w, p, o)), `${ballast}: studs in part`).toEqual([]);
        expect(studFaults(w, b.pieces, () => o), `${ballast}: studs that touch`).toEqual([]);
      }
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });

  // (points another track runs through, a double slip's: the rows outside the stock rails there too. They're found after
  // every other stud has its place (crossing.ts studsAfter), each standing free of the rails' feet and everything else
  // above the bed, and stood on the parts once the piece is cut (build.ts standStuds): the piece's own studs and its
  // cuts stay where they were, and each new one is a whole stud on one part)
  it('a double slip: the rows outside its straights\' stock rails along the points', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(TEMPLATES['Double slip (22.5°)']));
      const o = { studD: 4.8, studFit: 0.18 };
      const tracks = b.pieces.filter((p) => /^track/.test(p.name));
      const top: Pt[] = tracks.flatMap((p) => studsOf(w, p, o).studs.flat());
      const near = (x: number, y: number) => top.some((q) => Math.abs(q[0] - x) < 0.3 && Math.abs(q[1] - y) < 0.3);
      // (the straight up the middle, its sleepers 64 wide: the rows 28 out, past each stock rail, where there were none)
      const missing: string[] = [];
      for (const [x, y] of [[-28, 68], [-28, 76], [-28, 84], [-28, 100], [28, 84], [28, 92], [28, 100], [28, -68], [28, -76], [28, -84], [28, -92], [28, -100], [-28, -84], [-28, -92], [-28, -100]]) if (!near(x, y)) missing.push(`${x}, ${y}`);
      expect(missing, 'outside the stock rails').toEqual([]);
      expect(tracks.flatMap((p) => partStuds(w, p, o)), 'studs in part').toEqual([]);
      expect(studFaults(w, b.pieces, () => o), 'studs that touch').toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });

  // (a stud along the points that only just ran into something beside it, a check rail or a rail's foot on the other
  // track: a stud in part, a millimetre cubed or so of it in the other. Along the points a stud only stands where it
  // stands free (crossing.ts free). Yard R40, three tracks, left had two on track3, at -3.93, -145.01 (0.1 mm3 of it
  // in the other) and 7.16, -142.80 (1.3 mm3))
  it('Yard R40, three tracks, left: no stud along the points run into what\'s beside it', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(TEMPLATES['Yard R40, three tracks, left']));
      const p = b.pieces.find((q) => q.name === 'track3')!, m = solid(w, p.positions)!;
      // (half way up a stud, over the rails' feet: what stands at each of the two places, within a millimetre of it)
      const sl = m.slice(3.2 + 1.3), at = (x: number, y: number) => { const c = w.CrossSection.circle(1, 24).translate([x, y]), i = sl.intersect(c), a = i.area(); c.delete(); i.delete(); return a; };
      const there = [at(-3.93, -145.01), at(7.16, -142.8)];
      // (and the studs that stand free beside them are still there)
      const n = circlesIn(sl.toPolygons() as Pt[][], (4.8 + 0.18) / 2, 0.03).length;
      sl.delete(); drop(m);
      expect(there, 'the two studs that ran into something').toEqual([0, 0]);
      expect(n, 'studs on the part').toBeGreaterThan(40);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });

  // (a three-way with a lever to each blade, built in a bigger piece as two sets at the one toe: each set's far block,
  // across the track from its lever, had a middle row of studs, and the other set's slider's channel ran through them:
  // an eighth of each left, its two edges, four a side. One blade's set of such a three-way has no middle row there
  // (switch/base.ts throwArm))
  it('Three-way R40: no part of a stud where the other blade\'s slider runs', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(TEMPLATES['Three-way R40'])), o = { studD: 4.8, studFit: 0.18 };
      expect(b.pieces.filter((p) => /^track/.test(p.name)).flatMap((p) => partStuds(w, p, o)), 'studs in part').toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
