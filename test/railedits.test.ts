// (expert, stage 5b) Rails edited by hand: the pure parts. What a file's edits are held to, the refusals in the doc's
// words, the warnings, and how they go with their track when it's turned end for end, mirrored, split, joined or
// reshaped.
import { describe, expect, it } from 'vitest';
import { type DRoute, readDesign, toRoutes } from '../src/app/design';
import { cleanRailEdits, followRailEdits, handRails, joinRailEdits, mirrorRailEdits, railProblem, railsSummary, railWarnings, reverseRailEdits, splitRailEdits, withRailEdit } from '../src/app/railedits';
import { alongAfter } from '../src/app/routecuts';
import { mirrorRoute, reversedRoute } from '../src/app/routeedits';
import { mergeRoutes, splitRoute } from '../src/app/splitmerge';
import { cardSections } from '../src/app/cardsections';
import { byHandNote } from '../src/app/items';
import { subHand } from '../src/route/route';

const straight = (more: Partial<DRoute> = {}, studs = 32): DRoute => ({ name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }], ...more });
const ALL = { gaps: [{ at: 8, side: 'both' as const }, { at: 20, side: 'left' as const, w: 2 }], guards: [{ from: 4, to: 12, side: 'right' as const, gap: 0.5 }], checks: [{ from: 16, to: 24, side: 'left' as const }], ends: 'square' as const };

describe('rail edits: what a design keeps', () => {
  it('keeps well-formed edits, in order, numbers in range; drops what is malformed or says nothing', () => {
    expect(cleanRailEdits({ gaps: [{ at: 20, side: 'left', w: 9 }, { at: 8, side: 'both', w: 1 }, { at: 8, side: 'right' }, { at: -2, side: 'left' }, { at: 4, side: 'up' }],
      guards: [{ from: 12, to: 4, side: 'right', gap: 0.1 }, { from: 6, to: 10, side: 'right' }, { from: 0, to: 1 }],
      checks: [{ from: 16, to: 24, side: 'left' }, { from: 16, to: 24 }], ends: 'square', more: 1 }))
      .toEqual({ gaps: [{ at: 8, side: 'both' }, { at: 20, side: 'left', w: 3 }], guards: [{ from: 4, to: 12, side: 'right', gap: 0.32 }], checks: [{ from: 16, to: 24, side: 'left' }], ends: 'square' });
    expect(cleanRailEdits({ gaps: [], ends: 'round' })).toBeUndefined();
    expect(cleanRailEdits('x')).toBeUndefined();
  });
  it('a design file keeps them; a route without any reads and builds as it always did', () => {
    const d = readDesign({ version: 1, gaugeStuds: 4, routes: [straight({ railEdits: ALL } as Partial<DRoute>), straight({ name: 'B', x: 16, railEdits: { gaps: 'no' } } as unknown as Partial<DRoute>)] });
    expect(d.routes[0].railEdits).toEqual(ALL);
    expect(d.routes[1].railEdits).toBeUndefined();
    const [a, b] = toRoutes(d);
    expect(a.hand).toEqual({ from: 0, to: 256, len: 256, gaps: [{ at: 64, side: 0, w: 1 }, { at: 160, side: -1, w: 2 }], checks: [{ a: 128, b: 192, side: -1, fw: 3 }], square: true });
    expect(a.extra?.guardOn).toEqual([{ a: 32, b: 96, side: 1, gap: 0.5 }]);
    expect(b.hand).toBeUndefined();
    expect(b.extra).toBeUndefined();
  });
  it('guard rails all along win over stretches of them (said in the card), and none with dual gauge', () => {
    const [a] = toRoutes(readDesign({ version: 1, gaugeStuds: 4, routes: [straight({ guardRails: true, railEdits: { guards: [{ from: 4, to: 12 }] } })] }));
    expect(a.extra?.guard).toBe(true);
    expect(a.extra?.guardOn).toBeUndefined();
    expect(railProblem(straight({ dualGauge: true }), { guards: [{ from: 4, to: 12 }] })).toBe('Not with dual gauge: guard rails are in the way of the third rail');
  });
});

