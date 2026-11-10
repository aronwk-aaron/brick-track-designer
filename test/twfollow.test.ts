// The trackwork's hand edits follow their track: moved, turned, mirrored, turned end for end, joined, renamed; and
// one whose item is gone is left over, to list, not lost and not counted as there. A route reshaped: each edit goes to
// the item that is what its own was; routes copied take the edits between them along.
import { describe, expect, it } from 'vitest';
import type { Design } from '../src/app/design';
import { mirrorRoute, reversedRoute } from '../src/app/routeedits';
import { anchorAt, anchored, copyEdits, followTrackwork, identOf, isEdit, type ItemAt, joinAnchors, leftOver, mirrorAnchors, pasteEdits, reconcileTrackwork, renameAnchors, reverseAnchors } from '../src/app/twfollow';
import { buildDesign, clearBuildCache, PLAN_ONLY } from '../src/app/build';
import { kernel } from '../src/geom/kernel';

/** A main line and a branch off it at its second stud row (studs), with points taken out at the branch's start and a check rail edit beside the main line. */
const design = (): Design => ({ version: 1, gaugeStuds: 4, routes: [
  { name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] },
  { name: 'Branch', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }],
trackwork: { points: { '0,64': { off: true } }, check: { '13,160': { d0: 8, d1: -4 } } } });
const keys = (d: Design) => ({ points: Object.keys(d.trackwork?.points ?? {}), check: Object.keys(d.trackwork?.check ?? {}) });
const near = (a: [number, number] | undefined, b: [number, number]) => { expect(a).toBeDefined(); expect(Math.hypot(a![0] - b[0], a![1] - b[1])).toBeLessThan(1e-6); };

describe('where an edit is on its track', () => {
  it('points are on the route that starts there (the branch), a check rail on the nearest', () => {
    const d = design();
    expect(anchorAt(d, 'points', [0, 64])).toEqual(['Branch', 's', expect.closeTo(0, 6), expect.closeTo(0, 6)]);
    const a = anchorAt(d, 'check', [13.25, 200])!;
    expect(a[0]).toBe('Main'); expect(a[1]).toBe('e'); expect(a[2]).toBeCloseTo(56, 6); expect(a[3]).toBeCloseTo(13.25, 6);
    near(anchored(d, a), [13.25, 200]);
    expect(anchorAt(d, 'check', [5000, 5000])).toBeUndefined();
  });
  it('an edit is one only with something set', () => {
    expect(isEdit({ off: true })).toBe(true); expect(isEdit({ on: ['A', 's', 0, 0] })).toBe(false);
    expect(isEdit({ off: false, drop: [] })).toBe(false); expect(isEdit(undefined)).toBe(false);
  });
});

