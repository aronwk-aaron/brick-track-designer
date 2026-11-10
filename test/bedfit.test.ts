// Whether a part fits the print bed, turned any way (geom/bedfit.ts): the one working the build, the full circle's note,
// the monorail and the assembly checks all use.
import { describe, expect, it } from 'vitest';
import { bedFit, boxAt, hullOf, longestFit, type Pt, rectFits, tightBox } from '../src/geom/bedfit';

const rect = (l: number, w: number, deg = 0, at: Pt = [0, 0]): Pt[] => {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  return ([[0, 0], [l, 0], [l, w], [0, w]] as Pt[]).map(([x, y]) => [at[0] + x * c - y * s, at[1] + x * s + y * c]);
};
/** A curved piece of track's outline: radius r (mm) to its middle, half its width hw, through deg degrees, starting at a0. */
const arc = (r: number, hw: number, deg: number, a0 = 0): Pt[] => {
  const out: Pt[] = [];
  for (let k = 0; k <= 40; k++) { const t = ((a0 + (deg * k) / 40) * Math.PI) / 180; for (const q of [r - hw, r + hw]) out.push([q * Math.cos(t), q * Math.sin(t)]); }
  return out;
};

describe('the convex hull', () => {
  it('is the corners of a rectangle, whatever is inside it', () => {
    const pts = [...rect(10, 4), [5, 2], [1, 1], [9, 3], [5, 0], [5, 4]] as Pt[];
    expect(hullOf(pts).map((p) => p.join()).sort()).toEqual(['0,0', '0,4', '10,0', '10,4']);
  });
  it('reads a mesh\'s corners (x, y, z in a row) and drops the ones inside', () => {
    const flat: number[] = [];
    for (let i = 0; i < 5000; i++) flat.push(100 * Math.cos(i), 60 * Math.sin(i * 1.7), i % 7);
    for (const [x, y] of [[-200, -90], [200, -90], [200, 90], [-200, 90]]) flat.push(x, y, 0);
    const h = hullOf(new Float32Array(flat), 3);
    expect(h.length).toBe(4);
    expect(boxAt(h, 0)).toEqual([400, 180]);
  });
  it('makes do with nothing, a point, a line and numbers that are not', () => {
    expect(hullOf([])).toEqual([]);
    expect(hullOf([[3, 4]])).toEqual([[3, 4]]);
    expect(hullOf([[0, 0], [NaN, 1], [2, 2]]).length).toBe(2);
    expect(hullOf([[0, 0], [1, 1], [2, 2], [3, 3]]).length).toBe(2);
  });
});

