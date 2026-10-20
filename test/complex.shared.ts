// Complex designs (test/fixtures/complex, scripts/complex-fixtures.mts) built
// whole and checked: every moving part one piece and clear of the track as
// assembled, a lever for every set of points the solver finds, no track part
// that's a sliver or comes apart, and just the warnings expected. (Spread over
// a few files: the kernel's memory runs out after enough big builds in one.)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { arena, flat, kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache, orient } from '../src/app/build';
import { type Design, toRoutes } from '../src/app/design';
import { solve } from '../src/route/solver';
import { routePose } from '../src/route/route';

export const fixture = (n: string): Design => JSON.parse(readFileSync(new URL(`./fixtures/complex/${n}.json`, import.meta.url), 'utf8'));

/** [name, design, warnings expected (each matched by one), more options, whether its moving parts may meet the track (a design that can't work, and says so)]. */
export type ComplexCase = [string, Design, RegExp[]?, Design['options']?, boolean?];

export function complexSuite(cases: ComplexCase[]) {
  describe('complex designs', { timeout: 300000 }, () => {
    for (const [name, d0, expectWarn = [], more = {}, clashOk = false] of cases)
      it(name, async () => {
        const w = await kernel();
        const d: Design = { ...d0, options: { printBedX: 2000, printBedY: 2000, ...d0.options, ...more } };
        // (every solid the build and the checks make let go after, the build's cache with them: kept, a file's worth of
        // designs ran the kernel's memory to its 4 GB and crawled)
        const problems = arena(w, () => { try { return check(w, d, expectWarn, clashOk); } finally { clearBuildCache(); } }, () => []);
        expect(problems.join('; ')).toBe('');
      });
  });
}

function check(w: Awaited<ReturnType<typeof kernel>>, d: Design, expectWarn: RegExp[], clashOk: boolean) {
        const b = buildDesign(w, d);
        const man = (p: { positions: Float32Array }) => {
          const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) });
          mesh.merge();
          const m0 = new w.Manifold(mesh), m = flat(w, m0); // (flat: noted for the arena to let go, as a new Manifold isn't)
          m0.delete();
          return m;
        };
        const problems: string[] = [];
        const trackPs = b.pieces.filter((p) => !/points|throw|lever|bracket|lid/.test(p.name));
        const track = w.Manifold.union(trackPs.map(man));
        for (const p of b.pieces.filter((q) => /points|throw|lever|bracket/.test(q.name))) {
          const m = man(p), n = m.decompose().length, v = m.intersect(track).volume();
          if (n !== 1) problems.push(`${p.name} is in ${n} pieces`);
          if (v > 0.5 && !clashOk) problems.push(`${p.name}: ${v.toFixed(1)} mm3 in the track`);
        }
        // (a track part: one body (bar breakaway end supports), not a sliver)
        for (const p of trackPs) {
          const m = man(p), bb = m.boundingBox(), bodies = m.decompose().filter((z) => z.volume() > 300).length;
          if (bodies !== 1) problems.push(`${p.name} is in ${bodies} pieces`);
          if (m.volume() < 3000 || Math.min(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) < 24) problems.push(`${p.name} is a sliver`);
        }
        // (a lever for every toe the solver finds points at: a three-way's splits share one)
        const rs = orient(toRoutes(d).filter((r) => r.segments.length)), sol = solve(rs, { gauge: (d.gaugeStuds + 1) * 8, step: 0.5 });
        const toes = new Set(sol.splits.map((sp) => { const q = routePose(rs[sp.routes[0]], sp.merge ? sp.spans[0][1] : sp.spans[0][0]); return `${Math.round(q[0])},${Math.round(q[1])}`; }));
        const levers = b.pieces.filter((p) => /lever/.test(p.name)).length;
        if (levers !== toes.size) problems.push(`${levers} levers for points at ${toes.size} toes`);
        const warns = b.info.warnings;
        for (const re of expectWarn) if (!warns.some((x) => re.test(x))) problems.push(`no warning ${re}`);
        for (const x of warns) if (!expectWarn.some((re) => re.test(x))) problems.push(`warning: ${x}`);
        return problems;
}
