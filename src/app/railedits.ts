// (expert, stage 5b) A track's rails edited by hand (DRoute.railEdits): gaps cut in a rail (an isolating cut), guard
// rails along stretches of it on one side or both with their own flangeway, check rails added by hand, and the shape
// of its rails' ends at a cut (square or a tongue). The frogs' own edits (flangeway width, open frog, which rail runs
// through) are kept with the other trackwork edits (Design.trackwork.groove, by place). Pure: no geometry built.
// Places are studs along the track from its start; "left" and "right" facing from its start.
import type { DRoute } from './design';
import { cutLength } from './routecuts';
import type { RouteHand } from '../route/route';

export type RailSide = 'left' | 'right';
/** A gap cut through a rail (or both), `at` studs along: `w` mm wide (left out: 1). */
export interface RailGap { at: number; side: RailSide | 'both'; w?: number }
/** Guard rails from `from` to `to` (studs along), inside one rail or both (side left out), `gap` studs from the rail's head (left out: the design's). */
export interface GuardStretch { from: number; to: number; side?: RailSide; gap?: number }
/** A check rail added by hand, from `from` to `to` (studs along), inside the rail on `side`, at the design's flangeway. */
export interface HandCheck { from: number; to: number; side: RailSide }
export interface RailEdits {
  gaps?: RailGap[];
  guards?: GuardStretch[];
  checks?: HandCheck[];
  /** the rails' ends where the track is cut into parts: square (no tongue), not the design's Tongues on */
  ends?: 'square';
}

/** (mm) A gap's width: 0.5 to 3, 1 left out. */
export const GAP_MIN = 0.5, GAP_MAX = 3, GAP_DEF = 1;
/** (mm) The narrowest flangeway wheels pass: a guard rail's gap, a frog's flangeway. */
export const FLANGEWAY_MIN = 2.5;
/** (studs) A guard rail's gap from the rail's head: the narrowest wheels pass (2.5 mm), to 2 studs. */
export const GUARD_GAP_MIN = 0.32, GUARD_GAP_MAX = 2;
/** (studs) The shortest guard or check rail. */
export const RAIL_RUN_MIN = 2;
export const RAIL_EDITS_MAX = 200;
const MOST = 2000;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (v: number) => Math.round(v * 100) / 100;
const sideOf = (v: unknown): RailSide | undefined => (v === 'left' || v === 'right' ? v : undefined);
const other = (s: RailSide): RailSide => (s === 'left' ? 'right' : 'left');

/** A file's rail edits as kept: well-formed ones, numbers in range, gaps one to a place and side, stretches at least 2 studs, in order. Undefined: none. */
export function cleanRailEdits(v: unknown): RailEdits | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const q = v as Record<string, unknown>, list = (x: unknown) => (Array.isArray(x) ? (x.slice(0, RAIL_EDITS_MAX) as unknown[]).filter((y): y is Record<string, unknown> => !!y && typeof y === 'object') : []);
  const gaps: RailGap[] = [];
  for (const g of list(q.gaps)) {
    if (!fin(g.at) || g.at < 0 || g.at > MOST) continue;
    const side = g.side === 'both' ? 'both' : sideOf(g.side);
    if (!side) continue;
    const w = fin(g.w) ? r2(Math.min(GAP_MAX, Math.max(GAP_MIN, g.w))) : GAP_DEF;
    const e: RailGap = { at: r2(g.at), side, ...(w !== GAP_DEF && { w }) };
    if (!gaps.some((o) => Math.abs(o.at - e.at) < 0.005 && (o.side === e.side || o.side === 'both' || e.side === 'both'))) gaps.push(e);
  }
  const run = <T extends { from: number; to: number }>(x: Record<string, unknown>, more: Omit<T, 'from' | 'to'>): T | undefined => {
    if (!fin(x.from) || !fin(x.to)) return undefined;
    const from = Math.round(Math.min(MOST, Math.max(0, Math.min(x.from, x.to)))), to = Math.round(Math.min(MOST, Math.max(0, Math.max(x.from, x.to))));
    return to - from >= RAIL_RUN_MIN ? ({ from, to, ...more } as T) : undefined;
  };
  const guards: GuardStretch[] = [];
  for (const g of list(q.guards)) {
    const side = sideOf(g.side), gap = fin(g.gap) ? r2(Math.min(GUARD_GAP_MAX, Math.max(GUARD_GAP_MIN, g.gap))) : undefined;
    const e = run<GuardStretch>(g, { ...(side && { side }), ...(gap !== undefined && { gap }) });
    // (none over another on the same side)
    if (e && !guards.some((o) => o.from < e.to && e.from < o.to && (!o.side || !e.side || o.side === e.side))) guards.push(e);
  }
  const checks: HandCheck[] = [];
  for (const c of list(q.checks)) {
    const side = sideOf(c.side), e = side && run<HandCheck>(c, { side });
    if (e && !checks.some((o) => o.side === e.side && o.from < e.to && e.from < o.to)) checks.push(e);
  }
  gaps.sort((a, b) => a.at - b.at); guards.sort((a, b) => a.from - b.from); checks.sort((a, b) => a.from - b.from);
  const out: RailEdits = { ...(gaps.length && { gaps }), ...(guards.length && { guards }), ...(checks.length && { checks }), ...(q.ends === 'square' && { ends: 'square' as const }) };
  return Object.keys(out).length ? out : undefined;
}

