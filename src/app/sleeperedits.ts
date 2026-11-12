// (expert) Sleepers edited by hand (DRoute.sleeperEdits) and sleepers shared across tracks (Design.expert.shared):
// the lists as a design keeps them, what's wrong with an edit, how they go with their track when it's turned end for
// end, mirrored, split, joined or reshaped, and the sleepers a track has with its edits made (as the plan draws them
// and the build lays them: geom/handsleepers.ts). Pure: no geometry built. Studs along the track from its start.
import type { Design, DRoute } from './design';
import { cutLength } from './routecuts';
import { sleeperSpots } from '../geom/crossing';
import { laySleepers, type LaidSleeper } from '../geom/handsleepers';
import type { HandSleeper } from '../route/route';

/**
 * One sleeper edited by hand. `at`: where the sleeper is that the app lays (the nearest to it, within half the
 * sleepers' spacing), studs from the track's start; an added one: where it goes.
 */
export interface SleeperEdit {
  at: number;
  /** one more sleeper, here (not one of the app's) */
  add?: true;
  /** taken out */
  off?: true;
  /** moved along, studs (+: towards the track's end) */
  move?: number;
  /** longer on the track's left and right, whole studs */
  left?: number; right?: number;
  /** on a curve: square to the stud grid (left out: as the app lays it, square to the track, a fan round the curve) */
  turn?: 'square';
  /** false: without its studs */
  studs?: false;
}
/** Sleepers shared by tracks side by side: along the first track from `from` to `to` (studs from its start), each of its sleepers carried across the others, which have none of their own there. */
export interface SharedSleepers { routes: string[]; from: number; to: number }

/** (studs) The longest stretch of rail with nothing under it: the widest gap between sleepers the settings allow. */
export const SPAN_MAX = 6;
/** (studs) How far a sleeper may be moved along, and how much longer it may be made each side. */
export const SLEEPER_MOVE = 16, SLEEPER_LONG = 24;
/** At most this many edits on a track, and shared stretches in a design. */
export const SLEEPER_EDITS_MAX = 400, SHARED_MAX = 200;
const MOST = 2000 * 100;
const r2 = (v: number) => Math.round(v * 100) / 100;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const whole = (x: unknown, max: number) => (fin(x) ? Math.min(max, Math.max(0, Math.round(x))) : 0);

/** Does an edit say anything (an edit left with nothing is none)? */
export const editSays = (e: SleeperEdit) => !!(e.add || e.off || e.move || e.left || e.right || e.turn || e.studs === false);

/** A file's sleeper edits as kept: each with a place, only what an edit may say, each number in its range; one edit to a place; in order. Undefined: none. */
export function cleanSleeperEdits(v: unknown): SleeperEdit[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: SleeperEdit[] = [];
  for (const x of v.slice(0, SLEEPER_EDITS_MAX) as unknown[]) {
    if (!x || typeof x !== 'object') continue;
    const q = x as Record<string, unknown>;
    if (!fin(q.at) || q.at < 0 || q.at > MOST) continue;
    const move = fin(q.move) ? r2(Math.min(SLEEPER_MOVE, Math.max(-SLEEPER_MOVE, q.move))) : 0, left = whole(q.left, SLEEPER_LONG), right = whole(q.right, SLEEPER_LONG);
    const e: SleeperEdit = { at: r2(q.at), ...(q.add === true && { add: true as const }), ...(q.off === true && { off: true as const }), ...(move && { move }), ...(left && { left }), ...(right && { right }),
      ...(q.turn === 'square' && { turn: 'square' as const }), ...(q.studs === false && { studs: false as const }) };
    if (!editSays(e) || out.some((o) => Math.abs(o.at - e.at) < 0.005 && !!o.add === !!e.add)) continue;
    out.push(e);
  }
  out.sort((a, b) => a.at - b.at);
  return out.length ? out : undefined;
}

