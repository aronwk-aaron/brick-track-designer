// Handles on a selected route's curves and straights, dragged on the plan: a curve's angle (a round handle at its far
// end), its radius (a diamond in the middle of the arc), a straight's length (a square at its far end). All in studs and
// degrees. The geometry is here (where each handle is; the new value from a dragged point, snapped); the canvas draws
// them and forwards the pointer.
import type { DRoute, DSeg } from './design';
import { clamp, LIMITS, radiusRange } from './limits';
import { type Guide, type GuideEnd, type GuideStraight, SPACINGS } from './guides';
import { follow, type Pose } from './planner';

export type HandleKind = 'angle' | 'radius' | 'length';
export interface Handle { seg: number; kind: HandleKind; at: [number, number] }

/** Angle steps: the usual curves are whole multiples of this (a circle of 64); Shift: half a degree. */
export const ANGLE_STEP = 5.625, ANGLE_FREE = 0.5;
/** A segment's drag doesn't start from the ends: a handle's inset from the route's end (px), so it doesn't sit on the end-drag handle. */
export const END_INSET_PX = 22;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const round = (v: number, p = 1e6) => Math.round(v * p) / p;

/** The pose a route's segment k starts at. */
export const poseBefore = (r: DRoute, k: number): Pose => follow({ x: r.x, y: r.y, heading: r.heading }, r.segs.slice(0, k));

/** How far (degrees) the last curve's angle handle sits back from its end, to keep clear of the end handle. */
const insetDeg = (radius: number, insetStuds: number) => Math.min(30, deg(insetStuds / radius));

/**
 * Where the handles are: each curve's angle handle (at its far end; the route's last segment's a little back from the
 * end, inset studs), its radius handle (the arc's middle), each straight's length handle (at its far end, likewise).
 */
export function segmentHandles(r: DRoute, insetStuds = 0): Handle[] {
  const out: Handle[] = [];
  r.segs.forEach((sg, k) => {
    const p = poseBefore(r, k), last = k === r.segs.length - 1;
    if (sg.kind === 'straight') {
      const l = last ? Math.max(sg.studs / 2, sg.studs - insetStuds) : sg.studs;
      const q = follow(p, [{ kind: 'straight', studs: l }]);
      out.push({ seg: k, kind: 'length', at: [q.x, q.y] });
    } else {
      const a = Math.abs(sg.angle), t = last ? Math.max(a / 2, a - insetDeg(sg.radius, insetStuds)) : a;
      const q = follow(p, [{ ...sg, angle: Math.sign(sg.angle) * t }]);
      out.push({ seg: k, kind: 'angle', at: [q.x, q.y] });
      const m = follow(p, [{ ...sg, angle: sg.angle / 2 }]);
      out.push({ seg: k, kind: 'radius', at: [m.x, m.y] });
    }
  });
  return out;
}

/** The handles that are at least minPx apart on the screen (the first of two too close stays: angle and length before radius). */
export function visibleHandles(hs: Handle[], scale: number, minPx = 10): Handle[] {
  const order = [...hs].sort((a, b) => Number(a.kind === 'radius') - Number(b.kind === 'radius'));
  const kept: Handle[] = [];
  for (const h of order) if (kept.every((o) => Math.hypot(o.at[0] - h.at[0], o.at[1] - h.at[1]) * scale >= minPx)) kept.push(h);
  return kept;
}

export interface DragOpts { shift?: boolean; insetStuds?: number }

/** What a dragged handle takes: the value, and when the pointer is past a limit (so the value stopped there), the reason, worded for the hint line. */
export interface DragResult { value: number; why?: string }

/**
 * The value a handle takes with the pointer at w: a curve's angle (signed: pulled past 0 it turns the curve the other
 * way), its radius, a straight's length. Snapped; within the limits (the card's: limits.ts), and the reason when it
 * stopped at one.
 */
