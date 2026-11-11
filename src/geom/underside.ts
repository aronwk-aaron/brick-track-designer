// Undersides on the stud grid, all LEGO's own design: hollow inside an outer
// wall, with anti-stud tubes at the corners between four studs (a stud by an
// edge held between the wall and a tube); a single row of studs in a channel
// with a pin between each two, as a 1 x N plate's. No socket for a stud of
// its own anywhere, square or round.
import { poseToWorld, worldToPose } from '../route/route';
import { clipNear, T, type CS, type Man, type Scad } from './scad';
import { STUD, type Track } from './track';

export const BOTTOM_WALL = 1.39, TUBE_OD = 6.51, TUBE_ID = 4.8, ANTISTUD_FIT = 0.06, POST_D = 3;

/**
 * A single row of studs' underside, as a 1 x N plate's: in the row's own frame
 * (the studs on y = 0 at lo + 4 + 8k), a channel along the row as wide as a
 * stud and its fit, each stud held between its walls, with a pin between each
 * two studs, the channel stopping a wall short of the row's ends. In plan, to
 * cut cavH deep from the bottom.
 */
export function rowUnderside(s: Scad, t: Track, lo: number, hi: number, keep: CS[] = []): CS {
  const W = s.w, pinD = STUD - t.o.studD - (t.o.antistudFit ?? ANTISTUD_FIT);
  const ch = W.CrossSection.square([hi - lo - 2 * BOTTOM_WALL, t.c.rowW]).translate([lo + BOTTOM_WALL, -t.c.rowW / 2]);
  const pins: CS[] = [];
  for (let x = lo + STUD; x <= hi - STUD + 1e-9; x += STUD) pins.push(W.CrossSection.circle(pinD / 2, 24).translate([x, 0]));
  return pins.length || keep.length ? ch.subtract(W.CrossSection.union([...pins, ...keep])) : ch;
}

/**
 * What stays solid under an end connector, in its own frame (fullEndpoint's:
 * its row of studs on y = 0 at 4 + 8k across, the end at y = -4): round the
 * peg (its neck and the dovetail it stands in) and the C-clip's socket, so
 * they keep their walls, less room for the studs beside them.
 */
export function connectorKeep(s: Scad, t: Track): CS[] {
  const W = s.w, c = t.c, studR = c.rowW / 2;
  if (!c.hasCoupler) return [];
  const studs = (x: number) => W.CrossSection.union([-4, 4].map((d) => W.CrossSection.circle(studR, 24).translate([x + d, 0])));
  return [
    // (the peg's side: its dovetail and neck to 3.6 in from the end, less room for the studs beside it)
    W.CrossSection.square([10.2, 3.6]).translate([-c.couplerX - 5.1, -4]).subtract(studs(-c.couplerX)),
    // (the clip's: its socket's wall)
    W.CrossSection.circle(3.0, 32).translate([c.couplerX, -4]).subtract(studs(c.couplerX)),
  ];
}

/** An end connector's underside (rowUnderside, solid round its peg and clip: connectorKeep), in the connector's frame. */
export function connectorUnderside(s: Scad, t: Track): CS {
  return rowUnderside(s, t, -t.c.sleeperLen / 2, t.c.sleeperLen / 2, connectorKeep(s, t));
}

/**
 * A sleeper's underside, as LEGO track's, in the sleeper's own frame (along
 * x from lo to hi, n studs wide across y about 0, its studs at lo + 4 + 8k):
 * two studs wide or more, hollow inside its wall with a row of anti-stud
 * tubes down the middle of each two rows of studs; one stud wide, a 1 x N
 * plate's channel and pins (rowUnderside). cut: the hollow, in plan (the
 * tubes left standing in it); grips: the tubes' centres.
 */
