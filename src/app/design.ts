// The editor's document: routes in studs and degrees, as people enter them,
// and their conversion to the solver's routes in mm.
import { REF1_PLAIN, REF1_SETS } from './templates-ref1';
import { REF_COMBOS } from './templates-ref-combos';
import { REF_LOOPS } from './templates-ref-loops';
import { REF_KITS } from './templates-ref-kits';
import { RANGE2, RANGE2_SETS } from './templates-4dbrix';
import { BRICKTRACKS_PARTS, BRICKTRACKS_SETS } from './templates-bricktracks';
import { MONO_TRACKWORK } from './templates-monorail';
import { type Table, tableOf } from './tables';
import { clampDesign } from './limits';
import { cleanCuts } from './routecuts';
import { cleanApart, cleanPaths, type Expert } from './cutpaths';
import { BANK_KEYS, cleanOwn, type Own } from './routeown';
import { cleanStretches, type Stretch } from './stretches';
import { cleanShared, cleanSleeperEdits, handSleepers, type SleeperEdit } from './sleeperedits';
import { cleanAccept } from './accept';
import { cleanRailEdits, handRails, type RailEdits } from './railedits';
import type { ExtraRails, Roll, Route, RouteEnds, Segment } from '../route/route';
import { routeLength, routePose } from '../route/route';

export const STUD = 8;

export type DSeg =
  | { kind: 'straight'; studs: number }
  | { kind: 'curve'; radius: number; angle: number; bank?: number; bankRamps?: BankRamps }; // radius in studs, angle signed (+ = left)

/**
 * A banked curve's ends where its bank ramps to the track beyond inside the
 * curve (curves.scad's superelevation_ramp_ends). At an end that doesn't, the
 * bank holds to the curve's end: the ramp is on the track beyond it, or, at a
 * route's end, the end stays banked (to join other banked track).
 */
export type BankRamps = 'both' | 'start' | 'end' | 'none';

export interface DRoute {
  name: string; x: number; y: number; heading: number; segs: DSeg[]; // start in studs
  /** When this route branches off another (a switch): which side its lever goes (auto: the options' setting). */
  throwSide?: 'auto' | 'left' | 'right';
  /** What the route's start / end is: an ordinary end connector (default), or a buffer stop (buffer.scad: the rails run into two posts joined by a buffer beam, no connector). */
  startEnd?: 'connector' | 'buffer';
  endEnd?: 'connector' | 'buffer';
  /** Bridge guard rails: one inside each running rail (straight.scad's guard_rails; the rest left out = the defaults in RAIL_DEFAULTS). */
  guardRails?: boolean;
  /** Which ends of the route as drawn the guard rails come to a point at (guard_rail_ends). */
  guardRailEnds?: RouteEnds;
  guardRailGapStuds?: number;
  guardRailTaperStuds?: number;
  guardRailTaperShape?: 'straight' | 'curve';
  guardRailNoseRampStuds?: number;
  /** Dual gauge: a third rail for a narrower gauge sharing one running rail (dual_gauge). */
  dualGauge?: boolean;
  dualGaugeStuds?: number;
  /** The running rail both gauges share, right or left of the route as drawn (dual_shared); centre: neither, the narrow gauge up the middle on two rails of its own (four rails). */
  dualShared?: 'right' | 'left' | 'centre';
  /** Ends of the route as drawn that meet plain track: the third rail stops short there (dual_plain_ends). */
  dualPlainEnds?: RouteEnds;
  /** Its own gauge, studs between its rails (left out: the design's, Design.gaugeStuds): a narrow-gauge line in a standard-gauge design, say. Train track only. */
  gaugeStuds?: number;
  /** What runs on it: train track (left out: train), or LEGO monorail beam. */
  system?: 'train' | 'monorail';
  /** (monorail) the beam's height off the baseplate, in plates (3.2 mm); left out: the supports' height (Settings › Monorail), or on the baseplate without supports */
  monoHeight?: number;
  /** (monorail) its height at its end, in plates: it ramps from monoHeight to this, easing in and out (left out: level) */
  monoHeightEnd?: number;
  /** Locked: it can be selected and copied, not moved, reshaped, mirrored, turned or deleted till it's unlocked (lock.ts). Left out: not locked. */
  locked?: boolean;
  /** (expert) Where its track is cut into parts by hand, studs along it from its start: an ordinary track end both sides, as between two track pieces (routecuts.ts). Left out: none. */
  cuts?: number[];
  /** (expert) Cut only where its hand cuts are (and at the tables' seams): no automatic lengths. Left out: the app cuts it too. */
  cutsLocked?: boolean;
  /** (expert) Its own settings, over the design's (routeown.ts ROUTE_KEYS: its ballast or sleepers, underside, bought or printed, its banks' ramps; overrides.ts says what's in force). Left out: the design's. */
  own?: Own;
  /** (expert) Stretches of it with settings of their own, over the track's (stretches.ts: from and to in whole studs from its start; each is built as a track of its own). Left out: none. */
  stretches?: Stretch[];
  /** (expert) Its sleepers edited by hand, each by where it is, studs along from the start: moved, taken out, added, longer on a side, square to the grid, without studs (sleeperedits.ts). Left out: as the app lays them. */
  sleeperEdits?: SleeperEdit[];
  /** (expert) Its rails edited by hand: gaps cut in a rail, guard rails along stretches, check rails added, square rail ends at cuts (railedits.ts). Left out: as the app lays them. */
  railEdits?: RailEdits;
}
/** The extra rails' settings left out of a route (straight.scad's defaults). */
export const RAIL_DEFAULTS = {
  guardRailEnds: 'none' as RouteEnds, guardRailGapStuds: 0.8, guardRailTaperStuds: 8, guardRailTaperShape: 'straight' as 'straight' | 'curve', guardRailNoseRampStuds: 1.5,
  dualGaugeStuds: 2, dualShared: 'right' as 'right' | 'left' | 'centre', dualPlainEnds: 'none' as RouteEnds,
};
/**
 * A dual-gauge route's narrow gauge's own rails, for the plan: how far each is to the right of the route's middle (studs).
 * One beside the shared rail (the third rail), two centred; none where it isn't built (geom/extrarails.ts dualBuilt).
 */
export function dualRailOffsets(d: Design, r: DRoute): number[] {
  if (!r.dualGauge || r.system === 'monorail') return [];
  const gs = r.gaugeStuds ?? d.gaugeStuds, n = r.dualGaugeStuds ?? RAIL_DEFAULTS.dualGaugeStuds, sh = r.dualShared ?? RAIL_DEFAULTS.dualShared;
  if (sh === 'centre') return n <= gs - 2 ? [-(n + 1) / 2, (n + 1) / 2] : [];
  return n < gs ? [(sh === 'right' ? 1 : -1) * ((gs + 1) / 2 - (n + 1))] : [];
}
/** Is a route monorail (not train track)? */
export const isMono = (r: DRoute) => r.system === 'monorail';
export interface Design {
  version: 1; gaugeStuds: number; routes: DRoute[];
  /** The design's name: the file names it saves and downloads under. */
  name?: string;
  /** The rest of the piece options (switch.scad's), each left out = its default. */
  options?: Partial<PieceOptions>;
  /** Hand edits to the trackwork the app works out, by where each item is (its middle, mm, "x,y"). */
  trackwork?: Trackwork;
  /** The tables (modules) the layout is laid across, studs: the track's cut where they meet (tables.ts). */
  tables?: Table[];
  /** A test-print kit: coupons built side by side, each with settings of its own (build.ts buildKit). */
  kit?: KitPart[];
  /** (expert) What belongs to two routes or more: the cut paths drawn along and between tracks (cutpaths.ts). Left out: none. */
  expert?: Expert;
}
/**
 * A test-print kit's coupon: the routes it's made of (by name; a route renamed is no longer its), the settings it's
 * built with over the design's (a fit, a blade shape), the number marked on its track parts (ribs on a short
 * straight's side, 1 to 7; markBoth: on both its sides, a kit's second ladder), and what it is, for the README in the
 * STL zip. Its parts' names start with its name.
 */
export interface KitPart { name: string; routes: string[]; options?: Partial<PieceOptions>; mark?: number; markBoth?: boolean; note?: string }

/** Hand edits (each also says where on its route it is, on: twfollow.ts): check rails lengthened (+) or shortened (-) at each end, moved, or taken out; flangeway cuts lengthened; points moved along, taken out or forced; levers moved. */
export interface Trackwork {
  check?: Record<string, { d0?: number; d1?: number; shift?: number; off?: boolean; on?: TwAnchor; is?: TwIdent }>;
  /** each flangeway cut (a frog's): lengthened at each end (mm); (expert) open: cut down to the bed (an open frog); through: the rail runs through, not cut (the other route's wheels can't pass) */
  groove?: Record<string, { d0?: number; d1?: number; open?: boolean; through?: boolean; on?: TwAnchor; is?: TwIdent }>;
  /** each points set (by its toe): moved along (mm); taken out (off: no points, both routes' rails run through as fixed track); routes
   * taken out of it (drop, by id: a three-way's branch, leaving a two-way); or forced where a route meets another a hair off (force);
   * single (one moving blade, pointBlades 1): which route's blade moves, the more curved one's (default) or the straighter one's;
   * heel: the blades lengthened, their heels this far (mm) past where they're worked out (not a three-way's) */
  points?: Record<string, { toe?: number; off?: boolean; drop?: string[]; force?: boolean; single?: 'curved' | 'straight'; heel?: number;
    /** (expert, stage 5c) this set's own blade shape and moving blades, over the design's (Settings › Points; blades on top) */
    bladeStyle?: 'simple' | 'prototype' | 'sprung'; blades?: 1 | 2;
    /** (expert) this set's own mechanism, over the design's: its bed, the floor under its throw and its moving parts as that mechanism's */
    mech?: 'tines' | 'plates'; on?: TwAnchor; is?: TwIdent }>;
  /** each points set's lever, moved on the plan: its side, how far out (lever offset, mm), and how far along (its tines' length, mm);
   * each: a three-way's two levers (threeWayLevers 2), the left one's and the right one's own, where they differ (each is on its own side) */
  throw?: Record<string, { side?: 'left' | 'right'; leverOffset?: number; springLength?: number; /** (expert, stage 5c) its throw bar moved along the points, whole studs (+: towards the heel; blades on top) */ throwShift?: number; /** its lever on the side of its track away from this point (mm), where side isn't set: two sets at one toe, facing each way, their levers on the same side */ awayFrom?: [number, number]; /** (blades on top) thrown by hand, a nail switch with no lever (a double slip's diagonal's inner set at an X centre, as the reference's) */ nail?: boolean; /** (blades on top) its lever in a housing at a corner, this many studs along from where the routes part (less than the throw bar's: back toward the track's end), a tie-rod out to it from the slider; unset, beside the throw bar */ leverAt?: number; each?: { left?: { leverOffset?: number }; right?: { leverOffset?: number } }; on?: TwAnchor; is?: TwIdent }>;
}
/** Where on the track a hand edit is, so it follows its track when that's moved (twfollow.ts): the route by name, from its start or end, mm along, mm to the right of its centre line. The build goes by the edit's key alone. */
export type TwAnchor = [route: string, from: 's' | 'e', along: number, right: number];

/** What a hand edit's item is, so it's found again when its track is reshaped (twfollow.ts Ident): the routes it's between (by name), its side of the first (-1, 0, 1), which of the ones like it along that route, of how many. The build goes by the edit's key alone. */
export type TwIdent = [routes: string[], side: number, nth: number, of: number];

/** Piece options the editor's Options panel sets (switch.scad's Customizer settings). */
export interface PieceOptions {
  throwSide: 'auto' | 'left' | 'right'; // which side the lever goes (auto: the main route's side)
  leverOffset: number;     // mm past the piece's edge
  pointThrow: number;      // mm the blade tips move
  pointClearance: number;  // mm round moving parts
  springPreload: number;   // mm
  springThickness: number; // mm
  springLength: number;    // mm
  flangeway: number;       // mm
  flangewayDepth: number;  // mm
  checkRailLen: number;    // mm
  checkRailW: number;      // mm
  checkRailFlare: number;  // mm
  printBedX: number;       // mm
  printBedY: number;       // mm
  /** Cut the track at baseplate edges: their size in studs (32, 48, or multiples), 0 = don't. */
  baseplate: number;
  /** Where a baseplate's corner is, studs (the plate grid's offset). */
  baseplateX: number; baseplateY: number;
  /** How parts cut for the bed or the baseplates join: 'lego' rail-end tongues with a peg and C-clip (as LEGO track); 'dovetail' rail tongues with dovetails through the bed; 'axle' rail tongues with LEGO cross axles across the cut; 'flataxle' cut straight, rails and all, pinned with LEGO axles; 'butt' straight cuts, held only by the baseplate under them. */
  joint?: 'lego' | 'dovetail' | 'butt' | 'axle' | 'flataxle';
  /** Underside: hollow with anti-stud tubes at the edges and every 4 studs (default), or a tube at every corner between four studs, as a LEGO plate. */
  grip?: 'edges' | 'all';
  /** Switches' points: one part (both blades on one pivot) or two (each blade on its own, as the plate-style). */
  pointsPieces?: 1 | 2;
  /** Moving blades per set: 2, or 1 (a single-point switch: the other side's rail fixed; the plate-style points, not a three-way). */
  pointBlades?: 1 | 2;
  /** (sprung blades) A groove 0.4 deep in each blade's plate where the wheels' flanges run (off: the flat top, as the reference's). */
  bladeRelief?: boolean;
  /** A three-way's levers: 1 (one, three positions), or 2 (one to each blade, one each side, two positions each: blades on top). */
  threeWayLevers?: 1 | 2;
  /** (prototype) The points: built into the one piece, their pockets through to the bottom (switch.scad's); on a solid floor, the pockets stopping on it ('floor'); or the piece in layers stacked from the top (the lower layer with the moving parts' pockets, the deck with the bed and rails over it, held by studs; needs ballast). */
  pointsModule?: 'built-in' | 'layers';
  /** Breakaway print supports under the rail-end tongues at each end (off: the slicer supports them). */
  endSupports?: boolean;
  /** The studs on the sleepers: on the baseplate's grid, or in rows following the track (as the OpenSCAD curves). */
  curveStuds?: 'grid' | 'follow';
  /** The throw: 'bracket' (the plate-style: the lever on its own 3 x 3 stud bracket, on studs on the arm), 'built-in' (the ears part of the arm) or 'stand' (a switch stand, a ground throw as Caboose Industries': a handle swung over on an eccentric, locked at each end; plate-style points). */
  throwStyle?: 'bracket' | 'built-in' | 'stand' | 'nail';
  /** (blades on top, the lever built in) The lever's housing: the arm out to the lever ('arm', default), or a cross-bar 16 studs long with a 4 x 3 stud block at each end, the lever in the block on its side ('crossbar', as the reference range's). */
  leverHousing?: 'arm' | 'crossbar';
  /** Points with no room for a throw (its arm across other track, a double slip's in its middle): a nail switch ('nail') or the slider under that track to a lever past it ('slider', default). */
  boxedThrow?: 'nail' | 'slider';
  /** (plate-style points) What holds the points, and what a train trailing through them does: 'detent' (the lever's click), 'overcentre' (Peco's V spring: they snap over and stay), 'snap' (the snap clamp: a toggle on knife edges). (the sprung blades spring back on their own.) */
  throwAction?: 'detent' | 'overcentre' | 'snap';
  /** (plate-style points) The blades: 'sprung' (a spring in each, so trains can trail through), 'simple' (rigid: the slider's post in a plain hole, no spring), or 'prototype' (rigid, planed to a point, tight under the stock rail's undercut head, the tie bar at the points). */
  bladeStyle?: 'simple' | 'prototype' | 'sprung';
  /** (plate-style points, rigid blades) What holds each blade down: 'pin' (a snap lip on its pin) or 'front' (a lip on the bed over its plate's front, as the sprung blades', and a plain pin). */
  bladeLip?: 'pin' | 'front';
  /** The points' mechanism: 'tines' (switch.scad's: under the bed, from below) or 'plates' (each blade on a plate on top of the bed on a pin, a slider bar through the bed; the blades go in from above). */
  mechStyle?: 'tines' | 'plates';
  /** Ballast under the track: none, ballast, or ballast with the wider buddy layer under it. */
  ballast: 'none' | 'ballast' | 'buddy';
  /** (expert) With ballast: how far it reaches past the sleepers' ends on the track's left and on its right, whole studs (left out: 1 each side). */
  ballastLeftStuds?: number; ballastRightStuds?: number;
  /** (expert) With ballast, at a buffer stop: cut off square with the track's end (left out), or its steps carried on round the end. */
  ballastEnds?: 'square' | 'stepped';
  /** With ballast: the underside, anti-stud (hollow with tubes) or flat. */
  bottomStyle: 'antistud' | 'float';
  /** Track only: under the rails a solid bed (as LEGO's switches), or sleepers with gaps between them (as LEGO's straights and curves) where the track is plain. */
  sleepers: 'bed' | 'sleepers';
  /** The sleepers: each this many studs wide (2 as LEGO's, 1 as bridge ties), this many studs apart. */
  sleeperWidthStuds: number; sleeperGapStuds: number;
  /** Track only: the underside lined up with the baseplate's stud grid, or with the track itself (rows along it). */
  undersideGrid?: 'baseplate' | 'track';
  /** Long track: in parts that fill the print bed (cut along straight lines), or in track pieces cut square across it with ordinary end connectors (pieceLengthStuds long; 0: as long as fits the bed). */
  splitTrack?: 'bed' | 'lengths'; pieceLengthStuds?: number;
  /** A stud a cut between parts goes through: taken off ('off'), given whole to the part its middle is on, over the next part's edge ('whole'), or cut through, half on each ('split'). */
  studsAtCuts?: 'off' | 'whole' | 'split';
  /** (expert) Each end of a cut path that crosses a switch's branch at a slant turned square to the branch there, as a modular kit's sections are joined (handcuts.ts squarePathEnds); off: along the stud grid, as drawn. */
  pathSquare?: boolean;
  /** With track pieces: plain track bought, not printed: LEGO's straights (53401, with ballast on LEGO plates) and curves, R40 LEGO's (53400), R56 to R120 BrickTracks' ('lego'); only LEGO's, BrickTracks' radii printed ('lego-only'); or every piece printed ('print'). */
  legoTrack?: 'lego' | 'lego-only' | 'print';
  /** Bought track's printed ballast: a part for each bought piece, whole as it is (a switch's over-long one in two, between its sleepers); or 'together', one under the pieces side by side, cut for the bed and at table seams. */
  boughtBallast?: 'each' | 'together';
  /** Track up off the baseplate (a route's Height) stands on: printed supports (the monorail's, every 16 studs), or LEGO 2 x 8 bricks and plates (bought). */
  raisedOn?: 'printed' | 'lego';
  /** Parts joined with LEGO axles: the axles' length, studs (half in each part). */
  axleStuds?: number;
  /** Rail tongues at a cut: on every rail it crosses, or only on rails crossing it square (the others cut flat), as plate-style large switches are split. */
  tongueRails?: 'all' | 'square';
  /** LEGO fit: added to the studs' 4.8 mm (mm); the anti-stud tubes' outside smaller and bore bigger by this (mm). */
  studFit: number; antistudFit: number;
  /** (switch.scad's blade_disc_d) The tines mechanism's points: the round disc they pivot on, its diameter, mm. */
  bladeDiscD?: number;
  /** (switch.scad's throw_ballast) On ballast: the ballast's steps carried on round the lever's arm, so the lever stands on ballast. */
  throwBallast?: boolean;
  /** (straight.scad's technic_axle_holes) On ballast with the buddy layer: LEGO cross-axle holes through each end, under the outermost studs between the rails, to pin pieces together. */
  axleHoles?: boolean;
  /** (clip_and_peg_on_ballast) On ballast: the end connectors keep their snap peg and C-clip. */
  pegOnBallast?: boolean;
  /** (buffer.scad) Buffer stops: the posts' height above the ballast top, in plates; the beam's bottom and top above the rail top, mm; Technic pin holes through the posts. */
  /** Buffer stops: a rail-built frame with sprung buffers, or brick posts with studs on top to build on. */
  bufferStyle?: 'frame' | 'blocks';
  bufferPostPlates?: number; bufferBeamBottom?: number; bufferBeamTop?: number; bufferPinHoles?: boolean;
  /** (generate_track / generate_ballast) The track and the ballast printed as one part, or apart (the ballast with a seat the track drops into, trackFitTol mm clear each side). */
  trackBallast?: 'together' | 'apart';
  trackFitTol?: number;
  /** (name, label_*) Text engraved under the parts with a flat underside ('' = no labels); the size line (S16, R40 22.5°, LEFT R40 22.5°), the gauge (Ln4), and part numbers for parts cut for the bed. */
  labelText?: string; labelSize?: boolean; labelGauge?: boolean; labelParts?: boolean;
  /** Monorail (monorail_lib.scad's Details): studs at the ends (side, top in recesses, none); axle holes in the end faces; LEGO's 4 mm anti-studs; the joining axles' length (studs); the holes' fit (mm); what's engraved underneath. */
  monoEndStuds?: 'side' | 'top' | 'none'; monoAxleHoles?: boolean; monoLegoAntistud?: boolean; monoAxleLengthStuds?: number; monoHoleFit?: number;
  monoLabels?: 'name' | 'part' | 'none';
  /** Monorail points: the clearance round the moving parts (mm). */
  monoSwitchFit?: number;
  /** Monorail supports (monorail_support.scad): one every this many studs along the beam (0: none); their height in bricks and plates; base size (studs); anti-stud underside; studs round the base; closed frame. */
  monoSupportStuds?: number; monoSupportBricks?: number; monoSupportPlates?: number; monoSupportBaseXStuds?: number; monoSupportBaseYStuds?: number;
  monoSupportAntistud?: boolean; monoSupportBaseStuds?: boolean; monoSupportSolid?: boolean;
  /** A ramp's joint over a support: 'axles' (default), the ends keep their axle holes, the support stands under the beam (a plate or two short of LEGO's); 'noaxles', those two ends without axle holes, the support's pad up in the beam, LEGO's height; 'apart', ramps never cut over a support (the cut moved off it), every support mid-part. */
  monoRampJoint?: 'axles' | 'noaxles' | 'apart';
  /** Banked curves: the shortest ramp from level to the full bank, studs (curves.scad's superelevation_ramp_studs), lengthened to keep the outer rail's climb within 1 in bankClimb; ramps on the straights either side ('straight') or inside the curve ('curve', as curves.scad's pieces). */
  bankRampStuds?: number; bankClimb?: number; bankRampAt?: 'straight' | 'curve';
  /** No two studs on a part closer than a stud's pitch, 8 mm (geom/studpitch.ts): the ones that would be are left out, the ballast's rows spaced along their own line. Off (default): only never touching. */
  studsFullPitch?: boolean;
}
/**
 * A design saved by an older version, in today's terms (a copy; the design
 * itself is left alone): the old joint 'ends' is Long track cut into: Track
 * pieces; the old Rails at cuts: Cut flat is Straight cuts + LEGO axles
 * (it pinned every joint with axles, or nothing where they didn't fit); and
 * the grip and points parts, once kept on the design, are piece options; and
 * the spring-back blades (their tongues too thin to print) are sprung ones,
 * which spring back on their own (leaf springs under the plate).
 */
