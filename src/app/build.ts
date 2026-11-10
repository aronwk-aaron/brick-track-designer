// Solving and building a design: what the canvas draws over the track
// (flangeway cuts, check rails, crossings, points, the tubes that grip), and
// the pieces: a switch wherever routes split (base and moving parts), the
// rest as fixed trackwork. Runs in the worker (and in tests).
import { Scad, R, T, type CS, type Man } from '../geom/scad';
import { sweepRoute } from '../geom/sweep';
import { DEFAULTS as TRACK_DEFAULTS, PLATE_H, Track } from '../geom/track';
import { CROSSING_DEFAULTS, crossingPiece, joinedEnds, ownSleeperSpots } from '../geom/crossing';
import { trackSeat } from '../geom/extras';
import { DUAL_CROSS, dualBuilt, markClear } from '../geom/extrarails';
import { arena, flat, kernelBroke, made, type Wasm } from '../geom/kernel';
import { stlBytes } from '../geom/stl';
import { bedFit, type BedFit, END_REACH, longestFit, longestTrack, tightBox } from '../geom/bedfit';
import { splitSelfCrossing } from '../route/selfcross';
import { FORCE_ANGLE, FORCE_LAT, solve, type SplitEdits } from '../route/solver';
import { GRADE_APART, hasRoll, heightAt, hostedEnds, poseToWorld, railOffsetOf, railPoint, routeLat, routeLength, routePose, routeRoll, routeSOf, sleeperLenOf, type Pose, worldToPose } from '../route/route';
import { reversedRoute } from '../switch/reverse';
import { BASE_DEFAULTS, switchGeometry } from '../switch/base';
import { switchGlobals } from '../switch/context';
import { planPieces, subRoute, toFrame } from '../switch/pieces';
import { networkBody, networkSplits, type SplitParts, throwMoves } from '../switch/network';
import { blocks as tileBlocks, cropRoutes, nearCell, planCuts, routesBox, type Rect } from './tiles';
import type { CheckRail, Split } from '../route/solver';
import { planSections } from './sections';
import type { Route } from '../route/route';
import { cutPiece, type CutLine } from '../geom/cutter';
import { edgeGrip } from '../geom/underside';
import { pathSplit, splitOnPath, type Keep } from '../geom/pathsplit';
import { findStuds, wholeStuds } from '../geom/studs';
import { bankRolls, type Design, OPTION_DEFAULTS, type PieceOptions, type Trackwork, bufferEnds, isMono, routeGaugeStuds, toRoutes, upgradeDesign } from './design';
import { labelCut, labelLines } from '../geom/labels';
import { buildMonorail, clearMonoCache } from './monobuild';
import { tableAt, tableOf, tableOutline, type Table } from './tables';
import { buildScope, clearSolids, jobScope, SolidCache } from './solidcache';
import { carriedOn } from './carryon';
import { BRICKTRACKS_SWITCH, BT_LEAD, type BoughtSwitch, cutOut, findBoughtSwitches, footprint, LEGO_SWITCH } from './boughtswitch';

/** An item of trackwork the hand edits apply to: a check rail, a flangeway cut, a points set. */
export interface TrackworkItem {
  kind: 'check' | 'groove' | 'points' | 'throw'; key: string; at: [number, number]; pts: [number, number][]; off?: boolean; len?: number; toe?: number; dir?: [number, number];
  /** routes: the routes it's between, by their ids (a hand edit is matched to its item by them when a route's reshaped: twfollow.ts): points, the
   * two whose points they are; a flangeway cut, the rail's route and the one whose flanges cut it; a check rail, its route and the one crossing it.
   * Points made by hand (forced); a near miss where points could be forced (cand: whether they can, and how far off it is) */
  routes?: string[]; forced?: boolean; cand?: { ok: boolean; why: string };
  /** a lever ('throw'): its points' frame (mm, degrees), side (+1 right), the track's edge beside it and the pivot's y (in the frame), the longest tines, and its settings now */
  lever?: { frame: Pose; side: number; stockX: number; edge: number; minD: number; pivotY: number; maxTine: number; leverOffset: number; springLength: number; edited: boolean;
    /** one of a three-way's two levers (threeWayLevers 2): which, its hand edits its own (Trackwork.throw's each) */
    blade?: 'left' | 'right' };
}

/** A built piece: its mesh in the design (for the view) and its STL (in its own frame, to print). */
export interface Piece {
  name: string; color: number; positions: Float32Array; stl: Uint8Array;
  /** its breakaway print supports (the small loose bits printed with it), apart, for the view to show or hide */
  supports?: Float32Array;
  /** (the plate-style blades) the pin it turns on, as assembled, and how far to turn it there to open it (degrees): it goes on open.
   * tilt (blades with a lip over the front): the ends of the plate's front's bottom edge, which goes in first, tilted under the lip */
  turn?: { at: [number, number]; by: number; swing?: number; tilt?: [[number, number], [number, number]] };
  /** (a slider, and its posts' piece) how it slides from as assembled to its other end: along dir (a unit vector) by by (mm) */
  slide?: { dir: [number, number]; by: number };
  /** (a lever) how it swings from as assembled to its other end: about its pivot at, the axis level along axis (a unit vector), by by (degrees, right-handed) */
  hinge?: { at: [number, number, number]; axis: [number, number]; by: number };
  /** LEGO parts this piece is (a plain straight as LEGO's own track, its ballast as plates): not printed, in the LEGO parts list */
  lego?: LegoPart[];
  /** (track on a grade) how it's lifted in the view: by h at its middle c, rising slope along dir (mm, a unit vector) */
  lift?: Lift;
  /** how far its file's turned from how it lies in the design (degrees, anticlockwise seen from above): a part that fits the print bed only on the slant, its file lying as it prints */
  bedTurn?: number;
  /** (a test-print kit's part) its coupon's name, which its own name starts with (buildKit) */
  kit?: string;
  /** (a bought track piece, track only) where a 2 x 2 of studs goes up into it from below: its sleepers' middles and its two ends (half of it in the next piece's end), each square to the track there */
  seats?: Pose[];
}

/** A piece's lift onto its grade: its height at its middle c, and how it rises along dir. */
export interface Lift { h: number; slope: number; dir: [number, number]; c: [number, number] }
/** A box's triangles (corner positions, for the view): w across and l along a pose (its middle), h high from z 0. */
function boxTris(q: Pose, w: number, l: number, h: number): number[] {
  const a = (q[2] * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const P = (x: number, y: number, z: number) => [q[0] + x * c - y * sn, q[1] + x * sn + y * c, z];
  const v = [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([x, y]) => [P((x * w) / 2, (y * l) / 2, 0), P((x * w) / 2, (y * l) / 2, h)]);
  // (corners: 2k at the bottom, 2k+1 at the top, k round it; the faces outward)
  const quad = (i: number, j: number, k: number, m: number) => [...v[i], ...v[j], ...v[k], ...v[i], ...v[k], ...v[m]];
  return [...quad(0, 6, 4, 2), ...quad(1, 3, 5, 7), ...[0, 1, 2, 3].flatMap((k) => { const n = (k + 1) % 4; return quad(2 * k, 2 * n, 2 * n + 1, 2 * k + 1); })];
}
/** How a piece of these routes (those on a grade) is lifted: its middle's height on the route nearest it, and the rise along the route there. */
function liftOf(rts: Route[], positions: Float32Array): Lift | undefined {
  if (!rts.some((rt) => rt.grade) || !positions.length) return undefined;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < positions.length; i += 3) { x0 = Math.min(x0, positions[i]); x1 = Math.max(x1, positions[i]); y0 = Math.min(y0, positions[i + 1]); y1 = Math.max(y1, positions[i + 1]); }
  const c: [number, number] = [(x0 + x1) / 2, (y0 + y1) / 2];
  let best: Lift | undefined, bd = Infinity;
  for (const rt of rts) {
    const sv = routeSOf(rt, c), p = routePose(rt, sv), d = Math.hypot(p[0] - c[0], p[1] - c[1]), L = routeLength(rt), a = (p[2] * Math.PI) / 180;
    if (d < bd) { bd = d; best = { h: heightAt(rt, sv), slope: L > 0 ? (heightAt(rt, L) - heightAt(rt, 0)) / L : 0, dir: [-Math.sin(a), Math.cos(a)], c }; }
  }
  return best;
}

/** A LEGO part (BrickLink's number and name) and how many. */
export interface LegoPart { part: string; name: string; qty: number; /** where it's bought, if not a LEGO part (BrickLink's wanted list leaves it out) */ shop?: 'bricktracks' }

/** Curves made as track pieces of their own: radius (mm) to each piece's angle: LEGO's R40, BrickTracks' R56 to R120 (injection moulded). */
export const STD_CURVES = new Map<number, number>([[40 * 8, 22.5], [56 * 8, 11.25], [72 * 8, 11.25], [88 * 8, 11.25], [104 * 8, 11.25], [120 * 8, 11.25]]);

/** A plain curve piece that is a bought track piece (or a few of them): LEGO's R40 (53400), or a BrickTracks curve. */
export function stdCurve(radius: number, angle: number): LegoPart[] | undefined {
  const r = [...STD_CURVES.keys()].find((k) => Math.abs(k - radius) < 0.01);
  if (r === undefined) return undefined;
  const step = STD_CURVES.get(r)!, n = Math.round(Math.abs(angle) / step);
  if (n < 1 || Math.abs(Math.abs(angle) - n * step) > 0.01) return undefined;
  return r === 320 ? [{ part: '53400', name: 'Train, Track Plastic Curve (R40)', qty: n }] : [{ part: `BrickTracks R${r / 8}`, name: `BrickTracks R${r / 8} curve (11.25°)`, qty: n, shop: 'bricktracks' }];
}

/** BrickTracks' short straights (their short straight track pack): 1/2, 1/4 and 1/10 of a 16-stud straight. */
export const BT_STRAIGHTS: [number, string, string][] = [[8 * 8, 'BrickTracks S08', 'BrickTracks 1/2 straight (8 studs)'], [4 * 8, 'BrickTracks S04', 'BrickTracks 1/4 straight (4 studs)'], [1.6 * 8, 'BrickTracks S01', 'BrickTracks 1/10 straight (1.6 studs)']];

/** A plain piece of track that is a bought track piece: LEGO's straight (53401), a BrickTracks short straight, LEGO's R40 curve or a BrickTracks curve (legoOnly: LEGO's only). */
export function stdPiece(rt: Route, legoOnly: boolean): LegoPart[] | undefined {
  const sg = rt.segments;
  if (sg.some((g) => g.roll) || rt.extra) return undefined;
  // (BrickTracks' R104B "siding" curve: its short straight, then an R104 curve of 11.25 degrees, either way round)
  if (sg.length === 2 && !legoOnly) {
    const [l, c] = sg[0].kind === 'straight' ? [sg[0], sg[1]] : [sg[1], sg[0]];
    if (l.kind === 'straight' && c.kind === 'arc' && Math.abs(l.length - BT_LEAD) < 0.01 && Math.abs(c.radius - 104 * 8) < 0.01 && Math.abs(Math.abs(c.angle) - 11.25) < 0.01)
      return [{ part: 'BrickTracks R104B', name: 'BrickTracks R104B siding curve (11.25°, in their R104 switch track kit)', qty: 1, shop: 'bricktracks' }];
  }
  if (sg.length !== 1) return undefined;
  if (sg[0].kind === 'straight') {
    const l = sg[0].length;
    if (Math.abs(l - 16 * 8) < 0.01) return [{ part: '53401', name: 'Train, Track Plastic Straight (16 studs)', qty: 1 }];
    const bt = legoOnly ? undefined : BT_STRAIGHTS.find(([len]) => Math.abs(l - len) < 0.01);
    return bt && [{ part: bt[1], name: bt[2], qty: 1, shop: 'bricktracks' }];
  }
  const cv = stdCurve(sg[0].radius, sg[0].angle);
  return cv && (!legoOnly || !cv[0].shop) ? cv : undefined;
}

/** Do any two of these pieces of track cross or run on top of each other (closer than a few studs, away from where they meet end to end)? */
function piecesCross(rts: Route[]): boolean {
  const pts = rts.map((rt) => { const L = routeLength(rt), n = Math.max(2, Math.ceil(L / 4)); return Array.from({ length: n + 1 }, (_, k) => routePose(rt, (L * k) / n)); });
  const ends = rts.map((rt) => [routePose(rt, 0), routePose(rt, routeLength(rt))]);
  // (pieces of one track don't cross each other; where two meet end to end, not near the joint)
  for (let i = 0; i < rts.length; i++) for (let j = i + 1; j < rts.length; j++) {
    if (rts[i].id === rts[j].id) continue;
    const joints = ends[i].filter((e) => ends[j].some((f) => Math.hypot(e[0] - f[0], e[1] - f[1]) < 1));
    for (const p of pts[i]) {
      if (joints.some((e) => Math.hypot(e[0] - p[0], e[1] - p[1]) < 36)) continue;
      if (pts[j].some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 24)) return true;
    }
  }
  return false;
}

/** BrickTracks' own ballast for one of their curves (R56 to R120), and the buddy layer under it: for a flat underside (theirs rests on the studs, not gripping them). */
export function brickTracksBallast(curve: LegoPart[], ballast: string | undefined): LegoPart[] {
  const r = curve[0].part.replace(/^BrickTracks /, ''), qty = curve[0].qty;
  return [{ part: `BrickTracks ${r} ballast`, name: `BrickTracks ${r} ballast (11.25°)`, qty, shop: 'bricktracks' },
    ...(ballast === 'buddy' ? [{ part: `BrickTracks ${r} buddy`, name: `BrickTracks ${r} ballast buddy (11.25°)`, qty, shop: 'bricktracks' as const }] : [])];
}

/** The LEGO parts for a plain 16-stud straight: LEGO's track, and under it the ballast's layers as plates (10 studs wide, and 12 more for the buddy layer). */
export function legoStraight(ballast: string | undefined): LegoPart[] {
  const out: LegoPart[] = [{ part: '53401', name: 'Train, Track Plastic Straight (16 studs)', qty: 1 }];
  if (ballast === 'ballast' || ballast === 'buddy') out.push({ part: '3027', name: 'Plate 6 x 16', qty: 1 }, { part: '4282', name: 'Plate 2 x 16', qty: 2 });
  if (ballast === 'buddy') out.push({ part: '3027', name: 'Plate 6 x 16', qty: 2 });
  return out;
}

/** The LEGO parts of all the pieces, added up. */
export function legoParts(pieces: { lego?: LegoPart[] }[]): LegoPart[] {
  const m = new Map<string, LegoPart>();
  for (const p of pieces) for (const l of p.lego ?? []) { const e = m.get(l.part); if (e) e.qty += l.qty; else m.set(l.part, { ...l }); }
  return [...m.values()].sort((a, b) => b.qty - a.qty);
}

/** The printed track's colour in the 3D view. */
const TRACK_COLOR = 0x6f7780;
/** Bought track's colours in the 3D view: LEGO's green, BrickTracks' purple (clear of the printed grey and the moving parts' blue, orange and gold). */
export const LEGO_COLOR = 0x4caf50, BRICKTRACKS_COLOR = 0xa070d8;
/** A bought piece's colour: BrickTracks' if any of it is theirs, else LEGO's. */
export const boughtColor = (parts: LegoPart[]) => (parts.some((p) => p.shop === 'bricktracks') ? BRICKTRACKS_COLOR : LEGO_COLOR);

// Pieces built before, by what they were built from: an edit rebuilds only
// the pieces it changes (the worker keeps this between builds).
// (Solids, each owned by its entry and deleted with it: solidcache.ts.)
const solids = new SolidCache(120);
/** The build's settings (every option, the gauge), under which every piece built before is kept: a piece's key need
 * not name each setting it's built with (Axle length, Tongues on were missed: a change to one kept the parts as they were). */
let settingsKey = '';
/** now: its solids are all used at once (solidcache.ts get) */
const cached = <T>(key0: string, f: () => T, now = false): T => solids.get(settingsKey + key0, f, now);
// Parts built before as plain data (baked: their meshes and STLs, not
// solids in the kernel): the tiles, sections and moving parts, kept up to
// DATA_BUDGET bytes of them (the solids' cache above keeps 120 at most, a
// yard's moving parts alone are more), all of them while a build that's
// been shared out (parallel.ts) waits on its jobs.
const data = new Map<string, { v: unknown; bytes: number }>();
const DATA_BUDGET = 1.5e9;
let dataBytes = 0, holdData = 0;
const bytesOf = (v: unknown): number => (ArrayBuffer.isView(v) ? v.byteLength : Array.isArray(v) ? v.reduce((t: number, x) => t + bytesOf(x), 0)
  : v && typeof v === 'object' ? Object.values(v).reduce((t: number, x) => t + bytesOf(x), 0) : 8);
function putData(key0: string, v: unknown) {
  const key = settingsKey + key0, old = data.get(key);
  if (old) { dataBytes -= old.bytes; data.delete(key); }
  const bytes = bytesOf(v);
  data.set(key, { v, bytes }); dataBytes += bytes;
  trimData();
}
function trimData() {
  if (!holdData) while (dataBytes > DATA_BUDGET && data.size > 1) { const [k, e] = data.entries().next().value!; data.delete(k); dataBytes -= e.bytes; }
}
function cachedData<T>(key: string, f: () => T): T {
  const e = data.get(settingsKey + key);
  if (e) { data.delete(settingsKey + key); data.set(settingsKey + key, e); return e.v as T; }
  const v = f();
  putData(key, v);
  return v;
}
const stlOf = new WeakMap<Man, { stl: Uint8Array; turn: number }>();
/** A mesh's triangles as a flat list of their corners' positions (for the view). */
function meshPositions(wm: { triVerts: Uint32Array; vertProperties: Float32Array; numProp: number }) {
  const tv = wm.triVerts, vp = wm.vertProperties, np = wm.numProp, out = new Float32Array(tv.length * 3);
  for (let i = 0, o = 0; i < tv.length; i++, o += 3) { const b = tv[i] * np; out[o] = vp[b]; out[o + 1] = vp[b + 1]; out[o + 2] = vp[b + 2]; }
  return out;
}
/** Forget the pieces built before (tests: each design's solids let go after it, arena() in kernel.ts, and nothing kept that points at them). */
export function clearBuildCache() { clearSolids(); data.clear(); dataBytes = 0; clearMonoCache(); }

/**
 * A big build's heavy jobs that don't depend on each other (the tiles of a
 * piece built in tiles, the sections of one in sections): each made from
 * plain data in the design, and giving plain data (baked parts), so other
 * workers, each with its own kernel, can build them at once (parallel.ts).
 * key: the build cache's key for it; cost: a guess at how long it takes, to
 * start the longest first; run: build it.
 */
export interface BuildJob { key: string; cost: number; run: () => unknown }
const PLANNED = { planned: true };
const TILE_OVER = 8000; // mm of track: more, and a piece that needs cutting is built in tiles
/**
 * The jobs a build of the design has that aren't in the cache already (none
 * where it has nothing to share out). Works it out as far as the jobs, no
 * further: the trackwork, the points' parts (as solids not yet worked out)
 * and the cuts; their run()s build them in this worker's kernel.
 */
/** Thrown from early by a build that only wanted the plan's trackwork (the 3D view hidden, or Auto off): the build stops there. */
export const PLAN_ONLY = { planOnly: true };
/**
 * Whether a build of the design may have jobs worth sharing out: one built in tiles (8 m of track or more), or in
 * sections (long track cut into track pieces, the setting or its default) with 2 m or more. Known at once, before
 * anything's worked out, so the helpers can be started while the plan is. (It went by the design's own setting only: a
 * design left at the default, track pieces, was never shared out under 8 m.)
 */
const SECTIONS_OVER = 2000;
export function mayHaveJobs(design: Design): boolean {
  // (a test-print kit: small coupons, each its own build, nothing to share out)
  if (design.kit?.length) return false;
  const d = upgradeDesign(design), len = toRoutes(d).reduce((t, rt) => t + routeLength(rt), 0);
  return len >= TILE_OVER || ({ ...OPTION_DEFAULTS, ...d.options }.splitTrack === 'lengths' && len >= SECTIONS_OVER);
}
export function buildJobs(w: Wasm, design: Design, early?: (overlay: unknown) => void): BuildJob[] {
  const jobs: BuildJob[] = [];
  // (only a design built in tiles or in sections has any)
  if (!mayHaveJobs(design)) return jobs;
  try { buildDesign(w, design, undefined, early, { plan: jobs }); } catch (e) { if (e === PLAN_ONLY) throw e; if (e !== PLANNED) return []; }
  return jobs;
}
/** A job's result, built elsewhere (buildJobs): kept for the build, which then finds it done. */
export function jobDone(key: string, part: unknown) { putData(key, part); }
/** While a build's jobs are built elsewhere (on), all their results kept, past the cache's budget; then (off) back to it. */
export function holdJobs(on: boolean) { holdData = Math.max(0, holdData + (on ? 1 : -1)); trimData(); }

/**
 * Routes drawn the wrong way round for points: the solver finds points where
 * a route starts on another heading the same way (a split) or ends on one
 * arriving the way it runs (a merge), and where two routes start (or end)
 * together heading the same way (a wye). Each place a route's end meets
 * another track along it, or another route's end with both leaving the same
 * way, says whether the two run the same way round or not; the routes are
 * turned round to agree everywhere (a crossover between two tracks drawn
 * opposite ways turns one of the tracks, not just the crossover), turning as
 * few as can be and the tracks others branch off least of all, and making
 * splits rather than merges where it's all the same. (Everything else goes
 * by where things are, not which way a route runs.)
 */
export function orient(routes: Route[]): Route[] {
  const n = routes.length, ends = routes.map((rt) => [rt.start, routePose(rt, routeLength(rt))] as [Pose, Pose]);
  const dAng = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
  // (each contact: routes i and j, whether one must be turned for them to agree, and the end of j it's at)
  const links: { i: number; j: number; flip: boolean }[] = [], host = new Array(n).fill(0), endsAt: { j: number; e: number; i: number; kind: 'along' | 'ends' }[] = [];
  for (let j = 0; j < n; j++) for (const e of [0, 1]) {
    const q = ends[j][e], leave = e === 0 ? q[2] : q[2] + 180; // (the way the route leaves the contact)
    for (let i = 0; i < n; i++) {
      if (i === j || Math.abs(routeLat(routes[i], [q[0], q[1]])) > 0.01) continue;
      const sa = routeSOf(routes[i], [q[0], q[1]]), pa = routePose(routes[i], sa), L = routeLength(routes[i]);
      if (Math.hypot(pa[0] - q[0], pa[1] - q[1]) > 0.01) continue;
      if (sa >= 1 && sa <= L - 1) {
        // (along i: points when j starts heading i's way, or ends arriving its way: either way, heading i's way)
        const d = dAng(pa[2], q[2]);
        if (d > 0.5 && d < 179.5) continue; // (a crossing)
        links.push({ i, j, flip: d > 0.5 }); host[i]++; endsAt.push({ j, e, i, kind: 'along' });
      } else if (i < j && (sa < 1e-3 || sa > L - 1e-3)) {
        // (end to end: a wye when both leave the same way (both starts, or both ends); else a join, which says nothing)
        const ei = sa < 1e-3 ? 0 : 1, li = ei === 0 ? pa[2] : pa[2] + 180;
        if (dAng(li, leave) > 0.5) continue;
        links.push({ i, j, flip: ei !== e }); endsAt.push({ j, e, i, kind: 'ends' });
      }
    }
  }
  // two-colour each group of linked routes (turned or not), the cheaper way round
  const turn = new Array<boolean | undefined>(n).fill(undefined);
  for (let r0 = 0; r0 < n; r0++) {
    if (turn[r0] !== undefined) continue;
    const comp: number[] = [r0], col = new Map<number, boolean>([[r0, false]]);
    for (let k = 0; k < comp.length; k++) {
      const r = comp[k];
      for (const l of links) {
        const o = l.i === r ? l.j : l.j === r ? l.i : -1;
        if (o < 0 || col.has(o)) continue;
        col.set(o, col.get(r)! !== l.flip); comp.push(o);
      }
    }
    // (cost: each route turned, the tracks others branch off dearly; merges a little, for splits where it's all the same)
    const cost = (inv: boolean) => {
      const t = (r: number) => col.get(r)! !== inv;
      let c = comp.reduce((a, r) => a + (t(r) ? 1 + 10 * host[r] : 0), 0);
      for (const x of endsAt) if (col.has(x.j) && (x.e === 1) !== t(x.j)) c += 0.5;
      return c;
    };
    const inv = cost(true) < cost(false);
    for (const r of comp) turn[r] = col.get(r)! !== inv;
  }
  return routes.map((rt, k) => (turn[k] ? reversedRoute(rt) : rt));
}

/**
 * The ends of the routes rts (as indices among them, "k:start" / "k:end")
 * left on other track by points taken out (dropped splits of routes): no
 * connector there, the rails run on to it, as at points. (By where they
 * are: rts may be the routes cropped, or cut in pieces.)
 */
export function droppedInner(routes: Route[], dropped: Split[], rts: Route[], more: Iterable<string> = []) {
  const ends = dropped.flatMap((sp) => {
    const [i, j] = sp.routes, toeS = sp.merge ? sp.spans[0][1] : sp.spans[0][0];
    if (toeS < 0.6 || toeS > routeLength(routes[i]) - 0.6) return []; // (at the main route's end too: both ends have connectors)
    const e = sp.merge ? routePose(routes[j], routeLength(routes[j])) : routes[j].start;
    return [[e[0], e[1]] as [number, number]];
  });
  const out = new Set<string>(more), at = (q: Pose) => ends.some((e) => Math.hypot(e[0] - q[0], e[1] - q[1]) < 0.01);
  rts.forEach((rt, k) => { if (at(rt.start)) out.add(`${k}:start`); if (at(routePose(rt, routeLength(rt)))) out.add(`${k}:end`); });
  return out;
}

