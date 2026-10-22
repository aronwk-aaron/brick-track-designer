// LEGO monorail track (monorail_lib.scad, monorail_straight.scad,
// monorail_curve.scad, monorail_support.scad, ported): the 4-stud beam with
// its central ridge, the rack teeth on both flanks of the ridge, and the end
// faces (alignment tab and notch, Technic axle holes, anti-studs, side or top
// studs) that join pieces as LEGO's do; and the support columns.
//
// Units: mm. A piece is the beam swept along a route (any straights and
// curves), its ends' features placed in each end's frame: the track's centre
// line on x = 0, the piece's body at +y from the end at y = 0 (as the .scad
// files' end_cuts / end_adds); z = 0 is the bottom of the beam.
import type { Wasm } from './kernel';
import { M, R, T, type CS, type Man, type Scad, type Vec2 } from './scad';
import { arcSegments, sweepRoute } from './sweep';
import { routeLength, routePose, segLength, segStarts, type Pose, type Route } from '../route/route';

/** The monorail settings (monorail_lib.scad's Details). */
export interface MonoOptions {
  /** Studs at the ends: side (out of the sides, for the supports), top (in recesses beside the ridge), or none. */
  endStuds: 'side' | 'top' | 'none';
  /** Technic axle holes in the end faces. */
  axleHoles: boolean;
  /** LEGO's 4 mm deep anti-studs (2.2 otherwise). */
  legoAntistud: boolean;
  /** The joining axles' length, studs (each end's hole takes half). */
  axleLengthStuds: number;
  /** Fit tolerance added to the axle holes and anti-studs, mm. */
  holeFit: number;
}
export const MONO_DEFAULTS: MonoOptions = { endStuds: 'side', axleHoles: true, legoAntistud: false, axleLengthStuds: 2, holeFit: 0.1 };

/** monorail_lib.scad's [Hidden] numbers. */
export const MONO = {
  stud: 8,
  beamHw: 15.9,   // beam half-width (LEGO: 31.8, 4 studs wide)
  endHw: 12.8,    // narrower at the ends (25.6), where the side studs are
  endLen: 16,     // length of each narrow end
  beamTop: 10,    // top of the beam, where the wheels run
  ridgeHw: 3.2,   // rack ridge half-width (6.4 wide)
  ridgeTop: 13.2, // top of the ridge
  chamfer: 0.6,   // on the narrow ends' top edges
  rackPitch: 1.6,
  rackRoot: 1.8,  // half-width of the ridge at the bottom of a gap
  rackPhase: 1.55, // first gap's centre from the start (as LEGO's)
  axleIn: 4, axleY: 4,
  tabX: [8.35, 11.05] as Vec2, tabOut: 0.5,
  notchX: [-11.35, -8.05] as Vec2, notchIn: 0.8,
  pinZ: 6, pinIns: [4, 12],
  endGap: 0.1,
  fn: 32,
};

const rad = (d: number) => (d * Math.PI) / 180;

/** A rack gap: where it is along the route (s, centre line), and on which flank (+1 right, -1 left). */
export interface RackGap { s: number; side: 1 | -1 }

/**
 * The rack's gaps along a route, both flanks: each flank's gaps every pitch
 * along that flank's own length (on a curve the outer flank is longer, as
 * monorail_curve.scad spaces them), the first rack_phase from the start.
 * A closed loop: each flank's pitch stretched (or squeezed) a hair so a
 * whole number of teeth go round, so they're in step everywhere.
 */
export function rackGaps(rt: Route, closed = false): RackGap[] {
  const out: RackGap[] = [];
  const segs = rt.segments, st = segStarts(rt);
  for (const side of [1, -1] as const) {
    const o = side * MONO.ridgeHw;
    // (each segment's flank length per mm of centre line)
    const k = segs.map((sg) => (sg.kind === 'straight' ? 1 : 1 + (o * Math.sign(sg.angle)) / sg.radius));
    const fl = segs.map((sg, i) => segLength(sg) * k[i]), Lf = fl.reduce((a, b) => a + b, 0);
    const pitch = closed ? Lf / Math.max(1, Math.round(Lf / MONO.rackPitch)) : MONO.rackPitch;
    const n = closed ? Math.round(Lf / pitch) : Math.floor((Lf - MONO.rackPhase) / pitch) + 1;
    let i = 0, f0 = 0;
    for (let j = 0; j < n; j++) {
      const f = MONO.rackPhase + j * pitch;
      while (i < segs.length - 1 && f > f0 + fl[i]) { f0 += fl[i]; i++; }
      out.push({ s: st[i] + (f - f0) / k[i], side });
    }
  }
  return out.sort((a, b) => a.s - b.s || a.side - b.side);
}

