// (expert) The settings in force where: the defaults, the design's over them, a track's own over those (DRoute.own,
// routeown.ts ROUTE_KEYS only), a feature's over all. And which tracks are built together: tracks that are one printed
// part (they meet in points or a crossing, or their beds lie side by side) take one set of part settings, the first of
// them with its own winning, said by name; tracks that come out the same are built together (build.ts buildGroups).
// Pure: the build and the route card both go by it.
import { type Design, type DRoute, isMono, OPTION_DEFAULTS, type PieceOptions, routeGaugeStuds, toRoutes } from './design';
import { routeLength, routePose } from '../route/route';
import { BANK_KEYS, isRouteKey, type Own, OWN_LABELS, PART_KEYS, ROUTE_KEYS, type RouteKey } from './routeown';

/** Where a value in force comes from, for the card. */
export type Source = 'default' | 'design' | 'route' | 'feature';

/** The design's settings: the defaults with its own over them. */
export const designOptions = (d: Design): PieceOptions => ({ ...OPTION_DEFAULTS, ...d.options });

/** A track's own settings: the ones a track may have (ROUTE_KEYS), set; none on a monorail beam. */
export function ownOf(r: DRoute): Own {
  if (!r.own || isMono(r)) return {};
  return Object.fromEntries(ROUTE_KEYS.filter((k) => r.own![k] !== undefined).map((k) => [k, r.own![k]])) as Own;
}
/** A track's own settings that differ from the design's (the rest change nothing). */
export function liveOwn(d: Design, r: DRoute, keys: readonly RouteKey[] = ROUTE_KEYS): Own {
  const o = designOptions(d), own = ownOf(r);
  return Object.fromEntries(keys.filter((k) => own[k] !== undefined && own[k] !== o[k]).map((k) => [k, own[k]])) as Own;
}
/** Has any track its own part settings (else the design builds as it always has, in one go)? */
export const hasPartOwn = (d: Design) => d.routes.some((r) => !!r.own && Object.keys(liveOwn(d, r, PART_KEYS)).length > 0);

/** What a track has of its own that isn't used, and why (a setting only the design has; any on a monorail beam). */
export function ignoredOwn(r: DRoute): { key: string; why: string }[] {
  if (!r.own) return [];
  return Object.keys(r.own).filter((k) => (r.own as Record<string, unknown>)[k] !== undefined && (isMono(r) || !isRouteKey(k)))
    .map((key) => ({ key, why: isMono(r) ? 'a monorail beam has none of these' : 'set for the whole design: parts that meet must agree' }));
}

/**
 * The settings in force on track `route` (its index, or the route): the defaults, the design's over them, the
 * track's own over those, then a feature's own (only the keys a track may have, both). (Not the part rule: what a
 * track's part takes from the tracks it's one part with is partGroups'.)
 */
export function resolveOptions(d: Design, route: number | DRoute, feature?: Partial<PieceOptions>): PieceOptions {
  const r = typeof route === 'number' ? d.routes[route] : route;
  const f = feature ? Object.fromEntries(ROUTE_KEYS.filter((k) => feature[k] !== undefined).map((k) => [k, feature[k]])) : {};
  return { ...designOptions(d), ...(r ? ownOf(r) : {}), ...f };
}
/** Where track `route`'s value of `key` comes from. */
export function sourceOf(d: Design, route: number | DRoute, key: keyof PieceOptions, feature?: Partial<PieceOptions>): Source {
  const r = typeof route === 'number' ? d.routes[route] : route;
  if (isRouteKey(key) && feature?.[key] !== undefined) return 'feature';
  if (isRouteKey(key) && r && ownOf(r)[key] !== undefined) return 'route';
  return d.options?.[key] !== undefined ? 'design' : 'default';
}

/** Two tracks' beds closer than this (mm) are one part: a gap under 2 studs is no room for two parts' edges. */
export const PART_MARGIN = 16;
/** A track this near (mm, centre line to centre line, the gauge's 1.5 rail offsets more) to where two others meet in
 * points or a crossing is one part with them: a lever beside the points is placed clear of the track past it, which
 * the build can only do with that track in the points' own group (switch/network.ts nearby: the same reach). */
