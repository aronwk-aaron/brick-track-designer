// The track-only switch base (switch.scad's switch_base() with
// generate_ballast = false), ported module by module: stock and crossing
// rails with the frog's flangeways, check rails, the points bed with its
// pockets and blade slots, long turnout ties and each route's own sleepers,
// the end connectors, the throw arm with the lever's ears, the throw
// channel, the stud sockets underneath and the breakaway supports.
//
// Units: mm and degrees, switch.scad's frame (the routes start at the origin
// heading +y). Routes are right to left, as switch.scad's `routes`.
import type { Pose, Pt, Route } from '../route/route';
import { railPoint, routeLat, routeLength, routePose, routeSOf, segStarts } from '../route/route';
import { M, R, T, type CS, type Man, type Scad, type Vec2, type Vec3 } from '../geom/scad';
import { sweepRoute } from '../geom/sweep';
import { type Spot, studSpots } from '../geom/underside';
import { DEFAULTS as TRACK_DEFAULTS, getSocketShape, PLATE_H, RAIL_PROFILE, STUD, Track } from '../geom/track';
import { HEAD_HW, pointsSet, type PointsSetValues, type SwitchParams, switchGlobals } from './context';

export interface BaseParams extends SwitchParams {
  flangeway: number;        // 3
  flangewayDepth: number;   // 3
  checkRailLen: number;     // 30
  checkRailW: number;       // 1
  checkRailFlare: number;   // 1.5
  printBedX: number;        // 256
  printBedY: number;        // 256
  /** Underside (switch.scad's stud_grip): 'edges' = hollow with anti-stud tubes, 'all' = a gripping square socket at every stud. */
  studGrip: 'edges' | 'all';
  /**
   * The points as one part (both blades on a heel bar, one pivot: switch.scad's)
   * or two (each blade on its own pivot with its own spring, as the plate-style).
   */
  pointsPieces: 1 | 2;
  /** Which side every switch's lever goes: auto (the main route's side), or left / right. */
  throwSide?: 'auto' | 'left' | 'right';
}

export const BASE_DEFAULTS: BaseParams = {
  gaugeStuds: 4, pointThrow: 3, pointClearance: 0.3, springPreload: 1, springThickness: 0.9,
  springLength: 40, bladeDiscD: 14, leverOffset: 8, studH: 1.8, generateBallast: false,
  flangeway: 3, flangewayDepth: 3, checkRailLen: 30, checkRailW: 1, checkRailFlare: 1.5,
  printBedX: 256, printBedY: 256, studGrip: 'edges', pointsPieces: 1,
};

/**
 * A points set: [right-hand route, left-hand route, toe (arc length), throw
 * side or undefined, and for a true three-way the straight route between
 * them]. A true three-way has one blade each side, both on the straight
 * route's rails, on one slider with three positions (the plate-style 2-04-043).
 */
export type SetSpec = [number, number, number, number?, number?];

// Two-piece points (and a three-way's): each blade's pivot level with its
// heel, so no part of the blade swings out past it into the stock rail, and
// far enough inside the rail line for its disc to clear the fixed rail's
// foot that carries on from the heel.
export const DISC2_R = 4.5;
const pivotIn = (c: number) => 3.9 + c + DISC2_R + 0.2;

const rad = (d: number) => (d * Math.PI) / 180;
const sind = (d: number) => Math.sin(rad(d)), cosd = (d: number) => Math.cos(rad(d));
const sOf = (rt: Route, p: Pt) => routeSOf(rt, p, 0, -1, 26);
const norm = (v: Pt) => Math.hypot(v[0], v[1]);
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const rotAbout = (pt: Pt, c: Pt, ang: number): Pt => [
  c[0] + (pt[0] - c[0]) * cosd(ang) - (pt[1] - c[1]) * sind(ang),
  c[1] + (pt[0] - c[0]) * sind(ang) + (pt[1] - c[1]) * cosd(ang),
];
/** rail_cross: where the rail at offset o crosses y = yc (bisection on arc length): [x, heading]. */
function railCross(rt: Route, o: number, yc: number): [number, number] {
  let lo = 0, hi = routeLength(rt);
  for (let n = 40; n > 0; n--) {
    const mid = (lo + hi) / 2;
    if (railPoint(rt, mid, o)[1] < yc) lo = mid; else hi = mid;
  }
  const mid = (lo + hi) / 2;
  return [railPoint(rt, mid, o)[0], routePose(rt, mid)[2]];
}
/** p in a pose's frame: [offset right of it, distance ahead of it] (local_of). */
const localOf = (pose: Pose, p: Pt): Pt => {
  const dx = p[0] - pose[0], dy = p[1] - pose[1];
  return [dx * cosd(pose[2]) + dy * sind(pose[2]), -dx * sind(pose[2]) + dy * cosd(pose[2])];
};
/** OpenSCAD's round(): halves away from zero (Math.round takes -0.5 to 0). */
const roundScad = (x: number) => Math.sign(x) * Math.round(Math.abs(x));
/** OpenSCAD's fragment count for a radius with $fn = 0, $fa = 12, $fs = 2. */
const frags = (r: number) => Math.ceil(Math.max(Math.min(360 / 12, (r * 2 * Math.PI) / 2), 5));

/**
 * A true three-way's machinery: two blades on the straight route's rails,
 * each closing on the outer route's stock rail on its side, each on its own
 * pivot and spring, both driven by one slider. Its values are a points set's
 * (switch/context.ts, for the right- and left-hand routes, which give the
 * slider, lever and arm), with the heel where both blades clear their stock
 * rails, and the slider's travel each way enough to open a blade.
 */
export function threeWaySet(routes: Route[], ps: SetSpec, p: BaseParams, defaultThrowDir = 1) {
  const g = switchGlobals(p), G = g.G, c = p.pointClearance;
  const R = routes[ps[0]], L = routes[ps[1]], S = routes[ps[4]!], sToe = ps[2];
  const lenMin = Math.min(routeLength(S), routeLength(L), routeLength(R));
  const sepL = (sx: number) => Math.abs(routeLat(L, railPoint(S, sx, -G)) + G);
  const sepR = (sx: number) => Math.abs(routeLat(R, railPoint(S, sx, +G)) - G);
  const firstS = (sep: (sx: number) => number) => { let sx = sToe; while (!(sx > lenMin) && !(sep(sx) >= g.bladeNeed)) sx += 0.5; return sx; };
  const sHeel = Math.max(firstS(sepL), firstS(sepR), sToe + 20);
  const base = { ra: ps[0], rb: ps[1], sToe, tside: ps[3] };
  const v0 = pointsSet(routes, base, p, defaultThrowDir, { sHeel });
  // half the slider's travel: enough to swing either blade open by the throw,
  // plus the preload it starts with
  const toeY = railPoint(S, sToe, -G)[1];
  const half = Math.max(...[-G, +G].map((o) => {
    const pv = railPoint(S, sHeel - c, o + Math.sign(-o) * pivotIn(c));
    const tip = railPoint(S, routeSOf(S, [0, v0.yS + 2], 0, -1, 26), o + Math.sign(-o) * pivotIn(c));
    const arm = norm(sub(tip, pv)) - 3 / 2;
    return p.springPreload + arm * ((p.pointThrow / (pv[1] - toeY))) + 0.3;
  }));
  const v = pointsSet(routes, base, p, defaultThrowDir, { sHeel, leverTravel: 2 * half });
  return { ...v, three: { S, L, R, half } };
}