export function dragResult(r: DRoute, h: { seg: number; kind: HandleKind }, w: [number, number], o: DragOpts = {}): DragResult | undefined {
  const sg = r.segs[h.seg];
  if (!sg) return undefined;
  const p = poseBefore(r, h.seg), last = h.seg === r.segs.length - 1, inset = last ? o.insetStuds ?? 0 : 0;
  if (sg.kind === 'straight') {
    if (h.kind !== 'length') return undefined;
    const d = [-Math.sin(rad(p.heading)), Math.cos(rad(p.heading))];
    const raw = (w[0] - p.x) * d[0] + (w[1] - p.y) * d[1] + inset * (last && sg.studs / 2 < sg.studs - inset ? 1 : 0);
    const step = o.shift ? 0.2 : 1, v = Math.round(raw / step) * step, [lo, hi] = LIMITS.straight;
    return { value: round(clamp(v, LIMITS.straight)), why: v < lo ? `shortest straight is ${lo} studs` : v > hi ? `longest straight is ${hi} studs` : undefined };
  }
  const sn = sg.angle >= 0 ? 1 : -1;
  if (h.kind === 'angle') {
    // (the pointer's angle round the centre, as far round as the curve's own turn: the nearest whole way round to where it was)
    const cx = p.x - sn * sg.radius * Math.cos(rad(p.heading)), cy = p.y - sn * sg.radius * Math.sin(rad(p.heading));
    const turn = norm180(deg(Math.atan2(sn * (w[1] - cy), sn * (w[0] - cx))) - p.heading) * sn; // (how far round in the curve's own direction)
    const cur = Math.abs(sg.angle);
    let raw = Math.abs(turn - cur) <= Math.abs(turn + 360 - cur) ? turn : turn + 360;
    if (last) raw += Math.min(30, deg(inset / sg.radius));
    const step = o.shift ? ANGLE_FREE : ANGLE_STEP, hi = LIMITS.angle[1];
    // (past the start's line the pointer is on the other side: the curve flips to the other hand, from then on measured that way)
    const flip = raw < 0 ? -1 : 1, mag = Math.round(Math.abs(raw) / step) * step;
    const a = Math.min(hi, Math.max(step, mag));
    return { value: round(sn * flip * a), why: mag < step ? `a curve turns at least ${+step.toFixed(3)}°` : mag > hi ? `a curve turns ${hi}° at most: add another curve to go on` : undefined };
  }
  if (h.kind === 'radius') {
    // (the arc's middle moves along a line from the curve's start, in proportion to the radius)
    const m = follow(p, [{ ...sg, angle: sg.angle / 2 }]), vx = (m.x - p.x) / sg.radius, vy = (m.y - p.y) / sg.radius;
    const raw = ((w[0] - p.x) * vx + (w[1] - p.y) * vy) / (vx * vx + vy * vy);
    // (a train curve: the usual radii, 24 + 8k; a monorail beam's: whole studs, from R4)
    const rr = radiusRange(r), v = o.shift || r.system === 'monorail' ? Math.round(raw) : 24 + Math.round((raw - 24) / 8) * 8, [lo, hi] = rr;
    return { value: clamp(Math.max(1, v), rr), why: v < lo ? `smallest radius is ${lo} studs` : v > hi ? `biggest radius is ${hi} studs` : undefined };
  }
  return undefined;
}

/** Just the value of dragResult. */
export const dragValue = (r: DRoute, h: { seg: number; kind: HandleKind }, w: [number, number], o: DragOpts = {}): number | undefined => dragResult(r, h, w, o)?.value;

/** The segment with a handle's value put in it (a copy). */
export function withValue(sg: DSeg, kind: HandleKind, v: number): DSeg {
  if (sg.kind === 'straight') return kind === 'length' ? { ...sg, studs: v } : sg;
  return kind === 'angle' ? { ...sg, angle: v } : kind === 'radius' ? { ...sg, radius: v } : sg;
}

/** What to say by a handle while it's dragged: "R104 · 22.5°" (and "16 make a circle" when that's a whole number), "16 studs". */
export function handleLabel(sg: DSeg): string {
  if (sg.kind === 'straight') return `${+sg.studs.toFixed(2)} studs`;
  const a = Math.abs(sg.angle), n = a > 0 ? 360 / a : 0;
  const circle = a > 0 && a < 360 && Math.abs(n - Math.round(n)) < 1e-6 ? ` · ${Math.round(n)} make a circle` : a === 360 ? ' · a full circle' : '';
  return `R${+sg.radius.toFixed(2)} · ${+a.toFixed(3)}°${circle}`;
}

/** What a dragged handle can snap to: the other routes' ends and straights (as guides.ts takes them), and the pixel scale and reach. */
export interface HandleGuides { ends: GuideEnd[]; straights: GuideStraight[]; scale: number; snapPx: number; spacings?: readonly number[] }

