// Connections between tracks (expert mode, docs/expert-mode.md, Connections). They aren't stored: two tracks are
// joined where an end of one lies on the other's centre line, in line with it there: on its end (the two run on from
// each other, or part there as points do), or part way along it (a branch off its side). A narrow-gauge track's end on
// dual-gauge track lies where that track's narrow gauge is, beside its middle (routeedits.ts gaugeMeet). Tracks that
// merely cross aren't joined. The one thing that can't be worked out is "these touch but aren't joined": that is
// stored, Design.expert.apart, pairs of route names, and dropped again once the two no longer touch.
//
// From the joints: the tracks joined to a track, directly or through others (what a move takes along), and what a
// reshaped track carries (what's joined to it past where it changes goes with that place, rigidly, so the joint stays
// closed; where that can't be, a loop, the joint that opens is said).
import { type Design, type DRoute, type DSeg, isMono } from './design';
import { follow, type Pose, reversed } from './planner';
import { gaugeMeet } from './routeedits';
import { APART_MAX } from './cutpaths';
export { APART_MAX, cleanApart } from './cutpaths';

export type End = 'start' | 'end';
/** Two routes (by name) that touch but were taken apart. */
export type Apart = [string, string];
/**
 * A joint: route a's end (aEnd) lies on route b's centre line, in line: on b's end (bEnd), or s studs along b from its
 * start (a branch off b's side). at: where (studs). apart: the two were taken apart (they touch, but neither takes
 * the other along).
 */
export interface Joint { a: number; aEnd: End; b: number; bEnd?: End; s: number; at: [number, number]; apart?: boolean }

/** How near an end must be to the other track's line (studs), and how nearly in line (degrees): as splitmerge.ts meeting. */
export const JOIN_POS = 0.05, JOIN_ANG = 0.5;

type Placed = Pick<DRoute, 'x' | 'y' | 'heading' | 'segs'>;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
const segLen = (sg: DSeg) => (sg.kind === 'straight' ? sg.studs : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180);
const lengthOf = (segs: DSeg[]) => segs.reduce((t, sg) => t + segLen(sg), 0);
const idOf = (d: Design, i: number) => d.routes[i]?.name || String(i);
const startOf = (r: Placed): Pose => ({ x: r.x, y: r.y, heading: r.heading });

/** The pose a route has t studs along it from its start (the way it runs there, as drawn). */
export function poseAt(r: Placed, t: number): Pose {
  let q = startOf(r), left = Math.max(0, t);
  for (const sg of r.segs) {
    const l = segLen(sg);
    if (left <= l + 1e-9) return follow(q, [sg.kind === 'straight' ? { kind: 'straight', studs: Math.min(left, l) } : { ...sg, angle: l > 0 ? (sg.angle * Math.min(left, l)) / l : 0 }]);
    q = follow(q, [sg]); left -= l;
  }
  return follow(q, []);
}

/** Where on route b's centre line (lat studs to its right) a point lies, if it does: how far along, and the way b runs there. */
function where(b: Placed, p: [number, number], lat: number): { s: number; heading: number } | undefined {
  let q = startOf(b), acc = 0;
  for (const sg of b.segs) {
    const h = rad(q.heading), rx = Math.cos(h), ry = Math.sin(h), dx = p[0] - q.x, dy = p[1] - q.y;
    if (sg.kind === 'straight') {
      const t = -dx * ry + dy * rx, l = dx * rx + dy * ry;
      if (t >= -JOIN_POS && t <= sg.studs + JOIN_POS && Math.abs(l - lat) <= JOIN_POS) return { s: acc + Math.min(sg.studs, Math.max(0, t)), heading: q.heading };
    } else if (sg.radius > 0 && sg.angle) {
      const sn = Math.sign(sg.angle), cx = q.x - sn * sg.radius * rx, cy = q.y - sn * sg.radius * ry, vx = p[0] - cx, vy = p[1] - cy;
      if (Math.abs(sn * (Math.hypot(vx, vy) - sg.radius) - lat) <= JOIN_POS) {
        // (how far round the curve the point is, its own way round: just short of the start counts as the start)
        const A = Math.abs(sg.angle), tol = deg(JOIN_POS / sg.radius);
        let phi = ((((deg(Math.atan2(vy, vx) - Math.atan2(sn * ry, sn * rx)) * sn) % 360) + 360) % 360);
        if (phi > A + tol && phi >= 360 - tol) phi -= 360;
        if (phi >= -tol && phi <= A + tol) { const f = Math.min(A, Math.max(0, phi)); return { s: acc + sg.radius * rad(f), heading: q.heading + sn * f }; }
      }
    }
    acc += segLen(sg); q = follow(q, [sg]);
  }
  return undefined;
}

