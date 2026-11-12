// Studs a full stud apart (the setting Studs keep a full stud apart): none closer, middle to middle, than a stud's pitch
// (8 mm, less a hair for rounding), so a plate fits on any two side by side, as on a LEGO plate. Off (the default): only
// that they never overlap or touch (studs.ts studApart: a stud's width and half a millimetre).
import { studApart } from './studs';
import { STUD } from './track';
import { railPoint, type Route } from '../route/route';

/** (mm) How much under a pitch two studs may still be: rounding along a curve, single-precision files. */
export const PITCH_SLACK = 0.05;
/** The least two studs may be apart, middle to middle (mm): a pitch with fullPitch, else studApart. */
export const studGap = (studD: number, fullPitch?: boolean) => (fullPitch ? STUD - PITCH_SLACK : studApart(studD));
/** How many gaps a row of studs len long (mm) is split into, end stud to end stud: the nearest whole number of pitches (as it was), or with fullPitch never under a pitch apart. */
export const rowGaps = (len: number, fullPitch?: boolean, round: (v: number) => number = Math.round) =>
  Math.max(1, fullPitch ? Math.floor(len / STUD + PITCH_SLACK / STUD) : round(len / STUD));

/**
 * Where a row of studs along a route, off from its centre line (mm, left +), from a to b along it (mm), stands with
 * fullPitch: the centre line's places (s) that put them evenly along the row's own line, as many as fit a pitch or more
 * apart. (Even along the centre line, as without it, a curve's inner row is shorter than its outer: its studs closer.)
 */
export function pitchRow(rt: Route, off: number, a: number, b: number): number[] {
  const n = Math.max(2, Math.ceil((b - a) / 0.5)), ss: number[] = [], ls: number[] = [0];
  let prev = railPoint(rt, a, off);
  for (let k = 0; k <= n; k++) {
    const sk = a + ((b - a) * k) / n; ss.push(sk);
    if (k) { const q = railPoint(rt, sk, off); ls.push(ls[k - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1])); prev = q; }
  }
  const len = ls[n], gaps = rowGaps(len, true), out: number[] = [];
  for (let k = 0, j = 0; k <= gaps; k++) {
    const want = (len * k) / gaps;
    while (j < n - 1 && ls[j + 1] < want) j++;
    const f = ls[j + 1] > ls[j] ? (want - ls[j]) / (ls[j + 1] - ls[j]) : 0;
    out.push(ss[j] + f * (ss[j + 1] - ss[j]));
  }
  return out;
}
