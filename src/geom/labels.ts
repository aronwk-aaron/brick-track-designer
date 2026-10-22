// Labels engraved under the parts with a flat underside (the OpenSCAD files'
// name / label_* settings): text along the track, mirrored so it reads from
// below, 0.9 mm deep. The text is laid a character at a time along the
// track (as curves.scad's arc_text), so it follows a curve; each line shrinks
// to fit 85% of the stretch it's on (straight.scad's), up to 6 mm. The glyphs
// are a sans bold font's outlines bundled with the app (labelfont.ts), so no
// font is fetched.
import type { Pt, Route } from '../route/route';
import { railPoint, routeLength, routePose } from '../route/route';
import type { CS, Man, Scad } from './scad';
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
export function labelCut(s: Scad, part: Man, routes: Route[], lines: LabelLine[], fallback?: string): Man | undefined {
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
        glyphs.push(new s.w.CrossSection(paths, 'NonZero'));
      }
    }
    return glyphs.length ? s.w.CrossSection.union(glyphs) : undefined;
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
  const off = sleeperLen / 2 - 4;
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
