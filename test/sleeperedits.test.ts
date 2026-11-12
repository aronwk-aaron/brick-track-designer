// (expert, stage 5a) Sleepers edited by hand, sleepers shared across tracks and pairs of tracks accepted as running
// over each other: the pure parts. What a file's lists are held to, the refusals in the doc's words, how they go
// with their track when it's turned end for end, mirrored, split, joined or reshaped, and what a click picks.
import { describe, expect, it } from 'vitest';
import { type Design, type DRoute, readDesign, toRoutes } from '../src/app/design';
import { cleanShared, cleanSleeperEdits, followSleeperEdits, joinSleeperEdits, layOf, mirrorSleeperEdits, planSleepers, reverseSleeperEdits, setShared, sharedOf, sleeperEditText, sleeperProblem, sleeperWarnings, splitSleeperEdits, withSleeperEdit } from '../src/app/sleeperedits';
import { accepted, cleanAccept, renameAccept, setAccept, splitAccept } from '../src/app/accept';
import { alongAfter } from '../src/app/routecuts';
import { mirrorRoute, reversedRoute } from '../src/app/routeedits';
import { mergeRoutes, splitRoute } from '../src/app/splitmerge';
import { expandStretches } from '../src/app/stretches';
import { byHandNote, hitItems, itemLabel, picks, sleeperEditAt } from '../src/app/items';
import { partsOf } from '../src/app/overrides';
import { laySleepers, localSleepers } from '../src/geom/handsleepers';
import { reversedRoute as reversedBuilt } from '../src/switch/reverse';
import { subRoute } from '../src/switch/pieces';

const straight = (more: Partial<DRoute> = {}, studs = 32): DRoute => ({ name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }], ...more });
const design = (routes: DRoute[], more: Partial<Design> = {}): Design => ({ version: 1, gaugeStuds: 4, options: { sleepers: 'sleepers' }, routes, ...more });
const LAY = { gap: 2, w: 2, curved: false };

describe('sleeper edits: the list a design keeps', () => {
  it('keeps well-formed edits, in order, one to a place, each number in its range; an edit that says nothing is none', () => {
    expect(cleanSleeperEdits([{ at: 12, move: 1 }, { at: 4.004, off: true }, { at: 12, left: 2 }, { at: 8 }, { at: 20, left: 99, right: -3, move: 40 }, 'x', { at: -1, off: true }, { at: 16, turn: 'square', studs: false }, { at: 12, add: true }]))
      .toEqual([{ at: 4, off: true }, { at: 12, move: 1 }, { at: 12, add: true }, { at: 16, turn: 'square', studs: false }, { at: 20, move: 16, left: 24 }]);
    expect(cleanSleeperEdits([{ at: 8 }, { at: 9, move: 0, left: 0 }])).toBeUndefined();
    expect(cleanSleeperEdits('no')).toBeUndefined();
  });
  it('a design file keeps them, and its shared sleepers and accepted pairs, and drops what is malformed', () => {
    const d = readDesign({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }], sleeperEdits: [{ at: 8, off: true }, { at: 'x' }] }, { name: 'B', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }], sleeperEdits: 'none' }],
      expert: { shared: [{ routes: ['A', 'B'], from: 4.2, to: 20 }, { routes: ['A', 'Gone'], from: 0, to: 8 }, { routes: ['A', 'B'], from: 9, to: 9 }], accept: [{ routes: ['A', 'B'], what: 'over' }, { routes: ['B', 'A'], what: 'over' }, { routes: ['A', 'Gone'], what: 'over' }, { routes: ['A', 'B'], what: 'else' }] } });
    expect(d.routes[0].sleeperEdits).toEqual([{ at: 8, off: true }]);
    expect(d.routes[1].sleeperEdits).toBeUndefined();
    expect(d.expert).toEqual({ shared: [{ routes: ['A', 'B'], from: 4, to: 20 }], accept: [{ routes: ['A', 'B'], what: 'over' }] });
    // (read again: the same)
    expect(readDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(cleanShared([{ routes: ['A'], from: 0, to: 8 }], new Set(['A']))).toBeUndefined();
    expect(cleanAccept([{ routes: ['A', 'A'], what: 'over' }], new Set(['A']))).toEqual([{ routes: ['A', 'A'], what: 'over' }]);
  });
  it('a design without any of it has no hand edits on its routes, and reads as it always did', () => {
    const d = design([straight()]);
    expect(toRoutes(d)[0].hand).toBeUndefined();
    expect(toRoutes(design([straight()], { options: { ballast: 'ballast', ballastLeftStuds: 1, ballastRightStuds: 1 } }))[0].hand).toBeUndefined();
    expect(toRoutes(design([straight()], { options: { ballast: 'none', ballastLeftStuds: 3 } }))[0].hand).toBeUndefined();
    expect(toRoutes(design([straight()], { options: { ballast: 'ballast', ballastLeftStuds: 3 } }))[0].hand).toEqual({ from: 0, to: 256, len: 256, ballast: { left: 24, right: 8 } });
  });
});

