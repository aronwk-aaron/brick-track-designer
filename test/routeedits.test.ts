// A route turned end for end (its start dragged onto another track's end) or mirrored is still the track it was:
// what its card says by its ends and its sides goes with it.
import { describe, expect, it } from 'vitest';
import type { DRoute } from '../src/app/design';
import { follow } from '../src/app/planner';
import { mirrorRoute, reversedRoute } from '../src/app/routeedits';

const r0: DRoute = { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: 45, bank: 3, bankRamps: 'start' }, { kind: 'curve', radius: 40, angle: -22.5, bank: 2 }] };
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('a route turned end for end', () => {
  it('is the same track from its other end', () => {
    const e = follow(r0, r0.segs), r = reversedRoute(r0), back = follow(r, r.segs);
    near(r.x, e.x); near(r.y, e.y); near(back.x, r0.x); near(back.y, r0.y);
    expect(r.segs.map((sg) => sg.kind)).toEqual(['curve', 'curve', 'straight']);
    expect(r.name).toBe('A');
  });
  it('swaps what is said by its ends', () => {
    const r = reversedRoute({ ...r0, startEnd: 'buffer', guardRails: true, guardRailEnds: 'start', dualGauge: true, dualPlainEnds: 'end', monoHeight: 2, monoHeightEnd: 6 });
    expect(r.startEnd).toBeUndefined(); expect(r.endEnd).toBe('buffer');
    expect(r.guardRailEnds).toBe('end'); expect(r.dualPlainEnds).toBe('start');
    expect([r.monoHeight, r.monoHeightEnd]).toEqual([6, 2]);
    // (a curve's bank ramps: the end that ramped is its other end now; one that ramps at both, or left out, as it was)
    expect(r.segs[1]).toMatchObject({ kind: 'curve', angle: -45, bank: 3, bankRamps: 'end' });
    expect(r.segs[0]).toEqual({ kind: 'curve', radius: 40, angle: 22.5, bank: 2 });
    for (const both of ['both', 'none'] as const) expect(reversedRoute({ ...r0, guardRailEnds: both }).guardRailEnds).toBe(both);
  });
  it('keeps the rail both gauges share where it is: on the other side, facing the other way', () => {
    expect(reversedRoute({ ...r0, dualGauge: true }).dualShared).toBe('left');
    expect(reversedRoute({ ...r0, dualGauge: true, dualShared: 'left' }).dualShared).toBe('right');
    expect(reversedRoute(r0).dualShared).toBeUndefined();
  });
  it('level track stays level, and twice round is as it was', () => {
    expect(reversedRoute({ ...r0, monoHeight: 4 })).toMatchObject({ monoHeight: 4 });
    expect(reversedRoute({ ...r0, monoHeight: 4 }).monoHeightEnd).toBeUndefined();
    const full: DRoute = { ...r0, endEnd: 'buffer', guardRails: true, guardRailEnds: 'end', dualGauge: true, dualShared: 'left', dualPlainEnds: 'start', monoHeight: 1, monoHeightEnd: 3, throwSide: 'left' };
    const twice = reversedRoute(reversedRoute(full));
    expect({ ...twice, x: 0, y: 0, heading: 0, segs: twice.segs.map((sg) => (sg.kind === 'curve' ? { ...sg, angle: Math.round(sg.angle * 1e6) / 1e6 } : sg)) }).toEqual(full);
    near(twice.x, 0); near(twice.y, 0);
  });
});

describe('a route mirrored', () => {
  it('turns its curves, and its sides, the other way', () => {
    const r: DRoute = { ...structuredClone(r0), x: 8, heading: 22.5, dualGauge: true, throwSide: 'left', guardRailEnds: 'start' };
    mirrorRoute(r, 0);
    expect([r.x, r.heading]).toEqual([-8, -22.5]);
    expect(r.segs.map((sg) => (sg.kind === 'curve' ? sg.angle : 0))).toEqual([0, -45, 22.5]);
    expect(r.dualShared).toBe('left'); expect(r.throwSide).toBe('right');
    expect(r.guardRailEnds).toBe('start'); // (its ends are its ends still)
    const plain = structuredClone(r0); mirrorRoute(plain, 4);
    expect(plain.dualShared).toBeUndefined(); expect(plain.throwSide).toBeUndefined(); expect(plain.x).toBe(8);
    const auto: DRoute = { ...structuredClone(r0), throwSide: 'auto' }; mirrorRoute(auto, 0); expect(auto.throwSide).toBe('auto');
  });
});
