// Can what's built be put together, and does it work? Every template, built with the app's own defaults
// (setup-defaults.ts APP_DEFAULTS), its parts as assembled (each piece's positions):
// 1. nothing overlaps: every pair of parts, printed or bought, shares less than OVERLAP (overlaps; what may: mayShare);
// 2. the moving parts work across their travel: blades, sliders and levers, in steps, clear of everything, each driving the next (moves);
// 3. each moving part can be put in, the way it's built to go (assembly.shared.ts putTogether);
// 4. joints mate: any two track parts that touch can be drawn apart some straight way, and so brought together (mates);
// 5. every printed part prints: its file fits the print bed, lies on it (z 0) and is one solid (but for its break-out supports) (prints).
// 6. every part's name is its own (its file's name in the zip).
// (Rebuilt from a piece's triangles a solid can have slivers the kernel's own didn't: hence a small volume, not none.)
// What isn't checked: track parts going down onto a baseplate's studs; axle joints' holes lining up (no template has
// them). (An over-centre spring going on over its pins and bending as the slider moves: nail-switch.test.ts.)
import { expect, it } from 'vitest';
import { arena, kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache, type Piece } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATE_GROUPS, TEMPLATES } from '../src/app/design';
import { putTogether, stlPositions } from './assembly.shared';

type Wasm = Awaited<ReturnType<typeof kernel>>;
type Man = InstanceType<Wasm['Manifold']>;
const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

/** (mm3) Two parts share less than this as assembled. */
export const OVERLAP = 0.5;

/** A solid from triangles (a piece's positions, or its file's); undefined where they don't close (a bought piece's stand-in boxes). */
export function solid(w: Wasm, P: Float32Array): Man | undefined {
  if (!P.length) return undefined;
  try {
    const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) });
    mesh.merge();
    const m = new w.Manifold(mesh);
    return m.status() === 'NoError' && m.volume() > 0 ? m : undefined;
  } catch { return undefined; }
}
/** A solid let go (not one already let go; nor after the kernel's stopped: what stopped it is what's said). */
export const drop = (m: Man) => { try { if (!(m as unknown as { isDeleted?: () => boolean }).isDeleted?.()) m.delete(); } catch { /* (stopped) */ } };
const boxesMeet = (a: Man, b: Man, by = 0) => { const p = a.boundingBox(), q = b.boundingBox(); return [0, 1, 2].every((k) => p.min[k] <= q.max[k] + by && q.min[k] <= p.max[k] + by); };

/** Where a solid is, for a message: its box's middle and size. */
export const where = (m: Man) => { const b = m.boundingBox(); return `at ${[0, 1, 2].map((k) => ((b.min[k] + b.max[k]) / 2).toFixed(1)).join(', ')} (${[0, 1, 2].map((k) => (b.max[k] - b.min[k]).toFixed(1)).join(' x ')})`; };

export interface Part { p: Piece; m: Man }
/**
 * What a big layout's strips have looked at already (assembledProblems): a pair of parts is the same two solids
 * whichever strip loads them, so it's compared once; a set of points is worked in the strips that hold a part of it
 * (own), where everything within ROUND of it is loaded, not again in the next strip's margin.
 */
export interface Seen { pair: (what: string, a: Piece, b: Piece) => boolean; own: (p: Piece) => boolean }
/** The pieces as solids, as assembled. unsolid: the ones whose triangles don't make one. */
export function parts(w: Wasm, pieces: Piece[]) {
  const out: Part[] = [], unsolid: string[] = [];
  for (const p of pieces) { const m = solid(w, p.positions); if (m) out.push({ p, m }); else if (p.positions.length) unsolid.push(p.name); }
  return { parts: out, unsolid };
}