/**
 * Banked curves can't have switches or crossings on them (their points and
 * frogs are built level): a banked route that another track comes within a
 * sleeper's length of (centre line to centre line), where it's banked, is
 * built level, with a warning.
 */
export function levelBankedNearOthers(routes: Route[], near: number): { routes: Route[]; warnings: string[] } {
  const warnings: string[] = [];
  const out = routes.map((rt, i) => {
    if (!hasRoll(rt)) return rt;
    const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 4));
    for (let k = 0; k <= n; k++) {
      const sAt = (L * k) / n;
      if (Math.abs(routeRoll(rt, sAt)) < 1e-9) continue;
      const p = routePose(rt, sAt);
      if (!routes.some((r2, j) => j !== i && Math.abs(routeLat(r2, [p[0], p[1]])) < near)) continue;
      warnings.push(`the bank on ${rt.id.replace(/~\d+$/, '')} is left out: another track comes within a sleeper's length of it where it's banked, at ${(p[0] / 8).toFixed(1)}, ${(p[1] / 8).toFixed(1)} (studs); a banked curve can't have switches or crossings on it`);
      return { ...rt, segments: rt.segments.map(({ roll: _roll, ...sg }) => sg) };
    }
    return rt;
  });
  return { routes: out, warnings };
}

/**
 * Build a design: its train track (buildTrain), and its monorail routes
 * (monobuild.ts) beside it. A design with no monorail is built just as
 * buildTrain builds it.
 */
/** progress: what it's doing now (for the 3D view's status while it builds). */
/**
 * Every part's name its own: a part's name is its file's (exports.ts), and two of a name would be one file in the zip.
 * (The parts are numbered so that they are; whatever still isn't, a later one of a name is told apart by -2, -3.)
 */
export function uniqueNames<T extends { name: string }>(pieces: T[]): T[] {
  const taken = new Set<string>();
  return pieces.map((p) => {
    let name = p.name;
    for (let k = 2; taken.has(name); k++) name = `${p.name}-${k}`;
    taken.add(name);
    return name === p.name ? p : { ...p, name };
  });
}
/** opts.plan: only list the jobs it'd do (buildJobs), stopping there. */
/** opts.planOnly: only the plan's trackwork (the 3D view hidden, or Auto off): sent to early, then PLAN_ONLY thrown, nothing built. */
/** opts.mark: (a test-print kit's coupon) its number, marked on its track parts as ribs (marked). */
export interface BuildOpts { plan?: BuildJob[]; planOnly?: boolean; mark?: number }
export function buildDesign(w: Wasm, design: Design, report: (what: string, frac: number) => void = () => {}, early?: (overlay: unknown) => void, opts: BuildOpts = {}) {
  // (the build owns the solids it makes, and deletes them as it ends: solidcache.ts; a plan's are kept for its jobs)
  const run = () => buildScope(() => buildAll(w, design, report, early, opts), !!opts.plan);
  try { return run(); } catch (err) {
    // (a solid used after it was deleted, which no build should do: built again from nothing rather than fail)
    if (!(err instanceof Error) || !/deleted object/i.test(err.message)) throw err;
    clearSolids();
    return run();
  }
}
/** The most track a design may have, studs (240 m: a hall's worth; a figure typed with too many noughts is turned away, not built for hours). */
export const MAX_TRACK_STUDS = 30000;
/**
 * What can't be built at all, said plainly before anything's worked out (undefined: nothing): more track than
 * MAX_TRACK_STUDS; a route that lies along itself (a flat curve of more than a full turn); a route that lies wholly on
 * another (the same route drawn twice); a table that's no shape. Each ran the kernel out of memory, never ended or failed outright. Track at another height
 * (a helix's turns, a bridge) is not on top of what's under it; monorail routes aren't looked at.
 */
export function unbuildable(design: Design): string | undefined {
  // (a table that's no shape at all: reading its outline failed the build outright)
  const noTable = (design.tables ?? []).findIndex((t) => !tableOf(t));
  if (noTable >= 0) return `table ${noTable + 1}${design.tables![noTable]?.name ? ` (${design.tables![noTable].name})` : ''} isn't a rectangle, a ring section or an outline: delete it and draw it again`;
  const rts = toRoutes(design), idx = design.routes.map((r, i) => i).filter((i) => !isMono(design.routes[i]) && rts[i]?.segments.length);
  const total = idx.reduce((t, i) => t + routeLength(rts[i]), 0) / 8;
  if (total > MAX_TRACK_STUDS) return `${Math.round(total)} studs of track is more than can be built (${MAX_TRACK_STUDS} at most): check the lengths typed in`;
  // (every route's centre line every 8 mm, by where it is, in 4 mm squares: two samples in one place heading the same
  // way (or back along it) at the same height are one track on another)
  const STEP = 8, CELL = 4, grid = new Map<string, { i: number; s: number; x: number; y: number; h: number; z: number }[]>();
  const samples = idx.map((i) => {
    const L = routeLength(rts[i]), out: { i: number; s: number; x: number; y: number; h: number; z: number }[] = [];
    for (let sv = 0; sv <= L; sv += STEP) { const q = routePose(rts[i], sv); out.push({ i, s: sv, x: q[0], y: q[1], h: q[2], z: gradeAt(design.routes[i], L, sv) }); }
    return out;
  });
  for (const list of samples) for (const q of list) { const k = `${Math.floor(q.x / CELL)},${Math.floor(q.y / CELL)}`, at = grid.get(k); if (at) at.push(q); else grid.set(k, [q]); }
  const turn = (a: number, b: number) => { const d = Math.abs(((a - b) % 180 + 180) % 180); return Math.min(d, 180 - d); };
  /** the samples of route j lying on q (not q's own neighbours along its route) */
  const on = (q: (typeof samples)[number][number], j: number) => {
    const ci = Math.floor(q.x / CELL), cj = Math.floor(q.y / CELL);
    for (let a = ci - 2; a <= ci + 2; a++) for (let b = cj - 2; b <= cj + 2; b++) for (const o of grid.get(`${a},${b}`) ?? [])
      if (o.i === j && (o.i !== q.i || Math.abs(o.s - q.s) > 64) && Math.hypot(o.x - q.x, o.y - q.y) < STEP / 2 + 0.5 && turn(o.h, q.h) < 1 && Math.abs(o.z - q.z) < GRADE_APART) return true;
    return false;
  };
  const name = (i: number) => design.routes[i].name || `route ${i + 1}`;
  for (let a = 0; a < idx.length; a++) {
    const mine = samples[a];
    // (along itself: 8 studs of it or more)
    if (mine.filter((q) => on(q, idx[a])).length * STEP >= 64) return `${name(idx[a])} runs along itself (a curve of more than a full turn, or drawn back over its own track): shorten it, or give it a height so it climbs over`;
    for (let b = 0; b < idx.length; b++) {
      if (b === a || mine.length < 2 || samples[b].length < mine.length || (samples[b].length === mine.length && b < a)) continue;
      // (a narrower track up a wider one's middle isn't the same track twice: the narrow gauge of a dual-gauge track, drawn as a route of its own)
      if (routeGaugeStuds(design, design.routes[idx[a]]) !== routeGaugeStuds(design, design.routes[idx[b]])) continue;
      if (mine.every((q) => on(q, idx[b]))) return `${name(idx[a])} lies on top of ${name(idx[b])} (the same track drawn twice): delete one of them`;
    }
  }
  return undefined;
}
/**
 * A test-print kit (Design.kit): each coupon's routes built as a design of their own, with the design's settings and
 * the coupon's own over them (a ladder of fits side by side, the same points three ways), so every coupon is exactly
 * what the app builds with those settings. Its parts are named after the coupon (their files' names say which is which);
 * routes in no coupon are built together with the design's settings, as ever. One build: the solids are the build's.
 */
function buildKit(w: Wasm, design: Design, report: (what: string, frac: number) => void, early: ((overlay: unknown) => void) | undefined, opts: BuildOpts): ReturnType<typeof buildTrain> {
  const { kit = [], ...plain } = design, t0 = performance.now();
  const taken = new Set(kit.flatMap((k) => k.routes)), has = (rs: Design['routes']) => rs.some((r) => r.segs.length > 0);
  const groups = [...kit.map((k) => ({ k, routes: design.routes.filter((r) => k.routes.includes(r.name)) })), { k: undefined, routes: design.routes.filter((r) => !taken.has(r.name)) }].filter((g) => has(g.routes));
  if (!groups.some((g) => g.k)) return buildAll(w, plain, report, early, opts);
  // (the plan's trackwork: each coupon's as it's worked out, all of them so far sent on)
  const earlies: Record<string, unknown[]>[] = [];
  const merged = () => { const out: Record<string, unknown[]> = {}; for (const e of earlies) for (const [key, v] of Object.entries(e ?? {})) if (Array.isArray(v)) (out[key] ??= []).push(...v); return out; };
  const built: ReturnType<typeof buildTrain>[] = [];
  groups.forEach((g, i) => {
    const sub: Design = { ...plain, routes: g.routes, ...(g.k?.options && { options: { ...plain.options, ...g.k.options } }) };
    try {
      const r = buildAll(w, sub, (what, f) => report(g.k ? `${g.k.name}: ${what}` : what, (i + f) / groups.length), (ov) => { earlies[i] = ov as Record<string, unknown[]>; early?.(merged()); }, { ...opts, mark: g.k?.mark });
      built.push(g.k ? { ...r, pieces: r.pieces.map((p) => ({ ...p, name: `${g.k!.name}-${p.name}`, kit: g.k!.name })), info: { ...r.info, warnings: r.info.warnings.map((wn) => `${g.k!.name}: ${wn}`) } } : r);
    } catch (e) { if (e !== PLAN_ONLY) throw e; }
  });
  if (opts.planOnly) throw PLAN_ONLY;
  const pieces = uniqueNames(built.flatMap((r) => r.pieces)), sum = (f: (r: (typeof built)[number]) => number) => built.reduce((t, r) => t + f(r), 0);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pieces) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.positions[i + k]); mx[k] = Math.max(mx[k], p.positions[i + k]); }
  return { overlay: merged() as unknown as Overlay, pieces, info: { ms: performance.now() - t0, volume: sum((r) => r.info.volume), size: [0, 1, 2].map((k) => mx[k] - mn[k]),
    crossings: sum((r) => r.info.crossings), checkRails: sum((r) => r.info.checkRails), splits: sum((r) => r.info.splits), switches: sum((r) => r.info.switches), pieces: pieces.length, turned: sum((r) => r.info.turned ?? 0), warnings: built.flatMap((r) => r.info.warnings) } };
}
function buildAll(w: Wasm, design: Design, report: (what: string, frac: number) => void, early: ((overlay: unknown) => void) | undefined, opts: BuildOpts) {
  design = upgradeDesign(design);
  { const why = unbuildable(design); if (why) throw new Error(why); }
  if (design.kit?.length) return buildKit(w, design, report, early, opts);
  // (a kit coupon's number is on its parts: kept apart from the same parts without it)
  settingsKey = `${JSON.stringify([{ ...OPTION_DEFAULTS, ...design.options }, design.gaugeStuds])}${opts.mark ? `#${opts.mark}` : ''}|`;
  if (!design.routes.some((r) => isMono(r) && r.segs.length > 0)) return buildTrain(w, design, report, early, opts);
  const t0 = performance.now();
  const trainD: Design = { ...design, routes: design.routes.filter((r) => !isMono(r)) };
  const hasTrain = trainD.routes.some((r) => r.segs.length > 0);
  const monoRoutes = toRoutes({ ...design, routes: design.routes.filter((r) => isMono(r) && r.segs.length > 0) });
  const o = { ...OPTION_DEFAULTS, ...design.options };
  // (the monorail's points, for the plan: sent with the train's trackwork, worked out first (no parts built), so the
  // plan has them as soon as the train's trackwork is ready)
  const mp = early || opts.planOnly ? buildMonorail(w, monoRoutes, o, design.name, undefined, undefined, true) : undefined;
  const withMono = (ov: unknown) => { const v = ov as Overlay; early?.({ ...v, splits: [...v.splits, ...(mp?.splits ?? [])], monoPoints: mp?.splits ?? [], issues: [...v.issues, ...(mp?.issues ?? [])] }); };
  if (opts.plan) { if (hasTrain) buildTrain(w, trainD, report, withMono, opts); throw PLANNED; }
  const share = hasTrain ? 0.7 : 0;
  const tr = hasTrain ? buildTrain(w, trainD, (what, f) => report(what, f * share), withMono, opts) : undefined;
  const overlay = tr?.overlay ?? { grooves: [], checkRails: [], crossings: [], splits: [], grips: [], items: [], issues: [] };
  if (!tr) { withMono(overlay); if (opts.planOnly) throw PLAN_ONLY; }
  let top = 0;
  for (const p of tr?.pieces ?? []) for (let i = 2; i < p.positions.length; i += 3) top = Math.max(top, p.positions[i]);
  // (the widest train track's, mixed gauges)
  const sleeperLen = (Math.max(...trainD.routes.map((r) => routeGaugeStuds(trainD, r)), design.gaugeStuds) + 1) * 8 + 24, half = (o.ballast === 'buddy' ? sleeperLen + 32 : o.ballast === 'ballast' ? sleeperLen + 16 : sleeperLen) / 2;
  const mr = buildMonorail(w, monoRoutes, o, design.name, hasTrain ? { routes: toRoutes(trainD).filter((r) => r.segments.length), half, top } : undefined, (what) => report(what, share + (1 - share) * 0.5));
  overlay.splits.push(...mr.splits);
  (overlay as { monoPoints?: [number, number][] }).monoPoints = mr.splits;
  overlay.issues.push(...mr.issues);
  const pieces = uniqueNames([...(tr?.pieces ?? []), ...mr.pieces]);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pieces) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.positions[i + k]); mx[k] = Math.max(mx[k], p.positions[i + k]); }
  const ti = tr?.info;
  const info = {
    ms: performance.now() - t0, volume: (ti?.volume ?? 0) + mr.volume, size: [0, 1, 2].map((k) => mx[k] - mn[k]),
    crossings: ti?.crossings ?? 0, checkRails: ti?.checkRails ?? 0, splits: (ti?.splits ?? 0) + mr.splits.length,
    switches: (ti?.switches ?? 0) + mr.splits.length, pieces: pieces.length, turned: ti?.turned ?? 0, warnings: [...(ti?.warnings ?? []), ...mr.warnings],
  };
  return { overlay, pieces, info };
}

/** The train track's build: all of a design's routes (as buildDesign passes them, the train routes only). */
function buildTrain(w: Wasm, design: Design, report: (what: string, frac: number) => void = () => {}, early?: (overlay: unknown) => void, opts: BuildOpts = {}) {
  return graded(w, design, buildLevel(w, design, report, early, opts));
}

/** A train route's height (mm) at arc length s: from its start height to its end height, an even grade (Height, End height on its card, plates). */
export function gradeAt(r: Design['routes'][number], L: number, s: number): number {
  const h0 = (r.monoHeight ?? 0) * 3.2, h1 = (r.monoHeightEnd ?? r.monoHeight ?? 0) * 3.2;
  return L > 0 ? h0 + ((h1 - h0) * Math.min(L, Math.max(0, s))) / L : h0;
}
/** A train route's grade, % (its rise over its length). */
export function gradeOf(r: Design['routes'][number]): number {
  const rt = toRoutes({ version: 1, gaugeStuds: 4, routes: [r] })[0], L = rt ? routeLength(rt) : 0;
  return L > 0 ? (Math.abs(gradeAt(r, L, L) - gradeAt(r, L, 0)) / L) * 100 : 0;
}

/**
 * Train track up off the baseplate, level or on a grade (routes with a Height, End height on their cards): the pieces are
 * printed level, as ever, and stand on printed supports or LEGO risers (Raised track stands on). In the 3D view each one is lifted to its height and tilted along its track there; the risers, LEGO
 * 2 x 8 bricks and plates under the track every 16 studs from each route's start, are in the parts list; a grade
 * steeper than the standard 2.5% (1 plate a 16-stud straight) is a warning.
 */
function graded(w: Wasm, design: Design, res: ReturnType<typeof buildLevel>): ReturnType<typeof buildLevel> {
  const raised = design.routes.filter((r) => !isMono(r) && r.segs.length && ((r.monoHeight ?? 0) > 0 || (r.monoHeightEnd ?? 0) > 0));
  if (!raised.length) return res;
  const rts = raised.map((r) => ({ r, rt: toRoutes({ ...design, routes: [r] })[0] })).filter((x) => x.rt);
  const warnings = [...res.info.warnings];
  for (const { r } of rts) {
    const g = gradeOf(r);
    if (g > 4) warnings.push(`${r.name} climbs ${g.toFixed(1)}%: too steep for most LEGO trains (the standard is 2.5%, a plate a 16-stud straight)`);
    else if (g > 2.5 + 1e-6) warnings.push(`${r.name} climbs ${g.toFixed(1)}%: steeper than the standard 2.5% (a plate a 16-stud straight)`);
  }
  if (res.info.crossings > 0) warnings.push('track on a grade is still built as if level where it crosses or meets other track: a crossing over other track at another height isn\'t built as a bridge yet')
  // (each piece: lifted to its height at its middle, and tilted along its track there; printed level, as built)
  const hAt = (q: [number, number]) => {
    let best: { h: number; slope: number; dir: [number, number] } | undefined, bd = 40;
    for (const { r, rt } of rts) {
      const L = routeLength(rt), sv = routeSOf(rt, q), p = routePose(rt, sv), d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bd) { bd = d; const a = (p[2] * Math.PI) / 180; best = { h: gradeAt(r, L, sv), slope: L > 0 ? (gradeAt(r, L, L) - gradeAt(r, L, 0)) / L : 0, dir: [-Math.sin(a), Math.cos(a)] }; }
    }
    return best;
  };
  const lift = (ps: Float32Array, c: [number, number], g: { h: number; slope: number; dir: [number, number] }) => {
    const out = ps.slice();
    for (let i = 0; i < out.length; i += 3) out[i + 2] += g.h + g.slope * ((out[i] - c[0]) * g.dir[0] + (out[i + 1] - c[1]) * g.dir[1]);
    return out;
  };
  const pieces = res.pieces.map((p) => {
    if (!p.positions.length) return p;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.positions.length; i += 3) { x0 = Math.min(x0, p.positions[i]); x1 = Math.max(x1, p.positions[i]); y0 = Math.min(y0, p.positions[i + 1]); y1 = Math.max(y1, p.positions[i + 1]); }
    // (from the stretch of track it was built of, if known: where tracks pass one over the other, the nearest isn't)
    const c: [number, number] = p.lift?.c ?? [(x0 + x1) / 2, (y0 + y1) / 2], g = p.lift ?? hAt(c);
    if (!g || (g.h === 0 && g.slope === 0)) return p;
    return { ...p, positions: lift(p.positions, c, g), ...(p.supports && { supports: lift(p.supports, c, g) }) };
  });
  // (what it stands on, every 16 studs from each route's start, as the reference's train track on pillars: a beam
  // across under the track, a stud's room past each rail's side, on two square pillars beside the track, from the
  // baseplate up, each on a flared foot (printed, or LEGO 2 x 2 bricks under a 2 x 14 plate beam). Under bought track
  // (track only) each place is moved along, half a sleeper's pitch at most, to the piece's nearest sleeper or joint,
  // where the beam's studs go up into it. Where track runs
  // over other track (round a helix), the upper track's beam is on the same pillars as the lower one's, carried on up
  // past it: the pillars stand beside the lower track, clear of its trains, and hold both. Lower than a brick (no room
  // for a foot and a beam), under nothing else: LEGO 2 x 8 bricks and plates under the track's middle, as before)
  const o = { ...OPTION_DEFAULTS, ...design.options };
  const ballastH = o.ballast === 'buddy' ? 6.4 : o.ballast === 'ballast' ? 3.2 : 0;
  const risers: LegoPart[] = []; const stacks: number[] = [];
  const addPart = (part: string, name: string, qty: number) => { if (qty <= 0) return; const e = risers.find((x) => x.part === part); if (e) e.qty += qty; else risers.push({ part, name, qty }); };
  // (the places, the lowest first: each one over another's, near enough along the same way, put on its pillars)
  // (slope: the track's climb there, mm a mm the way it runs: its beam's top is tilted to it)
  // (slope: before its middle and after it, the way its pillars head: where a grade meets level track the two differ,
  // and the beam under the joint is half under each piece)
  // (near: the place d along, moved as the places themselves are, onto a bought piece's seat)
  type Spot = { q: Pose; h: number; slope: [number, number]; at: (d: number) => Spot; near: (d: number) => Spot };
  const towers: { q: Pose; levels: number[]; slopes: [number, number][]; plain: boolean[] }[] = [];
  const spots: Spot[] = [];
  // (bought track, track only, is held where studs go up into it: under a sleeper's middle or a joint of two pieces,
  // square to the track there (Piece.seats), each at its piece's height. A beam's studs anywhere else stood in its
  // sleepers, which lie at their own angles round a curve)
  const seats = pieces.flatMap((p) => (p.seats ?? []).map((q) => ({ q, h: p.lift ? p.lift.h + p.lift.slope * ((q[0] - p.lift.c[0]) * p.lift.dir[0] + (q[1] - p.lift.c[1]) * p.lift.dir[1]) : 0 })));
  /** The bought track's seat nearest q (within reach mm) at height h (the track's bottom there). */
  const seatNear = (q: [number, number], h: number, reach: number) => {
    let best: (typeof seats)[number] | undefined, bd = reach;
    for (const st of seats) { const d = Math.hypot(st.q[0] - q[0], st.q[1] - q[1]); if (d < bd && Math.abs(st.h - h) < GRADE_APART) { bd = d; best = st; } }
    return best;
  };
  /** Is a seat of the bought track at height h square over a beam at q? plain: bought track is, but none of its seats (the beam's top has no studs there). */
  const seatOver = (q: Pose, h: number) => {
    const st = seatNear([q[0], q[1]], h, 0.6), dh = st ? turnDiff(st.q[2], q[2]) : 0;
    return { square: !!st && (dh < 1 || dh > 179), plain: !(st && (dh < 1 || dh > 179)) && !!seatNear([q[0], q[1]], h, 40) };
  };
  for (const { r, rt } of rts) {
    const L = routeLength(rt), k = L > 0 ? (gradeAt(r, L, L) - gradeAt(r, L, 0)) / L : 0;
    // (at the route's end: the climb of the raised track that runs on from there, if any does, the way this one heads)
    const onFrom = (q: Pose, h: number, side: number) => {
      const a = (q[2] * Math.PI) / 180, u = [-Math.sin(a) * side, Math.cos(a) * side];
      for (const o2 of rts) {
        if (o2.rt === rt) continue;
        const L2 = routeLength(o2.rt);
        for (const [sv, into] of [[0, 1], [L2, -1]]) {
          const p = routePose(o2.rt, sv), b = (p[2] * Math.PI) / 180, along = (-Math.sin(b) * u[0] + Math.cos(b) * u[1]) * side;
          if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1 && Math.abs(gradeAt(o2.r, L2, sv) - h) < 0.5 && along * into * side > 0.9) return L2 > 0 ? ((gradeAt(o2.r, L2, L2) - gradeAt(o2.r, L2, 0)) / L2) * Math.sign(along) : 0;
        }
      }
      return k;
    };
    const slopeAt = (sv: number): [number, number] => { const q = routePose(rt, sv), h = gradeAt(r, L, sv); return [sv > 1e-6 ? k : onFrom(q, h, -1), sv < L - 1e-6 ? k : onFrom(q, h, 1)]; };
    // (a place moved along onto the bought track's nearest seat there, if it's bought)
    const snap = (sv: number) => {
      const p = routePose(rt, sv), st = seatNear([p[0], p[1]], gradeAt(r, L, sv), 24);
      if (!st) return sv;
      let v = sv;
      for (let n2 = 0; n2 < 4; n2++) { const c = routePose(rt, v), a = (c[2] * Math.PI) / 180; v = Math.min(L, Math.max(0, v - (st.q[0] - c[0]) * Math.sin(a) + (st.q[1] - c[1]) * Math.cos(a))); }
      return v;
    };
    const spotAt = (sv: number): Spot => ({ q: routePose(rt, sv), h: gradeAt(r, L, sv) - ballastH, slope: slopeAt(sv), at: (d) => spotAt(Math.min(L, Math.max(0, sv + d))), near: (d) => spotAt(snap(Math.min(L, Math.max(0, sv + d)))) });
    for (let sv = 0; sv <= L + 1e-6; sv += 128) { const sp = spotAt(snap(Math.min(L, sv))); if (sp.h >= 3.2 - 1e-6) spots.push(sp); }
  }
  spots.sort((a, b) => a.h - b.h);
  const turnDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  // (raised track's places closer than this along, one over the other: on the same pillars)
  const SNAP = 64;
  /** Other track lower than h near q (its centre line within reach mm of q), at heights (track bottom) and lateral distances. */
  const lowerNear = (q: [number, number], h: number, reach: number) => {
    const out: { lat: number; h: number }[] = [];
    for (const { r, rt } of rts) {
      const L = routeLength(rt);
      for (let sv = 0; sv <= L; sv += 4) {
        const p = routePose(rt, sv), d = Math.hypot(p[0] - q[0], p[1] - q[1]), hh = gradeAt(r, L, sv);
        if (d < reach && hh < h - GRADE_APART) out.push({ lat: d, h: hh });
      }
    }
    return out;
  };
  const PILLAR_X = 44, PILLAR = 16 - 0.2, BEAM_T = 6.4, TRAIN_HW = 28;
  let skipped = 0;
  /** A place put on pillars already there (near enough along, the same way or back along it): true if it is. */
  const onTower = (sp: Spot) => {
    const t = towers.find((tw) => Math.hypot(tw.q[0] - sp.q[0], tw.q[1] - sp.q[1]) < SNAP && (turnDiff(tw.q[2], sp.q[2]) < 10 || turnDiff(tw.q[2], sp.q[2]) > 170));
    if (!t) return false;
    // (on another's pillars: its beam at the track's height there, where the pillars stand, not where its own place
    // would have been, up to SNAP along: on a grade that's a different height, and the beam stood in the track or under it)
    // (its climb along the pillars' own heading: a track running back the other way over them climbs the other way)
    let h = sp.h, bd = Infinity;
    for (let d = -SNAP; d <= SNAP; d += 2) { const c = sp.at(d), dd = Math.hypot(c.q[0] - t.q[0], c.q[1] - t.q[1]); if (dd < bd) { bd = dd; h = c.h; } }
    // (else as good as the same place, the same height: one beam holds it)
    if (h - t.levels[t.levels.length - 1] >= GRADE_APART) { t.levels.push(h); t.slopes.push(turnDiff(t.q[2], sp.q[2]) > 90 ? [-sp.slope[1], -sp.slope[0]] : sp.slope); t.plain.push(seatOver(t.q, h + ballastH).plain); }
    return true;
  };
  for (const sp of spots) {
    if (onTower(sp)) continue;
    // (a place over other track not on pillars of its own: its pillars beside it clear of that track's trains; else a
    // little along, up to half the way to the next place)
    // (and its feet off the sleepers of track on the baseplate there, 4 studs either side of it)
    const clear = (c: Spot) => [-1, 1].every((sd) => !lowerNear(poseToWorld(c.q, [sd * PILLAR_X, 0]) as [number, number], c.h + ballastH, TRAIN_HW + PILLAR / 2).length
      && !lowerNear(poseToWorld(c.q, [sd * (PILLAR_X - PILLAR / 2), 0]) as [number, number], c.h + ballastH, 33).some((l) => l.h < 12)
      && [-1, 1].every((e) => !lowerNear(poseToWorld(c.q, [sd * (PILLAR_X - PILLAR / 2), e * 16]) as [number, number], c.h + ballastH, 33).some((l) => l.h < 12)));
    const at = [0, 16, -16, 32, -32, 48, -48, 64, -64].map((d) => sp.near(d)).find(clear);
    if (!at) { skipped++; continue; }
    // (moved along to where pillars stand already, the lower turn's moved there the same way: on those)
    if (at !== sp && onTower(at)) continue;
    towers.push({ q: at.q, levels: [at.h], slopes: [at.slope], plain: [seatOver(at.q, at.h + ballastH).plain] });
  }
  const scad = new Scad(w);
  let n = 0, unseated = 0;
  for (const tw of towers) {
    const { q, levels, slopes, plain } = tw, top = levels[levels.length - 1];
    // (one level, lower than a brick and a beam: LEGO plates under the track's middle, printed or not)
    if (levels.length === 1 && (o.raisedOn === 'lego' ? !lowerNear([q[0], q[1]], top + ballastH, 40).length : top < 9.6 - 1e-6)) {
      const pl = Math.round(top / 3.2); addPart('3007', 'Brick 2 x 8', Math.floor(pl / 3)); addPart('3034', 'Plate 2 x 8', pl % 3);
      stacks.push(...boxTris(q, 64, 16, pl * 3.2));
      continue;
    }
    if (o.raisedOn === 'lego') {
      // (2 x 2 brick pillars up to the top beam, a beam of two 2 x 12 plates under each level; heights to the plate)
      for (const sd of [-1, 1]) {
        const pl = Math.max(0, Math.round((top - 6.4) / 3.2)), pq = poseToWorld(q, [sd * PILLAR_X, 0]);
        addPart('3003', 'Brick 2 x 2', Math.floor(pl / 3)); addPart('3022', 'Plate 2 x 2', pl % 3);
        stacks.push(...boxTris([pq[0], pq[1], q[2]], 16, 16, pl * 3.2));
      }
      unseated += plain.filter(Boolean).length;
      for (const h of levels) { addPart('91988', 'Plate 2 x 14', 2); const b = boxTris(q, 112, 16, 6.4); for (let i = 2; i < b.length; i += 3) b[i] += Math.round(h / 3.2) * 3.2 - 6.4; stacks.push(...b); }
      continue;
    }
    const sp = cachedData(`tpillar:${JSON.stringify([levels.map((h) => +h.toFixed(2)), slopes.map((k) => k.map((v) => +v.toFixed(5))), plain])}`, () => arena(w, () => {
      const m = trainPillars(scad, levels, PILLAR_X, PILLAR, BEAM_T, slopes, plain);
      return { stl: stlBytes(m.getMesh(), true), positions: meshPositions(m.getMesh()) };
    }, () => []));
    const pos = sp.positions.slice(), a = (q[2] * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < pos.length; i += 3) { const x = pos[i], y = pos[i + 1]; pos[i] = q[0] + x * c - y * sn; pos[i + 1] = q[1] + x * sn + y * c; }
    pieces.push({ name: `track-support${++n}`, color: 0x5a6470, positions: pos, stl: sp.stl.slice() });
  }
  if (skipped) warnings.push(`${skipped} of the places a raised track crosses over other track: nothing's put there to hold it up (its pillars would stand in the lower track's way): cross where the track below runs alongside, or carry it on a bridge`);
  if (unseated) warnings.push(`${unseated} of the beams under raised bought track ${unseated === 1 ? 'isn\'t' : 'aren\'t'} under one of its sleepers (the track shares the pillars of the track below it): put tiles on the beam there, so the track rests on it`);
  if (risers.length) pieces.push({ name: 'risers-bought', color: LEGO_COLOR, positions: Float32Array.from(stacks), stl: new Uint8Array(0), lego: risers });
  // (the size as it stands, lifted, with what it stands on; the printed pillars' volume with the track's)
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let supVol = 0;
  for (const p of pieces) {
    const v = p.positions;
    for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]); }
    // (a closed mesh's volume, from its triangles)
    if (/^track-support/.test(p.name)) for (let i = 0; i < v.length; i += 9)
      supVol += (v[i] * (v[i + 4] * v[i + 8] - v[i + 5] * v[i + 7]) - v[i + 1] * (v[i + 3] * v[i + 8] - v[i + 5] * v[i + 6]) + v[i + 2] * (v[i + 3] * v[i + 7] - v[i + 4] * v[i + 6])) / 6;
  }
  const size = mn[0] < Infinity ? [0, 1, 2].map((k) => mx[k] - mn[k]) : res.info.size;
  return { ...res, pieces, info: { ...res.info, warnings, size, volume: res.info.volume + Math.abs(supVol), pieces: pieces.length } };
}