export function sleeperUnderside(s: Scad, t: Track, lo: number, hi: number, n: number): { cut: CS; grips: [number, number][] } {
  const W = s.w, fit = t.o.antistudFit ?? ANTISTUD_FIT;
  if (n < 2) return { cut: rowUnderside(s, t, lo, hi), grips: [] };
  const ha = (n * STUD) / 2 - BOTTOM_WALL, grips: [number, number][] = [];
  for (let k = 0; k <= n - 2; k++) for (let x = lo + STUD; x <= hi - STUD + 1e-9; x += STUD) grips.push([x, (k - (n - 2) / 2) * STUD]);
  const box = W.CrossSection.square([hi - lo - 2 * BOTTOM_WALL, 2 * ha]).translate([lo + BOTTOM_WALL, -ha]);
  const tube = W.CrossSection.circle((TUBE_OD - fit) / 2, 24).subtract(W.CrossSection.circle((TUBE_ID + fit) / 2, 24));
  return { cut: grips.length ? box.subtract(W.CrossSection.union(grips.map((q) => tube.translate(q)))) : box, grips };
}

/**
 * A hollow underside on the stud grid: cav is the hollow (inside its wall),
 * studs at wd(4 + 8i, 4 + 8j). 'edges': anti-stud tubes where a stud next to
 * the corner isn't wholly in the hollow (along its edges) and every 4 studs
 * inside, thin posts elsewhere (they hold the roof up without touching the
 * studs); 'all': a tube at every corner, as a LEGO plate (holds harder). A
 * stud that isn't wholly in the hollow (the wall runs across it: an edge at
 * an angle to the grid) has the wall cut away where it stands, no more: the
 * piece still goes down over it, and nothing is made to hold it. foot: all
 * the piece has down at the studs' height, in plan (the hollow's outline, a
 * rail's foot between sleepers; else the hollow and its wall); ok: is a tube or
 * post to be kept (whole, clear of the piece's other cuts). cut: what to take
 * out; tubes: the tubes and posts (in the hollow); grips: the tubes' centres.
 */
