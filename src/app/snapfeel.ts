// How snapping a track end onto another feels while a part is being placed: how far it reaches, how it holds on, when it
// lets go, and how fast moves are left alone. The same rules and numbers as Aaron's layout designer (desktop
// src/ui/SnapFeel.h/.cpp, web apps/web/src/editor/snapFeel.ts), so the two feel the same:
//   - Reach is 14 px on screen (28 for a finger), turned into studs at the zoom and kept between 0.5 and 4 studs.
//   - Once snapped, it stays on that end until its own end is more than 1.6 reaches away.
//   - It moves to another end only when that one is clearly closer (by 30 % and by at least half a stud).
//   - Ends within a quarter stud of the nearest count as level: the smaller turn wins, then the part's end nearer the
//     pointer, then a fixed order.
//   - While the pointer moves fast (over 1200 px/s over the last moves) no new snap starts; one already made holds.
//     Putting it down always runs one last snap.
//   - Alt places without snapping.
// Any angle joins: the part turns about its joining end so the two ends face each other.

export const REACH_PX = 14;
export const REACH_PX_COARSE = 28;
export const MIN_REACH = 0.5;
export const MAX_REACH = 4;
export const HOLD_FACTOR = 1.6;
export const SWITCH_RATIO = 0.7;
export const SWITCH_MIN = 0.5;
export const TIE = 0.25;
export const TURN_TIE = 1;
export const FAST_PX_S = 1200;
export const SPEED_SAMPLES = 4;
export const SPEED_WINDOW_MS = 200;
/** A fast move that stops dead snaps after this long (ms). */
export const SETTLE_MS = 120;

/** Snap reach in studs at `pxPerStud` screen pixels a stud; `coarse`: a finger. */
export function reachStuds(pxPerStud: number, coarse = false): number {
  const raw = pxPerStud > 0 && Number.isFinite(pxPerStud) ? (coarse ? REACH_PX_COARSE : REACH_PX) / pxPerStud : MAX_REACH;
  return Math.min(MAX_REACH, Math.max(MIN_REACH, raw));
}
export const holdReach = (reach: number) => reach * HOLD_FACTOR;

/** One possible join: an end of the part being placed and an open end of the design. */
export interface Candidate {
  /** which end of the part (steady while it's placed) */ movingKey: string;
  /** which end of the design */ targetKey: string;
  /** studs between them, where the pointer has the part */ dist: number;
  /** studs from the part's end to the pointer */ mouseDist: number;
  /** degrees the part turns to face the end (absolute) */ turn: number;
}
export interface Lock { movingKey: string; targetKey: string }

function better(a: Candidate, b: Candidate): boolean {
  if (Math.abs(a.turn - b.turn) > TURN_TIE) return a.turn < b.turn;
  if (Math.abs(a.mouseDist - b.mouseDist) > 1e-9) return a.mouseDist < b.mouseDist;
  if (Math.abs(a.dist - b.dist) > 1e-9) return a.dist < b.dist;
  if (a.targetKey !== b.targetKey) return a.targetKey < b.targetKey;
  return a.movingKey < b.movingKey;
}
function bestNew(cs: readonly Candidate[], reach: number): number {
  let nearest = Infinity;
  for (const c of cs) if (c.dist <= reach && c.dist < nearest) nearest = c.dist;
  if (!Number.isFinite(nearest)) return -1;
  let best = -1;
  cs.forEach((c, i) => { if (c.dist <= reach && c.dist <= nearest + TIE && (best < 0 || better(c, cs[best]))) best = i; });
  return best;
}

/** Index of this frame's join in `cs`, or -1. `cs` may hold any within holdReach(reach); new ones count only within reach. */
export function pick(cs: readonly Candidate[], lock: Lock | undefined, reach: number, fast = false, bypass = false): number {
  if (bypass || !(reach > 0)) return -1;
  const hold = holdReach(reach);
  const held = lock ? cs.findIndex((c) => c.movingKey === lock.movingKey && c.targetKey === lock.targetKey && c.dist <= hold) : -1;
  const best = bestNew(cs, reach);
  if (held >= 0) {
    if (fast || best < 0 || best === held) return held;
    const h = cs[held].dist, b = cs[best].dist;
    return b <= h * SWITCH_RATIO && h - b >= SWITCH_MIN ? best : held;
  }
  return fast ? -1 : best;
}

/** Pointer speed in screen px/s over the last few moves. */
export class SpeedMeter {
  private s: { x: number; y: number; t: number }[] = [];
  sample(x: number, y: number, t: number) {
    if (this.s.length && t < this.s[this.s.length - 1].t) this.s = [];
    this.s.push({ x, y, t });
    while (this.s.length > SPEED_SAMPLES + 1) this.s.shift();
  }
  speed(): number {
    const s = this.s;
    if (s.length < 2) return 0;
    const newest = s[s.length - 1].t;
    let first = s.length - 1;
    while (first > 0 && newest - s[first - 1].t <= SPEED_WINDOW_MS) first--;
    const el = newest - s[first].t;
    if (el <= 0) return 0;
    let path = 0;
    for (let i = first + 1; i < s.length; i++) path += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    return (path / el) * 1000;
  }
  isFast() { return this.speed() > FAST_PX_S; }
  last() { return this.s[this.s.length - 1]; }
  reset() { this.s = []; }
}

/** One placing's snap state: the held join and the pointer speed. */
export class SnapSession {
  lock: Lock | undefined;
  meter = new SpeedMeter();
  /** This frame's join (index into cs, or -1), remembered for the next. final: putting it down (no speed gate). */
  step(cs: readonly Candidate[], reach: number, bypass = false, final = false): number {
    const i = pick(cs, this.lock, reach, !final && this.meter.isFast(), bypass);
    this.lock = i >= 0 ? { movingKey: cs[i].movingKey, targetKey: cs[i].targetKey } : undefined;
    return i;
  }
}
