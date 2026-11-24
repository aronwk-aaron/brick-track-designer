// (expert, stage 7) A track's ballast edges as things of their own: the edge of its ballast (its bed) on each side,
// the whole track's or a stretch's (stretches.ts), how far it reaches past the sleepers (whole studs, the settings
// ballastLeftStuds / ballastRightStuds) and, at a buffer stop, its shape there (ballastEnds). An edge changed becomes
// the track's (or the stretch's) own setting (D6: on its first change); Reset takes it back to what's over it. Pure:
// no canvas, nothing built (the build goes by the settings, as it did).
import { type Design, type DRoute, isMono, routeGaugeStuds } from './design';
import { inForceAll } from './overrides';
import { cutLength } from './routecuts';
import { type Own } from './routeown';
import { expandStretches, liveStretches, STRETCH_MIN, type Stretch } from './stretches';

export type EdgeSide = 'left' | 'right';
/** The setting each side's edge is. */
export const EDGE_KEY = { left: 'ballastLeftStuds', right: 'ballastRightStuds' } as const;
/** How far past the sleepers an edge may reach (studs): 0 is level with the sleepers' ends (never narrower); the default. */
export const EDGE_RANGE = [0, 8] as const, EDGE_DEFAULT = 1;
/** An edge, as selected: its track (its place in the list), its side, and the stretch it's on (its place in the track's list; left out: the track's own). */
export interface EdgeRef { route: number; side: EdgeSide; k?: number }
/** An edge as drawn on the plan: from and to (studs along its track), its reach past the sleepers (studs), and its line's offset from the centre line (studs). */
export interface Edge extends EdgeRef { from: number; to: number; studs: number; off: number; buddy: boolean; stepped: boolean }

/**
 * Every ballast edge on the plan: each side of each piece of track on ballast (the track before, between and after
 * its stretches, and each stretch), with the settings in force there (the part rule's: tracks that are one part take
 * one set).
 */
export function ballastEdges(d: Design): Edge[] {
  const sx = expandStretches(d), dx = sx.design, all = inForceAll(dx), at = new Map<number, number>(), out: Edge[] = [];
  dx.routes.forEach((p, i) => {
    const src = sx.of[i], r = d.routes[src], L = cutLength(p), from = at.get(src) ?? 0;
    at.set(src, from + L);
    const o = all[i];
    if (!r || isMono(r) || !o || o.ballast === 'none' || !p.segs.length) return;
    let k: number | undefined;
    if (sx.stretch[i]) {
      let best = 0;
      (r.stretches ?? []).forEach((st, n) => { const ov = Math.min(st.to, from + L) - Math.max(st.from, from); if (ov > best + 1e-9) { best = ov; k = n; } });
    }
    const g = (routeGaugeStuds(d, r) + 1) / 2, buddy = o.ballast === 'buddy';
    for (const side of ['left', 'right'] as const) {
      const studs = Math.max(0, o[EDGE_KEY[side]] ?? EDGE_DEFAULT);
      out.push({ route: src, side, ...(k !== undefined && { k }), from, to: from + L, studs, off: g + 1.5 + studs + (buddy ? 1 : 0), buddy, stepped: o.ballastEnds === 'stepped' });
    }
  });
  return out;
}

/** The own settings an edge is kept in: the stretch's, or the track's. */
const ownOf = (r: DRoute, k?: number): Own | undefined => (k !== undefined ? r.stretches?.[k]?.own : r.own);
/** Is the edge still there (its track, and its stretch)? */
export const edgeThere = (d: Design, e: EdgeRef) => !!d.routes[e.route] && !isMono(d.routes[e.route]) && (e.k === undefined || !!d.routes[e.route].stretches?.[e.k]);
/** The edge's reach past the sleepers as in force now, and where that comes from. */
export function edgeNow(d: Design, e: EdgeRef): { studs: number; from: 'stretch' | 'track' | 'design' | 'default' } {
  const r = d.routes[e.route], key = EDGE_KEY[e.side], st = e.k !== undefined ? r?.stretches?.[e.k] : undefined;
  if (st?.own[key] !== undefined) return { studs: st.own[key] as number, from: 'stretch' };
  if (r?.own?.[key] !== undefined) return { studs: r.own[key] as number, from: 'track' };
  if (d.options?.[key] !== undefined) return { studs: d.options[key] as number, from: 'design' };
  return { studs: EDGE_DEFAULT, from: 'default' };
}
/** Has the edge its own reach, where it's kept (the stretch's own, for an edge on a stretch; the track's)? */
export const edgeOwn = (d: Design, e: EdgeRef) => { const r = d.routes[e.route]; return !!r && ownOf(r, e.k)?.[EDGE_KEY[e.side]] !== undefined; };

/** Why an edge can't reach v studs past the sleepers (undefined: it can). */
export function edgeProblem(v: number): string | undefined {
  if (!Number.isFinite(v)) return 'Type how far past the sleepers, studs';
  if (!Number.isInteger(v)) return 'The ballast goes by whole studs';
  if (v < EDGE_RANGE[0]) return 'The ballast can\'t be narrower than the sleepers: 0 is level with their ends';
  if (v > EDGE_RANGE[1]) return `The ballast reaches ${EDGE_RANGE[1]} studs past the sleepers at most`;
  return undefined;
}
/** The edge made to reach v studs past the sleepers (kept on the stretch, or the track). Why not (nothing changed). */
export function setEdge(d: Design, e: EdgeRef, v: number): string | undefined {
  const why = edgeProblem(v), r = d.routes[e.route];
  if (why) return why;
  if (!edgeThere(d, e)) return 'That edge isn\'t there any more';
  if (e.k !== undefined) { const st = r.stretches![e.k]; st.own = { ...st.own, [EDGE_KEY[e.side]]: v }; } else r.own = { ...r.own, [EDGE_KEY[e.side]]: v };
  return undefined;
}
/**
 * The edge back to what's over it (a stretch's: the track's; the track's: the design's). A stretch left with nothing
 * of its own is taken away (it only cut the track into a piece of its own): said by `gone`.
 */