/** A track's edits when it's turned end for end (len: its length, studs): each as far from the new start as it was from the old end, moved the other way, its sides swapped. */
export const reverseSleeperEdits = (es: SleeperEdit[] | undefined, len: number): SleeperEdit[] | undefined =>
  cleanSleeperEdits((es ?? []).map((e) => ({ ...e, at: len - e.at, move: e.move ? -e.move : undefined, left: e.right, right: e.left })));
/** A track's edits when it's mirrored: its sides swapped. */
export const mirrorSleeperEdits = (es: SleeperEdit[] | undefined): SleeperEdit[] | undefined => cleanSleeperEdits((es ?? []).map((e) => ({ ...e, left: e.right, right: e.left })));
/** A track cut in two at s studs (Split): each half's edits (the second's from its own start). */
export function splitSleeperEdits(es: SleeperEdit[] | undefined, s: number): [SleeperEdit[] | undefined, SleeperEdit[] | undefined] {
  const list = es ?? [];
  return [cleanSleeperEdits(list.filter((e) => e.at < s)), cleanSleeperEdits(list.filter((e) => e.at >= s).map((e) => ({ ...e, at: e.at - s })))];
}
/** Two tracks made one (b's on a's end, lenA studs along; b's in the joined track's direction already). */
export const joinSleeperEdits = (a: SleeperEdit[] | undefined, b: SleeperEdit[] | undefined, lenA: number): SleeperEdit[] | undefined =>
  cleanSleeperEdits([...(a ?? []), ...(b ?? []).map((e) => ({ ...e, at: e.at + lenA }))]);
/** A track's edits after one of its pieces was reshaped: each where `at` (routecuts.ts alongAfter) puts it. */
export const followSleeperEdits = (es: SleeperEdit[] | undefined, at: (c: number) => number): SleeperEdit[] | undefined => cleanSleeperEdits((es ?? []).map((e) => ({ ...e, at: at(e.at) })));

/** A track's edits for the build (route.ts HandSleeper: mm along the drawn route). */
export const handSleepers = (es: SleeperEdit[]): HandSleeper[] => es.map((e) => ({ at: e.at * 8, ...(e.add && { add: true }), ...(e.off && { off: true }), ...(e.move && { move: e.move * 8 }),
  ...((e.left || e.right) && { left: (e.left ?? 0) * 8, right: (e.right ?? 0) * 8 }), ...(e.turn === 'square' && { square: true }), ...(e.studs === false && { bare: true }) }));

/** How a track's sleepers are laid: their width and the gap between them (studs), and whether the track is all curve (its sleepers spread evenly). */
export interface SleeperLay { gap: number; w: number; curved: boolean }
/** One sleeper of a track with its edits made: where it is (studs), which edit made it so (its place in the track's list), and where the app had it. */
export interface PlanSleeper { at: number; from?: number; k?: number; e?: SleeperEdit }
/**
 * A track's sleepers with its edits made, as the build lays them on a track built in one (the plan draws these; a
 * track cut into lengths has each length's sleepers laid from its own ends, a little off these: an edit is of the
 * nearest). lost: the edits no sleeper was found for (their places in the list).
 */
export function planSleepers(r: Pick<DRoute, 'segs' | 'sleeperEdits'>, lay: SleeperLay): { laid: PlanSleeper[]; lost: number[] } {
  const L = cutLength(r), es = r.sleeperEdits ?? [], hs = handSleepers(es);
  const spots = sleeperSpots(L * 8, false, false, lay.gap, lay.w, lay.curved);
  const { laid, lost } = laySleepers(spots, hs, ((lay.gap + lay.w) * 8) / 2);
  const kOf = (e: LaidSleeper['e']) => (e ? hs.indexOf(e) : -1);
  return { laid: laid.map((q) => { const k = kOf(q.e); return { at: r2(q.v / 8), ...(q.from !== undefined && { from: r2(q.from / 8) }), ...(k >= 0 && { k, e: es[k] }) }; }), lost: lost.map((e) => hs.indexOf(e)) };
}

