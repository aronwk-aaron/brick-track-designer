// A template added to the design on the plan (not replacing it): placed as a group (turned, mirrored, moved), its open ends snapping
// onto open ends of the design, its routes, tables and everything attached to them put in with fresh names. Pure: the plan shows
// the group following the pointer and calls this to place it.
import { type Design, type DRoute, freeName, isMono, OPTION_DEFAULTS } from './design';
import { follow, type Pose } from './planner';
import { gaugeMeet, joinProblem, mirrorRoute } from './routeedits';
import { nearestAlong, routeStuds } from './splitmerge';
import { mirroredTable, movedTable, type Table, tableMiddle, turnedTable } from './tables';
import { copyEdits, mirrorAnchors, moveEdits, pasteEdits } from './twfollow';

export type Pt = [number, number];
/** How a template is put: mirrored left to right about x = 0 first, then turned (degrees, + left) about (0, 0), then moved. */
export interface Placement { turn: number; dx: number; dy: number; mirror: boolean }
/** A route's open end: which route and end, and the pose there facing out of the track (studs, degrees). */
export interface End { route: string; end: 'start' | 'end'; pose: Pose }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const rot = (q: Pt, a: number): Pt => { const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180); return [q[0] * c - q[1] * s, q[0] * s + q[1] * c]; };

/** The template put as asked (a copy; the template itself isn't changed): its routes, tables and hand edits. */
export function transformed(t: Design, p: Placement): Design {
  const out = structuredClone(t);
  const names = out.routes.map((r, i) => r.name || String(i));
  if (p.mirror) {
    mirrorAnchors(out, names);
    for (const r of out.routes) mirrorRoute(r, 0);
    out.tables = out.tables?.map((tb) => mirroredTable(tb, 0));
    moveEdits(out, ([x, y]) => [-x, y]);
  }
  const a = p.turn;
  for (const r of out.routes) { const q = rot([r.x, r.y], a); r.x = r3(q[0] + p.dx); r.y = r3(q[1] + p.dy); r.heading = r3(norm180(r.heading + a)); }
  if (out.tables) out.tables = out.tables.map((tb) => movedTable(a ? turnedTable(tb, 0, 0, a) : tb, p.dx, p.dy));
  moveEdits(out, ([x, y]) => { const q = rot([x / 8, y / 8], a); return [Math.round((q[0] + p.dx) * 8), Math.round((q[1] + p.dy) * 8)]; });
  return out;
}

const endPose = (r: DRoute, which: 'start' | 'end'): Pose => which === 'start' ? { x: r.x, y: r.y, heading: norm180(r.heading + 180) } : (([e]) => ({ x: e.x, y: e.y, heading: norm180(e.heading) }))([follow(r, r.segs)]);

/** The ends of these routes that join nothing: no other route's end is there, and no other route's track passes through it (a branch's start on its main line isn't open). */
export function openEnds(routes: readonly DRoute[]): End[] {
  const out: End[] = [];
  routes.forEach((r, i) => {
    for (const which of ['start', 'end'] as const) {
      const pose = endPose(r, which);
      const taken = routes.some((o, j) => {
        if (j === i) return false;
        // (an end meeting another head on is joined; two leaving the same point the same way (a switch's toe) are one open end)
        if ([endPose(o, 'start'), endPose(o, 'end')].some((q) => Math.hypot(q.x - pose.x, q.y - pose.y) < 0.05 && Math.abs(norm180(q.heading - pose.heading)) > 90)) return true;
        if (Math.hypot(pose.x - o.x, pose.y - o.y) > routeStuds(o) + 0.5) return false;
        const n = nearestAlong(o, [pose.x, pose.y]);
        return n.dist < 0.2 && n.s > 0.05 && n.s < routeStuds(o) - 0.05;
      });
      if (!taken && !out.some((q) => Math.hypot(q.pose.x - pose.x, q.pose.y - pose.y) < 0.05 && Math.abs(norm180(q.pose.heading - pose.heading)) <= 90)) out.push({ route: r.name || String(i), end: which, pose });
    }
  });
  return out;
}

/** The setting names (keys) a template sets differently from the design's current ones. */
export function differingOptions(d: Design, t: Design): string[] {
  const cur = (k: string) => (d.options as Record<string, unknown> | undefined)?.[k] ?? (OPTION_DEFAULTS as unknown as Record<string, unknown>)[k];
  return Object.entries(t.options ?? {}).filter(([k, v]) => v !== undefined && JSON.stringify(v) !== JSON.stringify(cur(k))).map(([k]) => k);
}

