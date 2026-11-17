// The double slips' sections as the reference's (slipCuts 'reference'): cut paths worked out from each slip found in
// the routes (switch/dslip.ts), added to the design's own. The middle section, 8 studs long on the bisector of the
// two tracks: a cut each side of the crossing, square to the bisector 4 studs from the centre, laid on the stud grid
// as a staircase (a run each side, at the line's place half way out, and one step between them where the step can be
// made nearest where the line crosses half way). Only slips at a shallow angle (their points past the acute frogs, as
// the R104 one at 22.5 degrees): a 45-degree slip's points are at its ends.
// These are a slip's own cuts (cutpaths.ts pathProblem's slip), checked against the moving parts themselves (each
// moving blade as it swings, its slider's tunnel, the lever's arm and the blades' pins: no.moving, from the points as
// planned), not against the points' whole span, and they may go through a frog's V, as the reference's do; never
// through a stud (they run on the stud grid). Where two slips are side by side on one pair of crossings (a
// crossover's), each one's cut runs half way to the other, and the two are one path.
// (Not made: the reference's outer end split in two between the tracks, and its inner end in three at an X centre.
// With one moving blade a set, the diagonal's blade turns on a pin by the middle cut, 1 stud from the straight
// track's rail, and its lever's arm runs out the other side: no cut on the stud grid gets between them.)
import type { Route } from '../route/route';
import type { Solution } from '../route/solver';
import { findDoubleSlips } from '../switch/dslip';
import { type CutPath, type Grid, type NoCut, type Pt, fromGrid, pathProblem, toGrid } from './cutpaths';

/** (studs) The middle section's half length along the bisector (the reference's: 8 long), how far each cut runs out either side of the bisector, and the least it does. */
export const SLIP_MID_HALF = 4, SLIP_MID_REACH = 10, SLIP_MID_SHORT = 6;
/** (studs) How far from where the line crosses half way a cut's step may be before a straight cut is tried. */
export const SLIP_STEP_OFF = 3;
/** A slip's own cut path (slip: checked as one, cutpaths.ts pathProblem). */
export type SlipCutPath = CutPath & { slip?: boolean };

