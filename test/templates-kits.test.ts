// The reference range's modular kits (src/app/templates-ref-kits.ts, and the R104 three-way's and double slip's in
// design.ts): each builds, and its parts are the kit's modules, each where the parts library has that module's ends
// (the pattern of templates-cutpaths.test.ts, which has the R104 switch's kit); no stud cut. The R104 switch's
// points and lever are where the library's base has them.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, TEMPLATES } from '../src/app/design';
import { templatesBuild } from './templates.shared';
import { studsCut } from './cutpaths.shared';

describe('templates: the modular kits', { timeout: 900000 }, () => templatesBuild(['TrixBrix trackwork'], [
  'Three-way R104, base and detachable modules',
  'Double slip R104 left, middle and detachable sections', 'Double slip R104 right, middle and detachable sections',
  'Switch R40 left, compact base and standard section', 'Switch R40 right, compact base and standard section',
  'Switch R40 left, compact base and short section', 'Switch R40 right, compact base and short section',
  'Yard switch R40 left, compact base and rail yard section', 'Yard switch R40 right, compact base and rail yard section',
  'Switch R40 left, compact base and curved 45° section', 'Switch R40 right, compact base and curved 45° section',
  'Switch R40 left, compact base and curved 90° section', 'Switch R40 right, compact base and curved 90° section',
  'Double crossover R104, bases and detachable modules',
]));

const APP = (globalThis as unknown as { APP_DEFAULTS: typeof OPTION_DEFAULTS }).APP_DEFAULTS;
/** built as the app builds it (its defaults: sleepers, track pieces) */
const build = async (d: Design) => {
  const saved = { ...OPTION_DEFAULTS };
  Object.assign(OPTION_DEFAULTS, APP);
  try { clearBuildCache(); return buildDesign(await kernel(), structuredClone(d)); } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
};
/** a part's bed, studs: [x0, y0, x1, y1] of what's under the rails' height (between y0 and y1 along) */
const bed = (p: { positions: Float32Array }, y0 = -Infinity, y1 = Infinity) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (let i = 0; i < p.positions.length; i += 3) if (p.positions[i + 2] < 3 && p.positions[i + 1] / 8 >= y0 && p.positions[i + 1] / 8 <= y1) { b[0] = Math.min(b[0], p.positions[i] / 8); b[1] = Math.min(b[1], p.positions[i + 1] / 8); b[2] = Math.max(b[2], p.positions[i] / 8); b[3] = Math.max(b[3], p.positions[i + 1] / 8); } return b; };

/**
 * A module of a kit: what the library calls it, its ends there (studs, in the template's frame: the library's own
 * are from each part's middle, y down), how long it is up the plan, and how wide (where another module has its ends
 * on its edge too: a track terminator's one end is its neighbour's).
 */
type Module = [what: string, ends: [number, number][], long: number, wide?: number];
const m = (hand: 1 | -1, ends: [number, number][]): [number, number][] => ends.map(([x, y]) => [x * hand, y]);
/** The compact R40 base's ends: the toe, the straight's end, the branch's (22.5 degrees of R40: 3.04 over, 15.31 on). */
const BASE40: [number, number][] = [[0, 0], [0, 16], [-3.045, 15.307]];
/** The R40 branch's end at 45 degrees (-11.716, 28.284): the outer end of its end sleeper there (4 studs out, square to the track: a part's edge is its box's). */
const B45_SLEEPER: [number, number] = [-11.716 - 2.828, 28.284 - 2.828];
/** (studs) How much nearer the toe the compact R40 base's cut reaches at the branch's outer edge, square to the branch there. */
const DIP40 = 2.6;
const compact = (hand: 1 | -1): Record<string, Module[]> => {
  const h = hand === 1 ? 'left' : 'right', base = (gto = ''): Module => [`comp base ${gto}${h}`, m(hand, BASE40), 16];
  // (the detachable section one part, its two tracks together as the kit's: the base's cut square to the branch across
  // it (Cut path ends square to a branch) reaches DIP40 nearer the toe at the branch's outer edge, so its straight's end
  // at 16 is inside its box, and it's that much longer; its ends: the branch's where the cut crosses it (16 studs up,
  // 3.34 over), and the straight's far one; as wide as the branch's sleepers reach past 33.75 degrees)
  const det = (what: string, end: [number, number], long: number): Module[] => [[`comp det ${what} ${h}`, m(hand, [[-3.34, 16], end]), long + DIP40, 14.1]];
  return {
    [`Switch R40 ${h}, compact base and standard section`]: [base(), ...det('straight standard', [0, 32], 16)],
    [`Switch R40 ${h}, compact base and short section`]: [base(), ...det('straight short', [0, 28], 12)],
    [`Yard switch R40 ${h}, compact base and rail yard section`]: [base('gto '), ...det('straight railyard', [-0.03, 28.844], 12.84)],
    [`Switch R40 ${h}, compact base and curved 45° section`]: [base(), ...det('curved 45', [-0.769, 30.431], 14.43)],
    [`Switch R40 ${h}, compact base and curved 90° section`]: [base(), [`comp det curved 90 ${h}`, m(hand, [[0, 16], [-3.045, 15.307], [-3.045, 31.307], B45_SLEEPER]), 16.5]],
  };
};
const slip = (hand: 1 | -1): Module[] => { const h = hand === 1 ? 'left' : 'right'; return [
  // (its joints to the middle: 4 studs from the crossing along the line between the two tracks, 11.25 degrees off the straight one)
  // (the joints square to that line, as the library's (slipCuts 'reference'), laid on the stud grid with a step: the
  // middle's box 10 studs long (the library's, 8 long and 12 wide at 11.25 degrees, is 10.2), each detachable's 18)
  [`dslip detach ${h} (below)`, m(hand, [[0, -20], [8, -20], [0.78, -3.92]]), 18],
  ['dslip middle', m(hand, [[0.78, -3.92], [-0.78, 3.92]]), 10],
  [`dslip detach ${h} (above)`, m(hand, [[0, 20], [-8, 20], [-0.78, 3.92]]), 18]]; };
