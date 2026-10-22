// Banked curves (curves.scad's superelevation): the bed, rails and studs
// turned about the inner rail's foot, ramping in and out, the underside flat.
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { kernel } from '../src/geom/kernel';
import { Scad, type Man } from '../src/geom/scad';
import { CROSSING_DEFAULTS, type CrossingOptions, crossingPiece } from '../src/geom/crossing';
import { bankRolls, type Design, type DSeg, toRoutes } from '../src/app/design';
import { buildDesign } from '../src/app/build';
import { routeRoll } from '../src/route/route';
import { reversedRoute } from '../src/switch/reverse';
import { subRoute } from '../src/switch/pieces';

const R40 = 40 * 8, G = 20;
const design = (segs: DSeg[], options = {}): Design => ({ version: 1, gaugeStuds: 4, options, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs }] });
const curve = (bank?: number, angle = 45): DSeg => ({ kind: 'curve', radius: 40, angle, ...(bank !== undefined ? { bank } : {}) });

/** The highest point of the mesh within 1.5 mm across of offset lat from a left R40 curve from the origin heading +y, at arc length s (within along mm). */
function topAt(m: Man, s: number, lat: number, along = 0.5): number {
  const mesh = m.getMesh(), vp = mesh.vertProperties, np = mesh.numProp;
  let z = -Infinity;
  for (let i = 0; i < vp.length; i += np) {
    const x = vp[i] + R40, y = vp[i + 1], r = Math.hypot(x, y), sa = Math.atan2(y, x) * R40;
    if (Math.abs(r - R40 - lat) < 1.5 && Math.abs(sa - s) < along) z = Math.max(z, vp[i + 2]);
  }
  return z;
}

