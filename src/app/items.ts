// What the plan's selection holds, by kind (expert mode, docs/expert-mode.md, The editor): tracks and tables as
// ever, and the things an expert edits on their own: a cut across a track, a cut path, a stretch of a track with its
// own settings, a joint between two tracks. Here: the typed ids, the one hit test that knows each kind's shape, what
// each is called, where a dragged stretch may go, what the Expert tools switch shows, and what the Pick list lets a
// click take. Pure: no canvas, nothing built. (More kinds come with the later stages: sleepers, rails, points.)
import { type Design, type DRoute, isMono } from './design';
import type { Joint } from './connections';
import type { CutPath } from './cutpaths';
import { liveOwn } from './overrides';
import { follow } from './planner';
import { cutLength, liveCuts } from './routecuts';
import { cutSegs, nearestAlong } from './splitmerge';
import { type Stretch, STRETCH_MIN } from './stretches';

type End = 'start' | 'end';
/**
 * One selected thing. A cut and a stretch go by their track (its place in the design's list) and their place in its
 * list; a cut path by its id; a joint by a track and its end that is joined (every joint at that end), or by its two
 * tracks (other: every joint between the two).
 */
export type Item =
  | { kind: 'route'; route: number }
  | { kind: 'table'; table: number }
  | { kind: 'cut'; route: number; k: number }
  | { kind: 'cutpath'; id: string }
  | { kind: 'stretch'; route: number; k: number }
  | { kind: 'joint'; route: number; end?: End; other?: number };
export type ItemKind = Item['kind'];
/** The kinds that are selected one at a time, beside the tracks and tables. */
export type OwnItem = Exclude<Item, { kind: 'route' | 'table' }>;

