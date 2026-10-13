// Rails swept along straights and arcs, as in the OpenSCAD track library
// (track_lib.scad rail_profile_raw, switch.scad seg_sweep).
//
// Units: mm. Frame: a piece starts at y = 0 on x = 0 heading +y; z = 0 is
// the bottom of the sleepers. A 2D cross-section has x = offset to the right
// of the centre line and y = z.
import type { Wasm } from './kernel';

export const PLATE_H = 3.2;

type Pt = [number, number];

// The rail's cross-section, centred on x = 0, its base at y = 0
// (rail_profile_raw: the polygon shifted up 1.5).
const RAIL_PROFILE: Pt[] = [
  [1.05, 4.9], [1.05, 4.7], [1.25, 4.7], [1.25, 0.5],
  [1.6, -0.7], [3, -1.1], [3, -1.7], [3.9, -1.7],
  [3.9, -4.7], [2.6, -4.7], [2.6, -4.3], [2.5, -4.3],
  [2.5, -2.3], [-2.5, -2.3], [-2.5, -4.3], [-2.6, -4.3],
  [-2.6, -4.7], [-3.9, -4.7], [-3.9, -1.7], [-3, -1.7],
  [-3, -1.1], [-1.6, -0.7], [-1.25, 0.5], [-1.25, 4.7],
  [-1.05, 4.7], [-1.05, 4.9], [-0.1, 4.9], [-0.1, 4.7],
  [0.1, 4.7], [0.1, 4.9],
].map(([x, y]) => [x, y + 1.5] as Pt);

// A rail's cross-section at offset o right of the centre line, standing on
// the sleepers (rail_2d).
export function railSection(w: Wasm, o: number) {
  return new w.CrossSection([RAIL_PROFILE.map(([x, y]) => [x + o, y + PLATE_H] as Pt)], 'NonZero');
}

// A cross-section swept along a straight from y = 0 to y = length.
export function sweepStraight(w: Wasm, cs: InstanceType<Wasm['CrossSection']>, length: number) {
  return cs.extrude(length).rotate([90, 0, 0]).translate([0, length, 0]);
}

// A cross-section swept along an arc of radius r from the origin heading +y,
// turning angle degrees (positive = left), in segments straight pieces.
export function sweepArc(
  w: Wasm, cs: InstanceType<Wasm['CrossSection']>, r: number, angle: number, segments: number,
) {
  // (revolve's circularSegments counts the segments over revolveDegrees)
  if (angle > 0)
    return cs.translate([r, 0]).revolve(segments, angle).translate([-r, 0, 0]);
  // Right turn: mirror the section, revolve, mirror back.
  return cs.mirror([1, 0]).translate([r, 0]).revolve(segments, -angle).translate([-r, 0, 0]).mirror([1, 0, 0]);
}