export function upgradeDesign(d0: Design): Design {
  // (a table saved with no shape: the one its numbers say, tables.ts tableOf; one that's none is left for the build to turn away)
  if (d0.tables?.some((t) => { const r = tableOf(t); return !!r && r !== t; })) return upgradeDesign({ ...d0, tables: d0.tables.map((t) => tableOf(t) ?? t) });
  const { grip, pointsPieces, ...d } = d0 as Design & { grip?: PieceOptions['grip']; pointsPieces?: PieceOptions['pointsPieces'] };
  const o = d.options as (Omit<Partial<PieceOptions>, 'joint'> & { joint?: string; cutRails?: string }) | undefined;
  // (a blade shape no longer offered: sprung; the blades' hold-down setting, gone: the sprung blades' lip holds them)
  const blade = (o as { bladeStyle?: string } | undefined)?.bladeStyle, oldBlade = blade !== undefined && !['simple', 'prototype', 'sprung'].includes(blade);
  const oldHold = !!o && 'bladeHold' in o;
  if (grip === undefined && pointsPieces === undefined && !oldBlade && !oldHold && (!o || (o.joint !== 'ends' && o.cutRails === undefined && (o as { throwAction?: string }).throwAction !== 'springback'))) return d0;
  const { cutRails, joint, bladeHold: _h, ...rest } = (o ?? {}) as typeof o & { bladeHold?: string };
  const j = joint === 'ends' ? undefined : joint as PieceOptions['joint'];
  return { ...d, options: { ...(grip && { grip }), ...(pointsPieces && { pointsPieces }), ...rest, ...(joint === 'ends' && { splitTrack: 'lengths' as const }),
    ...(cutRails === 'flat' && j !== 'butt' ? { joint: 'flataxle' as const } : j && { joint: j }),
    ...(oldBlade && { bladeStyle: 'sprung' as const }),
    ...((rest as { throwAction?: string }).throwAction === 'springback' && { throwAction: 'detent' as const, bladeStyle: 'sprung' as const }) } };
}
/**
 * A design from a file or the browser's store, checked before the editor takes it (then brought up to date, as
 * upgradeDesign). What the editor can't work without must be right: an error says what isn't (a file that's not a
 * design, a route without its numbers or its pieces). The rest, where it's not what it should be, is left out: the
 * settings (each one), the trackwork's hand edits, the tables, the name. Text cut short isn't JSON at all: that's said before this.
 */
export function readDesign(v: unknown): Design {
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  if (!obj(v) || !Array.isArray(v.routes)) throw new Error("it isn't a track design (.btd.json)");
  if (fin(v.version) && v.version > 1) throw new Error('it was saved by a newer version of Brick Track Designer');
  const routes = v.routes.map((r: unknown, i): DRoute => {
    const what = `route ${i + 1}${obj(r) && typeof r.name === 'string' && r.name ? ` (${r.name})` : ''}`;
    if (!obj(r)) throw new Error(`${what} isn't a route`);
    for (const k of ['x', 'y', 'heading']) if (!fin(r[k])) throw new Error(`${what} has no ${k === 'heading' ? 'heading' : `start ${k}`}`);
    if (!Array.isArray(r.segs)) throw new Error(`${what} has no pieces (segs)`);
    r.segs.forEach((sg: unknown, k) => {
      const ok = obj(sg) && ((sg.kind === 'straight' && fin(sg.studs)) || (sg.kind === 'curve' && fin(sg.radius) && sg.radius > 0 && fin(sg.angle)));
      if (!ok) throw new Error(`${what}'s piece ${k + 1} is neither a straight (studs) nor a curve (radius, angle)`);
    });
    // (its own gauge, where it's not a number: left out, so the design's)
    // (its hand cuts: the numbers among them, in order; their lock only a plain true)
    // (its own settings: the ones a track may have, each a value it takes; the rest left out, so the design's: routeown.ts)
    // (its sleepers edited by hand: the well-formed ones, sleeperedits.ts)
    const { gaugeStuds: gs, locked, cuts: cuts0, cutsLocked, own: own0, stretches: st0, sleeperEdits: se0, railEdits: re0, ...r1 } = r, railEdits = cleanRailEdits(re0), cuts = cleanCuts(cuts0), own = cleanOwn(own0), stretches = cleanStretches(st0), sleeperEdits = cleanSleeperEdits(se0);
    return { ...r1, ...(fin(gs) && { gaugeStuds: gs }), ...(locked === true && { locked }), ...(cuts && { cuts }), ...(cutsLocked === true && { cutsLocked }), ...(own && { own }), ...(stretches && { stretches }), ...(sleeperEdits && { sleeperEdits }), ...(railEdits && { railEdits }), name: typeof r.name === 'string' ? r.name : '' } as unknown as DRoute;
  });
  const d = { ...v, version: 1, gaugeStuds: fin(v.gaugeStuds) ? v.gaugeStuds : 4, routes } as Record<string, unknown>;
  if (typeof d.name !== 'string') delete d.name;
  // (a setting that's not the kind of thing it should be, a number where a choice goes: left out, so its default)
  const opts = (os: Record<string, unknown>) => Object.fromEntries(Object.entries(os).filter(([k, x]) => (k in OPTION_DEFAULTS ? typeof x === typeof (OPTION_DEFAULTS as unknown as Record<string, unknown>)[k] : ['string', 'number', 'boolean'].includes(typeof x)) && (typeof x !== 'number' || fin(x))));
  if (obj(d.options)) d.options = opts(d.options);
  else delete d.options;
  // (a kit's coupons: the ones with a name and their routes' names; their settings as the design's)
  const kit = (Array.isArray(d.kit) ? d.kit : []).filter((k: unknown): k is Record<string, unknown> => obj(k) && typeof k.name === 'string' && !!k.name && Array.isArray(k.routes) && k.routes.every((n) => typeof n === 'string'))
    .map((k): KitPart => ({ name: k.name as string, routes: k.routes as string[], ...(obj(k.options) && { options: opts(k.options) }), ...(fin(k.mark) && { mark: Math.min(7, Math.max(0, Math.round(k.mark))) }), ...(k.markBoth === true && { markBoth: true }), ...(typeof k.note === 'string' && { note: k.note }) }));
  if (kit.length) d.kit = kit; else delete d.kit;
  // (each edit's place on its route, where it isn't one, left out: it's worked out again from where the edit is)
  const anchor = (a: unknown) => Array.isArray(a) && a.length === 4 && typeof a[0] === 'string' && (a[1] === 's' || a[1] === 'e') && fin(a[2]) && fin(a[3]);
  // (and what its item is: noted again from the build's)
  const ident = (a: unknown) => Array.isArray(a) && a.length === 4 && Array.isArray(a[0]) && a[0].length > 0 && a[0].every((n) => typeof n === 'string') && fin(a[1]) && fin(a[2]) && fin(a[3]);
  if (obj(d.trackwork)) d.trackwork = Object.fromEntries(Object.entries(d.trackwork).filter(([, g]) => obj(g)).map(([k, g]) => [k, Object.fromEntries(Object.entries(g as object).filter(([, e]) => obj(e)).map(([key, e]) => [key, Object.fromEntries(Object.entries(e).filter(([f, x]) => (f !== 'on' || anchor(x)) && (f !== 'is' || ident(x))))]))]));
  else delete d.trackwork;
  // (expert, stages 5b and 5c: a frog's, a points set's and a lever's own only as they may be; else left out, the design's)
  if (d.trackwork) {
    const tw = d.trackwork as Trackwork, keep = <T>(e: Record<string, unknown>, f: string, ok: (x: unknown) => x is T) => { if (f in e && !ok(e[f])) delete e[f]; };
    for (const e of Object.values(tw.groove ?? {}) as Record<string, unknown>[]) { keep(e, 'open', (x): x is true => x === true); keep(e, 'through', (x): x is true => x === true); }
    for (const e of Object.values(tw.points ?? {}) as Record<string, unknown>[]) {
      keep(e, 'mech', (x): x is string => x === 'tines' || x === 'plates'); keep(e, 'bladeStyle', (x): x is string => x === 'simple' || x === 'prototype' || x === 'sprung'); keep(e, 'blades', (x): x is number => x === 1 || x === 2);
    }
    for (const e of Object.values(tw.throw ?? {}) as Record<string, unknown>[]) {
      if ('throwShift' in e) { const v = e.throwShift; if (typeof v === 'number' && Number.isFinite(v) && Math.round(v) !== 0) e.throwShift = Math.max(-5, Math.min(5, Math.round(v))); else delete e.throwShift; }
      if ('leverAt' in e) { const v = e.leverAt; if (typeof v === 'number' && Number.isFinite(v)) e.leverAt = Math.max(-40, Math.min(40, v)); else delete e.leverAt; }
    }
  }
  if (Array.isArray(d.tables)) {
    // (a table with no shape, where its numbers say what it is: that shape; else left out, tables.ts tableOf)
    // (a lock that's not a plain true: not locked)
    const tables = d.tables.map(tableOf).filter((t): t is Table => !!t).map((t) => { if (t.locked !== undefined && t.locked !== true) { const { locked: _l, ...rest } = t; return rest as Table; } return t; });
    if (tables.length) d.tables = tables; else delete d.tables;
  } else delete d.tables;
  // (expert: its cut paths, the well-formed ones (cutpaths.ts cleanPaths), and the pairs of its routes taken apart
  // (connections.ts cleanApart); nothing else is kept there)
  {
    const cutPaths = obj(d.expert) ? cleanPaths(d.expert.cutPaths) : undefined;
    const names = new Set((d.routes as DRoute[]).map((r, i) => r.name || String(i)));
    const apart = obj(d.expert) ? cleanApart(d.expert.apart, names) : undefined;
    // (and the sleepers shared across tracks: sleeperedits.ts cleanShared)
    const shared = obj(d.expert) ? cleanShared(d.expert.shared, names) : undefined;
    // (and the pairs of tracks that run over each other on purpose: accept.ts cleanAccept)
    const accept = obj(d.expert) ? cleanAccept(d.expert.accept, names) : undefined;
    if (cutPaths || apart || shared || accept) d.expert = { ...(cutPaths && { cutPaths }), ...(apart && { apart }), ...(shared && { shared }), ...(accept && { accept }) }; else delete d.expert;
  }
  // (its numbers held to their ranges, as the fields hold what's typed: limits.ts)
  return upgradeDesign(clampDesign(d as unknown as Design));
}
export const OPTION_DEFAULTS: PieceOptions = {
  throwSide: 'auto', threeWayLevers: 2, leverOffset: 8, pointThrow: 3, pointClearance: 0.3, springPreload: 1, springThickness: 0.9, springLength: 40,
  flangeway: 3, flangewayDepth: 3, checkRailLen: 30, checkRailW: 1, checkRailFlare: 1.5, printBedX: 256, printBedY: 256, baseplate: 0, baseplateX: 0, baseplateY: 0, ballast: 'none', bottomStyle: 'antistud', joint: 'lego', pointsModule: 'built-in', endSupports: true, tongueRails: 'all', grip: 'edges', pointsPieces: 1, pointBlades: 2, throwStyle: 'built-in', mechStyle: 'plates', curveStuds: 'follow',
  throwAction: 'detent', leverHousing: 'arm', bladeStyle: 'sprung', bladeLip: 'pin', sleepers: 'sleepers', undersideGrid: 'baseplate', splitTrack: 'lengths', pieceLengthStuds: 16, studsAtCuts: 'off', legoTrack: 'lego', axleStuds: 2, sleeperWidthStuds: 2, sleeperGapStuds: 2, studFit: 0.18, antistudFit: 0.06,
  bladeDiscD: 14, throwBallast: false, pathSquare: false, axleHoles: false, pegOnBallast: false,
  bufferStyle: 'frame', bufferPostPlates: 8, bufferBeamBottom: 2, bufferBeamTop: 12, bufferPinHoles: true,
  trackBallast: 'together', trackFitTol: 0.2, labelText: '', labelSize: true, labelGauge: false, labelParts: true,
  monoEndStuds: 'side', monoAxleHoles: true, monoLegoAntistud: false, monoAxleLengthStuds: 2, monoHoleFit: 0.1, monoLabels: 'name', monoSwitchFit: 0.3,
  monoSupportStuds: 0, monoSupportBricks: 5, monoSupportPlates: 0, monoSupportBaseXStuds: 4, monoSupportBaseYStuds: 4, monoSupportAntistud: true, monoSupportBaseStuds: true, monoSupportSolid: false, bankRampStuds: 40, bankClimb: 100, bankRampAt: 'straight',
};

/** A route made train track or monorail (its card's System): a monorail has no buffer stops, so its ends are ordinary again. */
export function setSystem(r: DRoute, system: 'train' | 'monorail') {
  if (system === 'monorail') { r.system = 'monorail'; delete r.startEnd; delete r.endEnd; } else delete r.system;
}

/** The buffer stops' positions (mm): the route ends set to end in one (by where they are, as routes are turned round and cut up). */
export function bufferEnds(d: Design): [number, number][] {
  const out: [number, number][] = [];
  toRoutes(d).forEach((rt, i) => {
    const r = d.routes[i];
    // (a monorail has none, whatever's left on its route from when it was train track)
    if (!rt.segments.length || isMono(r)) return;
    if (r.startEnd === 'buffer') out.push([rt.start[0], rt.start[1]]);
    if (r.endEnd === 'buffer') { const p = routePose(rt, routeLength(rt)); out.push([p[0], p[1]]); }
  });
  return out;
}

/** A route's gauge, studs between its rails: its own (DRoute.gaugeStuds), else the design's. A monorail has none of its own. */
export const routeGaugeStuds = (d: Design, r: DRoute) => (r.gaugeStuds !== undefined && !isMono(r) ? r.gaugeStuds : d.gaugeStuds);

