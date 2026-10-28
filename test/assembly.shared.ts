// Can it be put together? Every moving part must go in the way it's meant
// to (the slider and the points from below; with the layered points from
// above; the bracket and the lever from above) without passing through the
// track, and nothing may overlap the track once in.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
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


/** An STL's triangles' corners, as a mesh's positions. */
export function stlPositions(stl: Uint8Array) {
  const dv = new DataView(stl.buffer, stl.byteOffset), n = dv.getUint32(80, true), P = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) P[i * 9 + k * 3 + j] = dv.getFloat32(84 + i * 50 + 12 + k * 12 + j * 4, true);
  return P;
}

/**
 * How much of a solid, as printed (upright), hangs with nothing under it (mm2): faces facing down, steeper
 * than 45 degrees, above its bottom. Held: something within 0.45 below (break-out supports), a slope of 45
 * degrees or less, a bridge (held both sides, 10 or less across). Sampled over each face, not just its middle.
 */
export function hanging(w: Awaited<ReturnType<typeof kernel>>, solid: InstanceType<Awaited<ReturnType<typeof kernel>>['Manifold']>) {
  const mesh = solid.getMesh(), np = mesh.numProp, tv = mesh.triVerts, vp = mesh.vertProperties, n = tv.length / 3;
  const at = (i: number, k: number, j: number) => vp[tv[i * 3 + k] * np + j];
  let zmin = Infinity, area = 0;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) zmin = Math.min(zmin, at(i, k, 2));
  const below = new Map<number, ReturnType<typeof solid.slice>>();
  const has = (x: number, y: number, z: number) => {
    const key = Math.round(z * 20); if (!below.has(key)) below.set(key, solid.slice(key / 20));
    return below.get(key)!.intersect(w.CrossSection.square([0.2, 0.2], true).translate([x, y])).area() > 0.001;
  };
  const D = [[1, 0], [0, 1], [0.7, 0.7], [0.7, -0.7]] as const, span = Array.from({ length: 10 }, (_, k) => 0.5 * (k + 1));
  const held = (x: number, y: number, z: number) => has(x, y, z - 0.45)
    || D.some(([dx, dy]) => [1, -1].some((sg) => [0.3, 0.5].some((d) => has(x + sg * dx * d, y + sg * dy * d, z - 0.3))))
    || D.some(([dx, dy]) => [1, -1].every((sg) => span.some((d) => has(x + sg * dx * d, y + sg * dy * d, z - 0.3))));
  const WT = [[1 / 3, 1 / 3, 1 / 3], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7], [0.45, 0.45, 0.1], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45]];
  for (let i = 0; i < n; i++) {
    const u = [0, 1, 2].map((j) => at(i, 1, j) - at(i, 0, j)), v = [0, 1, 2].map((j) => at(i, 2, j) - at(i, 0, j));
    const nz = u[0] * v[1] - u[1] * v[0], L = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], nz);
    if (!(L > 1e-9 && nz / L < -0.75)) continue;
    for (const wt of WT) {
      const c = [0, 1, 2].map((j) => wt[0] * at(i, 0, j) + wt[1] * at(i, 1, j) + wt[2] * at(i, 2, j));
      if (c[2] > zmin + 0.05 && !held(c[0], c[1], c[2])) area += L / 2 / WT.length;
    }
  }
  return area;
}

