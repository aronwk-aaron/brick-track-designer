# True three-way switch, and one- or two-piece points

Aaron (2026-10-19):
- A point with three positions, for a true three-way switch.
- One throw arm on the three-way, not two.
- An option of one or two points parts per switch.
- He really likes 4DBrix's switches. Look at TrixBrix too.
- The arm needs notches (detents) for its positions.

## How others do it

### 4DBrix three-way (2-04-043 points section, 2-04-044 frog section)

Measured from the STLs in ~/Documents/3D-models/4DBrix/Train/Standard
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

### TrixBrix Triple Switch R40

From the shop page: a switch section with two spring mechanisms, a detach
section with smooth rail guides, two R40 half curves and connectors. The
R40 geometry gives 8 studs between tracks. TrixBrix use their own throw
levers. No model files on disk, so there are no measurements.

Sources:
- https://4dbrix.com/products/train/three-way-switch
- https://trixbrixeu.shoparena.pl/en_US/p/Triple-Switch-R40/60
- https://www.eurobricks.com/forum/forums/topic/194265-interesting-triple-switch-geometry

Both of them use one spring mechanism per blade. That is the "two points
per switch" layout.

## Plan

1. **Points as one or two parts (all switches).** Today the points are one
   part: both blades joined by a heel bar, on one pivot. The new option
   gives each blade its own disc, pivot pin and spring tines, as 4DBrix
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
