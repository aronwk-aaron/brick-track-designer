// Connections between tracks (expert mode), the pure part: which tracks are joined (ends that meet, branches off a
// track's side, a narrow gauge on dual-gauge track; not tracks that merely cross), the tracks joined to a track through
// others, what was taken apart, and what a reshaped track carries (exactly; a loop opens, and says where).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Design, type DRoute, type DSeg, readDesign, TEMPLATES } from '../src/app/design';
import { applyCarry, carryChange, cleanApart, connectedSet, holds, jointNames, joints, openedBy, planCarry, poseAt, pruneApart, renameApart, setApart, splitApart } from '../src/app/connections';
import { follow } from '../src/app/planner';
import { gaugeMeetPose, reversedRoute } from '../src/app/routeedits';
import { mergeRoutes, splitRoute } from '../src/app/splitmerge';
import { clampDesign } from '../src/app/limits';
import { sharedMove } from '../src/app/cutpaths';
import { followTrackwork } from '../src/app/twfollow';

const st = (studs: number): DSeg => ({ kind: 'straight', studs });
const cv = (radius: number, angle: number): DSeg => ({ kind: 'curve', radius, angle });
const r = (name: string, x: number, y: number, heading: number, segs: DSeg[], extra: Partial<DRoute> = {}): DRoute => ({ name, x, y, heading, segs, ...extra });
const d = (routes: DRoute[], extra: Partial<Design> = {}): Design => ({ version: 1, gaugeStuds: 4, routes, ...extra });
/** A route starting where another ends, running on. */
const on = (name: string, from: DRoute, segs: DSeg[], extra: Partial<DRoute> = {}): DRoute => { const e = follow(from, from.segs); return r(name, e.x, e.y, e.heading, segs, extra); };
const pairs = (des: Design) => joints(des).map((j) => `${des.routes[j.a].name}.${j.aEnd}-${des.routes[j.b].name}${j.bEnd ? `.${j.bEnd}` : `@${+j.s.toFixed(3)}`}${j.apart ? ' apart' : ''}`).sort();
const closeTo = (a: { x: number; y: number; heading: number }, b: { x: number; y: number; heading: number }) => { expect(a.x).toBeCloseTo(b.x, 5); expect(a.y).toBeCloseTo(b.y, 5); expect(((a.heading - b.heading + 540) % 360) - 180).toBeCloseTo(0, 5); };

/** A chain: A, then B from its end round a curve, then C. */
const chain = () => { const A = r('A', 0, 0, 0, [st(16)]), B = on('B', A, [cv(40, 45), st(8)]), C = on('C', B, [st(12)]); return d([A, B, C]); };
/** A closed loop of four: each a straight and a quarter turn. */
const loop = () => { const rs = [r('L1', 0, 0, 0, [st(16), cv(40, 90)])]; for (let k = 2; k <= 4; k++) rs.push(on(`L${k}`, rs[rs.length - 1], [st(16), cv(40, 90)])); return d(rs); };

