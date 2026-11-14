import { describe, expect, it } from 'vitest';
import type { DRoute } from '../src/app/design';
import { dragResult, dragValue, guidedHandle, handleLabel, poseBefore, segmentHandles, visibleHandles, withValue } from '../src/app/handles';
import { LIMITS, TRAIN_DRAG_MIN } from '../src/app/limits';
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
    expect(dragValue(r, { seg: 0, kind: 'length' }, [0, -5])).toBe(LIMITS.straight[0]);   // (the card's least)
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

describe('handles at their limits', () => {
  const curve = (angle: number) => route([{ kind: 'curve', radius: 40, angle }]);
  const at = (t: number): [number, number] => [-40 + 40 * Math.cos((t * Math.PI) / 180), 40 * Math.sin((t * Math.PI) / 180)];
  it('an angle pulled back past 0 turns the curve the other way, and on from there', () => {
    expect(dragValue(curve(22.5), { seg: 0, kind: 'angle' }, at(-20))).toBe(-22.5);
    expect(dragValue(curve(22.5), { seg: 0, kind: 'angle' }, at(-45))).toBe(-45);
    // (a right curve: its centre is on the right; the pointer pulled to the left of the start line makes it a left one)
    const atR = (t: number): [number, number] => [40 - 40 * Math.cos((t * Math.PI) / 180), 40 * Math.sin((t * Math.PI) / 180)];
    expect(dragValue(curve(-22.5), { seg: 0, kind: 'angle' }, atR(45))).toBe(-45);
    expect(dragValue(curve(-22.5), { seg: 0, kind: 'angle' }, atR(-45))).toBe(45);
  });
  it('is smooth through 0: the value is never 0, and the pointer a little either side gives the least step either way', () => {
    expect(dragValue(curve(22.5), { seg: 0, kind: 'angle' }, at(1))).toBe(5.625);
    expect(dragValue(curve(22.5), { seg: 0, kind: 'angle' }, at(-1))).toBe(-5.625);
    expect(dragResult(curve(22.5), { seg: 0, kind: 'angle' }, at(1))?.why).toMatch(/at least 5\.625/);
  });
  it('flipping and then dragging on follows the pointer: each step is measured in the curve\'s new hand', () => {
    let r = curve(22.5);
    r = curve(dragValue(r, { seg: 0, kind: 'angle' }, at(-30))!);          // (flipped to a right curve of 33.75)
    expect((r.segs[0] as { angle: number }).angle).toBeLessThan(0);
    const atR = (t: number): [number, number] => [40 - 40 * Math.cos((t * Math.PI) / 180), 40 * Math.sin((t * Math.PI) / 180)];
    expect(dragValue(r, { seg: 0, kind: 'angle' }, atR(60))).toBe(-61.875);   // (on round the right: the right curve grows)
    expect(dragValue(r, { seg: 0, kind: 'angle' }, atR(-20))).toBe(22.5);      // (and back across: left again)
  });
  it('a radius dragged below the least says so, with the limit from limits.ts', () => {
    const r = curve(90), m = follow({ x: 0, y: 0, heading: 0 }, [{ kind: 'curve', radius: 8, angle: 45 }]);
    const res = dragResult(r, { seg: 0, kind: 'radius' }, [m.x, m.y])!;
    expect(res.value).toBe(TRAIN_DRAG_MIN);
    expect(res.why).toBe(`smallest radius is ${TRAIN_DRAG_MIN} studs`);
    const ok = follow({ x: 0, y: 0, heading: 0 }, [{ kind: 'curve', radius: 56, angle: 45 }]);
    expect(dragResult(r, { seg: 0, kind: 'radius' }, [ok.x, ok.y])?.why).toBeUndefined();
    expect(dragResult(r, { seg: 0, kind: 'radius' }, [-9999, 9999])?.why).toBe(`biggest radius is ${LIMITS.radius[1]} studs`);
  });
  it('a straight dragged to its least or its most says so, and the least is the card\'s', () => {
    const r = route([{ kind: 'straight', studs: 16 }]);
    expect(dragResult(r, { seg: 0, kind: 'length' }, [0, -5])).toEqual({ value: LIMITS.straight[0], why: `shortest straight is ${LIMITS.straight[0]} studs` });
    expect(dragResult(r, { seg: 0, kind: 'length' }, [0, 99999])?.why).toBe(`longest straight is ${LIMITS.straight[1]} studs`);
    expect(dragResult(r, { seg: 0, kind: 'length' }, [0, 5])?.why).toBeUndefined();
  });
  it('a curve past a whole turn says so', () => {
    expect(dragResult(curve(350), { seg: 0, kind: 'angle' }, at(358 + 10))?.value).toBe(360);
  });
});

