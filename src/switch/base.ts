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
import { hollowGrid, type Spot, studSpots } from '../geom/underside';
import { DEFAULTS as TRACK_DEFAULTS, getSocketShape, scadParity, PLATE_H, RAIL_PROFILE, STUD, Track } from '../geom/track';
import { type FdbBladeLayout, HEAD_HW, pointsSet, type PointsSetValues, STAND, type SwitchParams, switchGlobals } from './context';

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
 * Last, this set's own lever settings (moved by hand in the editor), over
 * the switch's.
 */
export type SetSpec = [number, number, number, number?, number?, SetOver?];
export interface SetOver { leverOffset?: number; springLength?: number }

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

// ---------- the plate-style blades: where their pins and posts go ----------
// (the plate's sizes; see switchGeometry's plate-style section)
const FDB = { plateT: 1.6, plateW: 10, pivotIn: 7, pinD: 4, discR: 5, tongueW: 3.6, tongueL: 9, slotW: 0.7, postD: 2.2, rodW: 4 };
// (spring-back tongues: the plate wider for them; the beam's length and width, the wall round the post's hole)
const SB = { plateW: 14, len: 21, beamW: 1.4, padWall: 0.9 };
/** How much plate there must be round the pin's hole and alongside the tongue's slot (mm). */
const FDB_RIM = 2;
type SetLike = PointsSetValues & { three?: { S: Route; L: Route; R: Route; half: number } };
/** Spring-back tongues (throwAction 'springback'), not on a three-way: its blades go twice as far. */
const fdbSpringback = (p: BaseParams, sets: object[]) => p.mechStyle === 'plates' && p.throwAction === 'springback' && !sets.some((v) => 'three' in v);
/** A blade plate's width: with spring-back tongues wide enough for the tongue to give its all and leave 1.2 each side. */
function fdbPlateW(v: SetLike, p: BaseParams, springback: boolean) {
  if (!springback) return FDB.plateW;
  const G = switchGlobals(p).G, pivY = railPoint(v.ra, v.sHeel - 4, -G)[1];
  const give = p.pointThrow * Math.max(0, pivY - v.throwY) / Math.max(1, pivY - v.toeY) + p.springPreload + 0.3;
  return Math.max(SB.plateW, 2 * (give + FDB.postD / 2 * Math.SQRT2 + p.pointClearance + SB.padWall + 0.4 + 1.2));
}
/** The rail's half-width (its section's widest) between heights z0 and z1. */
function railHalfW(z0: number, z1: number) {
  const P = RAIL_PROFILE.map(([x, y]) => [x, y + PLATE_H]);
  let m = 0;
  P.forEach(([ax, ay], i) => {
    const [bx, by] = P[(i + 1) % P.length], lo = Math.max(z0, Math.min(ay, by)), hi = Math.min(z1, Math.max(ay, by));
    if (lo > hi) return;
    const xAt = (z: number) => (ay === by ? Math.max(Math.abs(ax), Math.abs(bx)) : Math.abs(ax + ((bx - ax) * (z - ay)) / (by - ay)));
    m = Math.max(m, xAt(lo), xAt(hi));
  });
  return m;
}
const unit = (v: Pt): Pt => mul(v, 1 / norm(v));
/**
 * Each of a set's plate-style blades laid out: its pin 7 in from its rail at the
 * heel, the slider's post halfway across its plate, unless another route's
 * rail (rails: [route, offset, from arc length]) runs between the set's stock
 * rails, through where the plate goes as it swings. Then the plate is cut
 * clear of that rail (its width at the plate, the clearance and the blade's
 * whole swing; switchGeometry does the cut), and the pin and the post moved
 * so there's still FDB_RIM of plate round the pin's hole and alongside the
 * tongue's slot: the post first toward the blade's rail (a narrower
 * tongue's room: the slot stays clear of the rail on the plate), then the
 * pin toward the rail (as near as its snap lip clears the rail on the
 * plate), then along toward the toe (a shorter plate: the blade's heel end
 * swings out a little past it as the blade opens, clear of the stock rail).
 * Where the other rail crosses the blade's own rail (as it swings), or no
 * place for the pin and the post keeps the plate whole, it's blocked: left
 * as it was (and said).
 */
function fdbLayout(v: SetLike, p: BaseParams, rails: [Route, number, number][], springback: boolean): FdbBladeLayout[] {
  const g = switchGlobals(p), G = g.G, c = p.pointClearance, pre = p.springPreload;
  const z0 = g.bedTop + c, z1 = z0 + FDB.plateT, railTop = PLATE_H + 6.4;
  const hw = railHalfW(z0, z1) + c, hwBar = railHalfW(z1, railTop) + c;
  const own = v.three ? [v.three.S, v.three.L, v.three.R] : [v.ra, v.rb];
  // (the other rails near the points, as runs of points 0.5 apart; not where one runs along one of the set's own rails)
  const y0 = v.toeY - 12, y1 = v.pointsEndY + 12, keep: Pt[][] = [];
  for (const [rt, o, s0] of rails) {
    let run: Pt[] = [];
    const L = routeLength(rt), flush = () => { if (run.length > 1) keep.push(run); run = []; };
    for (let s = Math.max(0, s0); s <= L + 1e-9; s += 0.5) {
      const q = railPoint(rt, s, o);
      if (q[1] < y0 || q[1] > y1 || Math.abs(q[0]) > 3 * G + 40 || own.some((r) => [-G, G].some((oo) => Math.abs(routeLat(r, q) - oo) < 0.6))) { flush(); continue; }
      run.push(q);
    }
    flush();
  }
  const pts = keep.flat(), n3 = v.three ? 2 : 1, plateW = fdbPlateW(v, p, springback), postIn0 = plateW / 2 + HEAD_HW;
  return [0, 1].map((b): FdbBladeLayout => {
    const rt = v.three ? v.three.S : b === 0 ? v.ra : v.rb, o = b === 0 ? -G : +G, side = b === 0 ? 1 : -1;
    const stockRt = v.three ? (b === 0 ? v.three.L : v.three.R) : b === 0 ? v.rb : v.ra;
    // (turning + opens blade 0 (its toe moves in, to +x), - blade 1; it goes from closed (0) to open (n3 * ang))
    const dir = b === 0 ? 1 : -1;
    const tip = railPoint(rt, v.sToe, o), sPost = sOf(rt, [0, v.throwY]);
    const make = (shift: number, pin: number, postIn: number) => {
      const pivot = railPoint(rt, v.sHeel - 4 - shift, o + side * pin), post = railPoint(rt, sPost, o + side * postIn);
      // (as it was; moved, the slider's travel (less the preload) at the post sets how far it swings)
      const ang = shift === 0 && pin === FDB.pivotIn ? (p.pointThrow / norm(sub(tip, pivot))) * (180 / Math.PI)
        : ((v.fdbTravel - pre) / Math.max(1, Math.abs(pivot[1] - post[1]))) * (180 / Math.PI);
      // (a three-way's other blade is open twice as far: the middle has both open by the throw)
      return { pivot, tip, ang, post, open: b === 0 ? 0 : -n3 * ang, pivotIn: pin, postIn, shift, keep, hw };
    };
    const f0 = make(0, FDB.pivotIn, postIn0);
    if (!pts.length) return f0;
    const angles = (f: { ang: number }) => Array.from({ length: 9 }, (_, k) => (dir * n3 * f.ang * k) / 8);
    const near = (q0: Pt, r: number) => pts.filter((q) => norm(sub(q, q0)) < r);
    // (the stock rail it closes on (the other route's, at the same offset), on past the pin: the blade's heel end swings out toward it)
    const stockBehind = (f: { pivot: Pt }) => { const out: Pt[] = []; for (let s = sOf(stockRt, f.pivot); s <= v.sHeel + 6; s += 0.5) out.push(railPoint(stockRt, s, o)); return out; };
    // the blade's own rail (on the plate, toe to heel) clear of them as it swings
    const barOk = (f: ReturnType<typeof make>) => {
      const cand = [...pts, ...stockBehind(f)].filter((q) => Math.abs(routeLat(rt, q) - o) < HEAD_HW + hwBar + 12);
      return angles(f).every((a) => cand.every((q) => {
        const q2 = rotAbout(q, f.pivot, -a);
        if (Math.abs(routeLat(rt, q2) - o) >= HEAD_HW + hwBar) return true;
        const sq = sOf(rt, q2);
        return sq < v.sToe || sq > v.sHeel - c;
      }));
    };
    if (!barOk(f0)) return { ...f0, blocked: 'it crosses the blade' };
    // the tongue's slot (and the post's hole), along u from the post toward the pin and across it: [a0, a1, c0, c1]
    const slotBox = (f: ReturnType<typeof make>): [number, number, number, number] => {
      if (springback) {
        const give = (f.ang * n3 * Math.PI / 180) * norm(sub(f.post, f.pivot)) + pre + 0.3, w = FDB.postD / 2 * Math.SQRT2 + c + SB.padWall + give + 0.4;
        return [-w, SB.len + 3, -w, w];
      }
      const w = FDB.tongueW / 2 + FDB.slotW;
      return [-w, FDB.tongueL, -w, w];
    };
    const boxDist = (q: Pt, at: Pt, u: Pt, bx: number[]) => {
      const d = sub(q, at), a = d[0] * u[0] + d[1] * u[1], cc = d[0] * u[1] - d[1] * u[0];
      return Math.hypot(Math.max(bx[0] - a, 0, a - bx[1]), Math.max(bx[2] - cc, 0, cc - bx[3]));
    };
    const pinR = FDB.pinD / 2 + c;
    const pinOk = (f: ReturnType<typeof make>) => near(f.pivot, 30).every((q) => norm(sub(q, f.pivot)) >= pinR + FDB_RIM + hw);
    const tongueOk = (f: ReturnType<typeof make>) => {
      const bx = slotBox(f);
      // (the slot clear of the blade's rail on the plate, and of the pin's hole)
      if (f.postIn + bx[2] < HEAD_HW + 0.5 || boxDist(f.pivot, f.post, unit(sub(f.pivot, f.post)), bx) < pinR + FDB_RIM) return false;
      const qs = near(f.post, 45);
      return angles(f).every((a) => { const P = rotAbout(f.post, f.pivot, a), U = unit(sub(f.pivot, P)); return qs.every((q) => boxDist(q, P, U, bx) >= FDB_RIM + hw); });
    };
    // (the pin's snap lip clear of the blade's rail on the plate)
    const minPin = HEAD_HW + FDB.pinD / 2 + 2 * c + 0.15 + 0.2;
    for (let shift = 0; shift <= 40; shift += 1) {
      for (let pin = FDB.pivotIn; pin >= minPin - 1e-9; pin -= 0.25) {
        if (!pinOk(make(shift, pin, postIn0))) continue;
        for (let pi = postIn0; pi >= HEAD_HW + 0.5 - 1e-9; pi -= 0.25) {
          const f = make(shift, pin, pi);
          if (!tongueOk(f) || ((shift || pin !== FDB.pivotIn || pi !== postIn0) && !barOk(f))) continue;
          return shift ? { ...f, stockKeep: stockBehind(f), stockHw: hw } : f;
        }
      }
      if (sOf(rt, railPoint(rt, v.sHeel - 4 - shift, o)) - sPost < FDB.tongueL + pinR + FDB_RIM) break;
    }
    return { ...f0, blocked: "there's no room for plate round its pin and its tongue" };
  });
}

