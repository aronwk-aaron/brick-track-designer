// Track alone, seen from underneath by the throw arm (sprung blades: the slider's bar in its groove down into the
// underside's hollow): the groove and the lever's opening closed underneath, nothing of the moving parts showing
// through, and the anti-stud tubes whole (none cut part way by the groove or the points' pockets); the arm's hollow
// with tubes in it, lined up with the track too.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { TEMPLATES, toRoutes } from '../src/app/design';
import { poseToWorld, routePose } from '../src/route/route';

const TUBE_OD = 6.51 - 0.06, TUBE_ID = 4.8 + 0.06;
for (const [name, more] of [
  ['Left switch (LEGO)', {}],
  ['Double slip (45°, R40)', { undersideGrid: 'track' }],
  ['Double slip (45°, R40)', { undersideGrid: 'baseplate' }],
] as const) describe(`${name}, ${JSON.stringify(more)}`, () => {
  it('the throw closed underneath, whole tubes', { timeout: 120000 }, async () => {
    const w = await kernel();
    const b = buildDesign(w, { ...TEMPLATES[name], options: { ...TEMPLATES[name].options, ballast: 'none', legoTrack: 'print', bladeStyle: 'sprung', throwStyle: 'built-in', sleepers: 'sleepers', splitTrack: 'lengths', printBedX: 500, printBedY: 500, ...more } });
    const man = (P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
    const track = b.pieces.filter((p) => /^track\d*$|switch-base/.test(p.name)).map((p) => man(p.positions));
    const moving = b.pieces.filter((p) => /points|throw/.test(p.name) && !/lever|bought/.test(p.name));
    expect(moving.length).toBeGreaterThan(2);
    // (under each moving part, some of the piece: none of it to be seen from below through the groove or the opening;
    // on the baseplate grid, but where a baseplate's stud stands in the hole, as where the points' frame is off the grid)
    const below = (zTop: number) => w.CrossSection.union(track.flatMap((m) => [0.1, 0.6, 1.1, 1.6, 2.1, 2.6, 3.1].filter((z) => z < zTop).map((z) => m.slice(z))));
    const g = routePose(toRoutes(TEMPLATES[name])[0], 0), studs: ReturnType<typeof w.CrossSection.circle>[] = [];
    if ((more as { undersideGrid?: string }).undersideGrid !== 'track') for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) studs.push(w.CrossSection.circle(2.5, 24).translate(poseToWorld(g, [4 + 8 * i, 4 + 8 * j])));
    const studCS = w.CrossSection.union(studs);
    for (const p of moving) {
      const m = man(p.positions), seen = m.project().subtract(below(m.boundingBox().min[2] - 0.05)).subtract(studCS).area();
      expect(seen, p.name).toBeLessThan(0.5);
    }
    // (every gripping tube whole, in the hollow: its ring all there)
    const ring = w.CrossSection.circle(TUBE_OD / 2, 24).subtract(w.CrossSection.circle(TUBE_ID / 2, 24)), full = ring.area();
    const z1 = w.CrossSection.union(track.map((m) => m.slice(1.0)));
    expect(b.overlay.grips.length).toBeGreaterThan(10);
    for (const q of b.overlay.grips) expect(z1.intersect(ring.translate(q)).area(), `tube at ${q.map((v) => v.toFixed(1))}`).toBeGreaterThan(full - 0.3);
  });
});
