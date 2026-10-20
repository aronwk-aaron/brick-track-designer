// Sweeping a cross-section along a route (switch.scad's route_sweep): straight
// segments extruded, arcs revolved, each placed at its start pose.
import type { Route, Segment } from '../route/route';
import { routeLength, routePose, segLength, segStarts } from '../route/route';
import { T, R, M, type CS, type Man, type Scad } from './scad';

/**
 * How finely arcs are cut into straight pieces. 'scad': OpenSCAD's ($fn =
 * min(9r, 1800) over the angle), for the parity checks; 'fine': no piece
 * strays more than 0.02mm from the true arc (under a printer's resolution),
 * up to ten times fewer pieces on big curves, so pieces build that much
 * faster. The editor uses 'fine'.
 */
let arcMode: 'scad' | 'fine' = 'fine';
export const setArcMode = (m: 'scad' | 'fine') => { arcMode = m; };
export const arcSegments = (r: number, angle: number) => (arcMode === 'scad'
  ? Math.ceil(Math.max((Math.min(9 * r, 1800) * Math.abs(angle)) / 360, 1))
  : Math.ceil(Math.max(Math.abs(angle) / ((2 * Math.acos(1 - Math.min(0.02 / r, 1)) * 180) / Math.PI), 1)));

/** A cross-section (x = offset to the right of the centre line, y = z) swept along one segment from the origin heading +y. */
function sweepSeg(s: Scad, cs: CS, sg: Segment): Man {
  if (sg.kind === 'straight') return T(R(cs.extrude(sg.length), [90, 0, 0]), [0, sg.length, 0]);
  const r = sg.radius, n = arcSegments(r, sg.angle);
  if (sg.angle > 0) return T(revolve(cs.translate([r, 0]), n, sg.angle), [-r, 0, 0]);
  return M(T(revolve(cs.mirror([1, 0]).translate([r, 0]), n, -sg.angle), [-r, 0, 0]), [1, 0, 0]);
}

/**
 * rotate_extrude(angle) in n fragments. manifold's revolve comes out empty
 * for small angles (it failed at 0.27 degrees in 2 fragments, and for
 * switch.scad's hulled 0.1mm slices), so those are built by bending an
 * extrusion with the same rings instead: the same sections at the same
 * angles, joined by straight edges.
 */
function revolve(cs: CS, n: number, angle: number): Man {
  if (Math.abs(angle) >= 10) return cs.revolve(n, angle);
  const a = (angle * Math.PI) / 180;
  return cs.extrude(1, n - 1).warp((v) => {
    const x = v[0], y = v[1], th = (1 - v[2]) * a; // (1 - z: keeps the faces facing out)
    v[0] = x * Math.cos(th); v[1] = x * Math.sin(th); v[2] = y;
  });
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
    // (a piece that the next one carries on from runs 0.02mm into it, so the
    // two fuse into one solid instead of only touching face to face)
    const e = b < Math.min(s1, routeLength(rt)) - 1e-6 ? 0.02 : 0;
    pieces.push(T(R(sweepSeg(s, cs, part(sg, a - st[i], b - st[i] + e)), [0, 0, p[2]]), [p[0], p[1], 0]));
  });
  return s.union(pieces);
}
