// The TrixBrix slips' templates have their ends, points, throws and levers where the parts have them. The ends are the
// parts library's connection points (studs from the part's middle; here y up, an end's direction as the track leaves
// it, degrees anticlockwise from +x); the levers are its switch-motor points; the points' toes and heels are read off
// the maker's photographs (to about a third of a stud). Each set of points faces one end of the part:
//   R40 double slip (45 degrees): four sets, one at each end; the tongue from 2 studs in to 8.4; its lever 3.5 studs
//     in from the end, 7 from the track's centre line, on the slip road's side (outside: away from the other track).
//   R40 single slip: the same, at the slip road's two ends.
//   R104 double slip (22.5 degrees, left and right): four sets, each one tongue by the slip road's own stock rail
//     (the other rail of the slip road is fixed), its toe 11 studs from the crossing (8.9 studs in from the straight
//     track's ends, 10.5 from the diagonal's, whose arms are 1.5 studs longer) and its heel 5 from the crossing; its
//     lever outside, 10 studs from the crossing (10 in from the straight track's ends, 11.5 from the diagonal's) and
//     7 from its track's centre line.
// Where the app differs, and why: a throw's slider lies between the baseplate's studs where its track is square to the
// stud grid, so on the R40 slips' straight track it is 3 studs in from the end, not 3.5.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';
import { routeLength, routePose } from '../src/route/route';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const rad = (d: number) => (d * Math.PI) / 180;
const T = 40 * Math.tan(rad(22.5)), D = T * Math.SQRT1_2;

/** A set of points: the end of the part it faces (index into ends), which side its lever is on looking in from that end
 * (1 left, -1 right), how many blades move, and, in studs from that end along the track: its toe, its heel (the blades'
 * pivot) and its lever; and the lever's distance out from the track's centre line. */
interface PointsRef { end: number; side: 1 | -1; blades: 1 | 2; toe: number; heel: number; lever: number; out: number; /** how near the part's the lever is along the track, studs */ within: number }
interface SlipRef { ends: [number, number, number][]; sets: PointsRef[] }

// (square: on the track that's square to the stud grid, where the slider lies between the baseplate's studs, on a whole-stud line from the first track's start: within half a stud of the part's)
const r40 = (end: number, side: 1 | -1, square: boolean): PointsRef => ({ end, side, blades: 2, toe: 2, heel: 8, lever: 3.5, out: 7, within: square ? 0.5 : 0.05 });
const r104 = (end: number, side: 1 | -1, diagonal: boolean): PointsRef => ({ end, side, blades: 1, toe: diagonal ? 10.5 : 8.9, heel: diagonal ? 16.1 : 14.6, lever: diagonal ? 11.5 : 10, out: 7, within: 0.05 });
const REF: Record<string, SlipRef> = {
  // (the library's part turned over, left for right: the same part, as it's its own mirror image)
  'Double slip R40 45°': { ends: [[0, -T, -90], [0, T, 90], [D, -D, -45], [-D, D, 135]],
    sets: [r40(0, 1, true), r40(1, 1, true), r40(2, -1, false), r40(3, -1, false)] },
  'Single slip R40 45°': { ends: [[-1.125, 16, 90], [-1.125, -16, -90], [10.590729, 12.284271, 45], [-12.036688, -10.343146, -135]],
    sets: [r40(1, -1, true), r40(2, 1, false)] },
  // (the library's parts turned a quarter turn: the straight track running up)
  'Double slip R104 left': { ends: [[0, -20, -90], [0, 20, 90], [8, -20, -67.5], [-8, 20, 112.5]],
    sets: [r104(0, 1, false), r104(1, 1, false), r104(2, -1, true), r104(3, -1, true)] },
  'Double slip R104 right': { ends: [[0, -20, -90], [0, 20, 90], [-8, -20, -112.5], [8, 20, 67.5]],
    sets: [r104(0, -1, false), r104(1, -1, false), r104(2, 1, true), r104(3, 1, true)] },
};

