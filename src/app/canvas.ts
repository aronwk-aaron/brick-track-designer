// The track canvas: a top-down stud grid where track is laid like in
// top-down train games. Click a grid point (or the end of a track) to start,
// move the mouse to see the planned track (straights and a curve of the chosen
// radius, ending on a 22.5-degree direction), click to lay it and carry on
// from its end; right-click or Esc stops. Starting from the middle of a track
// branches off it (a switch). Select mode picks a track to edit or delete.
// Drag with the right or middle button (or Space + drag) to pan; the wheel
// zooms.
import type { Design, DRoute, DSeg } from './design';
import { follow, plan, trace, type Pose } from './planner';

export interface Overlay { grooves: [number, number][][]; checkRails: [number, number][][]; crossings: [number, number][]; splits: [number, number][] }

export interface CanvasHost {
  design(): Design;
  /** The design changed (commit = an action finished, worth an undo step). */
  changed(commit: boolean): void;
  select(route: number | undefined): void;
  radius(): number;
}

const MM = 8; // mm per stud
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

export class TrackCanvas {
  private ctx: CanvasRenderingContext2D;
  private scale = 6;            // px per stud
  private ox = 0; private oy = 0; // screen px of world (0, 0)
  private mouse: [number, number] | undefined;   // world, studs
  private panning: { x: number; y: number; ox: number; oy: number } | undefined;
  private space = false;
  mode: 'draw' | 'select' = 'draw';
  /** While drawing: the route being extended (or a new one not yet added), and where it ends. */
  private active: { route: number | undefined; start?: Pose; end?: Pose; newRoute?: DRoute } | undefined;
  selected: number | undefined;
  overlay: Overlay | undefined;

  constructor(private el: HTMLCanvasElement, private host: CanvasHost) {
    this.ctx = el.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(el.parentElement!);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => this.down(e));
    addEventListener('mousemove', (e) => this.move(e));
    addEventListener('mouseup', () => { this.panning = undefined; });
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
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
  private nearTrack(p: [number, number], reach = 1.2): { route: number; pose: Pose; end: 'start' | 'end' | undefined } | undefined {
    let best: { route: number; pose: Pose; end: 'start' | 'end' | undefined; d: number } | undefined;
    this.host.design().routes.forEach((r, i) => {
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
            if (d < reach + 0.5 && (!best || d < best.d - 0.05)) best = { route: i, pose: pt, end: undefined, d };
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
  private down(e: MouseEvent) {
    if (e.button === 1 || e.button === 2 && !this.active || this.space) {
      this.panning = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy };
      return;
    }
    if (e.button === 2) { this.stopDrawing(); return; }
    const w = this.evWorld(e);
    if (this.mode === 'select') {
      const hit = this.nearTrack(w, 1.5);
      this.selected = hit?.route;
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
      else if (hit?.end === 'start') {
        // drawing away from a track's start: a new route starting there, heading out
        this.active = { route: undefined, start: hit.pose, end: hit.pose };
      } else if (hit) this.active = { route: undefined, start: hit.pose, end: hit.pose };
      else { const g = this.snap(w); this.active = { route: undefined, start: { x: g[0], y: g[1], heading: NaN } }; }
      this.draw();
      return;
    }
    // Lay the planned track.
    const segs = this.planTo(w);
    if (!segs) return;
    if (this.active.route === undefined) {
      const st = this.active.start!;
      const heading = Number.isNaN(st.heading) ? this.freeHeading(st, w) : st.heading;
      d.routes.push({ name: `T${d.routes.length + 1}`, x: st.x, y: st.y, heading, segs });
      this.active = { route: d.routes.length - 1, end: follow({ ...st, heading }, segs) };
    } else {
      const rs = d.routes[this.active.route].segs, last = rs[rs.length - 1];
      if (last?.kind === 'straight' && segs[0].kind === 'straight') { last.studs = Math.round((last.studs + segs[0].studs) * 1e6) / 1e6; rs.push(...segs.slice(1)); }
      else rs.push(...segs);
      this.active.end = follow(this.active.end!, segs);
    }
    this.selected = this.active.route;
    this.host.select(this.selected);
    this.host.changed(true);
    this.draw();
  }
  private move(e: MouseEvent) {
    if (this.panning) {
      this.ox = this.panning.ox + e.clientX - this.panning.x; this.oy = this.panning.oy + e.clientY - this.panning.y;
      return this.draw();
    }
    if (e.target !== this.el) return;
    this.mouse = this.evWorld(e);
    this.draw();
  }
  private wheel(e: WheelEvent) {
    e.preventDefault();
    const r = this.el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const before = this.toWorld(sx, sy);
    this.scale = Math.min(80, Math.max(0.5, this.scale * Math.exp(-e.deltaY * 0.0015)));
    this.ox = sx - before[0] * this.scale; this.oy = sy + before[1] * this.scale;
    this.draw();
  }
  private key(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'Space') { this.space = down; e.preventDefault(); }
    if (!down) return;
    if (e.key === 'Escape') this.stopDrawing();
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected !== undefined && !this.active) {
      this.host.design().routes.splice(this.selected, 1);
      this.selected = undefined; this.host.select(undefined); this.host.changed(true); this.draw();
    }
  }
  stopDrawing() { this.active = undefined; this.draw(); }

