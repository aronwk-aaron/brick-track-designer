// Splitting a layout the way plate-style splits theirs: into separate pieces
// whose every joint is an ordinary track end (each track cut square to
// itself, a standard end connector both sides), cut only where the track's
// base is clear of every other track's (never through points, frogs or
// crossings), plain stretches in lengths that fit the print bed.
import type { Route } from '../route/route';
import { GRADE_APART, handS, heightAt, routeLat, routeLength, routePose, routeSOf, routesBox, railPoint } from '../route/route';
import type { Split } from '../route/solver';

/** A piece of one route: [route, from, to] (arc lengths). */
export type RoutePiece = [number, number, number];
/** A route's hand cuts across it (expert mode): where, mm along it; only: it's cut by hand only, none of the app's own joints. */
export interface HandCuts { cuts: number[]; only: boolean }
/** (mm) An automatic joint nearer a hand cut than this is left out: the hand cut is the joint there. */
const HAND_CLEAR = 16;

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
/**
 * stdStraights: the lengths (mm) of straights that are track pieces of their own (bought): a stretch cut to one of those
 * may be shorter than minPart (a BrickTracks 1/10 straight, 1.6 studs). With std, plain track is cut where its pieces
 * join even beside other track (where its base meets another's: built with it, but still those pieces), clear of the
 * points and where tracks cross. lead: the short straight on a BrickTracks R104B curve (mm): one piece with the curve
 * beside it, not cut from it. fit: the longest piece of a segment (mm along it; half: its base's reach each side) that
 * goes on the print bed, turned any way (geom/bedfit.ts): with std, a printed segment whose pieces would be longer is
 * cut into shorter ones.
 */
/**
 * hand: each route's hand cuts (HandCuts, from handcuts.ts): a hand cut is a joint there exactly, as a table's seam
 * is, the pieces either side as short as they come; a route cut by hand only gets no others (but the tables' seams).
 * One in points or a crossing, or where other track's base touches its own, isn't made: listed in blocked, with why.
 */
