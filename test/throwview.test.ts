// Throwing switches in the 3D view (app/throwview.ts): display only. The parts are built as assembled; the view moves
// them. Checked against the parts themselves: with a set's blades turned to each of its places, a wheel's flange (as
// deep as the flangeways are cut) passes along the route that place is said to set, and along no other of its routes.
// A three-way steps through its three; a double slip's two sets at each end are each other's mates (thrown together).
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';
import { Scad } from '../src/geom/scad';
import { sweepRoute } from '../src/geom/sweep';
import { routeLength, routeSOf } from '../src/route/route';
import { moveOf, nextPlace, setRoutes, slidAt, throwSets, type Moving } from '../src/app/throwview';
import { solid } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const RAIL_TOP = 3.2 + 6.4, HEAD_HW = 1.25, FL = { depth: 3, width: 1.5, off: 0.05 };

describe('throwing switches in the 3D view: the sets and their places', () => {
  const blade = (name: string, by: number, set = 'k'): Moving => ({ name, set, turn: { at: [0, 0], by, swing: 3 } });
  const slider = (name: string, set = 'k'): Moving => ({ name, set, slide: { dir: [1, 0], by: 3 } });
  const lever = (name: string, set = 'k'): Moving => ({ name, set, hinge: { at: [0, 0, 0], axis: [0, 1], by: -16 } });
  it('a switch: one lever, two places; the track and a part with no set are left alone', () => {
    const ps: Moving[] = [{ name: 'switch-base' }, blade('switch-points-a', 3), blade('switch-points-b', 0), slider('switch-throw'), lever('switch-lever'), { name: 'switch-points-spring', set: 'k' }];
    const st = throwSets(ps, () => 2).get('k')!;
    expect(st.groups).toEqual([[1, 2, 3, 4]]);
    expect(st.places).toEqual([[0], [1]]);
    expect(nextPlace(0, 2)).toBe(1); expect(nextPlace(1, 2)).toBe(0);
  });
  it('a three-way: on one slider three places, the straight half way; with a lever to each blade, the left blade\'s lever first', () => {
    const one = throwSets([blade('points1-a', 3), blade('points1-b', 0), slider('points1-throw'), lever('points1-lever')], () => 3).get('k')!;
    expect(one.places).toEqual([[0], [0.5], [1]]); expect(one.half).toBe(true);
    // (half way both blades closed: the open one has closed by its swing, the closed one hasn't moved; at the end that one's open by two throws)
    expect([0, 0.5, 1].map((f) => [moveOf(blade('a', 3), f, undefined, true).deg, moveOf(blade('b', 0), f, undefined, true).deg])).toEqual([[0, 0], [0, 3], [6, 3]]);
    const two = throwSets([blade('switch-points2', 0), slider('switch-throw2'), lever('switch-lever2'), blade('switch-points1', 3), slider('switch-throw1'), lever('switch-lever1')], () => 3).get('k')!;
    expect(two.groups).toEqual([[3, 4, 5], [0, 1, 2]]);
    expect(two.places).toEqual([[0, 0], [0, 1], [1, 1]]);
    expect([0, 1, 2].map((k) => nextPlace(k, 3))).toEqual([1, 2, 0]);
  });
  it('the slider follows its lever\'s tip: at rest at both ends, half way in the middle', () => {
    expect(slidAt(0, -16)).toBeCloseTo(0, 9); expect(slidAt(1, -16)).toBeCloseTo(1, 9); expect(slidAt(0.5, -16)).toBeCloseTo(0.5, 9);
    expect(slidAt(0.3)).toBe(0.3);
    expect(moveOf(blade('a', 3), 1).deg).toBe(3);
    expect(moveOf(slider('t'), 1).shift).toEqual([3, 0, 0]);
    expect(moveOf(lever('l'), 0.5, -16).deg).toBe(-8);
  });
});

