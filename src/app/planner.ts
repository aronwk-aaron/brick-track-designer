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
/** The biggest free curve: 1000 studs (curves.scad's radii run 24 + 8k, and 1000 is one of them). */
export const MAX_RADIUS = 1000;

export function planFree(p: Pose, t: [number, number], minRadius = 24, maxRadius = MAX_RADIUS): DSeg[] | undefined {
  const d0 = dir(p.heading);
  const vx = t[0] - p.x, vy = t[1] - p.y;
  const f = vx * d0[0] + vy * d0[1];           // ahead
  const l = -(vx * d0[1] - vy * d0[0]);        // to the left
  if (Math.abs(l) < 1e-6) return f > 1e-6 ? [{ kind: 'straight', studs: round(f) }] : undefined;
  let a = 0, r = (f * f + l * l) / (2 * Math.abs(l));
  if (r > maxRadius) {
    if (f <= 1e-6) return undefined;
    // gentler than the biggest curve: that curve, then a straight on to t
    // (the straight's line touches the curve's end)
    const sn = Math.sign(l);
    const miss = (th: number) => {
      const e = arcEnd(p, maxRadius, sn * th), d1 = dir(p.heading + sn * th);
      return d1[0] * (t[1] - e.y) - d1[1] * (t[0] - e.x);
    };
    // the first angle where the end's tangent passes through t
    let lo = 1e-9, hi = -1;
    for (let th = 0.01; th <= 90; th += 0.01) { if (miss(lo) * miss(th) <= 0) { hi = th; break; } lo = th; }
    if (hi < 0) return undefined;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (miss(lo) * miss(mid) <= 0) hi = mid; else lo = mid; }
    const th = (lo + hi) / 2, e = arcEnd(p, maxRadius, sn * th);
    const b = Math.hypot(t[0] - e.x, t[1] - e.y);
    return [{ kind: 'curve', radius: maxRadius, angle: round(sn * th) }, ...(b > 1e-6 ? [{ kind: 'straight', studs: round(b) } as DSeg] : [])];
  }
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

/**
 * Free planning that can turn back: if one free curve can't reach t (it's
 * behind, or too far to the side), first turn on a curve of minRadius (left
 * or right, toward t) as little as needed, up to 180 degrees, then the free
 * curve from there. Undefined if even that doesn't reach.
 */
export function planFreeTurning(p: Pose, t: [number, number], minRadius = 24): DSeg[] | undefined {
  const direct = planFree(p, t, minRadius);
  if (direct) return direct;
  const d0 = dir(p.heading);
  const l = -((t[0] - p.x) * d0[1] - (t[1] - p.y) * d0[0]);
  let best: { segs: DSeg[]; len: number } | undefined;
  for (const sn of l >= 0 ? [1, -1] : [-1, 1])
    for (let th = 5; th <= 180 + 1e-9; th += 5) {
      const turn: DSeg = { kind: 'curve', radius: minRadius, angle: sn * th };
      const rest = planFree(follow(p, [turn]), t, minRadius);
      if (!rest) continue;
      const segs = [turn, ...rest];
      // merge a free curve that continues the turn at the same radius
      const len = segs.reduce((a, sg) => a + (sg.kind === 'straight' ? sg.studs : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180), 0);
      if (!best || len < best.len) best = { segs, len };
      break;
    }
  return best?.segs;
}

/**
 * When no allowed track reaches t: the single curve that would (whatever its
 * radius, even turning back on itself), or a straight back if t is right
 * behind, to show where the track would have to go.
 */
export function planAnyway(p: Pose, t: [number, number]): DSeg[] {
  const d0 = dir(p.heading);
  const vx = t[0] - p.x, vy = t[1] - p.y;
  const f = vx * d0[0] + vy * d0[1], l = -(vx * d0[1] - vy * d0[0]);
  if (Math.abs(l) < 1e-6) return [{ kind: 'straight', studs: round(f) }];
  const r = (f * f + l * l) / (2 * Math.abs(l));
  const angle = Math.sign(l) * 2 * (Math.atan2(Math.abs(l), f) * 180) / Math.PI;
  if (Math.abs(angle) <= 180) return [{ kind: 'curve', radius: round(r), angle: round(angle) }];
  // (behind: a U-turn across to t's side, then straight back to it)
  const u: DSeg = { kind: 'curve', radius: round(Math.abs(l) / 2), angle: Math.sign(l) * 180 };
  return [u, { kind: 'straight', studs: round(-f) }];
}