/** The checks, one test per design (a file's worth: the kernel's memory runs out after enough big builds). */
export function assemblySuite(cases: [string, Design][]) {
describe('every switch can be put together', { timeout: 120000 }, () => {
  for (const [name, d] of cases)
    it(name, async () => {
      const w = await kernel();
      // (each design's own build: a cache full of the ones before it ran the kernel's memory up until a later one crawled)
      clearBuildCache();
      const b = buildDesign(w, { ...d, options: { printBedX: 2000, printBedY: 2000, ...d.options } });
      const man = (p: { positions: Float32Array }) => {
        const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) });
        mesh.merge();
        return new w.Manifold(mesh);
      };
      // (the lid goes on last: the parts go in without it, then it goes on from above over them)
      const track = w.Manifold.union(b.pieces.filter((p) => !/points|throw|lever|bracket|lid/.test(p.name)).map(man));
      const moving = b.pieces.filter((q) => /points|throw/.test(q.name)).map(man); // (the lever goes in after the lid)
      const fromTop = d.options?.pointsModule === 'layers', bladesTop = d.options?.mechStyle !== 'tines';
      const problems: string[] = [];
      for (const p of b.pieces.filter((q) => /points|throw|lever|bracket/.test(q.name))) {
        // (each moving part one piece, but for break-out supports inside it: the sprung blades', in the spring pocket)
        const m = man(p), bodies = m.decompose().sort((x, y) => y.volume() - x.volume()), bb = bodies[0].boundingBox();
        const inside = (q: typeof m) => { const c = q.boundingBox(); return [0, 1, 2].every((k) => c.min[k] >= bb.min[k] - 1e-3 && c.max[k] <= bb.max[k] + 1e-3); };
        if (!bodies.slice(1).every(inside)) problems.push(`${p.name} is in ${bodies.length} pieces`);
        // (the plate-style slider goes in from the top and along its tunnel: checked below; its blades go on after it, from above)
        // (in two parts, its arm under other track: the piece with the posts goes in from above, onto the bar, as the blades do)
        if (bladesTop && /throw/.test(p.name) && !/posts/.test(p.name)) continue;
        const dir = /lever|bracket/.test(p.name) || fromTop || bladesTop ? 1 : -1;
        const blade = /points/.test(p.name) && !/throw|lever|bracket/.test(p.name);
        // (the plate-style blades each turn on a pin standing up through the hole in the plate: some of the track inside the blade's outline)
        if (bladesTop && blade && m.hull().intersect(track).volume() < 10) problems.push(`${p.name} has no pin to turn on`);
        // (a blade goes on over the slider: in its post, as modelled, by the preload (its tongue bends aside going on); the
        // slider counts where it's in further than that, the track wherever it's in at all, each on its own: the post
        // coming out of the blade mustn't hide the blade going into the track)
        const sl = bladesTop && blade ? w.Manifold.union(b.pieces.filter((q) => /throw/.test(q.name)).map(man)) : undefined, vS0 = sl ? m.intersect(sl).volume() : 0;
        const into = (q: typeof m, withSlider = true) => q.intersect(track).volume() + (withSlider && sl ? Math.max(0, q.intersect(sl).volume() - vS0) : 0);
        // (a lever or stand snaps in between its ears, which flex apart: its pivot's domes and its detent bump
        // press into them on the way, a few mm3; nothing at rest)
        const snap = /lever/.test(p.name) ? 3 : 0.5;
        const lift = (part: typeof m, withSlider = true) => {
          for (const dz of [0, 1, 2, 3, 4, 6, 8, 12, 16]) {
            const v = into(part.translate([0, 0, dir * dz]), withSlider);
            if (v > (dz === 0 ? 0.5 : snap)) return `${p.name} ${dz} mm ${dir > 0 ? 'up' : 'down'}: ${v.toFixed(1)} mm3 in the track`;
          }
          return '';
        };
        let bad = lift(m);
        // (a blade tucked in under the stock rail's head (prototype blades) goes on open: turned on its pin, the
        // slider at the other end, its post where the blade's hole is then; then it's swung shut)
        if (bad && p.turn && p.turn.by !== 0) {
          const [cx, cy] = p.turn.at, open = m.translate([-cx, -cy, 0]).rotate([0, 0, p.turn.by]).translate([cx, cy, 0]);
          if (!lift(open, false)) bad = '';
        }
        // (a sprung blade with a lip over its front goes in tilted, as the reference's: its heel up, its front on the bed
        // behind the lip, pushed in under it, the heel lowered onto its stud. Here the rail on past its heel is on the same
        // part, so its heel goes in over that rail's end: taken out the other way, tipped up about its front's bottom edge
        // till its heel's 2.5 up, off its stud; drawn back 0.5 (as far as the gap to that rail); tipped on up till its
        // heel's 6.5 up, over the rail; drawn back out from under the lip; lifted)
        if (bad && p.turn?.tilt) {
          const [[ax, ay], [bx, by]] = p.turn.tilt, [cx, cy] = p.turn.at, zE = m.boundingBox().min[2];
          const phi = Math.atan2(by - ay, bx - ax) * 180 / Math.PI, mx = (ax + bx) / 2, my = (ay + by) / 2;
          const hl = Math.hypot(cx - mx, cy - my), hx = (cx - mx) / hl, hy = (cy - my) / hl;
          // (the heel's side of the edge, in its frame: rising is turning that way about it)
          const sg = Math.sign(-(cx - ax) * Math.sin(phi * Math.PI / 180) + (cy - ay) * Math.cos(phi * Math.PI / 180));
          const tip = (q: typeof m, rise: number) => q.translate([-ax, -ay, -zE]).rotate([0, 0, -phi]).rotate([sg * Math.asin(rise / hl) * 180 / Math.PI, 0, 0]).rotate([0, 0, phi]).translate([ax, ay, zE]);
          const path: [number, number][] = [[0, 0], [2.5, 0], [2.5, 0.5], [6.5, 0.5], [6.5, 3]], poses: (typeof m)[] = [];
          for (let k = 1; k < path.length; k++) for (let j = 1; j <= 5; j++) {
            const r = path[k - 1][0] + ((path[k][0] - path[k - 1][0]) * j) / 5, d = path[k - 1][1] + ((path[k][1] - path[k - 1][1]) * j) / 5;
            poses.push(tip(m, r).translate([hx * d, hy * d, 0]));
          }
          const hit = poses.findIndex((q) => into(q) > 0.5);
          if (hit < 0 && !lift(poses[poses.length - 1])) bad = '';
          else bad += ` (and tilted in under its lip: ${hit < 0 ? 'lifting out' : `pose ${hit}`})`;
        }
        if (bad) problems.push(bad);
        // (and swung to its other end, it's clear of the track)
        if (p.turn?.swing) {
          const [cx, cy] = p.turn.at, v = m.translate([-cx, -cy, 0]).rotate([0, 0, p.turn.swing]).translate([cx, cy, 0]).intersect(track).volume();
          if (v > 0.5) problems.push(`${p.name} swung over: ${v.toFixed(1)} mm3 in the track`);
        }
      }
      // (the blades, Peco's spring and the plate-style slider print without supports: nothing as printed faces down,
      // steeper than 45 degrees, above the first layer with nothing under it. Held: the part's own break-out supports
      // within 0.45 below (the sprung blades' spring pocket), a slope of 45 degrees or less, a bridge (held both sides, 10 or
      // less across). Sampled over each face, not just its middle)
      if (bladesTop) for (const p of b.pieces.filter((q) => /points|throw/.test(q.name) && !/lever|bracket/.test(q.name))) {
        const area = hanging(w, man({ positions: stlPositions(p.stl) }));
        if (area > 1) problems.push(`${p.name} has ${area.toFixed(1)} mm2 hanging as printed`);
      }
      // (the moving parts clear of each other at rest (a blade's tongue on the slider's post is the blades' check above))
      const mv = b.pieces.filter((q) => /points|throw/.test(q.name) && !/lever|bracket/.test(q.name));
      for (let i = 0; i < mv.length; i++) for (let j = i + 1; j < mv.length; j++) {
        if (/throw/.test(mv[i].name) || /throw/.test(mv[j].name)) continue;
        const v = man(mv[i]).intersect(man(mv[j])).volume();
        if (v > 0.5) problems.push(`${mv[i].name} and ${mv[j].name} overlap: ${v.toFixed(1)} mm3`);
      }
      // (a lever or stand is held by its ears (on the lid, with layered points): slid along its pivot it runs into them)
      const withLids = w.Manifold.union([track, ...b.pieces.filter((q) => /lid/.test(q.name)).map(man)]);
      for (const p of b.pieces.filter((q) => /lever/.test(q.name))) {
        const m = man(p);
        if ([-0.6, 0.6].some((dy) => m.translate([0, dy, 0]).intersect(withLids).volume() < 0.5)) problems.push(`${p.name} isn't held by its ears`);
      }
      for (const p of b.pieces.filter((q) => /lid/.test(q.name))) {
        const m = man(p), others = w.Manifold.union([track, ...moving]);
        for (const dz of [0, 1, 2, 4, 8, 16]) { const v = m.translate([0, 0, dz]).intersect(others).volume(); if (v > 0.5) { problems.push(`${p.name} ${dz} mm up: ${v.toFixed(1)} mm3 in the rest`); break; } }
      }
      // (the plate-style slider: a floor under it, nothing open underneath; it goes in from the top, down through the
      // lever's opening, and along its tunnel and the posts' groove: everything ahead of where its end is, clear
      // all the way as it slides in (the part of it still out of the tunnel is in the opening, bent up out of it))
      // (in two parts: the piece with the posts on the bar, pegged into it, clear of it)
      for (const p of b.pieces.filter((q) => /throw.*posts/.test(q.name))) {
        const m = man(p), bar = b.pieces.find((q) => q.name === p.name.replace(/-posts$/, ''));
        if (!bar) { problems.push(`${p.name} has no bar`); continue; }
        const mb = man(bar), v = m.intersect(mb).volume();
        if (v > 0.01) problems.push(`${p.name} is in its bar: ${v.toFixed(2)} mm3`);
        if (m.translate([0, 0, -0.1]).intersect(mb).volume() < 0.1) problems.push(`${p.name} doesn't sit on its bar`);
        // (a peg in its hole: moved 1 mm any way across, it's in the bar)
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.translate([dx, dy, 0]).intersect(mb).volume() < 0.05)) problems.push(`${p.name} isn't pegged to its bar`);
      }
      if (bladesTop) for (const p of b.pieces.filter((q) => /throw/.test(q.name) && !/posts/.test(q.name))) {
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
