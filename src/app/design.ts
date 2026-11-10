// The editor's document: routes in studs and degrees, as people enter them,
// and their conversion to the solver's routes in mm.
import { type Table, tableOf } from './tables';
import { clampDesign } from './limits';
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
  /** The running rail both gauges share, right or left of the route as drawn (dual_shared). */
  dualShared?: 'right' | 'left';
  /** Ends of the route as drawn that meet plain track: the third rail stops short there (dual_plain_ends). */
  dualPlainEnds?: RouteEnds;
  /** What runs on it: train track (left out: train), or LEGO monorail beam. */
  system?: 'train' | 'monorail';
  /** (monorail) the beam's height off the baseplate, in plates (3.2 mm); left out: the supports' height (Settings › Monorail), or on the baseplate without supports */
  monoHeight?: number;
  /** (monorail) its height at its end, in plates: it ramps from monoHeight to this, easing in and out (left out: level) */
  monoHeightEnd?: number;
}
/** The extra rails' settings left out of a route (straight.scad's defaults). */
export const RAIL_DEFAULTS = {
  guardRailEnds: 'none' as RouteEnds, guardRailGapStuds: 0.8, guardRailTaperStuds: 8, guardRailTaperShape: 'straight' as 'straight' | 'curve', guardRailNoseRampStuds: 1.5,
  dualGaugeStuds: 2, dualShared: 'right' as 'right' | 'left', dualPlainEnds: 'none' as RouteEnds,
};
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
}