export const LEVER_REACH = 32;
/** A track's bed's half width (mm), with its ballast. */
const halfBed = (d: Design, r: DRoute, o: PieceOptions) => ((routeGaugeStuds(d, r) + 1) * 8 + 24) / 2 + (o.ballast === 'buddy' ? 16 : o.ballast === 'ballast' ? 8 : 0);

export interface PartGroups {
  /** the tracks built together (indices into d.routes, train track only), and the settings they're built with */
  groups: { routes: number[]; options: Partial<PieceOptions> }[];
  /** for each track: the track whose part settings it takes, where that's another's */
  takes: (number | undefined)[];
  /** each track's settings in force (its part's, and its own banks); a monorail's: the design's */
  inForce: PieceOptions[];
  /** "T2 and T5 are one part: both take T2's Ballast" */
  warnings: string[];
}

/**
 * Which tracks are one printed part: they meet in points or a crossing, or their beds (with the ballast each has)
 * lie within PART_MARGIN of each other. Tracks joined end to end in line are two parts (an ordinary track end
 * between them), unless one is dual gauge or their gauges differ (the gauges part there, in one piece); and two
 * with a short track joined on between them are near each other only along the line, not side by side. Returns,
 * for each train track, its part's number (the lowest track index in it).
 */
export function partsOf(d: Design): number[] {
  const n = d.routes.length, rts = toRoutes(d), parent = d.routes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) parent[Math.max(x, y)] = Math.min(x, y); };
  const train = d.routes.map((r, i) => !isMono(r) && r.segs.length > 0 && !!rts[i]?.segments.length);
  const half = d.routes.map((r, i) => halfBed(d, r, resolveOptions(d, i)));
  // (each end, and the way the track leaves it)
  const ends = rts.map((rt, i) => { if (!train[i]) return []; const e = routePose(rt, routeLength(rt)); return [[rt.start[0], rt.start[1], rt.start[2]], [e[0], e[1], e[2] + 180]] as [number, number, number][]; });
  const dAng = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
  const plainJoin = (i: number, j: number) => !d.routes[i].dualGauge && !d.routes[j].dualGauge && routeGaugeStuds(d, d.routes[i]) === routeGaugeStuds(d, d.routes[j]);
  /** where tracks i and j are joined end to end in line */
  const joins = (i: number, j: number) => (plainJoin(i, j) ? ends[i].flatMap((a) => ends[j].filter((b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5 && dAng(a[2], b[2]) > 179).map(() => [a[0], a[1]] as [number, number])) : []);
  // (every track's centre line every 8 mm, in squares as big as the furthest apart two tracks can be and be one part)
  const leverReach = (i: number) => (routeGaugeStuds(d, d.routes[i]) + 1) * 12 + LEVER_REACH;
  const reach = 2 * Math.max(0, ...half) + PART_MARGIN, CELL = Math.max(reach, ...d.routes.map((_, i) => (train[i] ? leverReach(i) : 0))), grid = new Map<string, { i: number; x: number; y: number }[]>();
  const samples = rts.map((rt, i) => {
    if (!train[i]) return [];
    const L = routeLength(rt), m = Math.max(1, Math.ceil(L / 8)), out: { i: number; x: number; y: number }[] = [];
    for (let k = 0; k <= m; k++) { const q = routePose(rt, (L * k) / m); out.push({ i, x: q[0], y: q[1] }); }
    return out;
  });
  for (const list of samples) for (const q of list) { const k = `${Math.floor(q.x / CELL)},${Math.floor(q.y / CELL)}`, at = grid.get(k); if (at) at.push(q); else grid.set(k, [q]); }
  const joinsOf = new Map<string, [number, number][]>();
  const joined = (i: number, j: number) => { const key = i < j ? `${i},${j}` : `${j},${i}`; if (!joinsOf.has(key)) joinsOf.set(key, joins(Math.min(i, j), Math.max(i, j))); return joinsOf.get(key)!; };
  // (where two tracks' rails run through each other: points or a crossing; one place each 8 mm square)
  const meet = new Map<string, { i: number; j: number; x: number; y: number }>();
  const near = (each: (i: number, j: number, q: { x: number; y: number }, p: { x: number; y: number }, dist: number, lim: number) => void) => {
    for (let i = 0; i < n; i++) for (const q of samples[i]) {
      const ci = Math.floor(q.x / CELL), cj = Math.floor(q.y / CELL);
      for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) for (const p of grid.get(`${a},${b}`) ?? []) {
        if (p.i <= i) continue;
        const lim = half[i] + half[p.i] + PART_MARGIN, dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (dist < lim) each(i, p.i, q, p, dist, lim);
      }
    }
  };
  /** near where the two are joined end to end: that's the join */
  const atJoin = (i: number, j: number, q: { x: number; y: number }, p: { x: number; y: number }, lim: number) => joined(i, j).some((J) => Math.hypot(q.x - J[0], q.y - J[1]) < lim && Math.hypot(p.x - J[0], p.y - J[1]) < lim);
  // (and two tracks with a short one joined on between them are near each other only along the line: not side by side)
  const nbrs = new Map<number, number[]>();
  const nbrsOf = (i: number) => { if (!nbrs.has(i)) nbrs.set(i, d.routes.flatMap((_, k) => (k !== i && train[k] && joined(i, k).length ? [k] : []))); return nbrs.get(i)!; };
  const viaOne = (i: number, j: number, q: { x: number; y: number }, p: { x: number; y: number }, lim: number) => nbrsOf(i).some((k) => joined(j, k).length > 0
    && joined(i, k).some((J) => Math.hypot(q.x - J[0], q.y - J[1]) < lim) && joined(j, k).some((J) => Math.hypot(p.x - J[0], p.y - J[1]) < lim));
  // (first where rails run through rails, but where one track carries on from another's end)
  near((i, j, q, p, dist, lim) => {
    const mk = `${Math.floor(q.x / 8)},${Math.floor(q.y / 8)}`;
    if (dist >= (routeGaugeStuds(d, d.routes[i]) + routeGaugeStuds(d, d.routes[j]) + 2) * 4 || (meet.has(mk) && find(i) === find(j)) || atJoin(i, j, q, p, lim) || viaOne(i, j, q, p, lim)) return;
    if (!meet.has(mk)) meet.set(mk, { i, j, x: q.x, y: q.y });
    join(i, j);
  });
  // (then beds side by side; two tracks joined end to end are two parts, an ordinary track end between them)
  near((i, j, q, p, _dist, lim) => {
    if (find(i) === find(j)) return;
    if (atJoin(i, j, q, p, lim) || viaOne(i, j, q, p, lim)) return;
    join(i, j);
  });
  // (a track running past points or a crossing within a lever's reach: one part with them; not the track that
  // ends there, joined on in line)
  for (const m of meet.values()) {
    const ci = Math.floor(m.x / CELL), cj = Math.floor(m.y / CELL);
    for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) for (const p of grid.get(`${a},${b}`) ?? []) {
      const k = p.i, lim = leverReach(k);
      if (find(k) === find(m.i) || Math.hypot(p.x - m.x, p.y - m.y) >= lim) continue;
      if ([m.i, m.j].some((t) => joined(k, t).some((J) => Math.hypot(p.x - J[0], p.y - J[1]) < lim && Math.hypot(m.x - J[0], m.y - J[1]) < lim))) continue;
      join(k, m.i);
    }
  }
  return d.routes.map((_, i) => find(i));
}

