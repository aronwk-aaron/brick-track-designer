// Hand cuts across a track, for the build (the editor's side is routecuts.ts): a design's cuts by where they are on
// the ground, and from that each of the build's routes' own. By place, not by route: the build turns routes round,
// and builds a switch's stretches apart from the track between; and the cuts are kept off the solver's routes, so
// moving one rebuilds only the pieces either side of it, not the trackwork they'd all be keyed by.
import { type Design, isMono, toRoutes } from './design';
import { liveCuts } from './routecuts';
import type { HandCuts } from './sections';
import { type Pose, type Route, routeLength, routePose, routeSOf } from '../route/route';
import { gridPath, type Grid, type NoCut, pathProblem, type PathFault } from './cutpaths';
import type { HandPath } from '../geom/pathsplit';

/** A design's hand cuts: each one's route (its name, for what's said of it) and place (mm); and the routes cut by hand only. */
export interface DesignCuts { cuts: { name: string; at: [number, number] }[]; only: Route[] }

/** The hand cuts of a design's train track (undefined: it has none, and no route cut by hand only: the build is as it always was). */
export function designCuts(d: Design): DesignCuts | undefined {
  if (!d.routes.some((r) => !isMono(r) && (r.cuts?.length || r.cutsLocked))) return undefined;
  const rts = toRoutes(d), out: DesignCuts = { cuts: [], only: [] };
  d.routes.forEach((r, i) => {
    if (isMono(r) || !r.segs.length) return;
    for (const c of liveCuts(r)) { const q = routePose(rts[i], c * 8); out.cuts.push({ name: r.name || `route ${i + 1}`, at: [q[0], q[1]] }); }
    if (r.cutsLocked) out.only.push(rts[i]);
  });
  return out;
}

/** How far off route rt's centre line q is (mm), and where along it. */
const onRoute = (rt: Route, q: [number, number]) => { const s = routeSOf(rt, q), p = routePose(rt, s); return { s, off: Math.hypot(p[0] - q[0], p[1] - q[1]) }; };

/**
 * The hand cuts of the routes being cut into pieces (all: the build's own, whole routes or the stretches between
 * switches built apart): each route's, mm along it (rounded to a thousandth), and whether it's cut by hand only (its
 * middle is on such a route's track). lost: the cuts on none of them (in a switch built on its own).
 */
export function handCutsFor(dc: DesignCuts, all: Route[]): { hand: (HandCuts | undefined)[]; lost: DesignCuts['cuts'] } {
  const hand: (HandCuts | undefined)[] = all.map((rt) => {
    const m = routePose(rt, routeLength(rt) / 2);
    return dc.only.some((lr) => onRoute(lr, [m[0], m[1]]).off < 0.05) ? { cuts: [], only: true } : undefined;
  });
  const lost: DesignCuts['cuts'] = [];
  for (const c of dc.cuts) {
    let found = false;
    for (let i = 0; i < all.length && !found; i++) {
      const { s, off } = onRoute(all[i], c.at);
      if (off > 0.05) continue;
      (hand[i] ??= { cuts: [], only: false }).cuts.push(Math.round(s * 1000) / 1000);
      found = true;
    }
    if (!found) lost.push(c);
  }
  return { hand, lost };
}

/** Which of the build's joints (mm, its overlay's) are on route i of a design, studs along it (to a thousandth): for its card's Keep the cuts it has now. */
export function jointsOn(d: Design, i: number, joints: [number, number][]): number[] {
  const rt = toRoutes(d)[i];
  if (!rt?.segments.length) return [];
  return joints.flatMap((q) => { const { s, off } = onRoute(rt, q); return off < 0.05 ? [Math.round((s / 8) * 1000) / 1000] : []; });
}

/**
 * A design's cut paths for the build (undefined: it has none): each laid on the build's stud grid (gp, mm: a file's
 * corners a hair off it, or a path left behind by track since moved, are put on the nearest grid corners, so no cut
 * goes through a stud), in mm; the ones that can't be made (cutpaths.ts pathProblem: a blade, a frog, down a rail, a
 * sliver between two) left out and listed in refused, with why and where (studs). square: each end run that crosses a
 * branch at a slant turned square to it (squarePathEnds), after it's been checked on the grid.
 */