describe('rail edits: what is refused and warned of', () => {
  it('the doc\'s words', () => {
    expect(railProblem(straight(), { gaps: [{ at: 0.5, side: 'left' }] })).toBe('A gap goes between the track\'s end connectors: 1 to 31 studs along');
    expect(railProblem(straight(), { checks: [{ from: 28, to: 40, side: 'left' }] })).toBe('A rail runs past the track\'s end: 0 to 32 studs');
    expect(railProblem(straight(), { guards: [{ from: 4, to: 12, gap: 0.3 }] })).toBe('Wheels need 2.5 mm');
    expect(railProblem(straight(), ALL)).toBeUndefined();
  });
  it('a gap on a curve under R40 with no check rail opposite is warned of, not refused', () => {
    const curve: DRoute = { name: 'C', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 24, angle: 90 }] };
    expect(railWarnings({ routes: [{ ...curve, railEdits: { gaps: [{ at: 10, side: 'left' }] } }] })).toEqual(['C: a gap in a rail on an R24 curve at 10 studs along, with no check rail opposite: wheels can drop into it (add a check rail there)']);
    expect(railWarnings({ routes: [{ ...curve, railEdits: { gaps: [{ at: 10, side: 'left' }], checks: [{ from: 6, to: 14, side: 'right' }] } }] })).toEqual([]);
    expect(railWarnings({ routes: [{ ...curve, segs: [{ kind: 'curve', radius: 40, angle: 90 }], railEdits: { gaps: [{ at: 10, side: 'both' }] } }] })).toEqual([]);
    expect(railWarnings({ routes: [straight({ system: 'monorail', railEdits: { ends: 'square' } })] })).toEqual(['Main\'s rails edited by hand aren\'t made: it\'s monorail']);
  });
});