describe('edits follow the track', () => {
  it('each gets its anchor, and stays put while nothing moves', () => {
    const d = design();
    expect(followTrackwork(d)).toBe(false);
    expect(d.trackwork!.points!['0,64'].on![0]).toBe('Branch');
    expect(d.trackwork!.check!['13,160'].on![0]).toBe('Main');
    expect(followTrackwork(d)).toBe(false);
    expect(keys(d)).toEqual({ points: ['0,64'], check: ['13,160'] });
  });
  it('the build\'s exact place is used where it is known, and an item on a half millimetre keeps its key', () => {
    const d = design(); d.trackwork = { check: { '13,161': { off: true } } };
    followTrackwork(d, [{ kind: 'check', key: '13,161', at: [12.5, 160.5] }]);
    near(anchored(d, d.trackwork.check!['13,161'].on!), [12.5, 160.5]);
    expect(followTrackwork(d)).toBe(false);
    expect(Object.keys(d.trackwork.check!)).toEqual(['13,161']);
  });
  it('moved: both routes 8 studs right and 3 up', () => {
    const d = design(); followTrackwork(d);
    for (const r of d.routes) { r.x += 8; r.y += 3; }
    expect(followTrackwork(d)).toBe(true);
    expect(keys(d)).toEqual({ points: ['64,88'], check: ['77,184'] });
    expect(d.trackwork!.points!['64,88'].off).toBe(true);
  });
  it('only the branch moved along: the points go with it, the check rail stays', () => {
    const d = design(); followTrackwork(d);
    d.routes[1].y = 16;
    followTrackwork(d);
    expect(keys(d)).toEqual({ points: ['0,128'], check: ['13,160'] });
  });
  it('turned a quarter left about the main line\'s start', () => {
    const d = design(); followTrackwork(d);
    for (const r of d.routes) { const [x, y] = [r.x, r.y]; r.x = -y; r.y = x; r.heading = 90; }
    followTrackwork(d);
    expect(keys(d)).toEqual({ points: ['-64,0'], check: ['-160,13'] });
  });
  it('mirrored: the other side of the track, a lever\'s side with it', () => {
    const d = design(); d.trackwork!.throw = { '0,64': { side: 'left', leverOffset: 8 } }; followTrackwork(d);
    for (const r of d.routes) mirrorRoute(r, 0);
    mirrorAnchors(d, ['Main', 'Branch']); followTrackwork(d);
    expect(keys(d)).toEqual({ points: ['0,64'], check: ['-13,160'] });
    expect(d.trackwork!.throw!['0,64'].side).toBe('right');
  });
  it('the main line made longer at its far end: nothing moves; at its start (moved back): the check rail stays by the far end', () => {
    const d = design(); d.trackwork = { check: { '13,40': { off: true } } }; followTrackwork(d);
    (d.routes[0].segs[0] as { studs: number }).studs = 48;
    expect(followTrackwork(d)).toBe(false); // (the check rail is nearer the start: measured from there)
    const e = design(); e.trackwork = { check: { '13,200': { off: true } } }; followTrackwork(e);
    e.routes[0].y = -16; (e.routes[0].segs[0] as { studs: number }).studs = 48;
    expect(followTrackwork(e)).toBe(false); // (nearer the end: where it was, the start having moved away)
  });
  it('renamed, and turned end for end', () => {
    const d = design(); followTrackwork(d);
    d.routes[0].name = 'Up line'; renameAnchors(d, 'Main', 'Up line');
    d.routes[0] = reversedRoute(d.routes[0]); reverseAnchors(d, 'Up line');
    expect(followTrackwork(d)).toBe(false);
    const c = d.trackwork!.check!['13,160'];
    expect(c.on![0]).toBe('Up line'); expect(c.on![3]).toBeCloseTo(-13, 6);
    expect([c.d0, c.d1]).toEqual([-4, 8]); // (its start is its end now)
    d.routes[0].x += 8; followTrackwork(d);
    expect(Object.keys(d.trackwork!.check!)).toEqual(['77,160']);
  });
  it('a track joined onto another: its edits are on the joined track', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [
      { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
      { name: 'B', x: 0, y: 16, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }],
    trackwork: { check: { '13,40': { off: true }, '13,200': { off: true } } } };
    followTrackwork(d);
    expect([d.trackwork!.check!['13,40'].on![0], d.trackwork!.check!['13,200'].on![0]]).toEqual(['A', 'B']);
    joinAnchors(d, 'A', 'B', 128, 128, false);
    d.routes = [{ ...d.routes[0], segs: [{ kind: 'straight', studs: 32 }] }];
    expect(followTrackwork(d)).toBe(false);
    d.routes[0].x = 8; followTrackwork(d);
    expect(Object.keys(d.trackwork!.check!).sort()).toEqual(['77,200', '77,40']);
  });
  it('entries with nothing set are dropped', () => {
    const d = design(); followTrackwork(d);
    d.trackwork!.points!['0,64'] = { on: d.trackwork!.points!['0,64'].on };
    followTrackwork(d);
    expect(d.trackwork!.points).toEqual({});
  });
});