/**
 * Train track's pillars (in mm, the track's frame: x across, y along, z up from the baseplate), as the reference's:
 * two square pillars x either side of the track's centre line, each on a flared foot hollow underneath (it sits over
 * the baseplate's studs), and at each level (the track's bottom there, the lowest first) a beam across between them,
 * a 2 x 2 of studs on top under the track's middle. The pillars go up to the top beam, past the lower ones. Printed
 * as it stands: the beams bridge from pillar to pillar, the feet slope at 45 degrees. slopes: each level's track's
 * climb along y (mm a mm): its beam's top and studs tilted to it, so the track sits flat on the beam (level, a beam
 * 2 studs wide was 0.4 mm off the track's underside at one edge on a 2.5% grade); the beam's underside stays level.
 * A level's slope as two, [before its middle, after it]: where a grade meets level track over the beam, each half of
 * its top to the piece on it. plain: the levels with no studs on top (bought track over them with no sleeper square
 * to the beam there: it rests on it).
 */
export function trainPillars(s: Scad, levels: number[], x: number, side: number, beamT: number, slopes: (number | [number, number])[] = [], plain: boolean[] = []): Man {
  // (the flare less on a low one, the foot's slope kept under the beam)
  const top = levels[levels.length - 1], foot = 32 - 0.2, footT = 3.2, flare = Math.max(0.01, Math.min((foot - side) / 2, levels[0] - beamT - footT));
  const parts: Man[] = [];
  for (const sd of [-1, 1]) {
    const cx = sd * x, inner = cx - (sd * side) / 2, outer = cx + (sd * foot) / 2, fw = foot / 2 + side / 2;
    // (the foot: a plate, then up at 45 degrees to the pillar; flush with the pillar on the track's side, so it keeps
    // clear of the sleepers of track below, as round a helix's start)
    const slope = s.w.Manifold.hull([T(s.cube([fw, foot, footT]), [Math.min(inner, outer), -foot / 2, 0]), T(s.cube([side, side, 0.01]), [cx - side / 2, -side / 2, footT + flare])]);
    parts.push(slope, T(s.cube([side, side, top - beamT - footT + 0.01]), [cx - side / 2, -side / 2, footT]));
  }
  levels.forEach((h, n) => {
    const hw = x + side / 2, sl = slopes[n] ?? 0, [k0, k1] = typeof sl === 'number' ? [sl, sl] : sl;
    const studs = plain[n] ? [] : [[-4, -4], [4, -4], [-4, 4], [4, 4]];
    if (Math.abs(k0) < 1e-6 && Math.abs(k1) < 1e-6) {
      parts.push(T(s.cube([2 * hw, side, beamT]), [-hw, -side / 2, h - beamT]));
      for (const [sx, sy] of studs) parts.push(T(s.cylinder(1.8, 4.8 / 2, 4.8 / 2, 24), [sx, sy, h - 0.01]));
      return;
    }
    // (the top tilted about the beam's middle, where the track's height is h: a wedge on a level underside; the studs
    // upright, each standing from the tilted top where it is)
    // (two climbs, where a grade meets level track over it: each half to its own, the two meeting at the middle)
    const y0 = -side / 2, y1 = side / 2;
    const wedge = s.extrude(s.polygon([[y0, h - beamT], [y1, h - beamT], [y1, h + k1 * y1], ...(k0 === k1 ? [] : [[0, h] as [number, number]]), [y0, h + k0 * y0]]), 2 * hw);
    // (drawn in (y, z), pushed out along x: turned to stand across the track)
    parts.push(T(R(R(wedge, [90, 0, 0]), [0, 0, 90]), [-hw, 0, 0]));
    for (const [sx, sy] of studs) parts.push(T(s.cylinder(1.8 + 0.2, 4.8 / 2, 4.8 / 2, 24), [sx, sy, h + (sy < 0 ? k0 : k1) * sy - 0.2]));
  });
  // (each foot hollow underneath, a rim round it)
  const holes = [-1, 1].map((sd) => { const inner = sd * x - (sd * side) / 2, w0 = foot / 2 + side / 2 - 2.4; return T(s.cube([w0, foot - 2.4, 1.8]), [sd > 0 ? inner + 1.2 : inner - 1.2 - w0, -(foot - 2.4) / 2, -0.01]); });
  return s.difference(s.union(parts), holes);
}

/** The train track's build, all of it level. */
function buildLevel(w: Wasm, design: Design, report: (what: string, frac: number) => void = () => {}, early?: (overlay: unknown) => void, opts: BuildOpts = {}) {
  const o = { ...OPTION_DEFAULTS, ...design.options };
  if (o.trackBallast !== 'apart' || o.ballast === 'none') return buildOne(w, design, report, early, opts);
  // The track and the ballast printed apart (the OpenSCAD files' generate_track / generate_ballast): the track on its
  // own (as without ballast), and the ballast with a seat it drops into; the moving parts with the track's.
  // (the layered points need the two together: built in one piece here)
  const one = { ...design.options, pointsModule: 'built-in' as const };
  const runs: (ReturnType<typeof buildOne> | undefined)[] = [];
  let planned = false;
  for (const [k, d, part] of [[0, { ...design, options: { ...one, ballast: 'none' as const } }, 'track'], [1, { ...design, options: one }, 'ballast']] as const) {
    try { runs.push(buildOne(w, d, (t, f) => report(t, (k + f) / 2), k === 0 ? early : undefined, { ...opts, part })); } catch (e) { if (e !== PLANNED) throw e; planned = true; runs.push(undefined); }
  }
  if (planned) throw PLANNED;
  const [a, b] = runs as ReturnType<typeof buildOne>[];
  const isBase = (p: Piece) => p.color === TRACK_COLOR;
  const pieces = [...a.pieces.map((p) => (isBase(p) ? { ...p, name: `${p.name}-track` } : p)), ...b.pieces.filter(isBase).map((p) => ({ ...p, name: `${p.name}-ballast` }))];
  const warnings = [...new Set([...a.info.warnings.filter((wn) => !/^layered points need ballast/.test(wn)), ...b.info.warnings,
    ...(o.pointsModule === 'layers' ? ['the track and ballast printed apart: the points built into the track, going in from below (not layered)'] : [])])];
  return { overlay: { ...a.overlay, issues: [...a.overlay.issues, ...b.overlay.issues.filter((q) => !a.overlay.issues.some((r) => r.text === q.text && Math.hypot(r.at[0] - q.at[0], r.at[1] - q.at[1]) < 1))] },
    pieces, info: { ...a.info, ms: a.info.ms + b.info.ms, volume: a.info.volume + b.info.volume, size: a.info.size.map((v, k) => Math.max(v, b.info.size[k])), pieces: pieces.length, warnings } };
}

/** A build's progress: steps done of the steps there are, worked out as the plan firms up. */
interface Progress { steps: number; done: number; step: (what: string) => void }
function progressOf(report: (what: string, frac: number) => void): Progress {
  const p: Progress = { steps: 3, done: 0, step: (what) => { report(what, Math.min(0.97, p.done / p.steps)); p.done++; } };
  return p;
}

/** What the canvas draws over the track, in mm: flangeway cuts, check rails, rail crossings, points, the tubes that grip, and what's wrong. */
export interface Overlay {
  grooves: [number, number][][]; checkRails: [number, number][][]; crossings: [number, number][]; splits: [number, number][]; grips: [number, number][]; items: TrackworkItem[];
  /** what's wrong, and where (mm, and how far round it): ringed in red on the plan and in the 3D view */
  issues: { at: [number, number]; r: number; text: string; area?: boolean }[];
}

/** A hand edit's key: where the item is (its middle, mm, "x,y"). */
const keyOf = (q: [number, number]) => `${Math.round(q[0])},${Math.round(q[1])}`;

/**
 * The trackwork: the routes (oriented, levelled where banks can't be, turned
 * where points are forced back along a route), solved, with the hand edits
 * (design.trackwork) on the flangeway cuts and points: their items for the
 * Trackwork panel, the overlay, and the cuts that lengthen flangeways.
 */
function solveTrackwork(w: Wasm, design: Design, o: PieceOptions, step: (what: string) => void) {
  // (a route that crosses itself, cut where it does into routes joined end to end: see route/selfcross.ts)
  let routes = orient(splitSelfCrossing(toRoutes(design).filter((r) => r.segments.length > 0), (design.gaugeStuds + 1) * 8));
  if (routes.length === 0) throw new Error('Draw some track: click a grid point to start, then click where it should go.');
  // (banked curves: level where other track comes near; ramps cut short)
  const bankWarnings = design.routes.flatMap((r) => bankRolls(design, r).warnings);
  if (routes.some(hasRoll)) { const lv = levelBankedNearOthers(routes, Math.max(...routes.map((rt) => sleeperLenOf(rt, (design.gaugeStuds + 1) * 8 + 24)))); routes = lv.routes; bankWarnings.push(...lv.warnings); }
  const gauge = (design.gaugeStuds + 1) * 8;
  // (a track drawn short of where another joins its line: carried on to the join, and said; carryon.ts)
  { const co = carriedOn(routes, gauge); routes = co.routes; bankWarnings.push(...co.warnings); }
  const solverOpts = { gauge, step: 0.5, flangeway: o.flangeway, checkRailLen: o.checkRailLen, checkRailW: o.checkRailW };
  step('Working out the trackwork');
  // Hand edits (design.trackwork), by where each item is.
  // (without where each is on its route and what its item is (twfollow.ts's, to follow the track): the build goes by
  // the keys alone, and what's built is kept by what it's built from)
  const tw = Object.fromEntries(Object.entries(design.trackwork ?? {}).map(([k, g]) => [k, Object.fromEntries(Object.entries(g as Record<string, object>).map(([key, e]) => [key, Object.fromEntries(Object.entries(e).filter(([f]) => f !== 'on' && f !== 'is'))]))])) as Trackwork;
  // (points taken out: all of them at a toe, or the ones a route takes part in; points forced where a route meets another a hair off)
  const splitEdits: SplitEdits = {
    drop: (toe, [i, j]) => { const e = tw.points?.[keyOf(toe)]; return !!e && (!!e.off || !!e.drop?.some((id) => id === routes[i].id || id === routes[j].id)); },
    force: (toe) => !!tw.points?.[keyOf(toe)]?.force,
  };
  let sol = solve(routes, solverOpts, splitEdits);
  // (forced where a route meets another heading back along it: that route turned round, as orient() does when it's exact, and solved again)
  const flip = new Set((sol.near ?? []).filter((c) => c.opposite && c.ok && splitEdits.force!(c.at)).map((c) => c.routes[1]));
  if (flip.size) { routes = routes.map((rt, k) => (flip.has(k) ? reversedRoute(rt) : rt)); sol = solve(routes, solverOpts, splitEdits); }
  // (switches that are bought pieces (Bought track: Bought), LEGO's or BrickTracks': cut out of the routes, the rest
  // worked out without them, joining them at ordinary track ends; the stud grid where it was)
  const gridPose = routePose(routes[0], 0);
  // (only track at LEGO's gauge, 4 studs: the design's, or a route's own)
  const isStd = (rt: Route) => (rt.gauge ?? gauge) === 40;
  const kinds = o.splitTrack === 'lengths' && routes.some(isStd) ? ({ lego: [LEGO_SWITCH, BRICKTRACKS_SWITCH], 'lego-only': [LEGO_SWITCH], print: [] }[o.legoTrack ?? 'lego'] ?? []) : [];
  let bought: BoughtSwitch[] = [];
  if (kinds.length && sol.splits.length) {
    const sl = 40 + 24, half = (o.ballast === 'buddy' ? sl + 32 : o.ballast === 'ballast' ? sl + 16 : sl) / 2;
    bought = findBoughtSwitches(routes, sol.splits.filter((sp) => sp.routes.every((ri) => isStd(routes[ri]))), kinds, half);
    if (bought.length) { routes = cutOut(routes, bought); sol = solve(routes, solverOpts, splitEdits); }
  }
  // (track only with sleepers: each route's own, so a stretch of it (cut into tiles, sections, a switch's cover) has its sleepers where the whole route has them)
  if (o.sleepers === 'sleepers' && o.ballast === 'none') {
    const j = joinedEnds(routes);
    routes = routes.map((rt, i) => ({ ...rt, sleeperFrame: { s0: 0, L: routeLength(rt), in0: j.has(`${i}:start`), in1: j.has(`${i}:end`) } }));
  }
  // (guard rails and third rails: where each may run, clear of the other routes, worked out on the whole design so its parts agree)
  if (routes.some((rt) => rt.extra)) routes = markClear(routes, gauge + 24);
  // (a third rail runs on through track that crosses it (extrarails.ts DUAL_CROSS); through points, beside track alongside
  // and across a shallow crossing it's left out, and it's said: where, and that narrow-gauge trains can't run there)
  for (const rt of routes) {
    const xr = rt.extra;
    if (!dualBuilt(xr, (rt.gauge ?? gauge) / 8 - 1) || !xr?.clearDual) continue;
    const lo = Math.min(xr.from, xr.to), hi = Math.max(xr.from, xr.to), gaps: [number, number][] = [];
    let at = lo;
    for (const [a, b] of xr.clearDual) { if (a - at > 8 && a <= hi) gaps.push([at, a]); at = Math.max(at, b); }
    if (hi - at > 8) gaps.push([at, hi]);
    const dr = xr.to >= xr.from ? 1 : -1;
    for (const [a, b] of gaps) {
      const q = routePose(rt, Math.max(0, Math.min(routeLength(rt), (((a + b) / 2) - xr.from) * dr)));
      // (centred: its two rails are left out through every set of points)
      if (xr.dualShared === 'centre') bankWarnings.push(`dual gauge with the narrow gauge centred isn't built through points, beside track running alongside, or across track crossing at under ${DUAL_CROSS}°: the narrow gauge's rails of ${rt.id.split(':')[0]} are left out for ${((b - a) / 8).toFixed(0)} studs at ${(q[0] / 8).toFixed(0)}, ${(q[1] / 8).toFixed(0)} (studs), and narrow-gauge trains can't run through there`);
      else bankWarnings.push(`dual gauge isn't built through points (but where the branch leaves on the third rail's side, crossing it at ${DUAL_CROSS}° or more), beside track running alongside, or across track crossing at under ${DUAL_CROSS}°: the third rail of ${rt.id.split(':')[0]} is left out for ${((b - a) / 8).toFixed(0)} studs at ${(q[0] / 8).toFixed(0)}, ${(q[1] / 8).toFixed(0)} (studs), and narrow-gauge trains can't run through there`);
    }
  }
  // What the canvas draws over the track, in mm: flangeway cuts, check rails,
  // rail crossings and points.
  const g = gauge / 2, gOf = (i: number) => railOffsetOf(routes[i], g);
  const along = (i: number, off: number, s0: number, s1: number) => {
    const n = Math.max(2, Math.ceil(s1 - s0));
    return Array.from({ length: n + 1 }, (_, k) => railPoint(routes[i], s0 + ((s1 - s0) * k) / n, off));
  };
  const items: TrackworkItem[] = [];
  // Flangeway cuts lengthened by hand: the rail head cut down to the
  // flangeway's depth on along each end.
  const grooveCuts: Man[] = [];
  const scad0 = new Scad(w);
  for (const gr of sol.grooves) {
    const g = gOf(gr.route), mid = railPoint(routes[gr.route], (gr.s0 + gr.s1) / 2, gr.side * g), key = keyOf(mid), e = tw.groove?.[key] ?? {};
    const d0 = Math.max(0, e.d0 ?? 0), d1 = Math.max(0, e.d1 ?? 0);
    const a0 = Math.max(0, gr.s0 - d0), a1 = Math.min(routeLength(routes[gr.route]), gr.s1 + d1);
    items.push({ kind: 'groove', key, at: mid, len: a1 - a0, pts: along(gr.route, gr.side * g, a0, a1), routes: [routes[gr.route].id, routes[gr.by].id] });
    const head = scad0.square([3.6, o.flangewayDepth + 1]).translate([gr.side * g - 1.8, PLATE_H + 6.4 - o.flangewayDepth]);
    if (d0 > 0) grooveCuts.push(sweepRoute(scad0, head, routes[gr.route], a0, gr.s0));
    if (d1 > 0) grooveCuts.push(sweepRoute(scad0, head, routes[gr.route], gr.s1, a1));
  }
  // Points moved along by hand, taken out, or forced.
  const splitAt = (sp: typeof sol.splits[number]) => railPoint(routes[sp.routes[0]], sp.merge ? sp.spans[0][1] : sp.spans[0][0], 0);
  const idsOf = (rs: number[]) => rs.map((r) => routes[r].id);
  for (const sp of sol.splits) {
    const at = splitAt(sp), key = keyOf(at), h = (routePose(routes[sp.routes[0]], sp.merge ? sp.spans[0][1] : sp.spans[0][0])[2] * Math.PI) / 180, k = sp.merge ? -1 : 1;
    // (dir: the way "moved along" goes, on the plan)
    items.push({ kind: 'points', key, at, pts: [at], toe: tw.points?.[key]?.toe ?? 0, dir: [-Math.sin(h) * k, Math.cos(h) * k], routes: idsOf(sp.routes), ...(sp.forced && { forced: true }) });
  }
  // (mixed gauges: points between routes of different gauges aren't built; said, with where and which routes)
  const forceWarnings: string[] = [];
  for (const sp of sol.refused ?? []) {
    const at = splitAt(sp), [ra, rb] = sp.routes.map((ri) => routes[ri]), name = (rt: Route) => `${rt.id.replace(/[:~]\d+$/, '')} (${(rt.gauge ?? gauge) / 8 - 1} studs)`;
    // (a narrow gauge's points on dual-gauge track: built only where the branch leaves on the shared rail's side)
    if (sp.dual) forceWarnings.push(`narrow-gauge points on dual-gauge track are built only where the branch leaves on the side of the rail both gauges share${sp.dual === 'centre' ? ' (here none is shared: the narrow gauge is up the middle)' : ''}: the points of ${name(ra)} and ${name(rb)} at ${(at[0] / 8).toFixed(0)}, ${(at[1] / 8).toFixed(0)} (studs) aren't built; the rails run through as plain track, and trains can't choose their way`);
    else forceWarnings.push(`points between tracks of different gauges aren't built: ${name(rb)} ${sp.merge ? 'ends' : 'starts'} on ${name(ra)} at ${(at[0] / 8).toFixed(0)}, ${(at[1] / 8).toFixed(0)} (studs); its rails run on to it as plain track, and trains can't take the turn`);
  }
  for (const sp of sol.dropped ?? []) { if (sol.refused?.includes(sp)) continue; const at = splitAt(sp); items.push({ kind: 'points', key: keyOf(at), at, pts: [at], off: true, routes: idsOf(sp.routes) }); }
  // (near misses: where points could be forced, unless they are; and a warning where they're forced but too far off to build)
  for (const c of sol.near ?? []) {
    const key = keyOf(c.at), forced = splitEdits.force!(c.at);
    if (sol.splits.some((sp) => sp.forced && keyOf(splitAt(sp)) === key)) continue;
    const why = `${routes[c.routes[1]].id}'s ${c.end} is ${c.lat.toFixed(2)} mm off ${routes[c.routes[0]].id} and ${c.angle.toFixed(2)}° off its heading${c.opposite ? ' (back along it)' : ''}`;
    items.push({ kind: 'points', key, at: c.at, pts: [c.at], routes: idsOf(c.routes), cand: { ok: c.ok, why }, ...(forced && { forced: true }) });
    if (forced && !c.ok) forceWarnings.push(`points forced at ${key}: ${why}; they need it within ${FORCE_LAT} mm and ${FORCE_ANGLE}° (redraw it to start on the track): not built`);
  }
  const overlay: Overlay = { grooves: [], checkRails: [], crossings: sol.crossings.map((c) => c.point), splits: sol.splits.map(splitAt), grips: [], items, issues: [] };
  return { routes, sol, solverOpts, tw, items, overlay, grooveCuts, forceWarnings, bankWarnings, bought, gridPose };
}

