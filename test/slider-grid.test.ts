// Sprung blades on track alone, the underside on the baseplate grid: the slider's bar lies in a groove down between two
// rows of the baseplate's studs, so it must be on the grid's stud corner lines. Points square to the grid but off its
// lines (the 45° double slip's far end, a switch moved off the grid) have their throw line moved onto them; points at
// an angle to it can't be, and get rigid blades (their slider above the underside), said. No slider runs into a stud.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { type Design, TEMPLATES, toRoutes } from '../src/app/design';
import { poseToWorld, routePose } from '../src/route/route';

const APP = (globalThis as { APP_DEFAULTS?: Record<string, unknown> }).APP_DEFAULTS!;
const moved = (name: string, h: number, dx: number, dy: number): Design['routes'] => [{ name: 'Z', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }] },
  ...TEMPLATES[name].routes.map((r) => {
    const c = Math.cos((h * Math.PI) / 180), s = Math.sin((h * Math.PI) / 180);
    return { ...r, x: r.x * c - r.y * s + dx / 8, y: r.x * s + r.y * c + dy / 8, heading: r.heading + h };
  })];

describe('sprung sliders between the baseplate\'s studs', { timeout: 300000 }, () => {
  for (const [name, d, angled, sprung] of [
    ['the 45° double slip', { ...TEMPLATES['Double slip (45°, R40)'] }, 2, 2],
    ['a switch moved off the grid', { ...TEMPLATES['Left switch (LEGO)'], routes: moved('Left switch (LEGO)', 0, 403, 5) }, 0, 1],
    ['a switch turned 90° and moved off the grid', { ...TEMPLATES['Left switch (LEGO)'], routes: moved('Left switch (LEGO)', 90, 403, 5) }, 0, 1],
    ['a switch at 30° to the grid', { ...TEMPLATES['Left switch (LEGO)'], routes: moved('Left switch (LEGO)', 30, 403, 5) }, 1, 0],
  ] as const) it(`${name}: no slider on a stud`, async () => {
    const w = await kernel();
    const b = buildDesign(w, { ...d, options: { ...APP, ...d.options, legoTrack: 'print', ballast: 'none', bladeStyle: 'sprung', undersideGrid: 'baseplate', throwStyle: 'built-in', printBedX: 500, printBedY: 500 } } as Design);
    const g = routePose(toRoutes(d as Design)[0], 0);
    const man = (P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
    const throws = b.pieces.filter((p) => /throw$/.test(p.name)).map((p) => ({ name: p.name, m: man(p.positions) }));
    expect(throws.length).toBeGreaterThan(0);
    // (sprung: a bar down in the hollow (under 1.8, the studs' height); rigid: in its tunnel over it)
    expect(throws.filter((t) => t.m.boundingBox().min[2] < 1.8)).toHaveLength(sprung);
    for (const t of throws) {
      const bb = t.m.boundingBox(), studs = [];
      for (let i = -60; i <= 60; i++) for (let j = -60; j <= 60; j++) {
        const q = poseToWorld(g, [4 + 8 * i, 4 + 8 * j]);
        if (q[0] > bb.min[0] - 4 && q[0] < bb.max[0] + 4 && q[1] > bb.min[1] - 4 && q[1] < bb.max[1] + 4) studs.push(w.Manifold.cylinder(1.8, 2.4, 2.4, 24).translate([q[0], q[1], 0]));
      }
      if (studs.length) expect(t.m.intersect(w.Manifold.union(studs)).volume(), `${t.name} into the studs`).toBeLessThan(1e-3);
    }
    const said = b.info.warnings.filter((x) => /at an angle to the baseplate grid/.test(x));
    expect(said.length).toBe(angled ? 1 : 0);
    if (angled) expect(/the (?:points|switches) at (.*), in studs/.exec(said[0])![1].split('; ')).toHaveLength(angled);
  });
});
