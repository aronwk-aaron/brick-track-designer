// The trackwork's hand edits follow the track. An edit is kept by where its item is (design.trackwork: "x,y" in mm,
// as the build knows each check rail, flangeway cut and points set); so that it isn't left behind when its track is
// moved, turned, mirrored or joined to another, each edit also says which route it's on and where along it (on),
// and its place is worked out again from that whenever the design changes. An edit whose item is gone from there
// (its route deleted, the tracks no longer meeting) stays in the design, to be listed as left over and removed by hand.
// A route reshaped (a curve's radius, a straight's length) moves the crossings and points along the routes it meets, by
// more than an edit's place on its own route says: so each edit also says what its item is (is: the routes it's
// between, the side, which of the ones like it), and goes to that item wherever it is now. Routes copied take the
// edits between them along (copyEdits, pasteEdits).
import { type Design, toRoutes, type Trackwork } from './design';
import { type Route, routeLength, routePose } from '../route/route';

/** Where on the track an edit is: the route (by name), from its start ('s') or its end ('e'), how far along (mm), and how far to the right of its centre line (mm). */
export type Anchor = [route: string, from: 's' | 'e', along: number, right: number];
export const KINDS = ['points', 'throw', 'check', 'groove'] as const;
export type Kind = (typeof KINDS)[number];
/**
 * What an edit's item is: the routes it's between (by name: points, the two that part; a flangeway cut, the rail's route
 * and the one whose flanges cut it; a check rail, its route and the one crossing it there), which side of the first
 * one's centre line it's on (-1 left, 1 right, 0 on it), and which of the items like it, counted along that route
 * from its start (nth, from 0, of so many).
 */
export type Ident = [routes: string[], side: number, nth: number, of: number];
type Entry = Record<string, unknown> & { on?: Anchor; is?: Ident };
type Groups = Partial<Record<Kind, Record<string, Entry>>>;
/** An item the build worked out (its key, and where exactly it is, mm). */
export interface ItemAt { kind: string; key: string; at: [number, number]; /** the routes it's between (their ids), where the build says */ routes?: string[] }

const keyOf = (q: [number, number]) => `${Math.round(q[0])},${Math.round(q[1])}`;
const posOf = (key: string): [number, number] | undefined => { const v = key.split(',').map(Number); return v.length === 2 && v.every(Number.isFinite) ? [v[0], v[1]] : undefined; };
const idOf = (d: Design, i: number) => d.routes[i].name || String(i);
/** Is an edit one (anything set in it, besides where it is and what its item is)? */
export const isEdit = (e: unknown): boolean => !!e && typeof e === 'object' && Object.entries(e).some(([k, v]) => k !== 'on' && k !== 'is' && v !== undefined && v !== false && !(Array.isArray(v) && !v.length));

/** The point at s along a route, d to the right of its centre line (mm). */
function pointOn(rt: Route, s: number, d: number): [number, number] {
  const p = routePose(rt, s), h = (p[2] * Math.PI) / 180;
  return [p[0] + d * Math.cos(h), p[1] + d * Math.sin(h)];
}
/** The nearest point of a route's centre line to q: how far along, how far to the right q is of it, and how far off. */
function project(rt: Route, q: [number, number]): { s: number; d: number; dist: number } {
  const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 2));
  const far = (s: number) => { const p = routePose(rt, s); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  let best = 0, bd = Infinity;
  for (let k = 0; k <= n; k++) { const s = (L * k) / n, v = far(s); if (v < bd) { bd = v; best = s; } }
  // (between its neighbours, to a thousandth of a micron)
  let lo = Math.max(0, best - L / n), hi = Math.min(L, best + L / n);
  for (let k = 0; k < 60; k++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (far(a) < far(b)) hi = b; else lo = a; }
  const s = (lo + hi) / 2, p = routePose(rt, s), h = (p[2] * Math.PI) / 180;
  return { s, d: (q[0] - p[0]) * Math.cos(h) + (q[1] - p[1]) * Math.sin(h), dist: far(s) };
}

/**
 * The anchor for an item at q: points (and their lever) on the route that starts or ends there, if one does (the
 * branch: the points go where it goes), else on the route whose centre line is nearest; measured from the nearer
 * end of the route, so a route made longer at its far end leaves it where it was. None with no track within reach.
 */
