// LEGO monorail points (monorail_switch.scad, ported): a wide deck over the
// switching zone and a sliding frame on it carrying two rack segments, one
// per route, set by a hand lever with two studs beside the main route's exit.
// The .scad's two routes (a straight and LEGO's R28 45 degree curve) are here
// whatever the design's two routes are, from the switch's start: the main
// route, and the branch (LEGO's 5 mm of shared lead-in, then the branch
// route as drawn).
//
// Units: mm. Frame: the switch starts at y = 0 on x = 0 heading +y; z = 0 is
// the bottom of the beam.
import type { CS, Man, Vec2 } from './scad';
import { T } from './scad';
import { MONO, type Mono, type RackGap, placeAt } from './monorail';
import { routeLat, routeLength, routePose, type Pose, type Route } from '../route/route';
import { sweepRoute } from './sweep';

const rad = (d: number) => (d * Math.PI) / 180;

export interface SwitchPlan {
  /** the left and right routes (local), and their rack gaps */
  l: Route; r: Route; gl: RackGap[]; gr: RackGap[];
  /** which is the main route (its teeth before the zone), which the branch (set as assembled) */
  mainIsL: boolean;
  knobDir: 1 | -1; travel: number;
  z0: number; z1: number; barYs: number[];
  leverY: number;
  /** each route's length in the switch (the main's from the start, the branch's including the lead) */
  mainLen: number; branchLen: number;
  /** where the switch's ends are (local poses): its start, and each route's end */
  ends: Pose[];
}

/** Arc length where a route reaches height y (rs_at: bisection). */
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
  return { ...rt, segments };
};

/**
 * Lay out points: main (from the switch's start) and branch (from the toe,
 * lead mm along), each with its rack gaps in its own s. Undefined if the
 * routes don't part far enough.
 */
/** mainPhase: the main's length in the switch is this plus whole studs (so its end is on whole studs from its chain's start). */
export function planSwitch(mainRt: Route, mainGaps: RackGap[], branchRt: Route, branchGaps: RackGap[], lead: number, travel: number, mainPhase = 0): SwitchPlan | undefined {
  const grid = MONO.stud, endLen = MONO.endLen;
  const cap = 1200;
  const main = trunc({ id: 'main', start: [0, 0, 0], segments: mainRt.segments }, cap);
  const branch = trunc({ id: 'branch', start: [0, 0, 0], segments: [...(lead > 1e-6 ? [{ kind: 'straight' as const, length: lead }] : []), ...branchRt.segments] }, cap);
  const gm = mainGaps, gb = branchGaps.map((g) => ({ ...g, s: g.s + lead }));
  const Lm = routeLength(main), Lb = routeLength(branch);
  if (Lm < 3 * endLen || Lb < 3 * endLen) return undefined;
  // which side the branch goes: + right
  let side = 0;
  for (let s = lead + 8; s <= Lb && !side; s += 4) { const q = routePose(branch, s), d = routeLat(main, [q[0], q[1]]); if (Math.abs(d) > 2) side = Math.sign(d); }
  if (!side) return undefined;
  const mainIsL = side > 0;
  const l = mainIsL ? main : branch, r = mainIsL ? branch : main;
  const sep = (y: number) => Math.abs(cx(l, y) - cx(r, y));
  const yLast = Math.min(routePose(l, routeLength(l))[1], routePose(r, routeLength(r))[1]) - endLen;
  let z1 = endLen + 8;
  while (z1 <= yLast && sep(z1) < travel + 2) z1++;
  if (z1 > yLast) return undefined;
  const z0 = endLen, barYs = [z0 + 4, (z0 + z1) / 2, z1 - 4];
  // the branch ends once its beam's end is clear of the main beam, on whole studs from its toe
  const clear = (s: number) => {
    const p = routePose(branch, s), c = Math.cos(rad(p[2])), sn = Math.sin(rad(p[2]));
    return [-16.2, 16.2].every((o) => Math.abs(routeLat(main, [p[0] + o * c, p[1] + o * sn])) > 16.2 + 1);
  };
  let branchLen = Math.ceil((rsAt(branch, z1) + endLen + 8 - lead) / grid) * grid + lead;
  while (branchLen <= Lb && !clear(branchLen)) branchLen += grid;
  if (branchLen > Lb) { if (!clear(Lb)) return undefined; branchLen = Lb; }
  // (not leaving a scrap of beam after it: to the route's end then)
  const minRest = 3 * MONO.stud * 2;
  if (routeLength(branchRt) + lead - branchLen < minRest && routeLength(branchRt) + lead <= cap) branchLen = Lb;
  // the main runs on to LEGO's 32 studs, past the lever (40 past it) and level with the branch's end
  const leverY0 = Math.max(169, z1 + 24);
  const bEnd = routePose(branch, branchLen);
  let mainLen = Math.ceil((Math.max(32 * grid, leverY0 + 40, bEnd[1] + endLen) - mainPhase) / grid) * grid + mainPhase;
  const mClear = (s: number) => {
    const p = routePose(main, s), c = Math.cos(rad(p[2])), sn = Math.sin(rad(p[2]));
    return [-16.2, 16.2].every((o) => Math.abs(routeLat(branch, [p[0] + o * c, p[1] + o * sn])) > 16.2 + 1);
  };
  while (mainLen <= Lm && !mClear(mainLen)) mainLen += grid;
  if (mainLen > Lm || (routeLength(mainRt) - mainLen < minRest && routeLength(mainRt) <= cap)) mainLen = Lm;
  const mainT = trunc(main, mainLen), branchT = trunc(branch, branchLen);
  const lT = mainIsL ? mainT : branchT, rT = mainIsL ? branchT : mainT;
  const knobDir: 1 | -1 = mainIsL ? -1 : 1;
  const leverRt = knobDir > 0 ? rT : lT;
  const leverY = Math.min(leverY0, routePose(leverRt, routeLength(leverRt))[1] - 40);
  if (leverY < z1 + 8) return undefined;
  const endOf = (rt: Route): Pose => { const p = routePose(rt, routeLength(rt)); return [p[0], p[1], p[2] + 180]; };
  return { l: lT, r: rT, gl: (mainIsL ? gm : gb).filter((g) => g.s < routeLength(lT) + 1), gr: (mainIsL ? gb : gm).filter((g) => g.s < routeLength(rT) + 1), mainIsL, knobDir, travel, z0, z1, barYs, leverY,
    mainLen, branchLen, ends: [[0, 0, 0], endOf(lT), endOf(rT)] };
}

