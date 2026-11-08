// Switches that are bought track pieces, as plain straights and curves are
// (build.ts stdCurve): where a design's points are exactly LEGO's switch or
// BrickTracks' R104 switch, those two legs from the toe are the bought piece,
// cut out of the routes before the trackwork is worked out; what's left joins
// it at ordinary track ends. On ballast, its ballast is printed alone, with a
// seat it drops into.
import type { Pose, Route, Segment } from '../route/route';
import { poseToWorld, railPoint, routeLength, routePose } from '../route/route';
import type { Split } from '../route/solver';
import { reversedRoute } from '../switch/reverse';
import { subRoute } from '../switch/pieces';
import type { LegoPart } from './build';

/** A switch sold as a track piece: its straight leg and (to the left) its diverging leg, from the toe. */
export interface SwitchKind {
  /** its parts, left and right hand */
  left: LegoPart; right: LegoPart;
  /** the straight leg's length, mm */
  straight: number;
  /** the diverging leg's segments, turning left (mirrored for a right-hand one) */
  branch: Segment[];
  /** what else is in its footprint besides the two legs' sleepers, in the toe's frame (x across, + right; y along), turning left:
   * the lever's housing, the switch stand's spots */
  extras: [number, number, number, number][];
  /** the sleepers' length (mm): the footprint's width along each leg */
  sleeper: number;
}

/**
 * LEGO's switch points (53407 left, 53404 right; the same as the old 9 V points' shape): 32 studs straight; the branch
 * R40, out to 36.87 degrees and back to 22.5, ending 32.69 studs on and 12.96 over, so one more R40 curve makes a
 * parallel track 16 studs over. The lever's housing beside the toe, 2 to 5 studs on, out to 10 studs on the branch's side.
 */
export const LEGO_SWITCH: SwitchKind = {
  left: { part: '53407', name: 'Train, Track Plastic (RC Trains) Switch Point Left', qty: 1 },
  right: { part: '53404', name: 'Train, Track Plastic (RC Trains) Switch Point Right', qty: 1 },
  straight: 32 * 8,
  branch: [{ kind: 'arc', radius: 40 * 8, angle: 36.8699 }, { kind: 'arc', radius: 40 * 8, angle: -14.3699 }],
  extras: [[-80.25, 32, 16.15, 40.15]],
  sleeper: 64,
};

/**
 * BrickTracks' R104 switch (their R104 switch track kit: a left and a right): 40 studs straight, the branch an R104
 * curve of 22.5 degrees. Its switch stand clips to either side, 4.5 studs from the toe, 3 studs wide, 7 out.
 */
export const BRICKTRACKS_SWITCH: SwitchKind = {
  left: { part: 'BrickTracks R104 switch left', name: 'BrickTracks R104 switch, left (in their R104 switch track kit)', qty: 1, shop: 'bricktracks' },
  right: { part: 'BrickTracks R104 switch right', name: 'BrickTracks R104 switch, right (in their R104 switch track kit)', qty: 1, shop: 'bricktracks' },
  straight: 40 * 8,
  branch: [{ kind: 'arc', radius: 104 * 8, angle: 22.5 }],
  extras: [[-80, -24, 24, 48], [24, 80, 24, 48]],
  sleeper: 64,
};

/** A bought switch in a design: what it is, and its two legs from the toe (heading away from it). */
export interface BoughtSwitch {
  kind: SwitchKind; hand: 'left' | 'right'; part: LegoPart;
  toe: Pose;
  /** [straight, branch], each from the toe */
  legs: [Route, Route];
  /** the design's routes it takes the place of: [route, s0, s1] */
  covers: [number, number, number][];
}

const mirror = (sg: Segment): Segment => (sg.kind === 'arc' ? { ...sg, angle: -sg.angle } : sg);

/** Does leg (from the toe) run exactly as ref does, as far as ref goes? */
function same(leg: Route, ref: Route) {
  const L = routeLength(ref);
  if (routeLength(leg) < L - 0.01) return false;
  for (let d = 0; d <= L + 1e-6; d += Math.min(8, L - d) || 8) {
    const a = routePose(leg, d), b = routePose(ref, d);
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.3) return false;
    if (d >= L - 1e-6) return Math.abs(((a[2] - b[2] + 540) % 360) - 180) < 0.1;
  }
  return true;
}

/**
 * The design's switches that are bought pieces of these kinds: each split (or merge) whose two routes run on from the
 * toe exactly as the piece's two legs do, with nothing else on it: no other track within its base's reach (half: how
 * far the base reaches each side of a centre line), and not overlapping another.
 */
