# Switch mechanism options: comparison

Pictures of the Left switch (LEGO) template and one network piece (the
assembly tests' "crossover": a branch built into a network piece), each built
with the new options. All are plate-style points (`mechStyle: 'plates'`, the
default); the new options do nothing with the older 'tines' mechanism (the
build says so).

| Option (Piece options) | Values | Default |
|---|---|---|
| `throwStyle` (Throw: *Lever or stand*) | `built-in`, `bracket`, **`stand`** (new) | `built-in` |
| `throwAction` (Throw: *Points held by*) | `detent`, `overcentre` | `detent` |
| `bladeStyle` (Points: *Blades*) | **`sprung`**, `simple` (rigid), `prototype` (rigid) | `sprung` |

The defaults build what was built before, apart from two fixes to faults the
new checks found (see the end), and the blades: the sprung blades' are the default now
(2026-10-27), and the spring-back points are gone (section 2).

Colours: grey track, blue blades, orange slider (the tie bar / throw rod),
gold lever or stand handle, red Peco spring.

## 1. Over-centre spring (`throwAction: 'overcentre'`)

**Reference.** Peco's turnouts have a V-shaped wire spring between the base and
the tie bar. It's squeezed hardest with the tie bar in the middle, so wherever
the tie bar is, the spring pushes it out to the side it's already past: the
blades snap to one side or the other and are held against the stock rail. A
train trailing through the wrong way pushes the blades over, past the
middle, and they stay there. LEGO's points behave the same way.

**Here.** The slider is the tie bar. A third post on it, between the blades,
takes the middle ring of a printed spring. The spring has two halves, each a
meander running 12 mm along the track to a pin on the bed (pins with a snap lip,
like the blades' pins). The pins stand over the middle of the post's travel,
so the spring is squeezed hardest at mid-throw. The spring lies in a pocket in
the bed's top, between the blades. The lever loses its detent bump and
dimples: the spring holds the points, and the lever follows the slider over.

**Prints.** The spring prints flat (2.4 mm thick), straight and unsqueezed. It
bends in its own plane, along its layers. The post is on the slider, which
already prints on its side, so the post lies flat with a teardrop section.
**Goes in:** slider, then spring (end rings over the pins, middle ring over
the post), then blades.

**Where it differs from Peco, and why.**
- PLA meander instead of a steel wire V. To keep the spring below about
  20 MPa (PLA creeps under a constant load) and still give a 0.35 mm
  preload that print tolerance won't wipe out, it needs about 20 mm of beam
  per half, folded into 4 legs ±3 mm across.
- Two halves, one each way along the track, instead of Peco's one spring.
  The travel here is small (2.6 mm), so the spring's line only swings about
  6°. A single spring's push along the track would press the slider against
  its tunnel wall, and the friction (about μ·F) would be bigger than its
  sideways push (about F·sin 6°). With two halves the pushes along the track
  cancel.
- Numbers for the Left switch: about 1.3 N in each half at the ends and
  1.6 N at mid-throw, 18 MPa peak. It pushes the slider outward with only
  about **0.28 N** at each end. That's light. It holds the blades and snaps
  them over, but much less firmly than a metal spring would.

**Pros:** trailable the Peco/LEGO way, so a wrong-way train doesn't derail;
it snaps cleanly; nothing to hold the lever.
**Cons:** light holding force, and the force depends on how accurately the
pins and spring print; one more part; not on three-ways (they have three
positions); left out with the stand (the stand locks); with prototype blades
the tie bar stays further from the points, to leave room for the pin on the
toe side.

Images: `left-2-overcentre-close.png`, `-exploded.png`, `-plan.png`,
`left-2-overcentre-spring.png` (plan close-up of the spring, pins, post and
pocket), `left-2-overcentre-print.png` (the spring as printed, free and
straight), `left-2-overcentre-section-throw.png` (cross-section along the
slider).

## 2. Blades: the sprung blades' (default) or rigid

The spring-back points (`throwAction: 'springback'`) are gone (2026-10-27):
each blade's long, slim tongue was the spring, and its walls were too thin
to print; they snapped off. The ordinary tongue round the post is gone too,
for the same reason. Old
designs with spring-back points open with the sprung blades.

**the sprung blades' (`bladeStyle: 'sprung'`, the default).** Each blade is a 3 mm plate
on a LEGO stud at its heel, with its rail on top. Underneath, a pocket holds
two leaf-spring beams, rooted in the plate, with the slider's post between
them. The beams take the preload and give way to a trailing train's wheels.
The pocket's roof prints over supports built into it (0.2 mm under it), which
break out after printing. By the stock rail the plate's edge slopes at 45
degrees clear of the rail's foot, so nothing overhangs as printed.

**Rigid (`bladeStyle: 'simple'`, and `'prototype'`).** The slider's post sits
in a plain hole in the plate: no spring, no preload. The plate is narrower, so
rigid blades fit where the sprung blades' don't. A double slip's or a tandem's points
fall back to them, with a warning, and the tandem three-way template uses them.

**Pros (sprung):** a trailing train pushes the blades over without damage;
they hold against the stock rail. **Cons:** a wider plate; the supports to
break out. **Pros (rigid):** simplest; fits tight places. **Cons:** no give: a
train trailing through the wrong way is stopped.

Images: `left-1-current-*` (the sprung blades', the default; `-blades.png` is a plan
close-up), `left-3-rigid-stand-close.png`, `-exploded.png`, `-plan.png`,
`-stand.png`, `left-3-rigid-blades.png` (plan close-up), and
`crossover-3-rigid-stand-*`.

## 3. Prototype blades (`bladeStyle: 'prototype'`)

**What was already there.** Each blade is its route's rail, cut back along
the stock rail it closes on. The frog is a flangeway-grooved crossing with a
V point. The wing rails are the rail heads beside those grooves. The check
rails have flared ends. The blades turn at the heel on pins (a loose heel)
and are joined through the slider.

**Added.**
- **Stock rail undercut:** along the points, the stock rail's gauge face is
  cut back 0.8 mm under a 1 mm lip of head, chamfered at 45° so it prints.
- **Blade tucked under it:** the blade's rail and its plate are laid 0.15 mm
  off the stock rail (was 0.3) and reach in under the lip. A flange can't
  catch the point, and the head holds the blade down, as Peco's tabs under
  the stock rails do.
- **Planed point:** the point is cut off where its top is still 0.6 mm wide,
  so it prints, instead of thinning to nothing. A real point is blunted too.
- **Tie bar at the points:** the slider (head rod) moves to the first stud
  line where the throw arm clears the end connector. For the Left switch
  that's y = 20 mm instead of 28 mm. Its travel grows from 2.6 to 3.0 mm.
- **Wing rails flared at the frog's throat:** each flangeway groove is
  widened at its mouths, like the check rails' flares. This is in switch
  pieces only; network pieces' frogs come from `geom/crossing.ts` and are
  unchanged.

**Goes in:** the blades go on swung open (with the slider at the other end),
then swing shut under the lip. The assembly check does exactly that, using
each blade's pin and angle, which the parts now carry.

**Where it differs.** The stock rail isn't straight through the points (the
routes are drawn as they are, so a curved stock rail and a straight switch
rail meet), and the planing follows the stock rail's curve instead of being a
straight taper. Heels pivot (a loose heel) rather than flex: a printed
flexible heel would act as another spring fighting the throw and the
over-centre spring.

**Pros:** looks and runs like a real switch; the point is protected and held
down. **Cons:** the stock rail's head is thinner low down along the points;
the blades must go on open.

Images: `left-5-prototype-blades-close.png`, `-exploded.png`, `-plan.png`,
`-points.png` (the closed blade against the stock rail),
`-section-y24.png` and `-section-y44.png` (cross-sections: blade tucked
under the undercut, plate under all of the rail), `-frog.png` (wing rail
flares). Compare `left-1-current-points.png`, `-section-y24.png`,
`-section-y44.png`, `-frog.png`.

## 4. Switch stand (`throwStyle: 'stand'`)

**Reference.** Caboose Industries' ground throws (and the prototype's low
switch stands): you swing the handle over 180°, and an "external cam" (an
eccentric) moves the throw bar. Caboose say they "positive lock in both
directions, effective from 10° above horizontal to the full down position".

