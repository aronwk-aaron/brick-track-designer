// Monorail routes into parts: the routes joined end to end into continuous
// beams (chains), points where one starts on another (monorail_switch.scad),
// the beams cut for the print bed square across with proper monorail ends
// both sides (as LEGO's pieces join), the rack in step all along, and the
// support columns. Runs beside the train track's build (build.ts).
import { arena, type Wasm } from '../geom/kernel';
import { R, Scad, T, type Man } from '../geom/scad';
import { sweepRoute } from '../geom/sweep';
import { stlBytes } from '../geom/stl';
import { MONO, MONO_DEFAULTS, Mono, type MonoOptions, rackGaps, type RackGap, SUPPORT_DEFAULTS, type SupportOptions, placeAt, subOf, supportHeight, supportPart, underLabel } from '../geom/monorail';
import { monoSwitch, type SwitchPlan, planSwitch } from '../geom/monoswitch';
import { routeLat, routeLength, routePose, routeSOf, segLength, segStarts, type Pose, type Route } from '../route/route';
import { reversedRoute } from '../switch/reverse';
import { type PieceOptions } from './design';
import type { Piece } from './build';

const dAng = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const near = (p: Pose, q: Pose, tol = 0.05) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;

/** A continuous beam: monorail routes joined end to end (a loop if it closes). */
export interface Chain {
  name: string;
  /** the beam's path (a loop's twice round, so any stretch of it is one piece of route) */
  route: Route;
  /** its length (once round) */
  L: number;
  closed: boolean;
  /** the rack's gaps (a loop's twice round) */
  gaps: RackGap[];
  /** its height along it: each route's stretch [s0, s1] and its heights at either end (mm; undefined: not set) */
  prof: { s0: number; s1: number; z0?: number; z1?: number }[];
}

/** The monorail routes joined end to end into chains. */
export function monoChains(routes: Route[]): Chain[] {
  const n = routes.length;
  const endPose = (i: number, e: 0 | 1): Pose => (e === 0 ? routes[i].start : routePose(routes[i], routeLength(routes[i])));
  // (the way out of the route at each end: back from its start, on from its end)
  const outward = (i: number, e: 0 | 1) => (e === 0 ? endPose(i, 0)[2] + 180 : endPose(i, 1)[2]);
  const mate = new Map<string, [number, 0 | 1]>();
  for (let i = 0; i < n; i++) for (const e of [0, 1] as const) {
    if (mate.has(`${i}:${e}`)) continue;
    for (let j = 0; j < n && !mate.has(`${i}:${e}`); j++) for (const f of [0, 1] as const) {
      if ((j === i && f === e) || mate.has(`${j}:${f}`)) continue;
      if (j === i && routes[i].segments.length === 0) continue;
      if (near(endPose(i, e), endPose(j, f)) && dAng(outward(i, e), outward(j, f) + 180) < 0.5) { mate.set(`${i}:${e}`, [j, f]); mate.set(`${j}:${f}`, [i, e]); break; }
    }
  }
  const used = new Set<number>(), chains: Chain[] = [];
  const walk = (i0: number, rev0: boolean) => {
    const parts: { i: number; rev: boolean }[] = [];
    let i = i0, rev = rev0, closed = false;
    for (;;) {
      parts.push({ i, rev }); used.add(i);
      const m = mate.get(`${i}:${rev ? 0 : 1}`);
      if (!m) break;
      if (m[0] === i0 && m[1] === (rev0 ? 1 : 0)) { closed = true; break; }
      if (used.has(m[0])) break;
      i = m[0]; rev = m[1] === 1;
    }
    const rts = parts.map((p) => (p.rev ? reversedRoute(routes[p.i]) : routes[p.i]));
    const once: Route = { id: rts[0].id, start: rts[0].start, segments: rts.flatMap((r) => r.segments) };
    const L = routeLength(once), gaps = rackGaps(once, closed);
    let acc = 0;
    const prof = parts.map((p) => { const rt = routes[p.i], L = routeLength(rt), a = rt.elev, b = rt.elevEnd ?? rt.elev, out = { s0: acc, s1: acc + L, z0: p.rev ? b : a, z1: p.rev ? a : b }; acc += L; return out; });
    chains.push({ name: rts.map((r) => r.id).join('+'), route: closed ? { ...once, segments: [...once.segments, ...once.segments] } : once, L, closed,
      gaps: closed ? [...gaps, ...gaps.map((g) => ({ ...g, s: g.s + L }))] : gaps,
      prof });
  };
  for (let i = 0; i < n; i++) if (!used.has(i) && routes[i].segments.length) {
    if (!mate.has(`${i}:0`)) walk(i, false);
    else if (!mate.has(`${i}:1`)) walk(i, true);
  }
  for (let i = 0; i < n; i++) if (!used.has(i) && routes[i].segments.length) walk(i, false);
  return chains;
}

