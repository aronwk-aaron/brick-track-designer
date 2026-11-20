import type { Design, DRoute } from './design';
import { nearestAlong } from './splitmerge';
import { cutLength } from './routecuts';
// (expert, stage 4) Rails and sleepers made from nothing (Design.expert.free): laid anywhere on the plan, on a track or
// off one. Each joins the printed parts it lies on (the share over each part, as the part is baked: build.ts), and what
// lies off every part is printed on its own (Aaron's D4, 2026-11-20). Pure: places in studs on the plan; no geometry.

/** A rail laid by hand: its centre line from `a` to `b` (studs on the plan), straight. */
export interface FreeRail { id: string; kind: 'rail'; a: [number, number]; b: [number, number] }
/** A sleeper laid by hand: its middle at `at` (studs), turned `heading` degrees (0: across the plan's x, as a track
 * heading up the plan has them), `len` studs long and `w` studs wide (left out: the design's sleeper width). */
export interface FreeSleeper { id: string; kind: 'sleeper'; at: [number, number]; heading: number; len: number; w?: number }
export type FreeItem = FreeRail | FreeSleeper;

/** The most kept, the shortest and longest rail, a sleeper's length and width (studs). */
export const FREE_MAX = 200, RAIL_MIN = 2, RAIL_MAX = 200, SLEEPER_LEN = [2, 24] as const, SLEEPER_W = [1, 4] as const, REACH = 10000;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (v: number) => Math.round(v * 100) / 100;
const pt = (v: unknown): [number, number] | undefined => (Array.isArray(v) && fin(v[0]) && fin(v[1]) && Math.abs(v[0]) <= REACH && Math.abs(v[1]) <= REACH ? [r2(v[0]), r2(v[1])] : undefined);
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/** A file's free rails and sleepers as kept: well-formed, each with an id of its own, numbers in range. Undefined: none. */
export function cleanFree(v: unknown): FreeItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: FreeItem[] = [], ids = new Set<string>();
  for (const x of v.slice(0, FREE_MAX) as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object') continue;
    let id = typeof x.id === 'string' && x.id && x.id.length <= 40 ? x.id : '';
    if (!id || ids.has(id)) id = nextFreeId(out);
    if (x.kind === 'rail') {
      const a = pt(x.a), b = pt(x.b);
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < RAIL_MIN - 1e-6 || len > RAIL_MAX + 1e-6) continue;
      out.push({ id, kind: 'rail', a, b }); ids.add(id);
    } else if (x.kind === 'sleeper') {
      const at = pt(x.at);
      if (!at || !fin(x.heading) || !fin(x.len)) continue;
      const w = fin(x.w) ? r2(clamp(x.w, SLEEPER_W)) : undefined;
      out.push({ id, kind: 'sleeper', at, heading: r2((((x.heading % 360) + 540) % 360) - 180), len: r2(clamp(x.len, SLEEPER_LEN)), ...(w !== undefined && { w }) }); ids.add(id);
    }
  }
  return out.length ? out : undefined;
}
/** An id not yet used: f1, f2, ... */
export function nextFreeId(list: readonly { id: string }[]): string {
  let n = list.length + 1;
  while (list.some((q) => q.id === `f${n}`)) n++;
  return `f${n}`;
}
/** Why it can't be (undefined: it can): the rule's words. */
export function freeProblem(f: FreeItem): string | undefined {
  if (f.kind === 'rail') {
    const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    if (len < RAIL_MIN - 1e-6) return `A rail ${RAIL_MIN} studs long at least`;
    if (len > RAIL_MAX + 1e-6) return `A rail ${RAIL_MAX} studs long at most`;
    return undefined;
  }
  if (f.len < SLEEPER_LEN[0] - 1e-6 || f.len > SLEEPER_LEN[1] + 1e-6) return `A sleeper ${SLEEPER_LEN[0]} to ${SLEEPER_LEN[1]} studs long`;
  return undefined;
}
/** Moved by (dx, dy) studs on the plan. */
export function moveFree(f: FreeItem, dx: number, dy: number): FreeItem {
  return f.kind === 'rail' ? { ...f, a: [r2(f.a[0] + dx), r2(f.a[1] + dy)], b: [r2(f.b[0] + dx), r2(f.b[1] + dy)] } : { ...f, at: [r2(f.at[0] + dx), r2(f.at[1] + dy)] };
}
/** A rail's end put at `to` (whole studs on the plan): undefined where that makes it too short or long. */
export function railEndTo(f: FreeRail, end: 'a' | 'b', to: [number, number]): FreeRail | undefined {
  const n: FreeRail = { ...f, [end]: [Math.round(to[0]), Math.round(to[1])] as [number, number] };
  return freeProblem(n) ? undefined : n;
}
/** What it is, for the selection bar and its card. */
export function freeText(f: FreeItem): string {
  if (f.kind === 'rail') { const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]); return `Rail laid by hand, ${+len.toFixed(2)} studs`; }
  return `Sleeper laid by hand, ${f.len} studs long`;
}
/** Where it is, for the hit test and the drawing (studs): a rail's two ends; a sleeper's four corners, its half width, its axis. */
export function sleeperCorners(f: FreeSleeper, wDefault: number): [number, number][] {
  const h = (f.heading * Math.PI) / 180, ax = [Math.cos(h), Math.sin(h)], ay = [-Math.sin(h), Math.cos(h)], hl = f.len / 2, hw = (f.w ?? wDefault) / 2;
  return [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([u, v]) => [f.at[0] + ax[0] * u + ay[0] * v, f.at[1] + ax[1] * u + ay[1] * v]);
}
/** How far a point (studs) is from it: 0 inside a sleeper; a rail, from its line. */
export function freeDistance(f: FreeItem, p: [number, number], wDefault: number): number {
  if (f.kind === 'rail') {
    const dx = f.b[0] - f.a[0], dy = f.b[1] - f.a[1], l2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((p[0] - f.a[0]) * dx + (p[1] - f.a[1]) * dy) / l2));
    return Math.hypot(f.a[0] + u * dx - p[0], f.a[1] + u * dy - p[1]);
  }
  const h = (f.heading * Math.PI) / 180, rx = p[0] - f.at[0], ry = p[1] - f.at[1], u = rx * Math.cos(h) + ry * Math.sin(h), v = -rx * Math.sin(h) + ry * Math.cos(h);
  return Math.hypot(Math.max(0, Math.abs(u) - f.len / 2), Math.max(0, Math.abs(v) - (f.w ?? wDefault) / 2));
}

