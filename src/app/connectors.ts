// Connectors as things of their own (expert mode, stage 6, docs/expert-mode.md): each end connector on the plan, one at
// a time. A track's own end (start or end) and each joint where its track is cut into parts along it (the app's own,
// or a hand cut). What each can be:
// - an end connector with its rail tongues and its peg and clip (LEGO track's ends; the design's default off ballast);
// - an end connector with rail tongues only, no peg and clip (the default on ballast, Peg and clip on ballast ends off);
// - square rail ends: no tongues, no peg and clip, the rails butted flush (Aaron, 2026-11-21: held in line by the plate only);
// - (a track's own end, joined to nothing) a buffer stop.
// Kept as a track end's own startEnd / endEnd ('peg', 'nopeg' beside 'connector' and 'buffer'), so they go with the
// track when it's turned, split or joined as a buffer stop does; and a hand cut's in DRoute.cutJoints, by where it is
// (studs along), carried with the cut. The build matches them by where they are (pegEnds), as the buffer stops.
// Pure: no canvas, nothing built.
import type { Design, DRoute, PieceOptions } from './design';
import { isMono, toRoutes } from './design';
import type { Joint } from './connections';
import { cutSegs } from './splitmerge';
import { follow } from './planner';
import { cleanCuts, CUT_MIN, cutLength, cutProblem, liveCuts } from './routecuts';
import { hasRoll, type Route, routeLength, routePose } from '../route/route';
import { joints } from './connections';

export type End = 'start' | 'end';
/** What a joint between two of a track's parts is (a hand cut's own): with its peg and clip, or rail tongues only. */
export type JointKind = 'peg' | 'nopeg' | 'square';
/** What a track's own end is: the design's connector, one with or without its peg and clip, or a buffer stop. */
export type EndKind = 'connector' | JointKind | 'buffer';
/** A hand cut's own joint, by where the cut is (studs along its track). */
export interface CutJoint { at: number; kind: JointKind }

