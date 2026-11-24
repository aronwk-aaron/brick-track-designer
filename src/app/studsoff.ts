// (expert, stage 7) Stud-off areas: where no stud stands on the parts' top. Made by hand: a rectangle on the plan,
// whole studs each way, its sides on the lines between studs (Design.expert.studsOff), so a stud is either all in
// it (left off) or all out of it (kept): never cut. The app's own (the room its points' moving parts need: the
// blades as they swing, the throw bar and lever) are shown too, worked out from the build's plan; they can't be
// taken away or made smaller, only added to. Pure: no canvas, nothing built.

/** A stud-off area made by hand: from x0, y0 to x1, y1 (studs on the plan, whole, x0 < x1, y0 < y1). */
export interface StudsOffArea { id: string; x0: number; y0: number; x1: number; y1: number }

/** The most areas kept; the smallest and biggest side (studs); how far out on the plan (studs). */
export const AREA_MAX = 200, AREA_SIDE = [1, 64] as const, AREA_REACH = 10000;
/** A new area's size, studs each way (tapped with + Studs off). */
export const AREA_NEW = 2;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clampR = (v: number) => Math.max(-AREA_REACH, Math.min(AREA_REACH, Math.round(v)));

/** A file's areas as kept: whole studs, each side 1 to 64 studs (a longer one cut back from its x1 / y1), an id of its own each. Undefined: none. */
export function cleanStudsOff(v: unknown): StudsOffArea[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: StudsOffArea[] = [];
  for (const x of v.slice(0, AREA_MAX) as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object' || !fin(x.x0) || !fin(x.y0) || !fin(x.x1) || !fin(x.y1)) continue;
    const ax = clampR(Math.min(x.x0, x.x1)), bx = clampR(Math.max(x.x0, x.x1)), ay = clampR(Math.min(x.y0, x.y1)), by = clampR(Math.max(x.y0, x.y1));
    if (bx - ax < AREA_SIDE[0] || by - ay < AREA_SIDE[0]) continue;
    let id = typeof x.id === 'string' && x.id && x.id.length <= 40 ? x.id : '';
    if (!id || out.some((q) => q.id === id)) id = nextAreaId(out);
    out.push({ id, x0: ax, y0: ay, x1: Math.min(bx, ax + AREA_SIDE[1]), y1: Math.min(by, ay + AREA_SIDE[1]) });
  }
  return out.length ? out : undefined;
}
/** An id not yet used: s1, s2, ... */
export function nextAreaId(list: readonly { id: string }[]): string {
  let n = list.length + 1;
  while (list.some((q) => q.id === `s${n}`)) n++;
  return `s${n}`;
}
/** Why an area can't be as given (undefined: it can): whole studs, 1 to 64 studs each way, on the plan. */
export function areaProblem(a: Pick<StudsOffArea, 'x0' | 'y0' | 'x1' | 'y1'>): string | undefined {
  if (![a.x0, a.y0, a.x1, a.y1].every((v) => fin(v) && Number.isInteger(v))) return 'A stud-off area goes by whole studs, so no stud is cut';
  const w = a.x1 - a.x0, h = a.y1 - a.y0;
  if (w < AREA_SIDE[0] || h < AREA_SIDE[0]) return `A stud-off area is at least ${AREA_SIDE[0]} stud each way`;
  if (w > AREA_SIDE[1] || h > AREA_SIDE[1]) return `A stud-off area is at most ${AREA_SIDE[1]} studs each way: add another beside it`;
  if ([a.x0, a.y0, a.x1, a.y1].some((v) => Math.abs(v) > AREA_REACH)) return 'That is off the plan';
  return undefined;
}
/** A new area of AREA_NEW studs each way where the plan is tapped (studs): the tap in it, its sides on whole studs. */
export function areaAt(id: string, w: [number, number]): StudsOffArea {
  const x0 = Math.round(w[0] - AREA_NEW / 2), y0 = Math.round(w[1] - AREA_NEW / 2);
  return { id, x0, y0, x1: x0 + AREA_NEW, y1: y0 + AREA_NEW };
}
/** An area moved by (dx, dy), rounded to whole studs. */
export const moveArea = (a: StudsOffArea, dx: number, dy: number): StudsOffArea => ({ ...a, x0: a.x0 + Math.round(dx), x1: a.x1 + Math.round(dx), y0: a.y0 + Math.round(dy), y1: a.y1 + Math.round(dy) });