/** Where a chain's end starts on another chain's middle (points): the toe, and which way the main chain runs from it. */
export interface MonoBranch { main: number; branch: number; toeS: number; dir: 1 | -1; branchEnd: 0 | 1 }
export function monoBranches(chains: Chain[]): MonoBranch[] {
  const out: MonoBranch[] = [];
  chains.forEach((b, bi) => {
    if (b.closed) return;
    for (const e of [0, 1] as const) {
      const q = e === 0 ? b.route.start : routePose(b.route, b.L), leave = e === 0 ? q[2] : q[2] + 180;
      chains.forEach((m, mi) => {
        if (mi === bi || out.some((x) => x.branch === bi && x.branchEnd === e)) return;
        const once: Route = m.closed ? { ...m.route, segments: m.route.segments.slice(0, m.route.segments.length / 2) } : m.route;
        if (Math.abs(routeLat(once, [q[0], q[1]])) > 0.05) return;
        const s = routeSOf(once, [q[0], q[1]]), p = routePose(once, s);
        if (!near(p, q, 0.1)) return;
        const d = dAng(p[2], leave);
        if (d < 0.5 && (m.closed || s <= m.L - 8)) out.push({ main: mi, branch: bi, toeS: s, dir: 1, branchEnd: e });
        else if (d > 179.5 && (m.closed || s >= 8)) out.push({ main: mi, branch: bi, toeS: s, dir: -1, branchEnd: e });
      });
    }
  });
  // (two routes drawn from one point, each a branch of the other: one set of points, the main the straighter one there)
  const bend = (c: Chain, s: number) => { const sg = c.route.segments.find((_, k, all) => { let a = 0; for (let j = 0; j < k; j++) a += segLength(all[j]); return s >= a - 1e-6 && s <= a + segLength(all[k]) + 1e-6; }); return sg && sg.kind === 'arc' ? 1 / sg.radius : 0; };
  return out.filter((x) => {
    const twin = out.find((y) => y !== x && y.main === x.branch && y.branch === x.main);
    if (!twin) return true;
    const bx = bend(chains[x.main], x.toeS), by = bend(chains[twin.main], twin.toeS);
    return bx < by || (bx === by && x.main < twin.main);
  });
}

/** The chain run from s0 the way dir says (+1 along it, -1 back), for length len, as a route starting there; and its rack gaps in that route's s. */
function oriented(c: Chain, s0: number, dir: 1 | -1, len: number): { route: Route; gaps: RackGap[] } {
  if (dir === 1) {
    const route = subOf(c.route, s0, s0 + len);
    return { route, gaps: c.gaps.filter((g) => g.s > s0 - 1 && g.s < s0 + len + 1).map((g) => ({ s: g.s - s0, side: g.side })) };
  }
  const route = reversedRoute(subOf(c.route, s0 - len, s0));
  return { route, gaps: c.gaps.filter((g) => g.s > s0 - len - 1 && g.s < s0 + 1).map((g) => ({ s: s0 - g.s, side: (-g.side) as 1 | -1 })) };
}

