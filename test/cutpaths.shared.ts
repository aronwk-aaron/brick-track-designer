// Cut paths (expert mode) never cut a stud: checked on the parts themselves. Every corner of every path is a corner
// of the build's stud grid (so the studs of a baseplate under the parts, at the cells' middles, are 4 mm from the
// cut: no anti-stud is cut either); and where a part's cut face shows at the studs' mid-height (something was cut
// there: a rail, a check rail), it is never the chord of a stud's circle: no arc of a stud's radius ends on it.
import type { buildDesign } from '../src/app/build';
import type { Design } from '../src/app/design';
import { gridPath, toGrid, type Grid } from '../src/app/cutpaths';
import { PLATE_H, DEFAULTS } from '../src/geom/track';

type Built = ReturnType<typeof buildDesign>;
/** A design's cut paths as the build laid them (mm), on its grid. */
export function laidPaths(d: Design, b: Built): [number, number][][] {
  const g0 = b.overlay.cutting!.grid, g: Grid = [g0[0] / 8, g0[1] / 8, g0[2]];
  return (d.expert?.cutPaths ?? []).map((p) => gridPath(g, p.pts).map((q): [number, number] => [q[0] * 8, q[1] * 8]));
}
/** What's wrong with a built design's cut paths as far as studs go (none: nothing). */
export function studsCut(d: Design, b: Built): string[] {
  const out: string[] = [], g0 = b.overlay.cutting!.grid, g: Grid = [g0[0] / 8, g0[1] / 8, g0[2]], paths = laidPaths(d, b);
  for (const p of paths) for (const q of p) { const l = toGrid(g, [q[0] / 8, q[1] / 8]); if (Math.abs(l[0] - Math.round(l[0])) > 1e-6 || Math.abs(l[1] - Math.round(l[1])) > 1e-6) out.push(`a cut path's corner at ${q[0] / 8}, ${q[1] / 8} isn't on the stud grid`); }
  const legs = paths.flatMap((p) => p.slice(1).map((q, k) => [p[k], q] as const));
  const z = PLATE_H + DEFAULTS.studH / 2, R = (DEFAULTS.studD + DEFAULTS.studFit) / 2;
  for (const pc of b.pieces) {
    if (pc.lego || !/^(track|switch\d*-base)/.test(pc.name)) continue;
    // (the part's section at the studs' mid-height: each triangle's two points on that plane)
    const P = pc.positions, segs: [[number, number], [number, number]][] = [];
    for (let i = 0; i < P.length; i += 9) {
      const v = [0, 3, 6].map((k) => [P[i + k], P[i + k + 1], P[i + k + 2]]), pts: [number, number][] = [];
      for (let k = 0; k < 3; k++) { const a = v[k], c = v[(k + 1) % 3]; if ((a[2] - z) * (c[2] - z) < 0) { const t = (z - a[2]) / (c[2] - a[2]); pts.push([a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1])]); } }
      if (pts.length === 2) segs.push([pts[0], pts[1]]);
    }
    for (const [a, c] of legs) {
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]), dx = (c[0] - a[0]) / l, dy = (c[1] - a[1]) / l;
      const uv = (q: [number, number]): [number, number] => [(q[0] - a[0]) * dx + (q[1] - a[1]) * dy, (q[0] - a[0]) * -dy + (q[1] - a[1]) * dx];
      // (what of the section lies along the cut, within the kerf of it: the cut face, as stretches along the leg)
      const on: [number, number][] = [], off: [number, number][] = [];
      for (const [p, q] of segs) {
        const [pu, pv] = uv(p), [qu, qv] = uv(q);
        if (Math.max(pu, qu) < -3 || Math.min(pu, qu) > l + 3 || Math.min(Math.abs(pv), Math.abs(qv)) > 6) continue;
        if (Math.abs(pv) < 0.12 && Math.abs(qv) < 0.12) { if (Math.abs(pu - qu) > 0.02) on.push([Math.min(pu, qu), Math.max(pu, qu)]); } else off.push([pu, pv], [qu, qv]);
      }
      on.sort((x, y) => x[0] - y[0]);
      const runs: [number, number][] = [];
      for (const r of on) { const last = runs[runs.length - 1]; if (last && r[0] <= last[1] + 0.05) last[1] = Math.max(last[1], r[1]); else runs.push([...r]); }
      for (const [u0, u1] of runs) {
        const len = u1 - u0, um = (u0 + u1) / 2;
        if (len < 0.3 || len > 2 * R + 0.1) continue;
        // (a stud cut here has its circle through both ends of the stretch: its middle off the cut, either side, by up to
        // its radius; each place it could be is tried, a little apart)
        // (and the rest of its circle is there, all the way round from one end of the stretch to the other: a joint's
        // clip, round a peg as wide as a stud, is open on one side, and isn't a stud)
        const chord = 2 * Math.asin(Math.min(1, len / (2 * R)));
        const ring = (cv: number) => {
          const as = off.filter(([pu, pv]) => Math.abs(Math.hypot(pu - um, pv - cv) - R) < 0.04).map(([pu, pv]) => Math.atan2(pv - cv, pu - um)).sort((x, y) => x - y);
          if (as.length < 12) return false;
          let gap = as[0] + 2 * Math.PI - as[as.length - 1];
          for (let k = 1; k < as.length; k++) gap = Math.max(gap, as[k] - as[k - 1]);
          return gap <= chord + 0.35 && gap < 2 * Math.PI - 1;
        };
        if (Array.from({ length: 2 * Math.ceil(R / 0.02) + 1 }, (_, k) => -R + k * 0.02).some(ring))
          out.push(`${pc.name}: a stud is cut at ${((a[0] + dx * um) / 8).toFixed(2)}, ${((a[1] + dy * um) / 8).toFixed(2)} (studs)`);
      }
    }
  }
  return [...new Set(out)];
}
/**
 * How many whole studs the printed track parts have on top: the closed rings of their section at the studs'
 * mid-height that are a stud's circle (as wide and as high as a stud, as far round). A stud cut by anything isn't one.
 */