export function designPaths(d: Design, gp: Pose, routes: Route[], railG: number, no: NoCut, square = false): { cut: HandPath[]; refused: (PathFault & { id: string })[] } | undefined {
  const ps = d.expert?.cutPaths;
  if (!ps?.length) return undefined;
  const g: Grid = [gp[0] / 8, gp[1] / 8, gp[2]], laid = ps.map((p) => ({ ...p, pts: gridPath(g, p.pts) }));
  const cut: HandPath[] = [], refused: (PathFault & { id: string })[] = [], ok: typeof laid = [];
  for (const p of laid) {
    const why = pathProblem(p.pts, ok.map((q) => q.pts), { routes, railG, no });
    if (why) { refused.push({ id: p.id, ...why }); continue; }
    ok.push(p);
    const mm = p.pts.map((q): [number, number] => [q[0] * 8, q[1] * 8]);
    cut.push({ id: p.id, pts: square ? squarePathEnds(mm, routes) : mm, ...(p.joint && { joint: p.joint === 'flataxle' ? 'axle' as const : p.joint, flatRails: p.joint === 'flataxle' }) });
  }
  return { cut, refused };
}

/** Where route rt's centre line crosses the stretch a-b (mm): each crossing's distance along the route (s) and how far along a-b (0 to 1). Sampled a mm apart along the route, each crossing then found to a hundredth of a mm. */
export function routeCrossings(rt: Route, a: [number, number], b: [number, number]): { s: number; t: number }[] {
  const L = routeLength(rt), dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  if (!(L > 0) || !(l2 > 0)) return [];
  const side = (s: number) => { const p = routePose(rt, s); return (p[0] - a[0]) * dy - (p[1] - a[1]) * dx; };
  const along = (s: number) => { const p = routePose(rt, s); return ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; };
  const n = Math.max(1, Math.ceil(L)), out: { s: number; t: number }[] = [];
  let s0 = 0, f0 = side(0);
  if (f0 === 0) { const t = along(0); if (t >= 0 && t <= 1) out.push({ s: 0, t }); }
  for (let k = 1; k <= n; k++) {
    const s1 = (L * k) / n, f1 = side(s1);
    // (on the line at a sample itself: crossing there)
    if (f1 === 0) { const t = along(s1); if (t >= 0 && t <= 1) out.push({ s: s1, t }); }
    else if (f0 !== 0 && Math.sign(f0) !== Math.sign(f1)) {
      let lo = s0, hi = s1, flo = f0;
      while (hi - lo > 0.01) { const m = (lo + hi) / 2, fm = side(m); if (Math.sign(fm) === Math.sign(flo)) { lo = m; flo = fm; } else hi = m; }
      const s = (lo + hi) / 2, t = along(s);
      if (t >= 0 && t <= 1) out.push({ s, t });
    }
    s0 = s1; f0 = f1;
  }
  return out;
}

/** How far a track crossed at a slant may be off square to the run it's on, for that run's end to be turned square to it (degrees). */
const SQUARE_MAX = 30;

/**
 * (Settings › Cutting: Cut paths square to a branch) A cut path with each end run that crosses a track at a slant, first
 * from that end (a switch's branch, past where the path crosses the straight track square), turned square to that
 * track: from where it crosses the track's centre line, the same length, so the joint there is square to the branch as a
 * modular kit's sections' are. Left as drawn where the end run crosses no track, or crosses it square already (within
 * half a degree), or one more than SQUARE_MAX off square. mm.
 */
export function squarePathEnds(pts: [number, number][], routes: Route[]): [number, number][] {
  let out = pts.map((q) => [q[0], q[1]] as [number, number]);
  for (const end of [0, 1]) {
    if (end) out.reverse();
    const e = out[0], b = out[1], len = Math.hypot(b[0] - e[0], b[1] - e[1]), u: [number, number] = [(b[0] - e[0]) / len, (b[1] - e[1]) / len];
    let best: { t: number; rt: Route; s: number } | undefined;
    for (const rt of routes) for (const c of routeCrossings(rt, e, b)) if (!best || c.t < best.t) best = { t: c.t, rt, s: c.s };
    if (best) {
      const p = routePose(best.rt, best.s), h = (p[2] * Math.PI) / 180, tang: [number, number] = [-Math.sin(h), Math.cos(h)];
      // (how far off square the track is: the run's direction against the track's own)
      const off = (Math.asin(Math.min(1, Math.abs(u[0] * tang[0] + u[1] * tang[1]))) * 180) / Math.PI;
      if (off > 0.5 && off <= SQUARE_MAX) {
        const c: [number, number] = [p[0], p[1]], r = Math.hypot(e[0] - c[0], e[1] - c[1]);
        let m: [number, number] = [Math.cos(h), Math.sin(h)];
        if (m[0] * (e[0] - c[0]) + m[1] * (e[1] - c[1]) < 0) m = [-m[0], -m[1]];
        if (r > 1) out = [[c[0] + m[0] * r, c[1] + m[1] * r], c, ...out.slice(1)];
      }
    }
    if (end) out.reverse();
  }
  return out;
}
