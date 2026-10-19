// Sweeping a cross-section along a route (switch.scad's route_sweep): straight
// segments extruded, arcs revolved, each placed at its start pose.
import type { Route, Segment } from '../route/route';
import { routePose, segLength, segStarts } from '../route/route';
import { T, R, M, type CS, type Man, type Scad } from './scad';

/** OpenSCAD's arc fragments: $fn = min(9r, 1800) over the angle. */
export const arcSegments = (r: number, angle: number) => Math.ceil(Math.max((Math.min(9 * r, 1800) * Math.abs(angle)) / 360, 1));

/** A cross-section (x = offset to the right of the centre line, y = z) swept along one segment from the origin heading +y. */
function sweepSeg(s: Scad, cs: CS, sg: Segment): Man {
  if (sg.kind === 'straight') return T(R(cs.extrude(sg.length), [90, 0, 0]), [0, sg.length, 0]);
  const r = sg.radius, n = arcSegments(r, sg.angle);
  if (sg.angle > 0) return T(cs.translate([r, 0]).revolve(n, sg.angle), [-r, 0, 0]);
  return M(T(cs.mirror([1, 0]).translate([r, 0]).revolve(n, -sg.angle), [-r, 0, 0]), [1, 0, 0]);
}

/** The part of a segment from l0 to l1 along it. */
function part(sg: Segment, l0: number, l1: number): Segment {
  return sg.kind === 'straight' ? { kind: 'straight', length: l1 - l0 } : { kind: 'arc', radius: sg.radius, angle: (Math.sign(sg.angle) * (l1 - l0) * 180) / (Math.PI * sg.radius) };
}

/** Sweep a cross-section along a route from arc length s0 to s1. */
export function sweepRoute(s: Scad, cs: CS, rt: Route, s0 = 0, s1 = Infinity): Man {
  const st = segStarts(rt), pieces: Man[] = [];
  rt.segments.forEach((sg, i) => {
    const a = Math.max(s0, st[i]), b = Math.min(s1, st[i] + segLength(sg));
    if (b <= a + 1e-6) return;
    const p = routePose(rt, a);
    pieces.push(T(R(sweepSeg(s, cs, part(sg, a - st[i], b - st[i])), [0, 0, p[2]]), [p[0], p[1], 0]));
  });
  return s.union(pieces);
}