/** How far ballast lifts a track off the baseplate, mm: a plate, with its buddy layer two. */
const lift = (o: PieceOptions) => (o.ballast === 'buddy' ? 6.4 : o.ballast === 'ballast' ? 3.2 : 0);
/**
 * Where two tracks joined end to end in line aren't as high as each other (one on ballast, the other not, or with
 * the buddy layer): their rails would meet at a step, said by name with what puts it right.
 */
export function ballastSteps(d: Design, inForce: PieceOptions[]): string[] {
  const rts = toRoutes(d), out: string[] = [], name = (i: number) => d.routes[i].name || `route ${i + 1}`;
  const ends = rts.map((rt, i) => { if (isMono(d.routes[i]) || !rt.segments.length) return []; const e = routePose(rt, routeLength(rt)); return [[rt.start[0], rt.start[1], rt.start[2]], [e[0], e[1], e[2] + 180]]; });
  const dAng = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
    const dz = lift(inForce[i]) - lift(inForce[j]);
    if (!dz || !ends[i].some((a) => ends[j].some((b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5 && dAng(a[2], b[2]) > 179))) continue;
    const [hi, lo] = dz > 0 ? [i, j] : [j, i], plates = Math.round(Math.abs(dz) / 3.2);
    out.push(`${name(hi)} and ${name(lo)} meet end to end, but ${name(hi)}'s ballast lifts it ${plates === 1 ? 'a plate' : `${plates} plates`} (${Math.abs(dz)} mm) higher: put ${plates === 1 ? 'a plate' : `${plates} plates`} under ${name(lo)}, or give both the same Ballast`);
  }
  return out;
}

