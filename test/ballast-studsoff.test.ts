// (expert, stage 7) Ballast edges and stud-off areas as things of their own, the pure part (ballastedges.ts,
// studsoff.ts): kept as a file has them, where each is on the plan, an edge made wider or narrower over the whole
// track or a stretch and reset (a stretch left with nothing of its own goes), its shape at a buffer stop only where
// there is one, an area moved and its corners dragged on whole studs (held to its sizes, said), the app's areas from
// the build's plan, what a tap takes.
import { describe, expect, it } from 'vitest';
import { ballastEdges, edgeBuffers, edgeNow, edgeOwn, edgeProblem, edgeShapeBlocked, edgeShapeNow, edgeStretch, resetEdge, setEdge, setEdgeShape } from '../src/app/ballastedges';
import { appAreaBox, appAreaDistance, appAreas, areaAt, areaDistance, areaProblem, cleanStudsOff, dragCorner, inStudsOff, moveArea, nextAreaId, studsOffMm } from '../src/app/studsoff';
import { type Design, type DRoute, readDesign } from '../src/app/design';
import { hitItems, itemLabel, layerOf, picks } from '../src/app/items';
import { tidyExpert } from '../src/app/connections';

const straight = (name: string, x: number, y: number, studs: number, more: Partial<DRoute> = {}): DRoute => ({ name, x, y, heading: 0, segs: [{ kind: 'straight', studs }], ...more });
const design = (routes: DRoute[], options: Design['options'] = {}): Design => ({ version: 1, gaugeStuds: 4, options, routes });

describe('stud-off areas: kept, moved, sized', () => {
  it('a file\'s: whole studs, 1 to 64 a side, an id each; none: undefined', () => {
    expect(cleanStudsOff([{ id: 's1', x0: 2.4, y0: 5, x1: 0, y1: 1 }])).toEqual([{ id: 's1', x0: 0, y0: 1, x1: 2, y1: 5 }]);
    expect(cleanStudsOff([{ id: 's1', x0: 0, y0: 0, x1: 0.2, y1: 4 }])).toBeUndefined();
    expect(cleanStudsOff([{ id: 'a', x0: 0, y0: 0, x1: 100, y1: 2 }, { id: 'a', x0: 0, y0: 0, x1: 1, y1: 1 }])).toEqual([{ id: 'a', x0: 0, y0: 0, x1: 64, y1: 2 }, { id: 's2', x0: 0, y0: 0, x1: 1, y1: 1 }]);
    expect(cleanStudsOff('x')).toBeUndefined();
    const d = readDesign({ ...design([straight('A', 0, 0, 16)]), expert: { studsOff: [{ id: 's1', x0: 0, y0: 0, x1: 2, y1: 2 }, { x0: 'a' }] } });
    expect(d.expert?.studsOff).toEqual([{ id: 's1', x0: 0, y0: 0, x1: 2, y1: 2 }]);
    const e: Design = { ...design([]), expert: { studsOff: [] } }; tidyExpert(e); expect(e.expert).toBeUndefined();
    expect(nextAreaId([{ id: 's1' }, { id: 's3' }])).toBe('s4');
  });
  it('a new one 2 by 2 where tapped, its sides on whole studs; moved by whole studs; refused off its sizes', () => {
    expect(areaAt('s1', [3.4, 7.6])).toEqual({ id: 's1', x0: 2, y0: 7, x1: 4, y1: 9 });
    expect(moveArea({ id: 's1', x0: 0, y0: 0, x1: 2, y1: 2 }, 1.4, -2.6)).toEqual({ id: 's1', x0: 1, y0: -3, x1: 3, y1: -1 });
    expect(areaProblem({ x0: 0, y0: 0, x1: 2, y1: 2 })).toBeUndefined();
    expect(areaProblem({ x0: 0, y0: 0, x1: 0.5, y1: 2 })).toMatch(/whole studs/);
    expect(areaProblem({ x0: 0, y0: 0, x1: 0, y1: 2 })).toMatch(/at least 1/);
    expect(areaProblem({ x0: 0, y0: 0, x1: 65, y1: 2 })).toMatch(/at most 64/);
  });
  it('a corner dragged: to the whole stud nearest, the opposite one where it was; held at 1 and 64 studs, and why', () => {
    const a = { id: 's1', x0: 0, y0: 0, x1: 4, y1: 4 };
    expect(dragCorner(a, 2, [6.3, 5.6])).toEqual({ area: { ...a, x1: 6, y1: 6 } });
    expect(dragCorner(a, 0, [-1.2, 2.2])).toEqual({ area: { ...a, x0: -1, y0: 2 } });
    const past = dragCorner(a, 0, [9, 1]);
    expect(past.area).toEqual({ ...a, x0: 3, y0: 1 }); expect(past.why).toMatch(/at least 1 stud/);
    expect(dragCorner(a, 1, [100, 0]).area.x1).toBe(64);
  });
  it('a stud is in one only by its middle, strictly: never one on a side (a side is between studs)', () => {
    const r = studsOffMm([{ id: 's1', x0: 0, y0: 0, x1: 2, y1: 2 }]);
    expect(r).toEqual([[0, 0, 16, 16]]);
    expect(inStudsOff(r, [4, 4])).toBe(true); expect(inStudsOff(r, [12, 12])).toBe(true); expect(inStudsOff(r, [20, 4])).toBe(false); expect(inStudsOff(r, [16, 4])).toBe(false);
    expect(areaDistance({ x0: 0, y0: 0, x1: 2, y1: 2 }, [1, 1])).toBe(0); expect(areaDistance({ x0: 0, y0: 0, x1: 2, y1: 2 }, [5, 2])).toBe(3);
  });
  it('the app\'s: each built points set\'s blades\' bands and its lever\'s arm, from the build\'s plan; taken out ones none', () => {
    const ov = {
      items: [{ kind: 'points', key: '0,64', at: [0, 64] as [number, number], pts: [] }, { kind: 'points', key: '400,0', at: [400, 0] as [number, number], pts: [], off: true },
        { kind: 'throw', key: '0,64', at: [40, 80] as [number, number], pts: [[20, 70], [60, 70], [60, 94], [20, 94]] as [number, number][] }],
      cutting: { no: { blades: [{ line: [[0, 64], [0, 200]] as [number, number][], half: 24 }, { line: [[400, 0], [400, 100]] as [number, number][], half: 24 }] } },
    };
    const got = appAreas(ov);
    expect(got).toHaveLength(1);
    expect(got[0].key).toBe('0,64'); expect(got[0].bands).toEqual([{ line: [[0, 8], [0, 25]], half: 3 }]); expect(got[0].arms[0][1]).toEqual([7.5, 8.75]);
    expect(appAreaDistance(got[0], [0, 15])).toBe(0); expect(appAreaDistance(got[0], [5, 9])).toBe(0); expect(appAreaDistance(got[0], [-5, 15])).toBeCloseTo(2);
    expect(appAreaBox(got[0])).toEqual({ x0: -4, y0: 4, x1: 9, y1: 29 });
    expect(appAreas(undefined)).toEqual([]);
  });
});