describe('which tracks are joined', () => {
  it('ends that meet, in line: a chain', () => {
    const des = chain();
    expect(pairs(des)).toEqual(['A.end-B.start', 'B.end-C.start']);
    expect(connectedSet(des, [0])).toEqual([0, 1, 2]);
    expect(connectedSet(des, [2])).toEqual([2, 1, 0]);
  });
  it('whichever way each was drawn', () => {
    const des = chain();
    des.routes[1] = reversedRoute(des.routes[1]);
    expect(pairs(des)).toEqual(['A.end-B.end', 'B.start-C.start']);
    expect(connectedSet(des, [0])).toEqual([0, 1, 2]);
  });
  it('a branch off a track\'s side, and two tracks parting at one end (points)', () => {
    const A = r('A', 0, 0, 0, [st(32)]), B = r('B', 0, 8, 0, [cv(40, 22.5)]), C = r('C', 0, 0, 0, [cv(40, -22.5)]);
    expect(pairs(d([A, B, C]))).toEqual(['A.start-C.start', 'B.start-A@8']);
    expect(connectedSet(d([A, B, C]), [1])).toEqual([1, 0, 2]);
    // (off a curve's side too, either way round)
    for (const a of [45, -45]) {
      const K = r('K', 3, 5, 30, [st(4), cv(40, a), st(4)]), p = poseAt(K, 4 + (20 * Math.PI * 40) / 180), S = r('S', p.x, p.y, p.heading + 180, [st(10)]);
      expect(pairs(d([K, S])), String(a)).toEqual([`S.start-K@${+(4 + (20 * Math.PI * 40) / 180).toFixed(3)}`]);
    }
  });
  it('a closed loop', () => {
    const des = loop();
    expect(pairs(des)).toEqual(['L1.end-L2.start', 'L1.start-L4.end', 'L2.end-L3.start', 'L3.end-L4.start']);
    expect(connectedSet(des, [2]).sort()).toEqual([0, 1, 2, 3]);
  });
  it('not tracks that merely cross, touch at an angle, or stop short', () => {
    const A = r('A', 0, 0, 0, [st(32)]);
    expect(joints(d([A, r('X', -16, 16, -90, [st(32)])]))).toEqual([]);          // crossing square
    expect(joints(d([A, r('X', -10, 6, -45, [st(32)])]))).toEqual([]);            // crossing on a slant
    expect(joints(d([A, r('X', 0, 16, -90, [st(16)])]))).toEqual([]);             // an end on its line, square to it
    expect(joints(d([A, r('X', 0, 16, 2, [st(16)])]))).toEqual([]);               // 2 degrees out of line
    expect(joints(d([A, r('X', 0, 32.2, 0, [st(16)])]))).toEqual([]);             // a fifth of a stud short
    expect(joints(d([A, r('X', 0.2, 32, 0, [st(16)])]))).toEqual([]);             // a fifth of a stud to the side
    expect(joints(d([A, r('X', 8, 0, 0, [st(32)])]))).toEqual([]);                // alongside
    expect(pairs(d([A, r('X', 0.02, 32.02, 0.2, [st(16)])]))).toEqual(['A.end-X.start']); // within the join's tolerance
    expect(connectedSet(d([A, r('X', -16, 16, -90, [st(32)])]), [0])).toEqual([0]);
  });
  it('not monorail and train track', () => {
    const A = r('A', 0, 0, 0, [st(16)]);
    expect(joints(d([A, on('M', A, [st(16)], { system: 'monorail' })]))).toEqual([]);
    expect(pairs(d([{ ...A, system: 'monorail' }, on('M', A, [st(16)], { system: 'monorail' })]))).toEqual(['A.end-M.start']);
  });
  it('dual-gauge track and its narrow gauge carrying on: beside its middle, where its narrow gauge lies', () => {
    const D = r('D', 0, 0, 0, [st(16)], { dualGauge: true }), N = r('N', 0, 0, 0, [st(16)], { gaugeStuds: 2 }), S = on('S', D, [st(16)]);
    const des = d([D, N, S]), p = gaugeMeetPose(des, D, 'end', N, 'start')!;
    N.x = p.x; N.y = p.y;
    expect(p.x).not.toBe(0);
    expect(pairs(des)).toEqual(['D.end-N.start', 'D.end-S.start']);
    expect(connectedSet(des, [1])).toEqual([1, 0, 2]);
    // (the narrow gauge on the dual-gauge track's middle: its rails don't meet that track's: not joined)
    N.x = 0;
    expect(pairs(d([D, N]))).toEqual([]);
    // (and leaving part way along it, a branch: where the narrow gauge lies there)
    const B = r('B', p.x, 8, 0, [cv(40, -22.5)], { gaugeStuds: 2 });
    expect(pairs(d([D, B]))).toEqual(['B.start-D@8']);
  });
  it('every template opens as it is: nothing in them is taken apart', () => {
    for (const [name, t] of Object.entries(TEMPLATES)) { expect(t.expert?.apart, name).toBeUndefined(); expect(readDesign(structuredClone(t)), name).toEqual(t); }
  });
  it('the saved designs open as they did: none has anything taken apart, and their joints are found', () => {
    const dir = new URL('./fixtures/designs/', import.meta.url).pathname, counts: Record<string, string> = {};
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const file = JSON.parse(readFileSync(dir + f, 'utf8')), des = readDesign(structuredClone(file));
      expect(des.expert?.apart, f).toBeUndefined();
      expect(readDesign(JSON.parse(JSON.stringify(des))), f).toEqual(des);
      const js = joints(des);
      expect(js.every((j) => holds(des, j)), f).toBe(true);
      counts[f] = `${js.length} joints, ${des.routes.length} tracks, ${connectedSet(des, [0], js).length} joined to the first`;
    }
    // (Aaron's own: the yards' throats are one net; tracks that only cross, or lie side by side, aren't joined)
    expect(counts).toEqual({
      '128s-112x.btd(2).json': '4 joints, 4 tracks, 4 joined to the first',
      '8-way_intersection.btd.json': '0 joints, 4 tracks, 1 joined to the first',
      'R136-152_corner.btd.json': '0 joints, 2 tracks, 1 joined to the first',
      'monster-switch-6-tracks-double-slips.btd.json': '36 joints, 24 tracks, 24 joined to the first',
      'monster-switch-6-tracks.btd.json': '32 joints, 22 tracks, 22 joined to the first',
      'return-loop-turning-left.btd.json': '2 joints, 2 tracks, 2 joined to the first',
      'return-loop-turning-right.btd.json': '2 joints, 2 tracks, 2 joined to the first',
    });
  });
});

