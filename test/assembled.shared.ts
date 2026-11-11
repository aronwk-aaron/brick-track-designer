// Can what's built be put together, and does it work? Every template, built with the app's own defaults
// (setup-defaults.ts APP_DEFAULTS), its parts as assembled (each piece's positions):
// 1. nothing overlaps: every pair of parts, printed or bought, shares less than OVERLAP (overlaps; what may: mayShare);
// 2. the moving parts work across their travel: blades, sliders and levers, in steps, clear of everything, each driving the next (moves);
// 3. each moving part can be put in, the way it's built to go (assembly.shared.ts putTogether);
// 4. joints mate: any two track parts that touch can be drawn apart some straight way, and so brought together (mates);
// 5. every printed part prints: its file fits the print bed, lies on it (z 0) and is one solid (but for its break-out supports) (prints).
// 6. every part's name is its own (its file's name in the zip).
// 7. monorail points work (monoPoints): their slide, wheel, link and lever across the travel, each driving the next, the
//    lever stopped and held at each end, and every part put in the way it's built to go.
// 8. the rails are sound (railFaults): no nub of rail head standing on a part, no stud run into by a rail or a check
//    rail, no check rail with no bed under it.
// (Rebuilt from a piece's triangles a solid can have slivers the kernel's own didn't: hence a small volume, not none.)
// What isn't checked: track parts going down onto a baseplate's studs; axle joints' holes lining up (no template has
// them). (An over-centre spring going on over its pins and bending as the slider moves: nail-switch.test.ts.)
import { expect, it } from 'vitest';
import { arena, kernel } from '../src/geom/kernel';
import { bedFit, tightBox } from '../src/geom/bedfit';
import { buildDesign, clearBuildCache, type Piece } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATE_GROUPS, TEMPLATES } from '../src/app/design';
import { putTogether, sharedEdges, stlPositions } from './assembly.shared';
import { studsCut } from './cutpaths.shared';
import { leverTravel, movedLocal, pointsLocal, toothA, toothB, toothTravel, POINTS, type PointsPart } from '../src/geom/monoswitch';
import { MONO, placeAt } from '../src/geom/monorail';
import { routePose, routeSOf, type Route } from '../src/route/route';

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

/**
 * 7. Monorail points (LEGO's, geom/monoswitch.ts): as assembled they're set straight. Each set (looked at in its own
 * frame, a left-hand one mirrored):
 * - across the travel (the wheel turned in eighths, and finer near each end, where the teeth tilt; the slide, links,
 *   lever and teeth where it puts them): every moving part clear of the base, the deck and each other, but the lever's
 *   detent rib in the channel's wall between its grooves;
 * - each drives the next: the wheel turned an eighth of the way and the slide or a link left behind run into each
 *   other, and so each link moved and the lever or the branch's tooth, the lever and the straight exit's tooth;
 * - the lever's stopped at each end (a little further it's in its housing's wall), and held there: its rib's in a groove
 *   (clear), and out of it at once either way;
 * - the slide's held down (lifted, its feet are under the deck);
 * - they set themselves: with the points set for the other exit, a train's bogie (a block over the rack, 0.8 mm above
 *   it) brought in from an exit meets that exit's tooth standing up, and pushes it: the tooth where the bogie's front
 *   is, and all the rest where that puts it, clear of the bogie all the way; the bogie loses the tooth (gone down
 *   under it) with the tooth at most DETENT_REACH from its end, where the lever's rib is entering its groove, which
 *   takes it home; then the bogie runs on over the tooth and the slide's rack, touching nothing;
 * - each tooth's kept where it belongs: down under its hood when its exit's set, up on its rail when not;
 * - a train on the route the points are set for moves nothing: the bogie run the length of that exit, either way,
 *   touches no part (its tooth is down, under the rack's top);
 * - it goes together: the wheel, the lever, the links and the teeth down from above, in that order; the slide into the
 *   deck from the side away from the branch; then the deck, the slide in it, down onto the base.
 */
