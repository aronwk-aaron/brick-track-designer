// The trackwork's hand edits follow their track: moved, turned, mirrored, turned end for end, joined, renamed; and
// one whose item is gone is left over, to list, not lost and not counted as there.
import { describe, expect, it } from 'vitest';
import type { Design } from '../src/app/design';
import { mirrorRoute, reversedRoute } from '../src/app/routeedits';
import { anchorAt, anchored, followTrackwork, isEdit, joinAnchors, leftOver, mirrorAnchors, reconcileTrackwork, renameAnchors, reverseAnchors } from '../src/app/twfollow';

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
