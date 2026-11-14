// The reference range's modular kits: a switch sold as a base (the points and the lever) and detachable sections that
// carry its tracks on, so one base serves several switches. Each template is the whole piece of trackwork, cut by hand
// (expert, cut paths) into the kit's parts, each where the parts library has that module's ends
// (test/templates-kits.test.ts). The R104 switch's and three-way's kits and the three-track crossover are in design.ts.
import type { Design, DRoute, Trackwork } from './design';

type Seg = DRoute['segs'][number];
const st = (studs: number): Seg => ({ kind: 'straight', studs });
const cv = (radius: number, angle: number): Seg => ({ kind: 'curve', radius, angle });
/** A route's segments mirrored, left for right. */
const mirrored = (segs: Seg[]): Seg[] => segs.map((g) => (g.kind === 'curve' ? { ...g, angle: -g.angle } : g));

/**
 * A compact R40 switch as its kit: the compact base (the first 16 studs: the points, the lever, the branch on to 22.5
 * degrees, 3 studs over) and the detachable section that carries both tracks on (straight and branch: their shapes
 * past the base). Cut across at 16 studs: square to the straight track, and across the branch square to the branch
 * from where its centre line crosses (Cut path ends square to a branch), as the kit's joint is (the kit's is at 22.5
 * degrees of the branch, 0.7 studs nearer the toe). The detachable section is one part, as the kit's. hand: 1 left, -1 right;
 * lever: on the branch's side, or the straight's (the kit's base with its ground throw outside); 3 studs in from the
 * toe end (the kit's is 3.5 in: the slider lies between the baseplate's studs, on a whole-stud line).
 * square: the cut across the branch square to it (Cut path ends square to a branch); else along the grid.
 */
function compactR40(hand: 1 | -1, straight: Seg[], branch: Seg[], lever: 'branch' | 'straight' = 'branch', square = true): Design {
  const side = (hand === 1) === (lever === 'branch') ? 'left' : 'right', flip = (segs: Seg[]) => (hand === 1 ? segs : mirrored(segs));
  return { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', ...(square && { pathSquare: true }) }, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: flip(straight) }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: flip(branch), throwSide: side }],
    // (the lever 7 studs from the track's centre line, 3 past the sleepers' ends, as the kit's base has it)
    trackwork: { throw: { '0,0': { leverOffset: 24 } } },
    expert: { cutPaths: [{ id: 'c1', pts: [[-10 * hand, 16], [6 * hand, 16]] }] } };
}
/** The compact R40 kits, each hand: the base with each of its detachable sections. */
const compactKits = (hand: 1 | -1): Record<string, Design> => {
  const h = hand === 1 ? 'left' : 'right';
  return {
    // (the standard straight section: the straight on to 32 studs, the branch to 33.75 degrees: the R40 switch)
    [`Switch R40 ${h}, compact base and standard section`]: compactR40(hand, [st(32)], [cv(40, 33.75)]),
    // (the short straight section: the straight on to 28 studs)
    [`Switch R40 ${h}, compact base and short section`]: compactR40(hand, [st(28)], [cv(40, 33.75)]),
    // (the rail yard section: the straight on to 28.84 studs; the base with its lever on the straight's side)
    [`Yard switch R40 ${h}, compact base and rail yard section`]: compactR40(hand, [st(28.844)], [cv(40, 33.75)], 'straight'),
    // (the curved 45-degree section: the straight track 6.63 studs on and then round R40 for 11.25 degrees, the branch to 33.75)
    [`Switch R40 ${h}, compact base and curved 45° section`]: compactR40(hand, [st(22.627417), cv(40, 11.25)], [cv(40, 33.75)]),
    // (the curved 90-degree section: the straight track round R40 for 22.5 degrees from the base's end, the branch on to 45)
    // (cut along the grid, not square to the branch: there the slanted cut left the detachable section's file with edges
    // shared by more than two triangles)
    [`Switch R40 ${h}, compact base and curved 90° section`]: compactR40(hand, [st(16), cv(40, 22.5)], [cv(40, 45)], 'branch', false),
  };
};

/** (degrees) The R104 crossovers' curves: 40 studs on and 8 over each. */
const CO = 22.619865;
/** The R104 double crossover's four sets of points and levers, as the R104 switch's base has them (design.ts r104Work): by each set's toe (mm). */
const coWork = (): Trackwork => { const keys = ['-64,0', '64,0', '-64,640', '64,640']; return { points: Object.fromEntries(keys.map((k) => [k, { toe: 16 }])), throw: Object.fromEntries(keys.map((k) => [k, { leverOffset: 24 }])) }; };

export const REF_KITS: Record<string, Design> = {
  ...compactKits(1), ...compactKits(-1),
  // (the R104 double crossover as its kit: two tracks 16 studs apart, 80 long, a crossover each way (two R104 curves
  // of 22.62 degrees each), crossing in the middle. Cut by hand (expert, cut paths) into the kit's parts: four bases
  // (each track's first and last 16 studs), four detach 1 sections (on to 28 and from 52, out to the line between the
  // tracks), four track terminators (the outer halves of the tracks from 28 to 52, cut along the tracks' centre lines
  // and across at 40) and the middle, from one centre line to the other. The kit's middle is two sections that meet
  // at 40, where the crossovers cross: a cut there would go through the crossing's frogs, so here it's one part)
  'Double crossover R104, bases and detachable modules': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths' }, routes: [
    { name: 'A', x: -8, y: 0, heading: 0, segs: [st(80)] }, { name: 'B', x: 8, y: 0, heading: 0, segs: [st(80)] },
    { name: 'A to B', x: -8, y: 0, heading: 0, segs: [cv(104, -CO), cv(104, CO)] }, { name: 'B to A', x: 8, y: 0, heading: 0, segs: [cv(104, CO), cv(104, -CO)] }],
    trackwork: coWork(),
    expert: { cutPaths: [{ id: 'c1', pts: [[-14, 16], [14, 16]] }, { id: 'c2', pts: [[-14, 28], [14, 28]] }, { id: 'c3', pts: [[-14, 52], [14, 52]] }, { id: 'c4', pts: [[-14, 64], [14, 64]] },
      { id: 'c5', pts: [[0, -1], [0, 28]] }, { id: 'c6', pts: [[0, 52], [0, 81]] }, { id: 'c7', pts: [[-8, 28], [-8, 52]] }, { id: 'c8', pts: [[8, 28], [8, 52]] },
      { id: 'c9', pts: [[-14, 40], [-8, 40]] }, { id: 'c10', pts: [[8, 40], [14, 40]] }] } },
};
