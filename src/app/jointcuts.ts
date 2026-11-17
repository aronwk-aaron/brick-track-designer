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
/** A cut at a joint between two tracks: where the joint is, and the cut's corners (mm). */
export interface JointCut { id: string; at: Pt; pts: Pt[] }

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
 * the pose there heading out of route i into route k. Not where three ends or more meet (points: a switch's toe).
 */
export function routeJoints(routes: Route[]): { i: number; k: number; P: Pose }[] {
  const ends = routes.flatMap((rt, r) => (rt.segments.length ? endsOf(rt).map((P) => ({ r, P })) : []));
  const out: { i: number; k: number; P: Pose }[] = [];
  ends.forEach((a, n) => {
    const here = ends.filter((b) => Math.hypot(b.P[0] - a.P[0], b.P[1] - a.P[1]) < 0.5);
    if (here.length !== 2) return;
    const b = here.find((e) => e !== a)!;
    if (ends.indexOf(b) < n || b.r === a.r || cosd(b.P[2] - a.P[2]) > -0.9998) return;
    out.push({ i: a.r, k: b.r, P: a.P });
  });
  return out;
}

/**
 * Which routes are one piece of trackwork (a number each, the same for routes of one piece): routes that cross, and
 * routes that part at points (the same place and heading at an end of each, or one's end on the other's line, along
 * it). Routes that only meet end to end are pieces apart: that's where the joints are.
 */
export function trackGroups(routes: Route[]): number[] {
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
  return routes.map((_, k) => find(k));
}

/**
 * The cuts at the joints where no ordinary track end can be made: the joints between two routes (routeJoints) whose
 * line square across the track there runs into another track's bed, or within near of it (mm: an end connector's
 * room). halves: how far each route's bed reaches each side of its centre line (mm). Each cut is the line square
 * across the track at the joint, each way from the joint to OVER past the bed's edge; or, where it meets another
 * track's bed first, to that bed's edge and along it: towards the side of the joint that isn't one piece with that
 * track (trackGroups), for as long as that side's bed lies against the edge: on along the next track's edge where
 * that track runs on into one end to end, else round its end if the bed lies against that too. Only the bed of a track that's one piece with either side turns it. A joint that is
 * on another track's bed itself has no cut. Ids j1, j2, … in the joints' order.
 */
export function jointCuts(routes: Route[], halves: number[], near = 12): JointCut[] {
  const joints = routeJoints(routes), group = trackGroups(routes), out: JointCut[] = [];
  const inStrip = (j: number, q: Pt, grow = 0) => Math.abs(routeLat(routes[j], q)) < halves[j] + grow;
  joints.forEach(({ i, k, P }, n) => {
    const J: Pt = [P[0], P[1]], nr: Pt = [cosd(P[2]), sind(P[2])], tg: Pt = [-sind(P[2]), cosd(P[2])], hw = Math.max(halves[i], halves[k]);
    const others = routes.map((_, j) => j).filter((j) => j !== i && j !== k && routes[j].segments.length > 0);
    const at = (sd: number, u: number): Pt => [J[0] + sd * u * nr[0], J[1] + sd * u * nr[1]];
    if (others.some((j) => inStrip(j, J, -0.01))) return;
    // (is it a joint the build can make as an ordinary end: its bed there, and a connector's room either side, clear of every other bed)
    const clear = [-10, 0, 10].every((ds) => [-1, 1].every((sd) => { for (let u = 0; u <= hw + 1e-9; u += 4) { const q = at(sd, u), p: Pt = [q[0] + ds * tg[0], q[1] + ds * tg[1]]; if (others.some((j) => inStrip(j, p, near - 10))) return false; } return true; }));
    if (clear) return;
    const side = (sd: number): Pt[] => {
      // (out from the joint to the bed's edge, or to where another track's bed begins)
      let hit = -1, u0 = 0, u1 = hw + OVER;
      // (a track that's one piece with either side of the joint: a third piece's bed reaching onto this track's own isn't in its way)
      const mates = others.filter((j) => group[j] === group[i] || group[j] === group[k]);
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
          const nx = joints.find((jn) => (jn.i === cur || jn.k === cur) && Math.hypot(jn.P[0] - pe[0], jn.P[1] - pe[1]) < 0.5), nxt = nx ? (nx.i === cur ? nx.k : nx.i) : -1;
          if (nxt >= 0 && nxt !== i && nxt !== k && Math.abs(halves[nxt] - halves[cur]) < 0.01) {
            const rn = routes[nxt], atStart = Math.hypot(rn.start[0] - pe[0], rn.start[1] - pe[1]) < 0.5, ahead: Pt = [corner[0] - sind(pe[2]) * dir, corner[1] + cosd(pe[2]) * dir];
            cur = nxt; rj = rn; Lj = routeLength(rn); s = atStart ? 0 : Lj; dir = atStart ? 1 : -1; tau = Math.sign(routeLat(rn, ahead)) || tau;
            continue;
          }
          // (else round its corner and along its end, as far as the other piece's bed lies against that too)
          const ox = -sind(pe[2]) * dir * 0.5, oy = cosd(pe[2]) * dir * 0.5;
          let last: Pt | undefined;
          for (let v = 0.5; v <= 2 * halves[cur]; v += 0.5) { const e = railPoint(rj, se, tau * (halves[cur] - v)); if (!far.some((f) => inStrip(f, [e[0] + ox, e[1] + oy], 0.25))) break; last = railPoint(rj, se, tau * (halves[cur] - v - OVER)); }
          if (last) pts.push(last);
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
    };
    const a = side(-1), b = side(1);
    out.push({ id: `j${n + 1}`, at: J, pts: tidyLine([...a.reverse(), ...b]) });
  });
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
