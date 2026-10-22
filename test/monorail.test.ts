// Monorail: the beam (monorail_straight.scad, monorail_curve.scad), its
// rack, ends and supports; monorail routes in a design, cut for the bed; a
// design with train track and monorail both.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad, type Man } from '../src/geom/scad';
import { MONO, Mono, rackGaps, supportPart } from '../src/geom/monorail';
import { buildDesign } from '../src/app/build';
import { monoChains, planCuts } from '../src/app/monobuild';
import { type Design, type DRoute, toRoutes } from '../src/app/design';
import type { Route } from '../src/route/route';

/** Is there solid at (x, y) at height z (a 0.2 mm square round it)? */
const solidAt = (w: Awaited<ReturnType<typeof kernel>>, m: Man, x: number, y: number, z: number) =>
  m.slice(z).intersect(w.CrossSection.square([0.2, 0.2], true).translate([x, y])).area() > 0.03;
/** A part's footprint on the bed (its STL). */
function footprint(stl: Uint8Array) {
  const d = new DataView(stl.buffer, stl.byteOffset), n = d.getUint32(80, true);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const x = d.getFloat32(84 + t * 50 + 12 + k * 12, true), y = d.getFloat32(84 + t * 50 + 16 + k * 12, true);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x1 - x0, y1 - y0];
}
const mono = (r: Omit<DRoute, 'system'>): DRoute => ({ ...r, system: 'monorail' });

