// Cut paths (expert mode), built: the R104 switch cut as the modular kit's is (its base, detach 1, detach 2 and the
// track terminator: each part where the parts library has that module's ends), that no stud is cut, that the design
// with its paths taken out builds exactly what it did, that a path moved leaves the parts it doesn't touch alone, and
// what's refused, with why and where.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, TEMPLATES } from '../src/app/design';
import type { CutPath } from '../src/app/cutpaths';
import { assembledSuite } from './assembled.shared';
import { templatesBuild } from './templates.shared';
import { studCount, studsCut } from './cutpaths.shared';

const NAMES = ['Switch R104 left, base and detachable modules', 'Switch R104 right, base and detachable modules'];
describe('templates: the R104 switch as its modules', { timeout: 900000 }, () => templatesBuild(['TrixBrix trackwork'], ['Switch R104 left, base and detachable modules', 'Switch R104 right, base and detachable modules']));
describe('templates go together: the R104 switch as its modules', { timeout: 900000 }, () => assembledSuite(['TrixBrix trackwork'], NAMES));

const APP = (globalThis as unknown as { APP_DEFAULTS: typeof OPTION_DEFAULTS }).APP_DEFAULTS;
/** built as the app builds it (its defaults: sleepers, track pieces) */
const build = async (d: Design) => {
  const saved = { ...OPTION_DEFAULTS };
  Object.assign(OPTION_DEFAULTS, APP);
  try { return buildDesign(await kernel(), structuredClone(d)); } finally { Object.assign(OPTION_DEFAULTS, saved); }
};
const sw = (paths?: CutPath[]): Design => { const d = structuredClone(TEMPLATES[NAMES[0]]); if (paths) d.expert = { cutPaths: paths }; else delete d.expert; return d; };
const bases = (b: Awaited<ReturnType<typeof build>>) => b.pieces.filter((p) => /-base/.test(p.name));
/** a part's file, as a hash of its bytes (a difference said in a line, not in a megabyte) */
const hash = (p: { stl: Uint8Array }) => createHash('sha1').update(p.stl).digest('hex').slice(0, 16);
const bytes = (b: Awaited<ReturnType<typeof build>>) => b.pieces.map((p) => [p.name, p.stl.length, hash(p)]);
/** a part's bed, studs: [x0, y0, x1, y1] of what's under the rails' height */
const bed = (p: { positions: Float32Array }, y0 = -Infinity, y1 = Infinity) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (let i = 0; i < p.positions.length; i += 3) if (p.positions[i + 2] < 3 && p.positions[i + 1] / 8 >= y0 && p.positions[i + 1] / 8 <= y1) { b[0] = Math.min(b[0], p.positions[i] / 8); b[1] = Math.min(b[1], p.positions[i + 1] / 8); b[2] = Math.max(b[2], p.positions[i] / 8); b[3] = Math.max(b[3], p.positions[i + 1] / 8); } return b; };

