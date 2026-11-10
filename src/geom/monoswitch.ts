// LEGO's monorail points (2889 right, 2890 left), copied from the real part: a base with the three track ends, a deck
// over it, and between them the works. A slide carrying two racks side by side (one straight, one curved) moves
// across the deck so one or the other lines up; under the deck a wheel turns on a post, a pin of it in the slide; a
// link joins the wheel to the hand lever, which slides along the track beside the straight exit. Push the lever 25 mm
// along: the wheel turns 88 degrees and the slide crosses 27.8 mm.
//
// What's different from LEGO's, each so it prints without supports and goes together by hand:
//  - LEGO's top shell (deck and walls, moulded as one) and bottom plate are here a base (floor, walls, the ends) and a
//    flat deck pressed onto studs on the base's walls: both print flat, open side up.
//  - LEGO's slide has a peg down into a slot in the wheel; here the wheel has the pin, up into a slot in the slide
//    (a peg under the slide would hang in the air as it prints). The slide's motion is the same.
//  - Each of the slide's three cross bars has a foot under the deck that holds it down (LEGO's has two short tabs); the
//    deck's slots are open to the side away from the branch (as LEGO's are), where the slide goes in. The slide prints
//    on its feet, its racks on thin breakaway walls between the bars.
//  - The wheel is a plain disc (LEGO's has spokes); the lever has the arm to the link only.
//  - LEGO's points throw themselves when a train comes in from the exit they aren't set for (a sprung tooth in each
//    exit's rack, a second link): not built yet; set these by hand before a train trails through.
//
// Units: mm. Frame: the points start (their toe) at y = 0 on x = 0 heading +y, the branch to +x (a left-hand set is
// built as a right-hand one and mirrored); z = 0 is the bottom of the beam.
import type { CS, Man, Vec2 } from './scad';
import { M, T } from './scad';
import { MONO, type Mono, type RackGap, placeAt } from './monorail';
import { routeLength, routePose, type Pose, type Route } from '../route/route';
import { sweepRoute } from './sweep';

const rad = (d: number) => (d * Math.PI) / 180;

/** The real part's sizes, measured from its LDraw model (LDU there, 0.4 mm each; a stud is 20). */
export const POINTS = {
  /** the straight route's length: 32 studs (640 LDU) */
  mainLen: 256,
  /** where the branch ends, from the toe: 20 studs on, 8 across, turned 45 degrees (400, 160 LDU) */
  exit: [64, 160] as Vec2, exitDeg: 45,
  /** the slide's racks, from the toe: 40 to 280 LDU */
  slide: [16, 112] as Vec2,
  /** how far the slide crosses: 69.5 LDU */
  travel: 27.8,
  /** the deck's edge on the side away from the branch, from the centre line (80 LDU), and where the wide deck ends (320 LDU) */
  deckHw: 32, deckEnd: 128,
  /** the slide's three cross bars, from the toe (70, 154, 234 LDU), and their width (4 LDU) */
  bars: [28, 61.6, 93.6], barW: 1.6,
  /** the wheel: its pivot on the centre line (186 LDU from the toe), its radius (52.5 LDU), how far it turns (87.6 degrees) */
  wheelY: 74.4, wheelR: 21, swing: 87.6,
  /** the link: its pin's radius on the wheel (45 LDU), its length between pins (153.5), its half width (10) */
  linkR: 18, linkLen: 61.4, linkHw: 4,
  /** the lever: its middle from its link pin (51 LDU along), half its length along the track (20), how far out it reaches
   * from the centre line (80), its two studs' distance out (70), its arm's half width (10) */
  leverAlong: 20.4, leverHalf: 8, leverOut: 32, leverStuds: 28, armHw: 4,
  /** the lever's housing beside the straight exit, from the toe (320 to 468 LDU) */
  housing: [128, 187.2] as Vec2,
};
/** The levels inside (z): the floor's top, then wheel, link and the slide's feet, each 1.8 thick with 0.2 between, and the deck (2 thick). */
const Z = { floor: 1.6, wheel: [1.8, 3.6], link: [3.8, 5.6], feet: [5.8, 7.8], deck: 8 };
/** The wheel's pin in the slide: its radius from the pivot (so the swing gives the travel), its own radius; the link's and lever's pins' radius. */
const PIN_R = POINTS.travel / (2 * Math.sin(rad(POINTS.swing / 2))), PIN = 1.4, LPIN = 1.6;
/** Where the deck ends along the straight exit (past the lever's reach). */
const DECK_Y1 = 184;
const WALL = 1.6;

