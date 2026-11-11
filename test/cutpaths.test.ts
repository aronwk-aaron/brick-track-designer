// Cut paths (expert mode), the pure part: what a design keeps of a file's paths, a path laid on the stud grid (a
// slant as steps), what's against a path before anything is built, a corner dragged, and a path going with its
// tracks when they all move together.
import { describe, expect, it } from 'vitest';
import { cleanPaths, FROG_CLEAR, fromGrid, gridPath, moveCorner, newPathId, PATH_MAX, pathProblem, pathTracks, type PlacedRoute, type Pt, sharedMove, snapToGrid, toGrid } from '../src/app/cutpaths';
import { type Design, readDesign, toRoutes } from '../src/app/design';
import { studsCut } from './cutpaths.shared';

const design = (more: Partial<Design> = {}): Design => ({ version: 1, gaugeStuds: 4, routes: [
  { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'B', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }], ...more });

describe('cut paths: what a design keeps', () => {
  it('well-formed paths, with ids of their own; the rest dropped', () => {
    expect(cleanPaths(undefined)).toBeUndefined();
    expect(cleanPaths([])).toBeUndefined();
    expect(cleanPaths([{ id: 'c1', pts: [[0, 0], [0, 8]] }, { id: 'c1', pts: [[1, 0], [1, 8]], joint: 'butt' }, { pts: [[2, 0]] }, 'x', { id: 'c9', pts: [[0, 0], [0, 0], ['a', 1], [3, 1e9], [4, 4]], joint: 'glue' }]))
      .toEqual([{ id: 'c1', pts: [[0, 0], [0, 8]] }, { id: 'c2', pts: [[1, 0], [1, 8]], joint: 'butt' }, { id: 'c9', pts: [[0, 0], [4, 4]] }]);
    expect(cleanPaths(Array.from({ length: 100 }, (_, k) => ({ id: `p${k}`, pts: [[k, 0], [k, 8]] })))!.length).toBe(PATH_MAX.paths);
    expect(newPathId(['c1', 'c3'])).toBe('c2');
  });
  it('a design file\'s paths are read; malformed ones dropped; an old file has none', () => {
    const d = readDesign(JSON.parse(JSON.stringify(design({ expert: { cutPaths: [{ id: 'c1', pts: [[8, -1], [8, 41]] }] } }))));
    expect(d.expert).toEqual({ cutPaths: [{ id: 'c1', pts: [[8, -1], [8, 41]] }] });
    expect(readDesign(JSON.parse(JSON.stringify(design()))).expert).toBeUndefined();
    expect(readDesign({ ...JSON.parse(JSON.stringify(design())), expert: { cutPaths: [{ pts: 'no' }], more: 1 } }).expert).toBeUndefined();
    expect(readDesign({ ...JSON.parse(JSON.stringify(design())), expert: 7 }).expert).toBeUndefined();
  });
});