describe('ballast edges', () => {
  const ballasted = (more: Partial<DRoute> = {}, o: Design['options'] = { ballast: 'ballast' }) => design([straight('A', 0, 0, 32, more)], o);
  it('one each side of a track on ballast, its reach past the sleepers and where its line is; none off ballast', () => {
    const e = ballastEdges(ballasted());
    expect(e.map((q) => [q.side, q.from, q.to, q.studs, q.off])).toEqual([['left', 0, 32, 1, 5], ['right', 0, 32, 1, 5]]);
    expect(ballastEdges(design([straight('A', 0, 0, 32)]))).toEqual([]);
    // (the buddy: its bottom layer a stud wider each side)
    expect(ballastEdges(ballasted({}, { ballast: 'buddy' }))[0].off).toBe(6);
    // (a stretch with its own: its edges apart from the track's either side of it)
    const st = ballastEdges(ballasted({ stretches: [{ from: 8, to: 20, own: { ballastRightStuds: 3 } }] }));
    expect(st.map((q) => [q.side, q.k, q.from, q.to, q.studs])).toEqual([['left', undefined, 0, 8, 1], ['right', undefined, 0, 8, 1], ['left', 0, 8, 20, 1], ['right', 0, 8, 20, 3], ['left', undefined, 20, 32, 1], ['right', undefined, 20, 32, 1]]);
  });
  it('wider or narrower: the track\'s own, or the stretch\'s (D6: its own on the first change); refused off the range; reset', () => {
    const d = ballasted();
    expect(edgeNow(d, { route: 0, side: 'left' })).toEqual({ studs: 1, from: 'default' });
    expect(setEdge(d, { route: 0, side: 'left' }, 3)).toBeUndefined();
    expect(d.routes[0].own).toEqual({ ballastLeftStuds: 3 }); expect(edgeOwn(d, { route: 0, side: 'left' })).toBe(true);
    expect(setEdge(d, { route: 0, side: 'left' }, -1)).toMatch(/narrower than the sleepers/);
    expect(setEdge(d, { route: 0, side: 'left' }, 9)).toMatch(/8 studs past the sleepers at most/);
    expect(setEdge(d, { route: 0, side: 'left' }, 1.5)).toMatch(/whole studs/);
    expect(edgeProblem(Number.NaN)).toMatch(/Type/);
    resetEdge(d, { route: 0, side: 'left' });
    expect(d.routes[0].own).toBeUndefined();
    // (over a stretch only: made round where it's tapped, 8 studs, the edge set on it; reset: the stretch had nothing else, so it goes)
    const got = edgeStretch(d.routes[0], 14);
    expect(got).toEqual({ k: 0 }); expect(d.routes[0].stretches).toEqual([{ from: 10, to: 18, own: {} }]);
    setEdge(d, { route: 0, side: 'right', k: 0 }, 4);
    expect(d.routes[0].stretches![0].own).toEqual({ ballastRightStuds: 4 });
    expect(edgeNow(d, { route: 0, side: 'right', k: 0 })).toEqual({ studs: 4, from: 'stretch' });
    expect(edgeNow(d, { route: 0, side: 'left', k: 0 })).toEqual({ studs: 1, from: 'default' });
    expect(edgeStretch(d.routes[0], 12)).toEqual({ problem: expect.stringMatching(/A stretch is here already/) });
    expect(resetEdge(d, { route: 0, side: 'right', k: 0 })).toEqual({ gone: true });
    expect(d.routes[0].stretches).toBeUndefined();
    // (near the track's end: no piece under 2 studs left there)
    const e = ballasted(); expect(edgeStretch(e.routes[0], 29)).toEqual({ k: 0 }); expect(e.routes[0].stretches![0]).toMatchObject({ from: 25, to: 32 });
    // (a stretch with more of its own stays when its edge is reset)
    const f = ballasted({ stretches: [{ from: 8, to: 20, own: { ballastRightStuds: 3, sleepers: 'bed' } }] });
    expect(resetEdge(f, { route: 0, side: 'right', k: 0 })).toEqual({}); expect(f.routes[0].stretches).toEqual([{ from: 8, to: 20, own: { sleepers: 'bed' } }]);
  });
  it('its shape at a buffer stop: only where its stretch of track ends in one (else locked, and why)', () => {
    const d = ballasted({ endEnd: 'buffer', stretches: [{ from: 8, to: 20, own: {} }] });
    expect(edgeBuffers(d, { route: 0, side: 'left' })).toEqual(['end']);
    expect(edgeShapeBlocked(d, { route: 0, side: 'left', k: 0 })).toMatch(/only where the stretch ends in a buffer stop/);
    expect(setEdgeShape(d, { route: 0, side: 'left', k: 0 }, 'stepped')).toMatch(/buffer stop/);
    expect(setEdgeShape(d, { route: 0, side: 'left' }, 'stepped')).toBeUndefined();
    expect(d.routes[0].own).toEqual({ ballastEnds: 'stepped' }); expect(edgeShapeNow(d, { route: 0, side: 'right' })).toBe('stepped');
    expect(edgeShapeBlocked(ballasted(), { route: 0, side: 'left' })).toMatch(/only on a track that ends in a buffer stop/);
  });
});