/**
 * Why a track can't have these sleeper edits (undefined: it can), the doc's words: a sleeper off the track or on
 * another, moved off the whole studs of the baseplate's grid, or a gap the rails can't span. `whole`: the underside
 * is lined up with the baseplate (moves in whole studs); blade: is a place along the track (studs) under a blade's
 * moving length (from the build's plan).
 */
export function sleeperProblem(r: Pick<DRoute, 'segs' | 'sleeperEdits' | 'name'>, es: SleeperEdit[], lay: SleeperLay, whole: boolean, blade?: (at: number) => boolean): string | undefined {
  const L = cutLength(r), lo = 1 + lay.w / 2, hi = L - 1 - lay.w / 2;
  for (const e of es) {
    if (whole && e.move && Math.abs(e.move - Math.round(e.move)) > 1e-6) return 'Whole studs only: the underside is lined up with the baseplate (Underside lined up with: The track lets a sleeper go anywhere)';
    if (whole && e.add && Math.abs(e.at * 2 - Math.round(e.at * 2)) > 1e-6) return 'An added sleeper goes on a whole or half stud: the underside is lined up with the baseplate';
  }
  const { laid } = planSleepers({ segs: r.segs, sleeperEdits: es }, lay);
  for (const q of laid) {
    if (!q.e) continue;
    if (q.at < lo - 1e-6 || q.at > hi + 1e-6) return hi < lo ? 'The track is too short for a sleeper between its end connectors' : `A sleeper lies between the track's end connectors: ${+lo.toFixed(2)} to ${+hi.toFixed(2)} studs along`;
    if (blade?.(q.at)) return 'A blade moves here: no sleeper under a blade\'s moving length';
  }
  for (let k = 1; k < laid.length; k++) if ((laid[k].e || laid[k - 1].e) && laid[k].at - laid[k - 1].at < lay.w - 1e-6) return 'Sleepers can\'t lie on each other';
  // (the rails' spans: from each end connector, a stud deep, to the first sleeper, and between sleepers)
  const edges = [1, ...laid.flatMap((q) => [q.at - lay.w / 2, q.at + lay.w / 2]), L - 1];
  for (let k = 0; k + 1 < edges.length; k += 2) {
    const span = edges[k + 1] - edges[k];
    if (span > Math.max(SPAN_MAX, lay.gap) + 1e-6) return `The rails would span ${+span.toFixed(1)} studs here: ${Math.max(SPAN_MAX, lay.gap)} at most`;
  }
  return undefined;
}

/** A track's sleeper edit number k set to e (undefined: taken out, the sleeper as the app lays it again), or a new one added (k undefined): the list to keep. */
export function withSleeperEdit(es: SleeperEdit[] | undefined, k: number | undefined, e: SleeperEdit | undefined): SleeperEdit[] | undefined {
  const rest = (es ?? []).filter((_, n) => n !== k);
  return cleanSleeperEdits(e ? [...rest, e] : rest);
}
/** What an edit says, in words: "taken out", "moved 1 stud on, 2 studs longer on the left". */
export function sleeperEditText(e: SleeperEdit): string {
  const st = (n: number) => `${+Math.abs(n).toFixed(2)} stud${Math.abs(n) === 1 ? '' : 's'}`;
  if (e.off) return 'taken out';
  const parts = [e.add && 'added', e.move && `moved ${st(e.move)} ${e.move > 0 ? 'on' : 'back'}`, e.left && `${st(e.left)} longer on the left`, e.right && `${st(e.right)} longer on the right`, e.turn && 'square to the grid', e.studs === false && 'no studs'];
  return parts.filter(Boolean).join(', ');
}
/** "3 by hand" and so on: what the card's Sleepers section says when shut. */
export const sleepersSummary = (r: Pick<DRoute, 'sleeperEdits'>) => (r.sleeperEdits?.length ? `${r.sleeperEdits.length} by hand` : 'automatic');

