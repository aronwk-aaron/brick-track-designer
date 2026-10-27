// The track canvas: a top-down stud grid where track is laid like in
// top-down train games. Click a grid point (or the end of a track) to start,
// move the mouse to see the planned track (straights and a curve of the chosen
// radius, ending on a 22.5-degree direction), click to lay it and carry on
// from its end; a right click (no drag) or Esc stops. Starting from the middle of a track
// branches off it (a switch). Select mode picks a track to edit or delete.
// Drag with the right or middle button (or Space + drag) to pan; the wheel
// zooms.
import { type Design, type DRoute, type DSeg, freeName, isMono, toRoutes } from './design';
import { sleeperSpots } from '../geom/crossing';
import { poseToWorld, routeLength, routePose, worldToPose } from '../route/route';
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
const trace = (p: Pose, segs: DSeg[], step = 0.5) => tracedOnce(`t${p.x},${p.y},${p.heading},${step}${JSON.stringify(segs)}`, () => traceRaw(p, segs, step));

export interface Overlay { grooves: [number, number][][]; checkRails: [number, number][][]; crossings: [number, number][]; splits: [number, number][]; /** monorail points' toes (mm) */ monoPoints?: [number, number][]; grips?: [number, number][]; items?: OverlayItem[];
  /** what's wrong, and where (mm): ringed in red */ issues?: { at: [number, number]; r: number; text: string }[] }
/** A trackwork item on the plan (mm); a lever ('throw') has its points' frame and settings, to drag it. */
export interface OverlayItem { kind: string; key: string; at: [number, number]; pts: [number, number][]; dir?: [number, number];
  /** points: taken out (off), made by hand (forced), or a near miss where they could be forced (cand) */
  off?: boolean; forced?: boolean; cand?: { ok: boolean; why: string }; routes?: string[];
  lever?: { frame: [number, number, number]; side: number; stockX: number; edge: number; minD: number; pivotY: number; maxTine: number; leverOffset: number; springLength: number } }

export interface CanvasHost {
  design(): Design;
  /** The design changed (commit = an action finished, worth an undo step). */
  changed(commit: boolean): void;
  select(route: number | undefined): void;
  /** Curve radius in studs; 0 = auto (standard radii, 22.5-degree ends); -1 = free (any radius and angle). */
  radius(): number;
  /** What a click or drag would do now, and where the mouse is (studs), for the status line. */
  status?(hint: string, at: [number, number] | undefined): void;
  /** Esc with nothing being drawn: back to Select mode. */
  leaveDraw?(): void;
  /** What new routes are: train track or monorail (Draw's Track choice). */
  system?(): 'train' | 'monorail';
}

const MM = 8; // mm per stud
const MONO_HW = 15.9, MONO_RIDGE_HW = 3.2; // the monorail beam's and its ridge's half-widths, mm (monorail_lib.scad)

/** Can a lever be moved along the points (its spring tines longer or shorter)? Only on tines: the plate-style lever is level with the slider bar. */
export const leverSlides = (d: Design) => d.options?.mechStyle === 'tines';

/** Which way round a lever is, and what set it: dragged across by hand, the branch route's own setting, the Piece options', or auto (away from the branch). */
export interface LeverSide { side: 'left' | 'right'; by: 'hand' | 'route' | 'options' | 'auto'; main?: string; branch?: string; why: string }
export function leverSide(d: Design, lever: OverlayItem, items: OverlayItem[]): LeverSide {
  const side = (lever.lever?.side ?? 1) > 0 ? 'right' : 'left';
  const ids = items.filter((it) => it.kind === 'points' && it.key === lever.key && !it.cand).flatMap((it) => it.routes ?? []);
  const main = ids[0], branches = [...new Set(ids.slice(1))].filter((id) => id !== main);
  const routeOf = (id: string) => d.routes.find((r, i) => (r.name || String(i)) === id);
  // (a setting that would put it the other side isn't the one that did: a three-way takes its first branch's)
  const own = branches.find((id) => routeOf(id)?.throwSide === side);
  const branch = own ?? branches[0], opt = d.options?.throwSide ?? 'auto';
  if (d.trackwork?.throw?.[lever.key]?.side) return { side, by: 'hand', main, branch, why: 'dragged there on the plan' };
  if (own) return { side, by: 'route', main, branch, why: `${own}'s own Lever side (on its card)` };
  if (opt === side) return { side, by: 'options', main, branch, why: 'the Piece options\' Lever side' };
  return { side, by: 'auto', main, branch, why: branches.length > 1 ? 'auto: a three-way\'s goes on the right' : branch ? `auto: away from ${branch}, the branch` : 'auto: away from the branch' };
}