/** Which corner of an area (0: x0 y0, 1: x1 y0, 2: x1 y1, 3: x0 y1). */
export type Corner = 0 | 1 | 2 | 3;
export const cornersOf = (a: StudsOffArea): [number, number][] => [[a.x0, a.y0], [a.x1, a.y0], [a.x1, a.y1], [a.x0, a.y1]];
/**
 * An area with one corner dragged to w (studs on the plan): that corner to the whole stud nearest, the opposite one
 * where it is; never under 1 nor over 64 studs a side, nor turned inside out: why says what held it.
 */
export function dragCorner(a: StudsOffArea, k: Corner, w: [number, number]): { area: StudsOffArea; why?: string } {
  const movesX0 = k === 0 || k === 3, movesY0 = k === 0 || k === 1, [lo, hi] = AREA_SIDE;
  let why: string | undefined;
  const side = (want: number, fixed: number, low: boolean) => {
    const v = Math.round(want), len = low ? fixed - v : v - fixed;
    if (len < lo) { why = `A stud-off area is at least ${lo} stud each way`; return low ? fixed - lo : fixed + lo; }
    if (len > hi) { why = `A stud-off area is at most ${hi} studs each way: add another beside it`; return low ? fixed - hi : fixed + hi; }
    return v;
  };
  const x = side(w[0], movesX0 ? a.x1 : a.x0, movesX0), y = side(w[1], movesY0 ? a.y1 : a.y0, movesY0);
  return { area: { ...a, ...(movesX0 ? { x0: x } : { x1: x }), ...(movesY0 ? { y0: y } : { y1: y }) }, ...(why && { why }) };
}
/** How far a point (studs) is outside an area (0: in it). */
export function areaDistance(a: Pick<StudsOffArea, 'x0' | 'y0' | 'x1' | 'y1'>, w: [number, number]): number {
  return Math.hypot(Math.max(a.x0 - w[0], 0, w[0] - a.x1), Math.max(a.y0 - w[1], 0, w[1] - a.y1));
}
/** What it's called on its card and the selection bar. */
export const areaText = (a: StudsOffArea) => `Stud-off area, ${a.x1 - a.x0} x ${a.y1 - a.y0} studs, by hand`;
/** The areas for the build: mm on the plan, [x0, y0, x1, y1] each. */
export const studsOffMm = (list: readonly StudsOffArea[] | undefined): [number, number, number, number][] => (list ?? []).map((a) => [a.x0 * 8, a.y0 * 8, a.x1 * 8, a.y1 * 8]);
/** Is a stud's middle q (mm) in one of these (mm)? Strictly inside: a stud's middle is never on a side between studs. */
export const inStudsOff = (rects: readonly (readonly number[])[], q: readonly number[]) => rects.some((r) => q[0] > r[0] && q[0] < r[2] && q[1] > r[1] && q[1] < r[3]);

// ---------- the app's own ----------
type Pt = [number, number];
/**
 * The room a points set's moving parts need, where the app keeps studs out of their way: each blade's stretch as it
 * swings (a band along each of its routes from the toe to past the heel, out past the stock rails: the build's
 * no-cut band, `Overlay.cutting.no.blades`), and its throw bar and lever (the arm's outline as built, the lever in
 * it: the 'throw' item's). In studs on the plan. key: the points' (its toe, mm, as the Trackwork's).
 */