describe('with the build\'s items', () => {
  it('an edit a hair off its item goes onto it; one with nothing near is left over, and can be listed', () => {
    const d = design(); followTrackwork(d);
    const items = [{ kind: 'points', key: '0,64', at: [0, 64] as [number, number] }, { kind: 'check', key: '14,160', at: [13.6, 160.2] as [number, number] }];
    expect(leftOver(d.trackwork, items)).toEqual([{ kind: 'check', key: '13,160', at: [13, 160] }]);
    expect(reconcileTrackwork(d, items)).toBe(true);
    expect(keys(d)).toEqual({ points: ['0,64'], check: ['14,160'] });
    expect(leftOver(d.trackwork, items)).toEqual([]);
    expect(reconcileTrackwork(d, items)).toBe(false);
    // (the branch deleted: no points there now)
    d.routes.pop();
    followTrackwork(d);
    expect(leftOver(d.trackwork, [items[1]])).toEqual([{ kind: 'points', key: '0,64', at: [0, 64] }]);
    expect(reconcileTrackwork(d, [items[1]])).toBe(false);
    expect(d.trackwork!.points!['0,64'].off).toBe(true); // (kept, till it's removed by hand)
  });
  it('an edit never takes the place of another item\'s own', () => {
    const d = design(); d.trackwork = { check: { '13,160': { off: true }, '14,161': { d0: 8 } } }; followTrackwork(d);
    expect(reconcileTrackwork(d, [{ kind: 'check', key: '14,161', at: [14, 161] }])).toBe(false);
  });
});

/** A main line with a track across it (the build's items made up: a check rail each side of the main line where it crosses, at y mm along). */
const crossed = (): Design => ({ version: 1, gaugeStuds: 4, routes: [
  { name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }] },
  { name: 'Cross', x: -8, y: 4, heading: -22.5, segs: [{ kind: 'straight', studs: 40 }] }] });
const checks = (...ys: number[]): ItemAt[] => ys.flatMap((y) => [{ kind: 'check', key: `13,${y}`, at: [13, y] as [number, number], routes: ['Main', 'Cross'] }, { kind: 'check', key: `-13,${y - 10}`, at: [-13, y - 10] as [number, number], routes: ['Main', 'Cross'] }]);