/** An end e of route ra on route rb (L studs long), if it lies on rb's line, in line with it: how far along rb. */
function meetsAt(d: Design, ra: DRoute, e: Pose, rb: DRoute, L: number): { s: number; bEnd?: End; at: [number, number] } | undefined {
  // (too far from rb's start to be on it at all: not walked along)
  const dx = e.x - rb.x, dy = e.y - rb.y;
  if (dx * dx + dy * dy > (L + 8) * (L + 8) || isMono(ra) !== isMono(rb)) return undefined;
  // (dual-gauge track and its narrow gauge alone: the narrow gauge's middle is beside the dual-gauge track's)
  const m = ra.dualGauge || rb.dualGauge ? gaugeMeet(d, ra, rb) : undefined, offA = m?.dual === 'a' ? m.off : 0, lat = m?.dual === 'b' ? m.off : 0;
  const h = rad(e.heading), w = where(rb, [e.x + offA * Math.cos(h), e.y + offA * Math.sin(h)], lat);
  if (!w) return undefined;
  const dh = Math.abs(norm180(e.heading - w.heading));
  if (dh > JOIN_ANG && 180 - dh > JOIN_ANG) return undefined;
  const bEnd = w.s <= JOIN_POS ? 'start' : w.s >= L - JOIN_POS ? 'end' : undefined;
  return { s: w.s, ...(bEnd && { bEnd }), at: [e.x, e.y] };
}
/** Route a's end on route b, likewise. */
function meets(d: Design, a: number, aEnd: End, b: number) {
  const ra = d.routes[a], rb = d.routes[b];
  if (!ra?.segs.length || !rb?.segs.length || a === b) return undefined;
  return meetsAt(d, ra, aEnd === 'start' ? startOf(ra) : follow(ra, ra.segs), rb, lengthOf(rb.segs));
}

const pairKey = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
const apartKeys = (d: Design) => new Set((d.expert?.apart ?? []).map(([a, b]) => pairKey(a, b)));

