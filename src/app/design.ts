// The editor's document: routes in studs and degrees, as people enter them,
// and their conversion to the solver's routes in mm.
import type { Route, Segment } from '../route/route';
import { routeLength, routePose } from '../route/route';

export const STUD = 8;

export type DSeg =
  | { kind: 'straight'; studs: number }
  | { kind: 'curve'; radius: number; angle: number }; // radius in studs, angle signed (+ = left)

export interface DRoute {
  name: string; x: number; y: number; heading: number; segs: DSeg[]; // start in studs
  /** When this route branches off another (a switch): which side its lever goes (auto: the options' setting). */
  throwSide?: 'auto' | 'left' | 'right';
  /** What the route's start / end is: an ordinary end connector (default), or a buffer stop (buffer.scad: the rails run into two posts joined by a buffer beam, no connector). */
  startEnd?: 'connector' | 'buffer';
  endEnd?: 'connector' | 'buffer';
}
export interface Design {
  version: 1; gaugeStuds: number; routes: DRoute[];
  /** The design's name: the file names it saves and downloads under. */
  name?: string;
  /** Underside: hollow with anti-stud tubes at the edges and every 4 studs (default), or a square socket at every stud. */
  grip?: 'edges' | 'all';
  /** Switches' points: one part (both blades on one pivot) or two (each blade on its own, as the plate-style). */
  pointsPieces?: 1 | 2;
  /** The rest of the piece options (switch.scad's), each left out = its default. */
  options?: Partial<PieceOptions>;
  /** Hand edits to the trackwork the app works out, by where each item is (its middle, mm, "x,y"). */
  trackwork?: Trackwork;
}

/** Hand edits: check rails lengthened (+) or shortened (-) at each end, moved, or taken out; flangeway cuts lengthened; points moved along, taken out or forced; levers moved. */
export interface Trackwork {
  check?: Record<string, { d0?: number; d1?: number; shift?: number; off?: boolean }>;
  groove?: Record<string, { d0?: number; d1?: number }>;
  /** each points set (by its toe): moved along (mm); taken out (off: no points, both routes' rails run through as fixed track); routes
   * taken out of it (drop, by id: a three-way's branch, leaving a two-way); or forced where a route meets another a hair off (force) */
  points?: Record<string, { toe?: number; off?: boolean; drop?: string[]; force?: boolean }>;
  /** each points set's lever, moved on the plan: its side, how far out (lever offset, mm), and how far along (its tines' length, mm) */
  throw?: Record<string, { side?: 'left' | 'right'; leverOffset?: number; springLength?: number }>;
}

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
  /** How parts cut for the bed or the baseplates join: 'lego' rail-end tongues with a peg and C-clip (as LEGO track); 'dovetail' rail tongues with dovetails through the bed; 'butt' straight cuts, held only by the baseplate under them; 'ends' separate pieces joined by ordinary track ends, cut only where the tracks are clear of each other (the plate-style way). */
  joint?: 'lego' | 'dovetail' | 'butt' | 'ends' | 'axle';
  /** (prototype) The points: built into the one piece, their pockets through to the bottom (switch.scad's); on a solid floor, the pockets stopping on it ('floor'); or the piece in layers stacked from the top (the lower layer with the moving parts' pockets, the deck with the bed and rails over it, held by studs; needs ballast). */
  pointsModule?: 'built-in' | 'layers';
  /** Breakaway print supports under the rail-end tongues at each end (off: the slicer supports them). */
  endSupports?: boolean;
  /** The studs on the sleepers: on the baseplate's grid, or in rows following the track (as the OpenSCAD curves). */
  curveStuds?: 'grid' | 'follow';
  /** Where a part is cut: the rails with interlocking tongues (as LEGO track), or cut flat across (no overhangs, no supports to print). */
  cutRails?: 'tongues' | 'flat';
  /** The throw: 'bracket' (the plate-style: the lever on its own 3 x 3 stud bracket, on studs on the arm), 'built-in' (the ears part of the arm) or 'stand' (a switch stand, a ground throw as Caboose Industries': a handle swung over on an eccentric, locked at each end; plate-style points). */
  throwStyle?: 'bracket' | 'built-in' | 'stand';
  /** (plate-style points) What holds the points, and what a train trailing through them does: 'detent' (the lever's click), 'overcentre' (Peco's V spring: they snap over and stay), 'springback' (a spring switch: the blades give way and spring back). */
  throwAction?: 'detent' | 'overcentre' | 'springback';
  /** (plate-style points) The blades: 'simple', or 'prototype' (planed to a point, tight under the stock rail's undercut head, the tie bar at the points). */
  bladeStyle?: 'simple' | 'prototype';
  /** What keeps each blade's plate on its pin: a snap lip on the pin, or a little bracket over the plate pegged into the bed. */
  bladeHold?: 'lip' | 'bracket';
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
}
export const OPTION_DEFAULTS: PieceOptions = {
  throwSide: 'auto', leverOffset: 8, pointThrow: 3, pointClearance: 0.3, springPreload: 1, springThickness: 0.9, springLength: 40,
  flangeway: 3, flangewayDepth: 3, checkRailLen: 30, checkRailW: 1, checkRailFlare: 1.5, printBedX: 256, printBedY: 256, baseplate: 0, baseplateX: 0, baseplateY: 0, ballast: 'none', bottomStyle: 'antistud', joint: 'lego', pointsModule: 'built-in', endSupports: true, cutRails: 'tongues', throwStyle: 'built-in', mechStyle: 'plates', curveStuds: 'grid',
  throwAction: 'detent', bladeStyle: 'simple', sleepers: 'bed', sleeperWidthStuds: 2, sleeperGapStuds: 2, studFit: 0.18, antistudFit: 0.06,
  bladeDiscD: 14, throwBallast: false, axleHoles: false, pegOnBallast: false,
  bufferStyle: 'frame', bufferPostPlates: 8, bufferBeamBottom: 2, bufferBeamTop: 12, bufferPinHoles: true,
  trackBallast: 'together', trackFitTol: 0.2, labelText: '', labelSize: true, labelGauge: false, labelParts: true,
};