export function toRoutes(d: Design): Route[] {
  return d.routes.map((r, i) => {
    const rolls = bankRolls(d, r).rolls;
    const rt: Route = {
      id: r.name || String(i),
      throwSide: r.throwSide,
      ...(r.system === 'monorail' && r.monoHeight !== undefined && { elev: r.monoHeight * 3.2, ...(r.monoHeightEnd !== undefined && { elevEnd: r.monoHeightEnd * 3.2 }) }),
      ...(r.system !== 'monorail' && ((r.monoHeight ?? 0) > 0 || (r.monoHeightEnd ?? 0) > 0) && { grade: [(r.monoHeight ?? 0) * 3.2, (r.monoHeightEnd ?? r.monoHeight ?? 0) * 3.2] as [number, number] }),
      // (its own gauge only where it's not the design's: a route at the design's gauge is as it always was)
      ...(routeGaugeStuds(d, r) !== d.gaugeStuds && { gauge: (routeGaugeStuds(d, r) + 1) * STUD }),
      start: [r.x * STUD, r.y * STUD, r.heading],
      segments: r.segs.map((sg, k): Segment => {
        const out: Segment = sg.kind === 'straight'
          ? { kind: 'straight', length: sg.studs * STUD }
          : { kind: 'arc', radius: sg.radius * STUD, angle: sg.angle };
        if (rolls[k]) out.roll = rolls[k];
        return out;
      }),
    };
    // (expert: what's edited by hand along it, only if anything is: its sleepers, the sleepers it shares with the tracks
    // beside, its ballast's width where that's not a stud each side)
    if (r.system !== 'monorail') {
      const name = r.name || String(i), shared = (d.expert?.shared ?? []).filter((sh) => sh.routes[0] === name), o = d.options;
      const bal = (o?.ballast ?? 'none') !== 'none' && ((o?.ballastLeftStuds ?? 1) !== 1 || (o?.ballastRightStuds ?? 1) !== 1);
      const hr = r.railEdits ? handRails(r.railEdits, o?.flangeway ?? 3) : {};
      if (r.sleeperEdits?.length || shared.length || bal || Object.keys(hr).length) {
        const len = routeLength(rt);
        rt.hand = { from: 0, to: len, len, ...(r.sleeperEdits?.length && { sleepers: handSleepers(r.sleeperEdits) }), ...(shared.length && { shared: shared.map((sh) => ({ a: sh.from * STUD, b: Math.min(len, sh.to * STUD), with: sh.routes.slice(1) })) }),
          ...(bal && { ballast: { left: Math.max(0, o?.ballastLeftStuds ?? 1) * STUD, right: Math.max(0, o?.ballastRightStuds ?? 1) * STUD } }),
          // (stage 5b: its rails edited by hand)
          ...hr };
      }
    }
    // (its extra rails, only if it has any: a route without them is as it always was)
    // (expert, stage 5b: guard rails only along stretches of it, when it hasn't them all along)
    const guardOn = !r.guardRails && !r.dualGauge && r.railEdits?.guards?.length ? r.railEdits.guards : undefined;
    if (r.guardRails || r.dualGauge || guardOn) {
      const v = { ...RAIL_DEFAULTS, ...Object.fromEntries(Object.entries(r).filter(([, x]) => x !== undefined)) } as typeof RAIL_DEFAULTS & DRoute, len = routeLength(rt);
      const extra: ExtraRails = {
        guard: !!r.guardRails || !!guardOn, ...(guardOn && { guardOn: guardOn.map((g) => ({ a: g.from * STUD, b: Math.min(len, g.to * STUD), side: (g.side === 'left' ? -1 : g.side === 'right' ? 1 : 0) as -1 | 0 | 1, ...(g.gap !== undefined && { gap: g.gap }) })) }), guardEnds: v.guardRailEnds, guardGapStuds: v.guardRailGapStuds, guardTaperStuds: v.guardRailTaperStuds, guardShape: v.guardRailTaperShape, guardRampStuds: v.guardRailNoseRampStuds,
        dual: !!r.dualGauge, dualStuds: v.dualGaugeStuds, dualShared: v.dualShared, dualPlainEnds: v.dualPlainEnds, from: 0, to: len, len,
      };
      rt.extra = extra;
    }
    return rt;
  });
}

/** The longest bank (degrees), as curves.scad's superelevation_angle. */
export const BANK_MAX = 10;
/** A level stretch at a route's end before a ramp: the end connector (curves.scad's bank_flat_end), mm. */
const BANK_FLAT_END = 8;
/** The ramp's shape: smoothstep (3t^2 - 2t^3), so the outer rail's slope is 0 at both ends of the ramp (no kink) and at most 1.5 x its mean in the middle. */
export const bankEase = (t: number) => { const u = Math.min(Math.max(t, 0), 1); return u * u * (3 - 2 * u); };
/** Its steepest slope, over the mean (d/dt of bankEase at t = 1/2). */
export const BANK_EASE_PEAK = 1.5;

/**
 * Each segment's roll (undefined: level) along a route, from its curves'
 * banks, and warnings for ramps steeper than the climb limit. A curve's bank
 * is + (the right side up) on a left curve. Wherever the bank changes it
 * eases from one to the other (bankEase: no kink in the outer rail's height),
 * over the ramp length or, if that's too short for the outer rail to stay
 * within the steepest climb (options), the length that keeps it there.
 * Ramps go on the track before and after a curve (the run-off on the
 * straight, as on real railways), or inside the curve (the 'curve' option, as
 * curves.scad's pieces); where there isn't enough of that, they run on into
 * the other side, and only past both sides' room are they shorter (and
 * steeper: warned, at where they are). A route's end is level (after a short
 * level stretch for its connector) unless the curve there says it stays
 * banked; two curves banked the same way the same amount run on with no ramp;
 * a reverse curve's bank eases through level across the change. Monorail
 * routes are left alone.
 */
/** A track's own bank ramp settings (DRoute.own), the ones it has. */
const bankOwn = (r: DRoute) => (r.own ? Object.fromEntries(BANK_KEYS.filter((k) => r.own![k] !== undefined).map((k) => [k, r.own![k]])) : {});
export function bankRolls(d: Design, r: DRoute): { rolls: (Roll | undefined)[]; warnings: string[] } {
  const segs = r.segs, n = segs.length, warnings: string[] = [];
  const v = segs.map((sg) => (sg.kind === 'curve' && sg.bank ? Math.sign(sg.angle) * Math.min(Math.max(sg.bank, 0), BANK_MAX) : 0));
  if (isMono(r) || !v.some((x) => x !== 0)) return { rolls: segs.map(() => undefined), warnings }; // (monorail: never banked)
  // (its own ramp settings over the design's: a track's banks are its own, whatever it's one part with)
  const o = { ...OPTION_DEFAULTS, ...d.options, ...bankOwn(r) };
  const L = segs.map((sg) => (sg.kind === 'straight' ? sg.studs * STUD : (Math.abs(sg.angle) * Math.PI * sg.radius * STUD) / 180));
  const S: number[] = []; L.reduce((acc, l, k) => { S[k] = acc; return acc + l; }, 0);
  const total = S[n - 1] + L[n - 1], g2 = (d.gaugeStuds + 1) * STUD; // (rail to rail: the outer rail's rise is g2 x sin(bank))
  const climb = Math.min(Math.max(o.bankClimb ?? 100, 20), 1000), minLen = Math.min(Math.max(o.bankRampStuds ?? 40, 2), 200) * STUD;
  const inCurve = o.bankRampAt === 'curve';
  const ramps = (k: number) => { const sg = segs[k]; return sg.kind === 'curve' ? sg.bankRamps ?? 'both' : 'both'; };
  // the changes: [boundary index, from, to]; a route end that stays banked has none
  const changes: { k: number; a: number; b: number }[] = [];
  if (v[0] !== 0 && ['both', 'start'].includes(ramps(0))) changes.push({ k: 0, a: 0, b: v[0] });
  for (let k = 1; k < n; k++) if (v[k - 1] !== v[k]) changes.push({ k, a: v[k - 1], b: v[k] });
  if (v[n - 1] !== 0 && ['both', 'end'].includes(ramps(n - 1))) changes.push({ k: n, a: v[n - 1], b: 0 });
  // each segment's room for the ramps at its ends: all of it for one, half each for two (less the connector's level stretch at a route end)
  const claims = segs.map((_, k) => changes.filter((c) => c.k === k || c.k === k + 1).length);
  const room = (k: number, atStart: boolean) => {
    if (k < 0 || k >= n) return 0;
    const flat = (k === 0 && atStart ? BANK_FLAT_END : 0) + (k === n - 1 && !atStart ? BANK_FLAT_END : 0);
    return Math.max(0, L[k] / Math.max(1, claims[k]) - flat);
  };
  const rise = (a: number, b: number) => g2 * Math.abs(Math.sin((b * Math.PI) / 180) - Math.sin((a * Math.PI) / 180));
  const iv = changes.map(({ k, a, b }) => {
    // (long enough for the climb limit, at least the ramp length)
    const want = Math.max(minLen, BANK_EASE_PEAK * climb * rise(a, b));
    const B = k === n ? total : S[k] ?? 0;
    const before = room(k - 1, false), after = room(k, true); // (room on the segment before the boundary, and after)
    let lo: number, hi: number;
    if (k === 0) { lo = BANK_FLAT_END; hi = lo + Math.min(want, after); }
    else if (k === n) { hi = total - BANK_FLAT_END; lo = hi - Math.min(want, before); }
    else {
      // (on the flatter side (the straight) by default, on the more banked side (the curve) with 'curve'; a reverse curve: across the change)
      const flatBefore = Math.abs(a) < Math.abs(b), sideBefore = a * b < 0 ? undefined : inCurve ? !flatBefore : flatBefore;
      const first = sideBefore === undefined ? want / 2 : sideBefore ? want : 0;
      let x0 = Math.min(first, before);
      const x1 = Math.min(want - x0, after);
      x0 = Math.min(want - x1, before); // (what the one side can't take, the other)
      lo = B - x0; hi = B + x1;
    }
    if (hi - lo < 1e-3) hi = lo + 1e-3;
    const peak = (BANK_EASE_PEAK * rise(a, b)) / (hi - lo);
    if (peak > 1 / climb + 1e-9) {
      const rt: Route = { id: r.name, start: [r.x * STUD, r.y * STUD, r.heading], segments: segs.map((sg): Segment => (sg.kind === 'straight' ? { kind: 'straight', length: sg.studs * STUD } : { kind: 'arc', radius: sg.radius * STUD, angle: sg.angle })) };
      const p = routePose(rt, (lo + hi) / 2);
      warnings.push(`${r.name}: a bank's ramp at ${(p[0] / STUD).toFixed(1)}, ${(p[1] / STUD).toFixed(1)} (studs) climbs 1 in ${Math.round(1 / peak)}, steeper than 1 in ${climb}: too little track there (${((hi - lo) / STUD).toFixed(1)} studs, ${(BANK_EASE_PEAK * climb * rise(a, b) / STUD).toFixed(1)} needed); lengthen the track either side or lower the bank`);
    }
    return { lo, hi, a, b };
  });
  const rollAt = (sAt: number) => {
    let cur = changes.length && changes[0].k === 0 ? 0 : v[0];
    for (const q of iv) {
      if (sAt < q.lo) return cur;
      if (sAt <= q.hi) return q.a + (q.b - q.a) * bankEase((sAt - q.lo) / (q.hi - q.lo));
      cur = q.b;
    }
    return cur;
  };
  // (as knots every 2 mm or so through the ramps, straight lines between; level stretches as two)
  const rolls = segs.map((_, k): Roll | undefined => {
    const s0 = S[k], s1 = s0 + L[k], at = new Set<number>([s0, s1]);
    for (const q of iv) {
      if (q.hi < s0 || q.lo > s1) continue;
      const m = Math.max(1, Math.ceil((q.hi - q.lo) / 2));
      for (let j = 0; j <= m; j++) { const x = q.lo + ((q.hi - q.lo) * j) / m; if (x >= s0 && x <= s1) at.add(x); }
    }
    const kn = [...at].sort((p, q) => p - q).map((x): [number, number] => [x - s0, rollAt(x)]);
    return kn.some(([, x]) => Math.abs(x) > 1e-9) ? kn : undefined;
  });
  return { rolls, warnings };
}

/** A name for a new route, prefix and the first number no route has (routes are known by their names: two the same would be mixed up). */
export function freeName(d: Design, prefix: string): string {
  let n = d.routes.length + 1;
  while (d.routes.some((r) => r.name === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** The end pose of a route, in studs and degrees (to start another route there). */
export function endOf(d: Design, i: number): { x: number; y: number; heading: number } {
  const rt = toRoutes(d)[i];
  const p = routePose(rt, routeLength(rt));
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(p[0] / STUD), y: r(p[1] / STUD), heading: r(p[2]) };
}

const sin = (d: number) => Math.sin((d * Math.PI) / 180), cos = (d: number) => Math.cos((d * Math.PI) / 180);
const tan = (d: number) => sin(d) / cos(d);
/** (a double slip's R40 slip road at 22.5 degrees, tangent to both tracks) how far before the crossing it leaves one track, studs */
const SLIP_LEAD = 40 * sin(22.5) - (40 * (1 - cos(22.5))) / tan(22.5);
/** Levers set by hand (Design.trackwork.throw), each by its points' toe (studs) and its side, in the points' own frame (looking the way the routes part). */
const leversAt = (sets: [number, number, 'left' | 'right'][], more: Omit<NonNullable<Trackwork['throw']>[string], 'side'> = {}): NonNullable<Trackwork['throw']> =>
  Object.fromEntries(sets.map(([x, y, side]) => [`${Math.round(x * STUD)},${Math.round(y * STUD)}`, { side, ...more }]));
/**
 * (a double slip as Aaron's reference photo has it) Where each set's lever's housing is, studs along its points from
 * where its routes part: at its own outer corner, 5.5 studs in from its track's end (the reference's housings are 3.5
 * to 8 in), beyond its points, a tie-rod out to it from the slider (switch/base.ts rodPart). from: how far the routes
 * part from the track's end (studs).
 */
const CORNER_LEVER = 5.5;
const cornerLever = (from: number) => CORNER_LEVER - from;
/** A reference slip's points and levers set by hand (Design.trackwork): each set by its toe's key (mm), with its lever's side (in the points' own frame, looking the way the routes part): the lever 7 studs from its track's centre line (3 past the sleepers' ends), as the reference's; and the points' own edits (toe, heel, single). */
const slipWork = (sets: Record<string, 'left' | 'right'>, points: (key: string) => NonNullable<Trackwork['points']>[string], leverAt?: number): Trackwork => ({
  points: Object.fromEntries(Object.keys(sets).map((k) => [k, points(k)])),
  throw: Object.fromEntries(Object.entries(sets).map(([k, side]) => [k, { side, leverOffset: 24, ...(leverAt !== undefined && { leverAt }) }])) });
/**
 * The R104 switch's points and lever set by hand (Design.trackwork) as the reference's base has them: the blades from 3.4
 * studs in (toe: 16 mm on from where the rails part; the reference's tongues start 3.1 to 3.5 in), the lever 7 studs
 * from the track's centre line (3 past the sleepers' ends) and 5 in (the reference's is 4.5 in: the slider lies between
 * the baseplate's studs, on a whole-stud line). side: the lever's (a three-way has one each side: left out).
 */
const r104Work = (side?: 'left' | 'right'): Trackwork => ({ points: { '0,0': { toe: 16 } }, throw: { '0,0': { ...(side && { side }), leverOffset: 24 } } });
/** The R104 double slip (TEMPLATES), left (1) or right (-1): the diagonal track crossing the straight one (which runs up) to its left, or to its right. */
/** The 22.5-degree crossings' diagonal, as the R104 double slip's: from its end at 22.5 degrees to the straight, 40 studs on and
 * 16 over, bending 0.75 degrees (R208) just in from each end so both ends are at 22.5 and on whole studs. turn: the way the
 * first bend turns (+1 left). */
function r104Diagonal(turn: 1 | -1): DSeg[] {
  const lead = 0.218121;
  return [{ kind: 'straight', studs: lead }, { kind: 'curve', radius: 208, angle: 0.754152 * turn }, { kind: 'straight', studs: 37.169679 }, { kind: 'curve', radius: 208, angle: -0.754152 * turn }, { kind: 'straight', studs: lead }];
}
function r104Slip(hand: 1 | -1): Design {
  // (the R104 switch's branch: 22.5 degrees of R104 and 0.218 studs straight end 40 on and 8 over)
  const lead = 0.218121;
  return { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', pointBlades: 1 }, routes: [
    { name: 'Straight', x: 0, y: -20, heading: 0, segs: [{ kind: 'straight', studs: 40 }] },
    { name: 'Diagonal', x: 8 * hand, y: -20, heading: 22.5 * hand, segs: [{ kind: 'straight', studs: lead }, { kind: 'curve', radius: 208, angle: -0.754152 * hand }, { kind: 'straight', studs: 37.169679 }, { kind: 'curve', radius: 208, angle: 0.754152 * hand }, { kind: 'straight', studs: lead }] },
    { name: 'Slip A', x: 0, y: -20, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 * hand }, { kind: 'straight', studs: lead }] },
    { name: 'Slip B', x: 8 * hand, y: -20, heading: 22.5 * hand, segs: [{ kind: 'straight', studs: lead }, { kind: 'curve', radius: 104, angle: -22.5 * hand }] },
    // (its points, levers and check rails worked out from the routes as the reference's (switch/dslip.ts): the straight
    // track's points 67 mm on from its ends, the diagonal's 78 (each 13.5 past the acute frog), one moving blade a set,
    // each lever outside at its corner, and the check rail opposite each acute frog ended short of the blade)
  ] };
}
/**
 * (the reference's R104 double slips, as plain routes: their points, levers and check rails worked out from them, switch/dslip.ts)
 * A diagonal starting at (x, y) along a track (heading up), off it on an R104 curve to 22.5 degrees (h 1: to the left,
 * -1: to the right), through n double slips 16 studs over and 40 up each (the diagonal of each, r104Slip's), and back
 * onto the heading it started on 16 over from the last: [route, the slips' centres (studs)].
 */
function slipDiagonal(name: string, x: number, y: number, h: 1 | -1, n: number): [DRoute, [number, number][]] {
  const L2 = 2 * 0.218121, run = [{ kind: 'straight' as const, studs: L2 }, { kind: 'curve' as const, radius: 208, angle: -0.754152 * h }, { kind: 'straight' as const, studs: 37.169679 }, { kind: 'curve' as const, radius: 208, angle: 0.754152 * h }];
  return [{ name, x, y, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 * h }, ...Array.from({ length: n }, () => run).flat(), { kind: 'straight', studs: L2 }, { kind: 'curve', radius: 104, angle: -22.5 * h }] },
    Array.from({ length: n }, (_, k) => [x - 16 * h * (k + 1), y + 60 + 40 * k] as [number, number])];
}
/** An R104 double slip's two slip roads (r104Slip's), at its centre (studs), its diagonal crossing to the left (h 1) or right (-1): A off the track onto the diagonal, B off the diagonal onto the track. */
function slipRoads(name: string, [cx, cy]: [number, number], h: 1 | -1): DRoute[] {
  const lead = 0.218121;
  return [{ name: `${name}A`, x: cx, y: cy - 20, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 * h }, { kind: 'straight', studs: lead }] },
    { name: `${name}B`, x: cx + 8 * h, y: cy - 20, heading: 22.5 * h, segs: [{ kind: 'straight', studs: lead }, { kind: 'curve', radius: 104, angle: -22.5 * h }] }];
}
/**
 * The double slip crossover (as the reference's set): two tracks 16 studs apart crossed by two diagonals, an R104 double
 * slip at each of the four places they cross, the diagonals crossing each other between the tracks at 45 degrees. Its
 * ends are the set's: the tracks' 80 studs, the diagonals' at 22.5 degrees, 8 studs out past the tracks.
 */
export function slipCrossover(): Design {
  const lead = 0.218121, run = (h: 1 | -1): DSeg[] => [{ kind: 'curve', radius: 208, angle: -0.754152 * h }, { kind: 'straight', studs: 37.169679 }, { kind: 'curve', radius: 208, angle: 0.754152 * h }];
  // (each diagonal through two slips: r104Slip's diagonal twice, end to end; h 1: up to the left, -1: up to the right)
  const diagonal = (name: string, x: number, h: 1 | -1): DRoute => ({ name, x, y: -20, heading: 22.5 * h, segs: [{ kind: 'straight', studs: lead }, ...run(h), { kind: 'straight', studs: 2 * lead }, ...run(h), { kind: 'straight', studs: lead }] });
  const tracks: DRoute[] = [0, 16].map((x, k) => ({ name: `T${k + 1}`, x, y: -20, heading: 0, segs: [{ kind: 'straight', studs: 80 }] }));
  return { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', pointBlades: 1 }, routes: [...tracks, diagonal('D1', -8, -1), diagonal('D2', 24, 1),
    ...slipRoads('D1-T1', [0, 0], -1), ...slipRoads('D1-T2', [16, 40], -1), ...slipRoads('D2-T2', [16, 0], 1), ...slipRoads('D2-T1', [0, 40], 1)] };
}
/**
 * The double slip monster crossover (as the reference's): three tracks 16 studs apart, a three-way at each end of the
 * centre one whose two side branches (R104, 22.5 degrees) carry on as the diagonals of R104 double slips on the outer
 * tracks, the lower three-way's to the upper slips and the upper's to the lower ones. Between the centre and each outer
 * track the two diagonals cross each other at 45 degrees, as the double slip crossover's do; the three-ways are thrown
 * by two levers each.
 */