/** How many edits a track's rails have (the card's summary, the Expert tools' note). */
export const railEditCount = (e: RailEdits | undefined) => (e?.gaps?.length ?? 0) + (e?.guards?.length ?? 0) + (e?.checks?.length ?? 0) + (e?.ends ? 1 : 0);
export const railsSummary = (r: Pick<DRoute, 'railEdits'>) => {
  const e = r.railEdits, n = (k: number, one: string, many = `${one}s`) => (k ? `${k} ${k === 1 ? one : many}` : '');
  const parts = [n(e?.gaps?.length ?? 0, 'gap'), n(e?.guards?.length ?? 0, 'guard rail stretch', 'guard rail stretches'), n(e?.checks?.length ?? 0, 'check rail'), e?.ends ? 'square ends' : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : 'as laid';
};

/** Map every place and side of a track's rail edits (in place of `at`, and `flip` the sides). */
function mapEdits(e: RailEdits | undefined, at: (c: number) => number, flip: boolean): RailEdits | undefined {
  if (!e) return undefined;
  const sd = <S extends string | undefined>(s: S): S => (flip && (s === 'left' || s === 'right') ? other(s as RailSide) : s) as S;
  const span = (x: { from: number; to: number }) => { const a = at(x.from), b = at(x.to); return { from: Math.min(a, b), to: Math.max(a, b) }; };
  return cleanRailEdits({ ...e, gaps: e.gaps?.map((g) => ({ ...g, at: at(g.at), side: sd(g.side) })), guards: e.guards?.map((g) => ({ ...g, ...span(g), side: sd(g.side) })), checks: e.checks?.map((c) => ({ ...c, ...span(c), side: sd(c.side) })) });
}
/** Turned end for end (len: its length, studs): from the new start, sides swapped. */
export const reverseRailEdits = (e: RailEdits | undefined, len: number) => mapEdits(e, (c) => len - c, true);
/** Mirrored: sides swapped. */
export const mirrorRailEdits = (e: RailEdits | undefined) => mapEdits(e, (c) => c, true);
/** A piece reshaped: each where `at` (routecuts.ts alongAfter) puts it. */
export const followRailEdits = (e: RailEdits | undefined, at: (c: number) => number) => mapEdits(e, at, false);
/** Cut in two at s studs: each half's (the second's from its own start; a stretch over the cut on both, cut there). */
export function splitRailEdits(e: RailEdits | undefined, s: number): [RailEdits | undefined, RailEdits | undefined] {
  if (!e) return [undefined, undefined];
  const lo = <T extends { from: number; to: number }>(x: T[] | undefined) => x?.filter((q) => q.from < s).map((q) => ({ ...q, to: Math.min(q.to, Math.floor(s)) }));
  const hi = <T extends { from: number; to: number }>(x: T[] | undefined) => x?.filter((q) => q.to > s).map((q) => ({ ...q, from: Math.max(0, Math.ceil(q.from - s)), to: Math.round(q.to - s) }));
  return [cleanRailEdits({ ...e, gaps: e.gaps?.filter((g) => g.at < s), guards: lo(e.guards), checks: lo(e.checks) }),
    cleanRailEdits({ ...e, gaps: e.gaps?.filter((g) => g.at >= s).map((g) => ({ ...g, at: g.at - s })), guards: hi(e.guards), checks: hi(e.checks) })];
}
/** Two tracks made one (b's on a's end, lenA studs along). Square ends if either had them. */
export function joinRailEdits(a: RailEdits | undefined, b: RailEdits | undefined, lenA: number): RailEdits | undefined {
  const bb = mapEdits(b, (c) => c + lenA, false);
  return cleanRailEdits({ gaps: [...(a?.gaps ?? []), ...(bb?.gaps ?? [])], guards: [...(a?.guards ?? []), ...(bb?.guards ?? [])], checks: [...(a?.checks ?? []), ...(bb?.checks ?? [])], ...((a?.ends || b?.ends) && { ends: 'square' }) });
}

/**
 * Why a track can't have this rail edit (undefined: it can), the doc's words where it has them. `fw`: the design's
 * flangeway (mm), for the guard rails' gap.
 */
export function railProblem(r: Pick<DRoute, 'segs' | 'railEdits' | 'guardRails' | 'dualGauge'>, e: RailEdits): string | undefined {
  const L = cutLength(r);
  for (const g of e.gaps ?? []) if (g.at < 1 || g.at > L - 1) return `A gap goes between the track's end connectors: 1 to ${+(L - 1).toFixed(2)} studs along`;
  for (const g of [...(e.guards ?? []), ...(e.checks ?? [])]) if (g.to > Math.floor(L) + 1e-6) return `A rail runs past the track's end: 0 to ${Math.floor(L)} studs`;
  for (const g of e.guards ?? []) if (g.gap !== undefined && g.gap * 8 < FLANGEWAY_MIN - 1e-6) return `Wheels need ${FLANGEWAY_MIN} mm`;
  if (e.guards?.length && r.dualGauge) return 'Not with dual gauge: guard rails are in the way of the third rail';
  return undefined;
}
/** A track's rail edits with one list's item k set to v (undefined: taken out) or added (k undefined). */
export function withRailEdit<K extends 'gaps' | 'guards' | 'checks'>(e: RailEdits | undefined, key: K, k: number | undefined, v: NonNullable<RailEdits[K]>[number] | undefined): RailEdits | undefined {
  const list = ((e?.[key] ?? []) as NonNullable<RailEdits[K]>[number][]).filter((_, n) => n !== k);
  return cleanRailEdits({ ...e, [key]: v ? [...list, v] : list });
}

/** Which of a track's rail edits: a gap, a stretch of guard rails or a check rail added by hand, by its place in its list. */
export type RailWhat = 'gap' | 'guard' | 'check';
const LIST = { gap: 'gaps', guard: 'guards', check: 'checks' } as const;
/** The edit itself (undefined: it isn't there). */
export const railEditAt = (e: RailEdits | undefined, what: RailWhat, k: number): RailGap | GuardStretch | HandCheck | undefined => e?.[LIST[what]]?.[k];
/**
 * A track's rail edit moved `by` studs along it (a gap by any step, a stretch of rail by whole studs, as long as it
 * was): the edits to keep and where the moved one is in its list now, or why it can't go there (railProblem's words;
 * held at the track's start too). The plan's drag and arrow keys, and the item's card.
 */
export function moveRailEdit(r: Pick<DRoute, 'segs' | 'railEdits' | 'guardRails' | 'dualGauge'>, what: RailWhat, k: number, by: number): { edits?: RailEdits; k?: number; why?: string } {
  const e = r.railEdits, was = railEditAt(e, what, k);
  if (!was) return { why: 'That rail edit is gone' };
  let now: RailGap | GuardStretch | HandCheck;
  if (what === 'gap') now = { ...(was as RailGap), at: r2((was as RailGap).at + by) };
  else { const st = was as GuardStretch, d = Math.round(by); if (st.from + d < 0) return { why: 'The track starts here' }; now = { ...st, from: st.from + d, to: st.to + d }; }
  const next = withRailEdit(e, LIST[what], k, now as never);
  if (!next) return { why: 'That rail edit can\'t go there' };
  const why = railProblem(r, next);
  if (why) return { why };
  const same = (x: RailGap | GuardStretch | HandCheck) => ('at' in x ? 'at' in now && Math.abs(x.at - now.at) < 0.005 && x.side === now.side : !('at' in now) && x.from === now.from && x.to === now.to && x.side === now.side);
  const at = ((next[LIST[what]] ?? []) as (RailGap | GuardStretch | HandCheck)[]).findIndex(same);
  // (two of a kind at one place and side are kept as one: said, not made)
  if (at < 0 || railEditCount(next) !== railEditCount(e)) return { why: what === 'gap' ? 'There\'s a gap in that rail there already' : 'There\'s a rail of that kind there already' };
  return { edits: next, k: at };
}
/** What a rail edit is, for the selection bar and its card: "Gap in the left rail, 12 studs from the start". */
export function railEditText(e: RailGap | GuardStretch | HandCheck, what: RailWhat): string {
  if (what === 'gap') { const g = e as RailGap; return `Gap in ${g.side === 'both' ? 'both rails' : `the ${g.side} rail`}, ${+g.at.toFixed(2)} studs from the start`; }
  const st = e as GuardStretch;
  return what === 'guard' ? `Guard ${st.side ? `rail inside the ${st.side} rail` : 'rails'}, ${st.from} to ${st.to} studs` : `Check rail inside the ${st.side} rail, ${st.from} to ${st.to} studs`;
}

/** A track's rail edits for the build (route.ts RouteHand: mm along the drawn route; sides -1 left, 1 right, 0 both). Its guard rails go by its extra rails (design.ts toRoutes: ExtraRails.guardOn). */
export function handRails(e: RailEdits, flangewayMm: number): Pick<RouteHand, 'gaps' | 'checks' | 'square'> {
  const s = (x: RailSide | 'both' | undefined) => (x === 'left' ? -1 : x === 'right' ? 1 : 0) as -1 | 0 | 1;
  return {
    ...(e.gaps?.length && { gaps: e.gaps.map((g) => ({ at: g.at * 8, side: s(g.side), w: g.w ?? GAP_DEF })) }),
    ...(e.checks?.length && { checks: e.checks.map((c) => ({ a: c.from * 8, b: c.to * 8, side: s(c.side) as -1 | 1, fw: flangewayMm })) }),
    ...(e.ends && { square: true }),
  };
}

/** What a frog's flangeway edit says, in words. */
export function frogEditText(e: { d0?: number; d1?: number; w?: number; open?: boolean; through?: boolean }): string {
  const parts = [e.d0 && `${+(e.d0 / 8).toFixed(2)} studs longer at one end`, e.d1 && `${+(e.d1 / 8).toFixed(2)} studs longer at the other`, e.w && `${e.w} mm wide`, e.open && 'open frog', e.through && 'the rail runs through'];
  return parts.filter(Boolean).join(', ') || 'as worked out';
}

/** The tightest radius (studs) a gap is cut on without a check rail opposite before it's warned of. */
export const GAP_RADIUS_MIN = 40;
/**
 * What the build says of a design's rail edits: edits that break a rule, a gap on a curve tighter than R40 with no
 * check rail opposite (warned, not refused: the doc's), edits on monorail (not made).
 */
export function railWarnings(d: { routes: DRoute[] }): string[] {
  const out: string[] = [];
  d.routes.forEach((r, i) => {
    const e = r.railEdits;
    if (!e) return;
    const name = r.name || `route ${i + 1}`;
    if (r.system === 'monorail') { out.push(`${name}'s rails edited by hand aren't made: it's monorail`); return; }
    const why = railProblem(r, e);
    if (why) out.push(`${name}'s rails edited by hand: ${why.charAt(0).toLowerCase()}${why.slice(1)}`);
    for (const g of e.gaps ?? []) {
      const rad = radiusAt(r, g.at);
      if (rad === undefined || rad >= GAP_RADIUS_MIN) continue;
      const opp = (s: RailSide) => (e.checks ?? []).some((c) => c.side !== s && c.from <= g.at && c.to >= g.at);
      const sides: RailSide[] = g.side === 'both' ? ['left', 'right'] : [g.side];
      if (sides.some((s) => !opp(s))) out.push(`${name}: a gap in a rail on an R${+rad.toFixed(1)} curve at ${+g.at.toFixed(2)} studs along, with no check rail opposite: wheels can drop into it (add a check rail there)`);
    }
  });
  return out;
}
/** The radius (studs) of a track's curve at a place along it; undefined on a straight. */
export function radiusAt(r: Pick<DRoute, 'segs'>, at: number): number | undefined {
  let s0 = 0;
  for (const sg of r.segs) {
    const len = sg.kind === 'straight' ? sg.studs : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180;
    if (at <= s0 + len + 1e-6) return sg.kind === 'curve' ? sg.radius : undefined;
    s0 += len;
  }
  return undefined;
}
