// The fit-ladder test prints (design.ts: Test prints 6 to 9, and 1's): each coupon builds with its own value of one fit
// setting, its parts are named after the coupon and its value, the rungs build different parts (each against the others,
// built alone with nothing else different), and the ribs on a coupon (its rung's number) add more the higher the rung.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache, type Piece } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
/** the ladders: template, the setting each rung changes, its values in rung order, and whether the rungs carry ribs (the monorail's don't: their value is engraved) */
const LADDERS: [string, keyof PieceOptions, number[], boolean][] = [
  ['Test print 6: seat fits', 'trackFitTol', [0.1, 0.2, 0.3], true],
  ['Test print 7: clearance round the points', 'pointClearance', [0.2, 0.3, 0.4], true],
  ['Test print 8: flangeway width', 'flangeway', [2.5, 3, 3.5], true],
  ['Test print 9: monorail hole fit', 'monoHoleFit', [0, 0.05, 0.1, 0.15, 0.2], false],
];
const same = (a: Piece, b: Piece) => a.stl.length === b.stl.length && a.stl.every((x, i) => x === b.stl[i]);

describe('fit-ladder test prints', { timeout: 600000 }, () => {
  for (const [name, key, values, ribs] of LADDERS) it(`${name}: a coupon for each of ${values.join(', ')}, named after it, each different${ribs ? ', ribbed by rung' : ''}`, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const d = structuredClone(TEMPLATES[name]), b = buildDesign(w, d), kit = d.kit!;
      expect(b.info.warnings).toEqual([]);
      expect(kit.map((k) => k.options![key])).toEqual(values);
      // (the middle rung is today's setting, and says so)
      expect(OPTION_DEFAULTS[key]).toBe(values[(values.length - 1) / 2]);
      expect(kit[(kit.length - 1) / 2].note).toContain("today's setting");
      for (const k of kit) {
        expect(k.name).toContain(String(k.options![key]));
        const mine = b.pieces.filter((p) => p.kit === k.name);
        expect(mine.length, `${k.name} has parts`).toBeGreaterThan(0);
        for (const p of mine) expect(p.name.startsWith(`${k.name}-`)).toBe(true);
      }
      // (each coupon alone, unmarked, its routes under one name: what its setting changes and nothing else)
      const { kit: _k, ...plain } = d;
      const alone = kit.map((k) => {
        const routes = d.routes.filter((r) => k.routes.includes(r.name)).map((r) => ({ ...r, name: r.name.replace(/\d+/, '0') }));
        const { labelText: _l, ...opts } = k.options!;
        return buildDesign(w, { ...plain, routes, options: { ...plain.options, ...opts } } as Design);
      });
      const main = (r: { pieces: Piece[] }) => r.pieces.find((p) => !p.lego && !/points-|throw|lever/.test(p.name))!;
      for (let i = 0; i < alone.length; i++) for (let j = i + 1; j < alone.length; j++) expect(same(main(alone[i]), main(alone[j])), `${values[i]} and ${values[j]} build the same part`).toBe(false);
      if (ribs) {
        // (the ribs: each adds triangles to the coupon's file, so the one in the kit is bigger than the same one alone, more at each rung)
        const size = (ps: Piece[]) => ps.filter((p) => !p.lego && !/points-|throw|lever/.test(p.name)).reduce((t, p) => t + p.stl.length, 0);
        const extra = kit.map((k, i) => size(b.pieces.filter((p) => p.kit === k.name)) - size(alone[i].pieces));
        extra.forEach((e, i) => expect(e, `rung ${i + 1}'s ribs`).toBeGreaterThan(0));
        for (let i = 1; i < extra.length; i++) expect(extra[i], `rung ${i + 1} has more ribs than ${i}`).toBeGreaterThan(extra[i - 1]);
      }
      clearBuildCache();
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
