// BrickTracks' range, each part as it's bought: with the app's own settings a template comes out as that BrickTracks part in
// the parts list (purple in 3D), nothing printed but its ballast where ballast is on; with Bought track set to Printed,
// as a printed copy. The curves and short straights are the app's bought pieces (build.ts STD_CURVES, BT_STRAIGHTS); the
// R104B siding curve its short straight and an R104 curve (boughtswitch.ts BT_LEAD: worked out from the parts library's
// 40 x 8 switch, not measured from the part). (The R104 switches are in design.ts, as they were.)
// The R56 curve turns 22.5 degrees (16 to a circle: BrickTracks sell 8 as a half circle), the others 11.25.
// Where the parts library and the app differ: the library's R104A turnout curve fits R103.07 for
// 11.25 degrees and 0.09 studs straight (0.09 studs shorter than an R104 curve), a part the app doesn't know as bought,
// so its template prints.
import type { Design } from './design';

const curve = (radius: number, angle = 11.25): Design => ({ version: 1, gaugeStuds: 4, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius, angle }] }] });
const straight = (studs: number): Design => ({ version: 1, gaugeStuds: 4, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }] }] });
/** (the short straight on the R104 switch's branch and the R104B curve, studs: boughtswitch.ts BT_LEAD) */
const LEAD = (8 - 104 * (1 - Math.cos(Math.PI / 8))) / Math.sin(Math.PI / 8);

export const BRICKTRACKS_PARTS: Record<string, Design> = {
  'Curve R56 (BrickTracks)': curve(56, 22.5),
  'Curve R72 (BrickTracks)': curve(72),
  'Curve R88 (BrickTracks)': curve(88),
  'Curve R104 (BrickTracks)': curve(104),
  'Curve R120 (BrickTracks)': curve(120),
  'Curve R104B, siding (BrickTracks)': { version: 1, gaugeStuds: 4, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: LEAD }, { kind: 'curve', radius: 104, angle: 11.25 }] }] },
  'Curve R104A, turnout (BrickTracks)': { version: 1, gaugeStuds: 4, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 103.071719, angle: 11.25 }, { kind: 'straight', studs: 0.090261 }] }] },
  'Straight, 8 studs (BrickTracks S08)': straight(8),
  'Straight, 4 studs (BrickTracks S04)': straight(4),
  'Straight, 1.6 studs (BrickTracks S01)': straight(1.6),
};

/**
 * BrickTracks' sets as the parts library lays them out: the switch with the curves that make a siding 16 studs over.
 * (Not yet templates: the quarter-circle turnouts (the left one comes out as one printed switch of two long routes, not
 * the bought pieces; the right one uses the R104A curve) and the three- and four-track yards (their switches follow
 * each other too closely to be taken as bought pieces, and print, the sprung blades with no lip).)
 */
export const BRICKTRACKS_SETS: Record<string, Design> = {
  'Siding R104 left (BrickTracks)': { version: 1, gaugeStuds: 4, routes: [{ name: 'Track 1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Track 2', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 22.5 }, { kind: 'straight', studs: 0.218121 }, { kind: 'straight', studs: 0.218121 }, { kind: 'curve', radius: 104, angle: -11.25 }, { kind: 'curve', radius: 104, angle: -11.25 }] }] },
  'Siding R104 right (BrickTracks)': { version: 1, gaugeStuds: 4, routes: [{ name: 'Track 1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Track 2', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }, { kind: 'straight', studs: 0.218121 }, { kind: 'curve', radius: 104, angle: 11.25 }, { kind: 'straight', studs: 0.218121 }, { kind: 'curve', radius: 104, angle: 11.25 }] }] },
};