describe('a route reshaped: an edit goes to the item that is what its own was', () => {
  it('what an item is: the routes it\'s between, its side of the first, which of the ones like it along that', () => {
    const d = crossed(), its = checks(160, 300);
    expect(identOf(d, its, its[0])).toEqual([['Main', 'Cross'], 1, 0, 2]);
    expect(identOf(d, its, its[3])).toEqual([['Main', 'Cross'], -1, 1, 2]);
    // (the build doesn't say which routes: nothing to go by but where it is)
    expect(identOf(d, its, { kind: 'check', key: '0,0', at: [0, 0] })).toBeUndefined();
    expect(identOf(d, its, { kind: 'check', key: '0,0', at: [0, 0], routes: ['Gone', 'Cross'] })).toBeUndefined();
  });
  it('the crossing moved 20 mm along the main line: the edit on its check rail goes with it, not to the one on the other side', () => {
    const d = crossed(); d.trackwork = { check: { '13,160': { d0: 8 } } };
    followTrackwork(d, checks(160));
    expect(reconcileTrackwork(d, checks(160))).toBe(false);
    expect(d.trackwork.check!['13,160'].is).toEqual([['Main', 'Cross'], 1, 0, 1]);
    expect(reconcileTrackwork(d, checks(180))).toBe(true);
    expect(Object.keys(d.trackwork.check!)).toEqual(['13,180']);
    expect(d.trackwork.check!['13,180'].d0).toBe(8);
    near(anchored(d, d.trackwork.check!['13,180'].on!), [13, 180]);
    expect(leftOver(d.trackwork, checks(180))).toEqual([]);
    // (one that doesn't say what its item is, a design saved before: by distance only, left over)
    const e = crossed(); e.trackwork = { check: { '13,160': { d0: 8 } } }; followTrackwork(e, checks(160));
    expect(reconcileTrackwork(e, checks(180))).toBe(false);
    expect(leftOver(e.trackwork, checks(180))).toHaveLength(1);
  });
  it('two crossings of the same routes: the second one\'s edit stays the second one\'s, though the first is nearer where it was', () => {
    const d = crossed(); d.trackwork = { check: { '13,200': { off: true } } };
    followTrackwork(d, checks(160, 200)); reconcileTrackwork(d, checks(160, 200));
    expect(d.trackwork.check!['13,200'].is).toEqual([['Main', 'Cross'], 1, 1, 2]);
    expect(reconcileTrackwork(d, checks(195, 240))).toBe(true);
    expect(Object.keys(d.trackwork.check!)).toEqual(['13,240']);
  });
  it('one of the two gone: which is left can\'t be told, so the edit is left over; nor is another edit\'s item ever taken', () => {
    const d = crossed(); d.trackwork = { check: { '13,200': { off: true } } };
    followTrackwork(d, checks(160, 200)); reconcileTrackwork(d, checks(160, 200));
    expect(reconcileTrackwork(d, checks(230))).toBe(false);
    expect(leftOver(d.trackwork, checks(230))).toEqual([{ kind: 'check', key: '13,200', at: [13, 200] }]);
    const e = crossed(); e.trackwork = { check: { '13,160': { d0: 8 }, '13,180': { d1: 4 } } };
    followTrackwork(e, checks(160)); reconcileTrackwork(e, checks(160));
    expect(reconcileTrackwork(e, checks(180))).toBe(false);
    expect(Object.keys(e.trackwork.check!).sort()).toEqual(['13,160', '13,180']);
  });
  it('the main line renamed, turned end for end and mirrored in between: still the same item', () => {
    const d = crossed(); d.trackwork = { check: { '13,160': { d0: 8 } } };
    followTrackwork(d, checks(160, 300)); reconcileTrackwork(d, checks(160, 300));
    d.routes[0].name = 'Up'; renameAnchors(d, 'Main', 'Up');
    d.routes[0] = reversedRoute(d.routes[0]); reverseAnchors(d, 'Up');
    expect(d.trackwork.check!['13,160'].is).toEqual([['Up', 'Cross'], -1, 1, 2]);
    const up = (its: ItemAt[]) => its.map((x) => ({ ...x, routes: ['Up', 'Cross'] })), same = up(checks(160, 300));
    expect(identOf(d, same, same[0])).toEqual([['Up', 'Cross'], -1, 1, 2]);
    expect(reconcileTrackwork(d, up(checks(190, 300)))).toBe(true);
    expect(Object.keys(d.trackwork.check!)).toEqual(['13,190']);
    // (mirrored about the main line: what was on its right is on its left)
    for (const r of d.routes) mirrorRoute(r, 0);
    mirrorAnchors(d, ['Up', 'Cross']); followTrackwork(d);
    expect(Object.keys(d.trackwork.check!)).toEqual(['-13,190']);
    const flip = (its: ItemAt[]) => up(its).map((x) => ({ ...x, key: `${-x.at[0]},${x.at[1]}`, at: [-x.at[0], x.at[1]] as [number, number] }));
    expect(reconcileTrackwork(d, flip(checks(215, 300)))).toBe(true);
    expect(Object.keys(d.trackwork.check!)).toEqual(['-13,215']);
  });
  it('as built: a crossing track bent, its check rails 20 mm and more along the main line, the edit on one still on it', { timeout: 120000 }, async () => {
    const w = await kernel();
    const plan = (d: Design) => { let its: ItemAt[] = []; try { buildDesign(w, structuredClone(d), undefined, (o) => { its = JSON.parse(JSON.stringify((o as { items: ItemAt[] }).items)); }, { planOnly: true }); } catch (e) { if (e !== PLAN_ONLY) throw e; } return its; };
    try {
      const d = crossed(), a = plan(d), mine = a.filter((x) => x.kind === 'check' && x.routes?.[0] === 'Main');
      expect(mine.length).toBeGreaterThan(0);
      d.trackwork = { check: { [mine[0].key]: { d0: 8 } } };
      followTrackwork(d, a); reconcileTrackwork(d, a);
      const was = d.trackwork.check![mine[0].key].is!;
      expect(was[0]).toEqual(['Main', 'Cross']);
      // (the crossing track bent on its way in: it crosses the main line further along)
      d.routes[1].segs = [{ kind: 'straight', studs: 4 }, { kind: 'curve', radius: 104, angle: 6 }, { kind: 'straight', studs: 40 }];
      followTrackwork(d, a);
      const b = plan(d);
      expect(reconcileTrackwork(d, b)).toBe(true);
      const key = Object.keys(d.trackwork.check!)[0], now = b.find((x) => x.kind === 'check' && x.key === key)!;
      expect(now).toBeDefined();
      expect(Math.hypot(now.at[0] - mine[0].at[0], now.at[1] - mine[0].at[1])).toBeGreaterThan(20);
      expect(identOf(d, b.filter((x) => x.kind === 'check'), now)).toEqual(was);
      expect(d.trackwork.check![key].d0).toBe(8);
      expect(leftOver(d.trackwork, b)).toEqual([]);
    } finally { clearBuildCache(); }
  });
});

