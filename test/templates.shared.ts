// Templates in the Templates list build, with the app's own defaults (setup-defaults.ts APP_DEFAULTS): no warnings but
// the experimental notes, the double slip's that its blades are rigid (no room for sprung plates beside the next sets'), the
// nail-switch double slip's that its middle sets' springs are in each other's parts (assembled.shared.ts KNOWN), and
// rigid blades on points at an angle to the baseplate grid (a sprung slider there would run over its studs).
// (Split over files by group: the kernel wears out after a few big builds in one worker.)
// Each within its time (BUDGET), and built again unchanged near enough at once: a guard against a build made slower.
// And on every part of each, studs never overlap or touch (studs-apart.shared.ts).
import { expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATE_GROUPS, TEMPLATES } from '../src/app/design';
import { studFaults } from './studs-apart.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

/**
 * Each template's time to build from nothing (s): 2.5 times the slowest of what the template's test took on CI's runner in
 * the last three green runs (the whole test: that build and the rebuild, so a little over the build itself), never under
 * 3 s. Read from the runs' logs (`gh run view <id> --log`, each test's ms), never from a laptop. A build that gets
 * three times slower fails; a busy runner mostly doesn't. Tighten them again when CI's times drop, loosen one only with
 * the log that shows why. A template not here: BUDGET_SMALL.
 */
