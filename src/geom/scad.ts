// A thin OpenSCAD-like layer over manifold-3d, so the OpenSCAD track library
// can be ported line by line and compared mesh for mesh: the same primitives
// (with the same tessellation), the same rotation order and the same frames.
import type { Wasm } from './kernel';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Man = InstanceType<Wasm['Manifold']>;
export type CS = InstanceType<Wasm['CrossSection']>;

export class Scad {
  constructor(readonly w: Wasm) {}

  /** cube(size, center) */
  cube(size: Vec3, center = false): Man {
    return this.w.Manifold.cube(size, center);
  }

  /** cylinder(h, r1, r2, $fn): vertices from angle 0, as OpenSCAD's. */
  cylinder(h: number, r1: number, r2: number = r1, fn = 24): Man {
    return this.w.Manifold.cylinder(h, r1, r2, fn);
  }

  /** polygon(points) */
  polygon(points: Vec2[] | Vec2[][]): CS {
    const paths = (Array.isArray(points[0][0]) ? points : [points]) as Vec2[][];
    return new this.w.CrossSection(paths, 'NonZero');
  }

  square(size: Vec2, center = false): CS {
    return this.w.CrossSection.square(size, center);
  }

  /** linear_extrude(h) of a cross-section */
  extrude(cs: CS, h: number): Man {
    return cs.extrude(h);
  }

  union(parts: (Man | undefined | false)[]): Man {
    const ms = parts.filter((p): p is Man => !!p);
    return this.w.Manifold.union(ms); // (empty: a valid empty solid; cube([0, 0, 0]) is an invalid one, which empties every boolean it meets)
  }

  difference(base: Man, cuts: (Man | undefined | false)[]): Man {
    const cs = cuts.filter((c): c is Man => !!c);
    return cs.length === 0 ? base : base.subtract(this.w.Manifold.union(cs));
  }

  intersection(a: Man, b: Man): Man {
    return a.intersect(b);
  }
}

/** translate(v) */
export const T = (m: Man, v: Vec3) => m.translate(v);
/** rotate([x, y, z]): about x, then y, then z, in degrees (as OpenSCAD). */
export const R = (m: Man, v: Vec3) => m.rotate(v);
/** mirror(normal) */
export const M = (m: Man, n: Vec3) => m.mirror(n);

/**
 * A cross-section cut down to the square round each spot it's asked about
 * (on a grid of squares `cell` mm across, each grown by pad): for testing many
 * small shapes, none reaching more than pad from the spot asked, against a
 * big outline. The same answers as the whole outline gives (a shape inside
 * the square meets only what's in it), but each boolean with a few edges, not
 * all of them: once per stud of a big part, with the whole outline, it was
 * most of the part's build.
 */
export function clipNear(w: Wasm, cs: CS, pad: number, cell = 32): (q: Vec2) => CS {
  const got = new Map<string, CS>(), b = cs.bounds();
  return (q) => {
    const i = Math.floor(q[0] / cell), j = Math.floor(q[1] / cell), k = `${i},${j}`;
    let c = got.get(k);
    if (!c) {
      const x0 = i * cell - pad, y0 = j * cell - pad, x1 = (i + 1) * cell + pad, y1 = (j + 1) * cell + pad;
      // (all of it inside the square: as it is)
      c = b.min[0] >= x0 && b.max[0] <= x1 && b.min[1] >= y0 && b.max[1] <= y1 ? cs : w.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]).intersect(cs);
      got.set(k, c);
    }
    return c;
  };
}
