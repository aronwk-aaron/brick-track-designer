// Cut paths (expert mode): cuts drawn by hand along a track or between tracks, where no ordinary track end can be
// made (the tracks are one part: points, a crossover, a throat). A path is a line of corners on the stud grid, every
// run of it along a grid line, so it passes between studs and never through one; the build cuts every part it runs
// through from edge to edge (geom/pathsplit.ts cutOnPaths) and joins the two sides as its own stepped cuts are joined.
// The pure part: the paths as a design keeps them, laid on the grid, what makes one impossible before anything is
// built, and how they go with the tracks they lie between when those are moved. (Cuts across one track on its own
// are routecuts.ts's: ordinary track ends.)
import type { Route } from '../route/route';
import type { SharedSleepers } from './sleeperedits';
import type { Accept } from './accept';
import { railOffsetOf, routeLat, routeLength, routePose, routeSOf, routesBox } from '../route/route';

export type Pt = [number, number];
/** How a cut path's two sides are joined: as Settings › Cutting › Parts join with has them. */
export const PATH_JOINTS = ['lego', 'dovetail', 'axle', 'flataxle', 'butt'] as const;
export type PathJoint = typeof PATH_JOINTS[number];
/** A cut path: its corners (studs, on the plan), and its own joint (left out: the design's). */
export interface CutPath { id: string; pts: Pt[]; joint?: PathJoint }
/** What belongs to two routes or more (expert mode): the cut paths; the pairs of routes (by name) that touch but were taken apart (connections.ts). */
export interface Expert { cutPaths?: CutPath[]; apart?: [string, string][]; /** sleepers shared by tracks side by side (sleeperedits.ts) */ shared?: SharedSleepers[]; /** pairs of tracks that run over each other on purpose (accept.ts) */ accept?: Accept[] }
/** The stud grid in force: a corner between four studs and the way its lines run (studs; degrees, 0 = up the plan). */
export type Grid = [x: number, y: number, heading: number];

