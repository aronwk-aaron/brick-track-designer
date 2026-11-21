// (expert, stage 6) End connectors and labels as things of their own, the pure part (connectors.ts, labelitems.ts):
// kept as a file has them, where each is on the plan, their kinds, a joint moved, taken out and added (the app's joints
// kept where they are on the first change: D6), what the build is told, what a tap takes.
import { describe, expect, it } from 'vitest';
import { addJoint, carryCutJoints, connKind, squareProblem, squareWarnings, cleanCutJoints, cleanEndKind, connectorsOf, connPeg, deleteJoint, joinCutJoints, jointDefault, keepJoints, moveJoint, pegDefault, pegEnds, reverseCutJoints, setCutJoint, setEndKind, splitCutJoints, stretchFitsBed } from '../src/app/connectors';
import { cleanLabels, labelDistance, labelsOff, labelTextOf, moveLabel, nextLabelId } from '../src/app/labelitems';
import { type Design, type DRoute, readDesign } from '../src/app/design';
import { joints } from '../src/app/connections';
import { hitItems, itemLabel, picks } from '../src/app/items';
import { reversedRoute } from '../src/app/routeedits';
import { splitRoute } from '../src/app/splitmerge';

const straight = (name: string, x: number, y: number, studs: number, more: Partial<DRoute> = {}): DRoute => ({ name, x, y, heading: 0, segs: [{ kind: 'straight', studs }], ...more });
const design = (routes: DRoute[], options: Design['options'] = {}): Design => ({ version: 1, gaugeStuds: 4, options, routes });

describe('end connectors: kept and followed', () => {
  it('a file\'s: only the kinds there are, a cut\'s only on one of its cuts', () => {
    expect(cleanEndKind('nopeg')).toBe('nopeg'); expect(cleanEndKind('buffer')).toBe('buffer'); expect(cleanEndKind('bolt')).toBeUndefined(); expect(cleanEndKind('connector')).toBeUndefined();
    expect(cleanCutJoints([{ at: 8, kind: 'nopeg' }, { at: 9, kind: 'peg' }, { at: 8, kind: 'peg' }, { at: 16, kind: 'x' }], [8, 16])).toEqual([{ at: 8, kind: 'nopeg' }]);
    expect(cleanCutJoints([{ at: 8, kind: 'peg' }], undefined)).toBeUndefined();
    expect(cleanEndKind('square')).toBe('square'); expect(cleanCutJoints([{ at: 8, kind: 'square' }], [8])).toEqual([{ at: 8, kind: 'square' }]);
    const d = readDesign(design([straight("A", 0, 0, 32, { startEnd: "nopeg", endEnd: "wobble" as never, cuts: [16], cutJoints: [{ at: 16, kind: "peg" }, { at: 3, kind: "peg" }] })]));
    expect(d.routes[0].startEnd).toBe('nopeg'); expect(d.routes[0].endEnd).toBeUndefined(); expect(d.routes[0].cutJoints).toEqual([{ at: 16, kind: 'peg' }]);
  });
  it('turned end for end, split, joined: each with its cut; a cut moved takes its kind', () => {
    expect(reverseCutJoints([{ at: 8, kind: 'nopeg' }], 32)).toEqual([{ at: 24, kind: 'nopeg' }]);
    expect(splitCutJoints([{ at: 8, kind: 'nopeg' }, { at: 24, kind: 'peg' }], 16)).toEqual([[{ at: 8, kind: 'nopeg' }], [{ at: 8, kind: 'peg' }]]);
    expect(joinCutJoints([{ at: 8, kind: 'nopeg' }], [{ at: 4, kind: 'peg' }], 32)).toEqual([{ at: 8, kind: 'nopeg' }, { at: 36, kind: 'peg' }]);
    expect(carryCutJoints([{ at: 8, kind: 'nopeg' }], [8, 16], [10, 16])).toEqual([{ at: 10, kind: 'nopeg' }]);
    expect(carryCutJoints([{ at: 8, kind: 'nopeg' }], [8, 16], [16])).toBeUndefined();
    const r = reversedRoute(straight('A', 0, 0, 32, { startEnd: 'nopeg', cuts: [8], cutJoints: [{ at: 8, kind: 'nopeg' }] }));
    expect(r.endEnd).toBe('nopeg'); expect(r.startEnd).toBeUndefined(); expect(r.cutJoints).toEqual([{ at: 24, kind: 'nopeg' }]);
    const d = design([straight('A', 0, 0, 32, { cuts: [8, 24], cutJoints: [{ at: 8, kind: 'nopeg' }, { at: 24, kind: 'peg' }] })]);
    splitRoute(d, 0, 16, 'B');
    expect(d.routes[0].cutJoints).toEqual([{ at: 8, kind: 'nopeg' }]); expect(d.routes[1].cutJoints).toEqual([{ at: 8, kind: 'peg' }]);
  });
  it('the default: with the peg and clip off ballast, without on it (unless Peg and clip on ballast ends)', () => {
    expect(pegDefault({})).toBe(true); expect(pegDefault({ ballast: 'buddy' })).toBe(false); expect(pegDefault({ ballast: 'buddy', pegOnBallast: true })).toBe(true);
    expect(jointDefault({ ballast: 'ballast' })).toBe('nopeg');
  });
});

