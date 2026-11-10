// Snapping while drawing and while dragging a track's end: which guide the pointer is close enough to, and where it
// lands. A pure function (canvas.ts hands it what's near and draws what it says). Everything in studs and degrees;
// the closeness is in screen pixels (a finger needs more than a pointer), so a guide catches as easily zoomed far out
// as close in. With nothing near, the pointer goes to the stud grid.
import type { Pose } from './planner';

export type Pt = [number, number];
/** tangent: on from another track's end, straight on; parallel: beside a straight at a usual spacing; length: straight on from where the track is laid from, a whole number of studs; radius: on the arc of a usual curve; angle: a new track's direction (nothing to start from yet); grid: the stud grid */
export type GuideKind = 'tangent' | 'parallel' | 'length' | 'radius' | 'angle' | 'grid';
export interface Guide {
  kind: GuideKind;
  /** the dashed line to draw (studs) */
  line?: [Pt, Pt];
  /** (radius) the arc to draw: its centre, radius, and the angle (degrees, from +x, counter-clockwise) it starts at and how far it sweeps (+ counter-clockwise) */
  arc?: { c: Pt; r: number; a0: number; sweep: number };
  /** what the small label says ("16 studs from R3", "R32", "45°") */
  label: string;
  /** the live value: studs between the tracks, the radius, the angle (degrees) or the length */
  value: number;
}
export interface GuideEnd { pose: Pose; name: string }
export interface GuideStraight { x: number; y: number; heading: number; studs: number; name: string }
export interface GuideInput {
  /** the pointer (studs) */
  p: Pt;
  /** pixels per stud */
  scale: number;
  /** how near, in pixels, a guide catches (about 10 for a mouse, 22 for a finger) */
  snapPx: number;
  /** where the track being laid starts from (heading NaN: a new track from an empty point; none: nothing started) */
  from?: Pose;
  /** the other routes' ends, each pose facing outward (away from its track) */
  ends?: GuideEnd[];
  /** the other routes' straights */
  straights?: GuideStraight[];
  /** the radii a free curve snaps to (none: no radius guide) */
  radii?: readonly number[];
  /** centre to centre spacings, studs (default 8 and 16) */
  spacings?: readonly number[];
  /** Alt: snapping off (the stud grid stays: whole studs) */
  off?: boolean;
}
export interface GuideResult { point: Pt; guides: Guide[] }

/** The radii a free curve snaps to: LEGO's and the common ones (as Draw's curve choice lists first). */
export const COMMON_RADII = [24, 32, 40, 48, 56, 64, 72, 88, 104, 120] as const;

/** The usual spacings between parallel tracks, centre to centre, studs. */
export const SPACINGS = [8, 16] as const;

const rad = (d: number) => (d * Math.PI) / 180;
const dir = (h: number): Pt => [-Math.sin(rad(h)), Math.cos(rad(h))];
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const num = (v: number) => `${+v.toFixed(1)}`;
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

interface Cand { d: number; rank: number; point: Pt; guide: Guide }

/**
 * Where the pointer lands and what guides to show. The closest guide in pixels wins (a tie: tangent, then parallel,
 * then length, then radius); on a line, the point is rounded to a whole stud along it.
 */