/** A pose's frame: local (x right, y ahead) to the design's x, y. */
export const frameAt = (P: Pose) => {
  const c = Math.cos(rad(P[2])), s = Math.sin(rad(P[2]));
  return (q: Vec2): Vec2 => [P[0] + q[0] * c - q[1] * s, P[1] + q[0] * s + q[1] * c];
};
/** A solid made in a pose's frame, placed there. */
export const placeAt = (m: Man, P: Pose) => T(R(m, [0, 0, P[2]]), [P[0], P[1], 0]);

export class Mono {
  readonly antistudDepth: number; readonly axleX: number; readonly axleZ: number;
  readonly endsHw: number; readonly endsCh: number;
  constructor(readonly s: Scad, readonly o: MonoOptions = MONO_DEFAULTS) {
    this.antistudDepth = o.legoAntistud ? 4 : 2.2;
    // Axle holes: 4.5 either side over the anti-studs; with LEGO's deep anti-studs
    // 8 out just above them on side-stud pieces, 12 out under the recesses else.
    this.axleX = !o.legoAntistud ? 4.5 : o.endStuds === 'side' ? 8 : 12;
    this.axleZ = !o.legoAntistud ? 5.6 : o.endStuds === 'side' ? 6.7 : MONO.beamTop - 3.2 - 1 - (4.8 + 2 * o.holeFit) / 2;
    this.endsHw = o.endStuds === 'side' ? MONO.endHw : MONO.beamHw;
    this.endsCh = o.endStuds === 'side' ? MONO.chamfer : 0;
  }
  get w(): Wasm { return this.s.w; }

