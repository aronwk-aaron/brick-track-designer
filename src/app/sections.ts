// Splitting a layout the way plate-style splits theirs: into separate pieces
// whose every joint is an ordinary track end (each track cut square to
// itself, a standard end connector both sides), cut only where the track's
// base is clear of every other track's (never through points, frogs or
// crossings), plain stretches in lengths that fit the print bed.
import type { Route } from '../route/route';
import { routeLat, routeLength, routePose, routesBox, railPoint } from '../route/route';
import type { Split } from '../route/solver';

/** A piece of one route: [route, from, to] (arc lengths). */
export type RoutePiece = [number, number, number];

/**
 * Where to cut: each route's pieces, and the pieces grouped into the
 * sections built together (those whose bases overlap). half: how far the
 * base reaches each side of a centre line; room: the longest plain piece.
 */
/**
 * exact: plain stretches in pieces this long (mm, measured from the track's start), the last what's left; else as few
 * as fit room, even. plates: the baseplates' grid (their size and corner, mm): a joint too where a plain stretch
 * crosses a baseplate's edge (on the whole stud nearest), so its pieces sit on one baseplate each, not cut again there.
 */
/**
 * std: the radii (mm) of curves made as track pieces of their own (LEGO's R40, BrickTracks' curves) and each piece's
 * angle: then each plain stretch is cut where its own pieces would join, each segment on from its start (a straight
 * every exact, such a curve every piece's angle), so its pieces can be those parts.
 */
