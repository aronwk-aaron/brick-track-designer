// (expert) "I mean this": pairs of tracks that run over each other on purpose (Design.expert.accept), as a maker's
// set has them where a curve lies beside a switch. The build's warning that trains on them would hit is left out
// for such a pair, and the place is marked on the plan instead. By the tracks' names, as the pairs taken apart are
// (connections.ts): so a mark goes with its tracks wherever they're moved. Pure.
import type { Design } from './design';

/** Two tracks (by name; the same name twice: a track run over itself) that run closer than their sleepers on purpose. */
export interface Accept { routes: [string, string]; what: 'over' }
export const ACCEPT_MAX = 500;
const keyOf = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);

/** A file's accepted pairs as kept: names of routes there are, each pair once. Undefined: none. */
export function cleanAccept(v: unknown, names: ReadonlySet<string>): Accept[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Accept[] = [], seen = new Set<string>();
  for (const x of v as unknown[]) {
    if (out.length >= ACCEPT_MAX) break;
    const q = x as { routes?: unknown; what?: unknown } | null;
    if (!q || typeof q !== 'object' || q.what !== 'over' || !Array.isArray(q.routes) || q.routes.length !== 2) continue;
    const [a, b] = q.routes as unknown[];
    if (typeof a !== 'string' || typeof b !== 'string' || !names.has(a) || !names.has(b) || seen.has(keyOf(a, b))) continue;
    seen.add(keyOf(a, b)); out.push({ routes: [a, b], what: 'over' });
  }
  return out.length ? out : undefined;
}
/** Are tracks a and b (by name) accepted as running over each other? */
export const accepted = (d: Design, a: string, b: string) => !!d.expert?.accept?.some((x) => keyOf(x.routes[0], x.routes[1]) === keyOf(a, b));
/** The list kept: each pair once; `named`: only pairs of tracks there are now (not while a track is being renamed or split: its new name isn't in the design yet). */
const put = (d: Design, list: Accept[], named = true) => {
  const names = named ? new Set(d.routes.map((r, i) => r.name || String(i))) : new Set(list.flatMap((x) => x.routes)), kept = cleanAccept(list, names);
  if (kept) d.expert = { ...d.expert, accept: kept };
  else if (d.expert) { const { accept: _a, ...rest } = d.expert; if (Object.keys(rest).length) d.expert = rest; else delete d.expert; }
};
/** Tracks a and b accepted as running over each other (on), or not any more. In place. */
export function setAccept(d: Design, a: string, b: string, on: boolean) {
  const rest = (d.expert?.accept ?? []).filter((x) => keyOf(x.routes[0], x.routes[1]) !== keyOf(a, b));
  put(d, on ? [...rest, { routes: [a, b], what: 'over' }] : rest);
}
/** A track renamed, or made part of another (joined onto it): its pairs are the track's it is now. */
export function renameAccept(d: Design, was: string, now: string) {
  if (d.expert?.accept) put(d, d.expert.accept.map((x) => ({ ...x, routes: [x.routes[0] === was ? now : x.routes[0], x.routes[1] === was ? now : x.routes[1]] as [string, string] })), false);
}
/** A track split in two: its second half is accepted with what the track was (and with its first half, where the track was accepted with itself). */
export function splitAccept(d: Design, name: string, second: string) {
  const ac = d.expert?.accept;
  if (!ac?.length) return;
  const more: Accept[] = [];
  for (const x of ac) {
    const [a, b] = x.routes;
    if (a === name && b === name) more.push({ routes: [name, second], what: 'over' }, { routes: [second, second], what: 'over' });
    else if (a === name || b === name) more.push({ routes: [a === name ? second : a, b === name ? second : b], what: 'over' });
  }
  put(d, [...ac, ...more], false);
}
/** The pairs whose tracks are gone taken off. True if any went. */
export function pruneAccept(d: Design): boolean {
  const was = d.expert?.accept?.length ?? 0;
  if (!was) return false;
  put(d, d.expert!.accept!);
  return (d.expert?.accept?.length ?? 0) !== was;
}
