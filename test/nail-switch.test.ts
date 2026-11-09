import { describe, expect, it } from 'vitest';
import { buildDesign } from '../src/app/build';
import { TEMPLATES } from '../src/app/design';
import { kernel } from '../src/geom/kernel';

describe('nail switches (Throw: Nail switch), as the reference double slips\' inner points', { timeout: 600000 }, () => {
  it('the double slip: no levers, each set\'s slider under its points held by an over-centre spring', async () => {
    const b = buildDesign(await kernel(), TEMPLATES['Double slip (22.5°)']);
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
  // (Points with no room for a throw: the 22.5° double slip with levers asked for, as a design would have it)
  const slip = (boxedThrow: 'nail' | 'slider') => ({ ...TEMPLATES['Double slip (22.5°)'], options: { ...TEMPLATES['Double slip (22.5°)'].options, throwStyle: 'built-in' as const, boxedThrow } });
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