describe('routes copied take their edits along', () => {
  /** The main line and its branch (points taken out at the branch's start), and a track across (a check rail edit where it crosses). */
  const yard = (): Design => {
    const d = design(); d.routes.push(crossed().routes[1]);
    d.trackwork = { points: { '0,64': { off: true, drop: ['Branch'] } }, check: { '13,160': { d0: 8 } } };
    const its: ItemAt[] = [{ kind: 'points', key: '0,64', at: [0, 64], routes: ['Main', 'Branch'] }, ...checks(160)];
    followTrackwork(d, its); reconcileTrackwork(d, its);
    return d;
  };
  it('the edits between copied routes go with them; points with only one of their routes copied don\'t', () => {
    const d = yard();
    expect(copyEdits(d, ['Branch'])).toEqual([]);
    expect(copyEdits(d, ['Main', 'Branch']).map((c) => [c.kind, c.at])).toEqual([['points', [0, 64]]]);
    expect(copyEdits(d, ['Main', 'Branch', 'Cross']).map((c) => c.kind)).toEqual(['points', 'check']);
    // (copied: the design's own stay)
    expect(keys(d)).toEqual({ points: ['0,64'], check: ['13,160'] });
  });
  it('pasted 16 studs right and 2 up: each copy\'s edit where its item is, on the copies by their new names, and the first ones as they were', () => {
    const d = yard(), clip = copyEdits(d, ['Main', 'Branch', 'Cross']);
    const names = new Map([['Main', 'R1'], ['Branch', 'R2'], ['Cross', 'R3']]);
    for (const r of d.routes.slice(0, 3)) d.routes.push({ ...structuredClone(r), name: names.get(r.name)!, x: r.x + 16, y: r.y + 2 });
    pasteEdits(d, clip, names, 128, 16);
    expect(keys(d)).toEqual({ points: ['0,64', '128,80'], check: ['13,160', '141,176'] });
    expect(d.trackwork!.points!['128,80']).toMatchObject({ off: true, drop: ['R2'], on: ['R2', 's', expect.closeTo(0, 6), expect.closeTo(0, 6)], is: [['R1', 'R2'], 0, 0, 1] });
    expect(d.trackwork!.check!['141,176']).toMatchObject({ d0: 8, is: [['R1', 'R3'], 1, 0, 1] });
    expect(d.trackwork!.check!['141,176'].on![0]).toBe('R1');
    expect(d.trackwork!.points!['0,64']).toMatchObject({ drop: ['Branch'], is: [['Main', 'Branch'], 0, 0, 1] });
    // (and they're where their routes put them: nothing moves)
    expect(followTrackwork(d)).toBe(false);
    // (pasted again in the same place: the edits there are kept, not doubled)
    pasteEdits(d, clip, names, 128, 16);
    expect(keys(d).check).toHaveLength(2);
  });
  it('cut: the edits go with the routes, none left behind; pasted back, they\'re on the copies', () => {
    const d = yard(), clip = copyEdits(d, ['Main', 'Branch', 'Cross'], true);
    expect(keys(d)).toEqual({ points: [], check: [] });
    const was = d.routes.splice(0, 3), names = new Map([['Main', 'R1'], ['Branch', 'R2'], ['Cross', 'R3']]);
    for (const r of was) d.routes.push({ ...r, name: names.get(r.name)! });
    pasteEdits(d, clip, names, 0, 0);
    expect(keys(d)).toEqual({ points: ['0,64'], check: ['13,160'] });
    expect(followTrackwork(d)).toBe(false);
  });
});