export function slipMonster(): Design {
  const lead = 0.218121, diag = (h: 1 | -1): DSeg[] => [{ kind: 'straight', studs: lead }, { kind: 'curve', radius: 208, angle: -0.754152 * h }, { kind: 'straight', studs: 37.169679 }, { kind: 'curve', radius: 208, angle: 0.754152 * h }, { kind: 'straight', studs: lead }];
  // (studs; the outer tracks at x 0 and -32, the centre one at -16, the double slips' centres at y 0 and 40)
  const tracks: DRoute[] = [0, -16, -32].map((x, k) => ({ name: `T${k + 1}`, x, y: -20, heading: 0, segs: [{ kind: 'straight', studs: 80 }] }));
  // (each side: up from the centre's lower three-way to the outer track's upper slip (P), and down from its upper
  // three-way to the lower slip (Q); s 1: the right (x 0), -1: the left (x -32))
  const side = (s: 1 | -1, nm: string): DRoute[] => [
    { name: `P${nm}`, x: -16, y: -20, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 * s }, { kind: 'straight', studs: lead }, ...diag(-s as 1 | -1)] },
    { name: `Q${nm}`, x: -16 + 24 * s, y: -20, heading: 22.5 * s, segs: [...diag(s), { kind: 'straight', studs: lead }, { kind: 'curve', radius: 104, angle: -22.5 * s }] },
  ];
  // (the middle, between the slips' middles, cut as the reference's: between the centre track and each outer one, and
  // down the centre track's middle between its rails where its three-ways' branches have left it (the reference's two
  // middle pieces meet there). Studs: up the clear gap between the branch and the slip's diagonal from past the slip's
  // middle (from the set's end: the bed's one part across there); square across the branch and the centre track's rail below its three-way's frog (-13.5, 12.2) and the
  // diagonals' crossing's (-8, 12.6), 2 studs clear of each; up the centre track's middle past the crossing's level (20)
  // and out again, mirrored. The left side's joins it. Else the three tracks' middles are one part 50 studs across)
  // (and, below the slip's middle, 2 studs further in: past the three-way's lever housing beside its branch, which is
  // joined to the outer track's bed, not the centre's)
  const Y = 10, half = (x: number): [number, number][] => { const o = x > -16 ? -2 : 2; return [[x + o, -24], [x + o, -4], [x, -4], [x, Y], [-16, Y]]; }, mirrorY = (pts: [number, number][]) => pts.map(([x, y]) => [x, 40 - y] as [number, number]);
  // (the lower left one meets the first square, 2 studs short of the centre: from the corner, carried on, it would run
  // along the first one's joints)
  const c2 = [...half(-24).slice(0, -2), [-24, Y - 2], [-12, Y - 2], [-12, Y]] as [number, number][];
  const cuts = [{ id: 'c1', pts: [...half(-8), ...mirrorY(half(-8)).reverse()] }, { id: 'c2', pts: c2 }, { id: 'c3', pts: mirrorY(half(-24)) }];
  return { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', pointBlades: 1, threeWayLevers: 2, splitTrack: 'lengths' }, routes: [...tracks, ...side(1, 'R'), ...side(-1, 'L'),
    ...slipRoads('QR-T1', [0, 0], 1), ...slipRoads('PR-T1', [0, 40], -1), ...slipRoads('QL-T3', [-32, 0], -1), ...slipRoads('PL-T3', [-32, 40], 1)],
    expert: { cutPaths: cuts } };
}
/**
 * The X yard (Aaron's): six tracks 16 studs apart, crossed by two diagonals (each off the first track on an R104 curve,
 * onto the last), a full R104 double slip wherever a diagonal crosses a track, so a train can go from any track to any
 * other either way, through the centre too (where the diagonals cross, between the third and fourth tracks).
 */
export function slipXYard(): Design {
  const [x1, c1] = slipDiagonal('X1', 0, 24, -1, 4), [x2, c2] = slipDiagonal('X2', 80, 24, 1, 4);
  const tracks: DRoute[] = Array.from({ length: 6 }, (_, k) => ({ name: `T${k + 1}`, x: 16 * k, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 288 }] }));
  return { version: 1, gaugeStuds: 4, options: { pointBlades: 1, ballast: 'ballast', legoTrack: 'print' }, routes: [...tracks, x1, x2,
    ...c1.flatMap((c) => slipRoads(`X1-T${c[0] / 16 + 1}`, c, -1)), ...c2.flatMap((c) => slipRoads(`X2-T${c[0] / 16 + 1}`, c, 1))] };
}
/** The R104 double slip cut into its kit's three sections (TEMPLATES): r104Slip, with track cut into pieces and the two cut paths. */
function r104SlipKit(hand: 1 | -1): Design {
  const d = r104Slip(hand);
  return { ...d, options: { ...d.options, splitTrack: 'lengths' }, expert: { cutPaths: [{ id: 'c1', pts: [[-12 * hand, -4], [12 * hand, -4]] }, { id: 'c2', pts: [[-12 * hand, 4], [12 * hand, 4]] }] } };
}
/** The short straight on BrickTracks' R104 switch's branch and their R104B curve, studs (boughtswitch.ts BT_LEAD). */
const BT_LEAD_STUDS = (8 - 104 * (1 - cos(22.5))) / sin(22.5);
/** The return loop of BrickTracks' and LEGO's track (TEMPLATES), turning right (1) or left (-1). */
/** An outline without its points along straight stretches (each within 0.01 stud of the line past it). */
function straightened(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of pts) {
    while (out.length >= 2) {
      const [a, b] = [out[out.length - 2], out[out.length - 1]], l = Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (l > 1e-9 && Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / l < 0.01) out.pop(); else break;
    }
    out.push(p);
  }
  return out;
}
function bricktracksLoop(turn: number): Design {
  const S = (studs: number) => ({ kind: 'straight' as const, studs }), C = (radius: number, angle: number) => ({ kind: 'curve' as const, radius, angle: -turn * angle });
  const L = BT_LEAD_STUDS;
  const d: Design = { version: 1, gaugeStuds: 4, options: { ballast: 'buddy' }, trackwork: { points: { [`${turn * 405},583`]: { force: true } } }, routes: [
    { name: 'Loop', x: 0, y: -48, heading: 0, segs: [S(48), S(40), S(8), S(192), C(120, 247.5), S(80), S(8), S(L), C(104, -22.5), S(1.6), C(104, -11.25), S(4), S(1.6), C(104, -33.75), S(1.6), S(8), S(32)] },
    { name: 'Passing loop', x: 0, y: 0, heading: 0, segs: [C(104, 22.5), S(L), S(L), C(104, -11.25), C(104, -11.25), S(160), C(104, 247.5), S(48), S(1.6), C(104, -11.25), C(104, -11.25), S(L), S(1.6), S(40)] },
  ] };
  // (its tables, as the reference plan's, each reaching 8 studs past the tracks: two straight ones up the double track, 32
  // studs wide; the loop on curved ones round its centre (120, 240), 96 to 128 studs out, a quarter each and the last
  // three eighths (to where the tracks run straight); and one round the far switch, its sides 8 studs out from the
  // tracks, from the last curved one to the first straight one. Mirrored for a loop turning left)
  const X = (x: number) => turn * x, A = (a: number) => (turn > 0 ? a : 180 - a);
  const arc = (name: string, color: string, a0: number, a1: number): Table => ({ name, color, shape: 'arc', cx: X(120), cy: 240, r0: 96, r1: 128, a0: Math.min(A(a0), A(a1)), a1: Math.max(A(a0), A(a1)) });
  const rect = (name: string, color: string, y: number, h: number): Table => ({ name, color, shape: 'rect', x: turn > 0 ? -8 : -24, y, w: 32, h });
  const [loop, pass] = toRoutes(d), segEnd = (rt: Route, n: number) => rt.segments.slice(0, n).reduce((t, g) => t + (g.kind === 'straight' ? g.length : (Math.abs(g.angle) * Math.PI * g.radius) / 180), 0);
  // (a side of a stretch of track, 8 studs out (+ right), from s0 to s1, studs, up to where it meets the straight tables' edge)
  const side = (rt: Route, s0: number, s1: number, o: number) => {
    const out: [number, number][] = [], n = Math.ceil(Math.abs(s1 - s0) / 16);
    for (let k = 0; k <= n; k++) {
      const p = routePose(rt, s0 + ((s1 - s0) * k) / n), r = (p[2] * Math.PI) / 180, q: [number, number] = [(p[0] + o * Math.cos(r)) / 8, (p[1] + o * Math.sin(r)) / 8];
      const last = out[out.length - 1];
      if (last && turn * q[0] < 24) { const t = (24 - turn * last[0]) / (turn * q[0] - turn * last[0]); out.push([X(24), last[1] + t * (q[1] - last[1])]); break; }
      out.push(q);
    }
    return out;
  };
  const a0L = segEnd(loop, 5), a0P = segEnd(pass, 7), endP = routeLength(pass), toe = routePose(pass, endP);
  // (where the passing loop ends on the line: the far switch's toe)
  let sToe = 0, best = Infinity;
  for (let sv = a0L; sv < routeLength(loop); sv += 0.5) { const p = routePose(loop, sv), dd = Math.hypot(p[0] - toe[0], p[1] - toe[1]); if (dd < best) { best = dd; sToe = sv; } }
  const outer = side(loop, a0L, routeLength(loop), -turn * 64), inner = [...side(pass, a0P, endP, turn * 64), ...side(loop, sToe, routeLength(loop), turn * 64)];
  const tables: Table[] = [rect('A', '#f39a2b', -48, 128), rect('B', '#f5e050', 80, 160), arc('C', '#3fbf6a', 135, 180), arc('D', '#2fa654', 90, 135), arc('E', '#1f8f45', 45, 90), arc('F', '#16703a', 0, 45),
    arc('G', '#22aee8', -67.5, 0), { name: 'H', color: turn > 0 ? '#d7263d' : '#a3246a', shape: 'poly', pts: straightened([...outer, ...inner.reverse()]).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]) }];
  return { ...d, tables };
}

/**
 * Dual-gauge track parting into its two gauges: a dual-gauge straight, then from its end a standard-gauge route and a
 * narrow-gauge one (a route of its own gauge, starting within the standard one's end where the dual-gauge track's
 * narrow gauge lies: a stud to the shared rail's side, or on the middle centred: route.ts hostedEnds), fanning apart.
 * Fixed rails, no points: each gauge's trains keep to their own rails. Which rails cross (each crossing a fixed frog,
 * both flangeways cut through, a check rail on the rail opposite: geom/crossing.ts, as where any two tracks cross):
 *
 *   narrow gauge beside the shared rail (three rails), one gauge straight on, the other curving away:
 *    - the narrow gauge away on the shared rail's side: nothing crosses. The shared rail forks, the narrow gauge's
 *      rail curving off it; its flangeway opens out of the standard one's and runs across the standard rail (a frog
 *      at the fork). Its other rail (the third rail) leaves between the standard rails and crosses the standard rail
 *      on that side further on: a second frog.
 *    - the narrow gauge away on the other side: its own rail crosses the far standard rail (a frog), and its rail on
 *      the shared side curves off the shared rail inwards (the fork's frog, in the narrow rail this time).
 *    - the standard gauge away on the shared rail's side: its rail there curves off the shared rail outwards, its
 *      flangeway running across the narrow gauge's rail (the fork's frog); its far rail crosses the third rail,
 *      then the narrow gauge's rail on the shared side (two more frogs).
 *    - the standard gauge away on the other side: its shared-side rail curves off the shared rail inwards (the
 *      fork's frog, in the standard rail) and crosses the third rail (one more); its far rail crosses nothing.
 *   both curving apart: the same rails cross, sooner and steeper.
 *   narrow gauge centred (four rails): no rail is shared, so nothing forks. The narrow gauge away: both its rails
 *   cross the standard rail on that side, one after the other (two frogs). The standard gauge away: its rail on the
 *   far side crosses both narrow rails (two frogs), its near one nothing.
 *
 * At a fork neither rail moves: a wheel keeping to its rail is carried by the rail that leaves until the frog's nose
 * is wide enough to take it, and held across by the check rail opposite, as at any frog (the fixed turnout and slide
 * templates do the same). Left and right are mirror images.
 */
const gaugeSplit = (shared: 'right' | 'left' | 'centre', std: DSeg[], narrow: DSeg[], mirror: boolean): Design => {
  const m = mirror ? -1 : 1, sh = mirror && shared !== 'centre' ? (shared === 'right' ? 'left' : 'right') : shared;
  const segs = (ss: DSeg[]) => ss.map((sg) => (sg.kind === 'curve' ? { ...sg, angle: m * sg.angle } : { ...sg }));
  return { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [
    { name: 'Dual', x: 0, y: 0, heading: 0, dualGauge: true, ...(sh !== 'right' && { dualShared: sh }), segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'Standard', x: 0, y: 16, heading: 0, segs: segs(std) },
    { name: 'Narrow', x: sh === 'right' ? 1 : sh === 'left' ? -1 : 0, y: 16, heading: 0, gaugeStuds: 2, segs: segs(narrow) }] };
};
const GAUGE_SPLITS: Record<string, Design> = Object.fromEntries((['left', 'right'] as const).flatMap((hand): [string, Design][] => {
  const mir = hand === 'right', st = (studs: number): DSeg => ({ kind: 'straight', studs }), cv = (radius: number, angle: number): DSeg => ({ kind: 'curve', radius, angle });
  return [
    [`Dual gauge split, narrow gauge leaves R36 ${hand}`, gaugeSplit('left', [st(32)], [cv(36, 45)], mir)],
    [`Dual gauge split, narrow gauge crosses out R36 ${hand}`, gaugeSplit('right', [st(32)], [cv(36, 45)], mir)],
    [`Dual gauge split, standard gauge leaves R40 ${hand}`, gaugeSplit('right', [cv(40, 33.75)], [st(32)], mir)],
    [`Dual gauge split, both ways, standard gauge R40 ${hand}`, gaugeSplit('right', [cv(40, 33.75)], [cv(36, -45)], mir)],
    [`Dual gauge split, narrow gauge centred, R36 ${hand}`, gaugeSplit('centre', [st(32)], [cv(36, 45)], mir)],
  ];
}));

/**
 * A narrow-gauge branch off dual-gauge track part way along, the dual-gauge track carrying on: the narrow gauge's own
 * points, one blade by its own rail, the branch leaving on the shared rail's side (app/dualbranch.ts has which rails
 * cross which). Left and right are mirror images.
 */
const DUAL_BRANCHES: Record<string, Design> = Object.fromEntries((['left', 'right'] as const).map((hand): [string, Design] => {
  const m = hand === 'left' ? 1 : -1;
  return [`Dual gauge track, narrow gauge branch R36 ${hand}`, { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', bladeStyle: 'simple' }, routes: [
    { name: 'Dual', x: 0, y: 0, heading: 0, dualGauge: true, ...(hand === 'left' && { dualShared: 'left' }), segs: [{ kind: 'straight', studs: 48 }] },
    { name: 'Branch', x: -m, y: 8, heading: 0, gaugeStuds: 2, segs: [{ kind: 'curve', radius: 36, angle: m * 33.75 }] }] }];
}));

/** The templates that are sets: several parts as their maker sells them together (the catalog lists them as sets). */
export const TEMPLATE_SETS = new Set<string>([...Object.keys(REF1_SETS), ...Object.keys(REF_COMBOS), ...Object.keys(REF_LOOPS), ...Object.keys(BRICKTRACKS_SETS), ...RANGE2_SETS]);

