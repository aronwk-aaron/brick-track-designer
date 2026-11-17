// The cuts worked out where a design's tracks join inside trackwork (src/app/jointcuts.ts; Settings › Cutting: Cut
// where tracks join in trackwork): the joints, the pieces of trackwork, and each cut's line; and the star crossing set
// built with them: its five crossings parts apart, as the set's pieces are, each on the bed.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { pathProblem } from '../src/app/cutpaths';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';
import { jointCuts, routeJoints, trackGroups } from '../src/app/jointcuts';
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