/** The most paths a design keeps, the most corners a path has, and how far from the plan's middle a corner may be (studs). */
export const PATH_MAX = { paths: 64, pts: 40, reach: 10000 };
/** (studs) A run of a path between two turns is this long at least: a shorter one leaves a tab a stud wide. */
export const RUN_MIN = 2;
/** (mm) No cut within this of where two rails cross (a frog's nose, a diamond's corner). */
export const FROG_CLEAR = 16;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** A file's cut paths held to what a design keeps: each with an id of its own and two corners or more, numbers only, within reach; the joint one of the five. Undefined: none. */
export function cleanPaths(v: unknown): CutPath[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: CutPath[] = [], ids = new Set<string>();
  for (const p of v.slice(0, PATH_MAX.paths) as { id?: unknown; pts?: unknown; joint?: unknown }[]) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.pts)) continue;
    const pts: Pt[] = [];
    for (const q of p.pts.slice(0, PATH_MAX.pts) as unknown[]) {
      if (!Array.isArray(q) || q.length < 2 || !q.slice(0, 2).every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= PATH_MAX.reach)) continue;
      const pt: Pt = [r3(q[0] as number), r3(q[1] as number)];
      if (!pts.length || !same(pts[pts.length - 1], pt)) pts.push(pt);
    }
    if (pts.length < 2) continue;
    let id = typeof p.id === 'string' && p.id && p.id.length <= 24 ? p.id : '';
    if (!id || ids.has(id)) id = newPathId(ids);
    ids.add(id);
    out.push({ id, pts, ...(PATH_JOINTS.includes(p.joint as PathJoint) && { joint: p.joint as PathJoint }) });
  }
  return out.length ? out : undefined;
}
/** At most this many pairs of routes kept apart in a design. */
export const APART_MAX = 500;
/** A file's pairs taken apart held to what a design keeps: two different names of routes there are, each pair once. Undefined: none. */
export function cleanApart(v: unknown, names: ReadonlySet<string>): [string, string][] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: [string, string][] = [], seen = new Set<string>();
  for (const p of v as unknown[]) {
    if (out.length >= APART_MAX) break;
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'string' || typeof p[1] !== 'string' || p[0] === p[1] || !names.has(p[0]) || !names.has(p[1])) continue;
    const key = p[0] < p[1] ? `${p[0]}\n${p[1]}` : `${p[1]}\n${p[0]}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push([p[0], p[1]]);
  }
  return out.length ? out : undefined;
}

/** An id no path has yet: c1, c2, … */
export function newPathId(taken: Iterable<string>): string { const t = new Set(taken); let n = 1; while (t.has(`c${n}`)) n++; return `c${n}`; }

/** A point of the plan in the grid's own frame (across its lines, along them), and back. */
export function toGrid(g: Grid, q: Pt): Pt { const h = (g[2] * Math.PI) / 180, dx = q[0] - g[0], dy = q[1] - g[1]; return [dx * Math.cos(h) + dy * Math.sin(h), -dx * Math.sin(h) + dy * Math.cos(h)]; }
export function fromGrid(g: Grid, q: Pt): Pt { const h = (g[2] * Math.PI) / 180; return [r3(g[0] + q[0] * Math.cos(h) - q[1] * Math.sin(h)), r3(g[1] + q[0] * Math.sin(h) + q[1] * Math.cos(h))]; }
/** The grid corner nearest a point of the plan (where four studs meet: a cut through it touches none of them). */
export function snapToGrid(g: Grid, q: Pt): Pt { const l = toGrid(g, q); return fromGrid(g, [Math.round(l[0]), Math.round(l[1])]); }

/**
 * A path laid on the grid: each corner on the grid corner nearest it, each run along a grid line. A run drawn at a
 * slant is laid as stairs, each step RUN_MIN studs or more both ways (as many steps as that allows; none where it's
 * too short a slant: across first, then along). Corners in a straight line are left out. In the plan's frame.
 */
export function gridPath(g: Grid, pts: Pt[]): Pt[] {
  const loc = pts.map((q) => { const l = toGrid(g, q); return [Math.round(l[0]), Math.round(l[1])] as Pt; });
  const out: Pt[] = [];
  const push = (q: Pt) => {
    const n = out.length;
    if (n && same(out[n - 1], q)) return;
    // (a corner in line with the two before it: the middle one goes)
    if (n >= 2 && ((out[n - 2][0] === out[n - 1][0] && out[n - 1][0] === q[0]) || (out[n - 2][1] === out[n - 1][1] && out[n - 1][1] === q[1]))
      && Math.sign(q[0] - out[n - 1][0]) === Math.sign(out[n - 1][0] - out[n - 2][0]) && Math.sign(q[1] - out[n - 1][1]) === Math.sign(out[n - 1][1] - out[n - 2][1])) out.pop();
    out.push(q);
  };
  loc.forEach((q, k) => {
    if (!k) return push(q);
    const a = loc[k - 1], dx = q[0] - a[0], dy = q[1] - a[1];
    if (dx !== 0 && dy !== 0) {
      const n = Math.max(1, Math.floor(Math.min(Math.abs(dx), Math.abs(dy)) / RUN_MIN));
      for (let i = 1; i <= n; i++) {
        const x = a[0] + Math.round((dx * i) / n), y0 = a[1] + Math.round((dy * (i - 1)) / n), y = a[1] + Math.round((dy * i) / n);
        push([x, y0]); push([x, y]);
      }
    } else push(q);
  });
  return out.map((q) => fromGrid(g, q));
}

/** How far q is from the stretch a-b. */
const segDist = (q: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, k = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(q[0] - a[0] - k * dx, q[1] - a[1] - k * dy);
};
/** Whether stretches a-b and c-d cross (at a point inside both). */
const cross = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

/** What a cut must keep clear of, from the build (its overlay): where blades move (each a line along the track, and how far each side of it, mm), and where rails cross (mm). */
export interface NoCut { blades: { line: Pt[]; half: number }[]; frogs: Pt[] }
/** Why a path can't be cut, and where (studs). */
export interface PathFault { why: string; at: Pt }

/**
 * Why a path can't be made, with where (undefined: nothing against it before the build): fewer than two corners, a
 * run between turns under RUN_MIN studs, crossing itself, running beside another path less than 2 studs off (a
 * sliver between them), down a rail (within 1.5 studs of it and along it), through a blade's moving length, through
 * a frog. pts and others in studs, on the grid; tr: the track, mm (its routes, the rails' offset from a centre line
 * at the design's gauge, and what the build says to keep clear of).
 */
export function pathProblem(pts: Pt[], others: Pt[][] = [], tr?: { routes: Route[]; railG: number; no?: NoCut }): PathFault | undefined {
  const routes = tr?.routes ?? [], no = tr?.no;
  if (pts.length < 2) return { why: 'A cut path has two points or more', at: pts[0] ?? [0, 0] };
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let k = 1; k + 2 < pts.length; k++) if (len(pts[k], pts[k + 1]) < RUN_MIN - 1e-6) return { why: `Each run between two turns ${RUN_MIN} studs or longer (a shorter one leaves a tab 1 stud wide)`, at: mid(pts[k], pts[k + 1]) };
  for (let i = 0; i + 1 < pts.length; i++) for (let j = i + 2; j + 1 < pts.length; j++) if (cross(pts[i], pts[i + 1], pts[j], pts[j + 1])) return { why: 'The cut crosses itself', at: pts[j] };
  // (beside another path: a point of one within 2 studs of a run of the other, the two running the same way there)
  for (const o of others) for (let i = 0; i + 1 < pts.length; i++) for (let j = 0; j + 1 < o.length; j++) {
    const a = pts[i], b = pts[i + 1], c = o[j], d = o[j + 1], la = len(a, b), lc = len(c, d);
    if (la < 1e-6 || lc < 1e-6 || Math.abs(((b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1])) / (la * lc)) < 0.99) continue;
    // (how much of a-b lies beside c-d, and how far off)
    const u = (q: Pt) => ((q[0] - c[0]) * (d[0] - c[0]) + (q[1] - c[1]) * (d[1] - c[1])) / lc, lo = Math.max(0, Math.min(u(a), u(b))), hi = Math.min(lc, Math.max(u(a), u(b)));
    const off = Math.abs(((a[0] - c[0]) * (d[1] - c[1]) - (a[1] - c[1]) * (d[0] - c[0])) / lc);
    if (hi - lo > 1e-6 && off < 2 - 1e-6) return { why: off < 1e-6 ? 'Another cut runs here already' : 'Leaves a sliver between two cuts: move the cut 1 stud', at: mid(a, b) };
  }
  // (in mm from here: against the track)
  const mm = pts.map((q): Pt => [q[0] * 8, q[1] * 8]);
  const boxes = routes.map((rt) => routesBox([rt], 64));
  for (let i = 0; i + 1 < mm.length; i++) {
    const a = mm[i], b = mm[i + 1], l = len(a, b), n = Math.max(1, Math.ceil(l / 2)), d: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    for (const f of no?.frogs ?? []) if (segDist(f, a, b) < FROG_CLEAR - 1e-6) return { why: `Through a frog (where two rails cross): keep the cut ${FROG_CLEAR / 8} studs clear of it`, at: [f[0] / 8, f[1] / 8] };
    for (let k = 0; k <= n; k++) {
      const q: Pt = [a[0] + (d[0] * l * k) / n, a[1] + (d[1] * l * k) / n], at: Pt = [q[0] / 8, q[1] / 8];
      for (const bl of no?.blades ?? []) for (let j = 0; j + 1 < bl.line.length; j++) if (segDist(q, bl.line[j], bl.line[j + 1]) < bl.half) return { why: 'A blade moves here: cut before the toe or past the heel', at };
      for (let r = 0; r < routes.length; r++) {
        const rt = routes[r], bx = boxes[r];
        if (q[0] < bx[0] || q[0] > bx[2] || q[1] < bx[1] || q[1] > bx[3]) continue;
        const lat = routeLat(rt, q), G = railOffsetOf(rt, tr!.railG);
        // (a rail within a stud and a half of it, running along it within 10 degrees: the cut would run down the rail)
        if (Math.min(Math.abs(lat - G), Math.abs(lat + G)) >= 12) continue;
        const s = routeSOf(rt, q);
        if (s <= 0.5 || s >= routeLength(rt) - 0.5) continue;
        const h = (routePose(rt, s)[2] * Math.PI) / 180;
        if (Math.abs(-Math.sin(h) * d[0] + Math.cos(h) * d[1]) > Math.cos(Math.PI / 18)) return { why: 'Runs down a rail: move the cut 2 studs across, or cross the rail square', at };
      }
    }
  }
  return undefined;
}

/**
 * The tracks a path lies between or along: the routes with a rail's width of track within 12 studs of some run of
 * it (by name; routes in mm, the design's own in order). It goes with them when they all move together.
 */
export function pathTracks(pts: Pt[], routes: Route[]): number[] {
  const mm = pts.map((q): Pt => [q[0] * 8, q[1] * 8]), out: number[] = [];
  routes.forEach((rt, r) => {
    if (!rt.segments.length) return;
    const bx = routesBox([rt], 96);
    for (let i = 0; i + 1 < mm.length; i++) {
      const a = mm[i], b = mm[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8));
      for (let k = 0; k <= n; k++) {
        const q: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        if (q[0] < bx[0] || q[0] > bx[2] || q[1] < bx[1] || q[1] > bx[3]) continue;
        const s = routeSOf(rt, q), p = routePose(rt, s);
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 96) { out.push(r); return; }
      }
    }
  });
  return out;
}

/** A path's corners moved as its tracks were (f: where a point of the plan went, studs). */
export const movedPath = (p: CutPath, f: (q: Pt) => Pt): CutPath => ({ ...p, pts: p.pts.map((q) => { const m = f(q); return [r3(m[0]), r3(m[1])] as Pt; }) });

/**
 * A path with one corner dragged to another grid corner, its runs kept along the grid's lines: the corner before
 * and the one after go with it across their own run (a run up the plan stays a run up the plan, moved sideways).
 * In the plan's frame; the build and gridPath tidy what's left (a run of no length).
 */
export function moveCorner(g: Grid, pts: Pt[], k: number, to: Pt): Pt[] {
  const loc = pts.map((q) => { const l = toGrid(g, q); return [Math.round(l[0]), Math.round(l[1])] as Pt; }), t0 = toGrid(g, to), t: Pt = [Math.round(t0[0]), Math.round(t0[1])];
  const out = loc.map((q) => [...q] as Pt);
  for (const nb of [k - 1, k + 1]) {
    if (nb < 0 || nb >= loc.length) continue;
    if (loc[nb][0] === loc[k][0] && loc[nb][1] !== loc[k][1]) out[nb][0] = t[0];
    else if (loc[nb][1] === loc[k][1]) out[nb][1] = t[1];
  }
  out[k] = t;
  return out.map((q) => fromGrid(g, q));
}

/** A route's place and shape, as following it needs them (segs: its pieces). */
export interface PlacedRoute { x: number; y: number; heading: number; segs: { kind: string; angle?: number }[] }
/**
 * How tracks moved between before and after, if they all moved as one and none changed shape: moved, turned, or
 * mirrored together (each track's own move worked out from its start and heading, a mirrored one by its curves
 * turning the other way; all must agree). Returns where a point of the plan went; undefined: they didn't move, or
 * not together, or one was reshaped (a cut path between them then stays where it is).
 */
export function sharedMove(before: PlacedRoute[], after: PlacedRoute[]): ((q: Pt) => Pt) | undefined {
  if (!before.length || before.length !== after.length) return undefined;
  const rot = (q: Pt, deg: number): Pt => { const a = (deg * Math.PI) / 180; return [q[0] * Math.cos(a) - q[1] * Math.sin(a), q[0] * Math.sin(a) + q[1] * Math.cos(a)]; };
  const maps = (o: PlacedRoute, n: PlacedRoute): ((q: Pt) => Pt)[] => {
    const out: ((q: Pt) => Pt)[] = [], js = JSON.stringify(n.segs);
    if (JSON.stringify(o.segs) === js) out.push((q) => { const r = rot([q[0] - o.x, q[1] - o.y], n.heading - o.heading); return [n.x + r[0], n.y + r[1]]; });
    if (JSON.stringify(o.segs.map((sg) => (sg.angle !== undefined ? { ...sg, angle: -sg.angle } : sg))) === js) out.push((q) => { const l = rot([q[0] - o.x, q[1] - o.y], -o.heading), r = rot([-l[0], l[1]], n.heading); return [n.x + r[0], n.y + r[1]]; });
    return out;
  };
  const probes: Pt[] = [[0, 0], [100, 37]], agree = (f: (q: Pt) => Pt, h: (q: Pt) => Pt) => probes.every((q) => { const a = f(q), b = h(q); return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3; });
  const all = before.map((o, k) => maps(o, after[k]));
  const f = all[0].find((c) => all.every((ms) => ms.some((h) => agree(c, h))));
  return f && !agree(f, (q) => q) ? f : undefined;
}