export function planSections(routes: Route[], splits: Split[], half: number, room: number, minPart = 40, exact = 0, plates?: { size: number; x: number; y: number }, std?: Map<number, number>, stdStraights: number[] = [], lead = 0, seamOf?: (q: [number, number]) => number, gauge0?: number, fit?: (sg: Route['segments'][number], half: number) => number, hand?: (HandCuts | undefined)[]) {
  // (mixed gauges: a route with a gauge of its own reaches that much less, or more, each side than the design's (half, at gauge0))
  const halves = routes.map((rt) => (rt.gauge !== undefined && gauge0 !== undefined ? half + (rt.gauge - gauge0) / 2 : half));
  /** where a table seam crosses the track: cut there ('cut'), or not, through points or a crossing ('blocked'); 'split': cut, but between its pieces' joints (a bought piece printed in two) */
  const seams: { at: [number, number]; kind: 'blocked' | 'split' }[] = [];
  const blocked: { route: number; s: number; why: 'points' | 'beside' }[] = [];
  const boxes = routes.map((rt, i) => routesBox([rt], halves[i] + 16, 8));
  const inBox = (j: number, q: [number, number]) => q[0] >= boxes[j][0] && q[0] <= boxes[j][2] && q[1] >= boxes[j][1] && q[1] <= boxes[j][3];
  // (track on a grade: route i at s and route j where it's level with q pass one over the other, GRADE_APART or more apart in height)
  const graded = routes.some((rt) => !!rt.grade);
  const over = (i: number, s: number, j: number, q: [number, number]) => graded && Math.abs(heightAt(routes[i], s) - heightAt(routes[j], routeSOf(routes[j], q))) >= GRADE_APART;
  // the points' stretches (and a connector's length past them), where no cut goes
  const busy = routes.map(() => [] as [number, number][]);
  for (const sp of splits) sp.routes.forEach((ri, k) => busy[ri].push([sp.spans[k][0] - 24, sp.spans[k][1] + 24]));
  // (expert: check rails added by hand: no joint of the app's along one, nor within 2 studs of its ends, where the end
  // connector's row of studs would stand beside it)
  routes.forEach((rt, i) => {
    const h = rt.hand;
    for (const c of h?.checks ?? []) { const a = handS(h!, c.a), b = handS(h!, c.b); busy[i].push([Math.min(a, b) - 16, Math.max(a, b) + 16]); }
  });
  // (expert: guard rails along a stretch come to a point at its ends, 8 studs long: no joint of the app's in a point,
  // whose nose would lie over the next piece's end connector)
  routes.forEach((rt, i) => {
    const x = rt.extra;
    if (!x?.guard || !x.guardOn) return;
    const d = x.to >= x.from ? 1 : -1, loc = (v: number) => (v - x.from) * d, T = x.guardTaperStuds * 8 + 10 + 8;
    for (const g of x.guardOn) for (const e of [g.a, g.b]) { if (e <= 1e-3 || e >= x.len - 1e-3) continue; const s = loc(e), inward = (e === g.a ? 1 : -1) * d; busy[i].push([Math.min(s, s + inward * T) - 8, Math.max(s, s + inward * T) + 8]); }
  });
  // (expert: sleepers shared with the tracks beside (Route.hand.shared): no cut of the app's along there on any of
  // them, and they're one section: [route, from, to] of each)
  const held: [number, number, number][] = [];
  routes.forEach((rt, i) => {
    const h = rt.hand;
    for (const sh of h?.shared ?? []) {
      const a = Math.max(0, Math.min(handS(h!, sh.a), handS(h!, sh.b))), b = Math.min(routeLength(rt), Math.max(handS(h!, sh.a), handS(h!, sh.b)));
      if (b <= a) continue;
      const mates: [number, number, number][] = [];
      routes.forEach((r2, k) => {
        if (k === i || !sh.with.includes(r2.id.replace(/[~:]\d+$/, ''))) return;
        const pa = routePose(rt, a), pb = routePose(rt, b), sa = routeSOf(r2, [pa[0], pa[1]]), sb = routeSOf(r2, [pb[0], pb[1]]);
        // (beside it there: within three sleepers' lengths of it)
        if (Math.abs(routeLat(r2, [pa[0], pa[1]])) < 6 * halves[i] || Math.abs(routeLat(r2, [pb[0], pb[1]])) < 6 * halves[i]) mates.push([k, Math.min(sa, sb), Math.max(sa, sb)]);
      });
      if (mates.length) held.push([i, a, b], ...mates);
    }
  });
  const isHeld = (i: number, s: number) => held.some(([k, a, b]) => k === i && s >= a - 8 && s <= b + 8);
  /** Can route i be cut square at s: its base there (and a connector's depth either side) clear of every other track's base? */
  const free = (i: number, s: number) => {
    const L = routeLength(routes[i]);
    if (s < minPart || s > L - minPart || busy[i].some(([a, b]) => s >= a && s <= b) || isHeld(i, s)) return false;
    return clear(i, s);
  };
  /** Is route i's base at s (and a connector's depth either side) clear of every other track's base? */
  const clear = (i: number, s: number) => {
    const rt = routes[i];
    for (const ds of [-10, 0, 10]) for (let o = -halves[i]; o <= halves[i] + 1e-9; o += 8) {
      const q = railPoint(rt, s + ds, o);
      for (let j = 0; j < routes.length; j++) if (j !== i && inBox(j, q) && Math.abs(routeLat(routes[j], q)) < halves[j] + 2 && !over(i, s + ds, j, q)) return false;
    }
    return true;
  };
  // (where another track crosses this one, or runs within a few studs of it, at s: no joint between pieces there)
  const nearCross = (i: number, s: number) => {
    for (let ds = -24; ds <= 24; ds += 8) {
      const q = railPoint(routes[i], s + ds, 0);
      for (let j = 0; j < routes.length; j++) if (j !== i && inBox(j, q) && Math.abs(routeLat(routes[j], q)) < 24 && !over(i, s + ds, j, q)) return true;
    }
    return false;
  };
  // (a printed segment's pieces: exact long, or shorter where that's too long for the bed however it's turned (fit):
  // a straight in whole studs, a curve in equal pieces, so its joints are ordinary track ends, not cuts made after)
  const eachOf = (sg: Route['segments'][number], len: number, hw: number) => {
    const cap = fit ? fit(sg, hw) : Infinity, piece = Math.min(len, exact);
    if (!(cap > 0) || piece <= cap) return exact;
    return sg.kind === 'straight' ? Math.max(minPart, Math.floor(cap / 8) * 8) : piece / Math.ceil(piece / cap);
  };
  const pieces: RoutePiece[] = [];
  routes.forEach((rt, i) => {
    const L = routeLength(rt), step = 8, cuts: number[] = [], hd = hand?.[i];
    // (its pieces' joints, when they're track pieces of their own (std): each segment on from its start, a straight every
    // exact, such a curve every piece's angle)
    const nat = new Set<number>();
    if (std && exact > 0 && !hd?.only) {
      let s0 = 0;
      const isLead = (k: number) => { const g = rt.segments[k]; return !!g && lead > 0 && g.kind === 'straight' && Math.abs(g.length - lead) < 0.01; };
      const isR104 = (k: number) => { const g = rt.segments[k]; return !!g && g.kind === 'arc' && Math.abs(g.radius - 104 * 8) < 0.01; };
      rt.segments.forEach((sg, k) => {
        const len = sg.kind === 'straight' ? sg.length : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180;
        const r = sg.kind === 'arc' ? [...std.keys()].find((k2) => Math.abs(k2 - sg.radius) < 0.01) : undefined;
        const each = r !== undefined ? (std.get(r)! * Math.PI * r) / 180 : eachOf(sg, len, halves[i]);
        // (an R104B: its short straight and the curve beside it one piece)
        const joined = (isLead(k) && isR104(k - 1)) || (isR104(k) && isLead(k - 1));
        for (let c2 = s0; c2 < s0 + len - 1e-6; c2 += each) if (c2 > 1e-6 && !(c2 === s0 && joined)) nat.add(c2);
        s0 += len;
      });
    }
    // (a stretch from a to b that's one straight piece of its own)
    const stdPiece = (a: number, b: number) => {
      if (!stdStraights.some((l) => Math.abs(b - a - l) < 0.01)) return false;
      let s0 = 0;
      for (const sg of rt.segments) { const len = sg.kind === 'straight' ? sg.length : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180; if (a >= s0 - 1e-6 && b <= s0 + len + 1e-6) return sg.kind === 'straight'; s0 += len; }
      return false;
    };
    // free stretches along it (on the stud grid from its start)
    const ok: boolean[] = [];
    // (cut by hand only: no stretch is free for the app's own cuts)
    for (let s = 0; s <= L; s += step) ok.push(!hd?.only && free(i, s));
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
            const each = r !== undefined ? (std.get(r)! * Math.PI * r) / 180 : eachOf(sg, len, halves[i]);
            at.push(s0);
            for (let c2 = s0 + each; c2 < s0 + len - 1e-6; c2 += each) at.push(c2);
            s0 += len;
          }
          return at;
        })() : undefined;
        // (a and b cuts only where points or a crossing end the stretch, not at the route's own ends' margins)
        // (only where its pieces join: beside the points or other track too (below), so what's built with them is whole pieces)
        if (natural) { for (const c2 of natural) if (c2 > a + 1e-6 && c2 < b - 1e-6) cuts.push(c2); }
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
    // (and its pieces' joints beside other track too, clear of the points and of track crossing it)
    for (const c2 of nat) if (!busy[i].some(([a, b]) => c2 >= a && c2 <= b) && !nearCross(i, c2) && !isHeld(i, c2)) cuts.push(c2);
    // (and where it crosses a table's seam: there exactly (on its pieces' joint, if that's within 3 mm: tables don't meet
    // that exactly, nor bought track lie on them so), unless
    // that's in points or a crossing; the pieces either side may be short, as a joint's can)
    const seamAt = new Set<number>();
    if (seamOf) {
      const at = (sv: number) => { const q = routePose(rt, sv); return seamOf([q[0], q[1]]); };
      for (let s2 = 2; s2 <= L; s2 += 2) {
        if (at(s2 - 2) === at(s2)) continue;
        let lo = s2 - 2, hi = s2;
        for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (at(m) === at(lo)) lo = m; else hi = m; }
        const q = routePose(rt, hi), pt: [number, number] = [q[0], q[1]];
        if (hi < 1 || hi > L - 1) continue;
        if (busy[i].some(([a, b]) => hi >= a && hi <= b) || nearCross(i, hi)) { seams.push({ at: pt, kind: 'blocked' }); continue; }
        // (or on a cut it has already, a printed piece's end: a seam found a hair past one (256.000000002 for 256) made a
        // piece of no length there, and its build never ended)
        const j = [...nat, ...cuts].find((c2) => Math.abs(c2 - hi) < 3);
        if (j !== undefined) { nat.add(j); cuts.push(j); seamAt.add(j); continue; }
        nat.add(hi); cuts.push(hi); seamAt.add(hi);
        if (std && exact > 0) seams.push({ at: pt, kind: 'split' });
      }
    }
    // (its hand cuts: there exactly, the pieces either side as short as they come; not in points or a crossing, nor
    // where other track's base touches its own (the two are one part there: no ordinary end to make))
    const mine: number[] = [];
    for (const c2 of hd?.cuts ?? []) {
      if (!(c2 > 1 && c2 < L - 1)) continue;
      if (busy[i].some(([a, b]) => c2 >= a && c2 <= b)) blocked.push({ route: i, s: c2, why: 'points' });
      else if (!clear(i, c2) || isHeld(i, c2)) blocked.push({ route: i, s: c2, why: 'beside' });
      else { mine.push(c2); nat.add(c2); seamAt.add(c2); }
    }
    // (and no joint of the app's own within two studs of one: the hand cut is the joint there)
    if (mine.length) { const kept = cuts.filter((c) => seamAt.has(c) || !mine.some((h) => Math.abs(h - c) < HAND_CLEAR - 1e-6)); cuts.length = 0; cuts.push(...kept, ...mine); }
    const cs = [...new Set(cuts)].filter((c) => (c >= minPart && c <= L - minPart) || (nat.has(c) && c > 1 && c < L - 1)).sort((p, q) => p - q);
    let s0 = 0;
    const mine0 = pieces.length;
    // (never a piece of next to no length, whatever asks for a cut there)
    for (const c of cs) { if (c - s0 >= minPart || (c - s0 > 0.5 && nat.has(c) && (stdPiece(s0, c) || seamAt.has(c) || seamAt.has(s0)))) { pieces.push([i, s0, c]); s0 = c; } }
    // (a last stretch too short to be a piece, and not one of its own: on the one before)
    if (L - s0 < minPart && !stdPiece(s0, L) && !seamAt.has(s0) && pieces.length > mine0) s0 = pieces.pop()![1];
    pieces.push([i, s0, L]);
  });
  // sections: pieces whose bases overlap (union-find)
  const parent = pieces.map((_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  // (its base: points across it, every 6 mm along it, kept a hair inside its cut ends)
  const samples = pieces.map(([i, a, b]) => {
    const n = Math.max(1, Math.ceil((b - a) / 6)), out: [number, number][] = [];
    for (let k = 0; k <= n; k++) for (let o = -halves[i]; o <= halves[i] + 1e-9; o += 8) out.push(railPoint(routes[i], a + 0.5 + ((b - a - 1) * k) / n, o));
    return out;
  });
  const sAt = (i: number, q: [number, number]) => {
    // (the arc length along route i level with q: its nearest point)
    return routeSOf(routes[i], q);
  };
  for (let p = 0; p < pieces.length; p++) for (let r = p + 1; r < pieces.length; r++) {
    const [ip] = pieces[p], [ir, ar, br] = pieces[r];
    if (find(p) === find(r)) continue;
    if (ip === ir) continue; // (two pieces of one track join only at an ordinary end)
    const hit = samples[p].some((q) => inBox(ir, q) && Math.abs(routeLat(routes[ir], q)) < halves[ir] && (() => { const s = sAt(ir, q); return s >= ar - 1 && s <= br + 1; })() && !over(ir, sAt(ir, q), ip, q));
    if (hit) parent[find(p)] = find(r);
  }
  // (and two tracks' pieces that meet end to end where one's points begin (within a connector's length of the joint: a
  // straight running on into a wye's toe): built together, the track one through there. Apart, the points' end had no
  // room for its connector: their stock rails and bed ran through it, into the next piece)
  const ends = pieces.flatMap(([i, a, b], k) => { const L = routeLength(routes[i]); return [...(a < 1e-6 ? [{ k, i, s: 0 }] : []), ...(b > L - 1e-6 ? [{ k, i, s: L }] : [])]; });
  const atPoints = (e: { i: number; s: number }) => busy[e.i].some(([a, b]) => e.s >= a && e.s <= b);
  for (const e of ends) for (const f of ends) {
    if (e.i >= f.i || find(e.k) === find(f.k) || !(atPoints(e) || atPoints(f))) continue;
    const p = routePose(routes[e.i], e.s), q = routePose(routes[f.i], f.s);
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1 && Math.abs(Math.sin(((p[2] - q[2]) * Math.PI) / 180)) < 0.02 && !over(e.i, e.s, f.i, [q[0], q[1]])) parent[find(e.k)] = find(f.k);
  }
  // (expert: tracks that share sleepers are one section there; and a sleeper made longer by hand that reaches onto
  // another track's base is built with it)
  for (let n = 0; n < held.length; n++) for (let m = n + 1; m < held.length; m++) {
    const [i, a, b] = held[n], [j, c, e] = held[m];
    if (i === j) continue;
    pieces.forEach(([pi, pa, pb], p) => { if (pi !== i || pb < a || pa > b) return; pieces.forEach(([ri, ra, rb], r) => { if (ri === j && rb >= c && ra <= e && find(p) !== find(r)) parent[find(p)] = find(r); }); });
  }
  pieces.forEach(([i, a, b], p) => {
    const h = routes[i].hand;
    for (const sl of h?.sleepers ?? []) {
      const fwd = h!.to >= h!.from, v = handS(h!, sl.at) + (fwd ? 1 : -1) * (sl.move ?? 0);
      if (v < a || v > b || sl.off) continue;
      for (const [len, sd] of [[fwd ? sl.left : sl.right, -1], [fwd ? sl.right : sl.left, 1]] as [number | undefined, number][]) for (let o = 4; o <= (len ?? 0); o += 4) {
        const q = railPoint(routes[i], v, sd * (halves[i] + o));
        pieces.forEach(([ri, ra, rb], r) => { if (ri !== i && find(p) !== find(r) && inBox(ri, q) && Math.abs(routeLat(routes[ri], q)) < halves[ri] && (() => { const s = sAt(ri, q); return s >= ra - 1 && s <= rb + 1; })()) parent[find(p)] = find(r); });
      }
    }
  });
  const groups = new Map<number, number[]>();
  pieces.forEach((_, k) => { const g = find(k); if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(k); });
  return { pieces, sections: [...groups.values()], seams, blocked };
}