/** Where a group is held by: its first route's start, else its first table's middle, else the origin. */
function hold(tt: Design): Pt {
  if (tt.routes.length) return [tt.routes[0].x, tt.routes[0].y];
  if (tt.tables?.length) { const m = tableMiddle(tt.tables[0]); return [Math.round(m[0]), Math.round(m[1])]; }
  return [0, 0];
}
/** A template route as it'd be among the design's (its own gauge where the template's differs from the design's), for the join test. */
const asAdded = (d: Design, t: Design, r: DRoute): DRoute => (t.gaugeStuds !== d.gaugeStuds && r.gaugeStuds === undefined && !isMono(r) ? { ...r, gaugeStuds: t.gaugeStuds } : r);

export interface Placed { placement: Placement; /** the ends that meet, if snapped */ snapped?: { design: End; template: End }; /** an end near enough that couldn't be snapped to, and why */ why?: string }

/**
 * Where a template goes with the pointer at `at` (studs): held by its first route's start on the stud grid, unless one of its open ends
 * is within reach (studs) of an open end of the design that it can be joined to (joinProblem): then the group is turned and moved so the
 * two ends meet, heading into each other. `onto`: start with its first open end on that design end (no reach needed).
 */
export function placeTemplate(d: Design, t: Design, at: Pt, turn: number, mirror: boolean, reach: number, onto?: End, theirs: End[] = openEnds(d.routes)): Placed {
  const t0 = transformed(t, { turn, dx: 0, dy: 0, mirror }), h = hold(t0);
  const free: Placement = { turn, mirror, dx: 0, dy: 0 };
  free.dx = r3(Math.round(at[0]) - h[0]); free.dy = r3(Math.round(at[1]) - h[1]);
  const mine = openEnds(t0.routes);
  let best: { dist: number; a: End; b: End } | undefined, why: string | undefined;
  const byName = (rs: readonly DRoute[], n: string) => rs.find((r, i) => (r.name || String(i)) === n)!;
  if (onto) { const a = mine[0]; if (a) best = { dist: 0, a, b: onto }; }
  else for (const a of mine) for (const b of theirs) {
    const dist = Math.hypot(a.pose.x + free.dx - b.pose.x, a.pose.y + free.dy - b.pose.y);
    if (dist > reach || (best && dist >= best.dist)) continue;
    const theirs1 = byName(d.routes, b.route), mine1 = asAdded(d, t, byName(t0.routes, a.route)), problem = joinProblem(d, theirs1, mine1);
    // (dual-gauge track and its standard gauge carrying on alone: not one track, but their ends meet on the same middle: routeedits.ts gaugeMeet)
    if (problem && gaugeMeet(d, theirs1, mine1)?.off !== 0) { why = `can't join ${b.route}: ${problem}`; continue; }
    best = { dist, a, b };
  }
  if (!best) return { placement: free, ...(why && { why }) };
  const delta = norm180(best.b.pose.heading + 180 - best.a.pose.heading), q = rot([best.a.pose.x, best.a.pose.y], delta);
  return { placement: { turn: r3(norm180(turn + delta)), mirror, dx: r3(best.b.pose.x - q[0]), dy: r3(best.b.pose.y - q[1]) }, snapped: { design: best.b, template: best.a } };
}

/**
 * The template put into the design d as placed: its routes (their names kept where free, else made fresh), tables and hand edits
 * appended, a gauge unlike the design's kept on each added route. Not its settings (the design's stay). Returns the places of the
 * new routes and tables, and which of its settings differ from the design's (keys).
 */
export function addTemplate(d: Design, t: Design, p: Placement): { routes: number[]; tables: number[]; differing: string[] } {
  const tt = transformed(t, p), differing = differingOptions(d, t);
  const names = new Map<string, string>(), first = d.routes.length;
  const all = tt.routes.map((r, i) => r.name || String(i));
  for (const r of tt.routes) {
    const old = r.name || '';
    const keep = old && !d.routes.some((o) => o.name === old) ? old : freeName(d, 'R');
    names.set(old, keep);
    const added: DRoute = { ...asAdded(d, t, r), name: keep };
    delete added.locked;
    d.routes.push(added);
  }
  const edits = copyEdits(tt, all);
  pasteEdits(d, edits, names, 0, 0);
  const t0 = d.tables?.length ?? 0;
  const tabs: Table[] = (tt.tables ?? []).map((x) => { const c = structuredClone(x); delete c.locked; return c; });
  if (tabs.length) d.tables = [...(d.tables ?? []), ...tabs];
  return { routes: tt.routes.map((_, k) => first + k), tables: tabs.map((_, k) => t0 + k), differing };
}
