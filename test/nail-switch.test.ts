import { describe, expect, it } from 'vitest';
import { buildDesign } from '../src/app/build';
import { type Design, TEMPLATES } from '../src/app/design';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import type { Route } from '../src/route/route';
import { BASE_DEFAULTS, type BaseParams, switchGeometry, switchPlan } from '../src/switch/base';
import { goesTogether } from './assembled.shared';

/** The 22.5° double slip as its template was: its middle points nail switches, no lever set. */
const NAILED: Design = { ...TEMPLATES['Double slip (22.5°)'], options: { pointBlades: 1, throwStyle: 'nail' }, trackwork: undefined };

describe('nail switches (Throw: Nail switch), as the reference double slips\' inner points', { timeout: 600000 }, () => {
  it('the double slip: no levers, each set\'s slider under its points held by an over-centre spring', async () => {
    const b = buildDesign(await kernel(), NAILED);
    const names = b.pieces.map((p) => p.name);
    expect(names.filter((n) => /lever|bracket/.test(n))).toEqual([]);
    expect(names.filter((n) => /-throw$/.test(n))).toHaveLength(4);
    expect(names.filter((n) => /-spring$/.test(n))).toHaveLength(4);
    // (each slider short: no arm out to a lever, under 40 mm along its throw)
    for (const p of b.pieces.filter((q) => /-throw$/.test(q.name))) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < p.positions.length; i += 3) { x0 = Math.min(x0, p.positions[i]); x1 = Math.max(x1, p.positions[i]); y0 = Math.min(y0, p.positions[i + 1]); y1 = Math.max(y1, p.positions[i + 1]); }
      expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(45);
    }
  });
  // (a design limit: the slip's middle points lie side by side, each set's spring where the next set's blade plate is,
  // their sliders in each other (80 mm3), a blade swung over in the track. The build says so, and what to do; the
  // checks find it, and nothing else)
  it('the double slip\'s middle points as nail switches can\'t be put together: said by the build, with what to set', async () => {
    const b = buildDesign(await kernel(), NAILED);
    const said = b.info.warnings.filter((x) => /are too close for their springs.*can't be put together as built; set Throw to a lever/.test(x));
    expect(said).toHaveLength(2);
    await goesTogether('the double slip as nail switches', NAILED, { problems: [/^points\d(-spring|-throw)? /], warning: /are too close for their springs/, why: 'said by the build' });
  });
  // (a nail switch on its own: everything the templates are checked for (assembled.shared.ts): nothing overlaps, the
  // blades follow the slider, the slider goes down into its groove and prints on its side with nothing hanging)
  for (const [name, more] of [['Left switch (LEGO)', {}], ['Wye switch', {}], ['Left switch (LEGO)', { bladeStyle: 'simple' as const }], ['Right switch (LEGO)', { bladeStyle: 'prototype' as const }], ['Left switch (BrickTracks R104)', { legoTrack: 'print' as const }]] as const)
    it(`${name}${'bladeStyle' in more ? `, ${more.bladeStyle === 'simple' ? 'rigid' : more.bladeStyle} blades` : ''} as a nail switch goes together`, async () => {
      const d = structuredClone(TEMPLATES[name]);
      await goesTogether(name, { ...d, options: { ...d.options, ...more, throwStyle: 'nail' } });
    });
});