/** Apply the check rail edits to a solution's check rails (in place), noting each for the Trackwork panel. */
function editChecks(items: TrackworkItem[], tw: Trackwork, rs: Route[], checks: CheckRail[], idOf = (rt: Route) => rt.id) {
  const out = checks.flatMap((cr) => {
    const mid = railPoint(rs[cr.route], (cr.s0 + cr.s1) / 2, cr.offset + cr.width / 2), key = keyOf(mid), e = tw.check?.[key] ?? {};
    const between = [idOf(rs[cr.route]), ...(cr.by !== undefined ? [idOf(rs[cr.by])] : [])];
    if (e.off) { items.push({ kind: 'check', key, at: mid, pts: [], off: true, len: cr.s1 - cr.s0, routes: between }); return []; }
    const m = { ...cr, s0: cr.s0 - (e.d0 ?? 0), s1: cr.s1 + (e.d1 ?? 0), offset: cr.offset - cr.side * (e.shift ?? 0) };
    const n = Math.max(2, Math.ceil(m.s1 - m.s0));
    items.push({ kind: 'check', key, at: mid, len: m.s1 - m.s0, routes: between, pts: Array.from({ length: n + 1 }, (_, k) => railPoint(rs[m.route], m.s0 + ((m.s1 - m.s0) * k) / n, m.offset + m.width / 2)) });
    return [m];
  });
  checks.splice(0, checks.length, ...out);
}

/** A points set's lever, as planned (switch/base.ts): what its item and keep-outs are made from. */
interface LeverPlan {
  throwDir: number; leverX: number; throwY: number; throwStockX: number; throwEdgeX: number; leverMinD: number; tineLen: number; pivotPt: [number, number];
  ra: Route; rb: Route; sHeel: number; leverTravel: number; fixed?: number; three?: { S: Route; own?: boolean }; fdb?: { pivot: [number, number]; post: [number, number] }[];
}
/** A points set's lever on the plan (it can be dragged there). avoid: (the plate-style) where no cut goes, its parts' keep-outs added; G: the rails' offset. */
function leverItem(items: TrackworkItem[], tw: Trackwork, avoid: Keep[] | undefined, G: number, key: string, P: Pose, v: LeverPlan) {
  if ((v as { nail?: boolean }).nail) return; // (a nail switch: no lever to place)
  const wd = (x: number, y: number) => poseToWorld(P, [x, y]);
  // (one of a three-way's two levers: the left blade's is on the left, the right one's on the right)
  const blade = v.three?.own ? (v.throwDir < 0 ? 'left' as const : 'right' as const) : undefined;
  const ed = blade ? tw.throw?.[key]?.each?.[blade] ?? (tw.throw?.[key]?.leverOffset !== undefined ? tw.throw[key] : undefined) : tw.throw?.[key];
  // (pts: the arm's outline, as built: from the stock rail out to the stud line past the lever, 3 studs wide)
  const xOut = v.throwDir * Math.ceil((v.throwDir * (v.leverX + v.throwDir * 10)) / 8 - 1e-6) * 8, hw = 12;
  // (the plate-style: no cut through the slider's tunnel, from past the far blade to the stock rail (the rod and
  // its walls, 6 mm either side of its line), nor the arm out to its end (3 studs wide, with the lever's
  // opening), nor the pins the blades turn on (and a little bed round them); under the loose blades is fine)
  if (avoid) {
    const keep = (q: [number, number], r: number): Keep => [q[0], q[1], r, r];
    // (the tunnel's far end: past the far post by the slider's travel, and its wall (base.ts fdbSlot2d); as far as
    // past the far rail where the plan doesn't say: a cut can go close by it, between a double slip's points)
    const posts = (v.fdb ?? []).filter((_, b) => b !== v.fixed).map((f) => f.post[0]);
    const far = posts.length ? (v.throwDir > 0 ? Math.min(...posts) : Math.max(...posts)) - v.throwDir * (v.leverTravel + 6) : v.throwStockX - v.throwDir * (2 * G + 16);
    for (let x = far; v.throwDir * (x - v.throwStockX) < 0; x += v.throwDir * 4) avoid.push(keep(wd(x, v.throwY), 6.5));
    for (let x = v.throwStockX; v.throwDir * x <= v.throwDir * xOut + 1e-9; x += v.throwDir * 4) avoid.push(keep(wd(x, v.throwY), hw + 1));
    // (where the plan put them: moved, clear of other track running past)
    for (const b of [0, 1]) if (b !== v.fixed) { const q = v.fdb?.[b].pivot ?? railPoint(v.three ? v.three.S : b === 0 ? v.ra : v.rb, v.sHeel - 4, (b === 0 ? 1 : -1) * (7 - G)); avoid.push(keep(wd(q[0], q[1]), 6)); }
  }
  items.push({ kind: 'throw', key, at: wd(v.leverX, v.throwY), pts: [wd(v.throwStockX, v.throwY - hw), wd(xOut, v.throwY - hw), wd(xOut, v.throwY + hw), wd(v.throwStockX, v.throwY + hw)],
    lever: { frame: P, side: v.throwDir, stockX: Math.abs(v.throwStockX), edge: Math.abs(v.throwEdgeX), minD: Math.abs(v.leverMinD), pivotY: v.pivotPt[1], maxTine: v.pivotPt[1] - 12.5,
      leverOffset: Math.round((Math.abs(v.leverX) - Math.abs(v.throwEdgeX)) * 100) / 100, springLength: Math.round(v.tineLen * 100) / 100, edited: !!ed, ...(blade && { blade }) } });
}

/** The switches' parameters (switch/base.ts BaseParams) from the piece options. alone: the ballast printed apart, alone. */
function switchParams(o: PieceOptions, gaugeStuds: number, alone: boolean) {
  return { ...BASE_DEFAULTS, ...o, gaugeStuds, studGrip: o.grip ?? 'edges', pointsPieces: o.pointsPieces ?? 1,
    generateBallast: o.ballast !== 'none', ballastBuddy: o.ballast === 'buddy', bottomStyle: o.bottomStyle,
    // (a floor under the moving parts only with the lid over them: otherwise they go in from below, through their pockets)
    ...(o.pointsModule === 'layers' && o.ballast !== 'none' && { mechFloor: 1.2 }), endSupports: o.endSupports !== false,
    throwModule: o.throwStyle === 'bracket', mechStyle: (o.mechStyle === 'tines' ? 'tines' : 'plates') as 'tines' | 'plates', // (anything else, an older name included: the default)
    throwStand: o.throwStyle === 'stand', throwNail: o.throwStyle === 'nail', boxedThrow: o.boxedThrow ?? 'slider', throwAction: o.throwAction ?? 'detent', bladeStyle: o.bladeStyle ?? 'simple',
    bladeLip: o.bladeLip === 'front' ? 'front' as const : 'pin' as const, // (unset, an older design: the snap lip on the pin)
    // (narrow gauge: one moving blade. Two blades' plates, each on its own pin, don't fit side by side between rails
    // under 4 studs apart: they lay over each other and on each other's pins)
    ...(gaugeStuds < 4 && { pointBlades: 1 as const }),
    ...(alone && { ballastOnly: o.trackFitTol ?? 0.2 }) };
}
type SwitchParams = ReturnType<typeof switchParams>;

/**
 * Two stretches of track side by side closer than their sleepers' length, nearly parallel: drawn over each other,
 * not a crossing (those cross at an angle) nor a switch (those part at its toe): trains on them would hit. Where
 * they are (mm), one spot for each place.
 */
function tracksOverEachOther(routes: Route[], sol: { splits: Split[]; dropped?: Split[] }, gap: number) {
  const step = 8, cos15 = Math.cos((15 * Math.PI) / 180), mixed = routes.some((rt) => rt.gauge !== undefined);
  const ends = routes.flatMap((rt) => [routePose(rt, 0), routePose(rt, routeLength(rt))]);
  // (where two routes join end to end, or a route's end lies on another: the same track carrying on, or a switch)
  const joints = ends.filter((e, i) => ends.some((f, j) => j !== i && Math.hypot(e[0] - f[0], e[1] - f[1]) < 1));
  // (where a switch's routes part, or would have (taken out): they're side by side by nature until they're a
  // sleeper's length apart, however gently they part; that far from the toe, and a little more, they're left alone)
  const parts = [...sol.splits, ...(sol.dropped ?? [])].map((sp) => {
    const [i, j] = sp.routes, toe = routePose(routes[i], sp.merge ? sp.spans[0][1] : sp.spans[0][0]), rj = routes[j], Lj = routeLength(rj);
    let d = 0;
    for (let t = 0; t <= Lj; t += step) { const sj = sp.merge ? Lj - t : t, q = routePose(rj, sj); d = Math.hypot(q[0] - toe[0], q[1] - toe[1]); if (Math.abs(routeLat(routes[i], [q[0], q[1]])) >= gap) break; }
    return { i, j, toe, r: d + 2 * gap };
  });
  // (mixed gauges: a narrower track that leaves a wider one's end from within it (route.ts hostedEnds: the narrow gauge
  // out of a dual-gauge track) parts from it side by side as a switch's routes do, on fixed rails)
  if (mixed) for (const h of hostedEnds(routes, routes.map((rt) => railOffsetOf(rt, (gap - 24) / 2)))) {
    const rj = routes[h.route], Lj = routeLength(rj), toe = routePose(rj, h.end === 'start' ? 0 : Lj);
    let d = 0;
    for (let t = 0; t <= Lj; t += step) { const q = routePose(rj, h.end === 'start' ? t : Lj - t); d = Math.hypot(q[0] - toe[0], q[1] - toe[1]); if (Math.abs(routeLat(routes[h.host], [q[0], q[1]])) >= gap) break; }
    parts.push({ i: h.host, j: h.route, toe, r: d + 2 * gap });
  }
  // (and with them every route of the switches near it: a tandem's or a curve's switches' branches part side by side too)
  const groups = parts.map((pt) => ({ ...pt, rs: new Set(parts.filter((o2) => Math.hypot(o2.toe[0] - pt.toe[0], o2.toe[1] - pt.toe[1]) < pt.r + o2.r).flatMap((o2) => [o2.i, o2.j])) }));
  const parting = (p: number[], q: number[]) => groups.some((pt) => pt.rs.has(p[4]) && pt.rs.has(q[4])
    && Math.hypot(p[0] - pt.toe[0], p[1] - pt.toe[1]) < pt.r && Math.hypot(q[0] - pt.toe[0], q[1] - pt.toe[1]) < pt.r);
  const near = (q: number[], ps: number[][], r: number) => ps.some((e) => Math.hypot(e[0] - q[0], e[1] - q[1]) < r);
  const pts = routes.flatMap((rt, i) => { const L = routeLength(rt), out: number[][] = []; for (let s0 = 0; s0 <= L; s0 += step) { const q = routePose(rt, s0); out.push([q[0], q[1], q[2], s0, i]); } return out; })
    .filter((q) => !near(q, joints, 3 * gap));
  const spots: number[][] = [];
  for (let a2 = 0; a2 < pts.length; a2++) for (let b2 = a2 + 1; b2 < pts.length; b2++) {
    const p = pts[a2], q = pts[b2];
    // (closer than their sleepers: half of each one's, mixed gauges)
    const gap2 = mixed ? (sleeperLenOf(routes[p[4]], gap) + sleeperLenOf(routes[q[4]], gap)) / 2 : gap;
    if (Math.abs(p[0] - q[0]) > gap2 || Math.abs(p[1] - q[1]) > gap2 || Math.hypot(p[0] - q[0], p[1] - q[1]) >= gap2) continue;
    if (p[4] === q[4] && Math.abs(p[3] - q[3]) < 4 * gap) continue; // (the same stretch of one route)
    if (Math.abs(heightAt(routes[p[4]], p[3]) - heightAt(routes[q[4]], q[3])) >= GRADE_APART) continue; // (one over the other, on a grade)
    if (parting(p, q)) continue;
    if (Math.abs(Math.cos(((p[2] - q[2]) * Math.PI) / 180)) < cos15) continue; // (crossing at an angle: a crossing)
    if (!near(p, spots, 4 * gap)) spots.push(p);
  }
  return spots;
}

/** The cut context for a build: its points kept clear, its joints, and the cutters (fitter, bedCut, whole). fdbPoints: the plate-style blades. */
function cutContext(w: Wasm, scad: Scad, o: PieceOptions, track: Track, routes: Route[], splits: Split[], crossings: [number, number][], fdbPoints: boolean) {
  // (a part fits the bed if it does turned any way, corner to corner too (geom/bedfit.ts): its file is its own, and
  // it's laid on the bed however it goes. Its box as it lies in the design first: most parts fit so, and need no more)
  const fits = new WeakMap<Man, BedFit>();
  const fitOf = (m: Man): BedFit => {
    let f = fits.get(m);
    if (f) return f;
    const b = m.boundingBox(), bw = b.max[0] - b.min[0], bh = b.max[1] - b.min[1];
    if (bw <= o.printBedX && bh <= o.printBedY) f = { fits: true, angle: 0, square: true, size: [bw, bh], over: Math.max(bw / o.printBedX, bh / o.printBedY) };
    else if (bw <= o.printBedY && bh <= o.printBedX) f = { fits: true, angle: 90, square: true, size: [bh, bw], over: Math.max(bh / o.printBedX, bw / o.printBedY) };
    else { const mesh = m.getMesh(); f = bedFit(mesh.vertProperties, o.printBedX, o.printBedY, mesh.numProp); }
    fits.set(m, f);
    return f;
  };
  const fitsBed = (m: Man) => fitOf(m).fits;
  /** How far a part's file is turned to lie within the bed (degrees): 0 for one that fits as it is or a quarter turn round, or not at all. */
  const turnOf = (m: Man) => { const f = fitOf(m); return f.fits && !f.square ? f.angle : 0; };
  /** A part's tightest box, turned any way (mm, the longer side first): what's said of one too big. */
  const tightOf = (m: Man) => { const mesh = m.getMesh(); return tightBox(mesh.vertProperties, mesh.numProp).size; };
  const bp = (o.baseplate ?? 0) * 8;
  // (how far each side of a centre line the track's base reaches: its sleepers, or its widest ballast layer)
  // (the widest track's, mixed gauges)
  const slMax = Math.max(...routes.map((rt) => sleeperLenOf(rt, track.c.sleeperLen)), track.c.sleeperLen);
  const bandOf = (sl: number) => (o.ballast === 'buddy' ? sl + 32 : o.ballast === 'ballast' ? sl + 16 : sl) / 2;
  // (bandHalf0: the design's own, which each route's is worked out from where it matters: sections.ts)
  const bandHalf = bandOf(slMax), bandHalf0 = bandOf(track.c.sleeperLen);
  // (what the joints stick out past a cut, both ends of a part: rail tongues, and the peg or dovetail)
  const jointRoom = o.joint === 'dovetail' ? 14 : o.joint === 'butt' || o.joint === 'axle' ? 4 : o.joint === 'flataxle' ? 0 : 8;
  // (where no cut goes: the crossings, and every points set from before its toe to past its heels,
  // so a cut never runs through the blades' slots and leaves strips of track between them)
  // (a split along a path may go through a crossing, across its rails, as a cut down the middle of a crossover has to: only the points are kept clear)
  // (the plate-style blades lie on the bed, loose: a cut may go under them, clear of the pins at their heels and the
  // slider's tunnel and arm (kept clear as each lever's placed: leverItem))
  const pointsAvoid: Keep[] = [];
  // (the plate-style keep-outs are their parts' own (leverItem): the tines' points keep the whole set clear)
  if (!fdbPoints) for (const sp of splits) {
    const rt = routes[sp.routes[0]], [a0, a1] = sp.spans[0];
    const [s0, s1] = [a0 - 8, a1 + 8];
    for (let s2 = s0; s2 <= s1 + 1e-9; s2 += 12) { const q = railPoint(rt, Math.max(0, Math.min(routeLength(rt), s2)), 0); pointsAvoid.push([q[0], q[1]]); }
  }
  // (and no rail-end tongue beside the blades, from before the toe to past the heels, where a cut may go under them:
  // a tongue's head beside a stock rail is where a closed blade lies)
  const G0 = track.c.railOffset, zones = splits.flatMap((sp) => sp.routes.map((r, n) => {
    const rt = routes[r], [a0, a1] = sp.spans[n], s0 = sp.merge ? a0 - 12 : a0 - 8, s1 = sp.merge ? a1 + 8 : a1 + 12, L = routeLength(rt);
    const pts = Array.from({ length: 9 }, (_, k) => routePose(rt, Math.max(0, Math.min(L, s0 + ((s1 - s0) * k) / 8))));
    const pad = railOffsetOf(rt, G0) + 8, box = [Math.min(...pts.map((q) => q[0])) - pad, Math.min(...pts.map((q) => q[1])) - pad, Math.max(...pts.map((q) => q[0])) + pad, Math.max(...pts.map((q) => q[1])) + pad];
    return { rt, s0, s1, box };
  }));
  // (nor on a banked stretch, the rails there tilted: cut plain)
  const bankedRts = routes.filter(hasRoll);
  const noTongue = (q: [number, number]) => zones.some((z) => q[0] >= z.box[0] && q[0] <= z.box[2] && q[1] >= z.box[1] && q[1] <= z.box[3]
    && Math.abs(routeLat(z.rt, q)) < G0 + 6 && ((sa) => sa >= z.s0 && sa <= z.s1)(routeSOf(z.rt, q)))
    || bankedRts.some((rt) => Math.abs(routeLat(rt, q)) < G0 + 6 && Math.abs(routeRoll(rt, routeSOf(rt, q))) > 1e-9);
  /** How every cut joins (Parts join with): Straight cuts + LEGO axles is axle joints with the rails cut flat. */
  const join = { t: track, joint: o.joint === 'flataxle' ? 'axle' as const : o.joint ?? 'lego', flatRails: o.joint === 'flataxle', noTongue };
  // (a part's pieces that don't touch: for the fitter below, and a section's parts (sectioned))
  const one = new WeakSet<Man>();
  // (big: what counts as a piece, not a support (mm3); a section's parts' loose pieces from 600, a track end's supports being about 250)
  const bodies = (m: Man, big = 1000): Man[] => {
    if (one.has(m) && big === 1000) return [m];
    const all2 = flat(w, m).decompose(), big2 = all2.filter((b2) => b2.volume() > big), small = all2.filter((b2) => b2.volume() <= big);
    if (big2.length <= 1) { one.add(m); return [m]; }
    // (each small bit with the piece nearest it: the one it supports)
    const boxes = big2.map((b2) => b2.boundingBox()), groups: Man[][] = big2.map((b2) => [b2]);
    const gap = (a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }) =>
      Math.hypot(Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]), Math.max(0, a.min[1] - b.max[1], b.min[1] - a.max[1]));
    for (const sm of small) { const sb = sm.boundingBox(); let best = 0; boxes.forEach((bx, k) => { if (gap(sb, bx) < gap(sb, boxes[best])) best = k; }); groups[best].push(sm); }
    return groups.map((g2) => { const u = g2.length > 1 ? scad.union(g2) : g2[0]; one.add(u); return u; });
  };
  /** Fits a part to the bed: its pieces that don't touch apart, and one too big split along stepped paths (pathsplit.ts), as often as it takes. */
  /** holes: the axle holes the cuts so far put in (cutter.ts), kept clear of: more are added as it goes. */
  /** taken: the rail-end tongue joints the cuts so far made (cutter.ts jointsNear): none put near one; each split's are added. */
  const fitter = (pieceRoutes: Route[], holes: Keep[] = [], taken: [number, number][] = []) => {
    // a part still too big: split along a stepped path on the stud grid that
    // goes only where a cut can be made (pathsplit.ts), as often as it takes
    // (pieces of track that don't touch are parts of their own; the small bits, the breakaway supports, stay with the biggest)
    // (each found in a flat copy of it, kernel.ts flat: a cut part's record of what it was made from made decompose()
    // take most of a gigabyte)
    // (the parts found to be one body already, and their copies: not taken apart again)
    // (where the stepped cuts so far ran across each axis: the next part's cut lines up with them where it can)
    const cutAt: [number[], number[]] = [[], []];
    const fitAll = (m: Man, depth = 0): Man[] => {
      { const bs = bodies(m); if (bs.length > 1) return bs.flatMap((b2) => fitAll(b2, depth + 1)); }
      if (fitsBed(m) || depth > 5) return [m];
      const bb = m.boundingBox(), w2 = bb.max[0] - bb.min[0], h2 = bb.max[1] - bb.min[1];
      // (across whichever side is too long: the longer one if it's longer than the bed, else the shorter)
      const big = Math.max(o.printBedX, o.printBedY), longX = w2 >= h2;
      const axis: 0 | 1 = Math.max(w2, h2) > big ? (longX ? 0 : 1) : (longX ? 1 : 0);
      // (into as few parts as fit, the first a whole part's width (the rest
      // split again): not halves and then halves again; the path kept where
      // the first part fits the bed and the rest fit the others, a little
      // room left for the joints; at a neighbour's cut if one's near)
      const ext = axis === 0 ? w2 : h2, lo = axis === 0 ? bb.min[0] : bb.min[1];
      const room = ((axis === 0 ? h2 : w2) <= Math.min(o.printBedX, o.printBedY) ? big : Math.min(o.printBedX, o.printBedY)) - 4;
      // (or fewer, where its parts go on the bed turned: by its tightest box, each part as long as fits beside its width)
      const nSq = Math.max(2, Math.ceil(ext / room)), [tl, tw] = tightOf(m), n = Math.min(nSq, Math.max(2, Math.ceil(tl / Math.max(48, longestFit(tw, o.printBedX, o.printBedY) - 4))));
      const win: [number, number] = n < nSq ? [lo + 48, lo + ext - 48] : [Math.max(lo + 48, lo + ext - (n - 1) * room), Math.min(lo + room, lo + ext - 48)];
      let at = lo + ext / n;
      const near = cutAt[axis].filter((v) => v >= win[0] && v <= win[1] && Math.abs(v - at) <= 16).sort((p2, q) => Math.abs(p2 - at) - Math.abs(q - at))[0];
      if (near !== undefined) at = near;
      // (no split that leaves a small piece: every part at least 6 studs each way)
      const small = (p2: Man) => { const b3 = p2.boundingBox(); return Math.min(b3.max[0] - b3.min[0], b3.max[1] - b3.min[1]) < 48; };
      // (bodies called with the part alone: handed to flatMap as it is, the part's place in the list was taken for its size limit)
      const good = (g2: Man[] | undefined) => !!g2 && g2.length > 1 && !g2.flatMap((p2) => bodies(p2)).some(small);
      // (each try in an arena of its own, only the parts of a good one kept, as solids of their own (kernel.ts flat):
      // a big part on a small bed tries many paths, and everything they made, kept to the end, ran the kernel out of
      // memory (it aborts))
      const attempt = (f: () => ReturnType<typeof pathSplit>) => arena(w, () => {
        const g2 = f();
        return g2 && good(g2.parts) ? { ...g2, parts: g2.parts.map((p2) => { const c = flat(w, p2); if (one.has(p2)) one.add(c); return c; }) } : undefined;
      }, (g2) => g2?.parts ?? []);
      let got = win[0] <= win[1] ? attempt(() => pathSplit(scad, m, pieceRoutes, track.c.railOffset, [...pointsAvoid, ...holes], axis, at, { join, window: win, taken })) : undefined;
      // (no way within it: anywhere near the middle, as before)
      if (!got) got = attempt(() => pathSplit(scad, m, pieceRoutes, track.c.railOffset, [...pointsAvoid, ...holes], axis, lo + ext / 2, { join, taken }));
      // (nor at all that way: split the other way first, across its middle, and each half again (a crowded middle, its
      // levers side by side, cut into four))
      if (!got) { const ax2 = (1 - axis) as 0 | 1, lo2 = bb.min[ax2], ext2 = bb.max[ax2] - lo2; got = attempt(() => pathSplit(scad, m, pieceRoutes, track.c.railOffset, [...pointsAvoid, ...holes], ax2, lo2 + ext2 / 2, { join, taken })); }
      if (!got) return [m];
      for (const r of got.runs) for (const ax of [0, 1] as const) if (r.d[ax] === 0) cutAt[ax].push(r.p[ax]);
      holes.push(...got.holes); taken.push(...got.tongueAt);
      return got.parts.flatMap((p) => arena(w, () => fitAll(p, depth + 1), (r) => r));
    };
    return fitAll;
  };
  /** The parts cut from body, with the studs a cut went through as set (Studs a cut goes through: never half a stud on a part unless asked; geom/studs.ts). */
  const whole = (body: Man, parts: Man[]) => ((o.studsAtCuts ?? 'off') === 'split' ? parts
    : wholeStuds(scad, findStuds(scad, body, track.c.postD / 2, track.o.studH, PLATE_H, PLATE_H), parts, track.c.postD / 2, track.o.studH, o.studsAtCuts === 'whole', fitsBed));
  /** A part too big for the bed cut as the parts filling it are: straight across where it can (tiles.ts planCuts), then along stepped paths (fitter). */
  /** taken: the rail-end tongue joints earlier cuts of the piece m is a part of made (cutter.ts jointsNear). */
  const bedCut = (m: Man, pieceRoutes: Route[], taken: [number, number][] = []): Man[] => {
    if (fitsBed(m)) return [m];
    const bb = m.boundingBox(), plan = planCuts([bb.min[0], bb.min[1], bb.max[0], bb.max[1]], o.printBedX, o.printBedY, 0, 0, 0, pointsAvoid, pieceRoutes, bandHalf, jointRoom, track.c.railOffset, crossings);
    const lines: CutLine[] = [...plan.xs.map((x): CutLine => ({ p: [x, 0], d: [0, 1] })), ...plan.ys.map((y): CutLine => ({ p: [0, y], d: [1, 0] }))];
    const holes: Keep[] = [], cells = lines.length ? cutPiece(scad, track, m, pieceRoutes, lines, join.joint, join.flatRails, noTongue, holes as [number, number, number][], fitsBed, taken) : [m];
    const fit = fitter(pieceRoutes, holes, taken);
    return cells.filter((c2) => c2.numTri() > 0).flatMap((c2) => fit(c2));
  };
  // (pointsAvoid: the plate-style levers' keep-outs are added as each is placed (leverItem); crossings: the overlay's, no straight cut through them)
  return { fitsBed, turnOf, tightOf, pointsAvoid, zones, noTongue, join, jointRoom, bandHalf, bandHalf0, bp, crossings, fitter, bedCut, whole, bodies };
}
/** How cutting a part to fit goes: the bed, where no cut goes, how cuts join, and the cutters. */
type CutContext = ReturnType<typeof cutContext>;