/** The moving parts, each a rigid move from as assembled (set straight) to f of the way to set for the branch: turned by deg about at, then moved by move (the points' own frame, a right-hand set). */
export type PointsPart = 'slide' | 'wheel' | 'link' | 'lever';
export function pointsMove(part: PointsPart, f: number): { at: Vec2; deg: number; move: Vec2 } {
  const half = POINTS.swing / 2, W: Vec2 = [0, POINTS.wheelY];
  const lw = (g: number): Vec2 => [W[0] + POINTS.linkR * Math.cos(rad(180 + half - g * POINTS.swing)), W[1] + POINTS.linkR * Math.sin(rad(180 + half - g * POINTS.swing))];
  const lv = (g: number): Vec2 => { const p = lw(g); return [0, p[1] + Math.sqrt(POINTS.linkLen ** 2 - p[0] ** 2)]; };
  if (part === 'wheel') return { at: W, deg: -f * POINTS.swing, move: [0, 0] };
  if (part === 'slide') return { at: W, deg: 0, move: [PIN_R * (Math.sin(rad(half - f * POINTS.swing)) - Math.sin(rad(half))), 0] };
  if (part === 'lever') return { at: W, deg: 0, move: [0, lv(f)[1] - lv(0)[1]] };
  const a0 = lw(0), b0 = lv(0), a = lw(f), b = lv(f);
  return { at: a0, deg: (Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0])) * (180 / Math.PI), move: [a[0] - a0[0], a[1] - a0[1]] };
}
/** How far the lever goes along the track from one end to the other. */
export const leverTravel = () => pointsMove('lever', 1).move[1];

export interface SwitchPlan {
  /** the straight route and the branch (local, from the toe; a left-hand set's mirrored to the right), and their rack gaps */
  main: Route; branch: Route; gm: RackGap[]; gb: RackGap[];
  /** +1: the branch to the right; -1: to the left */
  hand: 1 | -1;
  /** each route's length in the points */
  mainLen: number; branchLen: number;
  /** where the points' ends are (local poses, as drawn): the toe, the straight's end, the branch's */
  ends: Pose[];
}

