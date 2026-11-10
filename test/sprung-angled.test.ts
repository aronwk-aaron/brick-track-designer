// Sprung blades on points at an angle to the baseplate's stud grid (track alone): their slider can't lie between the
// stud rows there, so it's the shallow one over them and the plates are thinner (switch/base.ts SPRUNG_THIN), their
// tops where the reference's are. They used to be rigid there.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, TEMPLATES, toRoutes } from '../src/app/design';
import { poseToWorld, routePose } from '../src/route/route';

const APP = (globalThis as { APP_DEFAULTS?: Record<string, unknown> }).APP_DEFAULTS!;
/** A template's routes turned by h about the grid's origin, after a short straight that fixes the grid. */
const turned = (name: string, h: number): Design['routes'] => [{ name: 'Z', x: -40, y: -40, heading: 0, segs: [{ kind: 'straight', studs: 8 }] },
  ...TEMPLATES[name].routes.map((r) => {
    const c = Math.cos((h * Math.PI) / 180), s = Math.sin((h * Math.PI) / 180);
    return { ...r, x: r.x * c - r.y * s, y: r.x * s + r.y * c, heading: r.heading + h };
  })];
const RAIL_TOP = 3.2 + 6.4;

describe('sprung blades at an angle to the stud grid', { timeout: 300000 }, () => {
  for (const [name, tpl, h] of [['a left switch at 30°', 'Left switch (LEGO)', 30], ['a right switch at 22.5°', 'Right switch (LEGO)', 22.5], ['a wye at 45°', 'Wye switch', 45]] as const)
    it(`${name}: sprung still, on thinner plates, the slider over the studs`, async () => {
    const w = await kernel(), d = { ...TEMPLATES[tpl], routes: turned(tpl, h) } as Design;
    clearBuildCache();
    const b = buildDesign(w, { ...d, options: { ...APP, ...d.options, legoTrack: 'print', ballast: 'none', bladeStyle: 'sprung', undersideGrid: 'baseplate', throwStyle: 'built-in', printBedX: 500, printBedY: 500 } } as Design);
    const man = (P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
    const blades = b.pieces.filter((p) => /points\d*-[ab]$/.test(p.name)), thr = b.pieces.filter((p) => /throw$/.test(p.name));
    const track = w.Manifold.union(b.pieces.filter((p) => !/points|throw|lever|bracket/.test(p.name)).map((p) => man(p.positions)));
    expect(blades).toHaveLength(2);
    expect(b.info.warnings.filter((x) => /sprung blades are on thinner plates.*at an angle to the baseplate grid/.test(x))).toHaveLength(1);
    for (const p of blades) {
      const m = man(p.positions), bb = m.boundingBox();
      // (sprung: the break-out supports in its spring's pocket, printed with it)
      expect(p.supports, p.name).toBeDefined();
      // (the plate 2.3 thick on the bed 3.9 up: its top 3.1 under the rail's top, as the reference's; above it only the rail)
      expect(bb.min[2]).toBeCloseTo(4.2, 2);
      expect(bb.max[2]).toBeCloseTo(RAIL_TOP, 2);
      expect(m.slice(RAIL_TOP - 3.1 - 0.05).area()).toBeGreaterThan(3 * m.slice(RAIL_TOP - 3.1 + 0.05).area());
      expect(m.intersect(track).volume(), p.name).toBeLessThan(0.01);
      // (its stud to turn on, up inside it)
      expect(m.hull().intersect(track).volume()).toBeGreaterThan(10);
      // (the slider's post between its spring's beams: as modelled, into the one it presses by the preload, no more)
      for (const q of thr) expect(m.intersect(man(q.positions)).volume()).toBeLessThan(3);
    }
    // (the slider over the baseplate's studs: its bar no lower than their tops and a floor)
    const g = routePose(toRoutes(d)[0], 0);
    for (const q of thr) {
      const m = man(q.positions), bb = m.boundingBox(), studs = [];
      expect(bb.min[2]).toBeGreaterThan(2.3);
      expect(m.intersect(track).volume()).toBeLessThan(0.05);
      for (let i = -80; i <= 80; i++) for (let j = -80; j <= 80; j++) {
        const s = poseToWorld(g, [4 + 8 * i, 4 + 8 * j]);
        if (s[0] > bb.min[0] - 4 && s[0] < bb.max[0] + 4 && s[1] > bb.min[1] - 4 && s[1] < bb.max[1] + 4) studs.push(w.Manifold.cylinder(1.8, 2.4, 2.4, 24).translate([s[0], s[1], 0]));
      }
      expect(studs.length).toBeGreaterThan(0);
      expect(w.Manifold.union(studs).intersect(track).volume(), 'the track on the studs').toBeLessThan(0.5);
    }
  });
});
