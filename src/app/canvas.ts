// The track canvas: a top-down stud grid where track is laid like in
// top-down train games. Click a grid point (or the end of a track) to start,
// move the mouse to see the planned track (straights and a curve of the chosen
// radius, ending on a 22.5-degree direction), click to lay it and carry on
// from its end; a right click (no drag) or Esc stops. Starting from the middle of a track
// branches off it (a switch). Select mode picks a track to edit or delete.
// Drag with the right or middle button (or Space + drag) to pan; the wheel
// zooms.
import { movedTable, type Table, TABLE_COLORS, tableInBox, tableMiddle, tableOutline } from './tables';
import { type Design, type DRoute, type DSeg, dualRailOffsets, freeName, isMono, routeGaugeStuds, toRoutes, type Trackwork } from './design';
import { hasPartOwn, inForce, inForceAll, resolveOptions } from './overrides';
import { expandStretches } from './stretches';
import { sleeperSpots } from '../geom/crossing';
import { poseToWorld, routeLength, routePose, routeSOf, worldToPose } from '../route/route';
import { forFingers } from './hints';
import { gaugeMeetPose, joinProblem, reversedRoute } from './routeedits';
import { LIMITS, radiusRange } from './limits';
import { cutSegs, joinInto, nearestAlong, routeStuds, splitProblem } from './splitmerge';
import { cleanCuts, cutLength, cutProblem, liveCuts } from './routecuts';
import { editSays, layOf, planSleepers, reverseShared, type SleeperEdit, type SleeperLay, SLEEPER_MOVE, sleeperProblem, withSleeperEdit } from './sleeperedits';
import { jointCutNear } from './jointcuts';
import { type CutPath, type Grid, gridPath, type NoCut, moveCorner, newPathId, PATH_MAX, pathProblem, pathTracks, type Pt as CutPt, snapToGrid } from './cutpaths';
import { dragResult, END_INSET_PX, guidedHandle, type Handle, type HandleKind, handleLabel, segmentHandles, visibleHandles, withValue } from './handles';
import { isEdit, reverseAnchors } from './twfollow';
import { type End, openEnds, type Placed, type Placement, placeTemplate, transformed } from './addtemplate';
import { reachStuds, SETTLE_MS, SnapSession, SPEED_WINDOW_MS } from './snapfeel';
import { lockedWhy } from './lock';
import { type MeasurePoint, measureBetween, measurePoint } from './measure';
import { applyCarry, type Carry, connectedSet, holds, type Joint, jointNames, joints, LOOP_OPENS_DEFAULT, type LoopOpens, openedBy, planCarry, poseAt, setApart, tidyExpert } from './connections';
import { type FreeItem, freeProblem, moveFree, nextFreeId, railEndTo, sleeperCorners } from './freeparts';
import { cleanRailEdits, deleteRailPiece, moveRailEdit, railEditAt, type RailEdits, railPieces, type RailSide, type RailWhat, setRailPiece, slideRailPiece, withRailEdit } from './railedits';
import { alongBeyond, isTw, TAP_PX, tapReach, type BoxItem, boxable, dragStretchEnd, dragStretchWhole, handTracks, hitItems, type Hit, type Item, itemsInBox, itemsLabel, jointsOf, moveCuts, sleeperEditAt, sleeperEditOf, type Layer, newStretchAt, type OwnItem, type PickId, PICKS, picks, placeAlong, sameItem, takesFirst, withStretch } from './items';
import type { Stretch } from './stretches';
import { COMMON_RADII, type GuideEnd, type GuideResult, type GuideStraight, guidePoint } from './guides';
import { describe, follow, plan, planAnyway, planAuto, planFreeTurning, planToPose, reversed, trace as traceRaw, type Pose } from './planner';

// Track outlines traced once and kept (they're in studs, the same at any
// zoom): tracing every track on every redraw made zooming and panning lag.
// (the points shared: nothing changes them)
const tracedPts = new Map<string, [number, number][]>();
function tracedOnce(key: string, make: () => [number, number][]) {
  let v = tracedPts.get(key);
  if (!v) { if (tracedPts.size > 20000) tracedPts.clear(); v = make(); tracedPts.set(key, v); }
  return v;
}
/** A route's box (studs), kept like its trace: the routes a pointer is nowhere near aren't walked along. */
const boxes = new Map<string, [number, number, number, number]>();
function routeBox(r: DRoute): [number, number, number, number] {
  const key = `${r.x},${r.y},${r.heading}${JSON.stringify(r.segs)}`;
  let b = boxes.get(key);
  if (!b) {
    if (boxes.size > 20000) boxes.clear();
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const q of trace(r, r.segs, 1)) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }
    const end = follow(r, r.segs);
    b = [Math.min(b[0], r.x, end.x), Math.min(b[1], r.y, end.y), Math.max(b[2], r.x, end.x), Math.max(b[3], r.y, end.y)];
    boxes.set(key, b);
  }
  return b;
}
const trace = (p: Pose, segs: DSeg[], step = 0.5) => tracedOnce(`t${p.x},${p.y},${p.heading},${step}${JSON.stringify(segs)}`, () => traceRaw(p, segs, step));

/** How big the ring round a problem's spot is at most, mm (a stud and a half). */
export const ISSUE_R = 12;
export interface Overlay { grooves: [number, number][][]; checkRails: [number, number][][]; crossings: [number, number][]; splits: [number, number][]; /** monorail points' toes (mm) */ monoPoints?: [number, number][]; grips?: [number, number][]; items?: OverlayItem[];
  /** where the track's cut across into track pieces, mm (a route card's Keep the cuts it has now) */ joints?: [number, number][];
  /** for cut paths (expert): the stud grid in force (mm; degrees), the rails' offset, where no cut goes; and the paths the last build didn't make, with why */
  cutting?: { grid: [number, number, number]; railG: number; no: NoCut }; pathsNot?: { id: string; why: string }[];
  /** the cuts worked out where tracks join inside trackwork (Cut where tracks join in trackwork, jointcuts.ts): each one's joint and corners (mm), and whether the build made it */
  jointCuts?: { at: [number, number]; pts: [number, number][]; made: boolean }[];
  /** (expert) where tracks run over each other (mm), which two, and whether the pair is accepted (accept.ts) */ over?: { at: [number, number]; routes: [string, string]; ok: boolean }[];
  /** what's wrong, and where (mm): ringed in red */ issues?: { at: [number, number]; r: number; text: string; /** r is the size of the thing itself (a part too big for the bed): ringed whole; else the ring is kept small, on the spot */ area?: boolean }[] }
/** A trackwork item on the plan (mm); a lever ('throw') has its points' frame and settings, to drag it. */
export interface OverlayItem { kind: string; key: string; at: [number, number]; pts: [number, number][]; dir?: [number, number]; /** (points) each blade's line (mm), which is fixed, both on one plate */ blades?: [number, number][][]; fixed?: number; joined?: boolean;
  /** points: taken out (off), made by hand (forced), or a near miss where they could be forced (cand) */
  off?: boolean; forced?: boolean; cand?: { ok: boolean; why: string }; routes?: string[]; /** (points) a double slip's other set at the same end */ mate?: string;
  lever?: { frame: [number, number, number]; side: number; stockX: number; edge: number; minD: number; pivotY: number; maxTine: number; leverOffset: number; springLength: number; blade?: 'left' | 'right' } }

/** A button on the touch bar (canvas touchTools): id, the key it stands for (or alt, joined); on: a toggle that's on; off: can't now. */
export type TouchTool = { id: string; label: string; title: string; on?: boolean; off?: boolean; primary?: boolean; group?: number };
export interface CanvasHost {
  design(): Design;
  /** The design changed (commit = an action finished, worth an undo step). */
  changed(commit: boolean): void;
  select(route: number | undefined): void;
  /** Curve radius in studs; 0 = auto (standard radii, 22.5-degree ends); -1 = free (any radius and angle). */
  radius(): number;
  /** Points to throw in the 3D view (the touch bar's Throw), by their key. */
  throwPoints?(key: string): void;
  /** What a click or drag would do now, and where the mouse is (studs), for the status line. */
  status?(hint: string, at: [number, number] | undefined): void;
  /** Draw mode wanted (Enter on a route's end). */
  enterDraw?(): void;
  /** Put a template being placed (Add to design) on the design as placed: undefined to cancel it. */
  place?(tpl: Design, placement: Placement): void;
  /** Split the route at studs along it (whole studs): undefined when done, else why not. */
  split?(route: number, studs: number): string | undefined;
  /** Cut the route into parts by hand at studs along it (a hand cut, its track still one route): undefined when done, else why not. */
  cut?(route: number, studs: number): string | undefined;
  /** Esc with nothing being drawn: back to Select mode. */
  leaveDraw?(): void;
  /** What new routes are: train track or monorail (Draw's Track choice). */
  system?(): 'train' | 'monorail';
  /** The forms show the design as it is now, mid-drag (a handle being dragged). */
  live?(route?: number): void;
  /** The design as it was at the last finished action (a drag cancelled with Esc: nothing of it kept). */
  revert?(): void;
  /** The item selected on the plan changed, or what it says of itself (a cut, a cut path, a stretch, a joint: the selection bar and its card). */
  item?(): void;
}

/** How long segments run along their centre line, studs. */
export const segsStuds = (segs: DSeg[]) => segs.reduce((t, sg) => t + (sg.kind === 'straight' ? sg.studs : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180), 0);
const MM = 8; // mm per stud
const MONO_HW = 15.9, MONO_RIDGE_HW = 3.2; // the monorail beam's and its ridge's half-widths, mm (monorail_lib.scad)

/** Can a lever be moved along the points (its spring tines longer or shorter)? Only on tines: the plate-style lever is level with the slider bar. */
export const leverSlides = (d: Design) => d.options?.mechStyle === 'tines';

/**
 * A three-way's two levers (threeWayLevers 2) share their points' edit (one toe): one of them moved out or in (undefined: back to where
 * it's worked out) is kept as its own (each), the other left where it was (an edit from before each had its own moved both: kept for it).
 */
export function eachLever(e: NonNullable<Trackwork['throw']>[string] | undefined, blade: 'left' | 'right', leverOffset: number | undefined): NonNullable<Trackwork['throw']>[string] {
  const { leverOffset: both, each, side: _side, ...rest } = e ?? {}, other = blade === 'left' ? 'right' : 'left';
  const o = each?.[other] ?? (both !== undefined ? { leverOffset: both } : undefined);
  const mine = leverOffset !== undefined ? { [blade]: { leverOffset } } : {};
  return { ...rest, ...((o || leverOffset !== undefined) && { each: { ...mine, ...(o && { [other]: o }) } }) };
}

/** Which way round a lever is, and what set it: dragged across by hand, the branch route's own setting, the Settings' Lever side, or auto (away from the branch). */
export interface LeverSide { side: 'left' | 'right'; by: 'hand' | 'route' | 'options' | 'auto'; main?: string; branch?: string; why: string }
export function leverSide(d: Design, lever: OverlayItem, items: OverlayItem[]): LeverSide {
  const side = (lever.lever?.side ?? 1) > 0 ? 'right' : 'left';
  const ids = items.filter((it) => it.kind === 'points' && it.key === lever.key && !it.cand).flatMap((it) => it.routes ?? []);
  const main = ids[0], branches = [...new Set(ids.slice(1))].filter((id) => id !== main);
  const routeOf = (id: string) => d.routes.find((r, i) => (r.name || String(i)) === id);
  // (a setting that would put it the other side isn't the one that did: a three-way takes its first branch's)
  const own = branches.find((id) => routeOf(id)?.throwSide === side);
  const branch = own ?? branches[0], opt = d.options?.throwSide ?? 'auto';
  // (a three-way with a lever to each blade: one each side, whatever's set)
  if (branches.length > 1 && d.options?.threeWayLevers === 2 && d.options?.mechStyle !== 'tines') return { side, by: 'auto', main, branch, why: 'a three-way with two levers has one each side (Three-way switches worked by, in the Settings)' };
  if (d.trackwork?.throw?.[lever.key]?.side) return { side, by: 'hand', main, branch, why: 'dragged there on the plan' };
  if (own) return { side, by: 'route', main, branch, why: `${own}'s own Lever side (on its card)` };
  if (opt === side) return { side, by: 'options', main, branch, why: 'Lever side in the Settings' };
  return { side, by: 'auto', main, branch, why: branches.length > 1 ? 'auto: a three-way\'s goes on the right' : branch ? `auto: away from ${branch}, the branch` : 'auto: away from the branch' };
}

/** A key pressed while typing in a field (a number, a name, a drop-down): not a shortcut. (A slider or a tick box isn't typed in: with
 * the Explode slider last touched, no shortcut worked, and Ctrl+A selected the page's text.) */
