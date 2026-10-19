// The track library, ported from the OpenSCAD files (track_lib.scad): the
// constants and the shapes, in the same frames and with the same numbers, so
// the parity check can compare them mesh for mesh.
//
// Units: mm. Frame: a piece starts at y = 0 on x = 0 heading +y; z = 0 is the
// bottom of the sleepers; the rail base is at z = 3.2.
import { Scad, T, R, M, type Man, type Vec2 } from './scad';

export const STUD = 8;
export const PLATE_H = 3.2;

/** The settings the shapes depend on (OpenSCAD's Customizer values). */
export interface TrackOptions {
  gaugeStuds: number;      // studs between the rails (4 = LEGO)
  studD: number;           // 4.8
  studFit: number;         // 0.18
  studH: number;           // 1.8
  sleeperWidthStuds: number; // 2 (LEGO) or 1 (bridge ties)
}

export const DEFAULTS: TrackOptions = {
  gaugeStuds: 4, studD: 4.8, studFit: 0.18, studH: 1.8, sleeperWidthStuds: 2,
};

/** Derived constants, as track_lib.scad. */
export function constants(o: TrackOptions) {
  const trackGauge = (o.gaugeStuds + 1) * STUD;
  const railOffset = trackGauge / 2;
  const sleeperW = o.sleeperWidthStuds * STUD;
  const sleeperLen = trackGauge + 24;
  const railFootHalfW = 3.9;
  const betweenClear = 2 * railOffset - 2 * railFootHalfW;
  const betweenN = Math.floor((betweenClear - o.studD) / STUD) + 1;
  const betweenRailsRaw = Array.from({ length: Math.max(0, betweenN) }, (_, j) => (j - (betweenN - 1) / 2) * STUD);
  return {
    trackGauge, railOffset, sleeperW, sleeperLen, railFootHalfW,
    betweenRailsRaw,
    outerPostX: railOffset + 8,
    couplerX: 8,
    hasCoupler: railOffset >= 12,
    postD: o.studD + o.studFit,
    postH: 2,
    studFn: 24,
    studSocketW: o.studD + 0.2,
  };
}

export class Track {
  readonly c: ReturnType<typeof constants>;
  constructor(readonly s: Scad, readonly o: TrackOptions = DEFAULTS) {
    this.c = constants(o);
  }

  /** stud(d, h) */
  stud(d = this.o.studD + this.o.studFit, h = this.o.studH): Man {
    return this.s.cylinder(h, d / 2, d / 2, this.c.studFn);
  }

  /** stud_socket(h, corner): a square socket, a corner cut off if given. */
  studSocket(h: number, corner?: Vec2): Man {
    const s = this.s, w = this.c.studSocketW / 2, cc = 1.2;
    let cs = s.square([2 * w, 2 * w], true);
    if (corner) cs = cs.subtract(s.square([cc * Math.SQRT2, cc * Math.SQRT2], true).rotate(45).translate([corner[0] * w, corner[1] * w]));
    return cs.extrude(h);
  }

  /** A loose recess for a stud: room for it without gripping it (0.5 clear each side). */
  studRecess(h: number): Man {
    const w = this.o.studD + 1.0;
    return T(this.s.cube([w, w, h]), [-w / 2, -w / 2, 0]);
  }

  /** The right-hand kind of rail end (rail_endpoint_right). */
  railEndpointRight(): Man {
    const offH = -0.15;
    const poly: Vec2[] = [[2.4, 2], [2.4, 6], [3.2 + offH, 6], [3.2 + offH, 4], [9.6, 4],
      [9.6, 3.1], [7.6, 3.1], [4, 2], [3.2 + offH, 2]];
    return R(this.s.polygon(poly).extrude(8), [90, -90, 180]);
  }

  /** The left-hand kind of rail end (rail_endpoint_left). */
  railEndpointLeft(): Man {
    const offH = 0.515;
    const poly: Vec2[] = [[3 + offH, 8], [3 + offH, 4], [9.6, 4], [9.6, 3.05],
      [7.6, 3.05], [4, 1], [3 + offH, 1]];
    return R(this.s.polygon(poly).extrude(8), [90, -90, 180]);
  }

  /** attach_poly(h): the dovetail prism. */
  attachPoly(h: number): Man {
    const offL = 0.3;
    return this.s.polygon([[-offL, 0], [2 - offL, 1.9], [6 + offL, 1.9], [8 + offL, 0]]).extrude(h);
  }

