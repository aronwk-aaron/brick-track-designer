// No underside has a socket for a stud of its own, square or round: every one is LEGO's design (hollow inside a wall,
// anti-stud tubes between four studs, a single row of studs in a channel with pins between them). For parts of every
// kind, in a slice just above each part's bottom: no small hole closed all round with plastic hugging it (a stud's
// socket: 5 to 6 mm across, in solid). A tube's bore is such a hole too, but it stands in the hollow: a thin ring,
// nothing round it.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { type Design, TEMPLATES } from '../src/app/design';

const APP = (globalThis as { APP_DEFAULTS?: Record<string, unknown> }).APP_DEFAULTS!;
const T = (name: string, more: Record<string, unknown> = {}): Design => ({ ...TEMPLATES[name], options: { ...TEMPLATES[name]?.options, legoTrack: 'print', printBedX: 500, printBedY: 500, ...more } });
const area = (p: number[][]) => p.reduce((a, [x, y], k) => { const [u, v] = p[(k + 1) % p.length]; return a + x * v - u * y; }, 0) / 2;

/** The sockets in a build's parts: [part, x, y, mm across] each. */
async function sockets(d: Design) {
  const w = await kernel(), b = buildDesign(w, { ...d, options: { ...APP, ...d.options } });
  const out: [string, number, number, number][] = [];
  let parts = 0;
  for (const p of b.pieces) {
    // (the parts that sit on studs: track, switch bases, ballast, lids and decks, the lever's bracket, monorail beams;
    // not the blades, sliders and levers, whose holes are pivots)
    if (!/track|switch-base|monorail|ballast|deck|lid|bracket/.test(p.name) || p.lego) continue;
    parts++;
    const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(p.positions), triVerts: new Uint32Array(p.positions.length / 3).map((_, i) => i) }); mesh.merge();
    const m = new w.Manifold(mesh), z0 = m.boundingBox().min[2];
    for (const h of [0.5, 1.2]) {
      const sl = m.slice(z0 + h);
      for (const pg of sl.toPolygons() as number[][][]) {
        const a = area(pg);
        // (a hole: wound the other way; a stud's size, 4.6 to 6.2 across, round or square)
        if (a > -16 || a < -39) continue;
        const xs = pg.map((q) => q[0]), ys = pg.map((q) => q[1]), wx = Math.max(...xs) - Math.min(...xs), wy = Math.max(...ys) - Math.min(...ys);
        if (wx > 6.3 || wy > 6.3 || wx < 4.5 || wy < 4.5) continue;
        const c: [number, number] = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2];
        // (what's round it, 0.9 to 1.4 mm out from it: a tube's wall is 0.8 thick, with the hollow past it)
        const r = Math.max(wx, wy) / 2, band = w.CrossSection.circle(r + 1.4, 48).subtract(w.CrossSection.circle(r + 0.9, 48)).translate(c);
        if (band.intersect(sl).area() / band.area() > 0.5) out.push([p.name, +c[0].toFixed(1), +c[1].toFixed(1), +Math.max(wx, wy).toFixed(2)]);
      }
    }
  }
  return { out, parts };
}

describe('no underside has a stud socket', { timeout: 600000 }, () => {
  for (const [name, d] of [
    ['a switch on sleepers', T('Switch R40 left')],
    ['a switch on sleepers, a tube at every corner', T('Switch R40 left', { grip: 'all' })],
    ['a switch on sleepers, the underside lined up with the track', T('Switch R40 left', { undersideGrid: 'track' })],
    ['a switch on ballast', T('Switch R40 left', { ballast: 'ballast' })],
    ['LEGO\'s switch on ballast, in layers (the lid over the points)', T('Left switch (LEGO)', { ballast: 'buddy', pointsModule: 'layers', mechStyle: 'tines' })],
    ['LEGO\'s switch, printed', T('Left switch (LEGO)')],
    ['LEGO\'s switch with the lever on a bracket', T('Left switch (LEGO)', { throwStyle: 'bracket' })],
    ['straights\' ends (the joints kit)', T('Test print 2: track joints')],
    ['the fit coupons', T('Test print 1: stud and anti-stud fits')],
    ['the LEGO tolerance coupons', T('Test print 10: LEGO tolerance')],
    ['an oval on sleepers, in lengths', T('Oval (LEGO R40)', { sleepers: 'sleepers', splitTrack: 'lengths' })],
    ['track on sleepers one stud wide, lined up with the track', T('Oval (LEGO R40)', { sleepers: 'sleepers', sleeperWidthStuds: 1, sleeperGapStuds: 1, undersideGrid: 'track' })],
    ['track on sleepers one stud wide, on the baseplate\'s grid', T('Oval (LEGO R40)', { sleepers: 'sleepers', sleeperWidthStuds: 1, sleeperGapStuds: 1 })],
    ['the R104 double slip', T('Double slip R104 left')],
    ['a crossing', T('90° crossing')],
    ['a crossing at 22.5°', T('22.5° crossing')],
    ['a buffer stop', T('Buffer stop')],
    ['a buffer stop on ballast', T('Siding ending in a buffer stop')],
    // (no labels underneath: an O is a hole closed all round too)
    ['monorail beams', T('Test print 9: monorail hole fit', { monoLabels: 'none' })],
    ['monorail on supports', T('Monorail oval on supports', { monoLabels: 'none' })],
  ] as [string, Design][])
    it(name, async () => {
      const r = await sockets(d);
      expect(r.parts).toBeGreaterThan(0);
      expect(r.out).toEqual([]);
    });
});
