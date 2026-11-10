import { describe, expect, it } from 'vitest';
import type { DRoute } from '../src/app/design';
import { dragValue, handleLabel, poseBefore, segmentHandles, visibleHandles, withValue } from '../src/app/handles';
import { follow } from '../src/app/planner';

const route = (segs: DRoute['segs'], more: Partial<DRoute> = {}): DRoute => ({ name: 'A', x: 0, y: 0, heading: 0, segs, ...more });
const left = route([{ kind: 'straight', studs: 8 }, { kind: 'curve', radius: 40, angle: 45 }, { kind: 'straight', studs: 16 }]);

describe('handles', () => {
  it('puts one at each segment: length at a straight\'s end, angle at a curve\'s end and radius in its middle', () => {
    const hs = segmentHandles(left);
    expect(hs.map((h) => `${h.seg}:${h.kind}`)).toEqual(['0:length', '1:angle', '1:radius', '2:length']);
    const end = follow(poseBefore(left, 1), [left.segs[1]]);
    expect(hs[1].at[0]).toBeCloseTo(end.x, 6); expect(hs[1].at[1]).toBeCloseTo(end.y, 6);
    expect(hs[0].at).toEqual([0, 8]);
    const mid = follow(poseBefore(left, 1), [{ kind: 'curve', radius: 40, angle: 22.5 }]);
    expect(hs[2].at[0]).toBeCloseTo(mid.x, 6);
  });
  it('sets the last segment\'s handle back from the route\'s end, the others at theirs', () => {
    const a = segmentHandles(left, 2).at(-1)!.at, b = segmentHandles(left, 0).at(-1)!.at;
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(2, 6);
    const c = route([{ kind: 'curve', radius: 40, angle: 90 }, { kind: 'straight', studs: 8 }]);
    expect(segmentHandles(c, 3)[1].at).toEqual(segmentHandles(c, 0)[1].at);
  });
  it('hides handles that are close together on the screen', () => {
    const hs = segmentHandles(left);
    expect(visibleHandles(hs, 8).length).toBe(4);
    expect(visibleHandles(hs, 0.5).length).toBeLessThanOrEqual(2);
    expect(visibleHandles(hs, 0.01)).toHaveLength(1);
  });
  it('gives a straight a new length from the pointer along it, to whole studs (Shift: 0.2)', () => {
    const r = route([{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: 22.5 }]);
    expect(dragValue(r, { seg: 0, kind: 'length' }, [3, 20.4])).toBe(20);
    expect(dragValue(r, { seg: 0, kind: 'length' }, [3, 20.37], { shift: true })).toBe(20.4);
    expect(dragValue(r, { seg: 0, kind: 'length' }, [0, -5])).toBe(1);
    expect(dragValue(r, { seg: 0, kind: 'length' }, [0, 99999])).toBe(2000);
  });
  it('gives a curve a new angle from the pointer round its centre, in 5.625 degree steps (Shift: 0.5)', () => {
    const r = route([{ kind: 'curve', radius: 40, angle: 22.5 }]);
    // (centre at (-40, 0): a point at 45 degrees round from the start)
    const at = (t: number, rad = 40): [number, number] => [-40 + 40 * Math.cos((t * Math.PI) / 180) * (rad / 40), 40 * Math.sin((t * Math.PI) / 180) * (rad / 40)];
    expect(dragValue(r, { seg: 0, kind: 'angle' }, at(45))).toBe(45);
    expect(dragValue(r, { seg: 0, kind: 'angle' }, at(47))).toBe(45);
    expect(dragValue(r, { seg: 0, kind: 'angle' }, at(47), { shift: true })).toBe(47);
    expect(dragValue(r, { seg: 0, kind: 'angle' }, at(90, 60))).toBe(90);          // (any distance from the centre: the radius stays)
    expect(dragValue(r, { seg: 0, kind: 'angle' }, at(2))).toBe(5.625);             // (never nothing)
    const right = route([{ kind: 'curve', radius: 40, angle: -22.5 }]);
    expect(dragValue(right, { seg: 0, kind: 'angle' }, [40 - 40 * Math.cos(Math.PI / 4), 40 * Math.sin(Math.PI / 4)])).toBe(-45);
  });
  it('goes on past half a turn, and up to a whole turn, and no further', () => {
    let r = route([{ kind: 'curve', radius: 40, angle: 170 }]);
    const at = (t: number): [number, number] => [-40 + 40 * Math.cos((t * Math.PI) / 180), 40 * Math.sin((t * Math.PI) / 180)];
    expect(dragValue(r, { seg: 0, kind: 'angle' }, at(190))).toBe(191.25);       // (nearest step to 190 above 180)
    expect(dragValue(route([{ kind: 'curve', radius: 40, angle: 22.5 }]), { seg: 0, kind: 'angle' }, at(-20))).toBe(5.625); // (back past the start: the least)
    r = route([{ kind: 'curve', radius: 40, angle: 350 }]);
    expect(dragValue(r, { seg: 0, kind: 'angle' }, at(358))).toBe(360);
  });
  it('gives a curve a new radius, to the usual radii (Shift: whole studs), the angle unchanged', () => {
    const r = route([{ kind: 'curve', radius: 40, angle: 90 }]);
    const mid = (R: number) => follow({ x: 0, y: 0, heading: 0 }, [{ kind: 'curve', radius: R, angle: 45 }]);
    const m56 = mid(56), m60 = mid(60), m30 = mid(30);
    expect(dragValue(r, { seg: 0, kind: 'radius' }, [m56.x, m56.y])).toBe(56);
    expect(dragValue(r, { seg: 0, kind: 'radius' }, [m60.x, m60.y])).toBe(56);       // (60 is nearer 56 than 64? no: 60 is half way: rounds up)
    expect(dragValue(r, { seg: 0, kind: 'radius' }, [m60.x, m60.y], { shift: true })).toBe(60);
    expect(dragValue(r, { seg: 0, kind: 'radius' }, [m30.x, m30.y])).toBe(32);
    expect(dragValue(r, { seg: 0, kind: 'radius' }, [0, 0])).toBe(24);
    expect(dragValue(r, { seg: 0, kind: 'radius' }, [-9999, 9999])).toBe(1000);
  });
  it('puts a value into a segment, and says what it is', () => {
    expect(withValue(left.segs[1], 'angle', 90)).toEqual({ kind: 'curve', radius: 40, angle: 90 });
    expect(withValue(left.segs[1], 'radius', 56)).toEqual({ kind: 'curve', radius: 56, angle: 45 });
    expect(withValue(left.segs[0], 'length', 4)).toEqual({ kind: 'straight', studs: 4 });
    expect(handleLabel({ kind: 'curve', radius: 104, angle: 22.5 })).toBe('R104 · 22.5° · 16 make a circle');
    expect(handleLabel({ kind: 'curve', radius: 40, angle: 5.625 })).toBe('R40 · 5.625° · 64 make a circle');
    expect(handleLabel({ kind: 'curve', radius: 40, angle: -30 })).toBe('R40 · 30° · 12 make a circle');
    expect(handleLabel({ kind: 'curve', radius: 40, angle: 40 })).toBe('R40 · 40° · 9 make a circle');
    expect(handleLabel({ kind: 'curve', radius: 40, angle: 50 })).toBe('R40 · 50°');
    expect(handleLabel({ kind: 'straight', studs: 16 })).toBe('16 studs');
  });
});