/** (mm) how far from its end a tooth may be when the train stops pushing it: the lever's detent rib (0.8 radius, in a groove of 0.9) is half way into its groove by then */
const DETENT_REACH = 0.8;
export function monoPoints(w: Wasm, ps: Part[], seen?: Seen) {
  const out: string[] = [];
  const sets = new Map<string, Part[]>();
  for (const q of ps) if (q.p.monoPoints) { const k = q.p.name.replace(/-[a-z]+$/, ''); sets.set(k, [...(sets.get(k) ?? []), q]); }
  for (const [name, mine] of sets) if (!seen || mine.some((q) => seen.own(q.p))) arena(w, () => {
    const { P, hand, branch } = mine[0].p.monoPoints!;
    const of = (n: string) => pointsLocal(mine.find((q) => q.p.name.endsWith(`-${n}`))!.m, P, hand);
    const base = of('base'), deck = of('deck');
    const kinds: PointsPart[] = ['slide', 'wheel', 'link', 'lever', 'linkb', 'tootha', 'toothb'];
    const home = new Map(kinds.map((k) => [k, of(k)]));
    const at = (part: PointsPart, f: number) => movedLocal(home.get(part)!, part, f, branch);
    const say = (what: string, v: number) => out.push(`${name}: ${what}: ${v.toFixed(2)} mm3`);
    for (const f of [0, 0.02, 0.05, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.95, 0.98, 1]) {
      const m = kinds.map((k) => at(k, f));
      kinds.forEach((k, i) => {
        for (const [n, fixed] of [['base', base], ['deck', deck]] as const) { const v = shared(m[i], fixed); if (v > (k === 'lever' && n === 'base' ? OVERLAP : SLIVER)) say(`its ${k} ${Math.round(f * 100)}% across is in its ${n}`, v); }
        for (let j = i + 1; j < kinds.length; j++) { const v = shared(m[i], m[j]); if (v > SLIVER) say(`its ${k} ${Math.round(f * 100)}% across is in its ${kinds[j]}`, v); }
      });
    }
    // (each drives the next)
    for (const [a1, b1] of [['wheel', 'slide'], ['wheel', 'link'], ['link', 'lever'], ['wheel', 'linkb'], ['linkb', 'toothb'], ['lever', 'tootha']] as const) if (shared(at(a1, 0.125), home.get(b1)!) < 0.05) out.push(`${name}: its ${a1} doesn't move its ${b1}: moved an eighth of the way, it's clear of it where it was`);
    // (stopped and held at each end)
    const lt = leverTravel(), lever = home.get('lever')!;
    for (const [f, d] of [[0, -1.5], [1, 1.5]] as const) if (shared(lever.translate([0, f * lt + d, 0]), base) < 1) out.push(`${name}: its lever isn't stopped ${f ? 'set for the branch' : 'set straight'}: 1.5 mm further it's clear of its housing`);
    for (const f of [0, 1]) {
      if (shared(lever.translate([0, f * lt, 0]), base) > SLIVER) out.push(`${name}: its lever's detent rib isn't in its groove ${f ? 'set for the branch' : 'set straight'}`);
      if (shared(lever.translate([0, f * lt + (f ? -1.5 : 1.5), 0]), base) < 0.02) out.push(`${name}: its lever isn't held ${f ? 'set for the branch' : 'set straight'}: 1.5 mm back its rib's clear of the wall`);
    }
    if (shared(home.get('slide')!.translate([0, 0, 1]), deck) < 1) out.push(`${name}: its slide isn't held down: lifted 1 mm it's clear of the deck`);
    // (setting themselves)
    if (branch) {
      const main: Route = { id: 'main', start: [0, 0, 0], segments: [{ kind: 'straight', length: POINTS.mainLen }] };
      const under = MONO.ridgeTop + 0.8, bogie = w.Manifold.cube([2 * MONO.ridgeHw + 2, 12, 5]).translate([-MONO.ridgeHw - 1, 0, under]);
      const travel = toothTravel(branch);
      // (each exit: its route, its tooth, which way the points are set when that tooth is up, where the tooth is f across)
      const exits = [
        { n: 'straight exit', rt: main, tooth: 'tootha' as PointsPart, up: 1, where: (f: number) => toothA(f), travel: travel[0] },
        { n: 'branch', rt: branch, tooth: 'toothb' as PointsPart, up: 0, where: (f: number) => toothB(branch, f), travel: travel[1] },
      ];
      for (const e of exits) {
        const noseS = (f: number) => { const t = e.where(f), a = (t.deg * Math.PI) / 180; return routeSOf(e.rt, [t.hinge[0] - POINTS.toothArm * Math.sin(a), t.hinge[1] + POINTS.toothArm * Math.cos(a)]); };
        const top = (f: number) => MONO.ridgeTop + POINTS.toothRise - e.where(f).drop;
        const hit = (q: number, f: number) => { let v = 0; const b = bogieAt(q); for (const m of [base, deck, ...kinds.map((k) => at(k, f))]) v += shared(b, m); return v; };
        const bogieAt = (q: number) => placeAt(bogie, routePose(e.rt, q));
        // the tooth up: the bogie meets it
        if (top(e.up) < under + 1.5) out.push(`${name}: the ${e.n}'s tooth doesn't stand up in a train's way with the points set for the other exit: its top's ${(top(e.up) - under).toFixed(2)} mm above the bogie's underside`);
        const s0 = noseS(e.up);
        if (shared(bogieAt(s0 - 0.5), at(e.tooth, e.up)) < 0.05) out.push(`${name}: a train in from the ${e.n} doesn't meet its tooth`);
        // pushed: the tooth as far on as the bogie's front has put it (by halving: the least that clears the bogie), till
        // it's gone down under the bogie, which then runs on over it
        const set = 1 - e.up, others = (f: number) => [base, deck, ...kinds.filter((k) => k !== e.tooth).map((k) => at(k, f))];
        const pushed = (q: number, from: number) => {
          const b = bogieAt(q);
          if (shared(b, at(e.tooth, from)) <= SLIVER) return from;
          let lo = from, hi = set;
          for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (shared(b, at(e.tooth, m)) > SLIVER) lo = m; else hi = m; }
          return hi;
        };
        let f = e.up, stuck = false;
        for (let d = 0; d <= e.travel + 14 && !stuck; d += 0.5) {
          const q = s0 - d, b = bogieAt(q);
          f = pushed(q, f);
          if (shared(b, at(e.tooth, f)) > SLIVER) { out.push(`${name}: a train in from the ${e.n} is stopped by its tooth ${d.toFixed(1)} mm on: the tooth can go no further and isn't down`); stuck = true; }
          for (const m of others(f)) { const v = shared(b, m); if (v > SLIVER) { say(`a train in from the ${e.n}, ${d.toFixed(1)} mm past where it met the tooth, is in the points' parts`, v); stuck = true; break; } }
        }
        const lost = Math.abs(noseS(f) - noseS(set));
        if (!stuck && lost > DETENT_REACH) out.push(`${name}: a train in from the ${e.n} leaves its tooth ${lost.toFixed(2)} mm from its end: too far for the lever's detent to finish (${DETENT_REACH})`);
        if (process.env.MONO_POINTS_SAY) console.log(`${name}: ${e.n}: tooth travel ${e.travel.toFixed(2)} mm, left by the train ${lost.toFixed(2)} mm from its end`);
        // set for this exit now (the detent's taken it home): the bogie runs on in, and a train either way touches nothing
        const sEnd = noseS(set);
        // (each tooth kept where it belongs: its fin down under the hood when its exit's set, its nose up on its rail when not)
        const above = w.Manifold.cube([400, 600, 20]).translate([-200, -100, MONO.beamTop + 0.35]);
        if (shared(at(e.tooth, set).translate([0, 0, 0.8]).intersect(above), deck) < 0.02) out.push(`${name}: the ${e.n}'s tooth isn't kept down with the points set for it: lifted 0.8 mm its fin's clear of the hood`);
        if (shared(at(e.tooth, e.up).translate([0, 0, -0.6]), base) < 0.02) out.push(`${name}: the ${e.n}'s tooth isn't held up with the points set for the other exit: 0.6 mm down it's clear of its rail`);
        for (let q = sEnd + 16; q >= sEnd - 40; q -= 2) { const v = hit(q, set); if (v > SLIVER) { say(`with the points set for the ${e.n}, a train ${(sEnd - q).toFixed(0)} mm past its tooth's face is in the points' parts`, v); break; } }
      }
    }
    // (going together)
    const UP = [0.5, 1, 2, 4, 8, 14];
    const down = (what: string, m: Man, onto: Man[]) => { for (const dz of UP) for (const q of onto) { const v = shared(m.translate([0, 0, dz]), q); if (v > SLIVER) { say(`its ${what} can't go down into place: ${dz} mm up it's in what's there`, v); return; } } };
    const H = (k: PointsPart) => home.get(k)!;
    down('wheel', H('wheel'), [base]);
    down('lever', H('lever'), [base, H('wheel')]);
    down('link', H('link'), [base, H('wheel'), lever]);
    down('second link', H('linkb'), [base, H('wheel'), lever, H('link')]);
    down('straight exit\'s tooth', H('tootha'), [base, lever]);
    down('branch\'s tooth', H('toothb'), [base, H('linkb')]);
    for (const dx of [2, 5, 10, 20, 40, 70, 100]) { const v = shared(H('slide').translate([-dx, 0, 0]), deck); if (v > SLIVER) { say(`its slide can't go into the deck from the side: ${dx} mm out it's in it`, v); break; } }
    down('deck and slide', w.Manifold.union([deck, H('slide')]), [base, H('wheel'), H('link'), lever, H('linkb'), H('tootha'), H('toothb')]);
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
  // (turned on the bed however it fits best, as the build judges it (geom/bedfit.ts): a long thin part lies along the bed's diagonal)
  const fit = bedFit(P, bedX + 1e-3, bedY + 1e-3, 3);
  if (!fit.fits) out.push(`${p.name} is ${tightBox(P, 3).size.map((v) => v.toFixed(0)).join(' x ')} at its tightest: over the ${bedX} x ${bedY} print bed, however it's turned`);
  // (and its file lies as it prints: one that fits only on the slant is turned already)
  else if (!(hi[0] - lo[0] <= bedX + 1e-3 && hi[1] - lo[1] <= bedY + 1e-3) && !(hi[0] - lo[0] <= bedY + 1e-3 && hi[1] - lo[1] <= bedX + 1e-3)) out.push(`${p.name}'s file is ${(hi[0] - lo[0]).toFixed(0)} x ${(hi[1] - lo[1]).toFixed(0)} as it lies: it fits the ${bedX} x ${bedY} print bed only turned ${fit.angle.toFixed(1)} degrees, and isn't`);
  // (one solid: the piece without its supports; and its file's a closed solid too, the supports in it)
  const m = solid(w, p.positions), f = solid(w, P);
  if (!m) out.push(`${p.name} isn't a closed solid`);
  // (a snap clamp is three on purpose: the spring and its two links, loose in it, printed in place: switch/snap.ts)
  else { const n = m.decompose().filter((q) => q.volume() > SLIVER).length; if (n !== 1 && !(n === 3 && /-spring$/.test(p.name))) out.push(`${p.name} is in ${n} pieces`); }
  if (!f) out.push(`${p.name}'s file isn't a closed solid`);
  for (const x of [m, f]) if (x) drop(x);
  return out;
}

/** (mm) The rail tops, the bed's top (a plate), and a stud's middle, on track that isn't raised. */
const RAIL_TOP = 9.6, BED_TOP = 3.2, STUD_MID = 4.2;
/**
 * (mm2, mm) A piece of rail head smaller than this in plan (3 mm of rail) and no longer than this is a nub: too small to
 * carry a wheel or to stay on (cutter.ts NUB_AREA). (A rail-end tongue at a cut is half a rail wide and 8 long: not one.)
 */
export const NUB = 7.5, NUB_LONG = 4;
/** (mm3) A part of track smaller than this is a sliver: a cut left it (a 2 x 2-stud bit of bed a plate thick is 820). */
export const SLIVER_PART = 1000;
/** (mm) A check rail may run this far with no bed under it: a gap between sleepers (2 studs) crossed at a slant, its end a little past the last one. */
const UNHELD = 24;
/** A printed part with track on it (not raised: its heights are the bed's). */
const hasTrack = (p: Piece) => !p.lego && !p.lift && !isMoving(p.name) && /^track(?!-support)|-base\d*$|^base/.test(p.name);
/**
 * 8. The rails are sound, a part at a time:
 * - no sliver: the part itself is SLIVER_PART at least (a track's last few mm, cut off at a baseplate's edge);
 * - no nub: at the rail heads' height nothing stands smaller than NUB in plan and shorter than NUB_LONG (a bit of
 *   rail between two flangeways, cut in two by a cut through a crossing's middle); but a lever's ears, which are that small;
 * - no stud run into: a stud on the bed (round, whole, at its middle's height) has nothing within 0.25 mm of its side
 *   (a rail's foot is 0.3 clear of it at least; a check rail's flared end stood in one);
 * - no check rail off the bed: where one of the build's check rails (checks: each one's line, mm) is in the part, the
 *   part's bed or a sleeper is under it, but for a gap between sleepers (UNHELD).
 * (A stud a flangeway or a cut took a bite out of isn't found: only whole ones are looked at.)
 */
export function railFaults(w: Wasm, pieces: Piece[], checks: [number, number][][] = []) {
  const out: string[] = [];
  const boxOf = (p: Piece) => { const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity]; for (let k = 0; k < p.positions.length; k += 3) for (const j of [0, 1]) { lo[j] = Math.min(lo[j], p.positions[k + j]); hi[j] = Math.max(hi[j], p.positions[k + j]); } return { min: lo, max: hi }; };
  const levers = pieces.filter((p) => p.hinge).map(boxOf);
  // (a part's solid at a time, let go after: a big layout's all at once ran the kernel out of memory)
  for (const p of pieces) if (hasTrack(p)) arena(w, () => {
    const m = solid(w, p.positions);
    if (!m) return;
    if (m.volume() < SLIVER_PART) out.push(`${p.name} is a sliver: ${m.volume().toFixed(0)} mm3 ${where(m)}`);
    const bb = m.boundingBox(), at = (b: { min: ArrayLike<number>; max: ArrayLike<number> }) => `${((b.min[0] + b.max[0]) / 2).toFixed(1)}, ${((b.min[1] + b.max[1]) / 2).toFixed(1)}`;
    if (bb.max[2] > RAIL_TOP - 0.5 && bb.min[2] < BED_TOP) {
      const nubs = m.slice(RAIL_TOP - 0.5).decompose().filter((q) => {
        if (q.area() <= 0.05 || q.area() >= NUB) return false;
        const b = q.bounds();
        if (Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) >= NUB_LONG) return false;
        return !levers.some((l) => b.max[0] > l.min[0] - 3 && b.min[0] < l.max[0] + 3 && b.max[1] > l.min[1] - 3 && b.min[1] < l.max[1] + 3);
      });
      for (const q of nubs.slice(0, 4)) { const b = q.bounds(); out.push(`${p.name} has a nub of rail ${q.area().toFixed(1)} mm2 (${(b.max[0] - b.min[0]).toFixed(1)} x ${(b.max[1] - b.min[1]).toFixed(1)}) at ${at(b)}${nubs.length > 4 ? ` (and ${nubs.length - 4} more)` : ''}`); if (nubs.length > 4) break; }
    }
    if (bb.max[2] > STUD_MID && bb.min[2] < BED_TOP) {
      const sl = m.slice(STUD_MID), over = m.slice(STUD_MID + 1.6), round = sl.offset(-2, 'Round', 2, 32).offset(2, 'Round', 2, 32).decompose();
      let n = 0;
      for (const q of round) {
        const b = q.bounds(), dx = b.max[0] - b.min[0], dy = b.max[1] - b.min[1], r = (dx + dy) / 4;
        // (a stud: round, 4 to 5.5 across)
        if (Math.abs(dx - dy) > 0.1 || r < 2 || r > 2.75 || Math.abs(q.area() - Math.PI * r * r) > 0.5) continue;
        // (and no higher than one: where several rails' feet cross they make a round of that size too, rail above it)
        if (q.intersect(over).area() > q.area() / 2) continue;
        const c: [number, number] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
        const ring = w.CrossSection.circle(r + 0.25, 48).subtract(w.CrossSection.circle(r + 0.05, 48)).translate(c), a = ring.intersect(sl).area();
        if (a > 0.1 && n++ < 4) out.push(`${p.name}'s stud at ${at(b)} is run into: ${a.toFixed(2)} mm2 of something within 0.25 mm of its side`);
      }
      if (n > 4) out.push(`${p.name}: ${n - 4} more studs run into`);
    }
    const mine = checks.map((line) => line.filter((q) => q[0] > bb.min[0] && q[0] < bb.max[0] && q[1] > bb.min[1] && q[1] < bb.max[1])).filter((l) => l.length);
    if (mine.length && bb.min[2] < BED_TOP - 0.3) {
      const rail = m.slice(BED_TOP + 2), bed = m.slice(BED_TOP - 0.3), spot = (q: [number, number], sl: typeof rail) => w.CrossSection.square([0.4, 0.4], true).translate(q).intersect(sl).area();
      for (const line of mine) {
        // (the longest run of it with rail and no bed: over a gap between sleepers it's carried as the running rails are)
        let run = 0, worst = 0, at2 = line[0];
        for (let k = 0; k < line.length; k++) {
          const off = spot(line[k], rail) > 0.1 && spot(line[k], bed) < 0.1;
          run = off ? run + (k ? Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]) : 0) : 0;
          if (run > worst) { worst = run; at2 = line[k]; }
        }
        if (worst > UNHELD) out.push(`${p.name}'s check rail has no bed under it for ${worst.toFixed(0)} mm, to ${at2.map((v) => v.toFixed(1)).join(', ')}`);
      }
    }
  }, () => []);
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
  out.push(...monoPoints(w, ps, seen));
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
  'Banked curve': { problems: [/^track6 and track7 overlap: 7\.\d+ mm3 at -269\.\d, 751\.\d/],
    why: 'its R56 curve is cut every 22.5 degrees now (as the bought R56 piece is), and at the joint 67.5 degrees round, at the full bank, the outer rail\'s end joint of one piece is 7 mm3 into the next piece (7.4 x 4.4 x 5.4 mm, at rail height); in 11.25 degree pieces the same joint was clear. An open fault in the banked end joints (geom/crossing.ts bankedEnd) on long pieces' },
  'Modular triple crossover R40': { problems: [/^track[12] is 3\d\d x 2\d\d at its tightest: over the 256 x 256 print bed/], warning: /sections don't fit the 256 x 256 print bed/,
    why: 'cut across only, its two sections three tracks wide (352 and 368 mm). Cut paths (expert) as the three-track R104 crossover has them don\'t fit it yet: between its frogs (14.4 and 19.4 studs along) only the line at 17 studs is 2 studs clear of both, and that line grazes five studs on the branches\' slanted sleepers by 0.09 mm (found by the check that no stud is cut, cutpaths.shared.ts)' },
  'Straight, 1 stud': { problems: [/^track is in 3 pieces/],
    why: 'a straight one stud long is shorter than its own end joints: the peg and the clip at its two ends take the bed between them, and the part comes out in three bodies (on sleepers and on a solid bed alike)' },
};

