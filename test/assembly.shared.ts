// Can it be put together? Every moving part must go in the way it's meant
// to (the slider and the points from below; with the layered points from
// above; the bracket and the lever from above) without passing through the
// track, and nothing may overlap the track once in.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache, type Piece } from '../src/app/build';
import type { Design } from '../src/app/design';
import { hanging, stlPositions } from '../scripts/printability';

// (what a slicer trips over, and a file's triangles: scripts/printability.ts, which the scripts and the printability tests use too)
export { hanging, stlPositions };

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


/**
 * The edges of a file's mesh shared by more than two triangles (corners the same where exactly the same, as a slicer
 * reads them), each by its two ends: where two walls only touch, along a line. The file's still closed, and a slicer
 * cutting layers isn't troubled; but read back in as a solid such an edge can be joined wrongly (a slider's groove
 * floor was, 0.7 mm3 of it in the slider), so they're counted (assembled.shared.ts EDGES).
 */
export function sharedEdges(P: ArrayLike<number>): [number[], number[]][] {
  const ids = new Map<string, number>(), xs: number[][] = [], tri: number[] = [];
  for (let i = 0; i < P.length; i += 3) { const key = `${P[i]},${P[i + 1]},${P[i + 2]}`; let id = ids.get(key); if (id === undefined) { id = xs.length; ids.set(key, id); xs.push([P[i], P[i + 1], P[i + 2]]); } tri.push(id); }
  const n = new Map<number, number>(), N = xs.length;
  for (let t = 0; t < tri.length; t += 3) for (const [a, b] of [[tri[t], tri[t + 1]], [tri[t + 1], tri[t + 2]], [tri[t + 2], tri[t]]]) { if (a === b) continue; const k = a < b ? a * N + b : b * N + a; n.set(k, (n.get(k) ?? 0) + 1); }
  return [...n].filter(([, c]) => c > 2).map(([k]) => [xs[Math.floor(k / N)], xs[k % N]]);
}


/**
 * Each moving part goes in the way it's meant to, and prints without supports: what's wrong, said (none: it all goes together).
 * fromTop: layered points (the parts from above, a lid over them); bladesTop: the plate-style points (blades on top).
 * have: the pieces' solids where they're made already, by their positions.
 */
