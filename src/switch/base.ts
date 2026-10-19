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
import { railPoint, routeLat, routeLength, routePose, routeSOf } from '../route/route';
import { R, T, type CS, type Man, type Scad, type Vec2, type Vec3 } from '../geom/scad';
import { sweepRoute } from '../geom/sweep';
import { type Spot, studSpots } from '../geom/underside';
import { DEFAULTS as TRACK_DEFAULTS, PLATE_H, RAIL_PROFILE, STUD, Track } from '../geom/track';
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
}

export const BASE_DEFAULTS: BaseParams = {
  gaugeStuds: 4, pointThrow: 3, pointClearance: 0.3, springPreload: 1, springThickness: 0.9,
  springLength: 40, bladeDiscD: 14, leverOffset: 8, studH: 1.8, generateBallast: false,
  flangeway: 3, flangewayDepth: 3, checkRailLen: 30, checkRailW: 1, checkRailFlare: 1.5,
  printBedX: 256, printBedY: 256, studGrip: 'edges',
};

/** A points set: [right-hand route, left-hand route, toe (arc length), throw side or undefined]. */
export type SetSpec = [number, number, number, number?];

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

/** Everything switch.scad works out before building: routes, sets, frogs, check rails, ties, cuts. */
export function switchPlan(routes: Route[], specs: SetSpec[], p: BaseParams = BASE_DEFAULTS, defaultThrowDir = 1) {
  const g = switchGlobals(p), G = g.G;
  const tc = new Track({} as Scad, { ...TRACK_DEFAULTS, gaugeStuds: p.gaugeStuds, studH: p.studH }).c;
  const sleeperW = tc.sleeperW, sleeperLen = tc.sleeperLen;
  const nRoutes = routes.length;
  const sets = specs.map((ps) => pointsSet(routes, { ra: ps[0], rb: ps[1], sToe: ps[2], tside: ps[3] }, p, defaultThrowDir));
  const set0 = sets[0];
  const others = (i: number) => routes.map((_, j) => j).filter((j) => j !== i);
  const latOthers = (i: number, q: Pt) => Math.min(...others(i).map((j) => Math.abs(routeLat(routes[j], q))));
  const isStock = (i: number, o: number) => (i === 0 && o > 0) || (i === nRoutes - 1 && o < 0);
  const railFixS = (i: number, o: number) => Math.max(0, ...specs.map((ps, k) => ((ps[0] === i && o < 0) || (ps[1] === i && o > 0) ? sets[k].sHeel : -Infinity)));

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
    throwDir: v.throwDir, throwStockX: v.throwStockX,
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
  const baseHw = sleeperLen / 2;
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
  return {
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
/** parts, if given, gets the main parts by name (for checks). */
export function switchBase(s: Scad, plan: SwitchPlan, parts?: Record<string, Man>): Man {
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
  type SetV = PointsSetValues;
  const bRt = (v: SetV, b: number) => (b === 0 ? v.ra : v.rb);
  const bOther = (v: SetV, b: number) => (b === 0 ? v.rb : v.ra);
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
  const pointsSweep2d = (v: SetV, m: number) => W.CrossSection.union([
    W.CrossSection.hull(v.swingRange.map((a) => rot2(offR(heelBar2d(v), m), v.pivotPt, a))),
    W.CrossSection.hull(v.swingRange.map((a) => rot2(circle(g.discR + m, 48, v.pivotPt), v.pivotPt, a))),
    W.CrossSection.hull(v.swingRange.map((a) => rot2(offR(tines2d(v), p.springPreload + m + 0.5), v.pivotPt, a))),
  ]);
  const bladeSlots2d = (v: SetV, m: number) => {
    const n = 8, parts: CS[] = [];
    for (const b of [0, 1]) {
      const plan2 = blade2dPlan(v, b).offset(m, 'Miter', 1000);
      for (let k = 0; k <= n; k++) parts.push(rot2(plan2, v.pivotPt, v.swingRange[0] + ((v.swingRange[1] - v.swingRange[0]) * k) / n));
    }
    return W.CrossSection.union(parts);
  };
  const pointsPockets = (v: SetV) => {
    const slots = bladeSlots2d(v, c);
    return s.union([
      T(s.extrude(W.CrossSection.union([pointsSweep2d(v, c), slots]), g.cavityTop - pieceBottomZ + 1), [0, 0, pieceBottomZ - 1]),
      T(s.extrude(slots, bedTop + 2 - pieceBottomZ), [0, 0, pieceBottomZ - 1]),
      T(s.cylinder(g.pivotPinUp + c + 0.01, (g.pivotPinD + 2 * c) / 2, (g.pivotPinD + 2 * c) / 2, 32), [v.pivotPt[0], v.pivotPt[1], g.cavityTop - 0.01]),
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
        out.push(s.difference(sweep(rail2d(o), routes[i], plan.railFixS(i, o) + c, routeLength(routes[i]) - endTrim), cuts));
      }
    return s.union(out);
  };
  const checkRails = () => {
    const check2d = (x0: number) => sq([p.checkRailW, railTop - 0.4], [x0, 0]);
    return s.union(plan.checkList.map((cr) => {
      const rt = routes[cr[0]], x0 = cr[2], away = cr[3];
      const s0 = nRoutes === 2 ? cr[1] - p.checkRailLen / 2 : cr[5], s1 = nRoutes === 2 ? cr[1] + p.checkRailLen / 2 : cr[6];
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
          && !plan.nearCheckRail(q, lats, TRACK_DEFAULTS.studD / 2 + 0.3) && !plan.inEndKeepout(q);
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
      out.push(s.difference(cube([xr - xl, sleeperW, PLATE_H], [xl, y - sleeperW / 2, 0]),
        [...spots.map((q) => T(studRecess(), [q[0], q[1], -1])), endKeepout()]));
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
          ...keep.map((k) => atPose(T(studRecess(), [k[0], k[1], -1]), ps)),
        ]));
        for (const k of keep) out.push(atPose(T(t.stud(tc.postD, tc.postH), [k[0], k[1], PLATE_H - 0.2]), ps));
      }
    });
    return s.union(out);
  };
  const connectors = () => s.union([
    T(t.fullEndpoint(true, true), [0, 4, 0]),
    ...plan.endPoses.map((e) => atPose(T(R(t.fullEndpoint(true, true), [0, 0, 180]), [0, -4, 0]), e)),
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
          ...[-v.leverAng, v.leverAng].map((a) => cylY(1.4, 10, 12, [v.leverX + g.leverBumpR * sind(a), ey, g.leverPz + g.leverBumpR * cosd(a)])),
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
    const ends = [...v.postX.flatMap((x) => [x - 1.5, x + v.leverTravel + 1.5]), v.forkX - forkHw, v.forkX + v.leverTravel + forkHw];
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
    const solid = (_x: number, y: number) => ty.length === 0 || y <= ty[0] - sleeperW / 2 - (TRACK_DEFAULTS.studD + 1) / 2
      || ty.some((tt) => Math.abs(y - tt) <= half);
    return studSpots(s, t, spots, bed, [1, 0], [0, 1], p.studH + 0.21, 0, solid, p.studGrip);
  };

  // ---------- the base ----------
  const named: Record<string, Man> = {
    stockRails: stockRails(), crossingRails: crossingRails(), checkRails: checkRails(),
    pointsBeds: s.union(sets.map((v) => s.difference(pointsBed(v), [pointsPockets(v)]))),
    turnoutTies: turnoutTies(), routeTies: routeTies(), connectors: connectors(),
  };
  if (parts) Object.assign(parts, named, { throwArms: s.union(sets.map(throwArm)), throwChannels: s.union(sets.map(throwChannel)) });
  const track = s.union(Object.values(named));
  const us = underside();
  const body = s.difference(s.union([track, ...sets.map(throwArm)]), [...sets.map(throwChannel), us.cut]);
  const supportZ = pieceBottomZ - 0.02;
  if (parts) { parts.body = body; if (us.tubes) parts.tubes = s.difference(us.tubes, [...sets.map(pointsPockets), ...sets.map(throwChannel)]); }
  return s.union([
    body,
    us.tubes && s.difference(us.tubes, [...sets.map(pointsPockets), ...sets.map(throwChannel)]),
    t.startRailSupports(supportZ), t.supportFooting(supportZ, 0, -1),
    ...plan.endPoses.map((e) => atPose(s.union([t.endRailSupports(supportZ), t.supportFooting(supportZ, 0, +1)]), e)),
  ]);
}

