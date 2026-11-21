// The X yard in small (design.ts slipXYard(4): four tracks, two diagonals crossing between the middle two, a double
// slip wherever a diagonal crosses a track), built as Aaron asked for the yard (2026-11-20): every lever straight out
// from its points (slipLevers 'straight'), straight cuts joined with axles, LEGO's straights. Where two slips' levers
// meet in the room between two tracks, the app moves one's slider along its points (network.ts placeLever, tryMove),
// never so its blade's post comes nearer its pin than POST_R_MIN (one bound on its slider at 17 mm: the yard's
// points24). Also, as the yard showed: no stud under any blade plate's swing, its own set's or a neighbour's
// (network.ts studsAlsoOff, base.ts bladePlates); a slider in two parts, under the diagonal, drives its blade by its
// posts' piece (assembled.shared.ts moves); no nub of rail left at a stepped cut (pathsplit.ts, cutter.ts railNubsOff).
// The whole goes together (assembled.shared.ts goesTogether: each blade follows its slider, nothing in anything).
import { describe, it } from 'vitest';
import { slipXYard } from '../src/app/design';
import { goesTogether } from './assembled.shared';

describe('the X yard in small, levers straight out', { timeout: 1800000 }, () => {
  it('goes together, each blade free on its slider', async () => {
    await goesTogether('X yard, 4 tracks', slipXYard(4));
  });
});
