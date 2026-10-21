// Designs into pieces: a switch wherever routes split.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { TEMPLATES } from '../src/app/design';

const BIG_BED = { printBedX: 500, printBedY: 500 }; // (whole pieces: splitting is tested on its own)

describe('designs into pieces', { timeout: 60000 }, () => {
  it('the LEGO left switch is one switch: base, points, throw, lever', async () => {
    const b = buildDesign(await kernel(), { ...TEMPLATES['Left switch (LEGO)'], options: BIG_BED });
    expect(b.info.warnings).toEqual([]);
    expect(b.pieces.map((p) => p.name)).toEqual(['switch-base', 'switch-points-a', 'switch-points-b', 'switch-throw', 'switch-lever']);
    // (the same routes as switch.scad's left R40 s_curve: its tube underside base)
    expect(b.info.volume).toBeGreaterThan(54980);
  });
  for (const [name, n, sets] of [['Right switch (LEGO)', 1, 1], ['Wye switch', 1, 1], ['Three-way switch (tandem, two throws)', 1, 2], ['Three-way switch (one throw)', 1, 1]] as const)
    it(`${name}: ${n} switch, ${sets} throw${sets > 1 ? 's' : ''}`, async () => {
      const b = buildDesign(await kernel(), { ...TEMPLATES[name], options: { ...TEMPLATES[name].options, ...BIG_BED } });
      expect(b.info.warnings).toEqual([]);
      expect(b.info.switches).toBe(n);
      expect(b.pieces.filter((p) => /throw/.test(p.name))).toHaveLength(sets);  // (a throw per points set)
    });
  it('a branch drawn off the middle of a track: one piece, not cut where the branch starts', async () => {
    const b = buildDesign(await kernel(), { version: 1, gaugeStuds: 4, options: { printBedX: 600, printBedY: 600 }, routes: [
      { name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
      { name: 'Branch', x: 0, y: 16, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 16 }] },
    ] });
    expect(b.info.warnings).toEqual([]);
    expect(b.info.switches).toBe(1);
    expect(b.pieces.map((p) => p.name)).toEqual(['switch-base', 'switch-points-a', 'switch-points-b', 'switch-throw', 'switch-lever']);
  });
  it('a switch longer than the print bed comes in pieces that each fit it', async () => {
    const b = buildDesign(await kernel(), { ...TEMPLATES['Left switch (LEGO)'], options: { printBedX: 200, printBedY: 200 } });
    expect(b.info.warnings).toEqual([]);
    const bases = b.pieces.filter((p) => /base/.test(p.name));
    expect(bases.length).toBeGreaterThan(1);
    for (const p of bases) {
      // each piece's footprint (its STL, lying on the bed) within the bed, one way round or the other
      const d = new DataView(p.stl.buffer, p.stl.byteOffset), n = d.getUint32(80, true);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
        const x = d.getFloat32(84 + t * 50 + 12 + k * 12, true), y = d.getFloat32(84 + t * 50 + 16 + k * 12, true);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      const w = x1 - x0, h = y1 - y0;
      expect((w <= 200 && h <= 200) || (w <= 200 && h <= 200), `${p.name}: ${w.toFixed(0)} x ${h.toFixed(0)}`).toBe(true);
    }
  });
  it('every part\'s file lies on the bed (its lowest point at z 0), the blades too', async () => {
    const b = buildDesign(await kernel(), TEMPLATES['Left switch (LEGO)']);
    for (const p of b.pieces) {
      const d = new DataView(p.stl.buffer, p.stl.byteOffset), n = d.getUint32(80, true);
      let z0 = Infinity;
      for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) z0 = Math.min(z0, d.getFloat32(84 + t * 50 + 20 + k * 12, true));
      expect(Math.abs(z0), p.name).toBeLessThan(1e-4);
    }
  });
  it('a plain track longer than the print bed comes in equal lengths that fit it', async () => {
    const b = buildDesign(await kernel(), { version: 1, gaugeStuds: 4, routes: [{ name: 'S', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 80 }] }] });
    expect(b.pieces.map((p) => p.name)).toEqual(['track1', 'track2', 'track3']);
  });
  it('a crossover (a branch off one track merging into the next) is one piece with points at both ends', async () => {
    const sn = Math.sin(Math.PI / 8), c = Math.cos(Math.PI / 8);
    const b = buildDesign(await kernel(), { version: 1, gaugeStuds: 4, options: { printBedX: 900, printBedY: 900 }, routes: [
      { name: 'L', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 60 }] },
      { name: 'R', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 60 }] },
      { name: 'X', x: 0, y: 4, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: (16 - 2 * 40 * (1 - c)) / sn }, { kind: 'curve', radius: 40, angle: 22.5 }] },
    ] });
    expect(b.info.warnings).toEqual([]);
    expect(b.info.switches).toBe(2);
    expect(b.pieces.map((p) => p.name)).toEqual(['track', 'points1-a', 'points1-b', 'points1-throw', 'points1-lever', 'points2-a', 'points2-b', 'points2-throw', 'points2-lever']);
  });
});