// ---------- sleepers shared across tracks ----------
/** A file's shared stretches as kept: two or more different tracks there are, from and to whole studs, at least a stud long. Undefined: none. */
export function cleanShared(v: unknown, names: ReadonlySet<string>): SharedSleepers[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: SharedSleepers[] = [];
  for (const x of v.slice(0, SHARED_MAX) as unknown[]) {
    if (!x || typeof x !== 'object') continue;
    const q = x as Record<string, unknown>;
    if (!Array.isArray(q.routes) || !fin(q.from) || !fin(q.to)) continue;
    const routes = [...new Set(q.routes.filter((n): n is string => typeof n === 'string' && names.has(n)))];
    const from = Math.min(2000, Math.max(0, Math.round(q.from))), to = Math.min(2000, Math.max(0, Math.round(q.to)));
    if (routes.length < 2 || to - from < 1) continue;
    out.push({ routes, from, to });
  }
  return out.length ? out : undefined;
}
const nameOf = (d: Design, i: number) => d.routes[i]?.name || String(i);
/** The shared stretches whose sleepers are route i's (it's their first track). */
export const sharedOf = (d: Design, i: number): SharedSleepers[] => (d.expert?.shared ?? []).filter((s) => s.routes[0] === nameOf(d, i));
/** Why tracks a and b can't share sleepers (undefined: they can). `sleepers`: are both on sleepers with gaps, no ballast. */
export function sharedProblem(d: Design, a: number, b: number, sleepers: boolean): string | undefined {
  if (a === b || !d.routes[a] || !d.routes[b]) return 'Select two tracks side by side';
  if (!sleepers) return 'Only tracks on sleepers with gaps (no ballast) share sleepers';
  return undefined;
}
/** A design's shared stretches set (none left: the list goes, and `expert` with it when that's all it held). In place. */
export function setShared(d: Design, list: SharedSleepers[]) {
  const names = new Set(d.routes.map((_, i) => nameOf(d, i))), kept = cleanShared(list, names);
  if (kept) d.expert = { ...d.expert, shared: kept };
  else if (d.expert) { const { shared: _s, ...rest } = d.expert; if (Object.keys(rest).length) d.expert = rest; else delete d.expert; }
}
/** A track renamed: the shared stretches follow. */
export function renameShared(d: Design, was: string, now: string) {
  if (d.expert?.shared) d.expert.shared = d.expert.shared.map((s) => ({ ...s, routes: s.routes.map((n) => (n === was ? now : n)) }));
}
/** A track turned end for end (len: its length, studs): its own shared stretches measured from its new start. */
export function reverseShared(d: Design, name: string, len: number) {
  if (d.expert?.shared) d.expert.shared = d.expert.shared.map((s) => (s.routes[0] === name ? { ...s, from: Math.max(0, Math.round(len - s.to)), to: Math.round(len - s.from) } : s));
}
/** A track's piece reshaped: its own shared stretches' ends where `at` (routecuts.ts alongAfter) puts them, on whole studs. */
export function followShared(d: Design, name: string, at: (c: number) => number) {
  if (d.expert?.shared) setShared(d, d.expert.shared.map((s) => (s.routes[0] === name ? { ...s, from: Math.round(at(s.from)), to: Math.round(at(s.to)) } : s)));
}
/** A track cut in two at s studs, its second half named `second`: a stretch of its own is on the half it lies on (one over the cut on both); as another's mate, both halves are. */
export function splitShared(d: Design, name: string, second: string, s: number) {
  if (!d.expert?.shared) return;
  const out: SharedSleepers[] = [];
  for (const sh of d.expert.shared) {
    const mates = sh.routes.slice(1).flatMap((n) => (n === name ? [name, second] : [n]));
    if (sh.routes[0] !== name) { out.push({ ...sh, routes: [sh.routes[0], ...mates] }); continue; }
    if (sh.from < s) out.push({ routes: [name, ...mates], from: sh.from, to: Math.min(sh.to, Math.floor(s)) });
    if (sh.to > s) out.push({ routes: [second, ...mates], from: Math.max(0, Math.ceil(sh.from - s)), to: Math.round(sh.to - s) });
  }
  // (the second half isn't in the design yet: kept as they are, not held to the tracks there are)
  d.expert.shared = out.filter((x) => x.to - x.from >= 1);
}
/** Track b made one with a (b's on a's end, lenA studs along; b turned round first if need be, by reverseShared): b's stretches are a's, moved on. */
export function joinShared(d: Design, a: string, b: string, lenA: number) {
  if (!d.expert?.shared) return;
  setShared(d, d.expert.shared.map((s) => ({ routes: [...new Set(s.routes.map((n) => (n === b ? a : n)))], from: s.routes[0] === b ? Math.round(s.from + lenA) : s.from, to: s.routes[0] === b ? Math.round(s.to + lenA) : s.to })));
}