export function studCount(b: Built): number {
  const z = PLATE_H + DEFAULTS.studH / 2, D = DEFAULTS.studD + DEFAULTS.studFit;
  let count = 0;
  for (const pc of b.pieces) {
    if (pc.lego || !/^(track|switch\d*-base)/.test(pc.name)) continue;
    const P = pc.positions, key = (q: number[]) => `${Math.round(q[0] * 500)},${Math.round(q[1] * 500)}`;
    // (the section's edges, each from one point to the next; then round each ring)
    const from = new Map<string, { a: number[]; b: number[]; used?: boolean }[]>();
    for (let i = 0; i < P.length; i += 9) {
      const v = [0, 3, 6].map((k) => [P[i + k], P[i + k + 1], P[i + k + 2]]), pts: number[][] = [];
      for (let k = 0; k < 3; k++) { const a = v[k], c = v[(k + 1) % 3]; if ((a[2] - z) * (c[2] - z) < 0) { const t = (z - a[2]) / (c[2] - a[2]); pts.push([a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1])]); } }
      if (pts.length !== 2 || key(pts[0]) === key(pts[1])) continue;
      for (const [a, c] of [[pts[0], pts[1]], [pts[1], pts[0]]]) { const e = { a, b: c }; if (!from.has(key(a))) from.set(key(a), []); from.get(key(a))!.push(e); }
    }
    const seen = new Set<string>();
    for (const [k0, es] of from) {
      if (seen.has(k0) || es.length !== 2) continue;
      let at = k0, prev = '', len = 0, n = 0, closed = false;
      const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
      while (n++ < 400) {
        seen.add(at);
        const out = (from.get(at) ?? []).filter((e) => key(e.b) !== prev);
        if ((from.get(at) ?? []).length !== 2 || !out.length) break;
        const e = out[0];
        len += Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
        for (const j of [0, 1]) { lo[j] = Math.min(lo[j], e.a[j]); hi[j] = Math.max(hi[j], e.a[j]); }
        prev = at; at = key(e.b);
        if (at === k0) { closed = true; break; }
      }
      if (closed && Math.abs(hi[0] - lo[0] - D) < 0.15 && Math.abs(hi[1] - lo[1] - D) < 0.15 && Math.abs(len - Math.PI * D) < 0.04 * Math.PI * D) count++;
    }
  }
  return count;
}