describe('what a tap takes', () => {
  it('a ballast edge on its line, on its side; a stud-off area in it, its corner when selected; the app\'s; neither with Everything', () => {
    const d = ballasted2();
    const edges = ballastEdges(d), near = 0.5, point = 0.6;
    const h = hitItems(d, [5.1, 10], { near, point, kinds: ['ballast'], edges });
    expect(h[0]?.item).toEqual({ kind: 'ballast', route: 0, side: 'right' });
    expect(hitItems(d, [-5, 10], { near, point, kinds: ['ballast'], edges })[0]?.item).toEqual({ kind: 'ballast', route: 0, side: 'left' });
    expect(hitItems(d, [2, 10], { near, point, kinds: ['ballast'], edges })).toEqual([]);
    const studsOff = [{ id: 's1', x0: 10, y0: 10, x1: 12, y1: 12 }];
    expect(hitItems(d, [11, 11], { near, point, kinds: ['studsoff'], studsOff })[0]).toMatchObject({ item: { kind: 'studsoff', id: 's1' }, part: 'body' });
    expect(hitItems(d, [12.2, 12.1], { near, point, kinds: ['studsoff'], studsOff, selected: { kind: 'studsoff', id: 's1' } })[0]).toMatchObject({ part: 'corner', corner: 2 });
    const app = [{ key: '0,64', at: [0, 8] as [number, number], bands: [{ line: [[0, 8], [0, 25]] as [number, number][], half: 3 }], arms: [] }];
    expect(hitItems(d, [1, 12], { near, point, kinds: ['studsoff'], appAreas: app })[0]?.item).toEqual({ kind: 'studsoff', app: '0,64' });
    expect(layerOf('studsoff')).toBe('studs'); expect(layerOf('ballast')).toBe('ballast');
    expect(picks('all', 'ballast', true)).toBe(false); expect(picks('all', 'studs', true)).toBe(false); expect(picks('studs', 'studs', true)).toBe(true); expect(picks('ballast', 'ballast', false)).toBe(false);
    expect(itemLabel(d, { kind: 'ballast', route: 0, side: 'left' })).toBe('Left ballast edge of A');
    expect(itemLabel({ ...d, expert: { studsOff } }, { kind: 'studsoff', id: 's1' })).toBe('Stud-off area, 2 x 2 studs, by hand');
    expect(itemLabel(d, { kind: 'studsoff', app: '0,64' })).toMatch(/the app's/);
    expect(itemLabel(d, { kind: 'studsoff', id: 'gone' })).toBeUndefined();
  });
});
function ballasted2() { return design([straight('A', 0, 0, 32)], { ballast: 'ballast' }); }
