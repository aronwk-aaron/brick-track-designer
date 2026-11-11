// Breakaway print supports: the small loose bits printed with a part to hold up what would hang (a rail end's tongue,
// a sprung blade's pocket roof, a peg above the bed), snapped off after. Each is a solid of its own, carried with its
// part by the kernel (kernel.ts Supports), never unioned into it. Here is the one place they're finished: made the
// part's file's loose bodies, every one clear of the part by the gap that lets it break away.
import { asSupport, flat, partBox, supportsOf, type Wasm } from './kernel';
import { END_REACH } from './bedfit';
import type { Man, Scad } from './scad';

/** (mm) The least gap between a support and its part, all round: closer, they print as one. (Each kind is built with its own: 0.2 to 0.32.) */
export const SUPPORT_GAP = 0.2;
/** (mm) Clear enough: a gap built as 0.2 comes out a hair under it. */
const CLEAR = SUPPORT_GAP - 0.012;
/** (mm) A support too close is cut back layer by layer: half a printed layer each (so no more than that is lost up and down), */
const LAYER = 0.1;
/** (mm) and the part looked at this often up it. */
const STEP = 0.05;
/**
 * A support cut back from the part near it (near): layer by layer, each layer of it less the part's own outline
 * within the gap above and below, grown by the gap all round. So it's the gap clear every way (up to a layer more, up
 * and down), stepped as the layers are. (The part grown as a solid, by a ball or a cube, took three seconds a support;
 * moved copies of it left fins of support between them, by a thin slanting wall.)
 */
function cutBack(w: Wasm, one: Man, near: Man): Man {
  const bb = one.boundingBox(), z0 = bb.min[2], n = Math.max(1, Math.round((bb.max[2] - z0) / LAYER)), h = (bb.max[2] - z0) / n, G = SUPPORT_GAP + 0.01, up = SUPPORT_GAP + STEP;
  // (the part's outline every STEP up it, between the faces: a cut through a face's own height is neither side of it)
  const got = new Map<number, ReturnType<Man['slice']>>(), at = (k: number) => { let c = got.get(k); if (!c) { c = near.slice(z0 + (k + 0.5) * STEP); got.set(k, c); } return c; };
  const slabs: Man[] = [];
  for (let i = 0; i < n; i++) {
    const za = i * h, k0 = Math.ceil((za - up) / STEP - 0.5), k1 = Math.floor((za + h + up) / STEP - 0.5), levels: ReturnType<Man['slice']>[] = [];
    for (let k = k0; k <= k1; k++) levels.push(at(k));
    const keep = one.slice(z0 + za + h / 2).subtract(w.CrossSection.union(levels).offset(G, 'Round', 2, 12));
    // (each a hair into the next: two that only met, their heights a rounding apart, came out two bodies)
    if (keep.area() > 0.01) slabs.push(keep.extrude(i < n - 1 ? h + 0.001 : h).translate([0, 0, z0 + za]));
  }
  return w.Manifold.union(slabs);
}
/** (mm3, mm) A bit of a cut support worth printing: less than this, or shorter every way, doesn't stand. */
const STANDS = 2, SPAN = 1.5;
/** (mm) How far past its part's outline (from above) a support may stand: a rail end's, footing and all, reaches END_REACH; further is the next part's room. */
export const SUPPORT_REACH = END_REACH + 0.5;
/** (mm3) Less than this is no support: a flake a cut left. */
const FLAKE = 0.5;
/** (mm) What a support holds is this near it. */
const HOLDS = 0.6;

/** A support that couldn't be printed as built: cut back from the part (some of it left), or dropped (none). box: where it was; mm3 before and after. */
export interface SupportNote { what: 'cut' | 'dropped'; box: { min: number[]; max: number[] }; before: number; after: number; was: Man; /** what's left of it */ is?: Man }

/** m as a support: joined to its part as any solid is (a union), it stays a solid of its own, carried with the part. */
export const support = (s: Scad, m: Man): Man => asSupport(s.w, m);

/**
 * A part's supports as they're printed: one solid, its bodies the supports (undefined: none). Every support is kept
 * SUPPORT_GAP clear of the part, whatever else was built onto the part since the support was made (a peg beside a
 * third rail's end, a clip under a rail): one that comes closer is cut back, and what's left of it kept if it still
 * stands (STANDS, SPAN) by something of the part (HOLDS); else it's dropped. Never joined to the part. And none
 * stands further from its part than SUPPORT_REACH, seen from above, where the next part goes (the end supports of a
 * part cut narrower than its sleepers did): cut off there, the same way. notes: each
 * support cut back or dropped (the build looks whether the part still prints there, and says so if not).
 */
