// (expert) The settings a track can have of its own, over the design's (DRoute.own): which they are, the values each
// may take, and a file's own settings read (what isn't one of them, or isn't a value it takes, left out). Plain data,
// no geometry: design.ts reads files with it; overrides.ts works out what is in force where.
import type { PieceOptions } from './design';

/**
 * The settings of a printed part: routes that are one part (they meet in points or a crossing, or lie side by side)
 * share them, the first such route with its own winning (overrides.ts partGroups).
 */
export const PART_KEYS = ['ballast', 'ballastLeftStuds', 'ballastRightStuds', 'ballastEnds', 'sleepers', 'sleeperWidthStuds', 'sleeperGapStuds', 'curveStuds', 'bottomStyle', 'undersideGrid', 'grip', 'legoTrack'] as const;
/** The settings of one track alone (its banked curves' ramps): each track its own, whatever it's one part with. */
export const BANK_KEYS = ['bankRampAt', 'bankRampStuds', 'bankClimb'] as const;
/** Every setting a track may have of its own. The rest are the design's: parts that meet, and the printer, must agree. */
export const ROUTE_KEYS = [...PART_KEYS, ...BANK_KEYS] as const;
export type RouteKey = (typeof ROUTE_KEYS)[number];
export type Own = Partial<Pick<PieceOptions, RouteKey>>;
export const isRouteKey = (k: string): k is RouteKey => (ROUTE_KEYS as readonly string[]).includes(k);

/** Each setting's name, as the Settings panel says it (settings.ts: a test holds them to it). */
export const OWN_LABELS: Record<RouteKey, string> = {
  ballast: 'Ballast', ballastLeftStuds: 'Ballast past the sleepers, left, studs', ballastRightStuds: 'Ballast past the sleepers, right, studs', ballastEnds: 'Ballast at a buffer stop', sleepers: 'Under the rails', sleeperWidthStuds: 'Sleeper width', sleeperGapStuds: 'Gap between sleepers, studs', curveStuds: 'Studs on the track',
  bottomStyle: 'Ballast underside', undersideGrid: 'Underside lined up with', grip: 'Grip on the baseplate', legoTrack: 'Bought track',
  bankRampAt: 'Bank ramps', bankRampStuds: 'Shortest bank ramp, studs', bankClimb: 'Steepest climb of the outer rail, 1 in',
};
/** The values a choice takes (settings.ts's choices: a test holds them to it). */
export const OWN_CHOICES: Partial<Record<RouteKey, readonly (string | number)[]>> = {
  ballast: ['none', 'ballast', 'buddy'], ballastEnds: ['square', 'stepped'], sleepers: ['bed', 'sleepers'], sleeperWidthStuds: [2, 1], curveStuds: ['grid', 'follow'], bottomStyle: ['antistud', 'float'],
  undersideGrid: ['baseplate', 'track'], grip: ['edges', 'all'], legoTrack: ['lego', 'lego-only', 'print'], bankRampAt: ['straight', 'curve'],
};
/** A number's range and step (settings.ts's: a test holds them to it). */
export const OWN_RANGES: Partial<Record<RouteKey, { min: number; max: number; step: number }>> = {
  sleeperGapStuds: { min: 1, max: 6, step: 1 }, ballastLeftStuds: { min: 0, max: 8, step: 1 }, ballastRightStuds: { min: 0, max: 8, step: 1 }, bankRampStuds: { min: 2, max: 200, step: 1 }, bankClimb: { min: 20, max: 1000, step: 10 },
};
/** What a setting is when neither the design nor the defaults say (the ones left out of the defaults: the build is keyed by what's set). */
export const OWN_UNSET: Partial<Record<RouteKey, string | number>> = { ballastLeftStuds: 1, ballastRightStuds: 1, ballastEnds: 'square' };
/** A number held to its range (whole where its step is): limits.ts clampDesign. */
export function clampOwn(own: Own): Own {
  for (const [k, r] of Object.entries(OWN_RANGES) as [RouteKey, { min: number; max: number; step: number }][]) {
    const v = own[k];
    if (typeof v === 'number') (own as Record<string, number>)[k] = Math.min(r.max, Math.max(r.min, r.step >= 1 ? Math.round(v) : v));
  }
  return own;
}

/** A file's own settings for a track: the ones a track may have, each a value it takes; nothing left: undefined. */
export function cleanOwn(v: unknown): Own | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (!isRouteKey(k)) continue;
    const ch = OWN_CHOICES[k];
    if (ch ? ch.includes(x as string | number) : typeof x === 'number' && Number.isFinite(x)) out[k] = x;
  }
  return Object.keys(out).length ? clampOwn(out as Own) : undefined;
}
