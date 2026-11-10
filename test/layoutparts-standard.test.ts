// Bought LEGO track in the layout parts' set: the layout designer's own parts, each laid so its connection points
// are the piece's.
import { describe, expect, it } from 'vitest';
import { placeStandard, STANDARD, standardOffset } from '../src/app/layoutparts';

const turn = (x: number, y: number, deg: number): [number, number] => { const a = (deg * Math.PI) / 180; return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]; };
/** A library part's connection points with its picture's middle at c, turned by deg. */
const endsOf = (name: keyof typeof STANDARD, c: [number, number], deg: number) => STANDARD[name].conns.map(([x, y, a]) => { const [qx, qy] = turn(x, y, deg); return { x: c[0] + qx, y: c[1] + qy, angle: a + deg }; });

describe("the library's own track parts", () => {
  it('where a set puts a part: the middle of its outline, as turned (none: its picture)', () => {
    expect(standardOffset(STANDARD.straight, 37)).toEqual([0, 0]);
    // (the curve's outline is its picture's box but for the half pixel all round)
    const o = standardOffset(STANDARD.curve, 0); expect(o[0]).toBeCloseTo(0.0625, 6); expect(o[1]).toBeCloseTo(0.0625, 6);
    // (turned half round, the same the other way)
    const h = standardOffset(STANDARD.curve, 180); expect(h[0]).toBeCloseTo(-0.0625, 5); expect(h[1]).toBeCloseTo(-0.0625, 5);
  });
  it('each is laid where its ends are, any way round, whichever end is given first', () => {
    for (const name of Object.keys(STANDARD) as (keyof typeof STANDARD)[]) for (const deg of [0, 22.5, 90, -135, 180]) {
      const c: [number, number] = [12.5, -40.25], ends = endsOf(name, c, deg);
      for (const order of [ends, [...ends].reverse()]) {
        const at = placeStandard(STANDARD[name], order)!;
        expect(at, `${name} at ${deg}`).toBeDefined();
        // (a straight is the same turned half round: either is right)
        const same = Math.abs(((at.angle - deg) % 360 + 540) % 360 - 180);
        expect(name === 'straight' ? Math.min(same, 180 - same) : same, `${name} at ${deg}`).toBeLessThan(1e-3);
        expect(Math.hypot(at.centre[0] - c[0], at.centre[1] - c[1])).toBeLessThan(1e-6);
        const off = standardOffset(STANDARD[name], at.angle);
        expect(at.position[0]).toBeCloseTo(c[0] - off[0], 6); expect(at.position[1]).toBeCloseTo(c[1] - off[1], 6);
      }
    }
  });
  it("a piece that isn't that shape isn't that part", () => {
    expect(placeStandard(STANDARD.straight, endsOf('curve', [0, 0], 0))).toBeUndefined();
    expect(placeStandard(STANDARD.curve, endsOf('straight', [0, 0], 0))).toBeUndefined();
    expect(placeStandard(STANDARD.switchLeft, endsOf('switchRight', [0, 0], 0))).toBeUndefined();
    expect(placeStandard(STANDARD.switchLeft, endsOf('straight', [0, 0], 0))).toBeUndefined();
    // (a curve the other way is the same part, turned)
    const mirrored = endsOf('curve', [0, 0], 0).map((e) => ({ x: e.x, y: -e.y, angle: -e.angle }));
    expect(placeStandard(STANDARD.curve, mirrored)).toBeDefined();
  });
});
