// The layout's tables (or modules): the surfaces the track is laid across, each a rectangle, a curved ring section or
// any outline, in studs on the plan. Where a table meets the next (a seam), the track is cut: plain track at an
// ordinary track end there, bought track's printed ballast along the seam itself; where a seam crosses a switch, a
// crossing or a bought piece, a warning says so.
import type { Pt } from '../route/route';

/** A table, in studs (angles in degrees, counterclockwise from +x, as the plan's x and y). */
export type Table = { name?: string; color?: string } & (
  | { shape: 'rect'; x: number; y: number; w: number; h: number }
  /** a ring section round (cx, cy), radius r0 to r1, from angle a0 to a1 */
  | { shape: 'arc'; cx: number; cy: number; r0: number; r1: number; a0: number; a1: number }
  | { shape: 'poly'; pts: [number, number][] });

/**
 * A table as saved, made sure of: itself where it's whole; with no shape (an older file's, or one written by hand),
 * the shape its numbers say (x, y, w, h: a rectangle; cx, cy, r0, r1, a0, a1: a ring section; pts: an outline);
 * undefined where it's none of them (a build with such a table failed outright, reading an outline it hasn't got).
 */
export function tableOf(v: unknown): Table | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const t = v as Record<string, unknown>, fin = (x: unknown) => typeof x === 'number' && Number.isFinite(x), nums = (...ks: string[]) => ks.every((k) => fin(t[k]));
  const is = { rect: nums('x', 'y', 'w', 'h'), arc: nums('cx', 'cy', 'r0', 'r1', 'a0', 'a1'), poly: Array.isArray(t.pts) && t.pts.length >= 3 && t.pts.every((q: unknown) => Array.isArray(q) && q.length === 2 && q.every(fin)) };
  const shape = t.shape === undefined ? (['rect', 'arc', 'poly'] as const).find((k) => is[k]) : (['rect', 'arc', 'poly'] as const).find((k) => k === t.shape && is[k]);
  return shape ? (t.shape === shape ? (v as Table) : ({ ...t, shape } as unknown as Table)) : undefined;
}

/** The colours new tables take, in turn. */
export const TABLE_COLORS = ['#f2a65a', '#f5e050', '#5cbf6e', '#4fb3e8', '#e8655a', '#b07fd6', '#7ed6c4', '#d6a07e'];

/** A table's outline, studs (counterclockwise; an arc's sides every degree or so). */
export function tableOutline(t: Table): [number, number][] {
  if (t.shape === 'rect') return [[t.x, t.y], [t.x + t.w, t.y], [t.x + t.w, t.y + t.h], [t.x, t.y + t.h]];
  if (t.shape === 'poly') return t.pts.map((p) => [p[0], p[1]]);
  const a0 = Math.min(t.a0, t.a1), a1 = Math.max(t.a0, t.a1), n = Math.max(2, Math.ceil(a1 - a0));
  const at = (r: number, k: number): [number, number] => { const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180; return [t.cx + r * Math.cos(a), t.cy + r * Math.sin(a)]; };
  return [...Array.from({ length: n + 1 }, (_, k) => at(Math.max(t.r0, t.r1), k)), ...Array.from({ length: n + 1 }, (_, k) => at(Math.min(t.r0, t.r1), n - k))];
}

/** Is a point (studs) on the table (an arc's exactly, not its outline's)? */
export function onTable(t: Table, q: Pt): boolean {
  if (t.shape === 'rect') return q[0] >= t.x && q[0] <= t.x + t.w && q[1] >= t.y && q[1] <= t.y + t.h;
  if (t.shape === 'arc') {
    const r = Math.hypot(q[0] - t.cx, q[1] - t.cy), lo = Math.min(t.a0, t.a1), hi = Math.max(t.a0, t.a1);
    if (r < Math.min(t.r0, t.r1) || r > Math.max(t.r0, t.r1)) return false;
    const a = (Math.atan2(q[1] - t.cy, q[0] - t.cx) * 180) / Math.PI;
    return [a - 360, a, a + 360].some((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
  }
  const pts = t.pts;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Which table a point (mm) is on: its index, or -1 for none (the first, where they overlap). */
export function tableAt(tables: Table[], q: Pt): number {
  const s: Pt = [q[0] / 8, q[1] / 8];
  return tables.findIndex((t) => onTable(t, s));
}

/** Where a table's handle goes (its name on the plan, to drag it by): an arc's middle, else its outline's corners' average. */
export function tableMiddle(t: Table): [number, number] {
  if (t.shape === 'arc') { const a = (((t.a0 + t.a1) / 2) * Math.PI) / 180, r = (t.r0 + t.r1) / 2; return [t.cx + r * Math.cos(a), t.cy + r * Math.sin(a)]; }
  const pts = tableOutline(t);
  return pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length], [0, 0]);
}

/** A table moved by (dx, dy) studs. */
export function movedTable(t: Table, dx: number, dy: number): Table {
  if (t.shape === 'rect') return { ...t, x: t.x + dx, y: t.y + dy };
  if (t.shape === 'arc') return { ...t, cx: t.cx + dx, cy: t.cy + dy };
  return { ...t, pts: t.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A table mirrored left to right about the line x = px (studs). */
export function mirroredTable(t: Table, px: number): Table {
  if (t.shape === 'rect') return { ...t, x: r3(2 * px - t.x - t.w) };
  // (an arc's angles run counterclockwise from +x: a mirrored one is 180 - a, so its ends swap)
  if (t.shape === 'arc') return { ...t, cx: r3(2 * px - t.cx), a0: r3(180 - Math.max(t.a0, t.a1)), a1: r3(180 - Math.min(t.a0, t.a1)) };
  // (the corners in the other order, so the outline still runs counterclockwise)
  return { ...t, pts: t.pts.map(([x, y]) => [r3(2 * px - x), y] as [number, number]).reverse() };
}

/** A table turned by a degrees (counterclockwise) about (px, py), studs. A rectangle stays one at a quarter turn, else it becomes an outline. */
export function turnedTable(t: Table, px: number, py: number, a: number): Table {
  const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
  const at = (x: number, y: number): [number, number] => [r3(px + (x - px) * c - (y - py) * s), r3(py + (x - px) * s + (y - py) * c)];
  if (t.shape === 'arc') { const [cx, cy] = at(t.cx, t.cy); return { ...t, cx, cy, a0: r3(t.a0 + a), a1: r3(t.a1 + a) }; }
  if (t.shape === 'rect' && Math.abs(a / 90 - Math.round(a / 90)) < 1e-9) {
    const p = at(t.x, t.y), q = at(t.x + t.w, t.y + t.h);
    const x = Math.min(p[0], q[0]), y = Math.min(p[1], q[1]);
    return { ...t, x, y, w: r3(Math.abs(q[0] - p[0])), h: r3(Math.abs(q[1] - p[1])) };
  }
  return { name: t.name, color: t.color, shape: 'poly', pts: tableOutline(t).map(([x, y]) => at(x, y)) };
}

/** Is the whole table inside the box (studs)? */
export function tableInBox(t: Table, x0: number, y0: number, x1: number, y1: number): boolean {
  return tableOutline(t).every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
}