  /** beam_2d without the ridge: the cross-section (x across, y up), half-width hw, top edges chamfered ch. */
  beam2d(hw = MONO.beamHw, ch = 0): CS {
    const t = MONO.beamTop;
    return this.s.polygon(ch > 0 ? [[-hw, 0], [hw, 0], [hw, t - ch], [hw - ch, t], [-hw + ch, t], [-hw, t - ch]] : [[-hw, 0], [hw, 0], [hw, t], [-hw, t]]);
  }
  /** tooth_gap_2d on the +x flank (or mirrored, side -1), centred on y = 0, in plan. */
  gapPts(side: 1 | -1): Vec2[] {
    const r = MONO.rackRoot, e = MONO.ridgeHw + 0.01;
    return ([[r, -0.25], [r, 0.25], [e, 0.6], [e, -0.6]] as Vec2[]).map(([x, y]) => [side * x, y]);
  }
  /** An anti-stud from below: square, with a small grip bump in the middle of each side. */
  antistud(): Man {
    const h = 5.6 / 2 + this.o.holeFit;
    let cs = this.s.square([2 * h, 2 * h], true);
    for (const a of [0, 90, 180, 270]) cs = cs.subtract(this.s.square([0.31, 0.8]).translate([h - 0.3, -0.4]).rotate(a));
    return T(cs.extrude(this.antistudDepth + 1), [0, 0, -1]);
  }
  /** A Technic axle's cross hole into the end face (along +y from y = -1), half an axle deep and a little. */
  axleHole(): Man {
    const w = 4.8 + 2 * this.o.holeFit, t = 1.8 + 2 * this.o.holeFit, d = (this.o.axleLengthStuds * MONO.stud) / 2 + 0.5;
    return T(this.s.union([this.s.cube([w, d + 1, t], true), this.s.cube([t, d + 1, w], true)]), [0, (d - 1) / 2, 0]);
  }
  /**
   * Hollow studs out of both sides of a narrow end, at y = 0. (Each 2 mm
   * longer into the beam than the .scad's, inside it on a straight: on the
   * outside of a curve the beam's side bends away from a stud 12 mm in, and
   * the .scad's left it floating a little off it.)
   */
  sideStudsPair(): Man {
    const s = this.s, d = 2;
    return s.union([-1, 1].map((sg) => T(R(s.difference(T(s.cylinder(1.8 + 0.01 + d, 2.4, 2.4, MONO.fn), [0, 0, -d]), [T(s.cylinder(2, 1.6, 1.6, MONO.fn), [0, 0, -0.01])]), [0, sg * 90, 0]),
      [sg * (MONO.endHw - 0.01), 0, MONO.pinZ])));
  }
  /** Top studs: a recess a plate deep either side of the ridge at the end, two studs in its floor. */
  topRecessCut(): Man {
    const s = this.s, f = 0.1;
    return s.union([-1, 1].map((sg) => T(s.difference(T(s.cube([8 + 2 * f, 17 + f, 5]), [-4 - f, -1, MONO.beamTop - 3.2]),
      [4, 12].map((y) => T(s.cylinder(1.8 + 0.01, (4.8 + 0.18) / 2, (4.8 + 0.18) / 2, MONO.fn), [0, y, MONO.beamTop - 3.2 - 0.01]))), [sg * 12, 0, 0])));
  }
  endTab(): Man {
    return T(this.s.cube([MONO.tabX[1] - MONO.tabX[0], MONO.tabOut + 1, MONO.beamTop]), [MONO.tabX[0], -MONO.tabOut, 0]);
  }
  /** end_cuts: the anti-studs, the axle holes, the top recesses, the end's gap (keeping the tab) and the notch. */
  endCuts(): Man {
    const s = this.s, parts: Man[] = [];
    for (const sg of [-1, 1]) parts.push(T(this.antistud(), [sg * MONO.axleY, MONO.axleIn, 0]));
    if (this.o.axleHoles) for (const sg of [-1, 1]) parts.push(T(this.axleHole(), [sg * this.axleX, 0, this.axleZ]));
    if (this.o.endStuds === 'top') parts.push(this.topRecessCut());
    parts.push(s.difference(T(s.cube([100, 10 + MONO.endGap, 50]), [-50, -10, -1]), [this.endTab()]));
    parts.push(T(s.cube([MONO.notchX[1] - MONO.notchX[0], 1 + MONO.notchIn, 50]), [MONO.notchX[0], -1, -1]));
    return s.union(parts);
  }
  /** end_adds: the side studs and the tab. */
  endAdds(): Man {
    const parts: Man[] = [this.endTab()];
    if (this.o.endStuds === 'side') for (const d of MONO.pinIns) parts.push(T(this.sideStudsPair(), [0, d, 0]));
    return this.s.union(parts);
  }
  /** Two anti-studs either side of y = 0 along the beam (and either side across): where a support's 2 x 2 studs press in mid-piece. */
  supportSockets(): Man {
    return this.s.union([-1, 1].flatMap((sx) => [-1, 1].map((sy) => T(this.antistud(), [sx * MONO.axleY, sy * MONO.axleIn, 0]))));
  }

  /**
   * The rack ridge in plan along rt from a to b, with its gaps cut (gaps:
   * the whole route's, in rt's s): a cross-section in the design's x, y.
   */
  ridgePlan(rt: Route, a: number, b: number, gaps: RackGap[]): CS {
    const w = this.w, hw = MONO.ridgeHw, st = segStarts(rt);
    const ss: number[] = [a];
    rt.segments.forEach((sg, i) => {
      const s0 = Math.max(a, st[i]), s1 = Math.min(b, st[i] + segLength(sg));
      if (s1 <= s0) return;
      const n = sg.kind === 'straight' ? 1 : arcSegments(sg.radius + hw, ((s1 - s0) / sg.radius) * (180 / Math.PI));
      for (let k = 1; k <= n; k++) ss.push(s0 + ((s1 - s0) * k) / n);
    });
    const at = (s: number, o: number): Vec2 => frameAt(routePose(rt, s))([o, 0]);
    const band = new w.CrossSection([[...ss.map((s) => at(s, hw)), ...[...ss].reverse().map((s) => at(s, -hw))]], 'NonZero');
    const mine = gaps.filter((g) => g.s > a - 0.7 && g.s < b + 0.7);
    if (!mine.length) return band;
    const holes = mine.map((g) => { const f = frameAt(routePose(rt, g.s)); return this.gapPts(g.side).map(f); });
    return band.subtract(new w.CrossSection(holes, 'NonZero'));
  }

