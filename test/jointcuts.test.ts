// The cuts worked out where a design's tracks join inside trackwork (src/app/jointcuts.ts; Settings › Cutting: Cut
// where tracks join in trackwork): the joints, the pieces of trackwork, and each cut's line; and the star crossing set
// built with them: its five crossings parts apart, as the set's pieces are, each on the bed.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { pathProblem } from '../src/app/cutpaths';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';
import { jointClusters, jointCutNear, jointCuts, routeJoints, trackGroups } from '../src/app/jointcuts';
import { kernel } from '../src/geom/kernel';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const STAR = 'Narrow-gauge star crossing 45° over two standard tracks';
const st = (q: number[]) => q.map((v) => Math.round((v / 8) * 100) / 100);

describe('cuts where tracks join inside trackwork: worked out', () => {
  // (a standard straight up the plan, 16 studs; a narrow-gauge line across its middle at 45 degrees in two tracks, joined
  // 7.3 studs past the crossing: the joint's line square across runs into the straight's bed)
  const cross = (join: number): Design => ({ version: 1, gaugeStuds: 4, routes: [
    { name: 'S', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'A', x: 8, y: 0, heading: 45, segs: [{ kind: 'straight', studs: 8 * Math.SQRT2 + join }] },
    { name: 'B', x: 8 - (8 * Math.SQRT2 + join) * Math.SQRT1_2, y: (8 * Math.SQRT2 + join) * Math.SQRT1_2, heading: 45, segs: [{ kind: 'straight', studs: 12 }], gaugeStuds: 2 }] });
  const of = (d: Design) => { d.routes[1].gaugeStuds = 2; const rts = toRoutes(d); return { rts, halves: rts.map((rt) => 32 + ((rt.gauge ?? 40) - 40) / 2) }; };
  it('a joint is where two tracks meet end to end, in line; tracks that cross are one piece', () => {
    const { rts } = of(cross(7.3));
    expect(routeJoints(rts).map((j) => [j.i, j.k, ...st([j.P[0], j.P[1]])])).toEqual([[1, 2, -5.16, 13.16]]);
    const g = trackGroups(rts);
    expect(g[0]).toBe(g[1]);
    expect(g[2]).not.toBe(g[0]);
  });
  it('the cut is square across the joint, and turns along the bed of the track just crossed', () => {
    const { rts, halves } = of(cross(7.3)), cuts = jointCuts(rts, halves);
    expect(cuts).toHaveLength(1);
    const pts = cuts[0].pts.map(st);
    // (from the open on the far side, square across the slanted track to the straight's bed edge at x -4, then up that
    // edge as far as the next track's bed lies against it)
    expect(pts[0]).toEqual([-7.34, 10.99]);
    expect(pts[1]).toEqual([-4, 14.33]);
    // (to the straight's own end at y 16, and a little along that end, where the next track's corner lies past it)
    expect(pts).toContainEqual([-4, 16]);
    expect(pts[pts.length - 1][1]).toBe(16);
    expect(pts[pts.length - 1][0]).toBeGreaterThan(-4);
    // (never along a rail, nor refused as a cut: checked as a slip's own cuts are)
    expect(pathProblem(cuts[0].pts.map((q): [number, number] => [q[0] / 8, q[1] / 8]), [], { routes: rts, railG: 20, no: { blades: [], frogs: [], moving: [] }, slip: true, free: true })).toBeUndefined();
  });
  it('a joint clear of every other track has no cut: an ordinary track end goes there', () => {
    const { rts, halves } = of(cross(16));
    expect(routeJoints(rts)).toHaveLength(1);
    expect(jointCuts(rts, halves)).toEqual([]);
  });
});