/** The slips' middle cut paths (plan studs, as gridPath lays them), each one that can be made (pathProblem, as a slip's own: no.moving given) beside the others (taken: plan studs); ids slipN-a and slipN-b. */
export function slipCutPaths(routes: Route[], sol: Solution, g: Grid, railG: number, no: NoCut | undefined, taken: Pt[][]): SlipCutPath[] {
  const out: SlipCutPath[] = [], others = [...taken], slips = findDoubleSlips(routes, sol);
  const slip = !!no?.moving;
  slips.forEach((ds, i) => {
    if (!ds.sets.some((st) => st.frogS < st.span - 2)) return;
    const c = toGrid(g, [ds.centre[0] / 8, ds.centre[1] / 8]), h = ((ds.bisector - g[2]) * Math.PI) / 180, b: Pt = [-Math.sin(h), Math.cos(h)];
    // (u: along the grid's axis nearer the bisector, v across it)
    const alongY = Math.abs(b[1]) >= Math.abs(b[0]), U = (p: Pt) => (alongY ? p[1] : p[0]), V = (p: Pt) => (alongY ? p[0] : p[1]);
    const mk = (v: number, u: number): Pt => fromGrid(g, alongY ? [v, u] : [u, v]), bu = U(b), bv = V(b);
    // (another slip beside this one on the same crossings' line, a few studs across (a crossover's): each one's cut
    // half way to the other, the two meeting end to end between the tracks)
    const beside = (sd: number, v: number) => slips.reduce((r, o2, j) => { if (j === i) return r; const c2 = toGrid(g, [o2.centre[0] / 8, o2.centre[1] / 8]), dv = V(c2) - V(c), half = Math.round(V(c)) + sd * Math.floor(Math.abs(dv) / 2);
      return Math.abs(U(c2) - U(c)) < 2 * SLIP_MID_HALF && dv * sd > 0 ? (sd < 0 ? Math.max(r, half) : Math.min(r, half)) : r; }, v);
    for (const [s, id] of [[-1, 'a'], [1, 'b']] as const) {
      const um = U(c) + s * SLIP_MID_HALF * bu, vm = V(c) + s * SLIP_MID_HALF * bv, line = (v: number) => um - (bv / bu) * (v - vm);
      const v0 = beside(-1, Math.round(vm - SLIP_MID_REACH)), v1 = beside(1, Math.round(vm + SLIP_MID_REACH)), uL = Math.round(line((v0 + vm) / 2)), uR = Math.round(line((vm + v1) / 2));
      if (v1 - v0 < 4) continue;
      const triesOf = (w0: number, w1: number): Pt[][] => {
        if (uL === uR) return [[mk(w0, uL), mk(w1, uL)]];
        const vx = Math.abs(bv) < 1e-9 ? vm : vm + ((um - (uL + uR) / 2) * bu) / bv;
        const steps = Array.from({ length: Math.max(0, w1 - w0 - 3) }, (_, k) => w0 + 2 + k).sort((p, q) => Math.abs(p - vx) - Math.abs(q - vx));
        // (the step near where the line crosses half way; where none can be made there (a blade's pin by the line),
        // straight across at the run nearer the crossing, then at the other: a step far out is a notch at the bed's edge)
        const stepped = (vs: number) => [mk(w0, uL), mk(vs, uL), mk(vs, uR), mk(w1, uR)], nearer = [uL, uR].sort((p, q) => Math.abs(p - U(c)) - Math.abs(q - U(c)));
        return [...steps.filter((vs) => Math.abs(vs - vx) <= SLIP_STEP_OFF).map(stepped), ...nearer.map((u) => [mk(w0, u), mk(w1, u)]), ...steps.filter((vs) => Math.abs(vs - vx) > SLIP_STEP_OFF).map(stepped)];
      };
      // (its full reach either side first; then shorter, a stud at a time down to SLIP_MID_SHORT: an end that stops on
      // another cut running along the tracks beside the slip (a design's own), not a stud past it and along it)
      let ok: Pt[] | undefined;
      for (let t = 0; t <= 2 * (SLIP_MID_REACH - SLIP_MID_SHORT) && !ok; t++) for (let a = 0; a <= t && !ok; a++) {
        if (a > SLIP_MID_REACH - SLIP_MID_SHORT || t - a > SLIP_MID_REACH - SLIP_MID_SHORT) continue;
        ok = triesOf(v0 + a, v1 - (t - a)).find((pts) => !pathProblem(pts, others, { routes, railG, no, slip }));
      }
      if (!ok) continue;
      others.push(ok);
      out.push({ id: `slip${i + 1}-${id}`, pts: ok, ...(slip && { slip: true }) });
    }
  });
  // (two that meet end to end, between two slips side by side: one path, right across. Each on its own would end in
  // the open between the tracks, and a cut is carried straight on past its end, into the other track)
  for (let k = 0; k < out.length; k++) for (let j = 0; j < out.length; j++) {
    const a = out[k], e = out[j];
    if (j === k || !a || !e) continue;
    const same = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6, la = a.pts[a.pts.length - 1];
    const tail = same(la, e.pts[0]) ? e.pts.slice(1) : same(la, e.pts[e.pts.length - 1]) ? e.pts.slice(0, -1).reverse() : undefined;
    if (!tail) continue;
    const pts = [...a.pts, ...tail].filter((q, n, all) => n === 0 || n === all.length - 1 || Math.abs((q[0] - all[n - 1][0]) * (all[n + 1][1] - q[1]) - (q[1] - all[n - 1][1]) * (all[n + 1][0] - q[0])) > 1e-9);
    out[k] = { ...a, pts };
    out.splice(j, 1);
    k = -1;
    break;
  }
  return out;
}