export function anchorAt(d: Design, kind: Kind, q: [number, number]): Anchor | undefined {
  let best: { a: Anchor; score: number } | undefined;
  toRoutes(d).forEach((rt, i) => {
    if (!rt.segments.length) return;
    const L = routeLength(rt), pr = project(rt, q);
    if (pr.dist > 80) return;
    const atEnd = Math.min(pr.s, L - pr.s) < 1 && Math.abs(pr.d) < 1;
    const score = pr.dist - ((kind === 'points' || kind === 'throw') && atEnd ? 1000 : 0);
    const a: Anchor = pr.s <= L / 2 ? [idOf(d, i), 's', pr.s, pr.d] : [idOf(d, i), 'e', L - pr.s, pr.d];
    if (!best || score < best.score - 1e-9) best = { a, score };
  });
  return best?.a;
}
/** Where an anchor is now (mm), or undefined with its route gone (or too short for it). */
export function anchored(d: Design, a: Anchor, routes = toRoutes(d)): [number, number] | undefined {
  const i = d.routes.findIndex((_, k) => idOf(d, k) === a[0]);
  if (i < 0 || !routes[i].segments.length) return undefined;
  const L = routeLength(routes[i]), s = a[1] === 's' ? a[2] : L - a[2];
  return s < -1e-6 || s > L + 1e-6 ? undefined : pointOn(routes[i], Math.min(L, Math.max(0, s)), a[3]);
}

/**
 * What an item is, among the build's (mine: the ones of its kind): undefined where the build doesn't say which routes
 * it's between, or its first route isn't one of the design's (a route that crosses itself, built in parts).
 */
export function identOf(d: Design, mine: ItemAt[], it: ItemAt, routes = toRoutes(d)): Ident | undefined {
  if (!it.routes?.length) return undefined;
  const i = d.routes.findIndex((_, k) => idOf(d, k) === it.routes![0]);
  if (i < 0 || !routes[i].segments.length) return undefined;
  const id = it.routes.join('\n'), place = (x: ItemAt) => { const pr = project(routes[i], x.at); return { x, s: pr.s, side: Math.abs(pr.d) < 1 ? 0 : Math.sign(pr.d) }; };
  const me = place(it), like = mine.filter((x) => x.kind === it.kind && x.routes?.join('\n') === id).map((x) => (x === it ? me : place(x))).filter((q) => q.side === me.side);
  // (in order along the route; two at the same place (the same toe, taken out and offered again) in the order they come)
  like.sort((a, b) => a.s - b.s);
  return [[...it.routes], me.side, like.findIndex((q) => q.x === it), like.length];
}
const sameIdent = (a: Ident, b: Ident) => a[0].join('\n') === b[0].join('\n') && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

const each = (d: Design, f: (kind: Kind, key: string, e: Entry, group: Record<string, Entry>) => void) => {
  const tw = (d.trackwork ?? {}) as Groups;
  for (const kind of KINDS) { const g = tw[kind]; if (g) for (const key of Object.keys(g)) f(kind, key, g[key], g); }
};

/**
 * After any change to the design: each edit given its anchor if it has none (from where its item is: items, the
 * build's, exactly; else its key's whole mm), and each anchored edit's key worked out again from where its route
 * is now. Entries with nothing set are dropped. Changes d.trackwork in place; true if any key changed.
 */
export function followTrackwork(d: Design, items: ItemAt[] = []): boolean {
  if (!d.trackwork) return false;
  const routes = toRoutes(d);
  let moved = false;
  const moves: [Kind, string, string][] = [];
  each(d, (kind, key, e, group) => {
    if (!isEdit(e)) { delete group[key]; return; }
    if (!e.on) {
      const it = items.find((x) => x.key === key && x.kind === (kind === 'throw' ? 'points' : kind));
      const a = anchorAt(d, kind, it?.at ?? posOf(key) ?? [NaN, NaN]);
      if (a) e.on = a;
      return;
    }
    const now = anchored(d, e.on, routes), was = posOf(key);
    if (!now || !was) return;
    // (still in its key's whole mm, give or take the working out: left alone, as the build rounds it)
    if (Math.abs(now[0] - was[0]) <= 0.51 && Math.abs(now[1] - was[1]) <= 0.51) return;
    moves.push([kind, key, keyOf(now)]);
  });
  const tw = d.trackwork as Groups;
  // (all taken out, then put back: two edits can swap places)
  const taken = moves.map(([kind, key, to]) => { const e = tw[kind]![key]; delete tw[kind]![key]; return [kind, to, e] as const; });
  for (const [kind, to, e] of taken) { if (!tw[kind]![to]) { tw[kind]![to] = e; moved = true; } }
  return moved;
}

