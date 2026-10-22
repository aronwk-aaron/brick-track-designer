// Sweeping a cross-section along a route (switch.scad's route_sweep): straight
// segments extruded, arcs revolved, each placed at its start pose.
import type { Route, Segment } from '../route/route';
import { hasRoll, railPoint, rollPart, routeLat, routeLength, routePose, routeRoll, routeSOf, segLength, segStarts } from '../route/route';
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
  const out: Segment = sg.kind === 'straight' ? { kind: 'straight', length: l1 - l0 } : { kind: 'arc', radius: sg.radius, angle: (Math.sign(sg.angle) * (l1 - l0) * 180) / (Math.PI * sg.radius) };
  const roll = rollPart(sg.roll, l0, l1);
  if (roll) out.roll = roll;
  return out;
}

/**
 * Banked track (curves.scad's superelevation): the cross-section turned at
 * each place along the route by the route's roll there, about the lower
 * (inner) rail's foot: x = -pivotX (the left rail) when the right side is up,
 * +pivotX when the left is, at height pivotZ.
 */
export interface Bank { pivotX: number; pivotZ: number }

/** Where a cross-section point (x across, z up) goes, turned by roll degrees about the bank's pivot. */
export function bankPoint(b: Bank, roll: number, x: number, z: number): [number, number] {
  if (Math.abs(roll) < 1e-12) return [x, z];
  const px = roll > 0 ? -b.pivotX : b.pivotX, a = (roll * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const dx = x - px, dz = z - b.pivotZ;
  return [px + dx * c - dz * sn, b.pivotZ + dx * sn + dz * c];
}

/**
 * The cross-section swept along a route from a to b, turned by its roll:
 * an extrusion cut across at the arc's fragments, the roll's knots and every
 * 2 mm where the roll changes, each cut's vertices placed at their place on
 * the route, turned.
 */
function sweepRolled(cs: CS, rt: Route, a: number, b: number, bank: Bank): Man {
  const st = segStarts(rt), at = new Set<number>([a, b]);
  rt.segments.forEach((sg, i) => {
    const l0 = st[i], L = segLength(sg), lo = Math.max(a, l0), hi = Math.min(b, l0 + L);
    if (hi <= lo) return;
    const n = sg.kind === 'arc' ? arcSegments(sg.radius, ((hi - lo) * 180) / (Math.PI * sg.radius)) : 1;
    for (let k = 1; k < n; k++) at.add(lo + ((hi - lo) * k) / n);
    at.add(lo); at.add(hi);
    const kn = sg.roll ?? [];
    for (let k = 0; k < kn.length; k++) {
      const s = l0 + kn[k][0];
      if (s > a && s < b) at.add(s);
      // (where it changes: every 2 mm)
      if (k + 1 < kn.length && Math.abs(kn[k + 1][1] - kn[k][1]) > 1e-9) {
        const s1 = l0 + kn[k + 1][0], m = Math.ceil((s1 - s) / 2);
        for (let j = 1; j < m; j++) { const q = s + ((s1 - s) * j) / m; if (q > a && q < b) at.add(q); }
      }
    }
  });
  const sl = [...at].sort((p, q) => p - q).filter((v, k, arr) => k === 0 || v - arr[k - 1] > 1e-4);
  const N = sl.length - 1;
  return cs.extrude(1, N - 1).warp((v) => {
    // (z = 0 at b and 1 at a, as a straight's extrusion stood up: keeps the faces facing out)
    const sAt = sl[N - Math.round(v[2] * N)], p = routePose(rt, sAt);
    const [x, z] = bankPoint(bank, routeRoll(rt, sAt), v[0], v[1]), h = (p[2] * Math.PI) / 180;
    v[0] = p[0] + x * Math.cos(h); v[1] = p[1] + x * Math.sin(h); v[2] = z;
  });
}

/** A shape laid along a route (not swept: the guard rails' pointed ends) turned by the route's roll, each vertex by the roll beside it. */
export function bankAlong(m: Man, rt: Route, b: Bank): Man {
  if (!hasRoll(rt)) return m;
  return m.warp((v) => {
    const q: [number, number] = [v[0], v[1]], sAt = routeSOf(rt, q), roll = routeRoll(rt, sAt);
    if (Math.abs(roll) < 1e-12) return;
    const lat = routeLat(rt, q), along = Math.abs(lat) < 1e5 ? lat : 0, [x, z] = bankPoint(b, roll, along, v[2]), p = railPoint(rt, sAt, x), c = railPoint(rt, sAt, along);
    // (moved by as much as its place across the track moves, keeping how far off the centre line's normal it was)
    v[0] += p[0] - c[0]; v[1] += p[1] - c[1]; v[2] = z;
  });
}

/** Sweep a cross-section along a route from arc length s0 to s1 (bank: turned by the route's roll, where it's banked). */
export function sweepRoute(s: Scad, cs: CS, rt: Route, s0 = 0, s1 = Infinity, bank?: Bank): Man {
  const st = segStarts(rt), pieces: Man[] = [];
  rt.segments.forEach((sg, i) => {
    const a = Math.max(s0, st[i]), b = Math.min(s1, st[i] + segLength(sg));
    if (b <= a + 1e-6) return;
    const p = routePose(rt, a);
    // (a piece that the next one carries on from runs 0.02mm into it, so the
    // two fuse into one solid instead of only touching face to face)
    const e = b < Math.min(s1, routeLength(rt)) - 1e-6 ? 0.02 : 0;
    if (bank && sg.roll && rollPart(sg.roll, a - st[i], b - st[i] + e)) { pieces.push(sweepRolled(cs, rt, a, b + e, bank)); return; }
    pieces.push(T(R(sweepSeg(s, cs, part(sg, a - st[i], b - st[i] + e)), [0, 0, p[2]]), [p[0], p[1], 0]));
  });
  return s.union(pieces);
}
