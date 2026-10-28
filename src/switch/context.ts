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
  /** the studs' fit (0.18, added to their 4.8 mm) and the anti-stud tubes' (0.06), as the LEGO fit settings */
  studFit?: number; antistudFit?: number;
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
  /** The points' mechanism: switch.scad's ('tines': the points under the bed, in pockets, on springy tines) or the plate-style ('plates': each blade on its own plate on top of the bed, on a pin, a slider bar through the bed under them). */
  mechStyle?: 'tines' | 'plates';
  /**
   * (the plate-style points) What holds the points over, and what a train trailing
   * through them the wrong way does: 'detent' (the lever's click, as before);
   * 'overcentre' (Peco's V spring between the bed and the slider: the points
   * snap to either side, a train trailing through pushes them over and they
   * stay). (the sprung blades spring back on their own, their springs in them.)
   */
  throwAction?: 'detent' | 'overcentre';
  /** (the plate-style points) The throw as a switch stand (a ground throw, Caboose Industries' way): a handle swung over on an eccentric in the slider's yoke, locked past dead centre at each end. */
  throwStand?: boolean;
  /** (the plate-style points) The blades: 'simple' (as before), 'prototype' (planed to a point and laid tight under the stock rail's undercut head, the tie bar at the points) or 'sprung' (leaf springs under the plate, a stud for its pivot). */
  bladeStyle?: 'simple' | 'prototype' | 'sprung';
  /** (the plate-style points, rigid blades) What holds each blade down: 'pin' (a snap lip on its pin, as before) or 'front' (a lip on the bed over its plate's front, as the sprung blades', and a plain pin). The sprung blades always have the lip. */
  bladeLip?: 'pin' | 'front';
  /** (the plate-style points) Blades per set: 2 (both move), or 1 (a single-point switch, as a tram's: only the blade on the more curved route moves; the other side's rail is fixed, from where it's a flangeway clear of its stock rail). A three-way keeps both. */
  pointBlades?: 1 | 2;
  /** (the plate-style points) The slider moved along this many studs from where it'd be (toward the heel: +), to keep its lever out of the way of other track or another lever. */
  throwShift?: number;
  /** (switch.scad's throw_ballast) On ballast: the ballast's steps carried on round the lever's arm, with studs. */
  throwBallast?: boolean;
  /** (clip_and_peg_on_ballast) On ballast: the end connectors keep their snap peg and C-clip. */
  pegOnBallast?: boolean;
  /** (generate_track off) The ballast alone, with a seat this much clear each side (mm) for the track printed apart. */
  ballastOnly?: number;
}

/** The switch stand's handle and eccentric (throwStand). */
export const STAND = {
  /** the eccentric's diameter, and the angle past dead centre it rests at each end */
  eccD: 7, overDeg: 8,
  /** the handle: from the hub to its end; its width (across, in its plane), its thickness (along the hub) */
  handleLen: 12, handleW: 3, handleT: 3,
  /** the hub's disc under the eccentric, on the handle's side */
  rootR: 5.2,
};

export const SWITCH_DEFAULTS: SwitchParams = {
  gaugeStuds: 4, pointThrow: 3, pointClearance: 0.3, springPreload: 1, springThickness: 0.9,
  springLength: 40, bladeDiscD: 14, leverOffset: 8, studH: 1.8, generateBallast: false,
};

export const PLATE_H = 3.2;
export const HEAD_HW = 1.25;
export const STUD = 8;

/**
 * (sprung blades, track alone) The slider as the reference's runs in its
 * base 2-04-033: a bar 1.6 thick, its top 0.2 under the bed's top, in a
 * groove open at the top, the bed at the sleepers' top. Their bar is 5 wide in
 * a 5.6 groove on a stud line, floored over the studs; here it goes between
 * two rows of a baseplate's studs instead (3.2 apart): 2.4 wide, in a 3.0
 * groove, so the track still sits on the studs. Its floor (over the
 * underside's hollow, posts at the stud corners: base.ts fdbRests) is c under
 * the bar (the clearance round every moving part), so 2.1 under the bed's
 * top, not the reference's 1.8 (its bar lies on it).
 */
