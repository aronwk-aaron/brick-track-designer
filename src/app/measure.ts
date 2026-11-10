// The Measure tool: two points on the plan (each snapping to a track's end, else to a track's centre line, else the stud grid
// and the guides' lines), the distance between them and the angle between the tracks there. Pure; the plan draws it. Not saved.
import type { DRoute } from './design';
import { follow, type Pose } from './planner';
import { cutSegs, nearestAlong, routeStuds } from './splitmerge';

export type Pt = [number, number];
export interface MeasurePoint {
  p: Pt;
  /** the way the track runs there (degrees), where the point is on one */
  heading?: number;
  /** which route, and whether the point is its end or along it */
  on?: { name: string; at: 'end' | 'line' };
}
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The point a measuring click lands on for the pointer p (studs): the nearest track end within reach (studs), else the nearest point on
 * a centre line within reach, else free (the stud grid and guides' snapped point, worked out by the caller).
 */
export function measurePoint(routes: readonly DRoute[], p: Pt, reach: number, free: Pt): MeasurePoint {
  let end: { d: number; mp: MeasurePoint } | undefined, line: { d: number; mp: MeasurePoint } | undefined;
  routes.forEach((r, i) => {
    const name = r.name || String(i);
    if (Math.hypot(p[0] - r.x, p[1] - r.y) > routeStuds(r) + reach + 1) return;
    const e = follow(r, r.segs);
    for (const [q, h] of [[{ x: r.x, y: r.y }, r.heading], [e, e.heading]] as [{ x: number; y: number }, number][]) {
      const d = Math.hypot(q.x - p[0], q.y - p[1]);
      if (d <= reach && (!end || d < end.d)) end = { d, mp: { p: [q.x, q.y], heading: norm180(h), on: { name, at: 'end' } } };
    }
    const n = nearestAlong(r, p);
    if (n.dist <= reach && (!line || n.dist < line.d)) {
      const pose: Pose = follow(r, cutSegs(r.segs, n.s)[0]);
      line = { d: n.dist, mp: { p: [Math.round(pose.x * 1e4) / 1e4, Math.round(pose.y * 1e4) / 1e4], heading: norm180(pose.heading), on: { name, at: 'line' } } };
    }
  });
  return end?.mp ?? line?.mp ?? { p: free };
}

export interface Measured {
  /** straight line between the points, studs and mm (a stud is 8 mm) */
  studs: number; mm: number;
  /** the angle between the tracks (0 to 90, tracks having no direction), where both points are on one */
  angle?: number;
  /** (tracks that run side by side, within a degree) how far apart they are across: square to the first */
  across?: number;
  /** the same, said */
  text: string;
}
export function measureBetween(a: MeasurePoint, b: MeasurePoint): Measured {
  const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], studs = Math.hypot(dx, dy);
  const out: Measured = { studs: r2(studs), mm: Math.round(studs * 8), text: '' };
  const parts = [`${+r2(studs).toFixed(2)} stud${r2(studs) === 1 ? '' : 's'} (${out.mm} mm)`];
  if (a.heading !== undefined && b.heading !== undefined) {
    const diff = Math.abs(norm180(a.heading - b.heading)), ang = Math.min(diff, 180 - diff);
    out.angle = r2(ang);
    parts.push(`${+out.angle.toFixed(2)}° between the tracks`);
    if (ang < 1) {
      const h = (a.heading * Math.PI) / 180;
      out.across = r2(Math.abs(dx * -Math.cos(h) + dy * -Math.sin(h)));
      parts.push(`${+out.across.toFixed(2)} studs apart, side to side`);
    }
  }
  out.text = parts.join(' · ');
  return out;
}