describe('end connectors on the plan', () => {
  it('each track end, one where two tracks\' ends meet, none on another\'s side; each hand cut; the app\'s joints where no hand cut is', () => {
    const d = design([straight('A', 0, 0, 32, { cuts: [16] }), straight('B', 0, 32, 16)]), js = joints(d);
    const cs = connectorsOf(d, js, [[16, 20], []]);
    expect(cs.map((c) => (c.end ? `${c.route}:${c.end}${c.joined !== undefined ? `+${c.joined}` : ''}` : `${c.route}@${c.at}${c.auto ? 'a' : ''}`))).toEqual(['0:start', '0:end+1', '0@16', '0@20a', '1:end']);
    expect(cs.find((c) => c.at === 20)).toMatchObject({ x: 0, y: 20 });
  });
  it('set: a joined end with the end it meets; a buffer stop only on an end joined to nothing; the build told where', () => {
    const d = design([straight('A', 0, 0, 32), straight('B', 0, 32, 16)]), js = joints(d);
    expect(setEndKind(d, js, 0, 'end', 'nopeg')).toBeUndefined();
    expect(d.routes[0].endEnd).toBe('nopeg'); expect(d.routes[1].startEnd).toBe('nopeg');
    expect(setEndKind(d, js, 0, 'end', 'buffer')).toMatch(/joined to nothing/);
    expect(setEndKind(d, js, 1, 'end', 'buffer')).toBeUndefined();
    expect(pegEnds(d).map((p) => [p.at.map((v) => Math.round(v)), p.peg])).toEqual([[[0, 256], false], [[0, 256], false]]);
    expect(connPeg(d, { route: 0, end: 'start', x: 0, y: 0, heading: 0 })).toBe(true);
    expect(connPeg(d, { route: 0, end: 'end', x: 0, y: 0, heading: 0 })).toBe(false);
    setEndKind(d, js, 0, 'end', 'connector');
    expect(d.routes[0].endEnd).toBeUndefined(); expect(d.routes[1].startEnd).toBeUndefined();
  });
  it('square rail ends: the build told so; not with guard rails, a third rail or a bank (said)', () => {
    const d = design([straight('A', 0, 0, 32, { cuts: [16], cutJoints: [{ at: 16, kind: 'square' }] }), straight('B', 0, 32, 16)]), js = joints(d);
    expect(pegEnds(d)).toEqual([{ at: [0, 128], peg: false, square: true }]);
    expect(connKind(d, { route: 0, at: 16 })).toBe('square'); expect(connKind(d, { route: 0, end: 'start' })).toBe('peg');
    expect(setEndKind(d, js, 0, 'end', 'square')).toBeUndefined(); expect(d.routes[1].startEnd).toBe('square');
    expect(squareProblem(straight('G', 0, 0, 8, { guardRails: true }))).toMatch(/guard rails/);
    // (tilted: a banked curve, and a straight its bank ramps up on; the build keeps tongues there, the same test says so)
    const ramp = design([{ name: 'R', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }, { kind: 'curve', radius: 40, angle: 45, bank: 5 }], cuts: [40], cutJoints: [{ at: 40, kind: 'square' }] }], { bankRampAt: 'straight' });
    expect(squareWarnings(ramp, joints(ramp))).toEqual(['Joint 40 studs along R: square rail ends not on a banked track or its bank ramps (tilted rail ends keep their tongues): built with rail tongues only there']);
    expect(pegEnds(ramp)).toEqual([{ at: [0, 320], peg: false }]);
    const g = design([straight('A', 0, 0, 16, { guardRails: true }), straight('B', 0, 16, 16)]);
    expect(setEndKind(g, joints(g), 1, 'start', 'square')).toMatch(/Square rail ends not on a track with guard rails/);
    // (asked for in a file where they can't be: said, by joint and why, built with tongues there; none said where they can)
    const bad = design([straight('G', 0, 0, 32, { guardRails: true, cuts: [16], cutJoints: [{ at: 16, kind: 'square' }] }), straight('H', 0, 32, 16, { startEnd: 'square' })]);
    expect(squareWarnings(bad, joints(bad))).toEqual([
      'Joint 16 studs along G: square rail ends not on a track with guard rails (their ends have tongues): built with rail tongues only there',
      'Start of H: square rail ends not on a track with guard rails (their ends have tongues): built with rail tongues only there']);
    const apart = design([straight('A', 0, 0, 32, { cuts: [16], cutJoints: [{ at: 16, kind: 'square' }] })], { ballast: 'ballast', trackBallast: 'apart' });
    expect(squareWarnings(apart, joints(apart))[0]).toMatch(/^Joint 16 studs along A: square rail ends not with Track and ballast printed Apart/);
    expect(squareWarnings(d, js)).toEqual([]);
  });
  it('a hand cut\'s kind: the build told where it is, only while the cut is there', () => {
    const r = straight('A', 0, 0, 32, { cuts: [16] }), d = design([r]);
    setCutJoint(r, 16, 'nopeg');
    expect(pegEnds(d)).toEqual([{ at: [0, 128], peg: false }]);
    setCutJoint(r, 16, 'auto'); expect(r.cutJoints).toBeUndefined();
  });
});