describe('cut paths: the R104 switch as the modular kit cuts it', { timeout: 600000 }, () => {
  /**
   * The kit's modules of the left switch, each with its ends in the parts library (studs, from the switch's toe, the
   * straight up the plan; the library's own are from each part's middle, y down), and how long it is along the straight.
   */
  const MODULES: [string, [number, number][], number][] = [
    ['base', [[0, 0], [0, 16], [-1, 16]], 16],
    ['detach 1', [[0, 16], [-1, 16], [-4, 28]], 12],
    // (its side joint, at 0, 34, is the terminator's one end: checked below, where the two meet along the centre line)
    // (12 along the straight, and 2.4 more at the branch's outer edge: the cut at 28 there square to the branch)
    ['detach 2', [[-4, 28], [-8, 40]], 14.4],
    ['track terminator', [[0, 34]], 12],
  ];
  it('four parts, each where the library has that module\'s ends, none over the bed, no stud cut', async () => {
    const d = sw(TEMPLATES[NAMES[0]].expert!.cutPaths), b = await build(d);
    expect(b.info.warnings).toEqual([]);
    const parts = bases(b).map((p) => ({ name: p.name, box: bed(p), p }));
    expect(parts.length).toBe(4);
    // (each end on its part's edge, within 2 studs of it (a joint's reach, and a slanted end's corner); a part is a module's if all its ends are)
    const onEdge = (bx: number[], [x, y]: [number, number]) => x > bx[0] - 2 && x < bx[2] + 2 && y > bx[1] - 2 && y < bx[3] + 2
      && Math.min(Math.abs(x - bx[0]), Math.abs(x - bx[2]), Math.abs(y - bx[1]), Math.abs(y - bx[3])) < 2;
    const found = MODULES.map(([what, ends, long]) => [what, parts.filter((p) => ends.every((e) => onEdge(p.box, e)) && Math.abs(p.box[3] - p.box[1] - long) < 2.2).map((p) => p.name)]);
    // (the terminator's one end is on detach 2's edge too: it's the part that isn't detach 2)
    const d2 = (found[2][1] as string[])[0];
    found[3][1] = (found[3][1] as string[]).filter((n) => n !== d2);
    for (const [what, names] of found) expect(names.length, `${what}: ${JSON.stringify(found)} of ${JSON.stringify(parts.map((p) => [p.name, p.box.map((v) => +v.toFixed(1))]))}`).toBe(1);
    expect(new Set(found.map(([, n]) => (n as string[])[0])).size).toBe(4);
    // (the terminator: the far half of the straight, from its centre line out)
    const term = parts.find((p) => p.name === (found[3][1] as string[])[0])!;
    expect(term.box[0]).toBeCloseTo(0, 1); expect(term.box[2]).toBeCloseTo(4, 1);
    // (and detach 2 up to the centre line beside it, from 29 to 38 studs along; past that the track's end connector, whole, is its)
    expect(bed(parts.find((p) => p.name === d2)!.p, 29, 38)[2]).toBeCloseTo(0, 1);
    expect(studsCut(d, b)).toEqual([]);
  });
  it('the studs are all there, whole: as many with the paths as without', async () => {
    const cut = await build(sw(TEMPLATES[NAMES[0]].expert!.cutPaths)), plain = await build(sw());
    expect(studCount(plain)).toBeGreaterThan(60);
    expect(studCount(cut)).toBe(studCount(plain));
  });
  it('its paths taken out again, the design builds exactly what it did before it had any', async () => {
    clearBuildCache();
    const before = bytes(await build(sw()));
    const cut = bytes(await build(sw(TEMPLATES[NAMES[0]].expert!.cutPaths)));
    expect(cut).not.toEqual(before);
    expect(bytes(await build(sw()))).toEqual(before);
    clearBuildCache();
    expect(bytes(await build(sw()))).toEqual(before);
    // (and the same paths twice: the same parts)
    expect(bytes(await build(sw(TEMPLATES[NAMES[0]].expert!.cutPaths)))).toEqual(cut);
    // (an empty list is none)
    expect(bytes(await build({ ...sw(), expert: { cutPaths: [] } }))).toEqual(before);
  });
  it('one path moved: the parts it doesn\'t touch are the very same', async () => {
    const ps = TEMPLATES[NAMES[0]].expert!.cutPaths!;
    const a = bases(await build(sw(ps))), b = bases(await build(sw([{ ...ps[0], pts: [[-10, 18], [6, 18]] }, ps[1], ps[2]])));
    const stl = hash, far = (p: { positions: Float32Array }) => bed(p)[1] > 26;
    // (detach 2 and the terminator, past 28: untouched by the cut moved from 16 to 18)
    expect(a.filter(far).length).toBe(2);
    expect(b.filter(far).map(stl).sort()).toEqual(a.filter(far).map(stl).sort());
    expect(b.filter((p) => !far(p)).map(stl).sort()).not.toEqual(a.filter((p) => !far(p)).map(stl).sort());
  });
  it('a path of its own joint (straight cuts, where the design has rail tongues): the parts either side of it differ, the others don\'t', async () => {
    const ps = TEMPLATES[NAMES[0]].expert!.cutPaths!;
    const a = bases(await build(sw(ps))), b = bases(await build(sw([ps[0], { ...ps[1], joint: 'butt' }, ps[2]])));
    // (the base, below 16: not touched by the cut at 28)
    const stl = hash, far = (p: { positions: Float32Array }) => bed(p)[3] < 17;
    expect(a.filter(far).length).toBe(1);
    expect(b.filter(far).map(stl)).toEqual(a.filter(far).map(stl));
    expect(b.filter((p) => !far(p)).map(stl).sort()).not.toEqual(a.filter((p) => !far(p)).map(stl).sort());
  });
  it('a dog-legged path (across, a step along between the rails, across again): two parts, no stud cut or lost', async () => {
    const d = sw([{ id: 'c1', pts: [[-10, 18], [-1, 18], [-1, 16], [6, 16]] }]), b = await build(d);
    expect(b.info.warnings).toEqual([]);
    expect(bases(b).length).toBe(2);
    expect(studsCut(d, b)).toEqual([]);
    expect(studCount(b)).toBe(studCount(await build(sw())));
  });
  it('refused, with why and where: through the blades, through a frog, ending inside a part, cutting nothing', async () => {
    const said = async (pts: [number, number][]) => { const b = await build(sw([{ id: 'c1', pts }])); return { w: b.info.warnings.filter((x) => /cut path/.test(x)), b }; };
    const plain = bases(await build(sw())).length;
    const blade = await said([[-10, 6], [6, 6]]);
    expect(blade.w).toEqual(["the cut path at -3, 6 (studs) isn't made: a blade moves here: cut before the toe or past the heel"]);
    expect(bases(blade.b).length).toBe(plain);
    expect(blade.b.overlay.pathsNot).toEqual([{ id: 'c1', why: 'A blade moves here: cut before the toe or past the heel' }]);
    // (ringed on the plan where it is)
    expect(blade.b.overlay.issues.some((q) => /cut path/.test(q.text))).toBe(true);
    expect((await said([[-12, 32], [6, 32]])).w[0]).toMatch(/isn't made: through a frog \(where two rails cross\): keep the cut 2 studs clear of it/);
    expect((await said([[-10, 16], [0, 16]])).w).toEqual(["the cut path at 0, 16 (studs) isn't made: it ends inside a part (carry it on to the edge of the part, or to another cut)"]);
    expect((await said([[20, 0], [20, 30]])).w).toEqual(["the cut path at 20, 0 (studs) isn't made: it cuts no printed track (draw it across a part, from edge to edge)"]);
    expect((await said([[2.5, 14], [2.5, 30]])).w[0]).toMatch(/isn't made: runs down a rail/);
  });
  it('with Long track cut into: Parts that fill the bed, cut paths aren\'t made, and that\'s said', async () => {
    const d = sw(TEMPLATES[NAMES[0]].expert!.cutPaths); d.options = { ...d.options, splitTrack: 'bed' };
    expect((await build(d)).info.warnings).toContain('the cut paths are made only with Long track cut into: Track pieces');
  });
});
