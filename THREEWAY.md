# True three-way switch, and one- or two-piece points

Aaron (2026-10-19):
- A point with three positions, for a true three-way switch.
- One throw arm on the three-way, not two.
- An option of one or two points parts per switch.
- He really likes the plate-style switches. Look at reference too.
- The arm needs notches (detents) for its positions.

## How others do it

### plate-style three-way (2-04-043 points section, 2-04-044 frog section)

Measured from the STLs in ~/Documents/3D-models/plate-style/Train/Standard
Guage (renders and slices in ~/Documents/openscad-checks/4db3). All three
routes leave at the same toe, and there is one ground throw.

- **Blades:** two, one per side. Each is its own part (2-05-029 / 030): a
  15.9 x 53.8 plate with the pivot hole at the heel end, carrying a tapered
  rail 6.4 tall. A spring is cut through the plate as a flexure, and the
  slider's post sits in it. Each blade pivots on its own pin (dia 4.2,
  14.6 off the centre line, about 65 back from the toe).
- **Stop:** a block on the centre line between the blades, 5.5 x 5.2,
  61 to 66.5 from the toe. An open blade swings in against it.
- **Slider:** one slider (6 x 6 bar, 2-05-020 / 024, 97 long). It runs in
  one channel across the whole platform, 21 to 30 from the toe, and sticks
  out on both sides. It has a window per blade, 2.7 x 11.6, 10.5 off the
  centre line, about 24 from the toe.
- **Positions (one throw, three detents):**
  - Straight: both blades closed against their stock rails, with a little
    preload.
  - Left: the slider moves one way. It pulls the left blade open, to the
    stop, and presses the right blade harder shut; the spring takes up
    the extra travel.
  - Right: the mirror image.
- **Behind the heels:** the straight rails and the diverging closure
  rails start at the pivots. The two closure rails cross in an X frog;
  2-04-044 has the other frogs.
- **Lever and bracket:** the lever (2-05-004) has a ball knob, a pivot
  boss with a detent dome, and a tail that drives the slider. The bracket
  (2-05-003) is 3 x 3 studs, with the pivot ears and a sloped detent catch.

### reference Triple Switch R40

From the shop page: a switch section with two spring mechanisms, a detach
section with smooth rail guides, two R40 half curves and connectors. The
R40 geometry gives 8 studs between tracks. reference use their own throw
levers. No model files on disk, so there are no measurements.

Sources:
- https://plate-style.com/products/train/three-way-switch
- https://referenceeu.shoparena.pl/en_US/p/Triple-Switch-R40/60
- https://www.eurobricks.com/forum/forums/topic/194265-interesting-triple-switch-geometry

Both of them use one spring mechanism per blade. That is the "two points
per switch" layout.

## Plan

1. **Points as one or two parts (all switches).** Today the points are one
   part: both blades joined by a heel bar, on one pivot. The new option
   gives each blade its own disc, pivot pin and spring tines, as plate-style
   does. The slider then carries a post per blade. One throw either way.
2. **True three-way (one throw, three positions).**
   - Routes: straight, left and right, all from one toe.
   - Two blades, one per side, each with its own pivot and spring tines,
     and a stop block on the centre line between them.
   - One slider across the whole platform, with a post per blade.
   - One lever. The ear gets three detent dimples: left, straight and
     right.
   - Straight is both blades closed. Left or right is one blade pulled
     open to the stop while the other's spring takes up the extra travel.
   - Behind the heels, the straight rails and the closure rails start at
     the pivots. The closure rails cross in an X frog, and the solver's
     frogs and check rails do the rest.
   - Clash checks in all three positions.
3. The editor builds three routes leaving one toe as this switch, with
   one throw. The tandem layout stays for routes that split at different
   places.

## Status (2026-10-19)

- Step 1, one- or two-piece points: done, 6452750. Every switch config is
  clean in the clash checks either way.
- Step 2, the true three-way: done.
  - In src/switch/base.ts, a SetSpec with a fifth element (the straight
    route) is a true three-way. threeWaySet() works out its heel and the
    slider's travel.
  - The blades are the straight route's rails. Each closes on the outer
    route's stock rail on its side, and each has its own pivot and tines.
    One slider carries a post per blade.
  - Positions: in the middle (straight) both blades are closed with the
    preload. Half the travel either way swings one blade open, and the
    other blade's tines bend the extra.
  - The lever's ear has three dimples: left, straight and right. The lever
    driver is longer, so its swing stays under 17 degrees and the fork
    holds the tip.
  - Every rail except the stock rails starts at the heels; the solver finds
    the three frogs.
  - Clash checks (R24, R40, R104) in all three positions: only the
    preloaded tines touch, and the catches hold.
  - In the editor, two branches leaving the same point, one each side,
    become this switch. Template: "Three-way switch (one throw)".
- Not printed yet. To check on a print: the closed blade's tines bend about
  4.6mm when the other blade is open (0.9mm tines, about 33mm long, about
  0.5% strain).
