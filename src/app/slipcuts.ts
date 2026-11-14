// The double slips' sections as the reference's (slipCuts 'reference'): cut paths worked out from each slip found in
// the routes (switch/dslip.ts), added to the design's own. The middle section, 8 studs long on the bisector of the
// two tracks: a cut each side of the crossing, square to the bisector 4 studs from the centre, laid on the stud grid
// as a staircase (a run each side, at the line's place half way out, and one step between them where the step can be
// made nearest where the line crosses half way). Only slips at a shallow angle (their points past the acute frogs, as
// the R104 one at 22.5 degrees): a 45-degree slip's points are at its ends.
// (Not yet: the reference's outer end split in two in the lens between the tracks, and its inner end in three at an X
// centre. Each split has to pass its acute frog, where no cut may come within 2 studs (cutpaths.ts FROG_CLEAR), and
// the points' moving length, counted from where the routes part, covers the lens.)
import type { Route } from '../route/route';
import type { Solution } from '../route/solver';
import { findDoubleSlips } from '../switch/dslip';
import { type CutPath, type Grid, type NoCut, type Pt, fromGrid, pathProblem, toGrid } from './cutpaths';

/** (studs) The middle section's half length along the bisector (the reference's: 8 long), and how far each cut runs out either side of the bisector. */
export const SLIP_MID_HALF = 4, SLIP_MID_REACH = 10;

/** The slips' middle cut paths (plan studs, as gridPath lays them), each one that can be made (pathProblem) beside the others (taken: plan studs); ids slipN-a and slipN-b. */
export function slipCutPaths(routes: Route[], sol: Solution, g: Grid, railG: number, no: NoCut | undefined, taken: Pt[][]): CutPath[] {
  const out: CutPath[] = [], others = [...taken];
  findDoubleSlips(routes, sol).forEach((ds, i) => {
    if (!ds.sets.some((st) => st.frogS < st.span - 2)) return;
    const c = toGrid(g, [ds.centre[0] / 8, ds.centre[1] / 8]), h = ((ds.bisector - g[2]) * Math.PI) / 180, b: Pt = [-Math.sin(h), Math.cos(h)];
    // (u: along the grid's axis nearer the bisector, v across it)
    const alongY = Math.abs(b[1]) >= Math.abs(b[0]), U = (p: Pt) => (alongY ? p[1] : p[0]), V = (p: Pt) => (alongY ? p[0] : p[1]);
    const mk = (v: number, u: number): Pt => fromGrid(g, alongY ? [v, u] : [u, v]), bu = U(b), bv = V(b);
    for (const [s, id] of [[-1, 'a'], [1, 'b']] as const) {
      const um = U(c) + s * SLIP_MID_HALF * bu, vm = V(c) + s * SLIP_MID_HALF * bv, line = (v: number) => um - (bv / bu) * (v - vm);
      const v0 = Math.round(vm - SLIP_MID_REACH), v1 = Math.round(vm + SLIP_MID_REACH), uL = Math.round(line((v0 + vm) / 2)), uR = Math.round(line((vm + v1) / 2));
      const tries: Pt[][] = [];
      if (uL === uR) tries.push([mk(v0, uL), mk(v1, uL)]);
      else {
        const vx = Math.abs(bv) < 1e-9 ? vm : vm + ((um - (uL + uR) / 2) * bu) / bv;
        const steps = Array.from({ length: v1 - v0 - 3 }, (_, k) => v0 + 2 + k).sort((p, q) => Math.abs(p - vx) - Math.abs(q - vx));
        for (const vs of steps) tries.push([mk(v0, uL), mk(vs, uL), mk(vs, uR), mk(v1, uR)]);
      }
      const ok = tries.find((pts) => !pathProblem(pts, others, { routes, railG, no }));
      if (!ok) continue;
      others.push(ok);
      out.push({ id: `slip${i + 1}-${id}`, pts: ok });
    }
  });
  return out;
}
