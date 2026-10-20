// A points set's machinery (switch.scad's with_set $ variables, ported): from
// the set's two routes and toe, where the blades pivot and how far they
// swing, the spring tines, the slider, and the lever with its fork.
//
// Units: mm and degrees. As in switch.scad, set "a" is the right-hand route
// (its inner rail, at -G, is blade 0) and "b" the left-hand one (blade 1, at
// +G); the throw side is +1 for right, -1 for left.
import { type Pt, type Route, railPoint, routeLat, routeLength, routeSOf } from '../route/route';

export interface SwitchParams {
  gaugeStuds: number;
  pointThrow: number;       // 3
  pointClearance: number;   // 0.3
  springPreload: number;    // 1
  springThickness: number;  // 0.9
  springLength: number;     // 40
  bladeDiscD: number;       // 14
  leverOffset: number;      // 8
  studH: number;            // 1.8
  generateBallast: boolean; // false: track only; true: on ballast (switch.scad's generate_ballast)
  /** With ballast: the widest bottom layer (generate_ballast_buddy). */
  ballastBuddy?: boolean;
  /** With ballast: the underside, anti-stud (hollow with tubes) or float (flat). */
  bottomStyle?: 'antistud' | 'float';
  /** The lever's driver length beyond its least (10): longer swings it less for the same travel (a three-way's). */
  leverReach?: number;
  /** A solid floor this thick (mm) under the moving parts, over the underside's hollow: the pockets stop on it instead of going through to the bottom (unset: switch.scad's, through). */
  mechFloor?: number;
  /** Breakaway print supports under the rail-end tongues at each end (default on; off: leave them to the slicer). */
  endSupports?: boolean;
  /** The throw as the plate-style: the lever on its own bracket (a 3 x 3 stud plate with the ears) on studs on the arm, not built into it. */
  throwModule?: boolean;
}

export const SWITCH_DEFAULTS: SwitchParams = {
  gaugeStuds: 4, pointThrow: 3, pointClearance: 0.3, springPreload: 1, springThickness: 0.9,
  springLength: 40, bladeDiscD: 14, leverOffset: 8, studH: 1.8, generateBallast: false,
};

export const PLATE_H = 3.2;
export const HEAD_HW = 1.25;
export const STUD = 8;

/** Values for the whole switch (not per set). */
export function switchGlobals(p: SwitchParams) {
  const G = ((p.gaugeStuds + 1) * STUD) / 2;
  const sleeperLen = 2 * G + 24;
  // Ballast (track_lib.scad): 2 plates thick, its top at the sleeper top;
  // the top layer as wide as the sleepers, each step below a stud wider.
  const ballast = p.generateBallast, buddy = ballast && (p.ballastBuddy ?? true);
  const antistud = ballast && (p.bottomStyle ?? 'antistud') === 'antistud';
  const ballastThickness = 2 * PLATE_H, ballastOffsetZ = -PLATE_H;
  const ballastTopW = sleeperLen, ballastMidW = ballastTopW + 2 * STUD, ballastBottomW = ballastMidW + 2 * STUD;
  const buddyT = antistud ? PLATE_H : ballastThickness / 4;
  const pieceBottomZ = ballast ? (buddy ? ballastOffsetZ - buddyT : ballastOffsetZ) : 0;
  const bottomCavity = p.studH + 0.2;
  // (with an anti-stud underside, or none at all, the parts sit above a baseplate's studs)
  const layerZ0 = pieceBottomZ + (antistud || !ballast ? bottomCavity : 0) + (p.mechFloor ?? 0.2);
  const layerTop = layerZ0 + 1.4;
  const cavityTop = layerTop + p.pointClearance;
  const bedTop = ballast ? PLATE_H : Math.max(PLATE_H, cavityTop + 0.8);
  const leverTipD = 4.5, leverBossD = 5;
  const leverTipLow = layerZ0 + 0.6 + p.pointClearance + leverTipD / 2;
  // (on a bracket the pivot is a plate higher: over the arm's top, its studs and the bracket's plate)
  const leverPz = Math.max((p.throwModule ? bedTop + PLATE_H : PLATE_H) + leverBossD / 2 + 1.5, leverTipLow + (p.leverReach ?? 10));
  const leverDa = leverPz - leverTipLow;
  const bladeNeed = 2 * HEAD_HW + p.pointThrow + p.pointClearance + 0.6;
  return {
    ballast, buddy, antistud, ballastThickness, ballastOffsetZ, ballastTopW, ballastMidW, ballastBottomW, buddyT,
    G, sleeperLen, pieceBottomZ, bottomCavity, layerZ0, layerTop, cavityTop, bedTop,
    leverTipD, leverBossD, leverTipLow, leverPz, leverDa, bladeNeed,
    discR: p.bladeDiscD / 2, pivotPinD: 3, pivotPinUp: 0.5, heelBarW: 4,
    postW: 1.2, postL: 3, tineGap: 1.2 + 0.3, throwRodW: 3,
    leverBossLen: 3, leverDrvW: 1.2, leverEarT: 2, leverBumpR: 5, forkWall: 1.2, armW: 3 * STUD,
  };
}
export type SwitchGlobals = ReturnType<typeof switchGlobals>;