/** The angle (degrees) to turn a part so it fits the bed (x by y, either way round), the snuggest that does; undefined if none. */
export function fitAngle(pts: [number, number][], X: number, Y: number): number | undefined {
  let best: number | undefined, bestA = Infinity;
  for (let a = 0; a < 180; a += 1) {
    const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { const u = x * c + y * s, v = -x * s + y * c; x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    const w = x1 - x0, h = y1 - y0;
    if (((w <= X && h <= Y) || (w <= Y && h <= X)) && w * h < bestA - 1e-6) { bestA = w * h; best = w <= X && h <= Y ? a : a + 90; }
  }
  return best;
}
/** A stretch of beam's outline in plan (a little past its sides, its tabs past its ends). */
function footprint(rt: Route, a: number, b: number): [number, number][] {
  const pts: [number, number][] = [], n = Math.max(2, Math.ceil((b - a) / 4)), hw = 16.2;
  for (let k = 0; k <= n; k++) {
    const p = routePose(rt, a + ((b - a) * k) / n), c = Math.cos((p[2] * Math.PI) / 180), s = Math.sin((p[2] * Math.PI) / 180);
    for (const o of [-hw, hw]) pts.push([p[0] + o * c, p[1] + o * s]);
  }
  for (const [s0, back] of [[a, -1], [b, 1]] as const) {
    const p = routePose(rt, s0), c = Math.cos((p[2] * Math.PI) / 180), s = Math.sin((p[2] * Math.PI) / 180);
    for (const o of [-12, 12]) pts.push([p[0] + o * c - back * 0.5 * s, p[1] + o * s + back * 0.5 * c]);
  }
  return pts;
}
/** Is the chain straight from c - d to c + d (an end's features all on the straight)? */
function onStraight(rt: Route, c: number, d = MONO.endLen + 2) {
  const st = segStarts(rt);
  return rt.segments.some((sg, i) => sg.kind === 'straight' && st[i] <= c - d + 1e-6 && st[i] + segLength(sg) >= c + d - 1e-6);
}

/**
 * Where to cut a stretch [a, b] of a chain for the bed: whole studs from the
 * chain's start, on straights where it can, at the supports if there are
 * any, the parts as even as they go and as long as fit.
 */
export function planCuts(rt: Route, a: number, b: number, X: number, Y: number, grid: number, supportAt: (s: number) => boolean): number[] {
  const fits = (p: number, q: number) => fitAngle(footprint(rt, p, q), X, Y) !== undefined;
  if (fits(a, b)) return [];
  const minLen = 4 * MONO.stud;
  const cands = (p: number) => { const out: number[] = []; for (let c = Math.ceil((p + minLen) / grid) * grid; c < b - minLen + 1e-6; c += grid) out.push(c); return out; };
  const reach = (p: number) => { let m: number | undefined; for (const c of cands(p)) { if (fits(p, c)) m = c; else if (m !== undefined && c - m > 64) break; } return m; };
  const score = (c: number, target: number) => -Math.abs(c - target) / MONO.stud + (onStraight(rt, c) ? 6 : 0) + (supportAt(c) ? 4 : 0);
  // greedy, the furthest that fits (with a little give for a better place): how many parts it takes
  const greedy = () => {
    const out: number[] = [];
    let p = a;
    while (!fits(p, b)) {
      const m = reach(p);
      if (m === undefined) return undefined;
      const opts = cands(p).filter((c) => c <= m && c >= m - 0.3 * (m - p) && fits(p, c));
      const c = opts.reduce((x, y) => (score(y, m) > score(x, m) ? y : x), m);
      out.push(c); p = c;
    }
    return out;
  };
  const g = greedy();
  if (!g) { const mid = Math.round((a + b) / 2 / grid) * grid; return mid > a && mid < b ? [mid] : []; }
  // even parts: each cut near its share of the length, where it's best
  const n = g.length + 1, out: number[] = [];
  let p = a;
  for (let k = 1; k < n; k++) {
    const target = a + ((b - a) * k) / n, m = reach(p);
    if (m === undefined) return g;
    const opts = cands(p).filter((c) => c <= m && Math.abs(c - target) <= 6 * MONO.stud && fits(p, c));
    if (!opts.length) return g;
    const c = opts.reduce((x, y) => (score(y, target) > score(x, target) ? y : x));
    out.push(c); p = c;
  }
  return fits(p, b) ? out : g;
}

const memo = new Map<string, unknown>();
function cached<V>(key: string, f: () => V): V {
  if (memo.has(key)) return memo.get(key) as V;
  const v = f();
  memo.set(key, v);
  if (memo.size > 400) memo.delete(memo.keys().next().value!);
  return v;
}
export function clearMonoCache() { memo.clear(); }
function meshPositions(wm: { triVerts: Uint32Array; vertProperties: Float32Array; numProp: number }, dz = 0) {
  const tv = wm.triVerts, vp = wm.vertProperties, np = wm.numProp, out = new Float32Array(tv.length * 3);
  for (let i = 0, o = 0; i < tv.length; i++, o += 3) { const b = tv[i] * np; out[o] = vp[b]; out[o + 1] = vp[b + 1]; out[o + 2] = vp[b + 2] + dz; }
  return out;
}
interface Baked { positions: Float32Array; stl: Uint8Array; volume: number; box: { min: number[]; max: number[] } }
/** A part baked: its triangles in the design (raised dz), its STL turned by `turn` degrees to fit the bed. */
function bake(m: Man, turn = 0, dz = 0): Baked {
  const wm = m.getMesh(), local = turn ? m.rotate([0, 0, -turn]) : m;
  return { positions: meshPositions(wm, dz), stl: stlBytes(turn ? local.getMesh() : wm, true), volume: m.volume(), box: m.boundingBox() };
}

/**
 * A ramp part: the level part (its beam, rack, ends and side studs just as
 * the level track's) refined, then each point lifted by the ramp's height
 * where it is along it (z(s), s along sub), so the beam rises with its
 * cross-section upright, its ends square. Printed tilted so the line between
 * its ends lies level (the least height off the bed), on thin breakaway ribs
 * under the rest of its curve, 0.25 mm below it.
 */
function bakeRamp(scad: Scad, flat: Man, sub: Route, z: (s: number) => number, turn: number): Baked {
  const L = routeLength(sub);
  const world = flat.refineToLength(2).warp((v) => { v[2] += z(Math.min(L, Math.max(0, routeSOf(sub, [v[0], v[1]])))); });
  // (the print: the ends' line level; the bed under the lowest of the curve below that line)
  const pA = routePose(sub, 0), pB = routePose(sub, L), zA = z(0), zB = z(L), run = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]) || 1;
  const dir: [number, number] = [(pB[0] - pA[0]) / run, (pB[1] - pA[1]) / run], th = Math.atan2(zB - zA, run);
  const along = (q: [number, number]) => (q[0] - pA[0]) * dir[0] + (q[1] - pA[1]) * dir[1];
  const chord = (q: [number, number]) => zA + ((zB - zA) * along(q)) / run;
  let drop = 0;
  for (let k = 0; k <= 64; k++) { const sv = (L * k) / 64, q = routePose(sub, sv); drop = Math.max(drop, chord([q[0], q[1]]) - z(sv)); }
  const ribs: Man[] = [];
  for (let sv = 3; sv <= L - 3; sv += 6) {
    const q = routePose(sub, sv), gap = z(sv) - (chord([q[0], q[1]]) - drop);
    if (gap < 1) continue;
    const w2 = MONO.beamHw - 1.5;
    const rib = scad.cube([2 * w2, 0.6, gap - 0.25]);
    ribs.push(T(R(T(rib, [-w2, -0.3, 0]), [0, 0, q[2]]), [q[0], q[1], chord([q[0], q[1]]) - drop]));
  }
  const withRibs = ribs.length ? scad.union([world, ...ribs]) : world;
  // (tilted about the horizontal line through the start square to the run, by the chord's angle)
  const c = Math.cos(-th), sn = Math.sin(-th);
  const print = withRibs.warp((v) => {
    const a2 = (v[0] - pA[0]) * dir[0] + (v[1] - pA[1]) * dir[1], zz = v[2] - zA;
    const a3 = a2 * c - zz * sn, z3 = a2 * sn + zz * c;
    v[0] += (a3 - a2) * dir[0]; v[1] += (a3 - a2) * dir[1]; v[2] = z3 + zA;
  });
  const local = turn ? print.rotate([0, 0, -turn]) : print;
  return { positions: meshPositions(world.getMesh(), 0), stl: stlBytes(local.getMesh(), true), volume: world.volume(), box: world.boundingBox() };
}