describe('monorail', { timeout: 120000 }, () => {
  it('a straight 8 studs long: as monorail_straight.scad, one body, 40 rack gaps a flank from 1.55 mm, its ends', async () => {
    const w = await kernel(), m = new Mono(new Scad(w));
    const rt: Route = { id: 'S', start: [0, 0, 0], segments: [{ kind: 'straight', length: 64 }] };
    const gaps = rackGaps(rt);
    expect(gaps.filter((g) => g.side === 1).map((g) => g.s.toFixed(2)).slice(0, 3)).toEqual(['1.55', '3.15', '4.75']);
    expect(gaps.filter((g) => g.side === 1)).toHaveLength(40);
    expect(gaps.filter((g) => g.side === -1)).toHaveLength(40);
    const p = m.piece(rt, 0, 64, gaps);
    expect(p.decompose()).toHaveLength(1);
    // (OpenSCAD's render of monorail_straight.scad, labels off: 18617.33 mm3)
    expect(p.volume()).toBeCloseTo(18617.33, 0);
    // rack: a gap at 1.55 on each flank, a tooth between gaps
    expect(solidAt(w, p, 2.9, 1.55, 12)).toBe(false);
    expect(solidAt(w, p, -2.9, 1.55, 12)).toBe(false);
    expect(solidAt(w, p, 2.9, 2.35, 12)).toBe(true);
    // ends: anti-studs (4 in, 4 either side), axle holes (4.5 out, 5.6 up), the tab past the end, the notch, side studs
    for (const [x, y] of [[4, 4], [-4, 4], [4, 60], [-4, 60]]) expect(solidAt(w, p, x, y, 1), `anti-stud at ${x}, ${y}`).toBe(false);
    expect(solidAt(w, p, 4.5, 3, 5.6)).toBe(false);
    expect(solidAt(w, p, -4.5, 61, 5.6)).toBe(false);
    expect(solidAt(w, p, 9.7, -0.3, 5)).toBe(true);
    expect(solidAt(w, p, -9.7, 0.4, 5)).toBe(false);
    expect(solidAt(w, p, -9.7, 64.3, 5)).toBe(true);
    expect(solidAt(w, p, 14, 2, 6)).toBe(true);
    expect(solidAt(w, p, 15, 30, 5)).toBe(true); // (the full width between the narrow ends)
    expect(solidAt(w, p, 15, 8, 5)).toBe(false);
  });
  it('a curve R28 45°: one body, the rack spaced along each flank (111 and 108 gaps), its ends', async () => {
    const w = await kernel(), m = new Mono(new Scad(w));
    const L = (224 * Math.PI) / 4, rt: Route = { id: 'C', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 224, angle: 45 }] };
    const gaps = rackGaps(rt);
    expect(gaps.filter((g) => g.side === 1)).toHaveLength(111); // (outside: R 227.2)
    expect(gaps.filter((g) => g.side === -1)).toHaveLength(108);
    const p = m.piece(rt, 0, L, gaps);
    expect(p.decompose()).toHaveLength(1);
    expect(solidAt(w, p, 2.9, 1.55 * 224 / 227.2, 12)).toBe(false);
    expect(solidAt(w, p, 4, 4, 1)).toBe(false);
    expect(solidAt(w, p, 9.7, -0.3, 5)).toBe(true);
  });
  it('the support: as monorail_support.scad, one body', async () => {
    const sp = supportPart(new Scad(await kernel()));
    expect(sp.decompose()).toHaveLength(1);
    expect(sp.volume()).toBeCloseTo(5053.15, 0);
  });
  it('a long monorail loop on a 200 bed: cut square across into parts that fit, the rack in step across every cut', async () => {
    const d: Design = { version: 1, gaugeStuds: 4, options: { printBedX: 200, printBedY: 200, monoLabels: 'none' }, routes: [
      mono({ name: 'L', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }, { kind: 'curve', radius: 28, angle: 180 }, { kind: 'straight', studs: 48 }, { kind: 'curve', radius: 28, angle: 180 }] }),
    ] };
    const chains = monoChains(toRoutes(d));
    expect(chains).toHaveLength(1);
    const c = chains[0];
    expect(c.closed).toBe(true);
    // in step all round: each flank's gaps the same distance apart along that flank (a hair off 1.6 so a whole number go round), across every cut too
    const flankS = (s: number, side: number) => {
      let f = 0, at = 0;
      for (const sg of c.route.segments) {
        const l = sg.kind === 'straight' ? sg.length : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180, k = sg.kind === 'straight' ? 1 : 1 + (side * MONO.ridgeHw * Math.sign(sg.angle)) / sg.radius;
        if (s <= at + l) return f + (s - at) * k;
        f += l * k; at += l;
      }
      return f;
    };
    const cuts = planCuts(c.route, 0, c.L, 200, 200, 8, () => false);
    expect(cuts.length).toBeGreaterThan(3);
    for (const cut of cuts) expect(cut % 8).toBe(0);
    for (const side of [1, -1]) {
      const fs = c.gaps.filter((g) => g.side === side).map((g) => flankS(g.s, side));
      const steps = fs.slice(1).map((f, k) => f - fs[k]);
      expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(1e-6);
      expect(Math.abs(steps[0] - 1.6)).toBeLessThan(0.01);
      // (and a gap's flank either side of each cut a pitch apart)
      for (const cut of cuts) {
        const before = fs.filter((f) => f <= flankS(cut, side)).pop()!, after = fs.find((f) => f > flankS(cut, side))!;
        expect(after - before).toBeCloseTo(steps[0], 6);
      }
    }
    const b = buildDesign(await kernel(), d);
    expect(b.info.warnings).toEqual([]);
    const parts = b.pieces.filter((p) => p.name.startsWith('monorail'));
    expect(parts.length).toBeGreaterThan(4);
    for (const p of parts) { const [x, y] = footprint(p.stl); expect((x <= 200 && y <= 200) || (x <= 200 && y <= 200), `${p.name}: ${x.toFixed(0)} x ${y.toFixed(0)}`).toBe(true); }
  });
  it('two monorail beams crossing at 90°: a level crossing part of its own, flat in the middle, the beams cut either side of it', async () => {
    const d: Design = { version: 1, gaugeStuds: 4, options: { printBedX: 256, printBedY: 256 }, routes: [
      { name: 'A', x: 0, y: -24, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 48 }] },
      { name: 'B', x: 24, y: 0, heading: 90, system: 'monorail', segs: [{ kind: 'straight', studs: 48 }] },
    ] };
    const b = buildDesign(await kernel(), d);
    expect(b.pieces.map((p) => p.name).sort()).toEqual(['monorail-A-1', 'monorail-A-2', 'monorail-B-1', 'monorail-B-2', 'monorail-crossing']);
    expect(b.info.warnings.some((wn) => /beams run over/.test(wn))).toBe(false);
    // (the crossing: nothing above the beam's top in its middle, the racks on its arms)
    const x = b.pieces.find((p) => p.name === 'monorail-crossing')!.positions;
    let midTop = 0, armTop = 0;
    for (let i = 0; i < x.length; i += 3) {
      const ax = Math.abs(x[i]), ay = Math.abs(x[i + 1]);
      if (ax < 14 && ay < 14) midTop = Math.max(midTop, x[i + 2]);
      if (ax < 3 && ay > 22) armTop = Math.max(armTop, x[i + 2]);
    }
    expect(midTop).toBeCloseTo(MONO.beamTop, 1);
    expect(armTop).toBeCloseTo(MONO.ridgeTop, 1);
  });
  it('a design with train track and monorail: the train built as on its own; a warning where the beam runs into it, none on supports', async () => {
    const train: DRoute = { name: 'T', x: 0, y: -12, heading: 0, segs: [{ kind: 'straight', studs: 24 }] };
    const beam = mono({ name: 'M', x: 12, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 24 }] });
    const opts = { printBedX: 500, printBedY: 500 };
    const w = await kernel();
    const alone = buildDesign(w, { version: 1, gaugeStuds: 4, options: opts, routes: [train] });
    const both = buildDesign(w, { version: 1, gaugeStuds: 4, options: opts, routes: [train, beam] });
    const tr = both.pieces.filter((p) => !p.name.startsWith('monorail'));
    expect(tr.map((p) => p.name)).toEqual(alone.pieces.map((p) => p.name));
    tr.forEach((p, k) => expect(p.stl).toEqual(alone.pieces[k].stl));
    expect(both.pieces.filter((p) => p.name.startsWith('monorail'))).toHaveLength(1);
    expect(both.info.warnings.some((t) => /runs into train track/.test(t))).toBe(true);
    const up = buildDesign(w, { version: 1, gaugeStuds: 4, options: { ...opts, monoSupportStuds: 12 }, routes: [train, beam] });
    expect(up.info.warnings.filter((t) => /runs into train track/.test(t))).toEqual([]);
    expect(up.pieces.filter((p) => /support/.test(p.name)).length).toBeGreaterThanOrEqual(2);
  });
  it('monorail points where a branch leaves the main route: the switch and its sliding frame, the rest plain beam', async () => {
    const d: Design = { version: 1, gaugeStuds: 4, options: { monoLabels: 'none' }, routes: [
      mono({ name: 'Main', x: 0, y: -4, heading: 0, segs: [{ kind: 'straight', studs: 44 }] }),
      mono({ name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 28, angle: 45 }, { kind: 'straight', studs: 8 }] }),
    ] };
    const b = buildDesign(await kernel(), d);
    // (only the note that they're experimental)
    expect(b.info.warnings).toEqual(['monorail points are experimental: test-print a set before building more']);
    const names = b.pieces.map((p) => p.name);
    expect(names).toContain('monorail-points-base');
    expect(names).toContain('monorail-points-frame');
    expect(b.info.switches).toBe(1);
    expect(MONO.rackPitch).toBe(1.6);
  });
});
