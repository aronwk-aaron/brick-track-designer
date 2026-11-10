// Track alone: the end connectors' underside as the rest of the piece's, hollow (as a 1 x N plate: a channel along the
// row of studs, each held between its walls, a pin between each two), not a socket in a solid plate at each stud, on
// every kind of piece and either way the underside lines up; the peg and the C-clip with their walls, and the
// connector's top as solid as before (nothing cut up into it).
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { type Design, TEMPLATES, toRoutes } from '../src/app/design';
import { poseToWorld, type Pose, routeLength, routePose, worldToPose } from '../src/route/route';

const curve = { version: 1, gaugeStuds: 4, routes: [{ name: 'C', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }] } as Design;
const straight = { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] } as Design;
for (const [name, d, grid] of [
  ['straight', straight, 'track'], ['straight', straight, 'baseplate'], ['curve', curve, 'track'], ['curve', curve, 'baseplate'],
  ['Left switch (LEGO)', TEMPLATES['Left switch (LEGO)'], 'track'], ['Left switch (LEGO)', TEMPLATES['Left switch (LEGO)'], 'baseplate'],
  ['90° crossing', TEMPLATES['90° crossing'], 'baseplate'], ['Double slip (45°, R40)', TEMPLATES['Double slip (45°, R40)'], 'track'],
] as const) describe(`${name}, lined up with the ${grid}`, () => {
  it('its end connectors hollow underneath, as the rest', { timeout: 120000 }, async () => {
    const w = await kernel();
    const b = buildDesign(w, { ...d, options: { ...d.options, ballast: 'none', legoTrack: 'print', undersideGrid: grid, sleepers: 'sleepers', splitTrack: 'lengths', printBedX: 500, printBedY: 500 } });
    const man = (P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
    const track = b.pieces.filter((p) => /^track\d*$|switch-base/.test(p.name)).map((p) => man(p.positions));
    const z1 = w.CrossSection.union(track.map((m) => m.slice(1.0)));
    // (each route end's connector, in its frame: its row of studs on y = 0, the end at y = -4)
    const g0 = routePose(toRoutes(d)[0], 0), ends: Pose[] = toRoutes(d).flatMap((rt) => {
      const a = routePose(rt, 0), e = routePose(rt, routeLength(rt));
      return [[...poseToWorld(a, [0, 4]), a[2]] as Pose, [...poseToWorld(e, [0, -4]), e[2] + 180] as Pose];
    });
    let n = 0;
    for (const P of ends) {
      // (inside the piece, and on the grid it's lined up with: the baseplate's only where the end's square to it on its studs)
      const onGrid = grid === 'track' || [4, 12].every((lx) => worldToPose(g0, poseToWorld(P, [lx, 0])).every((v) => Math.abs(((((v - 4) % 8) + 8) % 8) - 4) > 3.999));
      if (!onGrid || track.every((m) => m.project().intersect(w.CrossSection.square([2, 2], true).translate(poseToWorld(P, [0, 0]))).area() < 3.9)) continue;
      n++;
      const box = w.CrossSection.square([60, 7], true).rotate(P[2]).translate(poseToWorld(P, [0, 0]));
      // (the pins: islands in the channel, one between each two studs)
      const pins = z1.intersect(box).decompose().filter((q) => q.area() > 4 && q.area() < 12);
      expect(pins.length, `pins at ${P.map((v) => v.toFixed(1))}`).toBeGreaterThanOrEqual(5);
      // (and each stud of its row clear, between the channel's walls 5.0 apart: 0.1 clear each side)
      for (let lx = -28; lx <= 28; lx += 8) {
        const q = poseToWorld(P, [lx, 0]);
        expect(w.CrossSection.circle(2.4, 32).translate(q).intersect(z1).area(), `stud at ${lx}`).toBeLessThan(0.05);
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});