describe('sleeper edits: laid, and what is refused', () => {
  it('a 32-stud track has sleepers every 4 studs from 4; edits are of the nearest, and added ones are put in', () => {
    expect(planSleepers(straight(), LAY).laid.map((q) => q.at)).toEqual([4, 8, 12, 16, 20, 24, 28]);
    const r = straight({ sleeperEdits: cleanSleeperEdits([{ at: 8.6, off: true }, { at: 12, move: -1 }, { at: 22, add: true }, { at: 3, left: 1 }, { at: 30.5, off: true }]) });
    const p = planSleepers(r, LAY);
    expect(p.laid.map((q) => q.at)).toEqual([4, 11, 16, 20, 22, 24, 28]);
    expect(p.laid.map((q) => q.e?.at)).toEqual([3, 12, undefined, undefined, 22, undefined, undefined]);
    // (30.5 is over half a spacing from 28: no sleeper for it)
    expect(p.lost.map((k) => r.sleeperEdits![k].at)).toEqual([30.5]);
    // (two edits by one sleeper: the first has it)
    expect(laySleepers([32, 64], [{ at: 30, off: true }, { at: 34, move: 8 }], 16).lost).toEqual([{ at: 34, move: 8 }]);
  });
  it('refuses, in the doc\'s words: a gap the rails can\'t span, whole studs on the baseplate grid, a blade, a sleeper off the track or on another', () => {
    const r = straight(), ok = (es: unknown) => sleeperProblem(r, cleanSleeperEdits(es) ?? [], LAY, true);
    expect(ok([{ at: 8, off: true }])).toBeUndefined();
    expect(ok([{ at: 8, off: true }, { at: 12, off: true }])).toBe('The rails would span 10 studs here: 6 at most');
    // (from the end connector, a stud deep, to the sleeper at 8: 6 studs, the most)
    expect(ok([{ at: 4, off: true }])).toBeUndefined();
    expect(ok([{ at: 12, move: 0.5 }])).toMatch(/^Whole studs only: the underside is lined up with the baseplate/);
    expect(sleeperProblem(r, cleanSleeperEdits([{ at: 12, move: 0.5 }])!, LAY, false)).toBeUndefined();
    expect(ok([{ at: 12, move: 3 }])).toBe('Sleepers can\'t lie on each other');
    expect(ok([{ at: 4, move: -3 }])).toBe('A sleeper lies between the track\'s end connectors: 2 to 30 studs along');
    expect(sleeperProblem(r, cleanSleeperEdits([{ at: 12, move: 1 }])!, LAY, true, (at) => at > 12.5 && at < 20)).toBe('A blade moves here: no sleeper under a blade\'s moving length');
    expect(sleeperProblem(r, cleanSleeperEdits([{ at: 22, add: true }])!, LAY, true)).toBeUndefined();
  });
  it('the build says what isn\'t made', () => {
    const r = straight({ sleeperEdits: [{ at: 8, off: true }] });
    expect(sleeperWarnings(design([r]), { ballast: 'none', sleepers: 'sleepers' })).toEqual([]);
    expect(sleeperWarnings(design([r]), { ballast: 'buddy', sleepers: 'sleepers' })[0]).toMatch(/Main's sleepers edited by hand aren't made: it's on ballast/);
    expect(sleeperWarnings(design([r]), { ballast: 'none', sleepers: 'bed' })[0]).toMatch(/on a solid bed/);
    expect(sleeperWarnings(design([straight({ sleeperEdits: [{ at: 30.5, off: true }] })]), { ballast: 'none', sleepers: 'sleepers' })[0]).toMatch(/no sleeper near 30.5 studs along/);
  });
  it('says each edit in words', () => {
    expect(sleeperEditText({ at: 8, off: true })).toBe('taken out');
    expect(sleeperEditText({ at: 8, move: -1, left: 2, right: 1, turn: 'square', studs: false })).toBe('moved 1 stud back, 2 studs longer on the left, 1 stud longer on the right, square to the grid, no studs');
    expect(sleeperEditText({ at: 8, add: true, move: 2 })).toBe('added, moved 2 studs on');
    expect(withSleeperEdit([{ at: 8, off: true }], 0, undefined)).toBeUndefined();
    expect(layOf(straight(), {})).toEqual(LAY);
  });
});

describe('sleeper edits go with their track', () => {
  const es = cleanSleeperEdits([{ at: 8, off: true }, { at: 12, move: 1, left: 2 }, { at: 22, add: true, right: 1 }])!;
  it('turned end for end and back is the same; mirrored swaps the sides', () => {
    const rev = reverseSleeperEdits(es, 32)!;
    expect(rev).toEqual([{ at: 10, add: true, left: 1 }, { at: 20, move: -1, right: 2 }, { at: 24, off: true }]);
    expect(reverseSleeperEdits(rev, 32)).toEqual(es);
    expect(mirrorSleeperEdits(es)).toEqual([{ at: 8, off: true }, { at: 12, move: 1, right: 2 }, { at: 22, add: true, left: 1 }]);
    const r = straight({ sleeperEdits: es, own: { ballastLeftStuds: 3 }, stretches: [{ from: 4, to: 12, own: { ballastRightStuds: 2 } }] });
    const back = reversedRoute(r);
    expect(back.sleeperEdits).toEqual(rev);
    expect(back.own).toEqual({ ballastRightStuds: 3 });
    expect(back.stretches).toEqual([{ from: 20, to: 28, own: { ballastLeftStuds: 2 } }]);
    const m = structuredClone(r); mirrorRoute(m, 0);
    expect(m.sleeperEdits).toEqual(mirrorSleeperEdits(es));
    expect(m.own).toEqual({ ballastRightStuds: 3 });
  });
  it('split then joined is the same; a reshape keeps each in its piece', () => {
    const [a, b] = splitSleeperEdits(es, 16);
    expect(a).toEqual([{ at: 8, off: true }, { at: 12, move: 1, left: 2 }]);
    expect(b).toEqual([{ at: 6, add: true, right: 1 }]);
    expect(joinSleeperEdits(a, b, 16)).toEqual(es);
    const d = design([straight({ sleeperEdits: es })], { expert: { accept: [{ routes: ['Main', 'Main'], what: 'over' }] } });
    const sp = splitRoute(d, 0, 16) as { first: string; second: string };
    expect(d.routes.map((r) => r.sleeperEdits)).toEqual([a, b]);
    expect(accepted(d, 'Main', sp.second) && accepted(d, sp.second, sp.second)).toBe(true);
    expect('index' in mergeRoutes(d, 0, 1)).toBe(true);
    expect(d.routes[0].sleeperEdits).toEqual(es);
    expect(d.expert?.accept).toEqual([{ routes: ['Main', 'Main'], what: 'over' }]);
    // (the first of two pieces made 8 studs longer: an edit on the second piece is 8 further along, one on the first stays)
    const before = { segs: [{ kind: 'straight' as const, studs: 10 }, { kind: 'curve' as const, radius: 40, angle: 45 }] }, after = { segs: [{ kind: 'straight' as const, studs: 18 }, before.segs[1]] };
    expect(followSleeperEdits(es, alongAfter(before, after)!)).toEqual([{ at: 8, off: true }, { at: 20, move: 1, left: 2 }, { at: 30, add: true, right: 1 }]);
  });
  it('a stretch of the build\'s route has the edits along it, as it runs: turned round, its sides and moves the other way', () => {
    const rt = toRoutes(design([straight({ sleeperEdits: es })]))[0];
    expect(localSleepers(rt).map((e) => e.at)).toEqual([64, 96, 176]);
    const sub = subRoute(rt, 128, 256);
    expect(localSleepers(sub)).toEqual([{ at: 48, add: true, left: 0, right: 8 }]);
    expect(localSleepers(reversedBuilt(sub))).toEqual([{ at: 80, add: true, left: 8, right: 0 }]);
    expect(localSleepers(reversedBuilt(rt)).find((e) => e.move)).toEqual({ at: 160, move: -8, left: 0, right: 16 });
    // (a stretch with no edits near it has none: its files are keyed as they always were)
    expect(subRoute(toRoutes(design([straight({ sleeperEdits: [{ at: 8, off: true }] })]))[0], 128, 256).hand).toBeUndefined();
  });
});

describe('sleepers shared across tracks, and accepted pairs', () => {
  const two = () => design([straight({ name: 'A' }), straight({ name: 'B', x: 16 })], { expert: { shared: [{ routes: ['A', 'B'], from: 8, to: 24 }] } });
  it('the tracks are one part, the first one\'s route has the stretch, and it follows a split, a rename and a stretch of its own', () => {
    const d = two();
    expect(partsOf(d)).toEqual([0, 0]);
    expect(partsOf({ ...d, expert: undefined })).toEqual([0, 1]);
    expect(toRoutes(d)[0].hand?.shared).toEqual([{ a: 64, b: 192, with: ['B'] }]);
    expect(sharedOf(d, 0).length).toBe(1);
    expect(sharedOf(d, 1).length).toBe(0);
    splitRoute(d, 0, 16, 'A2');
    expect(d.expert?.shared).toEqual([{ routes: ['A', 'B'], from: 8, to: 16 }, { routes: ['A2', 'B'], from: 0, to: 8 }]);
    const e = two(); splitRoute(e, 1, 16, 'B2');
    expect(e.expert?.shared).toEqual([{ routes: ['A', 'B', 'B2'], from: 8, to: 24 }]);
    // (a stretch with its own settings cuts the track for the build: the shared sleepers go by the pieces' names)
    const st = two(); st.routes[0].stretches = [{ from: 12, to: 20, own: { sleeperGapStuds: 3 } }];
    const x = expandStretches(st).design;
    expect(x.expert?.shared?.map((s) => [s.routes[0], s.from, s.to])).toEqual([['A', 8, 12], ['A (12 to 20)', 0, 8], ['A (20 to 32)', 0, 4]]);
    setShared(d, []);
    expect(d.expert).toBeUndefined();
  });
  it('accepted pairs go by the tracks\' names', () => {
    const d = two();
    setAccept(d, 'B', 'A', true); setAccept(d, 'A', 'B', true);
    expect(d.expert?.accept).toEqual([{ routes: ['A', 'B'], what: 'over' }]);
    // (renamed: before the track has its new name, as its card does it)
    renameAccept(d, 'B', 'C'); d.routes[1].name = 'C';
    expect(accepted(d, 'A', 'B')).toBe(false);
    expect(accepted(d, 'C', 'A')).toBe(true);
    splitAccept(d, 'A', 'A2');
    setAccept(d, 'A', 'C', false);
    expect(d.expert?.accept).toBeUndefined();
  });
});

describe('sleepers on the plan', () => {
  it('a click picks a sleeper only when Clicks pick is Sleepers; by its place, an edited one by its edit\'s', () => {
    expect(picks('all', 'sleeper', true)).toBe(false);
    expect(picks('sleeper', 'sleeper', true)).toBe(true);
    expect(picks('sleeper', 'sleeper', false)).toBe(false);
    const d = design([straight({ sleeperEdits: [{ at: 8, off: true }, { at: 12, move: -1 }, { at: 22, add: true }] })]);
    const hit = (x: number, y: number) => hitItems(d, [x, y], { near: 0.5, point: 0.6, kinds: ['sleeper'], sleepersOf: [0], layOf: () => LAY })[0]?.item;
    expect(hit(1, 16.3)).toEqual({ kind: 'sleeper', route: 0, at: 16 });
    expect(hit(1, 11)).toEqual({ kind: 'sleeper', route: 0, at: 12 });
    expect(hit(1, 13.5)).toBeUndefined();
    expect(hit(1, 22)).toEqual({ kind: 'sleeper', route: 0, at: 22, add: true });
    // (one taken out is still there to click, to put it back)
    expect(hit(0, 8)).toEqual({ kind: 'sleeper', route: 0, at: 8 });
    expect(hit(9, 16)).toBeUndefined();
    expect(hitItems(d, [1, 16], { near: 0.5, point: 0.6, kinds: ['sleeper'], sleepersOf: [0], layOf: () => undefined })).toEqual([]);
    expect(sleeperEditAt(d.routes[0], { at: 22, add: true })).toBe(2);
    expect(sleeperEditAt(d.routes[0], { at: 16 })).toBe(-1);
    expect(itemLabel(d, { kind: 'sleeper', route: 0, at: 12 })).toBe('Sleeper of Main, 12 studs from its start: moved 1 stud back');
    expect(itemLabel(d, { kind: 'sleeper', route: 0, at: 16 })).toBe('Sleeper of Main, 16 studs from its start');
    expect(byHandNote(d, d.routes[0])).toBe('Has 3 sleepers edited by hand');
  });
});