/** The kinds of rail fault (railFaults) a design may be known for. */
const RAIL_KINDS = { nub: /has a nub of rail/, stud: /stud at .* is run into|more studs run into/, sliver: /is a sliver/, check: /check rail has no bed under it/ };
/**
 * 8. The rail faults known, by template or saved design, as found when the checks were written; each must still be
 * found, so the list comes down. nub: bits of rail head a few mm2 between flangeways or at blades' heels (double and
 * single slips, 0.2 to 5.7 mm2; a 45 degree crossing cut across its middle, 5.7); stud: a stud with a rail's foot or
 * a wing rail within 0.25 mm of its side (the wyes' two studs at the toe, 0.2 to 0.4 mm2; the slips' and the R56
 * crossovers', 0.7 to 1.3); sliver: a part of track under 1000 mm3 (the yards' ladders: 608 to 884 mm3); check: a
 * check rail with no bed or sleeper under it for 26 mm (the R72 pass-through crossings', at 64, -52).
 * ('the double slip as nail switches': nail-switch.test.ts's, the 22.5 degree double slip.)
 */
export const RAIL_KNOWN: Record<string, (keyof typeof RAIL_KINDS)[]> = { 'Double crossover (R56)': ['stud'], 'Double slip (22.5°)': ['nub'], 'the double slip as nail switches': ['nub'], 'Double slip (45°, R40)': ['nub', 'stud'], 'Double slip R40 45°': ['nub', 'stud'], 'Dual gauge crossing 45°': ['nub'], 'Narrow-gauge wye R36': ['stud'], 'Pass-through crossing R72 (A) left': ['check'], 'Pass-through crossing R72 (A) right': ['check'], 'Single slip R40 45°': ['nub', 'stud'], 'Wye R40': ['stud'], 'Wye R40 left, R56 right': ['stud'], 'Wye R40, 8-stud spacing': ['stud'], 'Wye R56 left, R40 right': ['stud'], 'X yard (6 tracks, single slips)': ['nub'], 'Yard (R56)': ['nub', 'stud', 'sliver'], 'Yard ladder (R40)': ['nub', 'sliver'], 'monster-switch-6-tracks-double-slips.btd.json': ['nub'], 'monster-switch-6-tracks.btd.json': ['nub'], 'return-loop-turning-left.btd.json': ['nub'], 'return-loop-turning-right.btd.json': ['nub'] };