describe('tracks taken apart', () => {
  it('still touch, but neither takes the other along', () => {
    const des = chain();
    setApart(des, 'B', 'A', true);
    expect(des.expert).toEqual({ apart: [['B', 'A']] });
    expect(pairs(des)).toEqual(['A.end-B.start apart', 'B.end-C.start']);
    expect(connectedSet(des, [0])).toEqual([0]);
    expect(connectedSet(des, [1])).toEqual([1, 2]);
    setApart(des, 'A', 'B', true);
    expect(des.expert!.apart).toHaveLength(1);
    setApart(des, 'A', 'B', false);
    expect(des.expert).toBeUndefined();
    expect(connectedSet(des, [0])).toEqual([0, 1, 2]);
  });
  it('are forgotten once they no longer touch, and kept while they do', () => {
    const des = chain();
    setApart(des, 'A', 'B', true); setApart(des, 'B', 'C', true);
    expect(pruneApart(des)).toBe(false);
    des.routes[0].x -= 8;
    expect(pruneApart(des)).toBe(true);
    expect(des.expert).toEqual({ apart: [['B', 'C']] });
    des.routes[0].x += 8;
    expect(connectedSet(des, [0])).toEqual([0, 1]); // (put back: joined again)
    des.expert!.cutPaths = [{ id: 'c1', pts: [[0, 0], [0, 4]] }];
    des.routes[2].x += 20;
    pruneApart(des);
    expect(des.expert).toEqual({ cutPaths: [{ id: 'c1', pts: [[0, 0], [0, 4]] }] });
  });
  it('go by name through a rename, a split and a merge', () => {
    const des = chain();
    setApart(des, 'A', 'B', true);
    renameApart(des, 'A', 'Main');
    expect(des.expert!.apart).toEqual([['Main', 'B']]);
    renameApart(des, 'Main', 'A');
    // (A split: its second half is what meets B now)
    const res = splitRoute(des, 0, 8);
    expect('problem' in res).toBe(false);
    pruneApart(des);
    expect(des.expert!.apart).toEqual([[des.routes[1].name, 'B']]);
    expect(connectedSet(des, [0])).toEqual([0, 1]);
    // (merged again: the whole of A is apart from B)
    expect('index' in mergeRoutes(des, 0, 1)).toBe(true);
    pruneApart(des);
    expect(des.expert!.apart).toEqual([['A', 'B']]);
    splitApart(des, 'nobody', 'X');
    expect(des.expert!.apart).toEqual([['A', 'B']]);
  });
  it('a file\'s list is held to pairs of routes there are', () => {
    const names = new Set(['A', 'B', 'C']);
    expect(cleanApart([['A', 'B'], ['B', 'A'], ['A', 'A'], ['A', 'Z'], ['A'], 'no', ['B', 'C', 'A'], [1, 2], ['C', 'B']], names)).toEqual([['A', 'B'], ['C', 'B']]);
    expect(cleanApart('no', names)).toBeUndefined();
    expect(cleanApart([], names)).toBeUndefined();
    const file = JSON.parse(JSON.stringify(chain()));
    expect(readDesign({ ...file, expert: { apart: [['A', 'B'], ['A', 'gone']] } }).expert).toEqual({ apart: [['A', 'B']] });
    expect(readDesign({ ...file, expert: { apart: [['A', 'gone']], cutPaths: [{ id: 'c1', pts: [[0, 0], [0, 4]] }] } }).expert).toEqual({ cutPaths: [{ id: 'c1', pts: [[0, 0], [0, 4]] }] });
    expect(readDesign({ ...file, expert: { apart: 7 } }).expert).toBeUndefined();
    expect(readDesign(file).expert).toBeUndefined();
    const kept = readDesign({ ...file, expert: { apart: [['A', 'B']] } });
    expect(clampDesign(structuredClone(kept))).toEqual(kept);
    expect(readDesign(JSON.parse(JSON.stringify(kept)))).toEqual(kept);
  });
  it('the joints\' names', () => {
    const des = loop(), js = joints(des);
    expect(jointNames(des, js.slice(0, 1))).toBe('L1 and L4');
    expect(jointNames(des, js)).toBe('L1 and L4 and 3 more joints');
  });
});

