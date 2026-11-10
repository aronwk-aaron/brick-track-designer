// The reference range's plain track: every straight and curve it has, each as the part is (its ends where the parts
// library has them, studs and degrees: the curve between them fitted to those ends, said over each). All printed, none
// bought. A part that's another turned round or mirrored has no template of its own; nor the R40 pass-through
// connector (4.2 studs long, turning 11.25 degrees: its ends in the library need an R19 curve, under the app's 24-stud minimum) and
// the narrow-gauge curve made for the 45-degree dual gauge crossing (33.75 degrees in 9.4 studs: R14.7). (Four of the shortest are on a solid
// bed: on sleepers their length leaves part of a sleeper at an end joined to nothing, and the piece came out in two or three.)
import type { Design } from './design';

export const REF1_PLAIN: Record<string, Design> = {
  // (1 studs straight)
  'Straight, 1 stud': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed', sleepers: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 1 }] }] },
  // (1.33 studs straight)
  'Straight, 1.33 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 1.333333 }] }] },
  // (1.37 studs straight)
  'Straight, 1.37 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 1.372583 }] }] },
  // (1.6 studs straight)
  'Straight, 1.6 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 1.6 }] }] },
  // (1.81 studs straight)
  'Straight, 1.81 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 1.810015 }] }] },
  // (2 studs straight)
  'Straight, 2 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 2 }] }] },
  // (3 studs straight)
  'Straight, 3 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed', sleepers: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 3 }] }] },
  // (4 studs straight)
  'Straight, 4 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 4 }] }] },
  // (4.36 studs straight)
  'Straight, 4.36 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 4.355661 }] }] },
  // (8 studs straight)
  'Straight, 8 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }] }] },
  // (16 studs straight)
  'Straight, 16 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] },
  // (32 studs straight)
  'Straight, 32 studs': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }] },
  // (R24 for 22.5 degrees)
  'Curve R24, 22.5°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 24, angle: 22.5 }] }] },
  // (R32 for 22.5 degrees)
  'Curve R32, 22.5°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 32, angle: 22.5 }] }] },
  // (R40 for 5.62 degrees)
  'Curve R40, 5.62°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed', sleepers: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 5.625 }] }] },
  // (R40 for 11.25 degrees)
  'Curve R40, 11.25°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 11.25 }] }] },
  // (R40 for 22.5 degrees)
  'Curve R40, 22.5°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }] },
  // (R56 for 11.25 degrees)
  'Curve R56, 11.25°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: 11.25 }] }] },
  // (R56 for 22.5 degrees)
  'Curve R56, 22.5°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: 22.5 }] }] },
  // (R72 for 5.62 degrees)
  'Curve R72, 5.62°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 72, angle: 5.625 }] }] },
  // (R72 for 11.25 degrees)
  'Curve R72, 11.25°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 72, angle: 11.25 }] }] },
  // (R88 for 5.62 degrees)
  'Curve R88, 5.62°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 88, angle: 5.625 }] }] },
  // (R88 for 11.25 degrees)
  'Curve R88, 11.25°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 88, angle: 11.25 }] }] },
  // (R104 for 5.62 degrees)
  'Curve R104, 5.62°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 5.625 }] }] },
  // (R104 for 11.25 degrees)
  'Curve R104, 11.25°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 11.25 }] }] },
  // (R120 for 1.88 degrees)
  'Curve R120, 1.88°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed', sleepers: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 120, angle: 1.875 }] }] },
  // (R120 for 3.75 degrees)
  'Curve R120, 3.75°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 120, angle: 3.75 }] }] },
  // (R120 for 5.62 degrees)
  'Curve R120, 5.62°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 120, angle: 5.625 }] }] },
  // (R120 for 11.25 degrees)
  'Curve R120, 11.25°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 120, angle: 11.25 }] }] },
  // (R136 for 5.62 degrees)
  'Curve R136, 5.62°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 136, angle: 5.625 }] }] },
  // (R148 for 3.58 degrees)
  'Curve R148, 3.58°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 148, angle: 3.575356 }] }] },
  // (R148 for 5.62 degrees)
  'Curve R148, 5.62°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 148, angle: 5.625 }] }] },
  // (R148 for 7.67 degrees)
  'Curve R148, 7.67°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 148, angle: 7.674644 }] }] },
  // (R152 for 5.62 degrees)
  'Curve R152, 5.62°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 152, angle: 5.625 }] }] },
  // (R168 for 5.62 degrees)
  'Curve R168, 5.62°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 168, angle: 5.625 }] }] },
  // (R184 for 5.62 degrees)
  'Curve R184, 5.62°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 184, angle: 5.625 }] }] },
  // (R34 for 28.07 degrees)
  'Curve R34, 28.07°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 34, angle: 28.072487 }] }] },
  // (R65 for 14.25 degrees)
  'Curve R65, 14.25°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 65, angle: 14.25 }] }] },
  // (R51 for 9.36 degrees)
  'Curve R51, 9.36°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 51, angle: 9.357496 }] }] },
  // (R50 for 15.95 degrees)
  'Curve R50, 15.95°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 50, angle: 15.945396 }] }] },
  // (R56 for 13.11 degrees)
  'Curve R56, 13.11°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 56, angle: 13.109208 }] }] },
  // (R63.77 for 14.06 degrees)
  'Curve R63.8, 14.06°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 63.766744, angle: 14.0625 }] }] },
  // (0.22 studs straight, then R104 for 6.75 degrees)
  'Curve R104, 6.75° with 0.22 studs straight': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 0.225 }, { kind: 'curve', radius: 104, angle: 6.75 }] }] },
  // (0.03 studs straight, then R116.39 for 7.34 degrees)
  'Curve R116.4, 7.34° with 0.03 studs straight': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 0.032764 }, { kind: 'curve', radius: 116.393616, angle: 7.338 }] }] },
  // (R90.04 for 8.41 degrees)
  'Curve R90, 8.41°': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 90.04, angle: 8.412 }] }] },
  // (R67.36 for 1.88 degrees, then 5.06 studs straight)
  'Curve R67.4, 1.88° with 5.06 studs straight': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 67.356837, angle: 1.875 }, { kind: 'straight', studs: 5.056838 }] }] },
  // (R104 for 11.25 degrees, then 0.22 studs straight)
  'Curve R104, 11.25° with 0.22 studs straight, on ballast': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed', ballast: 'ballast' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 104, angle: 11.25 }, { kind: 'straight', studs: 0.219883 }] }] },
  // (2 studs straight)
  'Narrow-gauge straight, 2 studs': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 2 }] }] },
  // (4 studs straight)
  'Narrow-gauge straight, 4 studs': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 4 }] }] },
  // (8 studs straight)
  'Narrow-gauge straight, 8 studs': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }] }] },
  // (16 studs straight)
  'Narrow-gauge straight, 16 studs': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] },
  // (R24 for 22.5 degrees)
  'Narrow-gauge curve R24, 22.5°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 24, angle: 22.5 }] }] },
  // (R36 for 11.25 degrees)
  'Narrow-gauge curve R36, 11.25°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 36, angle: 11.25 }] }] },
  // (R36 for 22.5 degrees)
  'Narrow-gauge curve R36, 22.5°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 36, angle: 22.5 }] }] },
  // (R48 for 6.73 degrees)
  'Narrow-gauge curve R48, 6.73°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 48, angle: 6.732848 }] }] },
  // (R48 for 11.25 degrees)
  'Narrow-gauge curve R48, 11.25°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 48, angle: 11.25 }] }] },
  // (R64.94 for 7.88 degrees)
  'Narrow-gauge curve R64.9, 7.88°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 64.944042, angle: 7.883576 }] }] },
  // (R72 for 11.25 degrees)
  'Narrow-gauge curve R72, 11.25°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 72, angle: 11.25 }] }] },
  // (R84 for 11.25 degrees)
  'Narrow-gauge curve R84, 11.25°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 84, angle: 11.25 }] }] },
  // (R96 for 11.25 degrees)
  'Narrow-gauge curve R96, 11.25°': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 96, angle: 11.25 }] }] },
  // (3.42 studs straight, then R65.36 for 11.25 degrees)
  'Narrow-gauge curve R65.4, 11.25° with 3.42 studs straight, on ballast': { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', splitTrack: 'bed', ballast: 'ballast' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 3.417145 }, { kind: 'curve', radius: 65.359154, angle: 11.25 }] }] },
  // (16 studs straight)
  'Dual gauge straight, 16 studs, narrow gauge at the side': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, dualGauge: true, segs: [{ kind: 'straight', studs: 16 }] }] },
  // (16 studs straight)
  'Dual gauge straight, 16 studs, narrow gauge centred': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, dualGauge: true, dualShared: 'centre', segs: [{ kind: 'straight', studs: 16 }] }] },
  // (R40 for 22.5 degrees)
  'Dual gauge curve R40, 22.5°, narrow gauge inside': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, dualGauge: true, dualShared: 'left', segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }] },
  // (R40 for 22.5 degrees)
  'Dual gauge curve R40, 22.5°, narrow gauge outside': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, dualGauge: true, dualShared: 'right', segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }] },
  // (R40 for 22.5 degrees)
  'Dual gauge curve R40, 22.5°, narrow gauge centred': { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed' }, routes: [{ name: 'Track', x: 0, y: 0, heading: 0, dualGauge: true, dualShared: 'centre', segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }] },
};
