// A track beside another, in one step: the same shape offset to its left or right by a spacing (studs, centre to centre).
// Straights stay as long, curves keep their angle and have the radius that's concentric with the original (the inside one
// smaller by the spacing, the outside one larger), so its ends are exactly the spacing away, square to the original's.
import { type Design, type DRoute, freeName } from './design';
import { LIMITS, radiusRange, rangeText } from './limits';

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * Route r copied to its left or right, spacing studs over (named afresh, listed by the caller). Or why not: a spacing outside its range, or
 * a curve whose radius would go under the least (or over the most) a curve can be.
 */
export function parallelRoute(d: Design, r: DRoute, side: 'left' | 'right', spacing: number): { route: DRoute } | { problem: string } {
  const [lo, hi] = LIMITS.spacing;
  if (!Number.isFinite(spacing) || spacing < lo || spacing > hi) return { problem: `the spacing is ${rangeText(LIMITS.spacing).replace(/, default.*/, '').toLowerCase()} studs` };
  const out: DRoute = structuredClone(r), s = side === 'left' ? 1 : -1;
  const h = (r.heading * Math.PI) / 180;
  // (the left of a heading h: (-cos h, -sin h))
  out.x = r6(r.x - Math.cos(h) * spacing * s); out.y = r6(r.y - Math.sin(h) * spacing * s);
  for (let k = 0; k < out.segs.length; k++) {
    const sg = out.segs[k];
    if (sg.kind !== 'curve') continue;
    // (a left turn has its centre on the left: a track to the left is on the inside)
    const radius = r6(sg.radius - Math.sign(sg.angle) * s * spacing);
    if (radius < radiusRange(r)[0]) return { problem: `its R${+sg.radius.toFixed(2)} curve would become R${+radius.toFixed(2)} on the inside, under the least, R${radiusRange(r)[0]}: try the other side, or a smaller spacing` };
    if (radius > radiusRange(r)[1]) return { problem: `its R${+sg.radius.toFixed(2)} curve would become R${+radius.toFixed(2)} on the outside, over the most, R${radiusRange(r)[1]}: try the other side, or a smaller spacing` };
    out.segs[k] = { ...sg, radius };
  }
  out.name = freeName(d, 'T');
  delete out.throwSide; delete out.locked;
  return { route: out };
}