export function putTogether(w: Awaited<ReturnType<typeof kernel>>, pieces: Piece[], how: { fromTop: boolean; bladesTop: boolean }, have?: Map<Float32Array, ReturnType<Awaited<ReturnType<typeof kernel>>['Manifold']['cube']>>, only?: (p: Piece) => boolean): string[] {
  // (only: just these parts are checked, against all of pieces: a big layout's strip checks its own, with what's round them loaded)
  const mine = (p: Piece) => !only || only(p);
  // (each piece's solid made once, and let go at the end: one kernel checks many designs)
  const made = new Map<Float32Array, ReturnType<typeof w.Manifold.cube>>();
  const man = (p: { positions: Float32Array }) => {
    // (have: the pieces' solids already made, the caller's to let go)
    const had = have?.get(p.positions) ?? made.get(p.positions);
    if (had) return had;
    const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) });
    mesh.merge();
    const m = new w.Manifold(mesh);
    made.set(p.positions, m);
    return m;
  };
  // (the lid goes on last: the parts go in without it, then it goes on from above over them)
  // (the track near a part, 120 mm round it: a big layout's in one solid, and turned for each slider, ran the kernel out of memory)
  type Solid = ReturnType<typeof w.Manifold.cube>;
  const trackParts = pieces.filter((p) => !/points|throw|lever|bracket|lid/.test(p.name)).map(man), nearMemo = new Map<string, Solid>();
  const none = () => w.Manifold.cube([0.01, 0.01, 0.01]).translate([0, 0, -1e4]);
  const trackNear = (m: Solid, by = 120, within?: Solid) => {
    const b = m.boundingBox(), ks = trackParts.flatMap((t, k) => { const c = t.boundingBox(); return [0, 1].every((j) => c.min[j] <= b.max[j] + by && b.min[j] - by <= c.max[j]) ? [k] : []; });
    // (within: only what's in this solid, each part cut to it before they're joined: a slider's box along its tunnel)
    if (within) {
      const wb = within.boundingBox(), cut = ks.map((k) => trackParts[k]).filter((t) => { const c = t.boundingBox(); return [0, 1, 2].every((j) => c.min[j] <= wb.max[j] && wb.min[j] <= c.max[j]); }).map((t) => t.intersect(within));
      return cut.length === 1 ? cut[0] : w.Manifold.union(cut.length ? cut : [none()]);
    }
    const key = ks.join();
    if (!nearMemo.has(key)) nearMemo.set(key, ks.length === 1 ? trackParts[ks[0]] : w.Manifold.union(ks.length ? ks.map((k) => trackParts[k]) : [none()]));
    return nearMemo.get(key)!;
  };
  // (the track right round a part, cut to a box about it (by mm round it on the plan, any height). A blade's tried in
  // some forty places on its way in, each against the track: against every part within 120 mm in one solid that took
  // 13 ms a time, two thirds of a yard's check; against what's in the box, a seventh of that. holds: a solid lies
  // within the box, so what it shares with the track is what it shares with this; one that doesn't is tried against it all)
  const trackBox = (m: Solid, by = 12) => {
    const b = m.boundingBox(), lo = [b.min[0] - by, b.min[1] - by], hi = [b.max[0] + by, b.max[1] + by];
    const box = w.Manifold.cube([hi[0] - lo[0], hi[1] - lo[1], 2000]).translate([lo[0], lo[1], -1000]);
    const cut = trackParts.filter((t) => { const c = t.boundingBox(); return [0, 1].every((j) => c.min[j] <= hi[j] && lo[j] <= c.max[j]); }).map((t) => t.intersect(box));
    return { cut: cut.length === 1 ? cut[0] : w.Manifold.union(cut.length ? cut : [none()]),
      holds: (q: Solid) => { const c = q.boundingBox(); return [0, 1].every((j) => c.min[j] >= lo[j] && c.max[j] <= hi[j]) && c.min[2] > -1000 && c.max[2] < 1000; } };
  };
  const moving = pieces.filter((q) => /points|throw/.test(q.name)).map(man); // (the lever goes in after the lid)
  const { fromTop, bladesTop } = how;
  const problems: string[] = [];
  for (const p of pieces.filter((q) => /points|throw|lever|bracket/.test(q.name) && mine(q))) {
    // (each moving part one piece, but for break-out supports inside it: the sprung blades', in the spring pocket)
    const m = man(p), bodies = m.decompose().sort((x, y) => y.volume() - x.volume()), bb = bodies[0].boundingBox();
    const round = trackBox(m), track = (q: typeof m) => (round.holds(q) ? round.cut : trackNear(m));
    const inside = (q: typeof m) => { const c = q.boundingBox(); return [0, 1, 2].every((k) => c.min[k] >= bb.min[k] - 1e-3 && c.max[k] <= bb.max[k] + 1e-3); };
    if (!bodies.slice(1).every(inside)) problems.push(`${p.name} is in ${bodies.length} pieces`);
    // (the plate-style slider goes in from the top and along its tunnel: checked below; its blades go on after it, from above)
    // (in two parts, its arm under other track: the piece with the posts goes in from above, onto the bar, as the blades do)
    if (bladesTop && /throw/.test(p.name) && !/posts/.test(p.name)) continue;
    const dir = /lever|bracket/.test(p.name) || fromTop || bladesTop ? 1 : -1;
    const blade = /points/.test(p.name) && !/throw|lever|bracket/.test(p.name);
    // (the plate-style blades each turn on a pin standing up through the hole in the plate: some of the track inside the blade's outline)
    if (bladesTop && blade && m.hull().intersect(round.cut).volume() < 10) problems.push(`${p.name} has no pin to turn on`);
    // (a blade goes on over the slider: in its post, as modelled, by the preload (its tongue bends aside going on); the
    // slider counts where it's in further than that, the track wherever it's in at all, each on its own: the post
    // coming out of the blade mustn't hide the blade going into the track)
    const sl = bladesTop && blade ? w.Manifold.union(pieces.filter((q) => /throw/.test(q.name)).map(man)) : undefined, vS0 = sl ? m.intersect(sl).volume() : 0;
    const into = (q: typeof m, withSlider = true) => q.intersect(track(q)).volume() + (withSlider && sl ? Math.max(0, q.intersect(sl).volume() - vS0) : 0);
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
    // heel's 6.5 up, over the rail; drawn back out from under the lip (up to 3); lifted)
    // (rigid blades with the lip over the front: the same, the pin plain. A prototype blade, tucked under the stock rail's
    // head closed, goes in so open (the slider at the other end, as above), then swung shut)
    const tiltIn = (m0: typeof m, tilt: [[number, number], [number, number]], withSlider = true) => {
      const [[ax, ay], [bx, by]] = tilt, [cx, cy] = p.turn!.at, zE = m0.boundingBox().min[2];
      const phi = Math.atan2(by - ay, bx - ax) * 180 / Math.PI, mx = (ax + bx) / 2, my = (ay + by) / 2;
      const hl = Math.hypot(cx - mx, cy - my), hx = (cx - mx) / hl, hy = (cy - my) / hl;
      // (the heel's side of the edge, in its frame: rising is turning that way about it)
      const sg = Math.sign(-(cx - ax) * Math.sin(phi * Math.PI / 180) + (cy - ay) * Math.cos(phi * Math.PI / 180));
      const tip = (q: typeof m, rise: number) => q.translate([-ax, -ay, -zE]).rotate([0, 0, -phi]).rotate([sg * Math.asin(rise / hl) * 180 / Math.PI, 0, 0]).rotate([0, 0, phi]).translate([ax, ay, zE]);
      const path: [number, number][] = [[0, 0], [2.5, 0], [2.5, 0.5], [6.5, 0.5], [6.5, 3]], poses: (typeof m)[] = [];
      for (let k = 1; k < path.length; k++) for (let j = 1; j <= 5; j++) {
        const r = path[k - 1][0] + ((path[k][0] - path[k - 1][0]) * j) / 5, d = path[k - 1][1] + ((path[k][1] - path[k - 1][1]) * j) / 5;
        poses.push(tip(m0, r).translate([hx * d, hy * d, 0]));
      }
      // (drawn back only as far as it must be: lifted out from the first pose of the last leg it comes out from; a rigid
      // prototype blade's post near its front leaves it about 1 to go)
      const hit = poses.findIndex((q) => into(q, withSlider) > 0.5), last = hit < 0 ? poses.length : hit;
      for (let k = poses.length - 5; k < last; k++) if (!lift(poses[k], withSlider)) return '';
      return hit < 0 ? 'lifting out' : `pose ${hit}`;
    };
    if (bad && p.turn?.tilt) {
      const t2 = p.turn, [cx, cy] = t2.at, why = tiltIn(m, t2.tilt!);
      const turnQ = ([x, y]: [number, number]): [number, number] => { const a = t2.by * Math.PI / 180; return [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]; };
      const whyOpen = why && t2.by !== 0 ? tiltIn(m.translate([-cx, -cy, 0]).rotate([0, 0, t2.by]).translate([cx, cy, 0]), [turnQ(t2.tilt![0]), turnQ(t2.tilt![1])], false) : why;
      if (!why || !whyOpen) bad = '';
      else bad += ` (and tilted in under its lip: ${why}${t2.by !== 0 ? `; open: ${whyOpen}` : ''})`;
    }
    if (bad) problems.push(bad);
    // (and swung to its other end, it's clear of the track)
    if (p.turn?.swing) {
      const [cx, cy] = p.turn.at, over = m.translate([-cx, -cy, 0]).rotate([0, 0, p.turn.swing]).translate([cx, cy, 0]), v = over.intersect(track(over)).volume();
      if (v > 0.5) problems.push(`${p.name} swung over: ${v.toFixed(1)} mm3 in the track`);
    }
  }
  // (the blades, Peco's spring and the plate-style slider print without supports: nothing as printed faces down,
  // steeper than 45 degrees, above the first layer with nothing under it. Held: the part's own break-out supports
  // within 0.45 below (the sprung blades' spring pocket), a slope of 45 degrees or less, a bridge (held both sides, 10 or
  // less across). Sampled over each face, not just its middle)
  if (bladesTop) for (const p of pieces.filter((q) => /points|throw/.test(q.name) && !/lever|bracket/.test(q.name) && mine(q))) {
    const area = hanging(w, man({ positions: stlPositions(p.stl) }));
    if (area > 1) problems.push(`${p.name} has ${area.toFixed(1)} mm2 hanging as printed`);
  }
  // (the moving parts clear of each other at rest (a blade's tongue on the slider's post is the blades' check above))
  const mv = pieces.filter((q) => /points|throw/.test(q.name) && !/lever|bracket/.test(q.name));
  for (let i = 0; i < mv.length; i++) for (let j = i + 1; j < mv.length; j++) {
    if (/throw/.test(mv[i].name) || /throw/.test(mv[j].name) || !(mine(mv[i]) || mine(mv[j]))) continue;
    const v = man(mv[i]).intersect(man(mv[j])).volume();
    if (v > 0.5) problems.push(`${mv[i].name} and ${mv[j].name} overlap: ${v.toFixed(1)} mm3`);
  }
  // (a lever or stand is held by its ears (on the lid, with layered points): slid along its pivot it runs into them)
  const lids = pieces.filter((q) => /lid/.test(q.name)).map(man);
  for (const p of pieces.filter((q) => /lever/.test(q.name) && mine(q))) {
    // (and on its bracket, where it's on one)
    const m = man(p), withLids = w.Manifold.union([trackBox(m, 2).cut, ...lids, ...pieces.filter((q) => /bracket/.test(q.name)).map(man)]);
    if ([-0.6, 0.6].some((dy) => m.translate([0, dy, 0]).intersect(withLids).volume() < 0.5)) problems.push(`${p.name} isn't held by its ears`);
  }
  for (const p of pieces.filter((q) => /lid/.test(q.name) && mine(q))) {
    const m = man(p), others = w.Manifold.union([trackBox(m, 2).cut, ...moving]);
    for (const dz of [0, 1, 2, 4, 8, 16]) { const v = m.translate([0, 0, dz]).intersect(others).volume(); if (v > 0.5) { problems.push(`${p.name} ${dz} mm up: ${v.toFixed(1)} mm3 in the rest`); break; } }
  }
  // (the plate-style slider: a floor under it, nothing open underneath; it goes in from the top, down through the
  // lever's opening, and along its tunnel and the posts' groove: everything ahead of where its end is, clear
  // all the way as it slides in (the part of it still out of the tunnel is in the opening, bent up out of it))
  // (in two parts: the piece with the posts on the bar, pegged into it, clear of it)
  for (const p of pieces.filter((q) => /throw.*posts/.test(q.name) && mine(q))) {
    const m = man(p), bar = pieces.find((q) => q.name === p.name.replace(/-posts$/, ''));
    if (!bar) { problems.push(`${p.name} has no bar`); continue; }
    const mb = man(bar), v = m.intersect(mb).volume();
    if (v > 0.01) problems.push(`${p.name} is in its bar: ${v.toFixed(2)} mm3`);
    if (m.translate([0, 0, -0.1]).intersect(mb).volume() < 0.1) problems.push(`${p.name} doesn't sit on its bar`);
    // (a peg in its hole: moved 1 mm any way across, it's in the bar)
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.translate([dx, dy, 0]).intersect(mb).volume() < 0.05)) problems.push(`${p.name} isn't pegged to its bar`);
  }
  if (bladesTop) for (const p of pieces.filter((q) => /throw/.test(q.name) && !/posts/.test(q.name) && mine(q))) {
    // (along its own throw, whichever way that lies in the design: turned to lie along x, and the track with it)
    const ang = p.slide ? (Math.atan2(p.slide.dir[1], p.slide.dir[0]) * 180) / Math.PI : 0;
    const m = man(p).rotate([0, 0, -ang]), bb = m.boundingBox(), len = bb.max[0] - bb.min[0];
    // (the track beside it and on past its ends, in a box along it: each part near it cut to the box where it lies, then turned with it)
    const box = w.Manifold.cube([2 * len + 20, 60, 1000]).translate([bb.min[0] - len / 2 - 10, (bb.min[1] + bb.max[1]) / 2 - 30, -500]);
    const near = trackNear(man(p), 120, box.rotate([0, 0, ang])).rotate([0, 0, -ang]);
    if (m.translate([0, 0, -1]).intersect(near).volume() < 0.5) problems.push(`${p.name} isn't floored`);
    // (a nail switch's, under its points only, its tunnel shut at both ends: it goes down into its groove from above)
    const down = [1, 2, 4, 8, 16].every((dz) => m.translate([0, 0, dz]).intersect(near).volume() < 0.5);
    const clear = down || [-1, 1].some((sg) => {
      const end = sg > 0 ? bb.max[0] : bb.min[0];
      const ahead = near.intersect(w.Manifold.cube([1000, 1000, 1000]).translate([sg > 0 ? end + 0.5 - 1000 : end - 0.5, -500, -500]));
      return [1, 2, 4, 8, 16, 32, 48, 64, 96].filter((dx) => dx < len).every((dx) => m.translate([sg * dx, 0, 0]).intersect(ahead).volume() < 0.5);
    });
    if (!clear) problems.push(`${p.name} can't slide in along its tunnel`);
  }
  for (const m of made.values()) if (!(m as unknown as { isDeleted?: () => boolean }).isDeleted?.()) m.delete();
  return problems;
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
      const problems = putTogether(w, b.pieces, { fromTop: d.options?.pointsModule === 'layers', bladesTop: d.options?.mechStyle !== 'tines' });
      expect(problems.join("; ")).toBe("");
    });
});
}
