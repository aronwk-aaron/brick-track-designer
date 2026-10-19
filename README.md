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

The editor: add routes (start position in studs, heading, then straight and
curve segments), or start from a template. The plan view shows the rails,
where flangeways cut them, check rails and rail crossings; the 3D view shows
the printable track-only piece, which downloads as STL. Designs save and
open as JSON, and the last one is kept in the browser.