export const JOINT_NAMES: Record<JointKind, string> = { peg: 'Rail tongues + peg and clip', nopeg: 'Rail tongues only', square: 'Square rail ends' };
export const JOINT_TIPS: Record<JointKind, string> = {
  peg: 'As LEGO track\'s ends: the rails\' tongues lock in line, the peg snaps into the next end\'s clip.',
  nopeg: 'The rails\' tongues alone keep the two in line; nothing snaps. The parts lift apart.',
  square: 'The rails run to the end, cut square, and butt flush on the next part\'s. Drawback: the rails are held in line by the plate only; nothing locks the two parts.',
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const isKind = (v: unknown): v is JointKind => v === 'peg' || v === 'nopeg' || v === 'square';

/** Does an end connector have its peg and clip, with nothing set by hand? Off ballast yes; on ballast only with Peg and clip on ballast ends. */
export const pegDefault = (o: Partial<PieceOptions> | undefined) => (o?.ballast ?? 'none') === 'none' || o?.pegOnBallast === true;
/** The design's own joint kind (what Reset gives back). */
export const jointDefault = (o: Partial<PieceOptions> | undefined): JointKind => (pegDefault(o) ? 'peg' : 'nopeg');

/** A file's hand cuts' joints held to what's kept: a kind of the two, on one of the track's cuts, each place once. Undefined: none. */
export function cleanCutJoints(v: unknown, cuts: readonly number[] | undefined): CutJoint[] | undefined {
  if (!Array.isArray(v) || !cuts?.length) return undefined;
  const out: CutJoint[] = [];
  for (const q of v) {
    if (!q || typeof q !== 'object') continue;
    const { at, kind } = q as Record<string, unknown>;
    if (typeof at !== 'number' || !Number.isFinite(at) || !isKind(kind)) continue;
    const c = cuts.find((x) => Math.abs(x - at) < 1e-3);
    if (c !== undefined && !out.some((o) => o.at === c)) out.push({ at: c, kind });
  }
  return out.length ? out.sort((a, b) => a.at - b.at) : undefined;
}
/** A track's end kind as kept: one of the four; left out (undefined) is an ordinary connector. */
export const cleanEndKind = (v: unknown): EndKind | undefined => (v === 'buffer' || isKind(v) ? v : undefined);

/** Turned end for end (len: the track's length, studs). */
export const reverseCutJoints = (cj: CutJoint[] | undefined, len: number) => (cj?.length ? cj.map((q) => ({ ...q, at: r3(len - q.at) })).sort((a, b) => a.at - b.at) : undefined);
/** Split at s studs: the first half's, and the second's from its own start (one within CUT_MIN of the split goes, as its cut does). */
export function splitCutJoints(cj: CutJoint[] | undefined, s: number): [CutJoint[] | undefined, CutJoint[] | undefined] {
  const a = (cj ?? []).filter((q) => q.at <= s - CUT_MIN + 1e-6), b = (cj ?? []).filter((q) => q.at >= s + CUT_MIN - 1e-6).map((q) => ({ ...q, at: r3(q.at - s) }));
  return [a.length ? a : undefined, b.length ? b : undefined];
}
/** Two tracks made one (b's on from a's end, lenA studs along; b's already the joined track's way round). */
export function joinCutJoints(a: CutJoint[] | undefined, b: CutJoint[] | undefined, lenA: number): CutJoint[] | undefined {
  const out = [...(a ?? []), ...(b ?? []).map((q) => ({ ...q, at: r3(q.at + lenA) }))];
  return out.length ? out : undefined;
}
/**
 * A track's cuts' joints after its cuts changed (before: its cuts as they were): each on a cut that's still there
 * stays; one cut moved (one gone, one new) takes its joint with it; else the ones whose cut has gone go too.
 */
export function carryCutJoints(cj: CutJoint[] | undefined, before: readonly number[], after: readonly number[]): CutJoint[] | undefined {
  if (!cj?.length) return undefined;
  const has = (xs: readonly number[], v: number) => xs.some((x) => Math.abs(x - v) < 1e-3);
  const gone = before.filter((c) => !has(after, c)), fresh = after.filter((c) => !has(before, c));
  const out = cj.flatMap((q) => (has(after, q.at) ? [q] : gone.length === 1 && fresh.length === 1 && Math.abs(q.at - gone[0]) < 1e-3 ? [{ ...q, at: fresh[0] }] : []));
  return out.length ? out.sort((a, b) => a.at - b.at) : undefined;
}

// ---------- for the build ----------
/**
 * The end connectors set by hand, by where they are (mm, as the buffer stops: bufferEnds), and whether each has its
 * peg and clip: a track's own end set to one or the other, and each of its hand cuts with a joint of its own. Every end
 * there (both tracks' at a joint between two, both parts' at a cut) is built so.
 */
export function pegEnds(d: Design): { at: [number, number]; peg: boolean; square?: boolean }[] {
  const out: { at: [number, number]; peg: boolean; square?: boolean }[] = [];
  const rts = toRoutes(d), js = d.routes.some((r) => r.startEnd === 'square' || r.endEnd === 'square' || r.cutJoints?.some((q) => q.kind === 'square')) ? joints(d) : [];
  let i = -1, end: End | undefined;
  // (square only where squareBlocked lets it be; else rail tongues only, said by squareWarnings)
  const one = (at: [number, number], k: JointKind) => { const sq = k === 'square' && !squareBlocked(d, js, rts, { route: i, end }); out.push({ at, peg: k === 'peg', ...(sq && { square: true }) }); };
  rts.forEach((rt, i0) => {
    i = i0;
    const r = d.routes[i];
    if (!rt.segments.length || isMono(r)) return;
    end = 'start'; if (isKind(r.startEnd)) one([rt.start[0], rt.start[1]], r.startEnd);
    end = 'end'; if (isKind(r.endEnd)) { const p = routePose(rt, routeLength(rt)); one([p[0], p[1]], r.endEnd); }
    end = undefined;
    const live = liveCuts(r);
    for (const q of r.cutJoints ?? []) if (live.some((c) => Math.abs(c - q.at) < 1e-3)) { const p = routePose(rt, q.at * 8); one([p[0], p[1]], q.kind); }
  });
  return out;
}

// ---------- on the plan ----------
/** Where a route is, s studs along it (studs on the plan; heading: its way there, degrees). */
export function poseAlong(r: Pick<DRoute, 'x' | 'y' | 'heading' | 'segs'>, s: number) { return follow(r, cutSegs(r.segs, Math.max(0, s))[0]); }

/**
 * One end connector on the plan: a track's own end (end), or a joint where its track is cut into parts (at, studs
 * along it: a hand cut, or one of the app's, auto). x, y, heading: where it is and the track's way there (studs, degrees).
 * joined: (a track's own end) another track's end meets it there (one connector each, built together), by route.
 */
export interface Conn { route: number; end?: End; at?: number; auto?: boolean; x: number; y: number; heading: number; joined?: number }

/**
 * Every end connector of a design's train track: each track's own ends (not where it starts or ends on another's side,
 * inside points: no connector there; where two tracks' ends meet, the one of the first), and the joints where each is
 * cut into parts: its hand cuts, and (built: appJoints, each track's, studs along it, from the build's overlay) the
 * app's own, where no hand cut is.
 */
export function connectorsOf(d: Design, js: readonly Joint[], appJoints: readonly (readonly number[])[] = []): Conn[] {
  const out: Conn[] = [];
  d.routes.forEach((r, i) => {
    if (isMono(r) || !r.segs.length) return;
    const L = cutLength(r);
    for (const end of ['start', 'end'] as const) {
      const mine = js.filter((j) => (j.a === i && j.aEnd === end) || (j.b === i && j.bEnd === end));
      // (on another track's side: points, no connector)
      if (mine.some((j) => j.a === i && j.aEnd === end && j.bEnd === undefined)) continue;
      const other = mine.map((j) => (j.a === i ? j.b : j.a)).find((k) => k !== i);
      if (other !== undefined && other < i) continue;
      const p = end === 'start' ? { x: r.x, y: r.y, heading: r.heading } : poseAlong(r, L);
      out.push({ route: i, end, x: p.x, y: p.y, heading: p.heading, ...(other !== undefined && { joined: other }) });
    }
    const hand = liveCuts(r);
    for (const at of hand) { const p = poseAlong(r, at); out.push({ route: i, at, x: p.x, y: p.y, heading: p.heading }); }
    for (const at of appJoints[i] ?? []) {
      if (at < 0.01 || at > L - 0.01 || hand.some((c) => Math.abs(c - at) < 1)) continue;
      const p = poseAlong(r, at); out.push({ route: i, at, auto: true, x: p.x, y: p.y, heading: p.heading });
    }
  });
  return out;
}

/** What a track's end is now (its own, else the design's connector). */
export const endKindOf = (r: DRoute, end: End): EndKind => (end === 'start' ? r.startEnd : r.endEnd) ?? 'connector';
/** What a connector is, as it'll be built (its own, else the design's). */
export function connKind(d: Design, c: Pick<Conn, 'route' | 'end' | 'at'>): JointKind | 'buffer' {
  const r = d.routes[c.route];
  const k = !r ? undefined : c.end ? endKindOf(r, c.end) : r.cutJoints?.find((q) => c.at !== undefined && Math.abs(q.at - c.at) < 1e-3)?.kind;
  return k === 'buffer' || isKind(k) ? k : jointDefault(d.options);
}
/**
 * Why a track's ends and joints can't have square rail ends (undefined: they can): its guard rails or third rail end in
 * tongues of their own, and on a banked curve the rails' ends are tilted (the build keeps tongues there).
 */
export function squareProblem(r: DRoute): string | undefined {
  if (r.guardRails) return 'not on a track with guard rails (their ends have tongues)';
  if (r.dualGauge) return 'not on dual gauge track (its third rail\'s ends have tongues)';
  return undefined;
}
/**
 * The one test of whether a connector may have square rail ends (undefined: it may), used by the build (pegEnds: only
 * those are built square) and by what's said and offered (squareWarnings, its card), so they can't drift apart: not
 * with the track printed apart from its ballast (its seat is the track's with tongues), nor on a track (or, a joined
 * end, the track it meets) with guard rails, a third rail, or any tilt (a banked curve or its ramps: rts, the design's
 * routes as built, toRoutes, carry their rolls).
 */
export function squareBlocked(d: Design, js: readonly Joint[], rts: readonly Route[], c: Pick<Conn, 'route' | 'end'>): string | undefined {
  const o = d.options ?? {};
  if ((o.ballast ?? 'none') !== 'none' && o.trackBallast === 'apart') return 'not with Track and ballast printed Apart (the track\'s seat has its tongues)';
  const ks = [c.route, ...(c.end ? js.filter((j) => (j.a === c.route && j.aEnd === c.end) || (j.b === c.route && j.bEnd === c.end)).map((j) => (j.a === c.route ? j.b : j.a)) : [])];
  for (const k of ks) {
    const r = d.routes[k];
    if (!r) continue;
    const why = squareProblem(r) ?? (rts[k] && hasRoll(rts[k]) ? 'not on a banked track or its bank ramps (tilted rail ends keep their tongues)' : undefined);
    if (why) return why;
  }
  return undefined;
}
/** Whether a connector has its peg and clip, as it'll be built. */
export function connPeg(d: Design, c: Conn): boolean {
  const r = d.routes[c.route];
  if (!r) return pegDefault(d.options);
  const k = c.end ? endKindOf(r, c.end) : r.cutJoints?.find((q) => c.at !== undefined && Math.abs(q.at - c.at) < 1e-3)?.kind;
  return k === 'peg' ? true : k === 'nopeg' ? false : pegDefault(d.options);
}
/** What it's called: "Start of Main", "Joint 12 studs along Main". */
export function connText(d: Design, c: Pick<Conn, 'route' | 'end' | 'at' | 'auto'>): string {
  const nm = d.routes[c.route]?.name || `Route ${c.route + 1}`;
  return c.end ? `${c.end === 'start' ? 'Start' : 'End'} of ${nm}` : `Joint ${+(c.at ?? 0).toFixed(2)} studs along ${nm}${c.auto ? ' (the app\'s)' : ''}`;
}

/**
 * A track end set to a kind (in place): this track's end, and (joined) the other track's end that meets it there, so
 * the two are built alike. A buffer stop only where the end is joined to nothing. Returns why not, or undefined.
 */
export function setEndKind(d: Design, js: readonly Joint[], route: number, end: End, kind: EndKind): string | undefined {
  const r = d.routes[route];
  if (!r) return 'no such track';
  const mine = js.filter((j) => (j.a === route && j.aEnd === end) || (j.b === route && j.bEnd === end));
  if (kind === 'buffer' && mine.length) return 'A buffer stop goes only on a track\'s end that\'s joined to nothing';
  if (kind === 'square') { const why = squareBlocked(d, js, toRoutes(d), { route, end }); if (why) return `Square rail ends ${why}`; }
  const put = (q: DRoute, e: End) => { const key = e === 'start' ? 'startEnd' : 'endEnd'; if (kind === 'connector') delete q[key]; else q[key] = kind; };
  put(r, end);
  for (const j of mine) {
    const [k, e] = j.a === route ? [j.b, j.bEnd] : [j.a, j.aEnd];
    if (e && d.routes[k]) put(d.routes[k], e);
  }
  return undefined;
}
/** A hand cut's joint set (in place; 'auto': the design's). */
export function setCutJoint(r: DRoute, at: number, kind: JointKind | 'auto') {
  const rest = (r.cutJoints ?? []).filter((q) => Math.abs(q.at - at) >= 1e-3);
  if (kind !== 'auto') rest.push({ at: r3(at), kind });
  if (rest.length) r.cutJoints = rest.sort((a, b) => a.at - b.at); else delete r.cutJoints;
}

/**
 * Would the part from `from` to `to` studs along route r fit the print bed (bed: mm, x and y)? Its centre line, with
 * half its width each side (half: studs), turned every 5 degrees: the box round it inside the bed's, either way round.
 * (The build's fit is by the part itself; this is the editor's check before a joint is taken out.)
 */
export function stretchFitsBed(r: DRoute, from: number, to: number, bed: [number, number], half: number): boolean {
  const pts: [number, number][] = [];
  const n = Math.max(2, Math.ceil(to - from));
  for (let k = 0; k <= n; k++) {
    const q = poseAlong(r, from + ((to - from) * k) / n), h = (q.heading * Math.PI) / 180, rx = Math.cos(h), ry = Math.sin(h);
    pts.push([(q.x + rx * half) * 8, (q.y + ry * half) * 8], [(q.x - rx * half) * 8, (q.y - ry * half) * 8]);
  }
  for (let a = 0; a < 180; a += 5) {
    const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { const u = x * c - y * s, v = x * s + y * c; x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    const w = x1 - x0, hh = y1 - y0;
    if ((w <= bed[0] && hh <= bed[1]) || (w <= bed[1] && hh <= bed[0])) return true;
  }
  return false;
}

// ---------- a joint along a track, edited ----------
/**
 * A track's joints made its own on the first change of one (D6): the app's joints on it (app: studs along, from the
 * build) become its hand cuts, with Only these, so the others stay where they are. Nothing when it's cut by hand only.
 */
export function keepJoints(r: DRoute, app: readonly number[]) {
  if (r.cutsLocked) return;
  const L = cutLength(r), mine = app.filter((s) => s >= CUT_MIN - 1e-6 && s <= L - CUT_MIN + 1e-6);
  const cuts = cleanCuts([...(r.cuts ?? []), ...mine]);
  if (cuts) r.cuts = cuts; else delete r.cuts;
  r.cutsLocked = true;
}
/** Route r's joint at `from` moved to `to` (whole studs), its own kind with it (in place). Returns why not, or undefined. */
export function moveJoint(r: DRoute, from: number, to: number, app: readonly number[]): string | undefined {
  const s = Math.round(to), rest = (r.cuts ?? []).filter((c) => Math.abs(c - from) >= 1e-3);
  const why = cutProblem(r, s, rest.concat(app.filter((a) => !r.cutsLocked && Math.abs(a - from) >= 1e-3 && !rest.some((c) => Math.abs(c - a) < 1e-3))));
  if (why) return why;
  keepJoints(r, app);
  const before = [...(r.cuts ?? [])], now = cleanCuts([...(r.cuts ?? []).filter((c) => Math.abs(c - from) >= 1e-3), s]) ?? [];
  r.cuts = now;
  const cj = carryCutJoints(r.cutJoints, before, now);
  if (cj) r.cutJoints = cj; else delete r.cutJoints;
  return undefined;
}
/**
 * Route r's joint at `at` taken out (in place): the two parts either side made one, if that part fits the print bed
 * (bed mm; half: the track's half width, studs). Returns why not, or undefined.
 */
export function deleteJoint(r: DRoute, at: number, app: readonly number[], bed: [number, number], half: number): string | undefined {
  const all = cleanCuts([...(r.cuts ?? []), ...(r.cutsLocked ? [] : app)]) ?? [], L = cutLength(r);
  const lo = Math.max(0, ...all.filter((c) => c < at - 1e-3)), hi = Math.min(L, ...all.filter((c) => c > at + 1e-3));
  if (!stretchFitsBed(r, lo, hi, bed, half)) return `Not taken out: the part from ${+lo.toFixed(1)} to ${+hi.toFixed(1)} studs would be too long for the ${bed[0]} x ${bed[1]} print bed`;
  keepJoints(r, app);
  const now = cleanCuts((r.cuts ?? []).filter((c) => Math.abs(c - at) >= 1e-3));
  if (now) r.cuts = now; else delete r.cuts;
  setCutJoint(r, at, 'auto');
  return undefined;
}
/** A joint added to route r at `at` studs (a whole stud), the app's others kept where they are (in place). Returns why not, or undefined. */
export function addJoint(r: DRoute, at: number, app: readonly number[]): string | undefined {
  const s = Math.round(at), why = cutProblem(r, s, cleanCuts([...(r.cuts ?? []), ...(r.cutsLocked ? [] : app)]) ?? []);
  if (why) return why;
  keepJoints(r, app);
  r.cuts = cleanCuts([...(r.cuts ?? []), s]) ?? [];
  return undefined;
}

/**
 * (said by the build) Each end or joint set to square rail ends where they can't be (squareProblem, or the track printed
 * apart from its ballast, its seat the track's with tongues): built with rail tongues only there instead, and why.
 */
export function squareWarnings(d: Design, js: readonly Joint[]): string[] {
  const out: string[] = [];
  let rts: Route[] | undefined;
  d.routes.forEach((r, i) => {
    if (isMono(r)) return;
    const asked: Pick<Conn, 'route' | 'end' | 'at'>[] = [
      ...(['start', 'end'] as const).filter((e) => endKindOf(r, e) === 'square').map((end) => ({ route: i, end })),
      ...(r.cutJoints ?? []).filter((q) => q.kind === 'square').map((q) => ({ route: i, at: q.at })),
    ];
    for (const c of asked) {
      const why = squareBlocked(d, js, (rts ??= toRoutes(d)), c);
      if (why) out.push(`${connText(d, c)}: square rail ends ${why}: built with rail tongues only there`);
    }
  });
  return out;
}
