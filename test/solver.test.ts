import { describe, expect, it } from 'vitest';
import type { Route } from '../src/route/route';
import { solve } from '../src/route/solver';

const straight = (len: number): Route => ({ id: 'S', start: [0, 0, 0], segments: [{ kind: 'straight', length: len }] });

describe('switches (switch.scad geometry)', () => {
  it('left R40 arc switch: frog where the straight route left rail meets the curve right rail, 164.2mm along', () => {
    const ext = (256 - 320 * Math.sin(Math.PI / 8)) / Math.cos(Math.PI / 8);
    const curve: Route = { id: 'L', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: ext }] };
    const sol = solve([straight(256), curve]);
    const frog = sol.crossings.filter((c) => c.a.side === -1 && c.b.side === 1);
    expect(frog).toHaveLength(1);
    expect(frog[0].point[0]).toBeCloseTo(-20, 3);
    expect(frog[0].point[1]).toBeCloseTo(164.199, 2);
  });
  it('left R40 S-curve switch: frog at 160mm', () => {
    const curve: Route = { id: 'L', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 36.8699 }, { kind: 'arc', radius: 320, angle: -14.3699 }] };
    const sol = solve([straight(256), curve]);
    const frog = sol.crossings.filter((c) => c.a.side === -1 && c.b.side === 1);
    expect(frog).toHaveLength(1);
    expect(frog[0].point[1]).toBeCloseTo(160, 2);
    expect(sol.splits).toHaveLength(1);
  });
});

describe('crossings', () => {
  it('90 degree crossing: four rail crossings at the corners of a 40mm square, no check rails', () => {
    const a: Route = { id: 'A', start: [0, -64, 0], segments: [{ kind: 'straight', length: 128 }] };
    const b: Route = { id: 'B', start: [64, 0, 90], segments: [{ kind: 'straight', length: 128 }] };
    const sol = solve([a, b]);
    expect(sol.crossings).toHaveLength(4);
    for (const c of sol.crossings) {
      expect(Math.abs(c.point[0])).toBeCloseTo(20, 3);
      expect(Math.abs(c.point[1])).toBeCloseTo(20, 3);
      expect(c.angle).toBeCloseTo(90, 3);
    }
    expect(sol.checkRails).toHaveLength(0);
    // every rail is grooved where the other track's flanges cross it
    expect(sol.grooves.length).toBeGreaterThanOrEqual(8);
    expect(sol.splits).toHaveLength(0);
  });
  it('22.5 degree crossing: four crossings, check rails at the sharp ones', () => {
    const a: Route = { id: 'A', start: [0, -128, 0], segments: [{ kind: 'straight', length: 256 }] };
    const t = 22.5 * Math.PI / 180;
    const b: Route = { id: 'B', start: [128 * Math.sin(t), -128 * Math.cos(t), 22.5], segments: [{ kind: 'straight', length: 256 }] };
    const sol = solve([a, b]);
    expect(sol.crossings).toHaveLength(4);
    expect(sol.checkRails.length).toBeGreaterThan(0);
    for (const c of sol.crossings) expect(c.angle).toBeCloseTo(22.5, 2);
  });
});