describe('cut paths: on the stud grid', () => {
  it('corners go to the grid corner nearest; a grid turned and moved has its own', () => {
    expect(snapToGrid([0, 0, 0], [3.4, -2.6])).toEqual([3, -3]);
    expect(snapToGrid([0.5, 0.25, 0], [3.4, -2.6])).toEqual([3.5, -2.75]);
    const g: [number, number, number] = [2, 1, 90], q = fromGrid(g, [3, 5]);
    expect(q).toEqual([-3, 4]);
    expect(toGrid(g, q).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([3, 5]);
  });
  it('runs along the grid\'s lines stay; corners in a line are left out; a slant is laid as steps of two studs or more', () => {
    expect(gridPath([0, 0, 0], [[0, 0], [0, 4.2], [0, 8], [6, 8]])).toEqual([[0, 0], [0, 8], [6, 8]]);
    expect(gridPath([0, 0, 0], [[0, 0], [8, 4]])).toEqual([[0, 0], [4, 0], [4, 2], [8, 2], [8, 4]]);
    // (too short a slant for two steps: across, then along)
    expect(gridPath([0, 0, 0], [[0, 0], [3, 9]])).toEqual([[0, 0], [3, 0], [3, 9]]);
    const turned = gridPath([1, 2, 22.5], [[0, 0], [9, 5], [2, 17]]).map((q) => toGrid([1, 2, 22.5], q));
    for (let k = 1; k < turned.length; k++) expect(Math.min(Math.abs(turned[k][0] - turned[k - 1][0]), Math.abs(turned[k][1] - turned[k - 1][1]))).toBeLessThan(1e-3);
    for (const q of turned) { expect(Math.abs(q[0] - Math.round(q[0]))).toBeLessThan(2e-3); expect(Math.abs(q[1] - Math.round(q[1]))).toBeLessThan(2e-3); }
  });
  it('a corner dragged takes its neighbours across their own runs: every run still along a grid line', () => {
    const p: Pt[] = [[0, 0], [0, 8], [6, 8], [6, 20]];
    expect(moveCorner([0, 0, 0], p, 1, [2, 10])).toEqual([[2, 0], [2, 10], [6, 10], [6, 20]]);
    expect(moveCorner([0, 0, 0], p, 0, [0, -4])).toEqual([[0, -4], [0, 8], [6, 8], [6, 20]]);
    expect(moveCorner([0, 0, 0], p, 3, [9, 22])).toEqual([[0, 0], [0, 8], [9, 8], [9, 22]]);
  });
});

describe('cut paths: what\'s against one before the build', () => {
  const rts = toRoutes(design()), tr = { routes: rts, railG: 20, no: { blades: [{ line: [[0, 0], [0, 100]] as Pt[], half: 24 }], frogs: [[128, 160]] as Pt[] } };
  it('nothing against a path between the tracks, or across them clear of blades and frogs', () => {
    expect(pathProblem([[8, -1], [8, 41]], [], tr)).toBeUndefined();
    expect(pathProblem([[-6, 30], [22, 30]], [], tr)).toBeUndefined();
    expect(pathProblem([[0, 16], [0, 41]], [], tr)).toBeUndefined();
  });
  it('one point, a run under 2 studs between turns, crossing itself', () => {
    expect(pathProblem([[0, 0]])!.why).toMatch(/two points or more/);
    expect(pathProblem([[0, 0], [0, 8], [1, 8], [1, 16]])!.why).toMatch(/2 studs or longer/);
    expect(pathProblem([[0, 0], [0, 8], [1, 8]])).toBeUndefined();
    expect(pathProblem([[0, 0], [0, 8], [4, 8], [4, 4], [-4, 4]])!.why).toBe('The cut crosses itself');
  });
  it('beside another path: 2 studs apart or more, not on it', () => {
    expect(pathProblem([[9, 0], [9, 20]], [[[8, 10], [8, 30]]])!.why).toMatch(/sliver between two cuts/);
    expect(pathProblem([[8, 0], [8, 20]], [[[8, 10], [8, 30]]])!.why).toBe('Another cut runs here already');
    expect(pathProblem([[10, 0], [10, 20]], [[[8, 10], [8, 30]]])).toBeUndefined();
    // (end to end, or meeting square: fine)
    expect(pathProblem([[8, 0], [8, 10]], [[[8, 10], [8, 30]]])).toBeUndefined();
    expect(pathProblem([[0, 10], [8, 10]], [[[8, 0], [8, 30]]])).toBeUndefined();
  });
  it('through a blade\'s moving length, through a frog, down a rail: with where', () => {
    expect(pathProblem([[-6, 6], [6, 6]], [], tr)).toEqual({ why: 'A blade moves here: cut before the toe or past the heel', at: [-2.75, 6] });
    expect(pathProblem([[15, 10], [15, 30]], [], tr)).toEqual({ why: `Through a frog (where two rails cross): keep the cut ${FROG_CLEAR / 8} studs clear of it`, at: [16, 20] });
    expect(pathProblem([[18, 22], [18, 41]], [], tr)!.why).toMatch(/^Runs down a rail/);
    expect(pathProblem([[19, 22], [19, 41]], [], tr)!.why).toMatch(/^Runs down a rail/);
    // (two studs from a rail's line: clear)
    expect(pathProblem([[20, 22], [20, 41]], [], { ...tr, no: undefined })).toBeUndefined();
  });
});

describe('cut paths: going with their tracks', () => {
  const placed = (d: Design): PlacedRoute[] => d.routes.map((r) => ({ x: r.x, y: r.y, heading: r.heading, segs: structuredClone(r.segs) }));
  const curve = (x: number, heading = 0, angle = 30): Design['routes'][number] => ({ name: 'C', x, y: 0, heading, segs: [{ kind: 'straight', studs: 8 }, { kind: 'curve', radius: 40, angle }] });
  it('the tracks a path lies between: those within 12 studs of it', () => {
    const d = design({ routes: [...design().routes, { name: 'Far', x: 60, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }] });
    expect(pathTracks([[8, -1], [8, 41]], toRoutes(d))).toEqual([0, 1]);
    expect(pathTracks([[200, 0], [200, 9]], toRoutes(d))).toEqual([]);
  });
  it('moved together: the path moves as they did', () => {
    const a = design(), b = design(); for (const r of b.routes) { r.x += 5; r.y -= 3; }
    const f = sharedMove(placed(a), placed(b))!;
    expect(f([8, -1])).toEqual([13, -4]);
  });
  it('turned together about a point: the path turns with them', () => {
    const a = design({ routes: [curve(0), curve(16)] }), b = design({ routes: [{ ...curve(0), heading: 90 }, { ...curve(0), x: 0, y: 16, heading: 90 }] });
    const q = sharedMove(placed(a), placed(b))!([8, 4]);
    expect(q[0]).toBeCloseTo(-4, 6); expect(q[1]).toBeCloseTo(8, 6);
  });
  it('mirrored together (curves the other way, about a line up the plan): the path is mirrored', () => {
    const a = design({ routes: [curve(0), curve(16)] }), b = design({ routes: [{ ...curve(20, 0, -30) }, { ...curve(4, 0, -30) }] });
    const q = sharedMove(placed(a), placed(b))!([8, 4]);
    expect(q[0]).toBeCloseTo(12, 6); expect(q[1]).toBeCloseTo(4, 6);
  });
  it('only one moved, one reshaped, or nothing moved: it stays', () => {
    const a = design(), one = design(); one.routes[0].x += 4;
    expect(sharedMove(placed(a), placed(one))).toBeUndefined();
    const longer = design(); for (const r of longer.routes) r.x += 4; longer.routes[1].segs = [{ kind: 'straight', studs: 48 }];
    expect(sharedMove(placed(a), placed(longer))).toBeUndefined();
    expect(sharedMove(placed(a), placed(design()))).toBeUndefined();
    expect(sharedMove([], [])).toBeUndefined();
  });
});

describe('cut paths: the check that no stud is cut (cutpaths.shared.ts)', () => {
  /** a stud's sides as triangles (a prism from the bed's top up), middle at cx on the line y = 0, what's left of x = 0 cut off */
  const stud = (cx: number): Float32Array => {
    const R = 2.49, pts: [number, number][] = [], out: number[] = [];
    for (let k = 0; k < 96; k++) { const a = (2 * Math.PI * k) / 96, x = cx + R * Math.cos(a), y = R * Math.sin(a); if (x >= 0) pts.push([x, y]); else if (pts.length && pts[pts.length - 1][0] > 0) pts.push([0, Math.sqrt(R * R - cx * cx)], [0, -Math.sqrt(R * R - cx * cx)]); }
    pts.forEach((p, k) => { const q = pts[(k + 1) % pts.length]; out.push(p[0], p[1], 3.2, q[0], q[1], 3.2, q[0], q[1], 5, p[0], p[1], 3.2, q[0], q[1], 5, p[0], p[1], 5); });
    return Float32Array.from(out);
  };
  const built = (cx: number) => ({ overlay: { cutting: { grid: [0, 0, 0], railG: 20 } }, pieces: [{ name: 'track1', positions: stud(cx) }] }) as unknown as Parameters<typeof studsCut>[1];
  const d = design({ expert: { cutPaths: [{ id: 'c1', pts: [[0, -2], [0, 2]] }] } });
  it('a stud a cut goes through is found, one only grazed by a hair too; a whole one beside the cut is not', () => {
    expect(studsCut(d, built(1))).toEqual(['track1: a stud is cut at 0.00, 0.00 (studs)']);
    expect(studsCut(d, built(2.4))).toEqual(['track1: a stud is cut at 0.00, 0.00 (studs)']);
    expect(studsCut(d, built(4))).toEqual([]);
  });
});