const BUDGET: Record<string, number> = {
  // (the reference range's combo sets, templates-ref-combos.ts: half as long again as on CI)
  'Compact corner R56 left': 34, 'Compact corner R56 right': 33, 'Compact corner R104, two tracks, left': 30, 'Compact corner R104, two tracks, right': 30, 'Compact corner R104, three tracks, left': 37, 'Compact corner R104, three tracks, right': 35, 'Compact corner R104, four tracks, left': 56, 'Compact corner R104, four tracks, right': 48, 'Yard R104, three tracks, left': 23, 'Yard R104, three tracks, right': 26, 'Yard R104, four tracks, left': 44, 'Yard R104, four tracks, right': 37, 'Three-way R104 to three parallel tracks': 20, 'Wye R104 to two parallel tracks': 13, 'Switch R120 left with its turnout curve': 11, 'Switch R120 right with its turnout curve': 12, 'Yard R148, three tracks, left': 24, 'Yard R148, three tracks, right': 23, 'Yard R148, four tracks, left': 44, 'Yard R148, four tracks, right': 43, 'Switch R148 left with its turnout curve': 15, 'Switch R148 right with its turnout curve': 16, 'Switch R56 left with its turnout curve': 11, 'Switch R56 right with its turnout curve': 11, 'Pass-through turnout R72 left': 14, 'Pass-through turnout R72 right': 13, 'Double turnout R72 and R56, left': 20, 'Double turnout R72 and R56, right': 19, 'Double pass-through turnout R72 left': 25, 'Double pass-through turnout R72 right': 24, 'Double pass-through turnout R72 and R40, left': 27, 'Double pass-through turnout R72 and R40, right': 28, 'W-junction R104 and R120': 29,
  'Crossing 90°, 8 studs': 3, 'Crossing 45° left': 4, 'Crossing 45° right': 4, 'Crossing 45°, 27 studs': 5, 'Double slip R40 45°': 26, 'Double slip R104 left': 26, 'Double slip R104 right': 26,
  'Crossing 22.5° left': 11, 'Crossing 22.5° right': 11, 'Single slip R40 45°': 20, 'Star crossing 22.5°': 22, 'Curved crossing R24': 3,
  'Curved crossing R40': 3, 'Curved crossing R56': 3, 'Curved crossing R72': 3, 'Curved crossing R88': 3, 'Curved crossing R104': 3,
  'Crossing of two R120 curves': 4, 'Pass-through crossing R56 left': 4, 'Pass-through crossing R72 (A) left': 4,
  'Pass-through crossing R72 (B) left': 3, 'Double crossover R40': 36, 'Pass-through crossing R120 left': 13, 'Pass-through crossing R56 right': 4,
  'Pass-through crossing R72 (A) right': 4, 'Crossover, 4-stud gap, left': 15, 'Pass-through crossing R72 (B) right': 3,
  'Pass-through crossing R120 right': 13, 'Crossover, 4-stud gap, right': 13, 'Buffer stop': 3, 'T-junction core R56': 30,
  'Narrow-gauge crossing 90°': 3, 'Narrow-gauge crossing of standard track 90°': 3, 'Narrow-gauge buffer stop': 3,
  'Narrow-gauge double crossover R36': 22, 'Narrow-gauge crossing of standard track 45° left': 3,
  'Narrow-gauge crossing of standard track 45° right': 3, 'Narrow-gauge crossing 22.5° left': 3, 'Narrow-gauge crossing 22.5° right': 3,
  'Narrow-gauge crossing 33.75° left': 3, 'Narrow-gauge crossing 33.75° right': 3, 'Grade up at 2.5%': 8, 'Helix (R104, two turns)': 71,
  'Siding ending in a buffer stop': 30, 'Bridge with guard rails': 4, 'Dual gauge track': 5, 'Dual gauge crossing 90°': 3,
  'Dual gauge crossing 45°': 12, 'Narrow gauge beside and across standard track': 22, 'Banked curve': 15, 'Crossing on sleepers': 5,
  'Monorail oval on supports': 7, 'Monorail ramp (as LEGO\'s)': 6, 'Monorail points right (as LEGO\'s)': 6, 'Monorail points left (as LEGO\'s)': 6, 'Monorail siding (points and a short curve)': 9, 'Monorail level crossing (experimental)': 3,
  'Yard (R56)': 139, 'Double-track return loop (turning right)': 390, 'Double-track return loop (turning left)': 283, 'Yard ladder (R40)': 71,
  'Wye with a crossover': 58, '90° crossing': 3, '22.5° crossing': 14, 'Double slip (22.5°)': 16, 'Double slip (45°, R40)': 23,
  'Crossing on a curve': 3, 'Left switch (LEGO)': 7, 'Right switch (LEGO)': 7, 'Left switch (BrickTracks R104)': 7,
  'Right switch (BrickTracks R104)': 8, 'Wye switch': 8, 'Three-way switch': 11, 'Three-way switch (one throw)': 8, 'Three-way switch (tandem, two throws)': 23,
  'Test print 1: stud and anti-stud fits': 3, 'Test print 2: track joints': 3, 'Test print 3: switch as built': 8,
  'Test print 4: points three ways': 8, 'Test print 5: seat for a LEGO curve': 3, 'Curved switch R40 45° left': 8, 'Curved switch R40 45° right': 7,
  'Curved switch R40 90° left': 7, 'Curved switch R40 90° right': 7, 'Curved switch R56 90° left': 9, 'Curved switch R56 90° right': 8,
  'Curved switch R104 90° left': 12, 'Curved switch R104 90° right': 10, 'Wye R40': 4, 'Wye R40, 8-stud spacing': 4, 'Wye R104': 3,
  'Wye R40 left, R56 right': 4, 'Wye R56 left, R40 right': 4, 'Wye R104 left, R120 right': 10, 'Wye R120 left, R104 right': 8, 'Three-way R40': 10,
  'Three-way R104': 11, 'Switch to the next track, no gap, left': 5, 'Switch to the next track, no gap, right': 6, 'Switch, 2-stud gap, left': 8,
  'Switch, 2-stud gap, right': 8, 'Switch, 4-stud gap, left': 3, 'Switch, 4-stud gap, right': 3, 'Three-way, no gap': 11,
  'Three-way, 2-stud gap': 11, 'Three-way, 4-stud gap': 4, 'Narrow-gauge switch R36 left': 3, 'Narrow-gauge switch R36 right': 3,
  'Narrow-gauge switch R48 left': 5, 'Narrow-gauge switch R48 right': 6, 'Narrow-gauge switch R84 left': 6, 'Narrow-gauge switch R84 right': 5,
  'Narrow-gauge wye R36': 3, 'Narrow-gauge switch R36 left, lever on the branch side': 3,
  'Narrow-gauge switch R36 right, lever on the branch side': 3, 'Wye R104, 8-stud gap': 9, 'Dual gauge switch R40 left': 4,
  'Dual gauge switch R40 right': 4, 'X yard (6 tracks, double slips)': 415, 'Double slip crossover R104': 100, 'Double slip monster crossover R104': 100, 'Crossover, three tracks, R104': 70, 'Modular triple crossover R40': 150, 'Modular double crossover R40, levers inside': 70, 'Modular double crossover R40, levers outside': 70,
  'Modular crossover R40 left': 45, 'Modular crossover R40 right': 45, 'Modular three-way R40 with parallel-track adapters': 25, 'Modular three-way R40 with continuous-curve adapters': 35,
  'Modular wye R40 with parallel-track adapters': 20, 'Modular wye R40 with continuous-curve adapters': 20, 'Modular three-way R40': 15, 'Oval (LEGO R40)': 20, 'Crossover (R40)': 33,
  'Double crossover (R56)': 55, 'Switch R40 left': 9, 'Switch R40 right': 7, 'Switch R40 left, 28-stud straight': 4,
  'Switch R40 right, 28-stud straight': 3, 'Yard switch R40 left': 3, 'Yard switch R40 right': 3, 'Switch R56 left': 10, 'Switch R56 right': 8,
  'Switch R72 left': 10, 'Switch R72 right': 9, 'Switch R104 left': 10, 'Switch R104 right': 9, 'Switch R104 left, lever on the straight side': 9,
  'Switch R104 right, lever on the straight side': 9, 'Switch R120 left': 7, 'Switch R120 right': 7, 'Switch R148 left': 11, 'Switch R148 right': 12,
  'Switch R148 left, lever on the straight side': 11, 'Switch R148 right, lever on the straight side': 12,
};
/** (the sets: four times what each took on a laptop, till CI's own times are in) */
Object.assign(BUDGET, { 'Switch, 2-stud gap, left, with its R51 curve': 12, 'Switch, 2-stud gap, right, with its R51 curve': 12, 'Three-way, 2-stud gap, with its R51 curves': 17, 'Compact corner R104, 90°, one curved switch, left': 42, 'Compact corner R104, 90°, one curved switch, right': 91, 'Compact corner R104, 90°, two curved switches, right': 91, 'Compact corner R104, 90°, three curved switches, left': 84, 'Compact corner R104, 90°, three curved switches, right': 130, 'Double turnout R56 and R40, left': 45, 'Single pass-through R40, left': 68, 'Single pass-through R40, right': 61, 'Yard R104, two tracks, right': 16, 'Three-way R104 to three parallel tracks': 22, 'Switch R120 left with its turnout curve': 26, 'Switch R120 right with its turnout curve': 22, 'Switch R148 left with its siding curves': 22, 'Switch R148 right with its siding curves': 20, 'Switch R148 left with its turnout curve': 31, 'Switch R148 right with its turnout curve': 31, 'Yard R40, two tracks, right': 12, 'Switch R56 right with its siding curve': 14, 'Switch R56 left with its turnout curve': 43, 'Crossover turnout R72, left': 49, 'Crossover turnout R72, right': 40, 'Double turnout R72 and R56, left': 58, 'Double crossover turnout R72, left': 66, 'Double crossover turnout R72, right': 65, 'Double crossover turnout R72 and R40, left': 82, 'Switch R72 left with its turnout curve': 12, 'Switch R72 right with its turnout curve': 13, 'Wye R40, 8-stud spacing, to two parallel tracks': 12, 'Dual gauge crossing 45° left over two tracks': 38, 'Dual gauge crossing 45° right over two tracks': 40, 'Dual gauge star crossing 45° over two tracks': 83, 'Narrow-gauge switch R48 left with its turnout curve': 17, 'Narrow-gauge switch R48 right with its turnout curve': 17, 'Wye R104 with its adapter curves': 12, 'Wye R104, 8-stud gap, with its curves': 16 });
// (a track's own settings, expert: built in two groups. Not from CI's log yet: 4 to 11 s on a busy desk machine; to be set by the rule above from the first green runs)
Object.assign(BUDGET, { 'Double track, one on sleepers, one on ballast': 25 });
/** (expert stage 5a's: four times what each took on a laptop, till CI's own times are in) */
Object.assign(BUDGET, { 'Compact corner R40 left': 20, 'Compact corner R40 right': 20, 'Switch R40 left to a parallel track': 12, 'Switch R40 right to a parallel track': 12, 'Yard R40, two tracks, left': 16, 'Three-way R40 to three parallel tracks': 20,
  'Sleepers edited by hand': 12, 'Double track on shared sleepers': 8, 'Siding on ballast wider on one side, stepped round its buffer stop': 8 });
