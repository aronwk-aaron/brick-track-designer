# Test prints: what to print, and what to report

Nothing in the switch has been printed since it was last changed, and the fit numbers come from one straight printed
in October. This kit is five templates (Templates › Test prints). Print them, try them with real track and wheels,
fill in the form at the bottom and send it back: each answer changes one setting's default.

## What to print

| Template | Parts | Plastic | Time (rough) | Answers |
|---|---|---|---|---|
| **1: stud and anti-stud fits** | 5 two-stud straights, each a different fit | 17 cm³, 21 g | 1¼ h | Which stud fit and which anti-stud fit are right on your printer |
| **2: track joints** | 2 four-stud straights (peg and clip); 1 six-stud straight on a solid bed, cut in two (dovetails) | 22 cm³, 27 g | 1½ h | Do joints go together and hold, to each other and to bought track |
| **3: switch as built** | LEGO-geometry left switch, nothing changed: 2 track parts, 2 blades, slider, lever | 59 cm³, 73 g | 4 h | Wheels through every route; lever click; do the parts go together |
| **4: points three ways** | 3 points coupons (toe to just past the blades, 12 studs, no frog), 5 or 6 parts each | 74 cm³, 92 g (31 g each) | 5 h | Flange relief; rigid blades; the snap clamp both ways; 4 mm throw |
| **5: seat for a LEGO curve** | Ballast for one bought R40 curve | 25 cm³, 31 g | 1¾ h | Does bought track drop into its seat |

196 cm³ in all, about 245 g of PLA and 13 hours (grams are the parts' solid volume, so an upper figure; hours a guess
at 15 cm³ an hour). Three plates on a 256 mm bed: **plate 1** = templates 1, 2 and 5; **plate 2** = template 3;
**plate 3** = template 4. If there's one evening: plates 1 and 2. Coupon C of template 4 matters least.

For each: pick the template, wait for it to build, press STL. The zip's files are named for the coupon and its values,
and its README.txt lists them.

## Print settings

