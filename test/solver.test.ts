import { describe, expect, it } from 'vitest';
import type { Route } from '../src/route/route';
import { solve } from '../src/route/solver';
import { planCuts } from '../src/app/tiles';

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
  it('four tracks through one point at 0, 90 and 45 degrees either way (a saved eight-way crossing): no check rails', () => {
    // (as the app saved it: the slanted tracks' lengths to six places, so their rails cross the others' a millionth
    // of a degree either side of 45: two of the 24 rail crossings got check rails, on one track's side only.)
    const mk = (id: string, x: number, y: number, h: number, studs: number): Route => ({ id, start: [x * 8, y * 8, h], segments: [{ kind: 'straight', length: studs * 8 }] });
    const sol = solve([mk('A', 0, -16, 0, 32), mk('B', 16, 0, 90, 32), mk('T3', -12, 12, -135, 33.941126), mk('T4', -12, -12, -45, 33.941125)]);
    expect(sol.crossings).toHaveLength(24);
    expect(sol.checkRails).toHaveLength(0);
  });
  it('a baseplate edge at a track\'s very end is no cut: nor one a few studs short of it; one in its middle is', () => {
    // (a 64-stud straight from y 0, 64-stud baseplates from 0: the edges at 0 and 512 are its ends, the box round it
    // (its connectors, 56 mm more) reaches past them)
    const rt: Route = { id: 'S', start: [0, 0, 0], segments: [{ kind: 'straight', length: 512 }] };
    const box = (r: Route, y0: number, y1: number): [number, number, number, number] => [r.start[0] - 56, y0 - 56, r.start[0] + 56, y1 + 56];
    // (but for the cuts across the plate, which is bigger than the bed)
    const ends = planCuts(box(rt, 0, 512), 256, 256, 512, 0, 0, [], [rt], 44).ys;
    expect(ends).not.toContain(0);
    expect(ends).not.toContain(512);
    // (the plates from 24 mm on: the edge at 24 would leave 24 mm of track, and is no cut; from 256 on, it's one)
    expect(planCuts(box(rt, 0, 512), 256, 256, 512, 0, 24, [], [rt], 44).ys).not.toContain(24);
    expect(planCuts(box(rt, 0, 512), 256, 256, 512, 0, 256, [], [rt], 44).ys).toContain(256);
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
