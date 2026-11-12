// A route's extra rails: bridge guard rails and a dual-gauge third rail, as
// straight.scad / curves.scad lay them (track_lib.scad's guard_* and dual_*,
// extra_rails(), full_endpoint(…, xfs)), along any route.
//
// Everything is worked out along the route as drawn (Route.extra: from / to
// / len), so a route that's been cut up or turned round has them in the same
// places, its pointed and plain ends at the drawn route's start and end.
// Where another route comes within a sleeper length (a switch, a crossing,
// a track alongside) they're left out: the OpenSCAD files have no such case.
// But a third rail runs on through a crossing, where the other track crosses
// at DUAL_CROSS degrees or more: that track's flangeways are cut through it,
// and its own (the narrow gauge's wheels' flanges, inside it on the shared
// rail's side) through that track's rails (geom/crossing.ts). Through a
// switch, or beside track alongside, it's still left out (said by the build).
import type { ExtraRails, Route, RouteEnds } from '../route/route';
import { poseToWorld, railPoint, routeLat, routeLength, routePose, routeSOf, routesBox, sleeperLenOf } from '../route/route';
import { R, T, type Man, type Scad, type Vec2 } from './scad';
import { segDist } from './pathsplit';
import { bankAlong, sweepRoute, trackBank } from './sweep';
import { PLATE_H, RAIL_PROFILE, scadParity, STUD, type Track } from './track';

const V_IN = 10;          // guard_v_in: a point this far in from its end
const GUARD_HW = 3.0;     // guard_hw: the guard rail's half width above the bed, for keeping studs clear
const DUAL_END_IN = 2.3;  // dual_end_in: a third rail stops this far short of a plain end
const TAPER_N = 16;       // guard_taper_n: segments along each pointed end
/** A third rail runs on through other track that crosses its route at this angle or more (degrees); shallower, or alongside (a switch's branch), it stops. */
export const DUAL_CROSS = 20;
// rails with rail ends stop here: at them, as the running rails do (crossing.ts END). (curves.scad's 3.9, just into
// them, when matching the OpenSCAD output: that 0.1 of rail lay in the next piece's rail end, 1 mm3 at each extra rail's end)
const railIn = () => (scadParity() ? 3.9 : 4);

export const endsHas = (e: RouteEnds, atEnd: boolean) => e === 'both' || e === (atEnd ? 'end' : 'start');

/** Does a route have extra rails to build (a third rail only if its gauge is narrower)? */
export const hasExtraRails = (x: ExtraRails | undefined, gaugeStuds: number) => !!x && (x.guard || dualBuilt(x, gaugeStuds));

/**
 * Is a route's narrow gauge built: narrower than its track's, and, centred (its own two rails up the middle, four rails
 * in all), two studs or more narrower (its rails a stud inside the running rails: any closer and they'd be in them)?
 */
export const dualBuilt = (x: ExtraRails | undefined, gaugeStuds: number) => !!x?.dual && x.dualStuds < gaugeStuds - (x.dualShared === 'centre' ? 1 : 0);

/**
 * The narrow gauge's own rails: how far each is to the right of the middle of the route as drawn (mm), and which way
 * its flangeway lies from it (in: +1 to the right, towards the narrow gauge's middle). One beside a shared rail (the
 * third rail), two centred.
 */
export function dualRails(x: ExtraRails, gaugeStuds: number): { xd: number; in: number }[] {
  const w = (x.dualStuds + 1) * STUD;
  if (x.dualShared === 'centre') return [{ xd: -w / 2, in: 1 }, { xd: w / 2, in: -1 }];
  const sd = x.dualShared === 'right' ? 1 : -1;
  return [{ xd: sd * (((gaugeStuds + 1) / 2) * STUD - w), in: sd }]; // (dual_x, the drawn route's way)
}

/**
 * The stretches of route i (its own arc lengths) clear of every other route:
 * none of their centre lines within a sleeper length beside it. (A route
 * that runs on from its end isn't beside it.)
 */
