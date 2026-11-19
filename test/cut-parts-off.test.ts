// Cut into print parts: No (Settings › Print bed and cutting into parts): no cut of any kind. Each track is one part
// with whatever its base touches; hand cuts and cut paths stay in the design and aren't made; moving parts are their
// own as ever; a part too big for the print bed is warned of by name and size, not cut and not an error.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache, uncutDesign } from '../src/app/build';
import { type Design, TEMPLATES } from '../src/app/design';

const long = (): Design => ({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', sleepers: 'sleepers' },
  routes: [{ name: 'Long', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }], cuts: [24] }] });
const tracks = (b: { pieces: { name: string }[] }) => b.pieces.filter((p) => /^track/.test(p.name)).map((p) => p.name);

describe('Cut into print parts: No', { timeout: 300000 }, () => {
  it('a 64-stud straight with a hand cut: several parts as ever, one whole track with the setting; the hand cut kept in the design', async () => {
    const w = await kernel();
    clearBuildCache();
    expect(tracks(buildDesign(w, long())).length).toBeGreaterThan(2);
    const d = long();
    d.options = { ...d.options, cutParts: 'no' };
    const b = buildDesign(w, d);
    expect(tracks(b)).toEqual(['track']);
    expect(d.routes[0].cuts).toEqual([24]);
    // (512 mm of track on a 256 mm bed: said, by name and size; built all the same)
    expect(b.info.warnings.filter((x) => /too big for the 256 x 256 print bed/.test(x))).toEqual([expect.stringMatching(/^track is 5\d\d x \d+ mm: too big for the 256 x 256 print bed, and it isn't cut \(Cut into print parts is No\)$/)]);
    clearBuildCache();
  });
  it('a bed it fits: no warning', async () => {
    const w = await kernel();
    clearBuildCache();
    const d = long();
    d.options = { ...d.options, cutParts: 'no', printBedX: 600, printBedY: 200 };
    const b = buildDesign(w, d);
    expect(tracks(b)).toEqual(['track']);
    expect(b.info.warnings.filter((x) => /too big/.test(x))).toEqual([]);
    clearBuildCache();
  });
  it('a set of 18 track parts is one; its points, throws and levers are parts of their own as before', async () => {
    const w = await kernel(), name = 'Perpendicular turnout R40, three tracks, left';
    clearBuildCache();
    const cut = buildDesign(w, structuredClone(TEMPLATES[name])), d = structuredClone(TEMPLATES[name]);
    d.options = { ...d.options, cutParts: 'no' };
    const whole = buildDesign(w, d), moving = (b: { pieces: { name: string }[] }) => b.pieces.filter((p) => !/^track/.test(p.name)).map((p) => p.name).sort();
    expect(tracks(cut).length).toBeGreaterThan(5);
    expect(tracks(whole)).toEqual(['track']);
    expect(moving(whole)).toEqual(moving(cut));
    clearBuildCache();
  });
  it('what is built then: no hand cuts, cut paths or tables, nothing bought, a bed nothing is too big for', () => {
    const d: Design = { ...long(), tables: [{ name: 'T', x: 0, y: 0, w: 32, h: 32 } as never], expert: { cutPaths: [{ id: 'p1', pts: [[-6, 20], [6, 20]] }] } as never };
    const u = uncutDesign(d);
    expect(u.routes[0].cuts).toBeUndefined();
    expect(u.expert?.cutPaths).toBeUndefined();
    expect(u.tables).toEqual([]);
    expect(u.options).toMatchObject({ splitTrack: 'bed', legoTrack: 'print', baseplate: 0, jointCuts: false });
    // (and the design given isn't touched)
    expect(d.routes[0].cuts).toEqual([24]);
    expect(d.expert?.cutPaths).toHaveLength(1);
  });
});
