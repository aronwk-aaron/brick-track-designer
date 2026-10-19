# Brick Track Designer: plan

A web app for designing LEGO-compatible train track pieces that are hard to
model by hand: switches, crossings, double slips and whole switch fields like
TrixBrix's Monster Crossover. You draw the routes; the app works out the
special trackwork, shows the piece in 3D, splits it to fit your print bed and
exports STL and 3MF.

It is a piece designer, not a layout planner. Layout planning stays in the
Brick Layout Designer (2D, BlueBrick-compatible); this app may later import
a layout or a module from it.

## Why a new app

The parametric track in `~/Documents/openscad` (OpenSCAD, about 5,600 lines)
works, but complex trackwork has outgrown it:

- The hard part is topology, not shapes: which rails cross, where frogs,
  diamonds and points go, which points belong together, where to cut. In
  OpenSCAD that is recursive functions and `$` variables (switch.scad alone
  is about 1,900 lines and only handles routes that share one start).
- Renders take minutes per piece, so there is no live preview, and split
  sections each re-render the whole piece.
- Customizer descriptions are one line, and parameters cannot be structured.

The OpenSCAD files stay: they keep serving single pieces in the Customizer,
and they are the reference this app is tested against.

## Stack

- TypeScript, Vite, React, pnpm (same family as the layout designer's web
  app, so its file and connection code can be reused later).