describe('a joint along a track, edited', () => {
  it('the first change keeps the app\'s joints where they are, as hand cuts, Only these (D6)', () => {
    const r = straight('A', 0, 0, 48); keepJoints(r, [16, 32, 0.5]);
    expect(r.cuts).toEqual([16, 32]); expect(r.cutsLocked).toBe(true);
  });
  it('moved by whole studs, its kind with it; not within 2 studs of an end or another joint', () => {
    const r = straight('A', 0, 0, 48, { cuts: [16], cutJoints: [{ at: 16, kind: 'nopeg' }] });
    expect(moveJoint(r, 16, 19.4, [16, 32])).toBeUndefined();
    expect(r.cuts).toEqual([19, 32]); expect(r.cutJoints).toEqual([{ at: 19, kind: 'nopeg' }]);
    expect(moveJoint(r, 19, 31, [])).toMatch(/Too near the cut at 32/);
    expect(moveJoint(r, 19, 47, [])).toMatch(/at least 2 studs in/);
  });
  it('taken out where the part left fits the bed; refused, said, where it wouldn\'t', () => {
    const r = straight('A', 0, 0, 48);
    expect(deleteJoint(r, 16, [16, 32], [256, 256], 4)).toBeUndefined();
    expect(r.cuts).toEqual([32]); expect(r.cutsLocked).toBe(true);
    const long = straight('B', 0, 0, 64, { cuts: [32], cutsLocked: true });
    expect(deleteJoint(long, 32, [], [256, 256], 4)).toMatch(/too long for the 256 x 256 print bed/);
    expect(long.cuts).toEqual([32]);
    expect(stretchFitsBed(straight('C', 0, 0, 36), 0, 36, [256, 256], 4)).toBe(true);
    // (on the slant: 36 studs, 8 wide, fit across the bed's diagonal; 46 don't)
    expect(stretchFitsBed(straight('C', 0, 0, 46), 0, 46, [256, 256], 4)).toBe(false);
  });
  it('added on a whole stud, the app\'s others kept', () => {
    const r = straight('A', 0, 0, 48);
    expect(addJoint(r, 7.6, [24])).toBeUndefined();
    expect(r.cuts).toEqual([8, 24]); expect(r.cutsLocked).toBe(true);
    expect(addJoint(r, 9, [])).toMatch(/Too near/);
  });
});

