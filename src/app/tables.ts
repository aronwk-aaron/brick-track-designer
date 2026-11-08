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

/** A short description of a table, for the panel. */
export function tableSummary(t: Table): string {
  if (t.shape === 'rect') return `${+t.w.toFixed(2)} × ${+t.h.toFixed(2)} studs`;
  if (t.shape === 'arc') return `radius ${+t.r0.toFixed(2)} to ${+t.r1.toFixed(2)}, ${+Math.abs(t.a1 - t.a0).toFixed(2)}°`;
  return `${t.pts.length} corners`;
}