/**
 * 7. Edges shared by more than two triangles in the printed parts' files (assembly.shared.ts sharedEdges), a template's
 * in all: no more than these, and no more than EDGES_FEW where it isn't here. Two kinds are put right (a cut part's
 * rim ending exactly on a wall, and a stud's clearance circle touching the rim of a cut on a stud line: 2640 in 85
 * templates before, 1230 in 63 after); what's left is where it was found, a little over (a tenth, 2 at least), so
 * it can come down and not go up: on rails' and blades' tops (two heads or a planed side meeting along a line),
 * on the slopes of ballast and of sleepers' ends, and up a cut's joints. None is known to be read back wrongly
 * (checks 1 to 5 pass with them); each kind is still to be looked into as the slider's groove's was.
 */
export const EDGES: Record<string, number> = { 'Modular wye R40, lever on the left': 10, 'Modular wye R40, lever on the right': 8, 'Modular wye R40 with continuous-curve adapters': 8, 'Test print 7: clearance round the points': 8, 'Curve R40, 5.62°': 15, 'X yard (6 tracks, single slips)': 472, 'Yard (R56)': 159, 'Double-track return loop (turning left)': 109, 'Double-track return loop (turning right)': 109, 'Double crossover (R56)': 97, 'Wye with a crossover': 74, 'Double slip (22.5°)': 35, 'Yard ladder (R40)': 33, 'Wye R40, 8-stud spacing': 32, 'T-junction core R56': 30, 'Pass-through crossing R72 (B) right': 26, 'Siding ending in a buffer stop': 16, 'Pass-through crossing R72 (B) left': 14, 'Crossing 45° left': 14, 'Double crossover R40': 9, 'Wye R40 left, R56 right': 8, 'Wye switch': 7, 'Wye R120 left, R104 right': 7, 'Dual gauge track': 7, 'Crossing 45° right': 7, 'Banked curve': 6, 'Pass-through crossing R120 right': 6, 'Wye R104 left, R120 right': 6, 'Narrow-gauge crossing 33.75° left': 6, 'Curved switch R56 90° left': 6, 'Wye R40': 6, 'Narrow-gauge crossing 90°': 5, 'Narrow-gauge switch R48 left': 5, 'Narrow-gauge wye R36': 5, 'Dual gauge crossing 45°': 5, 'Switch R72 left': 5,
  // (mixed gauges: as the same layout at one gauge has them, 92 at 4 studs, in the sleepered crossing's part; and the 45° crossings as the standard ones)
  'Narrow gauge beside and across standard track': 118, 'Narrow-gauge crossing of standard track 45° right': 21, 'Narrow-gauge crossing of standard track 45° left': 7,
  // (the right hand's sleepered part where the gauges part: corners of its bed meeting on the baseplate, as the 45° crossings')
  'Dual gauge split, both ways, standard gauge R40 right': 7 };