- 0.4 mm nozzle, 0.2 mm layers, PLA (PETG if that's what the layout will be: say which on the form).
- Every file as it comes: don't turn it. **No slicer supports, no brim.**
- Your normal profile otherwise. Don't tune for these: the point is what your everyday settings give.

## Break-out supports

The parts print with small supports of their own, drawn gold in the 3D view (the Supports button hides them):

- **Under every rail end** (all track parts): a small block under each rail tongue. Came out clean: it snaps off whole,
  and the tongue's underside is flat enough to slide over the next piece's sleeper.
- **In the sprung blades** (template 3; coupons A and C of 4): small loose pieces in the spring pockets under each blade's plate.
  Came out clean: the pockets are empty end to end, and the plate's spring flexes when you press the blade sideways with a fingernail.

Rigid blades (coupon B), sliders, levers and clamps have none. The snap clamp's two small links are loose inside it
on purpose: leave them in.

## Putting them together

1. **Fits.** Count the ribs on one sleeper end: 1 (loosest) to 5 (tightest); 3 is today's setting.

   | Ribs | 1 | 2 | 3 | 4 | 5 |
   |---|---|---|---|---|---|
   | Stud fit, mm | 0.08 | 0.13 | 0.18 | 0.23 | 0.28 |
   | Anti-stud fit, mm | 0.16 | 0.11 | 0.06 | 0.01 | -0.04 |

   Underside: press each on a baseplate. Top: press a 2 × 4 brick on each one's studs. The two are judged apart.
2. **Joints.** Clip `clip1` to `clip2`, then a bought LEGO straight to either. Press one `dovetail` half down into the
   other. Try each joint in the hand (pull, twist), then on a baseplate.
3. **Switch.** Join the two track parts, press them on a baseplate. Slider down through the lever's opening and along
   its tunnel under the rails; blades on from above, front edge tilted in under the lip; lever pressed in between its
   ears, its foot in the slider.
4. **Points coupons.** As the switch. The clamp goes on last, dropped over its two bosses: on the lever's arm (A),
   between the blades (B). C has none.
5. **Seat.** Lay a LEGO R40 curve in it.

Then, for 3 and 4: roll a wheelset (and a bogie, and your longest-wheelbase loco) by hand through every route, both
ways, points set each way. For trailing: set the points against the wheels and push through from the heel end.

## Results form

Copy, fill in, send back. `[ ]` → `[x]`; blanks take a number or a word.

```
Printer: ________  Material: ________  Layer: ____ mm

1. FITS (ribs 1 loosest .. 5 tightest; 3 = today)
   Underside on a baseplate, right grip is ribs: [ ]1 [ ]2 [ ]3 [ ]4 [ ]5   [ ] none (all too loose / all too tight)
   A brick on its studs, right grip is ribs:     [ ]1 [ ]2 [ ]3 [ ]4 [ ]5   [ ] none (all too loose / all too tight)
   Measured stud diameter on coupon 3: ____ mm (drawn 4.98)

2. JOINTS
   Peg and clip, printed to printed:  [ ] goes in, holds  [ ] loose  [ ] too tight  [ ] won't go
   Peg and clip, printed to LEGO:     [ ] goes in, holds  [ ] loose  [ ] too tight  [ ] won't go
   Dovetail:                          [ ] goes in, holds  [ ] loose  [ ] too tight  [ ] won't go
   Rail tops level across the joint:  [ ] yes  [ ] step of ____ mm

3. SWITCH AS BUILT (sprung blades, lever click, 3 mm)
   Went together:            [ ] yes  [ ] no: ________________
   Wheels, straight route:   [ ] clean  [ ] rub at ________  [ ] climb at ________
   Wheels, branch route:     [ ] clean  [ ] rub at ________  [ ] climb at ________
   Flange touches the blades' plate:  [ ] no  [ ] yes
   Open blade's back touches wheels:  [ ] no  [ ] yes     Gap, open blade to its rail: ____ mm
   Lever click holds the points:      [ ] yes  [ ] weak  [ ] no
   Trailing through:  [ ] blades give and return  [ ] derails  [ ] points stay half over

4. POINTS THREE WAYS
   A (relief + clamp on the arm):  flange touches plate [ ] no [ ] yes
                                   clamp [ ] snaps both ways and holds  [ ] weak  [ ] doesn't snap  [ ] broke
                                   trailing [ ] fine  [ ] derails
   B (rigid + clamp between):      wheels [ ] clean  [ ] rub at ________
                                   clamp [ ] snaps both ways and holds  [ ] weak  [ ] doesn't snap  [ ] broke
                                   trailing [ ] pushes the points over  [ ] derails
   C (4 mm throw):                 open blade's back touches wheels [ ] no [ ] yes     Gap: ____ mm
                                   blades close fully both ways [ ] yes [ ] no
   Best of the four to run trains on: [ ] switch as built  [ ] A  [ ] B  [ ] C

5. SEAT
   LEGO curve: [ ] drops in, sits flat  [ ] loose, slides about  [ ] tight, has to be pressed  [ ] won't go in
   Slack side to side: ____ mm

6. SUPPORTS
   Rail-end supports:   [ ] came out clean  [ ] left stubs  [ ] fused
   Sprung blade gaps:   [ ] came out clean  [ ] left bits  [ ] fused (spring doesn't flex)
   Anything that drooped, strung or lifted: ________________

Anything else: ________________
```

## What each answer changes

| Answer | Setting (Settings panel) | Now |
|---|---|---|
| 1, underside | Anti-stud fit, mm | 0.06 |
| 1, studs | Stud fit, mm | 0.18 |
| 2 | Parts join with (peg and clip, or dovetails); the peg's and clip's sizes if neither holds | Rail tongues + peg and clip |
| 3, rubbing or climbing | Flangeway width and depth, mm; Check rail width, mm | 3, 3; 1 |
| 3 and 4A, flange on the plate | Flange relief in sprung blades | off |
| 3 against 4B | Blade shape | Sprung |
| 3 against 4A and 4B, holding and trailing | Points kept set by | Lever click |
| 3 against 4C | Blade throw, mm | 3 |
| 5 | Track fit in the seat, mm | 0.2 |
| 6 | Supports under rail ends; the sprung blades' gaps | on |

## Round two (not in this kit)

A banked curve (the eased ramp has not been printed) and a double slip (four sets of rigid blades, levers outside).
Both are templates already; worth printing once the numbers above are settled.