// (the spring: printed flat and straight, squeezed between two pins on the bed, its middle ring on a post on the slider)
describe('a nail switch\'s over-centre spring', { timeout: 600000 }, () => {
  const A: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'straight', length: 256 }] };
  const B: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: 130 }] };
  const W1: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 640, angle: -11.25 }, { kind: 'straight', length: 130 }] };
  const W2: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 640, angle: 11.25 }, { kind: 'straight', length: 130 }] };
  const p: BaseParams = { ...BASE_DEFAULTS, mechStyle: 'plates', throwNail: true };
  const cases: [string, Route[], Partial<BaseParams>][] = [['rigid blades', [A, B], { bladeStyle: 'simple' }], ['sprung blades', [A, B], { bladeStyle: 'sprung' }], ['prototype blades', [A, B], { bladeStyle: 'prototype' }],
    ['one moving blade', [A, B], { bladeStyle: 'simple', pointBlades: 1 }], ['one sprung blade', [A, B], { bladeStyle: 'sprung', pointBlades: 1 }], ['a wye\'s sprung blades', [W1, W2], { bladeStyle: 'sprung' }], ['on ballast', [A, B], { bladeStyle: 'simple', generateBallast: true }]];
  for (const [name, rts, o] of cases) it(`${name}: goes on over its pins and its post from above, and bends clear of the bed, the slider and the blades wherever the slider is`, async () => {
    const plan = switchPlan(rts, [[0, 1, 12]], { ...p, ...o }, 1), v = plan.sets[0], w = await kernel(), gm = switchGeometry(new Scad(w), plan);
    expect(gm.isNail(0)).toBe(true);
    const base = gm.base(), thr = gm.throwPart(0), blades = gm.pointsParts(0), turns = gm.pointsTurns(0)!, T = v.leverTravel;
    const pins = gm.ocPinsAt(0);
    expect(pins.at).toHaveLength(2);
    // (the slider's one part, the spring's post on its bar; each blade one part, whatever's cut from its plate for the spring)
    expect(thr.decompose().length).toBe(1);
    // (but for a sprung blade's break-out supports, inside it)
    for (const m of blades) {
      const bodies = m.decompose().sort((x, y) => y.volume() - x.volume()), bb = bodies[0].boundingBox();
      for (const q of bodies.slice(1)) { const cb = q.boundingBox(); expect([0, 1, 2].every((k) => cb.min[k] >= bb.min[k] - 1e-3 && cb.max[k] <= bb.max[k] + 1e-3) && q.volume() < 0.2 * bodies[0].volume()).toBe(true); }
    }
    const rest = gm.springPart(0, 0)!;
    for (const at of [0, 0.25, 0.5, 0.75, 1]) {
      const sp = gm.springPart(0, at)!, sl = thr.translate([T * at, 0, 0]);
      // (one part still, however it's squeezed; in its pocket, round its pins, its ring round the slider's post)
      expect(sp.decompose().length, `in one at ${at}`).toBe(1);
      expect(sp.intersect(base).volume(), `in the bed at ${at}`).toBeLessThan(0.01);
      expect(sp.intersect(sl).volume(), `in the slider at ${at}`).toBeLessThan(0.01);
      // (it's the post that moves it: the slider on and the spring left behind, the post is in its ring)
      // (by its travel's end: the ring's slack on the post, 0.3 and the teardrop's tip, taken up)
      if (at === 1) expect(rest.intersect(sl).volume(), 'moved by the slider\'s post').toBeGreaterThan(0.05);
      blades.forEach((m, k) => {
        const [cx, cy] = turns[k].at, turned = m.translate([-cx, -cy, 0]).rotate([0, 0, (turns[k].swing ?? 0) * at]).translate([cx, cy, 0]);
        expect(sp.intersect(turned).volume(), `in blade ${k} at ${at}`).toBeLessThan(0.01);
      });
      // (each ring stays on its pin: the pin's middle inside the ring's box)
      const bb = sp.boundingBox();
      for (const q of pins.at) expect(q[0] > bb.min[0] && q[0] < bb.max[0] && q[1] > bb.min[1] - 0.01 && q[1] < bb.max[1] + 0.01, `on its pins at ${at}`).toBe(true);
    }
    // (going on, after the slider and before the blades: straight down. Its end rings snap over the pins' lips, 0.1
    // wider than the rings' holes all round and 0.6 high: under 0.5 mm3 a pin at worst, nothing once it's on or clear above)
    const sl0 = base.add(thr);
    for (const dz of [0.2, 0.4, 0.6, 0.8, 1, 1.5, 2, 3, 4, 6, 8, 12]) expect(rest.translate([0, 0, dz]).intersect(sl0).volume(), `${dz} up`).toBeLessThan(1);
    expect(rest.translate([0, 0, 12]).intersect(sl0).volume()).toBeLessThan(0.01);
    // (and it's the lips that hold it down: lifted, it does catch on them)
    expect(Math.max(...[0.2, 0.4, 0.6, 0.8, 1].map((dz) => rest.translate([0, 0, dz]).intersect(base).volume()))).toBeGreaterThan(0.02);
    // (printed flat, one part, no taller than it is thick)
    const pr = gm.springPrint(0)!, pb = pr.boundingBox();
    expect(pr.decompose().length).toBe(1);
    expect(pb.min[2]).toBeCloseTo(0, 6);
    expect(pb.max[2]).toBeLessThan(3);
  });
});

