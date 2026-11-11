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
 * sliver between two) left out and listed in refused, with why and where (studs).
 */
export function designPaths(d: Design, gp: Pose, routes: Route[], railG: number, no: NoCut): { cut: HandPath[]; refused: (PathFault & { id: string })[] } | undefined {
  const ps = d.expert?.cutPaths;
  if (!ps?.length) return undefined;
  const g: Grid = [gp[0] / 8, gp[1] / 8, gp[2]], laid = ps.map((p) => ({ ...p, pts: gridPath(g, p.pts) }));
  const cut: HandPath[] = [], refused: (PathFault & { id: string })[] = [], ok: typeof laid = [];
  for (const p of laid) {
    const why = pathProblem(p.pts, ok.map((q) => q.pts), { routes, railG, no });
    if (why) { refused.push({ id: p.id, ...why }); continue; }
    ok.push(p);
    cut.push({ id: p.id, pts: p.pts.map((q): [number, number] => [q[0] * 8, q[1] * 8]), ...(p.joint && { joint: p.joint === 'flataxle' ? 'axle' as const : p.joint, flatRails: p.joint === 'flataxle' }) });
  }
  return { cut, refused };
}