  /**
   * A piece of beam along rt from a to b (in rt's s), in the design's frame:
   * narrow ends (end_len each) and the full beam between, the ridge with its
   * rack, and an end's features at a (ends[0]) and at b (ends[1]). sockets:
   * where a support's studs press in mid-piece (s along rt).
   */
  piece(rt: Route, a: number, b: number, gaps: RackGap[], ends: [boolean, boolean] = [true, true], sockets: number[] = [], label?: Man): Man {
    const s = this.s, L = b - a;
    const sub = subOf(rt, a, b);
    const body: Man[] = [];
    // narrow where there's an end, the full beam elsewhere
    const n0 = ends[0] ? MONO.endLen : 0, n1 = ends[1] ? MONO.endLen : 0;
    if (n0 || n1) body.push(sweepRoute(s, this.beam2d(this.endsHw, this.endsCh), sub));
    if (L > n0 + n1) body.push(sweepRoute(s, this.beam2d(), sub, n0, L - n1));
    body.push(T(this.ridgePlan(rt, a, b, gaps).extrude(MONO.ridgeTop - MONO.beamTop + 0.01), [0, 0, MONO.beamTop - 0.01]));
    const P0 = routePose(rt, a), P1e = routePose(rt, b), P1: Pose = [P1e[0], P1e[1], P1e[2] + 180];
    const endP = [ends[0] && P0, ends[1] && P1].filter((p): p is Pose => !!p);
    for (const P of endP) body.push(placeAt(this.endAdds(), P));
    const cuts: Man[] = endP.map((P) => placeAt(this.endCuts(), P));
    for (const q of sockets) cuts.push(placeAt(this.supportSockets(), routePose(rt, q)));
    if (label) cuts.push(placeAt(label, routePose(rt, (a + b) / 2)));
    return s.difference(s.union(body), cuts);
  }
}

/** rt from a to b, as a route of its own. */
export function subOf(rt: Route, a: number, b: number): Route {
  const st = segStarts(rt), segments: Route['segments'] = [];
  rt.segments.forEach((sg, i) => {
    const s0 = Math.max(a, st[i]), s1 = Math.min(b, st[i] + segLength(sg));
    if (s1 <= s0 + 1e-6) return;
    segments.push(sg.kind === 'straight' ? { kind: 'straight', length: s1 - s0 } : { kind: 'arc', radius: sg.radius, angle: (Math.sign(sg.angle) * (s1 - s0) * 180) / (Math.PI * sg.radius) });
  });
  return { id: rt.id, start: routePose(rt, a), segments };
}
export { routeLength };

// ---------------------------------------------------------------------------
// Labels: engraved underneath, reading from below (under_label). A plain
// block letter font (5 x 7), not the .scad's Liberation Sans Bold: the kernel
// has no fonts.
// ---------------------------------------------------------------------------
const FONT: Record<string, string> = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100',
  '-': '00000000000000011111000000000000000', '.': '00000000000000000000000000110001100', '°': '01100100101001001100000000000000000',
  '/': '00001000010001000100010001000010000', '+': '00000001000010011111001000010000000', ' ': '00000000000000000000000000000000000',
};
/** A line of text in the block font: u along it (centred), v up (centred), cap height h. */
function textCS(w: Wasm, txt: string, h: number): CS | undefined {
  const px = h / 7, chars = [...txt.toUpperCase()].map((ch) => FONT[ch] ?? FONT['-']), W = (chars.length * 6 - 1) * px;
  const rects: Vec2[][] = [];
  chars.forEach((bits, k) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (bits[r * 5 + c] === '1') {
      const x = (k * 6 + c) * px - W / 2, y = (3.5 - r - 1) * px, e = px * 0.02;
      rects.push([[x - e, y - e], [x + px + e, y - e], [x + px + e, y + px + e], [x - e, y + px + e]]);
    }
  });
  return rects.length ? new w.CrossSection(rects, 'NonZero') : undefined;
}
/** Text width in the block font, at cap height h. */
const textW = (txt: string, h: number) => (([...txt].length * 6 - 1) * h) / 7;
/**
 * under_label: up to two lines engraved 1 mm into the underside, along the
 * piece (avail: mm along it), the first on the +x side, mirrored to read from
 * below; centred on the origin of the frame it's placed in.
 */
