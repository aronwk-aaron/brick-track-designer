// Cuts where a design's tracks join end to end inside trackwork (Settings › Cutting: Cut where tracks join in trackwork).
// Two tracks drawn end to end are one track to the build, cut where an ordinary track end can be made: clear of every
// other track's bed. A set of crossings chained from its pieces (a star crossing, a T-junction) has its pieces' joints
// where no ordinary end fits: on a slanted track a stud or two from the track it has just crossed. There the build
// made one part of them all, too big for the bed. These cuts are worked out from the design, not drawn: at each such
// joint, square across that track, from the open one side to the open the other; where the line runs into the bed
// of another track first, it turns and goes along that bed's edge, as far as the two pieces touch. Pure geometry, on
// the tracks' beds as bands (each route's centre line and how far its bed reaches each side); the build cuts along
// them (geom/pathsplit.ts cutOnKerfs), and leaves out the ones that part nothing.
import { type Pose, type Route, railPoint, routeLat, routeLength, routePose, routeSOf } from '../route/route';

type Pt = [number, number];
/** A cut at a joint between two tracks: where the joint is, and the cut's corners (mm). more: the other joints it's the cut of too (a switch's tracks each joined beside the other: one cut across them all). */
export interface JointCut { id: string; at: Pt; pts: Pt[]; more?: Pt[];
  /** the joints of it at a toe (the next piece begins with its points there): each one's place and the heading on into the points (mm, degrees) */
  toes?: Pose[] }

/** (mm) How far past the bed's edge a cut that ends in the open is carried; how far along another track's bed edge a cut follows it at most. */
const OVER = 0.6, FOLLOW_MAX = 128;

const sind = (d: number) => Math.sin((d * Math.PI) / 180), cosd = (d: number) => Math.cos((d * Math.PI) / 180);

/** How far q is from the stretch a-b. */
const segDist = (q: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, k = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(q[0] - a[0] - k * dx, q[1] - a[1] - k * dy);
};

/** A route's two ends, each with the heading out of the route there. */
const endsOf = (rt: Route): Pose[] => { const e = routePose(rt, routeLength(rt)); return [[rt.start[0], rt.start[1], rt.start[2] + 180], e]; };

/**
 * Where two different routes meet end to end, in line (within half a mm and about a degree): each joint once, with
 * the pose there heading out of route i into route k. Not where three ends or more meet (points: a switch's toe);
 * toes: those too, after the others: a track's end with two or more tracks setting out from it the same way (the next
 * piece begins with its points, at their toe), out of that track (i) into the first of them (k; also: the rest).
 */
export function routeJoints(routes: Route[], toes = false): { i: number; k: number; P: Pose; also?: number[] }[] {
  const ends = routes.flatMap((rt, r) => (rt.segments.length ? endsOf(rt).map((P) => ({ r, P })) : []));
  const out: { i: number; k: number; P: Pose; also?: number[] }[] = [], atToes: typeof out = [];
  ends.forEach((a, n) => {
    const here = ends.filter((b) => Math.hypot(b.P[0] - a.P[0], b.P[1] - a.P[1]) < 0.5);
    if (here.length > 2) {
      // (a toe: this end alone one way, every other the other way, each of another track)
      const rest = here.filter((e) => e !== a);
      if (toes && rest.every((e) => e.r !== a.r && cosd(e.P[2] - a.P[2]) < -0.9998) && new Set(rest.map((e) => e.r)).size === rest.length) atToes.push({ i: a.r, k: rest[0].r, P: a.P, also: rest.slice(1).map((e) => e.r) });
      return;
    }
    if (here.length !== 2) return;
    const b = here.find((e) => e !== a)!;
    if (ends.indexOf(b) < n || b.r === a.r || cosd(b.P[2] - a.P[2]) > -0.9998) return;
    out.push({ i: a.r, k: b.r, P: a.P });
  });
  return [...out, ...atToes];
}

/**
 * Which routes are one piece of trackwork (a number each, the same for routes of one piece): routes that cross, and
 * routes that part at points (the same place and heading at an end of each, or one's end on the other's line, along
 * it). Routes that only meet end to end are pieces apart: that's where the joints are.
 */