/** Hand edits (each also says where on its route it is, on: twfollow.ts): check rails lengthened (+) or shortened (-) at each end, moved, or taken out; flangeway cuts lengthened; points moved along, taken out or forced; levers moved. */
export interface Trackwork {
  check?: Record<string, { d0?: number; d1?: number; shift?: number; off?: boolean; on?: TwAnchor }>;
  groove?: Record<string, { d0?: number; d1?: number; on?: TwAnchor }>;
  /** each points set (by its toe): moved along (mm); taken out (off: no points, both routes' rails run through as fixed track); routes
   * taken out of it (drop, by id: a three-way's branch, leaving a two-way); or forced where a route meets another a hair off (force) */
  points?: Record<string, { toe?: number; off?: boolean; drop?: string[]; force?: boolean; on?: TwAnchor }>;
  /** each points set's lever, moved on the plan: its side, how far out (lever offset, mm), and how far along (its tines' length, mm) */
  throw?: Record<string, { side?: 'left' | 'right'; leverOffset?: number; springLength?: number; on?: TwAnchor }>;
}
/** Where on the track a hand edit is, so it follows its track when that's moved (twfollow.ts): the route by name, from its start or end, mm along, mm to the right of its centre line. The build goes by the edit's key alone. */
export type TwAnchor = [route: string, from: 's' | 'e', along: number, right: number];

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
  /** Underside: hollow with anti-stud tubes at the edges and every 4 studs (default), or a square socket at every stud. */
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
  /** Monorail points: how far the frame slides (mm), the clearance round it (mm). */
  monoSwitchTravel?: number; monoSwitchFit?: number;
  /** Monorail supports (monorail_support.scad): one every this many studs along the beam (0: none); their height in bricks and plates; base size (studs); anti-stud underside; studs round the base; closed frame. */
  monoSupportStuds?: number; monoSupportBricks?: number; monoSupportPlates?: number; monoSupportBaseXStuds?: number; monoSupportBaseYStuds?: number;
  monoSupportAntistud?: boolean; monoSupportBaseStuds?: boolean; monoSupportSolid?: boolean;
  /** Banked curves: the shortest ramp from level to the full bank, studs (curves.scad's superelevation_ramp_studs), lengthened to keep the outer rail's climb within 1 in bankClimb; ramps on the straights either side ('straight') or inside the curve ('curve', as curves.scad's pieces). */
  bankRampStuds?: number; bankClimb?: number; bankRampAt?: 'straight' | 'curve';
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
    return { ...r, name: typeof r.name === 'string' ? r.name : '' } as unknown as DRoute;
  });
  const d = { ...v, version: 1, gaugeStuds: fin(v.gaugeStuds) ? v.gaugeStuds : 4, routes } as Record<string, unknown>;
  if (typeof d.name !== 'string') delete d.name;
  // (a setting that's not the kind of thing it should be, a number where a choice goes: left out, so its default)
  if (obj(d.options)) d.options = Object.fromEntries(Object.entries(d.options).filter(([k, x]) => (k in OPTION_DEFAULTS ? typeof x === typeof (OPTION_DEFAULTS as unknown as Record<string, unknown>)[k] : ['string', 'number', 'boolean'].includes(typeof x)) && (typeof x !== 'number' || fin(x))));
  else delete d.options;
  // (each edit's place on its route, where it isn't one, left out: it's worked out again from where the edit is)
  const anchor = (a: unknown) => Array.isArray(a) && a.length === 4 && typeof a[0] === 'string' && (a[1] === 's' || a[1] === 'e') && fin(a[2]) && fin(a[3]);
  if (obj(d.trackwork)) d.trackwork = Object.fromEntries(Object.entries(d.trackwork).filter(([, g]) => obj(g)).map(([k, g]) => [k, Object.fromEntries(Object.entries(g as object).filter(([, e]) => obj(e)).map(([key, e]) => [key, 'on' in e && !anchor(e.on) ? Object.fromEntries(Object.entries(e).filter(([f]) => f !== 'on')) : e]))]));
  else delete d.trackwork;
  if (Array.isArray(d.tables)) {
    // (a table with no shape, where its numbers say what it is: that shape; else left out, tables.ts tableOf)
    const tables = d.tables.map(tableOf).filter((t): t is Table => !!t);
    if (tables.length) d.tables = tables; else delete d.tables;
  } else delete d.tables;
  // (its numbers held to their ranges, as the fields hold what's typed: limits.ts)
  return upgradeDesign(clampDesign(d as unknown as Design));
}
export const OPTION_DEFAULTS: PieceOptions = {
  throwSide: 'auto', leverOffset: 8, pointThrow: 3, pointClearance: 0.3, springPreload: 1, springThickness: 0.9, springLength: 40,
  flangeway: 3, flangewayDepth: 3, checkRailLen: 30, checkRailW: 1, checkRailFlare: 1.5, printBedX: 256, printBedY: 256, baseplate: 0, baseplateX: 0, baseplateY: 0, ballast: 'none', bottomStyle: 'antistud', joint: 'lego', pointsModule: 'built-in', endSupports: true, tongueRails: 'all', grip: 'edges', pointsPieces: 1, pointBlades: 2, throwStyle: 'built-in', mechStyle: 'plates', curveStuds: 'follow',
  throwAction: 'detent', bladeStyle: 'sprung', bladeLip: 'pin', sleepers: 'sleepers', undersideGrid: 'baseplate', splitTrack: 'lengths', pieceLengthStuds: 16, studsAtCuts: 'off', legoTrack: 'lego', axleStuds: 2, sleeperWidthStuds: 2, sleeperGapStuds: 2, studFit: 0.18, antistudFit: 0.06,
  bladeDiscD: 14, throwBallast: false, axleHoles: false, pegOnBallast: false,
  bufferStyle: 'frame', bufferPostPlates: 8, bufferBeamBottom: 2, bufferBeamTop: 12, bufferPinHoles: true,
  trackBallast: 'together', trackFitTol: 0.2, labelText: '', labelSize: true, labelGauge: false, labelParts: true,
  monoEndStuds: 'side', monoAxleHoles: true, monoLegoAntistud: false, monoAxleLengthStuds: 2, monoHoleFit: 0.1, monoLabels: 'name', monoSwitchTravel: 27, monoSwitchFit: 0.3,
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

export function toRoutes(d: Design): Route[] {
  return d.routes.map((r, i) => {
    const rolls = bankRolls(d, r).rolls;
    const rt: Route = {
      id: r.name || String(i),
      throwSide: r.throwSide,
      ...(r.system === 'monorail' && r.monoHeight !== undefined && { elev: r.monoHeight * 3.2, ...(r.monoHeightEnd !== undefined && { elevEnd: r.monoHeightEnd * 3.2 }) }),
      ...(r.system !== 'monorail' && ((r.monoHeight ?? 0) > 0 || (r.monoHeightEnd ?? 0) > 0) && { grade: [(r.monoHeight ?? 0) * 3.2, (r.monoHeightEnd ?? r.monoHeight ?? 0) * 3.2] as [number, number] }),
      start: [r.x * STUD, r.y * STUD, r.heading],
      segments: r.segs.map((sg, k): Segment => {
        const out: Segment = sg.kind === 'straight'
          ? { kind: 'straight', length: sg.studs * STUD }
          : { kind: 'arc', radius: sg.radius * STUD, angle: sg.angle };
        if (rolls[k]) out.roll = rolls[k];
        return out;
      }),
    };
    // (its extra rails, only if it has any: a route without them is as it always was)
    if (r.guardRails || r.dualGauge) {
      const v = { ...RAIL_DEFAULTS, ...Object.fromEntries(Object.entries(r).filter(([, x]) => x !== undefined)) } as typeof RAIL_DEFAULTS & DRoute, len = routeLength(rt);
      const extra: ExtraRails = {
        guard: !!r.guardRails, guardEnds: v.guardRailEnds, guardGapStuds: v.guardRailGapStuds, guardTaperStuds: v.guardRailTaperStuds, guardShape: v.guardRailTaperShape, guardRampStuds: v.guardRailNoseRampStuds,
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
export function bankRolls(d: Design, r: DRoute): { rolls: (Roll | undefined)[]; warnings: string[] } {
  const segs = r.segs, n = segs.length, warnings: string[] = [];
  const v = segs.map((sg) => (sg.kind === 'curve' && sg.bank ? Math.sign(sg.angle) * Math.min(Math.max(sg.bank, 0), BANK_MAX) : 0));
  if (isMono(r) || !v.some((x) => x !== 0)) return { rolls: segs.map(() => undefined), warnings }; // (monorail: never banked)
  const o = { ...OPTION_DEFAULTS, ...d.options };
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
const leversAt = (sets: [number, number, 'left' | 'right'][]): NonNullable<Trackwork['throw']> =>
  Object.fromEntries(sets.map(([x, y, side]) => [`${Math.round(x * STUD)},${Math.round(y * STUD)}`, { side }]));
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

/** Starting points for a design. */
/** The Templates list's groups (in order), each its templates by name. */
export const TEMPLATE_GROUPS: [string, string[]][] = [
  ['Crossings', ['90° crossing', '22.5° crossing', 'Double slip (22.5°)', 'Double slip (45°, R40)', 'Crossing on a curve']],
  ['Switches', ['Left switch (LEGO)', 'Right switch (LEGO)', 'Left switch (BrickTracks R104)', 'Right switch (BrickTracks R104)', 'Wye switch', 'Three-way switch (one throw)', 'Three-way switch (tandem, two throws)']],
  ['Layouts', ['Oval (LEGO R40)', 'Crossover (R40)', 'Double crossover (R56)', 'Yard ladder (R40)', 'Yard (R56)', 'X yard (6 tracks, single slips)', 'Wye with a crossover', 'Double-track return loop (turning right)', 'Double-track return loop (turning left)']],
  ['Features', ['Grade up at 2.5%', 'Helix (R104, two turns)', 'Siding ending in a buffer stop', 'Bridge with guard rails', 'Dual gauge track', 'Dual gauge crossing 90°', 'Dual gauge crossing 45°', 'Banked curve', 'Crossing on sleepers']],
  ['Monorail', ['Monorail oval on supports', 'Monorail ramp (as LEGO\'s)', 'Monorail switch (experimental)', 'Monorail level crossing (experimental)']],
  ['Reference trackwork', ['Switch R40 left', 'Switch R40 right', 'Switch R40 left, 28-stud straight', 'Switch R40 right, 28-stud straight', 'Yard switch R40 left', 'Yard switch R40 right', 'Switch R56 left', 'Switch R56 right', 'Switch R72 left', 'Switch R72 right', 'Switch R104 left', 'Switch R104 right', 'Switch R104 left, lever on the straight side', 'Switch R104 right, lever on the straight side', 'Switch R120 left', 'Switch R120 right', 'Switch R148 left', 'Switch R148 right', 'Switch R148 left, lever on the straight side', 'Switch R148 right, lever on the straight side', 'Curved switch R40 45° left', 'Curved switch R40 45° right', 'Curved switch R40 90° left', 'Curved switch R40 90° right', 'Curved switch R56 90° left', 'Curved switch R56 90° right', 'Curved switch R104 90° left', 'Curved switch R104 90° right', 'Wye R40', 'Wye R40, 8-stud spacing', 'Wye R104', 'Wye R40 left, R56 right', 'Wye R56 left, R40 right', 'Wye R104 left, R120 right', 'Wye R120 left, R104 right', 'Three-way R40', 'Three-way R104', 'Switch to the next track, no gap, left', 'Switch to the next track, no gap, right', 'Switch, 2-stud gap, left', 'Switch, 2-stud gap, right', 'Switch, 4-stud gap, left', 'Switch, 4-stud gap, right', 'Three-way, no gap', 'Three-way, 2-stud gap', 'Three-way, 4-stud gap', 'Crossing 90°, 8 studs', 'Crossing 45° left', 'Crossing 45° right', 'Crossing 45°, 27 studs', 'Crossing 22.5° left', 'Crossing 22.5° right', 'Star crossing 22.5°', 'Curved crossing R24', 'Curved crossing R40', 'Curved crossing R56', 'Curved crossing R72', 'Curved crossing R88', 'Curved crossing R104', 'Crossing of two R120 curves', 'Pass-through crossing R56 left', 'Pass-through crossing R72 (A) left', 'Pass-through crossing R72 (B) left', 'Pass-through crossing R120 left', 'Pass-through crossing R56 right', 'Pass-through crossing R72 (A) right', 'Pass-through crossing R72 (B) right', 'Pass-through crossing R120 right', 'T-junction core R56', 'Double slip R40 45°', 'Single slip R40 45°', 'Double crossover R40', 'Crossover, 4-stud gap, left', 'Crossover, 4-stud gap, right', 'Buffer stop', 'Narrow-gauge crossing 90°', 'Narrow-gauge buffer stop', 'Narrow-gauge switch R36 left', 'Narrow-gauge switch R36 right', 'Narrow-gauge switch R48 left', 'Narrow-gauge switch R48 right', 'Narrow-gauge switch R84 left', 'Narrow-gauge switch R84 right', 'Narrow-gauge wye R36', 'Narrow-gauge switch R36 left, lever on the branch side', 'Narrow-gauge switch R36 right, lever on the branch side', 'Narrow-gauge double crossover R36', 'Narrow-gauge crossing 22.5° left', 'Narrow-gauge crossing 22.5° right', 'Narrow-gauge crossing 33.75° left', 'Narrow-gauge crossing 33.75° right', 'Wye R104, 8-stud gap']],
];
export const TEMPLATES: Record<string, Design> = {
  '90° crossing': { version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: -8, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'B', x: 8, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 16 }] },
  ] },
  '22.5° crossing': { version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: -24, heading: 0, segs: [{ kind: 'straight', studs: 48 }] },
    { name: 'B', x: 24 * sin(22.5), y: -24 * cos(22.5), heading: 22.5, segs: [{ kind: 'straight', studs: 48 }] },
  ] },
  // (as the reference double slip R104: 40 studs, the tracks crossing at 22.5 degrees, each slip road an R40 curve
  // leaving one track 7.96 studs before the crossing and joining the other 7.96 studs after it; the points are
  // in the middle, their blades side by side. One blade a set (single point): blades on top fit between its rails;
  // with two, they're built on tines under the bed)
  // (its levers as the reference's: each set's outside, beside its points on the side away from the other track (two
  // each side), so its slider runs out from its own points, not under the crossing to the other side. A pair's sliders,
  // both near the crossing's end, are staggered, one nearer its toes (network.ts). Not nail switches, as it was: the
  // middle points are too close for their springs, each set's lying where the next set's blade plate is)
  'Double slip (22.5°)': { version: 1, gaugeStuds: 4, options: { pointBlades: 1 },
    trackwork: { throw: leversAt([[0, -SLIP_LEAD, 'left'], [SLIP_LEAD * sin(22.5), -SLIP_LEAD * cos(22.5), 'right'], [0, SLIP_LEAD, 'left'], [-SLIP_LEAD * sin(22.5), SLIP_LEAD * cos(22.5), 'right']]) }, routes: [
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
  'Three-way switch (one throw)': { version: 1, gaugeStuds: 4, routes: [
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
  // (the monster X: six tracks into six, single slips where they cross)
  'X yard (6 tracks, single slips)': { version: 1, gaugeStuds: 4, options: { pointBlades: 1, ballast: 'ballast' }, routes: [{"name": "T1", "x": 0, "y": 0, "heading": 0, "segs": [{"kind": "straight", "studs": 288}]}, {"name": "T2", "x": 16, "y": 0, "heading": 0, "segs": [{"kind": "straight", "studs": 288}]}, {"name": "T3", "x": 32, "y": 0, "heading": 0, "segs": [{"kind": "straight", "studs": 288}]}, {"name": "T4", "x": 48, "y": 0, "heading": 0, "segs": [{"kind": "straight", "studs": 288}]}, {"name": "T5", "x": 64, "y": 0, "heading": 0, "segs": [{"kind": "straight", "studs": 288}]}, {"name": "T6", "x": 80, "y": 0, "heading": 0, "segs": [{"kind": "straight", "studs": 288}]}, {"name": "X1", "x": 0, "y": 26.744571, "heading": 0, "segs": [{"kind": "curve", "radius": 104.0, "angle": -22.5}, {"kind": "straight", "studs": 167.676302}, {"kind": "curve", "radius": 104.0, "angle": 22.5}]}, {"name": "X2", "x": 80, "y": 26.744571, "heading": 0, "segs": [{"kind": "curve", "radius": 104.0, "angle": 22.5}, {"kind": "straight", "studs": 167.676302}, {"kind": "curve", "radius": 104.0, "angle": -22.5}]}, {"name": "X1-on2", "x": 16, "y": 78.10238, "heading": 0, "segs": [{"kind": "curve", "radius": 40.0, "angle": -22.5}]}, {"name": "X1-off2", "x": 12.955181, "y": 78.708032, "heading": -22.5, "segs": [{"kind": "curve", "radius": 40.0, "angle": 22.5}]}, {"name": "X2-on2", "x": 16, "y": 193.984631, "heading": 0, "segs": [{"kind": "curve", "radius": 40.0, "angle": 22.5}]}, {"name": "X2-off2", "x": 19.044819, "y": 194.590283, "heading": 22.5, "segs": [{"kind": "curve", "radius": 40.0, "angle": -22.5}]}, {"name": "X1-on3", "x": 32, "y": 116.729797, "heading": 0, "segs": [{"kind": "curve", "radius": 40.0, "angle": -22.5}]}, {"name": "X1-off3", "x": 28.955181, "y": 117.335449, "heading": -22.5, "segs": [{"kind": "curve", "radius": 40.0, "angle": 22.5}]}, {"name": "X2-on3", "x": 32, "y": 155.357214, "heading": 0, "segs": [{"kind": "curve", "radius": 40.0, "angle": 22.5}]}, {"name": "X1-on4", "x": 48, "y": 155.357214, "heading": 0, "segs": [{"kind": "curve", "radius": 40.0, "angle": -22.5}]}, {"name": "X1-off4", "x": 44.955181, "y": 155.962866, "heading": -22.5, "segs": [{"kind": "curve", "radius": 40.0, "angle": 22.5}]}, {"name": "X2-off4", "x": 51.044819, "y": 117.335449, "heading": 22.5, "segs": [{"kind": "curve", "radius": 40.0, "angle": -22.5}]}, {"name": "X1-on5", "x": 64, "y": 193.984631, "heading": 0, "segs": [{"kind": "curve", "radius": 40.0, "angle": -22.5}]}, {"name": "X1-off5", "x": 60.955181, "y": 194.590283, "heading": -22.5, "segs": [{"kind": "curve", "radius": 40.0, "angle": 22.5}]}, {"name": "X2-on5", "x": 64, "y": 78.10238, "heading": 0, "segs": [{"kind": "curve", "radius": 40.0, "angle": 22.5}]}, {"name": "X2-off5", "x": 67.044819, "y": 78.708032, "heading": 22.5, "segs": [{"kind": "curve", "radius": 40.0, "angle": -22.5}]}] },
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
  'Dual gauge track': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Dual', x: 0, y: 0, heading: 0, dualGauge: true, segs: [{ kind: 'straight', studs: 32 }, { kind: 'curve', radius: 56, angle: 45 }] },
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
  'Monorail switch (experimental)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Main', x: 0, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }] },
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
  // (40 studs; the branch an R104 curve of 22.5 degrees and a 0.2-stud straight, ending 40 on and 8 over; the lever on the branch side, 4.5 studs from the toe)
  'Switch R104 left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: 0.218121 }], throwSide: 'left' }] },
  // (its mirror image)
  'Switch R104 right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: 0.218121 }], throwSide: 'right' }] },
  // (as the R104 switch, its lever on the straight side (the reference's ground throw outside))
  'Switch R104 left, lever on the straight side': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: 0.218121 }], throwSide: 'right' }] },
  // (its mirror image)
  'Switch R104 right, lever on the straight side': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: 0.218121 }], throwSide: 'left' }] },
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
  'Three-way R104': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', threeWayLevers: 2 }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: 0.218121 }] }, { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: 0.218121 }] }] },
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
  // (a 40-stud straight crossed at its middle at 22.5 degrees, the other track's ends level with its ends, 8.28 studs over (to go with R104 switches))
  'Crossing 22.5° left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -20, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'B', x: -20, y: -8.284271, heading: -67.5, segs: [{ kind: 'straight', studs: 43.295688 }] }] },
  // (its mirror image)
  'Crossing 22.5° right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -20, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'B', x: -20, y: 8.284271, heading: -112.5, segs: [{ kind: 'straight', studs: 43.295688 }] }] },
  // (three tracks crossing at their middles: a 40-stud straight, and one each way at 22.5 degrees, their ends level with its ends)
  'Star crossing 22.5°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -20, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'B', x: -20, y: -8.284271, heading: -67.5, segs: [{ kind: 'straight', studs: 43.295688 }] }, { name: 'C', x: -20, y: 8.284271, heading: -112.5, segs: [{ kind: 'straight', studs: 43.295688 }] }] },
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
  // (as the 45-degree R40 double slip, its levers outside: each beside its points, on the side away from the other track)
  'Double slip R40 45°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: -16.568542, heading: 0, segs: [{ kind: 'straight', studs: 33.137085 }] }, { name: 'B', x: 11.715729, y: -11.715729, heading: 45, segs: [{ kind: 'straight', studs: 33.137085 }] }, { name: 'A to B', x: 0, y: -16.568542, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }] }, { name: 'B to A', x: 11.715729, y: -11.715729, heading: 45, segs: [{ kind: 'curve', radius: 40, angle: -45 }] }], trackwork: { throw: { '0,-133': { side: 'left' }, '94,-94': { side: 'right' }, '0,133': { side: 'left' }, '-94,94': { side: 'right' } } } },
  // (a 32-stud straight crossed at 45 degrees by another, and an R40 curve of 45 degrees from the other's end to its end; the levers outside, beside the points)
  'Single slip R40 45°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -1.125, y: 16, heading: -180, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'B', x: 10.590729, y: 12.284271, heading: 135, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Slip', x: 10.590729, y: 12.284271, heading: 135, segs: [{ kind: 'curve', radius: 40, angle: 45 }] }], trackwork: { throw: { '85,98': { side: 'left' }, '-9,-128': { side: 'right' } } } },
  // (two tracks 16 studs apart, 48 long, a crossover each way (two R40 curves of 36.87 degrees) crossing in the middle; the levers between the tracks)
  'Double crossover R40': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 8, y: -24, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }, { name: 'B', x: -8, y: -24, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }, { name: 'A to B', x: 8, y: -24, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -36.8699 }], throwSide: 'left' }, { name: 'B to A', x: -8, y: -24, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -36.8699 }, { kind: 'curve', radius: 40, angle: 36.8699 }], throwSide: 'right' }] },
  // (two tracks 12 studs apart (a 4-stud gap), the crossover in two halves: R35.86 for 30 degrees and 2.39 studs straight each, 40 studs along; each half's straight 24 studs, the second 16 on; the levers on the crossover's side)
  'Crossover, 4-stud gap, left': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'B', x: -12, y: 16, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Over', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 35.856, angle: 30 }, { kind: 'straight', studs: 4.784 }, { kind: 'curve', radius: 35.856, angle: -30 }], throwSide: 'left' }] },
  // (its mirror image)
  'Crossover, 4-stud gap, right': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'B', x: 12, y: 16, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }, { name: 'Over', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 35.856, angle: -30 }, { kind: 'straight', studs: 4.784 }, { kind: 'curve', radius: 35.856, angle: 30 }], throwSide: 'right' }] },
  // (a buffer stop at the end of 4 studs of track)
  'Buffer stop': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 4 }], endEnd: 'buffer' }] },
  // (narrow gauge: two 8-stud straights crossing square at their middles)
  'Narrow-gauge crossing 90°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print' }, routes: [{ name: 'A', x: -4, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 8 }] }, { name: 'B', x: 0, y: 4, heading: -180, segs: [{ kind: 'straight', studs: 8 }] }] },
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
};