/** (expert stages 5b and 5c: four times a laptop's, till CI's own times are in) */
Object.assign(BUDGET, { 'Rails edited by hand': 12, 'Crossover with points of their own': 40 });
// (the modular kits, cut by hand paths: 2.5 times CI's first green run with them, 617dda1: 8.8, 9.2, 8.8 and 27.8 s; the three-track crossover 27.4 s there, 59 before its paths' plan was looked at only beside them)
Object.assign(BUDGET, { 'Double crossover R104, bases and detachable modules': 70, 'Double slip R104 left, middle and detachable sections': 23, 'Double slip R104 right, middle and detachable sections': 23, 'Three-way R104, base and detachable modules': 22 });
// (headroom: 1.3 times the slowest cold build any CI run has shown (TEMPLATE-TIME lines, and the times of the budget's
// failures) where the budget above was under that. Main went red on timing alone (Switch R120 left 7.2 s against 7,
// Pass-through turnout R72 right 14.1 against 13, Yard R40, two tracks, left 16.5 against 16) with no build slower)
Object.assign(BUDGET, { 'Compact corner R104, four tracks, left': 61, 'Compact corner R104, four tracks, right': 46, 'Compact corner R104, three tracks, left': 46, 'Compact corner R104, three tracks, right': 45, 'Compact corner R104, two tracks, left': 37, 'Compact corner R104, two tracks, right': 35, 'Compact corner R40 left': 21, 'Compact corner R40 right': 21, 'Compact corner R56 left': 38, 'Compact corner R56 right': 37, 'Double pass-through turnout R72 and R40, left': 29, 'Double pass-through turnout R72 and R40, right': 25, 'Double pass-through turnout R72 left': 22, 'Double pass-through turnout R72 right': 27, 'Double slip (22.5°)': 20, 'Double turnout R56 and R40, right': 13, 'Double turnout R72 and R56, right': 16, 'Narrow-gauge crossing of standard track 45° left': 4, 'Narrow-gauge crossing of standard track 45° right': 4, 'Pass-through turnout R72 left': 19, 'Pass-through turnout R72 right': 19, 'Switch R120 left': 10, 'Switch R120 right': 10, 'Switch R40 left to a parallel track': 13, 'Switch R56 right with its turnout curve': 14, 'Test print 4: points three ways': 9, 'W-junction R104 and R120': 25, 'Wye R104 to two parallel tracks': 14, 'Yard R104, four tracks, left': 47, 'Yard R104, four tracks, right': 46, 'Yard R104, three tracks, left': 25, 'Yard R104, three tracks, right': 23, 'Yard R148, four tracks, left': 49, 'Yard R148, four tracks, right': 44, 'Yard R148, three tracks, left': 25, 'Yard R148, three tracks, right': 29, 'Yard R40, two tracks, left': 22 });
// (the R40 yards and R120 sidings made of the reference's parts: four times a laptop's, till CI's own times are in)
Object.assign(BUDGET, { 'Yard R40, three tracks, left': 21, 'Yard R40, three tracks, right': 21, 'Yard R40, four tracks, left': 35, 'Yard R40, four tracks, right': 34, 'Switch R120 left with its siding curves': 10, 'Switch R120 right with its siding curves': 10 });
// (the cross-bar lever housing, the TrixBrix trackwork templates' default: 1.3 times the slowest CI time seen, times how much
// slower each built on a laptop with it (most by about a second: a switch that only just fitted the bed corner to corner
// cut in two); none lowered (five the line above had put under their old budgets are back to those))
Object.assign(BUDGET, { 'Compact corner R104, four tracks, left': 63, 'Compact corner R104, four tracks, right': 49, 'Compact corner R104, three tracks, left': 48, 'Compact corner R104, three tracks, right': 48, 'Compact corner R104, two tracks, left': 38, 'Compact corner R104, two tracks, right': 36, 'Compact corner R40 left': 22, 'Compact corner R40 right': 22, 'Compact corner R56 left': 43, 'Compact corner R56 right': 41, 'Double pass-through turnout R72 and R40, left': 30, 'Double pass-through turnout R72 and R40, right': 28, 'Double pass-through turnout R72 left': 26, 'Double pass-through turnout R72 right': 28, 'Double turnout R56 and R40, right': 17, 'Double turnout R72 and R56, right': 22, 'Pass-through turnout R72 right': 20, 'Switch R120 left': 12, 'Switch R120 right': 12, 'W-junction R104 and R120': 33, 'Yard R104, four tracks, right': 47, 'Yard R104, three tracks, right': 26, 'Yard R148, four tracks, left': 50, 'Yard R148, four tracks, right': 46, 'Yard R148, three tracks, left': 26, 'Yard R148, three tracks, right': 30 });
const BUDGET_SMALL = 10; // (a template with no time of its own yet)
/** only: just these templates of the groups */
export function templatesBuild(groups: string[], only?: string[]) {
  for (const [g, names] of TEMPLATE_GROUPS) if (groups.includes(g)) for (const name of names) if (!only || only.includes(name)) it(`${g}: ${name} builds`, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      // (from nothing, as it's first built: what's waited for)
      clearBuildCache();
      const t0 = performance.now();
      const b = buildDesign(w, structuredClone(TEMPLATES[name]));
      const ms = performance.now() - t0;
      expect(ms / 1000, `${name}: built in ${(ms / 1000).toFixed(1)} s`).toBeLessThan(BUDGET[name] ?? BUDGET_SMALL);
      // (and again, nothing changed: every piece found built (a rebuild, or an edit elsewhere), not built again)
      // (the better of two where the first is over: a busy runner held one up (the helix, 2.35 s against 2.18, once); a
      // build that's lost its cache is over both times)
      const limit = Math.max(1500, ms / 10), warm = () => { const t1 = performance.now(), r = buildDesign(w, structuredClone(TEMPLATES[name])); return [r, performance.now() - t1] as const; };
      let [again, ms2] = warm();
      if (ms2 >= limit) { const [r, t] = warm(); if (t < ms2) [again, ms2] = [r, t]; }
      // (one line for each template, in a fixed format, so the times can be tracked from CI's logs: grep TEMPLATE-TIME)
      process.stdout.write(`TEMPLATE-TIME\t${name}\tcold_ms=${Math.round(ms)}\twarm_ms=${Math.round(ms2)}\tbudget_s=${BUDGET[name] ?? BUDGET_SMALL}\n`);
      expect(ms2, `${name}: built again unchanged in ${(ms2 / 1000).toFixed(2)} s`).toBeLessThan(limit);
      expect(again.pieces.length).toBe(b.pieces.length);
      expect(b.pieces.length).toBeGreaterThan(0);
      // (the double slip monster crossover's three-ways keep both blades: the design's one blade a set is its double slips')
      const extra = b.info.warnings.filter((w) => !/experimental/.test(w) && !/at an angle to the baseplate grid/.test(w) && !(/Double slip/.test(name) && /blades are rigid/.test(w)) && !(/Helix/.test(name) && /stands over other track/.test(w)) && !(/triple crossover/.test(name) && /sections don't fit the \d+ x \d+ print bed/.test(w)) && !(/X yard/.test(name) && /lever of the points at 67, 209|sprung blade's front has no lip|blades are rigid/.test(w)) && !(/Double slip (monster )?crossover/.test(name) && /sprung blade's front has no lip/.test(w)) && !(/Double slip monster crossover/.test(name) && /a three-way's points keep both blades/.test(w)));
      // (said in full when it fails)
      expect(extra.join(' | ')).toBe('');
      // (and on every part: no two studs that touch or overlap, nor tubes, nor pins; each
      // part's own fits (a test print's coupons have their own))
      const faults = studFaults(w, b.pieces, (p) => ({ studD: 4.8, studFit: APP.studFit, antistudFit: APP.antistudFit, ...TEMPLATES[name].options, ...TEMPLATES[name].kit?.find((k) => k.name === p.kit)?.options }));
      expect(faults.join(' | ')).toBe('');
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
}