/** Arc length where a route reaches height y (bisection). */
function rsAt(rt: Route, y: number, n = 40) {
  let lo = 0, hi = routeLength(rt);
  for (let k = 0; k < n; k++) { const m = (lo + hi) / 2; if (routePose(rt, m)[1] < y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const cx = (rt: Route, y: number) => routePose(rt, rsAt(rt, y))[0];
const trunc = (rt: Route, len: number): Route => {
  const segments: Route['segments'] = [];
  let left = len;
  for (const sg of rt.segments) {
    if (left <= 1e-6) break;
    const l = sg.kind === 'straight' ? sg.length : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180;
    const t = Math.min(l, left);
    segments.push(sg.kind === 'straight' ? { kind: 'straight', length: t } : { kind: 'arc', radius: sg.radius, angle: (Math.sign(sg.angle) * t * 180) / (Math.PI * sg.radius) });
    left -= t;
  }
  return { id: rt.id, start: [0, 0, 0], segments };
};
const mirrored = (rt: Route): Route => ({ ...rt, segments: rt.segments.map((sg) => (sg.kind === 'arc' ? { ...sg, angle: -sg.angle } : sg)) });
const flipped = (g: RackGap[]): RackGap[] => g.map((q) => ({ s: q.s, side: (-q.side) as 1 | -1 }));

/**
 * Lay out points where a branch leaves a main route, both from the toe, each with its rack gaps in its own s.
 * They're LEGO's own shape: the main straight for 32 studs, the branch through LEGO's end (20 studs on, 8 across, at
 * 45 degrees). Undefined if the routes as drawn aren't that.
 */
export function planSwitch(mainRt: Route, mainGaps: RackGap[], branchRt: Route, branchGaps: RackGap[]): SwitchPlan | undefined {
  const main0 = trunc(mainRt, POINTS.mainLen), b0 = trunc(branchRt, 400);
  if (routeLength(main0) < POINTS.mainLen - 1e-6) return undefined;
  const e = routePose(main0, POINTS.mainLen), mid = routePose(main0, POINTS.mainLen / 2);
  if (Math.hypot(e[0], e[1] - POINTS.mainLen) > 0.05 || Math.abs(mid[0]) > 0.05) return undefined;
  // (where the branch is at LEGO's end, and on which side)
  let branchLen = -1, hand: 1 | -1 = 1;
  const Lb = routeLength(b0);
  for (let s = 100; s <= Lb + 1e-6 && branchLen < 0; s += 0.5) {
    const p = routePose(b0, Math.min(s, Lb));
    if (Math.abs(Math.abs(p[0]) - POINTS.exit[0]) > 2 || Math.abs(p[1] - POINTS.exit[1]) > 2) continue;
    // (the nearest point to the end, to a hair)
    let lo = Math.max(0, s - 3), hi = Math.min(Lb, s + 3);
    const d = (q: number) => { const r = routePose(b0, q); return Math.hypot(Math.abs(r[0]) - POINTS.exit[0], r[1] - POINTS.exit[1]); };
    for (let k = 0; k < 50; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (d(m1) < d(m2)) hi = m2; else lo = m1; }
    const q = (lo + hi) / 2, r = routePose(b0, q);
    hand = r[0] > 0 ? 1 : -1;
    const turn = ((((r[2] + hand * POINTS.exitDeg) % 360) + 540) % 360) - 180;
    if (d(q) > 0.05 || Math.abs(turn) > 0.5) return undefined;
    branchLen = q;
  }
  if (branchLen < 0) return undefined;
  const bT = trunc(b0, branchLen), fit = (g: RackGap[], L: number) => g.filter((q) => q.s < L + 1);
  const endOf = (rt: Route): Pose => { const p = routePose(rt, routeLength(rt)); return [p[0], p[1], p[2] + 180]; };
  const ends: Pose[] = [[0, 0, 0], endOf(main0), endOf(bT)];
  return hand > 0 ? { main: main0, branch: bT, gm: fit(mainGaps, POINTS.mainLen), gb: fit(branchGaps, branchLen), hand, mainLen: POINTS.mainLen, branchLen, ends }
    : { main: main0, branch: mirrored(bT), gm: flipped(fit(mainGaps, POINTS.mainLen)), gb: flipped(fit(branchGaps, branchLen)), hand, mainLen: POINTS.mainLen, branchLen, ends };
}

/** supports: the slide's breakaway print supports, loose from it, printed with it. */
export interface PointsParts { base: Man; deck: Man; slide: Man; supports: Man; wheel: Man; link: Man; lever: Man }
/**
 * The points' six parts as assembled (set straight), in the points' frame. fit: the clearance round the moving parts.
 */
export function monoSwitch(mono: Mono, p: SwitchPlan, fit: number): PointsParts {
  const s = mono.s, w = s.w, c = fit, { main, branch } = p;
  const bt = MONO.beamTop, rhw = MONO.ridgeHw, hw = MONO.beamHw, Tv = POINTS.travel;
  const [y0, y1] = POINTS.slide, W: Vec2 = [0, POINTS.wheelY], half = POINTS.swing / 2;
  const rect = (x0: number, x1: number, ya: number, yb: number): CS => s.polygon([[x0, ya], [x1, ya], [x1, yb], [x0, yb]]);
  const disc = (at: Vec2, r: number): CS => w.CrossSection.circle(r, 48).translate(at);
  const slab = (cs: CS, z0: number, z1: number) => T(cs.extrude(z1 - z0), [0, 0, z0]);
  const cyl = (at: Vec2, r: number, z0: number, z1: number) => slab(disc(at, r), z0, z1);
  const hull = (cs: CS[]) => w.CrossSection.hull(cs);
  const all = (cs: CS[]) => w.CrossSection.union(cs);
  const moved = (cs: CS, part: PointsPart, f: number) => { const m = pointsMove(part, f); return cs.translate([-m.at[0], -m.at[1]]).rotate(m.deg).translate([m.at[0] + m.move[0], m.at[1] + m.move[1]]); };
  const STEPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  /** what a moving part's plan (convex pieces) sweeps from one end to the other */
  const swept = (cs: CS[], part: PointsPart) => all(cs.flatMap((q) => STEPS.slice(1).map((f, k) => hull([moved(q, part, STEPS[k]), moved(q, part, f)]))));
  const yBand = (ya: number, yb: number) => T(s.cube([4000, yb - ya, 100]), [-2000, ya, -50]);
  // (a rack cut square across the points, whatever its route's heading there: the slide's ends pass the fixed racks'
  // as it crosses. A scrap of a tooth the cut leaves loose past the rack's last gap, under 1 mm3: left out)
  const ridge = (rt: Route, gaps: RackGap[], ya: number, yb: number, dx = 0, sunk = 0.01) =>
    s.union(s.intersection(T(mono.ridgePlan(rt, Math.max(0, rsAt(rt, ya) - 3), Math.min(routeLength(rt), rsAt(rt, yb) + 3), gaps).extrude(MONO.ridgeTop - bt + sunk), [dx, 0, bt - sunk]), yBand(ya, yb)).decompose().filter((q) => q.volume() > 5));

  // ---- the plan ----
  // the wide deck: from its straight edge to past the curved rack where it idles, the slide's length; then the straight exit's beam as far as the lever reaches
  const edge: Vec2[] = [];
  for (let k = 0; k <= 48; k++) { const y = y0 + ((y1 - y0) * k) / 48; edge.push([cx(branch, y) + Tv + rhw + 1, y]); }
  const wide: CS = s.polygon([[-POINTS.deckHw, y0], ...edge, [-POINTS.deckHw, y1]]);
  const deckPlan = all([wide, rect(-hw, hw, y1 - 0.01, DECK_Y1)]);
  // the cross bars, each from the straight rack to the curved one
  const bars = POINTS.bars;
  const barX1 = (y: number) => cx(branch, y) + Tv + rhw;
  const stems = bars.map((y) => rect(-rhw, barX1(y), y - POINTS.barW / 2, y + POINTS.barW / 2));
  const feet = bars.map((y) => rect(-rhw, barX1(y), y - POINTS.barW / 2 - 0.8, y + POINTS.barW / 2 + 0.8));
  // the wheel's pin in the slide: where it is set straight, and the slot along the track it works in (on LEGO's middle bar)
  const pinAt: Vec2 = [W[0] + PIN_R * Math.sin(rad(half)), W[1] - PIN_R * Math.cos(rad(half))];
  const slot = rect(pinAt[0] - PIN - c, pinAt[0] + PIN + c, W[1] - PIN_R - PIN - c, pinAt[1] + PIN + c);
  const pad = rect(pinAt[0] - PIN - c - 2.4, pinAt[0] + PIN + c + 2.4, W[1] - PIN_R - PIN - c - 1.6, bars[1] + POINTS.barW / 2 + 0.8);
  const under = all([...feet, pad]);
  // the link and the lever
  const lw0: Vec2 = [W[0] + POINTS.linkR * Math.cos(rad(180 + half)), W[1] + POINTS.linkR * Math.sin(rad(180 + half))];
  const lv0: Vec2 = [0, lw0[1] + Math.sqrt(POINTS.linkLen ** 2 - lw0[0] ** 2)], yc = lv0[1] + POINTS.leverAlong;
  const linkPlan = hull([disc(lw0, POINTS.linkHw), disc(lv0, POINTS.linkHw)]);
  const armPlan = all([disc(lv0, POINTS.armHw), rect(-POINTS.armHw, POINTS.armHw, lv0[1], yc - POINTS.leverHalf + 0.01)]);
  const bodyPlan = rect(-POINTS.leverOut, POINTS.armHw, yc - POINTS.leverHalf, yc + POINTS.leverHalf);
  const leverPlan = all([armPlan, bodyPlan]);
  const wheelPlan = all([disc(W, POINTS.wheelR), disc(pinAt, PIN + 1.4)]);
  // the detent: a rib on the arm's side, a groove for it in the channel's wall at each end of the lever's travel
  const ribAt: Vec2 = [POINTS.armHw - 0.8 + c + 0.2, lv0[1] + 6], lt = leverTravel();

  // ---- the base ----
  const add: Man[] = [];
  for (const rt of [main, branch]) {
    const L = routeLength(rt);
    add.push(sweepRoute(s, mono.beam2d(mono.endsHw, mono.endsCh), rt, 0, L));
    add.push(sweepRoute(s, mono.beam2d(), rt, MONO.endLen, L - MONO.endLen));
  }
  add.push(slab(all([wide, rect(-POINTS.deckHw, hw, y1 - 0.01, POINTS.deckEnd)]), 0, bt));
  // the lever's housing: a floor beside the straight exit, a wall at each end
  const hy: Vec2 = [yc - POINTS.leverHalf - c, yc + lt + POINTS.leverHalf + c];
  add.push(slab(rect(-POINTS.deckHw, -hw + 0.01, POINTS.housing[0], POINTS.housing[1]), 0, Z.floor));
  add.push(slab(rect(-POINTS.deckHw, -hw + 0.01, POINTS.housing[0], hy[0]), 0, Z.deck));
  add.push(slab(rect(-POINTS.deckHw, -hw + 0.01, hy[1], POINTS.housing[1]), 0, Z.deck));
  // the fixed racks: the toe's, the straight exit's past the deck, the branch's past the slide
  add.push(ridge(main, p.gm, -1, y0 - c));
  add.push(ridge(main, p.gm, DECK_Y1 + c, POINTS.mainLen + 1));
  add.push(ridge(branch, p.gb, y1 + c, 1000));
  const cut: Man[] = [];
  // the deck's place (and a hair round it), down to the walls' tops
  cut.push(slab(deckPlan.offset(c / 2, 'Miter', 2), Z.deck, bt + 5));
  // the hollow under the wide deck, walled all round
  const hollow = wide.offset(-WALL, 'Miter', 2);
  // (what stands in it: the wheel's post, and posts under the deck wherever nothing moves)
  const busy = all([disc(W, PIN_R + PIN + 1.4 + c), swept([...feet, pad], 'slide'), swept([linkPlan], 'link')]).offset(c + 0.4, 'Round', 2, 16);
  const posts: CS[] = [];
  for (let x = -24; x <= 80; x += 12) for (let y = y0 + 8; y < y1; y += 8) {
    const q = disc([x, y], 2);
    if (q.subtract(hollow.offset(-1.2, 'Miter', 2)).area() < 1e-6 && q.intersect(busy).area() < 1e-6) posts.push(q);
  }
  // (the studs the deck presses onto, each on a post of its own: along both edges of the wide deck between the bars, and down the straight exit)
  const mids = [(y0 + bars[0]) / 2, (bars[0] + bars[1]) / 2, (bars[1] + bars[2]) / 2, (bars[2] + y1) / 2];
  const studs: Vec2[] = [...mids.flatMap((y): Vec2[] => [[-POINTS.deckHw + 3.4, y], [cx(branch, y) + Tv + rhw + 1 - 3.4, y]]), [12, y1 + 10], [12, (hy[0] + hy[1]) / 2], [12, DECK_Y1 - 5], [-12, DECK_Y1 - 4]];
  const studPosts = studs.map((q) => disc(q, 3.4));
  cut.push(s.difference(slab(hollow, Z.floor, Z.deck + 0.01), [slab(all([...posts, ...studPosts, disc(W, 2.4)]), 0, bt)]));
  // the slide's feet's way under the deck, the link's and the lever's ways, the wheel's pin's
  cut.push(slab(swept([...feet, pad], 'slide').offset(c, 'Miter', 2), Z.feet[0] - 0.2, Z.deck + 0.01));
  cut.push(slab(swept([linkPlan], 'link').offset(c, 'Round', 2, 16).subtract(disc(W, 2.4)), Z.floor, Z.deck + 0.01));
  cut.push(slab(hull([armPlan, armPlan.translate([0, lt])]).offset(c, 'Miter', 2), Z.floor, Z.deck + 0.01));
  cut.push(slab(rect(-POINTS.deckHw - 1, POINTS.armHw + c, hy[0], hy[1]), Z.floor, bt + 5));
  for (const dy of [0, lt]) cut.push(cyl([ribAt[0], ribAt[1] + dy], 0.9, Z.floor, Z.deck + 0.01));
  let base = s.difference(s.union(add), cut);
  base = s.union([base, ...studs.map((q) => cyl(q, 2.45, Z.deck - 0.01, bt - 0.2))]);

  // ---- the deck ----
  const slits = bars.map((y) => rect(-POINTS.deckHw - 1, barX1(y) + c, y - POINTS.barW / 2 - c, y + POINTS.barW / 2 + c));
  const sock = mono.antistud().slice(0);
  const deck = s.union([
    s.difference(slab(deckPlan.subtract(all(slits)), Z.deck, bt), studs.map((q) => T(sock.extrude(4), [q[0], q[1], Z.deck - 1]))),
    ridge(main, p.gm, y1 + c, DECK_Y1),
  ]);

  // ---- the slide: its two racks (the curved one aside, where it idles), the bars through the deck's slots, their feet and the pin's slot under it ----
  const racks = [ridge(main, p.gm, y0 + c, y1 - c, 0, 0), ridge(branch, p.gb, y0 + c, y1 - c, Tv, 0)];
  const slide = s.union([
    ...racks,
    slab(all(stems), Z.feet[1] - 0.01, bt + 0.01),
    slab(under.subtract(slot), Z.feet[0], Z.feet[1]),
  ]);

  // ---- the wheel (its pin for the slide, thicker below the slide's feet; its pin for the link), the link, the lever ----
  const wheel = s.union([
    slab(wheelPlan.subtract(disc(W, 2.4 + c)), Z.wheel[0], Z.wheel[1]),
    cyl(pinAt, PIN + 0.8, Z.wheel[1] - 0.01, Z.link[1]), cyl(pinAt, PIN, Z.link[1] - 0.01, Z.feet[1] - 0.2),
    cyl(lw0, LPIN, Z.wheel[1] - 0.01, Z.link[1]),
  ]);
  const link = slab(linkPlan.subtract(all([disc(lw0, LPIN + c / 2), disc(lv0, LPIN + c / 2)])), Z.link[0], Z.link[1]);
  const lever = s.union([
    slab(leverPlan, Z.wheel[0], Z.wheel[1]),
    cyl(lv0, LPIN, Z.wheel[1] - 0.01, Z.link[1]),
    slab(bodyPlan, Z.wheel[1] - 0.01, Z.feet[1]),
    ...[-MONO.stud / 2, MONO.stud / 2].map((dy) => cyl([-POINTS.leverStuds, yc + dy], 2.45, Z.feet[1] - 0.01, Z.feet[1] + 1.7)),
    cyl(ribAt, 0.8, Z.wheel[0], Z.wheel[1]),
  ]);
  // breakaway print supports (thin walls, 0.25 below what they hold, loose from it): the slide prints on its feet, its
  // racks above the bed between the bars; a wall under each flank of each rack holds it up (the rack bridges the 5 mm
  // between them), and snaps off after
  const keepOut = all(feet).offset(0.4, 'Miter', 2);
  const supports = s.union(racks.map((r) => { const fp = r.slice(bt + 0.5).offset(1, 'Round').offset(-1.1, 'Round'); return slab(fp.subtract(fp.offset(-0.7, 'Round')).subtract(keepOut), Z.feet[0], bt - 0.25); }));
  // (a left-hand set: the mirror image; then the three ends, which aren't mirrored: they join plain track either hand)
  const hand = (m: Man) => (p.hand > 0 ? m : M(m, [1, 0, 0]));
  const ended = s.difference(s.union([hand(base), ...p.ends.map((P) => placeAt(mono.endAdds(), P))]), p.ends.map((P) => placeAt(mono.endCuts(), P)));
  return { base: ended, deck: hand(deck), slide: hand(slide), supports: hand(supports), wheel: hand(wheel), link: hand(link), lever: hand(lever) };
}
