// A route's extra rails: bridge guard rails and a dual-gauge third rail, as
// straight.scad / curves.scad lay them (track_lib.scad's guard_* and dual_*,
// extra_rails(), full_endpoint(…, xfs)), along any route.
//
// Everything is worked out along the route as drawn (Route.extra: from / to
// / len), so a route that's been cut up or turned round has them in the same
// places, its pointed and plain ends at the drawn route's start and end.
// Where another route comes within a sleeper length (a switch, a crossing,
// a track alongside) they're left out: the OpenSCAD files have no such case,
// and a third rail across another track would need flangeways of its own.
import type { ExtraRails, Route, RouteEnds } from '../route/route';
import { railPoint, routeLat, routeLength, routePose } from '../route/route';
import { R, T, type Man, type Scad, type Vec2 } from './scad';
import { sweepRoute } from './sweep';
import { PLATE_H, RAIL_PROFILE, STUD, type Track } from './track';

const V_IN = 10;          // guard_v_in: a point this far in from its end
const GUARD_HW = 3.0;     // guard_hw: the guard rail's half width above the bed, for keeping studs clear
const DUAL_END_IN = 2.3;  // dual_end_in: a third rail stops this far short of a plain end
const TAPER_N = 16;       // guard_taper_n: segments along each pointed end
const RAIL_IN = 3.9;      // rails with rail ends stop here, just into them (curves.scad's 3.9)

export const endsHas = (e: RouteEnds, atEnd: boolean) => e === 'both' || e === (atEnd ? 'end' : 'start');

/** Does a route have extra rails to build (a third rail only if its gauge is narrower)? */
export const hasExtraRails = (x: ExtraRails | undefined, gaugeStuds: number) => !!x && (x.guard || (x.dual && x.dualStuds < gaugeStuds));

/**
 * The stretches of route i (its own arc lengths) clear of every other route:
 * none of their centre lines within a sleeper length beside it. (A route
 * that runs on from its end isn't beside it.)
 */
export function clearStretches(routes: Route[], i: number, sleeperLen: number, step = 2): [number, number][] {
  const rt = routes[i], L = routeLength(rt), n = Math.max(1, Math.ceil(L / step));
  const boxes = routes.map((r2, j) => {
    if (j === i) return undefined;
    const L2 = routeLength(r2), m = Math.max(1, Math.ceil(L2 / 8)), b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let k = 0; k <= m; k++) { const p = routePose(r2, (L2 * k) / m); b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
    return b.map((v, k) => v + (k < 2 ? -1 : 1) * (sleeperLen + 8));
  });
  const out: [number, number][] = [];
  let a = -1;
  for (let k = 0; k <= n; k++) {
    const sk = Math.min(Math.max((L * k) / n, 0.5), L - 0.5), p = routePose(rt, sk);
    const hit = routes.some((r2, j) => {
      const b = boxes[j];
      return !!b && p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && Math.abs(routeLat(r2, [p[0], p[1]])) < sleeperLen;
    });
    const s = k === 0 ? 0 : k === n ? L : sk;
    if (!hit && a < 0) a = s;
    if (hit && a >= 0) { out.push([a, (L * (k - 1)) / n]); a = -1; }
  }
  if (a >= 0) out.push([a, L]);
  return out.filter(([p, q]) => q - p > STUD);
}

/** Each route's extra rails told where they may run (Route.extra.clear, in drawn arc lengths), clear of all the others. */
export function markClear(routes: Route[], sleeperLen: number): Route[] {
  return routes.map((rt, i) => {
    const x = rt.extra;
    if (!x) return rt;
    const d = x.to >= x.from ? 1 : -1;
    const clear = clearStretches(routes, i, sleeperLen).map(([a, b]) => (d > 0 ? [x.from + a, x.from + b] : [x.from - b, x.from - a]) as [number, number]).sort((p, q) => p[0] - q[0]);
    return { ...rt, extra: { ...x, clear } };
  });
}

