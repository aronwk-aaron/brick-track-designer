// Narrow gauge points (rails under 4 studs apart) have one moving blade: two blades' plates, each on its own pin,
// don't fit side by side between the rails (they lay over each other, and on each other's pins: 26 mm3 of each in
// the bed's stud). The setting says so, greyed out.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, TEMPLATES } from '../src/app/design';
import { optionForm, type OptCtx } from '../src/app/settings';
import { OPTION_DEFAULTS } from '../src/app/design';

type W = Awaited<ReturnType<typeof kernel>>;
/** A piece's triangles as a solid again. */
const solid = (w: W, pos: Float32Array) => { const m = new w.Mesh({ numProp: 3, vertProperties: pos, triVerts: Uint32Array.from({ length: pos.length / 3 }, (_, k) => k) }); m.merge(); return new w.Manifold(m); };
const sw = (gaugeStuds: number, options: Design['options'] = {}): Design => ({ ...structuredClone(TEMPLATES['Narrow-gauge switch R48 left']), gaugeStuds, options: { legoTrack: 'print', ...options } });

describe('narrow gauge points', { timeout: 300000 }, () => {
  for (const blades of [undefined, 2, 1] as const) for (const bladeStyle of ['sprung', 'simple'] as const)
    it(`2-stud gauge, ${bladeStyle} blades, Moving blades ${blades ?? 'as it comes'}: one blade, its plate clear of the track and its pin's stud`, async () => {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, sw(2, { bladeStyle, ...(blades && { pointBlades: blades }) }));
      expect(b.info.warnings).toEqual([]);
      const points = b.pieces.filter((p) => /points(-[ab])?$/.test(p.name));
      expect(points.map((p) => p.name.replace(/^switch-/, ''))).toEqual(['points']);
      const fixed = w.Manifold.union(b.pieces.filter((p) => /^track|base/.test(p.name)).map((p) => solid(w, p.positions)));
      expect(fixed.volume()).toBeGreaterThan(1000);
      expect(solid(w, points[0].positions).intersect(fixed).volume()).toBeLessThan(0.05);
      clearBuildCache();
    });
  it('3-stud gauge too; 4 studs and up keep both blades', async () => {
    const w = await kernel();
    clearBuildCache();
    const names = (g: number) => buildDesign(w, sw(g)).pieces.map((p) => p.name.replace(/^switch-/, '')).filter((n) => /^points(-[ab])?$/.test(n));
    expect(names(3)).toEqual(['points']);
    expect(names(4)).toEqual(['points-a', 'points-b']);
    clearBuildCache();
  });
  it('the Moving blades setting says why Two can\'t be had, at narrow gauge only', () => {
    let d: Design = sw(2);
    const f = optionForm(() => d).form.flatMap((s) => s.fields).find((x) => x.key === 'pointBlades')!;
    const c: OptCtx = { o: { ...OPTION_DEFAULTS }, ballast: false, fdb: true, switches: true };
    const two = f.choices!.find((ch) => ch.v === '2')!, one = f.choices!.find((ch) => ch.v === '1')!;
    expect(two.no?.(c)).toMatch(/gauge is under 4 studs/);
    expect(one.no?.(c)).toBeUndefined();
    d = sw(4);
    expect(two.no?.(c)).toBeUndefined();
  });
});