/** (mm3) Less than this isn't material: a solid made again from its triangles touches itself along edges, and two of them share such slivers. */
const SLIVER = 0.01;
/** A part's set of points ('points2', 'switch'), and what it is there. */
const setOf = (name: string) => name.replace(/-(a|b|throw\d*|throw\d*-posts|lever\d*|spring|bracket\d*|lid)$/, '').replace(/-points(\d*)$/, '$1') + (/-(?:throw|lever|bracket)(\d+)/.exec(name)?.[1] ?? '');
const isMoving = (name: string) => /points|throw|lever|bracket|spring/.test(name) && !/lid$|^monorail/.test(name);
/**
 * What two parts may share as assembled, a body of it at a time (b: its box's size, v its volume); else nothing over a sliver.
 * - Track part to track part, the peg in its clip: the peg widens upward (1.9 to 2.1) and its socket narrows (2.1 to
 *   1.9), as LEGO track's, so it snaps in: up to 3 mm3 a peg (0.1 round its upper half: 1.5 at a track's own end, where the clip wraps half of it; at a cut's, all round it, 2.4 to 2.9 as found), no bigger than the peg.
 * - A closed sprung blade and its own slider: the post is modelled pressed into the blade's spring by the preload
 *   (1 mm, the spring bent by it): the post's width by the beam's height (1.4) by the preload, up to 3 mm3.
 */
function mayShare(A: Piece, B: Piece, size: number[], v: number, o: PieceOptions, total: number) {
  // (raised track on its beam, or on bought risers: the track's shown tilted to its grade, the beam's level, so the
  // track's low side is in the beam's top by a wedge: the beam's 16 along under track 64 wide, turning about its
  // middle: 64 x 16 x 16 / 8 x the slope, 51 mm3 at 2.5%; said where it's over that)
  const [tr, su] = /^track-support|^risers-bought/.test(A.name) ? [B, A] : [A, B];
  if (/^track-support|^risers-bought/.test(su.name) && tr.lift) return total <= 64 * 32 * Math.abs(tr.lift.slope) + OVERLAP;
  // (a bought switch is shown as a slab of its footprint, a plate thick: its ends' connectors aren't modelled, so it and
  // the bought track at its ends aren't compared)
  if (A.lego && B.lego && (/^switch-bought/.test(A.name) || /^switch-bought/.test(B.name))) return true;
  if (!isMoving(A.name) && !isMoving(B.name)) return v <= 3 && size[2] <= 3.3 && Math.max(size[0], size[1]) <= 4.4;
  const [bl, th] = /throw/.test(A.name) ? [B, A] : [A, B];
  if (bl.turn && /throw\d*$/.test(th.name) && setOf(bl.name) === setOf(th.name)) return v <= 3 * (o.springPreload ?? 1) && size[2] <= 1.5;
  return false;
}

/** 1. As assembled, no two parts overlap: each pair that does, by how much and where. */
export function overlaps(w: Wasm, ps: Part[], o: PieceOptions, seen?: Seen) {
  const out: string[] = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    if (!boxesMeet(ps[i].m, ps[j].m) || seen?.pair('overlap', ps[i].p, ps[j].p)) continue;
    // (each pair's solids let go as it's done: a big layout's ran the kernel out of memory)
    arena(w, () => {
    const x = ps[i].m.intersect(ps[j].m);
    if (x.volume() <= SLIVER) return;
    const bodies = x.decompose().filter((q) => q.volume() > SLIVER);
    const bad = bodies.filter((q) => { const bb = q.boundingBox(); return !mayShare(ps[i].p, ps[j].p, [0, 1, 2].map((k) => bb.max[k] - bb.min[k]), q.volume(), o, x.volume()); });
    const slivers = x.volume() - bodies.reduce((t, q) => t + q.volume(), 0), v = bad.reduce((t, q) => t + q.volume(), 0) + slivers;
    if (v > OVERLAP) out.push(`${ps[i].p.name} and ${ps[j].p.name} overlap: ${v.toFixed(2)} mm3 ${bad.length ? where(bad.sort((p, q) => q.volume() - p.volume())[0]) : '(slivers)'}`);
    }, () => []);
  }
  return out;
}

