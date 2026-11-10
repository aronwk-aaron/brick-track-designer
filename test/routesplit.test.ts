import { describe, expect, it } from 'vitest';
import type { Design, DRoute, DSeg } from '../src/app/design';
import { toRoutes } from '../src/app/design';
import { routeLength } from '../src/route/route';
import { mergeProblem, mergeRoutes, nearestAlong, routeStuds, splitRoute } from '../src/app/splitmerge';

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
/** A design in a form two equal designs share: numbers rounded, neighbouring straights (and curves of one radius and bank) as one, edits anchored from the start, nothing said that's counted afresh. */
function norm(d: Design): unknown {
  const out = structuredClone(d), lens = toRoutes(d).map((rt) => routeLength(rt));
  const names = out.routes.map((r, i) => r.name || String(i));
  out.routes.forEach((r) => {
    const segs: DSeg[] = [];
    for (const sg of r.segs) {
      const l = segs[segs.length - 1];
      if (l && l.kind === 'straight' && sg.kind === 'straight') l.studs += sg.studs;
      else if (l && l.kind === 'curve' && sg.kind === 'curve' && l.radius === sg.radius && l.bank === sg.bank && Math.sign(l.angle) === Math.sign(sg.angle) && !l.bank) l.angle += sg.angle;
      else segs.push({ ...sg });
    }
    r.segs = segs.map((sg) => (sg.kind === 'straight' ? { ...sg, studs: r4(sg.studs) } : { ...sg, angle: r4(sg.angle) }));
    r.x = r4(r.x); r.y = r4(r.y); r.heading = r4(r.heading);
    for (const k of ['guardRailEnds', 'dualPlainEnds'] as const) if (r[k] === 'none') delete r[k];
    for (const sg of r.segs) if (sg.kind === 'curve' && sg.bankRamps === 'both') delete sg.bankRamps;
    if (r.monoHeight !== undefined && r.monoHeightEnd === r.monoHeight) delete r.monoHeightEnd;
  });
  for (const g of Object.values(out.trackwork ?? {}) as Record<string, { is?: unknown; on?: [string, string, number, number] }>[]) for (const e of Object.values(g)) {
    delete e.is;
    if (e.on) { const i = names.indexOf(e.on[0]); const L = lens[i]; e.on = [e.on[0], 's', r4(e.on[1] === 's' ? e.on[2] : L - e.on[2]), e.on[3]]; }
  }
  return out;
}

const base = (extra: Partial<DRoute> = {}, segs: DSeg[] = [{ kind: 'straight', studs: 20 }]): DRoute => ({ name: 'A', x: 5, y: -3, heading: 30, segs, ...extra });
const withEdits = (d: Design, name: string, L: number): Design => {
  // (hand edits along the route, as the build anchors them: from its start or its end, to the right of it)
  d.trackwork = {
    check: { '100,100': { on: [name, 's', 0.2 * L, 3], d0: 4, is: [[name, 'X'], 1, 0, 2] } as never, '110,100': { on: [name, 'e', 0.3 * L, -2], d1: 3, is: [['X', name], -1, 1, 2] } as never },
    throw: { '200,50': { on: [name, 's', 0.6 * L, 0], side: 'left' } as never },
    groove: { '300,50': { on: [name, 'e', 0.05 * L, 1], d0: 2 } as never },
  } as never;
  return d;
};
const designs: [string, Design][] = [];
const D = (name: string, routes: DRoute[], tw = false): void => { const d: Design = { version: 1, gaugeStuds: 4, routes }; designs.push([name, tw ? withEdits(d, routes[0].name, toRoutes(d).map((rt) => routeLength(rt))[0]) : d]); };
const curves: DSeg[] = [{ kind: 'straight', studs: 10 }, { kind: 'curve', radius: 40, angle: 45 }, { kind: 'straight', studs: 12 }, { kind: 'curve', radius: 24, angle: -90 }, { kind: 'straight', studs: 4 }];
D('a straight', [base()]);
D('a long straight, hand edits', [base({}, [{ kind: 'straight', studs: 64 }])], true);
D('straights and curves, hand edits', [base({}, curves)], true);
D('guard rails, pointed ends both', [base({ guardRails: true, guardRailEnds: 'both', guardRailGapStuds: 1 }, curves)]);
D('guard rails, pointed at the start only', [base({ guardRails: true, guardRailEnds: 'start' }, curves)]);
D('third rail, plain at the end', [base({ dualGauge: true, dualGaugeStuds: 2, dualShared: 'left', dualPlainEnds: 'end' }, curves)]);
D('buffer stops, connector', [base({ startEnd: 'buffer', endEnd: 'buffer' }, curves)]);
D('lever side', [base({ throwSide: 'left' }, curves)], true);
D('banked curves', [base({}, [{ kind: 'straight', studs: 8 }, { kind: 'curve', radius: 56, angle: 90, bank: 6 }, { kind: 'straight', studs: 8 }])]);
D('banked curve, ramps at the start only', [base({}, [{ kind: 'curve', radius: 56, angle: 90, bank: 6, bankRamps: 'start' }, { kind: 'straight', studs: 8 }])]);
D('a graded monorail', [base({ system: 'monorail', monoHeight: 4, monoHeightEnd: 10 }, curves)]);
D('a level monorail', [base({ system: 'monorail', monoHeight: 4 }, curves)]);
D('a grade on train track', [base({ monoHeight: 0, monoHeightEnd: 6 }, curves)]);
D('own gauge', [base({ gaugeStuds: 6 }, curves)]);
D('everything', [base({ guardRails: true, guardRailEnds: 'both', dualGauge: true, dualPlainEnds: 'start', startEnd: 'buffer', endEnd: 'buffer', throwSide: 'right' }, curves), { name: 'X', x: 40, y: 40, heading: 0, segs: [{ kind: 'straight', studs: 10 }] }], true);

