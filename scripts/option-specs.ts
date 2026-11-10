// Every setting's example: a design where it does something, the values to show (each choice; a number at its default
// and another; on and off), what to picture and from where. The settings' pictures are made from these
// (scripts/option-pictures.mts), and a test (settings.test.ts) builds each one, value by value, to check the setting
// changes what's built, isn't greyed out there, and has its help.
import { type Design, TEMPLATES } from '../src/app/design';

/** A built piece, as the pictures need it. */
export type P = { name: string; positions: Float32Array; lego?: { shop?: string }[] };
/** r: the camera's distance (mm, for close-ups); else dist: times the model's size (the whole model in view) */
export type Cam = { dir: string; r?: number; dist?: number; at?: (ps: P[]) => [number, number, number] };
export interface OptionSpec {
  key: string;
  /** the values, as the setting shows them (a length in studs where it's set in studs): each gets a picture */
  values: (string | number | boolean)[];
  /** the design (the setting set on it as the settings panel would); printed, not bought, unless it says */
  base: Design;
  /** only the pieces whose names match */
  pick?: RegExp;
  cam: Cam;
  /** each part after the first moved this far along y (mm; less than 0: back), so the joints between them show */
  explode?: number;
  /** each part after the first moved up this far (mm; less than 0: down), so a part sitting in another shows */
  lift?: number;
  tint?: (p: P, k: number) => string;
  /** (pictures) cut the view at a plane: through [x, y, z], what's on the normal's side taken away, to see inside */
  clip?: (ps: P[]) => [number, number, number, number, number, number];
  /** (pictures) heights stretched this many times: a rise of a few mm along a long track */
  zscale?: number;
  /** two values that build the same here, as they should (Auto picking one side) */
  alike?: [string, string];
  /** why the values build the same in every example found (a setting that does nothing yet): not checked, but listed */
  known?: string;
}

const st = (studs: number, more = {}) => ({ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight' as const, studs }], ...more });
const curve = [{ name: 'C', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve' as const, radius: 40, angle: 45 }] }];
const D = (routes: unknown[], options: Record<string, unknown> = {}, more: Record<string, unknown> = {}): Design => ({ version: 1, gaugeStuds: 4, routes, options: { printBedX: 500, printBedY: 500, legoTrack: 'print', ...options }, ...more } as Design);
const box = (ps: P[]) => { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (const p of ps) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p.positions[i + k]); b[k + 3] = Math.max(b[k + 3], p.positions[i + k]); } return b; };
const mid = (ps: P[]): [number, number, number] => { const b = box(ps); return [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]; };
// (a part's cut face, where it starts: its joint)
const faceOf = (ps: P[]): [number, number, number] => { const b = box(ps); return [0, b[1] + 4, 3]; };
// (the gap between the first two parts (the second, nearer, moved 24 mm back): both halves of the joint)
const cutGap = (ps: P[]): [number, number, number] => { const b = box([ps[0]]); return [(b[0] + b[3]) / 2, b[1] - 10, 2]; };
const sw = TEMPLATES['Left switch (LEGO)'].routes;
const toe: Cam = { dir: '1,-0.7,1.1', r: 190, at: () => [4, 44, 6] }, throwCam: Cam = { dir: '1.2,-0.6,1', r: 120, at: () => [34, 28, 8] };
const under: Cam = { dir: '0.6,-0.7,-1', dist: 2.0 }, whole: Cam = { dir: '1,-1.1,0.9', dist: 2.0 }, above: Cam = { dir: '0.15,-0.35,1', dist: 2.1 };
// (layouts that show what a setting does: a crossing for sleepers (its solid middle, sleepers on its arms), a curve
// between straights for where long track is cut and for anything that follows the track)
const cross = TEMPLATES['90° crossing'].routes, cross22 = TEMPLATES['22.5° crossing'].routes;
const bend = [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }, { kind: 'curve', radius: 40, angle: 90 }, { kind: 'straight', studs: 24 }] }];
const bankedLong = [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 96 }, { kind: 'curve', radius: 40, angle: 90, bank: 6 }, { kind: 'straight', studs: 96 }] }];
const banked = [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }, { kind: 'curve', radius: 40, angle: 90, bank: 6 }, { kind: 'straight', studs: 48 }] }];
const raised = [st(32, { monoHeight: 9 })];
const mono = (studs: number, more = {}) => st(studs, { system: 'monorail', ...more });
const bought = (p: P) => (!p.lego ? '4f78a8' : p.lego.some((l) => l.shop) ? 'a070d8' : '4caf50');
// (the points' close-up: at the toe; the tines' under the bed)
const tinesUnder: Cam = { dir: '0.8,-0.7,-1', r: 200, at: () => [4, 44, 0] };
// (close under a part, where its label is)
const underClose: Cam = { dir: '0.12,-0.2,-1', r: 120, at: (ps) => { const c = mid(ps); return [c[0], c[1], 0]; } };
// (a banked curve's ramp from the outside (its heights stretched 4 times): its outer rail rising, along the straight before the curve (n studs long))
const rampCam = (n: number): Cam => ({ dir: '1,-0.35,0.3', r: 560, at: () => [0, n * 8 - 120, 20] });
const frog: Cam = { dir: '0.7,-0.9,1.1', r: 150, at: (ps) => mid(ps) };
const label = { ballast: 'ballast', bottomStyle: 'float' };
// (each part its own colour; the axle holes' level in a buddy-layer track, mm)
const PARTS = ['6f7780', '8a5a44', '4f6f8f', '7a7f4f', '6f4f7f'], AXLE_Z = -0.6, MONO_AXLE_Z = 7;