const turned = (m: Man, at: [number, number], deg: number) => m.translate([-at[0], -at[1], 0]).rotate([0, 0, deg]).translate([at[0], at[1], 0]);
const slid = (m: Man, sl: NonNullable<Piece['slide']>, d: number) => m.translate([sl.dir[0] * d, sl.dir[1] * d, 0]);
const hinged = (m: Man, h: NonNullable<Piece['hinge']>, deg: number) => {
  const phi = (Math.atan2(-h.axis[0], h.axis[1]) * 180) / Math.PI;
  return m.translate([-h.at[0], -h.at[1], -h.at[2]]).rotate([0, 0, -phi]).rotate([0, deg, 0]).rotate([0, 0, phi]).translate(h.at);
};
/** How much two solids share, slivers aside (mm3). */
const shared = (a: Man, b: Man) => { if (!boxesMeet(a, b)) return 0; const x = a.intersect(b), v = x.volume(); return v <= SLIVER ? 0 : x.decompose().reduce((t, q) => t + (q.volume() > SLIVER ? q.volume() : 0), 0); };
/** The steps of a move from as assembled to its other end, as fractions of it. */
const STEPS = [0.25, 0.5, 0.75, 1];

/**
 * 2. The moving parts work across their travel. Each set of points: its blades turned from as assembled to their other
 * end (turn.swing, about turn.at), its slider slid (slide), its lever swung (hinge), in steps:
 * - a blade, wherever it is, clear of the track, of the other sets' parts, and of its own set's other blade moved as far;
 * - the slider clear of everything but its own blades, lever and spring;
 * - the lever clear of everything but its slider; and with the slider where its tip puts it (the tip's swing is the
 *   slider's travel), clear of that too, its tip free in the fork; left behind, it's in the fork's side: it drives it;
 * - a blade follows the slider: at each step there's an angle of its swing where it shares no more with the slider than at
 *   rest (the preload, sprung; nothing, rigid), and left where it was as the slider goes to its other end, its post runs into it.
 * (The over-centre spring bends as the slider moves: checked here as assembled only; along its travel in nail-switch.test.ts.)
 */
export function moves(w: Wasm, ps: Part[], o: PieceOptions, seen?: Seen) {
  const out: string[] = [];
  const sets = new Map<string, Part[]>();
  for (const q of ps) if (isMoving(q.p.name)) { const k = setOf(q.p.name); sets.set(k, [...(sets.get(k) ?? []), q]); }
  for (const [, mine] of sets) if (!seen || mine.some((q) => seen.own(q.p))) arena(w, () => {
    const others = ps.filter((q) => !mine.includes(q)), blades = mine.filter((q) => q.p.turn?.swing), throws = mine.filter((q) => q.p.slide);
    const lever = mine.find((q) => q.p.hinge), bar = throws.find((q) => /throw\d*$/.test(q.p.name));
    const hits = (m: Man, name: string, what: string, against: Part[]) => {
      for (const q of against) { const v = shared(m, q.m); if (v > OVERLAP) { out.push(`${name} ${what}: ${v.toFixed(2)} mm3 in ${q.p.name}`); return; } }
    };
    for (const f of STEPS) {
      const bl = blades.map((q) => turned(q.m, q.p.turn!.at, q.p.turn!.swing! * f));
      blades.forEach((q, k) => hits(bl[k], q.p.name, `turned ${(q.p.turn!.swing! * f).toFixed(1)} degrees`, [...others, ...blades.filter((_, j) => j > k).map((r, j) => ({ p: r.p, m: bl[k + 1 + j] }))]));
      for (const q of throws) hits(slid(q.m, q.p.slide!, q.p.slide!.by * f), q.p.name, `slid ${(q.p.slide!.by * f).toFixed(1)} mm`, [...others, ...mine.filter((r) => /bracket/.test(r.p.name))]);
      if (lever) hits(hinged(lever.m, lever.p.hinge!, lever.p.hinge!.by * f), lever.p.name, `swung ${(lever.p.hinge!.by * f).toFixed(1)} degrees`, [...others, ...mine.filter((r) => /bracket/.test(r.p.name))]);
    }
    if (lever && bar) {
      const h = lever.p.hinge!, sl = bar.p.slide!, a0 = (-h.by / 2) * (Math.PI / 180), at = (f: number) => (sl.by * (Math.sin(a0) - Math.sin(a0 + (h.by * f * Math.PI) / 180))) / (2 * Math.sin(a0));
      for (const f of [0, ...STEPS]) { const v = shared(hinged(lever.m, h, h.by * f), slid(bar.m, sl, at(f))); if (v > OVERLAP) { out.push(`${lever.p.name} swung ${(h.by * f).toFixed(1)} degrees: ${v.toFixed(2)} mm3 in its slider there`); break; } }
      if (!STEPS.some((f) => shared(hinged(lever.m, h, h.by * f), bar.m) > OVERLAP)) out.push(`${lever.p.name} doesn't move its slider: swung over, it's clear of it where it was, all the way`);
    }
    if (bar) for (const q of blades) {
      // (no more in the slider than the set's closed blade is as assembled: its post pressed into the spring by the preload; each blade's so at its closed end)
      const t = q.p.turn!, sl = bar.p.slide!, rest = Math.max(...blades.map((r) => shared(r.m, bar.m))), may = Math.max(OVERLAP, rest);
      for (const f of STEPS) {
        const b2 = slid(bar.m, sl, sl.by * f);
        const best = Math.min(...Array.from({ length: 49 }, (_, k) => shared(turned(q.m, t.at, (t.swing! * k) / 48), b2)));
        // (at the travel's end the blade's shut on its stock rail, the post pressed on by the preload, as the closed one's as assembled: mayShare's)
        if (best > (f === 1 ? Math.max(may, 3 * (o.springPreload ?? 1)) : may) + 0.1) { out.push(`${q.p.name} can't follow its slider ${(sl.by * f).toFixed(1)} mm along: ${best.toFixed(2)} mm3 in it at best (${rest.toFixed(2)} at rest)`); break; }
      }
      if (![0, ...STEPS].some((f) => shared(q.m, slid(bar.m, sl, sl.by * f)) > OVERLAP)) out.push(`${q.p.name} isn't moved by its slider: left where it was, it's clear of the slider all the way to its other end`);
    }
  }, () => []);
  return out;
}