/**
 * With the build's items in hand: an edit that's on none of them (its place worked out a hair off the build's, or the
 * track bent a little under it) goes to the item of its kind within reach of where its anchor says, if that one has
 * no edit of its own; else, its route or the one it meets reshaped and its item moved along by more than that, to
 * the item that is what its own was (is: between the same routes, on the same side, the same one of as many), if
 * that has no edit of its own. Anchors are made exact from the items, and each edit on an item notes what it is.
 * True if any key changed (build again).
 */
export function reconcileTrackwork(d: Design, items: ItemAt[], reach = 1.5): boolean {
  if (!d.trackwork) return false;
  const routes = toRoutes(d), tw = d.trackwork as Groups;
  let changed = false;
  each(d, (kind, key, e, group) => {
    const mine = items.filter((x) => x.kind === (kind === 'throw' ? 'points' : kind));
    if (!isEdit(e)) return;
    const note = (x: ItemAt) => { const id = identOf(d, mine, x, routes); if (id) e.is = id; else delete e.is; };
    const own = mine.find((x) => x.key === key);
    if (own) { note(own); return; }
    const at = (e.on && anchored(d, e.on, routes)) ?? posOf(key), free = mine.filter((x) => !tw[kind]![x.key]);
    const near = (at && free.filter((x) => Math.hypot(x.at[0] - at[0], x.at[1] - at[1]) <= reach).sort((a, b) => Math.hypot(a.at[0] - at[0], a.at[1] - at[1]) - Math.hypot(b.at[0] - at[0], b.at[1] - at[1]))[0])
      ?? (e.is && free.find((x) => { const id = identOf(d, mine, x, routes); return !!id && sameIdent(id, e.is!); }));
    if (!near) return;
    delete group[key]; group[near.key] = e; changed = true;
    const a = anchorAt(d, kind, near.at); if (a) e.on = a;
    note(near);
  });
  return changed;
}

/** The edits whose item isn't among the build's: left over, to list and remove (each: its kind, its key, and where it was, mm). */
export function leftOver(tw: Trackwork | undefined, items: ItemAt[]): { kind: Kind; key: string; at?: [number, number] }[] {
  const out: { kind: Kind; key: string; at?: [number, number] }[] = [];
  for (const kind of KINDS) for (const [key, e] of Object.entries(((tw ?? {}) as Groups)[kind] ?? {})) {
    if (isEdit(e) && !items.some((x) => x.key === key && x.kind === (kind === 'throw' ? 'points' : kind))) out.push({ kind, key, at: posOf(key) });
  }
  return out;
}

/** A route renamed: its edits' anchors with it. */
export function renameAnchors(d: Design, was: string, now: string) {
  each(d, (_k, _key, e) => {
    if (e.on?.[0] === was) e.on = [now, e.on[1], e.on[2], e.on[3]];
    if (e.is?.[0].includes(was)) e.is = [e.is[0].map((n) => (n === was ? now : n)), e.is[1], e.is[2], e.is[3]];
    if (Array.isArray(e.drop)) e.drop = e.drop.map((n) => (n === was ? now : n));
  });
}
const swap = (e: Entry, a: string, b: string) => { const va = e[a], vb = e[b]; delete e[a]; delete e[b]; if (vb !== undefined) e[a] = vb; if (va !== undefined) e[b] = va; };
/** A route turned end for end (routeedits.ts reversedRoute): its edits measured from its other end, on its other side; a check rail's or cut's start and end swapped. */
export function reverseAnchors(d: Design, name: string) {
  each(d, (kind, _key, e) => {
    // (what's counted along it and to its side: from its other end, on its other side)
    if (e.is?.[0][0] === name) e.is = [e.is[0], -e.is[1] || 0, e.is[3] - 1 - e.is[2], e.is[3]];
    if (e.on?.[0] !== name) return;
    e.on = [name, e.on[1] === 's' ? 'e' : 's', e.on[2], -e.on[3]];
    if (kind === 'check' || kind === 'groove') swap(e, 'd0', 'd1');
  });
}
/** Routes mirrored (routeedits.ts mirrorRoute): their edits on the other side of them, a lever set left or right the other way. */
export function mirrorAnchors(d: Design, names: string[]) {
  each(d, (kind, _key, e) => {
    if (e.is && names.includes(e.is[0][0])) e.is = [e.is[0], -e.is[1] || 0, e.is[2], e.is[3]];
    if (!e.on || !names.includes(e.on[0])) return;
    e.on = [e.on[0], e.on[1], e.on[2], -e.on[3]];
    if (kind === 'throw' && (e.side === 'left' || e.side === 'right')) e.side = e.side === 'left' ? 'right' : 'left';
  });
}
/** Route b's track added to the end of route a (b gone): b's edits are a's now, each as far from the joined track's ends as it is. lenA, lenB: their lengths before, mm; bReversed: b's end met a's end. */
export function joinAnchors(d: Design, a: string, b: string, lenA: number, lenB: number, bReversed: boolean) {
  if (bReversed) reverseAnchors(d, b);
  each(d, (_k, _key, e) => {
    // (b's items are between a and what b met; which of them each is, noted again once they're built)
    if (e.is?.[0].includes(b)) e.is = [e.is[0].map((n) => (n === b ? a : n)), e.is[1], e.is[2], e.is[3]];
    if (!e.on) return;
    // (all from the joined track's start: nothing's measured from an end that's moved)
    if (e.on[0] === a && e.on[1] === 'e') e.on = [a, 's', lenA - e.on[2], e.on[3]];
    else if (e.on[0] === b) e.on = [a, 's', lenA + (e.on[1] === 's' ? e.on[2] : lenB - e.on[2]), e.on[3]];
  });
}

