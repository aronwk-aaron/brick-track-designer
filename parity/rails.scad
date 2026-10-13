// Reference for the parity check: the two Ln4 rails swept along a straight
// or an arc with the OpenSCAD track library, as switch.scad's seg_sweep does.
// Usage: openscad-nightly -D 'repo="..."' -D 'kind="arc"' ...
include <track_lib.scad>  // found through OPENSCADPATH

kind = "straight"; // [straight, arc_left, arc_right]
len_mm = 128;
radius = 320;
angle = 22.5;
segments = 64;
offsets = [-20, 20];

module rail2d(o) translate([o, plate_h]) rail_profile_raw();
if (kind == "straight")
  for (o = offsets) rotate([0, 0, 180]) rotate([90, 0, 0]) linear_extrude(len_mm) mirror([1, 0]) rail2d(o);
if (kind == "arc_left")
  for (o = offsets) translate([-radius, 0, 0])
    rotate_extrude(angle = angle, $fn = round(segments * 360 / angle)) translate([radius, 0]) rail2d(o);
if (kind == "arc_right")
  for (o = offsets) translate([radius, 0, 0]) rotate([0, 0, 180])
    rotate_extrude(angle = -angle, $fn = round(segments * 360 / angle)) translate([radius, 0]) mirror([1, 0]) rail2d(o);