/** (mm) How far two parts are drawn apart to see they come apart (and so go together): past a rail end's 8 and a peg's reach. */
const PULL = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12];
/**
 * (mm3) What a peg and its clip share at most on the way in, pushed together along the track as LEGO track is: the peg's
 * round (4.2 across) passing the clip's mouth, which opens for it: as much again as it shares
 * as assembled (mayShare). (A LEGO straight's own end to the next, as modelled, takes 0.7 a peg; a cut's 2.0.)
 */
const SNAP_IN = 3;
/**
 * 4. Joints mate. Each two track parts that touch (printed or bought; raised track and its pillars, a bought piece and
 * its printed ballast too) can be brought together: drawn apart some straight way (along the bed, any of 16 ways, or
 * up, or down) they share no more on the way than as assembled, but a peg snapping past its clip (SNAP_IN each).
 * Only what's near where they meet is looked at (16 mm round it).
 */
export function mates(w: Wasm, ps: Part[], o: PieceOptions, log?: (s: string) => void, seen?: Seen) {
  const out: string[] = [], tr = ps.filter((q) => !isMoving(q.p.name));
  const dirs: [number, number, number][] = [[0, 0, 1], [0, 0, -1], ...Array.from({ length: 16 }, (_, k): [number, number, number] => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8), 0])];
  for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) {
    const A = tr[i].m, B = tr[j].m;
    if (!boxesMeet(A, B, 0.5) || seen?.pair('mate', tr[i].p, tr[j].p)) continue;
    arena(w, () => {
    const p = A.boundingBox(), q = B.boundingBox(), lo = [0, 1, 2].map((k) => Math.max(p.min[k], q.min[k]) - 16), hi = [0, 1, 2].map((k) => Math.min(p.max[k], q.max[k]) + 16);
    const box = w.Manifold.cube([hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]).translate(lo as [number, number, number]);
    const a = A.intersect(box), b = B.intersect(box);
    // (do they touch at all: one moved a little any way is in the other)
    if (shared(a, b) <= SLIVER && !dirs.some((d) => shared(a, b.translate([d[0] * 0.3, d[1] * 0.3, d[2] * 0.3])) > 0.05)) return;
    const x = a.intersect(b), bodies = x.volume() > SLIVER ? x.decompose().filter((m) => m.volume() > SLIVER) : [];
    const pegs = bodies.filter((m) => { const bb = m.boundingBox(); return mayShare(tr[i].p, tr[j].p, [0, 1, 2].map((k) => bb.max[k] - bb.min[k]), m.volume(), o, x.volume()); }).length;
    // (a peg whose clip clears it as assembled shares nothing then, and isn't counted: one at least)
    const rest = bodies.reduce((t, m) => t + m.volume(), 0), may = rest + OVERLAP + Math.max(1, pegs) * SNAP_IN;
    // (the ways tried in the likeliest order: along the bed square to where they meet first (the long side of the box
    // they share lies along the joint), then up and down, then the rest; and no further once one way does: any one is
    // enough. Every way for every pair, the X yard's joints alone took minutes)
    const along = hi[0] - lo[0] >= hi[1] - lo[1] ? [1, 0] : [0, 1], flat2 = dirs.slice(2).sort((p2, q2) => Math.abs(p2[0] * along[0] + p2[1] * along[1]) - Math.abs(q2[0] * along[0] + q2[1] * along[1]));
    let best = Infinity, bestD = dirs[0];
    for (const d of [...flat2.slice(0, 2), dirs[0], dirs[1], ...flat2.slice(2)]) {
      let worst = 0;
      for (const t of PULL) { worst = Math.max(worst, shared(a, b.translate([d[0] * t, d[1] * t, d[2] * t]))); if (worst > may && worst > best) break; }
      if (worst < best) { best = worst; bestD = d; }
      if (best <= may) break;
    }
    log?.(`${tr[i].p.name} ${tr[j].p.name}: rest ${rest.toFixed(2)} pegs ${pegs} best ${best.toFixed(2)} along ${bestD.map((v) => v.toFixed(2)).join(' ')}`);
    if (best > may) out.push(`${tr[i].p.name} and ${tr[j].p.name} can't be brought together: drawn apart any straight way, ${best.toFixed(1)} mm3 is in the way at least (${rest.toFixed(1)} as assembled, ${pegs} peg${pegs === 1 ? '' : 's'})`);
    }, () => []);
  }
  return out;
}