describe('banked curves', { timeout: 120000 }, () => {
  const noSupports: CrossingOptions = { ...CROSSING_DEFAULTS, supports: false };
  it('eases in on the straights before and after (no kink, within the climb limit); same-bank curves run on, reverse curves ease through level', () => {
    const L = (Math.PI / 4) * R40, sn = (d: number) => Math.sin((d * Math.PI) / 180);
    // straight 48, a 3° curve, straight 48: the ramps on the straights, the curve banked in full end to end
    const d = design([{ kind: 'straight', studs: 48 }, curve(3), { kind: 'straight', studs: 48 }]);
    const [st] = toRoutes(d), B0 = 384, B1 = 384 + L;
    expect(bankRolls(d, d.routes[0]).warnings).toEqual([]);
    expect(routeRoll(st, B0)).toBeCloseTo(3, 6);
    expect(routeRoll(st, B1)).toBeCloseTo(3, 6);
    expect(routeRoll(st, B0 - 160)).toBeCloseTo(1.5, 2);   // half way up a 40-stud ramp
    expect(routeRoll(st, B0 - 320)).toBe(0);
    expect(routeRoll(st, 0)).toBe(0);
    // the outer rail's height (40 mm gauge: 40 sin(roll)): its slope never over 1 in 100, and no kink (its slope changes smoothly)
    const step = 4, h = (sAt: number) => 40 * sn(routeRoll(st, sAt)), Ltot = B1 + 384;
    let maxSlope = 0, maxBend = 0, prev = 0;
    for (let sAt = step; sAt < Ltot; sAt += step) {
      const slope = (h(sAt) - h(sAt - step)) / step;
      maxSlope = Math.max(maxSlope, Math.abs(slope));
      if (sAt > step) maxBend = Math.max(maxBend, Math.abs(slope - prev) / step);
      prev = slope;
    }
    expect(maxSlope).toBeLessThan(1 / 100);
    expect(maxBend).toBeLessThan(1.5e-4); // (per mm, over 4 mm: smoothstep's 6 x rise / length^2 is 1.2e-4)
    writeFileSync(`${tmpdir()}/bank-profile.json`, JSON.stringify({ maxSlope, maxBend, h: Array.from({ length: Math.floor(Ltot / 2) }, (_, k) => [2 * k, h(2 * k)]) }));
    // on its own (no straights) a curve eases in and out inside itself, level at the connectors, full bank in the middle
    const [r] = toRoutes(design([curve(5)]));
    expect(routeRoll(r, 8)).toBe(0);
    expect(routeRoll(r, L / 2)).toBeCloseTo(5, 6);
    expect(routeRoll(r, L - 8)).toBeCloseTo(0, 6);
    // (a left curve's bank is + (right side up); run the other way it's a right curve: -)
    expect(routeRoll(reversedRoute(r), L / 2)).toBeCloseTo(-5, 6);
    expect(routeRoll(subRoute(r, 40, L), L / 2 - 40)).toBeCloseTo(5, 6);
    // too short for a 1 in 100 ramp at 5°: warned, with where
    expect(bankRolls(design([curve(5)]), design([curve(5)]).routes[0]).warnings[0]).toMatch(/at -?\d+\.\d, -?\d+\.\d \(studs\) climbs 1 in \d+, steeper than 1 in 100/);
    const [two] = toRoutes(design([curve(4), curve(4)]));
    expect(routeRoll(two, L)).toBe(4);           // no ramp between them
    const [rev] = toRoutes(design([curve(4), curve(4, -45)]));
    expect(routeRoll(rev, L)).toBeCloseTo(0, 6);
    expect(routeRoll(rev, L / 2)).toBeCloseTo(4, 6);
    expect(routeRoll(rev, 1.5 * L)).toBeCloseTo(-4, 6);
    // inside the curve, as the plate-style pieces: in the curve as far as it can (half of it each end), the rest on the straight
    const dc = { ...d, options: { bankRampAt: 'curve' as const } };
    const [ic] = toRoutes(dc);
    expect(routeRoll(ic, B0 + L / 2)).toBeCloseTo(3, 6);
    expect(routeRoll(ic, B0)).toBeGreaterThan(1);
    expect(routeRoll(ic, B0 - 200)).toBe(0);
    expect(bankRolls(dc, dc.routes[0]).warnings).toEqual([]);
    // a route end left banked
    const [kept] = toRoutes(design([{ ...curve(3), bankRamps: 'none' } as DSeg]));
    expect(routeRoll(kept, 0)).toBe(3);
    // monorail routes are left alone
    const mono = design([curve(5)]); mono.routes[0].system = 'monorail';
    expect(toRoutes(mono)[0].segments[0].roll).toBeUndefined();
    // a bank of 0 leaves the routes as they were
    expect(JSON.stringify(toRoutes(design([curve(0)])))).toBe(JSON.stringify(toRoutes(design([curve()]))));
  });

  it('a banked R40 curve: rail tops differ by gauge x sin(bank) mid-curve, level at the ends, flat underneath, one body', async () => {
    const s = new Scad(await kernel()), bank = 5, L = (Math.PI / 4) * R40;
    const flat = crossingPiece(s, toRoutes(design([curve()])), noSupports);
    const m = crossingPiece(s, toRoutes(design([curve(bank)])), noSupports);
    const rise = topAt(m, L / 2, G) - topAt(m, L / 2, -G);
    expect(rise).toBeGreaterThan(2 * G * Math.sin((bank * Math.PI) / 180) - 0.05);
    expect(rise).toBeLessThan(2 * G * Math.sin((bank * Math.PI) / 180) + 0.25);
    for (const sAt of [6, L - 6]) expect(Math.abs(topAt(m, sAt, G, 2) - topAt(m, sAt, -G, 2))).toBeLessThan(0.02);
    expect(topAt(m, 6, G, 2)).toBeCloseTo(topAt(flat, 6, G, 2), 3);
    expect(m.boundingBox().min[2]).toBeCloseTo(flat.boundingBox().min[2], 4);
    // (the underside's floor: the same slice through it as the level curve's, a little above the bottom)
    expect(m.slice(0.05).area()).toBeGreaterThan(0.9 * flat.slice(0.05).area());
    expect(m.decompose().filter((b) => b.volume() > 1).length).toBe(1); // (and no more than zero-volume slivers)
    expect(m.volume()).toBeGreaterThan(flat.volume());
  });

  it('at the steepest bank (10°), track only: the underside hollow stays under the inner side lowered top (one body)', async () => {
    const s = new Scad(await kernel());
    const m = crossingPiece(s, toRoutes(design([curve(10)])), noSupports);
    expect(m.decompose().filter((b) => b.volume() > 1).length).toBe(1);
  });

  it('guard rails (pointed ends) and a third rail turn with the track', async () => {
    const s = new Scad(await kernel()), L = (Math.PI / 4) * R40, sn = Math.sin((5 * Math.PI) / 180);
    const d = (bank?: number, extra = {}): Design => ({ ...design([curve(bank)]), routes: [{ ...design([curve(bank)]).routes[0], ...extra }] });
    const gx = G - 2.5 - 0.8 * 8;
    const m = crossingPiece(s, toRoutes(d(5, { guardRails: true })), noSupports);
    expect(topAt(m, L / 2, gx, 3) - topAt(m, L / 2, -gx, 3)).toBeCloseTo(2 * gx * sn, 1);
    // (with pointed ends, laid along the route, not swept: turned too, still one body)
    const mp = crossingPiece(s, toRoutes(d(5, { guardRails: true, guardRailEnds: 'both' })), noSupports);
    expect(mp.decompose().filter((b) => b.volume() > 1).length).toBe(1);
    // (the third rail, 2-stud narrow gauge sharing the right rail: 24 mm left of it)
    const m2 = crossingPiece(s, toRoutes(d(5, { dualGauge: true, dualGaugeStuds: 2 })), noSupports);
    expect(topAt(m2, L / 2, G - 24, 3) - topAt(m2, L / 2, -G, 3)).toBeCloseTo(16 * sn, 1);
  });

  it('track only with sleepers: the sleepers turned with the bank, flat underneath, one body', async () => {
    const s = new Scad(await kernel()), L = (Math.PI / 4) * R40, o: CrossingOptions = { ...noSupports, sleepers: 'sleepers', sleeperGapStuds: 2 };
    const flat = crossingPiece(s, toRoutes(design([curve()])), o);
    const m = crossingPiece(s, toRoutes(design([curve(5)])), o);
    // (a sleeper's ends: the outer one raised, the inner one lowered, by about their distance from the inner rail x sin(bank))
    const sn = Math.sin((5 * Math.PI) / 180), hw = 32, mid = L / 2;
    const top = (lat: number) => topAt(m, mid, lat, 6);
    expect(top(hw - 1) - top(-hw + 1)).toBeGreaterThan(2 * (hw - 1) * sn - 0.3);
    expect(m.boundingBox().min[2]).toBeCloseTo(flat.boundingBox().min[2], 4);
    expect(m.decompose().filter((b) => b.volume() > 1).length).toBe(1);
  });

  it('on ballast: the top follows the bank, the bottom stays flat, one body', async () => {
    const s = new Scad(await kernel()), L = (Math.PI / 4) * R40, o: CrossingOptions = { ...noSupports, ballast: 'ballast' };
    const flat = crossingPiece(s, toRoutes(design([curve()])), o);
    const m = crossingPiece(s, toRoutes(design([curve(6)])), o);
    expect(topAt(m, L / 2, G) - topAt(m, L / 2, -G)).toBeGreaterThan(2 * G * Math.sin((6 * Math.PI) / 180) - 0.05);
    expect(m.boundingBox().min[2]).toBeCloseTo(flat.boundingBox().min[2], 4);
    expect(m.decompose().filter((b) => b.volume() > 1).length).toBe(1); // (and no more than zero-volume slivers)
  });

  it('track and ballast printed apart: both parts build, the warnings clear', async () => {
    const b = buildDesign(await kernel(), design([curve(5)], { printBedX: 500, printBedY: 500, ballast: 'ballast', trackBallast: 'apart' }));
    expect(b.info.warnings.filter((w) => !/bank's ramp/.test(w))).toEqual([]); // (a curve on its own: its ramps steeper than the limit, warned)
    expect(b.pieces.length).toBeGreaterThanOrEqual(2);
  });

  it('left level, with a warning, where another track crosses it', async () => {
    const d: Design = { version: 1, gaugeStuds: 4, options: { printBedX: 500, printBedY: 500 }, routes: [
      { name: 'Curve', x: 0, y: -12, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 30, bank: 4 }] },
      { name: 'B', x: 12, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 24 }] },
    ] };
    const b = buildDesign(await kernel(), d);
    expect(b.info.warnings.some((w) => /bank on Curve is left out/.test(w))).toBe(true);
  });
});