describe('joints beside each other, each on the other track\'s bed: one cut across them all', () => {
  // (a compact R40 switch as its kit: the base's straight, 16 studs, and its branch, 22.5 degrees of R40; the
  // detachable section's two tracks joined onto their ends, 3 studs apart)
  const kit = (): Design => ({ version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] },
    { name: 'Section straight', x: 0, y: 16, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'Section branch', x: -3.044819, y: 15.307337, heading: 22.5, segs: [{ kind: 'curve', radius: 40, angle: 11.25 }] }] });
  const rts = toRoutes(kit()), halves = rts.map(() => 32);
  it('the two joints are one set, and the tracks each side of them one piece', () => {
    const js = routeJoints(rts);
    expect(js.map((j) => [j.i, j.k])).toEqual([[0, 2], [1, 3]]);
    // (in order across the tracks: the branch's, then the straight's)
    expect(jointClusters(rts, halves)).toEqual([[1, 0]]);
    const g = trackGroups(rts, halves);
    expect(g[0]).toBe(g[1]);
    expect(g[2]).toBe(g[3]);
    expect(g[2]).not.toBe(g[0]);
    // (without the beds' widths, as before: the section's two tracks, which neither cross nor part, pieces apart)
    const g0 = trackGroups(rts);
    expect(g0[2]).not.toBe(g0[3]);
  });
  it('one cut: square across the branch at its joint, to where that line meets the straight\'s, and square across the straight', () => {
    const cuts = jointCuts(rts, halves);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].id).toBe('j1');
    expect(st(cuts[0].at)).toEqual([0, 16]);
    expect(cuts[0].more!.map(st)).toEqual([[-3.04, 15.31]]);
    const pts = cuts[0].pts.map(st);
    expect(pts).toHaveLength(3);
    // (from the open past the branch's outer edge, 22.5 degrees off square to the straight; the corner between the
    // two tracks, on the straight's line at 16 studs; out past the straight's far edge)
    expect(pts[0][0]).toBeCloseTo(-6.81, 1); expect(pts[0][1]).toBeCloseTo(13.75, 1);
    expect(pts[1][0]).toBeCloseTo(-1.37, 1); expect(pts[1][1]).toBe(16);
    expect(pts[2][0]).toBeCloseTo(4.08, 1); expect(pts[2][1]).toBe(16);
    expect(pathProblem(cuts[0].pts.map((q): [number, number] => [q[0] / 8, q[1] / 8]), [], { routes: rts, railG: 20, no: { blades: [], frogs: [], moving: [] }, slip: true, free: true })).toBeUndefined();
  });
  it('a press on the plan finds the cut whose line it is on, within reach', () => {
    const cuts = jointCuts(rts, halves);
    expect(jointCutNear(cuts, [8, 128.5], 1)).toBe(0);
    expect(jointCutNear(cuts, [-40, 116], 3)).toBe(0);
    expect(jointCutNear(cuts, [8, 132], 1)).toBeUndefined();
    expect(jointCutNear([], [8, 128], 1)).toBeUndefined();
  });
  it('a joint on another track\'s bed with no joint of that track beside it has no cut, as before', () => {
    const d = kit();
    d.routes[1].segs = [{ kind: 'curve', radius: 40, angle: 33.75 }];
    d.routes.pop();
    const r2 = toRoutes(d);
    expect(routeJoints(r2)).toHaveLength(1);
    expect(jointClusters(r2, r2.map(() => 32))).toEqual([]);
    expect(jointCuts(r2, r2.map(() => 32))).toEqual([]);
  });
});

