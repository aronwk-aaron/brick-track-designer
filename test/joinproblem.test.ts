import { describe, expect, it } from 'vitest';
import type { Design, DRoute } from '../src/app/design';
import { dualEndMismatches, gaugeMeet, gaugeMeetPose, joinProblem, narrowOf, reseatOnDual } from '../src/app/routeedits';

const r = (name: string, extra: Partial<DRoute> = {}): DRoute => ({ name, x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }], ...extra });
const d = (routes: DRoute[]): Design => ({ version: 1, gaugeStuds: 4, routes });

describe('which routes can be made one track', () => {
  it('plain routes can', () => {
    expect(joinProblem(d([r('A'), r('B')]), r('A'), r('B'))).toBeUndefined();
  });
  it("monorail and train track can't", () => {
    expect(joinProblem(d([]), r('A'), r('B', { system: 'monorail' }))).toMatch(/monorail/);
  });
  it("different gauges can't", () => {
    expect(joinProblem(d([]), r('A'), r('B', { gaugeStuds: 6 }))).toMatch(/gauge/);
    expect(joinProblem(d([]), r('A', { gaugeStuds: 4 }), r('B'))).toBeUndefined();
  });
  it("guard rails on one only (or set differently) can't", () => {
    expect(joinProblem(d([]), r('A', { guardRails: true }), r('B'))).toMatch(/guard rails/);
    expect(joinProblem(d([]), r('A', { guardRails: true }), r('B', { guardRails: true }))).toBeUndefined();
    expect(joinProblem(d([]), r('A', { guardRails: true }), r('B', { guardRails: true, guardRailTaperStuds: 4 }))).toMatch(/guard rails/);
  });
  it("a third rail on one only (or a different one) can't", () => {
    expect(joinProblem(d([]), r('A'), r('B', { dualGauge: true }))).toMatch(/third rail/);
    expect(joinProblem(d([]), r('A', { dualGauge: true, dualShared: 'left' }), r('B', { dualGauge: true }))).toMatch(/third rail/);
    expect(joinProblem(d([]), r('A', { dualGauge: true }), r('B', { dualGauge: true }))).toBeUndefined();
  });
  it('monorail heights must match', () => {
    expect(joinProblem(d([]), r('A', { system: 'monorail', monoHeight: 3 }), r('B', { system: 'monorail' }))).toMatch(/heights/);
    expect(joinProblem(d([]), r('A', { system: 'monorail', monoHeight: 3 }), r('B', { system: 'monorail', monoHeight: 3 }))).toBeUndefined();
  });
});

import { joinedEnds } from '../src/app/routeedits';
describe('the ends a setting names, after a join', () => {
  it('keeps the start and takes the other route\'s far end', () => {
    // b's start meets a's end: b's end is the far one
    expect(joinedEnds('end', 'end', 'start')).toBe('end');
    expect(joinedEnds('start', 'end', 'start')).toBe('both');
    expect(joinedEnds('both', 'start', 'start')).toBe('start');
    expect(joinedEnds('end', undefined, 'start')).toBe('none');
    // b's end meets a's end: b's start is the far one
    expect(joinedEnds('start', 'start', 'end')).toBe('both');
    expect(joinedEnds(undefined, 'end', 'end')).toBe('none');
  });
  it('says nothing when neither said anything', () => {
    expect(joinedEnds(undefined, undefined, 'start')).toBeUndefined();
  });
});