/**
 * From pose p to pose q (position and heading): the smoothest track that
 * joins them, with every curve at least minRadius. Tries a curve with a
 * straight before or after it, and an S of two curves of one radius (for
 * ends side by side, or facing the same way but offset). Undefined if none.
 */
export function planToPose(p: Pose, q: Pose, minRadius = 24): DSeg[] | undefined {
  const d0 = dir(p.heading);
  const vx = q.x - p.x, vy = q.y - p.y;
  const f = vx * d0[0] + vy * d0[1], l = -(vx * d0[1] - vy * d0[0]);   // ahead, to the left
  const turn = norm180(q.heading - p.heading);
  // local frame: start at the origin heading +y; an arc of radius r turning a
  // ends at r * u(a), and a straight of length s heading h adds s * dir(h)
  const u = (a: number): [number, number] => { const e = arcEnd({ x: 0, y: 0, heading: 0 }, 1, a); return [e.x, e.y]; };
  const target: [number, number] = [-l, f];
  const cands: { segs: DSeg[]; r: number }[] = [];
  const ok = (r: number) => Number.isFinite(r) && r >= minRadius - 1e-6;
  if (Math.abs(turn) < 1e-6) {
    if (Math.abs(l) < 1e-6 && f > 1e-6) return [{ kind: 'straight', studs: round(f) }];
  } else {
    // curve then straight (b), or straight (a) then curve: solve the 2x2 for (r, b) and (a, r)
    const w = u(turn), d1 = dir(turn), dS = dir(0);
    const solve = (c1: [number, number], c2: [number, number]) => {
      const det = c1[0] * c2[1] - c1[1] * c2[0];
      if (Math.abs(det) < 1e-9) return undefined;
      return [(target[0] * c2[1] - target[1] * c2[0]) / det, (c1[0] * target[1] - c1[1] * target[0]) / det];
    };
    const rb = solve(w, d1);
    if (rb && ok(rb[0]) && rb[1] >= -1e-6) cands.push({ r: rb[0], segs: [{ kind: 'curve', radius: round(rb[0]), angle: turn }, ...(rb[1] > 1e-6 ? [{ kind: 'straight', studs: round(rb[1]) } as DSeg] : [])] });
    const ar = solve(dS, w);
    if (ar && ok(ar[1]) && ar[0] >= -1e-6) cands.push({ r: ar[1], segs: [...(ar[0] > 1e-6 ? [{ kind: 'straight', studs: round(ar[0]) } as DSeg] : []), { kind: 'curve', radius: round(ar[1]), angle: turn }] });
  }
  // S: two curves of one radius r, turning t1 then turn - t1. The end at unit
  // radius is E(t1) = u(t1) + rot(t1) u(turn - t1); find t1 where E points at
  // the target, then r = |target| / |E|.
  const E = (t1: number): [number, number] => {
    const a = u(t1), b = u(turn - t1), c = Math.cos(rad(t1)), s = Math.sin(rad(t1));
    return [a[0] + c * b[0] - s * b[1], a[1] + s * b[0] + c * b[1]];
  };
  const ang = Math.atan2(target[1], target[0]);
  const miss = (t1: number) => { const e = E(t1); return norm180((Math.atan2(e[1], e[0]) - ang) * 180 / Math.PI); };
  for (let t = -179; t < 179; t += 1) {
    const m0 = miss(t), m1 = miss(t + 1);
    if (Math.abs(m0) > 90 || Math.abs(m1) > 90 || m0 * m1 > 0) continue;
    let lo = t, hi = t + 1;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (miss(lo) * miss(mid) <= 0) hi = mid; else lo = mid; }
    const t1 = (lo + hi) / 2, e = E(t1), r = Math.hypot(...target) / Math.hypot(...e);
    if (!ok(r) || Math.abs(t1) < 1e-6 || Math.abs(turn - t1) < 1e-6) continue;
    cands.push({ r, segs: [{ kind: 'curve', radius: round(r), angle: round(t1) }, { kind: 'curve', radius: round(r), angle: round(turn - t1) }] });
  }
  // the smoothest: the biggest radius
  cands.sort((x, y) => y.r - x.r);
  return cands[0]?.segs;
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