/** A part as plain data (baked): its mesh for the view, its STL, its volume, whether it fits the bed. */
/** turn: how far its file's turned to fit the bed (degrees; cutContext turnOf); tight: one too big, its tightest box */
type Baked = { positions: Float32Array; supports?: Float32Array; stl: Uint8Array; volume: number; fits: boolean; box: { min: number[]; max: number[] }; turn?: number; tight?: number[] };

/**
 * One build's pieces as they're made: what makes, cuts, labels and caches
 * them (the cut context, the track, the options), and where they go (pieces,
 * volume, warnings, the overlay's grips and issues).
 */
interface PieceBuild {
  w: Wasm; scad: Scad; o: PieceOptions; gaugeStuds: number; track: Track; cut: CutContext; prog: Progress;
  pieces: Piece[]; volume: number; bedWarnings: Set<string>; overlay: Overlay;
  /** A heavy job (BuildJob): built (or found in the cache); or, planning, listed (if it isn't cached) and passed over. */
  job: <T>(key: string, cost: number, f: () => T, none: T) => T;
  /** labels engraved under the parts (name, label_*) */
  labelOn: boolean;
  /** (a test-print kit's coupon) its number, marked on its track parts (marked) */
  mark?: number;
  /**
   * The track parts' numbers, one run for the whole build: part, the last part numbered; sec, the sections and blocks
   * numbered so far (labelled parts are named by theirs). (Each way of cutting counted from 1 on its own: the X yard had
   * two track2 and two track12, a section's and a block's, and a part's name is its file's.)
   */
  num: { part: number; sec: number };
  /** track only, its underside lined up with the track: no grip added along the cut edges on the baseplate's grid */
  alongTrack: boolean;
  /** the design's stud grid (the first route's start): every part's underside on it (but lined up with the track) */
  gridPose: Pose;
  /** track only with sleepers: the bed kept across each cut, so the parts there have floor to join with */
  sleepered: boolean;
  /** route ends that end in a buffer stop, by where they are */
  bufs: [number, number][];
  /** the layout's tables (design.tables): the track cut at their seams */
  tables: Table[];
  /** the bought switches (boughtswitch.ts): their ballast a part of its own, kept clear of */
  boughtSw: BoughtSwitch[];
  /** every route of the trackwork (the bought switches' legs cut out of them): the ground under each one's sleepers is its own track's (trackBeds) */
  trackRoutes: Route[];
  /** flangeway cuts lengthened by hand, and their edits (for the cache keys) */
  grooveCuts: Man[]; grooveEdits: Trackwork['groove'];
  /** the ends of rts left on other track by points taken out (droppedInner) */
  dropInner: (rts: Route[], more?: Iterable<string>) => Set<string>;
}

/** A part too big for the bed: ringed where it is. */
/** tight: its tightest box, turned any way (the longer side first): its size as said. */
function bedIssue(b: PieceBuild, bb: { min: number[]; max: number[] }, tight: number[] = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]]) {
  b.overlay.issues.push({ at: [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2],
    r: Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) / 2, text: `A part ${tight[0].toFixed(0)} x ${tight[1].toFixed(0)} mm: too big for the ${b.o.printBedX} x ${b.o.printBedY} print bed, however it's turned`, area: true });
}

/** A part for the view: its triangles, and its breakaway supports' apart (loose bits, small beside it), to show or hide. */
// (clean: the part less any flat, empty shells (no volume) the cuts left where faces met, drawn as loose bits and
// written to the file)
function viewOf(w: Wasm, m: Man): { positions: Float32Array; supports?: Float32Array; clean: Man } {
  const all = flat(w, m).decompose(), bits = all.filter((b) => b.volume() >= 0.5);
  const clean = bits.length === all.length || !bits.length ? m : w.Manifold.compose(bits);
  if (bits.length <= 1) return { positions: meshPositions(clean.getMesh()), clean };
  const join = (ms: Man[]) => { const ps = ms.map((b) => meshPositions(b.getMesh())), out = new Float32Array(ps.reduce((t, p) => t + p.length, 0)); let o2 = 0; for (const p of ps) { out.set(p, o2); o2 += p.length; } return out; };
  // (a support: a loose bit much smaller than the part (a track end's, footing and all, is about 250 mm3), as the fitter's small bits)
  const vs = bits.map((b) => b.volume()), cut = Math.min(1000, 0.25 * Math.max(...vs)), small = bits.filter((_, k) => vs[k] < cut);
  return small.length ? { positions: join(bits.filter((_, k) => vs[k] >= cut)), supports: join(small), clean } : { positions: meshPositions(clean.getMesh()), clean };
}

/** A part as plain data (its mesh for the view, its STL, its volume, whether it fits the bed), so its solid can be let go. */
function bake(b: PieceBuild, m: Man): Baked {
  // (the copies it's told apart on let go at once: a part's worth each, and a build has hundreds)
  return arena(b.w, () => {
    const { positions, supports, clean } = viewOf(b.w, m);
    const fits = b.cut.fitsBed(m), turn = b.cut.turnOf(m);
    return { positions, supports, stl: stlBytes(clean.getMesh(), true, turn), volume: m.volume(), fits, box: m.boundingBox(), ...(turn && { turn }), ...(!fits && { tight: b.cut.tightOf(m) }) };
  }, () => []);
}

/**
 * A test-print coupon's number (BuildOpts.mark), to tell it by once it's off the bed: that many upright ribs (1.5 wide,
 * 0.55 proud, 2.4 high, 3 apart) on its side at its +x edge, about its middle: a sleeper's end, on a short straight
 * laid along y (the kit's). Left off where they wouldn't all be part of it (no wall there).
 */
function marked(b: PieceBuild, m: Man): Man {
  const bb = m.boundingBox(), cy = (bb.min[1] + bb.max[1]) / 2, n = Math.min(5, Math.round(b.mark!));
  const out = b.scad.union([m, ...Array.from({ length: n }, (_, i) => b.scad.cylinder(2.4, 0.75).translate([bb.max[0] - 0.2, cy + (i - (n - 1) / 2) * 3, bb.min[2]]))]);
  return out.decompose().length === m.decompose().length ? out : m;
}

/** A piece added: local, as printed; world, where it sits in the design. */
function add(b: PieceBuild, name: string, color: number, local: Man, world: Man, turn?: Piece['turn'], move?: Pick<Piece, 'slide' | 'hinge'>) {
  // (the copies it's told apart on let go at once, as bake's)
  arena(b.w, () => {
    const { positions, supports, clean } = viewOf(b.w, world);
    // (its file turned to lie within the bed, a part that fits it only on the slant)
    const bedTurn = b.cut.turnOf(local);
    let f = stlOf.get(local);
    // (each file lying on the bed: a part modelled where it sits in the track (the blades on the bed's top, say) came in floating)
    if (!f || f.turn !== bedTurn) { f = { stl: stlBytes((local === world ? clean : local).getMesh(), true, bedTurn), turn: bedTurn }; stlOf.set(local, f); }
    b.pieces.push({ name, color, positions, stl: f.stl.slice(), ...(supports && { supports }), ...(turn && { turn }), ...move, ...(bedTurn && { bedTurn }) });
    b.volume += local.volume();
  }, () => []);
}

// Labels (name, label_*), engraved under the parts with a flat underside: the name, and the size, the gauge and,
// on a part cut from a bigger one, its number; where they don't fit, the number alone.
function labelled(b: PieceBuild, m0: Man, rts: Route[], size?: string, num?: string): Man {
  const o = b.o, m = b.mark ? marked(b, m0) : m0;
  if (!b.labelOn || !rts.length) return m;
  const no = o.labelParts !== false && num ? `#${num}` : undefined;
  // (the gauge: the piece's routes' own, mixed gauges; the design's where they differ among themselves)
  const gs = new Set(rts.map((rt) => rt.gauge)), ln = gs.size === 1 && rts[0].gauge !== undefined ? rts[0].gauge / 8 - 1 : b.gaugeStuds;
  const lines = labelLines(b.track.c.sleeperLen, o.labelText ?? '', [o.labelSize !== false ? size ?? '' : '', o.labelGauge ? `Ln${ln}` : '', no ?? ''], gs.size === 1 ? rts : rts.map(({ gauge: _g, ...rt }) => rt));
  const cut = labelCut(b.scad, m, rts, lines, no);
  return cut ? b.scad.difference(m, [cut]) : m;
}

/** rebuild: (sleepers) the piece built again with the bed kept across the cut lines (crossing.ts bedAt). */
function addTrack(b: PieceBuild, name: string, world0: Man, pieceRoutes: Route[], size?: string, rebuild?: (lines: CutLine[]) => Man) {
  const { w, scad, o, track, cut: cx } = b, bp = cx.bp;
  let world = world0;
  const bb = world.boundingBox(), r: Rect = [bb.min[0], bb.min[1], bb.max[0], bb.max[1]];
  if (!bp && cx.fitsBed(world)) { const lm = labelled(b, world, pieceRoutes, size); return add(b, name, TRACK_COLOR, lm, lm); }
  // too big for the print bed (or at the baseplate edges): cut across the
  // track (tiles.ts planCuts), each part joined to the next like LEGO track
  const plan = planCuts(r, o.printBedX, o.printBedY, bp, (o.baseplateX ?? 0) * 8, (o.baseplateY ?? 0) * 8, cx.pointsAvoid, pieceRoutes, cx.bandHalf, cx.jointRoom, track.c.railOffset, cx.crossings);
  // (baseplate edges always joined: two or more axles across, as far apart as they go, where the bed's thick enough for them (on ballast), else peg and clip; the cuts to fit the bed as chosen)
  // (with Parts join with: Straight cuts, the baseplate edges too)
  const lj = (v: number) => (o.joint === 'butt' ? {} : plan.edges?.has(v) ? { joint: 'axle' as const } : plan.combs?.has(v) ? { comb: true } : {});
  const lines: CutLine[] = [...plan.xs.map((x): CutLine => ({ p: [x, 0], d: [0, 1], ...lj(x) })), ...plan.ys.map((y): CutLine => ({ p: [0, y], d: [1, 0], ...lj(y) }))];
  b.prog.steps++; b.prog.step(plan.why === 'bed' ? `Cutting ${name} to fit the print bed` : `Cutting ${name} at the baseplate edges`);
  if (rebuild && lines.length) world = rebuild(lines);
  const cut = cached(`cut:${bp}:${o.joint}:${o.tongueRails ?? 'all'}:${JSON.stringify(lines)}:${JSON.stringify(pieceRoutes)}:${world.volume().toFixed(3)}`, () => arena(w, () => { const holes: Keep[] = [], taken: [number, number][] = []; return { cells: cutPiece(scad, track, world, pieceRoutes, lines, cx.join.joint, cx.join.flatRails, cx.noTongue, holes as [number, number, number][], cx.fitsBed, taken), holes, taken }; }, (r2) => r2.cells), true);
  const cells = cut.cells;
  const fitAll = cx.fitter(pieceRoutes, [...cut.holes], [...cut.taken]);
  const all = cached(`fit:${o.printBedX}x${o.printBedY}:${bp}:${o.joint}:${o.tongueRails ?? 'all'}:${JSON.stringify(lines)}:${JSON.stringify(pieceRoutes)}:${world.volume().toFixed(3)}`, () => {
    // (and each part gripping along its cut edges too)
    const parts0 = cells.flatMap((m) => arena(w, () => fitAll(m), (r2) => r2)); // (each cell's leftovers freed as it goes)
    if (parts0.length < 2) return parts0;
    const parts = cx.whole(world, parts0);
    const gp = routePose(pieceRoutes[0], 0), bottom = world.boundingBox().min[2] + 0.02;
    return parts.map((m) => arena(w, () => (b.alongTrack ? m : edgeGrip(scad, track, m, gp, bottom)), (r2) => [r2]));
  });
  all.forEach((m, k) => arena(w, () => { const lm = labelled(b, m, pieceRoutes, all.length > 1 ? undefined : size, all.length > 1 ? `${k + 1}` : undefined); add(b, all.length > 1 ? `${name}${plan.why === 'baseplate' ? '-plate' : ''}${k + 1}` : name, TRACK_COLOR, lm, lm); }, () => []));
  if (all.some((m) => !cx.fitsBed(m))) b.bedWarnings.add(`some parts don't fit the ${o.printBedX} x ${o.printBedY} print bed: there's nowhere left to cut them`);
  for (const m of all) if (!cx.fitsBed(m)) bedIssue(b, m.boundingBox(), cx.tightOf(m));
}

const place = (m: Man, P: Pose) => T(R(m, [0, 0, P[2]]), [P[0], P[1], 0]);

// ---- (prototype) layered: the piece in two layers stacked from the top ----
// The lower layer (the ballast's bottom, with the pockets the moving parts
// sit in) and the deck over it (the bed, rails and frogs, slotted for the
// blades): the moving parts are dropped in and the deck laid on, held by
// studs on the lower layer in sockets under the deck, as LEGO plates stack.
/**
 * Where the lid goes over a points set, in its frame: the bed across all its
 * routes from before the toe to past the heels, and the throw's arm out to
 * the stud line past the lever, on whole studs.
 */
function lidRects(track: Track, frameRoutes: Route[], v: { toeY: number; pointsEndY: number; throwDir: number; leverX: number; throwY: number; throwStockX: number }) {
  const y0 = Math.floor((v.toeY - 16) / 8) * 8, y1 = Math.ceil((v.pointsEndY + 12) / 8) * 8;
  let x0 = Infinity, x1 = -Infinity;
  for (const rt of frameRoutes) {
    const L = routeLength(rt), n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k <= n; k++) for (const off of [-track.c.sleeperLen / 2, track.c.sleeperLen / 2]) {
      const q = railPoint(rt, (L * k) / n, off);
      if (q[1] >= y0 && q[1] <= y1) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); }
    }
  }
  const xOut = v.throwDir * Math.ceil((v.throwDir * (v.leverX + v.throwDir * 10)) / 8 - 1e-6) * 8;
  return [
    [Math.floor(x0 / 8) * 8, Math.ceil(x1 / 8) * 8, Math.max(8, y0), y1],
    [Math.min(v.throwStockX, xOut), Math.max(v.throwStockX, xOut), v.throwY - 12, v.throwY + 12],
  ] as [number, number, number, number][];
}
/**
 * The piece and a lid over each points set (lidRects, in frame P): the lid
 * is everything above the moving parts there (bed, rails, frog, slotted for
 * the blades; the arm's top with the lever's ears), the piece keeps the
 * floor, the points' pockets and the throw's slot under it. Studs on the
 * piece in sockets under the lid hold it on.
 */
function layerSplit(scad: Scad, track: Track, params: SwitchParams, whole: Man, lids: { P: Pose; rects: [number, number, number, number][] }[], gp: Pose) {
  const zs = switchGlobals(params).cavityTop;
  const prisms = lids.flatMap(({ P, rects }) => rects.map((r) => place(T(scad.cube([r[1] - r[0], r[3] - r[2], 100 - zs]), [r[0], r[2], zs]), P)));
  const region = scad.union(prisms);
  let lower = scad.difference(whole, [region]), deck = scad.intersection(whole, region);
  // the studs that hold it: on a 2-stud lattice, where both are solid round them (and the lid thick enough over them)
  const bb = deck.boundingBox(), sl = lower.slice(zs - 0.3), d0 = deck.slice(zs + 0.3), d1 = deck.slice(zs + 2.3);
  const hd = (gp[2] * Math.PI) / 180, studs: Man[] = [], socks: Man[] = [];
  const reach = Math.ceil((Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) + Math.hypot(bb.min[0] - gp[0], bb.min[1] - gp[1])) / 8) + 2;
  const solid = (cs: typeof sl, q: [number, number]) => scad.w.CrossSection.circle(3.4, 16).translate(q).subtract(cs).area() < 0.01;
  for (let i = -reach; i <= reach; i += 2) for (let j = -reach; j <= reach; j += 2) {
    const lx = 4 + i * 8, ly = 4 + j * 8, q: [number, number] = [gp[0] + lx * Math.cos(hd) - ly * Math.sin(hd), gp[1] + lx * Math.sin(hd) + ly * Math.cos(hd)];
    if (q[0] < bb.min[0] || q[0] > bb.max[0] || q[1] < bb.min[1] || q[1] > bb.max[1]) continue;
    if (!(solid(sl, q) && solid(d0, q) && solid(d1, q))) continue;
    studs.push(T(track.stud(), [q[0], q[1], zs - 0.01]));
    // (square sockets under the lid: a round one grips a stud too hard to lift the lid off again)
    const sw2 = track.c.studSocketW;
    socks.push(T(R(scad.cube([sw2, sw2, track.o.studH + 0.2]), [0, 0, gp[2]]), [q[0] - (sw2 / 2) * (Math.cos(hd) - Math.sin(hd)), q[1] - (sw2 / 2) * (Math.sin(hd) + Math.cos(hd)), zs - 0.01]));
  }
  if (studs.length) { lower = scad.union([lower, ...studs]); deck = scad.difference(deck, socks); }
  return { lower, deck };
}

// (tiles: tiled)
const MARGIN = 72; // (past a cropped end's effects on the bed and underside, true)
const BLOCK = 450; // (built together: about as much as builds quickly)