  /** endpoint_base(peg_and_clip, stud_recesses) without extra rails. */
  endpointBase(pegAndClip = true, studRecesses = false): Man {
    const s = this.s, c = this.c, g = c.railOffset;
    const off = 0.1;
    const capW = c.sleeperLen / 2 - (g + 4);
    const posts = [-c.outerPostX, ...c.betweenRailsRaw, c.outerPostX];
    const plate = s.difference(T(s.cube([2 * g - 4.4, 8, PLATE_H]), [-(g - 4.2), -4, 0]), [
      c.hasCoupler && T(this.attachPoly(4), [-c.couplerX - 4, -4.11, -0.5]),
    ]);
    const body = s.union([
      ...posts.map((x) => T(this.stud(c.postD, c.postH), [x, 0, 3])),
      T(s.cube([capW + 0.3, 8, PLATE_H]), [-c.sleeperLen / 2, -4, 0]),
      T(s.cube([capW + 0.3, 8, PLATE_H]), [g + 3.7, -4, 0]),
      T(s.cube([2 * g - 7, PLATE_H, PLATE_H]), [-(g - 4), 0, 0]),
      plate,
      c.hasCoupler && pegAndClip && T(s.difference(s.union([
        T(s.cylinder(PLATE_H, 1, 1, 32), [0, -2.2, 0]),
        T(s.cylinder(PLATE_H, 2 - off, 2 + off, 32), [0, -4, 0]),
      ]), [T(s.cylinder(4, 0.8, 0.8, 32), [0, -4, -0.5])]), [-c.couplerX, 0, 0]),
      c.hasCoupler && pegAndClip && T(M(this.attachPoly(PLATE_H), [0, 1, 0]), [c.couplerX - 4, -3.7, 0]),
    ]);
    const cuts: (Man | false)[] = [
      c.hasCoupler && T(s.cylinder(4, 2 + off, 2 - off, 32), [c.couplerX, -4, -0.5]),
    ];
    if (studRecesses) {
      for (const x of [-c.outerPostX, c.outerPostX]) cuts.push(T(s.cube([5, 5, PLATE_H]), [x - 2.5, -2.5, -1]));
      cuts.push(T(this.studSocket(1 + this.o.studH + 0.2), [g, 0, -1]));
      for (const x of c.betweenRailsRaw) {
        const toward = (x < 0 ? -c.couplerX : c.couplerX) > x ? 1 : -1;
        cuts.push(T(this.studSocket(PLATE_H, [toward, -1]), [x, 0, -1]));
      }
    }
    return s.difference(body, cuts);
  }

  /** full_endpoint(peg_and_clip, stud_recesses) without extra rails. */
  fullEndpoint(pegAndClip = true, studRecesses = false): Man {
    const s = this.s, g = this.c.railOffset;
    return s.union([
      T(this.railEndpointLeft(), [-(g + 4), -8, 0]),
      T(s.cube([1, 4, 3.6]), [-(g + 3.8), -4, 0]),
      T(this.railEndpointRight(), [g - 4, -8, 0]),
      this.endpointBase(pegAndClip, studRecesses),
    ]);
  }

  /** rail_support(width, height, ribs_pos_y): a thin breakaway wall with a rib and a foot. */
  railSupport(width: number, height: number, ribsPosY = true): Man {
    const s = this.s, dz = ribsPosY ? -2 : 0;
    return R(s.union([
      s.cube([width, height, 0.5]),
      T(s.cube([0.5, height, 2]), [0, 0, dz]),
      T(s.cube([width, 0.5, 2]), [0, 0, dz]),
    ]), [90, 0, 0]);
  }

  /** start_rail_supports(z0), without extra rails. */
  startRailSupports(z0: number): Man {
    const g = this.c.railOffset;
    return this.s.union([
      T(this.railSupport(4, 2.08 - z0), [g - 2.2, -3, z0]),
      T(this.railSupport(3, 3.23 - z0), [-g - 3.3, -3, z0]),
    ]);
  }

  /** end_rail_supports(z0), without extra rails. */
  endRailSupports(z0: number): Man {
    const g = this.c.railOffset;
    return this.s.union([
      T(this.railSupport(3, 3.23 - z0, false), [g + 0.2, 3, z0]),
      T(this.railSupport(4, 2.08 - z0, false), [-g - 1.8, 3, z0]),
    ]);
  }

