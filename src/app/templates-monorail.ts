// Monorail trackwork: the printed monorail ranges' pieces, one template each, as the app builds them (its own beam and
// square ends: what's matched is where each piece's ends are and which way they face). Two ranges are mirrored, named
// here only: (P) the printable set of LEGO-compatible monorail track (straights 1 to 32 studs, quarter curves R4 to
// R40, the 45 degree curves, diagonals, S-curves, crossings, ramps), and (S) monorail.store's range (straights 2 to 32,
// the 45 degree curves R28 and R44, S-curve, diagonal straight, ramps, switches, crossings). LEGO's own parts where they
// are the same piece: 2671 (straight, 32 studs), 2891 / 2892 (the short curve), 2677 + 2678 (the ramp).
// A piece that is the same turned round has one template (a plain arc); one whose mirror image is another part has
// both hands (the 45 degree curves, with their unequal straights; the S-curves; the 45 degree crossings).
// Not here, for the app can't build them yet (said in test/templates-monorail.test.ts, with why): the wider points
// (R44, the 8-stud parallel one, the Y and the three-way), the turning crossings, the diagonal 90 degree crossing (its piece clashes with its arms), the ramp's two halves singly and
// the straight ramp extensions, the tile track, the start-stop track, the diagonal switch adapters.
import type { Design, DRoute } from './design';

type Seg = DRoute['segs'][number];
const st = (studs: number): Seg => ({ kind: 'straight', studs });
const cv = (radius: number, angle: number): Seg => ({ kind: 'curve', radius, angle });
const mono = (segs: Seg[], more: Partial<DRoute> = {}): DRoute => ({ name: 'Beam', x: 0, y: 0, heading: 0, system: 'monorail', segs, ...more });
const one = (segs: Seg[], more: Partial<DRoute> = {}): Design => ({ version: 1, gaugeStuds: 4, routes: [mono(segs, more)] });

const S45 = Math.SQRT1_2;
/**
 * A 45 degree curve whose far end is `over` studs to the side and `on` studs on (whole studs, as the printed ones' and
 * LEGO's): a straight, an arc and a straight. lead: the straight at the square end (studs), from the print's rack;
 * the far straight is then lead - (on - over (1 + sqrt 2)), and the radius what's left. hand: 1 left, -1 right.
 */
export function curve45(over: number, on: number, lead: number, hand: 1 | -1): Seg[] {
  const tail = lead - (on - over * (1 + Math.SQRT2)), radius = (over - tail * S45) / (1 - S45);
  return [st(lead), cv(radius, 45 * hand), st(tail)];
}
/** An S-curve: `on` studs long, `over` to the side, two equal arcs (hand: 1 to the left, -1 to the right). */
export function sCurve(on: number, over: number, hand: 1 | -1): Seg[] {
  const a = 2 * Math.atan2(over, on), radius = on / (2 * Math.sin(a));
  return [cv(radius, (hand * a * 180) / Math.PI), cv(radius, (-hand * a * 180) / Math.PI)];
}

/** The straights, studs long: (P) 1, 2, 4, 8, 16 and the long one (32: LEGO's 2671); (S) 2, 3, 4, 8, 16, 32. */
export const MONO_STRAIGHTS = [1, 2, 3, 4, 8, 16, 32];
/** The diagonals: a straight at 45 degrees from one stud corner to another, this many studs over and on. (P) 4, 8, 16, 32; (S) 16. */
export const MONO_DIAGONALS = [4, 8, 16, 32];
/** The quarter curves' radii, studs (P): each a plain 90 degree arc, its ends R on and R over. */
export const MONO_QUARTERS = [4, 12, 20, 28, 36, 40];
/**
 * The 45 degree curves, named by the ranges for the corner two of them make (R28: 28 by 28 studs): the far end's place
 * (studs over, studs on) and the straight at the square end (studs).
 *  R28: LEGO's short curve 2891 / 2892; (P) "r28 split"; (S) "R28". Ends 8 over, 20 on (LDraw, the print, the planner).
 *  R44: (P) "R44 short curve"; (S) "R44". Ends 13 over, 31 on (the print's box, the planner).
 *  R52: (P) only. Ends 15 over, 37 on (the print's box: its stepped end isn't measured closer than that).
 * The straights are read off each print's rack to about a quarter stud; the ends are exact.
 */