/** crossings: (a third rail's) clear of a route too where that route only crosses this one, at DUAL_CROSS or more all the while it's near. */
export function clearStretches(routes: Route[], i: number, sleeperLen: number, step = 2, crossings = false): [number, number][] {
  const rt = routes[i], L = routeLength(rt), n = Math.max(1, Math.ceil(L / step));
  const boxes = routes.map((r2, j) => (j === i ? undefined : routesBox([r2], sleeperLen + 8, 8)));
  const out: [number, number][] = [];
  const nearAt = (k: number, j: number) => {
    const sk = Math.min(Math.max((L * k) / n, 0.5), L - 0.5), p = routePose(rt, sk), b = boxes[j];
    return !!b && p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && Math.abs(routeLat(routes[j], [p[0], p[1]])) < sleeperLen;
  };
  // (each other route, each run of samples it's near: crossing all the way along it, or not)
  const crossed = new Set<string>();
  if (crossings) routes.forEach((r2, j) => {
    if (j === i) return;
    let run: number[] = [], steep = true;
    const flush = () => { if (run.length && steep) for (const k of run) crossed.add(`${j}:${k}`); run = []; steep = true; };
    for (let k = 0; k <= n; k++) {
      if (!nearAt(k, j)) { flush(); continue; }
      const sk = Math.min(Math.max((L * k) / n, 0.5), L - 0.5), p = routePose(rt, sk), q = routePose(r2, Math.max(0, Math.min(routeLength(r2), routeSOf(r2, [p[0], p[1]]))));
      const d = (((p[2] - q[2]) % 180) + 180) % 180;
      if (Math.min(d, 180 - d) < DUAL_CROSS) steep = false;
      run.push(k);
    }
    flush();
  });
  // (a third rail runs on through points too, where the branch leaves this route on the third rail's side: the branch's
  // inner rail crosses the third rail past the blades, a fixed frog there as any crossing's, if they cross at DUAL_CROSS or
  // more (an R40 branch: 22 degrees; R104's 14 is too shallow). On the shared rail's side the third rail would lie under
  // the blades: left out there, as before)
  const xr = rt.extra;
  // (centred, the narrow gauge's rails lie either side of the middle: one of them under the blades whichever side the
  // branch leaves: left out through points)
  if (crossings && xr?.dual && xr.dualShared !== 'centre') routes.forEach((r2, j) => {
    if (j === i || !r2.segments.length) return;
    const G = (sleeperLen - 24) / 2, side = (xr.dualShared === 'right' ? -1 : 1) * (xr.to >= xr.from ? 1 : -1), reach = G + Math.abs(G - (xr.dualStuds + 1) * STUD);
    const L2 = routeLength(r2), ends = [routePose(r2, 0), routePose(r2, L2)];
    const e = ends.findIndex((q) => { const sq = routeSOf(rt, [q[0], q[1]]), pq = routePose(rt, Math.max(0, Math.min(L, sq))), dh = (((q[2] - pq[2]) % 180) + 180) % 180; return Math.hypot(q[0] - pq[0], q[1] - pq[1]) < 0.5 && Math.min(dh, 180 - dh) < 1; });
    if (e < 0) return;
    // (out from where it leaves: on the third rail's side all the way, and steep enough where its far rail crosses the third rail)
    let steep = false;
    for (let t = 2; t <= L2; t += 2) {
      const q = routePose(r2, e === 0 ? t : L2 - t), lat = routeLat(rt, [q[0], q[1]]);
      if (lat * side < -0.5) return;
      if (Math.abs(lat) >= reach) { const pq = routePose(rt, Math.max(0, Math.min(L, routeSOf(rt, [q[0], q[1]])))), dh = (((q[2] - pq[2]) % 180) + 180) % 180; steep = Math.min(dh, 180 - dh) >= DUAL_CROSS; break; }
    }
    if (steep) for (let k = 0; k <= n; k++) if (nearAt(k, j)) crossed.add(`${j}:${k}`);
  });
  let a = -1;
  for (let k = 0; k <= n; k++) {
    const sk = Math.min(Math.max((L * k) / n, 0.5), L - 0.5);
    const hit = routes.some((_, j) => j !== i && nearAt(k, j) && !crossed.has(`${j}:${k}`));
    const s = k === 0 ? 0 : k === n ? L : sk;
    if (!hit && a < 0) a = s;
    if (hit && a >= 0) { out.push([a, (L * (k - 1)) / n]); a = -1; }
  }
  if (a >= 0) out.push([a, L]);
  return out.filter(([p, q]) => q - p > STUD);
}

