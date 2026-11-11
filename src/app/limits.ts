// The ranges of the numbers typed into the route cards, the Tables panel and the Trackwork panel (the settings'
// are with them, settings.ts): each field shows its range and takes nothing outside it, and a design opened from a
// file is held to the same (a straight a million studs long, typed or in a file, was a build that never ended).
import type { Design } from './design';
import { clampOwn } from './routeown';

/** [least, most, default] */
export type Range = readonly [min: number, max: number, def: number];
export const LIMITS = {
  /** a straight's length, studs (2000: 16 m) */
  straight: [0, 2000, 16],
  /** a curve's radius, studs (the curves there are run 24 + 8k, to 1000) */
  radius: [24, 1000, 40],
  /** a monorail curve's radius, studs (LEGO's points and short curve are R22; printed monorail curves go down to R4) */
  monoRadius: [4, 1000, 28],
  /** a curve's angle, degrees, + left (a whole turn at most a piece: a helix is curve after curve) */
  angle: [-360, 360, 22.5],
  /** a route's start, studs from the plan's middle (10000: 80 m) */
  start: [-10000, 10000, 0],
  heading: [-360, 360, 0],
  /** a route's height and end height, plates (250: 80 cm) */
  plates: [0, 250, 0],
  /** a route's own gauge, studs between its rails (as the design's: Settings › Track › Gauge) */
  gauge: [2, 10, 4],
  /** a parallel track's distance from its route, studs centre to centre (8 and 16 are the usual) */
  spacing: [6, 200, 16],
  /** a table's place and corners, studs */
  tablePlace: [-10000, 10000, 0],
  tableSize: [1, 2000, 32],
  tableRadius: [0, 2000, 32],
  tableAngle: [-360, 360, 0],
  /** (Trackwork) a check rail's or flangeway cut's end longer (+) or shorter, studs; points moved along, studs */
  twEnd: [-16, 16, 0],
  twGrooveEnd: [0, 16, 0],
  twToe: [-16, 16, 0],
  /** a check rail moved in from its rail, mm */
  twShift: [-3, 3, 0],
  /** a lever out past the track, studs (as far as it can be dragged) */
  twLeverOut: [0, 10, 1],
} as const satisfies Record<string, Range>;

/** A route's curve radius range, studs: a monorail beam's curves go down to R4, a train's to R24. */
export const radiusRange = (r: { system?: 'train' | 'monorail' }): Range => (r.system === 'monorail' ? LIMITS.monoRadius : LIMITS.radius);
export const clamp = (v: number, r: Range) => Math.min(r[1], Math.max(r[0], v));
/** A range as a field says it: "Range 0 to 2000, default 16." */
export const rangeText = (r: Range) => `Range ${r[0]} to ${r[1]}, default ${r[2]}.`;

/** A design's numbers held to their ranges, in place (a file's, or the browser's kept one): its routes' pieces, starts, heights and own settings, its tables. Returns it. */
export function clampDesign(d: Design): Design {
  for (const r of d.routes) {
    r.x = clamp(r.x, LIMITS.start); r.y = clamp(r.y, LIMITS.start); r.heading = clamp(r.heading, LIMITS.heading);
    if (typeof r.gaugeStuds === 'number') r.gaugeStuds = clamp(Math.round(r.gaugeStuds), LIMITS.gauge);
    if (typeof r.monoHeight === 'number') r.monoHeight = clamp(r.monoHeight, LIMITS.plates);
    if (typeof r.monoHeightEnd === 'number') r.monoHeightEnd = clamp(r.monoHeightEnd, LIMITS.plates);
    // (its own settings' numbers, as the Settings panel holds the design's: routeown.ts)
    if (r.own) clampOwn(r.own);
    for (const st of r.stretches ?? []) clampOwn(st.own);
    for (const sg of r.segs) {
      if (sg.kind === 'straight') sg.studs = clamp(sg.studs, LIMITS.straight);
      else { sg.radius = clamp(sg.radius, radiusRange(r)); sg.angle = clamp(sg.angle, LIMITS.angle); }
    }
  }
  for (const t of d.tables ?? []) {
    if (t.shape === 'rect') { t.x = clamp(t.x, LIMITS.tablePlace); t.y = clamp(t.y, LIMITS.tablePlace); t.w = clamp(t.w, LIMITS.tableSize); t.h = clamp(t.h, LIMITS.tableSize); }
    else if (t.shape === 'arc') { t.cx = clamp(t.cx, LIMITS.tablePlace); t.cy = clamp(t.cy, LIMITS.tablePlace); t.r0 = clamp(t.r0, LIMITS.tableRadius); t.r1 = clamp(t.r1, LIMITS.tableRadius); t.a0 = clamp(t.a0, LIMITS.tableAngle); t.a1 = clamp(t.a1, LIMITS.tableAngle); }
    else t.pts = t.pts.map(([x, y]) => [clamp(x, LIMITS.tablePlace), clamp(y, LIMITS.tablePlace)]);
  }
  return d;
}
