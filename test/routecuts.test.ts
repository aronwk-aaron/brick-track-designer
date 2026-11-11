// Hand cuts across a track (expert mode): the pure part (routecuts.ts), and how they go with their route through the
// editor's own operations (turned end for end, split, joined), and through a file (readDesign).
import { describe, expect, it } from 'vitest';
import { type Design, type DRoute, readDesign } from '../src/app/design';
import { addCut, cleanCuts, clearCuts, cutProblem, cutsSummary, CUT_MIN, followCuts, joinCuts, liveCuts, lostCuts, reverseCuts, setCut, splitCuts } from '../src/app/routecuts';
import { reversedRoute } from '../src/app/routeedits';
import { mergeRoutes, splitRoute } from '../src/app/splitmerge';
import { cardSections } from '../src/app/cardsections';

const straight = (studs: number, more: Partial<DRoute> = {}): DRoute => ({ name: 'T1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }], ...more });
const design = (...routes: DRoute[]): Design => ({ version: 1, gaugeStuds: 4, routes });

describe('hand cuts: the list', () => {
  it('is kept in order, each once, to a thousandth, and only the numbers past the start', () => {
    expect(cleanCuts([30, 10, 10, 12.34567, -4, 0, 'x', NaN, Infinity])).toEqual([10, 12.346, 30]);
    expect(cleanCuts([])).toBeUndefined();
    expect(cleanCuts('10')).toBeUndefined();
  });
  it('a cut needs a part at least two studs long each side, and two studs to the next cut', () => {
    const r = straight(48, { cuts: [20] });
    expect(cutProblem(r, 10)).toBeUndefined();
    expect(cutProblem(r, CUT_MIN)).toBeUndefined();
    expect(cutProblem(r, 48 - CUT_MIN)).toBeUndefined();
    expect(cutProblem(r, 1)).toMatch(/at least 2 studs in from its ends \(2 to 46\)/);
    expect(cutProblem(r, 47)).toMatch(/at least 2 studs in from its ends/);
    expect(cutProblem(r, 21)).toMatch(/Too near the cut at 20: at least 2 studs between cuts/);
    expect(cutProblem(r, 20)).toMatch(/cut there already/);
    expect(cutProblem(straight(3), 1.5)).toMatch(/too short to cut/);
  });
  it('add, move and take out say why not, and leave the route as it was', () => {
    const r = straight(48);
    expect(addCut(r, 16)).toBeUndefined();
    expect(addCut(r, 32)).toBeUndefined();
    expect(addCut(r, 33)).toMatch(/Too near/);
    expect(r.cuts).toEqual([16, 32]);
    expect(setCut(r, 0, 31)).toMatch(/Too near/);
    expect(setCut(r, 0, 8)).toBeUndefined();
    expect(r.cuts).toEqual([8, 32]);
    // (moved past the other: still in order)
    expect(setCut(r, 0, 40)).toBeUndefined();
    expect(r.cuts).toEqual([32, 40]);
    expect(setCut(r, 1, undefined)).toBeUndefined();
    expect(setCut(r, 0, undefined)).toBeUndefined();
    expect(r.cuts).toBeUndefined();
    r.cuts = [8]; r.cutsLocked = true; clearCuts(r);
    expect(r).toEqual(straight(48));
  });
  it('a cut past the end of a shortened track is kept, listed, and not built', () => {
    const r = straight(20, { cuts: [8, 19, 40] });
    expect(lostCuts(r)).toEqual([19, 40]);
    expect(liveCuts(r)).toEqual([8]);
    expect(cutsSummary(r)).toBe('3 by hand · 2 off the track');
    expect(cutsSummary(straight(20))).toBe('automatic');
    expect(cutsSummary(straight(20, { cutsLocked: true }))).toBe('no cuts: one part');
    expect(cutsSummary(straight(20, { cuts: [8], cutsLocked: true }))).toBe('1 by hand, only these');
  });
});

describe('hand cuts go with their track', () => {
  it('turned end for end: each as far from the new start as from the old end; twice is as it was', () => {
    expect(reverseCuts([10, 30], 48)).toEqual([18, 38]);
    const r: DRoute = { name: 'T1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: 22.5 }], cuts: [8, 20] };
    const back = reversedRoute(reversedRoute(r));
    expect(back.cuts).toEqual([8, 20]);
    const L = 16 + (22.5 * Math.PI * 40) / 180;
    expect(reversedRoute(r).cuts![1]).toBeCloseTo(L - 8, 3);
  });
  it('split: each half its own, a cut at the split gone; joined again: as they were, the split a cut if both were by hand only', () => {
    expect(splitCuts([8, 16, 17, 30], 16)).toEqual([[8], [14]]);
    const d = design(straight(48, { cuts: [10, 30] }));
    expect(splitRoute(d, 0, 20)).toEqual({ first: 'T1', second: 'T2' });
    expect(d.routes.map((r) => r.cuts)).toEqual([[10], [10]]);
    expect(mergeRoutes(d, 0, 1)).toEqual({ index: 0 });
    expect(d.routes[0].cuts).toEqual([10, 30]);
    expect(d.routes[0].cutsLocked).toBeUndefined();
    expect(joinCuts([10], [10], 20, true)).toEqual([10, 20, 30]);
    const e = design(straight(48, { cuts: [10, 30], cutsLocked: true }));
    splitRoute(e, 0, 20); mergeRoutes(e, 0, 1);
    expect(e.routes[0].cuts).toEqual([10, 20, 30]);
    expect(e.routes[0].cutsLocked).toBe(true);
  });
  it('a piece reshaped: a cut stays in its piece as far from its start; the ones after move with their pieces', () => {
    const segs = (a: number, ang = 22.5): DRoute['segs'] => [{ kind: 'straight', studs: a }, { kind: 'curve', radius: 40, angle: ang }, { kind: 'straight', studs: 16 }];
    const arc = (22.5 * Math.PI * 40) / 180;
    const cuts = [8, 16 + 4, 16 + arc + 8];
    // (the first straight 8 longer: its own cut stays, the others 8 on)
    expect(followCuts({ segs: segs(16) }, { segs: segs(24), cuts })).toEqual(cleanCuts([8, 28, 24 + arc + 8]));
    // (shorter than its cut: the cut at its end)
    expect(followCuts({ segs: segs(16) }, { segs: segs(6), cuts })).toEqual(cleanCuts([6, 10, 6 + arc + 8]));
    // (the curve a smaller angle: its cut held to its new end)
    expect(followCuts({ segs: segs(16) }, { segs: segs(16, 2), cuts })![1]).toBeCloseTo(16 + (2 * Math.PI * 40) / 180, 3);
    // (nothing changed, more than one piece changed, a piece added: as far from the start as they were)
    expect(followCuts({ segs: segs(16) }, { segs: segs(16), cuts })).toBe(cuts);
    expect(followCuts({ segs: segs(16) }, { segs: segs(20, 30), cuts })).toBe(cuts);
    expect(followCuts({ segs: segs(16) }, { segs: [...segs(16), { kind: 'straight', studs: 4 }], cuts })).toBe(cuts);
  });
});

describe('hand cuts in a file', () => {
  it('an old design reads as it was; cuts are tidied, a lock is only a plain true', () => {
    const old = { version: 1, gaugeStuds: 4, routes: [{ name: 'T1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }] };
    expect(readDesign(structuredClone(old))).toEqual(old);
    const d = readDesign({ ...old, routes: [{ ...old.routes[0], cuts: [30, 'a', 10, 10, -1], cutsLocked: 'yes' }] });
    expect(d.routes[0].cuts).toEqual([10, 30]);
    expect('cutsLocked' in d.routes[0]).toBe(false);
    expect(readDesign({ ...old, routes: [{ ...old.routes[0], cuts: 'none', cutsLocked: true }] }).routes[0]).toEqual({ ...old.routes[0], cutsLocked: true });
  });
  it('the card has a Cuts into parts section for train track, not for a monorail beam', () => {
    const r = straight(48, { cuts: [10] });
    expect(cardSections(design(r), r, { branches: false }).find((s) => s.id === 'cuts')).toEqual({ id: 'cuts', title: 'Cuts into parts', summary: '1 by hand' });
    const m = straight(48, { system: 'monorail' });
    expect(cardSections(design(m), m, { branches: false }).some((s) => s.id === 'cuts')).toBe(false);
  });
});