export function guidePoint(inp: GuideInput): GuideResult {
  const { p, scale } = inp, grid: Pt = [Math.round(p[0]), Math.round(p[1])];
  const plain: GuideResult = { point: grid, guides: [] };
  const from = inp.from;
  // (a new track from an empty point: its direction is the nearest 22.5 degrees; the ray and its angle show, always)
  const angleGuide = (): GuideResult | undefined => {
    if (!from || !Number.isNaN(from.heading)) return undefined;
    const ang = (Math.atan2(-(p[0] - from.x), p[1] - from.y) * 180) / Math.PI, h = norm180(Math.round(ang / 22.5) * 22.5), u = dir(h);
    const len = Math.max(0, Math.round((p[0] - from.x) * u[0] + (p[1] - from.y) * u[1]));
    if (!len) return undefined;
    const q: Pt = [r6(from.x + u[0] * len), r6(from.y + u[1] * len)];
    return { point: q, guides: [{ kind: 'angle', line: [[from.x, from.y], q], label: `${num(h)}° · ${len} stud${len === 1 ? '' : 's'}`, value: h }] };
  };
  if (inp.off) return angleGuide() ? { point: grid, guides: [] } : plain;
  const first = angleGuide();
  const cands: Cand[] = [];
  const reachStuds = inp.snapPx / scale;
  // straight on from another track's end
  for (const e of inp.ends ?? []) {
    const u = dir(e.pose.heading), rx = p[0] - e.pose.x, ry = p[1] - e.pose.y;
    const t = rx * u[0] + ry * u[1], s = -rx * u[1] + ry * u[0];
    if (t < 1 - reachStuds || Math.abs(s) > reachStuds) continue;
    const tr = Math.max(1, Math.round(t)), q: Pt = [r6(e.pose.x + u[0] * tr), r6(e.pose.y + u[1] * tr)];
    cands.push({ d: Math.abs(s) * scale, rank: 0, point: q, guide: { kind: 'tangent', line: [[e.pose.x, e.pose.y], q], label: `in line with ${e.name} · ${tr} stud${tr === 1 ? '' : 's'} on`, value: tr } });
  }
  // beside a straight, at a usual spacing
  const sp = inp.spacings ?? SPACINGS;
  for (const st of inp.straights ?? []) {
    const u = dir(st.heading), rx = p[0] - st.x, ry = p[1] - st.y;
    const t = rx * u[0] + ry * u[1], s = -rx * u[1] + ry * u[0];
    if (t < -8 || t > st.studs + 8) continue;
    for (const k of sp) for (const sg of [-1, 1]) {
      const off = Math.abs(s - sg * k);
      if (off > reachStuds) continue;
      const tr = Math.round(t), q: Pt = [r6(st.x + u[0] * tr - u[1] * sg * k), r6(st.y + u[1] * tr + u[0] * sg * k)];
      const a: Pt = [r6(st.x - u[1] * sg * k + u[0] * Math.min(0, tr)), r6(st.y + u[0] * sg * k + u[1] * Math.min(0, tr))];
      cands.push({ d: off * scale, rank: 1, point: q, guide: { kind: 'parallel', line: [a, q], label: `${k} studs from ${st.name}`, value: k } });
    }
  }
  if (from && !Number.isNaN(from.heading)) {
    const u = dir(from.heading), rx = p[0] - from.x, ry = p[1] - from.y;
    const t = rx * u[0] + ry * u[1], s = -rx * u[1] + ry * u[0];
    // a whole number of studs straight on
    if (t >= 1 && Math.abs(s) <= reachStuds) {
      const tr = Math.round(t), q: Pt = [r6(from.x + u[0] * tr), r6(from.y + u[1] * tr)];
      cands.push({ d: Math.abs(s) * scale, rank: 2, point: q, guide: { kind: 'length', line: [[from.x, from.y], q], label: `${tr} stud${tr === 1 ? '' : 's'} straight`, value: tr } });
    }
    // on the arc of a usual radius, either way round
    for (const R of inp.radii ?? []) for (const side of [-1, 1]) {
      const c: Pt = [from.x - u[1] * side * R, from.y + u[0] * side * R], dx = p[0] - c[0], dy = p[1] - c[1], dist = Math.hypot(dx, dy);
      if (Math.abs(dist - R) > reachStuds || t < 0.5) continue;
      // (a whole degree of the turn: the angle from the start's side of the centre)
      const a0 = (Math.atan2(from.y - c[1], from.x - c[0]) * 180) / Math.PI, a = (Math.atan2(dy, dx) * 180) / Math.PI;
      let sweep = side > 0 ? a - a0 : a0 - a; // (a left turn goes counter-clockwise about a centre on its left: the angle grows)
      sweep = ((sweep % 360) + 360) % 360;
      if (sweep > 180) continue;
      const sw = Math.max(1, Math.round(sweep)), an = a0 + (side > 0 ? sw : -sw);
      const q: Pt = [r6(c[0] + R * Math.cos(rad(an))), r6(c[1] + R * Math.sin(rad(an)))];
      cands.push({ d: Math.abs(dist - R) * scale, rank: 3, point: q, guide: { kind: 'radius', arc: { c, r: R, a0, sweep: side > 0 ? sw : -sw }, label: `R${num(R)} · ${sw}°`, value: R } });
    }
  }
  let best: Cand | undefined;
  for (const c of cands) if (c.d <= inp.snapPx && (!best || c.d < best.d - 1e-9 || (Math.abs(c.d - best.d) <= 1e-9 && c.rank < best.rank))) best = c;
  if (best) return { point: best.point, guides: [best.guide] };
  return first ?? plain;
}