/** The buffer stops' positions (mm): the route ends set to end in one (by where they are, as routes are turned round and cut up). */
export function bufferEnds(d: Design): [number, number][] {
  const out: [number, number][] = [];
  toRoutes(d).forEach((rt, i) => {
    const r = d.routes[i];
    if (!rt.segments.length) return;
    if (r.startEnd === 'buffer') out.push([rt.start[0], rt.start[1]]);
    if (r.endEnd === 'buffer') { const p = routePose(rt, routeLength(rt)); out.push([p[0], p[1]]); }
  });
  return out;
}

export function toRoutes(d: Design): Route[] {
  return d.routes.map((r, i) => ({
    id: r.name || String(i),
    throwSide: r.throwSide,
    start: [r.x * STUD, r.y * STUD, r.heading],
    segments: r.segs.map((sg): Segment => (sg.kind === 'straight'
      ? { kind: 'straight', length: sg.studs * STUD }
      : { kind: 'arc', radius: sg.radius * STUD, angle: sg.angle })),
  }));
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

/** Starting points for a design. */
export const TEMPLATES: Record<string, Design> = {
  '90° crossing': { version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: -8, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'B', x: 8, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 16 }] },
  ] },
  '22.5° crossing': { version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: -24, heading: 0, segs: [{ kind: 'straight', studs: 48 }] },
    { name: 'B', x: 24 * sin(22.5), y: -24 * cos(22.5), heading: 22.5, segs: [{ kind: 'straight', studs: 48 }] },
  ] },
  'Crossing on a curve': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Curve', x: 0, y: -12, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 30 }] },
    { name: 'B', x: 12, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 24 }] },
  ] },
  // Switches: LEGO's (R40, out to 36.87 degrees and back to 22.5, so one more
  // R40 curve makes a parallel track 16 studs over), a wye and a three-way.
  'Left switch (LEGO)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }] },
  ] },
  'Right switch (LEGO)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -36.8699 }, { kind: 'curve', radius: 40, angle: 14.3699 }] },
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
  // (the first branch's rail runs on through the second points: their blades' plates are cut clear of it, the pin moved in)
  'Three-way switch (tandem, two throws)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 36 }] },
    { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 23 }] },
    { name: 'Right', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 14 }] },
  ] },
};