  /** support_footing(z0, y_end, dir), clear of the peg and clip on the bed. */
  supportFooting(z0: number, yEnd: number, dir: number): Man {
    const s = this.s, c = this.c;
    const hw = c.sleeperLen / 2, fw = 6, ft = 0.6, gap = 0.4;
    const ya = yEnd + dir * 1, yb = yEnd + dir * (1 + fw);
    const m = dir < 0 ? 1 : -1;
    const body = s.union([
      T(s.cube([2 * hw, fw, ft]), [-hw, Math.min(ya, yb), z0]),
      T(s.cube([2 * hw, 0.5, 1.5]), [-hw, yEnd + dir * 1.5 - 0.25, z0]),
    ]);
    if (!(c.hasCoupler && z0 > -1)) return body;
    return s.difference(body, [
      T(s.cylinder(5, 2.1 + gap, 2.1 + gap, 32), [-m * c.couplerX, yEnd, z0 - 1]),
      T(s.cube([8.6 + 2 * gap, 2 + gap, 5]), [m * c.couplerX - 4.3 - gap, yEnd - (dir < 0 ? 2 + gap : 0), z0 - 1]),
    ]);
  }

  /** The sleeper's stud rows across it (y). */
  sleeperRows(): number[] {
    const n = this.o.sleeperWidthStuds;
    return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * STUD);
  }

  /** sleeper(simplified_bottom, post_ok), without guard or dual rails. */
  sleeper(simplifiedBottom = false, postOk?: (p: [number, number]) => boolean): Man {
    const s = this.s, c = this.c, g = c.railOffset, w = c.sleeperW, len = c.sleeperLen;
    const skip = 0.3, capW = len / 2 - (g + 4);
    const posts: [number, number][] = [];
    for (const x of [-c.outerPostX, ...c.betweenRailsRaw, c.outerPostX])
      for (const y of this.sleeperRows()) if (!postOk || postOk([x, y])) posts.push([x, y]);
    const body = s.union([
      T(s.cube([capW + skip, w, PLATE_H]), [-len / 2, -w / 2, 0]),
      T(s.cube([2 * (g - 4) + 2 * skip, w, PLATE_H]), [-(g - 4) - skip, -w / 2, 0]),
      T(s.cube([capW + skip, w, PLATE_H]), [g + 4 - skip, -w / 2, 0]),
      ...posts.map(([x, y]) => T(this.stud(c.postD, c.postH), [x, y, 3])),
    ]);
    if (simplifiedBottom) return body;
    const cuts: Man[] = [];
    for (const y of this.sleeperRows().map((r) => r - 2.5)) {
      cuts.push(T(s.cube([5, 5, PLATE_H]), [-(g + 10.5), y, -1]));
      cuts.push(T(s.cube([2 * (g - 5), 5, PLATE_H]), [-(g - 5), y, -1]));
      cuts.push(T(s.cube([5, 5, PLATE_H]), [g + 5.5, y, -1]));
    }
    return s.difference(body, cuts);
  }

  /** The rail's cross-section at offset o, swept along a straight from y0 to y1 (straight_sweep). */
  railStraight(o: number, y0: number, y1: number): Man {
    return T(R(this.s.polygon(RAIL_PROFILE.map(([x, y]) => [x + o, y + PLATE_H] as Vec2)).extrude(y1 - y0), [90, 0, 0]), [0, y1, 0]);
  }
}

// rail_profile_raw(): the rail's cross-section, its base at y = 0 (the polygon
// shifted up 1.5, as in track_lib.scad).
export const RAIL_PROFILE: Vec2[] = ([
  [1.05, 4.9], [1.05, 4.7], [1.25, 4.7], [1.25, 0.5],
  [1.6, -0.7], [3, -1.1], [3, -1.7], [3.9, -1.7],
  [3.9, -4.7], [2.6, -4.7], [2.6, -4.3], [2.5, -4.3],
  [2.5, -2.3], [-2.5, -2.3], [-2.5, -4.3], [-2.6, -4.3],
  [-2.6, -4.7], [-3.9, -4.7], [-3.9, -1.7], [-3, -1.7],
  [-3, -1.1], [-1.6, -0.7], [-1.25, 0.5], [-1.25, 4.7],
  [-1.05, 4.7], [-1.05, 4.9], [-0.1, 4.9], [-0.1, 4.7],
  [0.1, 4.7], [0.1, 4.9], [1.05, 4.9],
] as Vec2[]).map(([x, y]) => [x, y + 1.5] as Vec2);

