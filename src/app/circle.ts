// A full circle in one step: one closed route of equal curves, one for each piece it is made of, and what a piece
// means for printing (its size and whether it fits the bed, turned any way). Pure: the Full circle panel in main.ts shows it.
import { type Design, type DRoute, OPTION_DEFAULTS, STUD } from './design';
import { clamp, LIMITS } from './limits';
import { routesBox } from '../route/route';
import { STD_CURVES } from './build';
import { toRoutes } from './design';
import { bedFit, END_REACH, tightBox, trackOutline } from '../geom/bedfit';

export const PIECES = [4, 128, 16] as const;
/** The usual pieces round a circle: R56 and smaller 16 of 22.5° (as LEGO's R40 and BrickTracks' R56 are sold), R72 to R120 32 of 11.25°, larger 64 of 5.625°. */
export const defaultPieces = (radius: number) => (radius <= 56 ? 16 : radius <= 120 ? 32 : 64);
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
  /** the piece's length and width, mm: its tightest box, end connectors and all */
  length: number; width: number;
  /** along the bed, either way round; only corner to corner (the build turns its file so); no way */
  fit: 'fits' | 'diagonal' | 'no';
  text: string;
}
/** The track's base reaches this far each side of a centre line, mm: the sleepers, or the ballast's widest layer (as the build's bandOf). */
export const bandHalf = (gaugeStuds: number, ballast: 'none' | 'ballast' | 'buddy') => {
  const sleeper = (gaugeStuds + 1) * STUD + 24;
  return (ballast === 'buddy' ? sleeper + 32 : ballast === 'ballast' ? sleeper + 16 : sleeper) / 2;
};

/** One piece's outline in plan, mm: its base (the sleepers, or the ballast's widest layer) round its arc, and its track's ends with their connectors. */
export const pieceOutline = (radius: number, pieces: number, gaugeStuds: number, ballast: 'none' | 'ballast' | 'buddy') =>
  trackOutline(radius * STUD, (2 * Math.PI * radius * STUD) / pieces, bandHalf(gaugeStuds, ballast), bandHalf(gaugeStuds, 'none'), END_REACH);
/**
 * One piece of a circle: its size in mm (its tightest box) and whether it fits the bed, judged as the build judges every
 * part (geom/bedfit.ts): turned any way, corner to corner too.
 */
export function pieceFit(radius: number, pieces: number, o: { gaugeStuds?: number; ballast?: 'none' | 'ballast' | 'buddy'; printBedX?: number; printBedY?: number }): PieceFit {
  const pts = pieceOutline(radius, pieces, o.gaugeStuds ?? 4, o.ballast ?? OPTION_DEFAULTS.ballast);
  const [length, width] = tightBox(pts).size;
  const bx = o.printBedX ?? OPTION_DEFAULTS.printBedX, by = o.printBedY ?? OPTION_DEFAULTS.printBedY;
  // (straight: its tightest box lies along the bed; diagonal: only corner to corner)
  const fit = (length <= bx && width <= by) || (length <= by && width <= bx) ? 'fits' : bedFit(pts, bx, by).fits ? 'diagonal' : 'no';
  const size = `${length.toFixed(1)} × ${width.toFixed(1)} mm`;
  const text = fit === 'fits' ? `Each piece is about ${size}: fits the ${bx} × ${by} mm bed.`
    : fit === 'diagonal' ? `Each piece is about ${size}: fits the ${bx} × ${by} mm bed turned diagonally. Its file comes turned that way already.`
    : `Each piece is about ${size}: doesn't fit the ${bx} × ${by} mm bed, however it's turned. Use more pieces.`;
  return { length, width, fit, text };
}