/** 5. A printed part's file: on the bed (z 0), within it (one way round or the other), one solid with its piece (but for break-out supports). */
export function prints(w: Wasm, p: Piece, bedX: number, bedY: number) {
  const out: string[] = [];
  if (p.lego) return out;
  const P = stlPositions(p.stl), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  if (!P.length) return [`${p.name} has no file to print`];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  if (Math.abs(lo[2]) > 1e-3) out.push(`${p.name}'s file is ${lo[2].toFixed(3)} off the bed`);
  // (turned on the bed however it fits best: a long thin part lies along the bed's diagonal)
  const fits = (deg: number) => {
    const c = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < P.length; i += 3) { const x = P[i] * c - P[i + 1] * sn, y = P[i] * sn + P[i + 1] * c; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return x1 - x0 <= bedX + 1e-3 && y1 - y0 <= bedY + 1e-3;
  };
  if (![0, 90, ...Array.from({ length: 35 }, (_, k) => 5 * (k + 1))].some(fits)) out.push(`${p.name} is ${(hi[0] - lo[0]).toFixed(0)} x ${(hi[1] - lo[1]).toFixed(0)}: over the ${bedX} x ${bedY} print bed, however it's turned`);
  // (one solid: the piece without its supports; and its file's a closed solid too, the supports in it)
  const m = solid(w, p.positions), f = solid(w, P);
  if (!m) out.push(`${p.name} isn't a closed solid`);
  else { const n = m.decompose().filter((q) => q.volume() > SLIVER).length; if (n !== 1) out.push(`${p.name} is in ${n} pieces`); }
  if (!f) out.push(`${p.name}'s file isn't a closed solid`);
  for (const x of [m, f]) if (x) drop(x);
  return out;
}

