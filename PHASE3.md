# Phase 3 plan: switches with moving points

Goal: the editor builds switches as well as fixed crossings. Wherever two
routes leave together (the solver's splits), it builds points that move:
one-piece points with the spring built in, the throw slider and the lever,
as switch.scad does. The first step ports switch.scad's track-only switch
exactly, so it can be checked mesh for mesh. Then it generalises to splits
anywhere in a design.

## Scope, in order

1. **Switch context:** switch.scad's points maths for one points set:
   - toe, heel and blade pivot;
   - throw angle, spring tines;
   - slider post, throw side, lever position and fork;
   - the $-variables of `with_set`, as one TypeScript object.

   Checked against switch.scad's echoed values, to 0.01mm, for the
   regression set's left, right, wye and three-way configs at R24 to R120.
2. **Track-only switch base:**
   - stock rails;
   - crossing rails and the frog (the flangeway cuts we already have);
   - check rails;
   - the points bed with its pockets and slots;
   - the stems;
   - track-only ties (long ties and the routes' own);
   - connectors;
   - stud sockets.
3. **Moving parts:**
   - the points part: blades, heel bar, pivot disc, spring tines, tine
     floor;
   - the throw slider and its arm;
   - the lever and its stand.
4. **Into the editor:**
   - any split in a design becomes a points set with its throw and lever;
   - the parts are shown assembled, with each moving part downloadable as
     its own STL;
   - templates for left, right, wye and three-way switches.

## Parity

Against the OpenSCAD switch regression set with generate_ballast=false:
- left, right, wye and three-way;
- R24, R40, R104;
- parts base, points, throw and lever;
- S-curve and arc.

That is about 40 renders, one at a time through safe-run. Each part is
compared on volume, the symmetric difference (by OpenSCAD) and the bounding
box, as in Phase 2. The moving parts' clash checks (points against base in
both positions, throw against points, lever against base) are ported from
the OpenSCAD intersection suite. They must show the same contacts as the
OpenSCAD parts (the two small designed ones), and no new ones.

## Expected weekly cost

About 15% in total:
- step 1: about 3%;
- step 2: about 5%;
- step 3: about 4%;
- step 4: about 3%.

Paced at about 3% a day, in small steps, each committed when its checks
pass.

## After this

- Ballast, labels and anti-stud bottoms.
- Banking.
- Splitting for the print bed, and 3MF.
- Track fields like the Monster Crossover.
- Monorail.
- Layout designer import and export.
