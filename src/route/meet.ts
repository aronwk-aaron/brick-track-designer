// Track ends that join, made to join exactly. A design's poses are kept rounded, and a track worked out from one joint
// reaches the next a hair off: in 'Wide switched parallel curve section with three ends' 0.0006 mm, in 'Yard R148, three
// tracks, right' 0.0002 degrees. Two end faces that far apart are a slit across the whole bed, finer than a file can
// hold: the kernel joined it one way or the other by the order the solids came in, and a part's mesh, read back in for
// the next cut, closed it up as another shape (a hole through the bed, a wedge of it gone, a wall across the hollow).
// Done once, where the design's routes are made (design.ts toRoutes), so every section, tile and cut has each track
// where the others have it. Inside only: the design itself, what the page draws from it and its file keep their poses.
import { hasRoll, poseToWorld, routeLength, routePose, worldToPose, type Pose, type Route } from './route';

/** (mm) Route ends nearer than this, leaving the place opposite ways (one runs on from the other) or the same way (a switch's two from its toe), are one joint. */
const MEET = 0.01;
/** (mm) The furthest a route is moved, at either end: the rounding of a kept pose, and what a turn within it comes to at the far end. More is a joint laid out so (a switch off its stud grid to meet a curve). */
const MEET_MOVE = 0.01;
const STUD = 8;

/**
 * The routes with their joints met exactly: each moved (and turned onto the line) onto the one it joins that was placed
 * first. Which ones: of `ok` (the train track's, with segments); a banked one, the first, and any with an end on the
 * stud grid (the first's, or the half-stud grid) stay where they are: their end connectors' undersides and studs are
 * placed by it, to a millionth (moved a hair off it, 'Modular triple crossover R40' had 4 studs fewer). A route that would
 * go further than MEET_MOVE, or come away from another joint it makes, stays as it is; turned only where it stays within.
 */
export function meetRoutes(routes: Route[], ok: (i: number) => boolean = () => true): Route[] {
  const idx = routes.flatMap((rt, i) => (ok(i) && rt.segments.length ? [i] : []));
  if (idx.length < 2) return routes;
  const endsOf = (rt: Route): [Pose, Pose] => [routePose(rt, 0), routePose(rt, routeLength(rt))];
  const was = new Map(idx.map((i) => [i, endsOf(routes[i])])), now = new Map(was);
  const turn = (a: number) => ((a % 360) + 540) % 360 - 180;
  const near = (p: Pose, q: Pose) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  // (the joints: ends within MEET, found by a grid of MEET-sized cells)
  const cells = new Map<string, { i: number; m: number }[]>();
  const cell = (p: Pose) => [Math.floor(p[0] / MEET), Math.floor(p[1] / MEET)];
  for (const i of idx) for (const m of [0, 1]) { const [cx, cy] = cell(was.get(i)![m]), k = `${cx},${cy}`; cells.set(k, [...(cells.get(k) ?? []), { i, m }]); }
  const joints = new Map<number, { m: number; j: number; n: number; opp: boolean }[]>(idx.map((i) => [i, []]));
  let any = false;
  for (const i of idx) for (const m of [0, 1]) {
    const e = was.get(i)![m], [cx, cy] = cell(e), leave = m ? e[2] + 180 : e[2];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const { i: j, m: n } of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
      if (j === i) continue;
      const f = was.get(j)![n], d = Math.abs(turn((n ? f[2] + 180 : f[2]) - leave));
      if (near(e, f) < MEET && (d > 179.5 || d < 0.5)) { joints.get(i)!.push({ m, j, n, opp: d > 179.5 }); if (near(e, f) > 1e-9 || Math.abs(turn(e[2] - f[2])) % 180 > 1e-9) any = true; }
    }
  }
  if (!any) return routes;
  const out = [...routes];
  const G = routes[idx[0]].start, mod = (v: number, md: number) => { const e = ((v % md) + md) % md; return Math.min(e, md - e) < 1e-6; };
  const fixed = (i: number) => i === idx[0] || hasRoll(routes[i]) || [routes[i].start[0], routes[i].start[1]].every((v) => mod(v, 4))
    || was.get(i)!.some((e) => [-4, 4].some((dy) => [4, 12].every((lx) => worldToPose(G, poseToWorld(e, [lx, dy])).every((v) => mod(v - 4, STUD)))));
  const placed = new Set(idx.filter(fixed)), queue = [...placed];
  const place = (i: number, m: number, f: Pose) => {
    const e = now.get(i)![m], d0 = turn(f[2] - e[2]), dh = Math.abs(d0) < 90 ? d0 : turn(d0 + 180), L = routeLength(out[i]);
    if (near(e, f) <= 1e-9 && !(Math.abs(dh) > 1e-9 && Math.abs(dh) * L < 0.6)) return;
    const moved = (a: number): Route => {
      const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180), st = out[i].start, dx = st[0] - e[0], dy = st[1] - e[1];
      return { ...out[i], start: [f[0] + dx * c - dy * sn, f[1] + dx * sn + dy * c, st[2] + a] };
    };
    // (and no end run into the next track's, end to end, where it wasn't: a gap left as it was, not closed past the
    // other's end. A loop of pieces whose joints don't all close (the 'T-junction R40 and R56' set's, 0.008 mm apart)
    // had two parts overlapping by that much at the one left)
    const gap = (p: Pose, k: number, f2: Pose) => { const h = ((k ? p[2] : p[2] + 180) * Math.PI) / 180; return (f2[0] - p[0]) * -Math.sin(h) + (f2[1] - p[1]) * Math.cos(h); };
    const fits = (rt: Route) => { const q = endsOf(rt); return q.every((p, k) => near(p, was.get(i)![k]) <= MEET_MOVE) && joints.get(i)!.every(({ m: k, j, n, opp }) => near(q[k], now.get(j)![n]) < MEET
      && (!opp || gap(q[k], k, now.get(j)![n]) >= Math.min(0, gap(was.get(i)![k], k, was.get(j)![n])) - 1e-9)); };
    const rt = [Math.abs(dh) * L < 0.6 ? dh : 0, 0].map(moved).find(fits);
    if (rt) { out[i] = rt; now.set(i, endsOf(rt)); }
  };
  for (;;) {
    if (!queue.length) { const i = idx.find((k) => !placed.has(k)); if (i === undefined) break; placed.add(i); queue.push(i); }
    const j = queue.shift()!;
    // (each route joined to j not placed yet, in order: onto j's end there)
    const next = idx.flatMap((i) => (placed.has(i) ? [] : joints.get(i)!.filter((jt) => jt.j === j).slice(0, 1).map((jt) => ({ i, ...jt }))));
    for (const { i, m, n } of next) { if (placed.has(i)) continue; place(i, m, now.get(j)![n]); placed.add(i); queue.push(i); }
  }
  return out;
}
