// The fit-ladder test prints (design.ts: Test prints 6 to 9, and 1's): each coupon builds with its own value of one fit
// setting, its parts are named after the coupon and its value, the rungs build different parts (each against the others,
// built alone with nothing else different), and the ribs on a coupon (its rung's number) add more the higher the rung.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache, type Piece } from '../src/app/build';
import { ANTISTUD_LADDER, type Design, FIT_LADDER, OPTION_DEFAULTS, type PieceOptions, STUD_LADDER, TEMPLATES } from '../src/app/design';
import { studFaults, studsOf } from './studs-apart.shared';

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
  it('Test print 10: LEGO tolerance: two ladders of seven, the stud fit alone and the anti-stud fit alone, each coupon with studs, a tube and pins', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const d = structuredClone(TEMPLATES['Test print 10: LEGO tolerance']), b = buildDesign(w, d), kit = d.kit!;
      expect(b.info.warnings).toEqual([]);
      // (each ladder moves its own fit only, seven rungs 0.05 apart about today's, loosest first)
      expect(kit.map((k) => Object.keys(k.options!).join())).toEqual([...Array(7).fill('studFit'), ...Array(7).fill('antistudFit')]);
      expect(kit.slice(0, 7).map((k) => k.options!.studFit)).toEqual(STUD_LADDER);
      expect(kit.slice(7).map((k) => k.options!.antistudFit)).toEqual(ANTISTUD_LADDER);
      for (const [ladder, now] of [[STUD_LADDER, OPTION_DEFAULTS.studFit], [ANTISTUD_LADDER, OPTION_DEFAULTS.antistudFit]] as const) {
        expect(ladder.length).toBe(7);
        expect(ladder[3]).toBe(now);
        for (let i = 1; i < 7; i++) expect(Math.abs(Math.abs(ladder[i] - ladder[i - 1]) - 0.05)).toBeLessThan(1e-9);
      }
      expect(STUD_LADDER[0]).toBeLessThan(STUD_LADDER[6]);
      expect(ANTISTUD_LADDER[0]).toBeGreaterThan(ANTISTUD_LADDER[6]);
      for (const k of [kit[3], kit[10]]) expect(k.note).toContain("today's setting");
      // (ribs: the rung's number, on one side for the stud ladder, on both for the anti-stud ladder)
      expect(kit.map((k) => [k.mark, !!k.markBoth])).toEqual([...STUD_LADDER.map((_, i) => [i + 1, false]), ...ANTISTUD_LADDER.map((_, i) => [i + 1, true])]);
      const parts = kit.map((k) => {
        expect(k.name).toContain(String(k.options!.studFit ?? k.options!.antistudFit));
        const mine = b.pieces.filter((p) => p.kit === k.name);
        expect(mine.length, `${k.name}: one part`).toBe(1);
        expect(mine[0].name.startsWith(`${k.name}-`)).toBe(true);
        return mine[0];
      });
      // (what each has to try: a 2 x 4 of studs between the rails and more, whole tubes, the single rows' pins; nothing run together)
      parts.forEach((p, i) => {
        const fits = { studD: 4.8, studFit: OPTION_DEFAULTS.studFit, antistudFit: OPTION_DEFAULTS.antistudFit, ...kit[i].options };
        const st = studsOf(w, p, fits), studs = st.studs.flat();
        const between = studs.filter((q) => Math.abs(q[0] - studs.reduce((t, v) => t + v[0], 0) / studs.length) < 6);
        expect(between.length, `${kit[i].name}: studs between the rails`).toBe(8);
        expect(st.tubes.length, `${kit[i].name}: tubes`).toBeGreaterThanOrEqual(1);
        expect(st.pins.length, `${kit[i].name}: pins`).toBeGreaterThanOrEqual(4);
        expect(studFaults(w, [p], () => fits)).toEqual([]);
      });
      // (each rung a different part; the ribs add to the file, more at each rung, and more again on both sides)
      for (let i = 0; i < 14; i++) for (let j = i + 1; j < 14; j++) expect(same(parts[i], parts[j]), `${kit[i].name} and ${kit[j].name} are the same part`).toBe(false);
      const { kit: _k, ...plain } = d;
      const bare = (i: number) => buildDesign(w, { ...plain, routes: d.routes.filter((r) => kit[i].routes.includes(r.name)).map((r) => ({ ...r, name: 'Coupon' })), options: { ...plain.options, ...kit[i].options } } as Design).pieces.find((p) => !p.lego)!.stl.length;
      const extra = parts.map((p, i) => p.stl.length - bare(i));
      for (const off of [0, 7]) for (let i = 0; i < 7; i++) expect(extra[off + i], `${kit[off + i].name}'s ribs`).toBeGreaterThan(i ? extra[off + i - 1] : 0);
      for (let i = 0; i < 7; i++) expect(extra[7 + i], `rung ${i + 1}: ribs on both sides`).toBeGreaterThan(1.5 * extra[i]);
      // (the kit as laid out, break-out supports and all, on one 256 mm bed)
      const mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
      for (const p of parts) for (const A of [p.positions, p.supports ?? new Float32Array()]) for (let i = 0; i < A.length; i += 3) for (let c = 0; c < 2; c++) { mn[c] = Math.min(mn[c], A[i + c]); mx[c] = Math.max(mx[c], A[i + c]); }
      expect(mx[0] - mn[0]).toBeLessThan(256);
      expect(mx[1] - mn[1]).toBeLessThan(256);
      clearBuildCache();
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
  it('Test print 1: its rungs are about today\'s fits, the anti-stud fit\'s too (the pins of its single rows)', () => {
    expect(FIT_LADDER[2]).toEqual([APP.studFit, APP.antistudFit]);
    expect(Math.max(...FIT_LADDER.map((f) => f[1]))).toBeGreaterThan(APP.antistudFit);
    expect(Math.min(...FIT_LADDER.map((f) => f[1]))).toBeLessThan(APP.antistudFit);
  });
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
