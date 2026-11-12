// A points set's own mechanism (Trackwork.points mech, expert: the points editor's "Mechanism, these points"): a set on
// tines among blades on top, and one with blades on top in a tines design. Each is built as its mechanism's own: its bed,
// what's under its throw and its moving parts as in a design all of that mechanism (the region round it the same), its
// parts going in as that mechanism's do, its throw clear of the track all along its travel; and the cuts keep clear of it
// as that mechanism's are kept clear.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, readDesign, TEMPLATES } from '../src/app/design';
import { putTogether } from './assembly.shared';
import { APP_DEFAULTS } from './setup-defaults';

type W = Awaited<ReturnType<typeof kernel>>;
type Built = ReturnType<typeof buildDesign>;
const XO = TEMPLATES['Crossover (R40)'];
/** The crossover's first points (at its start), the second (on the other track). */
const P1 = '0,64';
const design = (options: object, mech?: 'tines' | 'plates'): Design => ({ ...structuredClone(XO), options: { ...APP_DEFAULTS, ...options }, ...(mech && { trackwork: { points: { [P1]: { mech } } } }) });
const man = (w: W, P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
const moving = (n: string) => /points|throw|lever|bracket/.test(n);
/** The fixed track within the box about the first points (x0, y0, x1, y1). */
const BOX = [-80, -20, 80, 220];
const near = (w: W, b: Built) => w.Manifold.union(b.pieces.filter((p) => !moving(p.name)).map((p) => man(w, p.positions)))
  .intersect(w.Manifold.cube([BOX[2] - BOX[0], BOX[3] - BOX[1], 200]).translate([BOX[0], BOX[1], -100]));
const build = (w: W, d: Design) => { clearBuildCache(); return buildDesign(w, d); };
/** Whether a set's blades turn on pins (blades on top). */
const onTop = (b: Built, set: string) => b.pieces.filter((p) => new RegExp(`^${set}(-[ab])?$`).test(p.name)).some((p) => !!p.turn);
/** The most of a throw in the track, slid from as assembled to its other end. */
const throwIn = (w: W, b: Built, name: string) => {
  const th = b.pieces.find((p) => p.name === name)!, m = man(w, th.positions), bb = m.boundingBox();
  const track = w.Manifold.union(b.pieces.filter((p) => !moving(p.name) && (() => { const q = man(w, p.positions).boundingBox(); return [0, 1].every((k) => q.min[k] <= bb.max[k] + 20 && bb.min[k] - 20 <= q.max[k]); })()).map((p) => man(w, p.positions)));
  let most = 0;
  for (let k = 0; k <= 6; k++) { const t = (th.slide!.by * k) / 6; most = Math.max(most, m.translate([th.slide!.dir[0] * t, th.slide!.dir[1] * t, 0]).intersect(track).volume()); }
  return most;
};

describe('a points set with a mechanism of its own', () => {
  it('is kept when the design is read, as tines or plates only', () => {
    const d = design({}, 'tines');
    expect(readDesign(structuredClone(d)).trackwork?.points?.[P1]?.mech).toBe('tines');
    const bad = structuredClone(d) as unknown as { trackwork: { points: Record<string, { mech: unknown }> } };
    bad.trackwork.points[P1].mech = 'springs';
    expect(readDesign(bad).trackwork?.points?.[P1]?.mech).toBeUndefined();
  });

  for (const [what, opts, mech, other] of [
    ['on tines among blades on top', {}, 'tines', 'plates'],
    ['on tines among blades on top, on ballast (the cuts kept off the whole set)', { ballast: 'ballast' }, 'tines', 'plates'],
    ['with blades on top in a tines design', { mechStyle: 'tines' }, 'plates', 'tines'],
  ] as const)
    it(`${what}: built as its mechanism's, goes together, its throw clear of the track`, async () => {
      const w = await kernel();
      const b = build(w, design(opts, mech));
      // (each set as its own mechanism)
      expect(onTop(b, 'points1')).toBe(mech === 'plates');
      expect(onTop(b, 'points2')).toBe(other === 'plates');
      // (every moving part goes in as its mechanism's do: the plate-style slider floored and along its tunnel)
      expect(putTogether(w, b.pieces, { fromTop: false, bladesTop: other === 'plates' })).toEqual([]);
      for (const n of ['points1-throw', 'points2-throw']) expect(throwIn(w, b, n), n).toBeLessThan(0.5);
      // (the track round it as in a design all of its mechanism; a tines set's only: a set with blades on top in a tines
      // design keeps the tines' whole-set keep-out from the cuts, so its cuts may differ)
      if (mech === 'tines') {
        const a = near(w, b), u = near(w, build(w, design({ ...opts, mechStyle: mech })));
        expect(a.subtract(u).volume() + u.subtract(a).volume()).toBeLessThan(0.05);
      }
    }, 300000);
});
