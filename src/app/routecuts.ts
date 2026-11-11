// Hand cuts across a track (expert mode, docs/expert-mode.md): where a route's track is cut into parts by hand, studs
// along it from its start (DRoute.cuts). Each is an ordinary track end both sides, as between two track pieces. The
// pure part: reading them, what's wrong with one, and how they go with their track when it's turned end for end,
// split, joined or reshaped. (The build's side is handcuts.ts.)
import type { DRoute, DSeg } from './design';

/** (studs) A hand cut this far in from the track's ends, and from the next hand cut: a part at least this long each side. */
export const CUT_MIN = 2;
/** (studs) No cut further along than this (no track is as long). */
const CUT_MAX = 2000 * 100;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const segLen = (sg: DSeg) => (sg.kind === 'straight' ? sg.studs : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180);
/** A route's length along its centre line, studs. */
export const cutLength = (r: Pick<DRoute, 'segs'>) => r.segs.reduce((t, sg) => t + segLen(sg), 0);

/** A list of cuts as kept: numbers past the start, to a thousandth of a stud, in order, each once. Undefined: none (or not a list). */
export function cleanCuts(cuts: unknown): number[] | undefined {
  if (!Array.isArray(cuts)) return undefined;
  const out = [...new Set(cuts.filter((c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0 && c <= CUT_MAX).map(r3))].sort((a, b) => a - b);
  return out.length ? out : undefined;
}

/**
 * Why route r can't be cut by hand at `at` studs along it (undefined: it can): a part at least CUT_MIN long each side,
 * so in from both ends, and clear of its other hand cuts (others: the cuts it's checked against; its own without this one).
 */
export function cutProblem(r: DRoute, at: number, others: number[] = r.cuts ?? []): string | undefined {
  const L = cutLength(r), name = r.name || 'the track';
  if (L < 2 * CUT_MIN) return `${name} is ${+L.toFixed(1)} studs long: too short to cut (${2 * CUT_MIN} studs at least)`;
  if (at < CUT_MIN - 1e-6 || at > L - CUT_MIN + 1e-6) return `Cut ${name} at least ${CUT_MIN} studs in from its ends (${CUT_MIN} to ${+(L - CUT_MIN).toFixed(1)})`;
  const near = others.find((c) => Math.abs(c - at) < CUT_MIN - 1e-6);
  if (near !== undefined) return Math.abs(near - at) < 1e-6 ? `${name} is cut there already` : `Too near the cut at ${+near.toFixed(2)}: at least ${CUT_MIN} studs between cuts`;
  return undefined;
}

/** A cut added to route r at `at` studs (in place). Returns why not, or undefined when done. */
export function addCut(r: DRoute, at: number): string | undefined {
  const v = r3(at), why = cutProblem(r, v);
  if (why) return why;
  r.cuts = cleanCuts([...(r.cuts ?? []), v]);
  return undefined;
}

/** Route r's cut number k (in order) moved to `at` studs, or taken out (at undefined), in place. Returns why not, or undefined when done. */
export function setCut(r: DRoute, k: number, at: number | undefined): string | undefined {
  const cuts = r.cuts ?? [], rest = cuts.filter((_, n) => n !== k);
  if (at !== undefined) { const why = cutProblem(r, r3(at), rest); if (why) return why; rest.push(r3(at)); }
  const now = cleanCuts(rest);
  if (now) r.cuts = now; else delete r.cuts;
  return undefined;
}

/** All of route r's hand cuts gone, and their lock: cut by the app again. */
export function clearCuts(r: DRoute) { delete r.cuts; delete r.cutsLocked; }

/** Route r's cuts that aren't on its track any more (past its end, or too near it, after it was shortened): kept and listed, not built. */
export const lostCuts = (r: DRoute): number[] => { const L = cutLength(r); return (r.cuts ?? []).filter((c) => c > L - CUT_MIN + 1e-6); };
/** Route r's cuts that are built: the ones on its track. */
export const liveCuts = (r: DRoute): number[] => { const L = cutLength(r); return (r.cuts ?? []).filter((c) => c <= L - CUT_MIN + 1e-6); };

/** A route's cuts when it's turned end for end: each as far from the new start as it was from the old end (len: the route's length, studs). */
export const reverseCuts = (cuts: number[] | undefined, len: number): number[] | undefined => cleanCuts((cuts ?? []).map((c) => len - c));

/** A route cut in two at s studs (Split): the first half's cuts, and the second's (from its own start). A cut within CUT_MIN of the split goes: the split is the joint there. */
export function splitCuts(cuts: number[] | undefined, s: number): [number[] | undefined, number[] | undefined] {
  const cs = cuts ?? [];
  return [cleanCuts(cs.filter((c) => c <= s - CUT_MIN + 1e-6)), cleanCuts(cs.filter((c) => c >= s + CUT_MIN - 1e-6).map((c) => c - s))];
}

/**
 * Two routes made one (b's track added to a's end, lenA studs along): the joined route's cuts, b's (in the joined
 * route's direction already) moved on by a's length. between: a cut where they met too (both were cut by hand only:
 * they were two parts there, and stay two).
 */
export function joinCuts(a: number[] | undefined, b: number[] | undefined, lenA: number, between = false): number[] | undefined {
  return cleanCuts([...(a ?? []), ...(between ? [lenA] : []), ...(b ?? []).map((c) => c + lenA)]);
}

/**
 * A route's cuts after one of its pieces was reshaped (a handle dragged, a number typed): each stays in its piece, as
 * far from that piece's start as it was (so a straight made longer doesn't walk the cuts after it into the curve
 * beyond); one past its piece's new end goes to that end. Only when the two shapes differ in one piece of the same
 * kind: any other change (turned end for end, split, joined, pieces added or taken out) has moved the cuts itself,
 * or leaves each as far from the start as it was. Returns the cuts to keep (the same list when nothing moved).
 */
export function followCuts(before: Pick<DRoute, 'segs'>, after: Pick<DRoute, 'segs' | 'cuts'>): number[] | undefined {
  const cuts = after.cuts, at = cuts?.length ? alongAfter(before, after) : undefined;
  return at ? cleanCuts(cuts!.map(at)) : cuts;
}
/**
 * Where a place on a route (studs from its start) goes when one of its pieces is reshaped, as followCuts says; undefined:
 * nothing to follow (the shapes are the same, or differ in more than one piece of the same kind).
 */
export function alongAfter(before: Pick<DRoute, 'segs'>, after: Pick<DRoute, 'segs'>): ((c: number) => number) | undefined {
  if (before.segs.length !== after.segs.length) return undefined;
  const diff = before.segs.map((sg, k) => JSON.stringify(sg) !== JSON.stringify(after.segs[k]));
  const k = diff.indexOf(true);
  if (k < 0 || diff.indexOf(true, k + 1) >= 0 || before.segs[k].kind !== after.segs[k].kind) return undefined;
  let s0 = 0;
  for (let n = 0; n < k; n++) s0 += segLen(before.segs[n]);
  const was = segLen(before.segs[k]), now = segLen(after.segs[k]);
  // (a place on the joint between two pieces is the earlier piece's: it stays at that piece's end)
  return (c) => (c <= s0 + 1e-6 ? c : c <= s0 + was + 1e-6 ? s0 + Math.min(c - s0, now) : c + now - was);
}

/** "2 cuts by hand, only these" and so on: what the card's Cuts section says when shut. */
export function cutsSummary(r: DRoute): string {
  const n = r.cuts?.length ?? 0, lost = lostCuts(r).length;
  if (!n) return r.cutsLocked ? 'no cuts: one part' : 'automatic';
  return `${n} by hand${r.cutsLocked ? ', only these' : ''}${lost ? ` · ${lost} off the track` : ''}`;
}
