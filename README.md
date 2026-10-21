# Brick Track Designer

A web app for designing LEGO-compatible train track pieces with complex
trackwork (switches, crossings, double slips, switch fields), previewing them
in 3D and exporting STL and 3MF for printing.

Early days: see [PLAN.md](PLAN.md) and [PHASE2.md](PHASE2.md).

Live at **https://aronwk-aaron.github.io/brick-track-designer/** (GitHub Pages, deployed from
`main` by `.github/workflows/pages.yml`). It runs entirely in the browser:
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
pick: Free, any radius and angle; Auto, LEGO radii and 22.5-degree ends; or a
fixed radius), click to lay it and carry on from its end; right-click or Esc
stops. Drag a track's end to reshape it live (from its last curve on). Laying
or dragging onto another track's end joins the two into one track, with a
curve and a straight or an S that arrives heading into it. Free curves run
from R24 to R1000; gentler than that, R1000 and a straight. Starting on the middle of a track branches
off it: a switch. Select mode picks a track (Delete removes it); the panel on
the left edits any track's numbers, the trackwork by hand (Trackwork) and the
piece's settings (Piece options: ballast and the underside, the switches'
mechanism and throw, check rails, the print bed and joints); Undo and Redo, pan
and zoom. Over the track the plan shows where flangeways cut the rails, check
rails, rail crossings, points (click to take them out or force them) and each
switch's lever (drag it across to swap sides; hover it to see what set its
side); below it, the pieces in 3D, which download as STL or one 3MF laid out
on the print bed. Designs save and open as JSON, and the last one is kept in
the browser.

## Contributing

Pull requests run CI (`.github/workflows/ci.yml`): Conventional Commits
(`feat:`, `fix:`, `docs:` ...), typecheck, lint, build and the tests, and an
OSV scan of the dependencies; every push gets a gitleaks secret scan.

## Licence

AGPL-3.0: see [LICENSE](LICENSE).