/**
 * A route cut in two at s (mm along it, of L): the first half keeps the name a, the second is b. The mirror of joinAnchors:
 * each edit on a goes to the half it's in (those in the first half measured from its start, the second's from where it was
 * measured: its end, or the cut); an edit that says it's between a and another route goes with a or b by where it is
 * (rt: the route as it was). What says "which of the items like it" is dropped (counted along the whole route; worked out again once built).
 * Call before the design's routes are changed.
 */
export function splitAnchors(d: Design, a: string, b: string, s: number, L: number, rt: Route) {
  each(d, (_k, key, e) => {
    let second: boolean | undefined;
    if (e.on?.[0] === a) {
      const from = e.on[1] === 's' ? e.on[2] : L - e.on[2];
      second = from > s;
      if (second) e.on = e.on[1] === 's' ? [b, 's', from - s, e.on[3]] : [b, 'e', e.on[2], e.on[3]];
      else e.on = [a, 's', from, e.on[3]];
    }
    if (!e.is?.[0].includes(a)) return;
    if (second === undefined) { const q = posOf(key); second = q ? project(rt, q).s > s : false; }
    const primary = e.is[0][0] === a;
    if (second) e.is = [e.is[0].map((n) => (n === a ? b : n)), e.is[1], e.is[2], e.is[3]];
    if (primary) delete e.is;
  });
}

/** An edit copied with its routes: its kind, where it is (mm), and the edit (its routes by the names they had). */
export interface CopiedEdit { kind: Kind; at: [number, number]; e: Entry }
/**
 * The edits that go with routes being copied (names): the ones whose item is between routes all of which are copied
 * (points with only one of their two routes copied aren't there in the copy); one that doesn't say what its item is
 * yet (not built since), the ones on a copied route. take: taken out of the design too (the routes cut, not copied).
 */
export function copyEdits(d: Design, names: string[], take = false): CopiedEdit[] {
  const out: CopiedEdit[] = [];
  each(d, (kind, key, e, group) => {
    const at = posOf(key);
    if (!at || !isEdit(e) || !(e.is ? e.is[0].every((n) => names.includes(n)) : !!e.on && names.includes(e.on[0]))) return;
    out.push({ kind, at, e: structuredClone(e) });
    if (take) delete group[key];
  });
  return out;
}
/**
 * Copied edits put on the copies of their routes: names, each copied route's name to its copy's; (dx, dy) how far the
 * copies are from where the routes were when copied (mm). Not where there's an edit already.
 */
export function pasteEdits(d: Design, edits: CopiedEdit[], names: Map<string, string>, dx: number, dy: number) {
  const now = (n: string) => names.get(n) ?? n;
  for (const c of edits) {
    const e = structuredClone(c.e), group = (((d.trackwork ??= {}) as Groups)[c.kind] ??= {}), key = keyOf([c.at[0] + dx, c.at[1] + dy]);
    if (group[key]) continue;
    if (e.on) e.on = [now(e.on[0]), e.on[1], e.on[2], e.on[3]];
    if (e.is) e.is = [e.is[0].map(now), e.is[1], e.is[2], e.is[3]];
    if (Array.isArray(e.drop)) e.drop = e.drop.map((n) => (typeof n === 'string' ? now(n) : n));
    group[key] = e;
  }
}
