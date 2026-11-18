// The reference range's modular kits: a switch sold as a base (the points and the lever) and detachable sections that
// carry its tracks on, so one base serves several switches. Each template is the whole piece of trackwork, cut into
// the kit's parts, each where the parts library has that module's ends (test/templates-kits.test.ts): the compact R40
// kits where their tracks are drawn joined (Cut where tracks join in trackwork), the others by hand (expert, cut paths). The R104 switch's and three-way's kits and the three-track crossover are in design.ts.
import type { Design, DRoute, Trackwork } from './design';

type Seg = DRoute['segs'][number];
const st = (studs: number): Seg => ({ kind: 'straight', studs });
const cv = (radius: number, angle: number): Seg => ({ kind: 'curve', radius, angle });
/** A route's segments mirrored, left for right. */
const mirrored = (segs: Seg[]): Seg[] => segs.map((g) => (g.kind === 'curve' ? { ...g, angle: -g.angle } : g));

/** (studs) Where the compact R40 base's branch ends: 22.5 degrees of R40 from the toe, 3.04 over and 15.31 on. */
const BASE40 = { x: 40 * (1 - Math.cos(Math.PI / 8)), y: 40 * Math.sin(Math.PI / 8) };
/**
 * A compact R40 switch as its kit: the compact base (the points, the lever, the straight's first 16 studs and the
 * branch on to 22.5 degrees, 3 studs over) and the detachable section that carries both tracks on (straight and
 * branch: their shapes past the base). Drawn as the kit is made: the base's two tracks, and the section's two joined
 * onto their ends; cut where they join (Cut where tracks join in trackwork, jointcuts.ts: none is drawn), each track
 * square across at its own joint, the two lines meeting between the tracks, as the kit's two ends are. The
 * detachable section is one part, as the kit's. hand: 1 left, -1 right;
 * lever: on the branch's side, or the straight's (the kit's base with its ground throw outside); 3 studs in from the
 * toe end (the kit's is 3.5 in: the slider lies between the baseplate's studs, on a whole-stud line).
 * straight, branch: the section's two tracks, from the base's ends on.
 */
function compactR40(hand: 1 | -1, straight: Seg[], branch: Seg[], lever: 'branch' | 'straight' = 'branch'): Design {
  const side = (hand === 1) === (lever === 'branch') ? 'left' : 'right', flip = (segs: Seg[]) => (hand === 1 ? segs : mirrored(segs));
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', jointCuts: true }, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [st(16)] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: flip([cv(40, 22.5)]), throwSide: side },
    { name: 'Section straight', x: 0, y: 16, heading: 0, segs: flip(straight) }, { name: 'Section branch', x: r6(-BASE40.x * hand), y: r6(BASE40.y), heading: 22.5 * hand, segs: flip(branch) }],
    // (the lever 7 studs from the track's centre line, 3 past the sleepers' ends, as the kit's base has it)
    trackwork: { throw: { '0,0': { leverOffset: 24 } } } };
}
/** The compact R40 kits, each hand: the base with each of its detachable sections. */
const compactKits = (hand: 1 | -1): Record<string, Design> => {
  const h = hand === 1 ? 'left' : 'right';
  return {
    // (the standard straight section: the straight on to 32 studs, the branch to 33.75 degrees: the R40 switch)
    [`Switch R40 ${h}, compact base and standard section`]: compactR40(hand, [st(16)], [cv(40, 11.25)]),
    // (the short straight section: the straight on to 28 studs)
    [`Switch R40 ${h}, compact base and short section`]: compactR40(hand, [st(12)], [cv(40, 11.25)]),
    // (the rail yard section: the straight on to 28.84 studs; the base with its lever on the straight's side)
    [`Yard switch R40 ${h}, compact base and rail yard section`]: compactR40(hand, [st(12.844)], [cv(40, 11.25)], 'straight'),
    // (the curved 45-degree section: the straight track 6.63 studs on and then round R40 for 11.25 degrees, the branch to 33.75)
    [`Switch R40 ${h}, compact base and curved 45° section`]: compactR40(hand, [st(6.627417), cv(40, 11.25)], [cv(40, 11.25)]),
    // (the curved 90-degree section: the straight track round R40 for 22.5 degrees from the base's end, the branch on to 45)
    [`Switch R40 ${h}, compact base and curved 90° section`]: compactR40(hand, [cv(40, 22.5)], [cv(40, 22.5)]),
  };
};

