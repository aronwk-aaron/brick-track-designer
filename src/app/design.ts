// The editor's document: routes in studs and degrees, as people enter them,
// and their conversion to the solver's routes in mm.
import type { Route, Segment } from '../route/route';
import { routeLength, routePose } from '../route/route';

export const STUD = 8;

export type DSeg =
  | { kind: 'straight'; studs: number }
  | { kind: 'curve'; radius: number; angle: number }; // radius in studs, angle signed (+ = left)

export interface DRoute { name: string; x: number; y: number; heading: number; segs: DSeg[] } // start in studs
export interface Design {
  version: 1; gaugeStuds: number; routes: DRoute[];
  /** Underside: hollow with anti-stud tubes at the edges and every 4 studs (default), or a square socket at every stud. */
  grip?: 'edges' | 'all';
  /** Switches' points: one part (both blades on one pivot) or two (each blade on its own, as the plate-style). */
  pointsPieces?: 1 | 2;
}

export function toRoutes(d: Design): Route[] {
  return d.routes.map((r, i) => ({
    id: r.name || String(i),
    start: [r.x * STUD, r.y * STUD, r.heading],
    segments: r.segs.map((sg): Segment => (sg.kind === 'straight'
      ? { kind: 'straight', length: sg.studs * STUD }
      : { kind: 'arc', radius: sg.radius * STUD, angle: sg.angle })),
  }));
}

/** The end pose of a route, in studs and degrees (to start another route there). */
export function endOf(d: Design, i: number): { x: number; y: number; heading: number } {
  const rt = toRoutes(d)[i];
  const p = routePose(rt, routeLength(rt));
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(p[0] / STUD), y: r(p[1] / STUD), heading: r(p[2]) };
}

const sin = (d: number) => Math.sin((d * Math.PI) / 180), cos = (d: number) => Math.cos((d * Math.PI) / 180);

/** Starting points for a design. */
export const TEMPLATES: Record<string, Design> = {
  '90° crossing': { version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: -8, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'B', x: 8, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 16 }] },
  ] },
  '22.5° crossing': { version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: -24, heading: 0, segs: [{ kind: 'straight', studs: 48 }] },
    { name: 'B', x: 24 * sin(22.5), y: -24 * cos(22.5), heading: 22.5, segs: [{ kind: 'straight', studs: 48 }] },
  ] },
  'Crossing on a curve': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Curve', x: 0, y: -12, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 30 }] },
    { name: 'B', x: 12, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 24 }] },
  ] },
  // Switches: LEGO's (R40, out to 36.87 degrees and back to 22.5, so one more
  // R40 curve makes a parallel track 16 studs over), a wye and a three-way.
  'Left switch (LEGO)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 36.8699 }, { kind: 'curve', radius: 40, angle: -14.3699 }] },
  ] },
  'Right switch (LEGO)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] },
    { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -36.8699 }, { kind: 'curve', radius: 40, angle: 14.3699 }] },
  ] },
  'Wye switch': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 16 }] },
    { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 16 }] },
  ] },
  'Three-way switch (one throw)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 28 }] },
    { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 14 }] },
    { name: 'Right', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 14 }] },
  ] },
  'Three-way switch (tandem, two throws)': { version: 1, gaugeStuds: 4, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 36 }] },
    { name: 'Left', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 23 }] },
    { name: 'Right', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 14 }] },
  ] },
};