export function underLabel(s: Scad, lines: string[], avail: number): Man | undefined {
  const ls = lines.filter((t) => t !== '');
  if (avail <= 8 || !ls.length) return undefined;
  const parts: Man[] = [];
  ls.forEach((t, k) => {
    const h = Math.min(5 * 0.955, (0.85 * avail * 0.955 * 5) / Math.max(textW(t, 5 * 0.955) / 0.955, 0.001) / 5);
    if (h < 1.5) return;
    const cs = textCS(s.w, t, h);
    if (!cs) return;
    // (u, v) to (v, u): the text along +y, its top towards +x, mirrored
    const x = ls.length === 1 ? 0 : k === 0 ? 6 : -6;
    parts.push(T(M(R(cs.extrude(1), [0, 0, -90]), [1, 0, 0]), [x, 0, -0.1]));
  });
  return parts.length ? s.union(parts) : undefined;
}

// ---------------------------------------------------------------------------
// The support (monorail_support.scad): a base plate, two legs tapering up to
// a 2 x 2 top with hollow studs, a sill, cross beams and a solid band under
// the top. It stands on z = 0, centred on x = y = 0, the legs in the x-z
// plane (x across the track).
// ---------------------------------------------------------------------------
export interface SupportOptions { bricks: number; plates: number; baseXStuds: number; baseYStuds: number; antistud: boolean; baseStuds: boolean; solid: boolean }
export const SUPPORT_DEFAULTS: SupportOptions = { bricks: 5, plates: 0, baseXStuds: 4, baseYStuds: 4, antistud: true, baseStuds: true, solid: false };
/** The support's top (where the track sits): whole bricks plus plates above its underside. */
export const supportHeight = (o: SupportOptions) => o.bricks * 9.6 + o.plates * 3.2;