/** (triangles) More than this in a build and it's checked a strip at a time: all of a big layout's solids at once ran the kernel out of memory. */
const AT_ONCE = 1.5e6;
/** (mm) What's loaded round a strip: everything near enough to touch what's in it, as it moves or goes in. */
const ROUND = 150;
/** Everything wrong with a build's pieces. */
export function assembledProblems(w: Wasm, pieces: Piece[], o: PieceOptions, log?: (s: string) => void): string[] {
  const out = new Set<string>(), tris = pieces.reduce((t, p) => t + p.positions.length / 9, 0);
  // (6. every part's name is its own: it's its file's name in the zip)
  for (const n of new Set(pieces.map((p) => p.name).filter((n2, k, all) => all.indexOf(n2) !== k))) out.add(`${pieces.filter((p) => p.name === n).length} parts are named ${n}`);
  // (a big layout: in strips across its longer side, each with what's within ROUND of it; what's found twice, where
  // strips overlap, said once. A part at a strip's edge may lack a neighbour there: found in the strip it's well inside)
  const box = (p: Piece) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (let k = 0; k < p.positions.length; k += 3) { b[0] = Math.min(b[0], p.positions[k]); b[1] = Math.min(b[1], p.positions[k + 1]); b[2] = Math.max(b[2], p.positions[k]); b[3] = Math.max(b[3], p.positions[k + 1]); } return b; };
  const boxes = pieces.map(box), all = [0, 1].map((k) => Math.max(...boxes.map((b) => b[k + 2])) - Math.min(...boxes.map((b) => b[k])));
  const ax = all[0] > all[1] ? 0 : 1, n = Math.max(1, Math.ceil(tris / AT_ONCE));
  const order = pieces.map((_, k) => k).filter((k) => pieces[k].positions.length).sort((a, b) => boxes[a][ax] + boxes[a][ax + 2] - boxes[b][ax] - boxes[b][ax + 2]);
  // (what the strips before have done: Seen)
  const id = new Map(pieces.map((p, k) => [p, k])), pairs = new Set<string>();
  let own = new Set<Piece>();
  const seen: Seen | undefined = n === 1 ? undefined : {
    pair: (what, a2, b2) => { const k = `${what}:${Math.min(id.get(a2)!, id.get(b2)!)}:${Math.max(id.get(a2)!, id.get(b2)!)}`; if (pairs.has(k)) return true; pairs.add(k); return false; },
    own: (p) => own.has(p) };
  for (let g = 0; g < n; g++) {
    const mine = order.slice(Math.floor((order.length * g) / n), Math.floor((order.length * (g + 1)) / n));
    if (!mine.length) continue;
    own = new Set(mine.map((k) => pieces[k]));
    const lo = Math.min(...mine.map((k) => boxes[k][ax])) - ROUND, hi = Math.max(...mine.map((k) => boxes[k][ax + 2])) + ROUND;
    const some = n === 1 ? pieces : pieces.filter((_, k) => boxes[k][ax + 2] >= lo && boxes[k][ax] <= hi);
    // (every solid made on the way let go after: one kernel checks a file's worth of templates)
    const { parts: ps, unsolid } = parts(w, some);
    try { for (const q of arena(w, () => problemsOf(w, some, ps, unsolid, o, log, seen), () => [])) out.add(q); } finally { for (const q of ps) drop(q.m); }
  }
  for (const p of pieces) for (const q of arena(w, () => prints(w, p, o.printBedX!, o.printBedY!), () => [])) out.add(q);
  return [...out];
}
function problemsOf(w: Wasm, pieces: Piece[], ps: Part[], unsolid: string[], o: PieceOptions, log?: (s: string) => void, seen?: Seen) {
  const out: string[] = [];
  // (a bought piece is shown as a stand-in; a printed one must be a solid: said by prints)
  for (const n of unsolid) if (!pieces.find((p) => p.name === n)!.lego) out.push(`${n} isn't a closed solid as assembled`);
  out.push(...overlaps(w, ps, o, seen));
  out.push(...moves(w, ps, o, seen));
  // (3. each moving part can be put in, the way it's built to go: assembly.shared.ts putTogether, with the app's defaults'
  // plate-style points: the slider down through the lever's opening and along its tunnel, the blades on from above (or
  // tilted in under their lip, or on open), the lever between its ears, a lid last)
  // (not the monorail's points, nor an over-centre spring, whose rings snap over its pins' lips: nail-switch.test.ts)
  if (ps.some((q) => isMoving(q.p.name))) out.push(...arena(w, () => putTogether(w, ps.map((q) => q.p).filter((p) => !/^monorail|-spring$/.test(p.name)), { fromTop: o.pointsModule === 'layers', bladesTop: o.mechStyle !== 'tines' }, new Map(ps.map((q) => [q.p.positions, q.m])), seen && ((p) => seen.own(p))), () => []));
  out.push(...mates(w, ps, o, log, seen));
  return out;
}

