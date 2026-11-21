// A switch printed beside LEGO's own straights (Bought track: LEGO's only, Long track cut into: Track pieces), as the X
// yard's corner switches are: its branch is cut into two pieces where its own pieces would join (sections.ts), both in
// the switch's one part. Each piece was swept from its own start, and on the curve their ends met all but exactly: the
// part had a wall of no thickness across the track there (44 edges shared by more than two triangles in its file), and
// the check rails split there flared away at both sides of the joint. The two are fused now (crossing.ts
// CrossingExtras.fuse): the part's files have no such edge.
import { describe, it } from 'vitest';
import { TEMPLATES } from '../src/app/design';
import { goesTogether } from './assembled.shared';

describe('a switch printed beside LEGO straights', { timeout: 900000 }, () => {
  for (const name of ['Switch R104 left', 'Switch R104 right']) it(`${name}: goes together, no edge shared by more than two triangles`, async () => {
    const d = structuredClone(TEMPLATES[name]);
    d.options = { ...d.options, pointBlades: 1, ballast: 'ballast', legoTrack: 'lego-only', joint: 'flataxle', slipLevers: 'straight', splitTrack: 'lengths' };
    await goesTogether(`${name}, LEGO's straights bought`, d, undefined, 0);
  });
});