/** The monorail settings from the piece options. */
export function monoOptions(o: Partial<PieceOptions>): MonoOptions {
  return { endStuds: o.monoEndStuds ?? MONO_DEFAULTS.endStuds, axleHoles: o.monoAxleHoles ?? MONO_DEFAULTS.axleHoles, legoAntistud: o.monoLegoAntistud ?? MONO_DEFAULTS.legoAntistud,
    axleLengthStuds: o.monoAxleLengthStuds ?? MONO_DEFAULTS.axleLengthStuds, holeFit: o.monoHoleFit ?? MONO_DEFAULTS.holeFit };
}
export function supportOptions(o: Partial<PieceOptions>): SupportOptions {
  return { bricks: o.monoSupportBricks ?? SUPPORT_DEFAULTS.bricks, plates: o.monoSupportPlates ?? SUPPORT_DEFAULTS.plates, baseXStuds: o.monoSupportBaseXStuds ?? SUPPORT_DEFAULTS.baseXStuds,
    baseYStuds: o.monoSupportBaseYStuds ?? SUPPORT_DEFAULTS.baseYStuds, antistud: o.monoSupportAntistud ?? SUPPORT_DEFAULTS.antistud, baseStuds: o.monoSupportBaseStuds ?? SUPPORT_DEFAULTS.baseStuds,
    solid: o.monoSupportSolid ?? SUPPORT_DEFAULTS.solid };
}

export interface MonoResult {
  pieces: Piece[]; volume: number; warnings: string[];
  issues: { at: [number, number]; r: number; text: string }[];
  /** the points' toes (mm), for the plan */
  splits: [number, number][];
}
/** The train track, to warn where a monorail beam runs into it: its routes, half-width and top. */
export interface TrainNear { routes: Route[]; half: number; top: number }

/**
 * Build the monorail routes (in mm). designName: engraved under each part
 * with its own name (labels permitting).
 */
