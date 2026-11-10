// A full circle in one step: one closed route of equal curves, one for each piece it is made of, and what a piece
// means for printing (its size and whether it fits the bed). Pure: the Full circle panel in main.ts shows it.
import { type Design, type DRoute, OPTION_DEFAULTS, STUD } from './design';
import { clamp, LIMITS } from './limits';
import { routesBox } from '../route/route';
import { STD_CURVES } from './build';
import { toRoutes } from './design';

export const PIECES = [4, 128, 16] as const;
/** The usual pieces round a circle: R40 and smaller 16 of 22.5°, R56 to R120 32 of 11.25°, larger 64 of 5.625°. */
export const defaultPieces = (radius: number) => (radius <= 40 ? 16 : radius <= 120 ? 32 : 64);
/** The angle of one piece, degrees. */
export const pieceAngle = (pieces: number) => 360 / pieces;
/** "32 pieces · 11.25° each" */
export const piecesText = (pieces: number) => `${pieces} pieces · ${+pieceAngle(pieces).toFixed(4)}° each`;
/** A whole number of pieces, 4 to 128 (anything else: the nearest). */
export const cleanPieces = (v: number) => Math.round(clamp(Number.isFinite(v) ? v : 16, PIECES));
export const cleanRadius = (v: number) => clamp(Number.isFinite(v) ? v : LIMITS.radius[2], LIMITS.radius);

/** How long one piece is along its centre line, studs. */
export const pieceStuds = (radius: number, pieces: number) => (2 * Math.PI * radius) / pieces;

/** The circle as a route: `pieces` equal curves, turning left (a segment boundary is where the build cuts). */
export function circleRoute(name: string, radius: number, pieces: number, at = { x: 0, y: 0, heading: 0 }): DRoute {
  const n = cleanPieces(pieces), r = cleanRadius(radius);
  return { name, ...at, segs: Array.from({ length: n }, () => ({ kind: 'curve' as const, radius: r, angle: 360 / n })) };
}

/**
 * Add a circle to a design, clear of the routes there are (below them, or at the origin). Pieces are cut where the
 * curves join; a curve longer than Piece length would be cut again, so Piece length (Settings) is raised to hold one
 * whole piece (up to its limit of 64 studs). Returns the new route's index.
 */
export function addCircle(d: Design, name: string, radius: number, pieces: number): number {
  const r = circleRoute(name, radius, pieces);
  if (d.routes.length) {
    const [cx0, , , cy1] = routesBox(toRoutes({ ...d, routes: [r] }), 0, 4).map((v) => v / STUD) as [number, number, number, number];
    const old = routesBox(toRoutes(d), 0, 4).map((v) => v / STUD) as [number, number, number, number];
    // (its box at the origin, then moved: its left edge on the others' left, its top 16 studs under their bottom)
    r.x = Math.round(old[0] - cx0); r.y = Math.round(old[1] - 16 - cy1);
  }
  d.routes.push(r);
  const o = { ...OPTION_DEFAULTS, ...d.options };
  // (a curve that's a bought piece is cut by its own angle: nothing to raise)
  const std = STD_CURVES.get(r.segs[0].kind === 'curve' ? r.segs[0].radius * STUD : 0);
  if (std !== undefined && Math.abs(std - 360 / r.segs.length) < 1e-6) return d.routes.length - 1;
  const need = Math.ceil(pieceStuds(r.segs[0].kind === 'curve' ? r.segs[0].radius : 0, r.segs.length) - 1e-9);
  if (o.splitTrack === 'lengths' && (o.pieceLengthStuds ?? 16) > 0 && need > (o.pieceLengthStuds ?? 16)) d.options = { ...d.options, pieceLengthStuds: Math.min(need, 64) };
  return d.routes.length - 1;
}

