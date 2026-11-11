// the sprung blades (bladeStyle 'sprung', switch/base.ts SPRUNG): each blade a 3 mm
// plate on a stud with its rail on top, the spring's pocket underneath with
// its two beams and the supports for its roof (separate bits, broken out
// after printing). Clear of the base closed and open. On track alone too:
// the bed at the sleepers' top, the slider in a groove through it between
// the underside's stud rows (context.ts SPRUNG_SLIDER), clear of the base both ways.
// A lip on the bed over each plate's front holds it down (base.ts LIP), as the
// reference switch's: clear of the plate closed and open, the plate's front
// bevelled under it; the blade goes in tilted under it (assembly.shared.ts).
// Beside other track: the plate cut clear of its rail, the pocket keeping
// its wall to the cut, the beams whole in it (fdb-plates has the plan's numbers).
import { describe, expect, it } from 'vitest';
import type { Route } from '../src/route/route';
import { BASE_DEFAULTS, sprungLipFits, switchGeometry, switchPlan } from '../src/switch/base';
import { kernel } from '../src/geom/kernel';
import { type Man, R, Scad, T } from '../src/geom/scad';
import { HEAD_HW, PLATE_H } from '../src/switch/context';
import { hanging } from './assembly.shared';

const A: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'straight', length: 500 }] };
const B: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 832, angle: 22.5 }, { kind: 'straight', length: 150 }] };
const p = { ...BASE_DEFAULTS, mechStyle: 'plates' as const, throwAction: 'detent' as const, bladeStyle: 'sprung' as const, generateBallast: true };