// In separate pieces with ordinary track ends, the plate-style way (sections.ts):
// each section built from its own pieces of track, its cut ends given
// standard end connectors.
function sectioned(b: PieceBuild, name: string, all: Route[], checks: CheckRail[], splits: SplitParts[], solSplits: Split[], copt: typeof CROSSING_DEFAULTS, key: string) {
  const { w, scad, o, track, cut: cx } = b, { bp, bandHalf, join, fitsBed, noTongue } = cx;
  // (the longest plain piece: as long as goes on the bed beside the track's width, corner to corner if that's longer)
  const room = longestFit(2 * bandHalf, o.printBedX, o.printBedY) - 4, exact = Math.max(0, Math.round(o.pieceLengthStuds ?? 16)) * 8;
  // (pieces of the length set, if they fit the bed; else as long as fits)
  const ex = exact > 0 && exact <= room ? exact : 0;
  const plates = bp ? { size: bp, x: (o.baseplateX ?? 0) * 8, y: (o.baseplateY ?? 0) * 8 } : undefined;
  // (bought pieces on: plain stretches cut where LEGO's straights, its R40 curves and BrickTracks' curves would join,
  // so those pieces are them; on ballast, a curve's ballast printed alone under it)
  // ('lego-only': LEGO's straights and R40 curves bought, BrickTracks' radii printed)
  // (bought: only track at LEGO's gauge, 4 studs, the design's or a route's own)
  const isStd = (rt: Route) => (rt.gauge ?? track.c.trackGauge) === 40;
  const bought = (o.legoTrack ?? 'lego') !== 'print' && all.some(isStd), legoOnly = o.legoTrack === 'lego-only';
  const std = bought ? (legoOnly ? new Map([[40 * 8, STD_CURVES.get(40 * 8)!]]) : STD_CURVES) : undefined;
  const stdStraights = bought && !legoOnly ? BT_STRAIGHTS.map(([l]) => l) : [], lead = bought && !legoOnly ? BT_LEAD : 0;
  const tables = b.tables, seamOf = tables.length ? (q: [number, number]) => tableAt(tables, q) : undefined;
  // (the longest piece of a segment that goes on the bed, turned any way, a millimetre to spare: by its radius and its base's reach)
  const fitLens = new Map<string, number>();
  const pieceFit = (sg: Route['segments'][number], half: number) => {
    const r = sg.kind === 'arc' ? sg.radius : 0, k = `${r}:${half}`;
    if (!fitLens.has(k)) fitLens.set(k, longestTrack(r, half, Math.min(half, track.c.sleeperLen / 2), END_REACH + 0.5, o.printBedX, o.printBedY) - 1);
    return fitLens.get(k)!;
  };
  const plan = cached(`secplan:${key}:${room}:${o.printBedX}x${o.printBedY}:${bandHalf}:${ex}:${JSON.stringify(plates)}:${JSON.stringify(std && [...std])}:${stdStraights}:${lead}:${JSON.stringify(tables)}`, () => planSections(all, solSplits, cx.bandHalf0, room, 40, ex, plates, std, stdStraights, lead, seamOf, track.c.trackGauge, pieceFit));
  const st = (q: [number, number]) => `${(q[0] / 8).toFixed(0)}, ${(q[1] / 8).toFixed(0)}`;
  for (const sm of plan.seams) b.bedWarnings.add(sm.kind === 'blocked' ? `a table's seam crosses points or a crossing at ${st(sm.at)} (studs): the track isn't cut there (move the table's edge)`
    : `a table's seam at ${st(sm.at)} (studs) isn't where two track pieces join: the piece there is printed in two (move the table's edge to a joint to buy it)`);
  const gridPose = b.gridPose;
  b.prog.steps += plan.sections.length;
  // (its sections' numbers: on from the ones before it)
  const base = b.num.sec;
  b.num.sec += plan.sections.length;
  /**
   * Where to cut a section of two tracks side by side (a crossover) across its middle: on each track at the joint of
   * the plain track beside it nearest the middle, stepping along between the tracks where those two aren't level
   * (a stud-grid path for splitOnPath); with sleepers, the lines of its runs, for the bed kept across them. Only for
   * tracks square to the grid; undefined when it's not two tracks wide.
   */
  const middleCut = (m: Man, sec: number[]) => {
    const h = routePose(all[sec.length ? plan.pieces[sec[0]][0] : 0], 0)[2], q = ((h % 90) + 90) % 90;
    if (Math.min(q, 90 - q) > 0.5) return undefined;
    // (along: the axis the tracks run on; the cut runs across them, along the other)
    const al = Math.round(Math.abs(Math.sin((h * Math.PI) / 180))) === 1 ? 0 : 1, ac = 1 - al, axis = al === 1 ? 1 : 0;
    const bb = m.boundingBox(), lo = [bb.min[0], bb.min[1]], hi = [bb.max[0], bb.max[1]];
    if (hi[ac] - lo[ac] < 2 * track.c.sleeperLen) return undefined;
    const cMid = Math.round((lo[ac] + hi[ac]) / 2 / 8) * 8, aMid = (lo[al] + hi[al]) / 2;
    // (the plain track's joints beside it, each side of the middle)
    const joints = plan.pieces.flatMap(([pi, a, b2], k) => (sec.includes(k) ? [] : [a, b2].map((sv) => routePose(all[pi], sv))))
      .filter((jp) => jp[al] > lo[al] + 48 && jp[al] < hi[al] - 48 && jp[ac] > lo[ac] - 8 && jp[ac] < hi[ac] + 8);
    const nearest = (side: number) => joints.filter((jp) => Math.sign(jp[ac] - cMid) === side).map((jp) => jp[al]).sort((u, v) => Math.abs(u - aMid) - Math.abs(v - aMid))[0];
    const j0 = nearest(-1) ?? nearest(1) ?? Math.round(aMid / 8) * 8, j1 = nearest(1) ?? j0;
    // (the path in (across, along), a stud a step: from beyond one side at j0 to the middle, along to j1, on beyond the other)
    const pts: [number, number][] = [];
    for (let c2 = cMid - Math.ceil((cMid - lo[ac] + 16) / 8) * 8; c2 < cMid; c2 += 8) pts.push([c2, j0]);
    const n = Math.round((j1 - j0) / 8);
    for (let k = 0; k <= Math.abs(n); k++) pts.push([cMid, j0 + Math.sign(n) * 8 * k]);
    for (let c2 = cMid + 8; c2 <= hi[ac] + 16; c2 += 8) pts.push([c2, j0 + 8 * n]);
    const path = pts.map(([c2, a2]): [number, number] => (ac === 0 ? [c2, a2] : [a2, c2]));
    // (each straight run of the path, for the bed kept across it)
    const bedAt: { p: [number, number]; d: [number, number]; len: number }[] = [];
    for (let k = 1; k < path.length; k++) {
      const d: [number, number] = [Math.sign(path[k][0] - path[k - 1][0]), Math.sign(path[k][1] - path[k - 1][1])], last = bedAt[bedAt.length - 1];
      if (last && last.d[0] === d[0] && last.d[1] === d[1]) last.len += 8; else bedAt.push({ p: path[k - 1], d, len: 8 });
    }
    return { path, axis: axis as 0 | 1, bedAt };
  };
  /**
   * Where to cut a section of three tracks or more side by side (a throat) in two down its middle: a stud-grid path
   * along the tracks (pathSplit's, clear of the points), near the middle across them; with sleepers, its runs, for the
   * bed kept across them. Only for tracks square to the grid; undefined when it's narrower or there's no such path.
   */
  const lengthwiseCut = (m: Man, rts: Route[]) => {
    const h = routePose(rts[0], 0)[2], q = ((h % 90) + 90) % 90;
    if (Math.min(q, 90 - q) > 0.5) return undefined;
    const al = Math.round(Math.abs(Math.sin((h * Math.PI) / 180))) === 1 ? 0 : 1, ac = 1 - al;
    const bb = m.boundingBox(), lo = [bb.min[0], bb.min[1]], hi = [bb.max[0], bb.max[1]];
    if (hi[ac] - lo[ac] < 2 * track.c.sleeperLen + 24 * 8) return undefined;
    const cMid = (lo[ac] + hi[ac]) / 2, axis = (ac === 0 ? 0 : 1) as 0 | 1;
    const got = pathSplit(scad, m, rts, track.c.railOffset, cx.pointsAvoid, axis, cMid, { join, window: [cMid - 48, cMid + 48] });
    if (!got || got.parts.length < 2) return undefined;
    const bedAt: { p: [number, number]; d: [number, number]; len: number }[] = got.runs.map((r) => ({ p: r.p, d: r.d, len: r.len }));
    return { path: got.path, axis, bedAt };
  };
  plan.sections.forEach((sec, si) => {
    b.prog.step(`Building ${name}: section ${si + 1} of ${plan.sections.length}`);
    const ps = sec.map((k) => plan.pieces[k]);
    const rts = ps.map(([i, a, b2]) => (a === 0 && b2 === routeLength(all[i]) ? all[i] : { ...subRoute(all[i], a, b2), throwSide: all[i].throwSide }));
    const pieceOf = (i: number, s: number) => ps.findIndex(([pi, a, b2]) => pi === i && s >= a - 1e-6 && s <= b2 + 1e-6);
    const cChecks = checks.flatMap((cr) => ps.flatMap(([pi, a, b2], k) => {
      if (pi !== cr.route) return [];
      const s0 = Math.max(cr.s0, a), s1 = Math.min(cr.s1, b2);
      return s1 > s0 ? [{ ...cr, route: k, s0: s0 - a, s1: s1 - a }] : [];
    }));
    // its points: those whose toe is on one of its pieces
    const mine = splits.flatMap((sp) => {
      const ss = solSplits[sp.src], toeS = ss.merge ? ss.spans[0][1] : ss.spans[0][0];
      if (pieceOf(ss.routes[0], toeS) < 0) return [];
      const inner = sp.inner.map((e) => {
        const [j, end] = e.split(':'), jj = Number(j);
        const pj = end === 'start' ? pieceOf(jj, 0) : pieceOf(jj, routeLength(all[jj]));
        return pj >= 0 ? `${pj}:${end}` : '-';
      });
      return [{ ...sp, inner, // (a blade's cut on every piece of its route here: the rail it replaces can be on a later one than the route's first)
        bladeCuts: sp.bladeCuts.flatMap(([i, m]) => ps.flatMap(([pi], k) => (pi === i ? [[k, m] as [number, Man]] : []))) }];
    });
    const secInner = b.dropInner(rts);
    // (each of its pieces a bought track piece, if it is one, ordinary ends both sides: a 16-stud straight LEGO's (53401),
    // BrickTracks' 1/2, 1/4 and 1/10 straights, LEGO's R40 curves and BrickTracks' R56 to R120 ones; none crossing another)
    const plainSec = bought && !mine.length && !cChecks.length && !secInner.size
      && !rts.some((rt) => [routePose(rt, 0), routePose(rt, routeLength(rt))].some((e) => b.bufs.some((bq) => Math.hypot(bq[0] - e[0], bq[1] - e[1]) < 1)));
    const each = plainSec ? rts.map((rt) => (isStd(rt) ? stdPiece(rt, legoOnly) : undefined)) : [];
    const allBought = plainSec && each.every((e) => !!e) && !piecesCross(rts);
    const one = allBought && rts.length === 1 ? each[0]! : undefined, sg0 = rts[0].segments[0];
    // (one piece, and its ballast bought too: a LEGO straight on LEGO plates (6 x 16 and two 2 x 16, two more 6 x 16 for
    // the buddy layer); a BrickTracks curve on a flat underside on BrickTracks' own ballast and buddy (theirs float on the
    // studs, they don't grip them))
    // (track only, a LEGO straight is shown as bought, as the curves are: its own sleepers and underside)
    const whole = !one ? undefined : one[0].part === '53401' && o.ballast !== 'none' ? legoStraight(o.ballast)
      : sg0.kind === 'arc' && o.ballast !== 'none' && o.bottomStyle === 'float' && one[0].shop === 'bricktracks' ? [...one, ...brickTracksBallast(one, o.ballast)] : undefined;
    // (else each piece bought, as LEGO and BrickTracks make them (their sleepers), and on ballast its ballast printed, the
    // section's in one, with a seat each piece drops into)
    const seated = allBought && !whole && o.ballast !== 'none', apart = allBought && !whole;
    // (keyed by what it's built from, as the tiles are)
    const sb = routesBox(rts, bandHalf + 8);
    // (a section many print beds big, a whole yard's throat: built in blocks as a big layout cut to fill the bed is,
    // not as one piece: one piece of it took the kernel minutes to cut, and ran it out of memory)
    if ((sb[2] - sb[0]) * (sb[3] - sb[1]) > 8 * o.printBedX * o.printBedY && tiled(b, name, rts, cChecks, mine, copt, true)) return;
    const zs = cx.zones.filter((z) => z.box[2] >= sb[0] && z.box[0] <= sb[2] && z.box[3] >= sb[1] && z.box[1] <= sb[3]).map((z) => [z.rt.id, z.s0, z.s1, z.box]);
    const sk = `sec:${JSON.stringify({ rts, cChecks, m: mine.map((x) => [x.key, x.inner, x.bladeCuts.map(([i]) => i)]), copt, g: b.grooveCuts.length ? b.grooveEdits : 0, di: [...secInner],
      gp: gridPose, bp, bxy: [o.baseplateX, o.baseplateY], joint: o.joint, ...(apart && { seat: o.trackFitTol ?? 0.2, seated, bb: o.boughtBallast }), ...(o.ballast !== 'none' && (b.boughtSw.length || seated) && { sw: groundKey(b, routesBox(rts, bandHalf + 64), seated) }), bed: [o.printBedX, o.printBedY], zs, ...(b.boughtSw.length > 0 && { pt: partingsNear(b, sb) }), ...(b.labelOn && { lab: [o.labelText, o.labelSize, o.labelGauge, o.labelParts, base + si + 1] }) })}`;
    let part: { ms: (Baked & { id?: string; lego?: LegoPart[]; seats?: Pose[] })[]; grips: [number, number][] };
    const cost = rts.reduce((t, rt) => t + routeLength(rt), 0) + 400 * mine.length;
    try { part = b.job(sk, cost, () => arena(w, () => {
      const grips: [number, number][] = [];
      const cuts = b.grooveCuts.filter((m) => { const bb = m.boundingBox(); return rts.some((rt) => { const b2 = routesBox([rt], bandHalf + 8); return bb.max[0] >= b2[0] && bb.min[0] <= b2[2] && bb.max[1] >= b2[1] && bb.min[1] <= b2[3]; }); });
      const buildBody = (bedAt?: { p: [number, number]; d: [number, number]; len?: number }[]) => { grips.length = 0; return networkBody(scad, rts, { crossings: [], grooves: [], splits: [], checkRails: cChecks }, copt, mine, grips, { cuts, gridPose, innerEnds: secInner, ...(bedAt && { bedAt }) }); };
      // (bought pieces: each as bought, track only (LEGO's sleepers, as both make theirs); on ballast, the section's ballast
      // printed alone, seated for them all, cut for the bed if it has to be)
      if (apart) {
        const none = { crossings: [], grooves: [], splits: [], checkRails: [] }, tol = o.trackFitTol ?? 0.2;
        // (its underside its own, lined up with the piece, each sleeper hollow as a plate: not the baseplate's grid's
        // sockets, which a bought curve hasn't; studs under it go up into a sleeper square to them (Piece.seats))
        const asBought = { ...copt, sleepers: 'sleepers' as const, sleeperGapStuds: 2, sleeperWidthStuds: 2, ballast: 'none' as const, ballastOnly: undefined, undersideGrid: 'track' as const };
        const trs = rts.map((rt) => networkBody(scad, [rt], none, asBought, [], grips, { gridPose }));
        // (track only: where studs under it go up into it (raised track's beams'): its sleepers, and its ends)
        const seatsOf = (rt: Route) => [0, ...ownSleeperSpots(rt, false, false, 2, 2), routeLength(rt)].map((v) => routePose(rt, v));
        const ms: (Baked & { id?: string; lego?: LegoPart[]; seats?: Pose[] })[] = trs.map((m, k) => ({ ...bake(b, m), lego: each[k]!, ...(!seated && { seats: seatsOf(rts[k]) }) }));
        // (each piece's ballast a part of its own, whole, as the piece is: clear of every piece's seat, and where two
        // pieces' ballast would overlap (beside a switch), the first's; clear of a bought switch's ballast too)
        if (seated && o.boughtBallast === 'together') {
          // (or the section's in one, cut for the bed and at the tables' seams)
          const seat = scad.union(trs.map((m) => trackSeat(scad, m, tol)));
          // (clear of a bought switch's ballast beside it, a part of its own, but under its own track's sleepers)
          const bal = yielded(b, crossingPiece(scad, rts, { ...copt, sleepers: 'sleepers', sleeperGapStuds: 2, sleeperWidthStuds: 2, ballastOnly: tol, supports: false }, none, grips, { gridPose, innerEnds: secInner, seat }), switchKeepOut(b, routesBox(rts, bandHalf + 64)));
          const bals = byTables(b, bal).flatMap((m) => (fitsBed(m) ? [m] : cx.whole(m, cx.bedCut(flat(w, m), rts))));
          const kept = bals.filter((m) => m.numTri() > 0), id = (k: number) => (kept.length > 1 ? `${base + si + 1}-${k + 1}` : `${base + si + 1}`);
          kept.forEach((m, k) => ms.push({ ...bake(b, labelled(b, m, rts, kept.length > 1 || rts.length > 1 ? undefined : sizeOf(rts), id(k))), ...(b.labelOn && { id: id(k) }) }));
        } else if (seated) {
          const seat = scad.union(trs.map((m) => trackSeat(scad, m, tol)));
          // (in plan, cut straight down: cut by the other's solid, what was left of this one under the other's hollow
          // underside hooked the two together. Under its own sleepers it's this piece's whatever else reaches there
          // (trackBeds); else an earlier piece's, or a bought switch's)
          // (other track's: not the routes its own pieces are lengths of, whose band the same width over, sampled its
          // own way, left slivers along the piece's sleepers' ends)
          // (and where two tracks' sleepers' ground is the same ground, close beside each other on from a switch: the
          // route's that comes first)
          const routeOf = (p: Route) => b.trackRoutes.findIndex((rt) => { const q = routePose(p, routeLength(p) / 2), at = routePose(rt, routeSOf(rt, [q[0], q[1]])); return Math.hypot(at[0] - q[0], at[1] - q[1]) < 0.5; });
          const sbox = routesBox(rts, bandHalf + 64), keep = switchKeepOut(b, sbox);
          const bedOf = (rt: Route) => { const hwBed = sleeperLenOf(rt, track.c.sleeperLen) / 2 + tol, L = routeLength(rt), n2 = Math.max(2, Math.ceil(L / 4)), side = (off: number) => Array.from({ length: n2 + 1 }, (_, k) => railPoint(rt, (L * k) / n2, off)); return scad.polygon([...side(-hwBed), ...side(hwBed).reverse()]); };
          const done: CS[] = [], doneBeds: CS[] = [];
          rts.forEach((rt, k) => {
            const own = crossingPiece(scad, [rt], { ...copt, sleepers: 'sleepers', sleeperGapStuds: 2, sleeperWidthStuds: 2, ballastOnly: tol, supports: false }, none, grips, { gridPose, seat });
            const ri = routeOf(rt), first = trackBeds(b, sbox, (r2) => b.trackRoutes.indexOf(r2) >= ri), later = trackBeds(b, sbox, (r2) => b.trackRoutes.indexOf(r2) <= ri);
            const bed = bedOf(rt), others = w.CrossSection.union([...done, ...(keep ? [keep] : []), ...(later ? [later] : [])]).subtract(bed);
            const m = yielded(b, own, w.CrossSection.union([others, ...doneBeds, ...(first ? [first] : [])]));
            done.push(own.project()); doneBeds.push(bed);
            const id = rts.length > 1 ? `${base + si + 1}-${k + 1}` : `${base + si + 1}`;
            // (one part: what's cut off it where it meets the next piece's, slivers, left out)
            const comps = m.decompose().sort((x, y) => y.volume() - x.volume()), big = comps[0]?.volume() ?? 0;
            const part = scad.union(comps.filter((x) => x.volume() > 0.05 * big));
            if (big > 0) ms.push({ ...bake(b, labelled(b, part, [rt], sizeOf([rt]), id)), ...(b.labelOn && { id }) });
          });
        }
        return { ms, grips };
      }
      // (each step's leftovers let go as it's done, only what the next needs kept: a crossover on ballast, 128 studs
      // long, kept some thirty copies of itself to the job's end, 4 GB of them, all the kernel has)
      const step = <T extends Man | Man[]>(f: () => T): T => arena(w, f, (r) => (Array.isArray(r) ? r : [r]));
      let body = step(() => buildBody());
      // (on ballast, its ballast clear of a bought switch's beside it, which is a part of its own: up to the sleepers' top)
      if (o.ballast !== 'none' && b.boughtSw.length) {
        const whole0 = body;
        body = step(() => yielded(b, whole0, switchKeepOut(b, routesBox(rts, bandHalf + 64)), PLATE_H + 0.01));
      }
      if (body.numTri() === 0) return { ms: [], grips };
      // (and where it crosses a baseplate edge, cut there with peg and clip: a plain piece of one track already ends at
      // the edges it crosses, planSections)
      let parts2 = [body];
      // (where this section's cuts so far put rail-end tongue joints: no later cut puts one near (cutter.ts jointsNear))
      const taken: [number, number][] = [];
      if (bp && (mine.length || rts.length > 1)) {
        const bb = body.boundingBox(), ox = (o.baseplateX ?? 0) * 8, oy = (o.baseplateY ?? 0) * 8, lines: CutLine[] = [];
        // (not within two studs of its edge: an edge on a baseplate's cut off the track ends' tongues as parts of their own)
        // (joined as Parts join with says)
        for (let x = ox + Math.ceil((bb.min[0] + 16 - ox) / bp) * bp; x < bb.max[0] - 16; x += bp) lines.push({ p: [x, 0], d: [0, 1], joint: join.joint });
        for (let y = oy + Math.ceil((bb.min[1] + 16 - oy) / bp) * bp; y < bb.max[1] - 16; y += bp) lines.push({ p: [0, y], d: [1, 0], joint: join.joint });
        if (lines.length) { const bottom = body.boundingBox().min[2] + 0.02; parts2 = step(() => cx.whole(body, step(() => cutPiece(scad, track, body, rts, lines, join.joint, join.flatRails, noTongue, undefined, fitsBed, taken))).map((m) => (b.alongTrack ? m : edgeGrip(scad, track, m, gridPose, bottom)))); }
      }
      // (a section still too big for the bed: points, frogs and crossings stay whole, so there was no ordinary track end
      // to cut at. A crossover is cut across its middle first, each side its own switch (middleCut); then any part
      // still too big as the parts filling the bed are (bedCut))
      if (!bp && !fitsBed(body)) {
        // (wider than a crossover, a throat fanning out to three tracks or more: cut in two down its middle, along the
        // tracks, as plate-style monster switches are; a crossover across its middle)
        const whole0 = body, mc = arena(w, () => lengthwiseCut(whole0, rts) ?? middleCut(whole0, sec), () => []);
        if (mc && b.sleepered) body = step(() => buildBody(mc.bedAt));
        // (each half a solid of its own (kernel.ts flat): cut again with its record of what it was cut from, a half of a
        // big piece took many minutes)
        const whole1 = body, halves = mc ? step(() => { const sp = splitOnPath(scad, whole1, rts, mc.path, mc.axis, join); taken.push(...sp.tongueAt); return sp.parts.map((h) => flat(w, h)); }) : [body];
        const bottom = body.boundingBox().min[2] + 0.02;
        parts2 = step(() => cx.whole(whole1, halves.flatMap((m) => step(() => cx.bedCut(m, rts, taken)))).map((m) => (b.alongTrack ? m : edgeGrip(scad, track, m, gridPose, bottom))));
      } else if (parts2.some((m) => !fitsBed(m))) {
        // (cut at the baseplate edges, and a part still too big for the bed: cut as the parts filling the bed are)
        const bottom = body.boundingBox().min[2] + 0.02;
        parts2 = parts2.flatMap((m) => (fitsBed(m) ? [m] : step(() => cx.whole(m, step(() => cx.bedCut(flat(w, m), rts, taken))).map((m2) => (b.alongTrack ? m2 : edgeGrip(scad, track, m2, gridPose, bottom))))));
      }
      // (the track on from each far end of a bought switch a part of its own: partedAtSwitches)
      // (pieces of it that don't touch, each a part of its own: a file held two or three loose ones (past a three-way's frogs, the middle track and each branch's end))
      const kept = parts2.filter((m) => m.numTri() > 0).flatMap((m) => partedAtSwitches(b, m)).flatMap((m) => cx.bodies(m, 600)), id = (k: number) => (kept.length > 1 ? `${base + si + 1}-${k + 1}` : `${base + si + 1}`);
      return { ms: kept.map((m, k) => arena(w, () => ({ ...bake(b, labelled(b, m, rts, kept.length > 1 ? undefined : sizeOf(rts), id(k))), ...(b.labelOn && { id: id(k) }) }), () => [])), grips };
    }, () => []), { ms: [], grips: [] }); } catch (err) {
      if (kernelBroke(err)) throw err;
      b.bedWarnings.add(`section ${si + 1} of ${name} failed to build: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    b.overlay.grips.push(...part.grips);
    for (const b2 of part.ms) {
      // (bought pieces' ballast: printed, named for the track it's under)
      const lego = apart ? b2.lego : whole;
      const lift = liftOf(rts, b2.positions);
      b.pieces.push({ name: lego ? `track-bought-${lego[0].part.replace(/\s+/g, '')}-${++b.num.part}` : seated ? `${name}${b2.id ?? ++b.num.part}-ballast` : b2.id ? `${name}${b2.id}` : `${name}${++b.num.part}`, color: lego ? boughtColor(lego) : TRACK_COLOR, positions: b2.positions.slice(), stl: b2.stl.slice(), ...(b2.supports && !lego && { supports: b2.supports.slice() }), ...(lego && { lego }), ...(lift && { lift }), ...(apart && b2.seats && { seats: b2.seats }), ...(b2.turn && !lego && { bedTurn: b2.turn }) });
      const bought = !!lego;
      if (!bought) b.volume += b2.volume;
      if (!b2.fits) b.bedWarnings.add(`some sections don't fit the ${o.printBedX} x ${o.printBedY} print bed: there's nowhere left to cut them`);
    }
  });
}

// A big piece in tiles (src/app/tiles.ts): each cell of the cuts built
// from the track near it only, cut to the cell with its joints. false: it
// needs no cutting (build it whole).
function tiled(b: PieceBuild, name: string, all: Route[], checks: CheckRail[], splits: SplitParts[], copt: typeof CROSSING_DEFAULTS, big = false) {
  const { w, scad, o, track, cut: cx } = b, { join } = cx;
  let bx = routesBox(all, Math.max(...all.map((rt) => sleeperLenOf(rt, track.c.sleeperLen))) / 2 + 24);
  for (const sp of splits) for (const m of sp.adds) { const bb = m.boundingBox(); bx = [Math.min(bx[0], bb.min[0]), Math.min(bx[1], bb.min[1]), Math.max(bx[2], bb.max[0]), Math.max(bx[3], bb.max[1])]; }
  const plan = planCuts(bx, o.printBedX, o.printBedY, cx.bp, (o.baseplateX ?? 0) * 8, (o.baseplateY ?? 0) * 8, cx.pointsAvoid, all, cx.bandHalf, cx.jointRoom, track.c.railOffset, cx.crossings);
  if (!plan.xs.length && !plan.ys.length) return false;
  // (only when it's big: in one build a piece is quicker, but a whole yard
  // runs the kernel out of memory)
  // (a section many beds big is tiled whatever its length: bought track cut into its pieces left a throat's section short
  // of it, built whole, and the kernel ran out of memory)
  if (!big && all.reduce((t, rt) => t + routeLength(rt), 0) < TILE_OVER) return false;
  const cs = tileBlocks(plan, bx, BLOCK).filter((R) => R[2] > bx[0] && R[0] < bx[2] && R[3] > bx[1] && R[1] < bx[3]);
  const gridPose = b.gridPose;
  const splitBoxes = splits.map((sp) => [...sp.adds, ...sp.cuts, sp.stock].map((m) => m.boundingBox()));
  b.prog.steps += cs.length;
  // (its blocks' numbers: on from the sections and blocks before it)
  const base = b.num.sec;
  b.num.sec += cs.length;
  const out: (Baked & { id?: string })[] = [];
  cs.forEach((R, ci) => {
    b.prog.step(`Building ${name}: part ${ci + 1} of ${cs.length}`);
    const cr = cropRoutes(all, R, MARGIN, checks);
    if (!cr.routes.length) return;
    // its cuts: those on and in the block, couplers along the block only
    // (so the blocks either side of an edge agree)
    const lines: CutLine[] = [
      ...plan.xs.filter((x) => x >= R[0] && x <= R[2]).map((x): CutLine => ({ p: [x, 0], d: [0, 1], span: [R[1], R[3]], ...(o.joint !== 'butt' && plan.edges?.has(x) ? { joint: 'axle' as const } : o.joint !== 'butt' && plan.combs?.has(x) ? { comb: true } : {}) })),
      ...plan.ys.filter((y) => y >= R[1] && y <= R[3]).map((y): CutLine => ({ p: [0, y], d: [1, 0], span: [R[0], R[2]], ...(o.joint !== 'butt' && plan.edges?.has(y) ? { joint: 'axle' as const } : o.joint !== 'butt' && plan.combs?.has(y) ? { comb: true } : {}) })),
    ];
    // the points near it, on the cropped routes
    const near = splits.flatMap((sp, k) => (splitBoxes[k].some((bb) => nearCell(bb, R, MARGIN)) ? [{ sp, k }] : []));
    const tileSplits = near.map(({ sp }): SplitParts => {
      const inner = sp.inner.map((e) => {
        const [j, end] = e.split(':'), kj = cr.map[Number(j)];
        const whole = kj >= 0 && (end === 'start' ? cr.ranges[kj][0] === 0 : cr.ranges[kj][1] === routeLength(all[Number(j)]));
        return whole ? `${kj}:${end}` : '-';
      });
      return { ...sp, inner, bladeCuts: sp.bladeCuts.filter(([i]) => cr.map[i] >= 0).map(([i, m]) => [cr.map[i], m] as [number, Man]) };
    });
    const tileCuts = b.grooveCuts.filter((m) => nearCell(m.boundingBox(), R, MARGIN)), tileInner = b.dropInner(cr.routes, cr.inner);
    // (on ballast, its ballast clear of a bought switch's beside it, as a section's)
    const kbox = [R[0] - MARGIN, R[1] - MARGIN, R[2] + MARGIN, R[3] + MARGIN], nearSw = o.ballast !== 'none' && b.boughtSw.length > 0;
    // (keyed by what it's built from, not the whole design: an edit rebuilds only the tiles near it (the points near
    // it by what each is made from, network.ts SplitParts key; where no rail-end tongue goes, near it))
    const zs = cx.zones.filter((z) => z.box[2] >= R[0] - MARGIN && z.box[0] <= R[2] + MARGIN && z.box[3] >= R[1] - MARGIN && z.box[1] <= R[3] + MARGIN).map((z) => [z.rt.id, z.s0, z.s1, z.box]);
    const tk = `tile:${JSON.stringify({ r: cr.routes, c: cr.checks, i: [...tileInner], R, lines, near: tileSplits.map((sp) => [sp.key, sp.inner, sp.bladeCuts.map(([i]) => i)]),
      copt, joint: o.joint, tongueRails: o.tongueRails, g: b.grooveCuts.length ? b.grooveEdits : 0, gp: gridPose, bed: [o.printBedX, o.printBedY], zs, ...(b.boughtSw.length > 0 && { pt: partingsNear(b, kbox) }), ...(nearSw && { sw: groundKey(b, kbox) }), ...(b.labelOn && { lab: [o.labelText, o.labelSize, o.labelGauge, o.labelParts, base + ci + 1] }) })}`;
    let part: { ms: (Baked & { id?: string; bought?: boolean })[]; grips: [number, number][] };
    // (how long it takes, about: its track, and points most of all)
    const cost = cr.routes.reduce((t, rt) => t + routeLength(rt), 0) + 400 * near.length;
    try { part = b.job(tk, cost, () => arena(w, () => {
      const grips: [number, number][] = [];
      // (each step's leftovers let go as it's done, as a section's)
      const step = <T extends Man | Man[]>(f: () => T): T => arena(w, f, (r) => (Array.isArray(r) ? r : [r]));
      const body0 = step(() => networkBody(scad, cr.routes, { crossings: [], grooves: [], splits: [], checkRails: cr.checks }, copt, tileSplits, grips, { cuts: tileCuts, innerEnds: tileInner, gridPose, ...(b.sleepered && { bedAt: lines }) }));
      const body = nearSw ? step(() => yielded(b, body0, switchKeepOut(b, kbox), PLATE_H + 0.01)) : body0;
      const holes: [number, number, number][] = [], taken: [number, number][] = [];
      const got = step(() => cutPiece(scad, track, body, cr.routes, lines, join.joint, join.flatRails, cx.noTongue, holes, cx.fitsBed, taken).filter((m) => {
        const bb = m.boundingBox(), cx2 = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
        return cx2 > R[0] && cx2 < R[2] && cy > R[1] && cy < R[3];
      }));
      // (baked: the block's solids are all let go, a whole yard's would fill the kernel's memory)
      const bottom = body.boundingBox().min[2] + 0.02;
      // (and a part still too big, or in pieces that don't touch, fitted as addTrack's are: the straight cuts can't
      // always get round a curvy track without running along it)
      // (and the track on from each far end of a bought switch a part of its own: partedAtSwitches)
      const fit = cx.fitter(cr.routes, holes, taken), parts = step(() => cx.whole(body, got.filter((m) => m.numTri() > 0).flatMap((m) => step(() => fit(m))))).flatMap((m) => partedAtSwitches(b, m));
      return { ms: parts.map((m, k) => arena(w, () => ({ ...bake(b, labelled(b, b.alongTrack ? m : edgeGrip(scad, track, m, gridPose, bottom), cr.routes, undefined, `${base + ci + 1}-${k + 1}`)), ...(b.labelOn && { id: `${base + ci + 1}-${k + 1}` }) }), () => [])),
        grips: grips.filter((q) => q[0] > R[0] && q[0] <= R[2] && q[1] > R[1] && q[1] <= R[3]) };
    }, () => []), { ms: [], grips: [] }); } catch (err) {
      if (kernelBroke(err)) throw err; // (the kernel's broken now: no use carrying on)
      b.bedWarnings.add(`part ${ci + 1} of ${name} (x ${Math.max(R[0], bx[0]).toFixed(0)} to ${Math.min(R[2], bx[2]).toFixed(0)}, y ${Math.max(R[1], bx[1]).toFixed(0)} to ${Math.min(R[3], bx[3]).toFixed(0)}) failed to build: ${err instanceof Error ? err.message : `kernel error ${String(err)}`}`);
      return;
    }
    b.overlay.grips.push(...part.grips);
    out.push(...part.ms);
  });
  for (const b2 of out) { b.pieces.push({ name: b2.id && (out.length > 1 || base > 0) ? `${name}${b2.id}` : out.length > 1 || b.num.part > 0 ? `${name}${++b.num.part}` : name, color: TRACK_COLOR, positions: b2.positions.slice(), stl: b2.stl.slice(), ...(b2.supports && { supports: b2.supports.slice() }), ...(b2.turn && { bedTurn: b2.turn }) }); b.volume += b2.volume; }
  for (const b2 of out) if (!b2.fits) bedIssue(b, b2.box, b2.tight);
  if (out.some((b2) => !b2.fits)) b.bedWarnings.add(plan.why === 'bed'
    ? `some parts don't fit the ${o.printBedX} x ${o.printBedY} print bed without cutting along the track (it isn't)`
    : `a baseplate's worth of track doesn't fit the ${o.printBedX} x ${o.printBedY} print bed without cutting along the track (it isn't)`);
  return true;
}

/** The switches built on their own (planPieces): each one's base (cut to fit, or in layers), and its moving parts. */
function buildSwitches(b: PieceBuild, switches: ReturnType<typeof planPieces>['switches'], routes: Route[], params: SwitchParams, layered: boolean) {
  const { scad, track, cut: cx } = b;
  switches.forEach((sw, n) => {
    b.prog.step(`Building switch ${n + 1} of ${switches.length}`);
    for (const note of sw.plan.notes) b.bedWarnings.add(note);
    const tag = switches.length > 1 ? `switch${n + 1}` : 'switch';
    const cl = sw.plan.checkList;
    const frameCuts = b.grooveCuts.map((m) => R(T(m, [-sw.pose[0], -sw.pose[1], 0]), [0, 0, -sw.pose[2]]));
    // (its underside on the design's stud grid, in its own frame: but lined up with the track, track alone)
    const grid: Pose | undefined = b.alongTrack ? undefined : [...worldToPose(sw.pose, [b.gridPose[0], b.gridPose[1]]), b.gridPose[2] - sw.pose[2]] as Pose;
    const gm = cached(`sw:${JSON.stringify({ routes: sw.routes, sets: sw.sets, params, cl, tw: b.grooveEdits, grid })}`, () => {
      const g = switchGeometry(scad, grid ? { ...sw.plan, p: { ...sw.plan.p, grid } } : sw.plan, frameCuts);
      return { bases: g.basePieces(), whole: g.base(), grips: g.grips, sets: sw.sets.map((_, k) => ({ thr: g.throwPart(k), thrPrint: g.throwPrint(k), thp: g.throwPostsPart(k), thpPrint: g.throwPostsPrint(k), pp: g.pointsParts(k), print: g.leverPrint(k), lever: g.leverPart(k), bracket: params.throwModule ? g.bracketPart(k) : undefined,
        spring: g.springPart(k), springPrint: g.springPrint(k), turns: g.pointsTurns(k), move: g.throwMove(k) })), nail: sw.sets.map((_, k) => g.isNail(k)) };
    });
    const bases = gm.bases;
    // (its tubes, for the plan's grip marks, in the design's frame)
    for (const q of gm.grips) b.overlay.grips.push(poseToWorld(sw.pose, q));
    if (layered) {
      // (prototype) in two layers: the lower one and the deck, each cut for the bed on its own
      const lids = sw.sets.map((_, k) => ({ P: sw.pose, rects: lidRects(track, sw.plan.routes, sw.plan.sets[k]) }));
      const ls = cached(`lay:${JSON.stringify({ routes: sw.routes, sets: sw.sets, params, cl, tw: b.grooveEdits })}`, () => layerSplit(scad, track, params, place(gm.whole, sw.pose), lids, sw.pose));
      addTrack(b, `${tag}-base`, ls.lower, sw.covers.map(([ri, a, bb]) => subRoute(routes[ri], a, bb)));
      add(b, `${tag}-lid`, TRACK_COLOR, ls.deck, ls.deck);
    } else if (cx.bp || !bases.every(cx.fitsBed)) addTrack(b, `${tag}-base`, place(gm.whole, sw.pose), sw.covers.map(([ri, a, bb]) => subRoute(routes[ri], a, bb)), switchSize(sw.plan.routes));
    else bases.forEach((m, j) => {
      const lm = labelled(b, m, sw.plan.routes, bases.length > 1 ? undefined : switchSize(sw.plan.routes), bases.length > 1 ? `${j + 1}` : undefined);
      add(b, bases.length > 1 ? `${tag}-base${j + 1}` : `${tag}-base`, TRACK_COLOR, lm, place(lm, sw.pose));
    });
    gm.sets.forEach(({ thr, thrPrint, thp, thpPrint, pp, print, lever, bracket, spring, springPrint, turns, move }, k) => {
      const mv = throwMoves(move, sw.pose);
      const sfx = sw.sets.length > 1 ? `${k + 1}` : '';
      if (bracket && !gm.nail[k]) add(b, `${tag}-bracket${sfx}`, 0x8a8f99, bracket, place(bracket, sw.pose));
      const turnOf = (j: number): Piece['turn'] => { const t2 = turns?.[j]; return t2 && { at: poseToWorld(sw.pose, t2.at), by: t2.by, swing: t2.swing, ...(t2.tilt && { tilt: t2.tilt.map((q) => poseToWorld(sw.pose, q)) as [[number, number], [number, number]] }) }; };
      pp.forEach((pts, j) => add(b, `${tag}-points${sfx}${pp.length > 1 ? (j === 0 ? '-a' : '-b') : ''}`, 0x4682b4, pts, place(pts, sw.pose), turnOf(j)));
      // (Peco's spring: printed flat and straight, as assembled squeezed between its pins)
      if (spring && springPrint) add(b, `${tag}-points${sfx}-spring`, 0xc0392b, springPrint, place(spring, sw.pose));
      add(b, `${tag}-throw${sfx}`, 0xe8892b, thrPrint, place(thr, sw.pose), undefined, { slide: mv.slide });
      if (thp && thpPrint) add(b, `${tag}-throw${sfx}-posts`, 0xe8892b, thpPrint, place(thp, sw.pose), undefined, { slide: mv.slide });
      if (!gm.nail[k]) add(b, `${tag}-lever${sfx}`, 0xd4af37, print, place(lever, sw.pose), undefined, mv.hinge && { hinge: mv.hinge });
    });
  });
}

/**
 * Whose ground is whose where a bought switch's ballast meets other track's (it's a part of its own):
 * - the ground under a track's own sleepers (a band a sleeper long across it, and the fit's clearance) is that
 *   track's: its own ballast is there, or its own seat, and a bought switch's ballast stops short of it;
 * - the rest of a bought switch's ballast band (each leg's, from its toe to its ends) is the switch's: other track's
 *   ballast (its shoulders, running in beside the switch's ends) stops at it.
 * Both in plan, cut straight down through the parts (yielded), so nothing of one is left under or in the other.
 */
/** The ground under track's own sleepers near a box (mm), in plan: every route's but the bought switches' legs (not: nor these). */
function trackBeds(b: PieceBuild, box: number[], not?: (rt: Route) => boolean): CS | undefined {
  const { scad, w } = b, hwOf = (rt: Route) => sleeperLenOf(rt, (b.gaugeStuds + 1) * 8 + 24) / 2 + (b.o.trackFitTol ?? 0.2);
  const bands = b.trackRoutes.flatMap((rt) => {
    if (not?.(rt)) return [];
    const hw = hwOf(rt), r = routesBox([rt], hw);
    if (r[0] > box[2] || r[2] < box[0] || r[1] > box[3] || r[3] < box[1]) return [];
    // (only its stretch near the box: a yard's tracks are long)
    const L = routeLength(rt);
    let s0 = Infinity, s1 = -Infinity;
    for (let sv = 0; sv <= L + 4; sv += 4) {
      const q = routePose(rt, Math.min(L, sv));
      if (q[0] >= box[0] - hw && q[0] <= box[2] + hw && q[1] >= box[1] - hw && q[1] <= box[3] + hw) { s0 = Math.min(s0, Math.min(L, sv)); s1 = Math.max(s1, Math.min(L, sv)); }
    }
    s0 = s0 < 8 ? 0 : s0 - 4; s1 = s1 > L - 8 ? L : s1 + 4;
    if (!(s1 > s0)) return [];
    const n = Math.max(2, Math.ceil((s1 - s0) / 4)), side = (off: number) => Array.from({ length: n + 1 }, (_, k) => railPoint(rt, s0 + ((s1 - s0) * k) / n, off));
    return [scad.polygon([...side(-hw), ...side(hw).reverse()])];
  });
  return bands.length ? w.CrossSection.union(bands) : undefined;
}

/** Where the bought switches' ballast is, near a box (mm), in plan: each leg's widest ballast band, from its toe to its ends, less the ground under other track's own sleepers. */
function switchKeepOut(b: PieceBuild, box: number[]): CS | undefined {
  // (a bought switch is at LEGO's gauge, whatever the design's)
  const { scad, w, o } = b, sl = b.boughtSw.length ? 64 : (b.gaugeStuds + 1) * 8 + 24, hw = (o.ballast === 'buddy' ? sl + 32 : sl + 16) / 2 + 0.01;
  const bands = b.boughtSw.flatMap((bs) => bs.legs).filter((lg) => { const r = routesBox([lg], hw); return r[0] <= box[2] && r[2] >= box[0] && r[1] <= box[3] && r[3] >= box[1]; }).map((lg) => {
    const L = routeLength(lg), n = Math.max(2, Math.ceil(L / 4)), side = (off: number) => Array.from({ length: n + 1 }, (_, k) => railPoint(lg, (L * k) / n, off));
    return scad.polygon([...side(-hw), ...side(hw).reverse()]);
  });
  if (!bands.length) return undefined;
  const all = w.CrossSection.union(bands), beds = trackBeds(b, box);
  return beds ? all.subtract(beds) : all;
}

/**
 * A part less what it gives way to (in plan, cut straight down through it; top: only up to there, a printed track's
 * ballast under its sleepers' tops), and no stud of it left split by the cut: a stud on its ballast the cut passes
 * through goes whole (what stands on the ballast's top near the cut, no bigger than a stud and not a whole one).
 */
function yielded(b: PieceBuild, m: Man, to: CS | undefined, top = 150): Man {
  const { scad } = b;
  if (!to || to.isEmpty() || m.numTri() === 0) return m;
  const mb = m.boundingBox(), tb = to.bounds();
  if (tb.min[0] > mb.max[0] || tb.max[0] < mb.min[0] || tb.min[1] > mb.max[1] || tb.max[1] < mb.min[1]) return m;
  const out = scad.difference(m, [T(scad.extrude(to, top + 150), [0, 0, -150])]);
  if (out.numTri() === 0) return out;
  // (the studs near the cut: bodies of the slice just over the ballast's top (z 0), within reach of what was cut away
  // (a stud and more: the slice's own edge cuts studs too, further out; those don't touch the cut and stay))
  const near = scad.intersection(out, T(scad.extrude(to.offset(8, 'Round'), 2.4), [0, 0, 0.2]));
  if (near.numTri() === 0) return out;
  const atCut = T(scad.extrude(to.offset(1, 'Round'), 3), [0, 0, 0]);
  const split = near.decompose().flatMap((c) => {
    const bb = c.boundingBox(), dx = bb.max[0] - bb.min[0], dy = bb.max[1] - bb.min[1], dz = bb.max[2] - bb.min[2];
    if (Math.max(dx, dy) > 5.4) return [];
    // (a whole stud: round, as wide one way as the other, and all of it there)
    if (Math.abs(dx - dy) < 0.08 && dx > 4 && c.volume() > 0.76 * dx * dy * dz) return [];
    if (c.intersect(atCut).volume() < 1e-6) return [];
    return [T(scad.cube([dx + 0.04, dy + 0.04, 3]), [bb.min[0] - 0.02, bb.min[1] - 0.02, 0])];
  });
  return split.length ? scad.difference(out, split) : out;
}
/** What a part near a box gives way to, as a cache key's part: the bought switches' ground there and (beds) other track's own, by their size and place. */
function groundKey(b: PieceBuild, box: number[], beds = false) {
  const sig = (cs: CS | undefined) => { if (!cs || cs.isEmpty()) return 0; const bb = cs.bounds(); return [cs.area(), cs.numVert(), ...bb.min, ...bb.max].map((v) => Math.round(v * 100) / 100); };
  return [sig(switchKeepOut(b, box)), beds ? sig(trackBeds(b, box)) : 0];
}

/** A printed piece cut along the tables' seams: its part on each table (and what's on none), each a part of its own. */
function byTables(b: PieceBuild, m: Man): Man[] {
  if (!b.tables.length) return [m];
  const { scad } = b, bb = m.boundingBox();
  const prisms = b.tables.map((t) => T(scad.extrude(scad.polygon(tableOutline(t).map(([x, y]) => [x * 8, y * 8] as [number, number])), bb.max[2] - bb.min[2] + 2), [0, 0, bb.min[2] - 1]));
  // (each table the part of it not on one before it, where they overlap)
  const out: Man[] = [];
  prisms.forEach((p, k) => out.push(scad.difference(scad.intersection(m, p), prisms.slice(0, k))));
  out.push(scad.difference(m, prisms));
  return out.flatMap((x) => x.decompose()).filter((x) => x.volume() > 1);
}

/**
 * A bought switch's ballast too long for the bed, in two: cut square across the switch (its toe's frame) where the cut
 * crosses least of its underside (its footprint, even-odd), each half fitting the bed; whole if no cut does.
 */
function halvesOf(b: PieceBuild, m: Man, bs: BoughtSwitch, under: [number, number][][]): Man[] {
  const { scad } = b, L = Math.max(...bs.legs.map((lg) => routeLength(lg)));
  const inside = (q: [number, number]) => {
    let n = 0;
    for (const poly of under) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) n++;
    }
    return n % 2 === 1;
  };
  // (each cut's cost: how much of the underside it crosses, every mm across)
  const cuts: [number, number][] = [];
  for (let y = 48; y <= L - 48; y += 1) {
    let c = 0;
    for (let x = -160; x <= 160; x += 1) if (inside(poseToWorld(bs.toe, [x, y]))) c++;
    cuts.push([y, c]);
  }
  cuts.sort((p, q) => p[1] - q[1] || Math.abs(p[0] - L / 2) - Math.abs(q[0] - L / 2));
  const half = (y: number, before: boolean) => {
    const box = T(scad.cube([1000, 1000, 400]), [-500, before ? y - 1000 : y, -200]);
    return scad.intersection(m, T(R(box, [0, 0, bs.toe[2]]), [bs.toe[0], bs.toe[1], 0]));
  };
  // (joined, unless Parts join with is Straight cuts: a dovetail each side of the switch, in the ballast past its sleepers'
  // ends, from the ballast's bottom to the top of its lower layer, the tab on the half before the cut, its socket 0.15
  // clear in the half after)
  const bb = m.boundingBox(), sl = 40 + 24, xs = [-(sl / 2 + 4), sl / 2 + 4]; // (a bought switch is at LEGO's gauge)
  const tail = (y: number, x: number, grow: number) => {
    const pts: [number, number][] = [[x - 2.2 - grow, y - 0.01], [x + 2.2 + grow, y - 0.01], [x + 3.4 + grow, y + 4.5 + grow], [x - 3.4 - grow, y + 4.5 + grow]];
    return scad.extrude(scad.polygon(pts.map((q) => poseToWorld(bs.toe, q))), -bb.min[2] + (grow ? 1 : 0)).translate([0, 0, bb.min[2] - (grow ? 0.5 : 0)]);
  };
  const joined = b.o.joint !== 'butt' && b.o.joint !== 'flataxle';
  for (const [y] of cuts.slice(0, 40)) {
    let hs = [half(y, true), half(y, false)].filter((h) => h.numTri() > 0);
    if (hs.length !== 2) continue;
    if (joined) {
      const tabs = xs.map((x) => tail(y, x, 0)), sockets = xs.map((x) => tail(y, x, 0.15));
      hs = [scad.union([hs[0], scad.intersection(scad.union(tabs), m)]), scad.difference(hs[1], sockets)];
    }
    if (hs.every(b.cut.fitsBed)) return hs;
  }
  return [m];
}

/**
 * The bought switches (boughtswitch.ts): each one as bought, not printed, in the parts list; on ballast, its ballast
 * printed alone with a seat it drops into (its underside's footprint, ballast between its sleepers as under a curve; the switch stand's spots,
 * a little bigger all round), cut for the bed if it has to be.
 */
function boughtSwitches(b: PieceBuild, bought: BoughtSwitch[], copt: typeof CROSSING_DEFAULTS, gridPose: Pose) {
  const { w, scad, o } = b;
  const tol = o.trackFitTol ?? 0.2, onBallast = o.ballast !== 'none';
  bought.forEach((bs, n) => {
    b.prog.step(`Building bought switch ${n + 1} of ${bought.length}`);
    const key = `bsw:${JSON.stringify({ legs: bs.legs, copt, gridPose, tol, onBallast, ...(onBallast && { beds: groundKey(b, routesBox(bs.legs, 80), true)[1] }), bed: [o.printBedX, o.printBedY], bb: o.boughtBallast, t: o.boughtBallast === 'together' ? b.tables : 0 })}`;
    // (a job, as a tile or a section is: its ballast is a few seconds' work, and a yard has several)
    const got = b.job<{ view: Baked; bal: Baked[] } | undefined>(key, 3000, () => arena(w, () => {
      // (as bought: its underside's footprint as its sleepers and base, a plate thick, and each leg's rails on them)
      const asBought = { ...copt, ballast: 'none' as const, ballastOnly: undefined, sleepers: 'sleepers' as const, sleeperGapStuds: 2, sleeperWidthStuds: 2, supports: false, buffers: undefined, undersideGrid: 'track' as const };
      const fp = footprint(bs), under = made(new w.CrossSection(fp.underside, 'EvenOdd'));
      const legs = scad.union(bs.legs.map((lg) => crossingPiece(scad, [lg], asBought, undefined, undefined, { gridPose }))), lb = legs.boundingBox();
      const rails = scad.intersection(legs, T(scad.cube([lb.max[0] - lb.min[0] + 2, lb.max[1] - lb.min[1] + 2, 50]), [lb.min[0] - 1, lb.min[1] - 1, PLATE_H + 0.01]));
      // (its three ends as a track piece's are: each leg built as bought, what of it is within a stud of an end, in
      // place of the footprint there and of anything traced past the end: the next piece's end goes in it as in any)
      const hwE = 20 + 12 + 8; // (a bought switch is at LEGO's gauge)
      const endBox = (P: Pose) => place(T(scad.cube([2 * hwE, 8 + 24, 60]), [-hwE, -8, -10]), P);
      // (the toe's from the leg whose route runs on through it: forced points' other leg ends a hair off it, and the two
      // ends, one over the other, narrowed the clip the next piece's peg goes in)
      const toeLeg = bs.legs[bs.through ?? 0], toeP = routePose(toeLeg, 0), toeBox = endBox([toeP[0], toeP[1], toeP[2] + 180]);
      const farBoxes = bs.legs.map((lg) => endBox(routePose(lg, routeLength(lg)))), endBoxes = scad.union([toeBox, ...farBoxes]);
      const ends = scad.union([scad.intersection(crossingPiece(scad, [toeLeg], asBought, undefined, undefined, { gridPose }), toeBox), scad.intersection(legs, scad.union(farBoxes))]);
      const view = bake(b, scad.union([scad.difference(scad.union([scad.extrude(under, PLATE_H + 0.02), rails]), [endBoxes]), ends]));
      if (!onBallast) return { view, bal: [] as Baked[] };
      // (its seat: its footprint and its ends' outlines; and no ballast of it under other track's own sleepers (trackBeds))
      const cs = w.CrossSection.union([under, ends.project(), ...fp.extras.map((pts) => scad.polygon(pts))]).offset(tol, 'Miter', 2);
      const none = { crossings: [], grooves: [], splits: [], checkRails: [] };
      let m = crossingPiece(scad, bs.legs, { ...copt, ballastOnly: tol, supports: false, buffers: undefined }, none, undefined, { gridPose, seat: scad.extrude(cs, 200) });
      m = yielded(b, m, trackBeds(b, routesBox(bs.legs, 80)));
      // (a pad under what of the switch reaches out past its ballast (LEGO's lever housing), from the ballast's bottom up
      // to the switch's: it stands on something)
      if (fp.pads.length && m.numTri() > 0) {
        const bb = m.boundingBox(), outline = scad.extrude(m.project(), 400).translate([0, 0, -200]);
        const pad = scad.difference(T(scad.extrude(w.CrossSection.union(fp.pads.map((pts) => scad.polygon(pts))), -bb.min[2]), [0, 0, bb.min[2]]), [outline]);
        if (pad.numTri() > 0) m = scad.union([m, pad]);
      }
      // (one part, whole, as the switch is; longer than the bed, in two, cut straight across it where the cut crosses
      // least of its underside (between its sleepers), each half fitting the bed: they butt together on the baseplate)
      if (m.numTri() === 0) return { view, bal: [] as Baked[] };
      // (or, Bought track's ballast: Together, cut at the tables' seams and for the bed)
      const parts = o.boughtBallast === 'together' ? byTables(b, m).flatMap((p) => (b.cut.fitsBed(p) ? [p] : b.cut.whole(p, b.cut.bedCut(flat(w, p), bs.legs))))
        : b.cut.fitsBed(m) ? [m] : halvesOf(b, m, bs, fp.underside);
      return { view, bal: parts.filter((p) => p.numTri() > 0).map((p) => bake(b, p)) };
    }, () => []), undefined);
    if (!got) return; // (planning: listed, not built)
    const tag = bought.length > 1 ? `switch${n + 1}` : 'switch';
    b.pieces.push({ name: `switch-bought-${bs.part.part.replace(/\s+/g, '')}-${n + 1}`, color: boughtColor([bs.part]), positions: got.view.positions.slice(), stl: got.view.stl.slice(), lego: [{ ...bs.part }] });
    got.bal.forEach((p, k) => {
      b.pieces.push({ name: `${tag}-ballast${got.bal.length > 1 ? k + 1 : ''}`, color: TRACK_COLOR, positions: p.positions.slice(), stl: p.stl.slice(), ...(p.turn && { bedTurn: p.turn }) });
      b.volume += p.volume;
      if (!p.fits) b.bedWarnings.add(`a bought switch's ballast doesn't fit the ${o.printBedX} x ${o.printBedY} print bed, even in two`);
    });
  });
}

/** (mm) The cut between the two tracks on from a bought switch (partedAtSwitches): this wide, as the stepped cuts' (pathsplit.ts). */
const PARTING_KERF = 0.1;
/** A parting: its line, and a spot just past each of the switch's far ends (the track on from each is there). */
interface Parting { pts: [number, number][]; ends: [number, number][] }
const partings = new WeakMap<PieceBuild, Parting[]>();
/**
 * Where the two tracks on from a bought switch's far ends part: for each switch a line (mm) down the middle of the gap
 * between them, from a stud behind the ends on to where their bases stand a stud clear of each other. Printed, the two
 * are cut apart along it (partedAtSwitches). None where an end has no track on from it, or the two stand clear from
 * the start (LEGO's switch, its ends 13 studs apart).
 */
function switchPartings(b: PieceBuild): Parting[] {
  const had = partings.get(b);
  if (had) return had;
  const out: Parting[] = [], clear = 2 * b.cut.bandHalf + 8;
  for (const bs of b.boughtSw) {
    // (the track on from each far end: a route that starts or ends there, taken from that end on)
    const on = bs.legs.map((lg) => {
      const e = routePose(lg, routeLength(lg));
      for (const rt of b.trackRoutes) {
        const L = routeLength(rt), a = routePose(rt, 0), z = routePose(rt, L);
        if (Math.hypot(a[0] - e[0], a[1] - e[1]) < 1) return { rt, L, at: (s: number) => routePose(rt, Math.min(L, s)) };
        if (Math.hypot(z[0] - e[0], z[1] - e[1]) < 1) return { rt, L, at: (s: number) => routePose(rt, Math.max(0, L - s)) };
      }
      return undefined;
    });
    const [A, B] = on;
    if (!A || !B) continue;
    // (half way between the one track and the nearest of the other, every 4 mm along the first)
    const pts: [number, number][] = [];
    for (let s = 0; s <= A.L + 1e-6; s += 4) {
      const p = A.at(s), q = routePose(B.rt, routeSOf(B.rt, [p[0], p[1]]));
      pts.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= clear) break;
    }
    if (pts.length < 2) continue;
    const d = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], dl = Math.hypot(d[0], d[1]) || 1;
    out.push({ pts: [[pts[0][0] - (8 * d[0]) / dl, pts[0][1] - (8 * d[1]) / dl], ...pts], ends: bs.legs.map((lg) => poseToWorld(routePose(lg, routeLength(lg)), [0, 4])) });
  }
  partings.set(b, out);
  return out;
}
/** The partings (switchPartings) near a box (mm): for a cache key, and the ones a part there may be cut along. */
const partingsNear = (b: PieceBuild, box: number[]) => switchPartings(b).filter(({ pts }) => pts.some((q) => q[0] >= box[0] - 16 && q[0] <= box[2] + 16 && q[1] >= box[1] - 16 && q[1] <= box[3] + 16));
/**
 * A printed track part that is the track on from both far ends of a bought switch, in two: cut down the middle of the
 * gap between the two tracks (switchPartings), each track's a part of its own from the switch on. In one, it had to go
 * onto both of the switch's ends at once, which point different ways: on a left-hand switch it couldn't (twoEndedParts).
 * The cut is in the gap, past both tracks' sleepers' ends; a stud of the ballast it passes through goes as any cut's
 * (cutContext whole). Only where the cut does part it in two, one end's track in each: else the part's left whole.
 */