export function hollowGrid(s: Scad, t: Track, cav: CS, wd: (lx: number, ly: number) => [number, number], i0: number, i1: number, j0: number, j1: number,
  grip: 'edges' | 'all', x: { foot?: CS; ok?: (cs: CS) => boolean; skip?: (q: [number, number]) => boolean; stubs?: boolean } = {}): { cut: CS; tubes?: CS; grips: [number, number][] } {
  const W = s.w, studR = t.o.studD / 2 + 0.1;
  if (cav.isEmpty()) return { cut: cav, grips: [] };
  const deepC = new Map<string, boolean>(), nearCav = clipNear(W, cav, 4), cb = cav.bounds();
  const foot = x.foot ?? cav.offset(BOTTOM_WALL, 'Miter', 4), nearFoot = clipNear(W, foot, 4);
  const fb = foot.bounds();
  const inBox = (q: [number, number], m: number, b = cb) => q[0] > b.min[0] - m && q[0] < b.max[0] + m && q[1] > b.min[1] - m && q[1] < b.max[1] + m;
  const deep = (i: number, j: number) => {
    const k = `${i},${j}`;
    let v = deepC.get(k);
    if (v === undefined) { const q = wd(4 + i * STUD, 4 + j * STUD); v = inBox(q, -studR) && W.CrossSection.circle(studR, 12).translate(q).subtract(nearCav(q)).area() < 0.01; deepC.set(k, v); }
    return v;
  };
  const fit = t.o.antistudFit ?? ANTISTUD_FIT;
  const tubeCS = (q: [number, number]) => W.CrossSection.circle((TUBE_OD - fit) / 2, 24).subtract(W.CrossSection.circle((TUBE_ID + fit) / 2, 24)).translate(q);
  const bites: CS[] = [], shapes: CS[] = [], grips: [number, number][] = [];
  const o0 = wd(0, 0), o1 = wd(1, 0), gridTurn = (Math.atan2(o1[1] - o0[1], o1[0] - o0[0]) * 180) / Math.PI;
  const mod4 = (n: number) => ((n % 4) + 4) % 4, full = Math.PI * studR * studR * 0.97;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const sp = wd(4 + i * STUD, 4 + j * STUD), cn = wd(8 + i * STUD, 8 + j * STUD);
    if (!inBox(sp, studR + 8, fb)) continue;
    if (!deep(i, j) && inBox(sp, studR, fb) && !nearFoot(sp).isEmpty() && !x.skip?.(sp)) {
      // (the wall across this stud: cut away where the stud stands, a flat of its circle to the grid's lines as edgeGrip's.
      // Not where it's wholly under what stays solid, clear of the hollow: nothing is cut for a stud there)
      const c = W.CrossSection.circle(studR, 24).rotate(gridTurn + 7.5).translate(sp), inFoot = c.intersect(nearFoot(sp)).area();
      if (inFoot > 0.01 && !(inFoot > full && c.intersect(nearCav(sp)).area() < 0.01)) bites.push(c);
    }
    if (!(deep(i, j) && deep(i + 1, j) && deep(i, j + 1) && deep(i + 1, j + 1))) {
      // (a stud beside this corner isn't wholly in the hollow, the wall across it: a tube all the same where it stands
      // wholly in the hollow, a little clear of the wall, to grip the studs that are there (a sleeper at an angle to the
      // grid has no four studs wholly in it anywhere, and gripped nothing); else a thin post where that fits, to hold
      // the roof up for printing. Between the studs' places, it touches none)
      if (inBox(cn, -POST_D) && !nearCav(cn).isEmpty()) {
        const fits = (r: number) => W.CrossSection.circle(r, 24).translate(cn).subtract(nearCav(cn)).area() < 0.01;
        const tube = fits((TUBE_OD - fit) / 2 + 0.2), cs = tube ? tubeCS(cn) : fits(POST_D / 2 + 0.4) ? W.CrossSection.circle(POST_D / 2, 24).translate(cn) : undefined;
        if (cs && (!x.ok || x.ok(cs))) { shapes.push(cs); if (tube) grips.push(cn); }
        else if (cs && tube) { const post = W.CrossSection.circle(POST_D / 2, 24).translate(cn); if (x.ok!(post)) shapes.push(post); }
      }
      continue;
    }
    let edge = grip === 'all';
    for (let a = -1; a <= 2 && !edge; a++) for (let b = -1; b <= 2 && !edge; b++)
      if ((a < 0 || a > 1 || b < 0 || b > 1) && !deep(i + a, j + b)) edge = true;
    let tube = edge || (mod4(i) === 0 && mod4(j) === 0), cs = tube ? tubeCS(cn) : W.CrossSection.circle(POST_D / 2, 24).translate(cn);
    // (where a tube can't stand whole, a thin post if that can: it holds the roof up there, for printing)
    if (tube && x.ok && !x.ok(cs)) { tube = false; cs = W.CrossSection.circle(POST_D / 2, 24).translate(cn); }
    if (x.ok && !x.ok(cs)) continue;
    shapes.push(cs);
    if (tube) grips.push(cn);
  }
  let cut = cav;
  if (bites.length) {
    const bite = W.CrossSection.union(bites);
    cut = W.CrossSection.union([cav, bite]);
    // (stubs: and a stub of wall left between two of them, or between one and the hollow, taken out with them: a few mm
    // of wall on its own, loose where there's little over it (the low end of a banked sleeper, 1 mm thick))
    if (x.stubs) {
      const near = bite.offset(0.05, 'Miter', 4), stubs = foot.subtract(cut).decompose().filter((c) => c.area() < 8 && !c.intersect(near).isEmpty());
      if (stubs.length) cut = W.CrossSection.union([cut, ...stubs]);
    }
  }
  return { cut, tubes: shapes.length ? W.CrossSection.union(shapes).intersect(cav) : undefined, grips };
}

/**
 * Grip along a cut part's edges: where a piece was cut (for the bed or the
 * baseplates), its new edges had neither the rim nor the anti-stud tubes the
 * piece's own edges have, so the part sat loose on the plate. Adds the rim
 * round the whole of the part's outline (under its roof) and a tube at each
 * stud corner a stud in from it, wherever the part is hollow there. gp: the
 * stud grid (studs at 4 + 8k in its frame); bottom: the underside's z.
 */