/**
 * The compact R40 kit's perpendicular section, with the base before it and the curved 90-degree section after: three
 * tracks off one, each an R40 curve from its own toe, 16 studs apart (the 'perpendicular turnout': the tracks end square
 * to the one they left, 16 studs apart). The perpendicular section is 16 studs of the straight with the base's branch
 * carried on through it (from 22.5 to 39.375 degrees) and a second set of points of its own at its start: the same
 * base again (a branch to 22.5 degrees, 3 studs over, at its far end), for the next section. Drawn as the kit is made
 * and cut where its pieces join (Cut where tracks join in trackwork): the base's two joints, the straight's at the
 * second points' toe; and the section's two, as any compact kit's.
 * The second points have one moving blade, the outer one (the kit's: its plate lies between the first branch's rail
 * and the far rail; with two, the near blade would lie on the first branch's rail, which crosses the straight's near
 * rail 4 studs past their toe). Both levers on the straight's side (the kit's base with its ground throw outside).
 * set: the whole 3T set, each track carried on round to 90 degrees (the first by the kit's 5.625-degree piece and two
 * R40 22.5-degree curves, the second by two, the third by three: templates-ref-joints.ts); else the three kit pieces alone.
 */
export function perpendicularR40(hand: 1 | -1, set: boolean): Design {
  const flip = (segs: Seg[]) => (hand === 1 ? segs : mirrored(segs)), r6 = (v: number) => Math.round(v * 1e6) / 1e6, side = hand === 1 ? 'right' : 'left';
  /** A piece of one of the three R40 curves: from a degrees round it to b, the curve's toe y0 studs up the straight. */
  const arc = (name: string, y0: number, a: number, b: number, more: Partial<DRoute> = {}): DRoute => ({ name, x: r6(-40 * (1 - Math.cos((a * Math.PI) / 180)) * hand), y: r6(y0 + 40 * Math.sin((a * Math.PI) / 180)), heading: a * hand, segs: flip([cv(40, b - a)]), ...more });
  return { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'lengths', jointCuts: true }, routes: [
    { name: 'Straight', x: 0, y: 0, heading: 0, segs: [st(16)] }, arc('Branch', 0, 0, 22.5, { throwSide: side }),
    { name: 'Section straight', x: 0, y: 16, heading: 0, segs: [st(16)] }, arc('Section branch', 0, 22.5, 39.375), arc('Section second branch', 16, 0, 22.5, { throwSide: side }),
    arc('Curved section straight', 32, 0, 22.5), arc('Curved section branch', 16, 22.5, 45),
    // (the set's plain curves, each its own piece: the first track's 5.625-degree piece and two R40 22.5-degree curves, the second's two, the third's three)
    ...(set ? [arc('Track 1 curve 1', 0, 39.375, 45), arc('Track 1 curve 2', 0, 45, 67.5), arc('Track 1 curve 3', 0, 67.5, 90), arc('Track 2 curve 1', 16, 45, 67.5), arc('Track 2 curve 2', 16, 67.5, 90),
      arc('Track 3 curve 1', 32, 22.5, 45), arc('Track 3 curve 2', 32, 45, 67.5), arc('Track 3 curve 3', 32, 67.5, 90)] : [])],
    // (each lever 7 studs from the track's centre line, as the kit's base has it; the second points by their toe, 16 studs on)
    trackwork: { throw: { '0,0': { leverOffset: 24 }, '0,128': { leverOffset: 24 } }, points: { '0,128': { blades: 1, single: 'curved' } } } };
}

/** (degrees) The R104 crossovers' curves: 40 studs on and 8 over each. */
const CO = 22.619865;
/** The R104 double crossover's four sets of points and levers, as the R104 switch's base has them (design.ts r104Work): by each set's toe (mm). */
const coWork = (): Trackwork => { const keys = ['-64,0', '64,0', '-64,640', '64,640']; return { points: Object.fromEntries(keys.map((k) => [k, { toe: 16 }])), throw: Object.fromEntries(keys.map((k) => [k, { leverOffset: 24 }])) }; };

export const REF_KITS: Record<string, Design> = {
  ...compactKits(1), ...compactKits(-1),
  'Switch R40 left, compact base, perpendicular section and curved 90° section': perpendicularR40(1, false),
  'Switch R40 right, compact base, perpendicular section and curved 90° section': perpendicularR40(-1, false),
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