describe('labels placed by hand', () => {
  it('kept: well-formed, an id each, text in capitals and short, size in range; taken off: no text', () => {
    expect(cleanLabels([{ at: [1, 2], heading: 270, text: 'yard  one', cap: 9 }, { id: 'x', at: [0, 0], heading: 0, off: true, text: 'A' }, { at: ['a', 0] }]))
      .toEqual([{ id: 'l1', at: [1, 2], heading: -90, text: 'YARD ONE', cap: 6 }, { id: 'x', at: [0, 0], heading: 0, off: true }]);
    expect(labelTextOf('a'.repeat(40))).toHaveLength(24);
    expect(nextLabelId([{ id: 'l2' }])).toBe('l3');
    expect(moveLabel({ id: 'l1', at: [1, 1], heading: 0 }, 0.5, -1).at).toEqual([1.5, 0]);
  });
  it('only on a flat underside: said why not', () => {
    expect(labelsOff({})).toMatch(/flat underside/);
    expect(labelsOff({ ballast: 'ballast', bottomStyle: 'float' })).toBeUndefined();
  });
  it('tapped on its text, along the way it runs', () => {
    const l = { at: [0, 0] as [number, number], heading: 0 };
    expect(labelDistance(l, 'ABCDEFGHIJ', 4, [0, 1.5])).toBe(0);
    expect(labelDistance(l, 'ABCDEFGHIJ', 4, [2, 0])).toBeGreaterThan(1);
  });
});

describe('what a tap takes', () => {
  it('Connectors and Labels each their own chip; Everything takes neither', () => {
    expect(picks('conn', 'conn', true)).toBe(true); expect(picks('all', 'conn', true)).toBe(false); expect(picks('all', 'label', true)).toBe(false); expect(picks('conn', 'track', true)).toBe(false);
    const d = design([straight('A', 0, 0, 32, { cuts: [16] })]), conns = connectorsOf(d, joints(d), [[]]);
    const h = hitItems(d, [0.3, 16.2], { near: 1, point: 1, kinds: ['conn'], conns });
    expect(h[0].item).toEqual({ kind: 'conn', route: 0, at: 16 });
    expect(itemLabel(d, h[0].item)).toBe('Joint 16 studs along A');
    const lh = hitItems(d, [0, 8], { near: 1, point: 1, kinds: ['label'], labels: [{ item: { kind: 'label', part: 'track1' }, at: [0, 8], heading: 0, text: 'S16 #1', cap: 4 }] });
    expect(lh[0].item).toEqual({ kind: 'label', part: 'track1' });
    expect(itemLabel(d, lh[0].item)).toBe('Label under track1 (the app\'s)');
  });
});
