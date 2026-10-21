// Big layouts in tiles: where a piece is to be cut (to fit the print bed, or
// at baseplate edges), each part is built on its own from only the track
// near it, then cut to its cell with the joints. A whole yard as one solid
// runs the geometry kernel out of memory; tiles keep each build small, and
// an edit rebuilds only the tiles it touches.
import type { CheckRail } from '../route/solver';
import type { Route } from '../route/route';
import { routeLength, routePose } from '../route/route';
import { subRoute } from '../switch/pieces';
import type { Keep } from '../geom/pathsplit';

export type Rect = [number, number, number, number]; // x0, y0, x1, y1

/** The box round some routes' centre lines, grown by pad. */
export function routesBox(routes: Route[], pad: number): Rect {
  const b: Rect = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rt of routes) {
    const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 4));
    for (let k = 0; k <= n; k++) {
      const p = routePose(rt, (L * k) / n);
      b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
    }
  }
  return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
}

export interface CutPlan { xs: number[]; ys: number[]; why: 'bed' | 'baseplate'; /** which of them are baseplate edges (always joined with peg and clip) */ edges?: Set<number>; /** which run along the track: interlocking fingers (4DBrix's) */ combs?: Set<number> }

/** The shortest part a cut may leave (mm): no slivers of track. */
const MIN_PART = 40;
/** Cuts on one axis, sorted, none leaving a part shorter than MIN_PART (keeping the ones in keep first, the baseplate edges). */
function spaced(cuts: number[], lo: number, hi: number, keep: Set<number> = new Set()): number[] {
  const sorted = [...new Set(cuts)].sort((p, q) => p - q).filter((v) => v - lo >= MIN_PART && hi - v >= MIN_PART);
  const out: number[] = [];
  for (const v of sorted) {
    const prev = out[out.length - 1];
    if (prev === undefined || v - prev >= MIN_PART) out.push(v);
    else if (keep.has(v) && !keep.has(prev)) out[out.length - 1] = v; // (an edge over a cut across the plate)
  }
  return out;
}

/**
 * Where to cut a piece in box b: across, into equal parts that fit the print
 * bed (the way that needs fewest cuts, joints mm short for what the joints add, moved
 * off points and frogs); or at the baseplate edges (bp mm, from ox, oy), and
 * across any baseplate bigger than the bed, on the stud grid.
 */