describe('handles snap to the drawing guides', () => {
  const G = { scale: 8, snapPx: 10 };
  const straight = (studs: number): DRoute => ({ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }] });
  const plain = (r: DRoute, h: { seg: number; kind: 'length' | 'angle' | 'radius' }, w: [number, number], o = {}) => dragResult(r, h, w, o)!;
  it('a straight\'s end goes onto another end\'s straight-on line', () => {
    const r = straight(20), h = { seg: 0, kind: 'length' as const };
    // (another track's end at (-10, 24) facing +x: its line runs through (0, 24))
    const ends = [{ pose: { x: -10, y: 24, heading: -90 }, name: 'B' }];
    const w: [number, number] = [0, 23.4];
    expect(plain(r, h, w).value).toBe(23);
    const g = guidedHandle(r, h, w, plain(r, h, w), { ...G, ends, straights: [] });
    expect(g.value).toBe(24);
    expect(g.guide?.kind).toBe('tangent'); expect(g.guide?.label).toMatch(/in line with B/);
    // (too far from it in pixels: as dragged)
    expect(guidedHandle(r, h, [0, 22.2], plain(r, h, [0, 22.2]), { ...G, ends, straights: [] }).guide).toBeUndefined();
  });
  it('a straight\'s end lands beside another straight at 8 studs', () => {
    const r = straight(10), h = { seg: 0, kind: 'length' as const };
    // (a straight at x = -8 from y = 0 to 30: the end at y = 12 is 8 studs beside it, as is any other, so the nearest whole stud to the pointer wins)
    const g = guidedHandle(r, h, [0, 12.4], plain(r, h, [0, 12.4]), { ...G, ends: [], straights: [{ x: 8, y: 0, heading: 0, studs: 30, name: 'B' }] });
    expect(g.guide?.kind).toBe('parallel'); expect(g.guide?.label).toBe('8 studs from B'); expect(g.value).toBe(12);
  });
  it('a curve\'s angle goes to the step that puts its end on the line, and Shift or Alt leave it', () => {
    const r: DRoute = { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }] }, h = { seg: 0, kind: 'angle' as const };
    const e = follow({ x: 0, y: 0, heading: 0 }, [{ kind: 'curve', radius: 40, angle: 11.25 }]);
    const ends = [{ pose: { x: e.x + 5, y: e.y - 5, heading: 45 }, name: 'B' }];
    const aim = (a: number): [number, number] => { const q = follow({ x: 0, y: 0, heading: 0 }, [{ kind: 'curve', radius: 40, angle: a }]); return [q.x, q.y]; };
    const w = aim(8), res = plain(r, h, w);
    expect(res.value).toBe(5.625);
    const g = guidedHandle(r, h, w, res, { scale: 3, snapPx: 10, ends, straights: [] });
    expect(g.value).toBe(11.25); expect(g.guide?.kind).toBe('tangent');
    expect(guidedHandle(r, h, w, res, { scale: 3, snapPx: 10, ends, straights: [] }, { shift: true }).guide).toBeUndefined();
    expect(guidedHandle(r, h, w, res, { scale: 3, snapPx: 10, ends, straights: [] }, { off: true }).value).toBe(5.625);
  });
  it('a curve\'s radius goes to the whole radius that puts its end on the line', () => {
    const r: DRoute = { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }] }, h = { seg: 0, kind: 'radius' as const };
    const e = follow({ x: 0, y: 0, heading: 0 }, [{ kind: 'curve', radius: 56, angle: 45 }]);
    const ends = [{ pose: { x: e.x + 3, y: e.y, heading: 90 }, name: 'B' }]; // (the line through e, going -x... facing -y? any line through e: the end's own heading 90 is +(-1, 0))
    const m = (R: number): [number, number] => { const q = follow({ x: 0, y: 0, heading: 0 }, [{ kind: 'curve', radius: R, angle: 22.5 }]); return [q.x, q.y]; };
    const w = m(50), res = plain(r, h, w);
    const g = guidedHandle(r, h, w, res, { scale: 2, snapPx: 14, ends, straights: [] });
    expect(g.guide?.kind).toBe('tangent'); expect(g.value).toBe(56);
  });
  it('nothing near: the value as dragged', () => {
    const r = straight(20), h = { seg: 0, kind: 'length' as const };
    expect(guidedHandle(r, h, [0, 23.4], plain(r, h, [0, 23.4]), { ...G, ends: [], straights: [] })).toEqual({ value: 23 });
  });
});

describe('a monorail curve\'s radius handle', () => {
  const mk = (system?: 'monorail'): DRoute => ({ name: 'M', x: 0, y: 0, heading: 0, ...(system && { system }), segs: [{ kind: 'curve', radius: 28, angle: 90 }] });
  const mid = (R: number): [number, number] => { const q = follow({ x: 0, y: 0, heading: 0 }, [{ kind: 'curve', radius: R, angle: 45 }]); return [q.x, q.y]; };
  const h = { seg: 0, kind: 'radius' as const };
  it('goes down to R4 in whole studs; a train curve stops at 24 in steps of 8', () => {
    expect(dragResult(mk('monorail'), h, mid(10))?.value).toBe(10);
    expect(dragResult(mk('monorail'), h, mid(10))?.why).toBeUndefined();
    expect(dragResult(mk('monorail'), h, mid(1))).toEqual({ value: 4, why: 'smallest radius is 4 studs' });
    expect(dragResult(mk(), h, mid(10))).toEqual({ value: 24, why: 'smallest radius is 24 studs' });
    expect(dragResult(mk(), h, mid(45))?.value).toBe(48);
  });
  it('the guided radius of a monorail curve is a whole stud too', () => {
    const e = follow({ x: 0, y: 0, heading: 0 }, [{ kind: 'curve', radius: 13, angle: 90 }]);
    const ends = [{ pose: { x: e.x + 2, y: e.y, heading: 90 }, name: 'B' }];
    const r = mk('monorail'), w = mid(11), res = dragResult(r, h, w)!;
    const g = guidedHandle(r, h, w, res, { scale: 6, snapPx: 14, ends, straights: [] });
    expect(g.value).toBe(13);
  });
});