describe("the sprung blades", () => {
  it('a 3 mm plate under a 3 mm rail; the supports separate; clear of the base both ways', async () => {
    const plan = switchPlan([A, B], [[0, 1, 12]], p, 1), s = new Scad(await kernel()), gm = switchGeometry(s, plan), base = gm.base();
    const parts = gm.pointsParts(0), turns = gm.pointsTurns(0)!;
    expect(parts.length).toBe(2);
    for (const [k, m] of parts.entries()) {
      const bb = m.boundingBox();
      expect(bb.max[2] - bb.min[2]).toBeGreaterThan(6);         // plate 3 + rail 3.1
      expect(m.decompose().length).toBe(3);                      // the blade, and the two supports in its pocket
      for (const a of [0, turns[k].swing]) {
        const at = T(R(T(m, [-turns[k].at[0], -turns[k].at[1], 0]), [0, 0, a]), [turns[k].at[0], turns[k].at[1], 0]);
        expect(s.intersection(at, base).volume()).toBeLessThan(1e-3);
      }
    }
  }, 120000);

  it('a short blade (R40): the spring rooted in the plate (one body with it), its pocket short of the stud hole', async () => {
    const B40: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: 150 }] };
    const plan = switchPlan([{ ...A, segments: [{ kind: 'straight', length: 300 }] }, B40], [[0, 1, 12]], { ...p, generateBallast: false }, 1), s = new Scad(await kernel()), gm = switchGeometry(s, plan);
    for (const m of gm.pointsParts(0)) {
      expect(m.decompose().length).toBe(3);                      // the blade with its beams, and the two supports
      const bb = m.boundingBox(), cut = m.slice(bb.min[2] + 0.5).toPolygons() as number[][][];
      // (no hole round the stud's that runs into the pocket: the stud's hole is a closed circle on its own)
      expect(cut.length).toBeGreaterThan(3);
    }
  }, 120000);

  it('track alone: the bed at the sleepers\' top, a 3 mm plate under a 3.1 rail; blades and slider clear of the base both ways', async () => {
    const q = { ...p, generateBallast: false };
    const plan = switchPlan([A, B], [[0, 1, 12]], q, 1), s = new Scad(await kernel()), gm = switchGeometry(s, plan), base = gm.base();
    expect(plan.notes.join(' ')).not.toMatch(/sprung/);
    expect(plan.g.bedTop).toBeCloseTo(PLATE_H, 6);
    const v = plan.sets[0], parts = gm.pointsParts(0), turns = gm.pointsTurns(0)!;
    expect(v.throwY % 8).toBeCloseTo(0, 6);                    // the slider between two stud rows
    expect(parts.length).toBe(2);
    for (const [k, m] of parts.entries()) {
      const bb = m.boundingBox();
      expect(bb.min[2]).toBeCloseTo(PLATE_H + p.pointClearance, 3);
      expect(bb.max[2] - bb.min[2]).toBeCloseTo(3 + 3.1, 1);   // plate 3 + rail 3.1, up to the rail top
      expect(m.decompose().length).toBe(3);
      for (const a of [0, turns[k].swing]) {
        const at = T(R(T(m, [-turns[k].at[0], -turns[k].at[1], 0]), [0, 0, a]), [turns[k].at[0], turns[k].at[1], 0]);
        expect(s.intersection(at, base).volume()).toBeLessThan(1e-3);
      }
    }
    const thr = gm.throwPart(0);
    for (const dx of [0, v.leverTravel]) expect(s.intersection(T(thr, [dx, 0, 0]), base).volume()).toBeLessThan(1e-3);
    // (the slider over a baseplate's studs: clear of every stud under the base, wherever it is)
    const tb = thr.boundingBox(), studs: Man[] = [];
    for (let x = Math.floor(tb.min[0] / 8) * 8 - 4; x <= tb.max[0] + v.leverTravel + 4; x += 8)
      for (let y = Math.floor(tb.min[1] / 8) * 8 - 4; y <= tb.max[1] + 4; y += 8) studs.push(T(s.cylinder(1.8, 2.4, 2.4, 24), [x, y, 0]));
    for (const dx of [0, v.leverTravel]) expect(s.intersection(T(thr, [dx, 0, 0]), s.union(studs)).volume()).toBeLessThan(1e-3);
  }, 120000);

  for (const gb of [true, false]) it(`${gb ? 'on ballast' : 'track alone'}: a lip over each plate's front, closed and open, clear of it; the front can't lift; under the wheels' flanges; prints`, async () => {
    const q = { ...p, generateBallast: gb };
    const plan = switchPlan([A, B], [[0, 1, 12]], q, 1), w = await kernel(), s = new Scad(w), gm = switchGeometry(s, plan), base = gm.base();
    expect(plan.sets[0].fdb!.map((f) => f.lip)).toEqual([true, true]);
    expect(plan.notes.join(' ')).not.toMatch(/lip/);
    const parts = gm.pointsParts(0), turns = gm.pointsTurns(0)!, railTop = PLATE_H + 6.4, c = q.pointClearance;
    for (const [k, m] of parts.entries()) {
      const t2 = turns[k], ends = t2.tilt!, yF = Math.min(ends[0][1], ends[1][1]);
      // (the plate's first 3 mm, where the lip is over it)
      const front = m.intersect(s.cube([400, 3 + Math.abs(ends[0][1] - ends[1][1]), 30]).translate([-200, yF - 1, -10]));
      for (const a of [0, t2.swing]) {
        const turn = (x: Man) => T(R(T(x, [-t2.at[0], -t2.at[1], 0]), [0, 0, a]), [t2.at[0], t2.at[1], 0]);
        expect(s.intersection(turn(m), base).volume()).toBeLessThan(1e-3);
        // (room to move: free a little way up; then held, the lip over it)
        expect(s.intersection(T(turn(front), [0, 0, 0.25]), base).volume()).toBeLessThan(1e-3);
        expect(s.intersection(T(turn(front), [0, 0, 1.2]), base).volume()).toBeGreaterThan(0.5);
      }
      // (the lip: in front of the plate and over it, from its stock rail's head in; its top under a wheel's flange, the
      // flangeway's depth below the rail's top; nothing in it hanging as printed)
      const xs = ends.map((e) => e[0]), side = k === 0 ? 1 : -1, xStock = side * -plan.G + side * (HEAD_HW + 0.1);
      const x0 = side > 0 ? xStock : Math.min(...xs) - 1, x1 = side > 0 ? Math.max(...xs) + 1 : xStock;
      const lip = base.intersect(s.cube([x1 - x0, 8, 20]).translate([x0, yF - 5, plan.g.bedTop + 0.01]));
      const bb = lip.boundingBox();
      expect(bb.max[2]).toBeLessThanOrEqual(railTop - q.flangewayDepth - 0.2 + 1e-6);
      expect(bb.max[2]).toBeGreaterThan(plan.g.bedTop + c + 2.5);
      expect(bb.max[1]).toBeGreaterThan(yF + 1.5);                // (over the plate's bevel)
      expect(hanging(w, base.intersect(s.cube([x1 - x0, 8, 20]).translate([x0, yF - 5, plan.g.bedTop - 0.5])))).toBeLessThan(0.5);
    }
  }, 240000);

  it('single point: the moving blade has its lip, the fixed rail none; other track too near a front: no lip', async () => {
    const plan1 = switchPlan([A, B], [[0, 1, 12]], { ...p, pointBlades: 1 }, 1), v = plan1.sets[0];
    expect(v.fdb!.map((f, b) => (b === v.fixed ? undefined : f.lip))).toEqual(v.fixed === 0 ? [undefined, true] : [true, undefined]);
    const gm = switchGeometry(new Scad(await kernel()), plan1);
    expect(gm.pointsTurns(0)!.map((t2) => !!t2.tilt)).toEqual([true]);
    // (another track's rail just past a plate's front: no room for the lip. Asked of the lip on its own: a rail across 5
    // past the front, then 30)
    const plan2 = switchPlan([A, B], [[0, 1, 12]], p, 1), v2 = plan2.sets[0], f = v2.fdb![0];
    const across = (y: number) => ({ ...f, keep: [Array.from({ length: 21 }, (_, k) => [-40 + 4 * k, y] as [number, number])] });
    expect(sprungLipFits(v2, 0, p, across(11 - 5))).toBe(false);
    expect(sprungLipFits(v2, 0, p, across(11 - 30))).toBe(true);
    // (and so built: none, and a note)
    v2.fdb![0].lip = false;
    expect(switchGeometry(new Scad(await kernel()), plan2).pointsTurns(0)!.map((t2) => !!t2.tilt)).toEqual([false, true]);
  }, 120000);

  for (const gb of [false, true]) it(`${gb ? 'on ballast' : 'track alone'}: a rail running alongside 18 mm in: sprung, the plate cut clear of it closed and open, the pocket's wall kept, the beams whole; clear of the base`, async () => {
    // (the R40 switch; a straight track whose right rail runs 18 in from blade 0, the straight route's left rail)
    const A40: Route = { ...A, segments: [{ kind: 'straight', length: 300 }] }, B40: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: 150 }] };
    const q = { ...p, generateBallast: gb }, F: Route = { id: 'F', start: [18 - 40, -40, 0], segments: [{ kind: 'straight', length: 300 }] };
    const plan = switchPlan([A40, B40], [[0, 1, 12]], q, 1, [F]), f = plan.sets[0].fdb![0];
    expect(f.blocked).toBeUndefined();
    expect(f.keep.length).toBeGreaterThan(0);
    const w = await kernel(), s = new Scad(w), gm = switchGeometry(s, plan), base = gm.base(), parts = gm.pointsParts(0), turns = gm.pointsTurns(0)!;
    const m = parts[0], t2 = turns[0], z0 = m.boundingBox().min[2], xr = 18 - 20;
    // (the other rail: its foot's half-width at the plate's height, 3, and the clearance)
    const rail = s.cube([2 * (3 + q.pointClearance), 400, 20]).translate([xr - 3 - q.pointClearance, -100, z0 - 5]);
    for (const [k, mk] of parts.entries()) for (const a of [0, turns[k].swing]) {
      const at = T(R(T(mk, [-turns[k].at[0], -turns[k].at[1], 0]), [0, 0, a]), [turns[k].at[0], turns[k].at[1], 0]);
      expect(s.intersection(at, base).volume()).toBeLessThan(1e-3);
      if (k === 0) expect(s.intersection(at, rail).volume()).toBeLessThan(1e-3);
    }
    expect(m.decompose().length).toBeGreaterThanOrEqual(2);    // (the blade, and the supports in its pocket)
    // (the pocket, at its middle's height: what's open there under the plate's top; on the other rail's side of the post,
    // at least the wall in from the plate's cut edge. Toward its own rail the pocket opens, as always, onto the cut round
    // the stock rail's foot)
    const top = m.slice(z0 + 2.6), mid = m.slice(z0 + 0.9), inner = top.offset(-1.2 + 0.02, 'Miter', 1000);
    const pocket = top.subtract(mid).intersect(s.square([40, 200]).translate([f.post[0], -50]));
    expect(pocket.area()).toBeGreaterThan(20);                 // (round the inner beam and its support, half the post's slot)
    expect(pocket.subtract(inner).area()).toBeLessThan(0.01);
    // (the beams there, either side of the post, as long as the spring)
    const beams = mid.intersect(s.square([2.2 + 2 * 1.2, 12]).translate([f.post[0] - 1.1 - 1.2, f.post[1] + 6]));
    expect(beams.area()).toBeGreaterThan(2 * 1.2 * 12 * 0.7);
    expect(t2.swing).toBeGreaterThan(0);
  }, 120000);
});
