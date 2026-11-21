// Labels engraved under the parts with a flat underside (the OpenSCAD files'
// name / label_* settings): text along the track, mirrored so it reads from
// below, 0.9 mm deep. The text is laid a character at a time along the
// track (as curves.scad's arc_text), so it follows a curve; each line shrinks
// to fit 85% of the stretch it's on (straight.scad's), up to 6 mm. The glyphs
// are a sans bold font's outlines bundled with the app (labelfont.ts), so no
// font is fetched.
import type { Pt, Route } from '../route/route';
import { railPoint, routeLength, routePose, sleeperLenOf } from '../route/route';
import type { CS, Man, Scad } from './scad';
import { made } from './kernel';
import { CAP_HEIGHT, GLYPHS, UNITS } from './labelfont';

/** OpenSCAD's text(size = s) has an em of 1.389 s (track_lib.scad's text_em_per_size). */
const EM_PER_SIZE = 1.389;
const MAX_SIZE = 6, MIN_SIZE = 2.5;

const glyphOf = (ch: string) => GLYPHS[ch] ?? GLYPHS['?'];
/** A string's advance width at a text size, mm. */
export function textWidth(txt: string, size: number): number {
  let w = 0;
  for (const ch of txt) w += glyphOf(ch)[0];
  return (w / UNITS) * EM_PER_SIZE * size;
}
/** The cap height at a text size, mm. */
const capOf = (size: number) => (CAP_HEIGHT / UNITS) * EM_PER_SIZE * size;

/** The font size whose capitals are cap mm tall. */
export const sizeForCap = (cap: number) => cap / ((CAP_HEIGHT / UNITS) * EM_PER_SIZE);
/** A line of text as outlines, its capitals cap mm tall, centred on the origin, along +x (not mirrored). */
export function textOutline(w: Scad['w'], txt: string, cap: number): CS | undefined {
  const size = sizeForCap(cap), k0 = (EM_PER_SIZE * size) / UNITS, total = textWidth(txt, size), paths: Pt[][] = [];
  let x = -total / 2;
  for (const ch of txt) {
    const [adv, contours] = glyphOf(ch);
    for (const ct of contours) { const out: Pt[] = []; for (let i = 0; i < ct.length; i += 2) out.push([x + ct[i] * k0, ct[i + 1] * k0 - cap / 2]); paths.push(out); }
    x += adv * k0;
  }
  return paths.length ? made(new w.CrossSection(paths, 'NonZero')) : undefined;
}

/** A line to engrave: its text, and how far right of the track's centre line it runs (mm; negative: left). */
export interface LabelLine { text: string; lat: number }