export function supportPart(s: Scad, o: SupportOptions = SUPPORT_DEFAULTS): Man {
  const w = s.w, stud = MONO.stud;
  const H = supportHeight(o), bx = o.baseXStuds * stud - 0.2, by = o.baseYStuds * stud - 0.2, tw = 2 * stud - 0.2, pt = 3.2;
  const z0 = pt, z1 = H - pt;
  const webT = 1.6, flangeW = 2, flangeD = 7.5, legW = 3.6, cornerR = 2.5, ot = 6.6;
  const ob = Math.min(ot + 0.07 * (z1 - z0), bx / 2 - 1.5);
  const outer = (z: number) => ob + ((ot - ob) * (z - z0)) / (z1 - z0);
  const sillTop = z0 + 2.6, bandBot = z1 - 4, rungT = 2.4;
  const nRungs = Math.max(0, Math.round((bandBot - sillTop) / 21.5) - 1);
  const bars: Vec2[] = [[z0, sillTop], ...Array.from({ length: nRungs }, (_, k): Vec2 => { const zc = sillTop + ((bandBot - sillTop) * (k + 1)) / (nRungs + 1); return [zc - rungT / 2, zc + rungT / 2]; }), [bandBot, z1]];
  const frame2d = () => s.polygon([[-ob, z0 - 0.01], [ob, z0 - 0.01], [ot, z1 + 0.01], [-ot, z1 + 0.01]]);
  const openings2d = (): CS | undefined => {
    if (!(bandBot > sillTop)) return undefined;
    const os: CS[] = [];
    for (let k = 0; k < bars.length - 1; k++) {
      const a = bars[k][1], b = bars[k + 1][0];
      os.push(s.polygon([[-outer(a) + legW, a], [outer(a) - legW, a], [outer(b) - legW, b], [-outer(b) + legW, b]]).offset(-cornerR, 'Miter', 2).offset(cornerR, 'Round', 2, MONO.fn));
    }
    return w.CrossSection.union(os);
  };
  // (rotate([90, 0, 0]) linear_extrude(d, center = true): the 2D's y up, d deep along y)
  const slab = (cs: CS, d: number) => R(T(cs.extrude(d), [0, 0, -d / 2]), [90, 0, 0]);
  const parts: Man[] = [];
  // base plate, hollow underneath with LEGO tubes if asked
  parts.push(s.difference(T(s.cube([bx, by, pt]), [-bx / 2, -by / 2, 0]), [o.antistud && T(s.cube([bx - 2.4, by - 2.4, 1.8 + 0.2]), [-bx / 2 + 1.2, -by / 2 + 1.2, -0.01])]));
  if (o.antistud)
    for (let i = 1; i <= o.baseXStuds - 1; i++) for (let j = 1; j <= o.baseYStuds - 1; j++)
      parts.push(T(s.difference(s.cylinder(2, 6.45 / 2, 6.45 / 2, MONO.fn), [T(s.cylinder(2.1, 4.85 / 2, 4.85 / 2, MONO.fn), [0, 0, -0.01])]), [-bx / 2 - 0.1 + i * stud, -by / 2 - 0.1 + j * stud, 0]));
  // studs round the edge of the base, clear of the frame's foot by 0.3
  const sd = 4.8 + 0.1;
  const clearOf = (x: number, y: number, x0: number, x1: number, hy: number) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(Math.abs(y) - hy, 0)) >= sd / 2 + 0.3;
  if (o.baseStuds)
    for (let i = 0; i < o.baseXStuds; i++) for (let j = 0; j < o.baseYStuds; j++) {
      const x = (i - (o.baseXStuds - 1) / 2) * stud, y = (j - (o.baseYStuds - 1) / 2) * stud;
      const edge = i === 0 || j === 0 || i === o.baseXStuds - 1 || j === o.baseYStuds - 1;
      if (edge && clearOf(Math.abs(x), y, 0, ob, webT / 2) && clearOf(Math.abs(x), y, ob - flangeW, ob, flangeD / 2))
        parts.push(T(s.cylinder(1.8 + 0.01, sd / 2, sd / 2, MONO.fn), [x, y, pt - 0.01]));
    }
  // web (with the openings, unless closed), flanges down the legs
  const op = o.solid ? undefined : openings2d();
  parts.push(slab(op ? frame2d().subtract(op) : frame2d(), webT));
  parts.push(slab(frame2d().subtract(s.polygon([[-ob + flangeW, z0 - 1], [ob - flangeW, z0 - 1], [ot - flangeW, z1 + 1], [-ot + flangeW, z1 + 1]])), flangeD));
  // top plate on a 45 degree flare from the frame, four hollow studs
  const gz = (tw - flangeD) / 2;
  parts.push(w.Manifold.hull([T(s.cube([2 * outer(z1 - gz), flangeD, 0.01]), [-outer(z1 - gz), -flangeD / 2, z1 - gz]), T(s.cube([tw, tw, 0.01]), [-tw / 2, -tw / 2, z1])]));
  parts.push(T(s.cube([tw, tw, pt]), [-tw / 2, -tw / 2, z1]));
  for (const x of [-4, 4]) for (const y of [-4, 4])
    parts.push(T(s.difference(s.cylinder(1.8, (4.8 + 0.1) / 2, (4.8 + 0.1) / 2, MONO.fn), [T(s.cylinder(2, 1.6, 1.6, MONO.fn), [0, 0, -0.01])]), [x, y, H - 0.01]));
  return s.union(parts);
}

/** The pose a route ends in, turned round (an end's frame: the body behind it). */
export const endFrame = (rt: Route): Pose => { const p = routePose(rt, routeLength(rt)); return [p[0], p[1], p[2] + 180]; };
