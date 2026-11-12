// Track joined onto each end of a switch goes together with it (assembled.shared.ts goesTogether: nothing overlaps,
// the joints mate, every part prints). Found: a straight on the branch end of LEGO's left switch (R40, its branch
// ending on a curve) shared 2.61 mm3 with the switch's base at the inner rail's end. The base's rails were swept to
// 4 mm short of the end along the curve, so their ends were square to the curve, not to the track's end: the inner
// rail stopped 3.75 mm from it, 0.25 mm into the straight's rail-end tongue (switch/base.ts railOf).
import { describe, it } from 'vitest';
import { goesTogether } from './assembled.shared';
import { type Design, TEMPLATES, toRoutes } from '../src/app/design';
import { poseToWorld, routeLength, routePose } from '../src/route/route';

/** A switch template with a 16-stud straight on every end: before its toe, on its straight end and on its branch end(s). */
function withStraights(name: string): Design {
  const d = structuredClone(TEMPLATES[name]), rts = toRoutes(d), st = rts[0].start, b0 = poseToWorld(st, [0, -128]);
  const on = (k: number) => { const e = routePose(rts[k], routeLength(rts[k])); return { name: `On ${k}`, x: e[0] / 8, y: e[1] / 8, heading: e[2], segs: [{ kind: 'straight' as const, studs: 16 }] }; };
  d.routes.push({ name: 'Before', x: b0[0] / 8, y: b0[1] / 8, heading: st[2], segs: [{ kind: 'straight', studs: 16 }] }, ...rts.map((_, k) => on(k)));
  return d;
}

describe('track joined onto a switch\'s ends goes together with it', { timeout: 900000 }, () => {
  for (const name of ['Left switch (LEGO)', 'Switch R40 right']) it(name, () => goesTogether(`${name}, a straight on each end`, withStraights(name)));
});