describe('points with no room for a throw', { timeout: 600000 }, () => {
  // (Points with no room for a throw: the 22.5° double slip with levers asked for, each set's lever placed by hand how far
  // along it is (its tines' length): its slider not moved along to clear the next set's (network.ts), so each pair's run
  // into each other under the crossing)
  const lead = 40 * Math.sin(Math.PI / 8) - (40 * (1 - Math.cos(Math.PI / 8))) / Math.tan(Math.PI / 8), [sn, cs] = [Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];
  const pinned = Object.fromEntries([[0, -lead], [lead * sn, -lead * cs], [0, lead], [-lead * sn, lead * cs]].map(([x, y]) => [`${Math.round(x * 8)},${Math.round(y * 8)}`, { springLength: 40 }]));
  const slip = (boxedThrow: 'nail' | 'slider') => ({ ...TEMPLATES['Double slip (22.5°)'], options: { ...TEMPLATES['Double slip (22.5°)'].options, throwStyle: 'built-in' as const, boxedThrow }, trackwork: { throw: pinned } });
  const crossWarn = /throws of the points at .* run into each other/;
  it('points whose sliders cross (the 22.5° double slip\'s): found, and made nail switches with Points with no room for a throw: Nail switches', async () => {
    const w = await kernel(), b = buildDesign(w, slip('nail'));
    const names = b.pieces.map((p) => p.name);
    // (each set's slider runs into the next's under the crossing: all four nail switches, no levers, nothing said)
    expect(names.filter((n) => /lever|bracket/.test(n))).toEqual([]);
    expect(names.filter((n) => /-spring$/.test(n))).toHaveLength(4);
    expect(b.info.warnings.filter((x) => crossWarn.test(x))).toEqual([]);
    // (each blade clear of the track: of the next set's spring pins too, which its plate swings over)
    const man = (P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
    const track = w.Manifold.union(b.pieces.filter((p) => !/points|throw|lever/.test(p.name)).map((p) => man(p.positions)));
    for (const p of b.pieces.filter((q) => /points\d$/.test(q.name))) {
      expect(man(p.positions).intersect(track).volume(), p.name).toBeLessThan(0.5);
      expect(man(p.positions).decompose().length, p.name).toBe(1);
    }
  });
  it('with A slider under the track: kept, and said, naming both points of each pair', async () => {
    const b = buildDesign(await kernel(), slip('slider'));
    expect(b.pieces.filter((p) => /-lever$/.test(p.name))).toHaveLength(4);
    const said = b.info.warnings.filter((w) => crossWarn.test(w));
    expect(said).toHaveLength(2);
    for (const w of said) expect(w.match(/\(studs\)/g)).toHaveLength(2);
  });
  it('the 45° double slip\'s throws clear of each other: levers as asked, nothing said', async () => {
    const d = TEMPLATES['Double slip (45°, R40)'];
    const b = buildDesign(await kernel(), { ...d, options: { ...d.options, boxedThrow: 'nail' } });
    expect(b.pieces.filter((p) => /-lever$/.test(p.name))).toHaveLength(4);
    expect(b.info.warnings.filter((w) => crossWarn.test(w))).toEqual([]);
  });
});