/** Starting points for a design. */
/** The Templates list's groups (in order), each its templates by name. */
export const TEMPLATE_GROUPS: [string, string[]][] = [
  ['Crossings', ['90° crossing', '22.5° crossing', 'Double slip (22.5°)', 'Double slip (45°, R40)', 'Crossing on a curve']],
  ['Switches', ['Left switch (LEGO)', 'Right switch (LEGO)', 'Wye switch', 'Three-way switch', 'Three-way switch (one throw)', 'Three-way switch (tandem, two throws)']],
  ['Layouts', ['Oval (LEGO R40)', 'Crossover (R40)', 'Double crossover (R56)', 'Yard ladder (R40)', 'Yard (R56)', 'X yard (6 tracks, double slips)', 'Wye with a crossover', 'Double-track return loop (turning right)', 'Double-track return loop (turning left)']],
  ['Features', ['Grade up at 2.5%', 'Helix (R104, two turns)', 'Siding ending in a buffer stop', 'Bridge with guard rails', 'Straight cut into parts by hand', 'Curve and straights cut into parts by hand', 'Double track, one on sleepers, one on ballast', 'Station track on a solid bed, the line beyond on sleepers', 'Track on sleepers, a stretch of it on a solid bed', 'Sleepers edited by hand', 'Double track on shared sleepers', 'Siding on ballast wider on one side, stepped round its buffer stop', 'Rails edited by hand', 'Crossover with points of their own', 'Dual gauge track', 'Dual gauge crossing 90°', 'Dual gauge crossing 45°', 'Dual gauge track, narrow gauge centred', 'Dual gauge crossing 90°, narrow gauge centred', ...Object.keys(GAUGE_SPLITS), ...Object.keys(DUAL_BRANCHES), 'Narrow gauge beside and across standard track', 'Banked curve', 'Crossing on sleepers']],
  ['Monorail', ['Monorail oval on supports', 'Monorail siding (points and a short curve)', 'Monorail level crossing (experimental)']],
  ['Test prints', ['Test print 1: stud and anti-stud fits', 'Test print 2: track joints', 'Test print 3: switch as built', 'Test print 4: points three ways', 'Test print 5: seat for a LEGO curve', 'Test print 6: seat fits', 'Test print 7: clearance round the points', 'Test print 8: flangeway width', 'Test print 9: monorail hole fit', 'Test print 10: LEGO tolerance']],
  ['TrixBrix trackwork', ['Switch R40 left', 'Switch R40 right', 'Switch R40 left, 28-stud straight', 'Switch R40 right, 28-stud straight', 'Yard switch R40 left', 'Yard switch R40 right', 'Switch R56 left', 'Switch R56 right', 'Switch R72 left', 'Switch R72 right', 'Switch R104 left', 'Switch R104 right', 'Switch R104 left, lever on the straight side', 'Switch R104 right, lever on the straight side', 'Switch R120 left', 'Switch R120 right', 'Switch R148 left', 'Switch R148 right', 'Switch R148 left, lever on the straight side', 'Switch R148 right, lever on the straight side', 'Curved switch R40 45° left', 'Curved switch R40 45° right', 'Curved switch R40 90° left', 'Curved switch R40 90° right', 'Curved switch R56 90° left', 'Curved switch R56 90° right', 'Curved switch R104 90° left', 'Curved switch R104 90° right', 'Wye R40', 'Wye R40, 8-stud spacing', 'Wye R104', 'Wye R40 left, R56 right', 'Wye R56 left, R40 right', 'Wye R104 left, R120 right', 'Wye R120 left, R104 right', 'Three-way R40', 'Three-way R104', 'Switch to the next track, no gap, left', 'Switch to the next track, no gap, right', 'Switch, 2-stud gap, left', 'Switch, 2-stud gap, right', 'Switch, 4-stud gap, left', 'Switch, 4-stud gap, right', 'Three-way, no gap', 'Three-way, 2-stud gap', 'Three-way, 4-stud gap', 'Crossing 90°, 8 studs', 'Crossing 45° left', 'Crossing 45° right', 'Crossing 45°, 27 studs', 'Crossing 22.5° left', 'Crossing 22.5° right', 'Star crossing 22.5°', 'Curved crossing R24', 'Curved crossing R40', 'Curved crossing R56', 'Curved crossing R72', 'Curved crossing R88', 'Curved crossing R104', 'Crossing of two R120 curves', 'Pass-through crossing R56 left', 'Pass-through crossing R72 (A) left', 'Pass-through crossing R72 (B) left', 'Pass-through crossing R120 left', 'Pass-through crossing R56 right', 'Pass-through crossing R72 (A) right', 'Pass-through crossing R72 (B) right', 'Pass-through crossing R120 right', 'T-junction core R56', 'Double slip R40 45°', 'Single slip R40 45°', 'Double slip R104 left', 'Double slip R104 right', 'Double crossover R40', 'Crossover, 4-stud gap, left', 'Crossover, 4-stud gap, right', 'Buffer stop', 'Narrow-gauge crossing 90°', 'Narrow-gauge crossing of standard track 90°', 'Narrow-gauge crossing of standard track 45° left', 'Narrow-gauge crossing of standard track 45° right', 'Narrow-gauge buffer stop', 'Narrow-gauge switch R36 left', 'Narrow-gauge switch R36 right', 'Narrow-gauge switch R48 left', 'Narrow-gauge switch R48 right', 'Narrow-gauge switch R84 left', 'Narrow-gauge switch R84 right', 'Narrow-gauge wye R36', 'Narrow-gauge switch R36 left, lever on the branch side', 'Narrow-gauge switch R36 right, lever on the branch side', 'Narrow-gauge double crossover R36', 'Narrow-gauge crossing 22.5° left', 'Narrow-gauge crossing 22.5° right', 'Narrow-gauge crossing 33.75° left', 'Narrow-gauge crossing 33.75° right', 'Wye R104, 8-stud gap', 'Dual gauge switch R40 left', 'Dual gauge switch R40 right', 'Dual gauge turnout R36 left', 'Dual gauge turnout R36 right', 'Dual gauge slide, centre to left', 'Dual gauge slide, centre to right', 'Dual gauge switch R36, narrow gauge branch, left', 'Dual gauge switch R36, narrow gauge branch, right', 'Crossover, three tracks, R104', 'Switch R104 left, base and detachable modules', 'Switch R104 right, base and detachable modules', 'Three-way R104, base and detachable modules', 'Double slip R104 left, middle and detachable sections', 'Double slip R104 right, middle and detachable sections', 'Double slip crossover R104', 'Double slip monster crossover R104', ...Object.keys(REF_KITS), ...Object.keys(REF1_PLAIN), ...Object.keys(REF1_SETS), ...Object.keys(REF_COMBOS), ...Object.keys(REF_LOOPS)]],
  ['4DBrix trackwork', Object.keys(RANGE2)],
  ['BrickTracks trackwork', ['Left switch (BrickTracks R104)', 'Right switch (BrickTracks R104)', ...Object.keys(BRICKTRACKS_PARTS), ...Object.keys(BRICKTRACKS_SETS)]],
  // (the printed monorail ranges' pieces: templates-monorail.ts; the points and the ramp with its approaches are LEGO's, which both ranges copy)
  ['Monorail trackwork', ['Monorail points right (as LEGO\'s)', 'Monorail points left (as LEGO\'s)', 'Monorail ramp (as LEGO\'s)', ...Object.keys(MONO_TRACKWORK)]],
];
/** A points coupon (Test print 4): LEGO's switch from its toe to 12 studs on, just past the blades' heels (no frog), at x studs. */
const pointsCoupon = (id: string, x: number): Design['routes'] => [
  { name: `${id} straight`, x, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 12 }] },
  { name: `${id} branch`, x, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 17.4576 }] },
];
/** The fit ladder (Test print 1): stud fit and anti-stud fit, loosest to tightest, the default in the middle. */
export const FIT_LADDER: [stud: number, antistud: number][] = [[0.08, 0.16], [0.13, 0.11], [0.18, 0.06], [0.23, 0.01], [0.28, -0.04]];
/**
 * The LEGO tolerance ladders (Test print 10): the stud fit alone, then the anti-stud fit alone, each loosest to tightest
 * with the default in the middle and the other fit left at its default. Seven rungs 0.05 mm apart: a 0.4 mm nozzle on a
 * well-kept printer repeats to about 0.05 mm, so a finer step can't be told apart in the hand, and three rungs each side
 * reach the 0.15 mm that printers and plastics differ by (PLA against PETG, a little over- or under-extrusion).
 */
