# Expert mode: design and stages

Status: design agreed with nobody yet (S1, S1b, S2, S3, S4 and the editor's side of section 5 are built as section 11 says); decisions are taken here so work doesn't wait (the list for Aaron is in
section 10). What is built is in section 11 (State), kept current.

What was asked for, in short: the drawing mode of today stays as the simple mode; an expert can place and edit every
feature on its own (rails, sleepers, ballast, guard rails, points), define his own cuts, give a part its own settings
over the design's, split dual gauge into its gauges, and so recreate every vendor part exactly. Joined tracks should
stay joined when one is moved.

## 1. The model

**Simple mode is unchanged.** Routes in, the automatic result out. A design with no overrides builds exactly what it
builds today, byte for byte (tested, section 8).

**Expert mode is overrides on top of the automatic result.** Nothing is drawn from nothing: every expert edit says
"here, not what the app worked out, but this". Each override

- is attached to a place: a route (by name, the id routes already have: kits, hand edits and tests go by it), and where
  it matters a position along it in studs from the route's start, or a from–to stretch;
- has the automatic result as its absence: deleting the override is "reset to automatic";
- follows the track when it is moved, turned, mirrored, turned end for end, split, joined or reshaped (section 5);
- is plain data in the design file. Version stays 1: every new field is optional, old files read unchanged, and
  readDesign drops what is malformed and clamps the rest (limits.ts), as for every other field.

**Where overrides are stored: on what they belong to.**

| belongs to | stored | examples |
|---|---|---|
| one route | fields of `DRoute` | `own` (its settings), `stretches`, `cuts`, `cutsLocked`, later `sleeperEdits`, `railEdits` |
| a points set, frog, check rail, lever | `Design.trackwork` (exists), keyed by place, with its `on` anchor and `is` ident | toe moved, blade length, lever side, check rail ends |
| two or more routes | `Design.expert` | `cutPaths` (cuts along or between tracks), `apart` (connections taken apart), `shared` (sleepers shared across tracks) |

Route-owned data on the route itself is the decision that keeps the editor small: move, turn, mirror, copy, paste,
duplicate, delete, lock, My templates and undo already carry a route's fields; only the four operations that change
what "studs from the start" means need code (turn end for end, split, join, reshape), and they are four functions in
one file (`src/app/routecuts.ts` for cuts; the same pattern for stretches). Things between routes cannot live on one
route, so they go in `Design.expert` with route names and are followed the way trackwork edits are (twfollow.ts: an
anchor `[route, from 's'|'e', along, right]` plus an ident `[routes, side, nth, of]`; that file is generalised, not
copied: `Kind` gains the new kinds).

**The unit of an override**, smallest that makes a printable difference:

1. a route (`DRoute.own`): everything on this track;
2. a stretch of a route (`DRoute.stretches[] = { from, to, own }`, whole studs from the start): this part of it;
3. a single feature (this points set, this frog, this check rail, this sleeper, this cut).

**Composition: one function, pure.** `src/app/overrides.ts`:

```ts
/** The settings in force at a place: the defaults, the design's over them, the route's own, the stretch's, the feature's. */
resolveOptions(d: Design, route: number, at?: number, feature?: Partial<PieceOptions>): PieceOptions
/** Where each value in force comes from, for the card: 'default' | 'design' | 'route' | 'stretch' | 'feature'. */
sourceOf(d: Design, route: number, key: keyof PieceOptions, at?: number): Source
```

Order, weakest first: `OPTION_DEFAULTS` → `design.options` → `route.own` → the stretch covering `at` (stretches don't
overlap: readDesign trims a later one that does) → the feature's own. Only keys in `ROUTE_KEYS` may be overridden
below the design (section 2); a key not in it found in a file is dropped by readDesign. Printer, cutting, joints,
fits and bought-or-printed stay design-wide: mating parts and the printer must agree.

**The build with overrides: build groups.** Every setting is read once per build today (`o`), and `settingsKey`
prefixes every cache key. Rather than thread a per-route `o` through 2,300 lines that a geometry agent is working in,
the build is run once per **group of routes that resolve to the same settings**, exactly as a test-print kit's
coupons are (`buildKit`: each coupon's routes as a design of their own, the design's settings with the coupon's over
them). `buildAll` gains one early branch: no overrides → the code path of today (so identical output is by
construction); else `buildGroups`:

- a stretch is a route of its own for the build (the route cut at the stretch's ends with `cutSegs`; the cut is an
  ordinary track end, as between two track pieces: ballast to sleepers is a part boundary anyway);
- routes whose track is one piece of trackwork (they share points or a crossing, or their bases overlap side by side)
  must be in one group: a switch can't be half on ballast. Where they resolve differently the group takes the
  settings of its first route in the list that has any, and a warning says so by name ("T2 and T5 are one part: both
  take T2's Ballast");
- each group is `buildAll` of a sub-design, so `settingsKey` is the group's own: the cache stays correct, and it is
  per piece: changing one route's override rebuilds that group's pieces only; every other group's keys are what they
  were. Groups' pieces are named on from each other (`uniqueNames`), overlays merged (as the kit's).

Cost: tracks in different groups are not checked against each other for "run over each other" (groups that overlap
were merged, so only tracks that merely pass near are missed: acceptable, noted in the help).

## 2. The layers, and what can be overridden in each

For each: what the build does today, what an expert may change, what stays forbidden and how it is said. "Stage"
says when (section 9).

| layer | automatic today | expert may | forbidden, and the words |
|---|---|---|---|
| **Settings** (S1) | one set for the design | `ROUTE_KEYS` per route and per stretch: `ballast`, `bottomStyle`, `sleepers`, `sleeperWidthStuds`, `sleeperGapStuds`, `curveStuds`, `undersideGrid`, `grip`, `checkRailLen/W/Flare`, `flangeway`, `flangewayDepth`, `bufferStyle` and its sizes, `bankRampAt/Studs`, `bankClimb`, `raisedOn`, label text; per points set (S5c): the points and throw groups | fits, joints, bed, bought track: "Set for the whole design: parts that meet must agree" (greyed, with that line) |
| **Ballast** (S1, S5a) | none / ballast / buddy, design-wide; width from the gauge | per route and stretch: which; S5a: width each side in whole studs, square or sloped ends, absent under a stretch | narrower than the sleepers: "The ballast can't be narrower than the sleepers (8 studs)" |
| **Sleepers** (S5a) | `ownSleeperSpots`: every width + gap from each piece's start, square to the track; solid bed under points | move one along (whole studs on the baseplate grid, any on a 'track' underside), take one out, add one, lengthen each side in whole studs, turn (curves: fan or square); share one across parallel tracks (`expert.shared`) | a gap the rails can't span (the geometry agent's sleeper-gap rule): "The rails would span 9 studs here: 6 at most"; a sleeper under a blade's moving length |
| **Rails** (S5b) | both running rails end to end; flangeway gaps at frogs worked out; which rail is cut at a crossing by the solver | start and stop a rail (a gap, an isolating cut 1 mm wide), choose which rail runs through at a frog, a rail end's shape (square, tongue) | a gap on a curve under R40 without a check rail opposite: warning, not refusal |
| **Guard and check rails** (exists + S5b) | guard rails per route (card); check rails opposite frogs, editable in Trackwork (ends, shift, off) | guard rails per stretch (from–to), one side only, flangeway width per rail; check rails added by hand anywhere | flangeway under 2.5 mm: "Wheels need 2.5 mm" |
| **Points** (S5c) | toe where the routes part, blades by radius, heel and throw bar from `switchParams`, lever by `throwSide` | blade length, heel position, throw bar position (whole studs along), lever side and place (exists), which exits are live (`drop`, exists), per-set mechanism and blade style | a throw bar under a rail of other track: said by the existing "boxed" rule |
| **Frogs** (S5b) | at each rail crossing: flangeways, wing rails, the nose | nose length, wing rail length, flangeway each way; solid or open frog | — |
| **Joints** (S2, S3) | the design's Joint at every cut; ordinary ends between track pieces | per cut: its joint (`lego`, `dovetail`, `axle`, `flataxle`, `butt`) | a joint that doesn't fit: "No room for an axle here: cut flat, held by the baseplate" (the cutter's fallback, said) |
| **Cuts** (S2, S3) | section 3 | section 3 | section 3 |
| **Studs and underside** (S1, S5a) | grid or follow; hollow with tubes along the edges, or at every corner | per route and stretch (settings); S5a: studs on or off per sleeper | a stud is never split: `studsAtCuts` stays design-wide and defaults to 'off' at a cut |

## 3. Custom cuts

**How cuts are made today** (the facts the design rests on):

- `splitTrack: 'lengths'` (the default): `planSections` (sections.ts) cuts each route square across, on whole studs
  from its start, only where its base is clear of all other track (`free`), never within 24 mm of points (`busy`);
  each piece is then **built as a track piece of its own**, with ordinary end connectors, its sleepers and studs laid
  out from its own start. So such a cut cannot pass through a stud: nothing is cut. Tables' seams are forced cuts of
  this kind already (`seamOf`: at the seam exactly, 'blocked' in points or a crossing): the precedent for hand cuts.
- Pieces whose bases overlap are one **section**, built as one body. A section too big for the bed is cut after:
  `middleCut` (a crossover across its middle, a stud-grid stepped path), `lengthwiseCut` (three tracks or more: a
  stepped path along the tracks near the bounding box's middle, `pathSplit`, clear of the points' keep-outs), then
  `bedCut` (straight `CutLine`s, cutter.ts `cutPiece`). Stepped paths run on the stud grid of the underside
  (`gridPose`), so they pass between studs; straight lines take studs off, give them whole to one side, or split
  them (`studsAtCuts`).
- Joints at a cut: every rail crossing it gets rail-end tongues (`railCrossings`, `jointKit`), the bed gets pegs and
  C-clips or axles (`pickSpots`), not within 12 mm of an earlier cut's joint (`jointsNear`).

**Hand cuts, three kinds:**

1. **Across a track** (S2). `DRoute.cuts: number[]`: whole studs from the route's start. Passed to `planSections` as
   forced joints (as a table's seam): the pieces either side are track pieces with ordinary ends. `DRoute.cutsLocked`:
   this track is cut **only** where its hand cuts are (and at table seams): no automatic lengths, no cuts where points
   begin. The card's "Keep these cuts" copies the automatic joints of the last build into `cuts` and sets the lock,
   so later edits elsewhere can't move them.
2. **Along a track's centre line, or between two tracks** (S3). `Design.expert.cutPaths[] = { id, pts: [x, y][],
   joint?, on: TwAnchor[] }`: a path in studs on the underside's grid, each run along a grid line (so stepped by
   construction: a diagonal drag is laid as stairs), from one edge of a section to another. Applied in `sectioned`
   before `lengthwiseCut`/`middleCut` with `splitOnPath` (which exists, takes any stud-grid path and makes the
   joints). `lengthwiseCut`'s limit (the middle of the bounding box, ±48 mm, full length) doesn't apply: the path is
   the user's.
3. **Dog-legged round a frog**: the same path, drawn round it. The plan shows the keep-outs (`pointsAvoid`: frogs 22
   mm, blades their whole moving length) while a cut path is being drawn, and the path snaps outside them. A
   per-cut `near: true` lets a path within 20 mm of a frog (the vendor's three-way has its frogs 20 mm from the
   centre-line cut): warned, not refused.

**What makes a cut invalid**, checked by pure functions before the build (`routecuts.ts cutProblem`, S3
`pathProblem`) and drawn red on the plan with the reason in the hint line; the build checks again and warns
("… at x, y (studs)", so it is ringed):

| fault | words |
|---|---|
| through a stud | can't be drawn: paths are on grid lines between studs; a cut across is on a whole stud of the track |
| less than 2 studs from the track's end or another cut | "A piece at least 2 studs long each side" |
| across a track, in points or a crossing, or where other track's base touches | "The cut isn't made: the track is one part with other track here (cut between the tracks instead)" (until S3: "not yet") |
| through a blade's moving length | "A blade moves here: cut before the toe or past the heel" |
| leaves a sliver (a part under 2 studs wide or 2,000 mm³) | "Leaves a sliver: move the cut 1 stud" |
| leaves a part in two bodies | "This part would be in two: the cut must run edge to edge" |
| doesn't reach an edge | "Carry the cut on to the edge of the part" |

**Automatic except where I cut.** Hand cuts are made first; every part that results is then treated as today: if it
fits the bed, done; if not, the automatic cuts (lengths, `middleCut`, `lengthwiseCut`, `bedCut`) apply to it. A route
that is `cutsLocked` (or, S3, a section locked in `expert.lockedSections`, by ident) gets no automatic joints; a part
of it that still doesn't fit the bed is cut to fit all the same (a part that can't be printed helps nobody) and the
warning says where ("a part of a track cut by hand only doesn't fit the 256 x 256 print bed at 0, 24 (studs): it's
cut again to fit (add a cut there)"). Bed-fit checks apply to hand-cut parts as to any other (`bake`'s `fits`).

**Which joint.** The design's Joint, or the cut's own (`joint`). Across-track cuts between track pieces are ordinary
track ends (no choice: that is what makes them stud-safe); a per-cut joint applies to path cuts.

**With "Long track cut into: Parts that fill the bed"** hand cuts across aren't made (as tables' seams aren't): a
warning says so. Path cuts work in both.

## 4. Vendor parts as the acceptance test

Acceptance list: the cover agent's hand-off (three-track and triple crossovers over the bed; 33 modular sub-parts;
radii under 24; about 95 sets that warn or overlap). Three cases, end to end.

**a. 'Crossover, three tracks, R104' with the reference's lengthwise cuts** (S3). Today: four sections cut across
only, 320–368 mm wide, pinned in `KNOWN`. The reference cuts along the track centre lines x = 0, ±16 between y = 28
and 52, and across at y = 16, 28, 40, 52. The template gains:

```ts
routes: [ /* as now; each through track: */ { name: 'Left', …, cuts: [16, 28, 40, 52, 64], cutsLocked: true }, … ],
expert: { cutPaths: [
  { id: 'c1', pts: [[0, 28], [0, 52]], near: true },      // the middle track's centre line (the three-ways' frogs 20 mm off)
  { id: 'c2', pts: [[-16, 28], [-16, 52]] }, { id: 'c3', pts: [[16, 28], [16, 52]] } ] }
```

Across cuts on a track inside the crossover are "one part with other track" today: S3 makes an across cut inside a
section a `CutLine` clipped to that track's base between path cuts (span), so across and along cuts compose into the
vendor's bases 0–16, detach parts 16–28 and middle sections 28–40, 40–52. Done when: every part fits 256 x 256, the
`KNOWN` entry is deleted, part count equals the reference's (declared, below).

**b. The modular R104 switch: base + detachable modules** (S2 for the cuts, S6 for the template). 'Switch R104
left' is one piece of trackwork. The vendor's base is the first 16 studs (branch at 8.85°, 1.24 over), detach 1 is
16–40 on the straight with the branch on to 15.75° at 28 along. The template:

```ts
{ name: 'Straight', …, cuts: [16, 40], cutsLocked: true },
{ name: 'Branch', …, cuts: [16.04 /* its arc length where the straight is at 16 */, 28.2], cutsLocked: true },
expert: { cutPaths: [{ id: 'c1', pts: [[-4, 16], [5, 16]] }] }   // one line across both tracks at y = 16, where they are one part
```

At y = 16 the two tracks' bases still overlap (1.24 studs apart), so the cut there is a path across the part (S3);
past where the bases part, each track's `cuts` are ordinary ends (S2). Each module is then also a template of its
own (the sub-part alone: its routes are the stretch, its ends ordinary ends), which S2 already builds.

**c. A set that warns "tracks run over each other"** (S1 + S5): 'Compact corner R40' (base + curved 45 detach). The
automatic shaping lays both tracks' sleepers through the overlap. Overrides: on the inner curve
`stretches: [{ from: 0, to: 6, own: { sleepers: 'bed' } }]` so the overlap is one solid bed as the vendor's base is;
`expert.shared: [{ routes: ['Outer', 'Inner'], from: 0, to: 6 }]` (S5a) for sleepers carried across both; and the
warning itself is silenced per place by `trackwork.points[key].force` (exists) where the vendor builds points the
solver refuses. Sets whose only fault is the warning text (the reference really does run them that close) get
`expert.accept: [{ at: [x, y], what: 'over' }]`: an expert "I mean this" mark, drawn on the plan, that turns that
one warning off there.

**Declaring "this must match the reference"** in tests: `test/reference.shared.ts`, a table per template:

```ts
REFERENCE['Crossover, three tracks, R104'] = { ends: [[x, y, heading], …],   // the library part's connexions, studs
  parts: 14,                       // printed track parts (moving parts and bought pieces not counted)
  outline: 'crossover3.json',      // optional: the part's outline polygon from the library picture, 1 stud tolerance
  fits: [256, 256] };
```

checked by `referenceSuite`: route ends match `ends` (the cover agent's `align.py` rule in TypeScript), the built
part count equals `parts`, the union of the parts' footprints covers the outline within tolerance, every part fits.

**Radii under the minimum** (R19.08, R14.68: the pass-through connector and two narrow-gauge crossing tracks). Needs:
`LIMITS.radius` min (and `planner.ts` `minRadius` defaults, `RADII`), the solver's split detection and check-rail
placement at tight radii (frog angles steepen; `switchParams` blade length has a floor), sleeper fan-out on the
inside of a tight curve (studs collide under R24 with `curveStuds: 'follow'`), flange clearance (test/flange-
clearance). It is a **separate geometry job**, not expert mode: the limit exists because the geometry was never
proved below it. Recommended shape once proved: `LIMITS.radius` min 12, plain track only below 24 (no points), with
the warning "Tighter than R24: long wagons won't take it". No expert gate: a limit is a limit for everyone.

## 5. The editor

**The switch.** There is no stored mode. A route "is expert" when it has overrides; that is derived, never set. The
editor has one **Expert tools** toggle (toolbar, remembered per browser, not in the design) that shows: the layer
filter, the card's override rows and Cuts section, the "what's overridden" highlight. Off, the plan still draws a
small mark on routes that carry overrides and the card says "Edited by hand: 2 cuts, 1 setting · Reset to
automatic" (settings are never silently in force). Why not a per-route Simple ⇄ Expert switch: it would be a second
source of truth beside the overrides themselves (what does "simple" mean on a route with cuts: ignored? deleted?);
derived state can't disagree with the data. Why not a global mode in the design: a design opened by someone else
would behave differently for a reason not visible on the plan.

**Selection and hit testing.** Typed ids: `{ kind: 'route' | 'cut' | 'cutpath' | 'sleeper' | 'rail' | 'check' |
'points' | 'lever' | 'frog', route?: string, id: string }`. One `hitTest(w): Item[]` in canvas.ts replaces the
per-kind tests (route, handle, lever, check rail), nearest first, filtered by the layer filter ("Edit: tracks / cuts
/ sleepers / rails / points"; tracks is the default and is today's behaviour). S2 adds 'cut' only.

**Drawing.** Automatic items as today. Overridden items in the accent colour (orange, as Split's preview); "Show
what's overridden" (with Expert tools) dims the rest. Hand cuts: a line across the track with a small scissors tick;
locked tracks' cuts solid, others dashed for the automatic joints (from the build's overlay).

**Reshaping a route with overrides.** Positions are studs from the route's start, so:

- move, turn, mirror, copy: nothing to do;
- turned end for end (`reversedRoute`): `at → L − at`; split: each side keeps its own, the second's less the split
  point (a cut exactly at the split is dropped: the split is the joint); join: the second's shifted by the first's
  length;
- a segment reshaped by a handle or a card field (`changed()` in main.ts compares each route with what it was): an
  item stays in its segment at the same distance from that segment's start (so lengthening the straight before a
  curve doesn't walk a cut into the curve); past its segment's new end it goes to that end; if its segment is gone
  it keeps its distance from the route's start;
- an item whose place is gone (past the route's end, or its route deleted for `expert` items) is an **orphan**: kept,
  not built, listed in the card ("1 cut is past the end of the track: Re-attach at the end · Delete"). Nothing is
  dropped silently.

**Undo.** One step per action (a cut added, moved, deleted; lock toggled; reset). Number fields coalesce within a
second, as every field does (`coalesceNext`).

**The card.** A section per layer in the sectioned card (cardsections.ts): **Cuts** (S2): the list (studs from the
start, a field each, ×), Add a cut (then click the track), Keep these cuts (lock), Automatic cuts (reset).
**Settings on this track** (S1): the override row that Gauge already has (`overrideRow`): value in force · "Design
default" when unset · "Use the design default".

**Connections** (S4). Derived, not stored: two tracks are connected where an end of one lies on an end of the other
in line (within 0.01 stud and 0.1°: `meeting`, exists), or an end lies on another's centre line in line (a branch).
Storing records would add a second truth that can go stale (routes renamed, pasted, edited in a file); the only
thing derivation can't say is "these touch but are not joined", which is stored: `expert.apart: [a, b][]`.

- Moving a track moves everything connected to it (the connected set, worked out at the press); Alt held moves it
  alone (and so takes it apart; it re-joins by snapping, as today).
- Reshaping (a handle, a field): what is connected beyond the changed place is carried rigidly by the change of the
  route's end pose. If the carried set is also connected back to the part that didn't move (a closed loop), the
  loop can't stay closed: the reshape is allowed, the far connection opens, and the hint says "Opens the joint at
  T7's end" before the mouse is let go (drawn as an open-joint mark).
- Detach: Alt-drag, or "Take apart" in the selection bar (adds to `apart`).
- Selection: double-click selects the connected set.

## 6. Dual gauge splitting into its gauges

**What exists.** Dual-gauge plain track (third rail or centred four-rail), crossings, 'Dual gauge switch R40
left/right' (both gauges through a standard-gauge R40 switch: the third rail runs on through points whose branch
leaves away from it, base.ts `thirdRailAt`, network.ts cutting the sprung plate back), 'Dual gauge turnout R36 …'
and 'Dual gauge switch R36, narrow gauge branch …' (drawn as separate routes), the 'Dual gauge slide' templates.
The solver **refuses** points of a narrow gauge on dual-gauge track where they aren't built (`Split.dual: 'side' |
'centre'`, solver.ts `onDual`): those are the missing cases.

**Where it sits: simple-mode geometry.** A narrow or standard route branching off a dual-gauge route should become
the right points automatically; expert overrides (blade length, which rail is cut) come on top like for any points.

**Job description (for a geometry agent; not built here).** Make the solver's refused `dual` splits build:
1. *Standard gauge leaves, narrow carries on* (and the mirror): the standard branch's rails cross the third rail: a
   frog on the third rail with its flangeway and a check rail on the shared rail; blades for the standard gauge only.
2. *Narrow gauge leaves to the shared-rail side*: narrow blades (one on the third rail, one on the shared rail),
   no crossing of the far standard rail.
3. *Narrow gauge leaves away from the shared rail* ('side'): its outer rail crosses the far standard rail: a frog
   there, check rails both gauges.
4. *Centred narrow gauge leaves* ('centre'): two frogs.
5. *The split proper*: one dual route ending where a standard and a narrow route start (no moving parts when the
   narrow gauge keeps the shared rail: a "slide" is only needed to change which rail is shared).
Each: the solver emits the split with which rails cross which; `planPieces`/`networkSplits` build blades at each
route's own gauge (mixed-gauge points exist: `ownGaugeSwitch`); templates for every hand; assembled, flange-
clearance and printable tests; no supports; radii R36 and R40 first, then any. Reference: the vendor's dg turnout
left/right (ends in the library) for case 1 and 2.

## 7. Performance

- No overrides: the one extra cost is reading `DRoute.cuts` (nothing) and one `some()` in `buildAll`.
- A hand cut changes `secplan`'s key and the keys of the sections whose pieces changed (their sub-routes are in the
  key); every other section is found in the cache. Routes' `cuts` are **not** on the solver's `Route` (they would be
  in `netKey` and rebuild the whole network): the build takes them from the design beside it, by place.
- Setting overrides: per group (section 1).
- Budgets: the templates showing expert features get entries in `BUDGET` (test/templates.shared.ts); the
  perf-guard tests cover them as every template (cold and warm).

## 8. Tests

- **Identical when unused**: every template and saved design builds the same pieces (names, volumes, triangle
  counts) before and after each stage (recorded with a throwaway script against origin/main; the four heaviest left
  to CI's own suites).
- **Property: apply → reset = automatic.** For each override kind: build A; add the override, build; remove it,
  build B; A and B byte-identical (STL bytes). And apply twice = apply once.
- **Pure functions**: `resolveOptions`/`sourceOf`; `cutProblem`; `followCuts` (reverse twice = same; split then join
  = same; reshape keeps segment and offset; orphans kept).
- **readDesign / limits**: old designs unchanged; malformed overrides dropped; cuts rounded to whole studs, sorted,
  de-duplicated, clamped to 0..2000.
- **Cuts are printable**: a hand cut never passes through a stud; both parts are one body each, print without
  supports, and go together (test/assembled.shared.ts).
- **Reference**: `referenceSuite` (section 4).

## 9. Stages

Each leaves main green and ships something usable.

| | scope | the user sees | tests | size |
|---|---|---|---|---|
| **S2** (first) | `DRoute.cuts`, `cutsLocked`; routecuts.ts; planSections forced joints; card section, Add a cut on the plan, cut marks; template | "Cut this track here", "Keep these cuts" | routecuts, sections, design-read, assembled + printable for the template, identical-when-unused | ~500 lines |
| **S1** | overrides.ts (`resolveOptions`, `ROUTE_KEYS`), `DRoute.own`, `buildGroups`, the card's override rows for ballast, sleepers, sleeper sizes, underside | a track on ballast beside one on sleepers, in one design | overrides, design-read, apply→reset identical, template, budgets | ~600 lines |
| **S1b** | `DRoute.stretches` (from–to), plan highlight, card list | "ballast from here to here" | same | ~300 |
| **S3** | `expert.cutPaths`, path drawing on the grid with keep-outs, `splitOnPath` in `sectioned`, across cuts inside sections, section lock; un-pin the three-track crossovers in `KNOWN` | cuts along and between tracks; the monster crossover fits the bed | pathProblem, assembled-crossover3 clean, reference part count | ~900 |
| **S4** | connections (derived), move and reshape carry, `expert.apart`, Alt, double-click | joined tracks stay joined | pure connected-set and carry tests, browser smoke | ~500 |
| **S5a** | sleepers and ballast per feature, shared sleepers | move, add, remove sleepers | geometry agent's span rule, apply→reset | ~700 |
| **S5b** | rails, frogs, guard and check rails per feature | rail gaps, which rail is cut | flange clearance | ~900 |
| **S5c** | points: blades, heel, throw bar, per-set settings | per-switch settings | switch suites | ~700 |
| **S6** | vendor modules and the remaining sets as templates, `referenceSuite` | the 33 modules, the ~95 sets | reference | data, ~1500 |

**Why cuts before settings.** Cuts across a track needed one new argument to `planSections` (the tables' seams had
already cut the path) and nothing in the build's settings plumbing; they are the most asked-for concrete thing; and
route-owned storage, the follow rules and the card section they bring are the pattern S1 reuses.

## 10. Decisions for Aaron (each defaults to the recommendation)

1. **No stored mode; one "Expert tools" toggle.** A route is expert when it has overrides. Recommended (section 5).
   Alternative: a per-route switch in the card.
2. **Connections are derived from tracks that meet**, with Alt to move one alone and a stored "taken apart" list;
   not explicit connection records. Recommended.
3. **Routes that are one part share one set of part-level settings** (the first route's with overrides wins, with a
   warning), rather than refusing the override. Recommended.
4. **A cut across a track is always an ordinary track end** (never a tongue joint through a body), so it can't pass
   through a stud and the pieces are standard pieces. Recommended; a per-cut joint only for path cuts.
5. **Radii under R24 are a geometry job for everyone**, not an expert-only relaxed limit. Recommended.
6. **Gauge stays where it now is** (design default + per route, done); the same "design default → this track"
   pattern is the answer to settings clutter: with S1 in, the Ballast and Sleepers groups can show "3 tracks have
   their own" and the per-switch groups move to the points' own card in S5c. Recommended.

## 11. State

(kept current by whoever builds a stage: what is built, what is next, traps)

- Design document: this file.
- **S2 is built: hand cuts across a track.** `DRoute.cuts` (studs from the start) and `cutsLocked`; pure part
  `src/app/routecuts.ts` (clean, problems, reverse, split, join, follow a reshape, lost cuts); build side
  `src/app/handcuts.ts` (cuts by place on the ground, mapped onto whatever routes the build cuts into pieces) and one
  argument to `planSections` (`hand`: forced joints as a table's seam; `blocked` says which weren't made); in build.ts
  only `sectioned` (the plan's key and warnings, `overlay.joints`) and two lines in `buildOne`. Editor: the card's
  "Cuts into parts" section (a field per cut, ✕, Only these cuts, Add a cut… then a click on the track, Keep the cuts
  it has now, Automatic cuts), orange lines on the plan (dashed while the app may add its own), `followHandCuts` in
  main.ts `changed()`. Templates (Features): 'Straight cut into parts by hand', 'Curve and straights cut into parts by
  hand'. Tests: test/routecuts.test.ts, test/handcuts.test.ts.
- **S3 is built: cut paths along and between tracks, and across-cuts selected and dragged on the plan.**
  `Design.expert.cutPaths[] = { id, pts, joint? }` (studs on the plan). Pure part `src/app/cutpaths.ts`: `cleanPaths`
  (readDesign), `gridPath` (a path laid on the build's stud grid, a slant as steps of 2 studs or more), `pathProblem`
  (before the build: a run under 2 studs between turns, crossing itself, under 2 studs beside another path, down a
  rail, through a blade's moving length, within 2 studs of a frog), `moveCorner`, `sharedMove` + `pathTracks` (a path
  goes with the tracks within 12 studs of it when they all move, turn or mirror together; else it stays). Build side:
  `handcuts.ts designPaths` (the paths on the grid in mm, the impossible ones left out with why), `geom/pathsplit.ts
  cutOnPaths` (every path cuts every part it runs through from edge to edge, again after the others, so a path from
  one cut to another works; joints along its runs as a stepped cut's, `pathJoints`; refused there: ends inside a
  part or short of its edge, a sliver, a side in two bodies). In build.ts: `sectioned` (the paths that
  reach a section are in its key and cut its body before any automatic cut; parts they leave are cut again only if
  still over the bed), `switchByHand` (a lone switch's base, built by `buildSwitches`), the warnings and
  `overlay.pathsNot` at the end of `buildOne`, `overlay.cutting` (grid, rail offset, blades and frogs: what the
  editor draws and checks against). Editor: the Cut paths panel (Add a cut path…, each path's Joint and ✕, why one
  wasn't made), canvas.ts (clicks snapped to grid corners, Enter ends, Backspace takes a point back, Esc cancels;
  click selects a path or an across-cut, drag a corner, a whole path, or an across-cut along its track; Delete;
  one undo step each), `followCutPaths` in main.ts `changed()`. Templates: 'Crossover, three tracks, R104' (cut
  by hand to fit the bed: its pin is out of `KNOWN`), 'Switch R104 left|right, base and detachable modules' (the
  kit's base, detach 1, detach 2, track terminator). 'Modular triple crossover R40' is still pinned: see the traps. Tests:
  test/cutpaths.test.ts (pure), test/templates-cutpaths.test.ts (the modules against the library's ends, studs,
  identical without paths, a moved path, what's refused), test/cutpaths.shared.ts (no stud cut: run by
  `goesTogether` on every design with cut paths).
- **How S3 differs from sections 3 and 4 above** (decided while building): (1) there is no `on: TwAnchor[]` on a
  path and no `near` flag: which tracks a path goes with is worked out (`pathTracks`), and the frog rule is one
  number (`FROG_CLEAR`, 2 studs: the kit's centre-line cuts are 2.5 from the three-ways' frogs). (2) An across cut
  inside points or a crossover is not a `DRoute.cuts` entry turned into a clipped `CutLine`: it is drawn as a path
  across the part (the card's across-cuts stay ordinary track ends only). (3) The kit's "detach 1" of the R104
  switch ends square across at 28 studs, and from there the straight is cut along its centre line (detach 2 and the
  track terminator): the library's 15.75° end of the branch there is its logical end, not the cut. (4) Path cuts are
  made only with Long track cut into: Track pieces (as across-cuts); the other way of cutting says so. (5) With
  baseplate edges set, a section cut by hand paths is not cut again at the baseplates' edges. (6) No
  `expert.lockedSections`: a part left by hand paths is cut again only when it doesn't fit the bed.
- **S1 is built: settings of a track's own.** `DRoute.own` (routeown.ts: `ROUTE_KEYS` = the part keys `ballast`,
  `sleepers`, `sleeperWidthStuds`, `sleeperGapStuds`, `curveStuds`, `bottomStyle`, `undersideGrid`, `grip`,
  `legoTrack`, and the track's own `bankRampAt`, `bankRampStuds`, `bankClimb`; their labels, choices and ranges held
  to settings.ts by a test; `cleanOwn` in readDesign, `clampOwn` in clampDesign). Pure part `src/app/overrides.ts`:
  `resolveOptions` (defaults → design → route → feature; other keys ignored, `ignoredOwn` says why), `sourceOf`,
  `liveOwn` (an own value equal to the design's is none), `partsOf` (one part: beds within `PART_MARGIN`, 16 mm, of
  each other, which takes in points and crossings, and a track passing within a lever's reach, `LEVER_REACH`, of where
  two others meet in points or a crossing; tracks joined end to end in line are two parts unless dual gauge or
  their gauges differ), `partGroups` (each part takes its first track's own, warned by name; parts that come out the
  same are one group), `inForce`/`inForceAll` (the plan and the card). Build: `trainBuild` in build.ts picks
  `buildTrain` as ever when no track has part settings of its own (identical output by construction), else
  `buildGroups`: each group a sub-design (its tracks with their part own taken off, `withoutPartOwn`; the group's
  settings as its options; the cut paths drawn by its tracks), its own `settingsKey`, so a track's own changed
  rebuilds its group only; parts numbered on across groups; overlays merged (the cut-path keep-outs of every group).
  Bank ramps need no group: `bankRolls` reads the track's own. Editor: the card's **Bed and underside** section (a
  row each, the Gauge row's pattern: a choice whose first entry is "Design default: …", the design's said under a
  value of its own with Use the design default; greyed with the Settings panel's reason where it can't apply, or
  "one part with T2" where the track takes another's), Bought track under Cuts into parts, the ramps under Shape on a
  track with a banked curve; Settings says which tracks have their own of a setting; the plan draws each track's
  ballast and sleepers as in force. Templates (Features): 'Double track, one on sleepers, one on ballast', 'Station track on a
  solid bed, the line beyond on sleepers' (not ballast against none along one line: ballast lifts the track a plate, and
  `ballastSteps` warns where two tracks joined end to end aren't as high as each other). Tests: test/overrides.test.ts (pure), test/overrides-build.test.ts (each group is
  the design's build with its settings, byte for byte; reset is byte-identical; the part rule; bought per track).
- **S1b is built: stretches of a track with settings of their own.** `DRoute.stretches[] = { from, to, own }` (whole
  studs from the track's start; `own`: the part keys but for bought or printed, `STRETCH_KEYS`). Pure part
  `src/app/stretches.ts`: `cleanStretches` (readDesign: in order, none over another, at least 2 studs),
  `liveStretches` / `lostStretches` (as built: an end under 2 studs from the track's end or the stretch before is taken
  there; one past the end is kept, said, not built), `stretchProblem`, reverse / split / join / follow a reshape
  (`routecuts.ts alongAfter`, which `followCuts` now goes by too), and `expandStretches`: the design the build builds,
  each track with stretches cut at their ends by `splitRoute` (so what's on the track goes with its piece: hand cuts,
  hand edits, ends, heights, banks), every piece a track with the settings in force on it as its `own`, named for
  where it is ("Main (12 to 20)"; the first keeps the track's name). Build: `buildAll` builds the expanded design
  (`buildWhole` is the build as it was) and says the plan's trackwork of the design's own tracks again
  (`TrackworkItem.routes`); with no stretches the design is passed on as it is (the same object: identical by
  construction). From there S1 does the rest: pieces are tracks with their own, joined end to end in line, so two
  parts; inside points or beside other track the part rule applies and the warning names the piece. Editor: the
  card's Bed and underside has **Stretches with their own** (From, to, ✕, a row per setting whose first entry is "As
  the track: …", Add a stretch), the plan draws ballast and sleepers per piece and an orange line down a selected
  track's stretches, `followOwnStretches` in main.ts `changed()`. Template (Features): 'Track on sleepers, a stretch
  of it on a solid bed'. Tests: in test/overrides.test.ts and test/overrides-build.test.ts (no new files: the shards
  stay as they were).
- **How S1b differs from section 1:** (1) `resolveOptions` has no `at`: the place is resolved by cutting the track
  (`expandStretches`), then per piece. (2) Stretches aren't placed or dragged on the plan (numbers in the card only).
  (3) A stretch's one-part lock isn't shown on its rows: the build's warning says it, by the piece's name. (4) Ballast
  beside none is a step of a plate in the rails (3.2 mm, 6.4 with the buddy layer): said in the card and the help,
  not warned by the build.
- **S1 and S1b as landed (2026-11-11).** Checked: tsc and eslint clean; the identical-output baseline over the 303
  templates and 3 saved designs that have none of this (the four heaviest left out) against main: 306 the same (names, triangles, volumes, vertex hashes, warnings: 304 as at
  d3edd5d, and the two dual-gauge R36 branch switches that 1beba2c changed as at 1beba2c), 0 different, cold 872.3 s
  before and 674.6 s after (a shared machine: noise);
  test/overrides.test.ts and test/overrides-build.test.ts (each group is the design's build with its settings, byte
  for byte; a track's own or a stretch taken off again is byte-identical; the part rule; bought per track), shards,
  coverage, templates-features and assembled-features with the three new templates, the browser smoke test. Found
  on the way and put right: the plan's click on a track's band looked as far as the widest ballast there is, and so
  found a route's end before a narrower track's band near it (the smoke test: now as far as each width in turn);
  ballast against none along one line is a step of a
  plate (warned, `ballastSteps`); 'Double track, one on sleepers, one on ballast' has 17 edges shared by more than
  two triangles, as its two tracks have alone (pinned in `EDGES`). Its budget (25 s) is not from CI's log yet. 'Station track on a solid bed, the line beyond on sleepers' has 5 such edges
  (pinned at 7). **Not this stage's, found on the way:** a straight joined onto the end of 'Left switch (LEGO)''s
  branch (x -12.955183, y 32.692665, heading 22.5) runs into switch-base2 by 2.61 mm3 at the right rail (-84.2,
  268.8, 6.0), built in one go with no settings of its own too (track pieces or not): so there is no template of a
  siding with its own settings straight off a switch, and it wants a geometry look.
- **How S1 differs from section 1:** (1) no stretches yet (`at` is not an argument of `resolveOptions`: S1b adds it
  with `DRoute.stretches`). (2) The first set is the reviewed table's cheap ones (above); check rails, flangeways,
  buffer stops, `raisedOn` and labels stay design-wide. (3) The bank keys are per track, never a part's (they shape
  the track's own heights, not a part's body). (4) Groups aren't shared out to helper workers (`mayHaveJobs` is false
  with part settings of a track's own: a job's result would be kept under another group's settings key): a big design
  with per-track settings builds in one worker. (5) Monorail beams are built once, beside all the train track, as
  before. (6) The part rule's warning: "T2 and T5 are one part (they meet in points or a crossing, or lie side by
  side): both take T5's Ballast".
- **S4 is built: connections between tracks.** Derived, not stored. Pure part `src/app/connections.ts`: `joints`
  (every end that lies on another track's centre line, in line with it there, within 0.05 stud and 0.5°, the numbers
  `splitmerge.ts meeting` goes by: on its end, where the two run on or part as points do, or part way along it, a
  branch off its side; a narrow-gauge end on dual-gauge track where that track's narrow gauge lies, `gaugeMeet`; never
  monorail with train track; tracks that only cross aren't joined), `connectedSet` (through others; not through
  joints taken apart), `planCarry` / `applyCarry` / `openedBy` (what a reshaped track carries: below), `carryChange`
  (the same for a change typed on a card), and the taken-apart list `Design.expert.apart: [a, b][]` (route names;
  `cleanApart` in readDesign: pairs of routes there are; `setApart`; `pruneApart`: a pair that no longer touches is
  forgotten at the next finished action, so put together again they're joined as any two tracks; `renameApart`,
  `splitApart`, and a merge, in splitmerge.ts). **Move:** a drag, the arrow keys, Mirror and Turn take the connected
  set along (worked out at the press; a locked track in it holds the move, and the hint says so); Alt held while
  dragging moves the selection alone, the joints it leaves ringed in red, "Took A apart from B" said when it's let go
  (nothing is stored: they no longer touch). **Reshape** (an end or a handle dragged, a handle nudged by the keyboard,
  a number, Flip or ✕ in the card's Shape, Start x, y and Heading in its Place): the track has a fixed end and a place
  the change begins; what's joined to it before that stays; what's joined past it goes with its joint's place on the
  track, turned and moved as that place is (the far end's group first; a branch stays on its track: in the changed
  piece at the same distance from that piece's start, past it as much further on as the piece grew, on a tail laid
  anew at the same distance from the fixed end, the new end at most); worked out from where everything was at the
  press, so there's no drift and Alt (alone) or Esc puts it back exactly. Tracks reached from both sides (a loop)
  stay, and the joint at the changed side opens: the hint says "Opens the joint between T7 and T1" while the mouse is
  down (both ends ringed in red) and "Opened the joint …" after. The carried tracks aren't snapped to, nor guides
  taken from them. **On the plan:** a dot at each joint, an orange ring with a bar where two were taken apart, a
  small ring on an end joined to nothing (not a buffer stop's); the legend's joint row hides them. A click on a
  joined end selects the joint (ringed), and so does selecting just its two tracks (a branch's joint is under its
  points' mark, which takes the click): **Take apart** / **Join** in the selection bar (one undo step each). A
  double click selects the connected set. What's on the carried tracks goes with them with no code of its own: hand
  cuts, stretches and own settings are the routes', hand edits go by their anchors (`followTrackwork`), a cut path by
  `sharedMove` of its tracks (they now all move). Speed: the joints are worked out when the tracks change (kept by a
  key of their places and shapes), the connected set and the carry plan once at the press; a mouse move applies the
  plan and checks the watched joints only. Measured on 150 tracks (Chrome, this machine): the mouse-move handler 0.1 to
  0.3 ms before and after, whether one track moves, a chain of 15 or one net of all 150; a redraw 3.7 ms before, 3.6
  after; a redraw in the middle of a drag 4.7 to 5.1 ms before (one track moving), 5.9 to 7.9 with a chain of 15
  carried, 21 with a net of 150 carried, which is what dragging 150 selected tracks cost before (19: each moved track
  is traced again); finding the joints of 150 tracks 0.7 ms. Tests: test/connections.test.ts (joints: chains, either way drawn,
  branches off straights and curves, points, a loop, crossings and near misses, monorail, dual gauge; apart: kept,
  pruned, renamed, split, merged, read from a file; carry: exact places, there and back, from either end, branches,
  a loop, a locked track, the card's changes, and that hand edits and cut paths follow), the browser smoke test's
  "joined tracks" step. Landed as 194017c (the smoke step failed on CI: the trap below) and fcdc081 (CI green).
- **How S4 differs from section 5:** (1) the tolerance is `meeting`'s (0.05 stud, 0.5°), not 0.01 and 0.1°: one rule
  for Merge and for joints. (2) Two tracks starting at one point the same way (points drawn as two routes, as the
  switch templates are) are joined, as a branch off the side is. (3) In a loop the rest stays where it is and the
  joint at the **changed** side opens, rather than the rest swinging round and the joint at the far side opening:
  either way one joint opens, and this way only the track being reshaped moves and the gap is under the pointer.
  (4) `apart` is per pair of tracks, not per joint: two tracks that meet twice (an oval of two) are taken apart at
  both. (5) Alt+drag stores nothing: tracks that no longer touch aren't joined; `apart` is only what Take apart
  writes, for tracks that still touch. (6) Alt with the arrow keys isn't a thing (the browser's own keys): take the
  joint apart first. (7) Dragging an end that is itself joined to another track takes that track along (it is "what
  is joined past the change"): hold Alt to pull the end off it.
- **S6 is begun: the modular kits as templates** (2026-11-11). Each kit is the whole piece of trackwork cut by hand
  paths into its modules (src/app/templates-ref-kits.ts; the R104 switch's, three-way's and double slip's in
  design.ts): 'Three-way R104, base and detachable modules' (base triple, detach 1 triple, the two triple detach 2),
  'Double slip R104 left|right, middle and detachable sections' (two detach sections of 16 studs and the 8-stud
  middle), 'Double crossover R104, bases and detachable modules' (four bases, four detach 1, four track terminators,
  the middle), and the compact R40 switch's base with each of its five detachable sections, each hand ('Switch R40
  left|right, compact base and standard | short | curved 45° | curved 90° section', 'Yard switch R40 …, compact base and
  rail yard section'). test/templates-kits.test.ts holds each kit's modules to the library's ends (`KITS`: the
  `MODULES` pattern, with a width where a module's ends are on its neighbour's edge too) and the R104 switch's points
  and lever to the library's base (design.ts `r104Work`: toe 16 mm on, lever 7 studs out and 5 in).
  **Where a kit differs from the maker's, and why:** a cut path is on the stud grid, so the compact R40 base ends
  square to the straight track at 16 studs (the maker's joint on the branch is square to the branch, 0.7 studs
  sooner), and the double slip's sections meet square to the straight track 4 studs from the crossing (the maker's
  are square to the line between the two tracks, 11.25 degrees off: stepped, the path would run down a rail); the
  double crossover's two middle sections are one part (they meet where the crossovers cross: through the frogs);
  on sleepers a compact detachable section's two tracks aren't joined where they've parted (two parts).
  **Not templates, and why:** (1) a module alone (a base, a detach 1, a detach 2 without the rest). Two faults, both
  with the routes of the module drawn on their own: a track end's connector keeps its studs where another track's
  rail runs over them (two tracks ending side by side, 1.2 to 3.8 studs apart: 'Switch R104 base' = a 16-stud
  straight and an R104 curve of 8.85 degrees from one toe: "track1's stud at -28.0, 124.0 is run into", the
  straight's end connector's stud under the branch's left rail; the same at 3 studs apart on the compact R40 base
  and at the start of a detach 2), which is the end connectors' geometry (switch/base.ts `fullEndpoint` at
  `plan.endPoses`); and a detach 1 alone is two tracks side by side with no points, which the build warns of
  ("tracks run over each other"): it wants the mark of section 4c (`expert.accept`), which isn't built. (2) The
  double slip crossover and its variants, and the double slip monster crossover: four R104 double slips whose
  diagonals run on into each other and cross between the tracks. They build (23 s), but the four sets of points
  round that crossing have their levers in the way of the other diagonal ("the lever of the points at 8, 0 is in
  the way of a train on another track"), two sets' plates lie 45 mm3 in the next slip's bed (the beds at two
  heights of network.ts `bedClear`, between slips here), a sprung blade has no lip, and the middle (the kit's two
  crossover adapters, which meet at the crossing: through its frogs) is 272 mm wide. The maker's adapters have no
  levers on those four sets. (3) The compact R40 "perpendicular" section and its 3T sets, and the T-junction R40
  R56: not tried.
- **The editor's side of section 5 is built: typed selection, stretches on the plan, joints in the Trackwork panel,
  the Expert tools switch, the Pick list.** Pure part `src/app/items.ts`: `Item` (the typed ids: `route`, `table`,
  `cut` (route, k), `cutpath` (id), `stretch` (route, k), `joint` (a track's end, or its two tracks)), `hitItems` (the
  one hit test for the expert kinds, each by its shape: a cut a line across its track, a path its runs and, selected,
  its corners, a stretch its band and its two ends, a joint its place; the smaller thing first, so a cut on a stretch
  can be picked, then the nearest), `itemLabel` / `jointWhere` (what each is called), `alongBeyond`, `dragStretchEnd`,
  `dragStretchWhole`, `newStretchAt` (where a dragged stretch may go, and the words for why it stopped), `byHandNote` /
  `designByHandNote` / `EXPERT_SECTIONS` (what the Expert tools switch hides, and what is said meanwhile), `PICKS` /
  `picks` (the Pick list). **Selection** (canvas.ts): the tracks and tables as ever, and beside them one `selItem` (a
  cut, a cut path, a stretch or a joint; `items()` gives the lot); `hitTest` is what a press, the pointer's shape and
  the hover mark go by, in this order: a handle, a lever, points or a check rail's end, a corner or end of the selected
  item, a track's end, then (Select) a cut, cut path, stretch or joint, a table's name, a track. The selection bar
  says what the item is and has only its buttons (`#selbar.item`); its card (`#itemcard`, over the routes' cards) has
  its numbers to type (a cut's studs, a stretch's from and to, a path's corners: `setPathCorner`), Delete, a joint's
  Take apart or Join. Delete takes it out, the arrow keys move it a stud (Shift: eight; a cut or a stretch along its
  track the way the arrow points, `nudgeItem`), Esc lets go; one undo step each. **Stretches on the plan:** a click
  on a stretch of the selected track selects it (its track stays selected; the track's handles are away meanwhile),
  a drag moves it or one of its ends on whole studs, held at the track's ends and the stretch beside it with why said
  in the hint line and by the pointer; Add a stretch… (the card) then a press and drag along the track lays one in
  the room there; the card's numbers follow (`host.live`). **Joints:** a row each in the Trackwork panel (Joints
  between tracks: the two names, where, joined or taken apart; hover rings it, a click selects it, Take apart / Join
  in the row), from the design's joints as they are (not the build). **Expert tools** (the routes panel's heading;
  `btd-expert` in localStorage, off to start with): hidden, a card has no Bed and underside, Cuts into parts or own
  bank ramps, the Cut paths panel is away unless the design has paths, and a click takes no cut or stretch (they stay
  drawn); a track with any of it says "Has 2 cuts by hand, 1 setting of its own, 1 stretch" with Show. **Clicks pick**
  (the legend, with the tools shown; `btd-pick`): Everything, or one layer (tracks and tables; cuts and cut paths;
  stretches, then every track's; joints, then a click on a joint selects it, a branch's too; points, levers, check
  rails); in Select only. Tests: test/items.test.ts (the hit test, the names, the drags held to what `stretchProblem`
  takes, the switch's notes, the list), five steps in the browser smoke test.
- **How that differs from section 5:** (1) the selection is the tracks and tables plus one item, not a list of
  items of any kind: nothing yet needs two cuts selected at once. (2) Ids are a track's place in the list and the
  item's place in the track's list, not names: they are let go of whenever the list changes under them (undo, a
  track deleted, a card's ✕). (3) The switch is in the routes panel's heading, not the toolbar: the toolbar has no
  room left at 1440 px. (4) The Pick list's default is Everything (what a click took before), not tracks only; its
  kinds are the ones there are (no sleepers or rails yet). (5) Hidden, the card says "Has …" with Show, not "Edited
  by hand … · Reset to automatic": there is no reset of everything at once. (6) "Show what's overridden" (dimming the
  rest) isn't built. (7) Joints are selectable with the tools hidden too (joined tracks are simple mode's).
  Speed, 150 tracks (Chrome, this machine, a third with a cut and a third with a stretch): the
  mouse-move handler while hovering 0.2 to 0.3 ms before, 0.3 to 0.4 after (the one hit test also looks for a
  track's end and a table's name under the pointer, which the pointer's shape didn't go by before; with nothing
  near, a track is looked for once); while dragging a track 0.2 to 0.4 ms before, 0.2 to 0.3 after; a redraw 5 to 7
  ms before and after (the machine was busy: the redraw alone read 4 to 11 ms from run to run).
- **Next, in order:** (1) the double track's budget from CI's log (test/templates.shared.ts); a group's build told of the other groups' track at its ends, so a track joined onto points
  can have its own; (2) S1 more keys (buffer stops per end; labels per part); (3) then S5/S6 (the other kit
  modules as templates: the same three kinds of path cover them; `test/templates-cutpaths.test.ts` `MODULES` is the
  pattern for checking a module against the library's ends). Left from S3: the keep-outs are drawn only while a path
  is being drawn. Left from the editor's side: "Show what's overridden"; several items selected at once (a box round
  cuts); the Pick list's kinds for S5 (sleepers, rails, ballast: add to `PICKS` and `Layer`, and a kind to
  `hitItems`).
- **Traps.** The editor: an item goes by its track's and its own place in their lists, so whatever changes those lists
  without `setSelection` (which lets go of it) must let go of it itself (`canvas.selectItem(undefined)`: the card's ✕
  on a cut or a stretch, Delete on a card). `updateSelbar` and `renderTrackwork` are set up after the first `render()`
  and `changed()`: they're called from there only once `selbarReady` / `twReady` say so (their `let`s aren't there
  yet before). A press past a track's end is no further along than its end by `nearestAlong`: a drag that must say
  "the track ends here" goes by `alongBeyond`. The expert steps of the browser smoke test set `btd-expert` (the tools
  are hidden to start with): a new step that clicks a cut or a stretch must come after "the Expert tools switch" or
  set it. S4: the plan's marks (flangeway cuts, check rails, points) are of the last build that came back, and a
  press on one of their ends is taken before a press on a track's end: right after a drag the marks can still be those
  of the middle of it, so the browser smoke test waits for nothing of them to be within 2 studs of a joint before it
  clicks it (CI is slow enough to show it; here it never did). A branch's joint is under its points' mark for the
  same reason: the two tracks selected offer Take apart instead. Lengthening a track past a neighbour on its end
  with Alt leaves the neighbour's end on the track's side: still a joint (they touch), so nothing is said to open.
  `apart` goes by route names: anything that renames, splits or merges routes must say so (`renameApart`,
  `splitApart`). S1: a track's own is read only through overrides.ts (never `r.own` in the build): `hasPartOwn` decides
  the path, and the group's sub-design has no part own left on its tracks. A lever beside points is placed clear only
  of its own group's tracks, so a track within a lever's reach of points or a crossing is made one part with them
  (`LEVER_REACH`: the reach of network.ts `nearby`; keep the two in step). Two tracks with a short one joined on between
  them are near each other only along the line (`viaOne`): not one part. The tests' defaults are not the app's (test/setup-defaults.ts: `splitTrack: 'bed'`): a template with
  hand cuts must say `splitTrack: 'lengths'` or every test build warns that hand cuts aren't made. Cuts are kept off
  the solver's `Route` on purpose (section 7). An automatic joint within 2 studs of a hand cut is left out
  (`HAND_CLEAR`), so "Keep the cuts it has now" on a track that already has hand cuts keeps exactly the parts it has.
  Cut paths: a part's file must not depend on cuts elsewhere in its piece (tested: a path moved leaves the far
  parts' bytes alone), so in `cutOnPaths` every part is `whole piece ∩ its outline in plan` (the outline worked out
  from the paths) and every path's joints are worked out once on the whole piece: cut one after another, each from
  the last, a far cut changed the triangles of long faces, and the joints came out a hair off. A path's end in a gap
  between sleepers or tracks is not "inside" the part: the cut is carried straight on, and is refused if that runs
  into the same part again. No joint is put within 10 mm of where another path meets or crosses the cut (`GAP`), or
  the later cut would slice the earlier one's peg. A track end's connector has a tab that reaches across the centre
  line: a centre-line cut through the end takes its far half off as a loose bit, so small bits a cut takes off
  another part's body are put back on it at the end (the cut goes round them); a real support (a loose bit the
  piece had before) is told apart by size and place. On sleepers a lone switch's base has no bed between the
  sleepers, so a path there gets rail tongues where rails cross it (not beside the blades) and no pegs: the parts
  are held by the baseplate (in a section, `bedAt` keeps the bed along the path's runs, as for the app's own cuts).
  Studs on a branch's slanted sleepers follow the track, not the grid, so a path on a grid line can graze one:
  `cutOnPaths` gives every stud it finds in a path's way (`findStuds`) whole to the side its middle is on and takes
  the cut round it. **Open (geometry, src/geom/studs.ts):** on 'Modular triple crossover R40' the only across line 2 studs clear of both
  frogs (17 studs along) cuts three studs on the branches' slanted sleepers, at 4.22, 16.74; 7.75, 17.10 and -8.25,
  17.10 (studs): each a whole stud in the piece, its middle 0.8 to 2.1 mm off the line, that `findStuds` doesn't
  list, so `cutOnPaths` doesn't take the cut round it. Why: its outline at mid-height has 50 points, not 48 (two
  more on one side, where another solid's edge meets its wall), and `findStuds` takes the middle as the mean of the
  points: 0.08 to 0.10 mm off, so the furthest point is 0.10 to 0.12 mm off the stud's radius, over the 0.08 allowed
  (about the outline's box's middle: 0.021). To see it: the template with `splitTrack: 'lengths'` and
  `expert: { cutPaths: [{ id: 'c1', pts: [[-24, 17], [24, 17]] }] }`: studsCut (test/cutpaths.shared.ts) says "track3:
  a stud is cut at -8.25, 17.00", "… 7.75, 17.00", "track4: … 4.22, 17.00". The same would leave such a stud to be
  taken off by `wholeStuds` at the app's own cuts. With that put right the template still keeps its `KNOWN` pin until
  it's cut along its tracks too: the two sections that cut leaves are 320 and 352 mm wide.
  A peg's socket beside a stud still follows the standing
  rule (Studs a cut goes through). The tests: no arc of a stud's circle ends on a cut face (every design with cut
  paths, in `goesTogether`), and the switch template has as many whole studs with its paths as without. A single switch is not built by
  `sectioned` but by `buildSwitches`: both take hand paths. LEGO-style tubes under a plate sit on grid corners, so a
  grid-line cut passes through tube walls (as the app's own stepped cuts always have); studs, and the studs of a
  plate below, are at cell middles, 4 mm clear.
  `cutOnPaths` asks of a part's plan only what's beside the path (does it run through, does it end inside): the plan is
  taken in within `NEAR` of the path before it's offset; offsetting the whole plan of a big piece cost 8 to 20 s of
  the three-track crossover's 59 (31 now; test/templates-crossover3.test.ts holds the paths to 1.3 times the build
  without them).
  `followHandCuts` goes by `DRoute` object identity between finished actions: anything that swaps the design's route
  objects without calling `replaced()` or `changed(true)` loses the follow for that one action (not the cuts).
