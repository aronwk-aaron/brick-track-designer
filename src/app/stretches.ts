// (expert) A stretch of a track with settings of its own (DRoute.stretches: from and to in whole studs from the
// track's start, and its own bed settings over the track's): the list kept clean, followed when the track is turned
// end for end, split, joined or reshaped, and the design the build builds (each stretch a track of its own, the
// track cut at the stretch's ends as Split cuts it: an ordinary track end each side). Pure: no geometry built.
import { type Design, type DRoute, isMono } from './design';
import { cleanOwn, type Own, PART_KEYS } from './routeown';
import { cutLength } from './routecuts';
import { splitRoute } from './splitmerge';

/** The settings a stretch may have of its own: a part's, but for bought or printed (that's the whole track's). */
export const STRETCH_KEYS = PART_KEYS.filter((k) => k !== 'legoTrack');
export interface Stretch {
  /** where it starts and ends: whole studs from the track's start */
  from: number; to: number;
  /** its own settings, over the track's */
  own: Own;
}
/** The shortest stretch, and the shortest track left before, between and after stretches (studs). */
export const STRETCH_MIN = 2;
const MOST = 2000;

const ownOfStretch = (v: unknown): Own => { const o = cleanOwn(v) ?? {}; return Object.fromEntries(STRETCH_KEYS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) as Own; };

/**
 * A file's stretches: each from and to a whole stud, 0 to 2000, at least STRETCH_MIN long, its settings the ones a
 * stretch may have (the rest left out; none left is kept: a stretch just added has none yet); in order, a later one
 * that runs into an earlier one starting where that ends. Nothing left: undefined.
 */