describe('a part on the bed, turned any way', () => {
  it('fits as it is, or a quarter turn round: nothing to turn', () => {
    expect(bedFit(rect(200, 100), 256, 256)).toMatchObject({ fits: true, angle: 0, square: true, size: [200, 100] });
    const f = bedFit(rect(100, 240), 250, 210);
    expect(f).toMatchObject({ fits: true, angle: 90, square: true });
    expect(f.size[0]).toBeCloseTo(240, 6); expect(f.size[1]).toBeCloseTo(100, 6);
    // (exactly the bed's size)
    expect(bedFit(rect(256, 256), 256, 256).fits).toBe(true);
  });
  it('fits corner to corner: 259 x 102 on a 256 x 256 bed only at about 45 degrees', () => {
    const f = bedFit(rect(259, 102), 256, 256);
    expect(f.fits).toBe(true); expect(f.square).toBe(false);
    expect(f.angle % 90).toBeCloseTo(45, 0);
    expect(Math.max(...f.size)).toBeLessThanOrEqual(256);
    expect(Math.max(...f.size)).toBeCloseTo((259 + 102) / Math.SQRT2, 1);
    // (turned by the angle it gives, it lies within the bed)
    const [w, h] = boxAt(rect(259, 102), f.angle);
    expect(w).toBeLessThanOrEqual(256); expect(h).toBeLessThanOrEqual(256);
    // (a little longer: no way)
    expect(bedFit(rect(262, 102), 256, 256).fits).toBe(false);
    expect(rectFits(259, 102, 256, 256)).toBe(true); expect(rectFits(262, 102, 256, 256)).toBe(false);
  });
  it('does not care how the part lies in the design', () => {
    for (const deg of [0, 11.25, 33, 45, 78.75, 123, 170]) {
      const f = bedFit(rect(259, 102, deg, [300, -40]), 256, 256);
      expect(f.fits, `at ${deg}`).toBe(true);
      const [w, h] = boxAt(rect(259, 102, deg), f.angle);
      expect(Math.max(w, h), `at ${deg}`).toBeLessThanOrEqual(256 + 1e-6);
      expect(bedFit(rect(300, 150, deg), 256, 256).fits, `300 x 150 at ${deg}`).toBe(false);
    }
  });
  it('fits a curved piece that its box in the design says is too big', () => {
    // (an R152 curve's 11.25 degrees with ballast and a buddy strip, lying at 30 degrees on the plan)
    const p = arc(152 * 8, 48, 11.25, 30), [w, h] = boxAt(p, 0);
    expect(Math.max(w, h)).toBeGreaterThan(200); expect(Math.min(w, h)).toBeGreaterThan(150);
    const t = tightBox(p).size;
    expect(t[0]).toBeCloseTo(2 * (152 * 8 + 48) * Math.sin((5.625 * Math.PI) / 180), 1);
    expect(t[1]).toBeCloseTo(152 * 8 + 48 - (152 * 8 - 48) * Math.cos((5.625 * Math.PI) / 180), 1);
    const f = bedFit(p, 256, 256);
    expect(f.fits).toBe(true);
    // (a bed its length and width: only turned, to lie along it)
    const g = bedFit(p, 250, 120);
    expect(g.fits).toBe(true); expect(g.square).toBe(false);
    const [gw, gh] = boxAt(p, g.angle);
    expect(gw).toBeLessThanOrEqual(250); expect(gh).toBeLessThanOrEqual(120);
    expect(bedFit(p, 240, 120).fits).toBe(false);
  });
  it('says how much too big a part is, and does not fit nothing or a bed of no size', () => {
    expect(bedFit(rect(512, 256), 256, 256).over).toBeCloseTo(2, 6);
    expect(bedFit([], 256, 256).fits).toBe(false);
    expect(bedFit(rect(10, 10), 0, 256).fits).toBe(false);
    expect(bedFit(rect(10, 10), NaN, 256).fits).toBe(false);
    expect(bedFit([[5, 5]], 256, 256).fits).toBe(true);
    expect(bedFit([[0, 0], [300, 300]], 256, 256).fits).toBe(false); // (a line 424 long: the bed's diagonal is 362)
    expect(bedFit([[0, 0], [250, 250]], 256, 256).fits).toBe(true);
  });
});

describe('the tightest box and the longest strip', () => {
  it('finds a rectangle\'s own sides however it lies', () => {
    for (const deg of [0, 17, 45, 90, 133]) {
      const t = tightBox(rect(120, 30, deg));
      expect(t.size[0]).toBeCloseTo(120, 6); expect(t.size[1]).toBeCloseTo(30, 6);
      const [w, h] = boxAt(rect(120, 30, deg), t.angle);
      expect(w).toBeCloseTo(120, 6); expect(h).toBeCloseTo(30, 6);
    }
    expect(tightBox([]).size).toEqual([0, 0]);
  });
  it('lets a narrow strip be longer than the bed, corner to corner', () => {
    expect(longestFit(64, 256, 256)).toBeCloseTo(256 * Math.SQRT2 - 64, 0);
    expect(longestFit(250, 256, 256)).toBe(256);
    expect(longestFit(40, 250, 210)).toBeGreaterThan(250);
    // (what it says fits does, and a little longer doesn't)
    for (const w of [20, 64, 96, 150, 220]) { const l = longestFit(w, 250, 210); expect(rectFits(l - 0.5, w, 250, 210), `${w}`).toBe(true); expect(rectFits(l + 1.5, w, 250, 210), `${w}`).toBe(false); }
  });
});
