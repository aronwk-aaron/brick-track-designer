// Where a design's parts are cut depends on its tracks' lengths, and a fault can hide in one placement: three parallel
// tracks with a crossover from the middle one to the left one (the settings' example for Points with no room for a
// throw, scripts/option-specs.ts BOXED_IN), the straights' length swept in 4s, an R40 and an R56 crossover, the tracks
// 8, 9 and 16 studs apart (the straights too short for the crossover too: carried on, and said); each built as the app builds it and put through the overlap and joint checks
// (assembled.shared.ts overlaps, mates), and each part one solid that prints (prints).
// (Split over files by how far apart the tracks are: a file's worth of builds each.)
// (Found by it: with 56-stud straights 9 apart, the crossover's rail left its section's middle cut 5 mm before the cut
// across the left track, got a rail-end tongue at both, and the second reached back into the part beside it: 23 mm3 of
// rail in two parts; with an R56 crossover and 64-stud straights, 29. cutter.ts jointsNear.)
// (And, 8 studs apart: the bed under a set of points stood 0.01 mm past its sleepers' ends on its right, in the ends of
// the sleepers of the track beside it, 1 mm3 at every length. switch/base.ts pointsBed.)
import { expect, it } from 'vitest';
import { arena, kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions } from '../src/app/design';
import { drop, mates, overlaps, parts, prints } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

/** (degrees) What each of the crossover's two curves turns, for tracks so far apart (studs). */
const turnOf = (apart: number, radius: number) => (Math.acos(1 - apart / (2 * radius)) * 180) / Math.PI;
/** (studs) Where the crossover ends on the left track: it leaves the middle one 8 studs on. */
const endOf = (apart: number, radius: number) => 8 + 2 * radius * Math.sin((turnOf(apart, radius) * Math.PI) / 180);
const layout = (studs: number, apart: number, radius: number): Design => ({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print', boxedThrow: 'nail' }, routes: [
  { name: 'Left', x: -apart, y: 0, heading: 0, segs: [{ kind: 'straight', studs }] },
  { name: 'Middle', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }] },
  { name: 'Right', x: apart, y: 0, heading: 0, segs: [{ kind: 'straight', studs }] },
  { name: 'Crossover', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius, angle: turnOf(apart, radius) }, { kind: 'curve', radius, angle: -turnOf(apart, radius) }] }] });

/** (studs) The first of the straights' lengths the crossover ends within. */
const firstOf = (apart: number, radius: number) => Math.max(40, Math.ceil(endOf(apart, radius) / 4 - 1e-6) * 4);
/**
 * The straights' lengths tried (studs): 40 to 72 in 4s, and on past 72 where fewer than five of them have the
 * crossover end within the straights (a 16-stud piece's worth of placements at least). Shorter than that, the left
 * track stops short of where the crossover reaches its line: it's built on to the join and past the points there,
 * and the build says by how much to lengthen it (app/carryon.ts); as drawn the two only ran over each other, with
 * no points (and two lengths left rail or bed in two parts: 6 and 231 mm3).
 */
const lengths = (apart: number, radius: number) => {
  const out: number[] = [];
  for (let l = 40; l <= Math.max(72, firstOf(apart, radius) + 16); l += 4) out.push(l);
  return out;
};
/** What the build says of the left track carried on (and nothing else of tracks running over each other). */
const CARRIED = /^Left ends ([\d.]+) studs short of where Crossover joins it at -\d+, \d+ \(studs\): it's built (\d+) studs longer, past the points there; lengthen Left by (\d+) studs$/;


/** The sweep for tracks so far apart (studs): each crossover, each length, a test. */
export function crossoverSweep(apart: number) {
  for (const radius of [40, 56]) for (const studs of lengths(apart, radius))
    it(`tracks ${apart} studs apart, an R${radius} crossover, ${studs}-stud straights`, async () => {
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        const w = await kernel();
        clearBuildCache();
        const d = layout(studs, apart, radius), b = buildDesign(w, d), o = { ...APP, ...d.options };
        // (its pieces are plain data: the build's own solids let go before the checks make theirs)
        clearBuildCache();
        const { parts: ps, unsolid } = parts(w, b.pieces);
        let problems: string[];
        try { problems = [...unsolid.map((n) => `${n} isn't a closed solid as assembled`), ...arena(w, () => [...overlaps(w, ps, o), ...mates(w, ps, o)], () => [])]; } finally { for (const q of ps) drop(q.m); }
        for (const p of b.pieces) problems.push(...arena(w, () => prints(w, p, o.printBedX!, o.printBedY!), () => []));
        expect(problems.join('; ')).toBe('');
        // (said only where the left track's short of the join: how short, and built on 3 studs past it, to whole studs)
        const said = b.info.warnings.filter((q) => /short of where|run over each other|ends in the points/.test(q)), short = studs < firstOf(apart, radius);
        expect(said).toHaveLength(short ? 1 : 0);
        if (short) {
          const m = CARRIED.exec(said[0]);
          expect(m, said[0]).not.toBeNull();
          expect(Number(m![1])).toBeCloseTo(endOf(apart, radius) - studs, 1);
          expect([Number(m![2]), m![3]]).toEqual([Math.ceil(endOf(apart, radius) + 3 - 1e-6) - studs, m![2]]);
        }
        // (the crossover joins the left track: points at both its ends)
        expect(b.pieces.filter((p) => /^points\d+-a$/.test(p.name))).toHaveLength(2);
      } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
    });
}