/** One points set: right-hand route, left-hand route, toe (arc length), throw side (or undefined: the default). */
export interface PointsSet { ra: number; rb: number; sToe: number; tside?: number }

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const sOf = (rt: Route, pt: Pt) => routeSOf(rt, pt, 0, -1, 26);
const rotAbout = (pt: Pt, c: Pt, ang: number): Pt => [
  c[0] + (pt[0] - c[0]) * Math.cos(rad(ang)) - (pt[1] - c[1]) * Math.sin(rad(ang)),
  c[1] + (pt[0] - c[0]) * Math.sin(rad(ang)) + (pt[1] - c[1]) * Math.cos(rad(ang)),
];

/**
 * Work out a points set's machinery (switch.scad's with_set).
 * defaultThrowDir: the throw side when the set doesn't say (switch.scad: -1
 * for a right switch, else +1).
 */
export function pointsSet(routes: Route[], ps: PointsSet, p: SwitchParams, defaultThrowDir = 1,
  /** (a true three-way's own heel and slider travel; see switch/base.ts) */
  over: { sHeel?: number; leverTravel?: number } = {}) {
  const g = switchGlobals(p), G = g.G;
  const ra = routes[ps.ra], rb = routes[ps.rb], sToe = ps.sToe;
  const lenMin = Math.min(routeLength(ra), routeLength(rb));
  const sepR = (s: number) => Math.abs(routeLat(rb, railPoint(ra, s, -G)) + G);
  const sepL = (s: number) => Math.abs(routeLat(ra, railPoint(rb, s, +G)) - G);
  const firstS = (sep: (s: number) => number) => { let s = sToe; while (!(s > lenMin) && !(sep(s) >= g.bladeNeed)) s += 0.5; return s; };
  const sHeel = over.sHeel ?? Math.max(firstS(sepR), firstS(sepL), sToe + 20);
  const toeY = railPoint(ra, sToe, -G)[1];
  const sBpiv = sHeel - 4;
  const a = railPoint(ra, sBpiv, -G), b = railPoint(rb, sBpiv, +G);
  const pivotPt: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const throwAng = deg(p.pointThrow / (pivotPt[1] - toeY));
  const tineLen = Math.min(p.springLength, pivotPt[1] - 10 - 2.5);
  const yS = pivotPt[1] - tineLen - 2;
  const bladeMidAt = (y: number): Pt => {
    const pa = railPoint(ra, sOf(ra, [0, y]), -G), pb = rotAbout(railPoint(rb, sOf(rb, [0, y]), +G), pivotPt, -throwAng);
    return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  };
  const tineTip: Pt = [bladeMidAt(yS + 2)[0], yS + 2];
  const throwTravel = (tineLen - g.postL / 2) * rad(throwAng);
  const leverTravel = over.leverTravel ?? throwTravel + 2 * p.springPreload;
  const postX = [tineTip[0] - p.springPreload];
  const swingRange = [0, throwAng];
  const pointsEndY = pivotPt[1] + Math.max(g.discR, g.heelBarW / 2) + 2;
  const tipGap = Math.min(Math.abs(bladeMidAt(tineTip[1])[0] - railPoint(ra, sOf(ra, tineTip), -G)[0]),
    Math.abs(railPoint(rb, sOf(rb, tineTip), +G)[0] - bladeMidAt(tineTip[1])[0]));
  const throwDir = ps.tside ?? defaultThrowDir;
  const throwY = yS;
  const throwStockRt = throwDir > 0 ? ra : rb;
  const throwStockX = railPoint(throwStockRt, sOf(throwStockRt, [0, throwY]), throwDir * G)[0];
  const throwFaceX = throwStockX + throwDir * 3.9;
  const leverAng = deg(Math.asin(Math.min(0.9, leverTravel / 2 / g.leverDa)));
  const leverTipZ = g.leverPz - g.leverDa * Math.cos(rad(leverAng));
  const throwEdgeX = throwDir * (g.ballast ? (g.buddy ? g.ballastBottomW : g.ballastMidW) / 2 : g.sleeperLen / 2);
  const leverMinD = Math.max(throwDir * throwFaceX + Math.max(4 + 1.5, leverTravel / 2 + g.leverTipD / 2 + 2 * p.pointClearance + 1.2 + 1.5),
    p.throwModule ? g.sleeperLen / 2 + 1.5 * STUD + 0.2 : 0); // (a bracket, 3 studs square, clear of the sleepers (the top of the bed): over a ballast's lower steps is fine)
  const leverX = throwDir * Math.max(throwDir * throwEdgeX + p.leverOffset, leverMinD);
  const forkX = leverX - leverTravel / 2;
  const forkLipZ = leverTipZ + g.leverTipD / 2 + p.pointClearance;
  const forkTop = forkLipZ + 0.8;
  const forkMouthHw = g.leverDrvW / 2 + (forkTop - leverTipZ) * Math.tan(rad(leverAng)) + p.pointClearance;
  const stepYa = Math.max(0, Math.floor((throwY - g.armW / 2) / STUD) * STUD - STUD);
  const stepYb = Math.ceil((throwY + g.armW / 2) / STUD) * STUD + STUD;
  const stepXo = throwDir * (Math.ceil((throwDir * (leverX + throwDir * 10)) / STUD) * STUD + STUD);
  const armRect = [Math.min(throwStockX, leverX + throwDir * 10), Math.max(throwStockX, leverX + throwDir * 10), throwY - g.armW / 2, throwY + g.armW / 2];
  const warnings: string[] = [];
  if (tipGap - HEAD_HW - p.pointClearance < p.springThickness + g.tineGap / 2 + leverTravel + p.springPreload + 0.5)
    warnings.push('not enough room between the blades for the spring tines; lower point_throw or spring_preload');
  if (forkMouthHw > g.leverTipD / 2 - 0.25) warnings.push("the fork's mouth is too wide to hold the lever's tip");
  return {
    ra, rb, sToe, sHeel, toeY, sBpiv, pivotPt, throwAng, tineLen, yS, tineTip, throwTravel, leverTravel, postX,
    swingRange, pointsEndY, tipGap, throwDir, throwY, throwStockRt, throwStockX, throwFaceX, leverAng, leverTipZ,
    throwEdgeX, leverMinD, leverX, forkX, forkLipZ, forkTop, forkMouthHw, stepYa, stepYb, stepXo, armRect,
    bladeMidAt, warnings,
  };
}
export type PointsSetValues = ReturnType<typeof pointsSet>;