export function buildMonorail(w: Wasm, routes: Route[], o: Partial<PieceOptions>, designName: string | undefined, train: TrainNear | undefined, report: (what: string) => void = () => {}): MonoResult {
  const scad = new Scad(w), mo = monoOptions(o), so = supportOptions(o), mono = new Mono(scad, mo);
  const X = o.printBedX ?? 256, Y = o.printBedY ?? 256, grid = MONO.stud;
  const every = Math.max(0, Math.round(o.monoSupportStuds ?? 0)) * MONO.stud, elev0 = every ? supportHeight(so) : 0;
  const labels = o.monoLabels ?? 'name';
  const travel = o.monoSwitchTravel ?? 27, fit = o.monoSwitchFit ?? 0.3;
  const res: MonoResult = { pieces: [], volume: 0, warnings: [], issues: [], splits: [] };
  const chains = monoChains(routes);
  if (!chains.length) return res;
  // (each beam's height: its routes' own, else the supports' (with supports), else on the baseplate)
  const issue = (at: [number, number], r: number, text: string) => res.issues.push({ at, r, text });
  const studs = (q: [number, number]) => `${(q[0] / 8).toFixed(0)}, ${(q[1] / 8).toFixed(0)}`;
  // (its height at s along it: a route's own, eased from its start height to its end height (level at both ends:
  // no kink where it meets the next), else the supports' height (with supports), else on the baseplate)
  // (LEGO's own ramps' shape (2677 and 2678, from their LDraw models): two parabolas, the lower curving up from level
  // to its steepest where they meet, the upper back to level; the slope changes evenly all the way)
  const ease = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u); };
  const zAt = (ci: number, s: number) => {
    const c = chains[ci], sw = c.closed ? ((s % c.L) + c.L) % c.L : Math.min(c.L, Math.max(0, s));
    const p = c.prof.find((q) => sw >= q.s0 - 1e-6 && sw <= q.s1 + 1e-6) ?? c.prof[c.prof.length - 1];
    if (p.z0 === undefined) return elev0;
    return p.z0 + ((p.z1 ?? p.z0) - p.z0) * ease((sw - p.s0) / Math.max(1e-9, p.s1 - p.s0));
  };
  const zRange = (ci: number, a: number, b: number) => { let lo = Infinity, hi = -Infinity; for (let k = 0; k <= 40; k++) { const z = zAt(ci, a + ((b - a) * k) / 40); lo = Math.min(lo, z); hi = Math.max(hi, z); } return [lo, hi]; };
  const elevOf = (ci: number) => zRange(ci, 0, chains[ci].L)[1];
  // (the steepest a ramp may climb: LEGO's own, 21.3° where its two ramp pieces meet (5 bricks up over 32 studs each);
  // the parabolas' steepest is twice the ramp's average)
  const MAX_GRADE = Math.tan((21.34 * Math.PI) / 180);
  chains.forEach((c, ci) => {
    c.prof.forEach((p, k) => {
      const q = c.prof[k + 1] ?? (c.closed ? c.prof[0] : undefined);
      const end = p.z1 ?? p.z0 ?? elev0, start = q ? q.z0 ?? elev0 : end;
      if (q && Math.abs(end - start) > 0.01) {
        const at = routePose(c.route, p.s1);
        issue([at[0], at[1]], 48, 'The monorail\'s height jumps here: one route ends at a different height from where the next starts');
        res.warnings.push(`monorail ${c.name}: its height jumps at ${studs([at[0], at[1]])} (studs), from ${(end / 3.2).toFixed(0)} to ${(start / 3.2).toFixed(0)} plates: make the routes meet at the same height (a route can ramp: set its end height)`);
      }
      const dz = Math.abs((p.z1 ?? p.z0 ?? 0) - (p.z0 ?? 0)), grade = (2 * dz) / Math.max(1, p.s1 - p.s0);
      if (grade > MAX_GRADE + 1e-6) {
        const at = routePose(c.route, (p.s0 + p.s1) / 2);
        issue([at[0], at[1]], 64, `A monorail ramp too steep: ${(Math.atan(grade) * 180 / Math.PI).toFixed(0)}° at its steepest (LEGO's ramps: 21°)`);
        res.warnings.push(`a monorail ramp at ${studs([at[0], at[1]])} (studs) is ${(Math.atan(grade) * 180 / Math.PI).toFixed(0)}° at its steepest, steeper than LEGO's monorail ramps (21°): the motor may slip; make it at least ${Math.ceil((2 * dz) / MAX_GRADE / 8)} studs long for that rise (LEGO's: 64 studs for 10 bricks)`);
      }
    });
    if (elevOf(ci) > 0 && !every) res.warnings.push(`monorail ${c.name} is raised ${(elevOf(ci) / 3.2).toFixed(0)} plates with nothing under it: set Support every (Settings › Monorail)`);
  });

  // ---- points: where a chain starts (or ends) on another, monorail_switch.scad's switch ----
  const branches = monoBranches(chains);
  // (each chain's stretches the switches take: [a, b] in its s)
  const taken: [number, number][][] = chains.map(() => []);
  const switches: { plan: SwitchPlan; P: Pose; key: string; elev: number }[] = [];
  for (const br of branches) {
    const M = chains[br.main], B = chains[br.branch];
    // (the branch run from its toe end; the main from LEGO's 5 mm before the toe, as far as there's room)
    const lead = Math.min(5, M.closed ? 5 : br.dir === 1 ? br.toeS : M.L - br.toeS);
    // (on a loop: where it starts, in the twice-round route, with room behind and ahead of it)
    let ms0 = br.toeS - br.dir * lead;
    if (M.closed) { ms0 = ((ms0 % M.L) + M.L) % M.L; if (br.dir === -1) ms0 += M.L; }
    const mainRoom = M.closed ? M.L - 64 : br.dir === 1 ? M.L - ms0 : ms0;
    const main = oriented(M, ms0, br.dir, Math.max(0, mainRoom));
    const bo = br.branchEnd === 0 ? oriented(B, 0, 1, B.L) : oriented(B, B.L, -1, B.L);
    const plan = planSwitch(main.route, main.gaps, bo.route, bo.gaps, lead, travel, (((-br.dir * ms0) % grid) + grid) % grid);
    const toe = routePose(M.route, br.toeS);
    if (!plan) { res.warnings.push(`monorail points at ${studs([toe[0], toe[1]])} (studs): the routes don't part far enough for points (they need about 4 studs between them, and room for the lever); not built`); continue; }
    const P = routePose(M.route, ms0);
    const Pd: Pose = br.dir === 1 ? P : [P[0], P[1], P[2] + 180];
    // (what it takes of each chain)
    taken[br.main].push(br.dir === 1 ? [ms0, ms0 + plan.mainLen] : [ms0 - plan.mainLen, ms0]);
    const bl = plan.branchLen - lead;
    taken[br.branch].push(br.branchEnd === 0 ? [0, bl] : [B.L - bl, B.L]);
    res.splits.push([toe[0], toe[1]]);
    if (res.splits.length === 1) res.warnings.push('monorail points are experimental: test-print a set before building more');
    const elev = zAt(br.main, ms0);
    switches.push({ plan, P: Pd, elev, key: JSON.stringify({ m: main.route.segments, b: bo.route.segments, lead, travel, fit, mo, elev }) });
  }

  // ---- level crossings: where two beams (or one coming back) cross at an angle, a piece of its own ----
  // (both beams through it, each with proper ends on its arms; each rack's ridge cut back where it's on the other beam,
  // the middle flat, so either train runs across: its gear coasts over the gap)
  const crossings: { at: [number, number]; arms: { c: number; a: number; b: number }[] }[] = [];
  {
    const poly = chains.map((c) => { const out: { q: Pose; s: number }[] = []; for (let s2 = 0; s2 <= c.L + 1e-6; s2 += 2) out.push({ q: routePose(c.route, s2), s: s2 }); return out; });
    const hits: { at: [number, number]; ci: number; si: number; cj: number; sj: number; ang: number }[] = [];
    for (let ci = 0; ci < chains.length; ci++) for (let cj = ci; cj < chains.length; cj++) {
      const P = poly[ci], Q = poly[cj];
      for (let i = 0; i + 1 < P.length; i++) for (let j = cj === ci ? i + 2 : 0; j + 1 < Q.length; j++) {
        const a = P[i].q, b = P[i + 1].q, c2 = Q[j].q, d = Q[j + 1].q;
        if (Math.max(a[0], b[0]) < Math.min(c2[0], d[0]) || Math.max(c2[0], d[0]) < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) < Math.min(c2[1], d[1]) || Math.max(c2[1], d[1]) < Math.min(a[1], b[1])) continue;
        const r = [b[0] - a[0], b[1] - a[1]], t2 = [d[0] - c2[0], d[1] - c2[1]], den = r[0] * t2[1] - r[1] * t2[0];
        if (Math.abs(den) < 1e-9) continue;
        const u = ((c2[0] - a[0]) * t2[1] - (c2[1] - a[1]) * t2[0]) / den, v = ((c2[0] - a[0]) * r[1] - (c2[1] - a[1]) * r[0]) / den;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const si = P[i].s + 2 * u, sj = Q[j].s + 2 * v;
        if (ci === cj && Math.abs(si - sj) < 64) continue;
        const ang = Math.abs((((P[i].q[2] - Q[j].q[2]) % 180) + 180) % 180);
        hits.push({ at: [a[0] + r[0] * u, a[1] + r[1] * u], ci, si, cj, sj, ang: Math.min(ang, 180 - ang) });
      }
    }
    for (const h of hits) {
      // (beams at different heights pass over each other: a crossing only at the same height, a warning if too close to clear)
      const dz = Math.abs(zAt(h.ci, h.si) - zAt(h.cj, h.sj));
      if (dz >= MONO.ridgeTop + 3) continue;
      if (dz > 0.01 && res.issues.some((q) => Math.hypot(q.at[0] - h.at[0], q.at[1] - h.at[1]) < 32)) continue;
      if (dz > 0.01) { issue(h.at, 48, 'Monorail beams cross here at heights too close to pass'); res.warnings.push(`monorail beams cross at ${studs(h.at)} (studs) ${(dz / 3.2).toFixed(0)} plates apart in height: too close to pass over each other (5 plates at least), and not level for a crossing`); continue; }
      if (crossings.some((x) => Math.hypot(x.at[0] - h.at[0], x.at[1] - h.at[1]) < 32)) continue;
      if (res.splits.some((t) => Math.hypot(t[0] - h.at[0], t[1] - h.at[1]) < 400)) continue;
      if (h.ang < 15) { issue(h.at, 48, 'Monorail beams cross here at too shallow an angle for a crossing'); res.warnings.push(`monorail beams cross at ${studs(h.at)} (studs) at ${h.ang.toFixed(0)}°: too shallow for a level crossing (15° at least)`); continue; }
      // (each arm long enough for the other beam's width at this angle and a proper end beyond, on whole studs)
      const half = (MONO.beamHw + 2) / Math.sin((h.ang * Math.PI) / 180) + MONO.endLen + 4;
      const arm = (c: number, s2: number) => {
        const C = chains[c], a = Math.floor((s2 - half) / grid) * grid, b = Math.ceil((s2 + half) / grid) * grid;
        return C.closed ? { c, a: a < 0 ? a + C.L : a, b: a < 0 ? b + C.L : b } : { c, a: Math.max(0, a), b: Math.min(C.L, b) };
      };
      const arms = [arm(h.ci, h.si), arm(h.cj, h.sj)];
      crossings.push({ at: h.at, arms });
      for (const x of arms) taken[x.c].push([x.a, x.b]);
    }
  }

  // ---- the plain beam: each chain's stretches outside the switches, cut for the bed ----
  type Part = { c: number; a: number; b: number };
  const parts: Part[] = [];
  const supportsAt: { c: number; s: number }[] = [];
  chains.forEach((c, ci) => {
    const tk = [...taken[ci]].map(([p, q]) => (c.closed ? [((p % c.L) + c.L) % c.L, ((p % c.L) + c.L) % c.L + (q - p)] : [p, q]) as [number, number]).sort((x, y) => x[0] - y[0]);
    // free stretches
    const free: [number, number][] = [];
    if (!c.closed) {
      let p = 0;
      for (const [x, y] of tk) { if (x > p + 1) free.push([p, x]); p = Math.max(p, y); }
      if (c.L > p + 1) free.push([p, c.L]);
    } else if (tk.length) {
      for (let k = 0; k < tk.length; k++) { const y = tk[k][1], x = k + 1 < tk.length ? tk[k + 1][0] : tk[0][0] + c.L; if (x > y + 1) free.push([y, x]); }
    } else {
      // a loop on its own: opened at a good place (a straight, at a support if any), cut there
      let seam = 0, best = -Infinity;
      for (let s = 0; s < c.L; s += grid) { const sc = (onStraight(c.route, s + c.L) ? 6 : 0) + (every && Math.abs(s / every - Math.round(s / every)) < 1e-6 ? 4 : 0); if (sc > best) { best = sc; seam = s; } }
      free.push([seam, seam + c.L]);
    }
    // supports: every so many studs from the chain's start (a loop's: round it)
    if (every) {
      const lim = c.closed ? c.L - every / 2 : c.L + 1e-6;
      for (let s = 0; s <= lim; s += every) supportsAt.push({ c: ci, s });
      if (!c.closed && c.L - Math.floor(c.L / every) * every > 2 * MONO.stud) supportsAt.push({ c: ci, s: c.L });
    }
    const supAt = (s: number) => supportsAt.some((q) => q.c === ci && (Math.abs(q.s - s) < 1e-6 || (c.closed && Math.abs(q.s + c.L - s) < 1e-6)));
    for (const [a, b] of free) {
      // (the cuts on whole studs from the chain's start)
      const cuts = planCuts(c.route, a, b, X, Y, grid, supAt);
      const bounds = [a, ...cuts, b];
      for (let k = 0; k + 1 < bounds.length; k++) parts.push({ c: ci, a: bounds[k], b: bounds[k + 1] });
    }
  });
  // (a support near a part's end, but not at it, moved onto the joint: its studs in the two ends' anti-studs)
  const sockets = new Map<Part, number[]>();
  for (const sp of supportsAt) {
    const c = chains[sp.c];
    const sIn = (p: Part, s: number) => s >= p.a - 1e-6 && s <= p.b + 1e-6;
    const alt = (s: number) => (c.closed ? [s, s + c.L] : [s]);
    const p = parts.find((q) => q.c === sp.c && alt(sp.s).some((s) => sIn(q, s)));
    if (!p) { sp.s = NaN; continue; } // (on a switch: it stands under the switch's ends instead)
    const s = alt(sp.s).find((x) => sIn(p, x))!;
    if (s - p.a < 1.5 * MONO.endLen) sp.s = p.a; else if (p.b - s < 1.5 * MONO.endLen) sp.s = p.b;
    else { sp.s = s; sockets.set(p, [...(sockets.get(p) ?? []), s]); }
  }

  // ---- build them ----
  const names = new Map<number, number>();
  parts.forEach((p, k) => {
    report(`Building monorail part ${k + 1} of ${parts.length}`);
    const c = chains[p.c], n = (names.get(p.c) ?? 0) + 1; names.set(p.c, n);
    const count = parts.filter((q) => q.c === p.c).length;
    const name = `monorail-${c.name}${count > 1 ? `-${n}` : ''}`;
    const tag = `${c.name.split('+')[0]}${count > 1 ? `-${n}` : ''}`.toUpperCase();
    const text = (o.labelText || designName || '').toUpperCase();
    const lines = labels === 'none' ? [] : labels === 'part' ? [tag] : [text, tag];
    const sub = subOf(c.route, p.a, p.b), gaps = c.gaps.filter((g) => g.s > p.a - 1 && g.s < p.b + 1).map((g) => ({ ...g, s: g.s - p.a }));
    const sock = (sockets.get(p) ?? []).map((s) => s - p.a);
    const [zlo, zhi] = zRange(p.c, p.a, p.b), ramp = zhi - zlo > 0.05, elev = zlo;
    const zs = ramp ? Array.from({ length: 33 }, (_, k) => zAt(p.c, p.a + ((p.b - p.a) * k) / 32)) : [];
    const key = JSON.stringify({ seg: sub.segments, start: sub.start, gaps, sock, lines, mo, elev, zs });
    const turn = fitAngle(footprint(c.route, p.a, p.b), X, Y);
    const b = cached(`mp:${key}:${turn}`, () => arena(w, () => {
      const label = underLabel(scad, lines, p.b - p.a - 20), flat = mono.piece(sub, 0, p.b - p.a, gaps, [true, true], sock, label);
      if (!ramp) return bake(flat, turn ?? 0, elev);
      return bakeRamp(scad, flat, sub, (sl) => zAt(p.c, p.a + sl), turn ?? 0);
    }, () => []));
    res.pieces.push({ name, color: 0x9aa3ad, positions: b.positions.slice(), stl: b.stl.slice() });
    res.volume += b.volume;
    if (turn === undefined) {
      const bb = b.box;
      issue([(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2], Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) / 2, `A monorail part too big for the ${X} x ${Y} print bed`);
      res.warnings.push(`a monorail part (${name}) doesn't fit the ${X} x ${Y} print bed: there's nowhere to cut it`);
    }
  });
  switches.forEach((sw, k) => {
    report(`Building monorail points ${k + 1} of ${switches.length}`);
    const tag = switches.length > 1 ? `monorail-points${k + 1}` : 'monorail-points';
    const pts = cached(`ms:${sw.key}`, () => arena(w, () => {
      const g = monoSwitch(mono, sw.plan, fit);
      const base = placeAt(g.base, sw.P), frame = placeAt(g.frame, sw.P);
      const tb = fitAngle(outline(base), X, Y);
      return { base: bake(base, tb ?? 0, sw.elev), frame: bake(frame, fitAngle(outline(frame), X, Y) ?? 0, sw.elev), fits: tb !== undefined };
    }, () => []));
    res.pieces.push({ name: `${tag}-base`, color: 0x9aa3ad, positions: pts.base.positions.slice(), stl: pts.base.stl.slice() });
    res.pieces.push({ name: `${tag}-frame`, color: 0x4682b4, positions: pts.frame.positions.slice(), stl: pts.frame.stl.slice() });
    res.volume += pts.base.volume + pts.frame.volume;
    if (!pts.fits) {
      const bb = pts.base.box;
      issue([(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2], Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) / 2, `Monorail points too big for the ${X} x ${Y} print bed`);
      res.warnings.push(`the monorail points (${tag}) don't fit the ${X} x ${Y} print bed: points aren't cut`);
    }
  });
  crossings.forEach((x, k) => {
    report(`Building monorail crossing ${k + 1} of ${crossings.length}`);
    const name = crossings.length > 1 ? `monorail-crossing${k + 1}` : 'monorail-crossing';
    const elev = zAt(x.arms[0].c, (x.arms[0].a + x.arms[0].b) / 2);
    const key = JSON.stringify({ arms: x.arms.map((a) => [chains[a.c].route.segments, chains[a.c].route.start, a.a, a.b]), mo, elev });
    const b = cached(`mx:${key}`, () => arena(w, () => {
      const arms = x.arms.map((a) => {
        const C = chains[a.c], sub = subOf(C.route, a.a, a.b), gaps = C.gaps.filter((g) => g.s > a.a - 1 && g.s < a.b + 1).map((g) => ({ ...g, s: g.s - a.a }));
        return { sub, m: mono.piece(sub, 0, a.b - a.a, gaps, [true, true]) };
      });
      // (each beam's ridge off where it's on the other beam: above its top, the other's width and a little)
      const over = (sub: Route) => sweepRoute(scad, scad.square([2 * MONO.beamHw + 3, 20]).translate([-MONO.beamHw - 1.5, MONO.beamTop - 0.01]), sub);
      const m = scad.union([scad.difference(arms[0].m, [over(arms[1].sub)]), scad.difference(arms[1].m, [over(arms[0].sub)])]);
      return bake(m, fitAngle(outline(m), X, Y) ?? 0, elev);
    }, () => []));
    res.pieces.push({ name, color: 0x9aa3ad, positions: b.positions.slice(), stl: b.stl.slice() });
    res.volume += b.volume;
    if (res.warnings.every((wn) => !/level crossings are experimental/.test(wn))) res.warnings.push('monorail level crossings are experimental: the gear coasts across the middle (no rack there); test-print one first');
  });
  // ---- supports: one part each, standing under the beam ----
  const sups = supportsAt.filter((q) => Number.isFinite(q.s));
  // (and under each switch's ends)
  const slopeAt = (ci: number, sv: number) => (zAt(ci, sv + 1) - zAt(ci, sv - 1)) / 2;
  const supPoses: { P: Pose; h: number; slope?: number }[] = sups.map((q) => ({ P: routePose(chains[q.c].route, q.s), h: zAt(q.c, q.s), slope: slopeAt(q.c, q.s) }));
  if (every) for (const sw of switches) for (const e of sw.plan.ends) {
    const c = Math.cos((sw.P[2] * Math.PI) / 180), s = Math.sin((sw.P[2] * Math.PI) / 180);
    supPoses.push({ P: [sw.P[0] + e[0] * c - e[1] * s, sw.P[1] + e[0] * s + e[1] * c, sw.P[2] + e[2]], h: sw.elev });
  }
  const seen: Pose[] = [];
  if (supPoses.length) {
    // (each as tall as its beam: whole bricks and plates)
    // (under a ramp: exactly as tall as the beam where it stands, its top tilted to the beam's slope, the studs into its
    // anti-studs (which lean with the beam, as they're lifted with it))
    const supFor = (h: number, slope = 0) => {
      const flat = Math.abs(slope) < 1e-3, bricks = Math.floor((h + 0.01) / 9.6);
      const so2 = { ...so, bricks, plates: flat ? Math.max(0, Math.round((h - bricks * 9.6) / 3.2)) : (h - bricks * 9.6) / 3.2 };
      return cached(`sup:${JSON.stringify(so2)}:${slope.toFixed(4)}`, () => arena(w, () => {
        let m = supportPart(scad, so2);
        if (!flat) { const H = supportHeight(so2); m = m.refineToLength(2).warp((v) => { const k = Math.min(1, Math.max(0, (v[2] - (H - 8)) / 8)); v[2] += k * v[1] * slope; }); }
        return { stl: stlBytes(m.getMesh(), true), volume: m.volume(), mesh: m.getMesh() };
      }, () => []));
    };
    let n = 0;
    for (const { P, h, slope } of supPoses) {
      if (h < 3.2) continue; // (a beam on the baseplate: nothing to hold up)
      const sp = supFor(h, slope ?? 0);
      if (seen.some((q) => near(q, P, 1))) continue;
      seen.push(P);
      const pos = meshPositions(sp.mesh), c = Math.cos((P[2] * Math.PI) / 180), s = Math.sin((P[2] * Math.PI) / 180);
      for (let i = 0; i < pos.length; i += 3) { const x = pos[i], y = pos[i + 1]; pos[i] = P[0] + x * c - y * s; pos[i + 1] = P[1] + x * s + y * c; }
      res.pieces.push({ name: `monorail-support${++n}`, color: 0x5a6470, positions: pos, stl: sp.stl.slice() });
      res.volume += sp.volume;
    }
  }

  // ---- where it runs into other things ----
  const samples = chains.flatMap((c, ci) => { const out: { q: Pose; ci: number; s: number }[] = []; for (let s = 0; s <= c.L; s += 8) out.push({ q: routePose(c.route, s), ci, s }); return out; });
  if (train && train.routes.length && chains.some((_, ci) => elevOf(ci) < train.top)) {
    const tp = train.routes.flatMap((rt) => { const L = routeLength(rt), out: Pose[] = []; for (let s = 0; s <= L; s += 8) out.push(routePose(rt, s)); return out; });
    const r = MONO.beamHw + train.half, spots: Pose[] = [];
    for (const m of samples) if (zAt(m.ci, m.s) < train.top && tp.some((t) => Math.abs(t[0] - m.q[0]) < r && Math.abs(t[1] - m.q[1]) < r && Math.hypot(t[0] - m.q[0], t[1] - m.q[1]) < r - 1) && !spots.some((q) => near(q, m.q, 64))) spots.push(m.q);
    for (const q of spots) issue([q[0], q[1]], 48, 'The monorail beam runs into train track here, at the same height');
    if (spots.length) res.warnings.push(`the monorail beam runs into train track at ${spots.slice(0, 4).map((q) => studs([q[0], q[1]])).join('; ')}${spots.length > 4 ? ' …' : ''} (studs), at the same height: move it, or raise the monorail on supports taller than the track`);
  }
  {
    // (beams over each other: two chains, or one coming back over itself, nearly touching away from the points)
    const spots: Pose[] = [], toes = res.splits;
    for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
      const p = samples[i], q = samples[j];
      if (Math.abs(p.q[0] - q.q[0]) > 31 || Math.abs(p.q[1] - q.q[1]) > 31) continue;
      if (Math.abs(zAt(p.ci, p.s) - zAt(q.ci, q.s)) >= MONO.ridgeTop + 3) continue; // (one over the other)
      if (p.ci === q.ci && (Math.abs(p.s - q.s) < 64 || (chains[p.ci].closed && chains[p.ci].L - Math.abs(p.s - q.s) < 64))) continue;
      if (Math.hypot(p.q[0] - q.q[0], p.q[1] - q.q[1]) >= 31) continue;
      if (toes.some((t) => Math.hypot(t[0] - p.q[0], t[1] - p.q[1]) < 400)) continue;
      if (crossings.some((x) => Math.hypot(x.at[0] - p.q[0], x.at[1] - p.q[1]) < 80)) continue;
      if (!spots.some((s) => near(s, p.q, 64))) spots.push(p.q);
    }
    for (const q of spots) issue([q[0], q[1]], 48, 'Monorail beams run over each other here');
    if (spots.length) res.warnings.push(`monorail beams run over each other at ${spots.slice(0, 4).map((q) => studs([q[0], q[1]])).join('; ')} (studs): they run along each other (they can only cross at 15° or more)`);
  }
  return res;
}

/** A solid's outline points in plan (its box's corners, near enough to fit it to the bed: the vertices). */
function outline(m: Man): [number, number][] {
  const g = m.getMesh(), vp = g.vertProperties, np = g.numProp, out: [number, number][] = [];
  for (let i = 0; i < vp.length; i += np) out.push([vp[i], vp[i + 1]]);
  return out;
}