const KITS: Record<string, Module[]> = {
  'Three-way R104, base and detachable modules': [
    ['base triple', [[0, 0], [0, 16], [-1, 16], [1, 16]], 16],
    ['detach 1 triple', [[0, 16], [-1, 16], [1, 16], [-4, 28], [4, 28]], 12],
    // (their side joints, at 0, 34, are each other's: checked below, where the two meet along the centre line)
    // (each 12 along the straight, and 2.4 more at its branch's outer edge: the cut at 28 there square to the branch)
    ['triple detach 2 left', [[-4, 28], [-8, 40]], 14.4], ['triple detach 2 right', [[4, 28], [8, 40]], 14.4]],
  'Double slip R104 left, middle and detachable sections': slip(1),
  'Double slip R104 right, middle and detachable sections': slip(-1),
  ...compact(1), ...compact(-1),
  'Double crossover R104, bases and detachable modules': [
    ...([[-1, 0, 1, 'right'], [1, 0, 1, 'left'], [-1, 80, -1, 'left'], [1, 80, -1, 'right']] as const).flatMap(([sx, y0, up, h]): Module[] => [
      [`base ${h} at ${8 * sx}, ${y0}`, [[8 * sx, y0], [8 * sx, y0 + 16 * up], [7 * sx, y0 + 16 * up]], 16],
      [`detach 1 ${h} at ${8 * sx}, ${y0 + 16 * up}`, [[8 * sx, y0 + 16 * up], [7 * sx, y0 + 16 * up], [4 * sx, y0 + 28 * up]], 12],
      [`track terminator at ${8 * sx}, ${y0 + 34 * up}`, [[8 * sx, y0 + 34 * up]], 12, 4]]),
    // (the kit's two middle sections in one: see the template)
    ['middle sections', [[-4, 28], [4, 28], [-4, 52], [4, 52], [-8, 34], [8, 34], [-8, 46], [8, 46]], 24, 16]],
};

