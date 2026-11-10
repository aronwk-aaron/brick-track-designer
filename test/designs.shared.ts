// Designs saved from the app by its users (test/fixtures/designs: each as it was saved, its file's name kept), built as
// the app builds them: read as the app reads a file (readDesign), its own settings over the app's defaults. The faults
// people reported and nobody could reproduce came from designs like these, not from the templates: so each is built
// within its time, and its parts checked as the templates' are (assembled.shared.ts: nothing overlaps, everything
// moves, goes in and comes apart, every file prints). What one shows wrong is pinned in KNOWN_SAVED, with what it is, to
// be put right: it must still be found, so the list comes down and doesn't go stale.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, readDesign } from '../src/app/design';
import { goesTogether, type Known } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const DIR = new URL('./fixtures/designs/', import.meta.url).pathname;

/** A saved design, read as the app reads its file. */
export const saved = (file: string) => readDesign(JSON.parse(readFileSync(`${DIR}${file}`, 'utf8')));

/** What a saved design shows wrong, not yet put right (as assembled.shared.ts KNOWN); and the warnings its build gives (each must be given). */
export const KNOWN_SAVED: Record<string, Known & { warnings?: RegExp[] }> = {
  'R136-152_corner.btd.json': { problems: [/^track13 and track14 overlap/],
    why: 'two neighbouring pieces of the two curves (R136 and R152, on ballast with a buddy strip, cut at the 32-stud baseplate edges) share 5.75 mm3 at 721, 852: a sliver 6.7 x 1.6 x 2.3 mm where their ballast meets' },
  'return-loop-turning-left.btd.json': { problems: [/^points2-lever isn't held by its ears/],
    warnings: [/sprung blades are on thinner plates/],
    why: 'the second points\' lever isn\'t held by its ears (the points lie at an angle to the baseplate grid, on the thinner plates the build warns of)' },
  'return-loop-turning-right.btd.json': { problems: [/^track-bought-BrickTracksR120-20 and track-bought-BrickTracksR120-21 overlap/, /^track-bought-53401-39 and track-bought-53401-40 overlap/, /^track-bought-53401-40 and track-bought-53401-41 overlap/, /^points2-lever isn't held by its ears/],
    warnings: [/sprung blades are on thinner plates/],
    why: 'as the loop turning left; and three pairs of neighbouring bought pieces share 11 to 23 mm3 at their joints (two R120 curves at 295, 2777; three straights at 1132 to 1248, 1153 to 1208)' },
  'monster-switch-6-tracks.btd.json': { problems: [],
    warnings: [/blades are rigid/, /a sprung blade's front has no lip/],
    why: 'the build says it: rigid blades where the sprung plates don\'t fit, and a sprung blade with no lip; its parts go together' },
  'monster-switch-6-tracks-double-slips.btd.json': { problems: [/^points(5|19)-throw and points(11|26)-throw(-posts)? overlap/, /^points(5|11|19|26)-throw(-posts)? slid [\d.]+ mm: [\d.]+ mm3 in points(5|11|19|26)-throw/, /^points(11|26) isn't moved by its slider/],
    warnings: [/blades are rigid/, /the lever of the points at 45, 156 \(studs\) is in the way/, /the lever of the points at 35, 132 \(studs\) is in the way/, /the throws of the points at 48, 155 \(studs\) and 45, 156 \(studs\) run into each other/, /the throws of the points at 32, 133 \(studs\) and 35, 132 \(studs\) run into each other/],
    why: 'the build says it: the double slips\' throws run into each other (points5 and points11, points19 and points26: their sliders cross, 27 mm3 shared, neither slides), and two levers are in the way of trains on another track' },
};

/**
 * Each saved design's time to build from nothing (s): a few times what it takes on CI's runner, as the templates'
 * (templates.shared.ts BUDGET). edges: its files' edges shared by more than two triangles, at most (EDGES there).
 */
export const SAVED: Record<string, { budget: number; edges?: number }> = {
  'R136-152_corner.btd.json': { budget: 120 },
  '8-way_intersection.btd.json': { budget: 60 },
  '128s-112x.btd(2).json': { budget: 180 },
  'return-loop-turning-left.btd.json': { budget: 350 },
  'return-loop-turning-right.btd.json': { budget: 350 },
  'monster-switch-6-tracks.btd.json': { budget: 600 },
  'monster-switch-6-tracks-double-slips.btd.json': { budget: 600 },
};

/** These saved designs: each builds within its time with no warnings but its known ones, and goes together. */
export function savedSuite(files: string[]) {
  for (const file of files) {
    const k = KNOWN_SAVED[file];
    it(`${file} builds`, async () => {
      const keep = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        const w = await kernel();
        clearBuildCache();
        const t0 = performance.now(), b = buildDesign(w, saved(file)), s = (performance.now() - t0) / 1000;
        expect(s, `${file}: built in ${s.toFixed(1)} s`).toBeLessThan(SAVED[file].budget);
        expect(b.pieces.length).toBeGreaterThan(0);
        const allowed = k?.warnings ?? [];
        expect(b.info.warnings.filter((q) => !/experimental/.test(q) && !allowed.some((re) => re.test(q))).join(' | ')).toBe('');
        for (const re of allowed) expect(b.info.warnings.some((q) => re.test(q)), `${file}: the build no longer says ${re}: take it off the list`).toBe(true);
      } finally { Object.assign(OPTION_DEFAULTS, keep); clearBuildCache(); }
    });
    it(`${file} goes together`, () => goesTogether(file, saved(file), k?.problems.length ? k : undefined, SAVED[file].edges));
  }
}