/** What's known not to go together yet, by template: each problem's said by the build (warning), or is an open fault (why); every one must still be found. */
export interface Known { problems: RegExp[]; warning?: RegExp; why: string }

/**
 * What doesn't go together yet. Each is a fault found by these checks and not yet put right (why: what it is). (A
 * design limit the build says itself has a warning: nail-switch.test.ts has one, a double slip's middle points as nail switches.)
 */
export const KNOWN: Record<string, Known> = {
  'Double slip (22.5°)': { problems: [/^points\d(-spring|-throw)? /], warning: /are too close for their springs/,
    why: 'its middle points, one blade each and side by side, as nail switches: each set\'s spring lies where the next set\'s blade plate is, and their sliders run into each other (80 mm3); so neither moves clear, nor goes in; and a blade swung over is 9.4 mm3 in the track' },
  'Double slip R40 45°': { problems: [/^track1 and points3-throw overlap: 0\.7\d mm3/, /^points3-throw slid [\d.]+ mm: 0\.7\d mm3 in track1/, /^points3-throw can't slide in along its tunnel/],
    why: 'one slider\'s bar is 0.5 into the floor of its groove over 12 mm, all along its travel' },
  ...Object.fromEntries(['Double-track return loop (turning right)', 'Double-track return loop (turning left)'].map((name): [string, Known] => [name, {
    problems: [/^track-bought-BrickTracksS0\d-\d+ and switch\d-ballast2 overlap: (10|21)\.\d+ mm3/, /^track74-ballast and track75-ballast can't be brought together: .* 6\.\d mm3/],
    why: 'the bought switch\'s printed ballast is in the bought straights at its ends (0.8 to 3 mm, 4.8 x 1.8 mm each: 11 and 22 mm3); two of the curve\'s ballast parts hook into each other (6 mm3 in the way whichever way they\'re drawn apart)' }])),
  'X yard (6 tracks, single slips)': { problems: [/^track\d+ and switch-bought-BrickTracksR104switch(left|right)-\d overlap/, /^track\d+ and switch\d-ballast2 overlap: 52\d\.\d+ mm3/, /^track3 and track9 overlap: 3\.7\d mm3/],
    why: 'each bought switch\'s printed ballast is in the printed track part beside it (20.6 x 15.3 mm, 525 mm3, four places), and the switch as shown (a slab of its footprint) in the printed track at its ends; two parts share 3.8 mm3 at one joint' },
};

/** A design built as the app builds it (its defaults) and checked: nothing wrong but what's known (k), which must still be found. */
export async function goesTogether(name: string, design: Design, k?: Known) {
  const saved = { ...OPTION_DEFAULTS };
  Object.assign(OPTION_DEFAULTS, APP);
  try {
    const w = await kernel();
    // (each design's own build: one kernel holding them all runs out of memory)
    clearBuildCache();
    const d = structuredClone(design), b = buildDesign(w, d);
    // (its pieces are plain data: the build's own solids let go before the checks make theirs)
    clearBuildCache();
    const problems = assembledProblems(w, b.pieces, { ...APP, ...d.options });
    const allowed = k?.problems ?? [];
    expect(problems.filter((q) => !allowed.some((re) => re.test(q))).join('; ')).toBe('');
    // (what's allowed is still there (else it comes off the list), and said by the build where it's a limit)
    for (const re of allowed) expect(problems.some((q) => re.test(q)), `${name}: ${re} is no longer found: take it off the list`).toBe(true);
    if (k?.warning) expect(b.info.warnings.some((q) => k.warning!.test(q)), `${name}: the build doesn't say ${k.warning}`).toBe(true);
  } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
}

/** The templates of these groups (only: just these of them), each built as the app builds it and checked. */
export function assembledSuite(groups: string[], only?: string[], known: Record<string, Known> = KNOWN) {
  for (const [g, names] of TEMPLATE_GROUPS) if (groups.includes(g)) for (const name of names) if (!only || only.includes(name))
    it(`${g}: ${name} goes together`, () => goesTogether(name, TEMPLATES[name], known[name]));
}

/** The reference trackwork's templates from one to another (by their place in the list): a file's worth. */
export const reference = (from: number, to: number) => TEMPLATE_GROUPS.find(([g]) => g === 'Reference trackwork')![1].slice(from, to);