export function cleanStretches(v: unknown): Stretch[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const list: Stretch[] = [];
  for (const x of v as unknown[]) {
    if (!x || typeof x !== 'object') continue;
    const { from, to, own } = x as Record<string, unknown>;
    if (typeof from !== 'number' || typeof to !== 'number' || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    list.push({ from: Math.min(MOST, Math.max(0, Math.round(from))), to: Math.min(MOST, Math.max(0, Math.round(to))), own: ownOfStretch(own) });
  }
  list.sort((a, b) => a.from - b.from || a.to - b.to);
  const out: Stretch[] = [];
  for (const s of list) {
    const from = Math.max(s.from, out.length ? out[out.length - 1].to : 0);
    if (s.to - from >= STRETCH_MIN) out.push({ ...s, from });
  }
  return out.length ? out : undefined;
}

/**
 * A route's stretches as built: on its track (one past its end is not; one over its end stops there), an end under
 * STRETCH_MIN from the track's end or from the stretch before taken there (no shorter piece is left between).
 */
export function liveStretches(r: Pick<DRoute, 'segs' | 'stretches'>): Stretch[] {
  const L = cutLength(r), out: Stretch[] = [];
  for (const s of cleanStretches(r.stretches) ?? []) {
    const last = out.length ? out[out.length - 1].to : 0;
    const from = s.from - last < STRETCH_MIN ? last : s.from, to = s.to > L - STRETCH_MIN ? L : s.to;
    if (to - from >= STRETCH_MIN - 1e-9) out.push({ ...s, from, to });
  }
  return out;
}
/** A route's stretches that aren't on its track any more (it was shortened): kept and listed, not built. */
export function lostStretches(r: Pick<DRoute, 'segs' | 'stretches'>): Stretch[] {
  const L = cutLength(r);
  return (cleanStretches(r.stretches) ?? []).filter((s) => s.from > L - STRETCH_MIN + 1e-9);
}
/** Why a stretch from..to can't be on route r (undefined: it can); skip: the one of r's being changed. */
export function stretchProblem(r: Pick<DRoute, 'segs' | 'stretches'>, from: number, to: number, skip?: number): string | undefined {
  const L = cutLength(r);
  if (!(to - from >= STRETCH_MIN)) return `A stretch is at least ${STRETCH_MIN} studs long`;
  if (from < 0 || from > L - STRETCH_MIN) return `The track is ${+L.toFixed(1)} studs long: a stretch starts at 0 to ${Math.max(0, Math.floor(L - STRETCH_MIN))}`;
  if ((r.stretches ?? []).some((s, k) => k !== skip && from < s.to && to > s.from)) return 'Stretches can\'t run over each other';
  return undefined;
}

/** A route's stretches when it's turned end for end (len: its length, studs; rounded to whole studs from the new start). */
export const reverseStretches = (st: Stretch[] | undefined, len: number): Stretch[] | undefined => cleanStretches((st ?? []).map((s) => ({ ...s, from: len - Math.min(s.to, len), to: len - s.from })));
/** A route cut in two at s studs (Split): each half's stretches (the second's from its own start); one over the cut is on both. */
export function splitStretches(st: Stretch[] | undefined, s: number): [Stretch[] | undefined, Stretch[] | undefined] {
  const list = st ?? [];
  return [cleanStretches(list.filter((x) => x.from < s).map((x) => ({ ...x, to: Math.min(x.to, s) }))),
    cleanStretches(list.filter((x) => x.to > s).map((x) => ({ ...x, from: Math.max(x.from, s) - s, to: x.to - s })))];
}
/** Two routes made one (b's track on a's end, lenA studs along; b's in the joined route's direction already): the joined route's. */
export const joinStretches = (a: Stretch[] | undefined, b: Stretch[] | undefined, lenA: number): Stretch[] | undefined =>
  cleanStretches([...(a ?? []).map((s) => ({ ...s, to: Math.min(s.to, lenA) })), ...(b ?? []).map((s) => ({ ...s, from: Math.round(s.from + lenA), to: Math.round(s.to + lenA) }))]);
/** A route's stretches after one of its pieces was reshaped: each end where `at` (routecuts.ts alongAfter) puts it, on a whole stud. */
export const followStretches = (st: Stretch[] | undefined, at: (c: number) => number): Stretch[] | undefined => cleanStretches((st ?? []).map((s) => ({ ...s, from: at(s.from), to: at(s.to) })));

/** Has any train track a stretch with settings of its own? */
export const hasStretches = (d: Design) => d.routes.some((r) => !isMono(r) && !!r.stretches?.length);

export interface Stretched {
  /** the design the build builds: every stretch a track of its own, with its settings as that track's own */
  design: Design;
  /** for each of its tracks, the track of the design it's a piece of (its index) */
  of: number[];
  /** which of its tracks are stretches (the rest: the track before, between and after them) */
  stretch: boolean[];
  /** a piece's name (its id) → its track's, for what the build says by track (the plan's trackwork) */
  names: Map<string, string>;
}
let memo: { key: string; v: Stretched } | undefined;

/**
 * The design with each track that has stretches cut at their ends (splitmerge.ts splitRoute: what's on the track
 * goes with its piece), every piece a track with the settings in force on it as its own: the track's, a stretch's
 * over them. A design with no stretches is returned as it is. The first piece keeps the track's name; the others
 * are named for where they are ("Main (12 to 20)").
 */
export function expandStretches(d: Design): Stretched {
  if (!hasStretches(d)) return { design: d, of: d.routes.map((_, i) => i), stretch: d.routes.map(() => false), names: new Map() };
  const key = JSON.stringify([d.routes, d.trackwork, d.gaugeStuds]);
  if (memo?.key === key) return { ...memo.v, design: { ...d, routes: memo.v.design.routes, ...(memo.v.design.trackwork && { trackwork: memo.v.design.trackwork }) } };
  const out = structuredClone(d), of: number[] = [], stretch: boolean[] = [], names = new Map<string, string>();
  // (a track with no name goes by its place in the list, which the pieces put in would change: named by it first)
  out.routes.forEach((r, i) => { if (!r.name) r.name = String(i); });
  const taken = new Set(out.routes.map((r) => r.name));
  for (let i = 0, src = 0; src < d.routes.length; src++) {
    const r = out.routes[i], live = isMono(r) ? [] : liveStretches(r), name = r.name, L = cutLength(r), base = r.own;
    delete r.stretches;
    // (the pieces: [from, to, the stretch's own]; cut from the far end back, so each cut is on the first piece still)
    const pieces: [number, number, Own | undefined][] = [];
    let at = 0;
    for (const s of live) { if (s.from > at) pieces.push([at, s.from, undefined]); pieces.push([s.from, s.to, s.own]); at = s.to; }
    if (at < L - 1e-9) pieces.push([at, L, undefined]);
    for (let k = pieces.length - 1; k >= 1; k--) {
      let nb = `${name} (${pieces[k][0]} to ${+pieces[k][1].toFixed(1)})`;
      while (taken.has(nb)) nb += '\'';
      taken.add(nb);
      if ('problem' in splitRoute(out, i, pieces[k][0], nb)) { pieces.splice(k, 1); continue; }
      names.set(nb, d.routes[src].name || String(src));
    }
    pieces.forEach(([, , own], k) => {
      const p = out.routes[i + k];
      delete p.stretches;
      const mine = { ...base, ...own };
      if (Object.keys(mine).length) p.own = mine; else delete p.own;
      of.push(src); stretch.push(own !== undefined);
    });
    if (!pieces.length) { of.push(src); stretch.push(false); }
    i += Math.max(1, pieces.length);
  }
  const v = { design: out, of, stretch, names };
  memo = { key, v };
  return v;
}