export function finishSupports(w: Wasm, part: Man, notes?: SupportNote[]): Man | undefined {
  const sp = supportsOf(part);
  if (!sp || part.isEmpty()) return undefined;
  // (flakes aside: a cut can leave a support's last tenth of a mm, under FLAKE, which was never printed as one)
  const all = flat(w, sp, false).decompose(), bodies = all.filter((b) => b.volume() >= FLAKE);
  if (!bodies.length) return undefined;
  // (all clear and within reach, as nearly always: as built)
  const pb = partBox(part), boxOf = (m: Man) => m.boundingBox() as { min: number[]; max: number[] };
  const clear = part.minGap(sp, SUPPORT_GAP) >= CLEAR;
  if (clear && withinReach(part, sp)) return bodies.length === all.length ? sp : w.Manifold.compose(bodies);
  // (reach: against the part's outline where a support stands by it: cut through just above its underside, and just
  // above each support's top, where what it holds is; only round the supports)
  const levels = [...new Set([pb.min[2] + 0.3, ...bodies.map((b) => Math.round((boxOf(b).max[2] + 0.35) * 10) / 10)])];
  const round = w.CrossSection.union(bodies.map((b) => { const q = boxOf(b), pad = SUPPORT_REACH + 1; return w.CrossSection.square([q.max[0] - q.min[0] + 2 * pad, q.max[1] - q.min[1] + 2 * pad]).translate([q.min[0] - pad, q.min[1] - pad]); }));
  const room = w.CrossSection.union(levels.map((z) => part.slice(z).intersect(round))).offset(SUPPORT_REACH, 'Round', 2, 16);
  const beyond = (m: Man) => m.project().subtract(room).area() > 0.5;
  const out: Man[] = [], window = (q: { min: number[]; max: number[] }, pad: number) => w.Manifold.cube([q.max[0] - q.min[0] + 2 * pad, q.max[1] - q.min[1] + 2 * pad, q.max[2] - q.min[2] + 2 * pad]).translate([q.min[0] - pad, q.min[1] - pad, q.min[2] - pad]);
  for (const one of bodies) {
    const bb = boxOf(one), close = !clear && part.minGap(one, SUPPORT_GAP) < CLEAR, far = beyond(one);
    if (!close && !far) { out.push(one); continue; }
    const before = one.volume();
    let cut = one;
    // (the part near it: what the support must stay out of, by the gap)
    if (close) cut = cutBack(w, cut, part.intersect(window(bb, 1)));
    // (and no further from the part than SUPPORT_REACH, seen from above: beyond is the next part's room)
    if (far) cut = room.isEmpty() ? cut.subtract(cut) : cut.intersect(room.extrude(bb.max[2] - bb.min[2] + 2).translate([0, 0, bb.min[2] - 1]));
    const left = cut.decompose().filter((b) => {
      const q = b.boundingBox(), v = b.volume(), gap = part.minGap(b, HOLDS);
      // (or a small bit right on the part, a layer off it: the top of a wall the part runs through, still under what it held)
      return (v >= STANDS && Math.max(q.max[0] - q.min[0], q.max[1] - q.min[1], q.max[2] - q.min[2]) >= SPAN && gap < HOLDS) || (v >= FLAKE && gap < SUPPORT_GAP + LAYER);
    });
    out.push(...left);
    // (cut for its reach and nothing lost: as built)
    const after = left.reduce((t, b) => t + b.volume(), 0);
    if (after < before - 0.01) notes?.push({ what: left.length ? 'cut' : 'dropped', box: { min: [...bb.min], max: [...bb.max] }, before, after, was: one, ...(left.length && { is: w.Manifold.compose(left) }) });
  }
  return out.length ? w.Manifold.compose(out) : undefined;
}

/**
 * Is every corner of the supports within SUPPORT_REACH of the part, seen from above (of one of its triangles, flat)?
 * A quick look over the part's triangles near them, for the usual case (yes): the outline itself, cut and grown, took
 * a tenth of a build on small parts.
 */