- [manifold-3d](https://github.com/elalish/manifold) (WASM) for solids:
  the same kernel the OpenSCAD files are rendered with (`--backend=manifold`),
  so results can be compared mesh for mesh. Runs in a Web Worker.
- three.js for the 3D view.
- Export: binary STL; 3MF written directly (a zip of XML, one object per
  part, build items arranged per plate).
- Vitest for unit and parity tests; Playwright later for the UI.
- No server needed: everything runs in the browser and works offline.

## Units and frames

Same as the OpenSCAD files, so numbers carry over unchanged:

- Millimetres; 1 stud = 8 mm; plate = 3.2 mm.
- A piece starts at y = 0 with the track centre line on x = 0 heading +y;
  z = 0 is the bottom of the sleepers; sleeper top, ballast top and rail
  base are at z = 3.2.
- Headings in degrees, 0 = +y, positive = turned left.

## Reference geometry (from track_lib.scad and switch.scad)

| Thing | Value |
|---|---|
| Gauge | `(gauge_studs + 1) * 8` between rail centres; Ln4 (LEGO) = 40 mm |
| Rail | profile in `rail_profile()`, top at 9.6, head half-width 1.25, foot half-width 3.9 |
| Sleeper | 16 wide, gauge + 24 long |
| Ballast | top width = sleeper length, mid +16, bottom (buddy) +16 more; 2 plates thick |
| Studs | 4.8 dia, 1.8 tall, grid at 4 + 8k; track-only pieces use square sockets (stud + 0.2), never round holes |
| Flangeway | 3.0 wide, 3 deep (LEGO drawing), check rail 1.0 wide, 30 long, flared 1.5 |
| Points | throw 3, clearance 0.3 |
| End connector | rail-end tongues, coupler peg at -8 and C-clip at +8 in each end frame |

LEGO switch (measured from LDraw's 9V switch, and matched by BlueBrick's
part 2859): the branch is two R40 arcs, out to 36.87 degrees and back to
22.5, ending 12.955 studs over and 32.69 along, so one more R40 curve makes a
parallel track 16 studs over and 48 along. switch.scad calls this the
s_curve shape.

## Data model

- **Segment:** `{ kind: "straight", length }` or `{ kind: "arc", radius,
  angle }` (signed, + = left), as switch.scad's routes.
- **Route:** a start pose `[x, y, heading]` and a list of segments. Helpers
  ported from switch.scad: pose at arc length, rail point, lateral offset,
  arc length of a point, S-curve solver.
- **Piece:** a set of routes, the gauge and options (ballast, track only,
  bottom style, labels, guard rails, dual gauge), and its ends (where routes
  leave the piece, each with a connector).
- **Trackwork (derived, never stored):** for every pair of rails, where they
  meet tangentially (points) or cross (frog or diamond); check rails
  opposite frogs; flangeways; which rail pieces are fixed, which move.
- **Split plan (derived, editable):** cut lines in x and y, joint type per
  cut, the plate each section goes on.
- Saved as JSON (`.btd.json`), versioned, so pieces can be shared and
  regenerated.

## Phases

Each phase ends with its checks passing and a local commit. Nothing is pushed
without Aaron's say-so.

### 1. Spike: is the kernel good enough (a few days)

- Vite + React + three.js app with manifold-3d in a worker.
- Sweep the rail profile along a straight and an arc; show it; export STL.
- Parity check: render the same straight and curve with the OpenSCAD files
  (`openscad-nightly --backend=manifold`) and compare: volume within 0.1%,
  symmetric difference near zero, bounding boxes within 0.01 mm.
- Measure build time for a 32-stud switch-sized piece.
- **Go/no-go:** if parity or speed fails, revisit the stack before phase 2.

### 2. Plain track

- Port track_lib: rail profile, sleepers, studs and square sockets, end
  connectors (tongues, peg, clip), rail-end print supports, ballast with its
  steps, labels.
- Straights and curves with all their options, guard rails and dual gauge
  included.
- Parity tests against the OpenSCAD regression configs (the 27 curve,
  straight, buffer and holder configs) for every option.
- First UI: pick a piece, set options, 3D preview, STL export.

### 3. Route editor and trackwork solver (the core)

- Draw routes on the stud grid: add straight, arc or S-curve segments, snap
  ends to the grid and to standard positions (R40 parallel spacing, LEGO
  switch ends).
- Solver for any set of routes (not only routes sharing a start): rail
  crossings to frogs and diamonds, tangential splits to points, check rails,
  flangeways, fixed and moving rail pieces.
- 2D plan view of the result (rails, frogs, check rails) next to the 3D one.
- Unit tests: hand-checked cases (left, right, wye, three-way, 90 degree and
  22.5 degree crossings) plus property tests (no rail overlaps, every frog
  has a check rail).

### 4. Switches and crossings

- Port switch.scad's working parts: one-piece points with the spring, the
  throw slider, the lever, its stand; arc and S-curve shapes.
- Parity against the switch regression set (113 configs) for left, right,
  wye and three-way.
- New: 90 degree and angled crossings, double slip, single slip.
- Clash checks for moving parts in every position, as the OpenSCAD
  intersection suite does (points against base, throw against points,
  lever against base).

### 5. Fields and printing

- Switch fields like the Monster Crossover: several parallel tracks with
  crossovers, ballast merged across the whole field.
- Split planner in x and y: cuts between sleepers and away from frogs and
  points, joints that lock (dovetail and peg), each section within the print
  bed; editable by hand.
- 3MF export with sections arranged on plates for the bed size; part labels
  engraved underneath.
- Printability checks per section: floating islands and overhangs (the
  scripts in the OpenSCAD repo's scratchpad show how).

### 6. Later

- Import a layout or module from the Brick Layout Designer (`.bld-layout`,
  `.bbm`) and generate its custom pieces.
- Export custom parts and sets for the Brick Layout Designer (Aaron,
  2026-10-19). Each printable piece becomes a library part, as BlueBrick
  part XML:
  - a top-view sprite (PNG at the library's pixels per stud);
  - a connection point with type "rail" at every route end: position in
    studs from the sprite centre, and outward angle, taken from the
    route's end poses;
  - the hull or pick shape;
  - an author/designer line.

  A design split into several pieces becomes a set (BlueBrick's
  `.set.xml` group) of those parts, at their positions, with the
  connection preferences that let the layout designer chain them. It
  exports as a zip the desktop app's library import and the web app's
  custom parts can take. It keeps the source design (JSON) alongside, so a
  part can be reopened and regenerated. Check against the layout
  designer's own part loader and connection snapping (its parts-catalog
  tests).
- Monorail pieces.
- Elevation: ramps, bridges, supports.

## Verification

- Parity with the OpenSCAD files is the main correctness check until the app
  goes beyond them. Keep a script that renders the reference set with
  OpenSCAD and compares meshes.
- Clash checks for every moving part in every position.
- Printability checks before any export is called done.
- Geometry tests run headless in Vitest (manifold-3d runs in Node).

## Ground rules carried over

- Copy reference parts (LEGO, TrixBrix, 4DBrix) exactly first, then make them
  parametric; deviations become options with their drawbacks noted.
- Sizes and lengths users set are in studs; fit tolerances in mm.
- Track-only pieces sit on plates and bricks: compatible with the stud grid,
  square sockets.

## Open questions

- 3MF details: one object per section, or per colour (multi-material)?
- Print bed presets: which printers to list (default 256 x 256).
- Joint design between split sections: copy TrixBrix's, or ours from
  switch.scad's base splitting?
- Hosting: static site (GitHub Pages or similar) when there is something to
  show.