export const SPRUNG_SLIDER = { barH: 1.6, under: 0.2, rodW: 2.4 };
/** sprung blades on track alone: the bed at the sleepers' top, the slider in a groove through it (SPRUNG_SLIDER). */
export const sprungLow = (p: { bladeStyle?: string; generateBallast?: boolean; mechStyle?: string }) => p.bladeStyle === 'sprung' && p.mechStyle === 'plates' && !p.generateBallast;

/** Values for the whole switch (not per set). */
import { scadParity as scadParityNow } from '../geom/track';

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
  // (the plate-style slider runs in a tunnel with a floor: room for one (0.6) under it)
  const fdb = p.mechStyle === 'plates', low = sprungLow(p);
  // (sprung blades on track alone: the bar in its groove from the bed's top down, between the underside's stud rows: SPRUNG_SLIDER)
  const layerZ0 = low ? PLATE_H - SPRUNG_SLIDER.under - SPRUNG_SLIDER.barH
    : pieceBottomZ + (antistud || !ballast ? bottomCavity : 0) + (p.mechFloor ?? (fdb ? (ballast ? 1.2 : 0.9) : 0.2));
  // (the plate-style: the slider bar in the bed under the blade plates: 2.4 tall, 2 without ballast, where the bed's thinner)
  const layerTop = layerZ0 + (low ? SPRUNG_SLIDER.barH : fdb ? (ballast ? 2.4 : 2) : 1.4);
  const cavityTop = layerTop + p.pointClearance;
  const bedTop = ballast || low ? PLATE_H : Math.max(PLATE_H, cavityTop + 0.8);
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
    leverBossLen: 3, leverDrvW: 1.2, leverEarT: 2, leverBumpR: 5, forkWall: 1.2,
    // (sprung blades on track alone: 4 studs wide, so its sides fall between stud rows, as the slider's line down its middle does)
    armW: (low ? 4 : 3) * STUD,
  };
}
export type SwitchGlobals = ReturnType<typeof switchGlobals>;

/**
 * (the plate-style points) One blade's layout, worked out with the rest of the plan
 * (switch/base.ts, fdbLayout): its pin, toe, the angle it swings, where the
 * slider's post meets it, its angle as modelled (for the right-hand route);
 * how far in from its rail the pin and the post are, and how far the pin was
 * moved along toward the toe (to keep plate round them clear of another
 * route's rail); the other routes' rails it keeps clear of, as polylines, and
 * their half-width at the plate; and why it can't, if it can't.
 */
export interface FdbBladeLayout {
  pivot: Pt; tip: Pt; ang: number; post: Pt; open: number;
  pivotIn: number; postIn: number; shift: number;
  keep: Pt[][]; hw: number; stockKeep?: Pt[]; stockHw?: number; blocked?: string;
  /** Another track's rails crossing the blade near its pin, where it hardly moves (a double slip's obtuse crossing): the blade notched there for their flanges, as a frog. */
  notches?: Notch[];
  /** (sprung blades) the spring's beams' length, where shorter than the full 34.5 (other track running past) */
  root?: number;
  /** (sprung blades, or rigid ones with bladeLip 'front') a lip on the bed over the plate's front holds it down (switch/base.ts LIP, LIP_RIGID); false where other track's too close for one */
  lip?: boolean;
  /** (in networks) where other points' blade plates beside it may be (a slip's, the next set's), as rings (non-zero winding): its plate cut clear of them by the clearance (switch/network.ts shares the room out) */
  plates?: Pt[][];
}

