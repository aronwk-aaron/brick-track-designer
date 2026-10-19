# Phase 2 plan: track-only geometry, route solver, crossings

Aaron's goal: design any kind of rail intersection. So Phase 2 changes the
order in PLAN.md. It ports just enough of the plain track to build
trackwork. Then it goes straight to the route solver and to fixed
crossings (no moving parts). Ballast, labels and switches with moving
points come later.

## Scope, in order

1. **Track-only geometry**, ported from track_lib.scad:
   - rail profile (done in the spike);
   - rail-end tongues and the end connector base (peg, clip, the left end's
     bridge);
   - sleepers with posts, including 1-stud bridge ties;
   - square stud sockets;
   - breakaway supports and their footing;
   - straights and curves, track only, any gauge.
2. **Route model and trackwork solver**:
   - routes as straight, arc and S-curve segments (switch.scad's maths);
   - every rail of every route checked against every other;
   - where rails cross: frogs, or diamonds when two tracks cross;
   - where routes split tangentially: points (marked for now, built in
     phase 3);
   - flangeway cuts, check rails opposite frogs, rail pieces split at frogs;
   - a 2D plan view (SVG) of the result, to check by eye and in tests.
3. **Fixed crossings**:
   - pieces built from any set of routes that cross: 90° and angled
     crossings, crossings on curves, several tracks;
   - rails cut for flangeways, check rails, sleepers under the whole area;
   - a track-only base on the stud grid;
   - end connectors on every route end.
4. **Editor UI**:
   - add routes and segments, with snapping to the stud grid and to
     standard ends (R40, the LEGO switch's end, 16-stud parallel spacing);
   - plan and 3D views;
   - STL export (3MF in phase 4);
   - save and load as JSON.

## Parity tests against the OpenSCAD regression configs

Meshes are compared on volume, symmetric difference and bounding box, as in
the spike.

- **Track only:**
  - straight-trackonly, curves-trackonly;
  - extra track-only renders: straights S8/S16/S32, curves R24/R40/R104;
  - Ln2, dual gauge;
  - straights with 1-stud ties;
  - guard rails, if they fit in this phase.
- **Solver:** frog positions, check rail spans and points lengths for
  left, right, wye and three-way at R24 to R120. These are taken from
  switch.scad's echo output and its regression set (113 configs).
- **New crossings** have no OpenSCAD reference. They're checked with:
  - property tests: no rail overlaps, every frog has a check rail,
    flangeways at least 3mm;
  - a clash check of two joined pieces;
  - the print checks (floating islands, slicer).

## Expected weekly cost

About 18% of a week in total:
- step 1: about 4%;
- step 2: about 6%;
- step 3: about 5%;
- step 4: about 3%.

Paced at about 3% a day, in small steps, each committed when its checks
pass. OpenSCAD renders for parity go through safe-run, one at a time.

## Later phases

- Switches with moving points: points, spring, throw, lever, from
  switch.scad.
- Ballast, labels, anti-stud bottoms.
- Banking.
- Splitting for the print bed, and 3MF.
- Track fields like the Monster Crossover.
- Monorail.
- Layout designer import and export.