export function findBoughtSwitches(routes: Route[], splits: Split[], kinds: SwitchKind[], half: number): BoughtSwitch[] {
  const found: BoughtSwitch[] = [];
  for (const sp of splits) {
    const [i, j] = sp.routes, Lj = routeLength(routes[j]);
    // (the legs from the toe: on from it as drawn, or for a merge, back from it)
    const sT = sp.merge ? sp.spans[0][1] : sp.spans[0][0];
    const toe0 = routePose(routes[i], sT), toe: Pose = sp.merge ? [toe0[0], toe0[1], toe0[2] + 180] : toe0;
    const leg = (r: number, s: number, len: number): [Route, [number, number, number]] | undefined => {
      const L = routeLength(routes[r]);
      if (sp.merge) { if (s - len < -1e-6) return undefined; return [reversedRoute(subRoute(routes[r], s - len, s)), [r, s - len, s]]; }
      if (s + len > L + 1e-6) return undefined;
      return [subRoute(routes[r], s, s + len), [r, s, s + len]];
    };
    const sJ = sp.merge ? Lj : 0;
    for (const kind of kinds) {
      let hit: BoughtSwitch | undefined;
      for (const hand of ['left', 'right'] as const) {
        const ref = (segs: Segment[]): Route => ({ id: 'ref', start: toe, segments: segs });
        const refS = ref([{ kind: 'straight', length: kind.straight }]), refB = ref(hand === 'left' ? kind.branch : kind.branch.map(mirror));
        const LB = routeLength(refB);
        // (either route the straight leg, the other the branch)
        for (const [a, sa, b, sb] of [[i, sT, j, sJ], [j, sJ, i, sT]] as const) {
          const ls = leg(a, sa, kind.straight), lb = leg(b, sb, LB);
          if (!ls || !lb || !same(ls[0], refS) || !same(lb[0], refB)) continue;
          hit = { kind, hand, part: kind[hand], toe, legs: [ls[0], lb[0]], covers: [ls[1], lb[1]] };
        }
        if (hit) break;
      }
      if (!hit) continue;
      found.push(hit);
      break;
    }
  }
  // (nothing else on it: another track's centre line nearer a leg's than two bases' reach, beside it (not just meeting
  // it at the toe, nor running on from its ends, where the tracks part), and none overlapping another)
  const ends = (b: BoughtSwitch) => [b.toe, ...b.legs.map((l) => routePose(l, routeLength(l)))];
  const clash = (b: BoughtSwitch) => routes.some((rt, r) => {
    const L = routeLength(rt), mine = b.covers.filter((c) => c[0] === r);
    for (let s = 0; s <= L; s += 4) {
      if (mine.some(([, a, c]) => s >= a - 1e-6 && s <= c + 1e-6)) continue;
      const q = routePose(rt, s);
      if (ends(b).some((e) => Math.hypot(e[0] - q[0], e[1] - q[1]) < 16)) continue;
      for (const lg of b.legs) {
        const LL = routeLength(lg);
        // (nearest along the leg; beside it only, not past its toe or in its last stretch, where the legs part)
        let best = Infinity, bs = 0;
        for (let d = 0; d <= LL; d += 4) { const p = routePose(lg, d), dd = Math.hypot(p[0] - q[0], p[1] - q[1]); if (dd < best) { best = dd; bs = d; } }
        if (bs > 4 && bs < LL - 2 * half && best < 2 * half - 2) return true;
      }
    }
    return false;
  });
  const overlaps = (a: BoughtSwitch, b: BoughtSwitch) => a.covers.some(([r, s0, s1]) => b.covers.some(([r2, t0, t1]) => r === r2 && s0 < t1 - 1e-6 && t0 < s1 - 1e-6));
  return found.filter((b) => !clash(b) && !found.some((c) => c !== b && overlaps(b, c)));
}

/** The routes with the bought switches' stretches cut out: each route in the pieces either side (the first keeps its id). */
export function cutOut(routes: Route[], bought: BoughtSwitch[]): Route[] {
  const out: Route[] = [];
  routes.forEach((rt, r) => {
    const L = routeLength(rt), gone = bought.flatMap((b) => b.covers.filter((c) => c[0] === r).map((c) => [c[1], c[2]] as [number, number])).sort((a, b) => a[0] - b[0]);
    if (!gone.length) { out.push(rt); return; }
    let s = 0, k = 0;
    for (const [a, b] of [...gone, [L, L] as [number, number]]) {
      if (a - s > 1) { out.push({ ...rt, ...subRoute(rt, s, a, k === 0 ? rt.id : `${rt.id}~${k + 1}`) }); k++; }
      s = Math.max(s, b);
    }
  });
  return out;
}

/** Its footprint in plan, as outlines (mm): each leg's sleepers' band, and its extras (the lever housing, the stand). */
export function footprint(b: BoughtSwitch): [number, number][][] {
  const hw = b.kind.sleeper / 2;
  const band = (lg: Route) => {
    const L = routeLength(lg), n = Math.max(2, Math.ceil(L / 4));
    const side = (o: number) => Array.from({ length: n + 1 }, (_, k) => railPoint(lg, (L * k) / n, o));
    return [...side(-hw), ...side(hw).reverse()];
  };
  const flip = b.hand === 'left' ? 1 : -1;
  const rects = b.kind.extras.map(([x0, x1, y0, y1]) => {
    const xa = flip > 0 ? x0 : -x1, xb = flip > 0 ? x1 : -x0;
    return ([[xa, y0], [xb, y0], [xb, y1], [xa, y1]] as [number, number][]).map((q) => poseToWorld(b.toe, q));
  });
  return [...b.legs.map(band), ...rects];
}