function partedAtSwitches(b: PieceBuild, m: Man): Man[] {
  if (!b.boughtSw.length || m.numTri() === 0) return [m];
  const { scad, w } = b, hk = PARTING_KERF / 2;
  let parts = [m];
  for (const { pts, ends } of switchPartings(b)) parts = parts.flatMap((p) => {
    const bb = p.boundingBox();
    // (a part with track just past both ends: within 6 mm of the spot, as twoEndedParts looks)
    const has = (h: Man, q: [number, number]) => { const c = h.boundingBox(); return q[0] > c.min[0] && q[0] < c.max[0] && q[1] > c.min[1] && q[1] < c.max[1] && scad.intersection(h, T(scad.cube([12, 12, 400]), [q[0] - 6, q[1] - 6, -200])).volume() > 1; };
    if (!ends.every((q) => has(p, q))) return [p];
    const quads = pts.slice(1).map((q, k) => {
      const a = pts[k], dx = q[0] - a[0], dy = q[1] - a[1], l = Math.hypot(dx, dy) || 1, n = [(-dy / l) * hk, (dx / l) * hk], e = [(dx / l) * hk, (dy / l) * hk];
      return scad.polygon([[a[0] - e[0] - n[0], a[1] - e[1] - n[1]], [q[0] + e[0] - n[0], q[1] + e[1] - n[1]], [q[0] + e[0] + n[0], q[1] + e[1] + n[1]], [a[0] - e[0] + n[0], a[1] - e[1] + n[1]]]);
    });
    const slit = T(scad.extrude(w.CrossSection.union(quads), bb.max[2] - bb.min[2] + 2), [0, 0, bb.min[2] - 1]);
    const halves = b.cut.bodies(scad.difference(p, [slit]), 600);
    // (in two, the track on from one end in each)
    if (halves.length !== 2 || !halves.every((h) => ends.filter((q) => has(h, q)).length === 1)) return [p];
    return b.cut.whole(p, halves);
  });
  return parts;
}

