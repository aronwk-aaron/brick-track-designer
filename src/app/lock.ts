// Locked routes and tables: they can be selected and copied, but not moved, nudged, reshaped by their handles or ends, mirrored,
// turned, split, merged or deleted till they're unlocked (their card's Locked tick). A copy is not locked.
import type { Design } from './design';

export const tableLabel = (d: Design, k: number) => d.tables?.[k]?.name || `Table ${k + 1}`;
const routeLabel = (d: Design, i: number) => d.routes[i]?.name || `Route ${i + 1}`;

/** Which of these routes (by place in the list) and tables are locked, by the names the cards use. */
export function lockedOf(d: Design, routes: readonly number[], tables: readonly number[] = []): string[] {
  return [...routes.filter((i) => d.routes[i]?.locked === true).map((i) => routeLabel(d, i)), ...tables.filter((k) => d.tables?.[k]?.locked === true).map((k) => tableLabel(d, k))];
}
/** "R3 is locked" (or "R3 and Table 2 are locked"), or undefined when none is: what to say when a change is refused. */
export function lockedWhy(d: Design, routes: readonly number[], tables: readonly number[] = []): string | undefined {
  const n = lockedOf(d, routes, tables);
  if (!n.length) return undefined;
  const list = n.length <= 3 ? n.slice(0, -1).join(', ') + (n.length > 1 ? ' and ' : '') + n[n.length - 1] : `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`;
  return `${list} ${n.length > 1 ? 'are' : 'is'} locked`;
}
/** A lock on or off (off: the key's left out, as a design that never had one). */
export function setLocked(x: { locked?: boolean }, on: boolean) { if (on) x.locked = true; else delete x.locked; }