/** (edges) A template not in EDGES may have this many: one or two come and go with a corner's last digit. */
export const EDGES_FEW = 4;

/** A design built as the app builds it (its defaults) and checked: nothing wrong but what's known (k), which must still be found. edges: its files' edges shared by more than two triangles, at most (not counted where it isn't given). */
export async function goesTogether(name: string, design: Design, k?: Known, edges?: number) {
  const saved = { ...OPTION_DEFAULTS };
  Object.assign(OPTION_DEFAULTS, APP);
  try {
    const w = await kernel();
    // (each design's own build: one kernel holding them all runs out of memory)
    clearBuildCache();
    const d = structuredClone(design), b = buildDesign(w, d);
    // (its pieces are plain data: the build's own solids let go before the checks make theirs)
    clearBuildCache();
    // (8. the rails are sound, but for what's known of this design: RAIL_KNOWN)
    const problems = [...assembledProblems(w, b.pieces, { ...APP, ...d.options }), ...railFaults(w, b.pieces, b.overlay?.checkRails)];
    const allowed = [...(k?.problems ?? []), ...(RAIL_KNOWN[name] ?? []).map((q) => RAIL_KINDS[q])];
    expect(problems.filter((q) => !allowed.some((re) => re.test(q))).join('; ')).toBe('');
    // (9. cut by hand along paths (expert): no stud is cut, cutpaths.shared.ts)
    if (d.expert?.cutPaths?.length) expect(studsCut(d, b).join('; ')).toBe('');
    // (what's allowed is still there (else it comes off the list), and said by the build where it's a limit)
    for (const re of allowed) expect(problems.some((q) => re.test(q)), `${name}: ${re} is no longer found: take it off the list`).toBe(true);
    if (k?.warning) expect(b.info.warnings.some((q) => k.warning!.test(q)), `${name}: the build doesn't say ${k.warning}`).toBe(true);
    // (7. its files' edges shared by more than two triangles)
    if (edges !== undefined) {
      const found = b.pieces.filter((p) => !p.lego && p.stl.length).map((p) => [p.name, sharedEdges(stlPositions(p.stl))] as const).filter(([, e]) => e.length);
      const total = found.reduce((t, [, e]) => t + e.length, 0);
      expect(total, `${name}: ${total} edges shared by more than two triangles in its files (${found.map(([n, e]) => `${n} ${e.length}, the first at ${e[0][0].map((v) => v.toFixed(1)).join(' ')}`).join('; ')})`).toBeLessThanOrEqual(edges);
    }
  } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
}

/** The templates of these groups (only: just these of them), each built as the app builds it and checked. */
export function assembledSuite(groups: string[], only?: string[], known: Record<string, Known> = KNOWN) {
  for (const [g, names] of TEMPLATE_GROUPS) if (groups.includes(g)) for (const name of names) if (!only || only.includes(name))
    it(`${g}: ${name} goes together`, () => goesTogether(name, TEMPLATES[name], known[name], EDGES[name] ?? EDGES_FEW));
}

/** The reference trackwork's templates from one to another (by their place in the list): a file's worth. */
export const reference = (from: number, to: number) => TEMPLATE_GROUPS.find(([g]) => g === 'TrixBrix trackwork')![1].slice(from, to);