export function resetEdge(d: Design, e: EdgeRef): { gone?: true } {
  const r = d.routes[e.route];
  if (!edgeThere(d, e)) return {};
  const key = EDGE_KEY[e.side];
  if (e.k !== undefined) {
    const st = r.stretches![e.k], { [key]: _x, ...rest } = st.own;
    st.own = rest;
    if (!Object.keys(rest).length) { r.stretches!.splice(e.k, 1); if (!r.stretches!.length) delete r.stretches; return { gone: true }; }
    return {};
  }
  if (r.own) { const { [key]: _x, ...rest } = r.own; if (Object.keys(rest).length) r.own = rest; else delete r.own; }
  return {};
}

/** Which ends of the edge's stretch of track are buffer stops (none: the shape there can't be chosen). */
export function edgeBuffers(d: Design, e: EdgeRef): ('start' | 'end')[] {
  const r = d.routes[e.route];
  if (!r) return [];
  const L = cutLength(r), st = e.k !== undefined ? liveStretches(r).find((q) => q.from === r.stretches?.[e.k!]?.from) ?? r.stretches?.[e.k] : undefined;
  const out: ('start' | 'end')[] = [];
  if (r.startEnd === 'buffer' && (!st || st.from <= 1e-9)) out.push('start');
  if (r.endEnd === 'buffer' && (!st || st.to >= L - 1e-9)) out.push('end');
  return out;
}
/** Why the edge's shape at a buffer stop can't be chosen here (undefined: it can): there's none on its stretch of track. */
export const edgeShapeBlocked = (d: Design, e: EdgeRef): string | undefined => (edgeBuffers(d, e).length ? undefined : e.k !== undefined ? 'only where the stretch ends in a buffer stop' : 'only on a track that ends in a buffer stop');
/** The shape at a buffer stop in force on the edge's stretch of track. */
export function edgeShapeNow(d: Design, e: EdgeRef): 'square' | 'stepped' {
  const r = d.routes[e.route], st = e.k !== undefined ? r?.stretches?.[e.k] : undefined;
  return (st?.own.ballastEnds ?? r?.own?.ballastEnds ?? d.options?.ballastEnds ?? 'square') as 'square' | 'stepped';
}
/** The shape at a buffer stop set on the edge's stretch of track (both sides: the ballast is cut one way round the end). */
export function setEdgeShape(d: Design, e: EdgeRef, v: 'square' | 'stepped'): string | undefined {
  const why = edgeShapeBlocked(d, e), r = d.routes[e.route];
  if (why) return `The ballast's shape at a buffer stop: ${why}`;
  if (e.k !== undefined) { const st = r.stretches![e.k]; st.own = { ...st.own, ballastEnds: v }; } else r.own = { ...r.own, ballastEnds: v };
  return undefined;
}

/**
 * A stretch made round s studs along route r for an edge to change over (at most 8 studs each way, on whole studs, in
 * the room between the stretches there are): its place in the track's list, or why there's none.
 */
export function edgeStretch(r: DRoute, s: number, half = 4): { k: number } | { problem: string } {
  const L = cutLength(r), st = r.stretches ?? [];
  if (st.some((x) => s > x.from && s < x.to)) return { problem: 'A stretch is here already: tap its edge to change it' };
  const lo = Math.max(0, ...st.filter((x) => x.to <= s).map((x) => x.to)), hi = Math.min(Math.ceil(L - 1e-9), ...st.filter((x) => x.from >= s).map((x) => x.from));
  if (hi - lo < STRETCH_MIN) return { problem: `No room for a stretch here: under ${STRETCH_MIN} studs between the stretches there are` };
  let from = Math.max(lo, Math.round(s) - half), to = Math.min(hi, Math.round(s) + half);
  if (to - from < STRETCH_MIN) { from = Math.max(lo, to - STRETCH_MIN); to = Math.min(hi, from + STRETCH_MIN); }
  // (no piece shorter than STRETCH_MIN left at the track's ends: taken in)
  if (from > 0 && from < STRETCH_MIN) from = 0;
  if (to < L && L - to < STRETCH_MIN) to = Math.ceil(L - 1e-9);
  if (to - from >= L - 1e-9) return { problem: 'That would be the whole track: change the track\'s own edge instead' };
  const list: Stretch[] = [...st, { from, to, own: {} }].sort((a, b) => a.from - b.from);
  r.stretches = list;
  return { k: list.findIndex((x) => x.from === from && x.to === to) };
}

/** What an edge is called on its card and the selection bar. */
export function edgeText(d: Design, e: EdgeRef): string | undefined {
  if (!edgeThere(d, e)) return undefined;
  const r = d.routes[e.route], name = r.name || `Route ${e.route + 1}`, st = e.k !== undefined ? r.stretches![e.k] : undefined;
  return `${e.side === 'left' ? 'Left' : 'Right'} ballast edge of ${name}${st ? `, ${st.from} to ${st.to} studs` : ''}`;
}
