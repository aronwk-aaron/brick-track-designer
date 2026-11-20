// (expert, stage 4) Rails and sleepers laid by hand, the pure part (freeparts.ts): kept as a file has them, the rules,
// moved, a rail's end dragged, how near a point is.
import { describe, expect, it } from 'vitest';
import { cleanFree, freeDistance, freeProblem, moveFree, nextFreeId, railEndTo } from '../src/app/freeparts';

describe('rails and sleepers laid by hand', () => {
  it('kept: well-formed ones, an id each, numbers in range; none: undefined', () => {
    expect(cleanFree([{ id: 'a', kind: 'rail', a: [0, 0], b: [0, 1] }, { kind: 'rail', a: [0, 0], b: [3, 4] }, { id: 'x', kind: 'sleeper', at: [1, 2], heading: 270, len: 99, w: 0 }, { kind: 'bolt' }]))
      .toEqual([{ id: 'f1', kind: 'rail', a: [0, 0], b: [3, 4] }, { id: 'x', kind: 'sleeper', at: [1, 2], heading: -90, len: 24, w: 1 }]);
    expect(cleanFree([])).toBeUndefined();
    expect(nextFreeId([{ id: 'f2' }])).toBe('f3');
  });
  it('a rail 2 to 200 studs; a sleeper 2 to 24', () => {
    expect(freeProblem({ id: 'f1', kind: 'rail', a: [0, 0], b: [0, 1] })).toMatch(/2 studs long at least/);
    expect(freeProblem({ id: 'f1', kind: 'sleeper', at: [0, 0], heading: 0, len: 30 })).toMatch(/2 to 24/);
  });
  it('moved; a rail\'s end to whole studs, held to the rule', () => {
    expect(moveFree({ id: 'f1', kind: 'rail', a: [0, 0], b: [0, 4] }, 2, -1)).toEqual({ id: 'f1', kind: 'rail', a: [2, -1], b: [2, 3] });
    expect(railEndTo({ id: 'f1', kind: 'rail', a: [0, 0], b: [0, 4] }, 'b', [0.4, 7.6])).toEqual({ id: 'f1', kind: 'rail', a: [0, 0], b: [0, 8] });
    expect(railEndTo({ id: 'f1', kind: 'rail', a: [0, 0], b: [0, 4] }, 'b', [0, 1])).toBeUndefined();
  });
  it('how near: a rail from its line, a sleeper 0 inside', () => {
    expect(freeDistance({ id: 'f1', kind: 'rail', a: [0, 0], b: [0, 4] }, [1, 2], 2)).toBeCloseTo(1);
    expect(freeDistance({ id: 'f1', kind: 'sleeper', at: [0, 0], heading: 90, len: 8 }, [0.5, 3.9], 2)).toBe(0);
    expect(freeDistance({ id: 'f1', kind: 'sleeper', at: [0, 0], heading: 90, len: 8 }, [3, 0], 2)).toBeCloseTo(2);
  });
});