export function typingIn(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.tagName === 'INPUT') return !['range', 'checkbox', 'radio', 'color', 'button', 'file'].includes((t as HTMLInputElement).type);
  return !!t && (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
/** A dialog open over the page (the parts list, Help, a setting's pictures): a key pressed then isn't one of the plan's shortcuts. */
export const dialogOpen = () => !!document.querySelector('dialog[open]');
/** Several cuts and cut paths as they were before a move of them all: the cuts by track and place, each such track's cuts, the paths' corners. */
interface MultiOrig { cuts: { route: number; at: number }[]; was: Map<number, number[]>; paths: { id: string; pts: CutPt[] }[] }
/** (Cut into print parts: No) The colour of hand cuts and cut paths, kept in the design and not made, and the plan's note by the first of them. */
const UNCUT_GREY = '#8a8f98';
export const UNCUT_NOTE = 'Not cut: Cut into print parts is No (Settings)';
/** What a press on the plan takes hold of (TrackCanvas hitTest). */
type PlanHit = { kind: 'handle'; handle: Handle } | { kind: 'lever'; it: OverlayItem } | { kind: 'tw'; it: OverlayItem } | { kind: 'blade'; key: string; blade: 0 | 1; d: number; heel: boolean } | { kind: 'mark'; mark: NonNullable<ReturnType<TrackCanvas['itemAt']>> }
  | { kind: 'end'; route: number; end: 'start' | 'end' } | { kind: 'item'; hit: Hit } | { kind: 'table'; table: number } | { kind: 'route'; route: number };
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

export class TrackCanvas {
  private ctx: CanvasRenderingContext2D;
  private scratch: HTMLCanvasElement | undefined;
  private scale = 6;            // px per stud
  private ox = 0; private oy = 0; // screen px of world (0, 0)
  private mouse: [number, number] | undefined;   // world, studs
  private panning: { x: number; y: number; ox: number; oy: number; right?: boolean; moved?: boolean } | undefined;
  private space = false;
  mode: 'draw' | 'select' | 'measure' = 'select';
  /** Measure: the two points clicked (the second not yet: the pointer's). Not saved. */
  private meas: { a?: MeasurePoint; b?: MeasurePoint } = {};
  private measureAt(w: [number, number]): MeasurePoint { return measurePoint(this.host.design().routes, w, this.reach(14), this.guided(w)); }
  /** Moving the selected tracks: where the press was (studs) and where they started. */
  private moving: { x: number; y: number; orig: { i: number; x: number; y: number }[]; tables?: { k: number; orig: Table }[]; moved: boolean; said?: boolean;
    /** the tracks joined to them, that go along (not with Alt held: alone), and the joints between the two (open, with Alt) */
    carried: { i: number; x: number; y: number }[]; watch: Joint[]; alone?: boolean; by?: [number, number] } | undefined;
  // ---------- connections (expert): joined tracks go together (connections.ts) ----------
  /** The design's joints, worked out again only when its tracks have changed (jointList: for the Trackwork panel's rows). */
  private jointsKey = '';
  private jointsList: Joint[] = [];
  jointList(): Joint[] { return this.joints(); }
  private joints(): Joint[] {
    const d = this.host.design();
    const key = JSON.stringify([d.gaugeStuds, d.expert?.apart, d.routes.map((r) => [r.name, r.x, r.y, r.heading, r.segs, r.system, r.gaugeStuds, r.dualGauge, r.dualGaugeStuds, r.dualShared, r.startEnd, r.endEnd])]);
    if (key !== this.jointsKey) {
      this.jointsKey = key; this.jointsList = joints(d);
      // (and the ends joined to nothing, for the plan's small rings: not a buffer stop's)
      const joined = new Set<string>();
      for (const j of this.jointsList) { joined.add(`${j.a}${j.aEnd}`); if (j.bEnd) joined.add(`${j.b}${j.bEnd}`); }
      this.openEnds = [];
      d.routes.forEach((r, i) => {
        if (!r.segs.length) return;
        if (!joined.has(`${i}start`) && r.startEnd !== 'buffer') this.openEnds.push([r.x, r.y]);
        if (!joined.has(`${i}end`) && r.endEnd !== 'buffer') { const e = follow(r, r.segs); this.openEnds.push([e.x, e.y]); }
      });
    }
    return this.jointsList;
  }
  private openEnds: [number, number][] = [];
  /** These tracks and every track joined to them, directly or through others (what a move, a turn or a mirror takes along). */
  withJoined(routes: readonly number[]): number[] { return connectedSet(this.host.design(), routes, this.joints()); }
  /** The selected tracks begin to move from w (studs): where they and the tracks joined to them are now. */
  private startMoving(w: [number, number], routes: number[], tables?: { k: number; orig: Table }[]) {
    const d = this.host.design(), js = this.joints(), sel = new Set(routes), place = (i: number) => ({ i, x: d.routes[i].x, y: d.routes[i].y });
    this.moving = { x: w[0], y: w[1], moved: false, orig: routes.map(place), tables, carried: this.withJoined(routes).filter((i) => !sel.has(i)).map(place), watch: js.filter((j) => !j.apart && sel.has(j.a) !== sel.has(j.b)) };
  }
  /** The tracks joined to the ones being moved: as far over as they are, or (alone, Alt) back where they were. */
  private moveCarried(alone: boolean) {
    const m = this.moving, d = this.host.design();
    if (!m?.by) return;
    m.alone = alone;
    for (const o of m.carried) if (d.routes[o.i]) { d.routes[o.i].x = alone ? o.x : Math.round((o.x + m.by[0]) * 1e4) / 1e4; d.routes[o.i].y = alone ? o.y : Math.round((o.y + m.by[1]) * 1e4) / 1e4; }
  }
  /** A track being reshaped (an end or a handle dragged): what it carries, and the joints open now that were closed when it began. */
  private carrying(route: number, fixed: 'start' | 'end', s0: number): { plan: Carry; skip: Set<number>; open: Joint[] } {
    const plan = planCarry(this.host.design(), route, fixed, s0, this.joints(), this.loopOpens);
    return { plan, skip: new Set(plan.groups.flatMap((g) => g.routes.map((o) => o.i))), open: [] };
  }
  /** The carried tracks put where the reshaped one takes them now (alone, Alt: left where they were). True if any moved. */
  private carry(c: { plan: Carry; open: Joint[] } | undefined, alone: boolean): boolean {
    if (!c) return false;
    const d = this.host.design(), any = applyCarry(c.plan, d, alone);
    c.open = openedBy(c.plan, d);
    return any;
  }
  /** The tracks a drag is carrying now: not snapped to, nor taken guides from (they move with it). */
  private carriedNow(): Set<number> | undefined { return this.alt ? undefined : (this.drag?.carry ?? this.handleDrag?.carry)?.skip; }
  // ---------- the typed selection (items.ts): tracks and tables, and one cut, cut path, stretch or joint ----------
  /**
   * The item selected that isn't a track or a table: a cut across a track, a cut path, a stretch of a track with its own
   * settings, or a joint (a click on a joined end). One at a time; the tracks and tables are selected beside it
   * (selection, tableSelection): a stretch's track stays selected, a cut's and a cut path's don't.
   */
  private selItemNow: OwnItem | undefined;
  get selItem(): OwnItem | undefined { return this.selItemNow; }
  private setItem(v: OwnItem | undefined) { if (sameItem(v, this.selItemNow) && !this.selAlso.length) return; this.selAlso = []; this.selItemNow = v; this.host.item?.(); }
  /**
   * Several at once: the other cuts across tracks and cut paths selected beside selItem (a box round them with only cuts
   * picked, Shift+click, or a finger held on one). Together they're moved (dragged, or by the arrow keys) and taken
   * out; anything else selected lets go of them (setItem). They go by their places in their lists, as selItem does.
   */
  private selAlso: BoxItem[] = [];
  /** The selected cut, cut path, stretch or joint, and the cuts and cut paths selected with it. */
  selItems(): OwnItem[] { return this.selItemNow ? [this.selItemNow, ...this.selAlso] : []; }
  private setItems(list: BoxItem[]) { this.selItemNow = list[0]; this.selAlso = list.slice(1); this.host.item?.(); }
  /** A cut or a cut path added to the ones selected, or taken out of them (Shift+click, a finger held on it). */
  private toggleItem(it: BoxItem) {
    const all = this.selItems().filter(boxable), next = all.some((q) => sameItem(q, it)) ? all.filter((q) => !sameItem(q, it)) : [...all, it];
    if (this.selection().length || this.tableSelection().length) this.setSelection([]);
    if (next.length) this.setItems(next); else this.setItem(undefined);
    if (next.length > 1) this.say(`${itemsLabel(next)} · drag one to move them all · Delete takes them out`, 4000);
    this.draw();
  }
  /** Everything selected, each with its kind: the tracks (the main one first), the tables, and the item (or the several cuts). */
  items(): Item[] {
    return [...this.selection().map((route): Item => ({ kind: 'route', route })), ...this.tableSelection().map((table): Item => ({ kind: 'table', table })), ...this.selItems()];
  }
  /** Select a cut, a cut path, a stretch or a joint (undefined: none): a stretch with its track, the others alone. */
  selectItem(v: OwnItem | undefined) {
    if (v && v.kind === 'stretch') { if (this.selection().length !== 1 || this.selected !== v.route || this.tableSelection().length) this.setSelection([v.route]); }
    else if (v && (this.selection().length || this.tableSelection().length)) this.setSelection([]);
    this.setItem(v); this.draw();
  }
  /** Expert tools shown (main.ts: remembered per browser): cuts, cut paths and stretches can be picked on the plan. */
  expert = true;
  /** Where a loop that can't stay closed opens when a track in it is reshaped (connections.ts LoopOpens; the expert tools' Loops open at). */
  loopOpens: LoopOpens = LOOP_OPENS_DEFAULT;
  /** The expert tools hidden: whatever of theirs is being drawn, dragged or waited for is let go of, and a selected cut, cut path or stretch too. */
  stopExpert() {
    this.cutArmed = false; this.stretchArmed = false; this.stretchNew = undefined; this.pathDraw = undefined; this.cutDrag = undefined; this.multiDrag = undefined; this.stretchDrag = undefined; this.sleeperDrag = undefined; this.railDrag = undefined; this.sleeperArmed = false;
    if (this.selItemNow && this.selItemNow.kind !== 'joint') this.setItem(undefined);
    this.draw();
  }
  /** The Pick list: what a click on the plan takes (items.ts PICKS). */
  pick: PickId = 'all';
  /** (expert) By hand only (the legend's button): every track with nothing by hand is drawn faint (items.ts handTracks); with the expert tools shown. */
  dimPlain = false;
  /** May a click take something of this layer now? In Select what the Pick list says; drawing and measuring, everything as ever. */
  private picks(layer: Layer) { return picks(this.mode === 'select' ? this.pick : 'all', layer, this.expert); }
  /** A finger on a touch screen (not a mouse): bigger marks, and bigger reach on a layer picked alone. */
  private fingers() { return this.touching || matchMedia('(pointer: coarse)').matches; }
  /** How near a press must be to take a marker of this layer, studs (items.ts tapReach). */
  private tapAt(layer: Layer) { const t = tapReach(this.mode === 'select' ? this.pick : 'all', layer, this.fingers()); return { near: this.reach(t.near), point: this.reach(t.point) }; }
  private jointsAt(route: number, end: 'start' | 'end'): Joint[] { return this.joints().filter((j) => (j.a === route && j.aEnd === end) || (j.b === route && j.bEnd === end)); }
  /**
   * The selected joint (a joined end clicked; or, with just two tracks selected, where those two meet: a branch's joint is under its
   * points, which take the click): its tracks' names, and whether any of it is joined, or taken apart (the selection bar's Take apart and Join).
   */
  jointSelected(): { names: string; joined: boolean; apart: boolean; joints: Joint[] } | undefined {
    const sj = this.selItemNow?.kind === 'joint' ? this.selItemNow : undefined, d = this.host.design(), two = !sj && !this.tableSelection().length && this.selection().length === 2 ? this.selection() : undefined;
    const js = sj && d.routes[sj.route] ? jointsOf(sj, this.joints()) : two ? this.joints().filter((j) => (j.a === two[0] && j.b === two[1]) || (j.a === two[1] && j.b === two[0])) : [];
    return js.length ? { names: jointNames(d, js), joined: js.some((j) => !j.apart), apart: js.some((j) => j.apart), joints: js } : undefined;
  }
  /** The selected joint taken apart (its tracks still touch, but each moves and is reshaped on its own), or joined again. One undo step. */
  takeApart(on: boolean) {
    const sel = this.jointSelected(), d = this.host.design(), id = (i: number) => d.routes[i].name || String(i);
    if (!sel) return;
    for (const j of sel.joints) setApart(d, id(j.a), id(j.b), on);
    this.host.changed(true); this.host.item?.();
    this.say(on ? `Took ${sel.names} apart: each moves on its own now · Join puts them back together` : `Joined ${sel.names}: they move together again`);
  }
  /** a table being dragged by its handle (its name, in its middle): which, where from, as it was */
  private tableDrag: { k: number; x: number; y: number; orig: Table; moved: boolean } | undefined;
  /** the table whose handle (its name, in its middle) is within reach of a point (studs), if any */
  private tableHandle(w: [number, number]): number | undefined {
    const ts = this.host.design().tables ?? [];
    for (let k = ts.length - 1; k >= 0; k--) { const m = tableMiddle(ts[k]); if (Math.hypot(m[0] - w[0], m[1] - w[1]) < this.reach(16)) return k; }
    return undefined;
  }
  /** A selection box being dragged out (studs), and whether it adds to the selection. */
  private box: { x0: number; y0: number; x1: number; y1: number; add: boolean; /** (adding) the cuts and cut paths selected before */ items?: BoxItem[] } | undefined;
  /** While drawing: the route being extended (or a new one not yet added), and where it ends. */
  private active: { route: number | undefined; start?: Pose; end?: Pose; newRoute?: DRoute; either?: number; from?: number } | undefined;
  /** Starting on a track (its start, or along it): lay the new track whichever way the mouse is, along it or back out of it. */
  private aimEither() {
    const a = this.active;
    if (!a || a.either === undefined || a.route !== undefined || !a.start || !this.mouse || a.newRoute) return;
    const h = a.either, dx = this.mouse[0] - a.start.x, dy = this.mouse[1] - a.start.y;
    const ahead = -dx * Math.sin((h * Math.PI) / 180) + dy * Math.cos((h * Math.PI) / 180) >= 0;
    const heading = ahead ? h : ((h + 360) % 360) - 180;
    a.start = { ...a.start, heading }; a.end = a.start;
  }
  selected: number | undefined;
  /** More selected routes (Shift+click in Select mode), besides selected. */
  extra = new Set<number>();
  /** Every selected route, the main one first. */
  selection(): number[] {
    return this.selected === undefined ? [...this.extra] : [this.selected, ...[...this.extra].filter((i) => i !== this.selected)];
  }
  /** The selected tables (by their place in the design's list): select all, a box round them, or a click on one's name. */
  private selTables = new Set<number>();
  tableSelection(): number[] { const n = this.host.design().tables?.length ?? 0; return [...this.selTables].filter((k) => k < n).sort((a, b) => a - b); }
  setSelection(list: number[], tables: number[] = []) {
    this.setItem(undefined);
    this.selected = list[0]; this.extra = new Set(list.slice(1)); this.selTables = new Set(tables); this.host.select(this.selected); this.draw();
  }
  /** The plan's zoom and offset (a report keeps them, to show the same view again). */
  view() { return { scale: this.scale, ox: this.ox, oy: this.oy }; }
  setView(v: { scale: number; ox: number; oy: number }) { if (v.scale > 0 && Number.isFinite(v.ox) && Number.isFinite(v.oy)) { this.scale = Math.min(80, Math.max(0.5, v.scale)); this.ox = v.ox; this.oy = v.oy; this.draw(); } }
  /** The snapped grid point under the mouse (studs), if over the plan. */
  mouseStuds(): [number, number] | undefined { return this.mouse ? this.snap(this.mouse) : undefined; }
  private overlayNow: Overlay | undefined;
  /** A lever just let go of, shown where it was put until the rebuilt plan arrives with it there. */
  private leverPending: { key: string; at: [number, number]; arm: [number, number][] } | undefined;
  get overlay() { return this.overlayNow; }
  set overlay(o: Overlay | undefined) { this.overlayNow = o; }
  /** The overlay now is of the design as it was last let go of: show the levers where they were built (on the stud grid, as far as they could go). */
  settled() { this.leverPending = undefined; }
  /** A trackwork item to pick out (hovered in the Trackwork panel). */
  highlight: string | undefined;
  /** A place to pick out (studs): a joint hovered in the Trackwork panel. */
  highlightAt: [number, number] | undefined;
  /** The routes points thrown in the 3D view are set for now (mm, each a line along the track from their toe): picked out on the plan. */
  setRoutes: [number, number][][] = [];
  /** A route's straight or curve to pick out (hovered in its card's Shape): [route, piece]. */
  highlightSeg: [number, number] | undefined;
  /** Plan layers turned off from the legend: grooves, checks, crossings, ballast, baseplate, points, levers, grips. */
  hidden = new Set<string>();
  /** Dragging a track's end: which route and end, where the press was, and the route as it was. */
  private drag: { route: number; end: 'start' | 'end'; sx: number; sy: number; moved: boolean; orig: DRoute; anchor: number; lastGood?: DRoute; carry?: { plan: Carry; skip: Set<number>; open: Joint[] } } | undefined;
  /** Dragging a curve's or straight's handle (angle, radius, length): which, and the segment as it was. */
  private handleDrag: { route: number; seg: number; kind: HandleKind; orig: DSeg; moved: boolean; sx: number; sy: number; why?: string; carry?: { plan: Carry; skip: Set<number>; open: Joint[] } } | undefined;
  /** A short message in the hint line (why something wasn't done), for a few seconds. */
  private noteText: string | undefined;
  private noteTimer = 0;
  say(text: string, ms = 3500) { this.noteText = text; clearTimeout(this.noteTimer); this.noteTimer = window.setTimeout(() => { this.noteText = undefined; this.draw(); }, ms); this.draw(); }
  /** The handle the keyboard is on (Tab moves it, arrows change it), of the selected route. */
  private kbHandle: { seg: number; kind: HandleKind } | undefined;
  /** Drawing by keyboard: arrow keys move the crosshair (the pointer's place) a stud, Enter lays track. */
  private kbDraw = false;
  private kbHandleNow(): Handle | undefined { const k = this.kbHandle; return k ? this.handles().find((h) => h.seg === k.seg && h.kind === k.kind) : undefined; }
  /** A route picked by [ and ] (next: 1, previous: -1): the one after the selected, round the list, brought into view. */
  private cycle(dir: 1 | -1) {
    const n = this.host.design().routes.length;
    if (!n) return;
    const cur = this.selection().length === 1 ? this.selection()[0] : this.selected ?? (dir > 0 ? -1 : 0);
    const next = (((cur + dir) % n) + n) % n;
    this.kbHandle = undefined;
    this.setSelection([next]);
    const r = this.host.design().routes[next], b = routeBox(r), [cx, cy] = this.toScreen((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), W = this.el.clientWidth, H = this.el.clientHeight;
    if (cx < 20 || cy < 60 || cx > W - 20 || cy > H - 20) { this.ox += W / 2 - cx; this.oy += H / 2 - cy; this.draw(); }
    this.say(`${r.name || `Route ${next + 1}`} selected (${next + 1} of ${n})`, 2000);
  }
  /** The keyboard's handle changed by dir (+1 or -1) of its natural step: a stud, a degree (Shift: 8 studs, 11.25°). */
  private nudgeHandle(dir: 1 | -1, big: boolean) {
    const h = this.kbHandleNow(), ri = this.selection()[0], r = this.host.design().routes[ri];
    if (!h || !r) return;
    const sg = r.segs[h.seg], step = h.kind === 'angle' ? (big ? 11.25 : 1) : big ? 8 : 1;
    const cur = sg.kind === 'straight' ? sg.studs : h.kind === 'angle' ? Math.abs((sg as Extract<DSeg, { kind: 'curve' }>).angle) : (sg as Extract<DSeg, { kind: 'curve' }>).radius;
    const [lo, hi] = h.kind === 'angle' ? [1, LIMITS.angle[1]] : h.kind === 'radius' ? [radiusRange(r)[0], radiusRange(r)[1]] : [1, LIMITS.straight[1]];
    const v = Math.round((cur + dir * step) * 1e6) / 1e6;
    if (v < lo || v > hi) { this.say(`${h.kind === 'angle' ? 'A curve turns' : h.kind === 'radius' ? 'A radius is' : 'A straight is'} ${v < lo ? `at least ${lo}${h.kind === 'angle' ? '°' : ' studs'}` : `at most ${hi}${h.kind === 'angle' ? '°' : ' studs'}`}`, 2500); return; }
    // (what's joined to the track past this piece goes with it)
    const c = r.locked ? undefined : this.carrying(ri, 'start', segsStuds(r.segs.slice(0, h.seg)));
    r.segs[h.seg] = withValue(sg, h.kind, h.kind === 'angle' ? Math.sign((sg as Extract<DSeg, { kind: 'curve' }>).angle) * v : v);
    this.carry(c, false);
    this.host.changed(true); this.host.live?.(ri);
    this.say(c?.open.length ? `${handleLabel(r.segs[h.seg])} · opened the joint between ${jointNames(this.host.design(), c.open)}` : handleLabel(r.segs[h.seg]), c?.open.length ? 3500 : 2000);
  }
  /** Enter on a selected route: lay track on from its end (Shift: from its start), by keyboard. */
  private startKeyboardDraw(which: 'start' | 'end') {
    const ri = this.selection()[0], r = this.host.design().routes[ri];
    if (!r) return;
    const lock = lockedWhy(this.host.design(), [ri]);
    if (which === 'end' && lock) { this.say(lock); return; }
    this.host.enterDraw?.();
    const e = follow(r, r.segs), pose: Pose = which === 'end' ? e : { x: r.x, y: r.y, heading: r.heading };
    if (which === 'end') this.active = { route: ri, end: pose };
    else { const p = { x: r.x, y: r.y, heading: r.heading }; this.active = { route: undefined, start: p, end: p, either: r.heading, from: ri }; }
    const u: [number, number] = which === 'end' ? [-Math.sin((pose.heading * Math.PI) / 180), Math.cos((pose.heading * Math.PI) / 180)] : [Math.sin((pose.heading * Math.PI) / 180), -Math.cos((pose.heading * Math.PI) / 180)];
    this.mouse = [Math.round(pose.x + u[0] * 4), Math.round(pose.y + u[1] * 4)];
    this.kbDraw = true; this.aimEither(); this.draw();
  }
  /** A template being placed on the design (Add to design): the group follows the pointer, a click puts it down. */
  private placing: { tpl: Design; turn: number; mirror: boolean; onto?: End; theirs: End[]; moved: boolean; session: SnapSession; settle?: number } | undefined;
  get isPlacing() { return !!this.placing; }
  /** Start placing a copy of a template: onto, the design end it starts on (before the pointer moves). */
  startPlacing(tpl: Design, onto?: End) {
    this.letGoSome();
    this.placing = { tpl, turn: 0, mirror: false, onto, theirs: openEnds(this.host.design().routes), moved: false, session: new SnapSession() };
    this.draw();
  }
  private letGoSome() { this.heelDrag = undefined; this.freeArmed = undefined; this.freeDrag = undefined; this.splitArmed = false; this.cutArmed = false; this.stretchArmed = false; this.sleeperArmed = false; this.sleeperDrag = undefined; this.railDrag = undefined; this.stretchNew = undefined; this.stretchDrag = undefined; this.pathDraw = undefined; this.cutDrag = undefined; this.multiDrag = undefined; this.meas = {}; this.active = undefined; }
  /** Where the template being placed goes now (final: the click that puts it down, which snaps whatever the pointer's speed). */
  private placedNow(final = false): Placed | undefined {
    const p = this.placing;
    if (!p) return undefined;
    const at: [number, number] = this.mouse ?? this.toWorld(this.el.clientWidth / 2, this.el.clientHeight / 2);
    // (the reach and feel are the layout designer's: snapfeel.ts; Alt: no snapping)
    return placeTemplate(this.host.design(), p.tpl, at, p.turn, p.mirror, reachStuds(this.scale, this.touching), p.moved || this.alt ? undefined : p.onto, this.alt ? [] : p.theirs, { session: p.session, final });
  }
  /** The pointer moved while placing: its speed noted (a fast move starts no snap), and a redraw once it has stood still a moment. */
  private placingMoved(sx: number, sy: number) {
    const p = this.placing!;
    p.session.meter.sample(sx, sy, performance.now());
    clearTimeout(p.settle);
    if (p.session.meter.isFast()) p.settle = window.setTimeout(() => { if (this.placing !== p) return; p.session.meter.sample(sx, sy, performance.now() + SPEED_WINDOW_MS); this.drawSoon(); }, SETTLE_MS);
  }
  /** Split: the next click on the selected route cuts it there (from the selection bar's button). */
  splitArmed = false;
  /** Add a cut: the next click on the selected route cuts it into parts there by hand (from its card's Cuts into parts). */
  cutArmed = false;
  // ---------- cut paths (expert): drawn, selected and dragged on the plan (cutpaths.ts) ----------
  /** A cut path being drawn: its corners so far (studs, on the stud grid). Undefined: none is. */
  pathDraw: CutPt[] | undefined;
  /** A cut being dragged: a path's corner, a whole path, or a cut across a track along it; why: why it can't go where it is now. */
  private cutDrag: ({ kind: 'corner'; id: string; k: number; orig: CutPt[] } | { kind: 'path'; id: string; x: number; y: number; orig: CutPt[] } | { kind: 'cut'; route: number; orig: number[]; k: number }) & { moved: boolean; why?: string } | undefined;
  /** Several cuts and cut paths being dragged together: where the press was (studs), how they were, the one pressed; why: what holds them. */
  private multiDrag: { x: number; y: number; orig: MultiOrig; on: BoxItem; moved: boolean; why?: string } | undefined;
  /** The cut, cut path or other item the last press was on (a finger held on it adds it to the ones selected). */
  private pressed: OwnItem | undefined;
  /** A stretch being dragged along its track: one of its ends, or the whole; s0: how far along the press was; orig: its track's stretches as they were; why: what holds it short of the pointer. */
  private stretchDrag: { route: number; k: number; part: 'from' | 'to' | 'body'; s0: number; orig: Stretch[]; moved: boolean; why?: string } | undefined;
  /** (expert) A sleeper being dragged along its track: which (its edit's place), where the press was along the track, and its track's edits as they were. */
  private sleeperDrag: { route: number; at: number; add?: true; s0: number; orig: SleeperEdit[] | undefined; moved: boolean; why?: string } | undefined;
  /** (expert) Waiting for a click on the selected track, to add a sleeper there. */
  sleeperArmed = false;
  /** (stage 4) + Rail / + Sleeper: the next press on the plan lays one (a rail: pressed and dragged from end to end) */
  freeArmed: 'rail' | 'sleeper' | undefined;
  /** A rail or sleeper laid by hand being dragged: whole, or a rail's end; laying: the rail being drawn out now */
  private freeDrag: { id: string; part: 'body' | 'from' | 'to'; w0: [number, number]; orig: FreeItem; moved: boolean; why?: string; laying?: boolean } | undefined;
  /** Arm + Rail or + Sleeper (or let go of it: undefined). */
  armFree(k: 'rail' | 'sleeper' | undefined) { this.freeArmed = k; this.draw(); }
  /** How track i's sleepers are laid, and whether they go by whole studs (its underside on the baseplate's grid); undefined: it has no separate sleepers (ballast, a solid bed, monorail). */
  sleeperLay(i: number): (SleeperLay & { whole: boolean }) | undefined {
    const d = this.host.design(), r = d.routes[i];
    if (!r || isMono(r) || !r.segs.length) return undefined;
    const o = hasPartOwn(d) ? inForce(d, i) : resolveOptions(d, i);
    return o.ballast === 'none' && o.sleepers === 'sleepers' ? { ...layOf(r, o), whole: o.undersideGrid !== 'track' } : undefined;
  }
  /** Is a place along a track (studs) under a blade's moving length, by the last build's plan? */
  private underBlade(r: DRoute, at: number): boolean {
    const no = this.overlay?.cutting?.no;
    if (!no?.blades.length) return false;
    const q = placeAlong(r, at), px = q.x * MM, py = q.y * MM;
    return no.blades.some((bl) => bl.line.some((b, k) => {
      if (!k) return false;
      const a = bl.line[k - 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
      return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy) < bl.half;
    }));
  }
  /**
   * A sleeper's edit set (e), or taken off (undefined: the sleeper as the app lays it again; an added one gone):
   * undefined when done, else why it can't be (sleeperedits.ts sleeperProblem: the doc's words). In place; the caller
   * says the design changed.
   */
  setSleeper(item: { route: number; at: number; add?: true }, e: SleeperEdit | undefined): string | undefined {
    const r = this.host.design().routes[item.route], lay = this.sleeperLay(item.route);
    if (!r) return 'No such track';
    if (!lay) return 'This track has no separate sleepers: it is on ballast or a solid bed (its card › Bed and underside)';
    const k = sleeperEditAt(r, item), list = withSleeperEdit(r.sleeperEdits, k < 0 ? undefined : k, e && editSays(e) ? e : undefined);
    const blade = (at: number) => this.underBlade(r, at), why = sleeperProblem(r, list ?? [], lay, lay.whole, blade);
    // (what was wrong already isn't this edit's fault: it's let through, so a track reshaped can be put right one sleeper at a time)
    if (why && why !== sleeperProblem(r, r.sleeperEdits ?? [], lay, lay.whole, blade)) return why;
    if (list) r.sleeperEdits = list; else delete r.sleeperEdits;
    return undefined;
  }
  /** Wait for a click on the selected route, to add a sleeper there. */
  sleeperHere() {
    if (this.selection().length !== 1 || this.tableSelection().length) { this.say('Select one route to add a sleeper to it'); return; }
    if (!this.sleeperLay(this.selection()[0])) { this.say('This track has no separate sleepers: it is on ballast or a solid bed'); return; }
    this.splitArmed = false; this.cutArmed = false; this.stretchArmed = false; this.sleeperArmed = true; this.draw();
  }
  /** The sleeper being dragged, taken to the pointer along its track: by whole studs on the baseplate's grid, quarter studs on a track-lined underside; where it can't be, why is said and it stays. */
  private dragSleeper(p: [number, number]) {
    const sd = this.sleeperDrag!, r = this.host.design().routes[sd.route], lay = this.sleeperLay(sd.route);
    if (!r || !lay) return;
    const step = lay.whole ? 1 : 0.25, by = Math.round((alongBeyond(r, p) - sd.s0) / step) * step;
    const base = sleeperEditOf({ sleeperEdits: sd.orig }, sd), move = Math.min(SLEEPER_MOVE, Math.max(-SLEEPER_MOVE, (base.move ?? 0) + by));
    if ((sleeperEditOf(r, sd).move ?? 0) === move && !sd.why) return;
    const prev = r.sleeperEdits;
    if (sd.orig) r.sleeperEdits = structuredClone(sd.orig); else delete r.sleeperEdits;
    const { move: _m, ...rest } = base;
    sd.why = this.setSleeper(sd, { ...rest, ...(move && { move }) });
    if (sd.why) { if (prev) r.sleeperEdits = prev; else delete r.sleeperEdits; return; }
    sd.moved = true; this.host.changed(false); this.host.live?.(sd.route); this.host.item?.();
  }
  /** (expert) A rail edit being dragged along its track (a gap, a stretch of guard rails, a check rail added by hand): which (its place in its list as it was at the press: the list is put in order again as it moves), where the press was along the track, and the track's rail edits as they were. */
  private railDrag: { route: number; what: RailWhat; k: number; s0: number; orig: RailEdits; moved: boolean; why?: string;
    /** (stage 3) a running rail's piece instead: its side, its end dragged or the whole, and where it ran at the press */
    run?: { side: RailSide; part: 'from' | 'to' | 'body'; was: { from: number; to: number } } } | undefined;
  /** The rail edit being dragged, taken to the pointer along its track: a gap by quarter studs, a stretch of rail by whole studs; where it can't be, why is said and it stays. */
  private dragRail(w: [number, number]) {
    const rd = this.railDrag!, r = this.host.design().routes[rd.route];
    if (!r) return;
    if (rd.run) {
      // (a running rail: an end dragged longer or shorter, or the whole slid along, by whole studs)
      const by = Math.round(alongBeyond(r, w) - rd.s0), was = { ...r, railEdits: rd.orig }, ru = rd.run;
      const put = ru.part === 'body' ? slideRailPiece(was, ru.side, rd.k, by) : setRailPiece(was, ru.side, rd.k, ru.part === 'from' ? ru.was.from + by : ru.was.from, ru.part === 'to' ? ru.was.to + by : ru.was.to);
      rd.why = put.why;
      if (!put.edits) return;
      r.railEdits = put.edits;
      if (by) rd.moved = true;
      this.host.changed(false); this.host.live?.(rd.route); this.host.item?.();
      return;
    }
    const by = alongBeyond(r, w) - rd.s0, step = rd.what === 'gap' ? Math.round(by * 4) / 4 : Math.round(by);
    const put = moveRailEdit({ ...r, railEdits: rd.orig }, rd.what, rd.k, step);
    rd.why = put.why;
    if (!put.edits) return;
    r.railEdits = put.edits;
    this.selItemNow = { kind: 'rail', route: rd.route, what: rd.what, k: put.k! };
    if (step) rd.moved = true;
    this.host.changed(false); this.host.live?.(rd.route); this.host.item?.();
  }
  /** A rail or sleeper laid by hand dragged: whole by whole studs (a sleeper by half studs), or a rail's end to the stud nearest the pointer; where it can't be, why. */
  private dragFree(w: [number, number]) {
    const fd = this.freeDrag!, list = this.host.design().expert?.free ?? [], k = list.findIndex((f) => f.id === fd.id);
    if (k < 0) return;
    let next: FreeItem | undefined;
    if (fd.part === 'body') { const q = fd.orig.kind === 'sleeper' ? 2 : 1, dx = Math.round((w[0] - fd.w0[0]) * q) / q, dy = Math.round((w[1] - fd.w0[1]) * q) / q; next = moveFree(fd.orig, dx, dy); if (dx || dy) fd.moved = true; }
    else if (fd.orig.kind === 'rail') { next = railEndTo(fd.orig, fd.part === 'from' ? 'a' : 'b', w); fd.why = next ? undefined : freeProblem({ ...fd.orig, [fd.part === 'from' ? 'a' : 'b']: [Math.round(w[0]), Math.round(w[1])] }); if (next) fd.moved = true; }
    if (!next) return;
    list[k] = next;
    this.host.changed(false); this.host.item?.();
  }
  /** Add a stretch: the next press on the selected route, dragged along it, lays one from the press to where it's let go (from its card's Bed and underside). */
  stretchArmed = false;
  /** The stretch being dragged out (Add a stretch): its route, and how far along the press was and the pointer is. */
  private stretchNew: { route: number; s0: number; s1: number } | undefined;
  /** The stud grid cut paths are drawn on: the last build's (its parts' undersides'), else the plan's whole studs. */
  private cutGrid(): Grid { const g = this.overlay?.cutting?.grid; return g ? [g[0] / MM, g[1] / MM, g[2]] : [0, 0, 0]; }
  /** The track a cut path is checked against (cutpaths.ts pathProblem): the design's train routes, and what the last build said to keep clear of. */
  private cutTrack() { const ct = this.overlay?.cutting, d = this.host.design(); return ct ? { routes: toRoutes(d).filter((rt, i) => rt.segments.length > 0 && !isMono(d.routes[i])), railG: ct.railG, no: ct.no } : undefined; }
  private cutPaths(): CutPath[] { return this.host.design().expert?.cutPaths ?? []; }
  /** Why a path can't be made where it is (laid on the grid; not: the path it is, left out of the others it's checked against). */
  private pathWhy(pts: CutPt[], not?: string): string | undefined { return pathProblem(gridPath(this.cutGrid(), pts), this.cutPaths().filter((p) => p.id !== not).map((p) => p.pts), this.cutTrack())?.why; }
  /** Draw a cut path: each click a corner on the stud grid, Enter ends it, Esc cancels (the Cut paths panel's Add a cut path). */
  drawCutPath() { this.letGoSome(); this.setSelection([]); this.pathDraw = []; this.draw(); }
  /** The path being drawn, ended: kept if it has two corners and nothing's against it (else said, and it's still being drawn). */
  endCutPath() {
    if (!this.pathDraw) return;
    const pts = gridPath(this.cutGrid(), this.pathDraw), d = this.host.design();
    if (pts.length < 2) { this.say('Click two points or more, then press Enter (Esc cancels)'); return; }
    const why = this.pathWhy(pts);
    if (why) { this.say(why); return; }
    const list = ((d.expert ??= {}).cutPaths ??= []), id = newPathId(list.map((p) => p.id));
    list.push({ id, pts });
    this.pathDraw = undefined; this.setItem({ kind: 'cutpath', id }); this.host.changed(true); this.draw();
  }
  /** A press at w (studs) on a cut worked out where tracks join (overlay.jointCuts): what it is, said in the status line (by mouse or finger: nothing here is on hover alone). */
  private jointCutNote(w: [number, number]) {
    const jc = this.overlay?.jointCuts;
    if (!jc?.length) return;
    const n = jointCutNear(jc, [w[0] * MM, w[1] * MM], this.reach(this.touching || matchMedia('(pointer: coarse)').matches ? 18 : 8) * MM);
    if (n === undefined) return;
    this.say(jc[n].made ? 'Cut where two tracks join here (worked out, not drawn) · it moves with the tracks · Settings › Cutting and joints › Cut where tracks join in trackwork'
      : 'Two tracks join here, but a cut here would part nothing: left out · Settings › Cutting and joints › Cut where tracks join in trackwork', 5000);
  }
  /** The cuts, cut paths, stretches and joints under a point of the plan, the one a press takes first (items.ts hitItems): of the kinds a click may take now. */
  private itemHits(w: [number, number]): Hit[] {
    const kinds: OwnItem['kind'][] = [];
    if (this.picks('cut')) kinds.push('cut', 'cutpath');
    if (this.picks('stretch')) kinds.push('stretch');
    if (this.picks('sleeper')) kinds.push('sleeper');
    if (this.picks('rail')) kinds.push('rail', 'run');
    if (this.picks('rail') || this.picks('sleeper')) kinds.push('free');
    // (a joint is under its track's end, which a press takes while tracks are picked: looked for only when they aren't)
    if (this.picks('joint') && !this.picks('track')) kinds.push('joint');
    if (!kinds.length) return [];
    const d = this.host.design(), sel = this.selection();
    // (stretches: the selected track's; every track's when only stretches are picked)
    const stretchesOf = !this.picks('stretch') ? [] : this.pick === 'stretch' ? d.routes.flatMap((r, i) => (r.stretches?.length ? [i] : [])) : sel.length === 1 && !this.tableSelection().length ? sel : [];
    const tap = this.tapAt(this.pick === 'all' ? 'track' : this.pick);
    return hitItems(d, w, { near: tap.near, point: tap.point, kinds, paths: this.cutPaths(), joints: kinds.includes('joint') ? this.joints() : [], stretchesOf, selected: this.selItemNow,
      ...(kinds.includes('sleeper') && { sleepersOf: d.routes.map((_, i) => i), layOf: (i: number) => this.sleeperLay(i) }),
      ...(kinds.includes('rail') && { railsOf: d.routes.flatMap((r, i) => (r.railEdits ? [i] : [])) }),
      // (stage 3: every track's running rails, one at a time, while rails are what a tap takes)
      ...(this.pick === 'rail' && { runsOf: d.routes.map((_, i) => i), railOff: (i: number) => (routeGaugeStuds(d, d.routes[i]) + 1) / 2 }),
      // (stage 4: the rails laid by hand with Rails picked, the sleepers with Sleepers)
      ...(kinds.includes('free') && { freeKinds: [...(this.picks('rail') ? ['rail' as const] : []), ...(this.picks('sleeper') ? ['sleeper' as const] : [])], sleeperW: d.options?.sleeperWidthStuds ?? 2 }) });
  }
  /**
   * What a press at a point of the plan (studs) would take hold of, the first of: a handle of the selected track, a
   * lever, points or a check rail's end, a corner or an end of the selected item, a track's end; and in Select a cut,
   * a cut path, a stretch or a joint, a table's name, a track. Each only if the Pick list lets a click take it. The
   * one test for a press, the pointer's shape and the track marked under it.
   */
  private hitTest(w: [number, number]): PlanHit | undefined {
    if (this.active) return undefined;
    const handle = this.handleAt(w);
    if (handle) return { kind: 'handle', handle };
    const lever = this.leverAt(w);
    if (lever) return { kind: 'lever', it: lever };
    const mark = this.itemAt(w);
    // (expert, in Select: a check rail or a flangeway cut tapped anywhere along it, to select it; the nearer of that and
    // another's end, so a tap on a check rail beside its frog's end takes the check rail)
    const body = this.expert && this.mode === 'select' ? this.twBodyAt(w) : undefined;
    if (mark) {
      const at = mark.prop === 'toe' ? mark.it.at : mark.prop === 'd0' ? mark.it.pts[0] : mark.it.pts[mark.it.pts.length - 1];
      if (!body || body.it === mark.it || Math.hypot(at[0] / MM - w[0], at[1] / MM - w[1]) <= body.d) return { kind: 'mark', mark };
    }
    if (body) return { kind: 'tw', it: body.it };
    // (stage 5: one blade of points, along it; its heel end, selected, to drag it longer)
    const bl = this.expert && this.mode === 'select' ? this.bladeAt(w) : undefined;
    if (bl) return { kind: 'blade', ...bl };
    const select = this.mode === 'select', hits = select ? this.itemHits(w) : [];
    if (hits[0] && takesFirst(hits[0])) return { kind: 'item', hit: hits[0] };
    // (the track near the point, looked for once as far as a click picks a track: with none that near, there's no end nearer still)
    const tracks = this.picks('track'), near = tracks ? this.nearTrack(w, this.reach(18)) : undefined;
    const end = near ? this.nearTrack(w) : undefined;
    if (end?.end) return { kind: 'end', route: end.route, end: end.end };
    if (!select) return undefined;
    if (hits[0]) return { kind: 'item', hit: hits[0] };
    if (!tracks) return undefined;
    const table = this.hidden.has('tables') ? undefined : this.tableHandle(w);
    if (table !== undefined) return { kind: 'table', table };
    const tr = near ?? this.onBand(w);
    return tr && { kind: 'route', route: tr.route };
  }
  /** A press on a cut, a cut path, a stretch or a joint: it's selected, and dragged from there (a cut along its track, a path or its corner on the stud grid, a stretch or its end along its track). */
  private pressItem(h: Hit, w: [number, number], add = false) {
    const d = this.host.design(), it = h.item;
    this.pressed = it;
    // (Shift: a cut or a cut path added to the ones selected, or taken out; not dragged)
    if (add && boxable(it)) { this.toggleItem(it); return; }
    // (one of several selected: they're all dragged from there; let go without a move, it's selected alone)
    if (this.selAlso.length && boxable(it) && h.part === 'body' && this.selItems().some((q) => sameItem(q, it))) { this.multiDrag = { x: w[0], y: w[1], orig: this.multiOrig(), on: it, moved: false }; this.draw(); return; }
    this.selectItem(it);
    if (it.kind === 'cut') this.cutDrag = { kind: 'cut', route: it.route, orig: [...(d.routes[it.route].cuts ?? [])], k: it.k, moved: false };
    else if (it.kind === 'cutpath') {
      const pts = structuredClone(this.cutPaths().find((q) => q.id === it.id)!.pts);
      this.cutDrag = h.part === 'corner' ? { kind: 'corner', id: it.id, k: h.corner!, orig: pts, moved: false } : { kind: 'path', id: it.id, x: w[0], y: w[1], orig: pts, moved: false };
    } else if (it.kind === 'stretch') {
      const rr = d.routes[it.route];
      this.stretchDrag = { route: it.route, k: it.k, part: h.part === 'from' || h.part === 'to' ? h.part : 'body', s0: alongBeyond(rr, w), orig: structuredClone(rr.stretches ?? []), moved: false };
    } else if (it.kind === 'sleeper') {
      const rr = d.routes[it.route];
      // (one taken out isn't dragged: it's put back on its card)
      if (!sleeperEditOf(rr, it).off) this.sleeperDrag = { route: it.route, at: it.at, ...(it.add && { add: true as const }), s0: alongBeyond(rr, w), orig: rr.sleeperEdits && structuredClone(rr.sleeperEdits), moved: false };
    } else if (it.kind === 'rail') {
      const rr = d.routes[it.route];
      if (rr.railEdits) this.railDrag = { route: it.route, what: it.what, k: it.k, s0: alongBeyond(rr, w), orig: structuredClone(rr.railEdits), moved: false };
    } else if (it.kind === 'free') {
      const f = d.expert?.free?.find((q) => q.id === it.id);
      if (f) this.freeDrag = { id: it.id, part: h.part === 'from' || h.part === 'to' ? h.part : 'body', w0: w, orig: structuredClone(f), moved: false };
    } else if (it.kind === 'run' && !it.out) {
      // (a running rail's piece: its end, or the whole, dragged along)
      const rr = d.routes[it.route], p = railPieces(cutLength(rr), rr.railEdits, it.side)[it.k];
      if (p) this.railDrag = { route: it.route, what: 'gap', k: it.k, s0: alongBeyond(rr, w), orig: structuredClone(rr.railEdits ?? {}), moved: false, run: { side: it.side, part: h.part === 'from' || h.part === 'to' ? h.part : 'body', was: p } };
    }
    this.draw();
  }
  /** The stretch being dragged, taken to the pointer: an end, or the whole, along its track by whole studs; held at the track's ends and the stretches beside it, and why said. */
  private dragStretch(p: [number, number]) {
    const sd = this.stretchDrag!, rr = this.host.design().routes[sd.route];
    if (!rr) return;
    const s = alongBeyond(rr, p), was = { segs: rr.segs, stretches: sd.orig };
    const put = sd.part === 'body' ? dragStretchWhole(was, sd.k, s - sd.s0) : dragStretchEnd(was, sd.k, sd.part, s);
    sd.why = put.why;
    const cur = rr.stretches?.[sd.k];
    if (!cur || (cur.from === put.from && cur.to === put.to)) return;
    rr.stretches![sd.k] = { ...cur, from: put.from, to: put.to };
    sd.moved = true; this.host.changed(false); this.host.live?.(sd.route); this.host.item?.();
  }
  /** The stretch dragged out (Add a stretch) let go of: put on the track if one can be there, and selected; else why not, still waiting. */
  private endNewStretch() {
    const sn = this.stretchNew!, rr = this.host.design().routes[sn.route];
    this.stretchNew = undefined;
    if (!rr) { this.stretchArmed = false; return; }
    const put = newStretchAt(rr, sn.s0, sn.s1);
    if ('problem' in put) { this.say(put.problem); return; }
    const { list, k } = withStretch(rr.stretches, put.from, put.to);
    rr.stretches = list; this.stretchArmed = false;
    this.selectItem({ kind: 'stretch', route: sn.route, k });
    this.host.changed(true);
    this.say(`Stretch from ${put.from} to ${put.to} studs${put.why ? ` (${put.why[0].toLowerCase()}${put.why.slice(1)})` : ''} · its settings are in the track's card, Bed and underside`, 6000);
  }
  /** A cut path's corner put at a point typed on its card (studs; taken to the nearest corner between studs): undefined when done, else why it can't be there. */
  setPathCorner(id: string, k: number, to: [number, number]): string | undefined {
    const path = this.cutPaths().find((q) => q.id === id), g = this.cutGrid();
    if (!path?.pts[k]) return 'No such corner';
    const pts = gridPath(g, path.pts.map((q, n): CutPt => (n === k ? snapToGrid(g, to) : q))), why = pts.length < 2 ? 'A cut path has two points or more' : this.pathWhy(pts, id);
    if (why) return why;
    path.pts = pts;
    return undefined;
  }
  /** Wait for a press on the selected route, dragged along it, to lay a stretch with its own settings there. */
  stretchHere() {
    if (this.selection().length !== 1 || this.tableSelection().length) { this.say('Select one route to add a stretch to it'); return; }
    this.splitArmed = false; this.cutArmed = false; this.setItem(undefined); this.stretchArmed = true; this.draw();
  }
  /** Several cuts and cut paths as they are now: what a move of them all starts from (multiMove). */
  private multiOrig(): MultiOrig {
    const d = this.host.design(), its = this.selItems().filter(boxable);
    const cuts = its.flatMap((it) => { const at = it.kind === 'cut' ? d.routes[it.route]?.cuts?.[it.k] : undefined; return it.kind === 'cut' && at !== undefined ? [{ route: it.route, at }] : []; });
    const paths = its.flatMap((it) => { const p = it.kind === 'cutpath' ? this.cutPaths().find((q) => q.id === it.id) : undefined; return p ? [{ id: p.id, pts: structuredClone(p.pts) }] : []; });
    return { cuts, was: new Map([...new Set(cuts.map((c) => c.route))].map((i) => [i, [...(d.routes[i].cuts ?? [])]])), paths };
  }
  /**
   * The several selected cuts and cut paths put where a move of (dx, dy) studs from where they were (o) takes them: a
   * cut along its own track by whole studs, as far as the move points along it there; a path over the stud grid. All
   * of them or none: where one can't go, why, and they stay as they are.
   */
  private multiMove(o: MultiOrig, dx: number, dy: number): { why?: string; moved: boolean } {
    const d = this.host.design(), g = this.cutGrid(), mc = moveCuts(d, o.cuts, dx, dy, (i) => o.was.get(i) ?? []);
    if (mc.why) return { why: mc.why, moved: false };
    const live = o.paths.map((p) => this.cutPaths().find((q) => q.id === p.id)).filter((p): p is CutPath => !!p), now = live.map((p) => p.pts);
    const to = o.paths.map((p) => gridPath(g, p.pts.map((q): CutPt => snapToGrid(g, [q[0] + dx, q[1] + dy]))));
    // (the paths all put where they'd be, then each looked at against the rest)
    live.forEach((p, k) => { p.pts = to[k]; });
    const why = live.map((p, k) => (to[k].length < 2 ? 'The cut path can\'t go there' : this.pathWhy(to[k], p.id))).find((q) => q);
    if (why) { live.forEach((p, k) => { p.pts = now[k]; }); return { why, moved: false }; }
    for (const [i, cs] of mc.cuts) if (d.routes[i]) d.routes[i].cuts = cs;
    // (they go by their places in their lists: found again where they came to)
    this.selItemNow = undefined; this.selAlso = [];
    const list: BoxItem[] = [...o.cuts.map((c, n): BoxItem => ({ kind: 'cut', route: c.route, k: d.routes[c.route].cuts!.indexOf(mc.at[n]) })), ...live.map((p): BoxItem => ({ kind: 'cutpath', id: p.id }))];
    this.selItemNow = list[0]; this.selAlso = list.slice(1);
    return { moved: mc.moved || to.some((pts, k) => JSON.stringify(pts) !== JSON.stringify(o.paths[k].pts)) };
  }
  /** The several being dragged, taken to the pointer; where they can't all be, shown why, and put back when let go. */
  private dragMulti(p: [number, number]) {
    const md = this.multiDrag!, before = JSON.stringify([this.host.design().routes.map((r) => r.cuts), this.cutPaths().map((q) => q.pts)]);
    const r = this.multiMove(md.orig, p[0] - md.x, p[1] - md.y);
    md.why = r.why;
    if (r.why || before === JSON.stringify([this.host.design().routes.map((q) => q.cuts), this.cutPaths().map((q) => q.pts)])) return;
    md.moved = true; this.host.changed(false); this.host.live?.(); this.host.item?.();
  }
  /** The cut being dragged, taken to the pointer: a corner or a path on the stud grid, a cut across a track along it by whole studs; where it can't be, it's shown red and put back when let go. */
  private dragCut(p: [number, number]) {
    const cd = this.cutDrag!, d = this.host.design(), g = this.cutGrid();
    if (cd.kind === 'cut') {
      const rr = d.routes[cd.route];
      if (!rr) return;
      const s = Math.round(nearestAlong(rr, p).s), others = cd.orig.filter((_, n) => n !== cd.k);
      cd.why = s === cd.orig[cd.k] ? undefined : cutProblem(rr, s, others);
      if (cd.why || rr.cuts?.includes(s)) return;
      rr.cuts = cleanCuts([...others, s]) ?? [];
      cd.moved = true; this.selItemNow = { kind: 'cut', route: cd.route, k: rr.cuts.indexOf(s) }; this.host.changed(false); this.host.live?.(cd.route); this.host.item?.();
      return;
    }
    const path = this.cutPaths().find((q) => q.id === cd.id);
    if (!path) return;
    let pts: CutPt[];
    if (cd.kind === 'corner') pts = moveCorner(g, cd.orig, cd.k, p);
    else { const a = snapToGrid(g, [cd.x, cd.y]), b = snapToGrid(g, p); pts = cd.orig.map((q): CutPt => [q[0] + b[0] - a[0], q[1] + b[1] - a[1]]); }
    if (JSON.stringify(pts) === JSON.stringify(path.pts)) return;
    path.pts = pts; cd.moved = true; cd.why = this.pathWhy(pts, cd.id); this.host.changed(false); this.host.item?.();
  }
  /** The selected item taken out (Delete): a cut path, a cut across a track, or a stretch (the track's settings there again). A joint isn't: it's taken apart. One undo step. */
  deleteItem() {
    const sc = this.selItemNow, d = this.host.design();
    if (!sc || sc.kind === 'joint') return;
    if (this.selAlso.length) {
      // (several: every one of them, one step)
      const its = this.selItems().filter(boxable), ids = new Set(its.flatMap((q) => (q.kind === 'cutpath' ? [q.id] : [])));
      if (ids.size) { d.expert!.cutPaths = this.cutPaths().filter((p) => !ids.has(p.id)); tidyExpert(d); }
      for (const i of new Set(its.flatMap((q) => (q.kind === 'cut' ? [q.route] : [])))) {
        const rr = d.routes[i], ks = new Set(its.flatMap((q) => (q.kind === 'cut' && q.route === i ? [q.k] : [])));
        if (!rr?.cuts) continue;
        rr.cuts = rr.cuts.filter((_, k) => !ks.has(k));
        if (!rr.cuts.length) delete rr.cuts;
      }
      this.setItem(undefined); this.host.changed(true); this.say(`${itemsLabel(its).replace(' selected', '')} taken out · Undo brings them back`, 4000);
      return this.draw();
    }
    if (sc.kind === 'cutpath') { d.expert!.cutPaths = this.cutPaths().filter((p) => p.id !== sc.id); tidyExpert(d); }
    else if (sc.kind === 'cut') { const rr = d.routes[sc.route]; if (rr?.cuts) { rr.cuts.splice(sc.k, 1); if (!rr.cuts.length) delete rr.cuts; } }
    else if (sc.kind === 'rail') {
      const rr = d.routes[sc.route], next = withRailEdit(rr?.railEdits, sc.what === 'gap' ? 'gaps' : sc.what === 'guard' ? 'guards' : 'checks', sc.k, undefined);
      if (!rr) return;
      if (next) rr.railEdits = next; else delete rr.railEdits;
    } else if (sc.kind === 'sleeper') {
      // (a sleeper: taken out, where the rails can span the gap it leaves; an added one: gone)
      const why = this.setSleeper(sc, sc.add ? undefined : { at: sc.at, off: true });
      if (why) { this.say(why); return; }
      if (!sc.add) { this.host.changed(true); this.host.item?.(); this.say('Sleeper taken out · Reset on its card puts it back'); return this.draw(); }
    } else if (sc.kind === 'free') {
      // (a rail or sleeper laid by hand: gone)
      if (d.expert?.free) { d.expert.free = d.expert.free.filter((f) => f.id !== sc.id); tidyExpert(d); }
    } else if (sc.kind === 'run') {
      // (a running rail's piece taken out; a stretch taken out put back)
      const rr = d.routes[sc.route];
      if (!rr) return;
      const next = sc.out ? cleanRailEdits({ ...rr.railEdits, out: (rr.railEdits?.out ?? []).filter((o) => o !== (rr.railEdits?.out ?? []).filter((q) => q.side === sc.side)[sc.k]) }) : deleteRailPiece(rr, sc.side, sc.k).edits;
      if (next) rr.railEdits = next; else delete rr.railEdits;
      this.say(sc.out ? `The ${sc.side} rail is back there · Undo takes it out again` : `That piece of the ${sc.side} rail is taken out · Undo puts it back`);
    } else if (sc.kind === 'tw') {
      // (the app's trackwork: points taken out (both tracks' rails run through), a check rail taken out; a lever or a frog can't be)
      if (sc.tw === 'points' && sc.blade !== undefined) { this.say('A blade goes with its points: take the points out on their own card, or make this blade fixed'); return; }
      if (sc.tw === 'points') { if (this.pointsState(sc.key).state !== 'built') return; this.togglePoints(sc.key); this.say('Points taken out · Built on its card puts them back'); this.host.item?.(); return this.draw(); }
      if (sc.tw === 'check') { const g = ((d.trackwork ??= {}).check ??= {}); g[sc.key] = { ...g[sc.key], off: true }; this.host.changed(true); this.host.item?.(); this.say('Check rail taken out · Reset on its card puts it back'); return this.draw(); }
      this.say(sc.tw === 'throw' ? 'A lever goes with its points: take the points out to have none' : 'A frog is where two rails cross: it can be open or the rail run through, not taken out'); return;
    } else { const rr = d.routes[sc.route]; if (rr?.stretches) { rr.stretches.splice(sc.k, 1); if (!rr.stretches.length) delete rr.stretches; } }
    this.setItem(undefined); this.host.changed(true); this.draw();
  }
  /**
   * The selected cut, cut path or stretch moved a stud by an arrow key (Shift: eight): a cut or a stretch along its
   * track, the way the arrow points; a cut path over the stud grid. One undo step; where it can't go, why is said.
   */
  private nudgeItem(dx: number, dy: number) {
    const it = this.selItemNow, d = this.host.design();
    if (!it || it.kind === 'joint') return;
    if (it.kind === 'tw' || (it.kind === 'run' && it.out)) { this.say('Its card has + and − for each of its numbers'); return; }
    if (it.kind === 'free') {
      const list = d.expert?.free ?? [], k = list.findIndex((f) => f.id === it.id);
      if (k < 0) return;
      list[k] = moveFree(list[k], dx, dy); this.host.changed(true); this.host.item?.(); return this.draw();
    }
    if (it.kind === 'run') {
      const rr = d.routes[it.route], p = rr && railPieces(cutLength(rr), rr.railEdits, it.side)[it.k];
      if (!rr || !p) return;
      const h = (placeAlong(rr, (p.from + p.to) / 2).heading * Math.PI) / 180, along = -dx * Math.sin(h) + dy * Math.cos(h), n = Math.max(Math.abs(dx), Math.abs(dy));
      if (Math.abs(along) < 0.5 * n) { this.say('This arrow points across the track: press one that points along it'); return; }
      const put = slideRailPiece(rr, it.side, it.k, Math.sign(along) * n);
      if (!put.edits) { this.say(put.why ?? 'It can\'t go there'); return; }
      rr.railEdits = put.edits; this.host.changed(true); this.host.item?.(); return this.draw();
    }
    if (this.selAlso.length) {
      // (several: all of them, or none)
      const r = this.multiMove(this.multiOrig(), dx, dy);
      if (r.why) { this.say(r.why); return; }
      if (!r.moved) { this.say('This arrow points across the tracks: press one that points along them'); return; }
      this.host.changed(true); this.host.item?.(); return this.draw();
    }
    if (it.kind === 'cutpath') {
      const path = this.cutPaths().find((q) => q.id === it.id), g = this.cutGrid();
      if (!path) return;
      const pts = gridPath(g, path.pts.map((q): CutPt => snapToGrid(g, [q[0] + dx, q[1] + dy]))), why = this.pathWhy(pts, it.id);
      if (why || pts.length < 2) { this.say(why ?? 'The cut path can\'t go there'); return; }
      path.pts = pts;
    } else if (it.kind === 'rail') {
      const rr = d.routes[it.route], e = railEditAt(rr?.railEdits, it.what, it.k);
      if (!rr || !e) return;
      const at = 'at' in e ? e.at : (e.from + e.to) / 2, h = (placeAlong(rr, at).heading * Math.PI) / 180, along = -dx * Math.sin(h) + dy * Math.cos(h), n = Math.max(Math.abs(dx), Math.abs(dy));
      if (Math.abs(along) < 0.5 * n) { this.say('This arrow points across the track: press one that points along it'); return; }
      const put = moveRailEdit(rr, it.what, it.k, Math.sign(along) * n);
      if (!put.edits) { this.say(put.why ?? 'It can\'t go there'); return; }
      rr.railEdits = put.edits; this.selItemNow = { kind: 'rail', route: it.route, what: it.what, k: put.k! };
    } else if (it.kind === 'sleeper') {
      const rr = d.routes[it.route], lay = this.sleeperLay(it.route), e = sleeperEditOf(rr, it);
      if (!rr || !lay || e.off) return;
      const h = (placeAlong(rr, it.at).heading * Math.PI) / 180, along = -dx * Math.sin(h) + dy * Math.cos(h), n = Math.max(Math.abs(dx), Math.abs(dy));
      if (Math.abs(along) < 0.5 * n) { this.say('This arrow points across the track: press one that points along it'); return; }
      const move = Math.min(SLEEPER_MOVE, Math.max(-SLEEPER_MOVE, (e.move ?? 0) + Math.sign(along) * n * (lay.whole ? 1 : 0.25))), { move: _m, ...rest } = e;
      const why = this.setSleeper(it, { ...rest, ...(move && { move }) });
      if (why) { this.say(why); return; }
    } else {
      const rr = d.routes[it.route], st = it.kind === 'stretch' ? rr?.stretches?.[it.k] : undefined, at = it.kind === 'cut' ? rr?.cuts?.[it.k] : st && (st.from + st.to) / 2;
      if (!rr || at === undefined) return;
      // (the way the arrow points along the track there: an arrow square across it moves nothing)
      const h = (placeAlong(rr, at).heading * Math.PI) / 180, along = -dx * Math.sin(h) + dy * Math.cos(h), n = Math.max(Math.abs(dx), Math.abs(dy));
      if (Math.abs(along) < 0.5 * n) { this.say('This arrow points across the track: press one that points along it'); return; }
      const by = Math.sign(along) * n;
      if (it.kind === 'cut') {
        const others = rr.cuts!.filter((_, k) => k !== it.k), s = Math.round(at + by), why = cutProblem(rr, s, others);
        if (why) { this.say(why); return; }
        rr.cuts = cleanCuts([...others, s]) ?? [];
        this.selItemNow = { kind: 'cut', route: it.route, k: rr.cuts.indexOf(s) };
      } else {
        const put = dragStretchWhole(rr, it.k, by);
        if (put.why) this.say(put.why);
        if (put.from === st!.from) return;
        rr.stretches![it.k] = { ...st!, from: put.from, to: put.to };
      }
    }
    this.host.changed(true); this.host.item?.(); this.draw();
  }
  /** Wait for a click on the selected route, to cut it into parts there by hand. */
  cutHere() {
    if (this.selection().length !== 1 || this.tableSelection().length) { this.say('Select one route to cut it into parts'); return; }
    this.splitArmed = false; this.stretchArmed = false; this.cutArmed = true; this.draw();
  }
  /** Where the selected route would be cut for a point (studs along it, whole studs), if the point is on it. */
  private cutFor(w: [number, number]): { route: number; s: number } | undefined {
    const sel = this.selection();
    if (sel.length !== 1) return undefined;
    const r = this.host.design().routes[sel[0]];
    if (!r) return undefined;
    const n = nearestAlong(r, w);
    return n.dist <= this.reach(24) + 0.5 ? { route: sel[0], s: Math.round(n.s) } : undefined;
  }
  /** Cut the selected route at the point under the pointer (or, with the pointer not on it, wait for a click on it). */
  splitHere(wait = false) {
    if (this.selection().length !== 1 || this.tableSelection().length) { this.say('Select one route to split it'); return; }
    const cut = !wait && this.mouse ? this.cutFor(this.mouse) : undefined;
    if (!cut) { this.cutArmed = false; this.stretchArmed = false; this.splitArmed = true; this.draw(); return; }
    this.splitAt(cut);
  }
  private splitAt(cut: { route: number; s: number }) {
    this.splitArmed = false;
    const why = this.host.split?.(cut.route, cut.s);
    if (why) this.say(why); else this.draw();
  }
  /** The last press was a finger's, not a mouse's: bigger handles to grab. */
  private touching = false;
  /** The handles on the selected route (when one is selected, in Select mode, nothing being drawn): at least 10 px apart on the screen. */
  private handles(): Handle[] {
    // (none while a stretch of it is selected: the stretch's ends are what's dragged then; nor when a click takes no track)
    if (this.mode !== 'select' || this.active || this.selection().length !== 1 || this.selItemNow?.kind === 'stretch' || this.stretchArmed || !this.picks('track')) return [];
    const r = this.host.design().routes[this.selection()[0]];
    return r && !r.locked ? visibleHandles(segmentHandles(r, END_INSET_PX / this.scale), this.scale, this.touching ? 32 : 10) : [];
  }
  /** The handle under a point (studs), within a few pixels. */
  private handleAt(w: [number, number]): Handle | undefined {
    let best: Handle | undefined, bd = this.touching ? 22 : 9; // (a fingertip is wider than a pointer)
    for (const h of this.handles()) { const dd = Math.hypot(h.at[0] - w[0], h.at[1] - w[1]) * this.scale; if (dd <= bd) { bd = dd; best = h; } }
    return best;
  }
  /** Dragging a lever: its item, and where it would go (mm) with what settings. */
  private leverDrag: { it: OverlayItem; moved: boolean; off: [number, number]; at?: [number, number]; arm?: [number, number][] } | undefined;
  /** Dragging a check rail's or flangeway cut's end (longer or shorter), or points along: what, which setting, from where (studs), the way that adds (mm), and its value before. */
  private itemDrag: { it: OverlayItem; prop: 'd0' | 'd1' | 'toe'; from: [number, number]; dir: [number, number]; base: number; at?: [number, number]; sx?: number; sy?: number; moved?: boolean } | undefined;
  /** The points at a toe (by its key), as built: 'built' (forced or not), 'off' (taken out), or 'cand' (a near miss, forced or not, and whether it can be). */
  pointsState(key: string) {
    const its = (this.overlay?.items ?? []).filter((it) => it.kind === 'points' && it.key === key);
    const built = its.filter((it) => !it.off && !it.cand), cand = its.find((it) => it.cand);
    if (built.length) return { state: 'built' as const, forced: built.some((it) => it.forced) };
    if (its.some((it) => it.off)) return { state: 'off' as const, forced: false };
    return { state: 'cand' as const, forced: !!cand?.forced, ok: !!cand?.cand?.ok };
  }
  /** A click on points: built ones taken out (forced ones back to a near miss), taken-out ones put back, a near miss forced (or not). */
  togglePoints(key: string) {
    const st = this.pointsState(key), d = this.host.design();
    const tw = (d.trackwork ??= {}), group = (tw.points ??= {}), e = { ...group[key] };
    if (st.state === 'built' && st.forced) delete e.force;
    else if (st.state === 'built') e.off = true;
    else if (st.state === 'off') { delete e.off; delete e.drop; }
    else if (st.forced) delete e.force;
    else e.force = true;
    if (Object.keys(e).length) group[key] = e; else delete group[key];
    this.host.changed(true);
  }
  /** The check rail end, flangeway cut end or points under a point (studs), to drag. */
  itemAt(w: [number, number]) {
    if (!this.picks('mark')) return undefined;
    const r = Math.max(1, Math.max(9, this.fingers() && this.pick === 'mark' ? TAP_PX.finger : 0) / this.scale), d = this.host.design();
    const near = (q: [number, number]) => Math.hypot(q[0] / MM - w[0], q[1] / MM - w[1]) < r;
    const unit = (a: [number, number], b: [number, number]): [number, number] => { const l = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; return [(a[0] - b[0]) / l, (a[1] - b[1]) / l]; };
    for (const it of this.overlay?.items ?? []) {
      const cur = ((d.trackwork as Record<string, Record<string, Record<string, number>>> | undefined)?.[it.kind]?.[it.key]) ?? {};
      if ((it.kind === 'check' || it.kind === 'groove') && it.pts.length > 1 && !this.hidden.has(it.kind === 'check' ? 'checks' : 'grooves')) {
        const n = it.pts.length;
        if (near(it.pts[0])) return { it, prop: 'd0' as const, from: w, dir: unit(it.pts[0], it.pts[1]), base: cur.d0 ?? 0 };
        if (near(it.pts[n - 1])) return { it, prop: 'd1' as const, from: w, dir: unit(it.pts[n - 1], it.pts[n - 2]), base: cur.d1 ?? 0 };
      }
      // (points: dragged along, or clicked to take them out, put them back or force them)
      if (it.kind === 'points' && !this.hidden.has('points') && near(it.at)) return { it, prop: 'toe' as const, from: w, dir: it.dir ?? [0, 0], base: cur.toe ?? 0 };
    }
    return undefined;
  }
  /** (expert) The check rail or flangeway cut whose line a point (studs) is on, to select by a tap anywhere along it. */
  twBodyAt(w: [number, number]): { it: OverlayItem; d: number } | undefined {
    if (!this.picks('mark')) return undefined;
    const t = this.tapAt('mark');
    // (the nearest within reach: a check rail lies beside its frog's flangeway cut)
    let best: OverlayItem | undefined, r = t.near;
    for (const it of this.overlay?.items ?? []) {
      if ((it.kind !== 'check' && it.kind !== 'groove') || it.pts.length < 2 || this.hidden.has(it.kind === 'check' ? 'checks' : 'grooves')) continue;
      for (let k = 1; k < it.pts.length; k++) {
        const a = [it.pts[k - 1][0] / MM, it.pts[k - 1][1] / MM], b = [it.pts[k][0] / MM, it.pts[k][1] / MM], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((w[0] - a[0]) * dx + (w[1] - a[1]) * dy) / l2));
        const dd = Math.hypot(a[0] + u * dx - w[0], a[1] + u * dy - w[1]);
        if (dd < r) { r = dd; best = it; }
      }
    }
    return best && { it: best, d: r };
  }
  /** (expert, stage 5) The blade of points nearest a point (studs), within reach: its set's key, which blade, how far; part 'heel': at its heel end, to drag it longer. */
  bladeAt(w: [number, number]): { key: string; blade: 0 | 1; d: number; heel: boolean } | undefined {
    if (!this.picks('mark') || this.hidden.has('points')) return undefined;
    const r = this.tapAt('mark').near, sel = this.selItemNow;
    let best: { key: string; blade: 0 | 1; d: number; heel: boolean } | undefined;
    for (const it of this.overlay?.items ?? []) for (const [b, line] of (it.kind === 'points' ? it.blades ?? [] : []).entries()) {
      const pts = line.map((q) => [q[0] / MM, q[1] / MM] as [number, number]), end = pts[pts.length - 1];
      const mine = sel?.kind === 'tw' && sel.key === it.key && sel.blade === b;
      if (mine && Math.hypot(end[0] - w[0], end[1] - w[1]) < this.tapAt('mark').point) return { key: it.key, blade: b as 0 | 1, d: 0, heel: true };
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], c = pts[k], dx = c[0] - a[0], dy = c[1] - a[1], l2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((w[0] - a[0]) * dx + (w[1] - a[1]) * dy) / l2));
        const dd = Math.hypot(a[0] + u * dx - w[0], a[1] + u * dy - w[1]);
        if (dd < r && (!best || dd < best.d)) best = { key: it.key, blade: b as 0 | 1, d: dd, heel: false };
      }
    }
    return best;
  }
  /** (stage 5) One blade of points made longer than worked out, studs (0 to 8; undefined or 0: as worked out): Trackwork.points bladeHeel, mm. */
  setBladeHeel(key: string, b: 0 | 1, studs: number | undefined) {
    const d = this.host.design(), g = ((d.trackwork ??= {}).points ??= {}), e = { ...g[key] }, v = Math.max(0, Math.min(8, Math.round((studs ?? 0) * 4) / 4));
    const bh: [number, number] = [...(e.bladeHeel ?? [0, 0])] as [number, number]; bh[b] = v * MM;
    if (bh[0] > 0 || bh[1] > 0) e.bladeHeel = bh; else delete e.bladeHeel;
    if (Object.keys(e).length) g[key] = e; else delete g[key];
  }
  /** (stage 5) A blade's heel being dragged: its set, the blade, where the heel was and the way the blade runs there, and how much longer it was (studs). */
  private heelDrag: { key: string; blade: 0 | 1; at: [number, number]; dir: [number, number]; was: number; moved: boolean } | undefined;
  /** The lever under a point (studs), if any. */
  private leverAt(w: [number, number]) {
    const r = Math.max(1.5, (this.fingers() && this.pick === 'mark' ? TAP_PX.finger : 12) / this.scale);
    // (on the knob, or anywhere on the arm)
    const inPoly = (pts: [number, number][]) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = [pts[i][0] / MM, pts[i][1] / MM], [xj, yj] = [pts[j][0] / MM, pts[j][1] / MM];
        if ((yi > w[1]) !== (yj > w[1]) && w[0] < ((xj - xi) * (w[1] - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    if (this.hidden.has('levers') || !this.picks('mark')) return undefined;
    return this.overlay?.items?.find((it) => it.kind === 'throw' && it.lever && (Math.hypot(it.at[0] / MM - w[0], it.at[1] / MM - w[1]) < r || inPoly(it.pts)));
  }
  /** Move a lever to (near) w, studs: its side, how far out and how far along, as the switch allows. */
  private dragLever(w: [number, number]) {
    const ld = this.leverDrag!, lv = ld.it.lever!;
    // (snapped to a stud of the design's grid, so the arm sits square on the
    // studs: the track's centre lines run between studs, so studs are at
    // 4 + 8k mm; then held to where the switch lets the lever go)
    const snapL = (q: [number, number]): [number, number] => {
      return worldToPose(lv.frame, [Math.round((q[0] - 4) / MM) * MM + 4, Math.round((q[1] - 4) / MM) * MM + 4]);
    };
    let [lx, ly] = snapL([w[0] * MM, w[1] * MM]);
    // (one of a three-way's two levers stays on its own side: out and in only)
    const side = lv.blade ? (lv.blade === 'right' ? 1 : -1) : lx >= 0 ? 1 : -1;
    if (lv.blade && Math.sign(lx) !== side) lx = side * Math.max(lv.edge, lv.minD);
    // (no nearer the track than the lever can go: out a stud at a time till it's clear)
    for (let k = 0; k < 12 && Math.abs(lx) < Math.max(lv.edge, lv.minD) - 0.01; k++) {
      [lx, ly] = snapL(poseToWorld(lv.frame, [lx + side * MM, ly]));
    }
    const leverOffset = Math.max(0, Math.min(80, Math.round((Math.abs(lx) - lv.edge) * 100) / 100));
    const d = this.host.design(), tw = (d.trackwork ??= {}), group = (tw.throw ??= {});
    const was = JSON.stringify(group[ld.it.key] ?? {});
    const wd = (x: number, y: number) => poseToWorld(lv.frame, [x, y]);
    let y: number;
    if (!leverSlides(d)) {
      // (the plate-style points: the slider bar meets the blades where it must, so the lever stays level with it: across and out only)
      y = worldToPose(lv.frame, ld.it.at)[1];
      if (lv.blade) group[ld.it.key] = eachLever(group[ld.it.key], lv.blade, leverOffset);
      else group[ld.it.key] = { side: side > 0 ? 'right' : 'left', leverOffset };
    } else {
      // (along: a stud at a time back into the tines' reach)
      for (let k = 0; k < 12 && lv.pivotY - 2 - ly > lv.maxTine + 0.01; k++) ly += MM;
      for (let k = 0; k < 12 && lv.pivotY - 2 - ly < 16; k++) ly -= MM;
      const springLength = Math.max(16, Math.min(Math.floor(lv.maxTine), Math.round((lv.pivotY - 2 - ly) * 100) / 100));
      group[ld.it.key] = { side: side > 0 ? 'right' : 'left', leverOffset, springLength };
      y = lv.pivotY - 2 - Math.min(springLength, lv.maxTine);
    }
    const lxNew = side * (lv.edge + leverOffset), xOut = side * Math.ceil((Math.abs(lxNew) + 10) / MM - 1e-6) * MM;
    ld.at = wd(lxNew, y);
    ld.arm = [wd(side * lv.stockX, y - 12), wd(xOut, y - 12), wd(xOut, y + 12), wd(side * lv.stockX, y + 12)];
    if (JSON.stringify(group[ld.it.key]) !== was) this.host.changed(false);
  }

  constructor(private el: HTMLCanvasElement, private host: CanvasHost) {
    this.ctx = el.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(el.parentElement!);
    // (the plan takes the keyboard: Tab to it, [ and ] pick a route, Tab again moves between its handles, arrows move one, Enter draws on)
    el.tabIndex = 0; el.setAttribute('role', 'application');
    el.addEventListener('blur', () => { this.kbHandle = undefined; this.drawSoon(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mouseleave', () => { if (this.hoverRoute !== undefined) { this.hoverRoute = undefined; this.drawSoon(); } });
    el.addEventListener('mousedown', (e) => { this.touching = false; this.down(e); });
    // (a double click on a track, in Select: it and every track joined to it selected)
    el.addEventListener('dblclick', (e) => { this.selectJoinedAt(this.evWorld(e), 18); });
    addEventListener('mousemove', (e) => this.move(e));
    addEventListener('mouseup', (e) => this.up(e));
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.touch();
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    // (Space let go of in another window: not held still when this one's come back to)
    addEventListener('blur', () => { this.space = false; });
    this.resize();
  }

  // ---------- view ----------
  /** The plan's size (CSS px) the last time it was laid out: a resize keeps the plan point at the middle where it was. */
  private size: [number, number] | undefined;
  private resize() {
    const p = this.el.parentElement!, dpr = devicePixelRatio;
    const first = this.ox === 0 && this.oy === 0;
    if (p.clientWidth > 0 && p.clientHeight > 0) {
      if (this.size && !first) { this.ox += (p.clientWidth - this.size[0]) / 2; this.oy += (p.clientHeight - this.size[1]) / 2; }
      this.size = [p.clientWidth, p.clientHeight];
    }
    this.el.width = p.clientWidth * dpr; this.el.height = p.clientHeight * dpr;
    this.el.style.width = `${p.clientWidth}px`; this.el.style.height = `${p.clientHeight}px`;
    if (first) this.fit();
    this.draw();
  }
  /** Fit the whole design in view (or, with part: just the selected routes, when some are). */
  fit(part = false) {
    const all = this.host.design().routes, sel = part ? this.selection().filter((i) => all[i]) : [];
    const pts = (sel.length ? sel.map((i) => all[i]) : all).flatMap((r) => trace(r, r.segs, 2));
    const w = this.el.width / devicePixelRatio, h = this.el.height / devicePixelRatio;
    if (pts.length < 2) { this.scale = 6; this.ox = w / 2; this.oy = h / 2; return this.draw(); }
    // (found one at a time: a big layout's points, all handed to Math.min at once, were more than it takes)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    x0 -= 8; x1 += 8; y0 -= 8; y1 += 8;
    this.scale = Math.min(w / (x1 - x0), h / (y1 - y0), 40);
    this.ox = w / 2 - ((x0 + x1) / 2) * this.scale; this.oy = h / 2 + ((y0 + y1) / 2) * this.scale;
    this.draw();
  }
  private toScreen = (x: number, y: number): [number, number] => [this.ox + x * this.scale, this.oy - y * this.scale];
  private toWorld = (sx: number, sy: number): [number, number] => [(sx - this.ox) / this.scale, (this.oy - sy) / this.scale];
  private evWorld(e: MouseEvent) { const r = this.el.getBoundingClientRect(); return this.toWorld(e.clientX - r.left, e.clientY - r.top); }
  private snap = (p: [number, number]): [number, number] => [Math.round(p[0]), Math.round(p[1])];
  /** Alt held: no snapping (the stud grid stays). */
  private alt = false;
  /** The guide the pointer is snapped to now (drawn dashed with its value), and what it was worked out for. */
  private guideNow: GuideResult | undefined;
  private guideKey = '';
  /** What's near a point that a guide can come from: other routes' ends and straights (only the routes whose box is near: the rest aren't walked). */
  private guideCands(p: [number, number], skip: number | undefined) {
    const ends: GuideEnd[] = [], straights: GuideStraight[] = [], m = 26 + (this.touching ? 22 : 10) / this.scale;
    const carried = skip === undefined ? undefined : this.carriedNow();
    this.host.design().routes.forEach((r, i) => {
      if (i === skip || carried?.has(i)) return;
      // (further from its start than it's long, and the margin: skipped without a trace; far cheaper than a box kept per route's shape)
      if (Math.hypot(p[0] - r.x, p[1] - r.y) > segsStuds(r.segs) + m) return;
      const name = r.name || String(i), e = follow(r, r.segs);
      ends.push({ pose: { x: r.x, y: r.y, heading: r.heading + 180 }, name }, { pose: e, name });
      let q: Pose = { x: r.x, y: r.y, heading: r.heading };
      for (const sg of r.segs) {
        if (sg.kind === 'straight' && sg.studs >= 2) straights.push({ x: q.x, y: q.y, heading: q.heading, studs: sg.studs, name });
        q = follow(q, [sg]);
      }
    });
    return { ends, straights };
  }
  /**
   * The snapped point for the pointer at w (studs): onto a guide when one is near (guides.ts), else the stud grid. from: where the
   * track being laid starts (heading NaN: a new one from an empty point); skip: the route being dragged or extended. The guide
   * is kept (guideNow) for draw() to show; the same pointer and start work it out once.
   */
  private guided(w: [number, number], from?: Pose, skip?: number): [number, number] {
    const key = `${w[0]},${w[1]},${from ? `${from.x},${from.y},${from.heading}` : ''},${skip},${this.alt},${this.scale},${this.touching},${this.host.radius()},${this.host.design().routes.length}`;
    if (key !== this.guideKey) {
      this.guideKey = key;
      const c = this.guideCands(w, skip);
      this.guideNow = guidePoint({ p: w, scale: this.scale, snapPx: this.touching ? 22 : 10, from, ...c, radii: this.host.radius() < 0 ? COMMON_RADII : undefined, off: this.alt });
    }
    return this.guideNow!.point;
  }

  // ---------- finding things ----------
  /** The nearest point on a track's centre line within reach (studs): its route, pose, and whether it's an end. */
  /**
   * Onto the middle of another track (not route skip): the track that arrives
   * there along it, either way, merging in (trailing points), if it can.
   */
  private mergeOnto(p: [number, number], from: Pose, skip: number | undefined): DSeg[] | undefined {
    if (this.alt) return undefined;
    const hit = this.nearTrack(p, this.reach(), skip);
    if (!hit || hit.end) return undefined;
    const r = this.host.radius() > 0 ? this.host.radius() : 24;
    const plans = [hit.pose.heading, norm180(hit.pose.heading + 180)].map((h) => planToPose(from, { ...hit.pose, heading: h }, r)).filter((x): x is DSeg[] => !!x);
    // (the gentler one)
    return plans.sort((a, b) => a.reduce((t, sg) => t + (sg.kind === 'curve' ? Math.abs(sg.angle) : 0), 0) - b.reduce((t, sg) => t + (sg.kind === 'curve' ? Math.abs(sg.angle) : 0), 0))[0];
  }
  /** How near (studs) the mouse must be to catch a track or an end: about 14 pixels at any zoom (up to 4 studs, zoomed far out). */
  private reach(px = 14) { return Math.min(4, Math.max(0.1, px / this.scale)); }
  /** (select) The track whose bed, sleepers or ballast p is on: a click anywhere on it picks it, not only near its centre line. */
  private onBand(p: [number, number]) {
    const d = this.host.design();
    // (each track's own width: its own gauge's, mixed gauges, and its ballast (its own, expert))
    const halfOf = (gs: number, bal: string) => (gs + 1) / 2 + 1.5 + (bal === 'buddy' ? 2 : bal === 'ballast' ? 1 : 0);
    // (looked for as far as the widest reaches, then as far as each narrower one: a route's end within the reach is
    // found before its band, so the widest track's reach alone would miss a narrower track's band near an end)
    const all = inForceAll(d), halves = d.routes.map((r, i) => halfOf(routeGaugeStuds(d, r), all[i].ballast));
    for (const reach of [...new Set([halfOf(d.gaugeStuds, d.options?.ballast ?? 'none'), ...halves])].sort((a, b) => b - a)) {
      const h = this.nearTrack(p, reach);
      if (h && Math.hypot(h.pose.x - p[0], h.pose.y - p[1]) <= halves[h.route] + 0.25) return { ...h, end: undefined };
    }
    return undefined;
  }
  private nearTrack(p: [number, number], reach = this.reach(), skip?: number): { route: number; pose: Pose; end: 'start' | 'end' | undefined } | undefined {
    let best: { route: number; pose: Pose; end: 'start' | 'end' | undefined; d: number } | undefined;
    const carried = skip === undefined ? undefined : this.carriedNow();
    this.host.design().routes.forEach((r, i) => {
      if (i === skip || carried?.has(i)) return;
      // (a route whose box is further from p than the reach, with a stud for the points between its samples: not looked along)
      const bx = routeBox(r), m = reach * 1.4 + 1;
      if (p[0] < bx[0] - m || p[0] > bx[2] + m || p[1] < bx[1] - m || p[1] > bx[3] + m) return;
      const end = follow(r, r.segs);
      for (const [pose, which] of [[{ x: r.x, y: r.y, heading: r.heading }, 'start'], [end, 'end']] as const) {
        const d = Math.hypot(pose.x - p[0], pose.y - p[1]);
        if (d < reach && (!best || d < best.d)) best = { route: i, pose: which === 'start' ? { ...pose, heading: norm180(pose.heading + 180) } : pose, end: which, d };
      }
      if (best?.end) return;
      // along the track: on a straight, at whole studs from its start; on a
      // curve, every 0.25 stud
      let q: Pose = { x: r.x, y: r.y, heading: r.heading };
      for (const sg of r.segs) {
        if (sg.kind === 'straight') {
          const dx = -Math.sin((q.heading * Math.PI) / 180), dy = Math.cos((q.heading * Math.PI) / 180);
          const t = Math.round((p[0] - q.x) * dx + (p[1] - q.y) * dy);
          if (t > 0 && t < sg.studs) {
            const pt = follow(q, [{ kind: 'straight', studs: t }]);
            const d = Math.hypot(pt.x - p[0], pt.y - p[1]);
            if (d < reach * 1.4 && (!best || d < best.d - 0.05)) best = { route: i, pose: pt, end: undefined, d };
          }
          q = follow(q, [sg]);
          continue;
        }
        const len = (Math.abs(sg.angle) * Math.PI * sg.radius) / 180;
        const n = Math.max(1, Math.ceil(len / 0.25));
        for (let k = 1; k < n; k++) {
          const f = k / n;
          const pt = follow(q, [{ ...sg, angle: sg.angle * f }]);
          const d = Math.hypot(pt.x - p[0], pt.y - p[1]);
          if (d < reach && (!best || d < best.d - 0.05)) best = { route: i, pose: pt, end: undefined, d };
        }
        q = follow(q, [sg]);
      }
    });
    return best && { route: best.route, pose: best.pose, end: best.end };
  }

  /** (select) Every track joined to the one at w selected (a double click, a double tap, or Select joined): false when there's none there. */
  private selectJoinedAt(w: [number, number] | undefined, px = 18): boolean {
    if (!w || this.mode !== 'select' || this.active || this.placing || this.pathDraw || this.splitArmed || this.cutArmed || this.stretchArmed || this.sleeperArmed || !this.picks('track')) return false;
    const hit = this.nearTrack(w, this.reach(px)) ?? this.onBand(w);
    if (!hit) return false;
    this.selectJoined([hit.route]);
    return true;
  }
  private selectJoined(routes: number[]) {
    if (!routes.length) return;
    const all = this.withJoined(routes), name = this.host.design().routes[routes[0]].name || `Route ${routes[0] + 1}`;
    this.setSelection(all);
    this.say(all.length > routes.length ? (routes.length > 1 ? `${all.length} joined tracks selected` : `${name} and the ${all.length - 1} joined to it selected`) : `${routes.length > 1 ? 'They aren\'t' : `${name} isn't`} joined to another track`, 2500);
  }

  // ---------- touch: the bar of buttons for what only keys do (placing a part, drawing, a cut path, a tool waiting for a tap) ----------
  /** The touch bar's Alt: no snapping (placing, drawing, an end dragged), or (moving tracks) the selected ones alone. */
  private touchAlt = false;
  private touchKind = '';
  /** The buttons for the touch bar now (none with a mouse): what keys do for what's going on. */
  touchTools(): TouchTool[] {
    if (!this.touching && !matchMedia('(pointer: coarse)').matches) return [];
    const armed = this.splitArmed || this.cutArmed || this.stretchArmed || this.sleeperArmed || !!this.freeArmed;
    const kind = this.placing ? 'place' : this.pathDraw ? 'path' : armed ? 'armed' : this.mode === 'measure' ? 'measure' : this.active ? 'draw' : this.mode === 'select' && this.selection().length && !this.selItemNow ? 'select' : '';
    if (kind !== this.touchKind) { this.touchKind = kind; this.touchAlt = false; this.alt = false; }
    const cancel: TouchTool = { id: 'Escape', label: 'Cancel', title: 'Stop without changing anything (Esc)' };
    const snap: TouchTool = { id: 'alt', label: 'Snap', title: 'Snapping onto track ends and guides: tap to place freely (Alt)', on: !this.touchAlt };
    switch (kind) {
      case 'place': return [
        { id: 'R', label: '⟲', title: 'Turn it left 22.5° (Shift+R)', group: 1 }, { id: 'r', label: '⟳', title: 'Turn it right 22.5° (R)', group: 1 }, { id: 'm', label: 'Mirror', title: 'Mirror it (M)', group: 1 },
        { id: 'ArrowLeft', label: '←', title: 'Move it a stud left (arrow keys)', group: 2 }, { id: 'ArrowUp', label: '↑', title: 'Move it a stud up', group: 2 }, { id: 'ArrowDown', label: '↓', title: 'Move it a stud down', group: 2 }, { id: 'ArrowRight', label: '→', title: 'Move it a stud right', group: 2 },
        snap, { id: 'Enter', label: 'Put down', title: 'Put it down where it is (Enter)', primary: true }, cancel];
      case 'path': return [
        { id: 'Backspace', label: 'Undo corner', title: 'Take the last corner back (Backspace)', off: !this.pathDraw!.length },
        { id: 'Enter', label: 'Done', title: 'End the cut path here (Enter)', primary: true, off: this.pathDraw!.length < 2 }, cancel];
      case 'armed': return [cancel];
      case 'measure': return this.meas.a ? [{ id: 'Escape', label: 'Clear', title: 'Clear the measurement (Esc)' }] : [];
      case 'draw': return [snap, { id: 'Escape', label: 'Stop', title: 'Stop laying this track (Esc, or hold a finger still)', primary: true }];
      case 'select': {
        const sel = this.selection(), joined = this.withJoined(sel).length > sel.length;
        // (a selected track with points on it: throw them in the 3D view, the ones nearest where it was tapped)
        const pts = this.pointsToThrow();
        return [...(joined ? [{ id: 'joined', label: 'Select joined', title: 'Select every track joined to these (double-tap a track)' },
          { id: 'alt', label: 'Move alone', title: 'Dragged, the selected tracks leave the tracks joined to them behind (Alt)', on: this.touchAlt }] : []),
          ...(pts ? [{ id: 'throw', label: 'Throw', title: 'Throw the points on this track nearest where you tapped it: the 3D view shows them set the other way', group: 2 }] : [])];
      }
    }
    return [];
  }
  /** The built points on a selected track nearest the pointer (where the track was tapped), by their key: the touch bar's Throw. */
  pointsToThrow(): string | undefined {
    const d = this.host.design(), ids = new Set(this.selection().map((i) => d.routes[i]?.name || String(i)));
    const its = (this.overlay?.items ?? []).filter((it) => it.kind === 'points' && !it.off && !it.cand && (it.routes ?? []).some((r) => ids.has(r)));
    if (!its.length) return undefined;
    const m = this.mouse, far = (it: OverlayItem) => (m ? Math.hypot(it.at[0] / MM - m[0], it.at[1] / MM - m[1]) : 0);
    return its.reduce((a, b) => (far(b) < far(a) ? b : a)).key;
  }
  /** A touch bar button pressed: what its key does. */
  touchDo(id: string) {
    if (id === 'alt') { this.touchAlt = !this.touchAlt; this.alt = this.touchAlt && this.touchKind !== 'select'; this.guideKey = ''; return this.draw(); }
    if (id === 'joined') { this.selectJoined(this.selection()); return this.draw(); }
    if (id === 'throw') { const key = this.pointsToThrow(); if (key) this.host.throwPoints?.(key); return; }
    const key = id.length === 1 ? id.toLowerCase() : id;
    this.key({ key, code: '', shiftKey: id === 'R', ctrlKey: false, metaKey: false, altKey: false, target: this.el, preventDefault() {} } as unknown as KeyboardEvent, true);
    this.draw();
  }

  // ---------- input ----------
  /**
   * Touch: one finger is the mouse's left button (select, drag, draw), but on
   * empty ground in Select it pans (as the middle button), and held still
   * there first, it drags out a box to select; two fingers pinch to zoom and
   * drag to pan. A part being placed is dragged about (a tap moves it there;
   * the touch bar puts it down). Drawing, the track follows the finger and
   * is laid where it's lifted; a finger held still stops (a right click).
   * A double tap on a track selects what's joined to it.
   * (touch events, not pointer events: a pen on a tablet sends them too, and
   * the pinch needs both fingers at once)
   */
  private touch() {
    const el = this.el;
    const fake = (t: { clientX: number; clientY: number }, button = 0) =>
      ({ clientX: t.clientX, clientY: t.clientY, button, buttons: 1, shiftKey: false, ctrlKey: false, metaKey: false, altKey: this.touchAlt, target: el, preventDefault() {}, stopPropagation() {} }) as unknown as MouseEvent;
    let pinch: { d: number; scale: number; world: [number, number] } | undefined, last: { clientX: number; clientY: number } | undefined, oneButton = 0, start: [number, number] = [0, 0], t0 = 0;
    // (a finger held still on a track in Select: it's added to the selection, or taken out, as Shift+click with a mouse;
    // on empty ground: a box dragged out from there; drawing: the track stopped)
    let hold: number | undefined, held = false, boxing = false, moved = false;
    // (a part being placed, dragged: where the finger took it, from where it was; drawing: laid where the finger's lifted)
    let grab: [number, number] | undefined, drawing = false, lastTap: { t: number; x: number; y: number } | undefined;
    const noHold = () => { clearTimeout(hold); hold = undefined; };
    // (a hold's timer, and what it does: run when the finger lifts too, if it was down long enough and the timer hadn't had its
    // turn yet (a busy page runs the lift's event first))
    let holdDo: (() => void) | undefined, holdMs = 0;
    const arm = (ms: number, f: () => void) => { holdDo = f; holdMs = ms; hold = window.setTimeout(() => { hold = undefined; f(); }, ms); };
    const worldOf = (t: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); return this.toWorld(t.clientX - r.left, t.clientY - r.top); };
    const mid = (e: TouchEvent): [number, number] => { const r = el.getBoundingClientRect(), [a, b] = [e.touches[0], e.touches[1]]; return [(a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top]; };
    const spread = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touching = true;
      // (one finger down alone: a pinch before it is over, even one whose last finger was lifted off a chip, not the plan)
      if (e.touches.length === 1) pinch = undefined;
      if (e.touches.length === 1) {
        const t = e.touches[0], w = worldOf(t);
        last = t; start = [t.clientX, t.clientY]; t0 = e.timeStamp; held = false; boxing = false; moved = false; grab = undefined; drawing = false;
        noHold();
        if (this.placing) {
          const at = this.mouse ?? this.toWorld(el.clientWidth / 2, el.clientHeight / 2);
          grab = [at[0] - w[0], at[1] - w[1]];
          return;
        }
        if (this.mode === 'draw' && this.active) {
          drawing = true; this.mouse = w; this.aimEither(); this.drawSoon();
          arm(550, () => { held = true; drawing = false; this.stopDrawing(); navigator.vibrate?.(15); });
          return;
        }
        // (on empty ground in Select: pan, as the middle button; on track, a lever or points: as the left button)
        // (+ Rail or + Sleeper waiting: the finger lays it, wherever it is)
        const onSomething = !!(this.freeArmed || this.handleAt(w) || this.leverAt(w) || this.itemAt(w) || this.nearTrack(w, this.reach(24)) || this.onBand(w) || (this.mode === 'select' && this.itemHits(w).length));
        oneButton = this.mode === 'select' && !onSomething ? 1 : 0;
        this.mouse = w;
        const before = this.selection(), itemsBefore = this.selItems().filter(boxable);
        this.pressed = undefined;
        this.down(fake(t, oneButton));
        // (a finger held still on a cut or a cut path: it's added to the ones selected, or taken out, as Shift+click)
        const onItem = this.mode === 'select' && (this.multiDrag || (this.cutDrag && this.cutDrag.kind !== 'corner')) && boxable(this.pressed) ? this.pressed : undefined;
        if (onItem) {
          arm(500, () => {
            held = true;
            // (the press itself selected it, ready to drag: the ones selected before put back, then this one added or taken out)
            this.cutDrag = undefined; this.multiDrag = undefined;
            if (itemsBefore.length) this.setItems(itemsBefore); else this.setItem(undefined);
            this.toggleItem(onItem);
            navigator.vibrate?.(15);
          });
          return;
        }
        const on = this.mode === 'select' && !this.handleDrag && !this.leverDrag && !this.itemDrag && !this.drag && !this.tableDrag ? this.nearTrack(w, this.reach(24)) ?? this.onBand(w) : undefined;
        if (on) arm(500, () => {
          held = true;
          // (the press itself selected it alone, ready to drag: put back as it was, then this one added or taken out)
          this.moving = undefined; this.selected = before[0]; this.extra = new Set(before.slice(1));
          this.toggleSelected(on.route);
          navigator.vibrate?.(15);
          this.host.select(this.selected); this.draw();
        });
        // (held still on empty ground: the pan let go of, and a box dragged out from there selects what it touches)
        else if (oneButton === 1 && (this.picks('track') || this.picks('cut'))) arm(450, () => {
          boxing = true;
          this.up(fake({ clientX: start[0], clientY: start[1] }, 1));
          this.box = { x0: w[0], y0: w[1], x1: w[0], y1: w[1], add: false };
          navigator.vibrate?.(15);
          this.say(this.picks('track') ? 'Drag out a box: what it touches is selected' : 'Drag out a box: the cuts it touches are selected', 2500); this.draw();
        });
        return;
      }
      noHold();
      if (e.touches.length === 2) startPinch(e);
    }, { passive: false });
    // (a second finger: whatever the first began ends where it is, and the two pinch and pan; the second can come down on a chip over
    // the plan, the legend or the hint, and the plan hears of it only as the first finger moves)
    const startPinch = (e: TouchEvent) => {
      noHold(); held = false;
      if (last && !pinch && !grab && !drawing) this.up(fake(last, oneButton));
      grab = undefined; drawing = false; boxing = false; this.box = undefined;
      const m = mid(e);
      pinch = { d: spread(e), scale: this.scale, world: this.toWorld(m[0], m[1]) };
    };
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!pinch && e.touches.length >= 2) startPinch(e);
      if (pinch && e.touches.length >= 2) {
        const m = mid(e);
        this.scale = Math.min(80, Math.max(0.5, (pinch.scale * spread(e)) / Math.max(1, pinch.d)));
        this.ox = m[0] - pinch.world[0] * this.scale; this.oy = m[1] + pinch.world[1] * this.scale;
        this.drawSoon();
        return;
      }
      if (!pinch && e.touches.length === 1) {
        if (held) return;
        const t = e.touches[0];
        if (Math.hypot(t.clientX - start[0], t.clientY - start[1]) >= 8) { noHold(); moved = true; }
        last = t;
        if (grab && this.placing) {
          if (!moved) return;
          const w = worldOf(t); this.mouse = [w[0] + grab[0], w[1] + grab[1]];
          this.placing.moved = true; this.placingMoved(t.clientX, t.clientY); this.drawSoon();
          return;
        }
        if (drawing) { this.mouse = worldOf(t); this.aimEither(); this.drawSoon(); return; }
        this.move(fake(last, oneButton));
      }
    }, { passive: false });
    const end = (e: TouchEvent) => {
      e.preventDefault();
      if (hold !== undefined && !moved && !pinch && e.type === 'touchend' && e.timeStamp - t0 >= holdMs) { noHold(); holdDo?.(); }
      noHold();
      if (pinch) { if (e.touches.length === 0) pinch = undefined; last = undefined; return; }
      if (held) { held = false; last = undefined; return; }
      const t = e.changedTouches[0] ?? last, tap = !moved && e.timeStamp - t0 < 350;
      // (a part being placed: a tap moves it there; dragged, it stays where it's let go of, for the touch bar's Put down)
      if (grab) { grab = undefined; if (tap && this.placing && e.type === 'touchend') { this.mouse = worldOf(t); this.placing.moved = true; this.draw(); } last = undefined; return; }
      // (drawing: laid where the finger's lifted)
      if (drawing) { drawing = false; if (e.type === 'touchend') this.down(fake(t)); last = undefined; return; }
      if (last) this.up(fake(t, oneButton));
      if (boxing) { boxing = false; last = undefined; this.draw(); return; }
      // (a tap on empty ground: nothing selected, as a click there)
      if (last && oneButton === 1 && !moved) { this.setSelection([]); this.draw(); }
      // (two taps on a track, quickly: what's joined to it selected, as a double click)
      if (last && tap && oneButton === 0 && this.mode === 'select') {
        if (lastTap && performance.now() - lastTap.t < 400 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 24) { lastTap = undefined; this.selectJoinedAt(worldOf(t), 24); }
        else lastTap = { t: performance.now(), x: t.clientX, y: t.clientY };
      } else lastTap = undefined;
      last = undefined;
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  }
  /** A route added to the selection, or taken out of it (Shift+click; a finger held on it). */
  private toggleSelected(route: number) {
    if (this.selected === undefined) this.selected = route;
    else if (route === this.selected) { this.selected = [...this.extra][0]; this.extra.delete(this.selected!); }
    else if (this.extra.has(route)) this.extra.delete(route);
    else this.extra.add(route);
  }
  private down(e: MouseEvent) {
    this.alt = e.altKey;
    this.syncActive();
    // (the right button pans, drawing or not: a right click without a drag stops the track being drawn)
    if (e.button === 1 || e.button === 2 || this.space) {
      this.panning = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy, right: e.button === 2 };
      return;
    }
    const w = this.evWorld(e);
    if (this.selItemNow?.kind === 'joint') this.setItem(undefined);
    // a template being placed: the click puts it down
    if (this.placing && e.button === 0) {
      this.mouse = w; this.placing.moved = true;
      const pl = this.placedNow(true)!, tpl = this.placing.tpl;
      clearTimeout(this.placing.settle); this.placing = undefined; this.host.place?.(tpl, pl.placement); this.draw(); return;
    }
    // Measure: the first click starts, the second ends, the next starts again
    if (this.mode === 'measure' && e.button === 0) {
      const mp = this.measureAt(w);
      this.meas = !this.meas.a || this.meas.b ? { a: mp } : { a: this.meas.a, b: mp };
      this.draw(); return;
    }
    // (a cut path being drawn: each click a corner on the stud grid, if nothing's against the path so far)
    if (this.pathDraw && e.button === 0) {
      const next = [...this.pathDraw, snapToGrid(this.cutGrid(), w)], laid = gridPath(this.cutGrid(), next);
      const why = laid.length > PATH_MAX.pts ? `A cut path has ${PATH_MAX.pts} corners at most: press Enter to end it` : laid.length >= 2 ? this.pathWhy(next) : undefined;
      if (why) this.say(why); else this.pathDraw = next;
      this.draw(); return;
    }
    // (+ Rail: pressed where it starts, dragged out to where it ends (a tap: 8 studs along); + Sleeper: laid where tapped,
    // across the track there if it's on one)
    if (this.freeArmed && e.button === 0) {
      const d = this.host.design(), list = ((d.expert ??= {}).free ??= []), p: [number, number] = [Math.round(w[0]), Math.round(w[1])], id = nextFreeId(list);
      if (this.freeArmed === 'rail') {
        const f: FreeItem = { id, kind: 'rail', a: p, b: [p[0], p[1] + 8] };
        list.push(f); this.selectItem({ kind: 'free', id });
        this.freeDrag = { id, part: 'to', w0: w, orig: structuredClone(f), moved: false, laying: true };
      } else {
        const near = this.nearTrack(w, 6), r = near && d.routes[near.route], hd = r ? placeAlong(r, Math.max(0, alongBeyond(r, w))).heading : 0;
        const at: [number, number] = [Math.round(w[0] * 2) / 2, Math.round(w[1] * 2) / 2];
        list.push({ id, kind: 'sleeper', at, heading: Math.round(hd * 100) / 100, len: 8 });
        this.freeArmed = undefined; this.selectItem({ kind: 'free', id }); this.host.changed(true); this.say('Sleeper laid · drag it, or set it on its card', 5000);
      }
      this.draw(); return;
    }
    // (Add a sleeper's waiting for a click on the route: one more there, on a half stud (any quarter on a track-lined underside))
    if (this.sleeperArmed && e.button === 0) {
      const sel = this.selection(), r = sel.length === 1 ? this.host.design().routes[sel[0]] : undefined, lay = r && this.sleeperLay(sel[0]), n = r && nearestAlong(r, w);
      if (!r || !lay || !n || n.dist > this.reach(24) + 0.5) { this.say('Click on the selected route, where the sleeper goes (Esc cancels)'); return; }
      const q = lay.whole ? 2 : 4, at = Math.round(n.s * q) / q, item = { kind: 'sleeper' as const, route: sel[0], at, add: true as const };
      const why = this.setSleeper(item, { at, add: true });
      if (why) { this.say(why); return; }
      this.sleeperArmed = false; this.selectItem(item); this.host.changed(true); this.say(`Sleeper added ${at} studs along · drag it, or set it on its card`, 5000);
      return;
    }
    // (Split's waiting for a click on the route)
    if (this.cutArmed && e.button === 0) {
      const cut = this.cutFor(w);
      if (!cut) { this.say('Click on the selected route, where to cut it into parts (Esc cancels)'); return; }
      const why = this.host.cut?.(cut.route, cut.s);
      if (why) this.say(why); else { this.cutArmed = false; this.draw(); }
      return;
    }
    if (this.splitArmed && e.button === 0) {
      const cut = this.cutFor(w);
      if (cut) this.splitAt(cut); else this.say('Click on the selected route, where to cut it (Esc cancels)');
      return;
    }
    // (Add a stretch's waiting for a press on the route, dragged along it)
    if (this.stretchArmed && e.button === 0) {
      const sel = this.selection(), rr = sel.length === 1 ? this.host.design().routes[sel[0]] : undefined, n = rr && nearestAlong(rr, w);
      if (!rr || !n || n.dist > this.reach(24) + 0.5) { this.say('Press on the selected route where the stretch starts, and drag along it to where it ends (Esc cancels)'); return; }
      this.stretchNew = { route: sel[0], s0: n.s, s1: n.s }; this.mouse = w; this.draw();
      return;
    }
    // (what the press is on: plan.hitTest; anything but a cut, a cut path, a stretch or a joint, and the one selected is let go of)
    const hit = this.hitTest(w);
    // (the cuts selected before: a box dragged out with Shift adds to them)
    const itemsWere = this.selItems().filter(boxable);
    if (hit?.kind !== 'item') this.setItem(undefined);
    // (a press on a cut worked out where tracks join: what the line is, said; the press goes on as any other)
    if (e.button === 0 && this.mode === 'select' && hit?.kind !== 'item') this.jointCutNote(w);
    // Pressing on a handle of the selected route: drag it (a curve's angle or radius, a straight's length)
    if (hit?.kind === 'handle') {
      const h = hit.handle, ri = this.selection()[0], hr = this.host.design().routes[ri];
      this.handleDrag = { route: ri, seg: h.seg, kind: h.kind, orig: structuredClone(hr.segs[h.seg]), moved: false, sx: e.clientX, sy: e.clientY, carry: this.carrying(ri, 'start', segsStuds(hr.segs.slice(0, h.seg))) }; return;
    }
    // Pressing on a lever: drag it (side, out, along)
    if (hit?.kind === 'lever') { const it = hit.it; this.leverDrag = { it, moved: false, off: [it.at[0] / MM - w[0], it.at[1] / MM - w[1]] }; return; }  // (held where it was grabbed)
    if (hit?.kind === 'mark') { this.itemDrag = { ...hit.mark, sx: e.clientX, sy: e.clientY }; return; }
    if (hit?.kind === 'tw' && isTw(hit.it.kind)) { this.selectItem({ kind: 'tw', tw: hit.it.kind, key: hit.it.key }); return; }
    if (hit?.kind === 'blade') {
      this.selectItem({ kind: 'tw', tw: 'points', key: hit.key, blade: hit.blade });
      if (hit.heel) {
        const it = this.overlay?.items?.find((q) => q.kind === 'points' && q.key === hit.key), line = it?.blades?.[hit.blade];
        if (line && line.length > 1) {
          const a = line[line.length - 2], c = line[line.length - 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
          const was = (this.host.design().trackwork?.points?.[hit.key]?.bladeHeel?.[hit.blade] ?? 0) / MM;
          this.heelDrag = { key: hit.key, blade: hit.blade, at: [c[0] / MM, c[1] / MM], dir: [(c[0] - a[0]) / l, (c[1] - a[1]) / l], was, moved: false };
        }
      }
      return;
    }
    // Pressing on a track's end (when not drawing): drag it to reshape the
    // track, or (Draw mode, no drag) carry the track on from there.
    if (hit?.kind === 'end') {
      const r = this.host.design().routes[hit.route];
      // (a locked track's end isn't dragged or carried on: it's selected, and says so)
      if (r.locked) { this.extra.clear(); this.selTables.clear(); this.selected = hit.route; this.host.select(this.selected); this.say(lockedWhy(this.host.design(), [hit.route])!); return; }
      const work = hit.end === 'end' ? r : reversed(r);
      // reshape from the start of the last curve (and the straight before it)
      let c = -1;
      work.segs.forEach((sg, k) => { if (sg.kind === 'curve') c = k; });
      const anchor = c < 0 ? Math.max(0, work.segs.length - 1) : c > 0 && work.segs[c - 1].kind === 'straight' ? c - 1 : c;
      // (what's joined to it past where it's reshaped from goes with its end; what's joined before that stays)
      this.drag = { route: hit.route, end: hit.end, sx: e.clientX, sy: e.clientY, moved: false, orig: structuredClone(r), anchor, lastGood: structuredClone(r), carry: this.carrying(hit.route, hit.end === 'end' ? 'start' : 'end', segsStuds(work.segs.slice(0, anchor))) };
      this.extra.clear(); this.selTables.clear(); this.selected = hit.route; this.host.select(this.selected);
      return;
    }
    if (this.mode === 'select') {
      // (a cut, a cut path, a stretch or a joint: selected, and dragged from there)
      if (hit?.kind === 'item') { this.pressItem(hit.hit, w, e.shiftKey || e.ctrlKey || e.metaKey); return; }
      // (a table's handle: drag the table about)
      if (hit?.kind === 'table') {
        const tk = hit.table;
        // (a click on a table's name selects it, with Shift adds it; a selected table dragged takes the whole selection with it)
        const addTo = e.shiftKey || e.ctrlKey || e.metaKey;
        if (addTo) { if (!this.selTables.delete(tk)) this.selTables.add(tk); this.draw(); return; }
        const d = this.host.design();
        if (!this.selTables.has(tk)) this.setSelection([], [tk]);
        if (this.selection().length || this.selTables.size > 1) {
          this.startMoving(w, this.selection(), this.tableSelection().map((k) => ({ k, orig: structuredClone(d.tables![k]) })));
          return;
        }
        this.tableDrag = { k: tk, x: w[0], y: w[1], orig: structuredClone(d.tables![tk]), moved: false }; return;
      }
      // pressing on a selected track: drag the selection about
      const add = e.shiftKey || e.ctrlKey || e.metaKey;
      // pressing on empty ground: drag out a box to select what it touches
      // (tracks and tables are boxed; where a click takes cuts and not tracks (Clicks pick: Cuts and cut paths), the cuts
      // across tracks and the cut paths; none when a click takes neither)
      if (hit?.kind !== 'route') { if (this.picks('track') || this.picks('cut')) this.box = { x0: w[0], y0: w[1], x1: w[0], y1: w[1], add, ...(add && { items: itemsWere }) }; return; }
      if (!add && (hit.route === this.selected || this.extra.has(hit.route))) {
        const d = this.host.design();
        this.startMoving(w, this.selection(), this.tableSelection().map((k) => ({ k, orig: structuredClone(d.tables![k]) })));
        return;
      }
      if (add) this.toggleSelected(hit.route);
      else {
        this.selected = hit.route; this.extra.clear(); this.selTables.clear();
        // (and it can be dragged straight away)
        this.startMoving(w, [hit.route]);
      }
      this.host.select(this.selected);
      this.draw();
      return;
    }
    const d = this.host.design();
    if (!this.active) {
      // Start: from a track end (carry it on), from the middle of a track
      // (branch off it), or from an empty grid point.
      const on = this.nearTrack(w);
      if (on?.end === 'end') this.active = { route: on.route, end: on.pose };
      else if (on) {
        // from a track's start, or along it: a new track starting there,
        // along it (a branch: a switch) or back out of it, whichever way the
        // mouse goes
        this.active = { route: undefined, start: on.pose, end: on.pose, either: on.pose.heading, from: on.route };
        this.aimEither();
      }
      else { const g = this.guided(w); this.active = { route: undefined, start: { x: g[0], y: g[1], heading: NaN } }; }
      this.draw();
      return;
    }
    // Lay the planned track.
    const segs = this.planTo(w);
    if (!segs) return;
    const snapTo = this.joinableEnd(w);
    if (this.active.route === undefined) {
      const st = this.active.start!;
      const heading = Number.isNaN(st.heading) ? this.freeHeading(st, w) : st.heading;
      // (a branch is what the track it leaves is; else what Draw's Track choice says)
      const sys = this.active.from !== undefined ? d.routes[this.active.from]?.system : this.host.system?.();
      d.routes.push({ name: freeName(d, 'T'), x: st.x, y: st.y, heading, segs, ...(sys === 'monorail' && { system: sys }) });
      this.active = { route: d.routes.length - 1, end: follow({ ...st, heading }, segs) };
    } else {
      const rs = d.routes[this.active.route].segs, last = rs[rs.length - 1];
      if (last?.kind === 'straight' && segs[0].kind === 'straight') { last.studs = Math.round((last.studs + segs[0].studs) * 1e6) / 1e6; rs.push(...segs.slice(1)); }
      else rs.push(...segs);
      this.active.end = follow(this.active.end!, segs);
    }
    // laid onto another track's end: join them into one track, and stop
    if (snapTo && this.active.route !== undefined) {
      this.extra.clear(); this.selTables.clear(); this.selected = snapTo.meet ? this.active.route : this.join(this.active.route, snapTo.route, snapTo.end);
      this.active = undefined;
      this.host.select(this.selected); this.host.changed(true); return this.draw();
    }
    this.extra.clear(); this.selTables.clear(); this.selected = this.active.route;
    this.host.select(this.selected);
    this.host.changed(true);
    this.draw();
  }
  private move(e: MouseEvent) {
    if (this.box) {
      const p = this.evWorld(e); this.box.x1 = p[0]; this.box.y1 = p[1]; this.mouse = p;
      return this.drawSoon();
    }
    if (this.itemDrag) {
      const id = this.itemDrag, p = this.evWorld(e), d = this.host.design();
      this.mouse = p;
      // (a press without a drag is a click: points toggled; only built points move along)
      if (!id.moved && Math.hypot(e.clientX - (id.sx ?? e.clientX), e.clientY - (id.sy ?? e.clientY)) < 4) return;
      id.moved = true;
      if (id.it.kind === 'points' && (!id.it.dir || this.pointsState(id.it.key).state !== 'built')) return this.drawSoon();
      const along = ((p[0] - id.from[0]) * id.dir[0] + (p[1] - id.from[1]) * id.dir[1]) * MM;
      let v = Math.round(id.base + along);
      if (id.it.kind === 'groove') v = Math.max(0, v);
      const tw = (d.trackwork ??= {}) as Record<string, Record<string, Record<string, number>>>, group = (tw[id.it.kind] ??= {});
      if ((group[id.it.key]?.[id.prop] ?? 0) !== v) { group[id.it.key] = { ...group[id.it.key], [id.prop]: v }; this.host.changed(false); }
      const end = id.prop === 'd0' ? id.it.pts[0] : id.prop === 'd1' ? id.it.pts[id.it.pts.length - 1] : id.it.at;
      id.at = [end[0] + id.dir[0] * (v - id.base), end[1] + id.dir[1] * (v - id.base)];
      return this.drawSoon();
    }
    if (this.handleDrag) {
      const hd = this.handleDrag, r = this.host.design().routes[hd.route];
      this.mouse = this.evWorld(e);
      if (!hd.moved && Math.hypot(e.clientX - hd.sx, e.clientY - hd.sy) < 4) return;
      hd.moved = true;
      const opts = { shift: e.shiftKey, insetStuds: END_INSET_PX / this.scale };
      let res = r && dragResult(r, hd, this.mouse, opts);
      hd.why = res?.why;
      this.guideNow = undefined; this.guideKey = '';
      if (r && res) {
        // (the same guides as drawing an end: the route's end on another end's straight-on line, or 8 or 16 studs beside a straight; Alt: off)
        const gd = guidedHandle(r, hd, this.mouse, res, { ...this.guideCands(this.mouse, hd.route), scale: this.scale, snapPx: this.touching ? 22 : 10 }, { ...opts, off: this.alt });
        if (gd.guide && gd.end) { res = { value: gd.value }; this.guideNow = { point: gd.end, guides: [gd.guide] }; }
        const next = withValue(r.segs[hd.seg], hd.kind, res.value), reshaped = JSON.stringify(next) !== JSON.stringify(r.segs[hd.seg]);
        if (reshaped) r.segs[hd.seg] = next;
        // (what's joined to the track past this piece goes with it; Alt: it's left where it was)
        if (this.carry(hd.carry, e.altKey) || reshaped) { this.host.changed(false); this.host.live?.(hd.route); }
      }
      return this.drawSoon();
    }
    if (this.leverDrag) {
      this.mouse = this.evWorld(e); this.leverDrag.moved = true;
      this.dragLever([this.mouse[0] + this.leverDrag.off[0], this.mouse[1] + this.leverDrag.off[1]]);
      return this.drawSoon();
    }
    if (this.cutDrag) { this.mouse = this.evWorld(e); this.dragCut(this.mouse); return this.drawSoon(); }
    if (this.multiDrag) { this.mouse = this.evWorld(e); this.dragMulti(this.mouse); return this.drawSoon(); }
    if (this.stretchDrag) { this.mouse = this.evWorld(e); this.dragStretch(this.mouse); return this.drawSoon(); }
    if (this.sleeperDrag) { this.mouse = this.evWorld(e); this.dragSleeper(this.mouse); return this.drawSoon(); }
    if (this.heelDrag) {
      const hd = this.heelDrag, p = this.evWorld(e); this.mouse = p;
      const along = (p[0] - hd.at[0]) * hd.dir[0] + (p[1] - hd.at[1]) * hd.dir[1];
      this.setBladeHeel(hd.key, hd.blade, hd.was + along); hd.moved = true;
      this.host.changed(false); this.host.item?.(); return this.drawSoon();
    }
    if (this.freeDrag) { this.mouse = this.evWorld(e); this.dragFree(this.mouse); return this.drawSoon(); }
    if (this.railDrag) { this.mouse = this.evWorld(e); this.dragRail(this.mouse); return this.drawSoon(); }
    if (this.stretchNew) { const sn = this.stretchNew, rr = this.host.design().routes[sn.route]; this.mouse = this.evWorld(e); if (rr) sn.s1 = alongBeyond(rr, this.mouse); return this.drawSoon(); }
    if (this.tableDrag) {
      const m = this.tableDrag, p = this.evWorld(e), d = this.host.design();
      const dx = Math.round(p[0] - m.x), dy = Math.round(p[1] - m.y); // (whole studs: stays on the grid)
      if (d.tables?.[m.k]?.locked) { if (dx || dy) { this.say(lockedWhy(d, [], [m.k])!, 1500); } this.mouse = p; return this.drawSoon(); }
      if ((dx || dy || m.moved) && d.tables?.[m.k]) { m.moved = true; d.tables[m.k] = movedTable(m.orig, dx, dy); this.host.changed(false); }
      this.mouse = p;
      return this.drawSoon();
    }
    if (this.moving) {
      const m = this.moving, p = this.evWorld(e), d = this.host.design();
      const dx = Math.round(p[0] - m.x), dy = Math.round(p[1] - m.y); // (whole studs: stays on the grid)
      // (the tracks joined to them go along; Alt held: the selected ones alone, the others back where they were)
      const alone = e.altKey, own = lockedWhy(d, m.orig.map((o) => o.i), (m.tables ?? []).map((t) => t.k)), lock = own ?? (alone ? undefined : lockedWhy(d, m.carried.map((o) => o.i)));
      if (lock && (dx || dy)) { if (!m.said) { m.said = true; this.say(own ? lock : `${lock}, and joined to this: hold Alt to move this alone`); } this.mouse = p; return this.drawSoon(); }
      if (dx || dy || m.moved) {
        m.moved = true; m.alone = alone; m.by = [dx, dy];
        for (const o of m.orig) { d.routes[o.i].x = Math.round((o.x + dx) * 1e4) / 1e4; d.routes[o.i].y = Math.round((o.y + dy) * 1e4) / 1e4; }
        this.moveCarried(alone);
        for (const o of m.tables ?? []) if (d.tables?.[o.k]) d.tables[o.k] = movedTable(o.orig, dx, dy);
        this.host.changed(false);
      }
      this.mouse = p;
      return this.drawSoon();
    }
    if (this.panning) {
      this.el.style.cursor = 'grabbing';
      this.ox = this.panning.ox + e.clientX - this.panning.x; this.oy = this.panning.oy + e.clientY - this.panning.y;
      if (Math.hypot(e.clientX - this.panning.x, e.clientY - this.panning.y) >= 4) this.panning.moved = true;
      // (the track being drawn still follows the mouse)
      if (this.active) this.mouse = this.evWorld(e);
      return this.drawSoon();
    }
    if (this.drag) {
      this.alt = e.altKey;
      if (!this.drag.moved && Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) < 4) return;
      this.drag.moved = true;
      this.mouse = this.evWorld(e);
      this.reshape(this.mouse);
      return this.drawSoon();
    }
    if (e.target !== this.el) return;
    this.alt = e.altKey;
    this.mouse = this.evWorld(e);
    if (this.placing) { this.placing.moved = true; this.placingMoved(e.clientX, e.clientY); }
    this.kbDraw = false;
    this.aimEither();
    this.cursor();
    this.drawSoon();
  }
  /** The mouse pointer says what a press would do: grab a lever, points or an end, pick a track, or lay track. */
  private cursor() {
    const w = this.mouse;
    let c = this.mode !== 'select' ? 'crosshair' : 'default', over: number | undefined;
    if (this.space) c = 'grab';
    else if (w && !this.active) {
      const hit = this.hitTest(w);
      if (hit?.kind === 'handle' || hit?.kind === 'lever' || hit?.kind === 'mark' || (hit?.kind === 'item' && hit.hit.item.kind !== 'joint')) c = 'grab';
      else if (hit?.kind === 'end') c = 'move';
      else if (hit && this.mode === 'select' && hit.kind !== 'table') c = 'pointer';
      // (the track a click would pick in Select, lightly marked: not over a handle, a lever, points or a cut)
      if (this.mode === 'select' && !this.panning && (hit?.kind === 'route' || hit?.kind === 'end')) over = hit.route;
    }
    if (this.el.style.cursor !== c) this.el.style.cursor = c;
    if (over !== this.hoverRoute) { this.hoverRoute = over; this.drawSoon(); }
  }
  /** The route under the pointer in Select (lightly marked). */
  private hoverRoute: number | undefined;
  private up(e: MouseEvent) {
    const pan = this.panning;
    this.panning = undefined;
    if (pan) this.cursor();
    if (pan) { if (pan.right && !pan.moved && this.active) this.stopDrawing(); return; }
    if (this.itemDrag) {
      const id = this.itemDrag, moved = !!id.at; this.itemDrag = undefined;
      // (a tap, not a drag: with the expert tools it's selected, its card under the plan; else points are taken out or put back)
      if (!id.moved && this.expert && this.mode === 'select' && isTw(id.it.kind)) this.selectItem({ kind: 'tw', tw: id.it.kind, key: id.it.key });
      else if (!id.moved && id.it.kind === 'points') this.togglePoints(id.it.key);
      else if (moved) this.host.changed(true);
      return this.draw();
    }
    if (this.handleDrag) {
      const hd = this.handleDrag, moved = hd.moved; this.handleDrag = undefined;
      if (moved) { this.host.changed(true); if (hd.carry?.open.length) this.say(`Opened the joint between ${jointNames(this.host.design(), hd.carry.open)}`); }
      return this.draw();
    }
    if (this.leverDrag) {
      const ld = this.leverDrag, moved = ld.moved; this.leverDrag = undefined;
      if (!moved && this.expert && this.mode === 'select') { this.selectItem({ kind: 'tw', tw: 'throw', key: ld.it.key }); return this.draw(); }
      if (moved && ld.at && ld.arm) this.leverPending = { key: ld.it.key, at: ld.at, arm: ld.arm };
      if (moved) this.host.changed(true); return this.draw();
    }
    if (this.multiDrag) {
      // (several: let go where they can't all be, back where they were, and why said; not moved at all, the one pressed is selected alone)
      const md = this.multiDrag; this.multiDrag = undefined;
      if (md.why) { this.multiMove(md.orig, 0, 0); this.say(md.why); }
      if (md.moved) { this.host.changed(true); this.host.item?.(); } else if (!md.why) this.selectItem(md.on);
      return this.draw();
    }
    if (this.cutDrag) {
      // (let go where it can't be: back where it was, and why said; else kept, a path tidied on the grid: one undo step)
      const cd = this.cutDrag, d = this.host.design(); this.cutDrag = undefined;
      if (cd.moved) {
        const path = cd.kind !== 'cut' ? this.cutPaths().find((q) => q.id === cd.id) : undefined;
        if (cd.why) { if (path && cd.kind !== 'cut') path.pts = cd.orig; this.say(cd.why); }
        else if (path) { const laid = gridPath(this.cutGrid(), path.pts); if (laid.length >= 2) path.pts = laid; else if (cd.kind !== 'cut') path.pts = cd.orig; }
        void d; this.host.changed(true);
      }
      return this.draw();
    }
    if (this.stretchDrag) { const moved = this.stretchDrag.moved; this.stretchDrag = undefined; if (moved) this.host.changed(true); return this.draw(); }
    if (this.sleeperDrag) { const moved = this.sleeperDrag.moved; this.sleeperDrag = undefined; if (moved) this.host.changed(true); return this.draw(); }
    if (this.heelDrag) { const hd = this.heelDrag; this.heelDrag = undefined; if (hd.moved) this.host.changed(true); this.host.item?.(); return this.draw(); }
    if (this.freeDrag) {
      const fd = this.freeDrag; this.freeDrag = undefined;
      // (a rail laid by a tap, not dragged: 8 studs up the plan from where it was tapped, as put down at the press)
      if (fd.laying) { this.freeArmed = undefined; this.host.changed(true); this.say('Rail laid · drag it, or a round end, or set it on its card', 5000); }
      else if (fd.moved) this.host.changed(true);
      this.host.item?.(); return this.draw();
    }
    if (this.railDrag) { const moved = this.railDrag.moved; this.railDrag = undefined; if (moved) this.host.changed(true); this.host.item?.(); return this.draw(); }
    if (this.stretchNew) { this.endNewStretch(); return this.draw(); }
    if (this.tableDrag) { const moved = this.tableDrag.moved; this.tableDrag = undefined; if (moved) this.host.changed(true); return this.draw(); }
    if (this.moving) {
      const m = this.moving, d = this.host.design(); this.moving = undefined;
      if (m.moved) {
        // (moved alone, Alt: the joints it left are open now, and said)
        const open = m.watch.filter((j) => !holds(d, j)), sel = new Set(m.orig.map((o) => o.i)), id = (i: number) => d.routes[i].name || String(i);
        const list = (ns: string[]) => (ns.length <= 3 ? ns.slice(0, -1).join(', ') + (ns.length > 1 ? ' and ' : '') + ns[ns.length - 1] : `${ns.slice(0, 2).join(', ')} and ${ns.length - 2} more`);
        const mine = [...new Set(open.map((j) => (sel.has(j.a) ? j.a : j.b)))].map(id), others = [...new Set(open.map((j) => (sel.has(j.a) ? j.b : j.a)))].map(id);
        this.host.changed(true);
        if (open.length) this.say(`Took ${list(mine)} apart from ${list(others)}`);
      }
      return this.draw();
    }
    if (this.box) {
      const b = this.box; this.box = undefined;
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      const tiny = x1 - x0 < 0.2 && y1 - y0 < 0.2;
      if (!this.picks('track')) {
        // (only cuts are picked: the cuts across tracks and the cut paths the box touches, several at once)
        const keep = b.items ?? [], found = tiny ? [] : itemsInBox(this.host.design(), this.cutPaths(), x0, y0, x1, y1), next = [...keep, ...found.filter((f) => !keep.some((k) => sameItem(k, f)))];
        if (next.length) { this.setItems(next); if (next.length > 1) this.say(`${itemsLabel(next)} · drag one to move them all · Delete takes them out`, 4000); } else this.setItem(undefined);
        return this.draw();
      }
      const inBox = tiny ? [] : this.host.design().routes.map((r, i) => (trace(r, r.segs, 0.5).some((q) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1) ? i : -1)).filter((i) => i >= 0);
      const keep = b.add ? this.selection() : [], keepT = b.add ? this.tableSelection() : [];
      // (a table only when the whole of it is inside the box)
      const tIn = tiny ? [] : (this.hidden.has('tables') ? [] : (this.host.design().tables ?? []).map((t, k) => (tableInBox(t, x0, y0, x1, y1) ? k : -1)).filter((k) => k >= 0));
      this.setSelection([...keep, ...inBox.filter((i) => !keep.includes(i))], [...keepT, ...tIn.filter((k) => !keepT.includes(k))]);
      return;
    }
    const dr = this.drag;
    if (!dr) return;
    this.drag = undefined;
    if (dr.moved) {
      if (this.dragBad && dr.lastGood) this.host.design().routes[dr.route] = dr.lastGood;
      // (what it carries, where the shape it's left with takes it; a joint that opened is said)
      this.carry(dr.carry, e.altKey);
      const opened = dr.carry?.open.length ? `Opened the joint between ${jointNames(this.host.design(), dr.carry.open)}` : undefined;
      if (this.dragBad && dr.lastGood) { /* (back to the last good shape) */ }
      else if (this.dragSnap?.meet) { /* (dual-gauge track and one of its gauges: their ends met, still two tracks) */ }
      else if (this.dragSnap) {
        // joined: make the two one track (the dragged end meeting the other's end)
        const routes = this.host.design().routes;
        if (dr.end === 'start') { reverseShared(this.host.design(), routes[dr.route].name || String(dr.route), cutLength(routes[dr.route])); routes[dr.route] = reversedRoute(routes[dr.route]); reverseAnchors(this.host.design(), routes[dr.route].name || String(dr.route)); }
        this.extra.clear(); this.selTables.clear(); this.selected = this.join(dr.route, this.dragSnap.route, this.dragSnap.end);
        this.host.select(this.selected);
      }
      this.dragBad = false; this.dragSnap = undefined;
      this.host.changed(true);
      if (opened) this.say(opened);
      return this.draw();
    }
    // (a click on a joined end, in Select: the joint is selected, to take apart or join again)
    if (this.mode === 'select' && e.button === 0 && this.picks('joint') && this.jointsAt(dr.route, dr.end).length) this.setItem({ kind: 'joint', route: dr.route, end: dr.end });
    // a click on an end: in Draw mode, carry the track on from it
    if (this.mode === 'draw' && e.button === 0) {
      const r = this.host.design().routes[dr.route];
      if (dr.end === 'end') this.active = { route: dr.route, end: follow(r, r.segs) };
      else { const p = { x: r.x, y: r.y, heading: r.heading }; this.active = { route: undefined, start: p, end: p, either: r.heading }; this.aimEither(); }
    }
    this.draw();
  }
  /** Reshape the dragged route so the dragged end lands on t. */
  private reshape(w: [number, number]) {
    const dr = this.drag!, d = this.host.design();
    const work = dr.end === 'end' ? structuredClone(dr.orig) : reversed(dr.orig);
    const head = work.segs.slice(0, dr.anchor);
    const from = follow(work, head);
    const t = this.guided(w, from, dr.route);
    // onto another track's end: join it, arriving heading into it
    let snap = this.snapEnd(this.mouse ?? t, dr.route, dr.end);
    let good = snap ? planToPose(from, snap.pose, this.host.radius() > 0 ? this.host.radius() : 24) : this.planFrom(from, t);
    // (an end nearby that it can't join head on: just go to the point, beside it)
    if (snap && !good) { snap = undefined; good = this.planFrom(from, t); }
    // onto the middle of another track: merge into it
    if (!snap) { const m = this.mergeOnto(this.mouse ?? t, from, dr.route); if (m) good = m; }
    this.dragSnap = snap;
    // A track reshaped from its start, when that start isn't joined to
    // anything, can swing round its start: first turned the other way (when
    // the end is dragged back past it), else aimed straight at the point.
    if (!good && head.length === 0 && this.endFree(dr.route, dr.end === 'end' ? 'start' : 'end')) {
      const turned = (h: number) => {
        const f2 = { ...from, heading: h };
        const g2 = snap ? planToPose(f2, snap.pose, this.host.radius() > 0 ? this.host.radius() : 24) : this.planFrom(f2, t);
        if (g2) { work.heading = h; from.heading = h; }
        return g2;
      };
      good = turned(((from.heading + 360) % 360) - 180)
        ?? turned(Math.round(((Math.atan2(-(t[0] - from.x), t[1] - from.y) * 180) / Math.PI) * 1e6) / 1e6);
    }
    this.dragBad = !good;
    // (if it can't, show the curve it would need, its bad part in red, and
    // go back to the last good shape when let go)
    const tail = good ?? planAnyway(from, t);
    const segs = [...head];
    for (const sg of tail) {
      const last = segs[segs.length - 1];
      if (last?.kind === 'straight' && sg.kind === 'straight') segs[segs.length - 1] = { kind: 'straight', studs: Math.round((last.studs + sg.studs) * 1e6) / 1e6 };
      else segs.push(sg);
    }
    this.dragBadFrom = dr.end === 'end' ? head.length : -1;
    this.dragBadTo = dr.end === 'end' ? -1 : segs.length - head.length;
    const next = { ...work, segs };
    const r = dr.end === 'end' ? next : reversed(next);
    const cur = d.routes[dr.route];
    cur.x = Math.round(r.x * 1e4) / 1e4; cur.y = Math.round(r.y * 1e4) / 1e4; cur.heading = Math.round(r.heading * 1e6) / 1e6; cur.segs = r.segs;
    if (good) this.drag!.lastGood = structuredClone(cur);
    this.carry(dr.carry, this.alt);
  }
  private dragBad = false;
  /** Why the end the mouse is at can't be joined to the track being dragged or drawn (set by snapEnd). */
  private joinBlocked: string | undefined;
  private dragSnap: { route: number; end: 'start' | 'end'; pose: Pose; meet?: boolean } | undefined;
  /**
   * Another track's end near p to join onto (not route skip): which route and
   * end, and the pose to arrive at (heading into that track).
   */
  /** An end to join while drawing: only one the track can reach head on (else it just goes beside it). */
  private joinableEnd(p: [number, number]) {
    const a = this.active;
    if (!a?.end || Number.isNaN(a.end.heading)) return undefined;
    const sn = this.snapEnd(p, a.route);
    return sn && planToPose(a.end, sn.pose, this.host.radius() > 0 ? this.host.radius() : 24) ? sn : undefined;
  }
  /** meet: the two stay two routes, their ends met (dual-gauge track and one of its gauges carrying on: routeedits.ts gaugeMeet). mineEnd: the end of route skip that's dragged or drawn from. */
  private snapEnd(p: [number, number], skip: number | undefined, mineEnd: 'start' | 'end' = 'end'): { route: number; end: 'start' | 'end'; pose: Pose; meet?: boolean } | undefined {
    let best: { route: number; end: 'start' | 'end'; pose: Pose; d: number; meet?: boolean } | undefined;
    const d0 = this.host.design(), mine = skip !== undefined ? d0.routes[skip] : undefined;
    this.joinBlocked = undefined;
    if (this.alt) return undefined;
    const carried = skip === undefined ? undefined : this.carriedNow();
    d0.routes.forEach((r, i) => {
      if (i === skip || carried?.has(i)) return;
      // (an end it can't be joined to isn't snapped to: and the reason is said when it's near)
      const why = r.locked ? 'it is locked' : mine && joinProblem(d0, mine, r);
      const e = follow(r, r.segs);
      for (const [end, pose] of [['start', { x: r.x, y: r.y, heading: r.heading }], ['end', { ...e, heading: e.heading + 180 }]] as const) {
        const d = Math.hypot(pose.x - p[0], pose.y - p[1]);
        if (why) {
          // (dual-gauge track and one of its two gauges: their ends meet, the narrow gauge's beside the middle)
          const mp = !r.locked && mine ? gaugeMeetPose(d0, r, end, mine, mineEnd) : undefined;
          if (mp) { if (d < this.reach(18) && (!best || d < best.d)) best = { route: i, end, pose: mp, d, meet: true }; }
          else if (d < this.reach(18)) this.joinBlocked = `can't join ${r.name || i}: ${why}`;
          continue;
        }
        if (d < this.reach(18) && (!best || d < best.d)) best = { route: i, end, pose: { ...pose, heading: ((pose.heading % 360) + 540) % 360 - 180 }, d };
      }
    });
    return best && { route: best.route, end: best.end, pose: best.pose, ...(best.meet && { meet: true }) };
  }
  /** Join route b onto the end of route a (b's start or end meeting a's end): a gets b's track, b goes. */
  private join(a: number, b: number, bEnd: 'start' | 'end') {
    // (not tracks that differ in system, gauge, guard rails or third rail: a route has one of each: snapEnd doesn't offer them)
    return joinInto(this.host.design(), a, b, bEnd);
  }
  /** Is this end of route i free (not joined to another track's end, nor on another track)? */
  private endFree(i: number, which: 'start' | 'end'): boolean {
    const routes = this.host.design().routes, r = routes[i];
    const p = which === 'start' ? { x: r.x, y: r.y } : follow(r, r.segs);
    return routes.every((o, j) => {
      if (j === i) return true;
      const e = follow(o, o.segs);
      if (Math.hypot(o.x - p.x, o.y - p.y) < 0.05 || Math.hypot(e.x - p.x, e.y - p.y) < 0.05) return false;
      // on it (another track branching from here, or this one branching off it)
      return trace(o, o.segs, 0.25).every(([x, y]) => Math.hypot(x - p.x, y - p.y) > 0.2);
    });
  }
  /** While a drag can't reach: the dragged route's segments that are bad ([from, to) by index; -1 = open). */
  private dragBadFrom = -1;
  private dragBadTo = -1;
  private wheel(e: WheelEvent) {
    e.preventDefault();
    const r = this.el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const before = this.toWorld(sx, sy);
    // (in pixels whatever the device reports, a notch at most a step: a smooth, even zoom from a wheel or a trackpad)
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1) * (e.ctrlKey ? 4 : 1);
    this.scale = Math.min(80, Math.max(0.5, this.scale * Math.exp(-Math.max(-150, Math.min(150, dy)) * 0.0015)));
    this.ox = sx - before[0] * this.scale; this.oy = sy + before[1] * this.scale;
    this.drawSoon();
  }
  /** Redraw at the next frame, once however many wheel or pan events come before it (a redraw per event fell behind them). */
  private drawPending = 0;
  drawSoon() {
    if (this.drawPending) return;
    this.drawPending = requestAnimationFrame(() => { this.drawPending = 0; this.draw(); });
  }
  private key(e: KeyboardEvent, down: boolean) {
    if (e.key === 'Alt') {
      this.alt = down; this.guideKey = '';
      // (Alt pressed or let go in the middle of a drag: what's joined is left behind, or comes along again, at once)
      const cy = (this.drag?.moved ? this.drag : this.handleDrag?.moved ? this.handleDrag : undefined)?.carry;
      if (this.moving?.moved && this.moving.carried.length && !lockedWhy(this.host.design(), this.moving.carried.map((o) => o.i))) { this.moveCarried(down); this.host.changed(false); }
      else if (cy && this.carry(cy, down)) this.host.changed(false);
      this.drawSoon();
    }
    if (e.code === 'Space' && !down) this.space = false;
    if (typingIn(e) || !down || dialogOpen()) return;
    // (Space held pans; not when a button, a tick box or a section's heading has the focus: Space presses it)
    if (e.code === 'Space' && !['BUTTON', 'INPUT', 'SUMMARY', 'A'].includes((e.target as HTMLElement)?.tagName)) { this.space = true; e.preventDefault(); }
    // the keyboard on the plan (the plan or the page itself has the focus, not a field or button)
    const onPlan = e.target === document.body || e.target === this.el, plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (onPlan && plain && this.mode === 'select' && !this.active && !this.placing && !this.handleDrag && !this.drag && !this.moving) {
      if (e.key === '[' || e.key === ']') { e.preventDefault(); this.cycle(e.key === ']' ? 1 : -1); return; }
      // Tab on the plan: through the selected route's handles, then on out of it
      if (e.key === 'Tab' && e.target === this.el) {
        const hs = this.handles();
        if (hs.length) {
          const at = this.kbHandle ? hs.findIndex((h) => h.seg === this.kbHandle!.seg && h.kind === this.kbHandle!.kind) : -1, to = at + (e.shiftKey ? -1 : 1);
          if (to >= 0 && to < hs.length) { e.preventDefault(); this.kbHandle = { seg: hs[to].seg, kind: hs[to].kind }; this.say(`${handleLabel(this.host.design().routes[this.selection()[0]].segs[hs[to].seg])} · arrow keys change it (Shift: bigger steps)`, 4000); return; }
          this.kbHandle = undefined; this.drawSoon();
        }
      }
      if (e.key.startsWith('Arrow') && this.kbHandleNow()) {
        e.preventDefault();
        this.nudgeHandle(e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1, e.shiftKey);
        return;
      }
      if (e.key === 'Enter' && this.selection().length === 1 && !this.tableSelection().length && !this.kbHandleNow()) { e.preventDefault(); this.startKeyboardDraw(e.shiftKey ? 'start' : 'end'); return; }
    }
    // drawing by keyboard
    if (this.kbDraw && this.active && onPlan && plain) {
      if (e.key.startsWith('Arrow') && this.mouse) {
        e.preventDefault();
        const n = e.shiftKey ? 8 : 1, m = this.snap(this.mouse);
        this.mouse = [m[0] + (e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0), m[1] + (e.key === 'ArrowUp' ? n : e.key === 'ArrowDown' ? -n : 0)];
        this.aimEither(); this.draw(); return;
      }
      if (e.key === 'Enter' && this.mouse) {
        e.preventDefault();
        const r = this.el.getBoundingClientRect(), [sx, sy] = this.toScreen(this.mouse[0], this.mouse[1]);
        this.down({ clientX: r.left + sx, clientY: r.top + sy, button: 0, buttons: 1, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target: this.el, preventDefault() {}, stopPropagation() {} } as unknown as MouseEvent);
        return;
      }
    }
    if (this.placing) {
      const k = e.key.toLowerCase(), p = this.placing;
      if (e.key === 'Escape') { clearTimeout(p.settle); this.placing = undefined; this.draw(); return; }
      // (by keyboard: the arrows move it a stud (Shift: 8), Enter puts it down where it is)
      if (e.key.startsWith('Arrow') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const n = e.shiftKey ? 8 : 1, m = this.mouse ?? this.toWorld(this.el.clientWidth / 2, this.el.clientHeight / 2);
        this.mouse = [Math.round(m[0]) + (e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0), Math.round(m[1]) + (e.key === 'ArrowUp' ? n : e.key === 'ArrowDown' ? -n : 0)];
        p.moved = true; p.session.meter.reset(); this.draw(); return;
      }
      if (e.key === 'Enter' && (e.target === document.body || e.target === this.el)) {
        e.preventDefault();
        const pl = this.placedNow(true)!; clearTimeout(p.settle); this.placing = undefined; this.host.place?.(p.tpl, pl.placement); this.draw(); return;
      }
      if (k === 'r' && !e.ctrlKey && !e.metaKey) { p.turn = norm180(p.turn + (e.shiftKey ? 22.5 : -22.5)); p.moved = true; this.draw(); return; }
      if (k === 'm' && !e.ctrlKey && !e.metaKey) { p.mirror = !p.mirror; p.moved = true; this.draw(); return; }
    }
    if (e.key === 'Escape' && this.mode === 'measure') { if (this.meas.a) { this.meas = {}; return this.draw(); } return this.host.leaveDraw?.(); }
    if (e.key === 'Escape' && (this.splitArmed || this.cutArmed || this.stretchArmed || this.sleeperArmed)) { this.splitArmed = false; this.cutArmed = false; this.stretchArmed = false; this.sleeperArmed = false; this.stretchNew = undefined; return this.draw(); }
    // (a cut path being drawn: Enter ends it, Esc cancels it, Backspace takes its last corner back; a cut being dragged: Esc puts it back)
    if (this.pathDraw) {
      if (e.key === 'Enter') { e.preventDefault(); return this.endCutPath(); }
      if (e.key === 'Escape') { this.pathDraw = undefined; return this.draw(); }
      if (e.key === 'Backspace') { this.pathDraw.pop(); return this.draw(); }
    }
    if (e.key === 'Escape' && this.multiDrag) {
      const md = this.multiDrag; this.multiDrag = undefined;
      this.multiMove(md.orig, 0, 0);
      if (md.moved) this.host.changed(true);
      this.host.item?.(); return this.draw();
    }
    if (e.key === 'Escape' && this.cutDrag) {
      const cd = this.cutDrag, d = this.host.design(); this.cutDrag = undefined;
      if (cd.kind === 'cut') { if (d.routes[cd.route]) d.routes[cd.route].cuts = cd.orig; this.selItemNow = { kind: 'cut', route: cd.route, k: cd.k }; }
      else { const path = this.cutPaths().find((q) => q.id === cd.id); if (path) path.pts = cd.orig; }
      if (cd.moved) this.host.changed(true);
      this.host.item?.();
      return this.draw();
    }
    if (e.key === 'Escape' && this.heelDrag) { const hd = this.heelDrag; this.heelDrag = undefined; this.setBladeHeel(hd.key, hd.blade, hd.was); this.host.changed(true); return this.draw(); }
    if (e.key === 'Escape' && this.freeDrag) {
      const fd = this.freeDrag, d = this.host.design(), list = d.expert?.free ?? []; this.freeDrag = undefined;
      const k = list.findIndex((f) => f.id === fd.id);
      if (k >= 0) { if (fd.laying) { list.splice(k, 1); tidyExpert(d); this.selectItem(undefined); } else list[k] = fd.orig; }
      this.freeArmed = undefined; this.host.item?.(); return this.draw();
    }
    if (e.key === 'Escape' && this.freeArmed) { this.freeArmed = undefined; return this.draw(); }
    if (e.key === 'Escape' && this.railDrag) {
      // (the rail edit put back where it was)
      const rd = this.railDrag, rr = this.host.design().routes[rd.route]; this.railDrag = undefined;
      if (rr) { if (Object.keys(rd.orig).length) rr.railEdits = rd.orig; else delete rr.railEdits; }
      this.selItemNow = rd.run ? { kind: 'run', route: rd.route, side: rd.run.side, k: rd.k } : { kind: 'rail', route: rd.route, what: rd.what, k: rd.k };
      if (rd.moved) { this.host.changed(true); this.host.live?.(rd.route); }
      this.host.item?.();
      return this.draw();
    }
    if (e.key === 'Escape' && this.sleeperDrag) {
      // (the sleeper put back where it was)
      const sd = this.sleeperDrag, rr = this.host.design().routes[sd.route]; this.sleeperDrag = undefined;
      if (rr) { if (sd.orig) rr.sleeperEdits = sd.orig; else delete rr.sleeperEdits; }
      if (sd.moved) { this.host.changed(true); this.host.live?.(sd.route); }
      this.host.item?.();
      return this.draw();
    }
    if (e.key === 'Escape' && this.stretchDrag) {
      // (the stretch put back where it was)
      const sd = this.stretchDrag, rr = this.host.design().routes[sd.route]; this.stretchDrag = undefined;
      if (rr) rr.stretches = sd.orig;
      if (sd.moved) { this.host.changed(true); this.host.live?.(sd.route); }
      this.host.item?.();
      return this.draw();
    }
    // (a cut, a cut path or a stretch selected: Esc lets go of it (a stretch's track stays selected), Delete takes it out, the arrow keys move it a stud)
    const own = this.selItemNow && this.selItemNow.kind !== 'joint' && !this.active ? this.selItemNow : undefined;
    if (e.key === 'Escape' && own) { this.setItem(undefined); return this.draw(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && own && !this.cutDrag && !this.multiDrag && !this.stretchDrag && !this.sleeperDrag && !this.railDrag) return this.deleteItem();
    if (e.key.startsWith('Arrow') && own && this.mode === 'select' && plain && onPlan) {
      e.preventDefault();
      if (!this.cutDrag && !this.multiDrag && !this.stretchDrag && !this.sleeperDrag && !this.railDrag) { const n = e.shiftKey ? 8 : 1; this.nudgeItem(e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, e.key === 'ArrowDown' ? -n : e.key === 'ArrowUp' ? n : 0); }
      return;
    }
    if (e.key === 'Escape' && this.handleDrag) {
      // (the handle's segment put back as it was)
      const hd = this.handleDrag, r = this.host.design().routes[hd.route];
      if (r) r.segs[hd.seg] = hd.orig;
      this.carry(hd.carry, true);
      this.handleDrag = undefined; this.host.changed(true); this.host.live?.(); return this.draw();
    }
    if (e.key === 'Escape' && this.drag) {
      // put the dragged track back as it was
      this.host.design().routes[this.drag.route] = this.drag.orig;
      this.carry(this.drag.carry, true);
      this.drag = undefined; this.dragBad = false; this.dragSnap = undefined;
      this.host.changed(true); return this.draw();
    }
    // Esc mid-drag of the routes, a table, a lever, a check rail's end or a selection box: put back as it was (not a step), the selection kept
    if (e.key === 'Escape' && (this.moving || this.tableDrag || this.itemDrag || this.leverDrag || this.box)) {
      const m = this.moving, t = this.tableDrag, d = this.host.design();
      const sel = this.selection(), selT = this.tableSelection(), changedAlready = !!(m?.moved || t?.moved || this.itemDrag?.moved || this.leverDrag?.moved);
      if (m) for (const o of [...m.orig, ...m.carried]) if (d.routes[o.i]) { d.routes[o.i].x = o.x; d.routes[o.i].y = o.y; }
      if (m?.tables) for (const o of m.tables) if (d.tables?.[o.k]) d.tables[o.k] = o.orig;
      if (t && d.tables?.[t.k]) d.tables[t.k] = t.orig;
      const lever = !!(this.itemDrag?.moved || this.leverDrag?.moved);
      this.moving = undefined; this.tableDrag = undefined; this.itemDrag = undefined; this.leverDrag = undefined; this.leverPending = undefined; this.box = undefined;
      if (lever && this.host.revert) { this.host.revert(); this.setSelection(sel.filter((i) => i < this.host.design().routes.length), selT); }
      else if (changedAlready) this.host.changed(false);
      return this.draw();
    }
    // (a drag going on: Delete would pull the routes out from under it)
    if ((e.key === 'Delete' || e.key === 'Backspace') && (this.moving || this.tableDrag || this.itemDrag || this.leverDrag || this.box || this.handleDrag || this.drag || this.stretchNew)) return;
    // Esc: stop the track being drawn; pressed again (nothing being drawn), back to Select
    // (in Select mode, Esc lets go of the selection)
    if (e.key === 'Escape') {
      if (this.active) this.stopDrawing();
      else if (this.mode === 'draw') this.host.leaveDraw?.();
      else if (this.selection().length || this.tableSelection().length) this.setSelection([]);
    }
    // Arrow keys in Select: the selected routes a stud over (Shift: eight, a LEGO plate's width), one step each; not while a button, a slider or a list has the focus (they use the arrows)
    if (e.key.startsWith('Arrow') && this.mode === 'select' && (this.selection().length || this.tableSelection().length) && !e.ctrlKey && !e.metaKey && !e.altKey && (e.target === document.body || e.target === this.el)) {
      const n = e.shiftKey ? 8 : 1, dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, dy = e.key === 'ArrowDown' ? -n : e.key === 'ArrowUp' ? n : 0;
      e.preventDefault();
      if (this.moving || this.drag || this.handleDrag || this.tableDrag || this.itemDrag || this.leverDrag || this.box || this.active || (!dx && !dy)) return;
      const lock = lockedWhy(this.host.design(), this.selection(), this.tableSelection());
      if (lock) { this.say(lock); return; }
      // (the tracks joined to them go along)
      const routes = this.host.design().routes, all = this.withJoined(this.selection()), held = lockedWhy(this.host.design(), all);
      if (held) { this.say(`${held}, and joined to this: take the joint apart first (click it, then Take apart)`); return; }
      for (const i of all) if (routes[i]) { routes[i].x = Math.round((routes[i].x + dx) * 1e4) / 1e4; routes[i].y = Math.round((routes[i].y + dy) * 1e4) / 1e4; }
      const ts = this.host.design().tables;
      for (const k of this.tableSelection()) if (ts?.[k]) ts[k] = movedTable(ts[k], dx, dy);
      this.host.changed(true); this.draw();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (this.selected !== undefined || this.tableSelection().length) && !this.active) {
      const d = this.host.design(), routes = d.routes, gone = new Set(this.tableSelection());
      const lock = lockedWhy(d, this.selection(), this.tableSelection());
      if (lock) { this.say(lock); return; }
      for (const i of this.selection().sort((a, b) => b - a)) routes.splice(i, 1);
      if (gone.size && d.tables) { d.tables = d.tables.filter((_, k) => !gone.has(k)); if (!d.tables.length) delete d.tables; }
      this.setSelection([]); this.host.changed(true);
    }
  }
  stopDrawing() { this.active = undefined; this.kbDraw = false; this.meas = {}; this.placing = undefined; this.draw(); }
  /** Whatever's being drawn or dragged, let go of where it is (the design under it replaced: undone, a template, a file). */
  letGo() {
    this.guideNow = undefined; this.guideKey = '';
    this.drag = undefined; this.dragBad = false; this.dragSnap = undefined; this.moving = undefined; this.box = undefined; this.tableDrag = undefined;
    this.itemDrag = undefined; this.handleDrag = undefined; this.leverDrag = undefined; this.leverPending = undefined; this.panning = undefined;
    this.cutDrag = undefined; this.multiDrag = undefined; this.stretchDrag = undefined; this.sleeperDrag = undefined; this.railDrag = undefined; this.sleeperArmed = false; this.stretchNew = undefined; this.stretchArmed = false;
    this.stopDrawing();
  }
  /** The track being drawn carries on from where its route ends now (the route changed on its card, turned or mirrored since the last click); a route that's gone: nothing being drawn. */
  private syncActive() {
    const a = this.active;
    if (!a || a.route === undefined) return;
    const r = this.host.design().routes[a.route];
    if (!r) this.active = undefined; else a.end = follow(r, r.segs);
  }

  /** Heading for a new track from an empty grid point: the 22.5-degree direction nearest the mouse. */
  private freeHeading(st: Pose, w: [number, number]) {
    const ang = (Math.atan2(-(w[0] - st.x), w[1] - st.y) * 180) / Math.PI;
    return norm180(Math.round(ang / 22.5) * 22.5);
  }
  /** The track from pose p to point t, by the chosen planner. */
  private planFrom(p: Pose, t: [number, number]): DSeg[] | undefined {
    const r = this.host.radius();
    return r > 0 ? plan(p, t, r) : r === 0 ? planAuto(p, t) : planFreeTurning(p, t);
  }
  /** The track planned from the active end to the (snapped) mouse point. */
  private planTo(w: [number, number]): DSeg[] | undefined {
    const a = this.active!;
    const snap = a.end && !Number.isNaN(a.end.heading) ? this.snapEnd(w, a.route) : undefined;
    const joined = snap && planToPose(a.end!, snap.pose, this.host.radius() > 0 ? this.host.radius() : 24);
    if (joined) return joined;
    const from0 = a.end ?? a.start;
    if (from0 && !Number.isNaN(from0.heading)) { const m = this.mergeOnto(w, from0, a.route ?? a.from); if (m) return m; }
    const t = this.guided(w, a.end ?? a.start, a.route ?? a.from);
    if (a.route === undefined && a.start && Number.isNaN(a.start.heading)) {
      // first piece from an empty point: straight, along the nearest direction
      const h = this.freeHeading(a.start, w);
      const dx = -Math.sin((h * Math.PI) / 180), dy = Math.cos((h * Math.PI) / 180);
      const len = Math.round(((t[0] - a.start.x) * dx + (t[1] - a.start.y) * dy) * 1e6) / 1e6;
      return len > 0 ? [{ kind: 'straight', studs: len }] : undefined;
    }
    return this.planFrom(a.end ?? a.start!, t);
  }

  // ---------- drawing ----------
  /** What a click or drag would do now (worded for a finger when the screen is a touch one). */
  hint(): string {
    const h = this.hintText();
    return this.touching || matchMedia('(pointer: coarse)').matches ? forFingers(h) : h;
  }
  private hintText(): string {
    if (this.placing) { const pl = this.placedNow(); return `Click (or Enter) to put it down${pl?.snapped ? `, joining ${pl.snapped.design.route}` : this.alt ? ', not snapping (Alt)' : ''}${pl?.why ? ` (${pl.why})` : ''} · arrows move it · R / Shift+R turn it · M mirrors it · hold Alt for no snapping · Esc cancels`; }
    // (a drag opening a joint: said before anything else, while it can still be put back)
    {
      const d = this.host.design(), m = this.moving, cy = (this.drag?.moved ? this.drag : this.handleDrag?.moved ? this.handleDrag : undefined)?.carry;
      if (cy?.open.length) return `Opens the joint between ${jointNames(d, cy.open)} · let go to keep the shape · Esc puts it back`;
      const open = m?.moved && m.alone ? m.watch.filter((j) => !holds(d, j)) : [];
      if (open.length) return `Moving ${m!.orig.length > 1 ? 'them' : 'it'} alone: takes apart ${jointNames(d, open)} · let go to put ${m!.orig.length > 1 ? 'them' : 'it'} down · Esc puts ${m!.orig.length > 1 ? 'them' : 'it'} back`;
    }
    if (this.noteText) return this.noteText;
    if (this.splitArmed) return 'Click on the route where to cut it · Esc cancels';
    if (this.cutArmed) return 'Click on the route where to cut it into parts · it stays one route · Esc cancels';
    if (this.sleeperArmed) return 'Click on the route where the sleeper goes · Esc cancels';
    if (this.sleeperDrag?.moved || this.sleeperDrag?.why) return this.sleeperDrag.why ?? 'Moving the sleeper along its track: let go to put it down · Esc puts it back';
    if (this.pathDraw) return this.pathDraw.length ? `Cut path, ${this.pathDraw.length} point${this.pathDraw.length > 1 ? 's' : ''}: click the next (between studs; a slant is laid as steps) · Enter ends it · Backspace takes the last back · Esc cancels` : 'Click where the cut path starts: outside the part, or on another cut · it runs between the studs · Esc cancels';
    if (this.multiDrag?.moved) return this.multiDrag.why ?? 'Moving the cuts: each along its own track, whole studs; a path over the stud grid · let go to put them down · Esc puts them back';
    if (this.cutDrag?.moved) return this.cutDrag.why ?? (this.cutDrag.kind === 'cut' ? 'Moving the cut along its track, whole studs: let go to put it down · Esc puts it back' : 'Moving the cut path on the stud grid: let go to put it down · Esc puts it back');
    if (this.stretchArmed) return this.stretchNew ? 'Drag along the track to where the stretch ends, and let go · Esc cancels' : 'Press on the route where the stretch starts and drag along it to where it ends · whole studs · Esc cancels';
    if (this.stretchDrag?.moved) return this.stretchDrag.why ?? `Moving the stretch${this.stretchDrag.part === 'from' ? '\'s start' : this.stretchDrag.part === 'to' ? '\'s end' : ''} along its track, whole studs: let go to put it down · Esc puts it back`;
    const si = this.selItemNow;
    if (this.selAlso.length) return `${itemsLabel(this.selItems().filter(boxable))} · drag one to move them all (a cut along its own track, a path over the grid), or press an arrow key · Delete takes them out · ${matchMedia('(pointer: coarse)').matches ? 'hold a finger on a cut to add it or take it out' : 'Shift+click adds a cut or takes it out'} · Esc lets go`;
    if (si?.kind === 'cutpath') { const not = this.overlay?.pathsNot?.find((n) => n.id === si.id); return `${not ? `This cut path isn't made: ${not.why} · ` : 'Cut path selected · '}drag a corner or the path · arrow keys move it a stud · Delete removes it · its joint is on its card`; }
    if (si?.kind === 'cut') return 'Cut across the track selected · drag it along the track, or press an arrow key (a stud; Shift: eight) · Delete removes it';
    if (si?.kind === 'sleeper') return 'Sleeper selected · drag it along the track, or press an arrow key · Delete takes it out · longer, turned, without studs: on its card';
    if (this.railDrag?.moved || this.railDrag?.why) return this.railDrag.why ?? 'Moving it along its track: let go to put it down · Esc puts it back';
    if (si?.kind === 'rail') return `${si.what === 'gap' ? 'Rail gap' : si.what === 'guard' ? 'Guard rails' : 'Check rail'} selected · drag it along the track, or press an arrow key (a stud; Shift: eight) · Delete takes it out · its side and size are on the track's card, Rails`;
    if (this.freeArmed) return this.freeArmed === 'rail' ? 'Press where the rail starts and drag to where it ends (a tap lays one 8 studs long) · Esc cancels' : 'Tap where the sleeper goes: across the track there, if it\'s on one · Esc cancels';
    if (this.freeDrag?.why) return this.freeDrag.why;
    if (this.heelDrag) return 'Making the blade longer: let go to keep it · Esc puts it back';
    if (si?.kind === 'tw' && si.blade !== undefined) return 'One blade of the points · drag its round end along to make it longer · its card has whether it moves';
    if (si?.kind === 'free') return 'Laid by hand · drag it to move it, or a rail\'s round end to make it longer, shorter or turned · Delete takes it away · its card has its numbers';
    if (si?.kind === 'run') return si.out ? 'A stretch of rail taken out · its card types where, or puts the rail back' : 'One rail selected · drag a round end to make it longer or shorter, or the rail to slide it, or press an arrow key · Delete takes it out · its card cuts a stretch out';
    if (si?.kind === 'stretch') return 'Stretch selected · drag it or one of its ends along the track, or press an arrow key (a stud; Shift: eight) · Delete removes it · its settings are in the track\'s card';
    if (this.mode === 'measure') return this.meas.b ? 'Click to measure again · Esc clears' : this.meas.a ? 'Click the second point · it snaps to track ends and centre lines · Esc clears' : 'Click the first point to measure from: it snaps to track ends and centre lines · Esc stops';
    if (this.handleDrag?.moved && this.handleDrag.why) return this.handleDrag.why;
    // (a track reshaped: what comes along)
    const cy = (this.drag?.moved ? this.drag : this.handleDrag?.moved ? this.handleDrag : undefined)?.carry;
    const along = cy?.skip.size && !this.alt ? ` · ${cy.skip.size} joined track${cy.skip.size > 1 ? 's come' : ' comes'} along (hold Alt to leave ${cy.skip.size > 1 ? 'them' : 'it'})` : '';
    if (this.handleDrag?.moved && along) return `Let go to keep the shape${along} · Esc puts it back`;
    if (this.drag?.moved && along && !this.dragBad && !this.dragSnap) return `Release to reshape${along} · Esc puts it back`;
    if (this.drag?.moved) return this.dragBad ? "Can't bend the track this way: release to keep the last good shape, Esc puts it back"
      : this.dragSnap ? 'Release to join the two ends' : this.joinBlocked ? `Release to reshape (${this.joinBlocked}) · Esc puts it back` : 'Release to reshape · drop on another end to join · hold Alt for no snapping · Esc puts it back';
    if (this.active && this.kbDraw) return 'Arrow keys move the crosshair a stud (Shift: eight) · Enter lays track · Esc stops';
    if (this.active) return 'Click to lay track · keep clicking to go on · hold Alt for no snapping · Esc or right-click stops · right-drag pans';
    // (over a lever: which side it's on and what put it there)
    const lv = this.leverDrag?.it ?? (this.mouse && !this.itemDrag ? this.leverAt(this.mouse) : undefined);
    if (lv) {
      const d = this.host.design(), ls = leverSide(d, lv, this.overlay?.items ?? []);
      if (this.leverDrag?.moved) return 'Let go to put the lever here: it goes on the nearest stud it can';
      return `Lever on the ${ls.side} (${ls.why}) · drag it across the track to change sides, or further out${leverSlides(d) ? ' or along' : ''}`;
    }
    const hit = this.mouse && (this.mode !== 'select' || this.picks('track')) ? this.nearTrack(this.mouse) ?? (this.mode === 'select' ? this.onBand(this.mouse) : undefined) : undefined;
    // (over points: what a click does to them)
    const pi = !this.active && this.mouse ? this.itemAt(this.mouse) : undefined;
    if (pi && this.expert && this.mode === 'select' && !this.itemDrag?.moved) return `${pi.it.kind === 'points' ? 'Points' : pi.it.kind === 'check' ? 'Check rail' : 'Flangeway cut'}: click to select ${pi.it.kind === 'points' ? 'them' : 'it'} (its card opens under the plan) · drag to ${pi.it.kind === 'points' ? 'move them along' : 'make it longer or shorter'}`;
    if (pi?.it.kind === 'points' && !this.itemDrag?.moved) {
      const st = this.pointsState(pi.it.key);
      if (st.state === 'built') return `Click to take these points out (the rails run through as plain track)${st.forced ? ' · they were forced' : ''} · drag to move them along`;
      if (st.state === 'off') return 'Points taken out: click to put them back';
      const why = pi.it.cand?.why ?? '';
      if (st.forced) return `Points forced here${st.ok ? '' : `, but ${why}: too far off to build`} · click to unforce`;
      return st.ok ? `No points here (${why}): click to force them` : `No points here: ${why}, too far off to force (redraw it to start on the track)`;
    }
    if (this.mode === 'select') {
      if (this.tableDrag?.moved) return 'Moving the table: let go to put it down';
      // (over a cut, a cut path, a stretch or a joint a click would take: what it is)
      // (not one under a track's end, which a press takes first, nor under a handle)
      const ih = this.mouse && !this.moving && !this.box ? this.itemHits(this.mouse)[0] : undefined;
      if (ih && !sameItem(ih.item, this.selItemNow) && (takesFirst(ih) || !hit?.end) && !this.handleAt(this.mouse!)) {
        const k = ih.item.kind;
        return k === 'cut' ? 'A cut across the track: click to select it, drag it along the track' : k === 'cutpath' ? 'A cut path: click to select it, drag it over the stud grid' : k === 'joint' ? 'A joint: click to select it, then Take apart or Join (in the bar above)'
          : ih.part === 'body' ? 'A stretch with its own settings: click to select it, drag it along the track' : 'A stretch\'s end: drag it along the track, whole studs';
      }
      // (the Pick list on something else than tracks: a click takes only that)
      if (!this.picks('track')) return `Picking only ${PICKS.find((q) => q.id === this.pick)!.label.toLowerCase()}: click one to select it · the Pick list (in the legend) lets clicks take tracks again`;
      if (this.tableSelection().length && this.selected === undefined) return `${this.tableSelection().length} table${this.tableSelection().length > 1 ? 's' : ''} selected · drag by the name to move · Shift+click adds more · Delete removes`;
      if (this.mouse && !this.hidden.has('tables') && this.tableHandle(this.mouse) !== undefined) return 'Drag this table by its name to move it (its size and shape: the Tables panel)';
      { // (a joint selected: what the selection bar's button does)
        const sj = si?.kind === 'joint' && !this.moving?.moved ? this.jointSelected() : undefined;
        if (sj) return sj.joined ? `Joint between ${sj.names} selected · they move together · Take apart (in the bar above) lets each move on its own` : `${sj.names} touch here but are taken apart · Join (in the bar above) puts them back together`;
      }
      if (hit?.end) return this.jointsAt(hit.route, hit.end).some((j) => !j.apart) ? 'Drag this end to reshape the track: what is joined to it comes along · click it to select the joint' : 'Drag this end to reshape the track';
      if (this.moving?.moved) {
        const m = this.moving;
        return m.carried.length && !m.alone ? `Moving ${m.orig.length + m.carried.length} joined tracks: let go to put them down · hold Alt to move ${m.orig.length > 1 ? 'the selected ones' : 'this one'} alone` : 'Moving: let go to put it down';
      }

      if (this.selected !== undefined && this.selection().length === 1 && this.host.design().routes[this.selected]?.locked) return `${this.host.design().routes[this.selected].name || 'The route'} is locked · unlock it on its card to move or change it · copy still works`;
      if (this.selected !== undefined) return `${this.selection().length > 1 ? `${this.selection().length} tracks` : this.host.design().routes[this.selected]?.name ?? ''} selected · drag to move · ${matchMedia('(pointer: coarse)').matches ? 'hold a finger on a track to add it or take it out · double-tap selects what is joined to it' : 'Shift+click adds more · double-click selects all that is joined to it · Delete removes · [ ] pick another · Tab its handles · Enter lays track on'}`;
      if (!this.host.design().routes.length) return 'No track yet: press D (or ✎ Draw) to lay some';
      return 'Click a track to select it, drag it to move it (joined tracks come along) · drag an end to reshape it · D to draw';
    }
    if (hit?.end === 'end') return 'Click to carry the track on · drag to reshape it';
    if (hit?.end === 'start') return 'Click to lay a new track from this end (back out of it, or along it as a branch) · drag to reshape it';
    if (hit) return 'Click to branch off this track';
    return 'Click a grid point to start a track';
  }

  draw() {
    this.syncActive();
    this.host.status?.(this.hint(), this.mouse ? this.snap(this.mouse) : undefined);
    const c = this.ctx, dpr = devicePixelRatio, W = this.el.width / dpr, H = this.el.height / dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(this.el);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const ink = { rail: v('--c-rail', '#4a5560'), centre: v('--c-centre', '#b8b8b0'), label: v('--c-label', '#5c5c55'), mark: v('--c-mark', '#111'),
      tagBg: v('--c-tag-bg', 'rgba(255,255,255,0.92)'), band: v('--c-band', 'rgba(120,110,95,0.16)'), ballast: v('--c-ballast', 'rgba(150,128,96,0.30)'), ballastLow: v('--c-ballast-low', 'rgba(150,128,96,0.16)'), sel: v('--c-sel', '#2b5fb8'), selInk: v('--c-sel-ink', '#1d4fae'),
      mono: v('--c-mono', 'rgba(140,150,170,0.42)'), monoEdge: v('--c-mono-edge', '#5d6678'), check: v('--c-check', '#2b6fe0'), cut: v('--c-cut', '#8a3fd1') };
    // (a finger: the marks drawn bigger, as the route's handles are)
    const z = this.fingers() ? 1.6 : 1;
    c.fillStyle = v('--canvas-bg', '#fbfbf8'); c.fillRect(0, 0, W, H);
    // grid: a line every stud (when not too dense), stronger every 8
    const [wx0, wy1] = this.toWorld(0, 0), [wx1, wy0] = this.toWorld(W, H);
    for (const [step, color] of [[1, v('--c-grid', '#ececE6')], [8, v('--c-grid8', '#d4d4cc')]] as const) {
      if (step * this.scale < 5) continue;
      c.strokeStyle = color; c.lineWidth = 1; c.beginPath();
      for (let x = Math.ceil(wx0 / step) * step; x <= wx1; x += step) { const [sx] = this.toScreen(x, 0); c.moveTo(Math.round(sx) + 0.5, 0); c.lineTo(Math.round(sx) + 0.5, H); }
      for (let y = Math.ceil(wy0 / step) * step; y <= wy1; y += step) { const [, sy] = this.toScreen(0, y); c.moveTo(0, Math.round(sy) + 0.5); c.lineTo(W, Math.round(sy) + 0.5); }
      c.stroke();
    }
    // (g: half the design's gauge, rail to rail, studs; gOf: a route's, its own gauge's where it has one)
    const d = this.host.design();
    {
      // (what a screen reader says for the plan: how many routes, and which is selected and what it is)
      const sel = this.selection().filter((i) => d.routes[i]);
      const label = `Track plan, ${d.routes.length} route${d.routes.length === 1 ? '' : 's'}. ${sel.length === 1 ? `${d.routes[sel[0]].name || `Route ${sel[0] + 1}`} selected: ${describe(d.routes[sel[0]].segs) || 'empty'}${d.routes[sel[0]].locked ? ', locked' : ''}.` : sel.length ? `${sel.length} routes selected.` : 'Nothing selected.'} Keys: [ and ] pick a route, Tab moves between its handles, arrow keys change one, Enter lays track on from its end.`;
      if (this.el.getAttribute('aria-label') !== label) this.el.setAttribute('aria-label', label);
    }
    const g = (d.gaugeStuds + 1) / 2, gOf = (r: DRoute) => (routeGaugeStuds(d, r) + 1) / 2;
    // the tables, under everything: each filled in its colour, outlined, named
    if (d.tables?.length && !this.hidden.has('tables')) d.tables.forEach((t, k) => {
      const pts = tableOutline(t);
      if (pts.length < 3) return;
      c.beginPath(); pts.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x, y); if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); }); c.closePath();
      c.globalAlpha = 0.4; c.fillStyle = t.color ?? TABLE_COLORS[k % TABLE_COLORS.length]; c.fill(); c.globalAlpha = 1;
      const picked = this.selTables.has(k);
      c.strokeStyle = picked ? ink.sel : ink.rail; c.lineWidth = picked ? 3 : 1.5; c.stroke();
      // (its handle: its name in its middle, to drag it by)
      const m = tableMiddle(t), [sx, sy] = this.toScreen(m[0], m[1]);
      c.fillStyle = picked ? ink.selInk : ink.label; c.font = '12px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(`✥ ${t.name || `Table ${k + 1}`}${t.locked ? ' (locked)' : ''}`, sx, sy + 4); c.textAlign = 'start';
    });
    // baseplate edges, where the track is cut (Piece options)
    const bpS = d.options?.baseplate ?? 0;
    if (bpS > 0 && !this.hidden.has('baseplate')) {
      const ox = d.options?.baseplateX ?? 0, oy = d.options?.baseplateY ?? 0;
      c.strokeStyle = 'rgba(224,120,40,0.7)'; c.lineWidth = 1.5; c.setLineDash([8, 6]); c.beginPath();
      for (let x = ox + Math.ceil((wx0 - ox) / bpS) * bpS; x <= wx1; x += bpS) { const [sx] = this.toScreen(x, 0); c.moveTo(sx, 0); c.lineTo(sx, H); }
      for (let y = oy + Math.ceil((wy0 - oy) / bpS) * bpS; y <= wy1; y += bpS) { const [, sy] = this.toScreen(0, y); c.moveTo(0, sy); c.lineTo(W, sy); }
      c.stroke(); c.setLineDash([]);
    }
    const line = (pts: [number, number][], color: string, width: number, dash: number[] = [], g2: CanvasRenderingContext2D = c) => {
      if (pts.length < 2) return;
      g2.strokeStyle = color; g2.lineWidth = width; g2.setLineDash(dash); g2.lineCap = 'butt'; g2.beginPath();
      pts.forEach((p, i) => { const [sx, sy] = this.toScreen(p[0], p[1]); if (i) g2.lineTo(sx, sy); else g2.moveTo(sx, sy); });
      g2.stroke(); g2.setLineDash([]);
    };
    /**
     * Wide see-through bands (sleepers, ballast) drawn as one layer: solid on
     * a scratch canvas, then laid on at the colour's opacity, so where track
     * overlaps (a switch, a crossover) it doesn't come out darker.
     */
    const layer = (color: string, bands: (draw: (pts: [number, number][], width: number) => void) => void) => {
      const m = /rgba?\(([^)]+)\)/.exec(color), parts = m ? m[1].split(',').map((v) => v.trim()) : [];
      if (parts.length < 3) { bands((pts, width) => line(pts, color, width)); return; }
      const off = (this.scratch ??= document.createElement('canvas'));
      if (off.width !== this.el.width || off.height !== this.el.height) { off.width = this.el.width; off.height = this.el.height; }
      const oc = off.getContext('2d')!;
      let cleared = false;
      const clear = () => { if (cleared) return; cleared = true; oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, off.width, off.height); oc.setTransform(c.getTransform()); };
      const solid = `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
      let any = false;
      bands((pts, width) => { any = true; clear(); line(pts, solid, width, [], oc); });
      if (!any) return; // (laying on a whole empty canvas cost as much as drawing the track)
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = parts[3] === undefined ? 1 : Number(parts[3]); c.drawImage(off, 0, 0); c.restore();
    };
    const offsetPts = (r: { x: number; y: number; heading: number }, segs: DSeg[], o: number) => tracedOnce(`o${r.x},${r.y},${r.heading},${o}${JSON.stringify(segs)}`, () => {
      // rail at offset o (studs, + = right) from the centre line
      const pts: [number, number][] = [];
      let q: Pose = { x: r.x, y: r.y, heading: r.heading };
      const push = (p: Pose) => pts.push([p.x + o * Math.cos((p.heading * Math.PI) / 180), p.y + o * Math.sin((p.heading * Math.PI) / 180)]);
      push(q);
      for (const sg of segs) {
        const len = sg.kind === 'straight' ? sg.studs : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180;
        const n = Math.max(1, Math.ceil(len / 0.5));
        for (let k = 1; k <= n; k++) push(follow(q, [sg.kind === 'straight' ? { kind: 'straight', studs: (sg.studs * k) / n } : { ...sg, angle: (sg.angle * k) / n }]));
        q = follow(q, [sg]);
      }
      return pts;
    });
    const railW = Math.max(1, 2.5 / MM * this.scale);
    /** A label by the mouse, kept inside the canvas. */
    const tag = (mx: number, my: number, txt: string, color: string) => {
      c.font = '600 12px system-ui, sans-serif';
      const tw = c.measureText(txt).width;
      // (above the mouse, or below it near the top, where the selection bar and the legend are)
      const x = mx + 10 + tw + 10 > W ? Math.max(4, mx - 10 - tw - 10) : mx + 10, y = my - 26 < 48 ? my + 12 : my - 26;
      c.fillStyle = ink.tagBg; c.fillRect(x, y, tw + 10, 18);
      c.fillStyle = color; c.fillText(txt, x + 5, y + 13);
    };
    /** The guide the pointer is snapped to: a thin dashed line (or arc) with a small label saying its value. */
    const showGuides = () => {
      const g = this.guideNow;
      this.el.dataset.guide = g?.guides.length ? g.guides.map((x) => x.label).join(' | ') : '';
      if (!g?.guides.length) return;
      c.save(); c.setLineDash([6, 4]); c.lineWidth = 1.25; c.strokeStyle = '#d9480f'; c.beginPath();
      for (const gd of g.guides) {
        if (gd.line) { const [a, b] = gd.line.map((q) => this.toScreen(q[0], q[1])); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
        if (gd.arc) for (let k = 0; k <= 40; k++) {
          const an = ((gd.arc.a0 + (gd.arc.sweep * k) / 40) * Math.PI) / 180, q = this.toScreen(gd.arc.c[0] + gd.arc.r * Math.cos(an), gd.arc.c[1] + gd.arc.r * Math.sin(an));
          if (k) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]);
        }
      }
      c.stroke(); c.restore();
      const [px, py] = this.toScreen(g.point[0], g.point[1]);
      c.fillStyle = '#d9480f'; c.fillRect(px - 3, py - 3, 6, 6);
      tag(px, py + 40, g.guides.map((x) => x.label).join(' · '), '#b23c0a');
    };
    if (!(this.drag?.moved) && !this.handleDrag?.moved && !(this.mode !== 'select' && this.mouse)) { this.guideNow = undefined; this.guideKey = ''; }
    /** Draw segments from pose p, each in its colour: bad ones red. */
    const drawSegs = (p: Pose, segs: DSeg[], isBad: (k: number) => boolean, band: string, rail: string, g = (d.gaugeStuds + 1) / 2) => {
      let q = p;
      segs.forEach((sg, k) => {
        const bad = isBad(k);
        if (band) line(trace(q, [sg], 0.5), bad ? 'rgba(224,69,43,0.22)' : band, (2 * g + 3) * this.scale);
        for (const o of [-g, g]) line(offsetPts(q, [sg], o), bad ? '#e0452b' : rail, railW);
        q = follow(q, [sg]);
      });
    };
    // ballast (Piece options), under all the track: the layer a stud wider
    // each side than the sleepers, and with the bottom ("buddy") layer
    // another stud wider each side
    // (each track's own, expert: the design's unless it has its own; a stretch with its own drawn as the track of
    // its own the build makes of it: sx, its pieces)
    const sx = expandStretches(d), dx = sx.design;
    const all = inForceAll(dx), balOf = dx.routes.map((r, i) => (isMono(r) ? 'none' : all[i].ballast));
    if (balOf.some((b) => b !== 'none') && !this.hidden.has('ballast')) {
      // (expert: its reach past the sleepers on the left and on the right, a stud each unless set: the band that wide, off the centre line where the two differ)
      const bl = (i: number) => Math.max(0, all[i].ballastLeftStuds ?? 1), br = (i: number) => Math.max(0, all[i].ballastRightStuds ?? 1);
      const wide = (r: DRoute, i: number) => (2 * gOf(r) + 3 + bl(i) + br(i) + (balOf[i] === 'buddy' ? 2 : 0)) * this.scale;
      const mid = (r: DRoute, i: number) => (bl(i) === br(i) ? trace(r, r.segs, 0.5) : offsetPts(r, r.segs, (br(i) - bl(i)) / 2));
      layer(ink.ballastLow, (draw) => dx.routes.forEach((r, i) => { if (balOf[i] !== 'none') draw(mid(r, i), wide(r, i)); }));
      layer(ink.ballast, (draw) => dx.routes.forEach((r, i) => { if (balOf[i] === 'buddy') draw(mid(r, i), (2 * gOf(r) + 3 + bl(i) + br(i)) * this.scale); }));
      // (the selected tracks' ballast picked out with them, as their band)
      layer('rgba(43,111,224,0.16)', (draw) => dx.routes.forEach((r, i) => { if (balOf[i] !== 'none' && (sx.of[i] === this.selected || this.extra.has(sx.of[i]))) draw(mid(r, i), wide(r, i)); }));
    }
    // the sleeper bands, each colour as one layer (red where a drag can't bend the track)
    {
      // (the track under the pointer, in Select: a hint of the selected blue, so what a click would pick is seen)
      const HOVER = 'rgba(43,111,224,0.09)';
      const bandOf = (i: number) => (i === this.selected || this.extra.has(i) ? 'rgba(43,111,224,0.18)' : i === this.hoverRoute ? HOVER : ink.band);
      const badOf = (i: number) => {
        const dragging = this.drag?.moved && this.drag.route === i && this.dragBad;
        return (k: number) => !!dragging && (this.dragBadFrom >= 0 ? k >= this.dragBadFrom : k < this.dragBadTo);
      };
      for (const color of [ink.band, HOVER, 'rgba(43,111,224,0.18)', 'rgba(224,69,43,0.22)']) layer(color, (draw) => d.routes.forEach((r, i) => {
        if (isMono(r)) return; // (the monorail's beam: drawn below)
        let q: Pose = r; const bad = badOf(i);
        r.segs.forEach((sg, k) => {
          if ((bad(k) ? 'rgba(224,69,43,0.22)' : bandOf(i)) === color) draw(trace(q, [sg], 0.5), (2 * gOf(r) + 3) * this.scale);
          q = follow(q, [sg]);
        });
      }));
    }
    // (track only with sleepers: each sleeper across the band, where the build lays them (crossing.ts sleeperSpots;
    // where tracks meet the build keeps the bed, drawn as the band))
    {
      // (each track's own, expert: the design's unless it has its own; a stretch's, on its piece)
      const ops = all;
      if (ops.some((op) => op.sleepers === 'sleepers' && op.ballast === 'none')) {
        const rts = toRoutes(dx), ix = (nm: string) => dx.routes.findIndex((r, k) => (r.name || String(k)) === nm);
        // (expert: the sleepers shared across tracks: whose they are, along it from a to b (mm), and the tracks they're carried under)
        const shared = (dx.expert?.shared ?? []).map((sh) => ({ host: ix(sh.routes[0]), a: sh.from * MM, b: sh.to * MM, mates: sh.routes.slice(1).map(ix).filter((k) => k >= 0) })).filter((sh) => sh.host >= 0 && sh.mates.length);
        rts.forEach((rt, i) => {
          const op = ops[i], gapS = op.sleeperGapStuds ?? 2, sw = op.sleeperWidthStuds ?? 2;
          if (isMono(dx.routes[i]) || !rt.segments.length || op.sleepers !== 'sleepers' || op.ballast !== 'none') return;
          const half = gOf(dx.routes[i]) + 1.5, rD = dx.routes[i], name = rD.name || String(i);
          const hosts = shared.filter((sh) => sh.host === i), under = shared.filter((sh) => sh.mates.includes(i));
          if (!rD.sleeperEdits?.length && !hosts.length && !under.length) {
            for (const sAt of sleeperSpots(routeLength(rt), false, false, gapS, sw, rt.segments.every((sg) => sg.kind === 'arc'))) {
              const p = routePose(rt, sAt), h = (p[2] * Math.PI) / 180, rx = Math.cos(h), ry = Math.sin(h), x = p[0] / MM, y = p[1] / MM;
              line([[x - rx * half, y - ry * half], [x + rx * half, y + ry * half]], 'rgba(140,128,110,0.42)', sw * this.scale);
            }
            return;
          }
          // (expert: with its sleepers edited by hand as they'll be laid, the edited ones orange, one taken out a dashed
          // line where it was; the ones it shares with the track beside carried across, orange; none of its own where
          // it lies under another's)
          void name;
          const ORANGE = 'rgba(232,137,43,0.78)', sp = (gapS + sw) * MM;
          for (const q of planSleepers(rD, { gap: gapS, w: sw, curved: rt.segments.every((sg) => sg.kind === 'arc') }).laid) {
            const p = routePose(rt, q.at * MM), pt: [number, number] = [p[0], p[1]];
            if (under.some((sh) => { const hr = rts[sh.host], s = routeSOf(hr, pt), hp = routePose(hr, s); return s >= sh.a - sp / 2 && s <= sh.b + sp / 2 && Math.abs(worldToPose(hp, pt)[1]) < sp; })) continue;
            let lo = -half - (q.e?.left ?? 0), hi = half + (q.e?.right ?? 0), mine = !!q.e;
            for (const sh of hosts) {
              if (q.at * MM < sh.a - 1e-6 || q.at * MM > sh.b + 1e-6) continue;
              for (const m of sh.mates) { const mr = rts[m], sk = routeSOf(mr, pt); if (sk <= 0.01 || sk >= routeLength(mr) - 0.01) continue; const p2 = routePose(mr, sk), off = worldToPose(p, [p2[0], p2[1]])[0] / MM, h2 = gOf(dx.routes[m]) + 1.5; lo = Math.min(lo, off - h2); hi = Math.max(hi, off + h2); mine = true; }
            }
            const g = this.cutGrid(), hd = q.e?.turn === 'square' ? g[2] + Math.round((p[2] - g[2]) / 90) * 90 : p[2], h = (hd * Math.PI) / 180, rx = Math.cos(h), ry = Math.sin(h), x = p[0] / MM, y = p[1] / MM;
            line([[x + rx * lo, y + ry * lo], [x + rx * hi, y + ry * hi]], mine ? ORANGE : 'rgba(140,128,110,0.42)', sw * this.scale);
          }
          for (const e of rD.sleeperEdits ?? []) {
            if (!e.off) continue;
            const p = routePose(rt, e.at * MM), h = (p[2] * Math.PI) / 180, rx = Math.cos(h), ry = Math.sin(h), x = p[0] / MM, y = p[1] / MM;
            line([[x - rx * half, y - ry * half], [x + rx * half, y + ry * half]], ORANGE, 1.5, [4, 3]);
          }
        });
      }
    }
    // (a selected track's stretches with their own: an orange line down each; every track's while only stretches are picked)
    const allStretches = this.expert && this.pick === 'stretch' && this.mode === 'select';
    dx.routes.forEach((r, i) => {
      if (!sx.stretch[i] || !(allStretches || sx.of[i] === this.selected || this.extra.has(sx.of[i]))) return;
      const pts = trace(r, r.segs, 0.5);
      if (pts.length > 1) line(pts, 'rgba(232,137,43,0.85)', 2);
    });
    // (expert, stage 5b: each track's rails edited by hand, in orange: a gap a bar across its rail, guard rails along
    // their stretches, check rails added by hand; drawn whether the tools are shown or not, as hand cuts are)
    d.routes.forEach((rr) => {
      const re = rr.railEdits;
      if (!re || isMono(rr) || !rr.segs.length) return;
      const L = segsStuds(rr.segs), g0 = gOf(rr), OR = '#e8892b';
      const along = (from: number, to: number, o: number) => { const a = Math.min(Math.max(0, from), L), b = Math.min(Math.max(a, to), L); if (b - a < 0.05) return; line(offsetPts(placeAlong(rr, a), cutSegs(cutSegs(rr.segs, a)[1], b - a)[0], o), OR, 2.5); };
      for (const gd of re.guards ?? []) if (!rr.guardRails && !rr.dualGauge) { const o = g0 - 2.5 / MM - (gd.gap ?? 0.8); for (const sd of gd.side === 'left' ? [-1] : gd.side === 'right' ? [1] : [-1, 1]) along(gd.from, gd.to, sd * o); }
      for (const ck of re.checks ?? []) { const o = g0 - (1.25 + 3 + 0.5) / MM; along(ck.from, ck.to, (ck.side === 'left' ? -1 : 1) * o); }
      for (const gp of re.gaps ?? []) {
        const q = placeAlong(rr, Math.min(L, gp.at)), h = (q.heading * Math.PI) / 180, rx = Math.cos(h), ry = Math.sin(h), fx = -Math.sin(h), fy = Math.cos(h);
        for (const sd of gp.side === 'left' ? [-1] : gp.side === 'right' ? [1] : [-1, 1]) {
          const cx = q.x + rx * sd * g0, cy = q.y + ry * sd * g0;
          line([[cx - rx * 0.6, cy - ry * 0.6], [cx + rx * 0.6, cy + ry * 0.6]], OR, 3);
          line([[cx - fx * 0.12, cy - fy * 0.12], [cx + fx * 0.12, cy + fy * 0.12]], '#fff', 2);
        }
      }
    });
    // (the selected stretch: its band picked out, a bar and a grip at each end to drag; the one being dragged out, Add a stretch, likewise)
    {
      const si = this.selItemNow, sn = this.stretchNew, ri = si?.kind === 'stretch' ? si.route : sn?.route, rr = ri === undefined ? undefined : d.routes[ri];
      const put = sn && rr ? newStretchAt(rr, sn.s0, sn.s1) : undefined, st = si?.kind === 'stretch' ? rr?.stretches?.[si.k] : put && !('problem' in put) ? put : undefined;
      if (rr && st && !isMono(rr)) {
        const L = segsStuds(rr.segs), from = Math.min(st.from, L), to = Math.min(st.to, L), p0 = placeAlong(rr, from), mid = cutSegs(cutSegs(rr.segs, from)[1], to - from)[0];
        line(traceRaw(p0, mid, 0.5), 'rgba(232,137,43,0.30)', (2 * gOf(rr) + 3) * this.scale);
        const half = gOf(rr) + 1.5, why = this.stretchDrag?.why ?? (put && 'why' in put ? put.why : undefined);
        const ends: [number, number][] = [];
        for (const q of [p0, placeAlong(rr, to)]) {
          const h = (q.heading * Math.PI) / 180, rx = Math.cos(h), ry = Math.sin(h);
          line([[q.x - rx * half, q.y - ry * half], [q.x + rx * half, q.y + ry * half]], '#e8892b', 2.5);
          const [hx, hy] = this.toScreen(q.x, q.y); ends.push([hx, hy]);
          c.fillStyle = '#fff'; c.strokeStyle = '#e8892b'; c.lineWidth = 2; c.beginPath(); c.rect(hx - 4.5 * z, hy - 4.5 * z, 9 * z, 9 * z); c.fill(); c.stroke();
        }
        // (where its ends are on the screen, for the browser smoke test to grab)
        this.el.dataset.stretch = JSON.stringify({ from: st.from, to: st.to, ends: ends.map(([x, y]) => [Math.round(x), Math.round(y)]) });
        if (this.stretchDrag || sn) { const e = this.stretchDrag?.part === 'from' ? ends[0] : ends[1]; tag(e[0], e[1] + 30, why ?? `${st.from} to ${st.to} studs from its start`, why ? '#e0452b' : '#b23c0a'); }
      } else {
        delete this.el.dataset.stretch;
        if (sn && put && 'problem' in put && this.mouse) { const [mx, my] = this.toScreen(this.mouse[0], this.mouse[1]); tag(mx, my + 30, put.problem, '#e0452b'); }
      }
    }
    // monorail: the 4-stud beam (its narrower ends where pieces join aren't shown) with the rack's ridge down its middle
    const monoHw = MONO_HW / MM, ridgeHw = MONO_RIDGE_HW / MM;
    const drawMono = (p: Pose, segs: DSeg[], sel: boolean, bad = false) => {
      const beam = bad ? 'rgba(224,69,43,0.30)' : sel ? 'rgba(43,111,224,0.28)' : ink.mono, edge = bad ? '#e0452b' : sel ? ink.sel : ink.monoEdge;
      line(trace(p, segs, 0.5), beam, 2 * monoHw * this.scale);
      for (const o of [-monoHw, monoHw]) line(offsetPts(p, segs, o), edge, Math.max(1, railW * 0.6));
      line(trace(p, segs, 0.5), edge, Math.max(1.5, 2 * ridgeHw * this.scale));
    };
    d.routes.forEach((r, i) => { if (isMono(r)) drawMono(r, r.segs, i === this.selected || this.extra.has(i), !!(this.drag?.moved && this.drag.route === i && this.dragBad)); });
    // labels: gathered, then drawn without overlapping (the selection's first)
    const labels: { x: number; y: number; txt: string; sel: boolean }[] = [];
    d.routes.forEach((r, i) => {
      const sel = i === this.selected || this.extra.has(i);
      const dragging = this.drag?.moved && this.drag.route === i && this.dragBad;
      const isBad = (k: number) => !!dragging && (this.dragBadFrom >= 0 ? k >= this.dragBadFrom : k < this.dragBadTo);
      // sleeper band, rails, centre line (the monorail's beam drawn above)
      if (!isMono(r)) {
        drawSegs(r, r.segs, isBad, '', sel ? ink.sel : ink.rail, gOf(r)); // (bands drawn above, as layers)
        // (dual gauge: the narrow gauge's own rails, thinner: the third rail, or two centred. Its whole length: where
        // they're left out (points, track alongside) the build says)
        for (const o of dualRailOffsets(d, r)) line(offsetPts(r, r.segs, o), sel ? ink.sel : ink.rail, Math.max(1, railW * 0.6));
        line(trace(r, r.segs, 0.5), ink.centre, 1, [4, 4]);
      }
      // what each curve is, at its middle (and straights' lengths when zoomed in)
      let q: Pose = { x: r.x, y: r.y, heading: r.heading };
      c.font = '11px system-ui, sans-serif'; c.textAlign = 'center';
      for (const sg of r.segs) {
        const show = sg.kind === 'curve' || this.scale > 10;
        if (show) {
          const mid = follow(q, [sg.kind === 'straight' ? { kind: 'straight', studs: sg.studs / 2 } : { ...sg, angle: sg.angle / 2 }]);
          const off = ((isMono(r) ? monoHw : gOf(r)) + 2.2) * (sg.kind === 'curve' ? -Math.sign(sg.angle) : 1);  // outside the curve
          const [sx, sy] = this.toScreen(mid.x + off * Math.cos((mid.heading * Math.PI) / 180), mid.y + off * Math.sin((mid.heading * Math.PI) / 180));
          const txt = sg.kind === 'curve' ? `R${Math.round(sg.radius * 10) / 10} ${Math.round(Math.abs(sg.angle) * 10) / 10}°${sg.bank ? `, bank ${sg.bank}°` : ''}` : `${Math.round(sg.studs * 10) / 10}`;
          labels.push({ x: sx, y: sy, txt, sel });
        }
        // (a banked curve: a fine dotted line along its high, outer side)
        if (sg.kind === 'curve' && sg.bank) line(offsetPts(q, [sg], (gOf(r) + 1) * Math.sign(sg.angle)), 'rgba(200,120,40,0.75)', 1.5, [2, 3]);
        q = follow(q, [sg]);
      }
      c.textAlign = 'start';
      // ends (a buffer stop: its beam across the track, a stud in from the end, and its posts)
      for (const p of [{ x: r.x, y: r.y }, follow(r, r.segs)]) {
        const [sx, sy] = this.toScreen(p.x, p.y);
        c.fillStyle = ink.rail; c.beginPath(); c.arc(sx, sy, 3, 0, 2 * Math.PI); c.fill();
      }
      for (const [which, p, k] of [['startEnd', { x: r.x, y: r.y, heading: r.heading }, 1], ['endEnd', follow(r, r.segs), -1]] as const) {
        if (r[which] !== 'buffer' || !r.segs.length || r.system === 'monorail') continue;
        const h = (p.heading * Math.PI) / 180, ax = -Math.sin(h) * k, ay = Math.cos(h) * k, rx = Math.cos(h), ry = Math.sin(h);
        const at = (al: number, lat: number): [number, number] => [p.x + ax * al + rx * lat, p.y + ay * al + ry * lat];
        line([at(1, -(gOf(r) + 1.5)), at(1, gOf(r) + 1.5)], ink.rail, Math.max(3, 0.8 * this.scale));
        for (const sd of [-1, 1]) line([at(0, sd * (gOf(r) + 0.5)), at(2, sd * (gOf(r) + 0.5))], ink.rail, Math.max(3, 2 * this.scale));
      }
    });
    // (expert, By hand only: a veil of the plan's own colour over every track with nothing by hand,
    // one layer, so where two such tracks lie over each other it's no thicker; what's by hand keeps its full ink)
    if (this.expert && this.dimPlain) {
      const paths = this.cutPaths(), rts = paths.length ? toRoutes(d) : [], by = handTracks(d, paths.map((p) => pathTracks(p.pts, rts)));
      const bg = v('--canvas-bg', '#fbfbf8').trim(), hex = /^#([0-9a-f]{6})$/i.exec(bg) ?? /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(bg);
      const rgb = hex ? (hex.length === 2 ? [0, 2, 4].map((k) => parseInt(hex[1].slice(k, k + 2), 16)) : [1, 2, 3].map((k) => parseInt(hex[k] + hex[k], 16))) : [251, 251, 248];
      layer(`rgba(${rgb.join(',')},0.72)`, (draw) => d.routes.forEach((r, i) => { if (by[i] || !r.segs.length) return; draw(trace(r, r.segs, 0.5), (2 * (isMono(r) ? monoHw : gOf(r)) + 5) * this.scale); }));
      // (which tracks are faint, for the browser smoke tests)
      this.el.dataset.dimmed = d.routes.map((_, i) => (by[i] ? '' : i)).filter((x) => x !== '').join();
    } else delete this.el.dataset.dimmed;
    {
      c.font = '11px system-ui, sans-serif'; c.textAlign = 'center';
      const taken: [number, number, number, number][] = [];
      for (const l of [...labels.filter((q) => q.sel), ...labels.filter((q) => !q.sel)]) {
        const w2 = c.measureText(l.txt).width / 2 + 3, box: [number, number, number, number] = [l.x - w2, l.y - 7, l.x + w2, l.y + 8];
        if (box[2] < 0 || box[0] > W || box[3] < 0 || box[1] > H) continue;
        if (taken.some((t) => t[0] < box[2] && t[2] > box[0] && t[1] < box[3] && t[3] > box[1])) continue; // (would overlap one already there)
        taken.push(box);
        c.fillStyle = ink.tagBg; c.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
        c.fillStyle = l.sel ? ink.selInk : ink.label; c.fillText(l.txt, l.x, l.y + 4);
      }
      c.textAlign = 'start';
    }
    // the selection box being dragged out
    if (this.box) {
      const [ax, ay] = this.toScreen(this.box.x0, this.box.y0), [bx, by] = this.toScreen(this.box.x1, this.box.y1);
      c.fillStyle = 'rgba(43,111,224,0.10)'; c.strokeStyle = 'rgba(43,111,224,0.8)'; c.lineWidth = 1; c.setLineDash([5, 4]);
      c.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      c.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)); c.setLineDash([]);
    }
    // the solver's results
    if (this.overlay) {
      const w = (mm: [number, number][]) => mm.map(([x, y]) => [x / MM, y / MM] as [number, number]);
      // (points thrown in the 3D view: the route each is set for, under the rest)
      for (const sr of this.setRoutes) { c.globalAlpha = 0.45; line(w(sr), '#2e9e5b', Math.max(4, 2.2 * this.scale)); c.globalAlpha = 1; }
      if (!this.hidden.has('grooves')) for (const gr of this.overlay.grooves) line(w(gr), '#e0452b', railW * 0.7);
      if (!this.hidden.has('checks')) for (const cr of this.overlay.checkRails) line(w(cr), ink.check, Math.max(1.5, (1 / MM) * this.scale));
      if (!this.hidden.has('crossings')) for (const p of this.overlay.crossings) { const [sx, sy] = this.toScreen(p[0] / MM, p[1] / MM); c.strokeStyle = ink.mark; c.lineWidth = 1.2; c.beginPath(); c.arc(sx, sy, 5 * z, 0, 2 * Math.PI); c.stroke(); }
      // the anti-stud tubes underneath that grip the plate (Grip: Edges)
      if (!this.hidden.has('grips') && this.scale >= 3) {
        c.strokeStyle = '#2b9e4a'; c.lineWidth = 1.5;
        const r = Math.max(2, (3.2 / MM) * this.scale);
        for (const p of this.overlay.grips ?? []) { const [sx, sy] = this.toScreen(p[0] / MM, p[1] / MM); c.beginPath(); c.arc(sx, sy, r, 0, 2 * Math.PI); c.stroke(); }
      }
      // what's wrong, ringed in red, with what it is by the ring (and in full by the mouse, near it)
      for (const is of this.overlay.issues ?? []) {
        // (a small ring on the spot itself, so it's plain where: only a thing ringed whole (a part too big) is as big as it is)
        const [sx, sy] = this.toScreen(is.at[0] / MM, is.at[1] / MM), r = Math.max(14, ((is.area ? is.r : Math.min(is.r, ISSUE_R)) / MM) * this.scale);
        c.strokeStyle = 'rgba(224,40,40,0.95)'; c.lineWidth = 3; c.setLineDash([6, 4]); c.beginPath(); c.arc(sx, sy, r, 0, 2 * Math.PI); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#e02828'; c.beginPath(); c.arc(sx + r * 0.7071, sy - r * 0.7071, 9, 0, 2 * Math.PI); c.fill();
        c.fillStyle = '#fff'; c.font = '700 13px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('!', sx + r * 0.7071, sy - r * 0.7071 + 4.5); c.textAlign = 'left';
        if (this.mouse) { const [mx, my] = this.toScreen(this.mouse[0], this.mouse[1]); if (Math.hypot(mx - sx, my - sy) < r + 10) tag(mx, my, is.text, '#c01d1d'); }
      }
      // the straight or curve picked out in a route card's Shape: along its centre line, as wide as the track
      if (this.highlightSeg) {
        const [ri, k] = this.highlightSeg, rt = toRoutes(d)[ri];
        if (rt && rt.segments[k]) {
          const lenOf = (sg: (typeof rt.segments)[number]) => (sg.kind === 'straight' ? sg.length : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180);
          const s0 = rt.segments.slice(0, k).reduce((t, sg) => t + lenOf(sg), 0), s1 = s0 + lenOf(rt.segments[k]), n = Math.max(2, Math.ceil((s1 - s0) / 4));
          const pts = Array.from({ length: n + 1 }, (_, j) => { const q = routePose(rt, s0 + ((s1 - s0) * j) / n); return [q[0] / MM, q[1] / MM] as [number, number]; });
          line(pts, 'rgba(240,180,0,0.55)', Math.max(4, (2 * g + 2) * this.scale));
        }
      }
      // the trackwork item picked out in the Trackwork panel
      // (and the one selected on the plan, ringed the same, in the accent's place)
      // (stage 5: with Points picked, each set's blades drawn thin, to be tapped; the selected blade orange, a round handle at its heel)
      if (this.expert && this.pick === 'mark' && this.mode === 'select') for (const it of this.overlay.items ?? []) for (const b0 of it.kind === 'points' ? it.blades ?? [] : []) line(w(b0), ink.mark, 1, [3, 3]);
      {
        const sb = this.selItemNow?.kind === 'tw' && this.selItemNow.blade !== undefined ? this.selItemNow : undefined, it = sb && this.overlay.items?.find((q) => q.kind === 'points' && q.key === sb.key), bl = sb && it?.blades?.[sb.blade!];
        if (bl) {
          const edit = getComputedStyle(this.el).getPropertyValue('--c-edit').trim() || '#e8892b';
          line(w(bl), edit, Math.max(4, railW * 2.5));
          const hd = this.heelDrag, end = bl[bl.length - 1], extra = hd ? ((this.host.design().trackwork?.points?.[sb.key]?.bladeHeel?.[sb.blade!] ?? 0) / MM - hd.was) : 0;
          const [hx, hy] = this.toScreen(end[0] / MM + (hd ? hd.dir[0] * extra : 0), end[1] / MM + (hd ? hd.dir[1] * extra : 0));
          c.beginPath(); c.arc(hx, hy, 7 * z, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = edit; c.lineWidth = 2.5; c.stroke();
          this.el.dataset.blade = JSON.stringify({ key: sb.key, blade: sb.blade, heel: [Math.round(hx), Math.round(hy)] });
        } else delete this.el.dataset.blade;
      }
      const selTw = this.selItemNow?.kind === 'tw' ? this.selItemNow : undefined;
      const hi = this.overlay.items?.find((it) => it.key === this.highlight) ?? (selTw && this.overlay.items?.find((it) => it.kind === selTw.tw && it.key === selTw.key));
      if (hi) {
        if (hi.pts.length > 1) line(w(hi.pts), 'rgba(240,180,0,0.9)', Math.max(4, railW * 2.5));
        const [hx, hy] = this.toScreen(hi.at[0] / MM, hi.at[1] / MM);
        c.strokeStyle = '#f0b400'; c.lineWidth = 2.5; c.beginPath(); c.arc(hx, hy, 12, 0, 2 * Math.PI); c.stroke();
      }
      // points: built (filled; forced ones ringed), taken out (hollow grey), and near misses where they could be forced (hollow yellow;
      // dashed where they're too far off to, red where they're forced anyway)
      if (!this.hidden.has('points')) {
        const done = new Set<string>();
        for (const it of this.overlay.items ?? []) {
          if (it.kind !== 'points' || done.has(it.key)) continue;
          done.add(it.key);
          const st = this.pointsState(it.key), [sx, sy] = this.toScreen(it.at[0] / MM, it.at[1] / MM);
          c.lineWidth = 2; c.setLineDash([]);
          if (st.state === 'built') { const q = 5 * z; c.fillStyle = '#f0b400'; c.fillRect(sx - q, sy - q, 2 * q, 2 * q); c.strokeStyle = ink.tagBg; c.lineWidth = 1; c.strokeRect(sx - q, sy - q, 2 * q, 2 * q); if (st.forced) { c.strokeStyle = ink.mark; c.lineWidth = 1.2; c.strokeRect(sx - q - 1.5, sy - q - 1.5, 2 * q + 3, 2 * q + 3); } continue; }
          if (st.state === 'off') c.strokeStyle = '#8a8f99';
          else { c.strokeStyle = st.forced && !st.ok ? '#e0452b' : '#f0b400'; if (!st.ok) c.setLineDash([3, 2]); }
          c.strokeRect(sx - 4.5 * z, sy - 4.5 * z, 9 * z, 9 * z); c.setLineDash([]);
        }
        // (hand-edited trackwork: a ring in the accent colour round each one changed, so the edits show on the plan)
        {
          const twk = this.host.design().trackwork ?? {}, acc = getComputedStyle(this.el).getPropertyValue('--accent').trim() || '#2563eb';
          for (const it of this.overlay.items ?? []) {
            const e = ((twk as Record<string, Record<string, Record<string, unknown>> | undefined>)[it.kind] ?? {})[it.key];
            if (!isEdit(e)) continue;
            const [sx, sy] = this.toScreen(it.at[0] / MM, it.at[1] / MM);
            c.strokeStyle = acc; c.lineWidth = 2; c.setLineDash([3, 2]); c.beginPath(); c.arc(sx, sy, 11 * z, 0, 2 * Math.PI); c.stroke(); c.setLineDash([]);
          }
        }
        // (monorail points: a yellow diamond, built as drawn: not changed by hand)
        for (const q of this.overlay.monoPoints ?? []) {
          const [sx, sy] = this.toScreen(q[0] / MM, q[1] / MM);
          c.fillStyle = '#f0b400'; c.beginPath(); c.moveTo(sx, sy - 7); c.lineTo(sx + 7, sy); c.lineTo(sx, sy + 7); c.lineTo(sx - 7, sy); c.closePath(); c.fill();
        }
      }
      // handles: check rail and flangeway cut ends, dragged longer or shorter (and the one being dragged)
      if (this.scale >= 4 || (this.pick === 'mark' && this.mode === 'select')) for (const it of this.overlay.items ?? []) {
        if ((it.kind !== 'check' && it.kind !== 'groove') || it.pts.length < 2 || this.hidden.has(it.kind === 'check' ? 'checks' : 'grooves')) continue;
        c.fillStyle = it.kind === 'check' ? ink.check : '#e0452b'; c.strokeStyle = ink.tagBg; c.lineWidth = 1;
        const q = 3.5 * z;
        for (const p of [it.pts[0], it.pts[it.pts.length - 1]]) { const [hx, hy] = this.toScreen(p[0] / MM, p[1] / MM); c.fillRect(hx - q, hy - q, 2 * q, 2 * q); c.strokeRect(hx - q, hy - q, 2 * q, 2 * q); }
      }
      if (this.itemDrag?.at) { const [hx, hy] = this.toScreen(this.itemDrag.at[0] / MM, this.itemDrag.at[1] / MM); c.strokeStyle = '#f0b400'; c.lineWidth = 2.5; c.beginPath(); c.arc(hx, hy, 7, 0, 2 * Math.PI); c.stroke(); }
      // the lever hovered, dragged or picked out in the Trackwork panel: the branch route whose points it throws, the one whose card sets its side
      const focus = this.hidden.has('levers') ? undefined : this.leverDrag?.it ?? (this.mouse && !this.active && !this.itemDrag && !this.drag ? this.leverAt(this.mouse) : undefined)
        ?? this.overlay.items?.find((it) => it.kind === 'throw' && it.key === this.highlight);
      if (focus) {
        const ls = leverSide(d, focus, this.overlay.items ?? []), r = d.routes.find((q, i) => (q.name || String(i)) === ls.branch);
        if (r) line(trace(r, r.segs, 0.5), 'rgba(232,137,43,0.55)', Math.max(3, 1.2 * this.scale));
      }
      // each points set's lever: its arm out to the knob (drag the knob to move it)
      for (const it of this.overlay.items ?? []) {
        if (it.kind !== 'throw' || this.hidden.has('levers')) continue;
        const live = this.leverDrag?.it.key === it.key && this.leverDrag.at, held = !live && this.leverPending?.key === it.key ? this.leverPending : undefined;
        const arm = live ? this.leverDrag!.arm! : held ? held.arm : it.pts, at = live ? this.leverDrag!.at! : held ? held.at : it.at;
        // the arm as it's built (on the studs), and the lever on it
        c.beginPath();
        w(arm).forEach(([x, y], k) => { const [sx, sy] = this.toScreen(x, y); if (k) c.lineTo(sx, sy); else c.moveTo(sx, sy); });
        c.closePath(); c.fillStyle = 'rgba(232,137,43,0.30)'; c.fill(); c.strokeStyle = '#e8892b'; c.lineWidth = 1.5; c.stroke();
        const [kx, ky] = this.toScreen(at[0] / MM, at[1] / MM), kr = Math.max(4, Math.min(9, (3 / MM) * this.scale));
        c.fillStyle = '#e8892b'; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(kx, ky, kr, 0, 2 * Math.PI); c.fill(); c.stroke();
      }
    }
    // joints (expert): a dot where two tracks are joined (they move together), an orange ring with a bar where they
    // touch but were taken apart, a small ring on an end that's joined to nothing; the selected joint ringed; and the
    // joints a drag has open now, ringed in red
    if (!this.hidden.has('joints')) {
      const js = this.joints(), id = (i: number) => d.routes[i]?.name || String(i);
      const inView = (x: number, y: number) => x > -10 && y > -10 && x < W + 10 && y < H + 10;
      // (where they are on the screen, for the browser smoke test)
      const where = JSON.stringify(js.map((j) => { const [x, y] = this.toScreen(j.at[0], j.at[1]); return { a: id(j.a), b: id(j.b), x: Math.round(x), y: Math.round(y), ...(j.apart && { apart: true }) }; }));
      if (this.el.dataset.joints !== where) this.el.dataset.joints = where;
      if (this.scale >= 2.5) {
        // (all the rings as one path, all the dots as another: a plan can have hundreds)
        const spots = (pts: [number, number][], r: number) => { c.beginPath(); for (const p of pts) { const [x, y] = this.toScreen(p[0], p[1]); if (inView(x, y)) { c.moveTo(x + r, y); c.arc(x, y, r, 0, 2 * Math.PI); } } };
        c.lineWidth = 1.25;
        spots(this.openEnds, 3.5 * z); c.fillStyle = ink.tagBg; c.fill(); c.strokeStyle = ink.label; c.stroke();
        spots(js.filter((j) => !j.apart).map((j) => j.at), 4 * z); c.fillStyle = ink.rail; c.fill(); c.strokeStyle = ink.tagBg; c.stroke();
        for (const j of js) {
          if (!j.apart) continue;
          const [x, y] = this.toScreen(j.at[0], j.at[1]);
          c.beginPath(); c.arc(x, y, 5.5 * z, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#e8892b'; c.lineWidth = 2; c.moveTo(x - 4 * z, y + 4 * z); c.lineTo(x + 4 * z, y - 4 * z); c.stroke();
        }
      }
      if (this.highlightAt) { const [x, y] = this.toScreen(this.highlightAt[0], this.highlightAt[1]); c.strokeStyle = '#f0b400'; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 12, 0, 2 * Math.PI); c.stroke(); }
      const sj = this.jointSelected();
      for (const j of sj?.joints ?? []) { const [x, y] = this.toScreen(j.at[0], j.at[1]); c.beginPath(); c.arc(x, y, 10, 0, 2 * Math.PI); c.strokeStyle = ink.sel; c.lineWidth = 2.5; c.stroke(); }
      // (opened by the drag going on: where the end is now, and where on the other track it was)
      const m = this.moving, open = m?.moved && m.alone ? m.watch.filter((j) => !holds(d, j)) : (this.drag?.moved ? this.drag : this.handleDrag?.moved ? this.handleDrag : undefined)?.carry?.open ?? [];
      { const names = open.map((j) => `${id(j.a)}-${id(j.b)}`).join(' '); if (this.el.dataset.opened !== names) this.el.dataset.opened = names; }
      c.strokeStyle = '#e0452b'; c.lineWidth = 2;
      for (const j of open) {
        const ra = d.routes[j.a], rb = d.routes[j.b];
        if (!ra || !rb) continue;
        const pa = j.aEnd === 'start' ? (ra as Pose) : follow(ra, ra.segs), pb = poseAt(rb, j.s);
        for (const q of [pa, pb]) { const [x, y] = this.toScreen(q.x, q.y); c.beginPath(); c.arc(x, y, 7, 0, 2 * Math.PI); c.stroke(); }
      }
    }
    // the selected route's handles: a curve's angle (round), its radius (diamond), a straight's length (square); the one dragged says its value
    if (this.mode === 'select' && !this.active) {
      const hovered = this.mouse && !this.handleDrag ? this.handleAt(this.mouse) : undefined, rt = d.routes[this.selection()[0]];
      // (where they are on the screen, for the browser smoke test to grab)
      const shown = this.handles();
      this.el.dataset.handles = JSON.stringify(shown.map((h) => { const [x, y] = this.toScreen(h.at[0], h.at[1]); return { seg: h.seg, kind: h.kind, x: Math.round(x), y: Math.round(y) }; }));
      for (const h of shown) {
        const [hx, hy] = this.toScreen(h.at[0], h.at[1]), kb = this.kbHandle?.seg === h.seg && this.kbHandle.kind === h.kind, on = this.handleDrag ? this.handleDrag.seg === h.seg && this.handleDrag.kind === h.kind : hovered === h || kb;
        if (kb) { c.save(); c.strokeStyle = '#1d4fae'; c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.arc(hx, hy, 13 * z, 0, 2 * Math.PI); c.stroke(); c.restore(); }
        c.beginPath();
        if (h.kind === 'angle') c.arc(hx, hy, (on ? 7 : 5.5) * z, 0, 2 * Math.PI);
        else if (h.kind === 'length') { const q = (on ? 6.5 : 5) * z; c.rect(hx - q, hy - q, 2 * q, 2 * q); }
        else { const q = (on ? 7.5 : 6) * z; c.moveTo(hx, hy - q); c.lineTo(hx + q, hy); c.lineTo(hx, hy + q); c.lineTo(hx - q, hy); c.closePath(); }
        c.fillStyle = on ? '#e8892b' : '#fff'; c.fill(); c.strokeStyle = '#e8892b'; c.lineWidth = 2; c.stroke();
        if (on && rt?.segs[h.seg]) tag(hx + 12, hy - 12, handleLabel(rt.segs[h.seg]), '#b25c00');
      }
      if (this.handleDrag?.moved) showGuides(); // (dragged: the guide its end is on, if any)
    }
    // a template being placed: the group where it would go, its joined end marked
    if (this.placing) {
      const pl = this.placedNow()!, tt = transformed(this.placing.tpl, pl.placement);
      for (const tb of tt.tables ?? []) { const pts = tableOutline(tb); if (pts.length < 3) continue; c.beginPath(); pts.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x, y); if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); }); c.closePath(); c.globalAlpha = 0.3; c.fillStyle = '#4fb3e8'; c.fill(); c.globalAlpha = 1; c.strokeStyle = '#2b6fe0'; c.lineWidth = 1.5; c.stroke(); }
      // (snapped: the group green, a green ring on the end it joins, an amber dot where its own end was: the layout designer's marks)
      const on = !!pl.snapped;
      for (const r of tt.routes) { const pts = traceRaw(r, r.segs, 0.5); line(pts, on ? 'rgba(80,255,120,0.353)' : 'rgba(43,111,224,0.28)', (2 * (r.system === 'monorail' ? 1 : (d.gaugeStuds + 1) / 2) + 3) * this.scale); line(pts, on ? 'rgb(22,163,74)' : '#2b6fe0', 1.5, [6, 4]); }
      if (pl.snapped) {
        const [mx, my] = this.toScreen(pl.snapped.movingAt[0], pl.snapped.movingAt[1]);
        c.beginPath(); c.arc(mx, my, 4, 0, 2 * Math.PI); c.fillStyle = 'rgb(245,158,11)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5; c.stroke();
        const [sx, sy] = this.toScreen(pl.snapped.design.pose.x, pl.snapped.design.pose.y);
        c.beginPath(); c.arc(sx, sy, 11.5, 0, 2 * Math.PI); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5; c.stroke();
        c.beginPath(); c.arc(sx, sy, 9, 0, 2 * Math.PI); c.fillStyle = 'rgba(34,197,94,0.2)'; c.fill(); c.strokeStyle = 'rgb(22,163,74)'; c.lineWidth = 2.5; c.stroke();
        tag(sx, sy + 30, `joins ${pl.snapped.design.route}`, '#1d7a38');
      }
      this.el.dataset.placing = pl.snapped ? `snapped ${pl.snapped.design.route}` : 'free';
    } else delete this.el.dataset.placing;
    // a small padlock on each locked route, in the middle of it
    for (const r of d.routes) {
      if (!r.locked) continue;
      const pts = trace(r, r.segs, 1), m = pts[Math.floor(pts.length / 2)];
      if (!m) continue;
      const [lx, ly] = this.toScreen(m[0], m[1]);
      c.save(); c.translate(lx, ly); c.fillStyle = ink.tagBg; c.strokeStyle = ink.mark; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, -3, 4, Math.PI, 0); c.stroke();
      c.beginPath(); c.rect(-5.5, -3, 11, 8); c.fill(); c.stroke();
      c.restore();
    }
    // Measure: the two points, the line between and what it says
    if (this.mode === 'measure') {
      const cur = this.mouse ? this.measureAt(this.mouse) : undefined, a = this.meas.a, b = this.meas.b ?? (a ? cur : undefined);
      const dot = (m: MeasurePoint) => { const [sx, sy] = this.toScreen(m.p[0], m.p[1]); c.fillStyle = m.on ? (m.on.at === 'end' ? '#2b9e4a' : '#f0b400') : '#0a7d5a'; c.beginPath(); c.arc(sx, sy, 5, 0, 2 * Math.PI); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); };
      let text = '';
      if (a && b) {
        const [ax, ay] = this.toScreen(a.p[0], a.p[1]), [bx, by] = this.toScreen(b.p[0], b.p[1]);
        c.save(); c.strokeStyle = '#0a7d5a'; c.lineWidth = 2; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.restore();
        text = measureBetween(a, b).text;
        tag((ax + bx) / 2, (ay + by) / 2, text, '#0a6a4c');
        dot(a); dot(b);
      } else if (cur) {
        dot(cur);
        if (cur.on) tag(...this.toScreen(cur.p[0], cur.p[1]), cur.on.at === 'end' ? `end of ${cur.on.name}` : `along ${cur.on.name}`, '#0a6a4c');
        else showGuides();
      }
      this.el.dataset.measure = text;
    } else delete this.el.dataset.measure;
    // (Cut into print parts: No: the hand cuts and cut paths aren't made. Each is drawn grey, and the first says why)
    const uncut = (d.options?.cutParts ?? 'yes') === 'no';
    let uncutAt: [number, number] | undefined;
    // Hand cuts (expert): a line across each track where it's cut into parts by hand
    for (const rr of d.routes) {
      if (!rr.cuts?.length) continue;
      const half = ((rr.gaugeStuds ?? d.gaugeStuds) + 4) / 2 * this.scale;
      c.strokeStyle = uncut ? UNCUT_GREY : ink.cut; c.lineWidth = 2.5; c.setLineDash(rr.cutsLocked ? [] : [5, 3]);
      for (const at of liveCuts(rr)) {
        const [first] = cutSegs(rr.segs, at), q = follow(rr, first), [qx, qy] = this.toScreen(q.x, q.y), ang = (q.heading * Math.PI) / 180;
        const nx = Math.cos(ang) * half, ny = -Math.sin(ang) * half;
        c.beginPath(); c.moveTo(qx - nx, qy - ny); c.lineTo(qx + nx, qy + ny); c.stroke();
        uncutAt ??= [qx, qy];
      }
      c.setLineDash([]);
    }
    // Cut paths (expert): each a line along the stud grid's lines; red where it isn't made (the last build's word, or
    // what's against it now); the selected one thicker, its corners to drag
    {
      const sc = this.selItemNow, line = (pts: CutPt[], color: string, wd: number, dash: number[] = []) => {
        c.strokeStyle = color; c.lineWidth = wd; c.setLineDash(dash); c.lineJoin = 'round'; c.beginPath();
        pts.forEach((q, k) => { const [x, y] = this.toScreen(q[0], q[1]); if (k) c.lineTo(x, y); else c.moveTo(x, y); });
        c.stroke(); c.setLineDash([]);
      };
      // (what no cut goes through, from the last build: where blades move, and the frogs. Shown while a path is drawn,
      // and while one is selected or dragged: where it may be put is seen before it's let go)
      const keepOuts = () => {
        const no = this.overlay?.cutting?.no;
        if (!no) return;
        c.strokeStyle = 'rgba(224, 69, 43, 0.28)'; c.lineCap = 'round';
        for (const bl of no.blades) { c.lineWidth = Math.max(2, (2 * bl.half / MM) * this.scale); c.beginPath(); bl.line.forEach((q, k) => { const [x, y] = this.toScreen(q[0] / MM, q[1] / MM); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); }
        c.lineCap = 'butt'; c.fillStyle = 'rgba(224, 69, 43, 0.28)';
        for (const f of no.frogs) { const [x, y] = this.toScreen(f[0] / MM, f[1] / MM); c.beginPath(); c.arc(x, y, 2 * this.scale, 0, 2 * Math.PI); c.fill(); }
      };
      const keepShown = !!this.pathDraw || sc?.kind === 'cutpath';
      if (keepShown) keepOuts();
      if (keepShown && this.overlay?.cutting?.no) this.el.dataset.keepouts = String(this.overlay.cutting.no.blades.length + this.overlay.cutting.no.frogs.length); else delete this.el.dataset.keepouts;
      for (const p of this.cutPaths()) {
        const also = this.selAlso.some((q) => q.kind === 'cutpath' && q.id === p.id), sel = (sc?.kind === 'cutpath' && sc.id === p.id) || also, dragged = this.cutDrag && this.cutDrag.kind !== 'cut' && this.cutDrag.id === p.id;
        const bad = dragged ? !!this.cutDrag!.why : !!this.overlay?.pathsNot?.some((n) => n.id === p.id);
        line(p.pts, uncut ? UNCUT_GREY : bad ? '#e0452b' : ink.cut, sel ? 4 : 2.5);
        if (uncut && p.pts.length) uncutAt ??= this.toScreen(p.pts[0][0], p.pts[0][1]) as [number, number];
        if (sel && !this.selAlso.length) for (const q of p.pts) { const [x, y] = this.toScreen(q[0], q[1]), k = 4 * z; c.fillStyle = '#fff'; c.strokeStyle = bad ? '#e0452b' : ink.cut; c.lineWidth = 2; c.beginPath(); c.rect(x - k, y - k, 2 * k, 2 * k); c.fill(); c.stroke(); }
        if (dragged && this.cutDrag!.why && this.mouse) { const [mx, my] = this.toScreen(this.mouse[0], this.mouse[1]); tag(mx, my + 30, this.cutDrag!.why, '#e0452b'); }
      }
      if (uncut && uncutAt) { tag(uncutAt[0], uncutAt[1] + 40, UNCUT_NOTE, UNCUT_GREY); this.el.dataset.uncut = '1'; } else delete this.el.dataset.uncut;
      // (the cuts worked out where tracks join inside trackwork: a line as a cut path's, not to be dragged (none is drawn
      // by hand: the tracks' joints place them); one the build left out, as it parts nothing, thin and dashed)
      {
        const jc = this.overlay?.jointCuts ?? [];
        for (const q of jc) line(q.pts.map((v): CutPt => [v[0] / MM, v[1] / MM]), ink.cut, q.made ? 2.5 : 1.5, q.made ? [] : [3, 4]);
        // (where they are on the screen, for the browser smoke tests)
        const where = jc.length ? JSON.stringify(jc.map((q) => { const m = q.pts[Math.floor((q.pts.length - 1) / 2)], n = q.pts[Math.floor((q.pts.length - 1) / 2) + 1] ?? m, [x, y] = this.toScreen((m[0] + n[0]) / 2 / MM, (m[1] + n[1]) / 2 / MM); return { x: Math.round(x), y: Math.round(y), made: q.made }; })) : '';
        if (where) { if (this.el.dataset.jointcuts !== where) this.el.dataset.jointcuts = where; } else delete this.el.dataset.jointcuts;
      }
      // (where tracks run over each other on purpose, accepted: a small orange ring with a tick, not the red warning's)
      for (const o of this.overlay?.over ?? []) {
        if (!o.ok) continue;
        const [x, y] = this.toScreen(o.at[0] / MM, o.at[1] / MM);
        c.strokeStyle = '#e8892b'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 8, 0, 2 * Math.PI); c.stroke();
        c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x - 1, y + 3); c.lineTo(x + 4, y - 3); c.stroke();
      }
      // (the selected sleeper: ringed where it lies now; why it can't go further, while it's dragged)
      if (sc?.kind === 'sleeper') {
        const rr = d.routes[sc.route], e = sleeperEditOf(rr, sc);
        if (rr) {
          const q = placeAlong(rr, Math.max(0, sc.at + (e.off ? 0 : e.move ?? 0))), [qx, qy] = this.toScreen(q.x, q.y);
          c.strokeStyle = '#d9480f'; c.lineWidth = 2; c.beginPath(); c.arc(qx, qy, 9, 0, 2 * Math.PI); c.stroke();
          this.el.dataset.sleeper = JSON.stringify({ at: sc.at, move: e.move ?? 0, x: Math.round(qx), y: Math.round(qy) });
          if (this.sleeperDrag?.why) tag(qx, qy + 30, this.sleeperDrag.why, '#e0452b');
          else if (this.sleeperDrag?.moved) tag(qx, qy + 30, `${+(sc.at + (e.move ?? 0)).toFixed(2)} studs from its start`, '#b23c0a');
        }
      } else delete this.el.dataset.sleeper;
      // (the selected rail edit: a gap ringed on its rail (both rails: on the centre line), a stretch of rail ringed at its
      // two ends with a line between along the centre; where it is on the screen, for the browser smoke tests)
      if (sc?.kind === 'rail') {
        const rr = d.routes[sc.route], e = railEditAt(rr?.railEdits, sc.what, sc.k);
        if (rr && e) {
          const L = segsStuds(rr.segs), ring = (at: number, lat: number) => { const q = placeAlong(rr, Math.min(L, Math.max(0, at))), h = (q.heading * Math.PI) / 180, [qx, qy] = this.toScreen(q.x + lat * Math.cos(h), q.y + lat * Math.sin(h)); c.strokeStyle = '#d9480f'; c.lineWidth = 2; c.beginPath(); c.arc(qx, qy, 9, 0, 2 * Math.PI); c.stroke(); return [qx, qy] as const; };
          const lat = e.side === 'left' ? -gOf(rr) : e.side === 'right' ? gOf(rr) : 0;
          let at: readonly [number, number];
          if ('at' in e) at = ring(e.at, lat);
          else { const a = Math.min(L, e.from), b = Math.min(L, e.to); ring(a, 0); ring(b, 0); if (b - a > 0.05) line(trace(placeAlong(rr, a), cutSegs(cutSegs(rr.segs, a)[1], b - a)[0], 0.5), 'rgba(217,72,15,0.55)', 3); const m = placeAlong(rr, (a + b) / 2); at = this.toScreen(m.x, m.y); }
          this.el.dataset.rail = JSON.stringify({ what: sc.what, k: sc.k, x: Math.round(at[0]), y: Math.round(at[1]) });
          if (this.railDrag?.why) tag(at[0], at[1] + 30, this.railDrag.why, '#e0452b');
          else if (this.railDrag?.moved) tag(at[0], at[1] + 30, 'at' in e ? `${+e.at.toFixed(2)} studs from its start` : `${e.from} to ${e.to} studs`, '#b23c0a');
        }
      } else delete this.el.dataset.rail;
      // (stage 3: running rails one at a time: a stretch taken out drawn as a break in the rail, a dashed line along it;
      // the selected piece orange with a round handle at each end; where its ends are on the screen, for the smoke tests)
      {
        const railAt = (rr: DRoute, side: RailSide, a: number, b: number): [number, number][] => {
          const off = (side === 'left' ? -1 : 1) * gOf(rr), n = Math.max(1, Math.ceil((b - a) / 0.5));
          return Array.from({ length: n + 1 }, (_, k) => { const q = placeAlong(rr, a + ((b - a) * k) / n), h = (q.heading * Math.PI) / 180; return [q.x + off * Math.cos(h), q.y + off * Math.sin(h)] as [number, number]; });
        };
        const edit = getComputedStyle(this.el).getPropertyValue('--c-edit').trim() || '#e8892b';
        for (const rr of d.routes) for (const o of rr.railEdits?.out ?? []) {
          const pts = railAt(rr, o.side, o.from, Math.min(o.to, segsStuds(rr.segs)));
          line(pts, ink.tagBg, railW + 3); line(pts, edit, Math.max(1.5, railW * 0.5), [4, 3]);
        }
        if (sc?.kind === 'run') {
          const rr = d.routes[sc.route], L = rr ? segsStuds(rr.segs) : 0;
          const p = rr && (sc.out ? (rr.railEdits?.out ?? []).filter((q) => q.side === sc.side)[sc.k] : railPieces(L, rr.railEdits, sc.side)[sc.k]);
          if (rr && p) {
            const pts = railAt(rr, sc.side, p.from, Math.min(p.to, L));
            line(pts, edit, Math.max(4, railW * 2.5), sc.out ? [6, 4] : []);
            const ends = sc.out ? [] : [pts[0], pts[pts.length - 1]].map((q) => { const [x, y] = this.toScreen(q[0], q[1]); c.beginPath(); c.arc(x, y, 7 * z, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = edit; c.lineWidth = 2.5; c.stroke(); return [Math.round(x), Math.round(y)]; });
            this.el.dataset.run = JSON.stringify({ side: sc.side, k: sc.k, from: p.from, to: p.to, ends });
            if (this.railDrag?.run && this.railDrag.why && this.mouse) { const [mx, my] = this.toScreen(this.mouse[0], this.mouse[1]); tag(mx, my + 30, this.railDrag.why, '#e0452b'); }
            else if (this.railDrag?.run?.part && this.railDrag.moved && this.mouse) { const [mx, my] = this.toScreen(this.mouse[0], this.mouse[1]); tag(mx, my + 30, `${+p.from.toFixed(2)} to ${+p.to.toFixed(2)} studs`, '#b23c0a'); }
          } else delete this.el.dataset.run;
        } else delete this.el.dataset.run;
      }
      // (stage 4: the rails and sleepers laid by hand: a rail as the track's are drawn, a sleeper as a sleeper; the selected
      // one orange, a rail with a round handle at each end; where those are on the screen, for the smoke tests)
      {
        const edit = getComputedStyle(this.el).getPropertyValue('--c-edit').trim() || '#e8892b', sw = d.options?.sleeperWidthStuds ?? 2;
        for (const f of d.expert?.free ?? []) {
          const mine = sc?.kind === 'free' && sc.id === f.id;
          if (f.kind === 'sleeper') {
            const cs = sleeperCorners(f, sw).map((q) => this.toScreen(q[0], q[1]));
            c.beginPath(); cs.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
            c.fillStyle = mine ? 'rgba(232,137,43,0.55)' : 'rgba(150,128,96,0.55)'; c.fill(); c.strokeStyle = mine ? edit : ink.rail; c.lineWidth = mine ? 2.5 : 1; c.stroke();
          } else line([f.a, f.b], mine ? edit : ink.rail, mine ? Math.max(4, railW * 2.5) : Math.max(1.5, railW));
        }
        const sf = sc?.kind === 'free' ? d.expert?.free?.find((f) => f.id === sc.id) : undefined;
        if (sf?.kind === 'rail') {
          const ends = [sf.a, sf.b].map((q) => { const [x, y] = this.toScreen(q[0], q[1]); c.beginPath(); c.arc(x, y, 7 * z, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = edit; c.lineWidth = 2.5; c.stroke(); return [Math.round(x), Math.round(y)]; });
          this.el.dataset.free = JSON.stringify({ id: sf.id, ends });
        } else if (sf) { const [x, y] = this.toScreen(sf.at[0], sf.at[1]); this.el.dataset.free = JSON.stringify({ id: sf.id, ends: [[Math.round(x), Math.round(y)]] }); }
        else delete this.el.dataset.free;
        if (this.freeDrag?.why && this.mouse) { const [mx, my] = this.toScreen(this.mouse[0], this.mouse[1]); tag(mx, my + 30, this.freeDrag.why, '#e0452b'); }
      }
      // (several selected: each cut across a track ringed; how many, and where the first is on the screen, for the browser smoke tests)
      if (this.selAlso.length) {
        const pos: [number, number][] = [];
        for (const q of this.selItems()) {
          if (q.kind !== 'cut') continue;
          const rr = d.routes[q.route], at = rr?.cuts?.[q.k];
          if (!rr || at === undefined) continue;
          const pl = placeAlong(rr, at), [qx, qy] = this.toScreen(pl.x, pl.y);
          c.strokeStyle = '#d9480f'; c.lineWidth = 2; c.beginPath(); c.arc(qx, qy, 9, 0, 2 * Math.PI); c.stroke(); pos.push([Math.round(qx), Math.round(qy)]);
        }
        if (this.multiDrag?.why && this.mouse) { const [mx, my] = this.toScreen(this.mouse[0], this.mouse[1]); tag(mx, my + 30, this.multiDrag.why, '#e0452b'); }
        this.el.dataset.items = JSON.stringify({ n: this.selItems().length, cuts: pos });
      } else delete this.el.dataset.items;
      // (the selected cut across a track: ringed)
      if (sc?.kind === 'cut' && !this.selAlso.length) {
        const rr = d.routes[sc.route], at = rr?.cuts?.[sc.k];
        if (rr && at !== undefined) { const [first] = cutSegs(rr.segs, at), q = follow(rr, first), [qx, qy] = this.toScreen(q.x, q.y); c.strokeStyle = ink.cut; c.lineWidth = 2; c.beginPath(); c.arc(qx, qy, 9, 0, 2 * Math.PI); c.stroke(); if (this.cutDrag?.why && this.mouse) tag(qx, qy + 30, this.cutDrag.why, '#e0452b'); else if (this.cutDrag?.moved) tag(qx, qy + 30, `${at} studs from its start`, '#b23c0a'); }
      }
      // (the path being drawn: its corners so far, and on to the grid corner under the pointer, as it would be laid)
      if (this.pathDraw) {
        const g = this.cutGrid(), tip = this.mouse ? snapToGrid(g, this.mouse) : undefined, next = [...this.pathDraw, ...(tip ? [tip] : [])];
        const laid = next.length ? gridPath(g, next) : [], why = laid.length >= 2 ? this.pathWhy(next) : undefined;
        if (laid.length >= 2) line(laid, why ? '#e0452b' : ink.cut, 2.5, [6, 4]);
        for (const q of this.pathDraw) { const [x, y] = this.toScreen(q[0], q[1]); c.fillStyle = ink.cut; c.beginPath(); c.arc(x, y, 4, 0, 2 * Math.PI); c.fill(); }
        if (tip) { const [x, y] = this.toScreen(tip[0], tip[1]); c.strokeStyle = why ? '#e0452b' : ink.cut; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 5, 0, 2 * Math.PI); c.stroke(); if (why) tag(x, y + 30, why, '#e0452b'); }
      }
    }
    // Add a cut: where the selected route would be cut into parts (the whole stud nearest the pointer)
    if (this.cutArmed && this.mouse && !this.active && !this.drag && !this.moving) {
      const cut = this.cutFor(this.mouse), rr = cut && d.routes[cut.route];
      if (cut && rr) {
        const why = cutProblem(rr, cut.s), [first] = cutSegs(rr.segs, cut.s), q = follow(rr, first), [qx, qy] = this.toScreen(q.x, q.y);
        const ang = (q.heading * Math.PI) / 180, nx = Math.cos(ang) * 14, ny = -Math.sin(ang) * 14;
        c.strokeStyle = why ? '#e0452b' : ink.cut; c.lineWidth = 2.5; c.beginPath(); c.moveTo(qx - nx, qy - ny); c.lineTo(qx + nx, qy + ny); c.stroke();
        tag(qx, qy + 30, why ?? `cut into parts here: ${cut.s} studs from its start`, why ? '#e0452b' : '#b23c0a');
      }
    }
    // Split: where the selected route would be cut (the whole stud nearest the pointer), and the two lengths
    if (this.splitArmed && this.mouse && !this.active && !this.drag && !this.moving) {
      const cut = this.cutFor(this.mouse), rr = cut && d.routes[cut.route];
      if (cut && rr) {
        const why = splitProblem(rr, cut.s), [first] = cutSegs(rr.segs, cut.s), q = follow(rr, first), [qx, qy] = this.toScreen(q.x, q.y);
        const ang = (q.heading * Math.PI) / 180, nx = Math.cos(ang) * 12, ny = -Math.sin(ang) * 12;
        c.strokeStyle = why ? '#e0452b' : ink.cut; c.lineWidth = 2.5; c.beginPath(); c.moveTo(qx - nx, qy - ny); c.lineTo(qx + nx, qy + ny); c.stroke();
        tag(qx, qy + 30, why ?? `cut here: ${cut.s} + ${+(routeStuds(rr) - cut.s).toFixed(1)} studs`, why ? '#e0452b' : '#b23c0a');
      }
    }
    // while dragging an end: what the reshaped track is, or why not
    if (this.drag?.moved && this.mouse) {
      const r = d.routes[this.drag.route];
      const [mx, my] = this.toScreen(...(this.guideNow?.point ?? this.snap(this.mouse)));
      const txt = this.dragSnap && !this.dragBad ? `${describe(r.segs)}: joins ${d.routes[this.dragSnap.route].name}` : this.dragBad ? `Can't bend the track this way (red part: ${describe(this.dragBadFrom >= 0 ? r.segs.slice(this.dragBadFrom) : r.segs.slice(0, this.dragBadTo))}${this.host.radius() < 0 ? ', tighter than R24' : ''})` : this.joinBlocked ? `${describe(r.segs)}: ${this.joinBlocked}` : describe(r.segs);
      tag(mx, my, txt, this.dragBad ? '#e0452b' : ink.selInk);
      c.fillStyle = '#2b9e4a'; c.beginPath(); c.arc(mx, my, 5, 0, 2 * Math.PI); c.fill();
      showGuides();
      return;
    }
    // the mouse: snapped point, and the planned track while drawing
    if (this.mouse && this.mode === 'draw') {
      if (this.active) {
        const segs = this.planTo(this.mouse);
        const from = this.active.end ?? this.active.start!;
        const st = Number.isNaN(from.heading) ? { ...from, heading: this.freeHeading(from, this.mouse) } : from;
        if (segs) {
          // (as the track it'll be: carrying a route on, or branching off one, that route's; else Draw's Track choice)
          const src = this.active.route ?? this.active.from;
          if ((src !== undefined ? isMono(d.routes[src]) : this.host.system?.() === 'monorail')) drawMono(st, segs, true);
          else {
            line(trace(st, segs, 0.5), 'rgba(43,111,224,0.25)', (2 * g + 3) * this.scale);
            for (const o of [-g, g]) line(offsetPts(st, segs, o), '#2b6fe0', railW);
          }
          const [mx, my] = this.toScreen(...(this.guideNow?.point ?? this.snap(this.mouse)));
          const sn = this.joinableEnd(this.mouse);
          // (carrying a route on: how long it is with this laid)
          const total = this.active.route !== undefined && d.routes[this.active.route] ? ` · route ${+(segsStuds(d.routes[this.active.route].segs) + segsStuds(segs)).toFixed(1)} studs` : '';
          const txt = sn ? `${describe(segs)}: joins ${d.routes[sn.route].name}` : this.joinBlocked ? `${describe(segs)}: ${this.joinBlocked}` : describe(segs) + total;
          tag(mx, my, txt, ink.selInk);
        } else {
          // can't get there with the allowed curves: show the curve it would
          // need, in red, and why
          const bad = planAnyway(st, this.snap(this.mouse));
          drawSegs(st, bad, () => true, '', '');
          const [mx, my] = this.toScreen(...this.snap(this.mouse));
          const r = this.host.radius();
          const why = r > 0 ? `not reachable with R${r}` : r === 0 ? 'not reachable with LEGO radii and 22.5° ends' : 'tighter than R24, or behind';
          const txt = `${describe(bad)}: ${why}`;
          tag(mx, my, txt, '#e0452b');
        }
        const [sx, sy] = this.toScreen(from.x, from.y);
        c.strokeStyle = '#2b6fe0'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, 6, 0, 2 * Math.PI); c.stroke();
      }
      const hit = this.active ? undefined : this.nearTrack(this.mouse);
      const p = hit ? [hit.pose.x, hit.pose.y] : this.active ? (this.guideNow?.point ?? this.snap(this.mouse)) : this.guided(this.mouse);
      const [sx, sy] = this.toScreen(p[0], p[1]);
      c.fillStyle = hit ? (hit.end ? '#2b9e4a' : '#f0b400') : '#2b6fe0';
      c.beginPath(); c.arc(sx, sy, 4, 0, 2 * Math.PI); c.fill();
      if (!hit) showGuides();
    }
  }
}