export function planCuts(b: Rect, bedX: number, bedY: number, bp: number, ox: number, oy: number, avoid: Keep[],
  routes: Route[] = [], half = 40, joints = 8, railG = 20, crossings: [number, number][] = []): CutPlan {
  const xs: number[] = [], ys: number[] = [];
  // How much of the track a cut would run along, not across (mm): a cut
  // must go across the track, never down it (that splits the rails and the
  // bed lengthwise). Points and frogs are kept clear too.
  const samples = routes.flatMap((rt) => {
    const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 4));
    return Array.from({ length: n + 1 }, (_, k) => routePose(rt, (L * k) / n));
  });
  const along = (v: number, axis: 0 | 1) => {
    let mm = 0;
    for (const p of samples) {
      // (heading 0 runs along +y: an x cut (axis 0) runs along it when the heading is near 0 or 180)
      const h = ((p[2] % 180) + 180) % 180, alongY = h < 45 || h > 135;
      if (Math.abs(p[axis] - v) < half + 4 && (axis === 0 ? alongY : !alongY)) mm += 4;
    }
    return mm;
  };
  // (clear of the points' keep-outs (32 mm unless they say); of a crossing's rail crossings by 12, so a crossover's middle can still be cut evenly)
  const clearOf = (v: number, axis: 0 | 1) => avoid.every((q) => Math.abs(q[axis] - v) > (q[3] ?? 32));
  const ok = (v: number, axis: 0 | 1) => along(v, axis) <= 8 && clearOf(v, axis) && crossings.every((q) => Math.abs(q[axis] - v) > 12);
  /** Can a finger cut go along the track at v: no rail running along within 12 mm of it, clear of points and crossings? */
  /** How close (mm) the nearest rail running along comes to a finger cut at v (and whether it's clear of points and crossings). */
  const railClear = (v: number, axis: 0 | 1) => {
    let near = Infinity;
    for (const p of samples) {
      const h = ((p[2] % 180) + 180) % 180, alongY = h < 45 || h > 135;
      if (axis === 0 ? !alongY : alongY) continue;
      const c = axis === 0 ? Math.cos((p[2] * Math.PI) / 180) : Math.sin((p[2] * Math.PI) / 180);
      for (const sd of [-1, 1]) near = Math.min(near, Math.abs(p[axis] + sd * railG * Math.abs(c) - v));
    }
    return clearOf(v, axis) ? near : -1;
  };
  const combs = new Set<number>();
  /** The nearest place to v (within reach, on the 8 mm grid from v) a cut can go; undefined: nowhere near. */
  const place = (v: number, axis: 0 | 1, reach: number) => {
    for (let dv = 0; dv <= reach; dv += 8) for (const sg of dv ? [1, -1] : [1]) if (ok(v + sg * dv, axis)) return v + sg * dv;
    return undefined;
  };
  /**
   * Even parts: where to cut between lo and hi (on the stud grid, only
   * where a cut can go across the track) so that, in order: as few parts as
   * possible are longer than len (and by as little as possible), there are
   * as few parts as can be, and they're as even as can be (least sum of
   * squared lengths). undefined: nowhere to cut at all, when one is needed.
   */
  const evenCuts = (lo: number, hi: number, len: number, axis: 0 | 1): number[] | undefined => {
    if (hi - lo <= len) return [];
    const cand = [lo];
    for (let v = Math.ceil((lo + MIN_PART) / 8) * 8; v <= hi - MIN_PART; v += 8) if (ok(v, axis)) cand.push(v);
    cand.push(hi);
    if (cand.length === 2) return undefined;
    type C = [number, number, number]; // over (mm too long), parts, sum of squares
    const less = (a: C, b: C) => a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];
    const best: (C | undefined)[] = cand.map(() => undefined), prev = cand.map(() => -1);
    best[0] = [0, 0, 0];
    for (let k = 1; k < cand.length; k++) for (let i = 0; i < k; i++) {
      const bi = best[i]; if (!bi) continue;
      const l = cand[k] - cand[i];
      if (l < MIN_PART && !(i === 0 && k === cand.length - 1)) continue;
      const c: C = [bi[0] + Math.max(0, l - len), bi[1] + 1, bi[2] + l * l];
      if (!best[k] || less(c, best[k]!)) { best[k] = c; prev[k] = i; }
    }
    const out: number[] = [];
    for (let k = prev[cand.length - 1]; k > 0; k = prev[k]) out.push(cand[k]);
    return out.reverse();
  };
  if (!bp) {
    const W = b[2] - b[0], H = b[3] - b[1], room = Math.max(bedX, bedY) - joints, small = Math.min(bedX, bedY) - joints;
    const nx = Math.max(1, Math.ceil(W / (H > W ? small : room))), ny = Math.max(1, Math.ceil(H / (H > W ? room : small)));
    // (each part as long as fits: the next cut as far on as the bed allows
    // where it goes across the track, on the stud grid; then evened out
    // where there's room)
    const greedy = (lo: number, hi: number, len: number, axis: 0 | 1, n: number) => {
      const out: number[] = [];
      let p = lo;
      while (hi - p > len) {
        let got: number | undefined;
        // (aim for even parts, but go as far as fits if that's what it takes)
        const even = p + (hi - p) / Math.max(1, n - out.length);
        for (const v0 of [even, p + len]) {
          for (let v = Math.floor(Math.min(v0, p + len) / 8) * 8; v >= p + MIN_PART && got === undefined; v -= 8) if (ok(v, axis)) got = v;
          if (got !== undefined) break;
        }
        // (no way across the track there: along it, with fingers, as 4DBrix's wide pieces are split)
        // (where the rails are furthest off, between tracks if it can, else nearest an even split)
        if (got === undefined) {
          let best = -1;
          for (let v = Math.floor((p + len) / 8) * 8; v >= p + MIN_PART; v -= 8) {
            const cl = railClear(v, axis);
            if (cl >= 12 && (cl > best + 0.5 || (Math.abs(cl - best) <= 0.5 && got !== undefined && Math.abs(v - even) < Math.abs(got - even)))) { best = cl; got = v; }
          }
          if (got !== undefined) combs.add(got);
        }
        // (nowhere within the bed's length: the nearest place past it, the part a little long, split again later if it can be)
        if (got === undefined) for (let v = Math.ceil((p + len) / 8) * 8; v <= hi - MIN_PART && got === undefined; v += 8) if (ok(v, axis)) got = v;
        if (got === undefined) break; // (no way at all: warned about once it's built)
        out.push(got); p = got;
      }
      return out;
    };
    xs.push(...(evenCuts(b[0], b[2], H > W ? small : room, 0) ?? greedy(b[0], b[2], H > W ? small : room, 0, nx)));
    ys.push(...(evenCuts(b[1], b[3], H > W ? room : small, 1) ?? greedy(b[1], b[3], H > W ? room : small, 1, ny)));
    return { xs: spaced(xs, b[0], b[2]), ys: spaced(ys, b[1], b[3]), why: 'bed', combs };
  }
  // (the baseplate edges are where they are; the cuts across a baseplate too
  // big for the bed move to go across the track, or are left out)
  const kk = Math.max(1, Math.ceil(bp / (Math.min(bedX, bedY) - joints)));
  const sub = Array.from({ length: kk }, (_, i) => Math.round((i * bp) / kk / 8) * 8);
  const edges = new Set<number>();
  const add = (out: number[], v: number, axis: 0 | 1, edge: boolean, lo: number, hi: number) => {
    const w = edge ? v : place(v, axis, bp / kk / 2);
    if (w !== undefined && w > lo + 1 && w < hi - 1) { out.push(w); if (edge) edges.add(w); }
  };
  // (each plate's stretch cut evenly between its edges where it can be, else at the plate's own even places)
  const room2 = Math.min(bedX, bedY) - joints;
  for (const [axis, lo0, hi0, o0, out] of [[0, b[0], b[2], ox, xs], [1, b[1], b[3], oy, ys]] as [0 | 1, number, number, number, number[]][]) {
    for (let e = o0 + Math.floor((lo0 - o0) / bp) * bp; e < hi0 - 1; e += bp) {
      add(out, e, axis, true, lo0, hi0);
      const lo = Math.max(lo0, e), hi = Math.min(hi0, e + bp);
      const ev = evenCuts(lo, hi, room2, axis);
      if (ev) out.push(...ev); else for (const d of sub.slice(1)) add(out, e + d, axis, false, lo0, hi0);
    }
  }
  return { xs: spaced(xs, b[0], b[2], edges), ys: spaced(ys, b[1], b[3], edges), why: 'baseplate', edges };
}