/** A key pressed while typing in a field (a number, a name, a drop-down): not a shortcut. */
export function typingIn(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

export class TrackCanvas {
  private ctx: CanvasRenderingContext2D;
  private scratch: HTMLCanvasElement | undefined;
  private scale = 6;            // px per stud
  private ox = 0; private oy = 0; // screen px of world (0, 0)
  private mouse: [number, number] | undefined;   // world, studs
  private panning: { x: number; y: number; ox: number; oy: number; right?: boolean; moved?: boolean } | undefined;
  private space = false;
  mode: 'draw' | 'select' = 'select';
  /** Moving the selected tracks: where the press was (studs) and where they started. */
  private moving: { x: number; y: number; orig: { i: number; x: number; y: number }[]; moved: boolean } | undefined;
  /** A selection box being dragged out (studs), and whether it adds to the selection. */
  private box: { x0: number; y0: number; x1: number; y1: number; add: boolean } | undefined;
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
  setSelection(list: number[]) {
    this.selected = list[0]; this.extra = new Set(list.slice(1)); this.host.select(this.selected); this.draw();
  }
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
  /** A route's straight or curve to pick out (hovered in its card's Shape): [route, piece]. */
  highlightSeg: [number, number] | undefined;
  /** Show where the underside grips (only when not gripping everywhere). */
  showGrips = true;
  /** Plan layers turned off from the legend: grooves, checks, crossings, ballast, baseplate, points, levers, grips. */
  hidden = new Set<string>();
  /** Dragging a track's end: which route and end, where the press was, and the route as it was. */
  private drag: { route: number; end: 'start' | 'end'; sx: number; sy: number; moved: boolean; orig: DRoute; anchor: number; lastGood?: DRoute } | undefined;
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
  private itemAt(w: [number, number]) {
    const r = Math.max(1, 9 / this.scale), d = this.host.design();
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
  /** The lever under a point (studs), if any. */
  private leverAt(w: [number, number]) {
    const r = Math.max(1.5, 12 / this.scale);
    // (on the knob, or anywhere on the arm)
    const inPoly = (pts: [number, number][]) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = [pts[i][0] / MM, pts[i][1] / MM], [xj, yj] = [pts[j][0] / MM, pts[j][1] / MM];
        if ((yi > w[1]) !== (yj > w[1]) && w[0] < ((xj - xi) * (w[1] - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    if (this.hidden.has('levers')) return undefined;
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
    const side = lx >= 0 ? 1 : -1;
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
      group[ld.it.key] = { side: side > 0 ? 'right' : 'left', leverOffset };
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
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => this.down(e));
    addEventListener('mousemove', (e) => this.move(e));
    addEventListener('mouseup', (e) => this.up(e));
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.touch();
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    this.resize();
  }

  // ---------- view ----------
  private resize() {
    const p = this.el.parentElement!, dpr = devicePixelRatio;
    this.el.width = p.clientWidth * dpr; this.el.height = p.clientHeight * dpr;
    this.el.style.width = `${p.clientWidth}px`; this.el.style.height = `${p.clientHeight}px`;
    if (this.ox === 0 && this.oy === 0) this.fit();
    this.draw();
  }
  /** Fit the whole design in view. */
  fit() {
    const pts = this.host.design().routes.flatMap((r) => trace(r, r.segs, 2));
    const w = this.el.width / devicePixelRatio, h = this.el.height / devicePixelRatio;
    if (pts.length < 2) { this.scale = 6; this.ox = w / 2; this.oy = h / 2; return this.draw(); }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - 8, x1 = Math.max(...xs) + 8, y0 = Math.min(...ys) - 8, y1 = Math.max(...ys) + 8;
    this.scale = Math.min(w / (x1 - x0), h / (y1 - y0), 40);
    this.ox = w / 2 - ((x0 + x1) / 2) * this.scale; this.oy = h / 2 + ((y0 + y1) / 2) * this.scale;
    this.draw();
  }
  private toScreen = (x: number, y: number): [number, number] => [this.ox + x * this.scale, this.oy - y * this.scale];
  private toWorld = (sx: number, sy: number): [number, number] => [(sx - this.ox) / this.scale, (this.oy - sy) / this.scale];
  private evWorld(e: MouseEvent) { const r = this.el.getBoundingClientRect(); return this.toWorld(e.clientX - r.left, e.clientY - r.top); }
  private snap = (p: [number, number]): [number, number] => [Math.round(p[0]), Math.round(p[1])];

  // ---------- finding things ----------
  /** The nearest point on a track's centre line within reach (studs): its route, pose, and whether it's an end. */
  /**
   * Onto the middle of another track (not route skip): the track that arrives
   * there along it, either way, merging in (trailing points), if it can.
   */
  private mergeOnto(p: [number, number], from: Pose, skip: number | undefined): DSeg[] | undefined {
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
    const d = this.host.design(), bal = d.options?.ballast ?? 'none';
    const half = (d.gaugeStuds + 1) / 2 + 1.5 + (bal === 'buddy' ? 2 : bal === 'ballast' ? 1 : 0);
    const h = this.nearTrack(p, half);
    return h && Math.hypot(h.pose.x - p[0], h.pose.y - p[1]) <= half + 0.25 ? { ...h, end: undefined } : undefined;
  }
  private nearTrack(p: [number, number], reach = this.reach(), skip?: number): { route: number; pose: Pose; end: 'start' | 'end' | undefined } | undefined {
    let best: { route: number; pose: Pose; end: 'start' | 'end' | undefined; d: number } | undefined;
    this.host.design().routes.forEach((r, i) => {
      if (i === skip) return;
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

  // ---------- input ----------
  /**
   * Touch: one finger is the mouse's left button (select, drag, draw), but on
   * empty ground in Select it pans (as the middle button); two fingers pinch
   * to zoom and drag to pan.
   */
  private touch() {
    const el = this.el;
    const fake = (t: { clientX: number; clientY: number }, button = 0) =>
      ({ clientX: t.clientX, clientY: t.clientY, button, buttons: 1, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, stopPropagation() {} }) as unknown as MouseEvent;
    let pinch: { d: number; scale: number; world: [number, number] } | undefined, last: { clientX: number; clientY: number } | undefined, oneButton = 0, start: [number, number] = [0, 0];
    const mid = (e: TouchEvent): [number, number] => { const r = el.getBoundingClientRect(), [a, b] = [e.touches[0], e.touches[1]]; return [(a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top]; };
    const spread = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && !pinch) {
        const t = e.touches[0], r = el.getBoundingClientRect(), w = this.toWorld(t.clientX - r.left, t.clientY - r.top);
        // (on empty ground in Select: pan, as the middle button; on track, a lever or points: as the left button)
        const onSomething = !!(this.leverAt(w) || this.itemAt(w) || this.nearTrack(w, this.reach(24)) || this.onBand(w));
        oneButton = this.mode === 'select' && !onSomething ? 1 : 0;
        last = t; start = [t.clientX, t.clientY]; this.mouse = w; this.down(fake(t, oneButton));
        return;
      }
      if (e.touches.length === 2) {
        // (a second finger: whatever the first began ends where it is, and the two pinch and pan)
        if (last && !pinch) this.up(fake(last, oneButton));
        const m = mid(e);
        pinch = { d: spread(e), scale: this.scale, world: this.toWorld(m[0], m[1]) };
      }
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (pinch && e.touches.length >= 2) {
        const m = mid(e);
        this.scale = Math.min(80, Math.max(0.5, (pinch.scale * spread(e)) / Math.max(1, pinch.d)));
        this.ox = m[0] - pinch.world[0] * this.scale; this.oy = m[1] + pinch.world[1] * this.scale;
        this.drawSoon();
        return;
      }
      if (!pinch && e.touches.length === 1) { last = e.touches[0]; this.move(fake(last, oneButton)); }
    }, { passive: false });
    const end = (e: TouchEvent) => {
      e.preventDefault();
      if (pinch) { if (e.touches.length === 0) pinch = undefined; last = undefined; return; }
      const t = e.changedTouches[0] ?? last;
      if (last) this.up(fake(t, oneButton));
      // (a tap on empty ground: nothing selected, as a click there)
      if (last && oneButton === 1 && Math.hypot(t.clientX - start[0], t.clientY - start[1]) < 8) { this.setSelection([]); this.draw(); }
      last = undefined;
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  }
  private down(e: MouseEvent) {
    // (the right button pans, drawing or not: a right click without a drag stops the track being drawn)
    if (e.button === 1 || e.button === 2 || this.space) {
      this.panning = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy, right: e.button === 2 };
      return;
    }
    const w = this.evWorld(e);
    // Pressing on a lever: drag it (side, out, along)
    if (!this.active && e.button === 0) {
      const it = this.leverAt(w);
      if (it) { this.leverDrag = { it, moved: false, off: [it.at[0] / MM - w[0], it.at[1] / MM - w[1]] }; return; }  // (held where it was grabbed)
      const id = this.itemAt(w);
      if (id) { this.itemDrag = { ...id, sx: e.clientX, sy: e.clientY }; return; }
    }
    // Pressing on a track's end (when not drawing): drag it to reshape the
    // track, or (Draw mode, no drag) carry the track on from there.
    if (!this.active) {
      const hit = this.nearTrack(w);
      if (hit?.end) {
        const r = this.host.design().routes[hit.route];
        const work = hit.end === 'end' ? r : reversed(r);
        // reshape from the start of the last curve (and the straight before it)
        let c = -1;
        work.segs.forEach((sg, k) => { if (sg.kind === 'curve') c = k; });
        const anchor = c < 0 ? Math.max(0, work.segs.length - 1) : c > 0 && work.segs[c - 1].kind === 'straight' ? c - 1 : c;
        this.drag = { route: hit.route, end: hit.end, sx: e.clientX, sy: e.clientY, moved: false, orig: structuredClone(r), anchor, lastGood: structuredClone(r) };
        this.extra.clear(); this.selected = hit.route; this.host.select(this.selected);
        return;
      }
    }
    if (this.mode === 'select') {
      const hit = this.nearTrack(w, this.reach(18)) ?? this.onBand(w);
      // pressing on a selected track: drag the selection about
      const add = e.shiftKey || e.ctrlKey || e.metaKey;
      // pressing on empty ground: drag out a box to select what it touches
      if (!hit) { this.box = { x0: w[0], y0: w[1], x1: w[0], y1: w[1], add }; return; }
      if (hit && !add && (hit.route === this.selected || this.extra.has(hit.route))) {
        const d = this.host.design();
        this.moving = { x: w[0], y: w[1], moved: false, orig: this.selection().map((i) => ({ i, x: d.routes[i].x, y: d.routes[i].y })) };
        return;
      }
      if (add && hit) {
        // add to the selection, or take it out
        if (this.selected === undefined) this.selected = hit.route;
        else if (hit.route === this.selected) { this.selected = [...this.extra][0]; this.extra.delete(this.selected!); }
        else if (this.extra.has(hit.route)) this.extra.delete(hit.route);
        else this.extra.add(hit.route);
      } else {
        this.selected = hit?.route; this.extra.clear();
        // (and it can be dragged straight away)
        if (hit) { const d = this.host.design(); this.moving = { x: w[0], y: w[1], moved: false, orig: [{ i: hit.route, x: d.routes[hit.route].x, y: d.routes[hit.route].y }] }; }
      }
      this.host.select(this.selected);
      this.draw();
      return;
    }
    const d = this.host.design();
    if (!this.active) {
      // Start: from a track end (carry it on), from the middle of a track
      // (branch off it), or from an empty grid point.
      const hit = this.nearTrack(w);
      if (hit?.end === 'end') this.active = { route: hit.route, end: hit.pose };
      else if (hit) {
        // from a track's start, or along it: a new track starting there,
        // along it (a branch: a switch) or back out of it, whichever way the
        // mouse goes
        this.active = { route: undefined, start: hit.pose, end: hit.pose, either: hit.pose.heading, from: hit.route };
        this.aimEither();
      }
      else { const g = this.snap(w); this.active = { route: undefined, start: { x: g[0], y: g[1], heading: NaN } }; }
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
      this.extra.clear(); this.selected = this.join(this.active.route, snapTo.route, snapTo.end);
      this.active = undefined;
      this.host.select(this.selected); this.host.changed(true); return this.draw();
    }
    this.extra.clear(); this.selected = this.active.route;
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
    if (this.leverDrag) {
      this.mouse = this.evWorld(e); this.leverDrag.moved = true;
      this.dragLever([this.mouse[0] + this.leverDrag.off[0], this.mouse[1] + this.leverDrag.off[1]]);
      return this.drawSoon();
    }
    if (this.moving) {
      const m = this.moving, p = this.evWorld(e), d = this.host.design();
      const dx = Math.round(p[0] - m.x), dy = Math.round(p[1] - m.y); // (whole studs: stays on the grid)
      if (dx || dy || m.moved) {
        m.moved = true;
        for (const o of m.orig) { d.routes[o.i].x = Math.round((o.x + dx) * 1e4) / 1e4; d.routes[o.i].y = Math.round((o.y + dy) * 1e4) / 1e4; }
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
      if (!this.drag.moved && Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) < 4) return;
      this.drag.moved = true;
      this.mouse = this.evWorld(e);
      this.reshape(this.snap(this.mouse));
      return this.drawSoon();
    }
    if (e.target !== this.el) return;
    this.mouse = this.evWorld(e);
    this.aimEither();
    this.cursor();
    this.drawSoon();
  }
  /** The mouse pointer says what a press would do: grab a lever, points or an end, pick a track, or lay track. */
  private cursor() {
    const w = this.mouse;
    let c = this.mode === 'draw' ? 'crosshair' : 'default';
    if (this.space) c = 'grab';
    else if (w && !this.active) {
      const grab = !!(this.leverAt(w) || this.itemAt(w)), hit = grab ? undefined : this.nearTrack(w, this.reach(18)) ?? (this.mode === 'select' ? this.onBand(w) : undefined);
      if (grab) c = 'grab';
      else if (hit?.end) c = 'move';
      else if (hit && this.mode === 'select') c = 'pointer';
    }
    if (this.el.style.cursor !== c) this.el.style.cursor = c;
  }
  private up(e: MouseEvent) {
    const pan = this.panning;
    this.panning = undefined;
    if (pan) this.cursor();
    if (pan) { if (pan.right && !pan.moved && this.active) this.stopDrawing(); return; }
    if (this.itemDrag) {
      const id = this.itemDrag, moved = !!id.at; this.itemDrag = undefined;
      if (!id.moved && id.it.kind === 'points') this.togglePoints(id.it.key);
      else if (moved) this.host.changed(true);
      return this.draw();
    }
    if (this.leverDrag) {
      const ld = this.leverDrag, moved = ld.moved; this.leverDrag = undefined;
      if (moved && ld.at && ld.arm) this.leverPending = { key: ld.it.key, at: ld.at, arm: ld.arm };
      if (moved) this.host.changed(true); return this.draw();
    }
    if (this.moving) { const moved = this.moving.moved; this.moving = undefined; if (moved) this.host.changed(true); return this.draw(); }
    if (this.box) {
      const b = this.box; this.box = undefined;
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      const tiny = x1 - x0 < 0.2 && y1 - y0 < 0.2;
      const inBox = tiny ? [] : this.host.design().routes.map((r, i) => (trace(r, r.segs, 0.5).some((q) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1) ? i : -1)).filter((i) => i >= 0);
      const keep = b.add ? this.selection() : [];
      this.setSelection([...keep, ...inBox.filter((i) => !keep.includes(i))]);
      return;
    }
    const dr = this.drag;
    if (!dr) return;
    this.drag = undefined;
    if (dr.moved) {
      if (this.dragBad && dr.lastGood) this.host.design().routes[dr.route] = dr.lastGood;
      else if (this.dragSnap) {
        // joined: make the two one track (the dragged end meeting the other's end)
        const routes = this.host.design().routes;
        if (dr.end === 'start') { const r0 = routes[dr.route]; routes[dr.route] = { ...r0, ...reversed(r0), startEnd: r0.endEnd, endEnd: r0.startEnd }; }
        this.extra.clear(); this.selected = this.join(dr.route, this.dragSnap.route, this.dragSnap.end);
        this.host.select(this.selected);
      }
      this.dragBad = false; this.dragSnap = undefined;
      this.host.changed(true); return this.draw();
    }
    // a click on an end: in Draw mode, carry the track on from it
    if (this.mode === 'draw' && e.button === 0) {
      const r = this.host.design().routes[dr.route];
      if (dr.end === 'end') this.active = { route: dr.route, end: follow(r, r.segs) };
      else { const p = { x: r.x, y: r.y, heading: r.heading }; this.active = { route: undefined, start: p, end: p, either: r.heading }; this.aimEither(); }
    }
    this.draw();
  }
  /** Reshape the dragged route so the dragged end lands on t. */
  private reshape(t: [number, number]) {
    const dr = this.drag!, d = this.host.design();
    const work = dr.end === 'end' ? structuredClone(dr.orig) : reversed(dr.orig);
    const head = work.segs.slice(0, dr.anchor);
    const from = follow(work, head);
    // onto another track's end: join it, arriving heading into it
    let snap = this.snapEnd(this.mouse ?? t, dr.route);
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
  }
  private dragBad = false;
  private dragSnap: { route: number; end: 'start' | 'end'; pose: Pose } | undefined;
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
  private snapEnd(p: [number, number], skip: number | undefined): { route: number; end: 'start' | 'end'; pose: Pose } | undefined {
    let best: { route: number; end: 'start' | 'end'; pose: Pose; d: number } | undefined;
    this.host.design().routes.forEach((r, i) => {
      if (i === skip) return;
      const e = follow(r, r.segs);
      for (const [end, pose] of [['start', { x: r.x, y: r.y, heading: r.heading }], ['end', { ...e, heading: e.heading + 180 }]] as const) {
        const d = Math.hypot(pose.x - p[0], pose.y - p[1]);
        if (d < this.reach(18) && (!best || d < best.d)) best = { route: i, end, pose: { ...pose, heading: ((pose.heading % 360) + 540) % 360 - 180 }, d };
      }
    });
    return best && { route: best.route, end: best.end, pose: best.pose };
  }
  /** Join route b onto the end of route a (b's start or end meeting a's end): a gets b's track, b goes. */
  private join(a: number, b: number, bEnd: 'start' | 'end') {
    const routes = this.host.design().routes, rb = routes[b];
    // (train track and monorail only meet: a route is one or the other)
    if (isMono(routes[a]) !== isMono(rb)) return a;
    const more = bEnd === 'start' ? rb.segs.map((sg) => ({ ...sg })) : reversed(rb).segs;
    const segs = routes[a].segs;
    for (const sg of more) {
      const last = segs[segs.length - 1];
      if (last?.kind === 'straight' && sg.kind === 'straight') last.studs = Math.round((last.studs + sg.studs) * 1e6) / 1e6;
      else segs.push(sg);
    }
    // (its far end, connector or buffer stop, is the joined track's end now)
    const far = bEnd === 'start' ? rb.endEnd : rb.startEnd;
    if (far) routes[a].endEnd = far; else delete routes[a].endEnd;
    routes.splice(b, 1);
    return b < a ? a - 1 : a;
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
    if (e.code === 'Space' && !down) this.space = false;
    if (typingIn(e) || !down) return;
    // (Space held pans; not when a button has the focus: Space presses it)
    if (e.code === 'Space' && (e.target as HTMLElement)?.tagName !== 'BUTTON') { this.space = true; e.preventDefault(); }
    if (e.key === 'Escape' && this.drag) {
      // put the dragged track back as it was
      this.host.design().routes[this.drag.route] = this.drag.orig;
      this.drag = undefined; this.dragBad = false; this.dragSnap = undefined;
      this.host.changed(true); return this.draw();
    }
    // Esc: stop the track being drawn; pressed again (nothing being drawn), back to Select
    // (in Select mode, Esc lets go of the selection)
    if (e.key === 'Escape') {
      if (this.active) this.stopDrawing();
      else if (this.mode === 'draw') this.host.leaveDraw?.();
      else if (this.selection().length) this.setSelection([]);
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected !== undefined && !this.active) {
      const routes = this.host.design().routes;
      for (const i of this.selection().sort((a, b) => b - a)) routes.splice(i, 1);
      this.selected = undefined; this.extra.clear(); this.host.select(undefined); this.host.changed(true); this.draw();
    }
  }
  stopDrawing() { this.active = undefined; this.draw(); }

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
    const t = this.snap(w);
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
  /** What a click or drag would do now. */
  hint(): string {
    if (this.drag?.moved) return this.dragBad ? "Can't bend the track this way: release to keep the last good shape, Esc puts it back"
      : this.dragSnap ? 'Release to join the two ends' : 'Release to reshape · drop on another end to join · Esc puts it back';
    if (this.active) return 'Click to lay track · keep clicking to go on · Esc or right-click stops · right-drag pans';
    // (over a lever: which side it's on and what put it there)
    const lv = this.leverDrag?.it ?? (this.mouse && !this.itemDrag ? this.leverAt(this.mouse) : undefined);
    if (lv) {
      const d = this.host.design(), ls = leverSide(d, lv, this.overlay?.items ?? []);
      if (this.leverDrag?.moved) return 'Let go to put the lever here: it goes on the nearest stud it can';
      return `Lever on the ${ls.side} (${ls.why}) · drag it across the track to change sides, or further out${leverSlides(d) ? ' or along' : ''}`;
    }
    const hit = this.mouse ? this.nearTrack(this.mouse) ?? (this.mode === 'select' ? this.onBand(this.mouse) : undefined) : undefined;
    // (over points: what a click does to them)
    const pi = !this.active && this.mouse ? this.itemAt(this.mouse) : undefined;
    if (pi?.it.kind === 'points' && !this.itemDrag?.moved) {
      const st = this.pointsState(pi.it.key);
      if (st.state === 'built') return `Click to take these points out (the rails run through as plain track)${st.forced ? ' · they were forced' : ''} · drag to move them along`;
      if (st.state === 'off') return 'Points taken out: click to put them back';
      const why = pi.it.cand?.why ?? '';
      if (st.forced) return `Points forced here${st.ok ? '' : `, but ${why}: too far off to build`} · click to unforce`;
      return st.ok ? `No points here (${why}): click to force them` : `No points here: ${why}, too far off to force (redraw it to start on the track)`;
    }
    if (this.mode === 'select') {
      if (hit?.end) return 'Drag this end to reshape the track';
      if (this.moving?.moved) return 'Moving: let go to put it down';
      if (this.selected !== undefined) return `${this.selection().length > 1 ? `${this.selection().length} tracks` : this.host.design().routes[this.selected]?.name ?? ''} selected · drag to move · Shift+click adds more · Delete removes`;
      if (!this.host.design().routes.length) return 'No track yet: press D (or ✎ Draw) to lay some';
      return 'Click a track to select it, drag it to move it · drag an end to reshape it · D to draw';
    }
    if (hit?.end === 'end') return 'Click to carry the track on · drag to reshape it';
    if (hit?.end === 'start') return 'Click to lay a new track from this end (back out of it, or along it as a branch) · drag to reshape it';
    if (hit) return 'Click to branch off this track';
    return 'Click a grid point to start a track';
  }

  draw() {
    this.host.status?.(this.hint(), this.mouse ? this.snap(this.mouse) : undefined);
    const c = this.ctx, dpr = devicePixelRatio, W = this.el.width / dpr, H = this.el.height / dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(this.el);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const ink = { rail: v('--c-rail', '#4a5560'), centre: v('--c-centre', '#b8b8b0'), label: v('--c-label', '#5c5c55'), mark: v('--c-mark', '#111'),
      tagBg: v('--c-tag-bg', 'rgba(255,255,255,0.92)'), band: v('--c-band', 'rgba(120,110,95,0.16)'), ballast: v('--c-ballast', 'rgba(150,128,96,0.30)'), ballastLow: v('--c-ballast-low', 'rgba(150,128,96,0.16)'), sel: v('--c-sel', '#2b5fb8'), selInk: v('--c-sel-ink', '#1d4fae'),
      mono: v('--c-mono', 'rgba(140,150,170,0.42)'), monoEdge: v('--c-mono-edge', '#5d6678') };
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
    const d = this.host.design(), g = (d.gaugeStuds + 1) / 2;
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
    /** Draw segments from pose p, each in its colour: bad ones red. */
    const drawSegs = (p: Pose, segs: DSeg[], isBad: (k: number) => boolean, band: string, rail: string) => {
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
    const ballast = d.options?.ballast ?? 'none';
    if (ballast !== 'none' && !this.hidden.has('ballast')) {
      const wide = (2 * g + 3 + (ballast === 'buddy' ? 4 : 2)) * this.scale;
      layer(ink.ballastLow, (draw) => { for (const r of d.routes) if (!isMono(r)) draw(trace(r, r.segs, 0.5), wide); });
      if (ballast === 'buddy') layer(ink.ballast, (draw) => { for (const r of d.routes) if (!isMono(r)) draw(trace(r, r.segs, 0.5), (2 * g + 5) * this.scale); });
      // (the selected tracks' ballast picked out with them, as their band)
      layer('rgba(43,111,224,0.16)', (draw) => d.routes.forEach((r, i) => { if (!isMono(r) && (i === this.selected || this.extra.has(i))) draw(trace(r, r.segs, 0.5), wide); }));
    }
    // the sleeper bands, each colour as one layer (red where a drag can't bend the track)
    {
      const bandOf = (i: number) => (i === this.selected || this.extra.has(i) ? 'rgba(43,111,224,0.18)' : ink.band);
      const badOf = (i: number) => {
        const dragging = this.drag?.moved && this.drag.route === i && this.dragBad;
        return (k: number) => !!dragging && (this.dragBadFrom >= 0 ? k >= this.dragBadFrom : k < this.dragBadTo);
      };
      for (const color of [ink.band, 'rgba(43,111,224,0.18)', 'rgba(224,69,43,0.22)']) layer(color, (draw) => d.routes.forEach((r, i) => {
        if (isMono(r)) return; // (the monorail's beam: drawn below)
        let q: Pose = r; const bad = badOf(i);
        r.segs.forEach((sg, k) => {
          if ((bad(k) ? 'rgba(224,69,43,0.22)' : bandOf(i)) === color) draw(trace(q, [sg], 0.5), (2 * g + 3) * this.scale);
          q = follow(q, [sg]);
        });
      }));
    }
    // (track only with sleepers: each sleeper across the band, where the build lays them (crossing.ts sleeperSpots;
    // where tracks meet the build keeps the bed, drawn as the band))
    {
      const op = d.options ?? {};
      if (op.sleepers === 'sleepers' && (op.ballast ?? 'none') === 'none') {
        const gapS = op.sleeperGapStuds ?? 2, sw = op.sleeperWidthStuds ?? 2, half = g + 1.5;
        toRoutes(d).forEach((rt, i) => {
          if (isMono(d.routes[i]) || !rt.segments.length) return;
          for (const sAt of sleeperSpots(routeLength(rt), false, false, gapS, sw, rt.segments.every((sg) => sg.kind === 'arc'))) {
            const p = routePose(rt, sAt), h = (p[2] * Math.PI) / 180, rx = Math.cos(h), ry = Math.sin(h), x = p[0] / MM, y = p[1] / MM;
            line([[x - rx * half, y - ry * half], [x + rx * half, y + ry * half]], 'rgba(140,128,110,0.42)', sw * this.scale);
          }
        });
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
        drawSegs(r, r.segs, isBad, '', sel ? ink.sel : ink.rail); // (bands drawn above, as layers)
        line(trace(r, r.segs, 0.5), ink.centre, 1, [4, 4]);
      }
      // what each curve is, at its middle (and straights' lengths when zoomed in)
      let q: Pose = { x: r.x, y: r.y, heading: r.heading };
      c.font = '11px system-ui, sans-serif'; c.textAlign = 'center';
      for (const sg of r.segs) {
        const show = sg.kind === 'curve' || this.scale > 10;
        if (show) {
          const mid = follow(q, [sg.kind === 'straight' ? { kind: 'straight', studs: sg.studs / 2 } : { ...sg, angle: sg.angle / 2 }]);
          const off = ((isMono(r) ? monoHw : g) + 2.2) * (sg.kind === 'curve' ? -Math.sign(sg.angle) : 1);  // outside the curve
          const [sx, sy] = this.toScreen(mid.x + off * Math.cos((mid.heading * Math.PI) / 180), mid.y + off * Math.sin((mid.heading * Math.PI) / 180));
          const txt = sg.kind === 'curve' ? `R${Math.round(sg.radius * 10) / 10} ${Math.round(Math.abs(sg.angle) * 10) / 10}°${sg.bank ? `, bank ${sg.bank}°` : ''}` : `${Math.round(sg.studs * 10) / 10}`;
          labels.push({ x: sx, y: sy, txt, sel });
        }
        // (a banked curve: a fine dotted line along its high, outer side)
        if (sg.kind === 'curve' && sg.bank) line(offsetPts(q, [sg], (g + 1) * Math.sign(sg.angle)), 'rgba(200,120,40,0.75)', 1.5, [2, 3]);
        q = follow(q, [sg]);
      }
      c.textAlign = 'start';
      // ends (a buffer stop: its beam across the track, a stud in from the end, and its posts)
      for (const p of [{ x: r.x, y: r.y }, follow(r, r.segs)]) {
        const [sx, sy] = this.toScreen(p.x, p.y);
        c.fillStyle = ink.rail; c.beginPath(); c.arc(sx, sy, 3, 0, 2 * Math.PI); c.fill();
      }
      for (const [which, p, k] of [['startEnd', { x: r.x, y: r.y, heading: r.heading }, 1], ['endEnd', follow(r, r.segs), -1]] as const) {
        if (r[which] !== 'buffer' || !r.segs.length) continue;
        const h = (p.heading * Math.PI) / 180, ax = -Math.sin(h) * k, ay = Math.cos(h) * k, rx = Math.cos(h), ry = Math.sin(h);
        const at = (al: number, lat: number): [number, number] => [p.x + ax * al + rx * lat, p.y + ay * al + ry * lat];
        line([at(1, -(g + 1.5)), at(1, g + 1.5)], ink.rail, Math.max(3, 0.8 * this.scale));
        for (const sd of [-1, 1]) line([at(0, sd * (g + 0.5)), at(2, sd * (g + 0.5))], ink.rail, Math.max(3, 2 * this.scale));
      }
    });
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
      if (!this.hidden.has('grooves')) for (const gr of this.overlay.grooves) line(w(gr), '#e0452b', railW * 0.7);
      if (!this.hidden.has('checks')) for (const cr of this.overlay.checkRails) line(w(cr), '#2b6fe0', Math.max(1, (1 / MM) * this.scale));
      if (!this.hidden.has('crossings')) for (const p of this.overlay.crossings) { const [sx, sy] = this.toScreen(p[0] / MM, p[1] / MM); c.strokeStyle = ink.mark; c.lineWidth = 1.2; c.beginPath(); c.arc(sx, sy, 5, 0, 2 * Math.PI); c.stroke(); }
      // the anti-stud tubes underneath that grip the plate (Grip: Edges)
      if (this.showGrips && !this.hidden.has('grips') && this.scale >= 3) {
        c.strokeStyle = '#2b9e4a'; c.lineWidth = 1.5;
        const r = Math.max(2, (3.2 / MM) * this.scale);
        for (const p of this.overlay.grips ?? []) { const [sx, sy] = this.toScreen(p[0] / MM, p[1] / MM); c.beginPath(); c.arc(sx, sy, r, 0, 2 * Math.PI); c.stroke(); }
      }
      // what's wrong, ringed in red, with what it is by the ring (and in full by the mouse, near it)
      for (const is of this.overlay.issues ?? []) {
        const [sx, sy] = this.toScreen(is.at[0] / MM, is.at[1] / MM), r = Math.max(14, (is.r / MM) * this.scale);
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
      const hi = this.overlay.items?.find((it) => it.key === this.highlight);
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
          if (st.state === 'built') { c.fillStyle = '#f0b400'; c.fillRect(sx - 5, sy - 5, 10, 10); if (st.forced) { c.strokeStyle = ink.mark; c.lineWidth = 1.2; c.strokeRect(sx - 6.5, sy - 6.5, 13, 13); } continue; }
          if (st.state === 'off') c.strokeStyle = '#8a8f99';
          else { c.strokeStyle = st.forced && !st.ok ? '#e0452b' : '#f0b400'; if (!st.ok) c.setLineDash([3, 2]); }
          c.strokeRect(sx - 4.5, sy - 4.5, 9, 9); c.setLineDash([]);
        }
        // (hand-edited trackwork: a ring in the accent colour round each one changed, so the edits show on the plan)
        {
          const twk = this.host.design().trackwork ?? {}, acc = getComputedStyle(this.el).getPropertyValue('--accent').trim() || '#2563eb';
          for (const it of this.overlay.items ?? []) {
            const e = ((twk as Record<string, Record<string, Record<string, unknown>> | undefined>)[it.kind] ?? {})[it.key];
            if (!e || !Object.values(e).some((v) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length))) continue;
            const [sx, sy] = this.toScreen(it.at[0] / MM, it.at[1] / MM);
            c.strokeStyle = acc; c.lineWidth = 2; c.setLineDash([3, 2]); c.beginPath(); c.arc(sx, sy, 11, 0, 2 * Math.PI); c.stroke(); c.setLineDash([]);
          }
        }
        // (monorail points: a yellow diamond, built as drawn: not changed by hand)
        for (const q of this.overlay.monoPoints ?? []) {
          const [sx, sy] = this.toScreen(q[0] / MM, q[1] / MM);
          c.fillStyle = '#f0b400'; c.beginPath(); c.moveTo(sx, sy - 7); c.lineTo(sx + 7, sy); c.lineTo(sx, sy + 7); c.lineTo(sx - 7, sy); c.closePath(); c.fill();
        }
      }
      // handles: check rail and flangeway cut ends, dragged longer or shorter (and the one being dragged)
      if (this.scale >= 4) for (const it of this.overlay.items ?? []) {
        if ((it.kind !== 'check' && it.kind !== 'groove') || it.pts.length < 2 || this.hidden.has(it.kind === 'check' ? 'checks' : 'grooves')) continue;
        c.fillStyle = it.kind === 'check' ? '#2b6fe0' : '#e0452b';
        for (const q of [it.pts[0], it.pts[it.pts.length - 1]]) { const [hx, hy] = this.toScreen(q[0] / MM, q[1] / MM); c.fillRect(hx - 2.5, hy - 2.5, 5, 5); }
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
    // while dragging an end: what the reshaped track is, or why not
    if (this.drag?.moved && this.mouse) {
      const r = d.routes[this.drag.route];
      const [mx, my] = this.toScreen(...this.snap(this.mouse));
      const txt = this.dragSnap && !this.dragBad ? `${describe(r.segs)}: joins ${d.routes[this.dragSnap.route].name}` : this.dragBad ? `Can't bend the track this way (red part: ${describe(this.dragBadFrom >= 0 ? r.segs.slice(this.dragBadFrom) : r.segs.slice(0, this.dragBadTo))}${this.host.radius() < 0 ? ', tighter than R24' : ''})` : describe(r.segs);
      tag(mx, my, txt, this.dragBad ? '#e0452b' : ink.selInk);
      c.fillStyle = '#2b9e4a'; c.beginPath(); c.arc(mx, my, 5, 0, 2 * Math.PI); c.fill();
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
          const [mx, my] = this.toScreen(...this.snap(this.mouse));
          const sn = this.joinableEnd(this.mouse);
          const txt = sn ? `${describe(segs)}: joins ${d.routes[sn.route].name}` : describe(segs);
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
      const p = hit ? [hit.pose.x, hit.pose.y] : this.snap(this.mouse);
      const [sx, sy] = this.toScreen(p[0], p[1]);
      c.fillStyle = hit ? (hit.end ? '#2b9e4a' : '#f0b400') : '#2b6fe0';
      c.beginPath(); c.arc(sx, sy, 4, 0, 2 * Math.PI); c.fill();
    }
  }
}
