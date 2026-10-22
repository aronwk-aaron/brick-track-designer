// The undersides on the baseplate: at every stud under a part (studs at 4 + 8k), the stud fits (nothing solid where it
// goes, up to its height), and the part grips some of them (a tube or socket wall at the stud's side).
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { type Design, TEMPLATES, toRoutes } from '../src/app/design';
import { routeLength, routePose } from '../src/route/route';

const st = (studs: number) => ({ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight' as const, studs }] });
const curve = [{ name: 'C', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight' as const, studs: 8 }, { kind: 'curve' as const, radius: 40, angle: 45 }] }];

async function check(d: Design) {
  // (the track's ends, facing out: spots past them are under the breakaway supports there, which come off)
  const ends = toRoutes(d).flatMap((rt) => { const a = routePose(rt, 0), e = routePose(rt, routeLength(rt)); return [[a[0], a[1], a[2] + 180], e]; });
  const past = (x: number, y: number) => ends.some((e) => { const h = (e[2] * Math.PI) / 180; return Math.hypot(x - e[0], y - e[1]) < 60 && (x - e[0]) * -Math.sin(h) + (y - e[1]) * Math.cos(h) > -2; });
  const w = await kernel(), b = buildDesign(w, d), out: { name: string; under: number; clash: number; grip: number }[] = [];
  for (const p of b.pieces) {
    if (p.color !== 0x6f7780) continue;
    const P = p.positions, n = P.length / 3, tri = new Uint32Array(n); for (let i = 0; i < n; i++) tri[i] = i;
    const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: tri }); mesh.merge();
    const m = new w.Manifold(mesh), bb = m.boundingBox(), z0 = bb.min[2];
    const inner = m.project().offset(-0.6, 'Miter', 1000), sl = [1.0, 1.7].map((h) => m.slice(z0 + h)); // (the breakaway support footings, 0.6 mm thick, under neither)
    let under = 0, clash = 0, grip = 0;
    for (let x = Math.floor(bb.min[0] / 8) * 8 + 4; x <= bb.max[0]; x += 8) for (let y = Math.floor(bb.min[1] / 8) * 8 + 4; y <= bb.max[1]; y += 8) {
      if (past(x, y) || w.CrossSection.circle(2.4, 32).translate([x, y]).subtract(inner).area() > 0.01) continue;
      under++;
      const s = w.CrossSection.circle(2.36, 32).translate([x, y]);
      if (sl.some((c) => s.intersect(c).area() > 0.05)) { clash++; continue; }
      if (w.CrossSection.circle(2.55, 32).translate([x, y]).subtract(s).intersect(sl[0]).area() > 0.02) grip++;
    }
    out.push({ name: p.name, under, clash, grip });
  }
  return out;
}

describe('undersides on the baseplate', { timeout: 300000 }, () => {
  for (const [name, routes, options] of [
    ['track only, a long straight cut in lengths for a small bed', [st(40)], { printBedX: 128, printBedY: 128 }],
    ['track with sleepers, cut', [st(40)], { printBedX: 128, printBedY: 128, sleepers: 'sleepers' }],
    ['ballast, cut', [st(40)], { printBedX: 128, printBedY: 128, ballast: 'ballast' }],
    ['ballast + buddy, a curve', curve, { ballast: 'buddy' }],
    ['track only, a switch', TEMPLATES['Left switch (LEGO)'].routes, {}],
    ['ballast, a crossing', TEMPLATES['90° crossing'].routes, { ballast: 'ballast' }],
  ] as const) it(`${name}: every stud fits, some grip`, async () => {
    const parts = await check({ version: 1, gaugeStuds: 4, routes: routes as Design['routes'], options: { printBedX: 500, printBedY: 500, ...options } });
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) { expect(p.clash, `${p.name}: studs that don't fit`).toBe(0); expect(p.grip, `${p.name}: gripped`).toBeGreaterThan(p.under / 4); }
  });
});
