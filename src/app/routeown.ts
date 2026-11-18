// (expert) The settings a track can have of its own, over the design's (DRoute.own): which they are, the values each
// may take, and a file's own settings read (what isn't one of them, or isn't a value it takes, left out). Plain data,
// no geometry: design.ts reads files with it; overrides.ts works out what is in force where.
import type { PieceOptions } from './design';

/**
 * The settings of a printed part: routes that are one part (they meet in points or a crossing, or lie side by side)
 * share them, the first such route with its own winning (overrides.ts partGroups).
 */
export const PART_KEYS = ['ballast', 'ballastLeftStuds', 'ballastRightStuds', 'ballastEnds', 'sleepers', 'sleeperWidthStuds', 'sleeperGapStuds', 'curveStuds', 'bottomStyle', 'undersideGrid', 'grip', 'legoTrack',
  // (the rest of what a part is made with: its check rails and flangeways, its buffer stops, what it stands on when raised, its label)
  'checkRailLen', 'checkRailW', 'checkRailFlare', 'flangeway', 'flangewayDepth', 'bufferStyle', 'bufferPostPlates', 'bufferBeamBottom', 'bufferBeamTop', 'bufferPinHoles', 'raisedOn',
  'labelText', 'labelSize', 'labelGauge', 'labelParts'] as const;
/** The part settings a route card shows under Bed and underside; the others under More of its own (MORE_KEYS, by group). */
export const BED_KEYS = ['ballast', 'ballastLeftStuds', 'ballastRightStuds', 'ballastEnds', 'sleepers', 'sleeperWidthStuds', 'sleeperGapStuds', 'curveStuds', 'bottomStyle', 'undersideGrid', 'grip'] as const;
export const MORE_KEYS = {
  check: ['checkRailLen', 'checkRailW', 'checkRailFlare', 'flangeway', 'flangewayDepth'],
  buffer: ['bufferStyle', 'bufferPostPlates', 'bufferBeamBottom', 'bufferBeamTop', 'bufferPinHoles'],
  raised: ['raisedOn'],
  labels: ['labelText', 'labelSize', 'labelGauge', 'labelParts'],
} as const;
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
  checkRailLen: 'Check rail length, studs', checkRailW: 'Check rail width, mm', checkRailFlare: 'Check rail end flare, mm', flangeway: 'Flangeway width, mm', flangewayDepth: 'Flangeway depth, mm',
  bufferStyle: 'Style', bufferPostPlates: 'Post height, plates', bufferBeamBottom: 'Beam bottom above the rails, mm', bufferBeamTop: 'Beam top above the rails, mm', bufferPinHoles: 'Pin holes in the posts', raisedOn: 'Raised track stands on',
  labelText: 'Label text', labelSize: 'Add the size (S16, R40 22.5°)', labelGauge: 'Add the gauge (Ln4)', labelParts: 'Number parts cut for the bed (#2)',
  bankRampAt: 'Bank ramps', bankRampStuds: 'Shortest bank ramp, studs', bankClimb: 'Steepest climb of the outer rail, 1 in',
};
/** A setting's name where its panel group isn't beside it to say what it's of (a warning, a list): "Buffer stop style" for Style. */
const OWN_NAMES: Partial<Record<RouteKey, string>> = { bufferStyle: 'Buffer stop style', bufferPostPlates: 'Buffer stop post height', bufferBeamBottom: 'Buffer stop beam bottom', bufferBeamTop: 'Buffer stop beam top', bufferPinHoles: 'Buffer stop pin holes',
  labelSize: 'Label: the size', labelGauge: 'Label: the gauge', labelParts: 'Label: part numbers' };
export const ownName = (k: RouteKey): string => OWN_NAMES[k] ?? OWN_LABELS[k];
/** The values a choice takes (settings.ts's choices: a test holds them to it). */
export const OWN_CHOICES: Partial<Record<RouteKey, readonly (string | number)[]>> = {
  ballast: ['none', 'ballast', 'buddy'], ballastEnds: ['square', 'stepped'], sleepers: ['bed', 'sleepers'], sleeperWidthStuds: [2, 1], curveStuds: ['grid', 'follow'], bottomStyle: ['antistud', 'float'],
  undersideGrid: ['baseplate', 'track'], grip: ['edges', 'all'], legoTrack: ['lego', 'lego-only', 'print'], bankRampAt: ['straight', 'curve'],
  bufferStyle: ['frame', 'blocks'], raisedOn: ['printed', 'lego'],
};
/** The settings that are on or off (the panel's tick boxes), and the one that is text. */
export const OWN_CHECKS: readonly RouteKey[] = ['bufferPinHoles', 'labelSize', 'labelGauge', 'labelParts'];
export const OWN_TEXTS: readonly RouteKey[] = ['labelText'];
/** (characters) The longest label text a track keeps of its own. */
export const OWN_TEXT_MAX = 40;
/** A number the panel shows in other units than it's kept in (check rail length: studs shown, mm kept): mm per unit shown. Ranges are in the units shown. */
export const OWN_SCALE: Partial<Record<RouteKey, number>> = { checkRailLen: 8 };
/** A number's range and step (settings.ts's: a test holds them to it). */
export const OWN_RANGES: Partial<Record<RouteKey, { min: number; max: number; step: number }>> = {
  sleeperGapStuds: { min: 1, max: 6, step: 1 }, ballastLeftStuds: { min: 0, max: 8, step: 1 }, ballastRightStuds: { min: 0, max: 8, step: 1 }, bankRampStuds: { min: 2, max: 200, step: 1 }, bankClimb: { min: 20, max: 1000, step: 10 },
  checkRailLen: { min: 1.25, max: 10, step: 0.25 }, checkRailW: { min: 1, max: 3, step: 0.1 }, checkRailFlare: { min: 0, max: 4, step: 0.25 }, flangeway: { min: 1, max: 4, step: 0.1 }, flangewayDepth: { min: 1, max: 6, step: 0.5 },
  bufferPostPlates: { min: 4, max: 15, step: 1 }, bufferBeamBottom: { min: 0, max: 10, step: 0.5 }, bufferBeamTop: { min: 4, max: 20, step: 0.5 },
};
/** What a setting is when neither the design nor the defaults say (the ones left out of the defaults: the build is keyed by what's set). */
export const OWN_UNSET: Partial<Record<RouteKey, string | number>> = { ballastLeftStuds: 1, ballastRightStuds: 1, ballastEnds: 'square' };
/** A number held to its range (whole where its step is): limits.ts clampDesign. */
export function clampOwn(own: Own): Own {
  for (const [k, r] of Object.entries(OWN_RANGES) as [RouteKey, { min: number; max: number; step: number }][]) {
    const v = own[k];
    const sc = OWN_SCALE[k] ?? 1;
    if (typeof v === 'number') (own as Record<string, number>)[k] = Math.min(r.max * sc, Math.max(r.min * sc, r.step >= 1 ? Math.round(v) : v));
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
    if (OWN_CHECKS.includes(k)) { if (typeof x === 'boolean') out[k] = x; }
    else if (OWN_TEXTS.includes(k)) { if (typeof x === 'string') out[k] = x.slice(0, OWN_TEXT_MAX); }
    else if (ch ? ch.includes(x as string | number) : typeof x === 'number' && Number.isFinite(x)) out[k] = x;
  }
  return Object.keys(out).length ? clampOwn(out as Own) : undefined;
}
