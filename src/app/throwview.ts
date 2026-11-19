// Throwing switches in the 3D view (display only): a points set's blades, slider and lever shown at its other route,
// to see how it works. The parts are built as assembled (set for the right-hand route: blade 0 closed), and each
// carries how it moves (build.ts Piece.turn, slide, hinge) and its points' key (Piece.set). Here: which parts move
// together, the places a set can be thrown to, which route each place sets, and where a part is part way over. The
// view (main.ts) turns, slides and swings the parts' meshes; nothing of the build or the files changes.
import type { Piece } from './build';
import { type Route, routeLength, routePose, routeSOf } from '../route/route';

/** A part as the throw needs it. */
export type Moving = Pick<Piece, 'name' | 'turn' | 'slide' | 'hinge' | 'set'>;

/** A points set as the view throws it. */
export interface ThrowSet {
  key: string;
  /** what each of its levers moves (the parts' places in the list): one lever, or a three-way's two (the left blade's first) */
  groups: number[][];
  /** the places it can be thrown to, each how far over each lever is (0 as assembled, 1 its other end), from the
   * right-hand route's to the left-hand one's (as seen from the toe) */
  places: number[][];
  /** a three-way on one slider: each blade moves over half the slider's travel only (moveOf) */
  half: boolean;
}

/** The lever a moving part goes with: its name without what part it is (as the tests' setOf). */
const leverOf = (name: string) => name.replace(/-(a|b|throw\d*|throw\d*-posts|throw\d*-rod|lever\d*|spring|bracket\d*)$/, '').replace(/-points(\d*)$/, '$1') + (/-(?:throw|lever|bracket)(\d+)/.exec(name)?.[1] ?? '');

/**
 * The sets that can be thrown, by their points' key. ways: how many routes a key's points lead to (2, or a three-way's 3).
 * A set moves from as assembled (0) to its other end (1). A three-way has the straight route with both blades closed:
 * on one slider, half way (the open blade closes over the first half of the slider's travel and its post goes on from
 * there; the other opens over the second half); with a lever to each blade, the left blade's lever as assembled and the
 * right one's over, and the left-hand route both levers over. (Checked against the parts themselves in test/throwview.test.ts: at
 * each place a wheel's flange passes along that route and no other.)
 */
export function throwSets(pieces: Moving[], ways: (key: string) => number): Map<string, ThrowSet> {
  const out = new Map<string, ThrowSet>(), levers = new Map<string, Map<string, number[]>>();
  pieces.forEach((p, k) => {
    if (!p.set || !(p.turn?.swing || p.slide || p.hinge)) return;
    const by = levers.get(p.set) ?? new Map<string, number[]>(), l = leverOf(p.name);
    by.set(l, [...(by.get(l) ?? []), k]); levers.set(p.set, by);
  });
  for (const [key, by] of levers) {
    // (the lever whose blade is closed as assembled first: a three-way's left blade's)
    const closed = (g: number[]) => g.some((k) => (pieces[k].turn?.by ?? 0) !== 0);
    const groups = [...by.values()].sort((a, b) => Number(closed(b)) - Number(closed(a)));
    const three = ways(key) >= 3;
    const places = groups.length === 1 ? (three ? [[0], [0.5], [1]] : [[0], [1]])
      : three && groups.length === 2 ? [[0, 0], [0, 1], [1, 1]] : [groups.map(() => 0), groups.map(() => 1)];
    out.set(key, { key, groups, places, half: three && groups.length === 1 });
  }
  return out;
}

/** How far over the slider (and the blades with it) is with its lever f of the way over: the lever's tip moves it, on an arc (its swing by degrees in all). */
export function slidAt(f: number, by?: number) {
  if (!by) return f;
  const a0 = ((-by / 2) * Math.PI) / 180, d = 2 * Math.sin(a0);
  return Math.abs(d) < 1e-9 ? f : (Math.sin(a0) - Math.sin(a0 + (by * f * Math.PI) / 180)) / d;
}

/**
 * Where a part is with its lever f of the way over (0 as assembled, 1 its other end): turned by deg about the line
 * through `about` along `axis`, then moved by shift (mm). by: its lever's swing (degrees), if it has one. half (a
 * three-way on one slider): the blade open as assembled closes by its swing over the first half and stays; the
 * other, closed as assembled (turn.by: how far it opens by one throw), opens by two throws over the second half.
 */
export function moveOf(p: Moving, f: number, by?: number, half = false): { axis: [number, number, number]; deg: number; about: [number, number, number]; shift: [number, number, number] } {
  const t = slidAt(f, by);
  if (p.turn?.swing) return { axis: [0, 0, 1], deg: p.turn.swing * (!half ? t : p.turn.by ? Math.max(0, 4 * t - 2) : Math.min(1, 2 * t)), about: [p.turn.at[0], p.turn.at[1], 0], shift: [0, 0, 0] };
  if (p.slide) return { axis: [0, 0, 1], deg: 0, about: [0, 0, 0], shift: [p.slide.dir[0] * p.slide.by * t, p.slide.dir[1] * p.slide.by * t, 0] };
  if (p.hinge) return { axis: [p.hinge.axis[0], p.hinge.axis[1], 0], deg: p.hinge.by * f, about: p.hinge.at, shift: [0, 0, 0] };
  return { axis: [0, 0, 1], deg: 0, about: [0, 0, 0], shift: [0, 0, 0] };
}

/** A point's distance to the right of the line through `at` along `dir` (mm). */
const latOf = (q: [number, number], at: [number, number], dir: [number, number]) => (q[0] - at[0]) * dir[1] - (q[1] - at[1]) * dir[0];

/**
 * The routes a set's places set, in the places' order: from the right-hand one to the left-hand one, as seen from the
 * toe looking along the points, each with the line along it from the toe (mm, 12 studs or to its end). its: the
 * set's built points items (the build's overlay: their toe `at`, the way they face `dir`, their routes' ids); rts:
 * the design's routes.
 */
export function setRoutes(its: { at: [number, number]; dir?: [number, number]; routes?: string[] }[], rts: Route[]): { id: string; line: [number, number][] }[] {
  const it = its[0], dir = it?.dir;
  if (!it || !dir) return [];
  const ids = [...new Set(its.flatMap((x) => x.routes ?? []))];
  return ids.flatMap((id) => {
    const rt = rts.find((r) => r.id === id);
    if (!rt) return [];
    const L = routeLength(rt), sT = routeSOf(rt, it.at), h = (routePose(rt, sT)[2] * Math.PI) / 180, fwd = -Math.sin(h) * dir[0] + Math.cos(h) * dir[1] > 0;
    const line: [number, number][] = [];
    for (let k = 0; k <= 12; k++) { const sv = sT + (fwd ? 1 : -1) * k * 8; if (sv < -1e-6 || sv > L + 1e-6) break; const q = routePose(rt, Math.max(0, Math.min(L, sv))); line.push([q[0], q[1]]); }
    return line.length > 1 ? [{ id, line, lat: latOf(line[line.length - 1], it.at, dir) }] : [];
  }).sort((a, b) => b.lat - a.lat).map(({ id, line }) => ({ id, line }));
}

/** The place after this one: there and back for two; a three-way steps round its three (right, straight, left, and round again). */
export const nextPlace = (now: number, n: number) => (now + 1) % Math.max(1, n);
