// The parts palette: bought track pieces (LEGO's and BrickTracks') to lay one at a time, each at the selected route's
// end (or as a new route), so a design comes out as those pieces exactly: the build finds them and lists them to buy.
import { type Design, type DSeg, endOf, freeName } from './design';

const sin = (d: number) => Math.sin((d * Math.PI) / 180), cos = (d: number) => Math.cos((d * Math.PI) / 180);
/** The short straight on BrickTracks' R104 switch's branch and their R104B curve, studs (boughtswitch.ts BT_LEAD). */
const LEAD = (8 - 104 * (1 - cos(22.5))) / sin(22.5);

/** A part in the palette: what it's called, its maker, and the track it is, as drawn from where it starts (turn: +1 left, -1 right). */
export interface PalettePart {
  id: string; name: string; maker: 'LEGO' | 'BrickTracks'; title: string;
  /** a curve: laid either way (the same piece turned round) */
  turns?: boolean;
  /** the track on from the end it's laid at */
  segs: (turn: number) => DSeg[];
  /** a switch: its branch, from the same start (the segs are its straight) */
  branch?: DSeg[];
}

const S = (studs: number): DSeg => ({ kind: 'straight', studs });
const C = (radius: number, angle: number): DSeg => ({ kind: 'curve', radius, angle });
const curve = (maker: 'LEGO' | 'BrickTracks', r: number, a: number, id: string): PalettePart =>
  ({ id, name: `R${r} curve`, maker, turns: true, title: `${maker === 'LEGO' ? 'LEGO\'s 53400' : `BrickTracks R${r}`}: radius ${r} studs, ${a}° a piece (${360 / a} make a circle)`, segs: (t) => [C(r, t * a)] });

export const PALETTE: PalettePart[] = [
  { id: 'lego-straight', name: 'Straight', maker: 'LEGO', title: 'LEGO\'s 53401: 16 studs', segs: () => [S(16)] },
  curve('LEGO', 40, 22.5, 'lego-r40'),
  { id: 'lego-switch-l', name: 'Left switch', maker: 'LEGO', title: 'LEGO\'s 53407: 32 studs on, the branch an R40 curve out to the left, 16 studs over with one more R40 curve', segs: () => [S(32)], branch: [C(40, 36.8699), C(40, -14.3699)] },
  { id: 'lego-switch-r', name: 'Right switch', maker: 'LEGO', title: 'LEGO\'s 53404: as the left one, to the right', segs: () => [S(32)], branch: [C(40, -36.8699), C(40, 14.3699)] },
  { id: 'bt-s08', name: '1/2 straight', maker: 'BrickTracks', title: 'BrickTracks S08: 8 studs', segs: () => [S(8)] },
  { id: 'bt-s04', name: '1/4 straight', maker: 'BrickTracks', title: 'BrickTracks S04: 4 studs', segs: () => [S(4)] },
  { id: 'bt-s01', name: '1/10 straight', maker: 'BrickTracks', title: 'BrickTracks S01: 1.6 studs', segs: () => [S(1.6)] },
  ...[56, 72, 88, 104, 120].map((r) => curve('BrickTracks', r, 11.25, `bt-r${r}`)),
  { id: 'bt-r104b', name: 'R104B siding curve', maker: 'BrickTracks', turns: true, title: `BrickTracks R104B (in their R104 switch kit): a ${+LEAD.toFixed(3)}-stud straight, then an R104 curve of 11.25°`, segs: (t) => [S(LEAD), C(104, t * 11.25)] },
  { id: 'bt-switch-l', name: 'R104 left switch', maker: 'BrickTracks', title: 'BrickTracks R104 switch: 40 studs on, the branch an R104 curve of 22.5° to the left, 8 studs over', segs: () => [S(40)], branch: [C(104, 22.5), S(LEAD)] },
  { id: 'bt-switch-r', name: 'R104 right switch', maker: 'BrickTracks', title: 'BrickTracks R104 switch: as the left one, to the right', segs: () => [S(40)], branch: [C(104, -22.5), S(LEAD)] },
];

/** Where a new route by itself starts: the origin, or below the routes there are (not on one of them: two routes on one another are the same track twice, which can't be built). */
export function freeStart(d: Design): { x: number; y: number; heading: number } {
  const rs = d.routes;
  return rs.length ? { x: Math.min(...rs.map((r) => r.x)), y: Math.round(Math.min(...rs.map((r) => r.y)) / 8) * 8 - 24, heading: 0 } : { x: 0, y: 0, heading: 0 };
}

/**
 * Lay a part: on from the end of route `at` (its segments added on; a switch's branch a new route from there), or, with
 * no route, as a new route (at the origin, or below the routes there are). Changes the design; returns the route to
 * lay the next part on (the one it continues), and the new routes' indices.
 */
export function placePart(d: Design, id: string, at: number | undefined, turn = 1): { next: number; added: number[] } {
  const p = PALETTE.find((q) => q.id === id);
  if (!p) throw new Error(`no part ${id}`);
  const segs = p.segs(turn), added: number[] = [];
  let start: { x: number; y: number; heading: number };
  if (at !== undefined && d.routes[at]) {
    start = endOf(d, at);
    d.routes[at].segs.push(...structuredClone(segs));
    // (its end is the part's now, not a buffer stop)
    delete d.routes[at].endEnd;
  } else {
    const rs = d.routes;
    start = freeStart(d);
    rs.push({ name: freeName(d, 'R'), ...start, segs: structuredClone(segs) });
    at = rs.length - 1; added.push(at);
  }
  if (p.branch) {
    d.routes.push({ name: freeName(d, 'R'), ...start, segs: structuredClone(p.branch) });
    added.push(d.routes.length - 1);
  }
  return { next: at, added };
}