describe('rail edits: they go with their track', () => {
  it('turned end for end twice, mirrored twice: as they were; once: from the other end, sides swapped', () => {
    expect(reverseRailEdits(ALL, 32)).toEqual({ gaps: [{ at: 12, side: 'right', w: 2 }, { at: 24, side: 'both' }], guards: [{ from: 20, to: 28, side: 'left', gap: 0.5 }], checks: [{ from: 8, to: 16, side: 'right' }], ends: 'square' });
    expect(reverseRailEdits(reverseRailEdits(ALL, 32), 32)).toEqual(ALL);
    expect(mirrorRailEdits(mirrorRailEdits(ALL))).toEqual(ALL);
    const r = straight({ railEdits: structuredClone(ALL) });
    expect(reversedRoute(reversedRoute(r)).railEdits).toEqual(ALL);
    const m = structuredClone(r); mirrorRoute(m, 0);
    expect(m.railEdits?.checks).toEqual([{ from: 16, to: 24, side: 'right' }]);
  });
  it('split then joined: as they were; a stretch over the cut on both halves', () => {
    const [a, b] = splitRailEdits(ALL, 10);
    expect(a).toEqual({ gaps: [{ at: 8, side: 'both' }], guards: [{ from: 4, to: 10, side: 'right', gap: 0.5 }], ends: 'square' });
    expect(b).toEqual({ gaps: [{ at: 10, side: 'left', w: 2 }], guards: [{ from: 0, to: 2, side: 'right', gap: 0.5 }], checks: [{ from: 6, to: 14, side: 'left' }], ends: 'square' });
    const back = joinRailEdits(a, b, 10)!;
    expect(back.gaps).toEqual(ALL.gaps);
    expect(back.checks).toEqual(ALL.checks);
    // (the design's split and merge carry them)
    const d = { version: 1 as const, gaugeStuds: 4, routes: [straight({ railEdits: structuredClone(ALL) })] };
    splitRoute(d, 0, 16);
    expect(d.routes[0].railEdits?.gaps).toEqual(ALL.gaps.slice(0, 1));
    expect(d.routes[1].railEdits?.gaps).toEqual([{ at: 4, side: 'left', w: 2 }]);
    mergeRoutes(d, 0, 1);
    expect(d.routes[0].railEdits?.gaps).toEqual(ALL.gaps);
  });
  it('a piece reshaped: each stays in its piece, at its distance from the piece\'s start', () => {
    const before = { segs: [{ kind: 'straight' as const, studs: 8 }, { kind: 'curve' as const, radius: 40, angle: 45 }] }, after = { segs: [{ kind: 'straight' as const, studs: 12 }, before.segs[1]] };
    const at = alongAfter(before, after)!;
    expect(followRailEdits({ gaps: [{ at: 4, side: 'left' }, { at: 20, side: 'left' }] }, at)?.gaps).toEqual([{ at: 4, side: 'left' }, { at: 24, side: 'left' }]);
  });
  it('a stretch of the route (the build\'s pieces): only what is on it', () => {
    const h = toRoutes(readDesign({ version: 1, gaugeStuds: 4, routes: [straight({ railEdits: { gaps: [{ at: 8, side: 'both' }, { at: 24, side: 'left' }] } })] }))[0].hand;
    expect(subHand(h, 0, 128)?.gaps).toEqual([{ at: 64, side: 0, w: 1 }]);
    expect(subHand(h, 128, 256)?.gaps).toEqual([{ at: 192, side: -1, w: 1 }]);
  });
  it('withRailEdit sets, adds and takes out; the card has a Rails section saying what it has; the Expert tools note counts them', () => {
    expect(withRailEdit(ALL, 'gaps', 0, undefined)?.gaps).toEqual([{ at: 20, side: 'left', w: 2 }]);
    expect(withRailEdit(undefined, 'checks', undefined, { from: 2, to: 6, side: 'right' })).toEqual({ checks: [{ from: 2, to: 6, side: 'right' }] });
    expect(withRailEdit({ checks: [{ from: 2, to: 6, side: 'right' }] }, 'checks', 0, undefined)).toBeUndefined();
    const r = straight({ railEdits: ALL }), d = { version: 1 as const, gaugeStuds: 4, routes: [r] };
    expect(railsSummary(r)).toBe('2 gaps, 1 guard rail stretch, 1 check rail, square ends');
    expect(railsSummary(straight())).toBe('as laid');
    expect(cardSections(d, r, { branches: false }).find((s) => s.id === 'rails')?.summary).toBe('2 gaps, 1 guard rail stretch, 1 check rail, square ends');
    expect(byHandNote(d, r)).toBe('Has 5 rail edits');
    expect(handRails({ checks: [{ from: 2, to: 6, side: 'right' }] }, 2.5)).toEqual({ checks: [{ a: 16, b: 48, side: 1, fw: 2.5 }] });
  });
});

describe('frog and points edits a design file keeps (stages 5b and 5c)', () => {
  it('only the values they take; the rest left out, so the design\'s', () => {
    const d = readDesign({ version: 1, gaugeStuds: 4, routes: [straight()], trackwork: {
      groove: { '1,2': { open: true, through: 'yes', d0: 8 } },
      points: { '0,64': { mech: 'tines', bladeStyle: 'bendy', blades: 1 }, '0,0': { mech: 'magic', blades: 3 } },
      throw: { '128,448': { throwShift: 2.4 }, '9,9': { throwShift: 40, side: 'left' }, '8,8': { throwShift: 'x' } } } });
    expect(d.trackwork).toEqual({ groove: { '1,2': { open: true, d0: 8 } }, points: { '0,64': { blades: 1 }, '0,0': {} }, throw: { '128,448': { throwShift: 2 }, '9,9': { throwShift: 5, side: 'left' }, '8,8': {} } });
  });
});
