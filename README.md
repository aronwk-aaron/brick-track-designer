# Brick Track Designer

A web app for designing LEGO-compatible train track pieces with complex
trackwork (switches, crossings, double slips, switch fields), previewing them
in 3D and exporting STL and 3MF for printing.

Early days: see [PLAN.md](PLAN.md) and [PHASE2.md](PHASE2.md).

```
pnpm install
pnpm dev        # the editor, at the address it prints
pnpm test       # solver tests, incl. parity with switch.scad's frogs and check rails
pnpm parity     # geometry parity with the OpenSCAD files (needs openscad-nightly)
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
off it. Select mode picks a track (Delete removes it); the panel on the left
edits any track's numbers; Undo and Redo, pan and zoom. Over the track the
canvas shows where flangeways cut the rails, check rails, rail crossings and
points (not built yet); below it, the printable track-only piece in 3D, which
downloads as STL. Designs save and open as JSON, and the last one is kept in
the browser.