export interface ExtraBuilt {
  /** the rails, ready to add to the piece */
  solid?: Man;
  /** the extra rails with rail ends at this route's start / end, as offsets in that end connector's frame (extra_rails()) */
  xfs: [number[], number[]];
  /** the guard rails' offset, if it has them (the connectors' posts keep clear of them) */
  guardX?: number;
  /** Is a stud at q clear of them (guard_clear)? */
  clearOf: (q: Vec2) => boolean;
  /**
   * A sleeper's post_ok at pose P (its frame: x across, to the right): its
   * posts clear of the guard rails' and the third rail's lines
   * (between_rails_offsets) and of where the guard rails run (guard_clear).
   */
  postOk: (P: [number, number, number]) => (p: Vec2) => boolean;
}

/**
 * Route i's extra rails in a piece (crossingPiece), routes being all its
 * routes; inStart / inEnd: that end has no connector (the rails run on
 * through it).
 */
export function extraRails(s: Scad, t: Track, routes: Route[], i: number, inStart: boolean, inEnd: boolean): ExtraBuilt | undefined {
  const rt = routes[i], x = rt.extra, c = t.c, gs = t.o.gaugeStuds;
  if (!x || !hasExtraRails(x, gs)) return undefined;
  const L = routeLength(rt), dir = x.to >= x.from ? 1 : -1, lo = Math.min(x.from, x.to), hi = Math.max(x.from, x.to);
  const loc = (d: number) => (d - x.from) * dir;
  const dualOn = x.dual && x.dualStuds < gs;
  const dualXd = (x.dualShared === 'right' ? 1 : -1) * (((gs + 1) / 2) * 8 - (x.dualStuds + 1) * 8); // (dual_x, the drawn route's way)
  const guardX = c.railOffset - 2 * 1.25 - x.guardGapStuds * STUD;
  // (the stretches, drawn arc lengths)
  const clear = x.clear ?? clearStretches(routes, i, c.sleeperLen).map(([a, b]) => (dir > 0 ? [x.from + a, x.from + b] : [x.from - b, x.from - a]) as [number, number]);
  const near = clear.filter(([a, b]) => b > lo - 1e-6 && a < hi + 1e-6);

  // A point at local arc length sl (straight on past the ends), lat to the right.
  const ptAt = (sl: number, lat: number): Vec2 => {
    if (sl >= 0 && sl <= L) return railPoint(rt, sl, lat) as Vec2;
    const e = sl < 0 ? 0 : L, p = routePose(rt, e), h = (p[2] * Math.PI) / 180, ds = sl - e;
    return [p[0] - ds * Math.sin(h) + lat * Math.cos(h), p[1] + ds * Math.cos(h) + lat * Math.sin(h)];
  };
  const prof = (xl: number) => s.polygon(RAIL_PROFILE.map(([px, py]) => [px + xl, py + PLATE_H] as Vec2));
  // (each rail piece, and whether it runs to the start / end connector, where it's cut back to its rail end)
  const pieces: { m: Man; c0: boolean; c1: boolean }[] = [];
  const clr: { a: Vec2; b: Vec2; r: number }[] = [];
  const xs0: number[] = [], xs1: number[] = [];
  const dualXs0: number[] = [], dualXs1: number[] = [];
  let guard0 = false, guard1 = false;
  /** A rail at local offset xl along the drawn stretch d0..d1 (within this route), keeping studs r clear. */
  const run = (xl: number, d0: number, d1: number, r: number) => {
    const a = Math.max(0, Math.min(loc(d0), loc(d1))), b = Math.min(L, Math.max(loc(d0), loc(d1)));
    if (b - a < 0.1) return;
    const c0 = a < 1e-6 && !inStart, c1 = b > L - 1e-6 && !inEnd;
    pieces.push({ m: sweepRoute(s, prof(xl), rt, a, b), c0, c1 });
    const n = Math.max(1, Math.ceil((b - a) / 4));
    for (let k = 0; k < n; k++) clr.push({ a: ptAt(a + ((b - a) * k) / n, xl), b: ptAt(a + ((b - a) * (k + 1)) / n, xl), r });
  };
  /** guard_rail_seg(p0, p1): the rail profile along a straight from p0 to p1, a little past each end. */
  const seg = (p0: Vec2, p1: Vec2) => {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) + 0.1;
    return T(R(T(R(prof(0).extrude(len), [90, 0, 0]), [0, len - 0.05, 0]), [0, 0, (Math.atan2(dy, dx) * 180) / Math.PI - 90]), [p0[0], p0[1], 0]);
  };
  const gr = guardX, guardClr = GUARD_HW + t.o.studD / 2 + 0.3, dualClr = c.railFootHalfW + t.o.studD / 2 + 0.3;
  const covers = (d: number, d0: number, d1: number) => d >= Math.min(d0, d1) - 1e-6 && d <= Math.max(d0, d1) + 1e-6;
  const tapers: Man[] = [];
  for (const [A, B] of near) {
    if (x.guard) {
      const pS = A <= 1e-3 && endsHas(x.guardEnds, false), pE = B >= x.len - 1e-3 && endsHas(x.guardEnds, true);
      const n = (pS ? 1 : 0) + (pE ? 1 : 0), Tset = x.guardTaperStuds * STUD;
      // (guard_taper_for: shortened on a stretch too short for its points at full length)
      const Tp = n === 0 ? Tset : Math.max(8, Math.min(Tset, (B - A - 2 * V_IN - 4) / n));
      if (B - A >= (n ? n * (V_IN + 8) + 8 : STUD)) {
        const y0 = pS ? A + V_IN : A, y1 = pE ? B - V_IN : B;
        // (the runs go a little into a pointed end's bend, so its outside has no notch)
        const r0 = pS ? y0 + Tp - 1.5 : y0, r1 = pE ? y1 - Tp + 1.5 : y1;
        for (const sd of [-1, 1]) run(sd * gr, r0, r1, guardClr);
        if (covers(x.from, r0, r1)) guard0 = true;
        if (covers(x.to, r0, r1)) guard1 = true;
        // the pointed ends (guard_point): each side's bend from the point, cut to a sharp nose and ramped down
        for (const [on, apexD, sg] of [[pS, y0, 1], [pE, y1, -1]] as const) {
          if (!on || !(Math.max(apexD, apexD + sg * Tp) > lo - 1e-6 && Math.min(apexD, apexD + sg * Tp) < hi + 1e-6)) continue;
          const f = (u: number) => (x.guardShape === 'straight' ? u : 1 - (1 - u) * (1 - u));
          const segs: Man[] = [];
          for (const sd of [-1, 1]) for (let k = 0; k < TAPER_N; k++) {
            const p0 = ptAt(loc(apexD + (sg * Tp * k) / TAPER_N), sd * gr * f(k / TAPER_N)), p1 = ptAt(loc(apexD + (sg * Tp * (k + 1)) / TAPER_N), sd * gr * f((k + 1) / TAPER_N));
            segs.push(seg(p0, p1));
            clr.push({ a: p0, b: p1, r: guardClr });
          }
          const sl = loc(apexD), apex = ptAt(sl, 0), hp = routePose(rt, Math.min(Math.max(sl, 0), L))[2] * (Math.PI / 180), w = sg * dir;
          const dv: Vec2 = [-Math.sin(hp) * w, Math.cos(hp) * w], pr: Vec2 = [-dv[1], dv[0]];
          const len = Tp + 2, kk = (4 * gr) / Tp;
          const wedge = T(s.polygon([apex, [apex[0] + dv[0] * len + pr[0] * kk * len, apex[1] + dv[1] * len + pr[1] * kk * len],
            [apex[0] + dv[0] * len - pr[0] * kk * len, apex[1] + dv[1] * len - pr[1] * kk * len]]).extrude(30), [0, 0, -1]);
          let m = s.intersection(s.union(segs), wedge);
          const ramp = x.guardRampStuds * STUD;
          if (ramp > 0) {
            // (the nose: from just above the bed at the point up to the rail top, so anything dragging rides over it)
            const z0 = PLATE_H + 1, zt = PLATE_H + 6.4;
            const rp = s.polygon([[-1, -5], [-1, z0], [0, z0], [ramp, zt + 0.01], [ramp, 40], [len + 5, 40], [len + 5, -5]]);
            m = s.intersection(m, T(R(R(T(rp.extrude(200), [0, 0, -100]), [90, 0, 0]), [0, 0, (Math.atan2(dv[1], dv[0]) * 180) / Math.PI]), [apex[0], apex[1], 0]));
          }
          tapers.push(m);
        }
      }
    }
    if (dualOn) {
      const d0 = A <= 1e-3 && endsHas(x.dualPlainEnds, false) ? A + DUAL_END_IN : A;
      const d1 = B >= x.len - 1e-3 && endsHas(x.dualPlainEnds, true) ? B - DUAL_END_IN : B;
      if (d1 - d0 >= STUD) {
        run(dir * dualXd, d0, d1, dualClr);
        if (covers(x.from, d0, d1)) dualXs0.push(dir * dualXd);
        if (covers(x.to, d0, d1)) dualXs1.push(-dir * dualXd);
      }
    }
  }
  // (extra_rails(): the third rail first, then the guard rails)
  if (!inStart) xs0.push(...dualXs0, ...(guard0 ? [-gr, gr] : []));
  if (!inEnd) xs1.push(...dualXs1, ...(guard1 ? [-gr, gr] : []));

  const p0 = routePose(rt, 0), p1 = routePose(rt, L), w = c.sleeperLen + 2 * STUD;
  const atPose = (m: Man, p: [number, number, number]) => T(R(m, [0, 0, p[2]]), [p[0], p[1], 0]);
  const cut0 = atPose(T(s.cube([w, RAIL_IN + 1, 30]), [-w / 2, -1, -5]), p0), cut1 = atPose(T(s.cube([w, RAIL_IN + 1, 30]), [-w / 2, -RAIL_IN, -5]), p1);
  const parts = pieces.map(({ m, c0, c1 }) => s.difference(m, [c0 && cut0, c1 && cut1]));
  // (a point's bend past where this route's stretch ends: cut off there)
  const out0 = lo > 1e-6 || hi < x.len - 1e-6 ? [atPose(T(s.cube([w, 400, 40]), [-w / 2, -400, -5]), p0), atPose(T(s.cube([w, 400, 40]), [-w / 2, 0, -5]), p1)] : [];
  for (const m of tapers) parts.push(s.difference(m, out0));
  const box = clr.length ? clr.reduce((b, { a, b: q }) => [Math.min(b[0], a[0], q[0]), Math.min(b[1], a[1], q[1]), Math.max(b[2], a[0], q[0]), Math.max(b[3], a[1], q[1])], [Infinity, Infinity, -Infinity, -Infinity]) : undefined;
  const pad = Math.max(guardClr, dualClr);
  const out: ExtraBuilt = {
    solid: parts.length ? s.union(parts) : undefined,
    xfs: [xs0, xs1],
    guardX: x.guard ? gr : undefined,
    clearOf: (q) => {
      if (!box || q[0] < box[0] - pad || q[0] > box[2] + pad || q[1] < box[1] - pad || q[1] > box[3] + pad) return true;
      return clr.every(({ a, b, r }) => segDist(q, a, b) >= r);
    },
    postOk: (P) => (p) => {
      if (Math.abs(p[0]) < c.railOffset && ((x.guard && Math.abs(Math.abs(p[0]) - gr) < guardClr) || (dualOn && Math.abs(p[0] - dir * dualXd) < dualClr))) return false;
      const h = (P[2] * Math.PI) / 180;
      return out.clearOf([P[0] + p[0] * Math.cos(h) - p[1] * Math.sin(h), P[1] + p[0] * Math.sin(h) + p[1] * Math.cos(h)]);
    },
  };
  return out;
}

/** seg_dist: how far p is from the segment a-b. */
function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / Math.max(dx * dx + dy * dy, 1e-9)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