/** How near (studs) the route's end must be to a guide's line to count as on it. */
const ON_LINE = 0.02;
const dirOf = (h: number): [number, number] => [-Math.sin(rad(h)), Math.cos(rad(h))];

/**
 * The same guides as drawing and dragging an end (guides.ts), for a dragged handle: of the values the handle can take
 * (whole studs, the usual angle steps, the usual radii), the one that puts the route's end exactly on another end's
 * straight-on line, or beside another straight at 8 or 16 studs, when its handle is within reach of the pointer. Else
 * the value as dragResult gave it. Not with Shift (the fine steps) or Alt (off).
 */
export function guidedHandle(r: DRoute, h: { seg: number; kind: HandleKind }, w: [number, number], res: DragResult, g: HandleGuides, o: DragOpts & { off?: boolean } = {}): { value: number; guide?: Guide; end?: [number, number] } {
  const sg = r.segs[h.seg];
  if (!sg || o.off || o.shift || (!g.ends.length && !g.straights.length)) return { value: res.value };
  const start: Pose = { x: r.x, y: r.y, heading: r.heading }, reach = g.snapPx / g.scale;
  const values: number[] = [];
  if (sg.kind === 'straight') { const lo = Math.max(LIMITS.straight[0], Math.floor(res.value - reach - 1)), hi = Math.min(LIMITS.straight[1], Math.ceil(res.value + reach + 1)); for (let v = lo; v <= hi; v++) values.push(v); }
  else if (h.kind === 'angle') { const sn = res.value < 0 ? -1 : 1; for (let k = 1; k * ANGLE_STEP <= LIMITS.angle[1]; k++) values.push(round(sn * k * ANGLE_STEP)); }
  else if (r.system === 'monorail') { for (let v = Math.max(radiusRange(r)[0], Math.round(res.value - 40)); v <= Math.min(radiusRange(r)[1], Math.round(res.value + 40)); v++) values.push(v); }
  else { for (let v = 24; v <= LIMITS.radius[1]; v += 8) values.push(v); }
  let best: { value: number; d: number; guide: Guide; end: [number, number] } | undefined;
  for (const v of values) {
    const segs = r.segs.map((x, k) => (k === h.seg ? withValue(x, h.kind, v) : x));
    const e = follow(start, segs);
    const hp = segmentHandles({ ...r, segs }, o.insetStuds).find((q) => q.seg === h.seg && q.kind === h.kind);
    if (!hp) continue;
    const d = Math.hypot(hp.at[0] - w[0], hp.at[1] - w[1]) * g.scale;
    if (d > g.snapPx || (best && d >= best.d)) continue;
    const found = lineAt(e, g);
    if (found) best = { value: v, d, guide: found, end: [e.x, e.y] };
  }
  return best ? { value: best.value, guide: best.guide, end: best.end } : { value: res.value };
}

/** The guide whose line the pose's point is exactly on (tangent first), if any. */
function lineAt(e: Pose, g: HandleGuides): Guide | undefined {
  for (const en of g.ends) {
    const u = dirOf(en.pose.heading), rx = e.x - en.pose.x, ry = e.y - en.pose.y;
    const t = rx * u[0] + ry * u[1], s = -rx * u[1] + ry * u[0];
    if (t >= 1 && Math.abs(s) <= ON_LINE) return { kind: 'tangent', line: [[en.pose.x, en.pose.y], [round(e.x), round(e.y)]], label: `in line with ${en.name} · ${+t.toFixed(1)} stud${Math.abs(t - 1) < 1e-6 ? '' : 's'} on`, value: t };
  }
  for (const st of g.straights) {
    const u = dirOf(st.heading), rx = e.x - st.x, ry = e.y - st.y;
    const t = rx * u[0] + ry * u[1], s = -rx * u[1] + ry * u[0];
    if (t < -8 || t > st.studs + 8) continue;
    for (const k of g.spacings ?? SPACINGS) for (const sg of [-1, 1]) {
      if (Math.abs(s - sg * k) > ON_LINE) continue;
      const a: [number, number] = [round(st.x - u[1] * sg * k + u[0] * Math.min(0, t)), round(st.y + u[0] * sg * k + u[1] * Math.min(0, t))];
      return { kind: 'parallel', line: [a, [round(e.x), round(e.y)]], label: `${k} studs from ${st.name}`, value: k };
    }
  }
  return undefined;
}