/** Another track's rail across a blade near its heel (a double slip's obtuse crossing): the rail, where along it and where it crosses; how far along it it's within the blade's width. */
export interface Notch { rt: Route; o: number; s: number; at: Pt; reach: number }

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
  // (the plate-style: the slider's post meets each blade 0.6 of the way from its
  // pin to its toe, on a stud of the frame's grid; its travel opens the
  // blade by the throw there, plus the preload (the sprung blades' springs take it))
  const fdbPivotY = railPoint(ra, sHeel - 4, -G)[1];
  // (prototype blades: the tie bar at the points, as a switch's head rod is: on the first stud line where the
  // throw arm clears the end connector (half its width past it) and its post has plate round it)
  const fdbYSimple = Math.max(toeY + 8, Math.min(fdbPivotY - 8, Math.round((fdbPivotY - 0.6 * (fdbPivotY - toeY) - 4) / 8) * 8 + 4));
  // (sprung blades on track alone: between two stud lines, where the slider's groove clears a baseplate's studs)
  const low = sprungLow(p), half = low ? 0 : 4;
  const fdbY0 = (p.bladeStyle === 'prototype' || p.bladeStyle === 'sprung') && p.mechStyle === 'plates'
    // (and with Peco's spring, room for its pin on the toe's side, past the plates' start)
    ? Math.min(low ? Math.max(toeY + 8, Math.min(fdbPivotY - 8, Math.round((fdbPivotY - 0.6 * (fdbPivotY - toeY)) / 8) * 8)) : fdbYSimple,
      Math.ceil((Math.max(toeY + 8, 8 + g.armW / 2, p.throwAction === 'overcentre' ? 8 + 12 + 4 : 0) - half) / 8 - 1e-6) * 8 + half) : fdbYSimple;
  // (moved along whole studs to keep its lever out of the way (throwShift): still on the stud grid as it was)
  const fdbY = (p.throwShift ?? 0) === 0 ? fdbY0 : Math.max(toeY + 8, Math.min(fdbPivotY - 8, fdbY0 + 8 * p.throwShift!));
  const fdbTravel = p.pointThrow * (fdbPivotY - fdbY) / Math.max(1, fdbPivotY - toeY) + p.springPreload;
  const leverTravel = over.leverTravel ?? (p.mechStyle === 'plates' ? fdbTravel : throwTravel + 2 * p.springPreload);
  const postX = [tineTip[0] - p.springPreload];
  const swingRange = [0, throwAng];
  const pointsEndY = pivotPt[1] + Math.max(g.discR, g.heelBarW / 2) + 2;
  const tipGap = Math.min(Math.abs(bladeMidAt(tineTip[1])[0] - railPoint(ra, sOf(ra, tineTip), -G)[0]),
    Math.abs(railPoint(rb, sOf(rb, tineTip), +G)[0] - bladeMidAt(tineTip[1])[0]));
  const throwDir = ps.tside ?? defaultThrowDir;
  const throwY = p.mechStyle === 'plates' ? fdbY : yS;
  const throwStockRt = throwDir > 0 ? ra : rb;
  const throwStockX = railPoint(throwStockRt, sOf(throwStockRt, [0, throwY]), throwDir * G)[0];
  const throwFaceX = throwStockX + throwDir * 3.9;
  const leverAng = deg(Math.asin(Math.min(0.9, leverTravel / 2 / g.leverDa)));
  // The switch stand (throwStand): its eccentric's offset, so that it moves the slider by the travel between
  // its two rests, each the over angle past dead centre; the hub as low as lets the handle lie on the arm's top
  const stand = !!p.throwStand && p.mechStyle === 'plates';
  const standE = leverTravel / 2 / Math.cos(rad(STAND.overDeg));
  // (its grip, at its end, the lowest of it)
  const standZ = g.bedTop + p.pointClearance + (STAND.handleLen - 0.6) * Math.sin(rad(STAND.overDeg)) + STAND.handleW / 2 + 0.6;
  const leverTipZ = g.leverPz - g.leverDa * Math.cos(rad(leverAng));
  // (from the sleepers' end, ballast or not: the arm stands over the ballast's lower steps)
  const throwEdgeX = throwDir * (g.ballast && scadParityNow() ? (g.buddy ? g.ballastBottomW : g.ballastMidW) / 2 : g.sleeperLen / 2);
  const leverMinD = Math.max(throwDir * throwFaceX + Math.max(4 + 1.5, leverTravel / 2 + g.leverTipD / 2 + 2 * p.pointClearance + 1.2 + 1.5,
    // (the stand: its yoke, and its handle lying toward the track, clear of the stock rail's foot)
    stand ? Math.max(leverTravel / 2 + STAND.eccD / 2 + 2 * p.pointClearance + 1.2 + 1.5, STAND.handleLen + 1.5) : 0),
    p.throwModule ? g.sleeperLen / 2 + 1.5 * STUD + 0.2 : 0); // (a bracket, 3 studs square, clear of the sleepers (the top of the bed): over a ballast's lower steps is fine)
  const leverX = throwDir * Math.max(throwDir * throwEdgeX + p.leverOffset, leverMinD);
  const forkX = leverX - leverTravel / 2;
  const forkLipZ = leverTipZ + g.leverTipD / 2 + p.pointClearance;
  // (the stand's yoke: up past the eccentric's centre at its highest)
  const forkTop = stand ? standZ + standE + 0.4 : forkLipZ + 0.8;
  const forkMouthHw = g.leverDrvW / 2 + (forkTop - leverTipZ) * Math.tan(rad(leverAng)) + p.pointClearance;
  const stepYa = Math.max(0, Math.floor((throwY - g.armW / 2) / STUD) * STUD - STUD);
  const stepYb = Math.ceil((throwY + g.armW / 2) / STUD) * STUD + STUD;
  const stepXo = throwDir * (Math.ceil((throwDir * (leverX + throwDir * 10)) / STUD) * STUD + STUD);
  const armRect = [Math.min(throwStockX, leverX + throwDir * 10), Math.max(throwStockX, leverX + throwDir * 10), throwY - g.armW / 2, throwY + g.armW / 2];
  const warnings: string[] = [];
  if (tipGap - HEAD_HW - p.pointClearance < p.springThickness + g.tineGap / 2 + leverTravel + p.springPreload + 0.5)
    warnings.push('not enough room between the blades for the spring tines; lower point_throw or spring_preload');
  if (!stand && forkMouthHw > g.leverTipD / 2 - 0.25) warnings.push("the fork's mouth is too wide to hold the lever's tip");
  return {
    ra, rb, sToe, sHeel, toeY, sBpiv, pivotPt, throwAng, tineLen, yS, tineTip, throwTravel, leverTravel, postX, fdbTravel,
    swingRange, pointsEndY, tipGap, throwDir, throwY, throwStockRt, throwStockX, throwFaceX, leverAng, leverTipZ,
    throwEdgeX, leverMinD, leverX, forkX, forkLipZ, forkTop, forkMouthHw, stepYa, stepYb, stepXo, armRect, stand, standE, standZ,
    bladeMidAt, warnings,
    /** (the plate-style points) each blade's layout: filled in by switchPlan */
    fdb: undefined as FdbBladeLayout[] | undefined,
    /** other track's rails across each blade near its heel (notched), and whether any comes across it anywhere else: filled in by switchPlan */
    notches: undefined as Notch[][] | undefined, crossBlocked: false,
    /** (a single-point switch) the blade that's fixed rail instead, and where along its route that rail starts: filled in by switchPlan */
    fixed: undefined as 0 | 1 | undefined, sMate: undefined as number | undefined,
    /** the throw arm runs under other track (its rails across the arm, past the stock rail), and whether the slider can
     * pass under it there (a closed tunnel; with blades on top, the slider in two parts: switch/base.ts fdbSplit): filled in by switchPlan */
    under: false, underOk: false,
  };
}
export type PointsSetValues = ReturnType<typeof pointsSet>;
