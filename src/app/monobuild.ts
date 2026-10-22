// Monorail routes into parts: the routes joined end to end into continuous
// beams (chains), points where one starts on another (monorail_switch.scad),
// the beams cut for the print bed square across with proper monorail ends
// both sides (as LEGO's pieces join), the rack in step all along, and the
// support columns. Runs beside the train track's build (build.ts).
import { arena, type Wasm } from '../geom/kernel';
import { Scad, type Man } from '../geom/scad';
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
  /** its height off the baseplate (mm), if its routes set one (the highest, if they differ: heightsDiffer) */
  elev?: number; heightsDiffer?: boolean;
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
    const els = parts.map((p) => routes[p.i].elev).filter((e): e is number => e !== undefined);
    chains.push({ name: rts.map((r) => r.id).join('+'), route: closed ? { ...once, segments: [...once.segments, ...once.segments] } : once, L, closed,
      gaps: closed ? [...gaps, ...gaps.map((g) => ({ ...g, s: g.s + L }))] : gaps,
      ...(els.length && { elev: Math.max(...els), heightsDiffer: els.some((e) => Math.abs(e - els[0]) > 0.01) || (els.length > 0 && els.length < parts.length) }) });
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
  const elevOf = (ci: number) => chains[ci].elev ?? elev0;
  chains.forEach((c) => {
    if (c.heightsDiffer) res.warnings.push(`monorail ${c.name}: its routes are set to different heights; ramps between heights aren't made yet, so it's all built at the highest (${((c.elev ?? 0) / 3.2).toFixed(0)} plates)`);
    if ((c.elev ?? 0) > 0 && !every) res.warnings.push(`monorail ${c.name} is raised ${((c.elev ?? 0) / 3.2).toFixed(0)} plates with nothing under it: set Support every (Settings › Monorail)`);
  });
  const issue = (at: [number, number], r: number, text: string) => res.issues.push({ at, r, text });
  const studs = (q: [number, number]) => `${(q[0] / 8).toFixed(0)}, ${(q[1] / 8).toFixed(0)}`;

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
    const elev = elevOf(br.main);
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
      const dz = Math.abs(elevOf(h.ci) - elevOf(h.cj));
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
    const elev = elevOf(p.c);
    const key = JSON.stringify({ seg: sub.segments, start: sub.start, gaps, sock, lines, mo, elev });
    const turn = fitAngle(footprint(c.route, p.a, p.b), X, Y);
    const b = cached(`mp:${key}:${turn}`, () => arena(w, () => {
      const label = underLabel(scad, lines, p.b - p.a - 20);
      return bake(mono.piece(sub, 0, p.b - p.a, gaps, [true, true], sock, label), turn ?? 0, elev);
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
    const elev = elevOf(x.arms[0].c);
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
  const supPoses: { P: Pose; h: number }[] = sups.map((q) => ({ P: routePose(chains[q.c].route, q.s), h: elevOf(q.c) }));
  if (every) for (const sw of switches) for (const e of sw.plan.ends) {
    const c = Math.cos((sw.P[2] * Math.PI) / 180), s = Math.sin((sw.P[2] * Math.PI) / 180);
    supPoses.push({ P: [sw.P[0] + e[0] * c - e[1] * s, sw.P[1] + e[0] * s + e[1] * c, sw.P[2] + e[2]], h: sw.elev });
  }
  const seen: Pose[] = [];
  if (supPoses.length) {
    // (each as tall as its beam: whole bricks and plates)
    const supFor = (h: number) => { const bricks = Math.floor((h + 0.01) / 9.6), so2 = { ...so, bricks, plates: Math.max(0, Math.round((h - bricks * 9.6) / 3.2)) };
      return cached(`sup:${JSON.stringify(so2)}`, () => arena(w, () => { const m = supportPart(scad, so2); return { stl: stlBytes(m.getMesh(), true), volume: m.volume(), mesh: m.getMesh() }; }, () => [])); };
    let n = 0;
    for (const { P, h } of supPoses) {
      if (h < 3.2) continue; // (a beam on the baseplate: nothing to hold up)
      const sp = supFor(h);
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
    for (const m of samples) if (elevOf(m.ci) < train.top && tp.some((t) => Math.abs(t[0] - m.q[0]) < r && Math.abs(t[1] - m.q[1]) < r && Math.hypot(t[0] - m.q[0], t[1] - m.q[1]) < r - 1) && !spots.some((q) => near(q, m.q, 64))) spots.push(m.q);
    for (const q of spots) issue([q[0], q[1]], 48, 'The monorail beam runs into train track here, at the same height');
    if (spots.length) res.warnings.push(`the monorail beam runs into train track at ${spots.slice(0, 4).map((q) => studs([q[0], q[1]])).join('; ')}${spots.length > 4 ? ' …' : ''} (studs), at the same height: move it, or raise the monorail on supports taller than the track`);
  }
  {
    // (beams over each other: two chains, or one coming back over itself, nearly touching away from the points)
    const spots: Pose[] = [], toes = res.splits;
    for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
      const p = samples[i], q = samples[j];
      if (Math.abs(p.q[0] - q.q[0]) > 31 || Math.abs(p.q[1] - q.q[1]) > 31) continue;
      if (Math.abs(elevOf(p.ci) - elevOf(q.ci)) >= MONO.ridgeTop + 3) continue; // (one over the other)
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