/**
 * A printed part that's the track on from both far ends of a left-hand bought switch: said. A track end's peg is on
 * its right, looking out of the piece, so a part on both ends of a right-hand switch slides off along the straight
 * (the branch's peg slips out of its clip's mouth sideways); a left-hand one's is behind its clip's wall that way, and
 * the part comes off no straight way. (Each end's track a part of its own goes on as any piece does: the two are cut
 * apart down the gap between them, partedAtSwitches; this is said only where that cut couldn't part them.)
 */
function twoEndedParts(b: PieceBuild, bought: BoughtSwitch[]) {
  const lefts = bought.filter((bs) => bs.hand === 'left');
  if (!lefts.length) return;
  const printed = b.pieces.filter((p) => !p.lego && /^track[\d-]*$/.test(p.name) && p.positions.length);
  for (const bs of lefts) {
    // (just past each far end, on its centre line: the next part's end is there)
    const at = bs.legs.map((lg) => { const e = routePose(lg, routeLength(lg)); return poseToWorld(e, [0, 4]); });
    const on = (p: Piece, q: [number, number]) => { const v = p.positions; for (let i = 0; i < v.length; i += 3) if (Math.abs(v[i] - q[0]) < 6 && Math.abs(v[i + 1] - q[1]) < 6) return true; return false; };
    if (printed.some((p) => at.every((q) => on(p, q))))
      b.bedWarnings.add(`the printed track on from both ends of the bought switch at ${(bs.toe[0] / 8).toFixed(0)}, ${(bs.toe[1] / 8).toFixed(0)} (studs) is one part: it won't slide onto a left-hand switch's two ends (they point different ways), its pegs have to be forced in; move a cut so each track on from the switch is a part of its own`);
  }
}

/** One build: the track with its ballast (part undefined), or, printed apart, the ballast alone with its seat ('ballast'; the track is the build without ballast). */
function buildOne(w: Wasm, design: Design, report: (what: string, frac: number) => void, early: ((overlay: unknown) => void) | undefined, opts: BuildOpts & { part?: 'track' | 'ballast' }) {
  const plan = opts.plan;
  const alone = opts.part === 'ballast';
  const job = <T>(key: string, cost: number, f: () => T, none: T): T => {
    if (!plan) return cachedData(key, f);
    if (!data.has(settingsKey + key)) plan.push({ key, cost, run: () => jobScope(f) });
    return none;
  };
  const t0 = performance.now();
  const prog = progressOf(report);
  const o = { ...OPTION_DEFAULTS, ...design.options };
  const { routes, sol, solverOpts, tw, items, overlay, grooveCuts, forceWarnings, bankWarnings, bought, gridPose } = solveTrackwork(w, design, o, prog.step);
  const dropInner = (rts: Route[], more: Iterable<string> = []) => droppedInner(routes, sol.dropped ?? [], rts, more);
  const toeShift = (q: [number, number]) => tw.points?.[keyOf(q)]?.toe ?? 0;
  const throwEdit = (q: [number, number]) => tw.throw?.[keyOf(q)];
  // Pieces: a switch wherever routes split, the rest as fixed trackwork.
  const scad = new Scad(w);
  const params = switchParams(o, design.gaugeStuds, alone);
  // (route ends that end in a buffer stop, by where they are)
  const bufs = bufferEnds(design);

  let pc = planPieces(routes, sol.splits, params, toeShift, throwEdit, true);
  prog.steps = 2 + pc.switches.length + (pc.rest.length ? 1 : 0);
  // Switches that merge back in, cross other track, or can't stand on their
  // own (a crossover, a switch on a crossing): the whole design as one
  // network piece with the points built in.
  const groupOf = (r: number) => pc.switches.findIndex((sw) => sw.covers.some((c) => c[0] === r));
  // (a buffer stop on a switch's own track: built as a network piece, whose ends can have one)
  const bufOnSwitch = bufs.length > 0 && pc.switches.some((sw) => sw.covers.some(([ri, a, b]) => [a, b].some((sv) => {
    const q = routePose(routes[ri], sv); return bufs.some((bq) => Math.hypot(bq[0] - q[0], bq[1] - q[1]) < 0.5);
  })));
  // (guard rails or a third rail on a switch's routes: built as a network piece too, so their ends meet the switch's in
  // one piece; a switch built on its own has none, and the track's connector there had extra rail ends that met nothing)
  const extraOnSwitch = pc.switches.some((sw) => sw.covers.some(([ri]) => !!routes[ri].extra));
  // (points on routes with a gauge of their own, mixed gauges: a network piece, each points set built at its routes' gauge)
  const ownGaugeSwitch = sol.splits.some((sp) => sp.routes.some((ri) => routes[ri].gauge !== undefined));
  const network = sol.splits.length > 0 && (sol.splits.some((sp) => sp.merge) || pc.warnings.some((w2) => !/print bed/.test(w2))
    || sol.crossings.some((c) => groupOf(c.a.route) !== groupOf(c.b.route)) || bufOnSwitch || extraOnSwitch || ownGaugeSwitch);
  const bedWarnings = new Set<string>();
  const track = new Track(scad, { ...TRACK_DEFAULTS, gaugeStuds: design.gaugeStuds, studFit: o.studFit, antistudFit: o.antistudFit, sleeperWidthStuds: o.sleeperWidthStuds, axleStuds: o.axleStuds, ...(o.tongueRails === 'square' && { tongueMaxAngle: 12 }) });
  {
    const spots = tracksOverEachOther(routes, sol, track.c.sleeperLen), gap = track.c.sleeperLen;
    for (const q of spots) overlay.issues.push({ at: [q[0], q[1]], r: 2 * gap, text: 'Tracks run over each other here: trains on them would hit' });
    if (spots.length) bedWarnings.add(`tracks run over each other (closer than their sleepers, nearly parallel) at ${spots.slice(0, 4).map((q) => `${(q[0] / 8).toFixed(0)}, ${(q[1] / 8).toFixed(0)}`).join('; ')}${spots.length > 4 ? ' …' : ''} (studs): trains on them would hit; move them apart, or cross at a steeper angle`);
  }
  const fdbPoints = params.mechStyle === 'plates';
  const cut = cutContext(w, scad, o, track, routes, sol.splits, overlay.crossings, fdbPoints);
  const lever = (key: string, P: Pose, v: LeverPlan) => leverItem(items, tw, fdbPoints ? cut.pointsAvoid : undefined, track.c.railOffset, key, P, v);
  const layered = (o.pointsModule ?? 'built-in') === 'layers' && o.ballast !== 'none';
  if ((o.pointsModule ?? 'built-in') === 'layers' && o.ballast === 'none') bedWarnings.add('layered points need ballast (the track alone is too thin to split): built in one piece, the moving parts going in from below');
  // ---- the trackwork first (what the plan shows and the hand edits work
  // on), sent on ahead of the pieces, which take longer ----
  // (track only with sleepers: the bed kept across each cut, so the parts there have floor to join with)
  // (track only, its underside lined up with the track: no grip added along the cut edges on the baseplate's grid)
  const alongTrack = o.ballast === 'none' && o.undersideGrid === 'track';
  // (long track in pieces cut square across it, each end an ordinary connector, as LEGO track: Long track cut into)
  const inLengths = o.splitTrack === 'lengths';
  if (design.tables?.length && !inLengths) bedWarnings.add('the tables cut the track at their seams only with Long track cut into: Track pieces');
  const sleepered = o.sleepers === 'sleepers' && o.ballast === 'none';
  const labelOn = o.ballast !== 'none' && o.bottomStyle === 'float' && !!o.labelText?.trim();
  const b: PieceBuild = { w, scad, o, gaugeStuds: design.gaugeStuds, track, cut, prog, pieces: [], volume: 0, bedWarnings, overlay, job,
    labelOn, ...(opts.mark && { mark: opts.mark }), num: { part: 0, sec: 0 }, alongTrack, gridPose, sleepered, bufs, grooveCuts, grooveEdits: tw.groove, dropInner, tables: design.tables ?? [], boughtSw: bought, trackRoutes: routes };
  const copt = { ...CROSSING_DEFAULTS, gaugeStuds: design.gaugeStuds, grip: o.grip ?? 'edges', flangeway: o.flangeway, flangewayDepth: o.flangewayDepth, checkRailW: o.checkRailW, checkRailFlare: o.checkRailFlare,
    ballast: o.ballast, bottomStyle: o.bottomStyle, supports: o.endSupports !== false, curveStuds: o.curveStuds,
    studFit: o.studFit, antistudFit: o.antistudFit, sleepers: o.sleepers, undersideGrid: o.ballast === 'none' ? o.undersideGrid : undefined, sleeperWidthStuds: o.sleeperWidthStuds, sleeperGapStuds: o.sleeperGapStuds,
    // (only what's set: the defaults' build, and its cache keys, as before)
    ...(bufs.length && { buffers: bufs, buffer: { postPlates: o.bufferPostPlates ?? 8, beamBottom: o.bufferBeamBottom ?? 2, beamTop: o.bufferBeamTop ?? 12, pinHoles: o.bufferPinHoles !== false, style: o.bufferStyle ?? 'frame' } }),
    ...(o.axleHoles && { axleHoles: true }), ...(o.pegOnBallast && { pegOnBallast: true }), ...(alone && { ballastOnly: o.trackFitTol ?? 0.2 }) };
  const tp = params;
  const netKey = JSON.stringify({ routes, tp, copt, tw });
  let net: ReturnType<typeof networkSplits> | undefined;
  if (network) {
    editChecks(items, tw, routes, sol.checkRails);
    // (only the plan's trackwork wanted: where the levers are, none of the points' parts built)
    net = opts.planOnly ? cached(`netplan:${netKey}`, () => networkSplits(scad, routes, sol, tp, toeShift, throwEdit, true, true))
      : cached(`netsplits:${netKey}`, () => networkSplits(scad, routes, sol, tp, toeShift, throwEdit, true));
    for (const sp of net.levers) lever(keyOf(sp.toe), sp.frame, sp.set);
  }
  const rest = network ? [] : pc.rest;
  const restSol = rest.length ? solve(rest, solverOpts) : undefined;
  // (the track that's left, each stretch named for its route and which stretch of it (pieces.ts): the route's own id)
  if (restSol) editChecks(items, tw, rest, restSol.checkRails, (rt) => rt.id.replace(/:\d+$/, ''));
  if (!network) pc.switches.forEach((sw) => {
    sw.sets.forEach((_, k) => lever(keyOf(sw.setAts[k]), sw.pose, sw.plan.sets[k]));
    // its check rails, with the hand edits (keyed where they are in the design)
    const toWorld = (q: [number, number]) => poseToWorld(sw.pose, q);
    const cl = sw.plan.checkList, kept: typeof cl = [];
    for (const cr of cl) {
      const rt = sw.plan.routes[cr[0]], w2 = o.checkRailW / 2;
      const mid = toWorld(railPoint(rt, (cr[5] + cr[6]) / 2, cr[2] + w2)), key = keyOf(mid), e = tw.check?.[key] ?? {};
      if (e.off) { items.push({ kind: 'check', key, at: mid, pts: [], off: true, len: cr[6] - cr[5] }); continue; }
      const m: typeof cr = [cr[0], cr[1], cr[2] + cr[3] * (e.shift ?? 0), cr[3], cr[4], cr[5] - (e.d0 ?? 0), cr[6] + (e.d1 ?? 0)];
      const n2 = Math.max(2, Math.ceil(m[6] - m[5]));
      items.push({ kind: 'check', key, at: mid, len: m[6] - m[5], pts: Array.from({ length: n2 + 1 }, (_, k) => toWorld(railPoint(rt, m[5] + ((m[6] - m[5]) * k) / n2, m[2] + w2))) });
      kept.push(m);
    }
    cl.splice(0, cl.length, ...kept);
  });
  overlay.checkRails = items.filter((it) => it.kind === 'check' && !it.off).map((it) => it.pts);
  overlay.grooves = items.filter((it) => it.kind === 'groove').map((it) => it.pts);
  early?.(overlay);
  if (opts.planOnly) throw PLAN_ONLY;

  if (net) {
    prog.steps = 3;
    prog.step(`Building the piece with its ${sol.splits.length} points`);
    if (inLengths) sectioned(b, 'track', routes, sol.checkRails, net.splits, sol.splits, copt, netKey);
    else if (!tiled(b, 'track', routes, sol.checkRails, net.splits, copt)) {
      if (plan) throw PLANNED; // (built whole: nothing to share out)
      const whole = cached(`net:${netKey}`, () => { const grips: [number, number][] = []; return { body: networkBody(scad, routes, sol, copt, net.splits, grips, { cuts: grooveCuts, innerEnds: dropInner(routes) }), grips }; }, true);
      overlay.grips.push(...whole.grips);
      if (layered) {
        // (prototype) in two layers: the lower one and the deck, each cut for the bed on its own
        const lids = net.splits.map((sp, n2) => ({ P: sp.frame, rects: lidRects(track, sol.splits[n2].routes.map((ri) => ({ ...routes[ri], start: toFrame(sp.frame, routes[ri].start) })), sp.set) }));
        const ls = cached(`lay:${netKey}`, () => layerSplit(scad, track, params, whole.body, lids, routePose(routes[0], 0)));
        addTrack(b, 'track', ls.lower, routes);
        // (each lid its own part)
        const lidParts = ls.deck.decompose().filter((m) => m.volume() > 20);
        lidParts.forEach((m, k) => add(b, `points${lidParts.length > 1 ? k + 1 : ''}-lid`, TRACK_COLOR, m, m));
      } else addTrack(b, 'track', whole.body, routes, undefined, sleepered ? (ls) => cached(`netcut:${netKey}:${JSON.stringify(ls)}`, () => networkBody(scad, routes, sol, copt, net.splits, [], { cuts: grooveCuts, innerEnds: dropInner(routes), bedAt: ls }), true) : undefined);
    }
    if (plan) { boughtSwitches(b, bought, copt, gridPose); throw PLANNED; }
    // (each points set's moving parts baked, by what they're made from: an edit bakes only the ones it changes)
    for (const sp of net.splits) {
      const ms = cachedData(`mov:${sp.key}:${o.printBedX}x${o.printBedY}`, () => sp.moving.map((m) => {
        // (its break-out supports apart, as a switch's own parts': the sprung blades' spring pockets')
        const { positions, supports } = viewOf(w, m.world);
        // (its file turned to lie within the bed, a part that fits it only on the slant: long blades on a small bed)
        const turn = cut.turnOf(m.local);
        return { positions, supports, stl: stlBytes((m.local === m.world ? m.world : m.local).getMesh(), true, turn), volume: m.local.volume(), turn };
      }));
      sp.moving.forEach((m, k) => { b.pieces.push({ name: m.name, color: m.color, positions: ms[k].positions.slice(), stl: ms[k].stl.slice(), ...(ms[k].supports && { supports: ms[k].supports!.slice() }), ...(m.turn && { turn: m.turn }), ...(m.slide && { slide: m.slide }), ...(m.hinge && { hinge: m.hinge }), ...(ms[k].turn && { bedTurn: ms[k].turn }) }); b.volume += ms[k].volume; });
    }
    pc = { switches: [], rest: [], warnings: [...net.warnings] };

  }
  if (restSol) {
    prog.step('Building the track');
    const restKey = JSON.stringify({ rest, copt, solverOpts, tw, gridPose });
    const whole = () => cached(`cx:${restKey}`, () => { const grips: [number, number][] = []; return { m: crossingPiece(scad, rest, copt, restSol, grips, { cuts: grooveCuts, innerEnds: dropInner(rest), gridPose }), grips }; }, true);
    if (inLengths) sectioned(b, 'track', rest, restSol.checkRails, [], [], copt, restKey);
    else if (pc.rest.length > 1 && tiled(b, 'track', rest, restSol.checkRails, [], copt)) { /* built in tiles */ }
    else if (plan) throw PLANNED;
    // (cut at the baseplate edges: there, as addTrack cuts it, however long; the equal lengths below took no notice of them)
    else if (pc.rest.length > 1 || cut.bp || cut.fitsBed(whole().m)) {
      overlay.grips.push(...whole().grips);
      addTrack(b, 'track', whole().m, rest, sizeOf(rest), sleepered ? (ls) => cached(`cxcut:${restKey}:${JSON.stringify(ls)}`, () => crossingPiece(scad, rest, copt, restSol, [], { cuts: grooveCuts, innerEnds: dropInner(rest), bedAt: ls, gridPose }), true) : undefined);
    } else {
      // A plain track longer than the bed: in equal lengths, joined like
      // LEGO track pieces (rail-end tongues, peg and clip), each fitting it.
      const rt = pc.rest[0], L = routeLength(rt);
      for (let n = 2; n <= 20; n++) {
        // (cut on whole studs from its start, each length's underside and studs on one grid, the design's: lengths of
        // L / n each were off it, their sockets and tubes beside the baseplate's studs)
        const at = (k: number) => (k === n ? L : Math.round((L * k) / n / 8) * 8);
        const subs = Array.from({ length: n }, (_, k) => subRoute(rt, at(k), at(k + 1)));
        // (lengths whose sleepers' ends alone are over the bed aren't built to find that out: on a bed narrower than
        // the track every count up to 20 was built in turn, 209 pieces for the 20 kept: a 64-stud straight on a 40 x 40
        // bed took 21 s)
        const over = (sub: Route) => {
          const Ls = routeLength(sub), hw = sleeperLenOf(sub, track.c.sleeperLen) / 2 - 0.5, pts: [number, number][] = [];
          for (let k = 0, m = Math.max(1, Math.ceil(Ls / 4)); k <= m; k++) for (const off of [-hw, hw]) pts.push(railPoint(sub, (Ls * k) / m, off));
          return !bedFit(pts, o.printBedX, o.printBedY).fits;
        };
        if (n < 20 && subs.some(over)) continue;
        const bits = subs.map((sub) => cached(`cx1:${JSON.stringify({ sub, copt, gridPose })}`, () => crossingPiece(scad, [sub], copt, undefined, undefined, { gridPose }), true));
        // (still over the bed in 20 lengths: it's the track's width that doesn't fit; said, not left to be found on the printer)
        if (n === 20 && !bits.every(cut.fitsBed)) bedWarnings.add(`the track doesn't fit the ${o.printBedX} x ${o.printBedY} print bed however short it's cut: the bed is narrower than the track`);
        if (bits.every(cut.fitsBed) || n === 20) { bits.forEach((m, k) => { const lm = labelled(b, m, [subs[k]], sizeOf([subs[k]]), `${k + 1}`); add(b, `track${k + 1}`, TRACK_COLOR, lm, lm); }); break; }
      }
    }
  }
  if (plan) { boughtSwitches(b, bought, copt, gridPose); throw PLANNED; }
  buildSwitches(b, pc.switches, routes, params, layered);
  boughtSwitches(b, bought, copt, gridPose);
  twoEndedParts(b, bought);
  const pieces = b.pieces;
  const all = pieces.flatMap((p) => [p.positions]);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const ps of all) for (let i = 0; i < ps.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], ps[i + k]); mx[k] = Math.max(mx[k], ps[i + k]); }
  // (and every warning that says where, "at x, y (studs)", ringed there)
  for (const wn of [...forceWarnings, ...bankWarnings, ...pc.warnings, ...bedWarnings]) {
    const m = /at (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?) \(studs\)/.exec(wn);
    if (!m) continue;
    const at: [number, number] = [Number(m[1]) * 8, Number(m[2]) * 8];
    if (!overlay.issues.some((q) => Math.hypot(q.at[0] - at[0], q.at[1] - at[1]) < 64)) overlay.issues.push({ at, r: 48, text: wn });
  }
  const info = {
    ms: performance.now() - t0, volume: b.volume,
    size: [0, 1, 2].map((k) => mx[k] - mn[k]),
    crossings: sol.crossings.length, checkRails: sol.checkRails.length, splits: sol.splits.length,
    // (points sets, as the parts are: a three-way's one set is one switch, however many pairs of its routes part there)
    switches: network ? (net ? new Set(net.splits.map((sp) => sp.src)).size : sol.splits.length) : pc.switches.length, pieces: pieces.length,
    // (the printed parts that fit the bed only on the slant: their files are turned to lie so)
    turned: pieces.filter((p) => p.bedTurn && !p.lego).length, warnings: [...forceWarnings, ...bankWarnings, ...pc.warnings, ...bedWarnings],
  };
  return { overlay, pieces, info };
}

const num2 = (v: number) => String(Math.round(v * 100) / 100);
/** A plain piece's size, for its label (straight.scad's S16, curves.scad's R40 with its angle): a crossing's angle; else undefined. */
export function sizeOf(rts: Route[]): string | undefined {
  if (rts.length === 1) return rts[0].segments.map((sg) => (sg.kind === 'straight' ? `S${num2(sg.length / 8)}` : `R${num2(sg.radius / 8)} ${num2(Math.abs(sg.angle))}°`)).join(' ') || undefined;
  if (rts.length === 2 && rts.every((rt) => rt.segments.every((sg) => sg.kind === 'straight'))) {
    const a = (((rts[0].start[2] - rts[1].start[2]) % 180) + 180) % 180;
    return `X ${num2(Math.min(a, 180 - a))}°`;
  }
  return undefined;
}
/** A switch's size, for its label (switch.scad's "LEFT R40 22.5°"): its kind, the branch's radius and how far it turns off. */
export function switchSize(rts: Route[]): string | undefined {
  const turn = (rt: Route) => ((((routePose(rt, routeLength(rt))[2] - rt.start[2]) % 360) + 540) % 360) - 180;
  const arcs = rts.map((rt) => rt.segments.find((sg) => sg.kind === 'arc')).filter((sg): sg is Extract<Route['segments'][number], { kind: 'arc' }> => !!sg);
  if (!arcs.length) return undefined;
  const ts = rts.map(turn), branch = rts[ts.reduce((bi, t, k) => (Math.abs(t) > Math.abs(ts[bi]) ? k : bi), 0)];
  const arc = branch.segments.find((sg) => sg.kind === 'arc') as Extract<Route['segments'][number], { kind: 'arc' }>, ang = Math.abs(turn(branch));
  const kind = rts.length > 2 ? '3-WAY' : ts.every((t) => Math.abs(t) > 0.5) && ts[0] * ts[1] < 0 ? 'WYE' : turn(branch) > 0 ? 'LEFT' : 'RIGHT';
  return `${kind} R${num2(arc.radius / 8)} ${num2(ang)}°`;
}