const sameValues = (a: PieceOptions, b: PieceOptions, keys: readonly RouteKey[]) => keys.filter((k) => a[k] !== b[k]);
let memo: { key: string; v: PartGroups } | undefined;

/**
 * The tracks built together and their settings: each part's (partsOf) settings are those of its first track (in the
 * design's order) that has part settings of its own, else the design's; parts that come out the same are built
 * together. Tracks made to take another's are said by name.
 */
export function partGroups(d: Design): PartGroups {
  const key = JSON.stringify([d.routes, d.options, d.gaugeStuds]);
  if (memo?.key === key) return memo.v;
  const dop = designOptions(d), part = hasPartOwn(d) ? partsOf(d) : d.routes.map(() => 0);
  const name = (i: number) => d.routes[i].name || `route ${i + 1}`;
  const train = (i: number) => !isMono(d.routes[i]) && d.routes[i].segs.length > 0;
  const winner = new Map<number, number>();
  d.routes.forEach((r, i) => { if (train(i) && !winner.has(part[i]) && Object.keys(liveOwn(d, r, PART_KEYS)).length) winner.set(part[i], i); });
  const takes: (number | undefined)[] = [], inForce: PieceOptions[] = [], warnings: string[] = [];
  const byKey = new Map<string, { routes: number[]; options: Partial<PieceOptions> }>();
  d.routes.forEach((r, i) => {
    if (!train(i)) { takes.push(undefined); inForce.push(dop); return; }
    const w = winner.get(part[i]), mine = resolveOptions(d, i), from = w === undefined ? dop : resolveOptions(d, w);
    const partOpts = Object.fromEntries(PART_KEYS.map((k) => [k, from[k]])) as Own;
    inForce.push({ ...mine, ...partOpts });
    takes.push(w !== undefined && w !== i ? w : undefined);
    if (w !== undefined && w !== i) {
      const differ = sameValues(mine, from, PART_KEYS);
      if (differ.length) warnings.push(`${name(i)} and ${name(w)} are one part (they meet in points or a crossing, or lie side by side): both take ${name(w)}'s ${differ.map((k) => OWN_LABELS[k]).join(', ')}`);
    }
    const diff = Object.fromEntries(PART_KEYS.filter((k) => partOpts[k] !== dop[k]).map((k) => [k, partOpts[k]])) as Own;
    const gk = JSON.stringify(diff);
    const g = byKey.get(gk) ?? { routes: [], options: Object.keys(diff).length ? { ...d.options, ...diff } : d.options ?? {} };
    g.routes.push(i); byKey.set(gk, g);
  });
  warnings.push(...ballastSteps(d, inForce));
  const v = { groups: [...byKey.values()], takes, inForce, warnings };
  memo = { key, v };
  return v;
}

/** The settings in force on track i (the part rule applied), for the plan and the card. */
export const inForce = (d: Design, i: number): PieceOptions => (hasPartOwn(d) ? partGroups(d).inForce[i] ?? designOptions(d) : resolveOptions(d, i));
/** The settings in force on every track, worked out once (the plan, drawn often). */
export const inForceAll = (d: Design): PieceOptions[] => (hasPartOwn(d) ? partGroups(d).inForce : d.routes.map((_, i) => resolveOptions(d, i)));

/** A track with its own part settings taken off (its banks' kept: those are read from it, per track): a group's sub-design's. */
export function withoutPartOwn(r: DRoute): DRoute {
  if (!r.own) return r;
  const { own, ...rest } = r, keep = Object.fromEntries(BANK_KEYS.filter((k) => own[k] !== undefined).map((k) => [k, own[k]]));
  return Object.keys(keep).length ? { ...rest, own: keep } : rest;
}