**Here.** A handle on a hub turns about the throw rod's line (along the
track) in ears beside the track. The hub's eccentric (offset 1.3 mm for the
Left switch) sits in a yoke on the slider's end, open at the top. The handle
swings over the top and lies on the arm at each end, pointing toward the
track for one route and away from it for the other. At each rest the
eccentric is 8° past dead centre, so the points pushing on the slider press
the handle down onto the arm instead of turning it: locked. The axle snaps
into the ears on domes, as the lever does. The hub's disc sits in a pocket
in the arm. The hub is as low as lets the handle's grip lie on the arm.

**Prints.** On the handle's face: the handle and the hub's disc first, the
eccentric on the disc (within its outline, so nothing overhangs), the dome on
top. See `left-4-stand-print.png`, beside the slider printed on its side
with its yoke. **Goes in:** slider, blades, then the stand, dropped in from
above, eccentric into the yoke, domes snapping into the ears.

**Where it differs.** No target (flag) and no gears to turn one. The lock is
the over-dead-centre eccentric alone, not a separate latch. The handle is
short (12 mm) to stay clear of the stock rail when it lies toward the track.

**Pros:** positive lock; low profile (about 15 mm tall vs the lever's 35 mm);
works with either blade. **Cons:** a train trailing through a locked
(non-spring) switch is stopped and derails, as with a real hand-thrown
switch; a three-way's middle position is with the handle upright, unlocked
(noted); plate-style points only.

Images: `left-4-stand-close.png`, `-exploded.png`, `-plan.png`, `-stand.png`
(close-up of handle, eccentric, yoke and ears), `-print.png`,
`-section-throw.png` (cross-section along the slider: eccentric in the yoke).

## Combined, and the network piece

- `left-6-all-prototype-*.png`: prototype blades and the switch stand
  together (`-whole.png` is the whole switch from above; compare
  `left-1-current-whole.png`).
- `crossover-1-current-*`, `crossover-2-overcentre-prototype-*`,
  `crossover-3-rigid-stand-*` (`-close`, `-exploded`,
  `-plan`): the same options in a network piece.
- `left-1-current-*`: today's default, for comparison (`-section-throw.png`
  is along the slider with the lever).