export const SPECS: OptionSpec[] = [
  // Track
  { key: 'gaugeStuds', values: [4, 6], base: D([st(16)]), cam: whole },
  { key: 'sleepers', values: ['bed', 'sleepers'], base: D(cross), cam: { dir: '1,-0.8,1', dist: 2.0 } },
  { key: 'sleeperWidthStuds', values: ['2', '1'], base: D([st(16)], { sleepers: 'sleepers' }), cam: whole },
  { key: 'sleeperGapStuds', values: [2, 4], base: D([st(16)], { sleepers: 'sleepers' }), cam: whole },
  { key: 'raisedOn', values: ['printed', 'lego'], base: D(raised, { legoTrack: 'print' }), tint: bought, cam: { dir: '1,-0.9,0.5', dist: 1.9 } },
  { key: 'curveStuds', values: ['grid', 'follow'], base: D(curve, { sleepers: 'bed' }), cam: { dir: '0.25,-0.45,1', dist: 2.0 } },
  // Ballast
  { key: 'ballast', values: ['none', 'ballast', 'buddy'], base: D([st(16)]), cam: { dir: '1,-1.2,0.6', dist: 2.0 } },
  { key: 'trackBallast', values: ['together', 'apart'], base: D([st(16)], { ballast: 'ballast', legoTrack: 'print' }), lift: -14, cam: { dir: '1,-1.2,0.6', dist: 2.0 } },
  { key: 'trackFitTol', values: [0.2, 1], base: D([st(8)], { ballast: 'ballast', trackBallast: 'apart', legoTrack: 'print' }), clip: (ps) => { const b = box(ps); return [0, (b[1] + b[4]) / 2 + 4, 0, 0, -1, 0]; }, cam: { dir: '0.25,-1,0.35', r: 90, at: (ps) => { const b = box(ps); return [b[0] + 20, (b[1] + b[4]) / 2, 5]; } } },
  // Underside
  { key: 'bottomStyle', values: ['antistud', 'float'], base: D([st(16)], { ballast: 'ballast' }), cam: under },
  { key: 'undersideGrid', values: ['baseplate', 'track'], base: D([st(12, { heading: 17 })]), cam: { dir: '0.5,-0.6,-1', r: 230, at: (ps) => { const b = box(ps); return [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, 0]; } } },
  { key: 'grip', values: ['edges', 'all'], base: D([st(16)], { undersideGrid: 'baseplate', sleepers: 'bed' }), cam: under },
  // Switches: points
  { key: 'mechStyle', values: ['plates', 'tines'], base: D(sw), cam: toe },
  { key: 'pointBlades', values: ['2', '1'], base: D(sw), cam: toe },
  { key: 'bladeStyle', values: ['simple', 'prototype', 'sprung'], base: D(sw, { ballast: 'ballast' }), cam: toe },
  // (close on the blade's front, where the lip is, and its heel's pin in the distance)
  { key: 'bladeRelief', values: [false, true], base: D(sw, { bladeStyle: 'sprung' }), pick: /points/, clip: () => [0, 40, 0, 0, -1, 0], cam: { dir: '0.35,-1,0.45', r: 42, at: () => [-12, 40, 7] } },
  { key: 'bladeLip', values: ['pin', 'front'], base: D(sw, { bladeStyle: 'prototype' }), cam: { dir: '1,-1.1,1', r: 80, at: () => [-14, 22, 7] } },
  { key: 'pointThrow', values: [3, 6], base: D(sw), cam: { dir: '0.3,-0.5,1', r: 120, at: () => [0, 40, 6] } },
  { key: 'pointClearance', values: [0.3, 0.8], base: D(sw), cam: { dir: '0.3,-0.5,1', r: 90, at: () => [0, 36, 6] } },
  { key: 'springPreload', values: [0, 3], base: D(sw, { bladeStyle: 'sprung' }), cam: { dir: '0.3,-0.5,1', r: 120, at: () => [0, 40, 6] } },
  // Switches: tines mechanism
  { key: 'pointsPieces', values: ['1', '2'], base: D(sw, { mechStyle: 'tines' }), cam: tinesUnder },
  { key: 'pointsModule', values: ['built-in', 'layers'], base: D(sw, { mechStyle: 'tines', ballast: 'ballast' }), lift: 12, cam: { dir: '1,-0.8,0.8', dist: 1.6 } },
  { key: 'springThickness', values: [0.9, 2], base: D(sw, { mechStyle: 'tines' }), cam: tinesUnder },
  { key: 'springLength', values: [5, 8], base: D(sw, { mechStyle: 'tines' }), cam: tinesUnder },
  { key: 'bladeDiscD', values: [14, 22], base: D(sw, { mechStyle: 'tines' }), cam: tinesUnder },
  // Switches: throw
  { key: 'throwStyle', values: ['built-in', 'bracket', 'stand', 'nail'], base: D(sw), cam: throwCam },
  // (each lever set by hand how far along it is: its slider not moved along to clear the next set's, so each pair's meet)
  { key: 'threeWayLevers', values: ['1', '2'], base: D(TEMPLATES['Three-way switch (one throw)'].routes), cam: { dir: '0.25,-0.9,1.1', r: 210, at: () => [0, 40, 6] } },
  { key: 'boxedThrow', values: ['nail', 'slider'], base: D(TEMPLATES['Double slip (22.5°)'].routes, { pointBlades: 1 }, { trackwork: { throw: Object.fromEntries(Object.keys(TEMPLATES['Double slip (22.5°)'].trackwork!.throw!).map((k) => [k, { springLength: 40 }])) } }), cam: { dir: '0.15,-0.3,1', dist: 1.3 } },
  // (the snap clamp on the lever's arm, with the default sprung blades; from above the points, the lever beside them)
  { key: 'throwAction', values: ['detent', 'overcentre', 'snap'], base: D(sw), cam: { dir: '0.45,-0.75,1', r: 125, at: () => [16, 26, 6] } },
  { key: 'throwSide', values: ['auto', 'left', 'right'], base: D(sw), alike: ['auto', 'right'], cam: { dir: '0.2,-0.5,1', dist: 1.25 } },
  { key: 'leverOffset', values: [1, 3], base: D(sw), cam: { dir: '0.6,-0.5,1', r: 170, at: () => [30, 28, 6] } },
  { key: 'throwBallast', values: [false, true], base: D(sw, { ballast: 'ballast' }), cam: throwCam },
  // Check rails and flangeways (a crossing's: its check rails, and the flangeways through it)
  { key: 'checkRailLen', values: [3.75, 8], base: D(cross22), cam: frog },
  { key: 'checkRailW', values: [1, 3], base: D(cross22), cam: frog },
  { key: 'checkRailFlare', values: [1.5, 4], base: D(cross22), cam: frog },
  { key: 'flangeway', values: [3, 4], base: D(cross22), cam: frog },
  { key: 'flangewayDepth', values: [3, 6], base: D(cross22), clip: (ps) => { const c = mid(ps); return [c[0], c[1] + 2, 0, 0, -1, 0]; }, cam: { dir: '0.35,-1,0.45', r: 110, at: (ps) => mid(ps) } },
  // Banked curves (seen from the side: where the outer rail rises)
  { key: 'bankRampAt', values: ['straight', 'curve'], base: D(banked), tint: () => '6f7780', zscale: 4, cam: rampCam(48) },
  { key: 'bankRampStuds', values: [16, 40], base: D(banked, { bankClimb: 20 }), tint: () => '6f7780', zscale: 4, cam: rampCam(48) },
  { key: 'bankClimb', values: [100, 150], base: D(bankedLong, { bankRampStuds: 8 }), tint: () => '6f7780', zscale: 4, cam: rampCam(96) },
  // Buffer stops
  { key: 'bufferStyle', values: ['frame', 'blocks'], base: D([st(16, { endEnd: 'buffer' })], { ballast: 'ballast' }), cam: { dir: '0.9,-1,0.7', r: 150, at: () => [0, 116, 12] } },
  { key: 'bufferPostPlates', values: [8, 14], base: D([st(16, { endEnd: 'buffer' })], { ballast: 'ballast', bufferStyle: 'blocks' }), cam: { dir: '0.9,-1,0.5', r: 150, at: () => [0, 116, 14] } },
  { key: 'bufferBeamBottom', values: [2, 8], base: D([st(16, { endEnd: 'buffer' })], { ballast: 'ballast' }), cam: { dir: '1,-0.6,0.3', r: 140, at: () => [0, 116, 14] } },
  { key: 'bufferBeamTop', values: [12, 18], base: D([st(16, { endEnd: 'buffer' })], { ballast: 'ballast' }), cam: { dir: '1,-0.6,0.3', r: 140, at: () => [0, 116, 14] } },
  { key: 'bufferPinHoles', values: [true, false], base: D([st(16, { endEnd: 'buffer' })], { ballast: 'ballast', bufferStyle: 'blocks' }), cam: { dir: '1,-0.4,0.5', r: 110, at: () => [0, 116, 16] } },
  // Print bed and cutting into parts (each part its own colour)
  { key: 'printBedX', values: [256, 160], base: D(bend, { splitTrack: 'bed', printBedY: 160 }), cam: { dir: '0.1,-0.25,1', dist: 1.9 } },
  { key: 'printBedY', values: [256, 160], base: D(bend, { splitTrack: 'bed', printBedX: 160 }), cam: { dir: '0.1,-0.25,1', dist: 1.9 } },
  { key: 'splitTrack', values: ['bed', 'lengths'], base: D(bend, { printBedX: 200, printBedY: 200 }), cam: { dir: '0.15,-0.3,1', dist: 2.0 } },
  { key: 'pieceLengthStuds', values: [16, 8], base: D([st(48)], { legoTrack: 'print' }), explode: 12, cam: { dir: '1,-0.5,1', dist: 1.6 } },
  { key: 'baseplate', values: ['0', '16', '32', '48', '64', '96'], base: D(bend, { splitTrack: 'bed', baseplateX: 20, baseplateY: 20, printBedX: 1000, printBedY: 1000 }), cam: { dir: '0.1,-0.25,1', dist: 1.9 } },
  { key: 'baseplateX', values: [0, 8], base: D(bend, { splitTrack: 'bed', baseplate: 32 }), cam: { dir: '0.1,-0.25,1', dist: 1.9 } },
  { key: 'baseplateY', values: [0, 8], base: D(bend, { splitTrack: 'bed', baseplate: 32 }), cam: { dir: '0.1,-0.25,1', dist: 1.9 } },
  { key: 'studsAtCuts', values: ['off', 'whole', 'split'], base: D(curve, { splitTrack: 'bed', baseplate: 16, sleepers: 'bed', curveStuds: 'grid' }), explode: -10, cam: { dir: '0.2,-0.4,1', dist: 1.2 } },
  // Bought track (printed blue, LEGO's green, BrickTracks' purple, as the 3D view)
  { key: 'legoTrack', values: ['lego', 'lego-only', 'print'], base: D([{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'curve', radius: 104, angle: 11.25 }] },
    { name: 'S', x: 24, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'SB', x: 24, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -36.8699 }, { kind: 'curve', radius: 40, angle: 14.3699 }] },
    { name: 'R', x: 64, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'RB', x: 64, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: -22.5 }] }]),
  tint: bought, cam: { dir: '0.15,-0.35,1', dist: 2.2 } },
  { key: 'boughtBallast', values: ['each', 'together'], base: D(sw, { ballast: 'ballast', legoTrack: 'lego', printBedX: 180, printBedY: 180 }), explode: 10, tint: (p, k) => (p.lego ? '4caf50' : PARTS[k % PARTS.length]), cam: { dir: '0.2,-0.4,1', dist: 1.8 } },
  // Joints (two parts pulled apart at the cut)
  { key: 'joint', values: ['lego', 'dovetail', 'butt', 'flataxle', 'axle'], base: D([st(32), st(32, { name: 'B', x: 16 })], { ballast: 'buddy', printBedX: 160, printBedY: 160, splitTrack: 'bed', legoTrack: 'print' }), pick: /^track[12]$/, explode: -24, cam: { dir: '0.8,-0.6,1', r: 170, at: cutGap } },
  { key: 'axleStuds', values: [2, 4], base: D([st(32), st(32, { name: 'B', x: 16 })], { ballast: 'buddy', printBedX: 160, printBedY: 160, splitTrack: 'bed', legoTrack: 'print', joint: 'flataxle' }), pick: /^track[12]$/, explode: -24, clip: () => [0, 0, AXLE_Z, 0, 0, 1], cam: { dir: '0.3,-0.4,1', r: 150, at: cutGap } },
  { key: 'tongueRails', values: ['all', 'square'], base: D(cross22, { printBedX: 150, printBedY: 150 }), pick: /^track2$/, cam: { dir: '0.5,-1,0.8', r: 170, at: faceOf } },
  { key: 'endSupports', values: [true, false], base: D([st(32), st(32, { name: 'B', x: 16 })], { printBedX: 160, printBedY: 160, splitTrack: 'bed', legoTrack: 'print' }), pick: /^track[12]$/, explode: -24, cam: { dir: '0.8,-0.6,0.6', r: 130, at: cutGap } },
  { key: 'pegOnBallast', values: [false, true], base: D([st(32)], { ballast: 'ballast', legoTrack: 'print' }), explode: -24, cam: { dir: '0.8,-0.6,1', r: 150, at: cutGap } },
  { key: 'axleHoles', values: [false, true], base: D([st(32)], { ballast: 'buddy', legoTrack: 'print' }), explode: -24, cam: { dir: '0.8,-0.6,0.6', r: 150, at: cutGap } },
  // Labels (the flat underside, from below)
  { key: 'labelText', values: ['', 'YARD'], base: D([st(16)], { ...label, legoTrack: 'print' }), cam: underClose },
  { key: 'labelSize', values: [true, false], base: D([st(16)], { ...label, legoTrack: 'print', labelText: 'YARD' }), cam: underClose },
  { key: 'labelGauge', values: [false, true], base: D([st(16)], { ...label, legoTrack: 'print', labelText: 'YARD' }), cam: underClose },
  { key: 'labelParts', values: [true, false], base: D(bend, { ...label, splitTrack: 'bed', printBedX: 200, printBedY: 200, labelText: 'YARD' }), pick: /^track1$/, cam: underClose },
  // LEGO fit (close on a stud and the tubes underneath)
  { key: 'studFit', values: [0.18, 0.5], base: D([st(4)], { ballast: 'ballast', legoTrack: 'print', sleepers: 'bed' }), cam: { dir: '0.3,-1,0.6', r: 45, at: (ps) => { const b = box(ps); return [b[3] - 6, b[1] + 6, b[5] - 1]; } } },
  { key: 'antistudFit', values: [0.06, 0.4], base: D([st(4)], { ballast: 'ballast', legoTrack: 'print' }), cam: { dir: '0.3,-0.6,-1', r: 70, at: (ps) => mid(ps) } },
  // Monorail
  { key: 'monoEndStuds', values: ['side', 'top', 'none'], base: D([mono(8)]), cam: { dir: '1,-1,0.8', r: 100, at: () => [0, 4, 7] } },
  { key: 'monoAxleHoles', values: [true, false], base: D([mono(8)]), cam: { dir: '0.6,-1,0.4', r: 90, at: () => [0, 0, 7] } },
  { key: 'monoAxleLengthStuds', values: [2, 6], base: D([mono(8)]), clip: () => [0, 0, MONO_AXLE_Z, 0, 0, 1], cam: { dir: '0.3,-0.6,1', r: 90, at: () => [0, 10, 7] } },
  { key: 'monoHoleFit', values: [0.1, 0.5], base: D([mono(8)]), clip: () => [0, 0, MONO_AXLE_Z, 0, 0, 1], cam: { dir: '0.3,-0.6,1', r: 70, at: () => [0, 10, 7] } },
  { key: 'monoLegoAntistud', values: ['short', 'lego'], base: D([mono(8)]), cam: { dir: '0.5,-0.7,-1', r: 110, at: () => [0, 32, 0] } },
  { key: 'monoLabels', values: ['name', 'part', 'none'], base: D([mono(16)], { labelText: 'LOOP' }), cam: underClose },
  { key: 'monoSwitchTravel', values: [27, 36], base: D(TEMPLATES['Monorail switch (experimental)'].routes), cam: above },
  { key: 'monoSwitchFit', values: [0.3, 0.6], base: D(TEMPLATES['Monorail switch (experimental)'].routes), cam: above },
  { key: 'monoSupportStuds', values: [0, 16], base: D([mono(32)]), cam: { dir: '1,-0.9,0.5', dist: 1.9 } },
  { key: 'monoSupportBricks', values: [5, 10], base: D([mono(16)], { monoSupportStuds: 16 }), cam: { dir: '1,-0.9,0.4', dist: 1.9 } },
  { key: 'monoSupportPlates', values: [0, 2], base: D([mono(16)], { monoSupportStuds: 16 }), cam: { dir: '1,-0.9,0.4', dist: 1.9 } },
  { key: 'monoSupportBaseXStuds', values: [4, 8], base: D([mono(16)], { monoSupportStuds: 16 }), cam: { dir: '1,-0.9,0.6', dist: 1.9 } },
  { key: 'monoSupportBaseYStuds', values: [4, 8], base: D([mono(16)], { monoSupportStuds: 16 }), cam: { dir: '1,-0.9,0.6', dist: 1.9 } },
  { key: 'monoSupportAntistud', values: [true, false], base: D([mono(16)], { monoSupportStuds: 16 }), pick: /support/, cam: { dir: '0.7,-0.8,-0.7', dist: 1.6 } },
  { key: 'monoSupportBaseStuds', values: [true, false], base: D([mono(16)], { monoSupportStuds: 16 }), cam: { dir: '1,-0.9,0.6', dist: 1.9 } },
  { key: 'monoSupportSolid', values: [false, true], base: D([mono(16)], { monoSupportStuds: 16 }), cam: { dir: '1,-0.2,0.3', dist: 1.9 } },
];