export function trackGroups(routes: Route[], halves?: number[]): number[] {
  const parent = routes.map((_, k) => k), find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  const lines = routes.map((rt) => { const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 2)); return Array.from({ length: n + 1 }, (_, k) => { const p = routePose(rt, (L * k) / n); return [p[0], p[1]] as Pt; }); });
  const boxes = lines.map((ps) => [Math.min(...ps.map((q) => q[0])), Math.min(...ps.map((q) => q[1])), Math.max(...ps.map((q) => q[0])), Math.max(...ps.map((q) => q[1]))]);
  const nearEnd = (r: number, q: Pt) => endsOf(routes[r]).some((e) => Math.hypot(e[0] - q[0], e[1] - q[1]) < 1);
  const crosses = (a: number, b: number) => {
    const A = lines[a], B = lines[b];
    for (let i = 0; i + 1 < A.length; i++) for (let j = 0; j + 1 < B.length; j++) {
      const p = A[i], r: Pt = [A[i + 1][0] - p[0], A[i + 1][1] - p[1]], q = B[j], s: Pt = [B[j + 1][0] - q[0], B[j + 1][1] - q[1]], den = r[0] * s[1] - r[1] * s[0];
      if (Math.abs(den) < 1e-9) continue;
      const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den, u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const x: Pt = [p[0] + t * r[0], p[1] + t * r[1]];
      if (!nearEnd(a, x) && !nearEnd(b, x)) return true;
    }
    return false;
  };
  // (parting at points: an end of a on b's line, heading along it, and not b's own end met end to end)
  const parts = (a: number, b: number) => endsOf(routes[a]).some((e) => {
    const q: Pt = [e[0], e[1]], lat = routeLat(routes[b], q);
    if (Math.abs(lat) > 1) return false;
    const s = routeSOf(routes[b], q), p = routePose(routes[b], s);
    if (Math.abs(sind(p[2] - e[2])) > 0.05) return false;
    // (end to end with b's own end: a joint, unless both head the same way out of it (two branches from one toe))
    const be = endsOf(routes[b]).find((f) => Math.hypot(f[0] - q[0], f[1] - q[1]) < 0.5);
    return be ? cosd(be[2] - e[2]) > 0.9998 : true;
  });
  for (let a = 0; a < routes.length; a++) for (let b = a + 1; b < routes.length; b++) {
    if (!routes[a].segments.length || !routes[b].segments.length || find(a) === find(b)) continue;
    if (boxes[a][0] > boxes[b][2] + 1 || boxes[b][0] > boxes[a][2] + 1 || boxes[a][1] > boxes[b][3] + 1 || boxes[b][1] > boxes[a][3] + 1) continue;
    if (parts(a, b) || parts(b, a) || crosses(a, b)) parent[find(a)] = find(b);
  }
  // (joints beside each other on each other's beds, a switch's tracks each joined to the next piece's: one cut across
  // them all, so the tracks on each side of it are one piece: the switch's base, and the section that carries them on)
  if (halves) {
    const joints = routeJoints(routes, true);
    for (const cl of jointClusters(routes, halves, joints)) for (const n of cl.slice(1)) {
      const a = joints[cl[0]], b = joints[n], same = cosd(b.P[2] - a.P[2]) > 0;
      parent[find(a.i)] = find(same ? b.i : b.k);
      parent[find(a.k)] = find(same ? b.k : b.i);
    }
  }
  return routes.map((_, k) => find(k));
}

/**
 * The joints (routeJoints) that lie beside each other, each on the bed of a track of the other: a switch's straight
 * and branch each joined to the next piece's a little apart (a kit's base and its detachable section). Each set of
 * two or more, the joints' numbers in order across the tracks. halves: how far each route's bed reaches each side (mm).
 */
export function jointClusters(routes: Route[], halves: number[], joints = routeJoints(routes, true)): number[][] {
  const on = (j: number, q: Pt) => Math.abs(routeLat(routes[j], q)) < halves[j] - 0.01;
  const parent = joints.map((_, n) => n), find = (n: number): number => (parent[n] === n ? n : (parent[n] = find(parent[n])));
  for (let a = 0; a < joints.length; a++) for (let b = a + 1; b < joints.length; b++) {
    const A = joints[a], B = joints[b], ja: Pt = [A.P[0], A.P[1]], jb: Pt = [B.P[0], B.P[1]];
    if (new Set([A.i, A.k, ...(A.also ?? []), B.i, B.k, ...(B.also ?? [])]).size < 4 + (A.also?.length ?? 0) + (B.also?.length ?? 0) || Math.abs(cosd(B.P[2] - A.P[2])) < 0.5) continue;
    if ((on(B.i, ja) || on(B.k, ja)) && (on(A.i, jb) || on(A.k, jb))) parent[find(a)] = find(b);
  }
  const sets = new Map<number, number[]>();
  joints.forEach((_, n) => sets.set(find(n), [...(sets.get(find(n)) ?? []), n]));
  return [...sets.values()].filter((g) => g.length > 1).map((g) => {
    const f = joints[g[0]].P, across = (n: number) => (joints[n].P[0] - f[0]) * cosd(f[2]) + (joints[n].P[1] - f[1]) * sind(f[2]);
    return [...g].sort((p, q) => across(p) - across(q));
  });
}