- `app-options-panel.png`: the app with the new Piece options (over-centre +
  prototype chosen), built in the browser.

## Fixed along the way (these change the default too)

1. **The lever was loose in its ears.** The lever's opening had been widened
   for its tip (and the plate-style slider) to go down through it, and that cut back
   the ears. The 3 mm lever's snap domes and detent bump no longer reached
   them, so it could slide 0.8 mm along its pivot and the detent never
   clicked. That's probably part of why the detent felt weak. The lever is
   now as thick as its opening, with the ears either side. A new check makes
   sure every lever and stand is held.
2. **plate-style blades printed hanging.** The rail stood on only 0.2 mm of its
   plate, so as printed it overhung 2.3 mm along its length and past the
   plate's end at the heel. The plate now runs under all of the rail. With
   ballast, where the stock rail's foot flares above the bed, the rail's
   lower outer corner is bevelled 45° instead. A new check makes sure the
   blades, spring and slider print without supports.

## Remaking the pictures

```sh
npx vite --port 5181 --strictPort &       # the viewer page is served by vite
npx tsx scripts/compare-dump.mts left-oc "Left switch (LEGO)" '{"throwAction":"overcentre"}' [name source options ...]
npx tsx scripts/compare-shots.mts shots.json   # [{ file, data, cam: { pos, at, ortho?, up? }, explode?, print?, only?, clip? }]
npx tsx scripts/compare-section.mts out.png "Left switch (LEGO)" '{}' <y> <x0> <x1> <z0> <z1> [title]
```
