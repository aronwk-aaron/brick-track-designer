// Hand cuts across a track (expert mode), built: where the pieces come out, what's refused and said, that a design
// with its hand cuts taken out again builds exactly what it did, and that moving one cut leaves the far pieces alone.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, type DRoute, TEMPLATES, toRoutes } from '../src/app/design';
import { designCuts, handCutsFor, jointsOn } from '../src/app/handcuts';
import { planSections } from '../src/app/sections';

const straight = (studs: number, more: Partial<DRoute> = {}, options: Design['options'] = { legoTrack: 'print', splitTrack: 'lengths' }): Design =>
  ({ version: 1, gaugeStuds: 4, options, routes: [{ name: 'T1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }], ...more }] });
/** each piece's reach along the track (y, studs): its bed's (under the rails), its far end's snap peg (under a stud past it) taken off */
const spans = (b: ReturnType<typeof buildDesign>) => b.pieces.map((p) => {
  let lo = Infinity, hi = -Infinity;
  // (the bed: what's under the rails' height, z under 3 mm)
  for (let i = 0; i < p.positions.length; i += 3) if (p.positions[i + 2] < 3) { lo = Math.min(lo, p.positions[i + 1]); hi = Math.max(hi, p.positions[i + 1]); }
  return [Math.round(lo / 8) + 0, Math.floor(hi / 8 - 0.5)];
});
const bytes = (b: ReturnType<typeof buildDesign>) => b.pieces.map((p) => [p.name, Buffer.from(p.stl).toString('base64')]);

describe('hand cuts: the plan', () => {
  it('a hand cut is a joint there exactly; the app\'s own within two studs of one are left out', () => {
    const d = straight(48, { cuts: [10, 30] }), dc = designCuts(d)!, rts = toRoutes(d);
    const { hand, lost } = handCutsFor(dc, rts);
    expect(hand).toEqual([{ cuts: [80, 240], only: false }]);
    expect(lost).toEqual([]);
    const plan = planSections(rts, [], 32, 252, 40, 128, undefined, undefined, [], 0, undefined, undefined, undefined, hand);
    // (16 kept, 6 studs from the cut at 10; 32 left out, 2 from the one at 30)
    expect(plan.pieces).toEqual([[0, 0, 80], [0, 80, 128], [0, 128, 240], [0, 240, 384]]);
    expect(plan.blocked).toEqual([]);
  });
  it('cut by hand only: its hand cuts and no others; with none, one piece', () => {
    const d = straight(48, { cuts: [10, 30], cutsLocked: true }), rts = toRoutes(d);
    const plan = (dd: Design) => planSections(rts, [], 32, 252, 40, 128, undefined, undefined, [], 0, undefined, undefined, undefined, handCutsFor(designCuts(dd)!, rts).hand).pieces;
    expect(plan(d)).toEqual([[0, 0, 80], [0, 80, 240], [0, 240, 384]]);
    expect(plan(straight(48, { cutsLocked: true }))).toEqual([[0, 0, 384]]);
  });
  it('no hand cuts: nothing for the build to take (it builds as it always did)', () => {
    expect(designCuts(straight(48))).toBeUndefined();
    expect(designCuts(straight(48, { system: 'monorail', cuts: [10] }))).toBeUndefined();
    // (a cut past the track's end isn't the build's)
    expect(designCuts(straight(20, { cuts: [8, 40] }))!.cuts).toEqual([{ name: 'T1', at: [0, 64] }]);
  });
  it('a route the build has turned end for end still has its cuts where they are on the ground', () => {
    const d = straight(48, { cuts: [10] }), [rt] = toRoutes(d);
    const turned = { ...rt, start: [0, 384, 180] as [number, number, number] };
    expect(handCutsFor(designCuts(d)!, [turned]).hand).toEqual([{ cuts: [304], only: false }]);
  });
});

describe('hand cuts: the parts', { timeout: 300000 }, () => {
  it('a straight cut at 10 and 30, by hand only: three parts, 10, 20 and 18 studs', async () => {
    const b = buildDesign(await kernel(), structuredClone(TEMPLATES['Straight cut into parts by hand']));
    expect(b.info.warnings).toEqual([]);
    expect(b.pieces.map((p) => p.name)).toEqual(['track1', 'track2', 'track3']);
    expect(spans(b)).toEqual([[0, 10], [10, 30], [30, 48]]);
    expect(b.overlay.joints).toEqual([[0, 80], [0, 240]]);
  });
  it('Keep the cuts it has now: the app\'s own joints as hand cuts, and only these, are the very same parts (on a curve too)', async () => {
    const w = await kernel(), d = structuredClone(TEMPLATES['Curve and straights cut into parts by hand']);
    const a = buildDesign(w, structuredClone(d));
    const cuts = jointsOn(d, 0, a.overlay.joints!);
    expect(cuts).toEqual([16, 24, 32, 48, 56, 64]);
    d.routes[0].cuts = cuts; d.routes[0].cutsLocked = true;
    const b = buildDesign(w, d);
    expect(b.info.warnings).toEqual([]);
    expect(bytes(b)).toEqual(bytes(a));
  });
  it('taken out again, the design builds exactly what it did before it had any', async () => {
    const w = await kernel();
    clearBuildCache();
    const before = bytes(buildDesign(w, straight(48)));
    const cut = bytes(buildDesign(w, straight(48, { cuts: [10, 30] })));
    expect(cut).not.toEqual(before);
    // (from nothing, and with the cut build's pieces still in the cache)
    expect(bytes(buildDesign(w, straight(48)))).toEqual(before);
    clearBuildCache();
    expect(bytes(buildDesign(w, straight(48)))).toEqual(before);
    // (and the same cuts twice: the same parts)
    expect(bytes(buildDesign(w, straight(48, { cuts: [10, 30] })))).toEqual(cut);
  });
  it('one cut moved: the parts it isn\'t an end of are the very same', async () => {
    const w = await kernel();
    const a = bytes(buildDesign(w, straight(64, { cuts: [10, 40], cutsLocked: true })));
    const b = bytes(buildDesign(w, straight(64, { cuts: [10, 44], cutsLocked: true })));
    expect(b[0]).toEqual(a[0]);
    expect(b[1]).not.toEqual(a[1]);
  });
  it('a cut in points, or where the track is one part with the track beside it, isn\'t made, and that\'s said with where', async () => {
    const d = structuredClone(TEMPLATES['Switch R40 left']);
    d.options = { ...d.options, splitTrack: 'lengths' };
    const plain = buildDesign(await kernel(), structuredClone(d));
    d.routes[0].cuts = [4, 12, 26];
    const b = buildDesign(await kernel(), d);
    expect(b.info.warnings.filter((x) => /hand cut/.test(x))).toEqual([
      "the hand cut at 0, 4 (studs) isn't made: it is in points or a crossing (cut before or after them)",
      "the hand cut at 0, 12 (studs) isn't made: the track is one part with the track beside it there",
    ]);
    // (each ringed on the plan where it is)
    expect(b.overlay.issues.some((q) => q.at[0] === 0 && q.at[1] === 32 && /hand cut/.test(q.text))).toBe(true);
    // (the one past the points made: one track part more)
    expect(b.pieces.filter((p) => /^track/.test(p.name)).length).toBe(plain.pieces.filter((p) => /^track/.test(p.name)).length + 1);
  });
  it('by hand only, a part too long for the bed is still cut to fit, and that\'s said', async () => {
    const b = buildDesign(await kernel(), straight(48, { cutsLocked: true }));
    expect(b.info.warnings).toEqual(["a part of a track cut by hand only doesn't fit the 256 x 256 print bed at 0, 24 (studs): it's cut again to fit (add a cut there)"]);
    expect(b.pieces.length).toBe(2);
  });
  it('with Long track cut into: Parts that fill the bed, hand cuts aren\'t made, and that\'s said', async () => {
    const b = buildDesign(await kernel(), straight(24, { cuts: [10] }, { legoTrack: 'print', splitTrack: 'bed' }));
    expect(b.info.warnings).toEqual(['the hand cuts across tracks are made only with Long track cut into: Track pieces']);
    expect(b.pieces.length).toBe(1);
  });
});