function withinReach(part: Man, sp: Man): boolean {
  const g = sp.getMesh(), pts: [number, number][] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < g.vertProperties.length; i += g.numProp) { const x = g.vertProperties[i], y = g.vertProperties[i + 1]; pts.push([x, y]); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const R = SUPPORT_REACH, ok = new Uint8Array(pts.length), m = part.getMesh(), vp = m.vertProperties, tv = m.triVerts, np = m.numProp;
  let left = pts.length;
  const seg = (p: [number, number], ax: number, ay: number, bx: number, by: number) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l)) : 0; return Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy); };
  for (let i = 0; i < tv.length && left; i += 3) {
    const a = tv[i] * np, b = tv[i + 1] * np, c = tv[i + 2] * np, ax = vp[a], ay = vp[a + 1], bx = vp[b], by = vp[b + 1], cx = vp[c], cy = vp[c + 1];
    const lx = Math.min(ax, bx, cx) - R, hx = Math.max(ax, bx, cx) + R, ly = Math.min(ay, by, cy) - R, hy = Math.max(ay, by, cy) + R;
    if (hx < x0 || lx > x1 || hy < y0 || ly > y1) continue;
    const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    for (let k = 0; k < pts.length; k++) {
      if (ok[k]) continue;
      const q = pts[k];
      if (q[0] < lx || q[0] > hx || q[1] < ly || q[1] > hy) continue;
      // (in the triangle from above, or within reach of a side)
      const u = ((q[0] - ax) * (cy - ay) - (q[1] - ay) * (cx - ax)) / (d || 1), v = ((bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax)) / (d || 1);
      if ((d && u >= 0 && v >= 0 && u + v <= 1) || seg(q, ax, ay, bx, by) <= R || seg(q, bx, by, cx, cy) <= R || seg(q, cx, cy, ax, ay) <= R) { ok[k] = 1; left--; }
    }
  }
  return left === 0;
}

/**
 * A part as it's printed: file, the part with its supports finished, each a loose body of it (the part itself with
 * none); supports, those alone, to show apart. For whoever makes a part's file (build.ts, monobuild.ts).
 */
export function printedWith(w: Wasm, part: Man, notes?: SupportNote[]): { file: Man; supports?: Man } {
  const own = finishSupports(w, part, notes);
  return own ? { file: w.Manifold.compose([part, own]), supports: own } : { file: part };
}

/** (mm) What a support holds is within this above its top (as the printing checks' measure of held: scripts/printability.ts). */
const HELD = 0.45;
/**
 * How much of the part a support held (mm2), and how much what's left of it still holds (a note of finishSupports):
 * under each of its flat tops, the part within HELD above it that has nothing of its own under it there; still held
 * where what's left is no more than HELD below the part. Slices of the support and of the part near it: quick (the printing checks' own measure of
 * what hangs, over the same spot, took a second a support).
 */
export function heldBy(w: Wasm, part: Man, n: SupportNote): { meant: number; now: number } {
  const g = n.was.getMesh(), np = g.numProp, tops = new Set<number>();
  for (let i = 0; i < g.triVerts.length; i += 3) {
    const [a, b, c] = [g.triVerts[i] * np, g.triVerts[i + 1] * np, g.triVerts[i + 2] * np], z = g.vertProperties[a + 2];
    if (Math.abs(g.vertProperties[b + 2] - z) > 1e-3 || Math.abs(g.vertProperties[c + 2] - z) > 1e-3) continue;
    // (facing up)
    if ((g.vertProperties[b] - g.vertProperties[a]) * (g.vertProperties[c + 1] - g.vertProperties[a + 1]) - (g.vertProperties[b + 1] - g.vertProperties[a + 1]) * (g.vertProperties[c] - g.vertProperties[a]) > 1e-9) tops.add(Math.round(z * 100) / 100);
  }
  const lo = n.box.min, hi = n.box.max, near = part.intersect(w.Manifold.cube([hi[0] - lo[0] + 2, hi[1] - lo[1] + 2, hi[2] - lo[2] + 2]).translate([lo[0] - 1, lo[1] - 1, lo[2] - 1]));
  let meant = 0, now = 0;
  for (const z of tops) {
    // (what hangs over it: the part above the top that isn't there just below it, where the support is instead)
    const top = n.was.slice(z - 0.02).subtract(n.was.slice(z + 0.02)), above = w.CrossSection.union([0.1, 0.25, 0.4].map((d) => near.slice(z + d))), held = top.intersect(above).subtract(near.slice(z - 0.1));
    meant += held.area();
    // (cut down no further than leaves the part within HELD of it)
    if (n.is && held.area() > 0.01) now += held.intersect(n.is.slice(z - (HELD - 0.2) - 0.02)).area();
  }
  return { meant, now };
}