/** Every joint in the design: each end that lies on another track, in line (two ends that meet: once). Those taken apart are marked. */
export function joints(d: Design): Joint[] {
  const out: Joint[] = [], seen = new Set<string>(), ap = apartKeys(d), rs = d.routes, n = rs.length, len = rs.map((r) => lengthOf(r.segs)), far = len.map((l) => (l + 8) * (l + 8));
  for (let a = 0; a < n; a++) for (const aEnd of ['start', 'end'] as const) {
    if (!rs[a].segs.length) continue;
    const e = aEnd === 'start' ? startOf(rs[a]) : follow(rs[a], rs[a].segs);
    for (let b = 0; b < n; b++) {
    // (most are nowhere near: told here, without a call)
    const dx = e.x - rs[b].x, dy = e.y - rs[b].y;
    if (b === a || dx * dx + dy * dy > far[b]) continue;
    const m = rs[b].segs.length ? meetsAt(d, rs[a], e, rs[b], len[b]) : undefined;
    if (!m) continue;
    if (m.bEnd) {
      const key = a < b ? `${a}${aEnd}:${b}${m.bEnd}` : `${b}${m.bEnd}:${a}${aEnd}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push({ a, aEnd, b, ...(m.bEnd && { bEnd: m.bEnd }), s: m.s, at: m.at, ...(ap.size > 0 && ap.has(pairKey(idOf(d, a), idOf(d, b))) && { apart: true }) });
    }
  }
  return out;
}

/** Is this joint still closed in the design as it is now (its end still on the other track, in line: anywhere along it)? */
export const holds = (d: Design, j: Joint): boolean => !!meets(d, j.a, j.aEnd, j.b);

/** The routes joined to each route (not through joints taken apart; not: a route left out of it all). */
function linked(n: number, js: Joint[], not = -1): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const j of js) if (!j.apart && j.a !== not && j.b !== not && j.a < n && j.b < n) { adj[j.a].push(j.b); adj[j.b].push(j.a); }
  return adj;
}
function reach(adj: number[][], from: readonly number[]): number[] {
  const seen = new Set<number>(from.filter((i) => i >= 0 && i < adj.length)), todo = [...seen];
  for (let k = 0; k < todo.length; k++) for (const o of adj[todo[k]]) if (!seen.has(o)) { seen.add(o); todo.push(o); }
  return todo;
}

/**
 * The tracks joined to these, directly or through others (the connected set: what a move takes along): the ones
 * asked about first, then the rest. js: the design's joints, where they're in hand.
 */
export function connectedSet(d: Design, from: readonly number[], js: Joint[] = joints(d)): number[] {
  return reach(linked(d.routes.length, js), from);
}

/** "T7 and T1", "T7 and T1, T3 and T4", "T7 and T1 and 2 more joints": the joints, by their tracks' names. */
export function jointNames(d: Design, js: Joint[]): string {
  const pairs = [...new Set(js.map((j) => `${idOf(d, j.a)} and ${idOf(d, j.b)}`))];
  return pairs.length <= 2 ? pairs.join(', ') : `${pairs[0]} and ${pairs.length - 1} more joints`;
}

// ---------- taken apart (Design.expert.apart) ----------

/** The design's expert part with nothing empty left in it (none at all: left out). */
export function tidyExpert(d: Design) {
  const e = d.expert;
  if (!e) return;
  if (!e.apart?.length) delete e.apart;
  if (!e.cutPaths?.length) delete e.cutPaths;
  if (!Object.keys(e).length) delete d.expert;
}

/** Two routes (by name) taken apart (on), or joined again (off). */
export function setApart(d: Design, a: string, b: string, on: boolean) {
  const key = pairKey(a, b), left = (d.expert?.apart ?? []).filter(([x, y]) => pairKey(x, y) !== key);
  if (on && a !== b && left.length < APART_MAX) left.push([a, b]);
  (d.expert ??= {}).apart = left;
  tidyExpert(d);
}

/** Pairs taken apart that no longer touch are forgotten (moved together again, they join as any two tracks do). True if any went. */
export function pruneApart(d: Design, js: Joint[] = joints(d)): boolean {
  const ap = d.expert?.apart;
  if (!ap?.length) return false;
  const touching = new Set(js.map((j) => pairKey(idOf(d, j.a), idOf(d, j.b)))), left = ap.filter(([a, b]) => touching.has(pairKey(a, b)));
  if (left.length === ap.length) return false;
  d.expert!.apart = left; tidyExpert(d);
  return true;
}

/** A route renamed, or made part of another (joined onto it): what it was apart from, the route it is now is. */
export function renameApart(d: Design, was: string, now: string) {
  const ap = d.expert?.apart;
  if (!ap?.length) return;
  const seen = new Set<string>(), out: Apart[] = [];
  for (const [a, b] of ap) {
    const p: Apart = [a === was ? now : a, b === was ? now : b], key = pairKey(p[0], p[1]);
    if (p[0] === p[1] || seen.has(key)) continue;
    seen.add(key); out.push(p);
  }
  d.expert!.apart = out; tidyExpert(d);
}

/** A route split in two: its second half is apart from what the route was (the pairs that no longer touch go at the next pruneApart). */
export function splitApart(d: Design, name: string, second: string) {
  const ap = d.expert?.apart;
  if (!ap?.length) return;
  for (const [a, b] of [...ap]) if ((a === name) !== (b === name) && ap.length < APART_MAX) ap.push([a === name ? second : a, b === name ? second : b]);
}

// ---------- what a reshaped track carries ----------

/**
 * What a track carries when it's reshaped: route's own place and shape before; the groups of tracks joined to it past
 * where it changes (each: how far along it from its fixed end its joint was, studs, and where each of its tracks
 * was), and the joints to watch (those of everything joined to it: the ones that open are said).
 */
export interface Carry { route: number; fixed: End; before: Placed; groups: { at: number; routes: { i: number; x: number; y: number; heading: number }[] }[]; watch: Joint[] }

/**
 * Before route is reshaped: what will go with it. fixed: the end of it that stays; s0: how far from that end (studs)
 * it stays as it is (-1: none of it: the track is moved or turned as a whole). What's joined to it within that
 * stays; what's joined to it further on goes with its joint, the far end's first; tracks reached both ways (a loop)
 * stay with the part that doesn't move, so the joint at the far side opens. Tracks joined to a locked one stay too.
 */
export function planCarry(d: Design, route: number, fixed: End, s0: number, js: Joint[] = joints(d)): Carry {
  const r = d.routes[route], before: Placed = { x: r.x, y: r.y, heading: r.heading, segs: structuredClone(r.segs) }, L = lengthOf(r.segs);
  const live = js.filter((j) => !j.apart), adj = linked(d.routes.length, live, route);
  const mine = live.filter((j) => j.a === route || j.b === route).map((j) => {
    const t = j.a === route ? (j.aEnd === 'start' ? 0 : L) : j.s;
    return { other: j.a === route ? j.b : j.a, at: fixed === 'start' ? t : L - t };
  });
  const stay = new Set(reach(adj, mine.filter((m) => m.at <= s0 + JOIN_POS).map((m) => m.other)));
  const groups: Carry['groups'] = [];
  for (const m of mine.filter((q) => q.at > s0 + JOIN_POS).sort((p, q) => q.at - p.at)) {
    if (stay.has(m.other)) continue;
    const comp = reach(adj, [m.other]);
    for (const i of comp) stay.add(i);
    if (comp.some((i) => d.routes[i].locked)) continue;
    groups.push({ at: m.at, routes: comp.map((i) => ({ i, x: d.routes[i].x, y: d.routes[i].y, heading: d.routes[i].heading })) });
  }
  const set = new Set([route, ...stay]);
  return { route, fixed, before, groups, watch: live.filter((j) => set.has(j.a) || set.has(j.b)) };
}

const sameSeg = (a: DSeg, b: DSeg) => a.kind === b.kind && (a.kind === 'straight' ? a.studs === (b as typeof a).studs : a.radius === (b as typeof a).radius && a.angle === (b as typeof a).angle);

/**
 * Where a place on a track (studs from its fixed end) goes when the track is reshaped: within the part that's the
 * same, where it was; the far end, the new far end; with one piece changed (a handle, a number), in its piece at the
 * same distance from that piece's start, or as much further on as the piece grew (routecuts.ts alongAfter's rule);
 * else (the rest laid anew) as far along as it was, the new end at most.
 */
function alongNew(before: DSeg[], after: DSeg[]): (t: number) => number {
  const Lb = lengthOf(before), La = lengthOf(after);
  let k = 0, s0 = 0;
  while (k < before.length && k < after.length && sameSeg(before[k], after[k])) { s0 += segLen(before[k]); k++; }
  const one = before.length === after.length && k < before.length && before[k].kind === after[k].kind && before.slice(k + 1).every((sg, n) => sameSeg(sg, after[k + 1 + n]));
  const was = one ? segLen(before[k]) : 0, now = one ? segLen(after[k]) : 0;
  return (t) => (t <= s0 + 1e-6 ? t : t >= Lb - 1e-6 ? La : one ? (t <= s0 + was + 1e-6 ? s0 + Math.min(t - s0, now) : t + now - was) : Math.min(t, La));
}

/**
 * The carried tracks put where the reshaped route now takes them: each group turned and moved as its joint's place
 * on the route was (worked out from where everything was at the start, so nothing drifts). alone: nothing is carried
 * (Alt): they go back where they were. True if any track moved.
 */
export function applyCarry(c: Carry, d: Design, alone = false): boolean {
  const r = d.routes[c.route];
  if (!r) return false;
  const was = c.fixed === 'start' ? c.before : reversed(c.before), now = c.fixed === 'start' ? r : reversed(r), at = alongNew(was.segs, now.segs);
  let any = false;
  for (const g of c.groups) {
    const P = poseAt(was, g.at), Q = poseAt(now, at(g.at)), turn = alone ? 0 : norm180(Q.heading - P.heading), cs = Math.cos(rad(turn)), sn = Math.sin(rad(turn));
    const still = alone || (Math.abs(turn) < 1e-9 && Math.abs(Q.x - P.x) < 1e-9 && Math.abs(Q.y - P.y) < 1e-9);
    for (const o of g.routes) {
      const t = d.routes[o.i];
      if (!t) continue;
      const dx = o.x - P.x, dy = o.y - P.y;
      const x = still ? o.x : r6(Q.x + dx * cs - dy * sn), y = still ? o.y : r6(Q.y + dx * sn + dy * cs), heading = still ? o.heading : r6(norm180(o.heading + turn));
      if (t.x !== x || t.y !== y || t.heading !== heading) { t.x = x; t.y = y; t.heading = heading; any = true; }
    }
  }
  return any;
}

/** The watched joints that are open now (they were closed when the reshape or the move began). */
export const openedBy = (c: { watch: Joint[] }, d: Design): Joint[] => c.watch.filter((j) => !holds(d, j));

/**
 * Route i was changed on its card (before: the design as it was): what's joined to it goes with it. Moved or turned
 * as it is: everything joined to it, as one. One end where it was and its shape changed: what's joined to it past
 * the change, as a handle dragged carries it. (Both ends moved and its shape changed, as a track turned end for end:
 * nothing.) Returns the joints that opened.
 */
export function carryChange(before: Design, d: Design, i: number): Joint[] {
  const o = before.routes[i], n = d.routes[i];
  if (!o || !n || before.routes.length !== d.routes.length || !o.segs.length || !n.segs.length) return [];
  const samePose = (p: Pose, q: Pose) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6 && Math.abs(norm180(p.heading - q.heading)) < 1e-6;
  const sameShape = o.segs.length === n.segs.length && o.segs.every((sg, k) => sameSeg(sg, n.segs[k]));
  const start = samePose(startOf(o), startOf(n)), end = samePose(follow(o, o.segs), follow(n, n.segs));
  if (start && end) return [];
  const common = (a: DSeg[], b: DSeg[]) => { let s = 0; for (let k = 0; k < a.length && k < b.length && sameSeg(a[k], b[k]); k++) s += segLen(a[k]); return s; };
  let c: Carry;
  if (sameShape) c = planCarry(before, i, 'start', -1);
  else if (start) c = planCarry(before, i, 'start', common(o.segs, n.segs));
  else if (end) c = planCarry(before, i, 'end', common(reversed(o).segs, reversed(n).segs));
  else return [];
  applyCarry(c, d);
  return openedBy(c, d);
}