/** Each route's extra rails told where they may run (Route.extra.clear, in drawn arc lengths), clear of all the others. sleeperLen: the design's (a route with its own gauge: its own). */
export function markClear(routes: Route[], sleeperLen: number): Route[] {
  return routes.map((rt, i) => {
    const x = rt.extra;
    if (!x) return rt;
    const d = x.to >= x.from ? 1 : -1;
    const clear = clearStretches(routes, i, sleeperLenOf(rt, sleeperLen)).map(([a, b]) => (d > 0 ? [x.from + a, x.from + b] : [x.from - b, x.from - a]) as [number, number]).sort((p, q) => p[0] - q[0]);
    // (the third rail's: on through crossings)
    const clearDual = x.dual ? clearStretches(routes, i, sleeperLenOf(rt, sleeperLen), 2, true).map(([a, b]) => (d > 0 ? [x.from + a, x.from + b] : [x.from - b, x.from - a]) as [number, number]).sort((p, q) => p[0] - q[0]) : undefined;
    return { ...rt, extra: { ...x, clear, ...(clearDual && { clearDual }) } };
  });
}

export interface ExtraBuilt {
  /** the rails, ready to add to the piece */
  solid?: Man;
  /** the extra rails with rail ends at this route's start / end, as offsets in that end connector's frame (extra_rails()) */
  xfs: [number[], number[]];
  /** (a third rail that runs through a crossing) the narrow gauge's flangeway beside it, on the shared rail's side: cut from the other routes' rails */
  dualBand?: Man;
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

export function extraRails(s: Scad, t: Track, routes: Route[], i: number, inStart: boolean, inEnd: boolean, fw: { w: number; depth: number } = { w: 3, depth: 3 }): ExtraBuilt | undefined {
  const rt = routes[i], x = rt.extra, c = t.c, gs = t.o.gaugeStuds;
  if (!x || !hasExtraRails(x, gs)) return undefined;
  const L = routeLength(rt), dir = x.to >= x.from ? 1 : -1, lo = Math.min(x.from, x.to), hi = Math.max(x.from, x.to);
  const loc = (d: number) => (d - x.from) * dir;
  const dualOn = dualBuilt(x, gs), duals = dualOn ? dualRails(x, gs) : [];
  const guardX = c.railOffset - 2 * 1.25 - x.guardGapStuds * STUD, guardXOf = (gap?: number) => (gap === undefined ? guardX : c.railOffset - 2 * 1.25 - gap * STUD);
  // (the stretches, drawn arc lengths)
  const clear = x.clear ?? clearStretches(routes, i, c.sleeperLen).map(([a, b]) => (dir > 0 ? [x.from + a, x.from + b] : [x.from - b, x.from - a]) as [number, number]);
  const near = clear.filter(([a, b]) => b > lo - 1e-6 && a < hi + 1e-6);
  // (the third rail's stretches: on through crossings; the same as the guard rails' where there are none)
  const clearD = x.clearDual ?? (x.dual ? clearStretches(routes, i, c.sleeperLen, 2, true).map(([a, b]) => (dir > 0 ? [x.from + a, x.from + b] : [x.from - b, x.from - a]) as [number, number]) : clear);
  const nearD = clearD.filter(([a, b]) => b > lo - 1e-6 && a < hi + 1e-6);
  const same = (p: [number, number][], q: [number, number][]) => p.length === q.length && p.every((e, k) => Math.abs(e[0] - q[k][0]) < 1e-6 && Math.abs(e[1] - q[k][1]) < 1e-6);
  const through = dualOn && !same(near, nearD), bands: Man[] = [];

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
  const guard0: number[] = [], guard1: number[] = [];
  /** A rail at local offset xl along the drawn stretch d0..d1 (within this route), keeping studs r clear. */
  const run = (xl: number, d0: number, d1: number, r: number) => {
    const a = Math.max(0, Math.min(loc(d0), loc(d1))), b = Math.min(L, Math.max(loc(d0), loc(d1)));
    if (b - a < 0.1) return;
    const c0 = a < 1e-6 && !inStart, c1 = b > L - 1e-6 && !inEnd;
    pieces.push({ m: sweepRoute(s, prof(xl), rt, a, b, trackBank(c.sleeperLen)), c0, c1 }); // (banked: turned with the track)
    const n = Math.max(1, Math.ceil((b - a) / 4));
    for (let k = 0; k < n; k++) clr.push({ a: ptAt(a + ((b - a) * k) / n, xl), b: ptAt(a + ((b - a) * (k + 1)) / n, xl), r });
  };
  /** guard_rail_seg(p0, p1): the rail profile along a straight from p0 to p1, a little past each end. */
  const seg = (p0: Vec2, p1: Vec2) => {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) + 0.1;
    return T(R(T(R(prof(0).extrude(len), [90, 0, 0]), [0, len - 0.05, 0]), [0, 0, (Math.atan2(dy, dx) * 180) / Math.PI - 90]), [p0[0], p0[1], 0]);
  };
  const guardClr = GUARD_HW + t.o.studD / 2 + 0.3, dualClr = c.railFootHalfW + t.o.studD / 2 + 0.3;
  const covers = (d: number, d0: number, d1: number) => d >= Math.min(d0, d1) - 1e-6 && d <= Math.max(d0, d1) + 1e-6;
  const tapers: Man[] = [];
  /** Guard rails along the drawn stretch A..B, on these sides (local: -1 left, 1 right) at offset gr, pointed at its
   * ends inside the route where pointS / pointE (at the route's own ends: as guardEnds says). */
  const grs = new Set<number>();
  const guardRun = (A: number, B: number, sides: number[], gr: number, pointS?: boolean, pointE?: boolean) => {
    const pS = A <= 1e-3 ? endsHas(x.guardEnds, false) : !!pointS, pE = B >= x.len - 1e-3 ? endsHas(x.guardEnds, true) : !!pointE;
    const n = (pS ? 1 : 0) + (pE ? 1 : 0), Tset = x.guardTaperStuds * STUD;
    // (guard_taper_for: shortened on a stretch too short for its points at full length)
    const Tp = n === 0 ? Tset : Math.max(8, Math.min(Tset, (B - A - 2 * V_IN - 4) / n));
    if (B - A >= (n ? n * (V_IN + 8) + 8 : STUD)) {
      const y0 = pS ? A + V_IN : A, y1 = pE ? B - V_IN : B;
      // (the runs go a little into a pointed end's bend, so its outside has no notch)
      const r0 = pS ? y0 + Tp - 1.5 : y0, r1 = pE ? y1 - Tp + 1.5 : y1;
      for (const sd of sides) run(sd * gr, r0, r1, guardClr);
      grs.add(gr);
      if (covers(x.from, r0, r1)) guard0.push(...sides.map((sd) => sd * gr));
      if (covers(x.to, r0, r1)) guard1.push(...(sides.length > 1 ? [-gr, gr] : sides.map((sd) => -sd * gr)));
      // the pointed ends (guard_point): each side's bend from the point, cut to a sharp nose and ramped down
      for (const [on, apexD, sg] of [[pS, y0, 1], [pE, y1, -1]] as const) {
        if (!on || !(Math.max(apexD, apexD + sg * Tp) > lo - 1e-6 && Math.min(apexD, apexD + sg * Tp) < hi + 1e-6)) continue;
        const f = (u: number) => (x.guardShape === 'straight' ? u : 1 - (1 - u) * (1 - u));
        const segs: Man[] = [];
        for (const sd of sides) for (let k = 0; k < TAPER_N; k++) {
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
  };
  if (x.guard && !x.guardOn) for (const [A, B] of near) guardRun(A, B, [-1, 1], guardX);
  // (expert: along stretches only, a side or both, each with its own gap; pointed at each stretch's ends. Sides as drawn)
  if (x.guard && x.guardOn) for (const g of x.guardOn) for (const [A0, B0] of near) {
    const A = Math.max(A0, g.a), B = Math.min(B0, g.b);
    if (B - A < 0.1) continue;
    guardRun(A, B, g.side ? [g.side * dir] : [-1, 1], guardXOf(g.gap), A > A0 + 1e-6, B < B0 - 1e-6);
  }
  for (const [A, B] of nearD) {
    if (dualOn) {
      const d0 = A <= 1e-3 && endsHas(x.dualPlainEnds, false) ? A + DUAL_END_IN : A;
      const d1 = B >= x.len - 1e-3 && endsHas(x.dualPlainEnds, true) ? B - DUAL_END_IN : B;
      if (d1 - d0 >= STUD) {
        for (const { xd, in: inw } of duals) {
          run(dir * xd, d0, d1, dualClr);
          // (through a crossing: the narrow gauge's flangeway inside it, as deep and wide as the running rails')
          if (through) {
            const a = Math.max(0, Math.min(loc(d0), loc(d1))), b = Math.min(L, Math.max(loc(d0), loc(d1))), xl = dir * xd, sd = dir * inw;
            if (b - a >= 0.1) bands.push(sweepRoute(s, s.square([fw.w, fw.depth + 1]).translate([sd > 0 ? xl + 1.25 : xl - 1.25 - fw.w, PLATE_H + 6.4 - fw.depth]), rt, a, b, trackBank(c.sleeperLen)));
          }
          if (covers(x.from, d0, d1)) dualXs0.push(dir * xd);
          if (covers(x.to, d0, d1)) dualXs1.push(-dir * xd);
        }
      }
    }
  }
  // (extra_rails(): the third rail first, then the guard rails)
  if (!inStart) xs0.push(...dualXs0, ...guard0);
  if (!inEnd) xs1.push(...dualXs1, ...guard1);

  const p0 = routePose(rt, 0), p1 = routePose(rt, L), w = c.sleeperLen + 2 * STUD;
  const atPose = (m: Man, p: [number, number, number]) => T(R(m, [0, 0, p[2]]), [p[0], p[1], 0]);
  const RAIL_IN = railIn(), cut0 = atPose(T(s.cube([w, RAIL_IN + 1, 30]), [-w / 2, -1, -5]), p0), cut1 = atPose(T(s.cube([w, RAIL_IN + 1, 30]), [-w / 2, -RAIL_IN, -5]), p1);
  const parts = pieces.map(({ m, c0, c1 }) => s.difference(m, [c0 && cut0, c1 && cut1]));
  // (a point's bend past where this route's stretch ends: cut off there)
  const out0 = lo > 1e-6 || hi < x.len - 1e-6 ? [atPose(T(s.cube([w, 400, 40]), [-w / 2, -400, -5]), p0), atPose(T(s.cube([w, 400, 40]), [-w / 2, 0, -5]), p1)] : [];
  // (expert, guard rails along stretches: a point that runs over a joint between track pieces is cut back there as the rails are)
  const back = x.guardOn ? [!inStart && cut0, !inEnd && cut1] : [];
  for (const m of tapers) parts.push(bankAlong(s.difference(m, [...out0, ...back]), rt, trackBank(c.sleeperLen)));
  const box = clr.length ? clr.reduce((b, { a, b: q }) => [Math.min(b[0], a[0], q[0]), Math.min(b[1], a[1], q[1]), Math.max(b[2], a[0], q[0]), Math.max(b[3], a[1], q[1])], [Infinity, Infinity, -Infinity, -Infinity]) : undefined;
  const pad = Math.max(guardClr, dualClr);
  const out: ExtraBuilt = {
    solid: parts.length ? s.union(parts) : undefined,
    ...(bands.length && { dualBand: s.union(bands) }),
    xfs: [xs0, xs1],
    guardX: x.guard ? guardX : undefined,
    clearOf: (q) => {
      if (!box || q[0] < box[0] - pad || q[0] > box[2] + pad || q[1] < box[1] - pad || q[1] > box[3] + pad) return true;
      return clr.every(({ a, b, r }) => segDist(q, a, b) >= r);
    },
    postOk: (P) => (p) => {
      if (Math.abs(p[0]) < c.railOffset && ((x.guard && [...(x.guardOn ? grs : [guardX])].some((gr) => Math.abs(Math.abs(p[0]) - gr) < guardClr)) || duals.some(({ xd }) => Math.abs(p[0] - dir * xd) < dualClr))) return false;
      return out.clearOf(poseToWorld(P, p));
    },
  };
  return out;
}

