// Cutting a finished piece along straight lines (baseplate edges, or to fit
// the print bed), joined the way LEGO track pieces are: every rail crossing a
// cut gets interlocking rail-end tongues (the track connectors'), turned to
// the rail's heading, with their breakaway supports, and the bed snap pegs
// and C-clips (switch.scad's base splitting, for any line and any piece).
import { M, R, T, type Man, type Scad } from './scad';
import { PLATE_H, type Track } from './track';
import type { Route } from '../route/route';
import { railPoint, routeLat, routeLength, routePose } from '../route/route';

/** A cut: through point p, along unit direction d. */
export interface CutLine { p: [number, number]; d: [number, number] }

const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Cut body along the lines into cells (each the part of the piece between
 * neighbouring lines), joints added. routes: the piece's routes (for the
 * rails and the bed), in the same frame as body.
 */
export function cutPiece(s: Scad, t: Track, body: Man, routes: Route[], lines: CutLine[]): Man[] {
  if (!lines.length) return [body];
  const G = t.c.railOffset, half = t.c.sleeperLen / 2;
  const cz0 = 0, ch = PLATE_H - cz0;
  const cube = (size: [number, number, number], at: [number, number, number]) => T(s.cube(size), at);
  // ---- the joint parts, in a cut's frame (the cut along x, the far side +y) ----
  const couplerSocket = () => T(s.cylinder(ch + 1, 2.1, 1.9, 32), [0, 0, cz0 - 0.5]);
  const couplerNotch = () => T(t.attachPoly(ch + 1), [-4, -0.11, cz0 - 0.5]);
  const couplerPeg = () => s.difference(s.union([T(s.cylinder(ch, 1, 1, 32), [0, 1.8, cz0]), T(s.cylinder(ch, 1.9, 2.1, 32), [0, 0, cz0])]), [T(s.cylinder(ch + 1, 0.8, 0.8, 32), [0, 0, cz0 - 0.5])]);
  const couplerTab = () => s.difference(T(M(s.extrude(s.polygon([[-0.3, 0], [1.7, 1.9], [6.3, 1.9], [8.3, 0]]), ch), [0, 1, 0]), [-4, 0.3, cz0]), [couplerSocket()]);
  const cutTongue = (type: number, z0: number) => s.union([
    T(type < 0 ? t.railEndpointLeft() : t.railEndpointRight(), [-4, -4, 0]),
    type < 0 ? T(t.railSupport(3, 3.23 - z0), [-3.3, -3, z0]) : T(t.railSupport(4, 2.08 - z0), [-2.2, -3, z0]),
  ]);

  // where the piece has floor (a slice through its bed), for the couplers
  const floor = body.slice(1.0);
  const floorAt = (fl: typeof floor, q: [number, number], r: number) => s.w.CrossSection.square([2 * r, 2 * r], true).translate(q).intersect(fl).area() > 4 * r * r * 0.95;
  const fb = body.boundingBox(), reachAll = Math.hypot(fb.max[0] - fb.min[0], fb.max[1] - fb.min[1]) + Math.hypot(fb.min[0], fb.min[1]) + Math.hypot(fb.max[0], fb.max[1]);
  // ---- each line's frame, rail crossings and coupler spots ----
  const frames = lines.map((L) => {
    const n: [number, number] = [-L.d[1], L.d[0]];        // the far side
    const phi = deg(Math.atan2(-n[0], n[1]));               // heading of +y in the cut's frame
    const toLocal = (q: [number, number]) => [(q[0] - L.p[0]) * L.d[0] + (q[1] - L.p[1]) * L.d[1], (q[0] - L.p[0]) * n[0] + (q[1] - L.p[1]) * n[1]];
    const place = (m: Man, u: number) => T(R(m, [0, 0, phi]), [L.p[0] + u * L.d[0], L.p[1] + u * L.d[1], 0]);
    // rails crossing the line: [u, heading in the cut's frame, rail type (-1 left, +1 right, as seen crossing to +y)]
    const rails: [number, number, number][] = [];
    routes.forEach((rt) => {
      const len = routeLength(rt), step = 0.5;
      for (const o of [-G, G]) {
        let prev = toLocal(railPoint(rt, 0, o))[1];
        for (let sx = step; sx <= len + 1e-9; sx += step) {
          const v = toLocal(railPoint(rt, Math.min(sx, len), o))[1];
          if ((prev < 0) !== (v < 0)) {
            let lo = sx - step, hi = Math.min(sx, len);
            for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if ((toLocal(railPoint(rt, m, o))[1] < 0) === (prev < 0)) lo = m; else hi = m; }
            const q = railPoint(rt, lo, o), h = routePose(rt, lo)[2] - phi, hn = ((h + 540) % 360) - 180;
            // (a route crossing to -y: seen from the far side its rails swap)
            const fwd = Math.abs(hn) <= 90;
            rails.push([toLocal(q)[0], fwd ? hn : hn + 180, fwd ? Math.sign(o) : -Math.sign(o)]);
          }
          prev = v;
        }
      }
    });
    // coupler spots: on the bed along the line, 9 clear of every rail, at least 16 apart, up to 3 per stretch of bed
    // (on the bed, and with floor all round the peg on both sides of the cut)
    // (the floor near the line only: testing spots against the whole piece's
    // floor took minutes on a big layout)
    const strip = floor.intersect(s.w.CrossSection.square([2 * reachAll, 14], true).rotate(deg(Math.atan2(L.d[1], L.d[0]))).translate(L.p));
    const onBed = (u: number) => {
      const q: [number, number] = [L.p[0] + u * L.d[0], L.p[1] + u * L.d[1]];
      return routes.some((rt) => Math.abs(routeLat(rt, q)) <= half - 5)
        && floorAt(strip, [q[0] + 2.5 * n[0], q[1] + 2.5 * n[1]], 2.5) && floorAt(strip, [q[0] - 2.5 * n[0], q[1] - 2.5 * n[1]], 2.5);
    };
    const us = rails.map((r) => r[0]), lo = Math.min(...us, 0) - half - 20, hi = Math.max(...us, 0) + half + 20;
    const couplers: number[] = [];
    let run: number[] = [];
    const flush = () => {
      if (!run.length) return;
      const mid = (run[0] + run[run.length - 1]) / 2, got: number[] = [];
      for (const u of [...run].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid)))
        if (got.length < 3 && got.every((g2) => Math.abs(g2 - u) >= 16)) got.push(u);
      couplers.push(...got); run = [];
    };
    for (let u = lo; u <= hi; u += 0.5) {
      if (onBed(u) && us.every((r) => Math.abs(u - r) >= 9)) run.push(u); else flush();
    }
    flush();
    return { L, n, phi, toLocal, place, rails, couplers };
  });

  // material removed at every cut: the rails round each joint, the notches and sockets on the far side
  const removals = s.union(frames.flatMap((f) => [
    ...f.rails.map((r) => f.place(R(cube([8, 8, 30], [-4, -4, -1]), [0, 0, r[1]]), r[0])),
    ...f.couplers.flatMap((u) => [f.place(couplerNotch(), u), f.place(couplerSocket(), u)]),
  ]));
  const cutBody = s.difference(body, [removals]);

  // cells: by which side of each line a point is
  // cut the piece by each line in turn, keeping the parts that hold any of it
  let parts: Man[] = [cutBody];
  for (const f of frames)
    parts = parts.flatMap((m) => m.splitByPlane([f.n[0], f.n[1], 0], f.n[0] * f.L.p[0] + f.n[1] * f.L.p[1]).filter((c) => c.volume() > 300)); // (not a sliver of print supports)
  const cells: Man[] = [];
  for (const cell of parts) {
    // which side of each line the cell is on (from a point of it off the line), and its joints on the lines it meets
    const mesh = cell.getMesh(), vp = mesh.vertProperties, np = mesh.numProp;
    const sideOf = (f: typeof frames[number]) => {
      for (let k = 0; k < vp.length; k += np) { const v = f.toLocal([vp[k], vp[k + 1]])[1]; if (Math.abs(v) > 0.05) return v > 0 ? 1 : -1; }
      return 1;
    };
    const sides = frames.map(sideOf);
    const cb = cell.boundingBox();
    const inCell = (q: [number, number]) => q[0] >= cb.min[0] - 6 && q[0] <= cb.max[0] + 6 && q[1] >= cb.min[1] - 6 && q[1] <= cb.max[1] + 6
      && frames.every((g2, k) => { const v = g2.toLocal(q)[1]; return Math.abs(v) < 1e-6 || (v > 0) === (sides[k] > 0); });
    const joints: Man[] = [];
    frames.forEach((f, k) => {
      const side = sides[k];
      for (const r of f.rails) {
        const q: [number, number] = [f.L.p[0] + r[0] * f.L.d[0], f.L.p[1] + r[0] * f.L.d[1]];
        if (inCell(q)) joints.push(f.place(R(cutTongue(side > 0 ? r[2] : -r[2], -0.02), [0, 0, r[1] + (side < 0 ? 180 : 0)]), r[0]));
      }
      for (const u of f.couplers) {
        const q: [number, number] = [f.L.p[0] + u * f.L.d[0], f.L.p[1] + u * f.L.d[1]];
        if (inCell(q)) joints.push(side > 0 ? f.place(couplerPeg(), u) : f.place(R(couplerTab(), [0, 0, 180]), u));
      }
    });
    // (and nothing loose: bits under a few mm3 a cut left over)
    const whole = joints.length ? s.union([cell, ...joints]) : cell;
    const bits = whole.decompose();
    cells.push(bits.length > 1 ? s.union(bits.filter((m) => m.volume() > 5)) : whole);
  }
  return cells;
}