/**
 * A true three-way's machinery: two blades on the straight route's rails,
 * each closing on the outer route's stock rail on its side, each on its own
 * pivot and spring, both driven by one slider. Its values are a points set's
 * (switch/context.ts, for the right- and left-hand routes, which give the
 * slider, lever and arm), with the heel where both blades clear their stock
 * rails, and the slider's travel each way enough to open a blade.
 */
export function threeWaySet(routes: Route[], ps: SetSpec, p: BaseParams, defaultThrowDir = 1) {
  p = { ...p, ...ps[5] };
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
  // (the plate-style blade plates: the slider opens each blade by the throw from the middle, so twice that end to end, plus the preload)
  const travel = p.mechStyle === 'plates' ? 2 * (v0.fdbTravel - p.springPreload) + p.springPreload : 2 * half;
  const v = pointsSet(routes, base, p, defaultThrowDir, { sHeel, leverTravel: travel });
  return { ...v, three: { S, L, R, half: p.mechStyle === 'plates' ? travel / 2 : half } };
}

/** Everything switch.scad works out before building: routes, sets, frogs, check rails, ties, cuts. */
/** foreign: other track running past, in this frame (a network's routes that aren't the switch's): the plate-style blade plates keep clear of its rails. */
export function switchPlan(routes: Route[], specs: SetSpec[], p: BaseParams = BASE_DEFAULTS, defaultThrowDir = 1, foreign: Route[] = []) {
  // (a three-way's slider goes twice as far: a longer lever driver keeps its
  // swing small enough, under 17 degrees, for the fork to hold the tip)
  for (const ps of specs)
    if (ps[4] !== undefined) {
      const half = threeWaySet(routes, ps, p, defaultThrowDir).three.half;
      p = { ...p, leverReach: Math.max(p.leverReach ?? 10, Math.ceil(half / Math.sin((17 * Math.PI) / 180))) };
    }
  const g = switchGlobals(p), G = g.G;
  const tc = new Track({} as Scad, { ...TRACK_DEFAULTS, gaugeStuds: p.gaugeStuds, studH: p.studH, studFit: p.studFit ?? TRACK_DEFAULTS.studFit, antistudFit: p.antistudFit }).c;
  const sleeperW = tc.sleeperW, sleeperLen = tc.sleeperLen;
  const nRoutes = routes.length;
  const sets = specs.map((ps) => (ps[4] === undefined
    ? pointsSet(routes, { ra: ps[0], rb: ps[1], sToe: ps[2], tside: ps[3] }, { ...p, ...ps[5] }, defaultThrowDir)
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
  // Notes on the options chosen (not problems with the switch's layout, as the warnings are, which make a
  // switch a network piece): the throw's actions, the stand and the prototype blades are built on the plate-style points
  const notes: string[] = [];
  if (p.mechStyle !== 'plates' && ((p.throwAction ?? 'detent') !== 'detent' || p.throwStand || (p.bladeStyle ?? 'simple') !== 'simple'))
    notes.push("the over-centre spring, spring-back points, the switch stand and the prototype blades are only built with blades on top: left out");
  else if (p.mechStyle === 'plates') {
    if (p.throwAction === 'overcentre' && sets.some((v) => 'three' in v))
      notes.push("a three-way's points have three positions: the over-centre spring has two, so it's left out (they click on the lever instead)");
    if (p.throwAction === 'overcentre' && p.throwStand)
      notes.push("a switch stand locks the points at each end, so a train can't push them over: the over-centre spring is left out");
    if (p.throwAction === 'springback' && sets.some((v) => 'three' in v))
      notes.push("a three-way's blades go twice as far: spring-back tongues that gave that much wouldn't fit between them, so it has the ordinary tongues");
    else if (p.throwAction === 'springback' && !p.throwStand)
      notes.push("spring-back points: the lever's detent won't hold the slider against the blades' springs, so a train trailing through may move it; the switch stand locks it");
    if (p.throwStand && sets.some((v) => 'three' in v))
      notes.push("a switch stand locks at its two ends: a three-way's middle (straight) position is with the handle upright, not locked");
  }
  if (!planOk(baseCuts)) warnings.push(`the switch doesn't fit the ${p.printBedX} x ${p.printBedY} print bed even when split across: it may be too wide`);
  const bySetY = [...sets].sort((a, b) => a.toeY - b.toeY);
  for (let k = 0; k + 1 < bySetY.length; k++)
    if (bySetY[k + 1].toeY - 2 < bySetY[k].pointsEndY)
      warnings.push(`two points sets overlap (one's points end at y ${bySetY[k].pointsEndY.toFixed(1)}, the next one's start at ${bySetY[k + 1].toeY.toFixed(1)}): move the second set further along`);
  // (the plate-style blades lie on plates on the bed, reaching in to the slider's posts: another route's rail between a set's
  // stock rails, toe to heels (a tandem's first branch through its second points), runs through them. Each plate is cut
  // clear of it, its pin and post moved to keep it strong (fdbLayout); where that can't be done, say so)
  if (p.mechStyle === 'plates') {
    const springback = fdbSpringback(p, sets);
    (sets as SetLike[]).forEach((v) => {
      const own = v.three ? [v.three.S, v.three.L, v.three.R] : [v.ra, v.rb];
      const rails: [Route, number, number][] = [];
      routes.forEach((rt, i) => { if (!own.includes(rt)) for (const o of [-G, G]) rails.push([rt, o, isStock(i, o) ? 0 : railFixS(i, o) + p.pointClearance]); });
      for (const rt of foreign) for (const o of [-G, G]) rails.push([rt, o, 0]);
      v.fdb = fdbLayout(v, p, rails, springback);
      const why = v.fdb.find((f) => f.blocked)?.blocked;
      // (a network's piece says it in its own words, where the points are)
      if (why && !foreign.length) warnings.push(`another route's rail runs between a set of points' stock rails (a tandem's first branch through its second points), and ${why}: move the second points further along, or use 'tines' points`);
    });
  }
  return {
    warnings, notes,
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
  const t = new Track(s, { ...TRACK_DEFAULTS, gaugeStuds: p.gaugeStuds, studH: p.studH, studFit: p.studFit ?? TRACK_DEFAULTS.studFit, antistudFit: p.antistudFit });
  const tc = t.c, c = p.pointClearance;
  const railTop = PLATE_H + 6.4, endTrim = 4, stemHw = 2.5;
  const pieceBottomZ = g.pieceBottomZ, bedTop = g.bedTop, partZ0 = g.layerZ0;
  // (where the pockets stop: on the floor under the moving parts, or through to the bottom as switch.scad's)
  const floorZ = p.mechFloor !== undefined ? g.layerZ0 - p.pointClearance : pieceBottomZ - 1;
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
    // (no wider than its stem: on ballast the rail's foot is above the bed, and it would catch going in through the slot)
    let cs = rail2d(o).intersect(scadParity() ? sq([10, 10], [o - 5, bedTop]) : sq([2 * stemHw, 10], [o - stemHw, bedTop]));
    // (switch.scad's flange over the slot is wider than the slot: the points couldn't go in from below past it)
    if (bedTop > PLATE_H && scadParity()) cs = cs.add(sq([6.2, 0.6], [o - 3.1, bedTop]));
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
  const fdb = p.mechStyle === 'plates';
  const holdOn = fdb && p.bladeHold === 'bracket';
  const stockFootCut = (v: SetV) => fdb ? s.union([]) : s.union([0, 1].map((b) => {
    const side = bSide(b), face = bO(b) + side * HEAD_HW;
    return sweep(sq([10, bedTop + 3 - floorZ], [side > 0 ? face : face - 10, floorZ]), bOther(v, b), v.sToe - 2, v.sHeel + g.discR);
  }));
  const bladeStem = (v: SetV, rt: Route, o: number, other: Route, oStock: number) => {
    const side = oStock < 0 ? 1 : -1, face = oStock + side * (HEAD_HW + c);
    return s.intersection(
      sweep(sq([2 * stemHw, bedTop - partZ0], [o - stemHw, partZ0]), rt, v.sToe, v.sHeel - c),
      sweep(sq([30, 20], [side > 0 ? face : face - 30, partZ0 - 1]), other, 0, v.sHeel + 5));
  };
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
  // (a blade on its own: an arm from its heel in to its pivot's disc, as the heel bar is for both; without it the blade
  // and its disc and tines were two loose bits)
  const unitArm2d = (v: SetV, u: Unit) => {
    const [b, at] = u.blades[0], h = rotAbout(railPoint(bRt(v, b), v.sHeel - c, bO(b)), u.pivot, at), d = sub(u.pivot, h);
    return W.CrossSection.hull([circle(g.heelBarW / 2, 24, add(h, mul(d, (g.heelBarW / 2 - HEAD_HW) / norm(d)))), circle(g.heelBarW / 2, 24, u.pivot)]);
  };
  const pointsSweep2d = (v: SetV, m: number) => fdb ? fdbSlot2d(v, m) : W.CrossSection.union(units(v).flatMap((u) => {
    const rng = [0, u.swing];
    return [
      ...(u.heelBar ? [W.CrossSection.hull(rng.map((a) => rot2(offR(heelBar2d(v), m), u.pivot, a)))] : []),
      ...(u.heelBar ? [] : [W.CrossSection.hull(rng.map((a) => rot2(offR(unitArm2d(v, u), m), u.pivot, a)))]),
      circle(u.discR + m, 48, u.pivot),
      // (a three-way's closed blade's tines bend the extra half travel)
      W.CrossSection.hull(rng.map((a) => rot2(offR(u.heelBar ? tines2d(v) : unitTines2d(u), p.springPreload + (v.three ? v.three.half : 0) + m + 0.5), u.pivot, a))),
    ];
  }));
  const bladeSlots2d = (v: SetV, m: number) => {
    if (fdb) return W.CrossSection.union([]);
    const n = 8, parts: CS[] = [];
    for (const u of units(v))
      for (const [b, at] of u.blades) {
        const plan2 = bladePlan(v, b, at, u.pivot).offset(m, 'Miter', 1000);
        for (let k = 0; k <= n; k++) parts.push(rot2(plan2, u.pivot, (u.swing * k) / n));
      }
    return W.CrossSection.union(parts);
  };
  const pointsPockets = (v: SetV) => {
    if (fdb) return fdbPockets(v);
    const slots = bladeSlots2d(v, c);
    return s.union([
      T(s.extrude(W.CrossSection.union([pointsSweep2d(v, c), slots]), g.cavityTop - floorZ), [0, 0, floorZ]),
      T(s.extrude(slots, bedTop + 2 - floorZ), [0, 0, floorZ]),
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
  ]), [...sets.map(stockFootCut), ...(fdb ? sets.map(pointsPockets) : [])]); // (the plate-style: the slider's groove runs on under the stock rail)
  const crossingRails = () => {
    const out: Man[] = [];
    for (let i = 0; i < nRoutes; i++)
      for (const o of [-G, G]) {
        if (plan.isStock(i, o)) continue;
        const cuts: Man[] = [];
        for (const j of plan.others(i)) for (const o2 of [-G, G]) if (!plan.isStock(j, o2)) {
          cuts.push(sweep(flangeBand2d(o2, -Math.sign(o2)), routes[j]));
          if (protoOn) cuts.push(...wingFlares(i, o, j, o2));
        }
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
  // (prototype blades: the wing rails flared at the frog's throat as a real frog's are, and the flangeways'
  // other ends opened out the same: each groove through a rail widened at its mouths, away from the rail
  // it guides, by the check rails' flare, over twice its length)
  /** Where route j's flangeway (beside its rail at o2) crosses route i's rail at o: a wedge widening it at each end. */
  const wingFlares = (i: number, o: number, j: number, o2: number): Man[] => {
    const side = -Math.sign(o2), rj = routes[j], ri = routes[i], L = routeLength(rj), mid = o2 + side * (HEAD_HW + p.flangeway / 2);
    const inRail = (sj: number) => Math.abs(routeLat(ri, railPoint(rj, sj, mid)) - o) < HEAD_HW + p.flangeway / 2;
    const ends: [number, number][] = [];
    let prev = inRail(0);
    for (let sj = 0.5; sj <= L; sj += 0.5) { const now = inRail(sj); if (now !== prev) ends.push([sj, now ? +1 : -1]); prev = now; }
    const fl = 2 * p.checkRailFlare + 2, wide = (w: number) => {
      const x0 = o2 + side * HEAD_HW;
      return sq([p.flangeway + w, p.flangewayDepth + 5], [Math.min(x0, x0 + side * (p.flangeway + w)), railTop - p.flangewayDepth]);
    };
    // (at a mouth, as wide as the flare; fl into the rail, the groove's own width)
    return ends.map(([sj, into]) => W.Manifold.hull([sweep(wide(p.checkRailFlare), rj, sj - into * 2 - 0.05, sj - into * 2 + 0.05), sweep(wide(0), rj, sj + into * fl - 0.05, sj + into * fl + 0.05)]));
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
      // (on the stud grid only: switch.scad adds studs by each route's rails too, off the grid, a jumble on the long sleepers)
      const spots = scadParity() ? dedupe(fill, grid) : grid;
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
  /**
   * The lever's ears (one with its pivot hole and the detent dimples, the other with the snap dome), standing on z0.
   * (the switch stand's: lower, at its hub, one each side of its handle and eccentric, no dimples)
   */
  const ears = (v: SetV, z0: number) => {
    const out: Man[] = [];
    const cylY = (d: number, h: number, fn: number, at: Vec3) => T(R(T(s.cylinder(h, d / 2, d / 2, fn), [0, 0, -h / 2]), [90, 0, 0]), at);
    const pz = v.stand ? v.standZ : g.leverPz;
    for (const sg of [-1, 1]) {
      const ey = v.stand ? v.throwY + (sg > 0 ? standY(v)[2] + c : standY(v)[0] - c) + sg * g.leverEarT / 2
        : v.throwY + sg * (leverT() / 2 + c + g.leverEarT / 2);
      let ear = W.Manifold.hull([
        cube([8, g.leverEarT, 0.01], [v.leverX - 4, ey - g.leverEarT / 2, z0 - 0.01]),
        cylY(7, g.leverEarT, 32, [v.leverX, ey, pz]),
        ...(v.stand ? [] : [cylY(2 * g.leverBumpR * sind(v.leverAng) + 3.4, g.leverEarT, 32, [v.leverX, ey, g.leverPz + g.leverBumpR])]),
      ]);
      if (sg > 0)
        ear = s.difference(ear, [
          cylY(2.4 + 2 * c, 10, 24, [v.leverX, ey, pz]),
          ...(!leverDetent(v) ? [] : (v.three ? [-v.leverAng, 0, v.leverAng] : [-v.leverAng, v.leverAng]).map((a) => cylY(1.4, 10, 12, [v.leverX + g.leverBumpR * sind(a), ey, g.leverPz + g.leverBumpR * cosd(a)]))),
        ]);
      out.push(ear);
      if (sg < 0) {
        // snap dome: OpenSCAD's sphere(d = 2.4, $fn = 24), squashed to 0.7, turned to point +y
        const pts: Vec3[] = [], rings = 12, r = 1.2;
        for (let i = 0; i < rings; i++) {
          const phi = (180 * (i + 0.5)) / rings;
          for (let j = 0; j < 24; j++) {
            const th = (360 * j) / 24;
            const x = r * sind(phi) * cosd(th), y = r * sind(phi) * sind(th), z = 0.7 * r * cosd(phi);
            // rotate([-90, 0, 0]): (x, y, z) -> (x, z, -y)
            pts.push([v.leverX + x, ey + g.leverEarT / 2 + z, pz - y]);
          }
        }
        const base = [[0, 0, 0], [1.2, 0, 0], [0, g.leverEarT / 2, 0], [1.2, g.leverEarT / 2, 0], [0, 0, 0.01], [1.2, 0, 0.01], [0, g.leverEarT / 2, 0.01], [1.2, g.leverEarT / 2, 0.01]]
          .map(([x, y, z]) => [v.leverX - 0.6 + x, ey + y, pz - 1.2 - 0.84 - 0.5 + z] as Vec3);
        out.push(W.Manifold.hull([...pts, ...base]));
      }
    }
    return out;
  };
  /** (the plate-style throw) the studs on the arm the bracket sits on: two rows of three round the lever, clear of its slot. */
  const bracketStuds = (v: SetV) => [-1, 0, 1].flatMap((i) => [-1, 1].map((j): [number, number] => [v.leverX + i * STUD, v.throwY + j * STUD]));
  const throwArm = (v: SetV) => {
    // (the arm's end out to the next stud line, so it sits square on the studs)
    const xIn = v.throwStockX, xEnd = v.leverX + v.throwDir * 10, parts: Man[] = [];
    const xOut = scadParity() ? xEnd : v.throwDir * Math.ceil((v.throwDir * xEnd) / STUD - 1e-6) * STUD;
    parts.push(cube([Math.abs(xOut - xIn), g.armW, bedTop - pieceBottomZ], [Math.min(xIn, xOut), v.throwY - g.armW / 2, pieceBottomZ]));
    if (p.throwModule) parts.push(...bracketStuds(v).map(([x, y]) => T(t.stud(), [x, y, bedTop - 0.01])));
    else parts.push(...ears(v, PLATE_H));
    return s.union(parts);
  };
  /** (the plate-style throw) the bracket: a 3 x 3 stud plate on the arm's studs, slotted for the lever, with the ears on it. */
  const bracketPart = (v: SetV) => {
    const z0 = bedTop, plate = cube([3 * STUD - 0.2, 3 * STUD - 0.2, PLATE_H], [v.leverX - 1.5 * STUD + 0.1, v.throwY - 1.5 * STUD + 0.1, z0]);
    const socks = bracketStuds(v).map(([x, y]) => T(t.studSocket(t.o.studH + 0.2), [x, y, z0 - 0.01]));
    const wf = leverT() + 2 * c, f0 = Math.min(v.forkX - forkHw, v.forkX + v.leverTravel + forkHw) - c - 1, f1 = Math.max(v.forkX - forkHw, v.forkX + v.leverTravel + forkHw) + c + 1;
    const slot = cube([f1 - f0, wf, 30], [f0, v.throwY - wf / 2, z0 - 1]);
    return s.union([s.difference(plate, [...socks, slot]), ...ears(v, z0 + PLATE_H)]);
  };
  // (the switch stand's yoke holds its eccentric, wider than the lever's tip)
  const forkHw = (p.throwStand && fdb ? STAND.eccD / 2 : g.leverTipD / 2) + c + g.forkWall;
  /**
   * How thick the lever is, along its pivot: as wide as the opening it swings in (wide enough for its tip, and
   * the plate-style slider, to go down through), the ears standing either side of it, so its snap domes and its
   * detent bump reach into them. (switch.scad's lever is 3 thick, its opening as wide plus the clearance.)
   */
  const leverT = () => (scadParity() ? g.leverBossLen : Math.max(g.leverBossLen, g.leverTipD, ...(fdb ? [FDB.rodW + 2 * c] : [])));
  /** The lever clicks into dimples in its ear (not with Peco's spring: that holds the points instead). */
  const leverDetent = (v: SetV) => !v.stand && !(fdb && p.throwAction === 'overcentre' && !v.three);
  const throwChannel = (v: SetV) => {
    if (fdb) return fdbChannel(v);
    const w = g.throwRodW + 1 + 2 * c;
    const ends = [...units(v).map((u) => u.postX).flatMap((x) => [x - 1.5, x + v.leverTravel + 1.5]), v.forkX - forkHw, v.forkX + v.leverTravel + forkHw];
    const x0 = Math.min(...ends) - c - 1, x1 = Math.max(...ends) + c + 1;
    // (wide enough for the lever's tip to go down through it)
    const wf = leverT() + 2 * c;
    const f0 = Math.min(v.forkX - forkHw, v.forkX + v.leverTravel + forkHw) - c - 1, f1 = Math.max(v.forkX - forkHw, v.forkX + v.leverTravel + forkHw) + c + 1;
    return s.union([
      cube([x1 - x0, w, g.layerTop + c - floorZ], [x0, v.throwY - w / 2, floorZ]),
      cube([f1 - f0, wf, 30], [f0, v.throwY - wf / 2, floorZ]),
    ]);
  };

  // ---------- underside ----------
  // (switch_underside(): the base's stud grid, square to the start)
  const underside = () => {
    const xr = plan.baseXRange(plan.baseY0, plan.baseY1), spots: Spot[] = [];
    for (let x = Math.floor(xr[0] / 8) * 8 - 4; x <= xr[1] + 4 + 1e-9; x += 8)
      for (let y = 4; y <= plan.baseY1 + 1e-9; y += 8) spots.push([x, y, roundScad(x / 8), roundScad(y / 8)]);
    // (the throw arms too: hollow with tubes underneath, like the rest)
    const onArm = (x: number, y: number, m: number) => !scadParity() && sets.some((v) => {
      const xEnd = v.leverX + v.throwDir * 10, xOut = v.throwDir * Math.ceil((v.throwDir * xEnd) / STUD - 1e-6) * STUD;
      return x >= Math.min(v.throwStockX, xOut) + m - 0.02 && x <= Math.max(v.throwStockX, xOut) - m + 0.02 && Math.abs(y - v.throwY) <= g.armW / 2 - m + 0.02;
    });
    const bed = (x: number, y: number, m: number) => (y >= 8 + m
      && Math.min(...routes.map((rt) => Math.abs(routeLat(rt, [x, y])))) <= sleeperLen / 2 - m || onArm(x, y, m))
      // clear of every end connector's base (measured in that end's frame)
      && !plan.endPoses.some((e) => { const dx = x - e[0], dy = y - e[1]; return Math.hypot(dx, dy) < sleeperLen + 16 && dx * sind(e[2]) - dy * cosd(e[2]) < 8 + m; });
    const ty = plan.tieYs(), half = sleeperW / 2 - (TRACK_DEFAULTS.studD + 1) / 2;
    // the solid base round the points, before the first tie, or on a tie
    // (the points' base runs from the points bed's start to the first tie;
    // before it, on a lead-in, only the lead ties are solid)
    const bedY0 = Math.min(...sets.map((v) => (v.toeY > 20 ? v.toeY - 2 : Math.min(v.toeY - 2, 7.9))));
    const leads = leadTiePoses();
    const solid = (x: number, y: number) => onArm(x, y, 0) || (y < bedY0
      ? leads.some((e) => { const l = localOf(e, [x, y]); return Math.abs(l[1]) <= half && Math.abs(l[0]) <= sleeperLen / 2; })
      : ty.length === 0 || y <= ty[0] - sleeperW / 2 - (TRACK_DEFAULTS.studD + 1) / 2 || ty.some((tt) => Math.abs(y - tt) <= half));
    return studSpots(s, t, spots, bed, [1, 0], [0, 1], p.studH + 0.21, 0, solid, p.studGrip);
  };

  // ---------- the plate-style points (mechStyle 'plates') ----------
  // Each blade on its own plate lying on top of the bed, turning on a pin
  // at its heel; a spring tongue cut in the plate (the plate-style flexure) holds
  // the post of the slider, a bar in a slot through the bed under the
  // plates, that the lever drives; the closed blade's tongue takes the
  // preload. Everything goes in from above.
  // Fitted to the routes as drawn: each blade is its route's rail.
  // (FDB: the plate's sizes, at the top of the file, with fdbLayout, which places each blade's pin and post)
  // (Peco's spring: each half's reach along the track to its pin, the meander's legs (amplitude across, beam
  // width and how many), its height, its rings' walls, the pins; squeezed by the preload at each end)
  // (spring-back tongues: SB, at the top of the file)
  const OC = { D: 12, amp: 3, t: 0.8, legs: 4, h: 2.4, ringW: 0.9, pinD: 4, preload: 0.35 };
  /** Each blade's pivot, toe, the angle it swings, where the slider's post meets it, and its angle as modelled (for the right-hand route): the plan's (fdbLayout). */
  const fdbBlades = (v: SetV) => v.fdb!;
  /** What a blade's plate keeps clear of, in plan, closed: the other routes' rails running past (and with its pin moved
   * toward the toe, the stock rail past it), wherever they are to the plate as it swings from closed to open. */
  const fdbKeep2d = (v: SetV, b: number): CS | undefined => {
    const f = fdbBlades(v)[b];
    if (f.blocked || (!f.keep.length && !f.stockKeep)) return undefined;
    const strip = (run: Pt[], hw: number) => {
      const nrm = run.map((q, k) => { const d = unit(sub(run[Math.min(run.length - 1, k + 1)], run[Math.max(0, k - 1)])); return [-d[1], d[0]] as Pt; });
      return s.polygon([...run.map((q, k) => add(q, mul(nrm[k], hw)) as Vec2), ...run.map((q, k) => sub(q, mul(nrm[k], hw)) as Vec2).reverse()]);
    };
    const dir = b === 0 ? 1 : -1, sw = (v.three ? 2 : 1) * f.ang, n = Math.max(2, Math.ceil(sw / 0.4));
    const runs = f.keep.map((r) => strip(r, f.hw + 0.05)), stock = f.stockKeep && strip(f.stockKeep, f.stockHw! + 0.05), parts: CS[] = [];
    // (the plate turned by a is clear of K where the plate is clear of K turned back by a)
    for (let k = 0; k <= n; k++) {
      const a = (-dir * sw * k) / n;
      parts.push(...runs.map((r) => rot2(r, f.pivot, a)));
      if (stock && k > 0) parts.push(rot2(stock, f.pivot, a));
    }
    return W.CrossSection.union(parts);
  };
  /** A blade's plate in plan, closed: from the toe to the heel along its rail, inward of it, round the pivot; with the tongue's slot. */
  const fdbPlate2d = (v: SetV, b: number) => {
    const rt = bRt(v, b), o = bO(b), side = bSide(b), fb = fdbBlades(v)[b];
    // (on to where the blade's rail ends at the heel: under all of it)
    const n = 24, s0 = v.sToe + 2, s1 = v.sHeel - c;
    const edge = (off: number) => Array.from({ length: n + 1 }, (_, k) => railPoint(rt, s0 + ((s1 - s0) * k) / n, o + side * off) as Vec2);
    // (from the blade bar's inner face inward; tapering to the toe)
    // (tapering toward the toe, to full width before the slider's post: the tongue's slot in the full plate)
    const sPost = sOf(rt, fb.post), kFull = Math.max(1, Math.min(6, Math.floor(((sPost - 5 - s0) / (s1 - s0)) * n)));
    // (the plate under the whole of the blade's rail, so the rail stands on it as printed: out to the rail's
    // outer face, and with prototype blades on in under the stock rail's undercut head)
    // (spring-back tongues' wider plate only as far as the tongue's root and a little more: back to the usual
    // width toward the heel, where the routes' rails close in)
    const sRoot = sPost + SB.len + 4, wAt = (k: number) => { const sk = s0 + ((s1 - s0) * k) / n; return FDB.plateW + (plateW(v) - FDB.plateW) * Math.min(1, Math.max(0, 1 - (sk - sRoot) / 8)); };
    const innerEdge = Array.from({ length: n + 1 }, (_, k) => railPoint(rt, s0 + ((s1 - s0) * k) / n, o + side * (HEAD_HW + wAt(k))) as Vec2);
    const outer = edge(protoOn ? -HEAD_HW - PROTO.cut - 0.5 : -HEAD_HW), inner = innerEdge.map((q, k) => { const t = Math.min(1, k / kFull); const e = outer[k]; return [e[0] + (q[0] - e[0]) * (0.35 + 0.65 * t), e[1] + (q[1] - e[1]) * (0.35 + 0.65 * t)] as Vec2; });
    let plate = W.CrossSection.union([s.polygon([...outer, ...inner.reverse()]), circle(FDB.discR, 40, fb.pivot)]);
    // the tongue: a U-slot round the post's hole, the tongue running toward the heel
    const d = sub(fb.pivot, fb.post), u = mul(d, 1 / norm(d)), nn: Pt = [u[1], -u[0]];
    const tw = FDB.tongueW / 2, sw = FDB.slotW, L = FDB.tongueL;
    const at = (a: number, c2: number): Vec2 => add(add(fb.post, mul(u, a)), mul(nn, c2)) as Vec2;
    const slot = springback ? sbSlot2d(v, b) : W.CrossSection.union([
      s.polygon([at(-tw - sw, -tw - sw), at(L, -tw - sw), at(L, -tw), at(-tw, -tw), at(-tw, tw), at(L, tw), at(L, tw + sw), at(-tw - sw, tw + sw)]),
      // (the hole for the slider's post: its teardrop, turned as the plate is turned back from where it's modelled)
      fdbPost2d([0, 0], c).rotate(-fb.open).translate(fb.post as Vec2),
    ]);
    plate = plate.subtract(slot).subtract(circle((FDB.pinD + 2 * c) / 2, 24, fb.pivot));
    // (clear of other track running past: what's left of it on the blade's side, where the blade's rail and the pin are)
    const keep = fdbKeep2d(v, b);
    if (keep) {
      const spine = W.CrossSection.union([s.polygon([...edge(-HEAD_HW), ...edge(HEAD_HW).reverse()]), circle(FDB.pinD / 2 + c + 0.5, 24, fb.pivot)]);
      plate = W.CrossSection.union(plate.subtract(keep).decompose().filter((q) => q.intersect(spine).area() > 0.5));
    }
    return plate;
  };
  // ---------- spring-back points (throwAction 'springback') ----------
  // A spring switch: the throw stays where it's set (the stand locks it),
  // and a train trailing through pushes the blades over against springs
  // that put them back after it. Here each blade's tongue is the spring (in
  // the prototype one spring in the throw rod moves both points together):
  // long and slim, in a wider plate, so its tip, on the slider's post, can
  // give the whole throw there and the preload besides, and still bend
  // under 1.5% (PLA's safe strain for a spring used often). Both blades
  // still go over together: the trailing wheels push one open and the
  // other shut. (There's no dashpot to slow their return, as a prototype
  // spring switch has: they snap back between wheelsets.)
  // (not on a three-way: its blades go twice as far, and tongues that gave that much wouldn't fit between them)
  const springback = fdbSpringback(p, sets);
  /** The plate's width (wider with spring-back tongues). */
  const plateW = (v: SetV) => fdbPlateW(v, p, springback);
  /** How far a tongue's tip must give: the blade's throw where the post meets it, the preload, and a little more. */
  const sbGive = (v: SetV, b: number) => { const f = fdbBlades(v)[b]; return rad(f.ang * (v.three ? 2 : 1)) * norm(sub(f.post, f.pivot)) + p.springPreload + 0.3; };
  /** The tongue (its pad round the post and its beam to the root) in plan, closed, along u from the post. */
  const sbTongue2d = (fb: { post: Pt }, u: Pt, nn: Pt, padR: number, len = SB.len) => {
    const at = (a: number, c2: number): Vec2 => add(add(fb.post, mul(u, a)), mul(nn, c2)) as Vec2;
    return W.CrossSection.union([circle(padR, 32, fb.post), s.polygon([at(0, -SB.beamW / 2), at(len, -SB.beamW / 2), at(len, SB.beamW / 2), at(0, SB.beamW / 2)])]);
  };
  /** What's cut from the plate: everywhere the tongue goes bending either way (as if turned about its root: a little more than it bends), less the tongue; and the post's hole, wide enough for it as the tip turns. */
  const sbSlot2d = (v: SetV, b: number): CS => {
    const fb = fdbBlades(v)[b], d = sub(fb.pivot, fb.post), u = mul(d, 1 / norm(d)), nn: Pt = [u[1], -u[0]];
    const hole = (a: number) => fdbPost2d([0, 0], c).rotate(-fb.open + a).translate(fb.post as Vec2);
    // (toward the blade's own rail (out) it gives the preload and the throw: a trailing wheel opens the closed
    // blade, the post staying put; the other way (in) only the throw: the open blade pushed shut)
    const give = sbGive(v, b), giveIn = give - p.springPreload, tipTurn = (1.5 * give / SB.len) * (180 / Math.PI), padR = FDB.postD / 2 * Math.SQRT2 + c + SB.padWall;
    const root = add(fb.post, mul(u, SB.len)), tongue = sbTongue2d(fb, u, nn, padR);
    const rt = bRt(v, b), outward = sub(railPoint(rt, sOf(rt, fb.post), bO(b)), fb.post), arm = sub(fb.post, root);
    const sgOut = Math.sign(-arm[1] * outward[0] + arm[0] * outward[1]) || 1; // (turning + about the root moves the tip out?)
    const n = 8, swept: CS[] = [], deg = (d: number) => (d / SB.len) * (180 / Math.PI);
    for (let k = 0; k <= n; k++) swept.push(rot2(tongue, root, (sgOut * deg(give) * k) / n), rot2(tongue, root, (-sgOut * deg(giveIn) * k) / n));
    const holes: CS[] = [];
    for (let k = -4; k <= 4; k++) holes.push(hole((tipTurn * k) / 4));
    // (the tongue kept on past its root, into the plate: it stays joined to it there)
    return W.CrossSection.union(swept).offset(0.4, 'Round', 2, 12).subtract(sbTongue2d(fb, u, nn, padR, SB.len + 3)).add(W.CrossSection.union(holes));
  };
  /** A blade part, as assembled for the right-hand route: its plate on the bed, its rail on the plate. */
  const fdbBladePart = (v: SetV, b: number) => {
    const fb = fdbBlades(v)[b], z0 = bedTop + c, z1 = z0 + FDB.plateT;
    const rt = bRt(v, b), o = bO(b), oStock = bO(b), sideS = oStock < 0 ? 1 : -1, face = oStock + sideS * (HEAD_HW + c);
    // (prototype blades: tight against the stock rail, tucked under its undercut head, from where the point's wide enough to print)
    const keep = protoOn ? sweep(protoKeep2d(oStock, sideS, PROTO.fit, z0 - 1, railTop + 1), bOther(v, b), 0, v.sHeel + 5) : undefined;
    // (both the rail and its plate kept off the stock rail it closes on, and clear of the end connector)
    // (with ballast the stock rail's foot flares out above the bed, and the plate is kept off it: there the
    // rail's lower outer corner is bevelled at 45 degrees, from the plate's edge up, so it prints)
    // (how far the stock rail reaches out over the plate's height, past its head)
    const flareW = z0 < PLATE_H + 2.0 ? rail2d(0).intersect(sq([20, z1 - z0], [-10, z0])).bounds().max[0] - HEAD_HW : 0;
    const bevel = (q: Vec2[]) => s.polygon(sideS > 0 ? q : q.map(([x, y]) => [2 * face - x, y] as Vec2).reverse());
    const offStock = keep ?? sweep(flareW ? bevel([[face + flareW, z0 - 1], [face + flareW, z1], [face, z1 + flareW], [face, z1 + 40], [face + 30, z1 + 40], [face + 30, z0 - 1]])
      : sq([30, 40], [sideS > 0 ? face : face - 30, z0 - 1]), bOther(v, b), 0, v.sHeel + 5);
    const bar = s.intersection(sweep(sq([2 * HEAD_HW, railTop - z1 + 0.01], [o - HEAD_HW, z1 - 0.01]), rt, protoOn ? protoTip(v, b) : v.sToe, v.sHeel - c), offStock);
    const y0 = Math.max(v.toeY - 1, 8 + c);
    // (the plate a little further off the stock rail than the rail is: clear of its foot's flare, where that's
    // above the bed (with ballast); without, only the head's above the bed, and the plate runs under all the rail)
    // (a straight edge, as far out as the foot reaches over the plate's height: following the foot's shape, its edge would overhang)
    // (prototype blades: tucked under the undercut head as far as the undercut goes; past its end, where the blade has
    // turned away, with ballast kept off the rail as the simple blades' plates are: its foot's flare is above the bed there)
    const offEdge = (s0: number) => sweep(sq([30, 40], [sideS > 0 ? face + flareW : face - 30 - flareW, z0 - 1]), bOther(v, b), s0, v.sHeel + 5);
    // (the keep less the stock rail's side of that edge, past the undercut's end: one cut, no seam where the two meet)
    const plateOff = protoOn ? (flareW ? s.difference(keep!, [sweep(sq([30, 40], [sideS > 0 ? face + flareW - 30 : face - flareW, z0 - 1]), bOther(v, b), protoPlaneEnd(v, b), v.sHeel + 5)]) : keep!) : offEdge(0);
    // (and clear of the stock rail's actual shape, foot and all; the prototype's undercut: the keep above)
    const stock = protoOn ? s.union([]) : sweep(rail2d(oStock).offset(c, 'Miter', 1000), bOther(v, b), 0, v.sHeel + 10);
    const plate = s.difference(s.intersection(s.intersection(T(s.extrude(fdbPlate2d(v, b), FDB.plateT), [0, 0, z0]), plateOff), cube([400, 400, 50], [-200, y0, z0 - 10])), [stock]);
    return rot3(s.union([plate, bar]), fb.pivot, fb.open);
  };

  // ---------- prototype blades (bladeStyle 'prototype') ----------
  // As a real switch's points: each switch rail planed down to a point that
  // lies tight against the stock rail's gauge face, its foot and the lower
  // part of its head tucked in under the stock rail's head, which is
  // undercut along the points for it (so a wheel's flange can't catch the
  // point, and the stock rail's head holds the blade down, as Peco's tabs
  // under the stock rails do). The point is cut off where it's still wide
  // enough to print (a real point is blunted too, to about 6 mm). It turns
  // at the heel on its pin, as before (a loose heel); the slider is its tie
  // bar, moved up to the points (see pointsSet's throwY).
  const protoOn = fdb && p.bladeStyle === 'prototype';
  /** The undercut: how deep into the stock rail's gauge face, the lip of head left over it, how tight the blade fits, its point's least width. */
  const PROTO = { cut: 0.8, lip: 1.0, fit: 0.15, tipW: 0.6 };
  /** Where a blade may be, in the stock rail's section (it at offset oS, its gauge side toward sideS): off the head, in under the undercut, with a fit's clearance. */
  const protoKeep2d = (oS: number, sideS: number, fit: number, zlo: number, ztop: number): CS => {
    const fx = oS + sideS * HEAD_HW, zU = railTop - PROTO.lip, u = PROTO.cut;
    const lat = (d: number) => fx + sideS * d;
    const pts: Vec2[] = [[lat(fit - u), zlo], [lat(fit - u), zU - u], [lat(fit), zU], [lat(fit), ztop], [lat(30), ztop], [lat(30), zlo]];
    return s.polygon(sideS > 0 ? pts : [...pts].reverse());
  };
  /** The undercut cut from the stock rails (and their flares, with ballast): the gauge side under the lip, chamfered up to it so it prints. */
  const protoUndercut = (v: SetV) => s.union([0, 1].map((b) => {
    const oS = bO(b), sideS = oS < 0 ? 1 : -1, fx = oS + sideS * HEAD_HW, zU = railTop - PROTO.lip, u = PROTO.cut;
    const lat = (d: number) => fx + sideS * d;
    const pts: Vec2[] = [[lat(-u), bedTop - 0.01], [lat(-u), zU - u], [lat(0), zU], [lat(3), zU], [lat(3), bedTop - 0.01]];
    return sweep(s.polygon(sideS > 0 ? pts : [...pts].reverse()), bOther(v, b), Math.max(0, v.sToe - 2), protoPlaneEnd(v, b));
  }));
  /** Where the blade's top is wide enough to print, from its toe: its point. */
  const protoTip = (v: SetV, b: number) => {
    const rt = bRt(v, b), o = bO(b), sideS = o < 0 ? 1 : -1, st = bOther(v, b);
    for (let sb = v.sToe; sb < v.sHeel; sb += 0.25) {
      const lat = routeLat(st, railPoint(rt, sb, o));
      if (Math.min(2 * HEAD_HW, sideS * (lat - o) - PROTO.fit) >= PROTO.tipW) return sb;
    }
    return v.sToe;
  };
  /** How far along the stock rail the undercut runs: until the blade (open or closed) is well clear of it. */
  const protoPlaneEnd = (v: SetV, b: number) => {
    const rt = bRt(v, b), o = bO(b), sideS = o < 0 ? 1 : -1, st = bOther(v, b);
    for (let sb = v.sToe; sb < v.sHeel; sb += 0.5) if (sideS * (routeLat(st, railPoint(rt, sb, o)) - o) > 2 * HEAD_HW + PROTO.cut + 1) return sOf(st, railPoint(rt, sb, o)) + 1;
    return v.sHeel;
  };
  // The slider goes in from the top: down through the lever's opening in
  // the arm, then (bending a little) along its tunnel under the bed's top,
  // its posts along their groove (under the stock rail too); the blades go
  // on after it. Its tunnel has a floor: nothing open underneath, and the
  // opening stops short of the arm's end. Printed on its side, so its posts
  // and the fork's prongs lie along the layers: hence the posts' teardrop,
  // pointed down as printed (at -y as assembled).
  /** A post's section at q (with m round it): a teardrop pointed to -y. */
  const fdbPost2d = (q: Pt, m: number) => W.CrossSection.hull([circle(FDB.postD / 2 + m, 24, q), circle(0.05 + m, 8, [q[0], q[1] - (FDB.postD / 2) * Math.SQRT2])]);
  /** Where each post is as modelled (blade 0 closed, its tongue pressed by the preload). */
  const fdbPostAt = (v: SetV) => fdbBlades(v).map((f, b) => { const q = rotAbout(f.post, f.pivot, f.open); return [q[0] - (b === 0 ? p.springPreload : 0), q[1]] as Pt; });
  /** The lever's opening through the arm, in x: over the fork's travel, and on toward the arm's end, short of it. */
  const fdbMouth = (v: SetV) => {
    const f0 = Math.min(v.forkX - forkHw, v.forkX + v.leverTravel + forkHw) - c - 1, f1 = Math.max(v.forkX - forkHw, v.forkX + v.leverTravel + forkHw) + c + 1;
    const xOut = v.throwDir * Math.ceil((v.throwDir * (v.leverX + v.throwDir * 10)) / STUD - 1e-6) * STUD, wall = xOut - v.throwDir * 2.4;
    return v.throwDir > 0 ? [f0, Math.max(f1, wall)] : [Math.min(f0, wall), f1];
  };
  const fdbFloor = () => g.layerZ0 - c;
  /** The slider's footprint: its travel, from the far post out to the lever's opening. */
  const fdbSlot2d = (v: SetV, m: number) => {
    const xs = [...fdbPostAt(v).map((q) => q[0]), v.forkX, ...fdbMouth(v)];
    const x0 = Math.min(...xs) - v.leverTravel - 4, x1 = Math.max(...xs) + v.leverTravel + 4;
    const [m0, m1] = fdbMouth(v), a = Math.max(x0, Math.min(x1, v.throwDir > 0 ? m1 : m0));
    const lo = v.throwDir > 0 ? x0 : a, hi = v.throwDir > 0 ? a : x1;
    return sq([hi - lo, FDB.rodW + 2 * (c + m)], [lo, v.throwY - FDB.rodW / 2 - c - m]);
  };
  /** The posts' groove up through the bed's top, from their travel out to the lever's opening. */
  const fdbGroove = (v: SetV) => {
    const qs = fdbPostAt(v), T2 = v.leverTravel + 1, [m0, m1] = fdbMouth(v), mouth = (m0 + m1) / 2;
    // (wide enough for the posts wherever they are as the blades swing: their y moves a little)
    const dy = Math.max(0, ...fdbBlades(v).flatMap((f) => [f.open, f.open === 0 ? f.ang : 0].map((a) => Math.abs(rotAbout(f.post, f.pivot, a)[1] - v.throwY)))) + 0.2;
    const far = qs.reduce((a, q) => (v.throwDir * q[0] < v.throwDir * a[0] ? q : a));
    const groove = W.CrossSection.hull([fdbPost2d([far[0] - v.throwDir * T2, v.throwY - dy], c), fdbPost2d([far[0] - v.throwDir * T2, v.throwY + dy], c),
      fdbPost2d([mouth, v.throwY - dy], c), fdbPost2d([mouth, v.throwY + dy], c)]);
    // (up past the posts' tops: through the stock rail's foot too, where they pass under it going in)
    const top = bedTop + c + FDB.plateT + 0.2;
    return T(s.extrude(groove, top - g.layerTop + 0.01), [0, 0, g.layerTop - 0.01]);
  };
  /** Cut from the bed: the slider's tunnel (floored) and its posts' groove. */
  const fdbPockets = (v: SetV) => s.union([T(s.extrude(fdbSlot2d(v, 0), g.layerTop + c - fdbFloor()), [0, 0, fdbFloor()]), fdbGroove(v),
    ...(ocOn(v) ? [ocPocket(v)] : []), ...(protoOn ? [protoUndercut(v)] : []), ...(holdOn ? [holdHoles(v)] : [])]);
  /** The slider bar: posts up into the blades' tongues, the fork for the lever's tip at its end. */
  const fdbSlider = (v: SetV) => {
    const z0 = g.layerZ0, z1 = g.layerTop, rodW = FDB.rodW;
    const xs = [...fdbPostAt(v).map((q) => q[0]), v.forkX], x0 = Math.min(...xs) - 3, x1 = Math.max(...xs) + forkHw;
    const slotW = g.leverTipD + 2 * c, m = v.forkMouthHw;
    // (the posts up into the blades' tongues, to just under the plates' tops)
    const posts = fdbPostAt(v).map((q) => T(s.extrude(fdbPost2d(q, 0), bedTop + c + FDB.plateT - 0.2 - z1 + 0.01), [0, 0, z1 - 0.01]));
    const body = s.union([cube([x1 - x0, rodW, z1 - z0], [x0, v.throwY - rodW / 2, z0]), ...posts, ...fdbSliderExtra(v),
      cube([2 * forkHw, rodW, v.forkTop - z0], [v.forkX - forkHw, v.throwY - rodW / 2, z0])]);
    if (v.stand) {
      // (the stand's yoke: a slot as wide as its eccentric, open at the top for it to go in, down past where it's lowest)
      const sw2 = STAND.eccD / 2 + c, bot = v.standZ - v.standE * sind(STAND.overDeg) - STAND.eccD / 2 - c;
      return s.difference(body, [cube([2 * sw2, 2 * rodW, v.forkTop - bot + 1], [v.forkX - sw2, v.throwY - rodW, bot])]);
    }
    const slot2d = W.CrossSection.union([
      sq([slotW, Math.max(0.1, v.leverTipZ - z0 - 0.6)], [-slotW / 2, z0 + 0.6]),
      W.CrossSection.hull([circle(slotW / 2, 32, [0, v.leverTipZ]), circle(slotW / 2, 32, [0, g.leverTipLow])]),
      sq([2 * m, v.forkTop - v.leverTipZ + 0.01], [-m, v.leverTipZ]),
    ]);
    return s.difference(body, [T(R(T(s.extrude(slot2d, 2 * rodW), [0, 0, -rodW]), [90, 0, 0]), [v.forkX, v.throwY, 0])]);
  };
  /** More on the slider: (Peco's spring) the post its spring's end goes on. */
  const fdbSliderExtra = (v: SetV): Man[] => (ocOn(v) ? [ocPost(v)] : []);
  /** The channel through the arm for the slider's fork and the lever. */
  const fdbChannel = (v: SetV) => {
    // (wide enough for the slider to go down through, as well as the lever's tip)
    const wf = leverT() + 2 * c, [g0, g1] = fdbMouth(v);
    // (and the posts' groove: the arm's top is over it too)
    return s.union([T(s.extrude(fdbSlot2d(v, 0), g.layerTop + c - fdbFloor()), [0, 0, fdbFloor()]), cube([g1 - g0, wf, 30], [g0, v.throwY - wf / 2, fdbFloor()]), fdbGroove(v),
      ...(v.stand ? [standPocket(v)] : [])]);
  };
  /** The pins the blades turn on, standing on the bed. */
  // (each with a little snap lip over the plate, so the blade stays on: the plate's hole squeezes past it)
  const fdbPins = (v: SetV) => s.union([...fdbBlades(v).flatMap((f) => holdOn
    // (held down by a bracket: the pin plain, up through the bracket's top to locate it)
    ? [T(s.cylinder(c + FDB.plateT + c + HOLD.t, FDB.pinD / 2, FDB.pinD / 2, 24), [f.pivot[0], f.pivot[1], bedTop - 0.01])]
    : [T(s.cylinder(c + FDB.plateT + 0.8, FDB.pinD / 2, FDB.pinD / 2, 24), [f.pivot[0], f.pivot[1], bedTop - 0.01]),
      T(s.cylinder(0.7, FDB.pinD / 2 + c + 0.15, FDB.pinD / 2, 24), [f.pivot[0], f.pivot[1], bedTop + c + FDB.plateT + 0.1])]), ...(ocOn(v) ? ocPins(v) : [])]);

  // ---------- the blades held down by brackets (bladeHold 'bracket') ----------
  // As the reference points have it: by each blade's pin a little bracket on
  // the bed, its top over the plate round the pin (a clearance above it), on
  // two feet beside the plate's disc (inward of its rail, and toward the heel),
  // each pegged into a hole in the bed. The plate turns under it and can't
  // lift off its pin. Printed upside down, its top on the bed: nothing hangs.
  const HOLD = { t: 1.6, foot: 3.6, peg: 2.2, pegL: 1.6 };
  /** A blade's bracket's plan: its top, its feet and their pegs' centres, in the set's frame. */
  const holdPlan = (v: SetV, b: number) => {
    const f = fdbBlades(v)[b], rt = bRt(v, b), o = bO(b);
    const toRail = sub(f.pivot, railPoint(rt, sOf(rt, f.pivot), o)), n = unit(toRail), u = unit(sub(f.tip, f.pivot));
    // (its top round the pin clear of the blade's rail on the plate, as the blade swings too)
    const rTop = Math.min(FDB.discR + 1.5, norm(toRail) - HEAD_HW - c - 0.6);
    const off = FDB.discR + c + 0.6 + HOLD.foot / 2;
    const feet = [add(f.pivot, mul(n, off)) as Pt, add(f.pivot, mul(u, -off)) as Pt];
    const sq2 = (q: Pt, w: number) => W.CrossSection.square([w, w], true).rotate((Math.atan2(u[1], u[0]) * 180) / Math.PI).translate(q as Vec2);
    const top = W.CrossSection.hull([circle(rTop, 32, f.pivot), ...feet.map((q) => sq2(q, HOLD.foot))]);
    return { f, feet, top, foot: (q: Pt) => sq2(q, HOLD.foot) };
  };
  /** A bracket as assembled: over its blade's plate, on its feet, pegs down into the bed; a hole for the pin. */
  const holdPart = (v: SetV, b: number) => {
    const h = holdPlan(v, b), z0 = bedTop + c + FDB.plateT + c, z1 = z0 + HOLD.t;
    return s.difference(s.union([
      T(s.extrude(h.top, HOLD.t), [0, 0, z0]),
      ...h.feet.map((q) => T(s.extrude(h.foot(q), z0 - bedTop + 0.01), [0, 0, bedTop])),
      ...h.feet.map((q) => T(s.cylinder(HOLD.pegL + 0.01, HOLD.peg / 2, HOLD.peg / 2, 20), [q[0], q[1], bedTop - HOLD.pegL])),
    ]), [T(s.cylinder(z1 - bedTop + 2, FDB.pinD / 2 + c / 2, FDB.pinD / 2 + c / 2, 24), [h.f.pivot[0], h.f.pivot[1], bedTop - 1])]);
  };
  /** The holes in the bed the brackets' pegs go in (snug: 0.05 over). */
  const holdHoles = (v: SetV) => s.union(fdbBlades(v).flatMap((_, b) => holdPlan(v, b).feet.map((q) => T(s.cylinder(HOLD.pegL + 0.3 + 0.01, HOLD.peg / 2 - 0.05 + 0.1, HOLD.peg / 2 - 0.05 + 0.1, 20), [q[0], q[1], bedTop - HOLD.pegL - 0.3]))));

  // ---------- Peco's over-centre spring (throwAction 'overcentre') ----------
  // Peco's turnouts hold their blades with a V spring between the base and
  // the tie bar: squeezed most with the tie bar in the middle, so it pushes
  // it out to whichever side it's past, and a train trailing through the
  // wrong way pushes the blades over and they stay. Here the "tie bar" is
  // the slider: a post on it, between the blades, and a printed spring
  // (PLA, a meander where Peco's is a wire V) to a pin on the bed each side
  // of it along the track. Two halves, one each way, so their pushes along
  // the track cancel: one alone would press the slider on its tunnel's
  // side, and at this small a swing the friction would outdo it. The spring
  // lies in a pocket in the bed's top, between the blades; it goes on after
  // the slider, its end rings over the pins (snap lips) and its middle ring
  // over the post. Printed flat, it flexes in its plane, along its layers.
  /** Where it all is: the post at rest (the right-hand route's), the pins, the travel; and each half's length at rest, at the middle and free. */
  const ocGeo = (v: SetV) => {
    const qs = fdbPostAt(v), T = v.leverTravel, P: Pt = [(qs[0][0] + qs[1][0]) / 2, v.throwY];
    // (the pins over the post's travel's middle, where the spring's squeezed most)
    const A: Pt[] = [1, -1].map((sg) => [P[0] + T / 2, v.throwY + sg * OC.D]);
    const dEnd = Math.hypot(OC.D, T / 2), free = dEnd + OC.preload;
    return { P, A, T, dEnd, free };
  };
  const ocOn = (v: SetV) => fdb && p.throwAction === 'overcentre' && !v.three && !v.stand;
  /** The post's hole in the middle ring: round its teardrop, which turns a little in it. */
  const ocHoleR = FDB.postD / 2 * Math.SQRT2 + c;
  /** One half of the spring in plan, from its middle ring's centre (origin) along +u to its pin's ring at u = len: its meander and the pin's ring. */
  const ocHalf2d = (len: number) => {
    const rP = ocHoleR + OC.ringW, rA = OC.pinD / 2 + c + OC.ringW, a = OC.amp;
    const u0 = rP + 0.5 + OC.t / 2, u1 = len - rA - 0.5 - OC.t / 2, n = OC.legs;
    const us = Array.from({ length: n }, (_, k) => u0 + ((u1 - u0) * k) / (n - 1));
    const path: Pt[] = [[rP - 0.3, 0], [us[0], 0]];
    us.forEach((u, k) => { const y0 = k === 0 ? 0 : (k % 2 ? a : -a), y1 = k === n - 1 ? 0 : (k % 2 ? -a : a); path.push([u, y0], [u, y1]); });
    path.push([len - rA + 0.3, 0]);
    const strokes = path.slice(1).map((q, k) => W.CrossSection.hull([circle(OC.t / 2, 12, path[k]), circle(OC.t / 2, 12, q)]));
    return W.CrossSection.union([...strokes, circle(rA, 40, [len, 0]).subtract(circle(OC.pinD / 2 + c, 32, [len, 0]))]);
  };
  /** The middle ring. */
  const ocRing2d = () => circle(ocHoleR + OC.ringW, 40).subtract(circle(ocHoleR, 32));
  /** The spring in plan with its middle ring at P, each half reaching to its pin. */
  const ocSpring2d = (P: Pt, A: Pt[]) => W.CrossSection.union([ocRing2d().translate(P as Vec2),
    ...A.map((q) => { const d = sub(q, P); return ocHalf2d(norm(d)).rotate((Math.atan2(d[1], d[0]) * 180) / Math.PI).translate(P as Vec2); })]);
  const ocZ0 = () => g.layerTop + c;
  /** The spring as assembled (at rest: squeezed to its pins, the post at the right-hand route's end). */
  const ocPart = (v: SetV) => { const o = ocGeo(v); return T(s.extrude(ocSpring2d(o.P, o.A), OC.h), [0, 0, ocZ0()]); };
  /** The spring as printed: free, straight, lying flat. */
  const ocPrint = (v: SetV) => { const o = ocGeo(v); return s.extrude(ocSpring2d([0, 0], [[0, o.free], [0, -o.free]]), OC.h); };
  /** Its pocket in the bed: wherever it is as the post goes from one end to the other, and round. */
  const ocPocket = (v: SetV) => {
    const o = ocGeo(v), Q: Pt = [o.P[0] + o.T, o.P[1]];
    const sweep2d = W.CrossSection.union([W.CrossSection.hull([ocRing2d().translate(o.P as Vec2), ocRing2d().translate(Q as Vec2)]),
      ...o.A.map((a) => W.CrossSection.hull([ocSpring2d(o.P, [a]), ocSpring2d(Q, [a])]))]).offset(c + 0.2, 'Round', 2, 16);
    // (not where its pins stand: on a network's piece the pockets are cut after the pins go on)
    return s.difference(T(s.extrude(sweep2d, bedTop + 2 - (ocZ0() - c)), [0, 0, ocZ0() - c]), ocPins(v));
  };
  /** The pins the spring's ends go on, standing on its pocket's floor, each with a snap lip. */
  const ocPins = (v: SetV) => ocGeo(v).A.flatMap((q) => [
    T(s.cylinder(OC.h + c + 0.6, OC.pinD / 2, OC.pinD / 2, 24), [q[0], q[1], ocZ0() - c - 0.01]),
    T(s.cylinder(0.6, OC.pinD / 2 + c + 0.1, OC.pinD / 2, 24), [q[0], q[1], ocZ0() + OC.h + 0.1]),
  ]);
  /** The post on the slider for the spring's middle ring (its teardrop as the blades' posts), up to theirs. */
  const ocPost = (v: SetV) => T(s.extrude(fdbPost2d(ocGeo(v).P, 0), bedTop + c + FDB.plateT - 0.2 - g.layerTop + 0.01), [0, 0, g.layerTop - 0.01]);

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
    const plan2 = W.CrossSection.union([...(u.heelBar ? [heelBar2d(v)] : [unitArm2d(v, u)]), circle(u.discR, 48, u.pivot), u.heelBar ? tines2d(v) : unitTines2d(u)]);
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
    if (fdb) return fdbSlider(v);
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
  /** The lever, upright, origin at the pivot (lever_shape); with its detent bump, unless not. */
  const leverShape = (detent = true) => {
    const tt = leverT();
    const cylY = (d: number, h: number, fn: number) => R(T(s.cylinder(h, d / 2, d / 2, fn), [0, 0, -h / 2]), [90, 0, 0]);
    // (the plate-style lever (2-05-004) is a flat paddle: a round knob 14 above
    // the pivot, the arm narrowing to the boss, the tail narrowing to the tip;
    // here as thick as the boss, the tip's round bar for the slider's fork)
    const paddle = () => {
      const tail = g.leverDa;
      const outline = W.CrossSection.union([
        circle(4.75, 40, [0, 14]),
        s.polygon([[-2.3, 10.5], [2.3, 10.5], [2.5, 0], [-2.5, 0]]), // (into the knob: one piece)
        s.polygon([[-2.5, 0], [2.5, 0], [1.15, -tail], [-1.15, -tail]]),
      ]);
      // (the outline is in x (across) and z (up): extruded through y, the pivot's axis)
      return T(R(s.extrude(outline, tt), [90, 0, 0]), [0, tt / 2, 0]);
    };
    const body = s.difference(s.union(fdb ? [
      cylY(g.leverBossD, tt, 32), paddle(), T(cylY(g.leverTipD, tt, 24), [0, 0, -g.leverDa]),
    ] : [
      cylY(g.leverBossD, tt, 32),
      cube([g.leverDrvW, tt, g.leverDa], [-g.leverDrvW / 2, -tt / 2, -g.leverDa]),
      T(cylY(g.leverTipD, tt, 24), [0, 0, -g.leverDa]),
      cube([2.5, tt, 14], [-1.25, -tt / 2, 0]),
      s.intersection(T(sphereScad(s, 3, 32), [0, 0, 14]), cube([10, 10, 10], [-5, -tt / 2, 9])),
    ]), [T(R(s.cylinder(1.2, (2.4 + 2 * c) / 2, (2.4 + 2 * c) / 2, 24), [-90, 0, 0]), [0, -tt / 2 - 0.01, 0])]);
    return s.union([
      body,
      T(R(sphereScad(s, 1.2, 24, 0.7), [-90, 0, 0]), [0, tt / 2, 0]),
      detent && T(sphereScad(s, 0.6, 12), [0, tt / 2, g.leverBumpR]),
    ]);
  };
  /** The lever as assembled, swung to the right-hand route's position (lever_part); the switch stand's handle with it. */
  const leverPart = (v: SetV) => (v.stand ? standPart(v) : T(R(leverShape(leverDetent(v)), [0, v.leverAng, 0]), [v.leverX, v.throwY, g.leverPz]));
  /** The lever lying on its -y face, ready to print (part = "lever"); the stand's handle the same way. */
  const leverPrint = (v?: SetV) => (v?.stand ? standPrint(v) : T(R(leverShape(!v || leverDetent(v)), [90, 0, 0]), [0, 0, leverT() / 2]));

  // ---------- the switch stand (throwStand) ----------
  // A ground throw as Caboose Industries' (and the prototype's low switch
  // stands): a handle on a hub turning on the throw rod's line, its
  // eccentric (Caboose's "external cam") in a yoke on the slider's end. The
  // handle swings over the top, 180 degrees, from lying on the arm one way
  // to lying on it the other; at each end the eccentric is a few degrees
  // past dead centre, so the points pushing on the slider press the handle
  // down on the arm instead of turning it: locked, as Caboose's are "from
  // 10 degrees above horizontal to fully down". Snap domes for its axle in
  // ears either side, as the lever's.
  /** Its slabs along the hub, from throwY: the handle's -y face, between handle and eccentric, the eccentric's +y face. */
  const standY = (v: SetV): [number, number, number] => {
    void v;
    // (the eccentric out to the channel's side less the clearance: the +y ear stands beside the channel)
    return [-FDB.rodW / 2 - c - STAND.handleT, -FDB.rodW / 2 - c, leverT() / 2];
  };
  /** Where the eccentric is at rest (the right-hand route's), turned from straight out (+x): past dead centre, low. */
  const standRest = 180 + STAND.overDeg;
  const standRootR = (v: SetV) => Math.max(STAND.rootR, v.standE + STAND.eccD / 2 + 0.4);
  /** The stand's handle, hub and eccentric, origin at the hub, the handle and the eccentric's offset along +x (x and z its plane, y the hub). */
  const standShape = (v: SetV) => {
    const [y0, y1, y2] = standY(v), L = STAND.handleLen, hw = STAND.handleW / 2;
    const slab = (cs: CS, a: number, b: number) => T(R(s.extrude(cs, b - a), [90, 0, 0]), [0, b, 0]);
    // the handle and the hub's disc (round the eccentric: printed on the handle's face, nothing overhangs)
    const handle2d = W.CrossSection.union([
      circle(standRootR(v), 48),
      W.CrossSection.hull([circle(hw, 24, [standRootR(v) - hw, 0]), circle(hw, 24, [L, 0])]),
      circle(hw + 0.6, 24, [L - 0.6, 0]), // (a grip at its end)
    ]);
    const body = s.union([slab(handle2d, y0, y1), slab(circle(STAND.eccD / 2, 48, [v.standE, 0]), y1 - 0.01, y2)]);
    return s.union([
      // (the blind hole for the -y ear's dome, as the lever's)
      s.difference(body, [T(R(s.cylinder(1.2, (2.4 + 2 * c) / 2, (2.4 + 2 * c) / 2, 24), [-90, 0, 0]), [0, y0 - 0.01, 0])]),
      T(R(sphereScad(s, 1.2, 24, 0.7), [-90, 0, 0]), [0, y2, 0]),
    ]);
  };
  /** The stand as assembled (the right-hand route's: the eccentric and the handle at standRest). */
  const standPart = (v: SetV) => T(R(standShape(v), [0, -standRest, 0]), [v.leverX, v.throwY, v.standZ]);
  /** The stand as printed: on its handle's face (-y down), the hub's disc under the eccentric, the dome on top. */
  const standPrint = (v: SetV) => T(R(standShape(v), [90, 0, 0]), [0, 0, -standY(v)[0]]);
  /** The room the handle's hub disc needs in the arm (it reaches below the arm's top), and the handle swinging over. */
  const standPocket = (v: SetV) => {
    const [y0, y1] = standY(v);
    return T(R(s.extrude(circle(standRootR(v) + c, 48, [v.leverX, v.standZ]), y1 - y0 + 2 * c), [90, 0, 0]), [0, v.throwY + y1 + c, 0]);
  };
  /** The throw as printed: the plate-style slider on its side (its -y face down), posts and prongs along the layers. */
  const throwPrint = (v: SetV) => {
    const m = throwPart(v);
    if (!fdb) return m;
    const r = R(m, [90, 0, 0]), bb = r.boundingBox();
    return T(r, [-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]]);
  };

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
      const earHw = leverT() / 2 + c + g.leverEarT, wf = leverT() / 2 + c;
      return plan.setData.some((d) => (p.throwModule && Math.abs(q[0] - d.leverX) < 1.5 * STUD + r && Math.abs(q[1] - d.throwY) < 1.5 * STUD + r) // (under the bracket)
        || (Math.abs(q[0] - d.leverX) < 4 + r && Math.abs(q[1] - d.throwY) < earHw + r)
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
    if (!scadParity()) {
      // grip along the edges and every 4 studs, thin posts elsewhere (underside.ts), not a tube at every corner
      const hg = hollowGrid(s, t, cav, (lx, ly) => [lx, ly], Math.floor(xr[0] / 8) - 1, Math.ceil(xr[1] / 8), -1, Math.ceil(plan.baseY1 / 8), p.studGrip);
      grips.push(...hg.grips);
      return { under: T(s.extrude(hg.cut, g.bottomCavity + 0.01), [0, 0, pieceBottomZ - 0.01]), tubes: hg.tubes ? T(s.extrude(hg.tubes, g.bottomCavity), [0, 0, pieceBottomZ]) : s.union([]) };
    }
    for (let x = Math.floor(xr[0] / 8) * 8 + 4; x <= xr[1] + 1e-9; x += 8) for (let y = 4; y <= plan.baseY1 + 1e-9; y += 8) socks.push(getSocketShape() === 'round' ? circle(tc.studSocketW / 2, 24, [x, y]) : W.CrossSection.square([tc.studSocketW, tc.studSocketW], true).translate([x, y]));
    const under = T(s.extrude(W.CrossSection.union([cav, ...socks]), g.bottomCavity + 0.01), [0, 0, pieceBottomZ - 0.01]);
    const rings: CS[] = [];
    for (let x = Math.floor(xr[0] / 8) * 8; x <= xr[1] + 1e-9; x += 8) for (let y = 0; y <= plan.baseY1 + 1e-9; y += 8)
      rings.push(circle((6.51 - (p.antistudFit ?? 0.06)) / 2, 32, [x, y]).subtract(circle((4.8 + (p.antistudFit ?? 0.06)) / 2, 32, [x, y])));
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
      pointsBeds: s.union([s.difference(s.union(sets.map(pointsBed)), sets.map(pointsPockets)), ...(fdb ? sets.map(fdbPins) : [])]),
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
      ...(p.endSupports === false ? [] : [t.startRailSupports(supportZ), t.supportFooting(supportZ, 0, -1),
        ...plan.endPoses.map((e) => atPose(s.union([t.endRailSupports(supportZ), t.supportFooting(supportZ, 0, +1)]), e))]),
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
    const floor = s.union([named.turnoutTies, named.routeTies, named.leadTies, named.pointsBeds, named.connectors, ...(scadParity() ? [] : sets.map(throwArm))]).project()
      .subtract(W.CrossSection.union([...sets.flatMap((v) => [pointsSweep2d(v, c), bladeSlots2d(v, c)]), ...sets.map((v) => throwChannel(v).project())]));
    const keep = us.shapes.filter((q) => q.cs.intersect(floor).area() > 1);
    grips.length = 0; grips.push(...keep.filter((q) => q.tube).map((q) => q.c));
    tubes = keep.length ? s.difference(s.extrude(W.CrossSection.union(keep.map((q) => q.cs)), PLATE_H), [...sets.map(pointsPockets), ...sets.map(throwChannel)]) : undefined;
  }
  if (parts) { parts.body = body; if (tubes) parts.tubes = tubes; }
  return s.union([
    body,
    tubes,
    ...(p.endSupports === false ? [] : [t.startRailSupports(supportZ), t.supportFooting(supportZ, 0, -1),
      ...plan.endPoses.map((e) => atPose(s.union([t.endRailSupports(supportZ), t.supportFooting(supportZ, 0, +1)]), e))]),
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
    // (down to the bottom: on ballast the tongue's breakaway support stands on the bed, clear of the other part's ballast)
    ...cutRails(yc).map((r) => atCut(cube([8, 8, 30 - Math.min(0, pieceBottomZ)], [-4, -4, Math.min(-1, pieceBottomZ - 1)]), r[0], yc, 1, r[1])),
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
    const v: SetV = sets[k];
    return {
      // (the plate-style blades' pins on it too: a network's piece left them out)
      bed: fdb ? s.union([pointsBed(v), fdbPins(v)]) : pointsBed(v), pockets: pointsPockets(v), stockCut: stockFootCut(v), arm: throwArm(v), channel: throwChannel(v),
      bladeRails: [
        ...[0, 1].map((b) => [bRt(v, b), sweep(sq([9, 30], [bO(b) - 4.5, -5]), bRt(v, b), 0, v.sHeel + c)] as [Route, Man]),
        // (a three-way's branches' inner rails too: they start at the heels, the blades in their place before)
        ...(v.three ? [[v.three.L, +G], [v.three.R, -G]].map(([rt, o]) => [rt, sweep(sq([9, 30], [(o as number) - 4.5, -5]), rt as Route, 0, v.sHeel + c)] as [Route, Man]) : []),
      ],
    };
  };
  return {
    base, basePieces, mech,
    pointsPart: (k = 0) => pointsPart(sets[k]),
    /** The points' parts: one, or one per blade (pointsPieces 2). */
    pointsParts: (k = 0) => (fdb ? [0, 1].map((b) => fdbBladePart(sets[k], b)) : units(sets[k]).map((u) => unitPart(sets[k], u))),
    /** (bladeHold 'bracket') The brackets holding the blades down, as assembled; and one as printed (upside down, its top on the bed). */
    holdParts: (k = 0) => (holdOn ? [0, 1].map((b) => holdPart(sets[k], b)) : []),
    holdPrint: (m: Man) => { const r = R(m, [180, 0, 0]), bb = r.boundingBox(); return T(r, [-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]]); },
    /** Each points part's pivot and swing (to turn it to the left-hand route). */
    pointsUnits: (k = 0) => units(sets[k]).map((u) => ({ pivot: u.pivot, swing: u.swing })),
    throwPart: (k = 0) => throwPart(sets[k]),
    throwPrint: (k = 0) => throwPrint(sets[k]),
    leverPart: (k = 0) => leverPart(sets[k]),
    /** (throwAction 'overcentre') Peco's spring, as assembled and as printed; undefined without it. */
    springPart: (k = 0) => (ocOn(sets[k]) ? ocPart(sets[k]) : undefined),
    springPrint: (k = 0) => (ocOn(sets[k]) ? ocPrint(sets[k]) : undefined),
    /** Each points part's pin (where it turns), how far to turn it from as assembled to open it (blade 0 is closed as assembled), and to its other end (the plate-style blades; else undefined). */
    pointsTurns: (k = 0) => (fdb ? fdbBlades(sets[k]).map((f, b) => ({ at: f.pivot, by: b === 0 ? f.ang : 0, swing: b === 0 ? f.ang : -f.open })) : undefined),
    /** (throwModule) the lever's bracket, on the arm's studs. */
    bracketPart: (k = 0) => bracketPart(sets[k]),
    leverShape, leverPrint: (k = 0) => leverPrint(sets[k]),
    grips,
  };
}