export function edgeGrip(s: Scad, t: Track, part: Man, gp: [number, number, number], bottom: number): Man {
  const W = s.w, cavH = t.o.studH + 0.2;
  const roof = part.slice(bottom + cavH + 0.3), mid = part.slice(bottom + cavH / 2);
  if (roof.area() < 1) return part;
  const inner = roof.offset(-BOTTOM_WALL, 'Miter', 1000);
  // (the rim, only where it's hollow now; and 0.01 on into the walls it meets: ending exactly on a wall's face, the two
  // only touched there, along a line up the part's side: an edge of four triangles in the file, which a mesh read back
  // in can join wrongly (switch/base.ts's slider groove had the same). No further: round a clip's socket, wider at the
  // bottom than where the walls are looked at, it's that much more in the socket (0.05 put 0.1 mm3 more in the peg))
  const band = roof.subtract(inner), rim = band.subtract(mid).offset(0.01, 'Miter', 4).intersect(band);
  const bb = roof.bounds();
  const toG = (x: number, y: number) => worldToPose(gp, [x, y]).map((v) => v / STUD);
  const cs = [toG(bb.min[0], bb.min[1]), toG(bb.max[0], bb.min[1]), toG(bb.min[0], bb.max[1]), toG(bb.max[0], bb.max[1])];
  const i0 = Math.floor(Math.min(...cs.map((q) => q[0]))) - 1, i1 = Math.ceil(Math.max(...cs.map((q) => q[0]))) + 1;
  const j0 = Math.floor(Math.min(...cs.map((q) => q[1]))) - 1, j1 = Math.ceil(Math.max(...cs.map((q) => q[1]))) + 1;
  const rings: CS[] = [], bores: CS[] = [];
  // (each test against the outlines near the spot only: clipNear)
  const nearInner = clipNear(W, inner, 4), nearRoof = clipNear(W, roof, 10.5), nearMid = clipNear(W, mid, 4);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const q = poseToWorld(gp, [i * STUD, j * STUD]);
    // (a stud in from the edge: the tube under the roof and clear of the rim, but within 10 mm of the outline)
    if (q[0] < bb.min[0] - 10 || q[0] > bb.max[0] + 10 || q[1] < bb.min[1] - 10 || q[1] > bb.max[1] + 10) continue; // (nowhere near it: the first test fails)
    if (W.CrossSection.circle(TUBE_OD / 2 + 0.2, 24).translate(q).subtract(nearInner(q)).area() > 0.01) continue;
    if (W.CrossSection.circle(10, 24).translate(q).subtract(nearRoof(q)).area() < 0.01) continue;
    // (and where it's hollow: not in a pocket, nor on a tube or post already there)
    const ring = W.CrossSection.circle((TUBE_OD - (t.o.antistudFit ?? ANTISTUD_FIT)) / 2, 24).subtract(W.CrossSection.circle((TUBE_ID + (t.o.antistudFit ?? ANTISTUD_FIT)) / 2, 24)).translate(q);
    if (ring.intersect(nearMid(q)).area() > 0.5) continue;
    rings.push(ring);
    // (a thin post already there, inside where the tube goes: taken out, or it'd stand in the tube where the stud goes)
    const bore = W.CrossSection.circle((TUBE_ID + (t.o.antistudFit ?? ANTISTUD_FIT)) / 2, 24).translate(q);
    if (bore.intersect(nearMid(q)).area() > 0.05) bores.push(bore);
  }
  // (the rim clear of the baseplate's studs: a cut's edge can run anywhere across the grid, a stud half under it)
  // (each stud's circle turned half a facet, a flat side to the grid's lines: with a corner on them, the circles of the
  // row of studs next to a cut on a stud line just touched what's 2.5 from them, along a line from the bottom up)
  // (a hair bigger than the circle the piece's own underside cuts out of a wall where a stud stands across it (hollowGrid):
  // the same size, the rim put back there left a sliver thinner than paper along the circle)
  const studs: CS[] = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const q = poseToWorld(gp, [4 + i * STUD, 4 + j * STUD]);
    if (q[0] > bb.min[0] - 4 && q[0] < bb.max[0] + 4 && q[1] > bb.min[1] - 4 && q[1] < bb.max[1] + 4) studs.push(W.CrossSection.circle(t.o.studD / 2 + 0.11, 24).rotate(gp[2] + 7.5).translate(q));
  }
  const rimClear = studs.length ? rim.subtract(W.CrossSection.union(studs)) : rim;
  const add = [rimClear.area() > 0.5 ? T(s.extrude(rimClear, cavH), [0, 0, bottom]) : undefined, rings.length ? T(s.extrude(W.CrossSection.union(rings), cavH), [0, 0, bottom]) : undefined].filter((m): m is Man => !!m);
  const out = add.length ? s.union([part, ...add]) : part;
  return bores.length ? s.difference(out, [T(s.extrude(W.CrossSection.union(bores), cavH + 0.01), [0, 0, bottom - 0.01])]) : out;
}