describe('a joint at a toe, with a joint beside it: cut with it', () => {
  // (a tandem as its kit: the base's straight and branch; the next piece begins with points of its own at the straight's
  // end (a second branch from there), the first branch carried on through it)
  const tandem = (): Design => ({ version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] },
    { name: 'Section straight', x: 0, y: 16, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'Section branch', x: -3.044819, y: 15.307337, heading: 22.5, segs: [{ kind: 'curve', radius: 40, angle: 16.875 }] },
    { name: 'Section second branch', x: 0, y: 16, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }] });
  const rts = toRoutes(tandem()), halves = rts.map(() => 32);
  it('three ends at one place are no joint, but for the cuts: a track\'s end with two setting out from it', () => {
    expect(routeJoints(rts).map((j) => [j.i, j.k])).toEqual([[1, 3]]);
    // (the joints at toes after the others, out of the one track into the first of the two, the other with it)
    expect(routeJoints(rts, true).map((j) => [j.i, j.k, j.also])).toEqual([[1, 3, undefined], [0, 2, [4]]]);
    // (two tracks from one toe and nothing joined on before them: no joint)
    expect(routeJoints(rts.slice(0, 2), true)).toEqual([]);
  });
  it('one cut across the branch\'s joint and the toe, as a kit\'s base ends; the points\' own blades past the toe are not in its way', () => {
    expect(jointClusters(rts, halves)).toEqual([[0, 1]]);
    const cuts = jointCuts(rts, halves);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].id).toBe('j1');
    expect(cuts[0].pts.map(st).map((q) => q[1])).toEqual([13.75, 16, 16]);
    expect(cuts[0].toes!.map((P) => st([P[0], P[1]]))).toEqual([[0, 16]]);
    expect(cuts[0].toes![0][2]).toBeCloseTo(0, 6);
    // (the piece past the cut one piece of trackwork: the straight, the branch carried on and the second branch)
    const g = trackGroups(rts, halves);
    expect(new Set([g[2], g[3], g[4]]).size).toBe(1);
    expect(g[0]).toBe(g[1]);
    expect(g[0]).not.toBe(g[2]);
  });
  it('a toe with no joint beside it has no cut', () => {
    const d = tandem();
    d.routes.splice(3, 1);
    d.routes[1].segs = [{ kind: 'curve', radius: 40, angle: 45 }];
    const r2 = toRoutes(d);
    expect(routeJoints(r2, true)).toHaveLength(1);
    expect(jointCuts(r2, r2.map(() => 32))).toEqual([]);
  });
});

describe('the star crossing set cut where its pieces join', { timeout: 600000 }, () => {
  const build = async (on: boolean) => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const d = structuredClone(TEMPLATES[STAR]);
      d.options = { ...d.options, jointCuts: on };
      return buildDesign(w, d);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  };
  const box = (P: ArrayLike<number>) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (let i = 0; i < P.length; i += 3) { b[0] = Math.min(b[0], P[i]); b[1] = Math.min(b[1], P[i + 1]); b[2] = Math.max(b[2], P[i]); b[3] = Math.max(b[3], P[i + 1]); } return b; };
  it('off: its five crossings are one part, too big for the bed', async () => {
    const b = await build(false);
    expect(b.info.warnings.some((q) => /don't fit the 256 x 256 print bed/.test(q))).toBe(true);
    expect(b.overlay?.jointCuts).toBeUndefined();
  });
  it('on: the crossing between the tracks is a part of its own, 8 studs square to the lines, and every part fits', async () => {
    const b = await build(true);
    expect(b.info.warnings).toEqual([]);
    const made = b.overlay!.jointCuts!.filter((c) => c.made).map((c) => st(c.at));
    // (the four joints round the middle crossing, the two between the crossings on each track, and the outer ends of the lower crossings' diagonals)
    for (const at of [[-5.17, 13.17], [-10.83, 13.17], [-5.17, 18.83], [-10.83, 18.83], [0, 16], [-16, 16], [5.17, 2.83], [-21.17, 2.83]]) expect(made, `the joint at ${at}`).toContainEqual(at);
    const tracks = b.pieces.filter((p) => /^track/.test(p.name)), boxes = tracks.map((p) => box(p.positions).map((v) => v / 8));
    // (the middle crossing: within the 8 studs between the two tracks' beds, its arms' square ends 9.9 studs apart corner to corner)
    const mid = boxes.filter((bx) => bx[0] > -12.1 && bx[2] < -3.9 && bx[1] > 10.9 && bx[3] < 21.1);
    expect(mid).toHaveLength(1);
    expect(mid[0][2] - mid[0][0]).toBeGreaterThan(7.9);
    expect(mid[0][3] - mid[0][1]).toBeGreaterThan(9.8);
    // (each crossing over a standard track a part of its own: none reaches from one track's far rail to the other's)
    expect(boxes.filter((bx) => bx[0] < -18 && bx[2] > 2)).toEqual([]);
    for (const p of tracks) { const bx = box(p.positions); expect(Math.hypot(bx[2] - bx[0], bx[3] - bx[1]), p.name).toBeLessThan(256 * Math.SQRT2); }
  });
});