// Dual-gauge track and one of its two gauges carrying on from its end: never one route, but their ends meet: the
// standard gauge's on the middle, the narrow gauge's where the dual-gauge track's narrow gauge lies.
describe('dual-gauge track meeting one of its gauges', () => {
  const dual = (extra: Partial<DRoute> = {}) => r('Dual', { dualGauge: true, ...extra });
  it('the narrow gauge lies a stud to the shared rail\'s side (4 and 2 studs), or on the middle centred', () => {
    expect(narrowOf(d([]), dual())).toEqual({ gaugeStuds: 2, off: 1 });
    expect(narrowOf(d([]), dual({ dualShared: 'left' }))).toEqual({ gaugeStuds: 2, off: -1 });
    expect(narrowOf(d([]), dual({ dualShared: 'centre' }))).toEqual({ gaugeStuds: 2, off: 0 });
    expect(narrowOf(d([]), dual({ dualGaugeStuds: 3 }))).toEqual({ gaugeStuds: 3, off: 0.5 });
    // (not built: no narrower than the track; centred, not two studs narrower; no dual gauge)
    expect(narrowOf(d([]), dual({ dualGaugeStuds: 4 }))).toBeUndefined();
    expect(narrowOf(d([]), dual({ dualGaugeStuds: 3, dualShared: 'centre' }))).toBeUndefined();
    expect(narrowOf(d([]), r('A'))).toBeUndefined();
  });
  it('they still can\'t be one track, but they meet: its standard gauge, and its narrow gauge', () => {
    expect(joinProblem(d([]), dual(), r('S'))).toMatch(/third rail/);
    expect(gaugeMeet(d([]), dual(), r('S'))).toEqual({ dual: 'a', off: 0 });
    expect(gaugeMeet(d([]), r('N', { gaugeStuds: 2 }), dual())).toEqual({ dual: 'b', off: 1 });
    expect(gaugeMeet(d([]), dual({ dualShared: 'left' }), r('N', { gaugeStuds: 2 }))).toEqual({ dual: 'a', off: -1 });
    expect(gaugeMeet(d([]), dual({ dualShared: 'centre' }), r('N', { gaugeStuds: 2 }))).toEqual({ dual: 'a', off: 0 });
  });
  it('not another gauge, two dual-gauge tracks, two plain ones, a monorail, or a narrow gauge that isn\'t built', () => {
    expect(gaugeMeet(d([]), dual(), r('N', { gaugeStuds: 3 }))).toBeUndefined();
    expect(gaugeMeet(d([]), dual(), dual({ dualShared: 'left' }))).toBeUndefined();
    expect(gaugeMeet(d([]), r('A'), r('N', { gaugeStuds: 2 }))).toBeUndefined();
    expect(gaugeMeet(d([]), dual(), r('M', { system: 'monorail' }))).toBeUndefined();
    expect(gaugeMeet(d([]), dual({ dualGaugeStuds: 4 }), r('S'))).toBeUndefined();
  });
  it('where the other\'s end goes: the standard gauge onto the end, the narrow gauge a stud to the shared rail\'s side, heading into it', () => {
    const D = dual(), N = r('N', { gaugeStuds: 2 }), S = r('S'), dd = d([D, N, S]);
    // (the dual-gauge track runs up from 0, 0 to 0, 16: right of it is +x)
    expect(gaugeMeetPose(dd, D, 'end', S, 'end')).toEqual({ x: 0, y: 16, heading: -180 });
    expect(gaugeMeetPose(dd, D, 'end', N, 'end')).toEqual({ x: 1, y: 16, heading: -180 });
    expect(gaugeMeetPose(dd, D, 'start', N, 'start')).toEqual({ x: 1, y: 0, heading: 0 });
    expect(gaugeMeetPose(dd, { ...D, dualShared: 'left' }, 'end', N, 'end')).toEqual({ x: -1, y: 16, heading: -180 });
    expect(gaugeMeetPose(dd, { ...D, dualShared: 'centre' }, 'end', N, 'end')).toEqual({ x: 0, y: 16, heading: -180 });
    expect(gaugeMeetPose(dd, D, 'end', r('X', { gaugeStuds: 3 }), 'end')).toBeUndefined();
  });
  it('and the dual-gauge track dragged onto a narrow track\'s end: its middle a stud the other way, whichever of its ends is dragged', () => {
    const N = r('N', { gaugeStuds: 2, x: 5 }), D = dual(), dd = d([N, D]);
    // (arriving at the narrow track's start heading 0: dragged by its end it runs that way, its narrow gauge to its right, so its middle is to the left)
    expect(gaugeMeetPose(dd, N, 'start', D, 'end')).toEqual({ x: 4, y: 0, heading: 0 });
    // (dragged by its start it runs the other way: its right is the other side)
    expect(gaugeMeetPose(dd, N, 'start', D, 'start')).toEqual({ x: 6, y: 0, heading: 0 });
  });
  it('a track on a dual-gauge end made narrow gauge on its card moves across to the narrow gauge\'s place, and back', () => {
    const dd = d([dual(), r('T', { y: 16, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] })]);
    dd.routes[1].gaugeStuds = 2;
    expect(reseatOnDual(dd, 1, 4)).toBe(true);
    expect([dd.routes[1].x, dd.routes[1].y]).toEqual([1, 16]);
    expect(dualEndMismatches(dd)).toEqual([]);
    delete dd.routes[1].gaugeStuds;
    expect(reseatOnDual(dd, 1, 2)).toBe(true);
    expect([dd.routes[1].x, dd.routes[1].y]).toEqual([0, 16]);
    // (its end on the dual-gauge track's start, the shared rail on the left: the other way across)
    const e = d([dual({ dualShared: 'left', y: 16 }), r('T')]);
    e.routes[1].gaugeStuds = 2;
    expect(reseatOnDual(e, 1, 4)).toBe(true);
    expect([e.routes[1].x, e.routes[1].y]).toEqual([-1, 0]);
    // (elsewhere, or to a gauge that isn't the dual-gauge track's narrow one: left where it is)
    const f = d([dual(), r('T', { x: 30 })]); f.routes[1].gaugeStuds = 2;
    expect(reseatOnDual(f, 1, 4)).toBe(false);
    const g = d([dual(), r('T', { y: 16 })]); g.routes[1].gaugeStuds = 3;
    expect(reseatOnDual(g, 1, 4)).toBe(false);
  });
  it('a narrow track on a dual-gauge end\'s middle, the narrow gauge beside it: said, with which way to move it', () => {
    const dd = d([dual(), r('S', { y: 16 }), r('N', { y: 16, gaugeStuds: 2 })]);
    const m = dualEndMismatches(dd);
    expect(m.map((q) => [q.at, q.route])).toEqual([[[0, 16], 2]]);
    expect(m[0].text).toBe("N's rails don't line up with Dual's narrow gauge: move this end 1 stud to the right (its card's Move onto the narrow gauge does it)");
    // (its card's Move onto the narrow gauge: moved by move, nothing's said)
    expect(m[0].move).toEqual([1, 0]);
    dd.routes[2].x += m[0].move![0]; dd.routes[2].y += m[0].move![1];
    expect(dualEndMismatches(dd)).toEqual([]);
    // (drawn towards the dual-gauge end instead: its own right is the other side)
    const bd = d([dual(), r('N', { y: 32, heading: 180, gaugeStuds: 2 })]), back = dualEndMismatches(bd);
    expect(back[0].text).toMatch(/1 stud to the left/);
    bd.routes[1].x += back[0].move![0]; bd.routes[1].y += back[0].move![1];
    expect(dualEndMismatches(bd)).toEqual([]);
    // (centred dual gauge: the middle is right; another narrow gauge: said)
    expect(dualEndMismatches(d([dual({ dualShared: 'centre' }), r('N', { y: 16, gaugeStuds: 2 })]))).toEqual([]);
    expect(dualEndMismatches(d([dual({ dualGaugeStuds: 1 }), r('N', { x: 1, y: 16, gaugeStuds: 2 })]))[0].text).toMatch(/whose narrow gauge is 1 stud:/);
  });
  it('a saved design drawn the old way (a 3-stud narrow gauge from a curved dual-gauge track\'s start, on its middle): half a stud over, and moved there', () => {
    const dd = d([
      { name: 'Dual', x: 0, y: 0, heading: 0, dualGauge: true, segs: [{ kind: 'curve', radius: 69.518519, angle: 52.293682 }], dualPlainEnds: 'none', dualGaugeStuds: 3 },
      { name: 'T2', x: 0, y: 0, heading: -180, segs: [{ kind: 'curve', radius: 56.000001, angle: -34 }] },
      { name: 'T3', x: 0, y: 0, heading: -180, segs: [{ kind: 'curve', radius: 26.363636, angle: -80.472717 }], gaugeStuds: 3 }]);
    const m = dualEndMismatches(dd);
    expect(m.map((q) => [q.route, q.move, q.text])).toEqual([[2, [0.5, 0], "T3's rails don't line up with Dual's narrow gauge: move this end 0.5 studs to the left (its card's Move onto the narrow gauge does it)"]]);
    dd.routes[2].x += 0.5;
    expect(dualEndMismatches(dd)).toEqual([]);
  });
});