describe('the kits\' parts are the library\'s modules', { timeout: 900000 }, () => {
  for (const [name, modules] of Object.entries(KITS)) it(`${name}: a part for each module, where the library has its ends; no stud cut`, async () => {
    const d = TEMPLATES[name], b = await build(d);
    const parts = b.pieces.filter((p) => /^track\d*$|-base\d*$/.test(p.name)).map((p) => ({ name: p.name, box: bed(p) }));
    expect(parts.length, JSON.stringify(parts.map((p) => p.name))).toBe(modules.length);
    // (each end on its part's edge, within 2 studs of it (a joint's reach, and a slanted end's corner); a part is a module's if all its ends are, and it's as long and as wide)
    const onEdge = (bx: number[], [x, y]: [number, number]) => x > bx[0] - 2 && x < bx[2] + 2 && y > bx[1] - 2 && y < bx[3] + 2
      && Math.min(Math.abs(x - bx[0]), Math.abs(x - bx[2]), Math.abs(y - bx[1]), Math.abs(y - bx[3])) < 2;
    const found = modules.map(([what, ends, long, wide]) => [what, parts.filter((p) => ends.every((e) => onEdge(p.box, e)) && Math.abs(p.box[3] - p.box[1] - long) < 2.2 && (wide === undefined || Math.abs(p.box[2] - p.box[0] - wide) < 2.2)).map((p) => p.name)] as const);
    const said = `${JSON.stringify(found)} of ${JSON.stringify(parts.map((p) => [p.name, p.box.map((v) => +v.toFixed(1))]))}`;
    for (const [what, names] of found) expect(names.length, `${what}: ${said}`).toBe(1);
    expect(new Set(found.map(([, n]) => n[0])).size, said).toBe(modules.length);
    expect(studsCut(d, b)).toEqual([]);
  });
  it('the three-way\'s two detach 2 sections meet along the straight\'s centre line', async () => {
    const b = await build(TEMPLATES['Three-way R104, base and detachable modules']);
    const far = b.pieces.filter((p) => /-base\d*$/.test(p.name) && bed(p)[1] > 26);
    expect(far.length).toBe(2);
    const [left, right] = far.sort((p, q) => bed(p)[0] - bed(q)[0]);
    // (from 29 to 38 studs along; past that the straight's end connector, whole, is the left one's)
    expect(bed(left, 29, 38)[2]).toBeCloseTo(0, 1);
    expect(bed(right, 29, 38)[0]).toBeCloseTo(0, 1);
  });
});

describe('the compact R40 base\'s lever is where the library\'s base has it', { timeout: 600000 }, () => {
  // (the library's: 7 studs from the track's centre line and 3.5 in from the toe end; here 3 in: the slider's whole-stud line)
  for (const [name, x] of [['Switch R40 left, compact base and standard section', -7], ['Switch R40 right, compact base and standard section', 7],
    ['Yard switch R40 left, compact base and rail yard section', 7], ['Yard switch R40 right, compact base and rail yard section', -7]] as const) it(name, async () => {
    const b = await build(TEMPLATES[name]), levers = b.pieces.filter((p) => /lever/.test(p.name)).map((p) => bed({ positions: p.positions.map((v, i) => (i % 3 === 2 ? 0 : v)) }));
    expect(levers.length).toBe(1);
    expect((levers[0][0] + levers[0][2]) / 2).toBeCloseTo(x, 0);
    expect(Math.abs((levers[0][1] + levers[0][3]) / 2 - 3.5)).toBeLessThanOrEqual(0.6);
  });
});

describe('the R104 switch\'s points and lever are where the library\'s base has them', { timeout: 600000 }, () => {
  // (the library's base: its lever's stand 4.5 studs from the toe end and 7 from the track's centre line; its
  // tongues, in its picture, from 3.1 to 3.5 studs in. Here the lever is 5 in: the slider lies between the
  // baseplate's studs, on a whole-stud line, and 4 would have the blades start under 3 in)
  for (const [name, levers] of [['Switch R104 left', [-7]], ['Switch R104 right', [7]], ['Switch R104 left, lever on the straight side', [7]], ['Switch R104 right, lever on the straight side', [-7]],
    ['Three-way R104', [-7, 7]], ['Switch R104 left, base and detachable modules', [-7]], ['Three-way R104, base and detachable modules', [-7, 7]]] as const) it(name, async () => {
    const b = await build(TEMPLATES[name]);
    const box = (p: { positions: Float32Array }) => bed({ positions: p.positions.map((v, i) => (i % 3 === 2 ? 0 : v)) });
    const blades = b.pieces.filter((p) => /points/.test(p.name) && !/throw|lever/.test(p.name)), found = b.pieces.filter((p) => /lever/.test(p.name)).map((p) => box(p));
    expect(blades.length).toBeGreaterThan(0);
    for (const p of blades) { expect(box(p)[1]).toBeGreaterThan(3.1); expect(box(p)[1]).toBeLessThan(3.6); }
    expect(found.length).toBe(levers.length);
    for (const x of levers) expect(found.some((bx) => Math.abs((bx[0] + bx[2]) / 2 - x) < 0.3 && Math.abs((bx[1] + bx[3]) / 2 - 4.5) <= 0.6), `a lever at ${x}, 4.5: ${JSON.stringify(found)}`).toBe(true);
  });
});
