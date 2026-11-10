# Brick Track Designer

A web app for designing LEGO-compatible train track pieces with complex
trackwork (switches, crossings, double slips, switch fields), previewing them
in 3D and exporting STL for printing.

How it was planned, as written at the time (not kept up to date with the app): [PLAN.md](PLAN.md),
[PHASE2.md](PHASE2.md), [PHASE3.md](PHASE3.md) and [THREEWAY.md](THREEWAY.md).

Live at **https://aronwk-aaron.github.io/brick-track-designer/** (GitHub Pages: `.github/workflows/pages.yml`
publishes the newest commit on `main` that CI has passed, never one that failed). It runs entirely in the browser:
the geometry kernel is WebAssembly, and nothing is uploaded anywhere.

```
pnpm install
pnpm dev        # the editor, at the address it prints
pnpm typecheck  # tsc
pnpm lint       # eslint: real mistakes only, no style rules
pnpm build      # the static site, into dist/
pnpm test       # solver and geometry tests
```

The editor works like laying rails in a top-down train game: on the stud
grid, click a point (or the end of a track) to start, move the mouse to see
the track the planner would lay (straights and one curve of the radius you
pick: Free, any radius and angle; LEGO radii, with 22.5-degree ends; or a
fixed radius), click to lay it and carry on from its end; right-click or Esc
stops. Drag a track's end to reshape it live (from its last curve on). Laying
or dragging onto another track's end joins the two into one track, with a
curve and a straight or an S that arrives heading into it. Free curves run
from R24 to R1000; gentler than that, R1000 and a straight. Starting on the middle of a track branches
off it: a switch. Select mode picks tracks (Delete removes them; copy, paste,
mirror and turn them); the panel on the left edits any track's numbers, lays
bought track pieces one at a time (Parts palette), sets out the tables the
layout stands on (Tables) and changes the trackwork by hand (Trackwork); the
Settings panel on the right has the pieces' settings (ballast and the
underside, the switches' mechanism and throw, check rails, the print bed and
joints, monorail); Undo and Redo, pan and zoom. Over the track the plan shows where flangeways cut the rails, check
rails, rail crossings, points (click to take them out or force them) and each
switch's lever (drag it across to swap sides; hover it to see what set its
side); below it, the pieces in 3D, which download as STL, with a list of the
parts to buy and to print, and as a parts library for a layout designer.
Templates give starting points (switches, crossings, yards, monorail): a
browser with a picture for each, in sections, with search and filters, left and
right hands on one card, and starred and recent ones kept on top.
Designs save and open as JSON, and the last one is kept in the browser. The
page can be installed and works offline once opened.

Before printing a layout, print the test pieces (Templates › Test prints) to
check the fits and the points on your printer: [docs/test-prints.md](docs/test-prints.md)
says what to print, how to put it together and what to report. Every STL zip
has a README.txt: what each file is, how to print it, how the points go together.

## Contributing

Pull requests run CI (`.github/workflows/ci.yml`): Conventional Commits
(`feat:`, `fix:`, `docs:` ...), typecheck, lint, build, the tests, a browser
smoke test (`scripts/browser-smoke.mts`) and an
OSV scan of the dependencies; every push gets a gitleaks secret scan.

## Licence

AGPL-3.0: see [LICENSE](LICENSE).
