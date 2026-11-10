// Underside lined up with: The baseplate grid (the app's default): every kind of piece's underside on the design's stud
// grid (the first route's start: studs at 4 + 8k, tubes at 8k, in its frame), with or without ballast and sleepers.
// At each grid stud under a part the stud fits (nothing where it goes, up to its height), some of them are gripped (a
// tube or a socket's wall beside it), and every anti-stud tube stands between four of them.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { type Design, TEMPLATES, toRoutes } from '../src/app/design';
import { poseToWorld, routeLength, routePose, worldToPose } from '../src/route/route';

const APP = (globalThis as { APP_DEFAULTS?: Record<string, unknown> }).APP_DEFAULTS!;
const T = (name: string, more: Record<string, unknown> = {}, routes?: Design['routes']): Design => ({ ...TEMPLATES[name], ...(routes && { routes }), options: { ...TEMPLATES[name]?.options, legoTrack: 'print', printBedX: 500, printBedY: 500, ...more } });
// (a template's routes turned h degrees and moved off by (dx, dy) mm, after a short straight at the origin that sets the grid)
const turned = (name: string, h: number, dx: number, dy: number): Design['routes'] => [{ name: 'Z', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }] },
  ...TEMPLATES[name].routes.map((r) => {
    const c = Math.cos((h * Math.PI) / 180), s = Math.sin((h * Math.PI) / 180);
    return { ...r, x: r.x * c - r.y * s + dx / 8, y: r.x * s + r.y * c + dy / 8, heading: r.heading + h };
  })];
const near8 = (v: number) => { const e = ((v % 8) + 8) % 8; return Math.min(e, 8 - e); };

async function check(d: Design) {
  const rts = toRoutes(d), g = routePose(rts[0], 0), grid = (x: number, y: number) => poseToWorld(g, [x, y]);
  // (the track's ends, facing out: grid spots past them are under the breakaway supports there, which come off)
  const ends = rts.flatMap((rt) => { const a = routePose(rt, 0), e = routePose(rt, routeLength(rt)); return [[a[0], a[1], a[2] + 180], e]; });
  const past = (q: [number, number]) => ends.some((e) => { const h = (e[2] * Math.PI) / 180; return Math.hypot(q[0] - e[0], q[1] - e[1]) < 60 && (q[0] - e[0]) * -Math.sin(h) + (q[1] - e[1]) * Math.cos(h) > -2; });
  const w = await kernel(), b = buildDesign(w, { ...d, options: { ...APP, ...d.options, undersideGrid: 'baseplate' } });
  const off = b.overlay.grips.filter((q) => worldToPose(g, q).some((v) => near8(v) > 0.01));
  const out: { name: string; under: number; clash: number; grip: number }[] = [];
  for (const p of b.pieces) {
    if (!/^track\d*|switch-base|-ballast/.test(p.name) || p.lego) continue;
    const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(p.positions), triVerts: new Uint32Array(p.positions.length / 3).map((_, i) => i) }); mesh.merge();
    const m = new w.Manifold(mesh), bb = m.boundingBox(), z0 = bb.min[2];
    if (z0 > 0.5) continue; // (raised track: on its supports, not the baseplate)
    const inner = m.project().offset(-0.6, 'Miter', 1000), sl = [1.0, 1.7].map((h) => m.slice(z0 + h));
    const corners = [[bb.min[0], bb.min[1]], [bb.max[0], bb.min[1]], [bb.min[0], bb.max[1]], [bb.max[0], bb.max[1]]].map((q) => worldToPose(g, q as [number, number]));
    const [i0, i1] = [Math.min(...corners.map((q) => q[0])), Math.max(...corners.map((q) => q[0]))], [j0, j1] = [Math.min(...corners.map((q) => q[1])), Math.max(...corners.map((q) => q[1]))];
    let under = 0, clash = 0, grip = 0;
    for (let i = Math.floor(i0 / 8) * 8 + 4; i <= i1; i += 8) for (let j = Math.floor(j0 / 8) * 8 + 4; j <= j1; j += 8) {
      const q = grid(i, j);
      if (past(q) || w.CrossSection.circle(2.4, 32).translate(q).subtract(inner).area() > 0.01) continue;
      under++;
      const s = w.CrossSection.circle(2.36, 32).translate(q);
      // (near the hollow's roof, more than a sliver: the mesh read back from its float positions leaves a mm2 or so there
      // that the solid it was made from hasn't)
      if (s.intersect(sl[0]).area() > 0.05 || s.intersect(sl[1]).area() > 2) { clash++; continue; }
      if (w.CrossSection.circle(2.55, 32).translate(q).subtract(s).intersect(sl[0]).area() > 0.02) grip++;
    }
    out.push({ name: p.name, under, clash, grip });
  }
  return { parts: out, off: off.length, tubes: b.overlay.grips.length };
}

describe('undersides on the design\'s stud grid', { timeout: 600000 }, () => {
  for (const [name, d] of [
    ['a switch with the throw arm, moved off the grid', T('Left switch (LEGO)', { throwStyle: 'built-in' }, turned('Left switch (LEGO)', 0, 403, 5))],
    ['a curve turned 22.5°, sleepers, in lengths', T('Oval (LEGO R40)', { sleepers: 'sleepers', splitTrack: 'lengths' })],
    ['an oval cut for a small bed, a solid bed', T('Oval (LEGO R40)', { sleepers: 'bed', splitTrack: 'bed', printBedX: 200, printBedY: 200 })],
    ['a switch with the throw arm', T('Left switch (LEGO)', { throwStyle: 'built-in' })],
    ['a switch with the bracket, turned 30° and off the grid', T('Left switch (LEGO)', { throwStyle: 'bracket' }, turned('Left switch (LEGO)', 30, 403, 5))],
    ['a crossing on a curve', T('Crossing on a curve', { sleepers: 'sleepers' })],
    ['a double slip', T('Double slip (45°, R40)', { throwStyle: 'built-in' })],
    ['a buffer stop', T('Siding ending in a buffer stop')],
    ['a banked curve', T('Banked curve')],
    ['ballast, a switch', T('Left switch (LEGO)', { ballast: 'ballast' })],
    ['ballast, a curve in lengths', T('Oval (LEGO R40)', { ballast: 'ballast', splitTrack: 'lengths' })],
  ] as const) it(`${name}: on the grid`, async () => {
    const { parts, off, tubes } = await check(d);
    expect(parts.length).toBeGreaterThan(0);
    expect(off, `of ${tubes} tubes, off the grid`).toBe(0);
    // (a short piece with all its studs past its ends (under the breakaway supports) has none to grip)
    for (const p of parts) { expect(p.clash, `${p.name}: studs that don't fit`).toBe(0); if (p.under > 2) expect(p.grip, `${p.name}: gripped`).toBeGreaterThan(0); }
  });
});
