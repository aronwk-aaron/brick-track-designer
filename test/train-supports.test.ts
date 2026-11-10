// Raised train track stands on pillars, as the reference's: a beam across under the track on two pillars beside it.
// Round the helix the upper turn's beam is on the lower turn's pillars, carried on up: every place held up, and
// nothing in the lower track's trains' way (6 studs wide, as tall as a LEGO train and some).
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache, gradeAt, trainPillars } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';
import { kernel } from '../src/geom/kernel';
import { routeLength, routePose } from '../src/route/route';
import { Scad } from '../src/geom/scad';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
/** Half a LEGO train's width and a little, and how tall it is over its track's bottom (mm). */
const TRAIN_HW = 28, TRAIN_H = 100;

describe('raised train track on pillars', { timeout: 600000 }, () => {
  for (const name of ['Helix (R104, two turns)', 'Grade up at 2.5%'])
    for (const raisedOn of ['printed', 'lego'] as const)
      it(`${name}, ${raisedOn}: every place held up, nothing in the lower track's way`, async () => {
        const saved = { ...OPTION_DEFAULTS };
        Object.assign(OPTION_DEFAULTS, APP);
        try {
          clearBuildCache();
          const d = structuredClone(TEMPLATES[name]);
          d.options = { ...d.options, raisedOn };
          const b = buildDesign(await kernel(), d);
          expect(b.info.warnings.filter((w) => /hold it up/.test(w))).toEqual([]);
          const sup = b.pieces.filter((p) => /^track-support/.test(p.name));
          if (raisedOn === 'printed') expect(sup.length).toBeGreaterThan(0);
          else expect(sup.length).toBe(0);
          // (the size said: as it stands, lifted onto its grade, with what it stands on)
          expect(b.info.size[2]).toBeGreaterThan(/Helix/.test(name) ? 250 : 15);
          expect(b.info.pieces).toBe(b.pieces.length);
          // (the track's centre line, every 4 mm, at its height (its bottom))
          const line: [number, number, number][] = [];
          for (const r of d.routes) {
            const rt = toRoutes({ ...d, routes: [r] })[0];
            if (!rt) continue;
            const L = routeLength(rt);
            for (let s = 0; s <= L; s += 4) { const p = routePose(rt, s); line.push([p[0], p[1], gradeAt(r, L, s)]); }
          }
          for (const p of sup) {
            const v = p.positions;
            // (the part fits the bed: 256 square)
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (let i = 0; i < v.length; i += 3) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); }
            expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(256);
            // (none of it where a train on track below runs, above its rails: no corner there, and no tall side (a
            // pillar's) up through there)
            const bad: string[] = [];
            const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
              const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
              return Math.hypot(px - ax - t * dx, py - ay - t * dy);
            };
            for (const [lx, ly, lh] of line) {
              if (lx < x0 - TRAIN_HW || lx > x1 + TRAIN_HW || ly < y0 - TRAIN_HW || ly > y1 + TRAIN_HW) continue;
              const z0 = lh + 10, z1 = lh + TRAIN_H;
              for (let i = 0; i < v.length; i += 9) {
                const zs = [v[i + 2], v[i + 5], v[i + 8]], lo = Math.min(...zs), hi = Math.max(...zs);
                if ((hi <= z0 || lo >= z1) && !(lh < 3.2 && lo < 12)) continue;
                // (the triangle's footprint: its corners, and for a tall side the line along its foot)
                const near = [0, 3, 6].some((k) => Math.hypot(v[i + k] - lx, v[i + k + 1] - ly) < TRAIN_HW)
                  || [[0, 3], [3, 6], [6, 0]].some(([a, c]) => segDist(lx, ly, v[i + a], v[i + a + 1], v[i + c], v[i + c + 1]) < TRAIN_HW);
                // (and by track on the baseplate, nothing on its sleepers (32 either side), up to its rails' top)
                const onBed = lh < 3.2 && lo < 12 && [0, 3, 6].some((k) => v[i + k + 2] < 12 && Math.hypot(v[i + k] - lx, v[i + k + 1] - ly) < 33);
                if (near || onBed) { bad.push(`${p.name} over ${lx.toFixed(0)}, ${ly.toFixed(0)} (height ${lh.toFixed(0)}): ${lo.toFixed(0)} to ${hi.toFixed(0)}`); break; }
              }
              if (bad.length) break;
            }
            expect(bad.slice(0, 5).join('; ')).toBe('');
          }
        } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
      });
  it('a beam\'s top is tilted to its track\'s grade (its underside level), so the track sits flat on it; level track\'s as it was', async () => {
    const s = new Scad(await kernel());
    const X = 44, SIDE = 15.8, BEAM = 6.4, H = 32, K = 0.025;
    /** the beam's top at (0, y): the highest point there under the studs' tops (between the studs, at x 0) */
    const topAt = (m: ReturnType<typeof trainPillars>, y: number) => {
      const col = s.intersection(m, s.cube([0.2, 0.2, 200], true).translate([0, y, 0]));
      return col.boundingBox().max[2];
    };
    const level = trainPillars(s, [H], X, SIDE, BEAM), tilted = trainPillars(s, [H], X, SIDE, BEAM, [K]);
    expect(Array.from(trainPillars(s, [H], X, SIDE, BEAM, [0]).getMesh().vertProperties)).toEqual(Array.from(level.getMesh().vertProperties));
    for (const y of [-7.5, 0, 7.5]) {
      expect(topAt(level, y)).toBeCloseTo(H, 3);
      // (the track's bottom there: H at the middle, climbing K a mm)
      expect(topAt(tilted, y)).toBeCloseTo(H + K * y, 2);
    }
    // (0.4 mm from edge to edge on a 2.5% grade, as the track over it)
    expect(topAt(tilted, 7.8) - topAt(tilted, -7.8)).toBeCloseTo(K * 15.6, 2);
    // (its underside level, on the pillars: the beam's lowest point between them where it was)
    const under = (m: ReturnType<typeof trainPillars>) => s.intersection(m, s.cube([40, 40, 12], true).translate([0, 0, H - 3])).boundingBox().min[2];
    expect(under(tilted)).toBeCloseTo(under(level), 6);
    expect(under(level)).toBeCloseTo(H - BEAM, 6);
    // (one solid, studs and all, and a little more or less of it than level: the same on average)
    expect(tilted.decompose()).toHaveLength(1);
    expect(Math.abs(tilted.volume() - level.volume())).toBeLessThan(5);
    // (two levels: each to its own track's climb, the upper one running back the other way)
    const two = trainPillars(s, [H, H + 60], X, SIDE, BEAM, [K, -K]);
    expect(topAt(s.intersection(two, s.cube([200, 200, H + 10]).translate([-100, -100, 0])), 7.5)).toBeCloseTo(H + K * 7.5, 2);
    expect(topAt(two, 7.5)).toBeCloseTo(H + 60 - K * 7.5, 2);
  });
});