// ---------- what a piece means for the print bed ----------
export interface PieceFit {
  /** the piece's length (along its outer chord, with the end connectors) and width, mm */
  length: number; width: number;
  /** straight on the bed, or either way round; only diagonally; no way */
  fit: 'fits' | 'diagonal' | 'no';
  text: string;
}
/** The track's base reaches this far each side of a centre line, mm: the sleepers, or the ballast's widest layer (as the build's bandOf). */
export const bandHalf = (gaugeStuds: number, ballast: 'none' | 'ballast' | 'buddy') => {
  const sleeper = (gaugeStuds + 1) * STUD + 24;
  return (ballast === 'buddy' ? sleeper + 32 : ballast === 'ballast' ? sleeper + 16 : sleeper) / 2;
};
const END_CONNECTORS = 9;

/** Does a length × width rectangle go on a bed x × y turned by some angle between 0 and 90 degrees? (a degree at a time) */
function fitsTurned(l: number, w: number, bx: number, by: number) {
  for (let deg = 1; deg < 90; deg++) { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); if (l * c + w * s <= bx + 1e-9 && l * s + w * c <= by + 1e-9) return true; }
  return false;
}
/** Room kept on the bed all round, mm: the build cuts a part that has less (its joints stick out a little past the track). */
export const BED_MARGIN = 8;
/**
 * The largest box, in the plan's directions, that any of a circle's pieces fills (the build fits parts on the bed as they lie
 * on the plan, turned a quarter at most): the outer and inner arcs, and a connector's length past each end.
 */
function worstBox(R: number, bh: number, pieces: number): [number, number] {
  const a = (2 * Math.PI) / pieces, ext = END_CONNECTORS / 2 / R;
  let wx = 0, wy = 0, worst = 0;
  const steps = 24;
  for (let k = 0; k < pieces; k++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const t = k * a - ext + ((a + 2 * ext) * i) / steps;
      for (const r of [R - bh, R + bh]) { x0 = Math.min(x0, r * Math.cos(t)); x1 = Math.max(x1, r * Math.cos(t)); y0 = Math.min(y0, r * Math.sin(t)); y1 = Math.max(y1, r * Math.sin(t)); }
    }
    const w = x1 - x0, h = y1 - y0, m = Math.max(w, h);
    if (m > worst) { worst = m; wx = Math.max(w, h); wy = Math.min(w, h); }
  }
  return [wx, wy];
}
/** One piece of a circle: its size in mm and whether it fits the bed. */
export function pieceFit(radius: number, pieces: number, o: { gaugeStuds?: number; ballast?: 'none' | 'ballast' | 'buddy'; printBedX?: number; printBedY?: number }): PieceFit {
  const a = ((360 / pieces) * Math.PI) / 180, bh = bandHalf(o.gaugeStuds ?? 4, o.ballast ?? OPTION_DEFAULTS.ballast);
  const R = radius * STUD, ro = R + bh, ri = R - bh;
  const length = 2 * ro * Math.sin(a / 2) + END_CONNECTORS, width = ro - ri * Math.cos(a / 2);
  const bx = o.printBedX ?? OPTION_DEFAULTS.printBedX, by = o.printBedY ?? OPTION_DEFAULTS.printBedY;
  // (every piece, as it lies on the plan, in the bed with the margin, either way round: the build leaves it whole)
  const [wx, wy] = worstBox(R, bh, pieces), lo = Math.min(bx, by) - BED_MARGIN, hi = Math.max(bx, by) - BED_MARGIN;
  const straight = wx <= hi && wy <= lo;
  const fit = straight ? 'fits' : fitsTurned(length, width, hi, lo) ? 'diagonal' : 'no';
  const size = `${length.toFixed(1)} × ${width.toFixed(1)} mm`;
  const text = fit === 'fits' ? `Each piece is about ${size}: fits the ${bx} × ${by} mm bed.`
    : fit === 'diagonal' ? `Each piece is about ${size}: fits only turned diagonally. That isn't done automatically: the build cuts the pieces that don't fit.`
    : `Each piece is about ${size}: doesn't fit the ${bx} × ${by} mm bed. Use more pieces.`;
  return { length, width, fit, text };
}