describe('a route cut in two and put together again', () => {
  for (const [name, d0] of designs) {
    it(`gives back the same design: ${name}`, () => {
      const L = routeStuds(d0.routes[0]);
      const cuts = new Set<number>([1, 2, 3, Math.floor(L / 2), Math.round(L * 0.37), Math.round(L * 0.61), Math.floor(L) - 3, Math.floor(L) - 1, 10, 12, 22].filter((s) => s >= 1 && s <= L - 1));
      for (const s of cuts) {
        const d = structuredClone(d0);
        const res = splitRoute(d, 0, s);
        expect(res, `cut at ${s}`).toHaveProperty('first');
        expect(d.routes.length).toBe(d0.routes.length + 1);
        // (the halves run on into each other and are as long as the whole)
        expect(routeStuds(d.routes[0]) + routeStuds(d.routes[1])).toBeCloseTo(L, 4);
        expect(routeStuds(d.routes[0])).toBeCloseTo(s, 4);
        expect(mergeProblem(d, 0, 1), `merge after cut at ${s}`).toBeUndefined();
        const m = mergeRoutes(d, 0, 1);
        expect(m).toEqual({ index: 0 });
        expect(norm(d), `cut at ${s}`).toEqual(norm(d0));
      }
    });
  }
  it('merges from either route and either end (the second given first, or turned round)', () => {
    const d = { version: 1, gaugeStuds: 4, routes: [base({}, curves)] } as Design;
    splitRoute(d, 0, 14);
    const d2 = structuredClone(d);
    expect('index' in mergeRoutes(d2, 1, 0)).toBe(true);
    expect(d2.routes.length).toBe(1);
    expect(routeStuds(d2.routes[0])).toBeCloseTo(routeStuds(d.routes[0]) + routeStuds(d.routes[1]), 4);
  });
});

describe('what goes to which half', () => {
  it('puts the edits where they are, the ends and the lever with their ends', () => {
    const d: Design = withEdits({ version: 1, gaugeStuds: 4, routes: [base({ startEnd: 'buffer', endEnd: 'buffer', throwSide: 'left', guardRails: true, guardRailEnds: 'both' }, [{ kind: 'straight', studs: 50 }])] }, 'A', 400);
    splitRoute(d, 0, 25);
    const [a, b] = d.routes;
    expect([a.startEnd, a.endEnd, b.startEnd, b.endEnd]).toEqual(['buffer', undefined, undefined, 'buffer']);
    expect([a.throwSide, b.throwSide]).toEqual(['left', undefined]);
    expect([a.guardRailEnds, b.guardRailEnds]).toEqual(['start', 'end']);
    const tw = d.trackwork as unknown as Record<string, Record<string, { on: [string, string, number, number] }>>;
    // (60% along = 30 studs of 50: in the second half, 5 studs = 40 mm in; 20% = 10 studs: the first half)
    expect(tw.throw['200,50'].on).toEqual([b.name, 's', 40, 0]);
    expect(tw.check['100,100'].on[0]).toBe('A');
    expect(tw.groove['300,50'].on[0]).toBe(b.name);
  });
  it('refuses a cut within a stud of an end', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [base()] };
    expect(splitRoute(d, 0, 0.4)).toHaveProperty('problem');
    expect(splitRoute(d, 0, 19.7)).toHaveProperty('problem');
    expect(d.routes.length).toBe(1);
  });
  it("won't merge routes that don't meet, or differ in settings", () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [base(), { name: 'B', x: 50, y: 50, heading: 0, segs: [{ kind: 'straight', studs: 4 }] }] };
    expect(mergeProblem(d, 0, 1)).toMatch(/meet/);
    const e: Design = { version: 1, gaugeStuds: 4, routes: [base({ guardRails: true })] };
    splitRoute(e, 0, 8); delete e.routes[1].guardRails;
    expect(mergeProblem(e, 0, 1)).toMatch(/guard rails/);
  });
  it('finds how far along a route a point is', () => {
    const r = base({ x: 0, y: 0, heading: 0 }, [{ kind: 'straight', studs: 10 }, { kind: 'curve', radius: 24, angle: 90 }]);
    expect(nearestAlong(r, [0.1, 7]).s).toBeCloseTo(7, 4);
    expect(nearestAlong(r, [0.1, 7]).dist).toBeCloseTo(0.1, 4);
  });
});