/** The R104 double slip with its points' hand edits changed (each set's). */
const edited = (change: (e: NonNullable<NonNullable<Design['trackwork']>['points']>[string]) => void): Design => {
  const d = structuredClone(TEMPLATES['Double slip R104 left']);
  for (const e of Object.values(d.trackwork!.points!)) change(e);
  return d;
};
const built = async (d: Design) => {
  const saved = { ...OPTION_DEFAULTS };
  Object.assign(OPTION_DEFAULTS, APP);
  try { clearBuildCache(); return buildDesign(await kernel(), d); } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
};

describe('points set by hand: which blade moves (a single point), and blades lengthened', { timeout: 600000 }, () => {
  // (what the choice is for: the default, the curved road's blade, lies where the other track's rails cross in)
  it('the R104 double slip with the curved road\'s blade moving (the default): every set is said to have the other track\'s rail in it', async () => {
    const b = await built(edited((e) => { delete e.single; }));
    expect(b.info.warnings.filter((x) => /have another track's rail between their stock rails/.test(x))).toHaveLength(4);
  });
  it('the straighter road\'s blade moving: none is; the blade is the one by the slip road\'s own stock rail', async () => {
    const b = await built(TEMPLATES['Double slip R104 left']);
    expect(b.info.warnings.filter((x) => /another track's rail/.test(x))).toEqual([]);
    // (the straight track's points at its lower end: the slip road leaves to the left, its stock rail left of the track's left rail)
    const blade = b.pieces.filter((p) => p.turn && p.turn.at[1] < 0 && Math.abs(p.turn.at[0]) < 24);
    expect(blade).toHaveLength(1);
    expect(blade[0].turn!.at[0]).toBeLessThan(-8);
  });
  it('blades lengthened by 2.25 studs: their pivots that much further on, their swing smaller', async () => {
    const [short, long] = [await built(edited((e) => { delete e.heel; })), await built(TEMPLATES['Double slip R104 left'])];
    const blade = (b: typeof short) => b.pieces.find((p) => p.turn && p.turn.at[1] < 0 && Math.abs(p.turn.at[0]) < 24)!.turn!;
    expect(blade(long).at[1] - blade(short).at[1]).toBeCloseTo(18, 0);
    expect(Math.abs(blade(long).swing!)).toBeLessThan(Math.abs(blade(short).swing!) - 1);
    expect(long.info.warnings.filter((x) => !/thinner plates/.test(x))).toEqual([]);
  });
});

describe('the TrixBrix slips: ends, points, throws and levers as the parts\'', { timeout: 600000 }, () => {
  for (const [name, ref] of Object.entries(REF)) {
    it(`${name}: its ends are the part's (0.05 stud, 0.1 degree)`, () => {
      const ends = toRoutes(TEMPLATES[name]).flatMap((rt) => { const a = routePose(rt, 0), b = routePose(rt, routeLength(rt)); return [[a[0] / 8, a[1] / 8, a[2] + 270], [b[0] / 8, b[1] / 8, b[2] + 90]]; });
      const turn = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
      for (const [x, y, out] of ref.ends)
        expect(ends.some((e) => Math.hypot(e[0] - x, e[1] - y) < 0.05 && turn(e[2], out) < 0.1), `an end at ${x}, ${y} leaving at ${out}`).toBe(true);
      // (and no end that isn't the part's)
      for (const e of ends) expect(ref.ends.some(([x, y, out]) => Math.hypot(e[0] - x, e[1] - y) < 0.05 && turn(e[2], out) < 0.1), `the end at ${e[0].toFixed(2)}, ${e[1].toFixed(2)}`).toBe(true);
    });
    it(`${name}: each set of points, its throw and its lever where the part's are`, async () => {
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        const w = await kernel();
        clearBuildCache();
        const b = buildDesign(w, structuredClone(TEMPLATES[name]));
        expect(b.overlay.issues).toEqual([]);
        const sets = new Map<string, typeof b.pieces>();
        for (const p of b.pieces) { const m = /^(points\d+)/.exec(p.name); if (m) sets.set(m[1], [...(sets.get(m[1]) ?? []), p]); }
        expect(sets.size).toBe(ref.sets.length);
        const throws = b.overlay.items.filter((it) => it.kind === 'throw');
        expect(throws).toHaveLength(ref.sets.length);
        const used = new Set<string>();
        for (const s of ref.sets) {
          const [ex, ey, out] = ref.ends[s.end], u = [-Math.cos(rad(out)), -Math.sin(rad(out))], n = [-u[1] * s.side, u[0] * s.side];
          // (in studs: along the track in from the end, and out from its centre line on the lever's side)
          const at = (q: ArrayLike<number>) => [((q[0] / 8 - ex) * u[0] + (q[1] / 8 - ey) * u[1]), ((q[0] / 8 - ex) * n[0] + (q[1] / 8 - ey) * n[1])];
          const what = `${name}: the points facing the end at ${ex}, ${ey}`;
          // its set: the one whose blades turn nearest this end's track
          const mine = [...sets].filter(([, ps]) => ps.some((p) => p.turn && at(p.turn.at)[0] > 0 && at(p.turn.at)[0] < 19 && Math.abs(at(p.turn.at)[1]) < 3.2))
            .sort((a, c) => Math.min(...a[1].filter((p) => p.turn).map((p) => Math.abs(at(p.turn!.at)[1]))) - Math.min(...c[1].filter((p) => p.turn).map((p) => Math.abs(at(p.turn!.at)[1]))))
            .find(([id]) => !used.has(id));
          expect(mine, what).toBeDefined();
          const [id, ps] = mine!;
          used.add(id);
          const blades = ps.filter((p) => p.turn);
          expect(blades, `${what}: moving blades`).toHaveLength(s.blades);
          // (one lever, one slider: this set's own, moving these blades and no others)
          expect(ps.filter((p) => /-lever$/.test(p.name)), `${what}: levers`).toHaveLength(1);
          expect(ps.filter((p) => /-throw$/.test(p.name)), `${what}: sliders`).toHaveLength(1);
          for (const p of blades) {
            // the toe: the far end of the blade's rail head (its top) from its pivot
            const P = p.positions;
            let top = -Infinity, toe = Infinity;
            for (let k = 2; k < P.length; k += 3) top = Math.max(top, P[k]);
            for (let k = 0; k < P.length; k += 3) if (P[k + 2] > top - 0.6) toe = Math.min(toe, at([P[k], P[k + 1]])[0]);
            expect(Math.abs(toe - s.toe), `${what}: ${p.name}'s toe ${toe.toFixed(2)} studs in, the part's ${s.toe}`).toBeLessThanOrEqual(0.5);
            const heel = at(p.turn!.at)[0];
            expect(Math.abs(heel - s.heel), `${what}: ${p.name}'s heel ${heel.toFixed(2)} studs in, the part's ${s.heel}`).toBeLessThanOrEqual(0.75);
          }
          // the lever (and the throw's line across the track): the nearest to where the part's is
          const lv = throws.map((it) => at(it.at)).sort((a, c) => Math.hypot(a[0] - s.lever, a[1] - s.out) - Math.hypot(c[0] - s.lever, c[1] - s.out))[0];
          expect(Math.abs(lv[0] - s.lever), `${what}: its lever ${lv[0].toFixed(2)} studs in, the part's ${s.lever}`).toBeLessThanOrEqual(s.within + 1e-6);
          expect(Math.abs(lv[1] - s.out), `${what}: its lever ${lv[1].toFixed(2)} studs out on the slip road's side, the part's ${s.out}`).toBeLessThanOrEqual(0.05);
          // (and it's this set's lever: the part itself is there)
          const lever = ps.find((p) => /-lever$/.test(p.name))!;
          let cx = 0, cy = 0;
          for (let k = 0; k < lever.positions.length; k += 3) { cx += lever.positions[k]; cy += lever.positions[k + 1]; }
          const c = at([cx / (lever.positions.length / 3), cy / (lever.positions.length / 3)]);
          expect(Math.hypot(c[0] - lv[0], c[1] - lv[1]), `${what}: ${lever.name} at its throw`).toBeLessThan(1);
        }
      } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
    });
  }
});