/** How a track's sleepers are laid with these settings. */
export const layOf = (r: Pick<DRoute, 'segs'>, o: { sleeperGapStuds?: number; sleeperWidthStuds?: number }): SleeperLay => ({ gap: o.sleeperGapStuds ?? 2, w: o.sleeperWidthStuds ?? 2, curved: r.segs.length > 0 && r.segs.every((sg) => sg.kind === 'curve') });
/**
 * What the build says of a design's sleeper edits and shared sleepers (o: the settings its track is built with):
 * edits on track with no separate sleepers, edits that break a rule, edits no sleeper is found for.
 */
export function sleeperWarnings(d: Design, o: { ballast?: string; sleepers?: string; sleeperGapStuds?: number; sleeperWidthStuds?: number; undersideGrid?: string }): string[] {
  const out: string[] = [], plain = (o.ballast ?? 'none') !== 'none' ? 'on ballast' : o.sleepers !== 'sleepers' ? 'on a solid bed' : undefined;
  d.routes.forEach((r, i) => {
    if (!r.sleeperEdits?.length || r.system === 'monorail') return;
    const name = r.name || `route ${i + 1}`;
    if (plain) { out.push(`${name}'s sleepers edited by hand aren't made: it's ${plain} (they're for track on sleepers with gaps)`); return; }
    const lay = layOf(r, o), why = sleeperProblem(r, r.sleeperEdits, lay, o.undersideGrid !== 'track');
    if (why) out.push(`${name}'s sleepers edited by hand: ${why.charAt(0).toLowerCase()}${why.slice(1)}`);
    for (const k of planSleepers(r, lay).lost) out.push(`${name}: no sleeper near ${+r.sleeperEdits[k].at.toFixed(2)} studs along for the edit there (reset it, or move it to a sleeper)`);
  });
  if (plain && d.expert?.shared?.length) out.push(`the sleepers shared across tracks aren't made: the track is ${plain}`);
  return out;
}
/** The shared stretches whose tracks are gone taken off (a track deleted). True if any went. In place. */
export function pruneShared(d: Design): boolean {
  const was = d.expert?.shared?.length ?? 0;
  if (!was) return false;
  setShared(d, d.expert!.shared!);
  return (d.expert?.shared?.length ?? 0) !== was;
}
/** Is a track a curve at a place along it (studs)? A straight's sleepers are square to the grid as they are. */
export function curvedAt(r: Pick<DRoute, 'segs'>, at: number): boolean {
  let s0 = 0;
  for (const sg of r.segs) { const len = sg.kind === 'straight' ? sg.studs : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180; if (at <= s0 + len + 1e-6) return sg.kind === 'curve'; s0 += len; }
  return r.segs[r.segs.length - 1]?.kind === 'curve';
}