/**
 * The cuts at the joints where no ordinary track end can be made: the joints between two routes (routeJoints) whose
 * line square across the track there runs into another track's bed, or within near of it (mm: an end connector's
 * room). halves: how far each route's bed reaches each side of its centre line (mm). Each cut is the line square
 * across the track at the joint, each way from the joint to OVER past the bed's edge; or, where it meets another
 * track's bed first, to that bed's edge and along it: towards the side of the joint that isn't one piece with that
 * track (trackGroups), for as long as that side's bed lies against the edge: on along the next track's edge where
 * that track runs on into one end to end, else round its end if the bed lies against that too. Only the bed of a track that's one piece with either side turns it. A joint that is
 * on another track's bed itself has no cut of its own; with that track's own joint beside it, on this one's bed
 * (jointClusters: a switch's straight and branch each joined to the next piece's, a kit's base and its detachable
 * section), the two have one cut: square across each track at its own joint, the two lines meeting between them
 * (clusterCut); so too a joint at a toe (the next piece's points begin there) with a joint beside it. Ids j1, j2, … in
 * the joints' order.
 */
export function jointCuts(routes: Route[], halves: number[], near = 12): JointCut[] {
  // (the joints at toes after the others, and only cut with a joint beside them: the others' numbers, and so their cuts' ids, as ever)
  const joints = routeJoints(routes, true), plain = joints.filter((j) => !j.also), group = trackGroups(routes, halves), out: JointCut[] = [];
  const clusters = jointClusters(routes, halves, joints);
  const inStrip = (j: number, q: Pt, grow = 0) => Math.abs(routeLat(routes[j], q)) < halves[j] + grow;
  /** A joint's cut from the joint out one way (sd), to the open or along another track's bed; skip: the tracks whose beds don't turn it (the joints cut with it). */
  const sideOf = (n: number, sd: number, skip: number[] = []): Pt[] => {
    const { i, k, P } = joints[n];
    const J: Pt = [P[0], P[1]], nr: Pt = [cosd(P[2]), sind(P[2])], tg: Pt = [-sind(P[2]), cosd(P[2])], hw = Math.max(halves[i], halves[k]);
    const others = routes.map((_, j) => j).filter((j) => j !== i && j !== k && routes[j].segments.length > 0);
    const at = (sd2: number, u: number): Pt => [J[0] + sd2 * u * nr[0], J[1] + sd2 * u * nr[1]];
    {
      // (out from the joint to the bed's edge, or to where another track's bed begins)
      let hit = -1, u0 = 0, u1 = hw + OVER;
      // (a track that's one piece with either side of the joint: a third piece's bed reaching onto this track's own isn't in its way)
      const mates = others.filter((j) => !skip.includes(j) && (group[j] === group[i] || group[j] === group[k]));
      for (let u = 0.25; u <= hw + OVER + 1e-9 && hit < 0; u += 0.25) { const j = mates.find((j2) => inStrip(j2, at(sd, u), -0.01)); if (j !== undefined) { hit = j; u1 = u; } else u0 = u; }
      if (hit < 0) return [at(sd, hw + OVER)];
      for (let it = 0; it < 30; it++) { const m = (u0 + u1) / 2; if (inStrip(hit, at(sd, m), -0.01)) u1 = m; else u0 = m; }
      const c = at(sd, u0), far = routes.map((_, j) => j).filter((j) => j !== hit && group[j] === (group[hit] === group[i] ? group[k] : group[i]));
      // (along that bed's edge: towards the piece across the joint from the one this track is part of)
      const w: Pt = group[hit] === group[i] ? tg : [-tg[0], -tg[1]];
      let cur = hit, rj = routes[cur], Lj = routeLength(rj), tau = Math.sign(routeLat(rj, at(sd, u1))) || 1, s = routeSOf(rj, c);
      const h0 = routePose(rj, s)[2], dot = -sind(h0) * w[0] + cosd(h0) * w[1];
      if (Math.abs(dot) < 0.1) return [c];
      let dir = Math.sign(dot);
      const pts: Pt[] = [c];
      for (let d = 1; d <= FOLLOW_MAX; d += 1) {
        s += dir;
        if (s <= 0 || s >= Lj) {
          const se = Math.max(0, Math.min(Lj, s)), pe = routePose(rj, se), corner = railPoint(rj, se, tau * halves[cur]);
          pts.push(corner);
          // (that track's own end. Where it runs on into the next track, end to end: on along that one's edge)
          const nx = plain.find((jn) => (jn.i === cur || jn.k === cur) && Math.hypot(jn.P[0] - pe[0], jn.P[1] - pe[1]) < 0.5), nxt = nx ? (nx.i === cur ? nx.k : nx.i) : -1;
          // (and along its end as far as the other piece's bed lies against that: past the end it lies on the next track's
          // bed, or on nothing)
          const ox = -sind(pe[2]) * dir * 0.5, oy = cosd(pe[2]) * dir * 0.5;
          let last: Pt | undefined;
          for (let v = 0.5; v <= 2 * halves[cur]; v += 0.5) { const e = railPoint(rj, se, tau * (halves[cur] - v)); if (!far.some((f) => inStrip(f, [e[0] + ox, e[1] + oy], 0.25))) break; last = railPoint(rj, se, tau * (halves[cur] - v - OVER)); }
          if (last) pts.push(last);
          if (nxt >= 0 && nxt !== i && nxt !== k && Math.abs(halves[nxt] - halves[cur]) < 0.01) {
            if (last) pts.push(corner);
            const rn = routes[nxt], atStart = Math.hypot(rn.start[0] - pe[0], rn.start[1] - pe[1]) < 0.5, ahead: Pt = [corner[0] - sind(pe[2]) * dir, corner[1] + cosd(pe[2]) * dir];
            cur = nxt; rj = rn; Lj = routeLength(rn); s = atStart ? 0 : Lj; dir = atStart ? 1 : -1; tau = Math.sign(routeLat(rn, ahead)) || tau;
            continue;
          }
          break;
        }
        const o = railPoint(rj, s, tau * (halves[cur] + 0.5)), e = railPoint(rj, s, tau * halves[cur]);
        // (where an earlier joint's cut runs along this edge already: that far, no further)
        const hd = routePose(rj, s)[2], along = (p: Pt, q: Pt) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return l > 1e-6 && Math.abs((-sind(hd) * (q[1] - p[1]) - cosd(hd) * (q[0] - p[0])) / l) < 0.1; };
        if (out.some((c2) => c2.pts.some((q, m) => m > 0 && along(c2.pts[m - 1], q) && segDist(e, c2.pts[m - 1], q) < 0.3))) break;
        pts.push(e);
        if (!far.some((f) => inStrip(f, o, 0.25))) break;
      }
      return pts;
    }
  };
  joints.forEach(({ i, k, P }, n) => {
    const J: Pt = [P[0], P[1]], nr: Pt = [cosd(P[2]), sind(P[2])], tg: Pt = [-sind(P[2]), cosd(P[2])], hw = Math.max(halves[i], halves[k]);
    const others = routes.map((_, j) => j).filter((j) => j !== i && j !== k && routes[j].segments.length > 0);
    const at = (sd: number, u: number): Pt => [J[0] + sd * u * nr[0], J[1] + sd * u * nr[1]];
    if (others.some((j) => inStrip(j, J, -0.01))) {
      // (on another track's bed. With that track's own joint beside it, on this one's bed (a switch's two tracks, each
      // joined to the next piece's): one cut across them all, done at the first of them)
      const cl = clusters.find((c) => c.includes(n));
      if (!cl || Math.min(...cl) !== n) return;
      const pts = clusterCut(cl);
      const toes = cl.filter((m) => joints[m].also).map((m) => joints[m].P);
      if (pts) out.push({ id: `j${n + 1}`, at: J, pts, more: cl.filter((m) => m !== n).map((m): Pt => [joints[m].P[0], joints[m].P[1]]), ...(toes.length > 0 && { toes }) });
      return;
    }
    // (is it a joint the build can make as an ordinary end: its bed there, and a connector's room either side, clear of every other bed)
    const clear = [-10, 0, 10].every((ds) => [-1, 1].every((sd) => { for (let u = 0; u <= hw + 1e-9; u += 4) { const q = at(sd, u), p: Pt = [q[0] + ds * tg[0], q[1] + ds * tg[1]]; if (others.some((j) => inStrip(j, p, near - 10))) return false; } return true; }));
    if (clear) return;
    const a = sideOf(n, -1), b = sideOf(n, 1);
    out.push({ id: `j${n + 1}`, at: J, pts: tidyLine([...a.reverse(), ...b]) });
  });
  /**
   * One cut across joints beside each other (jointClusters, in order across the tracks): from the first one's outer
   * end square across its track, on to where its line meets the next joint's line, and so on, out square across the
   * last one's track to its outer end. Where two lines don't meet between their joints (the tracks side by side,
   * the joints a little apart along them): a step along the track half way between the two.
   */
  function clusterCut(cl: number[]): Pt[] | undefined {
    const J = (n: number): Pt => [joints[n].P[0], joints[n].P[1]], nr = (n: number): Pt => [cosd(joints[n].P[2]), sind(joints[n].P[2])];
    const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1], sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]], crs = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
    const skip = cl.flatMap((n) => [joints[n].i, joints[n].k, ...(joints[n].also ?? [])]), first = cl[0], last = cl[cl.length - 1];
    const pts: Pt[] = [...sideOf(first, -(Math.sign(dot(sub(J(cl[1]), J(first)), nr(first))) || 1), skip).reverse(), J(first)];
    for (let m = 0; m + 1 < cl.length; m++) {
      const a = cl[m], b = cl[m + 1], ja = J(a), jb = J(b), na = nr(a), nb = nr(b), d = sub(jb, ja), den = crs(na, nb);
      const ha = Math.max(halves[joints[a].i], halves[joints[a].k]), hb = Math.max(halves[joints[b].i], halves[joints[b].k]);
      const ua = Math.abs(den) > 1e-6 ? crs(d, nb) / den : Infinity, ub = Math.abs(den) > 1e-6 ? crs(d, na) / den : Infinity;
      // (the lines meet between the two joints: on each line, from its joint towards the other, no further than its bed reaches)
      if (ua * dot(d, na) >= -1e-9 && Math.abs(ua) <= ha && -ub * dot(d, nb) >= -1e-9 && Math.abs(ub) <= hb) pts.push([ja[0] + ua * na[0], ja[1] + ua * na[1]]);
      else {
        const mid: Pt = [(ja[0] + jb[0]) / 2, (ja[1] + jb[1]) / 2], va = dot(sub(mid, ja), na), vb = dot(sub(mid, jb), nb);
        pts.push([ja[0] + va * na[0], ja[1] + va * na[1]], [jb[0] + vb * nb[0], jb[1] + vb * nb[1]]);
      }
      pts.push(jb);
    }
    pts.push(...sideOf(last, -(Math.sign(dot(sub(J(cl[cl.length - 2]), J(last)), nr(last))) || 1), skip));
    return tidyLine(pts);
  }
  return out;
}

/** A line of points with those in a straight line between their neighbours left out (to a hundredth of a mm), rounded to a thousandth. */
function tidyLine(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const q of pts) {
    while (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1], l = Math.hypot(q[0] - a[0], q[1] - a[1]);
      if (l > 1e-9 && Math.abs(((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / l) < 0.01 && (b[0] - a[0]) * (q[0] - b[0]) + (b[1] - a[1]) * (q[1] - b[1]) >= 0) out.pop(); else break;
    }
    if (!out.length || Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) > 1e-6) out.push(q);
  }
  return out.map((q) => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000]);
}

/**
 * The cut (its place in the list) whose line p is nearest, within reach of it (the plan: p, the cuts' corners and
 * reach in one unit); undefined: none that near. For a press on the plan to say what the line under it is.
 */
export function jointCutNear(cuts: { pts: Pt[] }[], p: Pt, reach: number): number | undefined {
  let best: number | undefined, bd = reach;
  cuts.forEach((c, n) => { for (let k = 0; k + 1 < c.pts.length; k++) { const d = segDist(p, c.pts[k], c.pts[k + 1]); if (d <= bd) { bd = d; best = n; } } });
  return best;
}