/** Point-in-polygons, even-odd (the region's outlines, holes included). */
function inside(polys: Pt[][], q: Pt): boolean {
  let c = false;
  for (const p of polys)
    for (let i = 0, j = p.length - 1; i < p.length; j = i++)
      if ((p[i][1] > q[1]) !== (p[j][1] > q[1]) && q[0] < ((p[j][0] - p[i][0]) * (q[1] - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}

/**
 * The engraving for a part (in the part's own coordinates; subtract it):
 * the lines along the longest stretch of track under which the part's
 * bottom is solid for all of them, each as big as fits (none smaller than
 * 2.5 mm); where they don't fit, the fallback line alone on the centre line
 * (a part number), or nothing. routes: the track in the part's coordinates.
 */
/** (expert, stage 6) Where a label was engraved: its middle (mm, as the part's routes), its way (a unit vector along its text), its text, its capitals' height (mm). */
export interface LabelPlace { at: Pt; dir: Pt; text: string; cap: number }
export function labelCut(s: Scad, part: Man, routes: Route[], lines: LabelLine[], fallback?: string, where?: (p: LabelPlace) => void): Man | undefined {
  const bb = part.boundingBox(), z0 = bb.min[2];
  const floor = part.slice(z0 + 0.3);
  if (floor.isEmpty()) return undefined;
  const room = floor.offset(-1, 'Miter', 2), polys = room.toPolygons() as Pt[][];
  if (!polys.length) return undefined;
  const fits = (ls: LabelLine[]) => {
    // the longest stretch (by route, from s0 to s1) where every line's band is over the solid floor
    const hh = capOf(MAX_SIZE) / 2 + 0.3;
    let best: { rt: Route; s0: number; s1: number } | undefined;
    for (const rt of routes) {
      const L = routeLength(rt);
      let run = -1;
      for (let sq = 0; sq <= L + 1e-9; sq += 1) {
        const ok = ls.every((l) => [l.lat - hh, l.lat, l.lat + hh].every((o) => { const q = railPoint(rt, sq, o); return q[0] > bb.min[0] - 1 && q[0] < bb.max[0] + 1 && q[1] > bb.min[1] - 1 && q[1] < bb.max[1] + 1 && inside(polys, q); }));
        if (ok && run < 0) run = sq;
        if ((!ok || sq + 1 > L + 1e-9) && run >= 0) {
          const end = ok ? sq : sq - 1;
          if (!best || end - run > best.s1 - best.s0) best = { rt, s0: run, s1: end };
          run = -1;
        }
      }
    }
    return best;
  };
  const place = (ls: LabelLine[]) => {
    const st = fits(ls);
    if (!st || st.s1 - st.s0 < 8) return undefined;
    const glyphs: CS[] = [];
    for (const l of ls) {
      // the line's path: the stretch at its offset, as a polyline, and its length
      const n = Math.max(2, Math.ceil(st.s1 - st.s0)), path: Pt[] = [], acc = [0];
      for (let k = 0; k <= n; k++) path.push(railPoint(st.rt, st.s0 + ((st.s1 - st.s0) * k) / n, l.lat));
      for (let k = 1; k <= n; k++) acc.push(acc[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
      const len = acc[n], w1 = textWidth(l.text, 1);
      if (w1 <= 0) continue;
      const size = Math.min(MAX_SIZE, (0.85 * len) / w1);
      if (size < MIN_SIZE) return undefined;
      const k0 = (EM_PER_SIZE * size) / UNITS, total = w1 * size, cap = capOf(size);
      let along = len / 2 - total / 2;
      for (const ch of l.text) {
        const [adv, contours] = glyphOf(ch), w = adv * k0, mid = along + w / 2;
        along += w;
        if (!contours.length) continue;
        // where the character's middle falls on the path, and the path's way there
        let k = 1;
        while (k < n && acc[k] < mid) k++;
        const f = (mid - acc[k - 1]) / Math.max(1e-9, acc[k] - acc[k - 1]);
        const c: Pt = [path[k - 1][0] + (path[k][0] - path[k - 1][0]) * f, path[k - 1][1] + (path[k][1] - path[k - 1][1]) * f];
        const dl = Math.max(1e-9, acc[k] - acc[k - 1]), t: Pt = [(path[k][0] - path[k - 1][0]) / dl, (path[k][1] - path[k - 1][1]) / dl];
        const right: Pt = [t[1], -t[0]];
        // (the text's way along the track, its up to the right: mirrored, so it reads from below, as the OpenSCAD files')
        const paths = contours.map((ct) => {
          const out: Pt[] = [];
          for (let i = 0; i < ct.length; i += 2) {
            const u = ct[i] * k0 - w / 2, v = ct[i + 1] * k0 - cap / 2;
            out.push([c[0] + u * t[0] + v * right[0], c[1] + u * t[1] + v * right[1]]);
          }
          return out;
        });
        glyphs.push(made(new s.w.CrossSection(paths, 'NonZero')));
      }
    }
    if (!glyphs.length) return undefined;
    // (where it went, for the plan: the stretch's middle on the centre line, the track's way there)
    if (where) {
      const m = (st.s0 + st.s1) / 2, a = railPoint(st.rt, m - 0.5, 0), b = railPoint(st.rt, m + 0.5, 0), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const sizes = ls.map((l2) => Math.min(MAX_SIZE, (0.85 * (st.s1 - st.s0)) / Math.max(1e-9, textWidth(l2.text, 1))));
      where({ at: railPoint(st.rt, m, 0), dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], text: ls.map((l2) => l2.text).join(' / '), cap: capOf(Math.min(...sizes)) });
    }
    return s.w.CrossSection.union(glyphs);
  };
  let cs = lines.length ? place(lines) : undefined;
  // (both lines don't fit: the first alone, then the fallback alone on the centre line)
  if (!cs && lines.length > 1) cs = place([lines[0]]);
  if (!cs && fallback) cs = place([{ text: fallback, lat: 0 }]);
  if (!cs) return undefined;
  return s.extrude(cs, 1).translate([0, 0, z0 - 0.1]);
}

/**
 * The lines for a part: the name on one side (the outside of a curve, else
 * the right), and the size, gauge and part number on the other, as the
 * OpenSCAD files put them (half a stud in from the sleepers' ends).
 */
export function labelLines(sleeperLen: number, name: string, info: string[], routes: Route[]): LabelLine[] {
  // (a piece all of one gauge of its own, mixed gauges: its sleepers' ends)
  const off = sleeperLenOf(routes[0] ?? ({} as Route), sleeperLen) / 2 - 4;
  // (which way the track turns, overall: the name goes on the outside)
  let turn = 0;
  for (const rt of routes) turn += ((((routePose(rt, routeLength(rt))[2] - rt.start[2]) % 360) + 540) % 360) - 180;
  const side = turn < -0.5 ? -1 : 1; // (turning right: the outside is the left; else the right)
  const out: LabelLine[] = [];
  const nm = name.trim().toUpperCase();
  if (nm) out.push({ text: nm, lat: side * off });
  const rest = info.filter(Boolean).join(' ');
  if (rest) out.push({ text: rest, lat: -side * off });
  return out;
}

/**
 * (expert, stage 6) One line of text engraved under a part where it's placed by hand: its middle at `at`, along `dir`
 * (a unit vector; mm, as the part), mirrored to read from below as the app's labels are; cap: its capitals' height (mm;
 * undefined: as big as fits, MAX_SIZE down to MIN_SIZE). Only where all of it is over the part's solid floor, 1 mm in
 * from its edges: else undefined (why: it doesn't fit there).
 */
export function labelCutAt(s: Scad, part: Man, text: string, at: Pt, dir: Pt, cap?: number): { cut: Man; cap: number } | undefined {
  if (!text.trim()) return undefined;
  const bb = part.boundingBox(), z0 = bb.min[2];
  const floor = part.slice(z0 + 0.3);
  if (floor.isEmpty()) return undefined;
  const polys = floor.offset(-1, 'Miter', 2).toPolygons() as Pt[][];
  if (!polys.length) return undefined;
  const right: Pt = [dir[1], -dir[0]], pt = (u: number, v: number): Pt => [at[0] + u * dir[0] + v * right[0], at[1] + u * dir[1] + v * right[1]];
  const fitsAt = (size: number) => {
    const hw = textWidth(text, size) / 2 + 0.3, hh = capOf(size) / 2 + 0.3, nu = Math.max(2, Math.ceil((2 * hw) / 1)), nv = Math.max(2, Math.ceil((2 * hh) / 1));
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) if (!inside(polys, pt(-hw + (2 * hw * i) / nu, -hh + (2 * hh * j) / nv))) return false;
    return true;
  };
  let size: number | undefined;
  if (cap !== undefined) { const sz = sizeForCap(cap); if (fitsAt(sz)) size = sz; }
  else for (let sz = MAX_SIZE; sz >= MIN_SIZE - 1e-9; sz -= 0.25) if (fitsAt(sz)) { size = sz; break; }
  if (size === undefined) return undefined;
  const k0 = (EM_PER_SIZE * size) / UNITS, c = capOf(size), paths: Pt[][] = [];
  let u0 = -textWidth(text, size) / 2;
  for (const ch of text) {
    const [adv, contours] = glyphOf(ch);
    for (const ct of contours) { const out: Pt[] = []; for (let i = 0; i < ct.length; i += 2) out.push(pt(u0 + ct[i] * k0, ct[i + 1] * k0 - c / 2)); paths.push(out); }
    u0 += adv * k0;
  }
  if (!paths.length) return undefined;
  return { cut: s.extrude(made(new s.w.CrossSection(paths, 'NonZero')), 1).translate([0, 0, z0 - 0.1]), cap: c };
}