/**
 * The stretches of a track (studs along it) that rails and sleepers laid by hand lie over (within its band: half its
 * sleepers' length either side, and a stud): where the app puts no joint between parts (sections.ts busy).
 */
export function freeBusy(d: Pick<Design, 'expert' | 'gaugeStuds' | 'options'>, r: DRoute): [number, number][] {
  const items = d.expert?.free;
  if (!items?.length || !r.segs.length) return [];
  const hw = ((r.gaugeStuds ?? d.gaugeStuds) + 1) / 2 + 1.5 + 1, L = cutLength(r), sw = d.options?.sleeperWidthStuds ?? 2, out: [number, number][] = [];
  for (const f of items) {
    const n0 = f.kind === 'rail' ? Math.max(2, Math.ceil(Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]) * 2)) : 0;
    const pts: [number, number][] = f.kind === 'rail'
      ? Array.from({ length: n0 + 1 }, (_, k) => [f.a[0] + ((f.b[0] - f.a[0]) * k) / n0, f.a[1] + ((f.b[1] - f.a[1]) * k) / n0] as [number, number])
      : [f.at, ...sleeperCorners(f, sw)];
    const ss = pts.flatMap((p) => { const n = nearestAlong(r, p); return n.dist <= hw && n.s >= -0.5 && n.s <= L + 0.5 ? [n.s] : []; });
    if (ss.length) out.push([Math.max(0, Math.min(...ss)), Math.min(L, Math.max(...ss))]);
  }
  return out;
}
