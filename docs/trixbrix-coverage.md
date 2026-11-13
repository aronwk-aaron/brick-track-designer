# Reference coverage: TrixBrix parts and combo sets

A developer's check of how much of the TrixBrix range (the BlueBrick parts library's TrixBrix folder: its parts'
connections and lever tabs, and its combo sets) Brick Track Designer makes from its own generators. The reference is
used only as the check: every BTD part comes from a template's routes and the generator's settings.

How it was checked (scripts kept with the hand-off, not in the repo):

- **Ends.** Each part's track connections (studs; the library's frame) against each template's free route ends, by the
  best rigid move (no mirroring), narrow-gauge ends only to narrow-gauge ends. Exact: every end within 0.05 studs and
  0.5°. A combo set's ends are worked out from its pieces as the library places them, which is itself only good to
  about 0.3 studs, so a set within that is called exact.
- **Levers.** For switches with lever tabs (the library's switch-motor connections), each built lever's pivot against
  the tabs, after the same move: within 0.75 studs (the tab is the clip-on lever unit's place on the housing studs,
  BTD's pivot is its own lever's) counts as the same place.
- **Sections.** For the modular parts (bases, detachable sections, the middle section, connectors) the template that
  cuts them was built and each of its printed parts' connections (the layout export) matched against the part's.
- **Not checked by the script:** stud layout and the shape between the ends. The generator lays sleepers, studs and
  ballast by its own rules (whole studs, never through a stud), so a part can match at its ends and lever and still
  differ in its stud pattern; where that is known it's said.

Match: **exact** (ends, and lever or section where it has one), **close** (a template makes it, with what differs),
**missing** (no template or setting makes it), **in progress elsewhere** (the double slips and their crossovers, being
rebuilt separately).

Counts: close 69, exact 197, in progress elsewhere 15, missing 53, n/a 1 (of 335).

## Parts

| Part | BTD template (or settings) | Match | What differs |
|---|---|---|---|
| tb 2 stud gap switch left | Switch, 2-stud gap, left | exact | lever within 0.35 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb 2 stud gap switch right | Switch, 2-stud gap, right | exact | lever within 0.35 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb 2 stud gap triple switch | Three-way, 2-stud gap | exact | lever within 0.35 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb 2865 | Straight, 16 studs | exact |  |
| tb 2867 | Curve R40, 22.5° | exact |  |
| tb 4 stud gap switch crossover left | Crossover, 4-stud gap, left | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb 4 stud gap switch crossover right | Crossover, 4-stud gap, right | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb 4 stud gap switch left | Switch, 4-stud gap, left | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb 4 stud gap switch right | Switch, 4-stud gap, right | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb 4 stud gap triple switch | Three-way, 4-stud gap | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb bridge head | Bridge with guard rails | close | 8-stud straight ends match; the bridge's own joint (its bridge connections) is not generated |
| tb bridge section | Bridge with guard rails | close | 16-stud straight ends match; the bridge joint is not generated |
| tb buffer v2 | Buffer stop | close | as tb buffer: the v2 frame shape is not copied |
| tb buffer | Buffer stop | close | a buffer stop on a straight; its frame is the generator's, not checked against the picture |
| tb connector r40 left | Switch R40 left to a parallel track | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb connector r40 right | Switch R40 right to a parallel track | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb crossing r104 r120 | Crossing of two R120 curves | exact |  |
| tb crossing r104 | Curved crossing R104 | exact |  |
| tb crossing r24 | Curved crossing R24 | exact |  |
| tb crossing r40 | Curved crossing R40 | exact |  |
| tb crossing r56 | Curved crossing R56 | exact |  |
| tb crossing r72 | Curved crossing R72 | exact |  |
| tb crossing r88 | Curved crossing R88 | exact |  |
| tb crossing x22 left | Crossing 22.5° left | exact |  |
| tb crossing x22 right | Crossing 22.5° right | exact |  |
| tb crossing x22 star | Star crossing 22.5° | exact |  |
| tb crossing x45 left | Crossing 45° left | exact |  |
| tb crossing x45 r104 | Crossing 45°, 27 studs | close | ends 0.53 studs / 0.0° off |
| tb crossing x45 right | Crossing 45° right | exact |  |
| tb crossing x90 short | Crossing 90°, 8 studs | exact |  |
| tb crossing x90 | 90° crossing | exact | from the Crossings group |
| tb ct r104 half | Curve R104, 5.62° | exact |  |
| tb ct r104 | Curve R104, 11.25° | exact |  |
| tb ct r104bc | Curve R104, 11.25° with 0.22 studs straight, on ballast | exact |  |
| tb ct r120 half | Curve R120, 5.62° | exact |  |
| tb ct r120 sixth | Straight, 4 studs | close | ends 0.10 studs / 1.9° off |
| tb ct r120 third left | Curve R120, 3.75° | exact |  |
| tb ct r120 third right | Curve R120, 3.75° | exact |  |
| tb ct r120 | Curve R120, 11.25° | exact |  |
| tb ct r136 | Curve R136, 5.62° | exact |  |
| tb ct r148 | Curve R148, 5.62° | exact |  |
| tb ct r148sc | Curve R148, 7.67° | exact |  |
| tb ct r148tc | Curve R148, 3.58° | exact |  |
| tb ct r152 | Curve R152, 5.62° | exact |  |
| tb ct r168 | Curve R168, 5.62° | exact |  |
| tb ct r184 | Curve R184, 5.62° | exact |  |
| tb ct r24 | Curve R24, 22.5° | exact |  |
| tb ct r32 | Curve R32, 22.5° | exact |  |
| tb ct r34-8s | Curve R34, 28.07° | exact |  |
| tb ct r40 half | Curve R40, 11.25° | exact |  |
| tb ct r40 quarter | Curve R40, 5.62° | exact |  |
| tb ct r51sc | Curve R51, 9.36° | exact |  |
| tb ct r56 half | Curve R56, 11.25° | exact |  |
| tb ct r56 | Curve R56, 22.5° | exact |  |
| tb ct r56sc | Curve R50, 15.95° | exact |  |
| tb ct r56tc | Curve R56, 13.11° | exact |  |
| tb ct r65-4s | Curve R65, 14.25° | exact |  |
| tb ct r72 half | Curve R72, 5.62° | exact |  |
| tb ct r72 | Curve R72, 11.25° | exact |  |
| tb ct r72sc | Curve R63.8, 14.06° | exact |  |
| tb ct r88 half | Curve R88, 5.62° | exact |  |
| tb ct r88 | Curve R88, 11.25° | exact |  |
| tb decoupler | - | missing | an 8-stud straight with a decoupling ramp between the rails: BTD has no decoupler |
| tb dg crossing x45 left | Narrow-gauge crossing of standard track 45° left | exact |  |
| tb dg crossing x45 right | Narrow-gauge crossing of standard track 45° right | exact |  |
| tb dg crossing x90 | Narrow-gauge crossing of standard track 90° | exact |  |
| tb dg ct r40 nc | Dual gauge curve R40, 22.5°, narrow gauge centred | exact |  |
| tb dg ct r40 ni | Dual gauge curve R40, 22.5°, narrow gauge inside | exact |  |
| tb dg ct r40 no | Dual gauge curve R40, 22.5°, narrow gauge outside | exact |  |
| tb dg slide center-left | Dual gauge slide, centre to left | exact |  |
| tb dg slide center-right | Dual gauge slide, centre to right | exact |  |
| tb dg st 16 nc | Dual gauge straight, 16 studs, narrow gauge centred | exact | ends as LEGO track; narrow gauge centred |
| tb dg st 16 ns | Dual gauge straight, 16 studs, narrow gauge at the side | exact | ends as LEGO track; narrow gauge at the side |
| tb dg switch r40 left | Dual gauge switch R40 left | exact |  |
| tb dg switch r40 right | Dual gauge switch R40 right | exact |  |
| tb dg turnout left | Dual gauge turnout R36 left | close | ends not compared by the script (a narrow-gauge end and standard ends together) |
| tb dg turnout right | Dual gauge turnout R36 right | close | as the left one |
| tb double crossover r40 complete | Double crossover R40 | close | lever 2.5 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb mils-st2 | Straight, 2 studs | close | track ends match; the MILS plate connections (for modular baseplates) are not generated |
| tb mils-st4 | Straight, 4 studs | close | as tb mils-st2 |
| tb mils-st8 | Straight, 8 studs | close | as tb mils-st2 |
| tb ng buffer | Narrow-gauge buffer stop | close | as tb buffer, narrow gauge |
| tb ng crossing x22.5 left | - | missing | no template has its 4 ends |
| tb ng crossing x22.5 right | - | missing | no template has its 4 ends |
| tb ng crossing x33.75 left | Narrow-gauge crossing 33.75° left | close | ends 0.54 studs / 0.0° off |
| tb ng crossing x33.75 right | Narrow-gauge crossing 33.75° right | close | ends 0.54 studs / 0.0° off |
| tb ng crossing x90 short | Narrow-gauge crossing 90° | exact |  |
| tb ng ct r24 | Narrow-gauge curve R24, 22.5° | exact |  |
| tb ng ct r36 half | Narrow-gauge curve R36, 11.25° | exact |  |
| tb ng ct r36 | Narrow-gauge curve R36, 22.5° | exact |  |
| tb ng ct r48 sc | Narrow-gauge curve R64.9, 7.88° | exact |  |
| tb ng ct r48 tc | Narrow-gauge curve R48, 6.73° | exact |  |
| tb ng ct r48 | Narrow-gauge curve R48, 11.25° | exact |  |
| tb ng ct r72 | Narrow-gauge curve R72, 11.25° | exact |  |
| tb ng ct r84 | Narrow-gauge curve R84, 11.25° | exact |  |
| tb ng ct r84bc left | Narrow-gauge curve R65.4, 11.25° with 3.42 studs straight, on ballast | exact |  |
| tb ng ct r84bc right | Narrow-gauge curve R84, 11.25° | close | ends 0.42 studs / 0.0° off |
| tb ng ct r96 | Narrow-gauge curve R96, 11.25° | exact |  |
| tb ng ct x45 left | - | missing | a narrow-gauge piece turning 45° across standard track: no template |
| tb ng ct x45 right | - | missing | as the left one |
| tb ng double crossing | Narrow-gauge double crossover R36 | close | lever 2.5 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb ng st 16 | Narrow-gauge straight, 16 studs | exact |  |
| tb ng st 2 | Narrow-gauge straight, 2 studs | exact |  |
| tb ng st 4 | Narrow-gauge straight, 4 studs | exact |  |
| tb ng st 8 | Narrow-gauge straight, 8 studs | exact |  |
| tb ng switch r36 left gti | Narrow-gauge switch R36 left, lever on the branch side | close | lever 2.5 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb ng switch r36 left | Narrow-gauge switch R36 left | close | lever 2.5 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb ng switch r36 right gti | Narrow-gauge switch R36 right, lever on the branch side | close | lever 2.5 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb ng switch r36 right | Narrow-gauge switch R36 right | close | lever 2.5 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb ng switch r36 wye | Narrow-gauge wye R36 | close | lever 3.0 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb ng switch r48 left | Narrow-gauge switch R48 left | close | lever 4.7 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb ng switch r48 right | Narrow-gauge switch R48 right | close | lever 4.7 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb ng switch r84 left | Narrow-gauge switch R84 left | close | lever 2.5 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb ng switch r84 right | Narrow-gauge switch R84 right | close | lever 2.5 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb pass-though connector R40 | - | missing | the short connector of the pass-through crossovers: no template |
| tb pass-though crossing R120 left | Pass-through crossing R120 left | exact |  |
| tb pass-though crossing R120 right | Pass-through crossing R120 right | exact |  |
| tb pass-though crossing R56 left | Pass-through crossing R56 left | exact |  |
| tb pass-though crossing R56 right | Pass-through crossing R56 right | exact |  |
| tb pass-though crossing R72a left | Pass-through crossing R72 (A) left | exact |  |
| tb pass-though crossing R72a right | Pass-through crossing R72 (A) right | exact |  |
| tb pass-though crossing R72b left | Pass-through crossing R72 (B) left | exact |  |
| tb pass-though crossing R72b right | Pass-through crossing R72 (B) right | exact |  |
| tb r104y 8sg c1 | Curve R116.4, 7.34° with 0.03 studs straight | exact |  |
| tb r104y 8sg c2 | Curve R90, 8.41° | exact |  |
| tb r104y | Curve R104, 6.75° with 0.22 studs straight | exact |  |
| tb r120 siding curve left | Curve R67.4, 1.88° with 5.06 studs straight | close | ends 0.17 studs / 0.0° off |
| tb r120 siding curve right | Curve R67.4, 1.88° with 5.06 studs straight | exact |  |
| tb rc1 | Straight, 1.81 studs | exact |  |
| tb rc2 | Straight, 1.33 studs | exact |  |
| tb st1.3 | Straight, 1.33 studs | exact |  |
| tb st1.6 | Straight, 1.6 studs | exact |  |
| tb st1 | Straight, 1 stud | exact |  |
| tb st2 | Straight, 2 studs | exact |  |
| tb st3 | Straight, 3 studs | exact |  |
| tb st32 | Straight, 32 studs | exact |  |
| tb st4 | Straight, 4 studs | exact |  |
| tb st8 | Straight, 8 studs | exact |  |
| tb switch motor left | - | close | the clip-on lever unit (4 x 5 studs) on a switch's housing studs; BTD builds its lever into the housing (Throw: lever built in, or on a 3 x 3 bracket) |
| tb switch motor right | - | close | as the left one |
| tb switch r104 base left gto | Switch R104 left, base and detachable modules (part switch-base4) | close | the nearest part's ends are 1.09 studs / 0.4° off |
| tb switch r104 base left | Switch R104 left, base and detachable modules (part switch-base4) | close | the nearest part's ends are 1.09 studs / 0.4° off |
| tb switch r104 base right gto | Switch R104 right, base and detachable modules (part switch-base1) | close | the nearest part's ends are 1.09 studs / 0.4° off |
| tb switch r104 base right | Switch R104 right, base and detachable modules (part switch-base1) | close | the nearest part's ends are 1.09 studs / 0.4° off |
| tb switch r104 base triple | Three-way R104, base and detachable modules (part switch-base4) | close | the nearest part's ends are 1.03 studs / 0.1° off |
| tb switch r104 curved 90d left | Curved switch R104 90° left | close | lever 1.5 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r104 curved 90d right | Curved switch R104 90° right | close | lever 1.5 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r104 detach 1 left | Switch R104 left, base and detachable modules | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb switch r104 detach 1 right | Switch R104 right, base and detachable modules | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb switch r104 detach 1 triple | Three-way R104, base and detachable modules | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb switch r104 dslip co adapter both | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb switch r104 dslip co adapter left | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb switch r104 dslip co adapter right | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb switch r104 dslip detach left | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb switch r104 dslip detach right | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb switch r104 dslip left | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb switch r104 dslip middle | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb switch r104 dslip right | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb switch r104 left gto | Switch R104 left, lever on the straight side | exact | lever within 0.50 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r104 left | Switch R104 left | exact | lever within 0.50 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r104 middle section | Double crossover R104, bases and detachable modules | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb switch r104 r120 wye | Wye R104 left, R120 right | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r104 right gto | Switch R104 right, lever on the straight side | exact | lever within 0.50 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r104 right | Switch R104 right | exact | lever within 0.50 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r104 track terminator | Double crossover R104, bases and detachable modules | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb switch r104 triple detach 2 left | Three-way R104, base and detachable modules | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb switch r104 triple detach 2 right | Three-way R104, base and detachable modules | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb switch r104 triple | Three-way R104 | close | lever within 0.50 studs of the part's tab; cross-bar 18 studs, its levers further out than the reference's (16) |
| tb switch r104 wye | Wye R104 | close | lever 1.5 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r120 left | Switch R120 left | close | lever 1.5 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r120 r104 wye | Wye R120 left, R104 right | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r120 right | Switch R120 right | close | lever 1.5 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r148 left gto | Switch R148 left, lever on the straight side | exact | lever within 0.45 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r148 left | Switch R148 left | exact | lever within 0.45 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r148 right gto | Switch R148 right, lever on the straight side | exact | lever within 0.45 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r148 right | Switch R148 right | exact | lever within 0.45 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 comp base gto left | Switch R40 left, compact base and standard section (part track3) | close | the nearest part's ends are 0.76 studs / 1.1° off |
| tb switch r40 comp base gto right | Switch R40 right, compact base and standard section (part track1) | close | the nearest part's ends are 0.76 studs / 1.1° off |
| tb switch r40 comp base left | Switch R40 left, compact base and standard section (part track3) | close | the nearest part's ends are 0.76 studs / 1.1° off |
| tb switch r40 comp base right | Switch R40 right, compact base and standard section (part track1) | close | the nearest part's ends are 0.76 studs / 1.1° off |
| tb switch r40 comp det curved 45 left | Switch R40 left, compact base and curved 45° section | missing | no part BTD cuts there has this section's ends: the template cuts the kit at other places (see its parts in the layout export) |
| tb switch r40 comp det curved 45 right | Switch R40 right, compact base and curved 45° section (part track2) | close | the nearest part's ends are 0.89 studs / 1.1° off |
| tb switch r40 comp det curved 90 left | Switch R40 left, compact base and curved 90° section (part switch-base1) | close | the nearest part's ends are 0.59 studs / 0.7° off |
| tb switch r40 comp det curved 90 right | Switch R40 right, compact base and curved 90° section (part switch-base2) | close | the nearest part's ends are 0.59 studs / 0.7° off |
| tb switch r40 comp det straight railyard left | Yard switch R40 left, compact base and rail yard section (part track2) | close | the nearest part's ends are 1.26 studs / 1.8° off |
| tb switch r40 comp det straight railyard right | Yard switch R40 right, compact base and rail yard section (part track2) | close | the nearest part's ends are 0.89 studs / 1.1° off |
| tb switch r40 comp det straight short left | Switch R40 left, compact base and short section (part track2) | close | the nearest part's ends are 1.28 studs / 1.8° off |
| tb switch r40 comp det straight short right | Switch R40 right, compact base and short section (part track2) | close | the nearest part's ends are 0.88 studs / 1.1° off |
| tb switch r40 comp det straight standard left | Switch R40 left, compact base and standard section (part track2) | close | the nearest part's ends are 1.28 studs / 1.8° off |
| tb switch r40 comp det straight standard right | Switch R40 right, compact base and standard section (part track2) | close | the nearest part's ends are 0.88 studs / 1.1° off |
| tb switch r40 comp perpendicular left | - | missing | no template cuts this section |
| tb switch r40 comp perpendicular right | - | missing | no template cuts this section |
| tb switch r40 curved 45d left | Curved switch R40 45° left | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 curved 45d right | Curved switch R40 45° right | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 curved 90d left | Curved switch R40 90° left | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 curved 90d right | Curved switch R40 90° right | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 dslip | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb switch r40 left | Switch R40 left | exact | lever within 0.53 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 r56 wye | Wye R40 left, R56 right | close | lever 1.5 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 railyard left | Yard switch R40 left | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 railyard right | Yard switch R40 right | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 right | Switch R40 right | exact | lever within 0.53 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 sslip | Single slip R40 45° | close | lever within 0.50 studs of the part's tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb switch r40 triple | Three-way R40 | exact | lever within 0.45 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 wye 8sg | Wye R40, 8-stud spacing | close | lever 1.5 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40 wye | Wye R40 | close | lever 1.5 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40s20 left | Switch R40 left, 28-stud straight | exact | lever within 0.53 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r40s20 right | Switch R40 right, 28-stud straight | exact | lever within 0.53 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r56 curved 90d left | Curved switch R56 90° left | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r56 curved 90d right | Curved switch R56 90° right | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r56 left | Switch R56 left | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r56 r40 wye | Wye R56 left, R40 right | close | lever 1.5 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r56 right | Switch R56 right | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r72 left | Switch R72 left | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r72 right | Switch R72 right | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb t-junction r40 r56 core | T-junction core R56 | exact |  |
| tb zero gap switch left | Switch to the next track, no gap, left | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb zero gap switch right | Switch to the next track, no gap, right | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb zero gap triple switch | Three-way, no gap | exact | lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| trixbrix logo.15 | - | n/a | not a track part (the maker's logo) |

## Combo sets

| Part | BTD template (or settings) | Match | What differs |
|---|---|---|---|
| tb 4 stud gap crossover left | Crossover, 4-stud gap, left | close | lever 2.5 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb 4 stud gap crossover right | Crossover, 4-stud gap, right | close | lever 2.5 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb combo 2sg switch left with r51 | Switch, 2-stud gap, left, with its R51 curve | exact | ends within 0.09 studs: the library's own placing of the set's pieces; lever within 0.35 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo 2sg switch right with r51 | Switch, 2-stud gap, right, with its R51 curve | exact | ends within 0.09 studs: the library's own placing of the set's pieces; lever within 0.36 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo 2sg triple switch with r51 | Three-way, 2-stud gap, with its R51 curves | exact | ends within 0.26 studs: the library's own placing of the set's pieces; lever within 0.35 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo 4sg switch left with r32 | Switch, 4-stud gap, left, with its R32 curve | close | ends 0.31 studs / 0.0° off; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo 4sg switch right with r32 | Switch, 4-stud gap, right, with its R32 curve | exact | ends within 0.20 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo 4sg triple switch with r32 | Three-way, 4-stud gap, with its R32 curves | exact | ends within 0.27 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo compact corner - 2l+1r curved switches 90d r40 | Compact corner R40 left | exact | ends within 0.13 studs: the library's own placing of the set's pieces; lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo compact corner - 2l+1r curved switches 90d r56 | Compact corner R56 left | exact | ends within 0.13 studs: the library's own placing of the set's pieces; 3 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo compact corner - 2r+1l curved switches 90d r40 | Compact corner R40 right | exact | ends within 0.12 studs: the library's own placing of the set's pieces; lever within 0.56 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo compact corner - 2r+1l curved switches 90d r56 | Compact corner R56 right | exact | ends within 0.13 studs: the library's own placing of the set's pieces; 3 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo compact corner 90d r104 1L | Compact corner R104, two tracks, left | exact | 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo compact corner 90d r104 1R | Compact corner R104, two tracks, right | exact | 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo compact corner 90d r104 2L | Compact corner R104, three tracks, left | exact | ends within 0.12 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo compact corner 90d r104 2R | Compact corner R104, three tracks, left | exact | ends within 0.12 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo compact corner 90d r104 3L | Compact corner R104, four tracks, left | exact | ends within 0.12 studs: the library's own placing of the set's pieces; 3 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo compact corner 90d r104 3R | Compact corner R104, four tracks, right | exact | ends within 0.13 studs: the library's own placing of the set's pieces; 3 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo compact switch set - 2l+1r curved switches 45d r40 | - | missing | made by chaining its pieces (ends within the library's slack), but some of its sections don't fit a 256 mm bed: left out of the templates for now |
| tb combo compact switch set - 2r+1l curved switches 45d r40 | - | missing | made by chaining its pieces (ends within the library's slack), but some of its sections don't fit a 256 mm bed: left out of the templates for now |
| tb combo diverging double track r40 r56 left | Double turnout R56 and R40, left | exact | ends within 0.09 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo diverging double track r40 r56 right | Double turnout R56 and R40, right | exact | ends within 0.09 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo pass-through double crossover r40 left | - | missing | no template for the arrangement; its pieces (23, 6 kinds): not exact: tb pass-though connector R40 (missing) |
| tb combo pass-through double crossover r40 right | - | missing | no template for the arrangement; its pieces (23, 6 kinds): not exact: tb pass-though connector R40 (missing) |
| tb combo pass-through single crossover r40 left | - | missing | no template for the arrangement; its pieces (13, 5 kinds): not exact: tb pass-though connector R40 (missing) |
| tb combo pass-through single crossover r40 right | - | missing | no template for the arrangement; its pieces (13, 5 kinds): not exact: tb pass-though connector R40 (missing) |
| tb combo r104 crossing 45d | - | missing | no template for the arrangement; its pieces (5, 2 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb combo r104 double crossover | Double crossover R104, bases and detachable modules | close | lever 14.0 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb combo r104 double slip crossover 2 ds para | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb combo r104 double slip crossover 2 ds side | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb combo r104 double slip crossover | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb combo r104 double slip monster crossover 2 ds para | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb combo r104 double slip monster crossover 2 ds side | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb combo r104 double slip monster crossover | Double slip templates | in progress elsewhere | the double slips and their crossovers are being rebuilt separately |
| tb combo r104 monster crossover | Crossover, three tracks, R104 | close | lever 4.7 studs from the part's lever tab; housing: BTD builds its lever into a housing with no studs; the reference has 4 x 3 studs there for its clip-on lever unit (Throw: Lever on a bracket is the nearest) |
| tb combo r104 railyard 2T left | Siding R104 left (BrickTracks) | exact | ends within 0.07 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch); from the BrickTracks trackwork group |
| tb combo r104 railyard 2T right | Siding R104 right (BrickTracks) | exact | 1 lever tab(s): lever place not checked (template not in the build batch); from the BrickTracks trackwork group |
| tb combo r104 railyard 3T left | Yard R104, three tracks, left | exact | ends within 0.06 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r104 railyard 3T right | Yard R104, three tracks, right | exact | ends within 0.09 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r104 railyard 4T left | Yard R104, four tracks, left | exact | ends within 0.15 studs: the library's own placing of the set's pieces; 3 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r104 railyard 4T right | Yard R104, four tracks, right | exact | ends within 0.17 studs: the library's own placing of the set's pieces; 3 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r104t 3T | Three-way R104 to three parallel tracks | exact | ends within 0.18 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r104y 2T | Wye R104 to two parallel tracks | exact | ends within 0.16 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r120 pt1 left | - | missing | no template for the arrangement; its pieces (23, 10 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb combo r120 pt1 right | - | missing | no template for the arrangement; its pieces (23, 10 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb combo r120 siding left | Switch R120 left with its siding curves | exact | ends within 0.09 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r120 siding right | Switch R120 right with its siding curves | exact | ends within 0.09 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r120 turnout left | Switch R120 left with its turnout curve | exact | 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r120 turnout right | Switch R120 right with its turnout curve | exact | 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r148 railyard 3T left | Yard R148, three tracks, left | exact | ends within 0.27 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r148 railyard 3T right | Yard R148, three tracks, right | exact | ends within 0.27 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r148 railyard 4T left | Yard R148, four tracks, left | exact | ends within 0.27 studs: the library's own placing of the set's pieces; 3 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r148 railyard 4T right | Yard R148, four tracks, right | exact | ends within 0.27 studs: the library's own placing of the set's pieces; 3 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r148 siding left | Switch R148 left with its siding curves | exact | ends within 0.27 studs: the library's own placing of the set's pieces; lever within 0.45 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo r148 siding right | Switch R148 right with its siding curves | exact | ends within 0.27 studs: the library's own placing of the set's pieces; lever within 0.45 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo r148 turnout left | Switch R148 left with its turnout curve | exact | ends within 0.26 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r148 turnout right | Switch R148 right with its turnout curve | exact | ends within 0.26 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r40 perpendicular 3T left | - | missing | no template for the arrangement; its pieces (11, 5 kinds): not exact: tb switch r40 comp perpendicular left (missing) |
| tb combo r40 perpendicular 3T right | - | missing | no template for the arrangement; its pieces (11, 5 kinds): not exact: tb switch r40 comp perpendicular right (missing) |
| tb combo r40 railyard 2T left | Yard R40, two tracks, left | exact | ends within 0.15 studs: the library's own placing of the set's pieces; lever within 0.53 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo r40 railyard 2T right | Yard R40, two tracks, right | exact | ends within 0.07 studs: the library's own placing of the set's pieces; lever within 0.60 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo r40 railyard 3T left | Yard R40, three tracks, left | exact | ends within 0.08 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r40 railyard 3T right | Yard R40, three tracks, right | exact | ends within 0.11 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r40 railyard 4T left | Yard R40, four tracks, left | exact | ends within 0.13 studs: the library's own placing of the set's pieces; 3 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r40 railyard 4T right | Yard R40, four tracks, right | exact | ends within 0.14 studs: the library's own placing of the set's pieces; 3 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r56 siding left | Switch R56 left with its siding curves | exact | ends within 0.18 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r56 siding right | Switch R56 right with its siding curves | exact | 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r56 turnout left | Switch R56 left with its turnout curve | exact | 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r56 turnout right | Switch R56 right with its turnout curve | exact | 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 pt1 left | Pass-through turnout R72 left | close | ends 0.31 studs / 0.0° off; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 pt1 right | Pass-through turnout R72 right | exact | ends within 0.26 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 pt2 left | Double turnout R72 and R56, left | exact | ends within 0.23 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 pt2 right | Double turnout R72 and R56, right | exact | ends within 0.26 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 pt3 left | Double pass-through turnout R72 left | close | ends 0.31 studs / 0.0° off; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 pt3 right | Double pass-through turnout R72 right | exact | ends within 0.26 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 pt4 left | Double pass-through turnout R72 and R40, left | close | ends 0.31 studs / 0.0° off; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 pt4 right | Double pass-through turnout R72 and R40, right | exact | ends within 0.22 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 pt5 left | - | missing | made by chaining its pieces (ends within the library's slack), but some of its sections don't fit a 256 mm bed: left out of the templates for now |
| tb combo r72 pt5 right | - | missing | no template for the arrangement; its pieces (19, 12 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb combo r72 pt6 left | - | missing | made by chaining its pieces (ends within the library's slack), but some of its sections don't fit a 256 mm bed: left out of the templates for now |
| tb combo r72 pt6 right | - | missing | no template for the arrangement; its pieces (20, 15 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb combo r72 siding left | Switch R72 left with its siding curves | close | ends 0.31 studs / 0.0° off; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 siding right | Switch R72 right with its siding curves | exact | ends within 0.26 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 turnout left | Switch R72 left with its turnout curve | exact | ends within 0.23 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo r72 turnout right | Switch R72 right with its turnout curve | exact | ends within 0.24 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb combo switch r40 parallel left | Switch R40 left to a parallel track | exact | ends within 0.16 studs: the library's own placing of the set's pieces; lever within 0.53 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo switch r40 parallel right | Switch R40 right to a parallel track | exact | ends within 0.06 studs: the library's own placing of the set's pieces; lever within 0.53 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo switch r40 parallel triple | Three-way R40 to three parallel tracks | exact | ends within 0.16 studs: the library's own placing of the set's pieces; lever within 0.45 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo switch r40 parallel wye 8sg | Wye R40, 8-stud spacing, to two parallel tracks | exact | ends within 0.18 studs: the library's own placing of the set's pieces; lever within 0.64 studs of the part's tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb combo switch r40 parallel wye | Modular wye R40 with parallel-track adapters | exact | ends within 0.16 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch); from the 4DBrix trackwork group |
| tb combo wide switched curve section - 2 tracks - 2 ends | - | missing | no template for the arrangement; its pieces (28, 9 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb combo wide switched curve section - 2 tracks - 3 ends | - | missing | no template for the arrangement; its pieces (40, 11 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb combo wide switched curve section - 3 tracks - 3 ends | - | missing | no template for the arrangement; its pieces (48, 11 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb dg crossing x45 1mt left | - | missing | no template for the arrangement; its pieces (9, 5 kinds): not exact: tb ng ct x45 left (missing) |
| tb dg crossing x45 1mt right | - | missing | no template for the arrangement; its pieces (9, 5 kinds): not exact: tb ng ct x45 right (missing) |
| tb dg crossing x45 2mt left | - | missing | no template for the arrangement; its pieces (15, 6 kinds): not exact: tb ng ct x45 left (missing) |
| tb dg crossing x45 2mt right | - | missing | no template for the arrangement; its pieces (15, 6 kinds): not exact: tb ng ct x45 right (missing) |
| tb dg crossing x45 2mt star | - | missing | no template for the arrangement; its pieces (21, 8 kinds): not exact: tb ng ct x45 left (missing), tb ng ct x45 right (missing) |
| tb dg crossing x45 rhombus left | - | missing | no template for the arrangement; its pieces (26, 8 kinds): not exact: tb ng ct x45 left (missing) |
| tb dg crossing x45 rhombus right | - | missing | no template for the arrangement; its pieces (26, 8 kinds): not exact: tb ng ct x45 right (missing) |
| tb dome crossing r104 r120 | - | missing | no template for the arrangement; its pieces (29, 14 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb double dome crossing r104 r120 | - | missing | no template for the arrangement; its pieces (54, 14 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb ng combo r48 ry2 left | Narrow-gauge switch R48 left to a parallel track | exact | ends within 0.09 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb ng combo r48 ry2 right | Narrow-gauge switch R48 right to a parallel track | exact | ends within 0.09 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb ng combo r48 to left | Narrow-gauge switch R48 left with its turnout curve | exact | ends within 0.09 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb ng combo r48 to right | Narrow-gauge switch R48 right with its turnout curve | exact | ends within 0.09 studs: the library's own placing of the set's pieces; 1 lever tab(s): lever place not checked (template not in the build batch) |
| tb ng combo r84 left | - | missing | no template for the arrangement; its pieces (3, 3 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb ng combo r84 right | - | missing | no template for the arrangement; its pieces (3, 3 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb ng combo x22 left | - | missing | no template for the arrangement; its pieces (5, 3 kinds): not exact: tb ng crossing x22.5 left (missing) |
| tb ng combo x22 right | - | missing | no template for the arrangement; its pieces (5, 3 kinds): not exact: tb ng crossing x22.5 right (missing) |
| tb switch r104 wye 8sg | Wye R104, 8-stud gap, with its curves | close | ends within 0.09 studs: the library's own placing of the set's pieces; lever 1.6 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb switch r104 wye | Wye R104 with its adapter curves | close | ends within 0.09 studs: the library's own placing of the set's pieces; lever 1.5 studs from the part's lever tab; housing: the reference's cross-bar, 16 studs with a 4 x 3 stud block at each end (Lever housing: Cross-bar); the lever built in where the clip-on lever unit goes |
| tb t-junction r104 r120 | - | missing | no template for the arrangement; its pieces (40, 16 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb t-junction r40 r56 | - | missing | no template for the arrangement; its pieces (19, 12 kinds): all made by BTD (exact or close), so it is only a template to add |
| tb w-junction r104 r120 | W-junction R104 and R120 | exact | ends within 0.22 studs: the library's own placing of the set's pieces; 2 lever tab(s): lever place not checked (template not in the build batch) |