  /** Heading for a new track from an empty grid point: the 22.5-degree direction nearest the mouse. */
  private freeHeading(st: Pose, w: [number, number]) {
    const ang = (Math.atan2(-(w[0] - st.x), w[1] - st.y) * 180) / Math.PI;
    return norm180(Math.round(ang / 22.5) * 22.5);
  }
  /** The track planned from the active end to the (snapped) mouse point. */
  private planTo(w: [number, number]): DSeg[] | undefined {
    const a = this.active!;
    const t = this.snap(w);
    if (a.route === undefined && a.start && Number.isNaN(a.start.heading)) {
      // first piece from an empty point: straight, along the nearest direction
      const h = this.freeHeading(a.start, w);
      const dx = -Math.sin((h * Math.PI) / 180), dy = Math.cos((h * Math.PI) / 180);
      const len = Math.round(((t[0] - a.start.x) * dx + (t[1] - a.start.y) * dy) * 1e6) / 1e6;
      return len > 0 ? [{ kind: 'straight', studs: len }] : undefined;
    }
    return plan(a.end ?? a.start!, t, this.host.radius());
  }

  // ---------- drawing ----------
  draw() {
    const c = this.ctx, dpr = devicePixelRatio, W = this.el.width / dpr, H = this.el.height / dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(this.el);
    c.fillStyle = css.getPropertyValue('--canvas-bg') || '#fbfbf8'; c.fillRect(0, 0, W, H);
    // grid: a line every stud (when not too dense), stronger every 8
    const [wx0, wy1] = this.toWorld(0, 0), [wx1, wy0] = this.toWorld(W, H);
    for (const [step, color] of [[1, '#ececE6'], [8, '#d4d4cc']] as const) {
      if (step * this.scale < 5) continue;
      c.strokeStyle = color; c.lineWidth = 1; c.beginPath();
      for (let x = Math.ceil(wx0 / step) * step; x <= wx1; x += step) { const [sx] = this.toScreen(x, 0); c.moveTo(Math.round(sx) + 0.5, 0); c.lineTo(Math.round(sx) + 0.5, H); }
      for (let y = Math.ceil(wy0 / step) * step; y <= wy1; y += step) { const [, sy] = this.toScreen(0, y); c.moveTo(0, Math.round(sy) + 0.5); c.lineTo(W, Math.round(sy) + 0.5); }
      c.stroke();
    }
    const d = this.host.design(), g = (d.gaugeStuds + 1) / 2;
    const line = (pts: [number, number][], color: string, width: number, dash: number[] = []) => {
      if (pts.length < 2) return;
      c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.lineCap = 'butt'; c.beginPath();
      pts.forEach((p, i) => { const [sx, sy] = this.toScreen(p[0], p[1]); if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); });
      c.stroke(); c.setLineDash([]);
    };
    const offsetPts = (r: { x: number; y: number; heading: number }, segs: DSeg[], o: number) => {
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
    };
    const railW = Math.max(1, 2.5 / MM * this.scale);
    d.routes.forEach((r, i) => {
      const sel = i === this.selected;
      // sleeper band, rails, centre line
      line(trace(r, r.segs, 0.5), sel ? 'rgba(43,111,224,0.18)' : 'rgba(120,110,95,0.16)', (2 * g + 3) * this.scale);
      for (const o of [-g, g]) line(offsetPts(r, r.segs, o), sel ? '#2b5fb8' : '#4a5560', railW);
      line(trace(r, r.segs, 0.5), '#b8b8b0', 1, [4, 4]);
      // ends
      for (const p of [{ x: r.x, y: r.y }, follow(r, r.segs)]) {
        const [sx, sy] = this.toScreen(p.x, p.y);
        c.fillStyle = '#4a5560'; c.beginPath(); c.arc(sx, sy, 3, 0, 2 * Math.PI); c.fill();
      }
    });
    // the solver's results
    if (this.overlay) {
      const w = (mm: [number, number][]) => mm.map(([x, y]) => [x / MM, y / MM] as [number, number]);
      for (const gr of this.overlay.grooves) line(w(gr), '#e0452b', railW * 0.7);
      for (const cr of this.overlay.checkRails) line(w(cr), '#2b6fe0', Math.max(1, (1 / MM) * this.scale));
      for (const p of this.overlay.crossings) { const [sx, sy] = this.toScreen(p[0] / MM, p[1] / MM); c.strokeStyle = '#111'; c.lineWidth = 1.2; c.beginPath(); c.arc(sx, sy, 5, 0, 2 * Math.PI); c.stroke(); }
      for (const p of this.overlay.splits) { const [sx, sy] = this.toScreen(p[0] / MM, p[1] / MM); c.fillStyle = '#f0b400'; c.fillRect(sx - 5, sy - 5, 10, 10); }
    }
    // the mouse: snapped point, and the planned track while drawing
    if (this.mouse && this.mode === 'draw') {
      if (this.active) {
        const segs = this.planTo(this.mouse);
        const from = this.active.end ?? this.active.start!;
        const st = Number.isNaN(from.heading) ? { ...from, heading: this.freeHeading(from, this.mouse) } : from;
        if (segs) {
          line(trace(st, segs, 0.5), 'rgba(43,111,224,0.25)', (2 * g + 3) * this.scale);
          for (const o of [-g, g]) line(offsetPts(st, segs, o), '#2b6fe0', railW);
        } else {
          // can't get there going forward with this radius
          line([[from.x, from.y], this.snap(this.mouse)], '#e0452b', 2, [6, 4]);
          const [mx, my] = this.toScreen(...this.snap(this.mouse));
          c.fillStyle = '#e0452b'; c.font = '12px system-ui, sans-serif';
          c.fillText(`Can't reach this with R${this.host.radius()}: move further ahead, or pick a smaller curve`, mx + 10, my - 10);
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