/**
 * Blocks of cells to build together, each up to about `size` mm across (an
 * outer block's open side counted from the box): the cuts inside a block are
 * made from one build of it, so fewer, bigger builds, as long as each stays
 * small enough for the kernel.
 */
export function blocks(plan: CutPlan, b: Rect, size: number, far = 1000): Rect[] {
  const group = (cuts: number[], lo: number, hi: number) => {
    const xs = [...cuts].sort((p, q) => p - q), out = [lo - far];
    let start = lo;
    xs.forEach((x, k) => { const next = k + 1 < xs.length ? xs[k + 1] : hi; if (next - start > size) { out.push(x); start = x; } });
    return [...out, hi + far];
  };
  const X = group(plan.xs, b[0], b[2]), Y = group(plan.ys, b[1], b[3]), out: Rect[] = [];
  for (let j = 0; j + 1 < Y.length; j++) for (let i = 0; i + 1 < X.length; i++) out.push([X[i], Y[j], X[i + 1], Y[j + 1]]);
  return out;
}

/**
 * The routes near a cell: each route's stretch whose centre line comes within
 * margin of it (first to last, as one stretch), as new routes. map: each
 * design route's index among them (-1: not near). inner: the ends made by
 * cropping (no connector there: they lie in the margin, which is cut off).
 * checks: the solver's check rails, on the cropped routes.
 */
export function cropRoutes(routes: Route[], cell: Rect, margin: number, checks: CheckRail[]) {
  const out: Route[] = [], map: number[] = [], ranges: [number, number][] = [], inner = new Set<string>();
  const near = (p: [number, number, number]) => p[0] >= cell[0] - margin && p[0] <= cell[2] + margin && p[1] >= cell[1] - margin && p[1] <= cell[3] + margin;
  routes.forEach((rt) => {
    const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 2));
    let a = Infinity, b = -Infinity;
    for (let k = 0; k <= n; k++) { const s = (L * k) / n; if (near(routePose(rt, s))) { a = Math.min(a, s); b = Math.max(b, s); } }
    if (!(b > a)) { map.push(-1); return; }
    a = Math.max(0, a - 2); b = Math.min(L, b + 2);
    if (a < 1e-6) a = 0;
    if (b > L - 1e-6) b = L;
    const k = out.length;
    map.push(k); ranges.push([a, b]);
    out.push(a === 0 && b === L ? rt : { ...subRoute(rt, a, b), throwSide: rt.throwSide });
    if (a > 0) inner.add(`${k}:start`);
    if (b < L) inner.add(`${k}:end`);
  });
  const cropChecks = checks.flatMap((cr) => {
    const k = map[cr.route];
    if (k < 0) return [];
    const [a, b] = ranges[k], s0 = Math.max(cr.s0, a), s1 = Math.min(cr.s1, b);
    return s1 > s0 ? [{ ...cr, route: k, s0: s0 - a, s1: s1 - a }] : [];
  });
  return { routes: out, map, ranges, inner, checks: cropChecks };
}

/** Does a manifold's box come within the margin of a cell? */
export const nearCell = (bb: { min: number[]; max: number[] }, cell: Rect, margin: number) =>
  bb.max[0] >= cell[0] - margin && bb.min[0] <= cell[2] + margin && bb.max[1] >= cell[1] - margin && bb.min[1] <= cell[3] + margin;
