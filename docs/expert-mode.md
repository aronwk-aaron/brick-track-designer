# Expert mode: design and stages

Status: design agreed with nobody yet; decisions are taken here so work doesn't wait (the list for Aaron is in
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
| **Studs and underside** (S1, S5a) | grid or follow; hollow with tubes, or sockets | per route and stretch (settings); S5a: studs on or off per sleeper | a stud is never split: `studsAtCuts` stays design-wide and defaults to 'off' at a cut |

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
fits the bed, done; if not, the automatic cuts (lengths, `middleCut`, `lengthwiseCut`, `bedCut`) apply to it, unless
its route is `cutsLocked` or the path's section is locked (`expert.lockedSections`, by ident): then it is left and the
bed-fit warning says so ("track3 is 320 x 120: over the 256 x 256 bed. It is cut by hand only: add a cut or unlock").
Bed-fit checks apply to hand-cut parts as to any other (`bake`'s `fits`).

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