export const MONO_CURVES_45: Record<string, { over: number; on: number; lead: number }> = {
  R28: { over: 8, on: 20, lead: 2.8873016 },
  R44: { over: 13, on: 31, lead: 3.6 },
  R52: { over: 15, on: 37, lead: 5.8 },
};

const PLAIN: Record<string, Design> = {};
for (const n of MONO_STRAIGHTS) PLAIN[`Monorail straight, ${n} stud${n === 1 ? '' : 's'}`] = one([st(n)]);
for (const n of MONO_DIAGONALS) PLAIN[`Monorail diagonal straight, ${n} studs over`] = one([st(n * Math.SQRT2)], { heading: 45 });
for (const r of MONO_QUARTERS) PLAIN[`Monorail quarter curve R${r}`] = one([cv(r, 90)]);
for (const [r, c] of Object.entries(MONO_CURVES_45)) for (const [hand, sg] of [['left', 1], ['right', -1]] as const)
  PLAIN[`Monorail curve ${r} ${hand} (45°)`] = one(curve45(c.over, c.on, c.lead, sg));
// (P) and (S): 32 studs long, 8 studs over
for (const [hand, sg] of [['left', 1], ['right', -1]] as const) PLAIN[`Monorail S-curve ${hand} (8 studs over)`] = one(sCurve(32, 8, sg));
export const MONO_PLAIN = PLAIN;

/**
 * Crossings (the app's level crossing: both beams fixed, the racks cut back in the middle, where (S)'s turn a disc).
 *  90 degrees: (P) "simple small crossing", 8 studs each way.
 *  (Left out: the diagonal 90 degree crossing, (P) "crossing diagonal 90 deg": its arms' stubs run into the crossing piece in
 *  the assembly check, a fault of the piece's size in monobuild.ts, not of the template.)
 *  45 degrees: (S), a through track 24 studs long and a diagonal across its middle, 16 studs over and on.
 */
export const MONO_CROSSINGS: Record<string, Design> = {
  'Monorail crossing, 90°': { version: 1, gaugeStuds: 4, routes: [mono([st(8)], { name: 'A', x: 0, y: -4 }), mono([st(8)], { name: 'B', x: 4, y: 0, heading: 90 })] },
  'Monorail crossing, 45° left': { version: 1, gaugeStuds: 4, routes: [mono([st(24)], { name: 'A', x: 0, y: -12 }), mono([st(16 * Math.SQRT2)], { name: 'B', x: 8, y: -8, heading: 45 })] },
  'Monorail crossing, 45° right': { version: 1, gaugeStuds: 4, routes: [mono([st(24)], { name: 'A', x: 0, y: -12 }), mono([st(16 * Math.SQRT2)], { name: 'B', x: -8, y: -8, heading: -45 })] },
};

/**
 * Ramps, each whole (the app eases a ramp from level to level, as the two parts together do; cut for the bed where
 * the lower and upper part meet).
 *  10 bricks up over 64 studs: LEGO's 2677 + 2678, (P) "ramp lower part" + "ramp upper part", (S) the 10-brick ramp: the
 *  template 'Monorail ramp (as LEGO\'s)' in design.ts (with its level approaches), listed in this group.
 *  5 bricks up over 48 studs: (S) the 5-brick ramp, two parts of 24 studs.
 */
export const MONO_RAMPS: Record<string, Design> = {
  'Monorail ramp, 5 bricks up': { version: 1, gaugeStuds: 4, options: { monoSupportStuds: 24 }, routes: [mono([st(48)], { name: 'Ramp', monoHeight: 0, monoHeightEnd: 15 })] },
};

export const MONO_TRACKWORK: Record<string, Design> = { ...MONO_PLAIN, ...MONO_CROSSINGS, ...MONO_RAMPS };