export const sameItem = (a: Item | undefined, b: Item | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ---------- the hit test ----------
/** Which part of an item a point is on: how a press there drags it (a path's corner, a stretch's end, or the whole). */
export type HitPart = 'body' | 'corner' | 'from' | 'to';
export interface Hit {
  item: OwnItem; part: HitPart;
  /** (a path's corner) which */
  corner?: number;
  /** how far the point is from it, studs; and its rank: the smaller things first (lower), so a cut on a stretch can be picked */
  d: number; rank: number;
}
export interface HitCtx {
  /** how near counts, studs: to a line (a cut, a path's run), and to a point (a corner, a stretch's end, a joint) */
  near: number; point: number;
  /** which kinds are looked for */
  kinds: readonly OwnItem['kind'][];
  paths?: readonly CutPath[];
  joints?: readonly Joint[];
  /** the tracks whose stretches can be picked (the selected track's; every track's when only stretches are picked) */
  stretchesOf?: readonly number[];
  /** the item selected now: its corners and ends come first */
  selected?: Item;
}
const RANK = { corner: 0, selEnd: 1, cut: 2, path: 3, joint: 4, end: 5, stretch: 6 };
/** Is a hit on the selected item's own corner or end? A press takes those before a track's end under them. */
export const takesFirst = (h: Hit) => h.rank <= RANK.selEnd;
/** Half the width of a track's band on the plan (its sleepers), studs: where a click picks the track. */
export const bandHalf = (d: Design, r: DRoute) => ((r.gaugeStuds ?? d.gaugeStuds) + 1) / 2 + 1.5;
const segOff = (q: readonly number[], a: readonly number[], b: readonly number[]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, k = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(q[0] - a[0] - k * dx, q[1] - a[1] - k * dy);
};
/** Where a route is, s studs along it from its start. */
export function placeAlong(r: DRoute, s: number) { return follow(r, cutSegs(r.segs, Math.max(0, s))[0]); }

/**
 * The cuts, cut paths, stretches and joints under a point of the plan (studs), the one a press takes first: the
 * selected path's corners and the selected stretch's ends, then cuts across a track, paths, joints, stretches' ends,
 * stretches; of one rank the nearest first. A locked track's cuts and stretches aren't picked (they can't be moved).
 */
export function hitItems(d: Design, w: [number, number], c: HitCtx): Hit[] {
  const out: Hit[] = [], sel = c.selected, want = (k: OwnItem['kind']) => c.kinds.includes(k);
  if (want('cutpath')) for (const p of c.paths ?? []) {
    const item: OwnItem = { kind: 'cutpath', id: p.id };
    if (sel?.kind === 'cutpath' && sel.id === p.id) p.pts.forEach((q, k) => { const dd = Math.hypot(q[0] - w[0], q[1] - w[1]); if (dd < c.point) out.push({ item, part: 'corner', corner: k, d: dd, rank: RANK.corner }); });
    let best = Infinity;
    for (let k = 1; k < p.pts.length; k++) best = Math.min(best, segOff(w, p.pts[k - 1], p.pts[k]));
    if (best < c.near) out.push({ item, part: 'body', d: best, rank: RANK.path });
  }
  if (want('cut')) d.routes.forEach((r, i) => {
    if (!r.cuts?.length || r.locked) return;
    // (a track further from the point than it is long: not looked along)
    if (Math.hypot(w[0] - r.x, w[1] - r.y) > cutLength(r) + 8) return;
    const half = ((r.gaugeStuds ?? d.gaugeStuds) + 4) / 2;
    for (const at of liveCuts(r)) {
      const q = placeAlong(r, at), h = (q.heading * Math.PI) / 180, dx = w[0] - q.x, dy = w[1] - q.y;
      const along = Math.abs(-dx * Math.sin(h) + dy * Math.cos(h));
      if (along < c.near && Math.abs(dx * Math.cos(h) + dy * Math.sin(h)) < half + c.near) out.push({ item: { kind: 'cut', route: i, k: r.cuts.indexOf(at) }, part: 'body', d: along, rank: RANK.cut });
    }
  });
  if (want('joint')) for (const j of c.joints ?? []) {
    const dd = Math.hypot(j.at[0] - w[0], j.at[1] - w[1]);
    if (dd < c.point) out.push({ item: { kind: 'joint', route: j.a, end: j.aEnd }, part: 'body', d: dd, rank: RANK.joint });
  }
  if (want('stretch')) for (const i of c.stretchesOf ?? []) {
    const r = d.routes[i];
    if (!r?.stretches?.length || r.locked || isMono(r)) continue;
    if (Math.hypot(w[0] - r.x, w[1] - r.y) > cutLength(r) + 8) continue;
    const n = nearestAlong(r, w), L = cutLength(r);
    if (n.dist > bandHalf(d, r) + 0.25) continue;
    r.stretches.forEach((st, k) => {
      const to = Math.min(st.to, L);
      if (st.from > L) return;
      const item: OwnItem = { kind: 'stretch', route: i, k }, mine = sel?.kind === 'stretch' && sel.route === i && sel.k === k;
      const dFrom = Math.abs(n.s - st.from), dTo = Math.abs(n.s - to), end = dFrom <= dTo ? 'from' : 'to', de = Math.min(dFrom, dTo);
      if (de < c.point) out.push({ item, part: end, d: de, rank: mine ? RANK.selEnd : RANK.end });
      else if (n.s >= st.from && n.s <= to) out.push({ item, part: 'body', d: n.dist, rank: RANK.stretch });
    });
  }
  return out.sort((a, b) => a.rank - b.rank || a.d - b.d);
}

/**
 * How far along a route a point is (studs from its start), carried on past its ends: a point beyond the end is
 * further along than the route is long, one before the start less than 0. (What a dragged stretch goes by: so it
 * can say the track ends here when the pointer is past it.)
 */
export function alongBeyond(r: DRoute, p: [number, number]): number {
  const n = nearestAlong(r, p), L = cutLength(r);
  const past = (q: { x: number; y: number; heading: number }) => { const h = (q.heading * Math.PI) / 180; return -(p[0] - q.x) * Math.sin(h) + (p[1] - q.y) * Math.cos(h); };
  if (n.s >= L - 1e-6) return L + Math.max(0, past(follow(r, r.segs)));
  if (n.s <= 1e-6) return Math.min(0, past(r));
  return n.s;
}

// ---------- what each is called ----------
const nameOf = (d: Design, i: number) => d.routes[i]?.name || `Route ${i + 1}`;
/** The joints an item stands for: every joint at its track's end, or every joint between its two tracks. */
export function jointsOf(item: Item | undefined, js: readonly Joint[]): Joint[] {
  if (item?.kind !== 'joint') return [];
  const { route, end, other } = item;
  if (other !== undefined) return js.filter((j) => (j.a === route && j.b === other) || (j.a === other && j.b === route));
  return js.filter((j) => (j.a === route && j.aEnd === end) || (j.b === route && j.bEnd === end));
}
/** Where a joint is, in words: "A's end on B's start", "A's start on B's side, 12 studs along". */
export function jointWhere(d: Design, j: Joint): string {
  return `${nameOf(d, j.a)}'s ${j.aEnd} on ${nameOf(d, j.b)}'s ${j.bEnd ?? `side, ${+j.s.toFixed(1)} studs along`}`;
}
/** What an item is, for the selection bar and its card: "Cut across Main, 12 studs from its start". Undefined: it isn't there any more. */
export function itemLabel(d: Design, item: Item, js: readonly Joint[] = []): string | undefined {
  switch (item.kind) {
    case 'route': return d.routes[item.route] ? nameOf(d, item.route) : undefined;
    case 'table': { const t = d.tables?.[item.table]; return t ? t.name || `Table ${item.table + 1}` : undefined; }
    case 'cut': { const at = d.routes[item.route]?.cuts?.[item.k]; return at === undefined ? undefined : `Cut across ${nameOf(d, item.route)}, ${+at.toFixed(2)} studs from its start`; }
    case 'cutpath': { const k = (d.expert?.cutPaths ?? []).findIndex((p) => p.id === item.id); return k < 0 ? undefined : `Cut path ${k + 1}`; }
    case 'stretch': { const st = d.routes[item.route]?.stretches?.[item.k]; return st ? `Stretch ${item.k + 1} of ${nameOf(d, item.route)}, ${st.from} to ${st.to} studs` : undefined; }
    case 'joint': {
      const mine = jointsOf(item, js), names = [...new Set(mine.flatMap((j) => [j.a, j.b]))].map((i) => nameOf(d, i));
      if (!mine.length) return undefined;
      return `Joint between ${names.length <= 3 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`}${mine.every((j) => j.apart) ? ', taken apart' : ''}`;
    }
  }
}

// ---------- stretches dragged on the plan ----------
/** Where a dragged stretch is put, and why it stopped short of the pointer (undefined: it didn't). */
export interface StretchPut { from: number; to: number; why?: string }
/** The whole studs a stretch may lie between: the stretch before it (or the track's start) and the one after (or its end). */
function room(r: Pick<DRoute, 'segs' | 'stretches'>, k: number): { lo: number; hi: number; L: number; before?: number; after?: number } {
  const st = r.stretches ?? [], L = cutLength(r);
  return { lo: k > 0 ? st[k - 1].to : 0, hi: k < st.length - 1 ? st[k + 1].from : Math.ceil(L - 1e-9), L, ...(k > 0 && { before: k }), ...(k < st.length - 1 && { after: k + 2 }) };
}
const startMost = (L: number) => Math.max(0, Math.floor(L - STRETCH_MIN + 1e-9));
const whyLo = (m: { lo: number; before?: number }) => (m.before !== undefined ? `Stretch ${m.before} ends at ${m.lo}: stretches can't run over each other` : 'The track starts here');
const whyHi = (m: { hi: number; L: number; after?: number }) => (m.after !== undefined ? `Stretch ${m.after} starts at ${m.hi}: stretches can't run over each other` : `The track ends here (${+m.L.toFixed(1)} studs long)`);
const SHORT = `A stretch is at least ${STRETCH_MIN} studs long`;

/**
 * Route r's stretch k with one end dragged to s studs along the track: on a whole stud, never past the track's end
 * or into the stretch beside it, never under STRETCH_MIN long; why says what held it when the pointer is further on.
 */
export function dragStretchEnd(r: Pick<DRoute, 'segs' | 'stretches'>, k: number, end: 'from' | 'to', s: number): StretchPut {
  const st = r.stretches![k], m = room(r, k), want = Math.round(s);
  if (end === 'from') {
    const max = Math.min(st.to - STRETCH_MIN, startMost(m.L));
    if (max < m.lo) return { from: st.from, to: st.to, why: SHORT };
    const from = Math.min(max, Math.max(m.lo, want));
    return { from, to: st.to, ...(want < m.lo ? { why: whyLo(m) } : want > max && { why: st.to - STRETCH_MIN <= startMost(m.L) ? SHORT : `The track is ${+m.L.toFixed(1)} studs long: a stretch starts at ${startMost(m.L)} at most` }) };
  }
  const min = st.from + STRETCH_MIN;
  if (m.hi < min) return { from: st.from, to: st.to, why: SHORT };
  const to = Math.min(m.hi, Math.max(min, want));
  return { from: st.from, to, ...(want > m.hi ? { why: whyHi(m) } : want < min && { why: SHORT }) };
}
/** Route r's stretch k moved along the track by `by` studs, as long as it was: held at the track's ends and at the stretches beside it. */
export function dragStretchWhole(r: Pick<DRoute, 'segs' | 'stretches'>, k: number, by: number): StretchPut {
  const st = r.stretches![k], m = room(r, k), len = st.to - st.from, want = st.from + Math.round(by);
  const max = Math.min(m.hi - len, startMost(m.L));
  if (max < m.lo) return { from: st.from, to: st.to, why: want < st.from ? whyLo(m) : whyHi(m) };
  const from = Math.min(max, Math.max(m.lo, want));
  return { from, to: from + len, ...(want < m.lo ? { why: whyLo(m) } : want > max && { why: whyHi(m) }) };
}
/**
 * A new stretch dragged out along route r from s0 to s1 (studs along, either way round): on whole studs, in the
 * room there is where the drag began (between the stretches there are, and the track's ends). problem: none can be
 * there, and why.
 */
export function newStretchAt(r: Pick<DRoute, 'segs' | 'stretches'>, s0: number, s1: number): StretchPut | { problem: string } {
  const st = r.stretches ?? [], L = cutLength(r);
  // (a press within half a stud of a stretch's end is beside it, not on it)
  const inside = st.findIndex((x) => x.from + 0.5 < s0 && s0 < x.to - 0.5);
  if (inside >= 0) return { problem: `Stretch ${inside + 1} is here already: drag its ends, or start beside it` };
  const before = st.filter((x) => x.to <= s0 + 0.5), after = st.filter((x) => x.from >= s0 - 0.5);
  const lo = before.length ? before[before.length - 1].to : 0, hi = after.length ? after[0].from : Math.ceil(L - 1e-9);
  const a = Math.round(Math.min(s0, s1)), b = Math.round(Math.max(s0, s1));
  if (hi - lo < STRETCH_MIN || lo > L - STRETCH_MIN + 1e-9) return { problem: `No room for a stretch here: under ${STRETCH_MIN} studs ${before.length || after.length ? 'beside the stretches there are' : 'of track'}` };
  const from = Math.min(Math.max(a, lo), Math.min(hi, startMost(L))), to = Math.min(Math.max(b, lo), hi);
  const m = { lo, hi, L, ...(before.length && { before: before.length }), ...(after.length && { after: before.length + 1 }) };
  if (to - from < STRETCH_MIN) return { problem: b > hi && after.length ? whyHi(m) : a < lo && before.length ? whyLo(m) : `Drag further along the track: ${SHORT[0].toLowerCase()}${SHORT.slice(1)}` };
  return { from, to, ...(a < lo ? { why: whyLo(m) } : b > hi && { why: whyHi(m) }) };
}
/** Route r's stretches with a new one put in, in order. */
export function withStretch(st: Stretch[] | undefined, from: number, to: number): { list: Stretch[]; k: number } {
  const list = [...(st ?? []), { from, to, own: {} }].sort((a, b) => a.from - b.from);
  return { list, k: list.findIndex((x) => x.from === from && x.to === to) };
}

// ---------- the Expert tools switch ----------
/** What a track has that only the expert tools show: its hand cuts, its own settings, its stretches. */
export interface ByHand { cuts: number; only: boolean; own: number; stretches: number }
export function byHand(d: Design, r: DRoute): ByHand {
  return { cuts: r.cuts?.length ?? 0, only: r.cutsLocked === true, own: Object.keys(liveOwn(d, r)).length, stretches: r.stretches?.length ?? 0 };
}
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/**
 * The line a track's card has while the expert tools are hidden, if the track has anything they'd show ("Has 2 cuts
 * by hand, 1 setting of its own, 1 stretch"): what is in force is never out of sight. Undefined: nothing.
 */
export function byHandNote(d: Design, r: DRoute): string | undefined {
  const h = byHand(d, r);
  const parts = [h.cuts ? `${count(h.cuts, 'cut')} by hand${h.only ? ' (only these)' : ''}` : h.only ? 'no cuts (one part, by hand)' : '',
    h.own ? count(h.own, 'setting of its own', 'settings of its own') : '', h.stretches ? count(h.stretches, 'stretch', 'stretches') : ''].filter(Boolean);
  return parts.length ? `Has ${parts.join(', ')}` : undefined;
}
/** The same for what belongs to no one track: the design's cut paths. */
export function designByHandNote(d: Design): string | undefined {
  const n = d.expert?.cutPaths?.length ?? 0;
  return n ? `This design has ${count(n, 'cut path')}` : undefined;
}
/** A route card's sections that only the expert tools show (cardsections.ts ids). */
export const EXPERT_SECTIONS: readonly string[] = ['bed', 'cuts'];

// ---------- the Pick list: what a click on the plan takes ----------
/** What's on the plan to pick, in layers: more come with the later stages (sleepers, rails, ballast). */
export type Layer = 'track' | 'cut' | 'stretch' | 'joint' | 'mark';
export const PICKS = [
  { id: 'all', label: 'Everything', tip: 'A click takes whatever is under it: a track, a cut, a stretch, points or a lever' },
  { id: 'track', label: 'Tracks and tables', tip: 'Only tracks, their ends and handles, and tables' },
  { id: 'cut', label: 'Cuts and cut paths', tip: 'Only cuts across a track and cut paths' },
  { id: 'stretch', label: 'Stretches', tip: 'Only stretches with their own settings, on any track' },
  { id: 'joint', label: 'Joints', tip: 'Only the joints between tracks: a click selects one, to take apart or join' },
  { id: 'mark', label: 'Points, levers, check rails', tip: 'Only the trackwork the app works out: points, levers, check rail and flangeway cut ends' },
] as const;
export type PickId = (typeof PICKS)[number]['id'];
export const isPick = (v: unknown): v is PickId => PICKS.some((p) => p.id === v);
/** The layer an item is in. */
export const layerOf = (kind: ItemKind): Layer => (kind === 'route' || kind === 'table' ? 'track' : kind === 'cutpath' ? 'cut' : kind);
/**
 * May a click take something of this layer? With the expert tools hidden: tracks, the app's trackwork and joints, as
 * ever, and no cut or stretch; with them shown, what the Pick list says.
 */
export const picks = (pick: PickId, layer: Layer, expert: boolean): boolean => (expert ? pick === 'all' || pick === layer : layer === 'track' || layer === 'mark' || layer === 'joint');