export const STUD_LADDER = [0.03, 0.08, 0.13, 0.18, 0.23, 0.28, 0.33];
export const ANTISTUD_LADDER = [0.21, 0.16, 0.11, 0.06, 0.01, -0.04, -0.09];
/** A tolerance coupon's place (Test print 10): four across, 7 studs apart, the rows 6 apart; the anti-stud ladder two rows down. */
const tolAt = (ladder: number, k: number) => ({ x: 7 * (k % 4), y: -6 * (2 * ladder + Math.floor(k / 4)) });
/** The seat ladder (Test print 6): Track fit in the seat, mm, tightest to loosest, the default (0.2) in the middle. */
export const SEAT_LADDER = [0.1, 0.2, 0.3];
/** The clearance ladder (Test print 7): Clearance round the moving parts, mm, the default (0.3) in the middle. */
export const CLEARANCE_LADDER = [0.2, 0.3, 0.4];
/** The flangeway ladder (Test print 8): Flangeway width, mm, the default (3) in the middle. */
export const FLANGEWAY_LADDER = [2.5, 3, 3.5];
/** The monorail hole ladder (Test print 9): Hole fit, mm, the default (0.1) in the middle. */
export const HOLE_LADDER = [0, 0.05, 0.1, 0.15, 0.2];
/** The note for a rung: which of how many, and where the default is. */
const rungNote = (k: number, n: number, what: string) => `${k + 1} rib${k ? 's' : ''}: ${what}${k === (n - 1) / 2 ? " (today's setting)" : k === 0 ? ' (the first)' : k === n - 1 ? ' (the last)' : ''}`;
export const TEMPLATES: Record<string, Design> = {
  // ---- Test prints (docs/test-prints.md): small coupons and one switch, to print, try and report on, so the
  // defaults are set from prints. Each is what the app builds with the settings said: nothing made specially but the
  // ribs that number the fit coupons ----
  // (five 2-stud straights, each its own stud fit and anti-stud fit, numbered by ribs on a sleeper's end)
  'Test print 1: stud and anti-stud fits': { version: 1, gaugeStuds: 4, name: 'test-1-fits', options: { legoTrack: 'print' },
    routes: FIT_LADDER.map((_, k) => ({ name: `Fit ${k + 1}`, x: 10 * k, y: 0, heading: 0, segs: [{ kind: 'straight' as const, studs: 2 }] })),
    kit: FIT_LADDER.map(([studFit, antistudFit], k) => ({ name: `fit${k + 1}-stud${studFit}-tube${antistudFit}`, routes: [`Fit ${k + 1}`], options: { studFit, antistudFit }, mark: k + 1,
      note: `${k + 1} rib${k ? 's' : ''}: stud fit ${studFit} mm, anti-stud fit ${antistudFit} mm${k === 2 ? " (today's settings)" : k === 0 ? ' (loosest)' : k === 4 ? ' (tightest)' : ''}` })) },
  // (two 4-stud straights end to end, peg and clip as LEGO's (a bought straight goes on either too); a 6-stud straight
  // cut in two with dovetails (a small bed, to make the app cut it; on a solid bed, as the switches cut this way have:
  // on sleepers this cut falls between two of them, and each half came out in two bodies))
  'Test print 2: track joints': { version: 1, gaugeStuds: 4, name: 'test-2-joints', options: { legoTrack: 'print' }, routes: [
    { name: 'Clip 1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 4 }] },
    { name: 'Clip 2', x: 0, y: 4, heading: 0, segs: [{ kind: 'straight', studs: 4 }] },
    { name: 'Dovetail', x: 10, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 6 }] },
  ], kit: [
    { name: 'clip1', routes: ['Clip 1'], note: 'peg and clip, as LEGO track: joins clip2, and any bought track' },
    { name: 'clip2', routes: ['Clip 2'], note: 'peg and clip, as LEGO track: joins clip1, and any bought track' },
    { name: 'dovetail', routes: ['Dovetail'], options: { splitTrack: 'bed', joint: 'dovetail', printBedX: 70, printBedY: 40, sleepers: 'bed' }, note: 'one straight cut in two, joined with dovetails: press one down into the other' },
  ] },
  // (LEGO's left switch with nothing changed: sprung blades, lever click, 3 mm throw)
  'Test print 3: switch as built': { version: 1, gaugeStuds: 4, name: 'test-3-switch', options: { legoTrack: 'print' }, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }] },
  ] },
  // (the same points, cut short, three ways: what the switch as built doesn't try)
  'Test print 4: points three ways': { version: 1, gaugeStuds: 4, name: 'test-4-points', options: { legoTrack: 'print' },
    routes: [...pointsCoupon('A', 0), ...pointsCoupon('B', 16), ...pointsCoupon('C', 32)], kit: [
      { name: 'A-relief-clamp', routes: ['A straight', 'A branch'], options: { bladeRelief: true, throwAction: 'snap' }, note: 'sprung blades with flange relief; kept set by the snap clamp (on the arm)' },
      { name: 'B-rigid-clamp', routes: ['B straight', 'B branch'], options: { bladeStyle: 'simple', throwAction: 'snap' }, note: 'rigid blades (shallow slider); kept set by the snap clamp (between the blades)' },
      { name: 'C-wide', routes: ['C straight', 'C branch'], options: { pointThrow: 4 }, note: 'as the switch as built, but the blades move 4 mm, not 3' },
    ] },
  // (printed ballast with the seat a bought LEGO R40 curve drops into)
  'Test print 5: seat for a LEGO curve': { version: 1, gaugeStuds: 4, name: 'test-5-seat', options: { ballast: 'ballast', legoTrack: 'lego' }, routes: [
    { name: 'Curve', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] },
  ] },
  // (the same seat at three fits: one curve each, ribs on the ballast's end say which)
  'Test print 6: seat fits': { version: 1, gaugeStuds: 4, name: 'test-6-seat-fits', options: { ballast: 'ballast', legoTrack: 'lego' },
    routes: SEAT_LADDER.map((_, k) => ({ name: `Seat ${k + 1}`, x: 16 * k, y: 0, heading: 0, segs: [{ kind: 'curve' as const, radius: 40, angle: 22.5 }] })),
    kit: SEAT_LADDER.map((trackFitTol, k) => ({ name: `seat${k + 1}-fit${trackFitTol}`, routes: [`Seat ${k + 1}`], options: { trackFitTol }, mark: k + 1, note: rungNote(k, SEAT_LADDER.length, `Track fit in the seat ${trackFitTol} mm`) })) },
  // (the points coupon of test 4, as built, at three clearances round the moving parts)
  'Test print 7: clearance round the points': { version: 1, gaugeStuds: 4, name: 'test-7-clearance', options: { legoTrack: 'print' },
    routes: CLEARANCE_LADDER.flatMap((_, k) => pointsCoupon(`Clear ${k + 1}`, 16 * k)),
    kit: CLEARANCE_LADDER.map((pointClearance, k) => ({ name: `clear${k + 1}-${pointClearance}`, routes: [`Clear ${k + 1} straight`, `Clear ${k + 1} branch`], options: { pointClearance }, mark: k + 1, note: rungNote(k, CLEARANCE_LADDER.length, `clearance ${pointClearance} mm`) })) },
  // (a small 90-degree crossing at three flangeway widths)
  'Test print 8: flangeway width': { version: 1, gaugeStuds: 4, name: 'test-8-flangeway', options: { legoTrack: 'print' },
    routes: FLANGEWAY_LADDER.flatMap((_, k) => [
      { name: `Flange ${k + 1} A`, x: -4 + 12 * k, y: 0, heading: -90, segs: [{ kind: 'straight' as const, studs: 8 }] },
      { name: `Flange ${k + 1} B`, x: 12 * k, y: 4, heading: -180, segs: [{ kind: 'straight' as const, studs: 8 }] }]),
    kit: FLANGEWAY_LADDER.map((flangeway, k) => ({ name: `flange${k + 1}-${flangeway}`, routes: [`Flange ${k + 1} A`, `Flange ${k + 1} B`], options: { flangeway }, mark: k + 1, note: rungNote(k, FLANGEWAY_LADDER.length, `flangeway ${flangeway} mm wide`) })) },
  // (four-stud monorail straights at five hole fits; the value engraved under each, there being no ribs on a monorail beam)
  'Test print 9: monorail hole fit': { version: 1, gaugeStuds: 4, name: 'test-9-hole-fit', options: { monoLabels: 'name' },
    routes: HOLE_LADDER.map((_, k) => ({ name: `Hole ${k + 1}`, x: 8 * k, y: 0, heading: 0, system: 'monorail' as const, segs: [{ kind: 'straight' as const, studs: 4 }] })),
    kit: HOLE_LADDER.map((monoHoleFit, k) => ({ name: `hole${k + 1}-${monoHoleFit}`, routes: [`Hole ${k + 1}`], options: { monoHoleFit, labelText: `H${monoHoleFit}` }, note: `${k + 1} of ${HOLE_LADDER.length}: hole fit ${monoHoleFit} mm, engraved H${monoHoleFit} underneath${k === 2 ? " (today's setting)" : ''}` })) },
  // (LEGO tolerance: two ladders of seven, the stud fit alone and the anti-stud fit alone. Each coupon the smallest piece
  // of track with all three things to try: a 4-stud straight on sleepers at the narrow gauge (6 studs wide): a 2 x 4 of
  // studs between its rails, an end connector's single row with its pins at each end, and a sleeper's hollow with a
  // whole tube in the middle. Ribs on one side: the stud ladder; on both: the anti-stud ladder)
  'Test print 10: LEGO tolerance': { version: 1, gaugeStuds: 2, name: 'test-10-lego-tolerance', options: { legoTrack: 'print', sleepers: 'sleepers', sleeperWidthStuds: 2, sleeperGapStuds: 2, undersideGrid: 'baseplate' },
    routes: [
      ...STUD_LADDER.map((_, k) => ({ name: `Stud ${k + 1}`, ...tolAt(0, k), heading: 0, segs: [{ kind: 'straight' as const, studs: 4 }] })),
      ...ANTISTUD_LADDER.map((_, k) => ({ name: `Tube ${k + 1}`, ...tolAt(1, k), heading: 0, segs: [{ kind: 'straight' as const, studs: 4 }] })),
    ],
    kit: [
      ...STUD_LADDER.map((studFit, k) => ({ name: `stud${k + 1}-fit${studFit}`, routes: [`Stud ${k + 1}`], options: { studFit }, mark: k + 1,
        note: `${k + 1} rib${k ? 's' : ''} on one side: stud fit ${studFit} mm${k === 3 ? " (today's setting)" : k === 0 ? ' (loosest)' : k === 6 ? ' (tightest)' : ''}; anti-stud fit as today` })),
      ...ANTISTUD_LADDER.map((antistudFit, k) => ({ name: `tube${k + 1}-fit${antistudFit}`, routes: [`Tube ${k + 1}`], options: { antistudFit }, mark: k + 1, markBoth: true,
        note: `${k + 1} rib${k ? 's' : ''} on both sides: anti-stud fit ${antistudFit} mm${k === 3 ? " (today's setting)" : k === 0 ? ' (loosest)' : k === 6 ? ' (tightest)' : ''}; stud fit as today` })),
    ] },
  '90° crossing': { version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: -8, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'B', x: 8, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 16 }] },
  ] },
  '22.5° crossing': { version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: -24, heading: 0, segs: [{ kind: 'straight', studs: 48 }] },
    { name: 'B', x: 24 * sin(22.5), y: -24 * cos(22.5), heading: 22.5, segs: [{ kind: 'straight', studs: 48 }] },
  ] },
  // (a compact double slip, 40 studs, as long as the reference's R104 one (TrixBrix trackwork: 'Double slip R104
  // left', whose slip roads are R104 from end to end and its points near its ends): the tracks crossing at 22.5 degrees, each slip road an R40 curve
  // leaving one track 7.96 studs before the crossing and joining the other 7.96 studs after it; the points are
  // in the middle, their blades side by side. One blade a set (single point): blades on top fit between its rails;
  // with two, they're built on tines under the bed)
  // (its levers outside, as the reference's: each set's, beside its points on the side away from the other track (two
  // each side), so its slider runs out from its own points, not under the crossing to the other side. A pair's sliders,
  // both near the crossing's end, are staggered, one nearer its toes (network.ts). Not nail switches, as it was: the
  // middle points are too close for their springs, each set's lying where the next set's blade plate is)
  'Double slip (22.5°)': { version: 1, gaugeStuds: 4, options: { pointBlades: 1 },
    // (each set's lever in a housing at its own outer corner, as Aaron's reference photo has them: a tie-rod out to it
    // from the slider (Trackwork.throw leverAt), 2 studs past the sleepers' ends: further, the diagonal track's arms,
    // sloping, reach across its middle, where it's cut in two for the print bed)
    trackwork: { throw: leversAt([[0, -SLIP_LEAD, 'left'], [SLIP_LEAD * sin(22.5), -SLIP_LEAD * cos(22.5), 'right'], [0, SLIP_LEAD, 'left'], [-SLIP_LEAD * sin(22.5), SLIP_LEAD * cos(22.5), 'right']],
      { leverOffset: 16, leverAt: cornerLever(20 - SLIP_LEAD) }) }, routes: [
      { name: 'A', x: 0, y: -20, heading: 0, segs: [{ kind: 'straight', studs: 40 }] },
      { name: 'B', x: 20 * tan(22.5), y: -20, heading: 22.5, segs: [{ kind: 'straight', studs: 40 / cos(22.5) }] },
      { name: 'A to B', x: 0, y: -SLIP_LEAD, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] },
      { name: 'B to A', x: SLIP_LEAD * sin(22.5), y: -SLIP_LEAD * cos(22.5), heading: 22.5, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }] },
    ] },
  // (as the reference R40 double slip: the tracks crossing at 45 degrees, each slip road an R40 curve of 45 from one
  // track's end to the other's (40 tan 22.5 = 16.57 studs from the crossing), so its points are at its four ends, each
  // with its throw beside it, outside)
  'Double slip (45°, R40)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: -40 * tan(22.5), heading: 0, segs: [{ kind: 'straight', studs: 80 * tan(22.5) }] },
    { name: 'B', x: 40 * tan(22.5) * sin(45), y: -40 * tan(22.5) * cos(45), heading: 45, segs: [{ kind: 'straight', studs: 80 * tan(22.5) }] },
    { name: 'A to B', x: 0, y: -40 * tan(22.5), heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }] },
    { name: 'B to A', x: 40 * tan(22.5) * sin(45), y: -40 * tan(22.5) * cos(45), heading: 45, segs: [{ kind: 'curve', radius: 40, angle: -45 }] },
  ] },
  'Crossing on a curve': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Curve', x: 0, y: -12, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 30 }] },
    { name: 'B', x: 12, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 24 }] },
  ] },
  // Switches: LEGO's (R40, out to 36.87 degrees and back to 22.5, so one more
  // R40 curve makes a parallel track 16 studs over), a wye and a three-way.
  // (printed: as bought they're LEGO's own switch, nothing to print)
  'Left switch (LEGO)': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }] },
  ] },
  'Right switch (LEGO)': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -36.8699 }, { kind: 'curve', radius: 40, angle: 14.3699 }] },
  ] },
  // (BrickTracks' R104 switch: 40 studs, the branch an R104 curve of 22.5 degrees and a short straight, ending 40 on and 8 over)
  'Left switch (BrickTracks R104)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: BT_LEAD_STUDS }] },
  ] },
  'Right switch (BrickTracks R104)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: BT_LEAD_STUDS }] },
  ] },
  'Wye switch': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 16 }] },
    { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 16 }] },
  ] },
  // (a lever to each side's blade at the two ends of one cross-bar, as the reference's triple switches: the default)
  'Three-way switch': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 28 }] },
    { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 14 }] },
    { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 14 }] },
  ] },
  // (the same, worked by one lever with three positions)
  'Three-way switch (one throw)': { version: 1, gaugeStuds: 4, options: { threeWayLevers: 1 }, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 28 }] },
    { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 14 }] },
    { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 14 }] },
  ] },
  // (the first branch's rail runs on through the second points: their blades' plates are cut clear of it, the pin moved in;
  // rigid blades: the sprung blades' plate, wider for its springs, doesn't fit there)
  'Three-way switch (tandem, two throws)': { version: 1, gaugeStuds: 4, options: { bladeStyle: 'simple' }, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 36 }] },
    { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 23 }] },
    { name: 'Right', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 14 }] },
  ] },

  // ---- layouts ----
  'Oval (LEGO R40)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Oval', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }, { kind: 'curve', radius: 40, angle: 180 }, { kind: 'straight', studs: 32 }, { kind: 'curve', radius: 40, angle: 180 }] },
  ] },
  'Crossover (R40)': { version: 1, gaugeStuds: 4, routes: [{name: 'A', x: 0, y: 0, heading: 0, segs: [{kind: 'straight', studs: 64}]}, {name: 'B', x: 16, y: 0, heading: 0, segs: [{kind: 'straight', studs: 64}]}, {name: 'AB', x: 0, y: 8, heading: 0, segs: [{kind: 'curve', radius: 40, angle: -36.869898}, {kind: 'curve', radius: 40, angle: 36.869898}]}] },
  'Double crossover (R56)': { version: 1, gaugeStuds: 4, routes: [{name: 'A', x: 0, y: 0, heading: 0, segs: [{kind: 'straight', studs: 90}]}, {name: 'B', x: 16, y: 0, heading: 0, segs: [{kind: 'straight', studs: 90}]}, {name: 'AB', x: 0, y: 16, heading: 0, segs: [{kind: 'curve', radius: 56, angle: -31.002719}, {kind: 'curve', radius: 56, angle: 31.002719}]}, {name: 'BA', x: 16, y: 16, heading: 0, segs: [{kind: 'curve', radius: 56, angle: 31.002719}, {kind: 'curve', radius: 56, angle: -31.002719}]}] },
  'Yard ladder (R40)': { version: 1, gaugeStuds: 4, routes: [{name: 'Main', x: 0, y: -8, heading: 0, segs: [{kind: 'straight', studs: 194.052048}]}, {name: 'Ladder', x: 0, y: 0, heading: 0, segs: [{kind: 'curve', radius: 40, angle: -22.5}, {kind: 'straight', studs: 141.517055}]}, {name: 'Y1', x: 12.955181, y: 39.233069, heading: -22.5, segs: [{kind: 'curve', radius: 40, angle: 22.5}, {kind: 'straight', studs: 40}]}, {name: 'Y2', x: 28.955181, y: 77.860486, heading: -22.5, segs: [{kind: 'curve', radius: 40, angle: 22.5}, {kind: 'straight', studs: 32}]}, {name: 'Y3', x: 44.955181, y: 116.487903, heading: -22.5, segs: [{kind: 'curve', radius: 40, angle: 22.5}, {kind: 'straight', studs: 24}]}] },
  // (a yard at R56, as the reference plan's: a double crossover onto an arrival track 16 studs over, then a ladder at
  // 22.5 degrees, each siding leaving it on an R56 curve back to parallel, 16 studs apart; the ladder the last one)
  'Yard (R56)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Main', x: 0, y: -110, heading: 0, segs: [{ kind: 'straight', studs: 310 }] },
    { name: 'Arrival', x: -16, y: -110, heading: 0, segs: [{ kind: 'straight', studs: 310 }] },
    { name: 'Over', x: -16, y: -94, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: -31.002719 }, { kind: 'curve', radius: 56, angle: 31.002719 }] },
    { name: 'Back', x: 0, y: -94, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: 31.002719 }, { kind: 'curve', radius: 56, angle: -31.002719 }] },
    { name: 'Ladder', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: -22.5 }, { kind: 'straight', studs: 144.961874 }, { kind: 'curve', radius: 56, angle: 22.5 }, { kind: 'straight', studs: 23.212147 }] },
    { name: 'Y1', x: 11.737254, y: 39.47533, heading: -22.5, segs: [{ kind: 'curve', radius: 56, angle: 22.5 }, { kind: 'straight', studs: 139.094398 }] },
    { name: 'Y2', x: 27.737254, y: 78.102747, heading: -22.5, segs: [{ kind: 'curve', radius: 56, angle: 22.5 }, { kind: 'straight', studs: 100.466981 }] },
    { name: 'Y3', x: 43.737254, y: 116.730164, heading: -22.5, segs: [{ kind: 'curve', radius: 56, angle: 22.5 }, { kind: 'straight', studs: 61.839564 }] },
  ] },
  // (the X yard: six tracks crossed by two diagonals, every crossing of a diagonal and a track a full R104 double slip,
  // from plain routes (slipXYard): their points, levers and check rails worked out as the reference's (switch/dslip.ts))
  'X yard (6 tracks, double slips)': slipXYard(),
  // (the reference's double slip crossover, from plain routes: slipCrossover; its points, levers and check rails worked
  // out as the reference's (switch/dslip.ts))
  'Double slip crossover R104': slipCrossover(),
  // (the reference's double slip monster crossover, from plain routes: slipMonster; three tracks, a three-way at each end
  // of the centre one, its branches the outer tracks' double slips' diagonals)
  'Double slip monster crossover R104': slipMonster(),
  'Wye with a crossover': { version: 1, gaugeStuds: 4, routes: [{name: 'In', x: 8, y: -16, heading: 0, segs: [{kind: 'straight', studs: 16}]}, {name: 'WL', x: 8, y: 0, heading: 0, segs: [{kind: 'curve', radius: 72, angle: 19.188136}, {kind: 'curve', radius: 72, angle: -19.188136}, {kind: 'straight', studs: 81.96969}]}, {name: 'WR', x: 8, y: 0, heading: 0, segs: [{kind: 'curve', radius: 72, angle: -19.188136}, {kind: 'curve', radius: 72, angle: 19.188136}, {kind: 'straight', studs: 81.96969}]}, {name: 'X', x: 0, y: 55.328638, heading: 0, segs: [{kind: 'curve', radius: 72, angle: -27.266044}, {kind: 'curve', radius: 72, angle: 27.266044}]}, {name: 'ML', x: 0, y: 129.298328, heading: 0, segs: [{kind: 'curve', radius: 72, angle: -19.188136}, {kind: 'curve', radius: 72, angle: 19.188136}]}, {name: 'MR', x: 16, y: 129.298328, heading: 0, segs: [{kind: 'curve', radius: 72, angle: 19.188136}, {kind: 'curve', radius: 72, angle: -19.188136}]}, {name: 'Out', x: 8, y: 176.626967, heading: 0, segs: [{kind: 'straight', studs: 16}]}] },
  // (a double track's two lines joined by a loop with a passing loop in it, all of it bought track (as the reference
  // plan's): LEGO's 16-stud straights; BrickTracks' R104 switches, R104 and R120 curves (the loop turns 247.5 degrees,
  // 22 of each), R104B siding curves after the switches, and their 1/2, 1/4 and 1/10 straights. The line in runs up the
  // left track to the first switch: on along the outer track (R120), or through the switch's branch and an R104B and an
  // R104, 16 studs over, the inner one (R104); the two meet at the far switch (forced: their pieces meet it 0.04 mm off,
  // as real track does), which returns as the right-hand line, ending 16 studs over. One turning each way, mirror images)
  'Double-track return loop (turning right)': bricktracksLoop(1),
  'Double-track return loop (turning left)': bricktracksLoop(-1),
  // ---- features ----
  // (the standard grade: a plate a 16-stud straight, on LEGO 2 x 8 risers; level either end)
  'Grade up at 2.5%': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Low', x: 0, y: -16, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'Grade', x: 0, y: 0, heading: 0, monoHeight: 0, monoHeightEnd: 6, segs: [{ kind: 'straight', studs: 96 }] },
    { name: 'High', x: 0, y: 96, heading: 0, monoHeight: 6, monoHeightEnd: 6, segs: [{ kind: 'straight', studs: 32 }] },
  ] },
  // (a helix: two turns of R104 on the standard grade, 2.48%, each turn 40.8 plates over the one under it (π × 104 / 8),
  // 13 bricks clear; in and out on straights, the way out over the way in)
  'Helix (R104, two turns)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Helix', x: 0, y: -16, heading: 0, monoHeight: 0, monoHeightEnd: 83, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 104, angle: 360 }, { kind: 'curve', radius: 104, angle: 360 }, { kind: 'straight', studs: 16 }] },
  ] },
  'Siding ending in a buffer stop': { version: 1, gaugeStuds: 4, options: { ballast: 'ballast' }, routes: [
    { name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }] },
    { name: 'Siding', x: 0, y: 0, heading: 0, endEnd: 'buffer', segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 24 }] },
  ] },
  // (expert: a track cut into parts by hand, and only there (DRoute.cuts, cutsLocked): 10, 20 and 18 studs; and one cut
  // by hand in its curve and its second straight, the app's own cuts every 16 studs kept between; hand cuts are made
  // with Long track cut into: Track pieces, said here as the tests' defaults differ)
  'Straight cut into parts by hand': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths' }, routes: [
    { name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }], cuts: [10, 30], cutsLocked: true },
  ] },
  'Curve and straights cut into parts by hand': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths' }, routes: [
    { name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: 45 }, { kind: 'straight', studs: 24 }], cuts: [24, 56] },
  ] },
  // (expert: tracks with settings of their own (DRoute.own) over the design's: double track, the inner on sleepers as
  // the design says, the outer on ballast with its buddy layer; a station's track on a solid bed, the line joined onto its end on
  // sleepers as the design says (not one on ballast and the next not: ballast lifts the track a plate, a step where
  // they meet). Each is built with its own; said for sleepers and track pieces here as the tests' defaults differ)
  'Double track, one on sleepers, one on ballast': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', sleepers: 'sleepers' }, routes: [
    { name: 'Inner', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }, { kind: 'curve', radius: 40, angle: 45 }] },
    { name: 'Outer', x: 16, y: 0, heading: 0, own: { ballast: 'buddy' }, segs: [{ kind: 'straight', studs: 32 }, { kind: 'curve', radius: 56, angle: 45 }] },
  ] },
  'Station track on a solid bed, the line beyond on sleepers': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', sleepers: 'sleepers' }, routes: [
    { name: 'Station', x: 0, y: 0, heading: 0, own: { sleepers: 'bed' }, segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Line', x: 0, y: 32, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }, { kind: 'straight', studs: 16 }] },
  ] },
  // (expert: a stretch of a track with settings of its own (DRoute.stretches): the middle 16 studs on a solid bed)
  'Track on sleepers, a stretch of it on a solid bed': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', sleepers: 'sleepers' }, routes: [
    { name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }, { kind: 'curve', radius: 40, angle: 45 }], stretches: [{ from: 8, to: 24, own: { sleepers: 'bed' } }] },
  ] },
  // (expert, stage 5a) Sleepers edited by hand: on the straight one taken out, one moved a stud back, one added, one two
  // studs longer each side, one without studs; on the curve one laid square to the stud grid. Each track one part
  // (cut by hand only), so its sleepers are laid along the whole of it, as the plan draws them.
  'Sleepers edited by hand': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', sleepers: 'sleepers' }, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, cutsLocked: true, segs: [{ kind: 'straight', studs: 24 }],
      sleeperEdits: [{ at: 8, off: true }, { at: 12, move: -1 }, { at: 14, add: true }, { at: 16, left: 2, right: 2 }, { at: 20, studs: false }] },
    { name: 'Curve', x: 24, y: 0, heading: 0, cutsLocked: true, segs: [{ kind: 'curve', radius: 40, angle: 45 }], sleeperEdits: [{ at: 15.71, turn: 'square' }] },
  ] },
  // (two tracks 16 studs apart, the first one's sleepers carried under both from 4 to 20 studs along: one part)
  'Double track on shared sleepers': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', sleepers: 'sleepers' }, routes: [
    { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] },
    { name: 'Right', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] },
  ], expert: { shared: [{ routes: ['Left', 'Right'], from: 4, to: 20 }] } },
  // (ballast three studs past the sleepers on the left and none on the right, its steps carried on round the buffer stop's end)
  'Siding on ballast wider on one side, stepped round its buffer stop': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', ballast: 'buddy', ballastLeftStuds: 3, ballastRightStuds: 0, ballastEnds: 'stepped' }, routes: [
    { name: 'Siding', x: 0, y: 0, heading: 0, endEnd: 'buffer', segs: [{ kind: 'straight', studs: 24 }] },
  ] },
  // (expert, stage 5b) Rails edited by hand: on the straight a gap through both rails, guard rails inside both from 20
  // to 36 studs, a check rail added inside the right rail; on the R24 curve a gap in its left rail with a check rail
  // opposite it; the straight's rail ends square where it's cut into parts
  'Rails edited by hand': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths' }, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }], railEdits: { gaps: [{ at: 12, side: 'both' }], guards: [{ from: 20, to: 36 }], checks: [{ from: 40, to: 46, side: 'right' }], ends: 'square' } },
    { name: 'Curve', x: 0, y: 48, heading: 0, segs: [{ kind: 'curve', radius: 24, angle: 45 }], railEdits: { gaps: [{ at: 10, side: 'left' }], checks: [{ from: 6, to: 14, side: 'right' }] } },
  ] },
  // (expert, stage 5c) A crossover whose two sets of points are each their own: the first with rigid, realistic blades (planed,
  // tucked under the stock rail; the design's are sprung), the second's throw bar moved 2 studs towards its heel
  'Crossover with points of their own': { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] }, { name: 'B', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] }, { name: 'AB', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -36.869898 }, { kind: 'curve', radius: 40, angle: 36.869898 }] }],
    trackwork: { points: { '0,64': { bladeStyle: 'prototype' } }, throw: { '128,448': { throwShift: 2 } } } },
  'Bridge with guard rails': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Bridge', x: 0, y: 0, heading: 0, guardRails: true, guardRailEnds: 'both', segs: [{ kind: 'straight', studs: 64 }] },
  ] },
  // (a dual-gauge track crossed by a plain one: the third rail runs on through the crossing, the plain track's flangeways cut
  // through it and the narrow gauge's through the plain track's rails (geom/extrarails.ts DUAL_CROSS, geom/crossing.ts))
  'Dual gauge crossing 90°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [
    { name: 'Dual', x: 0, y: -8, heading: 0, dualGauge: true, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'Plain', x: 8, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 16 }] },
  ] },
  'Dual gauge crossing 45°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [
    { name: 'Dual', x: 0, y: -16, heading: 0, dualGauge: true, segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Plain', x: 16 * sin(45), y: -16 * cos(45), heading: 45, segs: [{ kind: 'straight', studs: 32 }] },
  ] },
  // (mixed gauges: a narrow-gauge line (2 studs, its own gauge: DRoute.gaugeStuds) beside a standard one, then across it
  // at 45 degrees between two R36 curves and on beside it on the other side, 16 studs off each way. The standard track
  // starts 8 studs back, so the crossing is in the middle of one of its 16-stud pieces, not at a joint between two)
  'Narrow gauge beside and across standard track': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Standard', x: 0, y: -8, heading: 0, segs: [{ kind: 'straight', studs: 112 }] },
    { name: 'Narrow', x: -16, y: 0, heading: 0, gaugeStuds: 2, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 36, angle: -45 }, { kind: 'straight', studs: 15.431458 }, { kind: 'curve', radius: 36, angle: 45 }, { kind: 'straight', studs: 16 }] },
  ] },
  'Dual gauge track': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Dual', x: 0, y: 0, heading: 0, dualGauge: true, segs: [{ kind: 'straight', studs: 32 }, { kind: 'curve', radius: 56, angle: 45 }] },
  ] },
  // (the narrow gauge up the middle on two rails of its own, four rails in all: the reference's narrow-centred straights
  // and R40 curves, as the app's 16-stud pieces)
  'Dual gauge track, narrow gauge centred': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Dual', x: 0, y: 0, heading: 0, dualGauge: true, dualShared: 'centre', segs: [{ kind: 'straight', studs: 32 }, { kind: 'curve', radius: 40, angle: 45 }] },
  ] },
  'Dual gauge crossing 90°, narrow gauge centred': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [
    { name: 'Dual', x: 0, y: -8, heading: 0, dualGauge: true, dualShared: 'centre', segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'Plain', x: 8, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 16 }] },
  ] },
  'Banked curve': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Curve', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }, { kind: 'curve', radius: 56, angle: 90, bank: 4 }, { kind: 'straight', studs: 40 }] },
  ] },
  'Crossing on sleepers': { version: 1, gaugeStuds: 4, options: { sleepers: 'sleepers' }, routes: [
    { name: 'A', x: 0, y: -24, heading: 0, segs: [{ kind: 'straight', studs: 48 }] },
    { name: 'B', x: 24, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 48 }] },
  ] },
  // ---- monorail ----
  'Monorail oval on supports': { version: 1, gaugeStuds: 4, options: { monoSupportStuds: 32 }, routes: [
    { name: 'Loop', x: 0, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 32 }, { kind: 'curve', radius: 40, angle: 180 }, { kind: 'straight', studs: 32 }, { kind: 'curve', radius: 40, angle: 180 }] },
  ] },
  'Monorail ramp (as LEGO\'s)': { version: 1, gaugeStuds: 4, options: { monoSupportStuds: 32 }, routes: [
    { name: 'Low', x: 0, y: 0, heading: 0, system: 'monorail', monoHeight: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'Ramp', x: 0, y: 16, heading: 0, system: 'monorail', monoHeight: 0, monoHeightEnd: 30, segs: [{ kind: 'straight', studs: 64 }] },
    { name: 'High', x: 0, y: 80, heading: 0, system: 'monorail', monoHeight: 30, segs: [{ kind: 'straight', studs: 16 }] },
  ] },
  // (LEGO's points 2889 and 2890: 32 studs straight; the branch ends 20 studs on and 8 across at 45 degrees, by the curve of
  // LEGO's short curve (R22) between two short straights. The siding: the points, a short curve back, parallel 16 studs aside)
  'Monorail points right (as LEGO\'s)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Main', x: 0, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 2.8873016 }, { kind: 'curve', radius: 22, angle: -45 }, { kind: 'straight', studs: 2.2010101 }] },
  ] },
  'Monorail points left (as LEGO\'s)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Main', x: 0, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 2.8873016 }, { kind: 'curve', radius: 22, angle: 45 }, { kind: 'straight', studs: 2.2010101 }] },
  ] },
  'Monorail siding (points and a short curve)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Main', x: 0, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 64 }] },
    { name: 'Siding', x: 0, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 2.8873016 }, { kind: 'curve', radius: 22, angle: -45 }, { kind: 'straight', studs: 4.4020202 }, { kind: 'curve', radius: 22, angle: 45 }, { kind: 'straight', studs: 26.8873016 }] },
  ] },
  'Monorail level crossing (experimental)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: -24, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 48 }] },
    { name: 'B', x: 24, y: 0, heading: 90, system: 'monorail', segs: [{ kind: 'straight', studs: 48 }] },
  ] },
  // ---- the reference range's trackwork, each part as it is: its ends where the parts library has them (studs, degrees),
  // the curves between them fitted to those ends; each lever on the side the reference's is (switches' on the branch side
  // unless said); all printed, none of it bought ----
  // (a 32-stud straight; the branch an R40 curve of 33.75 degrees (22.22 on, 6.74 over); the lever on the branch side, 3.4 studs from the toe)
  'Switch R40 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 33.75 }], throwSide: 'left' }] },
  // (its mirror image)
  'Switch R40 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -33.75 }], throwSide: 'right' }] },
  // (as the R40 switch, its straight 28 studs (to fit an R56 pass-through crossing))
  'Switch R40 left, 28-stud straight': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 28 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 33.75 }], throwSide: 'left' }] },
  // (its mirror image)
  'Switch R40 right, 28-stud straight': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 28 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -33.75 }], throwSide: 'right' }] },
  // (a yard ladder's: the straight 28.84 studs, the branch an R40 curve of 33.75 degrees; the lever on the straight side)
  'Yard switch R40 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 28.844 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 33.75 }], throwSide: 'right' }] },
  // (its mirror image)
  'Yard switch R40 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 28.844 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -33.75 }], throwSide: 'left' }] },
  // (a 32-stud straight; the branch an R56 curve of 31.89 degrees (29.59 on, 8.45 over))
  'Switch R56 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: 31.891 }], throwSide: 'left' }] },
  // (its mirror image)
  'Switch R56 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: -31.891 }], throwSide: 'right' }] },
  // (a 32-stud straight; the branch an R72 curve of 28.125 degrees (33.94 on, 8.50 over))
  'Switch R72 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 72, angle: 28.125 }], throwSide: 'left' }] },
  // (its mirror image)
  'Switch R72 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 72, angle: -28.125 }], throwSide: 'right' }] },
  // (40 studs; the branch an R104 curve of 22.5 degrees and a 0.2-stud straight, ending 40 on and 8 over; its blades and its lever, on the branch side, where the reference's are: r104Work)
  'Switch R104 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: 0.218121 }], throwSide: 'left' }], trackwork: r104Work('left') },
  // (its mirror image)
  'Switch R104 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: 0.218121 }], throwSide: 'right' }], trackwork: r104Work('right') },
  // (as the R104 switch, its lever on the straight side (the reference's ground throw outside))
  'Switch R104 left, lever on the straight side': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: 0.218121 }], throwSide: 'right' }], trackwork: r104Work('right') },
  // (its mirror image)
  'Switch R104 right, lever on the straight side': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: 0.218121 }], throwSide: 'left' }], trackwork: r104Work('left') },
  // (a 40-stud straight; the branch an R120 curve of 18.75 degrees (38.57 on, 6.37 over), for a 3.75-degree turnout curve after it)
  'Switch R120 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 120, angle: 18.75 }], throwSide: 'left' }] },
  // (its mirror image)
  'Switch R120 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 120, angle: -18.75 }], throwSide: 'right' }] },
  // (48 studs; the branch an R148 curve of 18.92 degrees, ending 48 on and 8 over)
  'Switch R148 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 148, angle: 18.925 }], throwSide: 'left' }] },
  // (its mirror image)
  'Switch R148 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 148, angle: -18.925 }], throwSide: 'right' }] },
  // (as the R148 switch, its lever on the straight side)
  'Switch R148 left, lever on the straight side': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 148, angle: 18.925 }], throwSide: 'right' }] },
  // (its mirror image)
  'Switch R148 right, lever on the straight side': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 148, angle: -18.925 }], throwSide: 'left' }] },
  // (the inner an R40 curve of 33.75 degrees from the toe; the outer 22.63 studs straight, then R40 for 11.25)
  'Curved switch R40 45° left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Outer', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 22.627417 }, { kind: 'curve', radius: 40, angle: 11.25 }] }, { name: 'Inner', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 33.75 }], throwSide: 'left' }] },
  // (its mirror image)
  'Curved switch R40 45° right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Outer', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 22.627417 }, { kind: 'curve', radius: 40, angle: -11.25 }] }, { name: 'Inner', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -33.75 }], throwSide: 'right' }] },
  // (the inner an R40 curve of 45 degrees; the outer 16 studs straight, then R40 for 22.5)
  'Curved switch R40 90° left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Outer', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: 22.5 }] }, { name: 'Inner', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }], throwSide: 'left' }] },
  // (its mirror image)
  'Curved switch R40 90° right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Outer', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: -22.5 }] }, { name: 'Inner', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -45 }], throwSide: 'right' }] },
  // (the inner an R56 curve of 45 degrees; the outer 16 studs straight, then R56 for 22.5)
  'Curved switch R56 90° left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Outer', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 56, angle: 22.5 }] }, { name: 'Inner', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: 45 }], throwSide: 'left' }] },
  // (its mirror image)
  'Curved switch R56 90° right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Outer', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 56, angle: -22.5 }] }, { name: 'Inner', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: -45 }], throwSide: 'right' }] },
  // (the inner an R104 curve of 33.75 degrees; the outer 16 studs straight, then R104 for 28.125)
  'Curved switch R104 90° left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Outer', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 104, angle: 28.125 }] }, { name: 'Inner', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 33.75 }], throwSide: 'left' }] },
  // (its mirror image)
  'Curved switch R104 90° right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Outer', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 104, angle: -28.125 }] }, { name: 'Inner', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -33.75 }], throwSide: 'right' }] },
  // (both routes R40 curves of 33.75 degrees; the lever on the right)
  'Wye R40': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 33.75 }], throwSide: 'right' }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -33.75 }], throwSide: 'right' }] },
  // (each route a curve of 22.5 degrees (R39.84) and a 2.65-stud straight, ending 17.69 on and 4.05 over: the tracks 8 studs apart)
  'Wye R40, 8-stud spacing': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 39.844, angle: 22.5 }, { kind: 'straight', studs: 2.645 }], throwSide: 'right' }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 39.844, angle: -22.5 }, { kind: 'straight', studs: 2.645 }], throwSide: 'right' }] },
  // (both routes R104 curves of 15.75 degrees (a 6.75-degree adapter curve after each makes 22.5))
  'Wye R104': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 15.75 }], throwSide: 'right' }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -15.75 }], throwSide: 'right' }] },
  // (left an R40 curve of 28.125 degrees, right an R56 curve of 22.5; the lever on the R40 side)
  'Wye R40 left, R56 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 28.125 }], throwSide: 'left' }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: -22.5 }], throwSide: 'left' }] },
  // (its mirror image)
  'Wye R56 left, R40 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: 22.5 }], throwSide: 'right' }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -28.125 }], throwSide: 'right' }] },
  // (left an R104 curve of 16.875 degrees, right an R120 curve of 15; the lever on the R104 side)
  'Wye R104 left, R120 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 16.875 }], throwSide: 'left' }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 120, angle: -15 }], throwSide: 'left' }] },
  // (its mirror image)
  'Wye R120 left, R104 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 120, angle: 15 }], throwSide: 'right' }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -16.875 }], throwSide: 'right' }] },
  // (a 32-stud straight and an R40 curve of 33.75 degrees each way)
  // (the reference's triple switches have two levers at the same place, one each side, each working one blade: threeWayLevers 2)
  'Three-way R40': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', threeWayLevers: 2 }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 33.75 }] }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -33.75 }] }] },
  // (40 studs; an R104 curve of 22.5 degrees and a 0.2-stud straight each way, 8 studs over)
  'Three-way R104': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', threeWayLevers: 2 }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: 0.218121 }] }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: 0.218121 }] }], trackwork: r104Work() },
  // (a 24-stud straight; the branch an S of two R34 curves of 28.07 degrees, ending 32 on and 8 over, parallel)
  'Switch to the next track, no gap, left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 34, angle: 28.072 }, { kind: 'curve', radius: 34, angle: -28.072 }], throwSide: 'left' }] },
  // (its mirror image)
  'Switch to the next track, no gap, right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 34, angle: -28.072 }, { kind: 'curve', radius: 34, angle: 28.072 }], throwSide: 'right' }] },
  // (a 24-stud straight; the branch R39.3 for 28.97 degrees and back 19.62, ending 31.71 on and 9.32 over at 9.36 degrees (an R51 9.36-degree curve after it makes it parallel, 10 studs over))
  'Switch, 2-stud gap, left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 39.33, angle: 28.973 }, { kind: 'curve', radius: 39.33, angle: -19.616 }], throwSide: 'left' }] },
  // (its mirror image)
  'Switch, 2-stud gap, right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 39.33, angle: -28.973 }, { kind: 'curve', radius: 39.33, angle: 19.616 }], throwSide: 'right' }] },
  // (a 24-stud straight; the branch R39.85 for 32.65 degrees and back 10.15, ending 27.75 on and 9.56 over at 22.5 degrees (an R32 22.5-degree curve after it makes it parallel, 12 studs over))
  'Switch, 4-stud gap, left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 39.85, angle: 32.654 }, { kind: 'curve', radius: 39.85, angle: -10.154 }], throwSide: 'left' }] },
  // (its mirror image)
  'Switch, 4-stud gap, right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 39.85, angle: -32.654 }, { kind: 'curve', radius: 39.85, angle: 10.154 }], throwSide: 'right' }] },
  // (the no-gap switch's branch each way)
  'Three-way, no gap': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', threeWayLevers: 2 }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 34, angle: 28.072 }, { kind: 'curve', radius: 34, angle: -28.072 }] }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 34, angle: -28.072 }, { kind: 'curve', radius: 34, angle: 28.072 }] }] },
  // (the 2-stud-gap switch's branch each way)
  'Three-way, 2-stud gap': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', threeWayLevers: 2 }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 39.33, angle: 28.973 }, { kind: 'curve', radius: 39.33, angle: -19.616 }] }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 39.33, angle: -28.973 }, { kind: 'curve', radius: 39.33, angle: 19.616 }] }] },
  // (the 4-stud-gap switch's branch each way)
  'Three-way, 4-stud gap': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', threeWayLevers: 2 }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 39.85, angle: 32.654 }, { kind: 'curve', radius: 39.85, angle: -10.154 }] }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 39.85, angle: -32.654 }, { kind: 'curve', radius: 39.85, angle: 10.154 }] }] },
  // (two 8-stud straights crossing square at their middles)
  'Crossing 90°, 8 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -4, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 8 }] }, { name: 'B', x: 0, y: 4, heading: -180, segs: [{ kind: 'straight', studs: 8 }] }] },
  // (an 18.63-stud straight crossed at its middle by a 16-stud one at 45 degrees)
  'Crossing 45° left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -6.585786, y: 6.585786, heading: -135, segs: [{ kind: 'straight', studs: 18.627417 }] }, { name: 'B', x: 0, y: 8, heading: -180, segs: [{ kind: 'straight', studs: 16 }] }] },
  // (its mirror image)
  'Crossing 45° right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: 8, heading: -180, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'B', x: 6.585786, y: 6.585786, heading: 135, segs: [{ kind: 'straight', studs: 18.627417 }] }] },
  // (two 27.08-stud straights crossing at 45 degrees at their middles (to go between R104 curves))
  'Crossing 45°, 27 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -12.510345, y: -5.181955, heading: -67.5, segs: [{ kind: 'straight', studs: 27.0822 }] }, { name: 'B', x: -12.510345, y: 5.181955, heading: -112.5, segs: [{ kind: 'straight', studs: 27.0822 }] }] },
  // (a 40-stud straight crossed at its middle at 22.5 degrees, the other track's ends level with its ends, 8 studs over (to go
  // with R104 switches: the diagonal bends 0.75 degrees at each end, as the R104 double slip's, so its ends are at the
  // switch's 22.5 degrees and on whole studs, where the reference's are)
  'Crossing 22.5° left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -20, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'B', x: -20, y: -8, heading: -67.5, segs: r104Diagonal(-1) }] },
  // (its mirror image)
  'Crossing 22.5° right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -20, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'B', x: -20, y: 8, heading: -112.5, segs: r104Diagonal(1) }] },
  // (three tracks crossing at their middles: a 40-stud straight, and one each way at 22.5 degrees, their ends level with its ends)
  'Star crossing 22.5°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -20, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'B', x: -20, y: -8, heading: -67.5, segs: r104Diagonal(-1) }, { name: 'C', x: -20, y: 8, heading: -112.5, segs: r104Diagonal(1) }] },
  // (an R24 curve of 22.5 degrees crossed square at its middle by a 16-stud straight)
  'Curved crossing R24': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Curve', x: -4.682168, y: -0.461153, heading: -78.75, segs: [{ kind: 'curve', radius: 24, angle: -22.5 }] }, { name: 'Straight', x: 0, y: 8, heading: -180, segs: [{ kind: 'straight', studs: 16 }] }] },
  // (an R40 curve of 22.5 degrees crossed square at its middle by a 16-stud straight)
  'Curved crossing R40': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Curve', x: -7.803613, y: -0.768589, heading: -78.75, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }] }, { name: 'Straight', x: 0, y: 8, heading: -180, segs: [{ kind: 'straight', studs: 16 }] }] },
  // (an R56 curve of 22.5 degrees crossed square at its middle by a 16-stud straight)
  'Curved crossing R56': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Curve', x: -10.925058, y: -1.076024, heading: -78.75, segs: [{ kind: 'curve', radius: 56, angle: -22.5 }] }, { name: 'Straight', x: 0, y: 8, heading: -180, segs: [{ kind: 'straight', studs: 16 }] }] },
  // (an R72 curve of 11.25 degrees crossed square at its middle by a 16-stud straight)
  'Curved crossing R72': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Curve', x: -7.057234, y: -0.3467, heading: -84.375, segs: [{ kind: 'curve', radius: 72, angle: -11.25 }] }, { name: 'Straight', x: 0, y: 8, heading: -180, segs: [{ kind: 'straight', studs: 16 }] }] },
  // (an R88 curve of 11.25 degrees crossed square at its middle by a 16-stud straight)
  'Curved crossing R88': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Curve', x: -8.625508, y: -0.423744, heading: -84.375, segs: [{ kind: 'curve', radius: 88, angle: -11.25 }] }, { name: 'Straight', x: 0, y: 8, heading: -180, segs: [{ kind: 'straight', studs: 16 }] }] },
  // (an R104 curve of 11.25 degrees crossed square at its middle by a 16-stud straight)
  'Curved crossing R104': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Curve', x: -10.193783, y: -0.500788, heading: -84.375, segs: [{ kind: 'curve', radius: 104, angle: -11.25 }] }, { name: 'Straight', x: 0, y: 8, heading: -180, segs: [{ kind: 'straight', studs: 16 }] }] },
  // (two R120 curves of 13.125 degrees, curving away from each other, crossing at their middles (a T-junction's))
  'Crossing of two R120 curves': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 12.941715, y: 3.911099, heading: 105, segs: [{ kind: 'curve', radius: 120, angle: 13.125 }] }, { name: 'B', x: 12.941715, y: -3.911099, heading: 75, segs: [{ kind: 'curve', radius: 120, angle: -13.125 }] }] },
  // (a 20-stud straight crossed by an R56 curve of 22.5 degrees (a pass-through crossover's))
  'Pass-through crossing R56 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Curve', x: -8.331296, y: 7.653403, heading: -125.609208, segs: [{ kind: 'curve', radius: 56, angle: -22.5 }] }, { name: 'Straight', x: -0.9375, y: 10.125, heading: -180, segs: [{ kind: 'straight', studs: 20 }] }] },
  // (a 24-stud straight crossed by an R72 curve of 22.5 degrees)
  'Pass-through crossing R72 (A) left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0.9375, y: 10.9375, heading: -180, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Curve', x: -9.386184, y: 10.594253, heading: -129.375, segs: [{ kind: 'curve', radius: 72, angle: -22.5 }] }] },
  // (a 16-stud straight crossed by an R72 curve of 11.25 degrees)
  'Pass-through crossing R72 (B) left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: -0.1875, y: 8, heading: -180, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'Curve', x: -6.246935, y: 3.498331, heading: -118.125, segs: [{ kind: 'curve', radius: 72, angle: -11.25 }] }] },
  // (a 40-stud straight crossed by an R120 curve of 15 degrees)
  'Pass-through crossing R120 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0.75, y: -20, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Curve', x: -8.047599, y: 13.051371, heading: -142.5, segs: [{ kind: 'curve', radius: 120, angle: -15 }] }] },
  // (its mirror image)
  'Pass-through crossing R56 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0.875, y: 10.125, heading: -180, segs: [{ kind: 'straight', studs: 20 }] }, { name: 'Curve', x: 8.331296, y: 7.653403, heading: 125.609208, segs: [{ kind: 'curve', radius: 56, angle: 22.5 }] }] },
  // (its mirror image)
  'Pass-through crossing R72 (A) right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: -0.9375, y: 10.9375, heading: -180, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Curve', x: 9.386184, y: 10.594253, heading: 129.375, segs: [{ kind: 'curve', radius: 72, angle: 22.5 }] }] },
  // (its mirror image)
  'Pass-through crossing R72 (B) right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0.1875, y: 8, heading: -180, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'Curve', x: 6.246935, y: 3.498331, heading: 118.125, segs: [{ kind: 'curve', radius: 72, angle: 11.25 }] }] },
  // (its mirror image)
  'Pass-through crossing R120 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: -0.75, y: -20, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Curve', x: 8.047599, y: 13.051371, heading: 142.5, segs: [{ kind: 'curve', radius: 120, angle: 15 }] }] },
  // (a 38.31-stud straight and two R56 curves of 35.61 degrees, one each way, crossing it and each other)
  'T-junction core R56': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: -19.155606, y: 4.467672, heading: -90, segs: [{ kind: 'straight', studs: 38.311211 }] }, { name: 'Left', x: -18.415094, y: 11.98467, heading: -121.890792, segs: [{ kind: 'curve', radius: 56, angle: -35.609208 }] }, { name: 'Right', x: 18.415094, y: 11.98467, heading: 121.890792, segs: [{ kind: 'curve', radius: 56, angle: 35.609208 }] }] },
  // (as the 45-degree R40 double slip: its points at its four ends, their blades from 1.75 studs in (toe) to 8.4; each lever
  // outside, beside its points on the slip road's side, 7 studs from its track's centre line)
  'Double slip R40 45°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: -16.568542, heading: 0, segs: [{ kind: 'straight', studs: 33.137085 }] }, { name: 'B', x: 11.715729, y: -11.715729, heading: 45, segs: [{ kind: 'straight', studs: 33.137085 }] }, { name: 'A to B', x: 0, y: -16.568542, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }] }, { name: 'B to A', x: 11.715729, y: -11.715729, heading: 45, segs: [{ kind: 'curve', radius: 40, angle: -45 }] }], trackwork: slipWork({ '0,-133': 'left', '94,-94': 'right', '0,133': 'left', '-94,94': 'right' }, () => ({ toe: 12 })) },
  // (a 32-stud straight crossed at 45 degrees by another, and an R40 curve of 45 degrees from the other's end to its end; the levers outside, beside the points)
  'Single slip R40 45°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -1.125, y: 16, heading: -180, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'B', x: 10.590729, y: 12.284271, heading: 135, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Slip', x: 10.590729, y: 12.284271, heading: 135, segs: [{ kind: 'curve', radius: 40, angle: 45 }] }], trackwork: slipWork({ '85,98': 'left', '-9,-128': 'right' }, () => ({ toe: 12 })) },
  // (as the R104 double slip: 40 studs, its ends where an R104 switch's are (8 over in 40), the tracks crossing at 22.5
  // degrees; each slip road an R104 curve of 22.5 from one track's end to the other's, as the R104 switch's branch. Its
  // four sets of points as the reference's, set by hand (slipWork): one moving blade each (single point), the one by the
  // slip road's own stock rail (single 'straight': the other blade would lie where the other track's rails cross in),
  // its toe 11 studs from the crossing, where the reference's tongue starts (toe: the roads have parted 3 mm there),
  // and as long as that tongue (heel); each lever outside, 7 studs from its track's centre line, in a housing at its
  // own outer corner, 5.5 studs in from the end, as Aaron's reference photo has them, a tie-rod out to it from the
  // slider (leverAt))
  // (the diagonal track bends 0.75 degrees each way at its ends (R208): the reference's ends are at the R104 switch's
  // 22.5 degrees, a straight line between them at 21.8)
  'Double slip R104 left': r104Slip(1),
  // (its mirror image)
  'Double slip R104 right': r104Slip(-1),
  // (the R104 double slip as its kit (expert, cut paths): a detachable section at each end, 16 studs, with that end's
  // two sets of points and their levers, and the middle between them, 8 studs, with the crossing's fixed rails. Cut
  // across at 4 studs either side of the crossing, square to the straight track (the kit's joints are square to the
  // line between the two tracks, 11.25 degrees off: a cut path runs along the stud grid, and stepped it would run
  // down a rail))
  'Double slip R104 left, middle and detachable sections': r104SlipKit(1),
  'Double slip R104 right, middle and detachable sections': r104SlipKit(-1),
  // (two tracks 16 studs apart, 48 long, a crossover each way (two R40 curves of 36.87 degrees) crossing in the middle; the levers between the tracks)
  'Double crossover R40': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 8, y: -24, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }, { name: 'B', x: -8, y: -24, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }, { name: 'A to B', x: 8, y: -24, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -36.8699 }], throwSide: 'left' }, { name: 'B to A', x: -8, y: -24, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -36.8699 }, { kind: 'curve', radius: 40, angle: 36.8699 }], throwSide: 'right' }] },
  // (the reference's biggest crossover: three tracks 16 studs apart, 80 long, a crossover each way between the middle track and
  // each outer one (two R104 curves of 22.62 degrees, 40 on and 8 over each), each pair crossing in the middle at 45.24 degrees:
  // a switch at each end of the outer tracks, a three-way at each end of the middle one, its two levers one each side as the
  // reference's. The reference is a kit of sections cut along the track centre lines; here it's cut across only, so its
  // sections are three tracks wide, 320 mm and more: the build says they don't fit a 256 mm bed)
  'Crossover, three tracks, R104': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', threeWayLevers: 2, splitTrack: 'lengths' }, routes: [{ name: 'Left', x: -16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 80 }] }, { name: 'Middle', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 80 }] }, { name: 'Right', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 80 }] }, { name: 'Left to middle', x: -16, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.619865 }, { kind: 'curve', radius: 104, angle: 22.619865 }] }, { name: 'Middle to left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.619865 }, { kind: 'curve', radius: 104, angle: -22.619865 }] }, { name: 'Middle to right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.619865 }, { kind: 'curve', radius: 104, angle: 22.619865 }] }, { name: 'Right to middle', x: 16, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.619865 }, { kind: 'curve', radius: 104, angle: -22.619865 }] }],
    // (cut by hand as the kit is (expert, cut paths): across at 28 and 52 studs; the middle between them along the
    // three tracks' centre lines, which no rail crosses there; each end between the tracks. Ten parts, each within the bed)
    expert: { cutPaths: [{ id: 'c1', pts: [[-24, 28], [24, 28]] }, { id: 'c2', pts: [[-24, 52], [24, 52]] },
      { id: 'c3', pts: [[-16, 28], [-16, 52]] }, { id: 'c4', pts: [[0, 28], [0, 52]] }, { id: 'c5', pts: [[16, 28], [16, 52]] },
      { id: 'c6', pts: [[-8, -1], [-8, 28]] }, { id: 'c7', pts: [[8, -1], [8, 28]] }, { id: 'c8', pts: [[-8, 52], [-8, 81]] }, { id: 'c9', pts: [[8, 52], [8, 81]] }] } },
  // (the R104 switch cut as the modular kit's is (expert, cut paths; across the branch square to it, as the kit's joints): the base, its first 16 studs; detach 1, on to 28,
  // both tracks; from 28 to the end the straight is cut along its centre line: the branch's side, with the frog, is
  // detach 2, the far half of the straight the track terminator (the end connector's tab, which reaches across the
  // centre line, stays whole on detach 2: the cut goes round it))
  'Switch R104 left, base and detachable modules': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', pathSquare: true }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: 0.218121 }], throwSide: 'left' }], trackwork: r104Work('left'),
    expert: { cutPaths: [{ id: 'c1', pts: [[-10, 16], [6, 16]] }, { id: 'c2', pts: [[-12, 28], [6, 28]] }, { id: 'c3', pts: [[0, 28], [0, 42]] }] } },
  'Switch R104 right, base and detachable modules': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', pathSquare: true }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: 0.218121 }], throwSide: 'right' }], trackwork: r104Work('right'),
    expert: { cutPaths: [{ id: 'c1', pts: [[10, 16], [-6, 16]] }, { id: 'c2', pts: [[12, 28], [-6, 28]] }, { id: 'c3', pts: [[0, 28], [0, 42]] }] } },
  // (the R104 three-way cut as the modular kit's is (expert, cut paths): the triple base, its first 16 studs; the triple
  // detach 1, on to 28, all three tracks; from 28 to the end the straight is cut along its centre line into the two
  // detach 2 sections, each a branch with its frogs and its half of the straight (the straight's end connector, whole,
  // is the left one's: the cut goes round its tab))
  'Three-way R104, base and detachable modules': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', threeWayLevers: 2, splitTrack: 'lengths', pathSquare: true }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: 0.218121 }] }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: 0.218121 }] }], trackwork: r104Work(),
    expert: { cutPaths: [{ id: 'c1', pts: [[-10, 16], [10, 16]] }, { id: 'c2', pts: [[-12, 28], [12, 28]] }, { id: 'c3', pts: [[0, 28], [0, 42]] }] } },
  // (two tracks 12 studs apart (a 4-stud gap), the crossover in two halves: R35.86 for 30 degrees and 2.39 studs straight each, 40 studs along; each half's straight 24 studs, the second 16 on; the levers on the crossover's side)
  'Crossover, 4-stud gap, left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'B', x: -12, y: 16, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Over', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 35.856, angle: 30 }, { kind: 'straight', studs: 4.784 }, { kind: 'curve', radius: 35.856, angle: -30 }], throwSide: 'left' }] },
  // (its mirror image)
  'Crossover, 4-stud gap, right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'B', x: 12, y: 16, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Over', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 35.856, angle: -30 }, { kind: 'straight', studs: 4.784 }, { kind: 'curve', radius: 35.856, angle: 30 }], throwSide: 'right' }] },
  // (a buffer stop at the end of 4 studs of track)
  'Buffer stop': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 4 }], endEnd: 'buffer' }] },
  // (narrow gauge: two 8-stud straights crossing square at their middles)
  'Narrow-gauge crossing 90°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -4, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 8 }] }, { name: 'B', x: 0, y: 4, heading: -180, segs: [{ kind: 'straight', studs: 8 }] }] },
  // (mixed gauges: a standard track crossed square by a narrow-gauge one (2 studs, the route's own gauge), each 8 studs)
  'Narrow-gauge crossing of standard track 90°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Standard', x: -4, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 8 }] }, { name: 'Narrow', x: 0, y: 4, heading: -180, gaugeStuds: 2, segs: [{ kind: 'straight', studs: 8 }] }] },
  // (a 16-stud standard straight crossed at its middle at 45 degrees by a 14.63-stud narrow-gauge one)
  'Narrow-gauge crossing of standard track 45° left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Standard', x: -8, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'Narrow', x: -5.171573, y: -5.171573, heading: -45, gaugeStuds: 2, segs: [{ kind: 'straight', studs: 14.627417 }] }] },
  // (its mirror image)
  'Narrow-gauge crossing of standard track 45° right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Standard', x: -8, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'Narrow', x: -5.171573, y: 5.171573, heading: -135, gaugeStuds: 2, segs: [{ kind: 'straight', studs: 14.627417 }] }] },
  // (narrow gauge: a buffer stop at the end of 4 studs of track)
  'Narrow-gauge buffer stop': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 4 }], endEnd: 'buffer' }] },
  // (narrow gauge switches, the lever on the straight side, each branch fitted to the reference's ends: R36 (a 24-stud
  // straight, the branch 6 studs across and 20 along at 33.75°: a 0.22-stud lead and a 35.6 radius), R48 (32 studs,
  // 27.02°) and R84 (32 studs, 6 across and 32 along at 22.5°: a 1.84-stud lead and a 78.8 radius); one moving blade,
  // as narrow gauge has (build.ts switchParams))
  'Narrow-gauge switch R36 left': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 0.220608 }, { kind: 'curve', radius: 35.601887, angle: 33.75 }], throwSide: 'right' }] },
  'Narrow-gauge switch R36 right': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 0.220608 }, { kind: 'curve', radius: 35.601887, angle: -33.75 }], throwSide: 'left' }] },
  'Narrow-gauge switch R48 left': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 48, angle: 27.0171519 }], throwSide: 'right' }] },
  'Narrow-gauge switch R48 right': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 48, angle: -27.0171519 }], throwSide: 'left' }] },
  'Narrow-gauge switch R84 left': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 1.835974 }, { kind: 'curve', radius: 78.822393, angle: 22.5 }], throwSide: 'right' }] },
  'Narrow-gauge switch R84 right': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 1.835974 }, { kind: 'curve', radius: 78.822393, angle: -22.5 }], throwSide: 'left' }] },
  // (a narrow gauge wye: each side the R36 switch's branch, the lever on the left)
  'Narrow-gauge wye R36': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 0.220608 }, { kind: 'curve', radius: 35.601887, angle: 33.75 }], throwSide: 'left' }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 0.220608 }, { kind: 'curve', radius: 35.601887, angle: -33.75 }], throwSide: 'left' }] },
  // (the narrow gauge R36 switch with its lever on the branch's side (the reference's ground throw on the inner side): another part, not the same turned round)
  'Narrow-gauge switch R36 left, lever on the branch side': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 0.220608 }, { kind: 'curve', radius: 35.601887, angle: 33.75 }], throwSide: 'left' }] },
  'Narrow-gauge switch R36 right, lever on the branch side': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 0.220608 }, { kind: 'curve', radius: 35.601887, angle: -33.75 }], throwSide: 'right' }] },
  // (narrow gauge: two tracks 12 studs apart, 40 long, a crossover each way (the R36 switch's branch out and the same back), crossing in the
  // middle at 67.5 degrees; the levers outside, as the reference's)
  'Narrow-gauge double crossover R36': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 6, y: -20, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'B', x: -6, y: -20, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'A to B', x: 6, y: -20, heading: 0, segs: [{ kind: 'straight', studs: 0.220608 }, { kind: 'curve', radius: 35.601887, angle: 33.75 }, { kind: 'curve', radius: 35.601887, angle: -33.75 }, { kind: 'straight', studs: 0.220608 }], throwSide: 'right' }, { name: 'B to A', x: -6, y: -20, heading: 0, segs: [{ kind: 'straight', studs: 0.220608 }, { kind: 'curve', radius: 35.601887, angle: -33.75 }, { kind: 'curve', radius: 35.601887, angle: 33.75 }, { kind: 'straight', studs: 0.220608 }], throwSide: 'left' }] },
  // (narrow gauge crossings: a straight (24 studs, 16) crossed at its middle by another (26 studs, 20) at 22.5 and 33.75 degrees. The parts
  // library puts the other's ends 6 over and 12 (8) along, which isn't on a line through the middle at those angles (26.6 and 36.9 degrees: its
  // pictures are drawn through its rounded ends, as its 22.5 degree standard crossing's is at 21.8); those ends are 13.4 and 10 from the middle,
  // so the other track is taken as 26 and 20 studs long at the angle the part's named for: its ends 4.97 over and 12.01 along (5, 12, 13: the
  // triangle 22.5 degree track is laid out on), and 5.56 over and 8.31 along)
  'Narrow-gauge crossing 22.5° left': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: -12, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'B', x: 4.974885, y: -12.010434, heading: 22.5, segs: [{ kind: 'straight', studs: 26 }] }] },
  // (its mirror image)
  'Narrow-gauge crossing 22.5° right': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: -12, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'B', x: -4.974885, y: -12.010434, heading: -22.5, segs: [{ kind: 'straight', studs: 26 }] }] },
  'Narrow-gauge crossing 33.75° left': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: -8, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'B', x: 5.555702, y: -8.314696, heading: 33.75, segs: [{ kind: 'straight', studs: 20 }] }] },
  // (its mirror image)
  'Narrow-gauge crossing 33.75° right': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: -8, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'B', x: -5.555702, y: -8.314696, heading: -33.75, segs: [{ kind: 'straight', studs: 20 }] }] },
  // (the R104 wye with the reference's two curves after each branch, which bring it back in line: R104 for 15.75 degrees out, then R117 for
  // 7.338 and R90 for 8.412 back; the tracks end 16 studs apart (8 between them), 56.04 on)
  'Wye R104, 8-stud gap': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 15.75 }, { kind: 'curve', radius: 117, angle: -7.338 }, { kind: 'curve', radius: 90, angle: -8.412 }], throwSide: 'right' }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -15.75 }, { kind: 'curve', radius: 117, angle: 7.338 }, { kind: 'curve', radius: 90, angle: 8.412 }], throwSide: 'right' }] },
  // (the R40 switch on a dual-gauge straight, the narrow gauge going straight on: the branch (standard gauge only) leaves on the third rail's
  // side, its inner rail crossing the third rail past the blades; the lever on the branch's side, as the reference's. Rigid blades: a sprung
  // blade's wider plate is cut back clear of the third rail, and the lip over its front has no room beside that rail (said, if chosen))
  'Dual gauge switch R40 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', bladeStyle: 'simple' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, dualGauge: true, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 33.75 }], throwSide: 'left' }] },
  // (its mirror image: the left-hand rail shared)
  'Dual gauge switch R40 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', bladeStyle: 'simple' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, dualGauge: true, dualShared: 'left', segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -33.75 }], throwSide: 'right' }] },
  // (the narrow gauge leaving a dual-gauge track, the reference's turnout: no points, fixed rails. The narrow track (a
  // route of its own gauge) starts within the standard one's end, a stud to the side: sharing its rail on that side,
  // as the dual-gauge track before it. One end connector there, with a rail end for the narrow gauge's other rail
  // (route.ts hostedEnds). The narrow gauge's wheels follow their own rails off; the standard gauge's go straight on)
  'Dual gauge turnout R36 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Standard', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 20 }] }, { name: 'Narrow', x: -1, y: 0, heading: 0, gaugeStuds: 2, segs: [{ kind: 'curve', radius: 36, angle: 33.75 }] }] },
  'Dual gauge turnout R36 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Standard', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 20 }] }, { name: 'Narrow', x: 1, y: 0, heading: 0, gaugeStuds: 2, segs: [{ kind: 'curve', radius: 36, angle: -33.75 }] }] },
  // (the narrow gauge moved from the middle to one side, to share that side's rail, over 16 studs: two R64.25 curves
  // of 7.153 degrees, a stud across in all; both its ends within the standard track's)
  'Dual gauge slide, centre to left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Standard', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'Narrow', x: 0, y: 0, heading: 0, gaugeStuds: 2, segs: [{ kind: 'curve', radius: 64.249, angle: 7.153 }, { kind: 'curve', radius: 64.249, angle: -7.153 }] }] },
  'Dual gauge slide, centre to right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Standard', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'Narrow', x: 0, y: 0, heading: 0, gaugeStuds: 2, segs: [{ kind: 'curve', radius: 64.249, angle: -7.153 }, { kind: 'curve', radius: 64.249, angle: 7.153 }] }] },
  // (narrow-gauge points on dual-gauge track: the narrow gauge drawn as a route of its own within the standard one, a
  // stud to the side (sharing that side's rail), and its branch leaving on that side. One moving blade, by the narrow
  // gauge's own rail; the shared rail is fixed, the branch's flangeway cut through it, so standard-gauge trains run
  // straight on however the points are set. Rigid blades: a sprung one's plate has no room beside the standard rails)
  'Dual gauge switch R36, narrow gauge branch, left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', bladeStyle: 'simple' }, routes: [{ name: 'Standard', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Narrow', x: -1, y: 0, heading: 0, gaugeStuds: 2, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: -1, y: 0, heading: 0, gaugeStuds: 2, segs: [{ kind: 'curve', radius: 36, angle: 33.75 }] }] },
  'Dual gauge switch R36, narrow gauge branch, right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', bladeStyle: 'simple' }, routes: [{ name: 'Standard', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Narrow', x: 1, y: 0, heading: 0, gaugeStuds: 2, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 1, y: 0, heading: 0, gaugeStuds: 2, segs: [{ kind: 'curve', radius: 36, angle: -33.75 }] }] },
  // (dual-gauge track parting into its two gauges: GAUGE_SPLITS)
  ...GAUGE_SPLITS,
  // (a narrow-gauge branch off dual-gauge track that carries on: DUAL_BRANCHES)
  ...DUAL_BRANCHES,
  // (the reference range's plain track: templates-ref1.ts)
  ...REF1_PLAIN, ...REF1_SETS, ...REF_KITS, ...REF_COMBOS, ...REF_LOOPS,
  // (BrickTracks' range: templates-bricktracks.ts)
  ...BRICKTRACKS_PARTS, ...BRICKTRACKS_SETS,
  // (the printed monorail ranges: templates-monorail.ts)
  ...MONO_TRACKWORK,
  // (the second maker's range: templates-4dbrix.ts)
  ...RANGE2,
};
// (the TrixBrix trackwork group copies the reference range: its switches' lever housing the reference's cross-bar, 16 studs
// with a 4 x 3 stud block at each end. Not where two tracks run side by side at the throw (the crossovers, the slips: the
// bar would reach the other track), nor narrow or dual gauge (the reference's bar there not checked))
for (const n of TEMPLATE_GROUPS.find(([g]) => g === 'TrixBrix trackwork')![1]) {
  const d = TEMPLATES[n];
  if (d && !/slip|crossover|narrow-gauge|dual gauge/i.test(n) && d.options?.leverHousing === undefined) TEMPLATES[n] = { ...d, options: { ...d.options, leverHousing: 'crossbar' } };
}
