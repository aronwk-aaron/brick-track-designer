// Can it be put together? Every moving part must go in the way it's meant
// to (the slider and the points from below; with the layered points from
// above; the bracket and the lever from above) without passing through the
// track, and nothing may overlap the track once in.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import type { Design } from '../src/app/design';

export const crossover: Design = { version: 1, gaugeStuds: 4, routes: [
  { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
  { name: 'B', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
  { name: 'X', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'curve', radius: 40, angle: 22.5 }] },
] };
// (a three-way in a network: the middle track's branches leave together, one each side, and merge into the outer tracks)
export const threeWay: Design = { version: 1, gaugeStuds: 4, routes: [
  { name: 'L', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 128 }] },
  { name: 'M', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 128 }] },
  { name: 'R', x: 32, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 128 }] },
  { name: 'ML', x: 16, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 200, angle: 16.260205 }, { kind: 'curve', radius: 200, angle: -16.260205 }] },
  { name: 'MR', x: 16, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 200, angle: -16.260205 }, { kind: 'curve', radius: 200, angle: 16.260205 }] },
] };


/** The checks, one test per design (a file's worth: the kernel's memory runs out after enough big builds). */
export function assemblySuite(cases: [string, Design][]) {
describe('every switch can be put together', { timeout: 120000 }, () => {
  for (const [name, d] of cases)
    it(name, async () => {
      const w = await kernel();
      const b = buildDesign(w, { ...d, options: { printBedX: 2000, printBedY: 2000, ...d.options } });
      const man = (p: { positions: Float32Array }) => {
        const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) });
        mesh.merge();
        return new w.Manifold(mesh);
      };
      // (the lid goes on last: the parts go in without it, then it goes on from above over them)
      const track = w.Manifold.union(b.pieces.filter((p) => !/points|throw|lever|bracket|lid/.test(p.name)).map(man));
      const moving = b.pieces.filter((q) => /points|throw/.test(q.name)).map(man); // (the lever goes in after the lid)
      const fromTop = d.options?.pointsModule === 'layers', bladesTop = (d.options?.mechStyle ?? '4dbrix') === '4dbrix';
      const problems: string[] = [];
      for (const p of b.pieces.filter((q) => /points|throw|lever|bracket/.test(q.name))) {
        // (each moving part one piece)
        const m = man(p);
        if (m.decompose().length !== 1) problems.push(`${p.name} is in ${m.decompose().length} pieces`);
        // (4DBrix's slider goes in from the top and along its tunnel: checked below; its blades go on after it, from above)
        if (bladesTop && /throw/.test(p.name)) continue;
        const dir = /lever|bracket/.test(p.name) || fromTop || bladesTop ? 1 : -1;
        const blade = /points/.test(p.name) && !/throw|lever|bracket/.test(p.name);
        const into = bladesTop && blade ? w.Manifold.union([track, ...b.pieces.filter((q) => /throw/.test(q.name)).map(man)]) : track;
        // (a closed blade's tongue is modelled undeflected: in the slider's post by the preload; it bends aside going on)
        const v0 = into === track ? 0 : m.intersect(into).volume() - m.intersect(track).volume();
        for (const dz of [0, 1, 2, 3, 4, 6, 8, 12, 16]) {
          const v = m.translate([0, 0, dir * dz]).intersect(into).volume() - v0;
          if (v > 0.5) { problems.push(`${p.name} ${dz} mm ${dir > 0 ? 'up' : 'down'}: ${v.toFixed(1)} mm3 in the track`); break; }
        }
      }
      for (const p of b.pieces.filter((q) => /lid/.test(q.name))) {
        const m = man(p), others = w.Manifold.union([track, ...moving]);
        for (const dz of [0, 1, 2, 4, 8, 16]) { const v = m.translate([0, 0, dz]).intersect(others).volume(); if (v > 0.5) { problems.push(`${p.name} ${dz} mm up: ${v.toFixed(1)} mm3 in the rest`); break; } }
      }
      // (4DBrix's slider: a floor under it, nothing open underneath; it goes in from the top, down through the
      // lever's opening, and along its tunnel and the posts' groove: everything ahead of where its end is, clear
      // all the way as it slides in (the part of it still out of the tunnel is in the opening, bent up out of it))
      if (bladesTop) for (const p of b.pieces.filter((q) => /throw/.test(q.name))) {
        const m = man(p), bb = m.boundingBox(), len = bb.max[0] - bb.min[0];
        if (m.translate([0, 0, -1]).intersect(track).volume() < 0.5) problems.push(`${p.name} isn't floored`);
        const clear = [-1, 1].some((sg) => {
          const end = sg > 0 ? bb.max[0] : bb.min[0];
          const ahead = track.intersect(w.Manifold.cube([1000, 1000, 1000]).translate([sg > 0 ? end + 0.5 - 1000 : end - 0.5, -500, -500]));
          return [1, 2, 4, 8, 16, 32, 48, 64, 96].filter((dx) => dx < len).every((dx) => m.translate([sg * dx, 0, 0]).intersect(ahead).volume() < 0.5);
        });
        if (!clear) problems.push(`${p.name} can't slide in along its tunnel`);
      }
      expect(problems.join("; ")).toBe("");
    });
});
}