/**
 * The switch piece, its sliding frame and the frame's hand lever (as assembled, set for the branch), in the switch's
 * frame. supports: the frame's breakaway print supports, loose from it, printed with it.
 * (The frame and its lever were one part, which couldn't be put in: its bars slide into their slots from the side,
 * but its lever's arm lies in a channel under the deck, walled in all round. So the lever's a part of its own: the
 * frame slides in from either side, then the lever goes up into its channel from below, its peg into the frame's
 * last bar; on a baseplate it can't drop out.)
 */
export function monoSwitch(mono: Mono, p: SwitchPlan, fit: number): { base: Man; frame: Man; supports: Man; lever: Man } {
  const s = mono.s, w = s.w, { l, r, knobDir, travel, z0, z1, barYs } = p;
  const bt = MONO.beamTop, rhw = MONO.ridgeHw, hw = MONO.beamHw;
  const gaps = (rt: Route) => (rt === l ? p.gl : p.gr);
  const main = p.mainIsL ? l : r, sel = p.mainIsL ? r : l, other = main;
  const sq = (x0: number, x1: number, y0: number, y1: number) => s.polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const at = (rt: Route, y: number) => rsAt(rt, y);
  const idleHw = rhw + 2;
  const deckX = [Math.min(cx(l, z0), cx(l, z1)) - travel - idleHw, Math.max(cx(r, z0), cx(r, z1)) + travel + idleHw];
  // the hand lever: a slide with two studs, in a housing beside the main route, an arm under the deck to the frame's last bar
  const leverRt = knobDir > 0 ? r : l;
  const leverL = 16, leverW = 8, armW = 4, armZ = [0.4, bt - 2 - 1], leverWall = 2, barW = 4, barH = 2, barFlange = 1;
  const leverH = Math.abs(routePose(leverRt, at(leverRt, p.leverY))[2]);
  const leverIn = cx(leverRt, p.leverY) + knobDir * (hw / Math.cos(rad(leverH)) + (leverL / 2) * Math.tan(rad(leverH)) + 1 + travel);
  const leverCx = leverIn + (knobDir * leverW) / 2;
  const frameBarXs = (y: number) => { const xs = [cx(sel, y), cx(other, y) + knobDir * travel]; return [Math.min(...xs) - rhw, Math.max(...xs) + rhw]; };
  const barEnd = (y: number) => frameBarXs(y)[knobDir > 0 ? 1 : 0];
  const armA: Vec2 = [barEnd(barYs[2]) - (knobDir * armW) / 2, barYs[2]], armC: Vec2 = [leverCx, p.leverY];
  const sqAt = (c: Vec2, wx: number, wy: number) => sq(c[0] - wx / 2, c[0] + wx / 2, c[1] - wy / 2, c[1] + wy / 2);
  const leverPlan = (dx = 0, grow = 0): CS => {
    const cs = w.CrossSection.hull([sqAt(armA, armW, armW), sqAt(armC, armW, armW)]).add(sqAt(armC, leverW, leverL));
    return (grow ? cs.offset(grow, 'Miter', 2) : cs).translate([dx, 0]);
  };
  const leverSweep = (grow = 0) => w.CrossSection.hull([leverPlan(0, grow), leverPlan(-knobDir * travel, grow)]);
  const slideSweep = (grow = 0) => w.CrossSection.hull([0, -knobDir * travel].map((dx) => sqAt([armC[0] + dx, armC[1]], leverW + 2 * grow, leverL + 2 * grow)));
  const knobBarX = barEnd(barYs[1]) - knobDir * 3;
  const ridgeSeg = (rt: Route, a: number, b: number, dx = 0, sunk = 0.01) =>
    T(mono.ridgePlan(rt, a, b, gaps(rt)).extrude(MONO.ridgeTop - bt + sunk), [dx, 0, bt - sunk]);
  const c = fit;

  // ---- the switch piece ----
  const add: Man[] = [];
  for (const rt of [l, r]) {
    const L = routeLength(rt);
    add.push(sweepRoute(s, mono.beam2d(mono.endsHw, mono.endsCh), rt, 0, L));
    add.push(sweepRoute(s, mono.beam2d(), rt, MONO.endLen, L - MONO.endLen));
  }
  // flat deck across the zone, out to where the idle rack slides
  add.push(w.Manifold.hull([
    ...[l, r].map((rt) => sweepRoute(s, sq(-hw, hw, 0, bt), rt, z0, at(rt, z1))),
    ...([[l, -1], [r, 1]] as const).map(([rt, k]) => T(sweepRoute(s, sq(-idleHw, idleHw, 0, bt), rt, z0, at(rt, z1)), [k * travel, 0, 0])),
  ]));
  add.push(leverSweep(fit + leverWall).extrude(bt));
  // fixed ridges: the main's before the zone, each route's after it
  // (each cut off along the zone's edge, the way the frame slides, and the frame's racks likewise: cut square to its
  // own route, the branch's rack's slanted end ran into the fixed ridge's as the frame slid across, 5 mm3 of it)
  const yBand = (y0: number, y1: number) => T(s.cube([4000, y1 - y0, 100]), [-2000, y0, -50]);
  const over = 3;
  add.push(s.intersection(ridgeSeg(main, 0, at(main, z0) + over), yBand(-100, z0)));
  for (const rt of [l, r]) add.push(s.intersection(ridgeSeg(rt, at(rt, z1) - over, routeLength(rt)), yBand(z1, 1e4)));
  const ends: Pose[] = p.ends;
  for (const P of ends) add.push(placeAt(mono.endAdds(), P));
  const cut: Man[] = [];
  for (const y of barYs) {
    const x0 = deckX[0] - 1, x1 = deckX[1] + 1;
    cut.push(T(s.cube([x1 - x0, barW + 2 * c, barH + c + 1]), [x0, y - barW / 2 - c, bt - barH - c]));
    cut.push(T(s.cube([x1 - x0, barW + 2 * barFlange + 2 * c, barFlange + c]), [x0, y - barW / 2 - barFlange - c, bt - barH - barFlange - c]));
  }
  for (const dx of [0, -knobDir * travel]) cut.push(T(s.cylinder(1.3, 0.8, 0.8, 16), [knobBarX + dx, barYs[1], bt - barH - barFlange - c - 0.9]));
  cut.push(T(leverSweep(c).extrude(armZ[1] + 1 + 0.01), [0, 0, -1]));
  cut.push(T(slideSweep(c).extrude(bt), [0, 0, armZ[1]]));
  for (const P of ends) cut.push(placeAt(mono.endCuts(), P));
  const base = s.difference(s.union(add), cut);

  // ---- the sliding frame ----
  const off = knobDir * travel, fr: Man[] = [];
  const racks = [ridgeSeg(sel, at(sel, z0) - over, at(sel, z1) + over, 0, 0), ridgeSeg(other, at(other, z0) - over, at(other, z1) + over, off, 0)].map((m) => s.intersection(m, yBand(z0 + c, z1 - c)))
    // (a scrap of a tooth the cut leaves loose past the rack's last gap, 0.2 mm3: left out)
    .map((m) => s.union(m.decompose().filter((q) => q.volume() > 5)));
  fr.push(...racks);
  for (const y of barYs) {
    const [xa, xb] = frameBarXs(y);
    fr.push(T(s.cube([xb - xa, barW, barH + 0.02]), [xa, y - barW / 2, bt - barH - 0.01]));
    fr.push(T(s.cube([xb - xa, barW + 2 * barFlange, barFlange]), [xa, y - barW / 2 - barFlange, bt - barH - barFlange]));
  }
  fr.push(T(w.Manifold.sphere(0.7, 12), [knobBarX, barYs[1], bt - barH - barFlange - 0.4]));
  // the lever: its arm under the deck, its slide with two studs, and a peg up into the frame's last bar's end
  const pegR = 1.2, pegH = 2.4, lv: Man[] = [];
  lv.push(T(leverPlan().extrude(armZ[1] - armZ[0]), [0, 0, armZ[0]]));
  lv.push(T(s.cube([leverW, leverL, bt - armZ[0]]), [armC[0] - leverW / 2, armC[1] - leverL / 2, armZ[0]]));
  for (const dy of [-MONO.stud / 2, MONO.stud / 2]) lv.push(T(s.cylinder(1.7, 2.4, 2.4, 32), [armC[0], armC[1] + dy, bt - 0.01]));
  lv.push(T(s.cylinder(pegH + 0.01, pegR, pegR, 24), [armA[0], armA[1], armZ[1] - 0.01]));
  const frame = s.difference(s.union(fr), [T(s.cylinder(pegH + 0.2 + 0.01, pegR + 0.1, pegR + 0.1, 24), [armA[0], armA[1], armZ[1] - 0.01])]);
  // breakaway print supports (thin walls, 0.25 below what they hold, loose from it): as built the frame stands on its
  // detent's bump, its bars and racks above the bed; walls under each bar's flange and under each rack between the bars
  // hold them up while it prints, and snap off after (monorail_switch.scad's frame needed the slicer's supports)
  const zMin = bt - barH - barFlange - 0.4 - 0.7, gap = 0.25, rect = (wx: number, wy: number, x: number, y: number) => w.CrossSection.square([wx, wy]).translate([x, y]);
  const keepOut = w.CrossSection.union(barYs.map((y) => { const [xa, xb] = frameBarXs(y); return rect(xb - xa, barW + 2 * barFlange, xa, y - barW / 2 - barFlange); })).offset(0.4, 'Miter', 1000);
  const sup: Man[] = [];
  for (const y of barYs) {
    const [xa, xb] = frameBarXs(y), h = bt - barH - barFlange - gap - zMin;
    for (const yy of [y - barW / 2 - barFlange + 0.2, y + barW / 2 + barFlange - 0.8])
      sup.push(T(s.extrude(rect(xb - xa - 2, 0.6, xa + 1, yy), h), [0, 0, zMin]));
  }
  for (const rs of racks) {
    // (a strip under the rack's middle: the footprint with its teeth's gaps closed, shrunk)
    const fp = rs.slice(bt + 0.5).offset(1, 'Round').offset(-1, 'Round'), ring = fp.offset(-(MONO.ridgeHw - 1.2), 'Round').subtract(keepOut);
    if (ring.area() > 1) sup.push(T(s.extrude(ring, bt - gap - zMin), [0, 0, zMin]));
  }
  return { base, frame, supports: s.union(sup), lever: s.union(lv) };
}
