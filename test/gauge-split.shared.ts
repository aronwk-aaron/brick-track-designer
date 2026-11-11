// Where dual-gauge track parts into its two gauges: a dual-gauge straight, then from its end a standard-gauge route
// and a narrow-gauge one that start together (the narrow one where the dual-gauge track's narrow gauge lies: a stud
// to the shared rail's side, or centred) and fan apart. The family the tests build, and a wheel's way along a rail.
import type { Design, DRoute, DSeg } from '../src/app/design';
import type { Man, Scad } from '../src/geom/scad';
import { sweepRoute } from '../src/geom/sweep';
import type { CrossSection } from 'manifold-3d';
import type { Wasm } from '../src/geom/kernel';
import { railPoint, type Route, routeLength } from '../src/route/route';

export type Layout = 'right' | 'left' | 'centre';
/** a: the standard gauge straight on, the narrow one curving away; b: the narrow gauge straight on, the standard one curving away; c: both curving apart */
export type SplitCase = 'a' | 'b' | 'c';
export interface SplitSpec { layout: Layout; cs: SplitCase; /** the way the curving one turns (c: the standard one; the narrow one the other way) */ hand: 'left' | 'right'; r: number; rn: number; /** studs they run together before they part */ lead?: number; /** no dual-gauge track before them */ alone?: boolean }

const angleOf = (r: number) => (r <= 60 ? 33.75 : 22.5);
/** The narrow route's start, studs right of the standard one's: where the dual-gauge track's narrow gauge lies. */
export const narrowOff = (layout: Layout) => (layout === 'right' ? 1 : layout === 'left' ? -1 : 0);
export const splitName = (f: SplitSpec) => `${f.layout === 'centre' ? 'centred' : `${f.layout} rail shared`}, ${f.cs === 'a' ? `narrow R${f.rn} ${f.hand}` : f.cs === 'b' ? `standard R${f.r} ${f.hand}` : `standard R${f.r} ${f.hand}, narrow R${f.rn} the other way`}${f.lead ? `, ${f.lead} studs together first` : ''}${f.alone ? ', no dual-gauge track before' : ''}`;

export function splitDesign(f: SplitSpec): Design {
  const sg = f.hand === 'left' ? 1 : -1, pre: DSeg[] = f.lead ? [{ kind: 'straight', studs: f.lead }] : [];
  const curve = (radius: number, s: number): DSeg => ({ kind: 'curve', radius, angle: s * angleOf(radius) });
  // (the straight one: well past where the curving one has crossed its rails and left its bed)
  const past = (radius: number): DSeg => ({ kind: 'straight', studs: 4 * Math.ceil((radius * Math.sin((angleOf(radius) * Math.PI) / 180) + 6) / 4) });
  const std: DSeg[] = [...pre, f.cs === 'a' ? past(f.rn) : curve(f.r, sg)];
  const nar: DSeg[] = [...pre, f.cs === 'a' ? curve(f.rn, sg) : f.cs === 'b' ? past(f.r) : curve(f.rn, -sg)];
  const routes: DRoute[] = [
    ...(f.alone ? [] : [{ name: 'Dual', x: 0, y: 0, heading: 0, dualGauge: true, ...(f.layout !== 'right' && { dualShared: f.layout }), segs: [{ kind: 'straight', studs: 16 }] } as DRoute]),
    { name: 'Standard', x: 0, y: 16, heading: 0, segs: std },
    { name: 'Narrow', x: narrowOff(f.layout), y: 16, heading: 0, gaugeStuds: 2, segs: nar },
  ];
  return { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes };
}

/** The family: each layout, each case, both hands, the standard radii 40, 56 and 104 with the narrow gauge's 36, 48 and 84. */
export const SPLIT_FAMILY: SplitSpec[] = (['right', 'left', 'centre'] as Layout[]).flatMap((layout) => (['a', 'b', 'c'] as SplitCase[]).flatMap((cs) => (['left', 'right'] as const).flatMap((hand) =>
  ([[40, 36], [56, 48], [104, 84]] as [number, number][]).map(([r, rn]): SplitSpec => ({ layout, cs, hand, r, rn })))));

const RAIL_TOP = 3.2 + 6.4, HEAD_HW = 1.25, FL = { depth: 3, width: 1.5, off: 0.05 };
/** A wheel flange's way along route rt from a to e, inside the rail at x (sd: +1 the flange to the rail's right, -1 to its left). */
export const flangeBand = (s: Scad, rt: Route, x: number, sd: number, a = 1, e = routeLength(rt) - 1): Man =>
  sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), rt, a, e);
/**
 * The longest stretch (mm) of route rt, 3 mm in from each end, where a wheel on the rail at x has no rail head under its tread
 * (4 mm out from the rail's gauge face; sd: +1 the flange to the rail's right, so the tread to its left), and where it ends.
 * top: the track sliced just under the rail tops.
 */
export function treadGap(w: Wasm, top: CrossSection, rt: Route, x: number, sd: number, a0 = 3, e = routeLength(rt) - 3): [number, number] {
  const x0 = sd > 0 ? x + HEAD_HW - 4 : x - HEAD_HW, x1 = x0 + 4;
  let gap = 0, most = 0, at = 0;
  for (let a = a0; a + 2 <= e; a += 2) {
    const q = new w.CrossSection([[railPoint(rt, a, x0), railPoint(rt, a, x1), railPoint(rt, a + 2, x1), railPoint(rt, a + 2, x0)]], 'Positive'), on = q.intersect(top);
    gap = on.area() > 2 ? 0 : gap + 2;
    q.delete(); on.delete();
    if (gap > most) { most = gap; at = a + 2; }
  }
  return [most, at];
}
/** (mm) the height the track's sliced at for treadGap: a quarter millimetre under the rail tops */
export const TREAD_Z = RAIL_TOP - 0.25;
