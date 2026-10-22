// Banked curves (curves.scad's superelevation): the bed, rails and studs
// turned about the inner rail's foot, ramping in and out, the underside flat.
import { describe, expect, it } from 'vitest';
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
  it('ramps in and out inside the curve, level at the ends; same-bank curves run on, reverse curves pass through level', () => {
    const [r] = toRoutes(design([curve(5)]));
    const L = (Math.PI / 4) * R40;
    expect(routeRoll(r, 0)).toBe(0);
    expect(routeRoll(r, 8)).toBe(0);            // the end connector's level stretch
    expect(routeRoll(r, 8 + 32)).toBeCloseTo(2.5, 6); // half way up an 8-stud ramp
    expect(routeRoll(r, L / 2)).toBe(5);
    expect(routeRoll(r, L - 4)).toBe(0);
    // (a left curve's bank is + (right side up); run the other way it's a right curve: -)
    expect(routeRoll(reversedRoute(r), L / 2)).toBe(-5);
    expect(routeRoll(subRoute(r, 40, L), L / 2 - 40)).toBe(5);
    const [two] = toRoutes(design([curve(4), curve(4)]));
    expect(routeRoll(two, L)).toBe(4);           // no ramp between them
    const [rev] = toRoutes(design([curve(4), curve(4, -45)]));
    expect(routeRoll(rev, L)).toBe(0);
    expect(routeRoll(rev, L / 2)).toBe(4);
    expect(routeRoll(rev, 1.5 * L)).toBe(-4);
    // ramps on the straights either side when the curve's ends say so
    const d = design([{ kind: 'straight', studs: 16 }, { ...curve(3), bankRamps: 'none' } as DSeg, { kind: 'straight', studs: 16 }]);
    const [st] = toRoutes(d);
    expect(routeRoll(st, 128)).toBe(3);
    expect(routeRoll(st, 128 - 32)).toBeCloseTo(1.5, 6);
    expect(bankRolls(d, d.routes[0]).warnings).toEqual([]);
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

  it('on ballast: the top follows the bank, the bottom stays flat, one body', async () => {
    const s = new Scad(await kernel()), L = (Math.PI / 4) * R40, o: CrossingOptions = { ...noSupports, ballast: 'ballast' };
    const flat = crossingPiece(s, toRoutes(design([curve()])), o);
    const m = crossingPiece(s, toRoutes(design([curve(6)])), o);
    expect(topAt(m, L / 2, G) - topAt(m, L / 2, -G)).toBeGreaterThan(2 * G * Math.sin((6 * Math.PI) / 180) - 0.05);
    expect(m.boundingBox().min[2]).toBeCloseTo(flat.boundingBox().min[2], 4);
    expect(m.decompose().filter((b) => b.volume() > 1).length).toBe(1); // (and no more than zero-volume slivers)
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