/** Everything switch.scad works out before building: routes, sets, frogs, check rails, ties, cuts. */
export function switchPlan(routes: Route[], specs: SetSpec[], p: BaseParams = BASE_DEFAULTS, defaultThrowDir = 1) {
  // (a three-way's slider goes twice as far: a longer lever driver keeps its
  // swing small enough, under 17 degrees, for the fork to hold the tip)
  for (const ps of specs)
    if (ps[4] !== undefined) {
      const half = threeWaySet(routes, ps, p, defaultThrowDir).three.half;
      p = { ...p, leverReach: Math.max(p.leverReach ?? 10, Math.ceil(half / Math.sin((17 * Math.PI) / 180))) };
    }
  const g = switchGlobals(p), G = g.G;
  const tc = new Track({} as Scad, { ...TRACK_DEFAULTS, gaugeStuds: p.gaugeStuds, studH: p.studH }).c;
  const sleeperW = tc.sleeperW, sleeperLen = tc.sleeperLen;
  const nRoutes = routes.length;
  const sets = specs.map((ps) => (ps[4] === undefined
    ? pointsSet(routes, { ra: ps[0], rb: ps[1], sToe: ps[2], tside: ps[3] }, p, defaultThrowDir)
    : threeWaySet(routes, ps, p, defaultThrowDir)));
  const set0 = sets[0];
  const others = (i: number) => routes.map((_, j) => j).filter((j) => j !== i);
  const latOthers = (i: number, q: Pt) => Math.min(...others(i).map((j) => Math.abs(routeLat(routes[j], q))));
  const isStock = (i: number, o: number) => (i === 0 && o > 0) || (i === nRoutes - 1 && o < 0);
  const railFixS = (i: number, o: number) => Math.max(0, ...specs.map((ps, k) => (ps[4] !== undefined
    ? ([ps[0], ps[1], ps[4]].includes(i) && !isStock(i, o) ? sets[k].sHeel : -Infinity)  // a three-way: every rail but the stock rails starts at the heels
    : (ps[0] === i && o < 0) || (ps[1] === i && o > 0) ? sets[k].sHeel : -Infinity)));

  // Frogs: [i, j, s along i, point, s along j].
  const frogFn = (i: number, j: number, s: number) => routeLat(routes[j], railPoint(routes[i], s, -G)) - G;
  const frogBis = (i: number, j: number, lo: number, hi: number) => {
    for (let n = 40; n > 0; n--) {
      const mid = (lo + hi) / 2;
      if (frogFn(i, j, lo) * frogFn(i, j, mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const frogs: { i: number; j: number; si: number; pt: Pt; sj: number }[] = [];
  for (let i = 0; i < nRoutes - 1; i++)
    for (let j = i + 1; j < nRoutes; j++) {
      const lo = Math.max(railFixS(i, -G), railFixS(j, +G)), hi = routeLength(routes[i]);
      if (nRoutes === 2 || frogFn(i, j, lo) * frogFn(i, j, hi) <= 0) {
        const sf = frogBis(i, j, lo, hi), pt = railPoint(routes[i], sf, -G);
        frogs.push({ i, j, si: sf, pt, sj: sOf(routes[j], pt) });
      }
    }
  // Check rails: [route, s mid, inner edge offset, away from the stock rail, frog y, s0, s1].
  type CR = [number, number, number, number, number, number, number];
  const raw = frogs.flatMap((f) => [
    [f.i, f.si, +G - HEAD_HW - p.flangeway - p.checkRailW, -1, f.pt[1]],
    [f.j, f.sj, -G + HEAD_HW + p.flangeway, +1, f.pt[1]],
  ] as [number, number, number, number, number][]);
  const crClear = (cr: number[], s: number) => {
    const p0 = railPoint(routes[cr[0]], s, cr[2] - 0.5), p1 = railPoint(routes[cr[0]], s, cr[2] + p.checkRailW + 0.5);
    return !others(cr[0]).some((j) => [-G, G].some((o) => [p0, p1].some((q) => Math.abs(routeLat(routes[j], q) - o) < HEAD_HW + 0.3)));
  };
  const crReach = (cr: number[], dir: number) => { let d = 0; while (!(d >= p.checkRailLen / 2 || !crClear(cr, cr[1] + dir * (d + 1)))) d++; return d; };
  const clip: CR[] = [];
  for (const cr of raw) {
    const a = nRoutes === 2 ? p.checkRailLen / 2 : crReach(cr, -1), b = nRoutes === 2 ? p.checkRailLen / 2 : crReach(cr, +1);
    if (a + b >= 12) clip.push([...cr, cr[1] - a, cr[1] + b]);
  }
  let checkList: CR[] = clip;
  if (nRoutes !== 2) {
    const acc: CR[] = [];
    for (const c of clip) {
      const k = acc.findIndex((m) => m[0] === c[0] && m[3] === c[3] && c[5] <= m[6] + 4 && c[6] >= m[5] - 4);
      if (k < 0) { acc.push(c); continue; }
      const m = acc[k], s0 = Math.min(m[5], c[5]), s1 = Math.max(m[6], c[6]);
      acc[k] = [m[0], (s0 + s1) / 2, m[2], m[3], m[4], s0, s1];
    }
    checkList = acc;
  }

  // What the ties and base outline need from each set (set_data).
  const setData = sets.map((v) => ({
    leverX: v.leverX, throwY: v.throwY, leverTravel: v.leverTravel, toeY: v.toeY, pointsEndY: v.pointsEndY,
    armX0: Math.min(v.throwStockX, v.leverX + v.throwDir * 10), armX1: Math.max(v.throwStockX, v.leverX + v.throwDir * 10),
    throwDir: v.throwDir, throwStockX: v.throwStockX, throwStockRt: v.throwStockRt,
  }));
  const swTiePitch = sleeperW + 2 * STUD;
  const tieYs = (): number[] => {
    const yFirst = Math.ceil((set0.pointsEndY + sleeperW / 2 + 2) / STUD) * STUD;
    const yLast = Math.max(...routes.map((rt) => railPoint(rt, routeLength(rt), 0)[1])) - 8 - 2 * STUD - sleeperW / 2;
    const out: number[] = [];
    if (yLast >= yFirst - 1e-3)
      for (let y = yFirst; y <= yLast + 1e-3; y += swTiePitch) // (a little slack: the routes may come rounded)
        if (!setData.slice(1).some((d) => y + sleeperW / 2 + 2 > d.toeY - 2 && y - sleeperW / 2 - 2 < d.pointsEndY)) out.push(y);
    return out;
  };
  const baseHw = g.ballast ? (g.buddy ? g.ballastBottomW : g.ballastMidW) / 2 : sleeperLen / 2;
  const baseXRange = (y0: number, y1: number): [number, number] => {
    const xs: number[] = [];
    for (const rt of routes) for (let k = 0; k <= 40; k++) for (const o of [-baseHw, baseHw]) {
      const q = railPoint(rt, (routeLength(rt) * k) / 40, o);
      if (q[1] >= y0 && q[1] <= y1) xs.push(q[0]);
    }
    for (const d of setData) if (d.throwY + g.armW / 2 >= y0 && d.throwY - g.armW / 2 <= y1) xs.push(d.leverX + d.throwDir * 10, d.throwStockX);
    return [Math.min(...xs), Math.max(...xs)];
  };
  const baseY0 = -7;
  const baseY1 = Math.max(...routes.flatMap((rt) => [-baseHw, baseHw].map((o) => railPoint(rt, routeLength(rt), o)[1]))) + 8;
  const fits = (y0: number, y1: number) => {
    const xr = baseXRange(y0, y1), w = xr[1] - xr[0], h = y1 - y0;
    return (w <= p.printBedX && h <= p.printBedY) || (w <= p.printBedY && h <= p.printBedX);
  };
  const cutTies = () => tieYs().filter((t) => Math.min(...frogs.map((f) => Math.abs(t - f.pt[1]))) > p.checkRailLen / 2 + 12 && t < baseY1 - 48);
  const cutsFor = (n: number) => {
    const ts = cutTies();
    if (n <= 1 || ts.length === 0) return [];
    return Array.from({ length: n - 1 }, (_, k) => {
      const target = baseY0 + ((baseY1 - baseY0) * (k + 1)) / n, d = ts.map((t) => Math.abs(t - target));
      return ts[d.indexOf(Math.min(...d))];
    });
  };
  const planOk = (cs: number[]) => { const b = [baseY0, ...cs, baseY1]; return b.slice(0, -1).every((y, k) => fits(y - 4, b[k + 1] + 4)); };
  let baseCuts: number[] = [];
  for (let n = 1; ; n++) { if (n > 6) { baseCuts = cutsFor(6); break; } if (planOk(cutsFor(n))) { baseCuts = cutsFor(n); break; } }

  // Each route's own sleepers (arc lengths), counting back from its end.
  const routeTieSs = (i: number) => {
    const rt = routes[i], acc: number[] = [];
    const inner = i === 0 ? [-1] : i === nRoutes - 1 ? [+1] : [-1, +1];
    for (let k = 0; ; k++) {
      const s = routeLength(rt) - 8 - 2 * STUD - sleeperW / 2 - k * swTiePitch;
      const ends = inner.flatMap((sd) => [-sleeperW / 2, sleeperW / 2].map((ds) => railPoint(rt, s + ds, sd * (G + 3.9 + 1))));
      const clearOther = Math.min(...ends.map((e) => latOthers(i, e))) >= sleeperLen / 2 + 1;
      if (s < set0.sHeel || !clearOther) return acc;
      acc.push(s);
    }
  };
  const clearOfCuts = (rt: Route, ss: number[]) => ss.filter((s) => Math.min(1e9, ...baseCuts.map((c) => Math.abs(railPoint(rt, s, 0)[1] - c))) >= sleeperW + 2 * STUD);
  const routeTieList = routes.map((rt, i) => clearOfCuts(rt, routeTieSs(i)));
  const firstRouteY = Math.min(1e9, ...routeTieList.flatMap((ss, i) => ss.flatMap((s) => [-sleeperW / 2, sleeperW / 2].flatMap((ds) => [-1, 1].map((o) => railPoint(routes[i], s + ds, (o * sleeperLen) / 2)[1])))));
  const longTieYs = tieYs().filter((y) => y + sleeperW / 2 + 2 * STUD <= firstRouteY + 0.01 || baseCuts.some((c) => Math.abs(c - y) < 0.01));
  const routeServed = (i: number, y: number) => {
    const rt = routes[i], sp = sOf(rt, [0, y]), L = routeLength(rt);
    return sp > L - 8 - 2 * STUD - sleeperW / 2 || routeTieList[i].some((s) => Math.abs(sp - s) < sleeperW + 2 * STUD);
  };
  const longTieSpan = (y: number): [number, number] | undefined => {
    const open = routes.map((_, i) => i).filter((i) => !routeServed(i, y));
    if (!open.length) return undefined;
    const dys = [-sleeperW / 2, sleeperW / 2];
    return [Math.min(...open.flatMap((i) => dys.map((dy) => railCross(routes[i], -G, y + dy)[0]))) - 12,
      Math.max(...open.flatMap((i) => dys.map((dy) => railCross(routes[i], +G, y + dy)[0]))) + 12];
  };
  const endPoses = routes.map((rt) => routePose(rt, routeLength(rt)));
  const inEndKeepout = (q: Pt) => {
    const m = TRACK_DEFAULTS.studD / 2;
    return endPoses.some((e) => { const l = localOf(e, q); return l[1] > -(8 + 2 * STUD) - m && Math.abs(l[0]) < sleeperLen / 2 + 4 + m; });
  };
  const nearCheckRail = (q: Pt, lats: number[], r: number) => checkList.some((cr) => {
    if (!(Math.abs(q[1] - cr[4]) <= (nRoutes === 2 ? p.checkRailLen + 10 : cr[6] - cr[5] + 20))) return false;
    const sp = sOf(routes[cr[0]], q);
    const hl = nRoutes === 2 ? p.checkRailLen / 2 : (cr[6] - cr[5]) / 2;
    const d = Math.abs(sp - (nRoutes === 2 ? cr[1] : (cr[5] + cr[6]) / 2));
    const cw = p.checkRailW / 2 + r + (d > hl - 4 - r ? p.checkRailFlare : 0);
    return d <= hl + r && Math.abs(lats[cr[0]] - (cr[2] + p.checkRailW / 2)) < cw;
  });
  // Points sets too close: one set's points reach into the next one's (a
  // three-way at a large radius). switch.scad builds them anyway, clashing.
  const warnings = sets.flatMap((v) => v.warnings);
  if (!planOk(baseCuts)) warnings.push(`the switch doesn't fit the ${p.printBedX} x ${p.printBedY} print bed even when split across: it may be too wide`);
  const bySetY = [...sets].sort((a, b) => a.toeY - b.toeY);
  for (let k = 0; k + 1 < bySetY.length; k++)
    if (bySetY[k + 1].toeY - 2 < bySetY[k].pointsEndY)
      warnings.push(`two points sets overlap (one's points end at y ${bySetY[k].pointsEndY.toFixed(1)}, the next one's start at ${bySetY[k + 1].toeY.toFixed(1)}): move the second set further along`);
  return {
    warnings,
    p, g, G, tc, sleeperW, sleeperLen, routes, nRoutes, specs, sets, others, latOthers, isStock, railFixS, frogs, checkList,
    setData, tieYs, baseXRange, baseY0, baseY1, baseCuts, routeTieList, longTieYs, longTieSpan, routeServed, endPoses,
    inEndKeepout, nearCheckRail, railCross,
  };
}
export type SwitchPlan = ReturnType<typeof switchPlan>;

/** dedupe(pts, acc): add the points of pts not within a stud (+0.5) of one already taken. */
function dedupe(pts: Pt[], acc: Pt[] = []): Pt[] {
  const out = [...acc];
  for (const q of pts) if (Math.min(1e9, ...out.map((a) => norm(sub(a, q)))) >= TRACK_DEFAULTS.studD + 0.5) out.push(q);
  return out;
}

/** The track-only switch base, as switch_base() with part = "all" (unsplit). */
/** The track-only switch base, as switch_base() with part = "all" (unsplit). parts, if given, gets the main parts by name (for checks). */
export function switchBase(s: Scad, plan: SwitchPlan, parts?: Record<string, Man>): Man {
  return switchGeometry(s, plan).base(parts);
}

/** OpenSCAD's sphere(r, $fn) as a solid: the hull of its rings of points (it's convex). */
function sphereScad(s: Scad, r: number, fn: number, scaleZ = 1): Man {
  const rings = Math.floor((fn + 1) / 2), pts: Vec3[] = [];
  for (let i = 0; i < rings; i++) {
    const phi = (180 * (i + 0.5)) / rings;
    for (let j = 0; j < fn; j++) pts.push([r * sind(phi) * cosd((360 * j) / fn), r * sind(phi) * sind((360 * j) / fn), scaleZ * r * cosd(phi)]);
  }
  return s.w.Manifold.hull(pts);
}

/** Everything switch.scad builds for a switch: the base and each set's moving parts. */
/** extraCuts: cut from the base too (in its frame: hand-widened flangeways). */
export function switchGeometry(s: Scad, plan: SwitchPlan, extraCuts: Man[] = []) {
  const { p, g, G, routes, nRoutes, sets, sleeperW, sleeperLen } = plan;
  const t = new Track(s, { ...TRACK_DEFAULTS, gaugeStuds: p.gaugeStuds, studH: p.studH });
  const tc = t.c, c = p.pointClearance;
  const railTop = PLATE_H + 6.4, endTrim = 4, stemHw = 2.5;
  const pieceBottomZ = g.pieceBottomZ, bedTop = g.bedTop, partZ0 = g.layerZ0;
  const W = s.w;
  const sq = (size: Vec2, at: Vec2 = [0, 0]) => s.square(size).translate(at);
  const sweep = (cs: CS, rt: Route, s0 = 0, s1 = Infinity) => sweepRoute(s, cs, rt, s0, s1);
  const atPose = (m: Man, ps: Pose) => T(R(m, [0, 0, ps[2]]), [ps[0], ps[1], 0]);
  const cube = (size: Vec3, at: Vec3) => T(s.cube(size), at);
  const circle = (r: number, fn: number, at: Pt = [0, 0]) => W.CrossSection.circle(r, fn).translate(at);
  const rot2 = (cs: CS, cpt: Pt, a: number) => cs.translate([-cpt[0], -cpt[1]]).rotate(a).translate(cpt);
  const rot3 = (m: Man, cpt: Pt, a: number) => T(R(T(m, [-cpt[0], -cpt[1], 0]), [0, 0, a]), [cpt[0], cpt[1], 0]);

  // ---------- cross-sections ----------
  const rail2d = (o: number) => s.polygon(RAIL_PROFILE.map(([x, y]) => [x + o, y + PLATE_H] as Vec2));
  const blade2d = (o: number) => {
    let cs = rail2d(o).intersect(sq([10, 10], [o - 5, bedTop]));
    if (bedTop > PLATE_H) cs = cs.add(sq([6.2, 0.6], [o - 3.1, bedTop]));
    return cs;
  };
  const flangeBand2d = (o: number, side: number) => {
    const x0 = o + side * HEAD_HW;
    return sq([p.flangeway, p.flangewayDepth + 5], [Math.min(x0, x0 + side * p.flangeway), railTop - p.flangewayDepth]);
  };

  // ---------- a points set's machinery, in plan ----------
  type SetV = PointsSetValues & { three?: { S: Route; L: Route; R: Route; half: number } };
  // a blade's route (its rail is the blade) and the route whose stock rail it lies against
  const bRt = (v: SetV, b: number) => (v.three ? v.three.S : b === 0 ? v.ra : v.rb);
  const bOther = (v: SetV, b: number) => (v.three ? (b === 0 ? v.three.L : v.three.R) : b === 0 ? v.rb : v.ra);
  const bO = (b: number) => (b === 0 ? -G : +G);
  const bSide = (b: number) => (b === 0 ? +1 : -1);
  const bHeel = (v: SetV, b: number): Pt => (b === 0 ? railPoint(v.ra, v.sBpiv, -G) : rotAbout(railPoint(v.rb, v.sBpiv, +G), v.pivotPt, -v.throwAng));
  const stockFootCut = (v: SetV) => s.union([0, 1].map((b) => {
    const side = bSide(b), face = bO(b) + side * HEAD_HW;
    return sweep(sq([10, bedTop + 3 - pieceBottomZ], [side > 0 ? face : face - 10, pieceBottomZ - 1]), bOther(v, b), v.sToe - 2, v.sHeel + g.discR);
  }));
  const bladeStem = (v: SetV, rt: Route, o: number, other: Route, oStock: number) => {
    const side = oStock < 0 ? 1 : -1, face = oStock + side * (HEAD_HW + c);
    return s.intersection(
      sweep(sq([2 * stemHw, bedTop - partZ0], [o - stemHw, partZ0]), rt, v.sToe, v.sHeel - c),
      sweep(sq([30, 20], [side > 0 ? face : face - 30, partZ0 - 1]), other, 0, v.sHeel + 5));
  };
  const blade2dPlan = (v: SetV, b: number): CS => (b === 0
    ? bladeStem(v, v.ra, -G, v.rb, -G)
    : rot3(bladeStem(v, v.rb, +G, v.ra, +G), v.pivotPt, -v.throwAng)).project();
  const tines2d = (v: SetV) => {
    const d = sub(v.tineTip, v.pivotPt), u = mul(d, 1 / norm(d)), n: Pt = [u[1], -u[0]];
    return W.CrossSection.union([-1, 1].map((k) => {
      const off = mul(n, (k * (g.tineGap + p.springThickness)) / 2);
      const a = add(add(v.pivotPt, mul(u, g.discR * 0.5)), off), tt = add(v.tineTip, off);
      return W.CrossSection.hull([circle(p.springThickness / 2, 12, a), circle(p.springThickness / 2, 12, tt)]);
    }));
  };
  const heelBar2d = (v: SetV) => W.CrossSection.hull([0, 1].map((b) => {
    const h = bHeel(v, b), d = sub(v.pivotPt, h);
    return circle(g.heelBarW / 2, 24, add(h, mul(d, (g.heelBarW / 2 - HEAD_HW) / norm(d))));
  }));
  const offR = (cs: CS, r: number) => cs.offset(r, 'Round', 2, frags(r));

  // The points' moving parts ("units"), modelled as assembled for the
  // right-hand route; each turns about its pivot from 0 (right-hand route)
  // to swing (left-hand route). One piece: both blades on a heel bar.
  // Two pieces: each blade on its own pivot, inward of its rail line, with
  // its own disc, tines and slider post.
  interface Unit {
    pivot: Pt; swing: number; discR: number;
    /** blades on it: [blade, its angle as modelled] */
    blades: [number, number][];
    heelBar: boolean; tineTip: Pt; postX: number;
  }
  // (two-piece: each blade's pivot level with its heel, so no part of the
  // blade swings out past it into the stock rail, and far enough inside the
  // rail line for its disc to clear the fixed rail's foot that carries on
  // from the heel)
  const PIVOT_IN = pivotIn(c);
  const unitsCache = new Map<SetV, Unit[]>();
  const units = (v: SetV): Unit[] => {
    let us = unitsCache.get(v);
    if (us) return us;
    if (p.pointsPieces === 1 && !v.three)
      us = [{ pivot: v.pivotPt, swing: v.throwAng, discR: g.discR, blades: [[0, 0], [1, -v.throwAng]], heelBar: true, tineTip: v.tineTip, postX: v.postX[0] }];
    else {
      // (a three-way's slider goes half its travel each way from the middle,
      // straight, where both blades are closed; the closed blade's spring
      // takes the extra travel, the plate-style way)
      const L = v.three ? v.three.half : v.leverTravel, pre = p.springPreload;
      us = [0, 1].map((b): Unit => {
        const rt = bRt(v, b), o = bO(b), inward = bSide(b) * PIVOT_IN;
        const sp = v.sHeel - c;
        const pivot = railPoint(rt, sp, o + inward);
        const tipY = v.yS + 2, tip = railPoint(rt, routeSOf(rt, [0, tipY], 0, -1, 26), o + inward);
        const arm = norm(sub(tip, pivot)) - postL / 2;
        // open: the tines unloaded, centred on the post; closed: the post
        // presses them by the preload. So the swing takes the slider's
        // travel less the preload.
        const swing = ((L - pre) / arm) * (180 / Math.PI);
        const open = b === 0 ? 0 : -swing; // modelled as for the right-hand route: blade 0 closed, blade 1 open
        const tineTip = rotAbout([tip[0], tipY], pivot, open);
        return { pivot, swing, discR: DISC2_R, blades: [[b, open]], heelBar: false, tineTip, postX: tineTip[0] - (b === 0 ? pre + (v.three ? v.three.half : 0) : 0) };
      });
    }
    unitsCache.set(v, us);
    return us;
  };
  const unitTines2d = (u: Unit) => {
    const d = sub(u.tineTip, u.pivot), uu = mul(d, 1 / norm(d)), n: Pt = [uu[1], -uu[0]];
    return W.CrossSection.union([-1, 1].map((k) => {
      const off = mul(n, (k * (g.tineGap + p.springThickness)) / 2);
      const a = add(add(u.pivot, mul(uu, u.discR * 0.5)), off), tt = add(u.tineTip, off);
      return W.CrossSection.hull([circle(p.springThickness / 2, 12, a), circle(p.springThickness / 2, 12, tt)]);
    }));
  };
  const bladePlan = (v: SetV, b: number, at: number, pivot: Pt): CS => (b === 0
    ? rot3(bladeStem(v, bRt(v, 0), -G, bOther(v, 0), -G), pivot, at)
    : rot3(bladeStem(v, bRt(v, 1), +G, bOther(v, 1), +G), pivot, at)).project();
  const pointsSweep2d = (v: SetV, m: number) => W.CrossSection.union(units(v).flatMap((u) => {
    const rng = [0, u.swing];
    return [
      ...(u.heelBar ? [W.CrossSection.hull(rng.map((a) => rot2(offR(heelBar2d(v), m), u.pivot, a)))] : []),
      circle(u.discR + m, 48, u.pivot),
      // (a three-way's closed blade's tines bend the extra half travel)
      W.CrossSection.hull(rng.map((a) => rot2(offR(u.heelBar ? tines2d(v) : unitTines2d(u), p.springPreload + (v.three ? v.three.half : 0) + m + 0.5), u.pivot, a))),
    ];
  }));
  const bladeSlots2d = (v: SetV, m: number) => {
    const n = 8, parts: CS[] = [];
    for (const u of units(v))
      for (const [b, at] of u.blades) {
        const plan2 = bladePlan(v, b, at, u.pivot).offset(m, 'Miter', 1000);
        for (let k = 0; k <= n; k++) parts.push(rot2(plan2, u.pivot, (u.swing * k) / n));
      }
    return W.CrossSection.union(parts);
  };
  const pointsPockets = (v: SetV) => {
    const slots = bladeSlots2d(v, c);
    return s.union([
      T(s.extrude(W.CrossSection.union([pointsSweep2d(v, c), slots]), g.cavityTop - pieceBottomZ + 1), [0, 0, pieceBottomZ - 1]),
      T(s.extrude(slots, bedTop + 2 - pieceBottomZ), [0, 0, pieceBottomZ - 1]),
      ...units(v).map((u) => T(s.cylinder(g.pivotPinUp + c + 0.01, (g.pivotPinD + 2 * c) / 2, (g.pivotPinD + 2 * c) / 2, 32), [u.pivot[0], u.pivot[1], g.cavityTop - 0.01])),
    ]);
  };
  const pointsBed = (v: SetV) => {
    const ov = sleeperLen / 2 - G;
    const y0 = v.toeY > 20 ? v.toeY - 2 : Math.min(v.toeY - 2, 7.9), y1 = v.pointsEndY;
    const thin = (x: number) => sq([0.01, bedTop], [x, 0]);
    return s.intersection(
      cube([400, y1 - y0, bedTop], [-200, y0, 0]),
      W.Manifold.hull([
        sweep(thin(-G - ov), v.ra, 0, v.sHeel + 10), sweep(thin(+G + ov), v.rb, 0, v.sHeel + 10),
        sweep(thin(+G + ov), v.ra, 0, v.sHeel + 10), sweep(thin(-G - ov), v.rb, 0, v.sHeel + 10),
      ]));
  };

  // ---------- rails ----------
  const stockRails = () => s.difference(s.union([
    sweep(rail2d(+G), routes[0], endTrim, routeLength(routes[0]) - endTrim),
    sweep(rail2d(-G), routes[nRoutes - 1], endTrim, routeLength(routes[nRoutes - 1]) - endTrim),
  ]), sets.map(stockFootCut));
  const crossingRails = () => {
    const out: Man[] = [];
    for (let i = 0; i < nRoutes; i++)
      for (const o of [-G, G]) {
        if (plan.isStock(i, o)) continue;
        const cuts: Man[] = [];
        for (const j of plan.others(i)) for (const o2 of [-G, G]) if (!plan.isStock(j, o2)) cuts.push(sweep(flangeBand2d(o2, -Math.sign(o2)), routes[j]));
        for (const v of sets.slice(1)) cuts.push(stockFootCut(v));
        // Every set's pockets (heel bar, disc, tines, blade slots, pivot pin):
        // on a three-way the first set's rails run on through the second
        // set's points, and their feet would block its heel bar and tines
        // (switch.scad doesn't cut them: 107 mm3 of clash at R40).
        for (const v of sets) cuts.push(pointsPockets(v));
        out.push(s.difference(sweep(rail2d(o), routes[i], plan.railFixS(i, o) + c, routeLength(routes[i]) - endTrim), cuts));
      }
    return s.union(out);
  };
  const checkRails = () => {
    const check2d = (x0: number) => sq([p.checkRailW, railTop - 0.4], [x0, 0]);
    return s.union(plan.checkList.map((cr) => {
      const rt = routes[cr[0]], x0 = cr[2], away = cr[3];
      const s0 = cr[5], s1 = cr[6]; // (cr[1] -/+ half the length with two routes; set by hand edits too)
      const fl = 4, stock = -away * G;
      return s.union([
        sweep(check2d(x0), rt, s0 + fl, s1 - fl),
        sweep(sq([Math.abs(stock - x0) + (away < 0 ? 0 : p.checkRailW), railTop - p.flangewayDepth - PLATE_H + 0.01], [Math.min(x0, stock), PLATE_H - 0.01]), rt, s0 + fl, s1 - fl),
        ...[[s0, s0 + fl], [s1, s1 - fl]].map(([e0, e1]) => W.Manifold.hull([
          sweep(check2d(x0), rt, e1 - 0.05, e1 + 0.05), sweep(check2d(x0 + away * p.checkRailFlare), rt, e0 - 0.05, e0 + 0.05)])),
      ]);
    }));
  };

  // ---------- ties ----------
  const studRecess = () => t.studSocket(1 + p.studH + 0.2);
  const endKeepout = () => s.union(plan.endPoses.map((e) => atPose(cube([sleeperLen + 8, 8 + 2 * STUD + 20, 100], [-(sleeperLen / 2 + 4), -(8 + 2 * STUD), -50]), e)));
  const offs = [-1, 1].map((k) => k * (sleeperLen / 2 - 4)).concat(tc.betweenRailsRaw);
  const turnoutTies = () => {
    const railClear = 3.9 + TRACK_DEFAULTS.studD / 2 + 0.3, out: Man[] = [];
    for (const y of plan.longTieYs) {
      const sv = routes.map((_, i) => plan.routeServed(i, y));
      const span = plan.longTieSpan(y);
      const xl = span ? span[0] : 0, xr = span ? span[1] : 0;
      if (!sv.some((v) => !v)) continue;
      const postOk = (q: Pt) => {
        const lats = routes.map((rt) => routeLat(rt, q));
        return q[0] - TRACK_DEFAULTS.studD / 2 > xl + 0.5 && q[0] + TRACK_DEFAULTS.studD / 2 < xr - 0.5
          && Math.min(...lats.flatMap((l) => [-G, G].map((o) => Math.abs(l - o)))) >= railClear
          && !plan.nearCheckRail(q, lats, TRACK_DEFAULTS.studD / 2 + 0.3) && !plan.inEndKeepout(q)
          && (!g.ballast || Math.min(...lats.map((l) => Math.abs(l))) <= g.ballastTopW / 2 - TRACK_DEFAULTS.studD / 2 - 0.3);
      };
      const grid: Pt[] = [];
      for (const dy of [-4, 4]) for (let x = Math.ceil((xl + 0.5) / 8) * 8 - 4; x <= xr - 0.5 + 1e-9; x += STUD) {
        const q: Pt = [x + (x % 8 === 0 ? 4 : 0), y + dy];
        if (postOk(q)) grid.push(q);
      }
      const fill: Pt[] = [];
      for (const rt of routes) for (const o of offs) for (const dy of [-4, 4]) {
        const q: Pt = [plan.railCross(rt, o, y + dy)[0], y + dy];
        if (postOk(q)) fill.push(q);
      }
      const spots = dedupe(fill, grid);
      // (with ballast, kept within its top layer: the ends don't stick out over the step below)
      const tie = cube([xr - xl, sleeperW, PLATE_H], [xl, y - sleeperW / 2, 0]);
      out.push(s.difference(g.ballast ? s.intersection(tie, s.union(routes.map((rt) => sweep(sq([g.ballastTopW, PLATE_H + 2], [-g.ballastTopW / 2, -1]), rt)))) : tie,
        [...(g.ballast ? [] : spots.map((q) => T(studRecess(), [q[0], q[1], -1]))), endKeepout()]));
      for (const q of spots) out.push(T(t.stud(tc.postD, tc.postH), [q[0], q[1], PLATE_H - 0.2]));
    }
    return s.union(out);
  };
  const routeTies = () => {
    const out: Man[] = [];
    routes.forEach((rt, i) => {
      for (const st of plan.routeTieList[i]) {
        const ps = routePose(rt, st);
        const keep: Pt[] = [];
        for (const o of offs) for (const dy of [-4, 4])
          if (plan.latOthers(i, railPoint(rt, st + dy, o)) > sleeperLen / 2 + 1 + TRACK_DEFAULTS.studD / 2 + 0.3) keep.push([o, dy]);
        out.push(s.difference(atPose(cube([sleeperLen, sleeperW, PLATE_H], [-sleeperLen / 2, -sleeperW / 2, 0]), ps), [
          ...plan.others(i).map((j) => sweep(sq([sleeperLen + 2, PLATE_H + 10], [-sleeperLen / 2 - 1, -1]), routes[j])),
          ...(g.ballast ? [] : keep.map((k) => atPose(T(studRecess(), [k[0], k[1], -1]), ps))),
        ]));
        for (const k of keep) out.push(atPose(T(t.stud(tc.postD, tc.postH), [k[0], k[1], PLATE_H - 0.2]), ps));
      }
    });
    return s.union(out);
  };
  // Ties on the lead-in before the points, when the points start further on
  // than the start connector (a branch drawn off along a track): every
  // route runs together there, so one row, square to it, on the grid.
  const leadTiePoses = (): Pose[] => {
    const toeS = Math.min(...sets.map((v) => v.sToe)), out: Pose[] = [];
    for (let st = 8 + 2 * STUD + sleeperW / 2; st + sleeperW / 2 + 2 <= toeS - 2 - 8; st += sleeperW + 2 * STUD) out.push(routePose(routes[0], st));
    return out;
  };
  const leadTies = () => {
    const out: Man[] = [];
    for (const ps of leadTiePoses()) {
      out.push(s.difference(atPose(cube([sleeperLen, sleeperW, PLATE_H], [-sleeperLen / 2, -sleeperW / 2, 0]), ps),
        g.ballast ? [] : offs.flatMap((o) => [-4, 4].map((dy) => atPose(T(studRecess(), [o, dy, -1]), ps)))));
      for (const o of offs) for (const dy of [-4, 4]) out.push(atPose(T(t.stud(tc.postD, tc.postH), [o, dy, PLATE_H - 0.2]), ps));
    }
    return s.union(out);
  };
  const connectors = () => s.union([
    T(t.fullEndpoint(!g.ballast, !g.ballast), [0, 4, 0]),
    ...plan.endPoses.map((e) => atPose(T(R(t.fullEndpoint(!g.ballast, !g.ballast), [0, 0, 180]), [0, -4, 0]), e)),
  ]);

  // ---------- the throw ----------
  const throwArm = (v: SetV) => {
    const xIn = v.throwStockX, xOut = v.leverX + v.throwDir * 10, parts: Man[] = [];
    parts.push(cube([Math.abs(xOut - xIn), g.armW, bedTop - pieceBottomZ], [Math.min(xIn, xOut), v.throwY - g.armW / 2, pieceBottomZ]));
    const cylY = (d: number, h: number, fn: number, at: Vec3) => T(R(T(s.cylinder(h, d / 2, d / 2, fn), [0, 0, -h / 2]), [90, 0, 0]), at);
    for (const sg of [-1, 1]) {
      const ey = v.throwY + sg * (g.leverBossLen / 2 + c + g.leverEarT / 2);
      let ear = W.Manifold.hull([
        cube([8, g.leverEarT, 0.01], [v.leverX - 4, ey - g.leverEarT / 2, PLATE_H - 0.01]),
        cylY(7, g.leverEarT, 32, [v.leverX, ey, g.leverPz]),
        cylY(2 * g.leverBumpR * sind(v.leverAng) + 3.4, g.leverEarT, 32, [v.leverX, ey, g.leverPz + g.leverBumpR]),
      ]);
      if (sg > 0)
        ear = s.difference(ear, [
          cylY(2.4 + 2 * c, 10, 24, [v.leverX, ey, g.leverPz]),
          ...(v.three ? [-v.leverAng, 0, v.leverAng] : [-v.leverAng, v.leverAng]).map((a) => cylY(1.4, 10, 12, [v.leverX + g.leverBumpR * sind(a), ey, g.leverPz + g.leverBumpR * cosd(a)])),
        ]);
      parts.push(ear);
      if (sg < 0) {
        // snap dome: OpenSCAD's sphere(d = 2.4, $fn = 24), squashed to 0.7, turned to point +y
        const pts: Vec3[] = [], rings = 12, r = 1.2;
        for (let i = 0; i < rings; i++) {
          const phi = (180 * (i + 0.5)) / rings;
          for (let j = 0; j < 24; j++) {
            const th = (360 * j) / 24;
            const x = r * sind(phi) * cosd(th), y = r * sind(phi) * sind(th), z = 0.7 * r * cosd(phi);
            // rotate([-90, 0, 0]): (x, y, z) -> (x, z, -y)
            pts.push([v.leverX + x, ey + g.leverEarT / 2 + z, g.leverPz - y]);
          }
        }
        const base = [[0, 0, 0], [1.2, 0, 0], [0, g.leverEarT / 2, 0], [1.2, g.leverEarT / 2, 0], [0, 0, 0.01], [1.2, 0, 0.01], [0, g.leverEarT / 2, 0.01], [1.2, g.leverEarT / 2, 0.01]]
          .map(([x, y, z]) => [v.leverX - 0.6 + x, ey + y, g.leverPz - 1.2 - 0.84 - 0.5 + z] as Vec3);
        parts.push(W.Manifold.hull([...pts, ...base]));
      }
    }
    return s.union(parts);
  };
  const forkHw = g.leverTipD / 2 + c + g.forkWall;
  const throwChannel = (v: SetV) => {
    const w = g.throwRodW + 1 + 2 * c;
    const ends = [...units(v).map((u) => u.postX).flatMap((x) => [x - 1.5, x + v.leverTravel + 1.5]), v.forkX - forkHw, v.forkX + v.leverTravel + forkHw];
    const x0 = Math.min(...ends) - c - 1, x1 = Math.max(...ends) + c + 1;
    const wf = g.leverBossLen + 2 * c;
    const f0 = Math.min(v.forkX - forkHw, v.forkX + v.leverTravel + forkHw) - c - 1, f1 = Math.max(v.forkX - forkHw, v.forkX + v.leverTravel + forkHw) + c + 1;
    return s.union([
      cube([x1 - x0, w, g.layerTop + c - pieceBottomZ + 1], [x0, v.throwY - w / 2, pieceBottomZ - 1]),
      cube([f1 - f0, wf, 30], [f0, v.throwY - wf / 2, pieceBottomZ - 1]),
    ]);
  };

  // ---------- underside ----------
  // (switch_underside(): the base's stud grid, square to the start)
  const underside = () => {
    const xr = plan.baseXRange(plan.baseY0, plan.baseY1), spots: Spot[] = [];
    for (let x = Math.floor(xr[0] / 8) * 8 - 4; x <= xr[1] + 4 + 1e-9; x += 8)
      for (let y = 4; y <= plan.baseY1 + 1e-9; y += 8) spots.push([x, y, roundScad(x / 8), roundScad(y / 8)]);
    const bed = (x: number, y: number, m: number) => y >= 8 + m
      && Math.min(...routes.map((rt) => Math.abs(routeLat(rt, [x, y])))) <= sleeperLen / 2 - m
      // clear of every end connector's base (measured in that end's frame)
      && !plan.endPoses.some((e) => { const dx = x - e[0], dy = y - e[1]; return Math.hypot(dx, dy) < sleeperLen + 16 && dx * sind(e[2]) - dy * cosd(e[2]) < 8 + m; });
    const ty = plan.tieYs(), half = sleeperW / 2 - (TRACK_DEFAULTS.studD + 1) / 2;
    // the solid base round the points, before the first tie, or on a tie
    // (the points' base runs from the points bed's start to the first tie;
    // before it, on a lead-in, only the lead ties are solid)
    const bedY0 = Math.min(...sets.map((v) => (v.toeY > 20 ? v.toeY - 2 : Math.min(v.toeY - 2, 7.9))));
    const leads = leadTiePoses();
    const solid = (x: number, y: number) => (y < bedY0
      ? leads.some((e) => { const l = localOf(e, [x, y]); return Math.abs(l[1]) <= half && Math.abs(l[0]) <= sleeperLen / 2; })
      : ty.length === 0 || y <= ty[0] - sleeperW / 2 - (TRACK_DEFAULTS.studD + 1) / 2 || ty.some((tt) => Math.abs(y - tt) <= half));
    return studSpots(s, t, spots, bed, [1, 0], [0, 1], p.studH + 0.21, 0, solid, p.studGrip);
  };

  // ---------- the moving parts (points, throw, lever) ----------
  const tineFloorT = 0.45, postW = 1.2, postL = 3;
  const bladeSection2d = (o: number) => {
    let cs = blade2d(o);
    for (const sg of [-1, 1])
      cs = cs.subtract(s.polygon([[stemHw, bedTop - 0.01], [3.1, bedTop - 0.01], [3.1, bedTop + 0.3]]).scale([sg, 1]).translate([o, 0]));
    return cs.add(sq([2 * stemHw, bedTop - partZ0 + 0.01], [o - stemHw, partZ0]));
  };
  const blade = (v: SetV, rt: Route, o: number, other: Route, oStock: number) => {
    const side = oStock < 0 ? 1 : -1, face = oStock + side * (HEAD_HW + c);
    return s.intersection(
      sweep(bladeSection2d(o), rt, v.sToe, v.sHeel - c),
      sweep(sq([30, 30], [side > 0 ? face : face - 30, partZ0 - 1]), other, 0, v.sHeel + 5));
  };
  const tineFloor2d = (v: SetV, un?: Unit) => {
    const tip = un ? un.tineTip : v.tineTip, piv = un ? un.pivot : v.pivotPt;
    const d = sub(tip, piv), u = mul(d, 1 / norm(d)), n: Pt = [u[1], -u[0]], cs: CS[] = [];
    for (const k of [-1, 1]) for (const e of [0, 1])
      cs.push(circle(p.springThickness / 2, 12, add(sub(tip, mul(u, e * postL)), mul(n, (k * (g.tineGap + p.springThickness)) / 2))));
    return W.CrossSection.hull(cs);
  };
  /** The fixed rails that carry on from the heels (the points' parts keep clear of their feet). */
  const heelRails = (v: SetV): [Route, number][] => (v.three
    ? [[v.three.S, -G], [v.three.S, +G], [v.three.L, +G], [v.three.R, -G]]
    : [[bRt(v, 0), -G], [bRt(v, 1), +G]]);
  /** A points part as assembled for the right-hand route (points_part; with two-piece points, each blade's). */
  const unitPart = (v: SetV, u: Unit) => {
    const swings = [0, -u.swing];
    const blades = s.difference(
      s.union(u.blades.map(([b, at]) => rot3(blade(v, bRt(v, b), bO(b), bOther(v, b), bO(b)), u.pivot, at))),
      swings.map((a) => rot3(cube([400, g.throwRodW + 2 * c + 0.6, g.layerTop + c - pieceBottomZ + 1], [-200, v.throwY - g.throwRodW / 2 - c - 0.3, pieceBottomZ - 1]), u.pivot, a)));
    const pin = T(s.cylinder(g.cavityTop - g.layerTop + g.pivotPinUp + 0.01, g.pivotPinD / 2, g.pivotPinD / 2, 32), [u.pivot[0], u.pivot[1], g.layerTop - 0.01]);
    const plan2 = W.CrossSection.union([...(u.heelBar ? [heelBar2d(v)] : []), circle(u.discR, 48, u.pivot), u.heelBar ? tines2d(v) : unitTines2d(u)]);
    const layer = s.difference(s.union([
      T(s.extrude(plan2, g.layerTop - partZ0), [0, 0, partZ0]),
      T(s.extrude(tineFloor2d(v, u), tineFloorT), [0, 0, partZ0]),
    ]), [0, u.swing].flatMap((a) => heelRails(v).map(([rt, o]) => rot3(
      sweep(sq([7.8, bedTop + 2 - pieceBottomZ], [o - 3.9, pieceBottomZ - 1]).offset(c, 'Miter', 1000), rt, v.sHeel, v.sHeel + 30), u.pivot, -a))));
    return s.union([blades, pin, layer]);
  };
  const pointsPart = (v: SetV) => unitPart(v, units(v)[0]);
  /** The throw (slider), as assembled for the right-hand route (throw_part). */
  const throwPart = (v: SetV) => {
    const z0 = g.layerZ0, z1 = g.layerTop, rodW = g.throwRodW;
    const posts = units(v).map((u) => u.postX), xs = [...posts, v.forkX], x0 = Math.min(...xs) - 1.5, x1 = Math.max(...xs) + 1.5;
    const slotW = g.leverTipD + 2 * c, m = v.forkMouthHw;
    const body = s.union([
      cube([x1 - x0, rodW, z1 - z0], [x0, v.throwY - rodW / 2, z0]),
      ...posts.map((x) => cube([postW, rodW / 2 + postL, z1 - z0 - tineFloorT - 0.15], [x - postW / 2, v.throwY, z0 + tineFloorT + 0.15])),
      cube([2 * forkHw, rodW, v.forkTop - z0], [v.forkX - forkHw, v.throwY - rodW / 2, z0]),
    ]);
    const slot2d = W.CrossSection.union([
      sq([slotW, v.leverTipZ - z0 - 0.6], [-slotW / 2, z0 + 0.6]),
      W.CrossSection.hull([circle(slotW / 2, 32, [0, v.leverTipZ]), circle(slotW / 2, 32, [0, g.leverTipLow])]),
      sq([2 * m, v.forkTop - v.leverTipZ + 0.01], [-m, v.leverTipZ]),
      s.polygon([[-m, v.forkTop - 0.4], [m, v.forkTop - 0.4], [m + 0.5, v.forkTop + 0.01], [-m - 0.5, v.forkTop + 0.01]]),
    ]);
    // (linear_extrude(2 * rod w, center = true), turned upright along y)
    const slot = T(R(T(s.extrude(slot2d, 2 * rodW), [0, 0, -rodW]), [90, 0, 0]), [v.forkX, v.throwY, 0]);
    return s.difference(body, [slot]);
  };
  /** The lever, upright, origin at the pivot (lever_shape). */
  const leverShape = () => {
    const tt = g.leverBossLen;
    const cylY = (d: number, h: number, fn: number) => R(T(s.cylinder(h, d / 2, d / 2, fn), [0, 0, -h / 2]), [90, 0, 0]);
    const body = s.difference(s.union([
      cylY(g.leverBossD, tt, 32),
      cube([g.leverDrvW, tt, g.leverDa], [-g.leverDrvW / 2, -tt / 2, -g.leverDa]),
      T(cylY(g.leverTipD, tt, 24), [0, 0, -g.leverDa]),
      cube([2.5, tt, 14], [-1.25, -tt / 2, 0]),
      s.intersection(T(sphereScad(s, 3, 32), [0, 0, 14]), cube([10, 10, 10], [-5, -tt / 2, 9])),
    ]), [T(R(s.cylinder(1.2, (2.4 + 2 * c) / 2, (2.4 + 2 * c) / 2, 24), [-90, 0, 0]), [0, -tt / 2 - 0.01, 0])]);
    return s.union([
      body,
      T(R(sphereScad(s, 1.2, 24, 0.7), [-90, 0, 0]), [0, tt / 2, 0]),
      T(sphereScad(s, 0.6, 12), [0, tt / 2, g.leverBumpR]),
    ]);
  };
  /** The lever as assembled, swung to the right-hand route's position (lever_part). */
  const leverPart = (v: SetV) => T(R(leverShape(), [0, v.leverAng, 0]), [v.leverX, v.throwY, g.leverPz]);
  /** The lever lying on its -y face, ready to print (part = "lever"). */
  const leverPrint = () => T(R(leverShape(), [90, 0, 0]), [0, 0, g.leverBossLen / 2]);

  // ---------- ballast (switch.scad's switch_ballast, with generate_ballast) ----------
  const studD = TRACK_DEFAULTS.studD;
  const routeBallast = (rt: Route) => sweep(W.CrossSection.union([
    sq([g.ballastTopW, g.ballastThickness], [-g.ballastTopW / 2, g.ballastOffsetZ]),
    sq([g.ballastMidW, g.ballastThickness / 2], [-g.ballastMidW / 2, g.ballastOffsetZ]),
  ]), rt);
  const routeBuddy = (rt: Route) => sweep(sq([g.ballastBottomW, g.buddyT], [-g.ballastBottomW / 2, g.ballastOffsetZ - g.buddyT]), rt);
  /** route_row_pts: stud spots along route i at offset o, about 8 mm apart, none under another route's higher layer (half-width hwUp). */
  const routeRowPts = (i: number, o: number, hwUp: number): Pt[] => {
    const rt = routes[i], st = segStarts(rt), out: Pt[] = [];
    rt.segments.forEach((sg, si) => {
      const l = sg.kind === 'straight' ? sg.length : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180;
      const rowL = sg.kind === 'straight' ? l : (l * (sg.radius + Math.sign(sg.angle) * o)) / sg.radius;
      const n = Math.max(1, roundScad(rowL / STUD)), first = si === 0 ? 4 : 0, last = si === rt.segments.length - 1 ? l - 4 : l;
      for (let k = 0; k <= n; k++) {
        const q = railPoint(rt, st[si] + first + (k * (last - first)) / n, o);
        if ((si === 0 || k > 0) && plan.latOthers(i, q) > hwUp + studD / 2 + 0.5) out.push(q);
      }
    });
    return out;
  };
  const stepStuds = (o: number, z: number, hwUp: number) => {
    const last = nRoutes - 1;
    const pts = dedupe([...routeRowPts(0, +o, hwUp), ...routeRowPts(last, -o, hwUp),
      ...routes.flatMap((_, i) => (i === 0 ? [-1] : i === last ? [+1] : [-1, +1]).flatMap((sd) => routeRowPts(i, sd * o, hwUp)))]);
    return s.union(pts.map((q) => T(t.stud(), [q[0], q[1], z - 0.01])));
  };
  // top-layer studs: on every free spot of the top layer (switch.scad's top_stud_pts)
  const topStudPts = (): Pt[] => {
    const r0 = studD / 2 + 0.3, set0 = sets[0];
    const curved = routes.map((rt) => rt.segments.some((sg) => sg.kind === 'arc'));
    const tiePoses = routes.flatMap((rt, i) => plan.routeTieList[i].map((st) => routePose(rt, st)));
    const longSpans = plan.longTieYs.map((y) => { const sp = plan.longTieSpan(y); return sp && [y, sp[0], sp[1]] as const; }).filter((x): x is readonly [number, number, number] => !!x);
    const routeZoneS = (i: number) => (plan.routeTieList[i].length ? Math.min(...plan.routeTieList[i]) - sleeperW / 2 - 2 * STUD : 1e9);
    const zonePoses = routes.map((rt, i) => (routeZoneS(i) < 1e8 ? routePose(rt, routeZoneS(i)) : undefined));
    const local = (pose: Pose, q: Pt): Pt => { const dx = q[0] - pose[0], dy = q[1] - pose[1]; return [dx * cosd(pose[2]) + dy * sind(pose[2]), -dx * sind(pose[2]) + dy * cosd(pose[2])]; };
    const inOuterStrip = (q: Pt) => routes.some((rt, i) => {
      const out = (i === 0 ? 1 : -1) * routeLat(rt, q);
      return curved[i] && (i === 0 || i === nRoutes - 1) && out > G + 3.9 && plan.latOthers(i, q) > g.ballastTopW / 2;
    });
    const inRouteZone = (q: Pt, m = 0, only = -1) => {
      for (let i = 0; i < nRoutes; i++) {
        const zp = zonePoses[i];
        if ((only < 0 || only === i) && zp && local(zp, q)[1] >= -m && Math.abs(routeLat(routes[i], q)) <= g.ballastTopW / 2 + m) return i;
      }
      return -1;
    };
    const nearLever = (q: Pt, r: number) => {
      const earHw = g.leverBossLen / 2 + c + g.leverEarT, wf = g.leverBossLen / 2 + c;
      return plan.setData.some((d) => (Math.abs(q[0] - d.leverX) < 4 + r && Math.abs(q[1] - d.throwY) < earHw + r)
        || (Math.abs(q[0] - d.leverX) < d.leverTravel / 2 + forkHw + 1.5 + r && Math.abs(q[1] - d.throwY) < wf + r));
    };
    const spotFree = (q: Pt) => {
      const r = r0;
      if (q[1] <= 8 + r || nearLever(q, r)) return false;
      const lats = routes.map((rt) => routeLat(rt, q)), latR = lats[0], latL = lats[nRoutes - 1];
      const outside = latL < -G - 3.9 - r || latR > G + 3.9 + r;
      if (q[1] <= set0.pointsEndY + r && !outside) return false;
      if (plan.setData.slice(1).some((d) => q[1] >= d.toeY - 2 - r && q[1] <= d.pointsEndY + r && !outside)) return false;
      if (Math.min(...lats.map(Math.abs)) > g.ballastTopW / 2 - r) return false;
      if (Math.min(...lats.flatMap((l) => [-G, G].map((o) => Math.abs(l - o)))) < 3.9 + r) return false;
      if (plan.nearCheckRail(q, lats, r)) return false;
      if (longSpans.some((tt) => Math.abs(q[1] - tt[0]) < sleeperW / 2 + r && q[0] > tt[1] - r && q[0] < tt[2] + r) && !plan.inEndKeepout(q)) return false;
      if (tiePoses.some((tp) => { const l = local(tp, q); return Math.abs(l[1]) < sleeperW / 2 + r && Math.abs(l[0]) < sleeperLen / 2 + r; })) return false;
      return !plan.endPoses.some((e) => { const l = local(e, q); return l[1] > -8 - r && Math.abs(l[0]) < sleeperLen / 2 + r; });
    };
    const offsAll = [-1, 1].map((k) => k * (sleeperLen / 2 - 4)).concat(tc.betweenRailsRaw);
    const zonePts: Pt[] = [];
    routes.forEach((rt, i) => {
      const sz = routeZoneS(i);
      if (sz >= 1e8) return;
      for (let sk = routeLength(rt) - 8 - STUD / 2; sk >= sz - studD - 0.5 - STUD - 1e-9; sk -= STUD)
        for (const o of offsAll) { const q = railPoint(rt, sk, o); if (spotFree(q) && inRouteZone(q, studD + 0.5, 1 - i) < 0) zonePts.push(q); }
    });
    const xr = plan.baseXRange(plan.baseY0, plan.baseY1), rows: number[] = [];
    for (let y = 12; y <= plan.baseY1 + 1e-9; y += STUD) rows.push(y);
    const sqPts: Pt[] = [];
    for (const y of rows) for (let x = Math.floor(xr[0] / 8) * 8 + 4; x <= xr[1] + 1e-9; x += STUD) {
      const q: Pt = [x, y]; if (inRouteZone(q, studD + 0.5) < 0 && !inOuterStrip(q) && spotFree(q)) sqPts.push(q);
    }
    const fill: Pt[] = [];
    for (const rt of routes) for (const o of offsAll) for (const y of rows) {
      const q: Pt = [plan.railCross(rt, o, y)[0], y]; if (inRouteZone(q, studD + 0.5) < 0 && spotFree(q)) fill.push(q);
    }
    const main = dedupe([...sqPts, ...fill], dedupe(zonePts));
    const armPts: Pt[] = [];
    for (const d of plan.setData) for (let x = Math.floor(d.armX0 / 8) * 8 + 4; x <= d.armX1 + 1e-9; x += STUD) for (let y = 12; y <= d.throwY + g.armW / 2 + 1e-9; y += STUD) {
      const r = r0, q: Pt = [x, y];
      if (x - r > d.armX0 && x + r < d.armX1 && Math.abs(y - d.throwY) + r < g.armW / 2 && !nearLever(q, r)
        && Math.abs(routeLat(d.throwStockRt, q) - d.throwDir * G) >= 3.9 + r) armPts.push(q);
    }
    return dedupe(armPts, main);
  };
  const switchBallast = () => {
    const ballast = s.difference(s.union(routes.map(routeBallast)), [
      cube([sleeperLen + STUD, 12, PLATE_H + 1], [-(sleeperLen + STUD) / 2, -4, 0]),
      ...plan.endPoses.map((e) => atPose(cube([sleeperLen + STUD, 12, PLATE_H + 1], [-(sleeperLen + STUD) / 2, -8, 0]), e)),
    ]);
    return s.union([
      ballast,
      s.union(topStudPts().map((q) => T(t.stud(), [q[0], q[1], PLATE_H - 0.01]))),
      stepStuds(g.ballastMidW / 2 - 4, 0, g.ballastTopW / 2),
      ...(g.buddy ? [...routes.map(routeBuddy), stepStuds(g.ballastBottomW / 2 - 4, g.ballastOffsetZ, g.ballastMidW / 2)] : []),
    ]);
  };
  // anti-stud bottom (bottom_style antistud): the bottom layer's outline hollowed inside a rim, LEGO tubes on the grid
  const antistudParts = () => {
    const outline = W.CrossSection.union([
      ...routes.map((rt) => (g.buddy ? routeBuddy(rt) : sweep(sq([g.ballastMidW, 0.1], [-g.ballastMidW / 2, g.ballastOffsetZ]), rt)).project()),
      ...sets.map((v) => throwArm(v).project()),
    ]);
    let cav = outline.offset(-1.39, 'Miter', 1000);
    for (const yc of plan.baseCuts) cav = cav.subtract(sq([2000, 2 * 1.39 + 8], [-1000, yc - 1.39 - 4]));
    const xr = plan.baseXRange(plan.baseY0, plan.baseY1), socks: CS[] = [];
    for (let x = Math.floor(xr[0] / 8) * 8 + 4; x <= xr[1] + 1e-9; x += 8) for (let y = 4; y <= plan.baseY1 + 1e-9; y += 8) socks.push(getSocketShape() === 'round' ? circle(tc.studSocketW / 2, 24, [x, y]) : W.CrossSection.square([tc.studSocketW, tc.studSocketW], true).translate([x, y]));
    const under = T(s.extrude(W.CrossSection.union([cav, ...socks]), g.bottomCavity + 0.01), [0, 0, pieceBottomZ - 0.01]);
    const rings: CS[] = [];
    for (let x = Math.floor(xr[0] / 8) * 8; x <= xr[1] + 1e-9; x += 8) for (let y = 0; y <= plan.baseY1 + 1e-9; y += 8)
      rings.push(circle((6.51 - 0.06) / 2, 32, [x, y]).subtract(circle((4.8 + 0.06) / 2, 32, [x, y])));
    const tubes = T(s.extrude(W.CrossSection.union(rings).intersect(cav), g.bottomCavity), [0, 0, pieceBottomZ]);
    return { under, tubes };
  };

  /** Where the base's anti-stud tubes grip (filled in by base()). */
  const grips: [number, number][] = [];
  // ---------- the base ----------
  const base = (parts?: Record<string, Man>) => {
    const named: Record<string, Man> = {
      stockRails: stockRails(), crossingRails: crossingRails(), checkRails: checkRails(),
      // (each set's bed less every set's pockets: on a three-way the sets can
      // overlap, and switch.scad cuts each bed by its own pockets only)
      pointsBeds: s.difference(s.union(sets.map(pointsBed)), sets.map(pointsPockets)),
      turnoutTies: turnoutTies(), routeTies: routeTies(), leadTies: leadTies(), connectors: connectors(),
  };
  if (parts) Object.assign(parts, named, { throwArms: s.union(sets.map(throwArm)), throwChannels: s.union(sets.map(throwChannel)) });
  if (g.ballast) {
    // on ballast: the ballast (less the points' pockets) under the track, the anti-stud bottom or a flat one
    const bal = s.difference(switchBallast(), sets.map(pointsPockets));
    const ast = g.antistud ? antistudParts() : undefined;
    const bodyB = s.difference(s.union([bal, ...Object.values(named), ...sets.map(throwArm)]), [...sets.map(throwChannel), ...(ast ? [ast.under] : [])]);
    const supportZ = pieceBottomZ - 0.02;
    return s.union([
      bodyB,
      ast && s.difference(ast.tubes, [...sets.map(pointsPockets), ...sets.map(throwChannel)]),
      t.startRailSupports(supportZ), t.supportFooting(supportZ, 0, -1),
      ...plan.endPoses.map((e) => atPose(s.union([t.endRailSupports(supportZ), t.supportFooting(supportZ, 0, +1)]), e)),
    ]);
  }
  const track = s.union(Object.values(named));
  const us = underside();
  grips.push(...us.grips);
  const body = s.difference(s.union([track, ...sets.map(throwArm)]), [...sets.map(throwChannel), us.cut, ...extraCuts]);
  const supportZ = pieceBottomZ - 0.02;
  // The tubes, less the pockets, and only those that hold on to something
  // above them (a tube under a gap between ties, or a pocket, would print
  // as a loose ring).
  let tubes: Man | undefined;
  if (us.shapes?.length) {
    // in plan: the floor over the hollow (ties, sleepers, the points' bed,
    // the connectors) less the pockets and the channel; a tube or post
    // stays only where it meets some of it
    const floor = s.union([named.turnoutTies, named.routeTies, named.leadTies, named.pointsBeds, named.connectors]).project()
      .subtract(W.CrossSection.union([...sets.flatMap((v) => [pointsSweep2d(v, c), bladeSlots2d(v, c)]), ...sets.map((v) => throwChannel(v).project())]));
    const keep = us.shapes.filter((q) => q.cs.intersect(floor).area() > 1);
    grips.length = 0; grips.push(...keep.filter((q) => q.tube).map((q) => q.c));
    tubes = keep.length ? s.difference(s.extrude(W.CrossSection.union(keep.map((q) => q.cs)), PLATE_H), [...sets.map(pointsPockets), ...sets.map(throwChannel)]) : undefined;
  }
  if (parts) { parts.body = body; if (tubes) parts.tubes = tubes; }
  return s.union([
    body,
    tubes,
    t.startRailSupports(supportZ), t.supportFooting(supportZ, 0, -1),
    ...plan.endPoses.map((e) => atPose(s.union([t.endRailSupports(supportZ), t.supportFooting(supportZ, 0, +1)]), e)),
  ]);
  };
  // ---------- splitting the base for the print bed (switch_base_split) ----------
  // Cut straight across through the joint ties (plan.baseCuts); each rail
  // crossing a cut gets interlocking rail-end tongues (the track
  // connectors'), turned to the rail's heading, and the tie halves snap pegs
  // and C-clips, as LEGO track pieces join.
  const cutRails = (yc: number) => routes.flatMap((rt) => [-G, G].map((o) => { const cr = plan.railCross(rt, o, yc); return [cr[0], cr[1], Math.sign(o)] as const; }));
  const couplerXs = (yc: number) => {
    const rs = cutRails(yc), rL = routes[nRoutes - 1], rR = routes[0];
    const xl = railPoint(rL, routeSOf(rL, [0, yc], 0, -1, 26), -G)[0] - 12 + 5, xr = railPoint(rR, routeSOf(rR, [0, yc], 0, -1, 26), +G)[0] + 12 - 5;
    const ok: number[] = [];
    for (let x = xl; x <= xr + 1e-9; x += 0.5) if (Math.min(...rs.map((r) => Math.abs(x - r[0]))) >= 9) ok.push(x);
    const mid = (xl + xr) / 2, got: number[] = [];
    for (const x of [...ok].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid)))
      if (got.length < 3 && got.every((g2) => Math.abs(g2 - x) >= 16)) got.push(x);
    return got;
  };
  const cz0 = pieceBottomZ, ch = PLATE_H - cz0;
  const atCut = (m: Man, x: number, yc: number, side: number, heading = 0) => T(R(m, [0, 0, heading + (side < 0 ? 180 : 0)]), [x, yc, 0]);
  const couplerSocket = () => T(s.cylinder(ch + 1, 2.1, 1.9, 32), [0, 0, cz0 - 0.5]);
  const couplerNotch = () => T(t.attachPoly(ch + 1), [-4, -0.11, cz0 - 0.5]);
  const couplerPeg = () => s.difference(s.union([T(s.cylinder(ch, 1, 1, 32), [0, 1.8, cz0]), T(s.cylinder(ch, 1.9, 2.1, 32), [0, 0, cz0])]), [T(s.cylinder(ch + 1, 0.8, 0.8, 32), [0, 0, cz0 - 0.5])]);
  const couplerTab = () => s.difference(T(M(s.extrude(s.polygon([[-0.3, 0], [1.7, 1.9], [6.3, 1.9], [8.3, 0]]), ch), [0, 1, 0]), [-4, 0.3, cz0]), [couplerSocket()]);
  const cutTongue = (type: number, z0: number) => s.union([
    T(type < 0 ? t.railEndpointLeft() : t.railEndpointRight(), [-4, -4, 0]),
    type < 0 ? T(t.railSupport(3, 3.23 - z0), [-3.3, -3, z0]) : T(t.railSupport(4, 2.08 - z0), [-2.2, -3, z0]),
  ]);
  const cutRemovals = (yc: number) => s.union([
    ...cutRails(yc).map((r) => atCut(cube([8, 8, 30], [-4, -4, -1]), r[0], yc, 1, r[1])),
    ...couplerXs(yc).flatMap((x) => [atCut(couplerNotch(), x, yc, 1), atCut(couplerSocket(), x, yc, 1)]),
  ]);
  const cutJoint = (yc: number, side: number) => s.union([
    ...cutRails(yc).map((r) => atCut(cutTongue(side > 0 ? r[2] : -r[2], pieceBottomZ - 0.02), r[0], yc, side, r[1])),
    ...couplerXs(yc).map((x) => (side > 0 ? atCut(couplerPeg(), x, yc, 1) : atCut(couplerTab(), x, yc, -1))),
  ]);
  /** The base in pieces that fit the print bed (one piece if it fits whole). */
  const basePieces = (): Man[] => {
    const cuts = plan.baseCuts, whole = base();
    if (!cuts.length) return [whole];
    const cutBase = s.difference(whole, cuts.map(cutRemovals));
    const b = [-1e4, ...cuts, 1e4];
    return b.slice(0, -1).map((y0, k) => s.union([
      s.intersection(cutBase, cube([2e4, b[k + 1] - y0, 200], [-1e4, y0, -100])),
      k > 0 && cutJoint(cuts[k - 1], +1),
      k < cuts.length && cutJoint(cuts[k], -1),
    ]));
  };

  /**
   * One points set's machinery on its own, for points built into a bigger
   * piece (switch/network.ts): the raised bed, its pockets, the planed stock
   * feet, the throw arm and its channel, and the cuts that take out the
   * routes' rails the blades replace ([route, cut] in this frame).
   */
  const mech = (k = 0) => {
    const v = sets[k];
    return {
      bed: pointsBed(v), pockets: pointsPockets(v), stockCut: stockFootCut(v), arm: throwArm(v), channel: throwChannel(v),
      bladeRails: [0, 1].map((b) => [b === 0 ? v.ra : v.rb, sweep(sq([9, 30], [bO(b) - 4.5, -5]), bRt(v, b), 0, v.sHeel + c)] as [Route, Man]),
    };
  };
  return {
    base, basePieces, mech,
    pointsPart: (k = 0) => pointsPart(sets[k]),
    /** The points' parts: one, or one per blade (pointsPieces 2). */
    pointsParts: (k = 0) => units(sets[k]).map((u) => unitPart(sets[k], u)),
    /** Each points part's pivot and swing (to turn it to the left-hand route). */
    pointsUnits: (k = 0) => units(sets[k]).map((u) => ({ pivot: u.pivot, swing: u.swing })),
    throwPart: (k = 0) => throwPart(sets[k]),
    leverPart: (k = 0) => leverPart(sets[k]),
    leverShape, leverPrint,
    grips,
  };
}

