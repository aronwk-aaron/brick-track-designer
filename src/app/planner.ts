// The rail planner: from the end of a track (position and heading) to a
// point you pick, the track that gets there with straights and one curve of
// the chosen radius, ending on one of the 16 directions (22.5 degree steps),
// the way top-down train games lay rails.
//
// Units: studs and degrees (heading 0 = +y, positive = turned left), as the
// design is stored.
import type { DSeg } from './design';

export interface Pose { x: number; y: number; heading: number }

const rad = (d: number) => (d * Math.PI) / 180;
const dir = (h: number): [number, number] => [-Math.sin(rad(h)), Math.cos(rad(h))];
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
export const STEP = 22.5;

/** The end pose of an arc of radius r turning angle (signed, + = left) from p. */
function arcEnd(p: Pose, r: number, angle: number): Pose {
  const sn = Math.sign(angle);
  const cx = p.x - sn * r * Math.cos(rad(p.heading)), cy = p.y - sn * r * Math.sin(rad(p.heading));
  const h = p.heading + angle;
  return { x: cx + sn * r * Math.cos(rad(h)), y: cy + sn * r * Math.sin(rad(h)), heading: h };
}

/** LEGO and common third-party radii, in studs, for the planner's auto mode. */
export const RADII = [24, 32, 40, 48, 56, 64, 72, 88, 104, 120];

/**
 * Plan from p to t trying every radius in radii (auto mode): the path where
 * the curve does most of the work (least straight before and after it),
 * preferring the bigger radius on a tie.
 */
export function planAuto(p: Pose, t: [number, number], radii = RADII, maxTurn = 90): DSeg[] | undefined {
  let best: { segs: DSeg[]; straight: number; r: number } | undefined;
  for (const r of radii) {
    const segs = plan(p, t, r, maxTurn);
    if (!segs) continue;
    const straight = segs.reduce((a, sg) => a + (sg.kind === 'straight' ? sg.studs : 0), 0);
    if (!best || straight < best.straight - 0.5 || (Math.abs(straight - best.straight) <= 0.5 && r > best.r)) best = { segs, straight, r };
  }
  return best?.segs;
}

/**
 * Free curve: from p, one arc of whatever radius lands exactly on t (ending
 * at whatever angle that gives), with a straight first if the arc would be
 * tighter than minRadius. Undefined if t can't be reached going forward
 * (behind, or too far to the side for minRadius).
 */
export function planFree(p: Pose, t: [number, number], minRadius = 24): DSeg[] | undefined {
  const d0 = dir(p.heading);
  const vx = t[0] - p.x, vy = t[1] - p.y;
  const f = vx * d0[0] + vy * d0[1];           // ahead
  const l = -(vx * d0[1] - vy * d0[0]);        // to the left
  if (Math.abs(l) < 1e-6) return f > 1e-6 ? [{ kind: 'straight', studs: round(f) }] : undefined;
  let a = 0, r = (f * f + l * l) / (2 * Math.abs(l));
  if (r < minRadius) {
    const q = 2 * minRadius * Math.abs(l) - l * l;
    if (q < 0) return undefined;
    a = f - Math.sqrt(q); r = minRadius;
    if (a < -1e-6) return undefined;
  }
  const fr = f - a;
  if (fr <= 1e-6) return undefined;
  const angle = Math.sign(l) * 2 * (Math.atan2(Math.abs(l), fr) * 180) / Math.PI;
  return [...(a > 1e-6 ? [{ kind: 'straight', studs: round(a) } as DSeg] : []), { kind: 'curve', radius: round(r), angle: round(angle) }];
}

/** The same route the other way round: from its end back to its start. */
export function reversed(r: { x: number; y: number; heading: number; segs: DSeg[] }): { x: number; y: number; heading: number; segs: DSeg[] } {
  const e = follow(r, r.segs);
  return { x: e.x, y: e.y, heading: ((e.heading + 360) % 360) - 180,
    segs: r.segs.slice().reverse().map((sg) => (sg.kind === 'straight' ? { ...sg } : { ...sg, angle: -sg.angle })) };
}

/** A short description of segments, e.g. "6 studs + R40 45° left + 3.2 studs". */
export function describe(segs: DSeg[]): string {
  return segs.map((sg) => sg.kind === 'straight' ? `${fmt(sg.studs)} studs` : `R${fmt(sg.radius)} ${fmt(Math.abs(sg.angle))}° ${sg.angle > 0 ? 'left' : 'right'}`).join(' + ');
}
const fmt = (v: number) => String(Math.round(v * 100) / 100);

/**
 * Plan from pose p to target t: [lead straight, curve, tail straight],
 * dropping empty pieces. radius in studs. Returns undefined when t can't be
 * reached going forward (behind the start, say).
 */
export function plan(p: Pose, t: [number, number], radius: number, maxTurn = 90): DSeg[] | undefined {
  const d0 = dir(p.heading);
  const vx = t[0] - p.x, vy = t[1] - p.y;
  const ahead = vx * d0[0] + vy * d0[1], side = vx * d0[1] - vy * d0[0]; // side: + = right
  if (ahead <= 1e-6) return undefined;
  // Straight on, if the target is on the line.
  if (Math.abs(side) < 1e-6) return [{ kind: 'straight', studs: round(ahead) }];
  let best: { segs: DSeg[]; len: number } | undefined;
  for (let k = 1; k * STEP <= maxTurn + 1e-9; k++)
    for (const sn of [1, -1]) {
      const turn = sn * k * STEP;
      // p + a*d0 -> arc -> + b*d1 = t, solve for a, b >= 0
      const e = arcEnd({ x: 0, y: 0, heading: p.heading }, radius, turn);
      const d1 = dir(p.heading + turn);
      const rx = vx - e.x, ry = vy - e.y;
      const det = d0[0] * d1[1] - d0[1] * d1[0];
      if (Math.abs(det) < 1e-9) continue;
      const a = (rx * d1[1] - ry * d1[0]) / det, b = (d0[0] * ry - d0[1] * rx) / det;
      if (a < -1e-6 || b < -1e-6) continue;
      const len = a + b + (Math.abs(turn) * Math.PI * radius) / 180;
      if (!best || len < best.len)
        best = { len, segs: [
          ...(a > 1e-6 ? [{ kind: 'straight', studs: round(a) } as DSeg] : []),
          { kind: 'curve', radius, angle: turn },
          ...(b > 1e-6 ? [{ kind: 'straight', studs: round(b) } as DSeg] : []),
        ] };
    }
  return best?.segs;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

/** The pose after following segments from p. */
export function follow(p: Pose, segs: DSeg[]): Pose {
  let q = { ...p };
  for (const sg of segs) {
    if (sg.kind === 'straight') { const d = dir(q.heading); q = { x: q.x + d[0] * sg.studs, y: q.y + d[1] * sg.studs, heading: q.heading }; }
    else q = arcEnd(q, sg.radius, sg.angle);
  }
  return { ...q, heading: norm180(q.heading) };
}

/** Points along segments from p, every step studs (for drawing). */
export function trace(p: Pose, segs: DSeg[], step = 0.5): [number, number][] {
  const out: [number, number][] = [[p.x, p.y]];
  let q = { ...p };
  for (const sg of segs) {
    const len = sg.kind === 'straight' ? sg.studs : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180;
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      const r = sg.kind === 'straight' ? follow(q, [{ kind: 'straight', studs: sg.studs * f }]) : follow(q, [{ ...sg, angle: sg.angle * f }]);
      out.push([r.x, r.y]);
    }
    q = follow(q, [sg]);
  }
  return out;
}