describe('throwing switches in the 3D view: each place sets the route it says', { timeout: 900000 }, () => {
  const cases: [string, Design['options'], number][] = [['Switch R40 left', {}, 2], ['Switch R40 right', {}, 2], ['Wye R40', {}, 2], ['Three-way R40', { threeWayLevers: 2 }, 3], ['Three-way R40', { threeWayLevers: 1 }, 3],
    ['Double slip R40 45°', {}, 2], ['Narrow-gauge wye R36', {}, 2]];
  for (const [name, options, places] of cases)
    it(`${name}${Object.keys(options ?? {}).length ? ` (${JSON.stringify(options)})` : ''}: ${places} places a set, a flange passes along each one's route and no other`, async () => {
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        const w = await kernel(), s = new Scad(w), d: Design = { ...structuredClone(TEMPLATES[name]), options: { ...TEMPLATES[name].options, ...options } };
        clearBuildCache();
        const b = buildDesign(w, d), rts = toRoutes(d), items = b.overlay.items.filter((q) => q.kind === 'points' && !q.off && !q.cand);
        const of = (key: string) => items.filter((q) => q.key === key);
        const sets = throwSets(b.pieces, (key) => new Set(of(key).flatMap((q) => q.routes ?? [])).size);
        expect(sets.size).toBe(new Set(items.map((q) => q.key)).size);
        const still = w.Manifold.union(b.pieces.filter((p) => !p.set && p.positions?.length).map((p) => solid(w, p.positions)!));
        for (const st of sets.values()) {
          const routes = setRoutes(of(st.key), rts), at = of(st.key)[0].at;
          expect(st.places.length, `${st.key}'s places`).toBe(places);
          expect(routes.length, `${st.key}'s routes`).toBe(places);
          // (the other sets' blades as assembled)
          const rest = b.pieces.filter((p) => p.set && p.set !== st.key && p.turn).map((p) => solid(w, p.positions)!);
          st.places.forEach((fr, k) => {
            const moved = st.groups.flatMap((g, gi) => { const by = g.map((i) => b.pieces[i].hinge?.by).find((v) => v !== undefined); return g.filter((i) => b.pieces[i].turn).map((i) => { const p = b.pieces[i], mv = moveOf(p, fr[gi], by, st.half); return solid(w, p.positions)!.translate([-mv.about[0], -mv.about[1], 0]).rotate([0, 0, mv.deg]).translate([mv.about[0], mv.about[1], 0]); }); });
            const body = w.Manifold.union([still, ...rest, ...moved]);
            const hit = routes.map((r) => {
              const rt = rts.find((q) => q.id === r.id)!, L = routeLength(rt), G = (rt.gauge ?? (d.gaugeStuds + 1) * 8) / 2, sT = routeSOf(rt, at), sE = routeSOf(rt, r.line[r.line.length - 1]);
              const a = Math.max(0, sE > sT ? sT + 4 : sT - 80), e = Math.min(L, sE > sT ? sT + 80 : sT - 4);
              const band = (x: number, sd: number) => sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), rt, a, e);
              return band(-G, 1).intersect(body).volume() + band(G, -1).intersect(body).volume();
            });
            // (the route it sets: clear but for a sliver; every other: a blade across the flange's way)
            hit.forEach((v, j) => { if (j === k) expect(v, `${st.key} at place ${k}: along ${routes[j].id}, the route it sets`).toBeLessThan(8); else expect(v, `${st.key} at place ${k}: along ${routes[j].id}, another route`).toBeGreaterThan(20); });
          });
        }
        // (a double slip: the two sets at each end are each other's mates, and no others)
        if (/Double slip/.test(name)) {
          const mates = items.map((q) => [q.key, q.mate] as [string, string | undefined]);
          expect(mates.every(([, m]) => !!m)).toBe(true);
          for (const [key, m] of mates) { expect(items.find((q) => q.key === m)!.mate).toBe(key); const a = of(key)[0], o = of(m!)[0]; expect(a.dir![0] * o.dir![0] + a.dir![1] * o.dir![1], `${key} and its mate ${m} face the same way`).toBeGreaterThan(0.5); }
        } else expect(items.some((q) => q.mate)).toBe(false);
        clearBuildCache();
      } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
    });
});