export interface AppArea { key: string; at: Pt; bands: { line: Pt[]; half: number }[]; arms: Pt[][] }
/** From the build's overlay (mm): one for each points set that is built (none taken out). */
export function appAreas(ov: { items?: readonly { kind: string; key: string; at: Pt; pts: Pt[]; off?: boolean }[]; cutting?: { no: { blades: readonly { line: Pt[]; half: number }[] } } } | undefined): AppArea[] {
  const pts = (ov?.items ?? []).filter((it) => it.kind === 'points' && !it.off), out = new Map<string, AppArea>();
  const st = (q: Pt): Pt => [q[0] / 8, q[1] / 8];
  for (const p of pts) if (!out.has(p.key)) out.set(p.key, { key: p.key, at: st(p.at), bands: [], arms: [] });
  if (!out.size) return [];
  const list = [...out.values()];
  // (each blade's band to the points whose toe is at either end of it, the nearest)
  for (const b of ov?.cutting?.no.blades ?? []) {
    if (b.line.length < 2) continue;
    const ends = [b.line[0], b.line[b.line.length - 1]].map(st);
    let best: AppArea | undefined, bd = Infinity;
    for (const a of list) { const dd = Math.min(...ends.map((e) => Math.hypot(e[0] - a.at[0], e[1] - a.at[1]))); if (dd < bd) { bd = dd; best = a; } }
    if (best && bd < 2) best.bands.push({ line: b.line.map(st), half: b.half / 8 });
  }
  for (const it of ov?.items ?? []) if (it.kind === 'throw' && it.pts.length >= 3) out.get(it.key)?.arms.push(it.pts.map(st));
  return list.filter((a) => a.bands.length || a.arms.length);
}
const segOff = (q: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, k = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(q[0] - a[0] - k * dx, q[1] - a[1] - k * dy);
};
const inPoly = (ring: Pt[], q: Pt) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xa, ya] = ring[i], [xb, yb] = ring[j];
    if ((ya > q[1]) !== (yb > q[1]) && q[0] < xa + ((q[1] - ya) * (xb - xa)) / (yb - ya)) inside = !inside;
  }
  return inside;
};
/** How far a point (studs) is outside the app's area (0: in it). */
export function appAreaDistance(a: AppArea, w: Pt): number {
  let best = Infinity;
  for (const b of a.bands) for (let k = 1; k < b.line.length; k++) best = Math.min(best, Math.max(0, segOff(w, b.line[k - 1], b.line[k]) - b.half));
  for (const ring of a.arms) {
    if (inPoly(ring, w)) return 0;
    for (let k = 0; k < ring.length; k++) best = Math.min(best, segOff(w, ring[k], ring[(k + 1) % ring.length]));
  }
  return best;
}
/** The whole studs round an app's area (its box, a stud more each way): what Clear more round it starts from. */
export function appAreaBox(a: AppArea): Pick<StudsOffArea, 'x0' | 'y0' | 'x1' | 'y1'> {
  const xs: number[] = [], ys: number[] = [];
  for (const b of a.bands) for (const q of b.line) { xs.push(q[0] - b.half, q[0] + b.half); ys.push(q[1] - b.half, q[1] + b.half); }
  for (const ring of a.arms) for (const q of ring) { xs.push(q[0]); ys.push(q[1]); }
  const x0 = Math.floor(Math.min(...xs)) - 1, y0 = Math.floor(Math.min(...ys)) - 1;
  return { x0, y0, x1: Math.min(Math.ceil(Math.max(...xs)) + 1, x0 + AREA_SIDE[1]), y1: Math.min(Math.ceil(Math.max(...ys)) + 1, y0 + AREA_SIDE[1]) };
}
/** Why an app's area can't be taken away or made smaller: said on its card and when Delete is pressed. */
export const APP_AREA_WHY = 'The points need this room: their blades swing here and their throw bar and lever move here, so the app keeps studs out of their way. It can\'t be taken away or made smaller; add a stud-off area to clear more.';