export function planSections(routes: Route[], splits: Split[], half: number, room: number, minPart = 40, exact = 0, plates?: { size: number; x: number; y: number }, std?: Map<number, number>) {
  const boxes = routes.map((rt) => routesBox([rt], half + 16, 8));
  const inBox = (j: number, q: [number, number]) => q[0] >= boxes[j][0] && q[0] <= boxes[j][2] && q[1] >= boxes[j][1] && q[1] <= boxes[j][3];
  // the points' stretches (and a connector's length past them), where no cut goes
  const busy = routes.map(() => [] as [number, number][]);
  for (const sp of splits) sp.routes.forEach((ri, k) => busy[ri].push([sp.spans[k][0] - 24, sp.spans[k][1] + 24]));
  /** Can route i be cut square at s: its base there (and a connector's depth either side) clear of every other track's base? */
  const free = (i: number, s: number) => {
    const rt = routes[i], L = routeLength(rt);
    if (s < minPart || s > L - minPart || busy[i].some(([a, b]) => s >= a && s <= b)) return false;
    for (const ds of [-10, 0, 10]) for (let o = -half; o <= half + 1e-9; o += 8) {
      const q = railPoint(rt, s + ds, o);
      for (let j = 0; j < routes.length; j++) if (j !== i && inBox(j, q) && Math.abs(routeLat(routes[j], q)) < half + 2) return false;
    }
    return true;
  };
  const pieces: RoutePiece[] = [];
  routes.forEach((rt, i) => {
    const L = routeLength(rt), step = 8, cuts: number[] = [];
    // free stretches along it (on the stud grid from its start)
    const ok: boolean[] = [];
    for (let s = 0; s <= L; s += step) ok.push(free(i, s));
    let k = 0;
    while (k < ok.length) {
      if (!ok[k]) { k++; continue; }
      let e = k; while (e + 1 < ok.length && ok[e + 1]) e++;
      const a = k * step, b = e * step;
      // cut where the free stretch starts and ends (so the busy parts are as
      // small as they can be), and across it every room or less
      if (b - a >= minPart) {
        const inner = b - a, n = Math.max(1, Math.ceil(inner / room));
        // (whole pieces measured from the track's start, as LEGO's; at a free stretch's end by points or a crossing, a cut
        // there too, so what's built with them is as small as can be)
        // (at each baseplate edge it crosses first, then the lengths between, measured on from there)
        const edges: number[] = [];
        if (plates && plates.size > 0) {
          const cell = (q: number[]) => [Math.floor((q[0] - plates.x) / plates.size), Math.floor((q[1] - plates.y) / plates.size)].join();
          for (let s2 = a + step; s2 <= b; s2 += 1) if (cell(routePose(rt, s2 - 1)) !== cell(routePose(rt, s2))) edges.push(Math.round(s2 / step) * step);
        }
        const fill = (lo: number, hi: number) => {
          if (exact > 0) for (let c2 = lo + exact; c2 < hi - minPart / 2; c2 += exact) cuts.push(c2);
          else { const k = Math.max(1, Math.ceil((hi - lo) / room)); for (let m = 1; m < k; m++) cuts.push(Math.round((lo + ((hi - lo) * m) / k) / step) * step); }
        };
        // (standard pieces: where each segment's own pieces join, within the stretch)
        const natural = std && exact > 0 ? (() => {
          const at: number[] = [];
          let s0 = 0;
          for (const sg of rt.segments) {
            const len = sg.kind === 'straight' ? sg.length : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180;
            const r = sg.kind === 'arc' ? [...std.keys()].find((k2) => Math.abs(k2 - sg.radius) < 0.01) : undefined;
            const each = r !== undefined ? (std.get(r)! * Math.PI * r) / 180 : exact;
            at.push(s0);
            for (let c2 = s0 + each; c2 < s0 + len - 1e-6; c2 += each) at.push(c2);
            s0 += len;
          }
          return at;
        })() : undefined;
        // (a and b cuts only where points or a crossing end the stretch, not at the route's own ends' margins)
        if (natural) { if (a > minPart + step) cuts.push(a); for (const c2 of natural) if (c2 > a + 1e-6 && c2 < b - 1e-6) cuts.push(c2); if (b < L - minPart - step) cuts.push(b); }
        else if (exact > 0 && !edges.length) { if (a > minPart) cuts.push(a); for (let c2 = Math.ceil((a + 1e-6) / exact) * exact; c2 < b - 1e-6; c2 += exact) cuts.push(c2); if (b < L - minPart) cuts.push(b); }
        else if (!edges.length) for (let m = 0; m <= n; m++) cuts.push(Math.round((a + (inner * m) / n) / step) * step);
        else {
          if (a > minPart) cuts.push(a);
          if (b < L - minPart) cuts.push(b);
          const stops = [a, ...edges.filter((e) => e > a + minPart / 2 && e < b - minPart / 2), b];
          for (let k2 = 0; k2 + 1 < stops.length; k2++) { if (k2 > 0) cuts.push(stops[k2]); fill(stops[k2], stops[k2 + 1]); }
        }
      }
      k = e + 1;
    }
    const cs = [...new Set(cuts)].filter((c) => c >= minPart && c <= L - minPart).sort((p, q) => p - q);
    let s0 = 0;
    for (const c of cs) { if (c - s0 >= minPart) { pieces.push([i, s0, c]); s0 = c; } }
    pieces.push([i, s0, L]);
  });
  // sections: pieces whose bases overlap (union-find)
  const parent = pieces.map((_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  // (its base: points across it, every 6 mm along it, kept a hair inside its cut ends)
  const samples = pieces.map(([i, a, b]) => {
    const n = Math.max(1, Math.ceil((b - a) / 6)), out: [number, number][] = [];
    for (let k = 0; k <= n; k++) for (let o = -half; o <= half + 1e-9; o += 8) out.push(railPoint(routes[i], a + 0.5 + ((b - a - 1) * k) / n, o));
    return out;
  });
  const sAt = (i: number, q: [number, number]) => {
    // (the arc length along route i level with q: nearest sample)
    const rt = routes[i], L = routeLength(rt);
    let best = 0, bd = Infinity;
    for (let s = 0; s <= L; s += 2) { const p = railPoint(rt, s, 0), d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  for (let p = 0; p < pieces.length; p++) for (let r = p + 1; r < pieces.length; r++) {
    const [ip] = pieces[p], [ir, ar, br] = pieces[r];
    if (find(p) === find(r)) continue;
    if (ip === ir) continue; // (two pieces of one track join only at an ordinary end)
    const hit = samples[p].some((q) => inBox(ir, q) && Math.abs(routeLat(routes[ir], q)) < half && (() => { const s = sAt(ir, q); return s >= ar - 1 && s <= br + 1; })());
    if (hit) parent[find(p)] = find(r);
  }
  const groups = new Map<number, number[]>();
  pieces.forEach((_, k) => { const g = find(k); if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(k); });
  return { pieces, sections: [...groups.values()] };
}