describe('what a reshaped track carries', () => {
  it('a straight made longer: what is on its end goes with the end, exactly', () => {
    const des = chain(), c = planCarry(des, 0, 'start', 0);
    des.routes[0].segs = [st(21)];
    expect(applyCarry(c, des)).toBe(true);
    expect([des.routes[1].x, des.routes[1].y, des.routes[1].heading]).toEqual([0, 21, 0]);
    closeTo(des.routes[2], follow(des.routes[1], des.routes[1].segs));
    expect(openedBy(c, des)).toEqual([]);
    expect(pairs(des)).toEqual(['A.end-B.start', 'B.end-C.start']);
    // (alone, Alt: back where they were)
    expect(applyCarry(c, des, true)).toBe(true);
    expect([des.routes[1].x, des.routes[1].y, des.routes[1].heading]).toEqual([0, 16, 0]);
    expect(applyCarry(c, des, true)).toBe(false);
  });
  it('a curve turned further, its radius changed: the rest turns with its end, the joints closed', () => {
    const des = chain(), c = planCarry(des, 1, 'start', 0), was = structuredClone(des.routes[2]);
    for (const seg of [cv(40, 90), cv(56, 45), cv(40, -45), cv(24, 11.25)]) {
      des.routes[1].segs = [seg, st(8)];
      applyCarry(c, des);
      closeTo(des.routes[2], follow(des.routes[1], des.routes[1].segs));
      expect(openedBy(c, des)).toEqual([]);
      expect([des.routes[0].x, des.routes[0].y, des.routes[0].heading]).toEqual([0, 0, 0]);
    }
    // (there and back: where it was, no drift)
    des.routes[1].segs = [cv(40, 45), st(8)];
    applyCarry(c, des);
    expect(des.routes[2]).toEqual(was);
  });
  it('reshaped from its other end: what is on its start goes, what is on its end stays', () => {
    const des = chain(), c = planCarry(des, 1, 'end', 0), end = follow(des.routes[1], des.routes[1].segs);
    // (B's first curve made tighter, B's end held where it is: its start moves)
    const rev = reversedRoute({ ...des.routes[1] }); rev.segs = [st(8), cv(32, -45)];
    const back = reversedRoute(rev);
    Object.assign(des.routes[1], { x: back.x, y: back.y, heading: back.heading, segs: back.segs });
    closeTo(follow(des.routes[1], des.routes[1].segs), end);
    applyCarry(c, des);
    closeTo(follow(des.routes[0], des.routes[0].segs), des.routes[1]);
    expect([des.routes[2].x, des.routes[2].y]).toEqual([end.x, end.y]);
    expect(openedBy(c, des)).toEqual([]);
  });
  it('a branch stays on its track: before the change where it was, past it moved along', () => {
    const A = r('A', 0, 0, 0, [st(16), cv(40, 45), st(16)]), at = (t: number) => poseAt(A, t);
    const near = r('Near', 0, 8, 0, [cv(40, -22.5)]), p = at(16 + (45 * Math.PI * 40) / 180 + 4), far = r('Far', p.x, p.y, p.heading, [cv(40, -22.5), st(4)]), sid = on('Sid', far, [st(8)]);
    const des = d([A, near, far, sid]), c = planCarry(des, 0, 'start', 16);
    expect(c.groups.map((g) => g.routes.map((o) => des.routes[o.i].name))).toEqual([['Far', 'Sid']]);
    des.routes[0].segs = [st(16), cv(40, 67.5), st(16)];
    applyCarry(c, des);
    closeTo(des.routes[2], poseAt(des.routes[0], 16 + (67.5 * Math.PI * 40) / 180 + 4));
    closeTo(des.routes[3], follow(des.routes[2], des.routes[2].segs));
    expect([des.routes[1].x, des.routes[1].y]).toEqual([0, 8]);
    expect(openedBy(c, des)).toEqual([]);
    // (the last straight cut short of the branch: the branch goes to its end)
    des.routes[0].segs = [st(16), cv(40, 45), st(2)];
    applyCarry(c, des);
    closeTo(des.routes[2], follow(des.routes[0], des.routes[0].segs));
  });
  it('a loop cannot stay closed: the rest stays, the joint at the changed side opens, and is said', () => {
    const des = loop(), c = planCarry(des, 0, 'start', 0), was = structuredClone(des.routes.slice(1));
    expect(c.groups).toEqual([]);
    des.routes[0].segs = [st(24), cv(40, 90)];
    expect(applyCarry(c, des)).toBe(false);
    expect(des.routes.slice(1)).toEqual(was);
    const open = openedBy(c, des);
    expect(jointNames(des, open)).toBe('L1 and L2');
    expect(holds(des, open[0])).toBe(false);
    // (taken apart at its start first: no loop, and the rest goes with its end)
    const two = loop();
    setApart(two, 'L1', 'L4', true);
    const c2 = planCarry(two, 0, 'start', 0);
    two.routes[0].segs = [st(24), cv(40, 90)];
    applyCarry(c2, two);
    closeTo(two.routes[1], follow(two.routes[0], two.routes[0].segs));
    expect(two.routes[1].y).toBe(64);
    expect(openedBy(c2, two)).toEqual([]);
    expect(pruneApart(two)).toBe(false); // (L4's end is on L1's side now, 8 studs along: they still touch, still apart)
  });
  it('a locked track holds what is joined to it', () => {
    const des = chain();
    des.routes[2].locked = true;
    const c = planCarry(des, 0, 'start', 0);
    expect(c.groups).toEqual([]);
    des.routes[0].segs = [st(20)];
    applyCarry(c, des);
    expect(des.routes[1].y).toBe(16);
    expect(jointNames(des, openedBy(c, des))).toBe('A and B');
  });
  it('changed on its card: moved or turned as a whole, everything joined goes as one; a piece changed, what is past it', () => {
    const des = chain(), before = structuredClone(des);
    des.routes[1].x += 5; des.routes[1].y -= 3;
    expect(carryChange(before, des, 1)).toEqual([]);
    expect([des.routes[0].x, des.routes[0].y]).toEqual([5, -3]);
    closeTo(des.routes[2], { x: before.routes[2].x + 5, y: before.routes[2].y - 3, heading: before.routes[2].heading });
    // (turned about its start)
    const b2 = structuredClone(des);
    des.routes[0].heading = 90;
    expect(carryChange(b2, des, 0)).toEqual([]);
    closeTo(des.routes[1], follow(des.routes[0], des.routes[0].segs));
    closeTo(des.routes[2], follow(des.routes[1], des.routes[1].segs));
    // (a piece's number changed)
    const b3 = structuredClone(des);
    des.routes[1].segs[1] = st(20);
    expect(carryChange(b3, des, 1)).toEqual([]);
    closeTo(des.routes[2], follow(des.routes[1], des.routes[1].segs));
    closeTo(des.routes[0], b3.routes[0]);
    // (a piece taken out; a curve flipped)
    const b4 = structuredClone(des);
    des.routes[1].segs = [cv(40, -45)];
    expect(carryChange(b4, des, 1)).toEqual([]);
    closeTo(des.routes[2], follow(des.routes[1], des.routes[1].segs));
    // (turned end for end: its track where it was, nothing to carry)
    const b5 = structuredClone(des);
    des.routes[1] = reversedRoute(des.routes[1]);
    expect(carryChange(b5, des, 1)).toEqual([]);
    expect(des.routes[0]).toEqual(b5.routes[0]); expect(des.routes[2]).toEqual(b5.routes[2]);
    // (a loop's track lengthened on its card: said)
    const lp = loop(), b6 = structuredClone(lp);
    lp.routes[2].segs[0] = st(20);
    expect(jointNames(lp, carryChange(b6, lp, 2))).toBe('L3 and L4');
  });
  it('what is on the carried tracks goes with them: their own data untouched, hand edits and cut paths by the same move', () => {
    const des = chain();
    Object.assign(des.routes[2], { cuts: [4], cutsLocked: true, stretches: [{ from: 2, to: 8, own: { sleepers: 'bed' } }], own: { ballast: 'ballast' } });
    // (a check rail's hand edit 4 studs along C, kept by where it is, mm)
    const at = (des2: Design) => { const p = poseAt(des2.routes[2], 4); return `${Math.round(p.x * 8)},${Math.round(p.y * 8)}`; };
    des.trackwork = { check: { [at(des)]: { d0: 5, on: ['C', 's', 32, 0] } } } as Design['trackwork'];
    const before = structuredClone(des), was = structuredClone(des.routes[2]);
    des.routes[0].heading = 90; // (A turned about its start, on its card: B and C swing round with it)
    expect(carryChange(before, des, 0)).toEqual([]);
    const { x: _x, y: _y, heading: _h, ...rest } = des.routes[2], { x: _x0, y: _y0, heading: _h0, ...rest0 } = was;
    expect(rest).toEqual(rest0);
    followTrackwork(des);
    expect(Object.keys(des.trackwork!.check!)).toEqual([at(des)]);
    expect(at(des)).not.toBe(at(before));
    // (a cut path between B and C goes where they went: one move for both)
    const f = sharedMove([before.routes[1], before.routes[2]], [des.routes[1], des.routes[2]])!;
    expect(f).toBeDefined();
    const q = f([before.routes[2].x, before.routes[2].y]);
    expect(q[0]).toBeCloseTo(des.routes[2].x, 4); expect(q[1]).toBeCloseTo(des.routes[2].y, 4);
  });
});

describe('speed, on a design of 150 tracks in ten chains of fifteen', () => {
  const big = () => d(Array.from({ length: 150 }, (_, i) => r(`R${i}`, (i % 15) * 16, Math.floor(i / 15) * 24, -90, [st(16)])));
  const median = (f: () => void, n = 7) => { const ts: number[] = []; for (let k = 0; k < n; k++) { const t = performance.now(); f(); ts.push(performance.now() - t); } return ts.sort((a, b) => a - b)[Math.floor(n / 2)]; };
  it('the joints are found in a few milliseconds, and a carried chain is put in place in well under one', () => {
    const des = big();
    expect(joints(des)).toHaveLength(140);
    expect(connectedSet(des, [20])).toHaveLength(15);
    // (generous: a slow, shared machine; a slip to n cubed would be seconds)
    expect(median(() => joints(des))).toBeLessThan(60);
    const c = planCarry(des, 15, 'start', 0);
    expect(c.groups[0].routes).toHaveLength(14);
    let len = 16;
    expect(median(() => { des.routes[15].segs = [st(++len)]; applyCarry(c, des); openedBy(c, des); })).toBeLessThan(10);
    expect(des.routes[29].x).toBeCloseTo(13 * 16 + len, 6);
  });
});
