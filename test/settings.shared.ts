// (settings-*.test.ts, each a few sections of the settings, in a worker of its own: one kernel building them all
// runs out of memory) Every setting works: it has its help, an example (scripts/option-specs.ts: its pictures are made from them), it isn't
// greyed out where it applies, and each of its values builds something different.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions } from '../src/app/design';
import { optionForm, type OptCtx, type OptField } from '../src/app/settings';
import { kernel } from '../src/geom/kernel';
import { SPECS } from '../scripts/option-specs';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
let cur: Design = { version: 1, gaugeStuds: 4, routes: [] };
const { form } = optionForm(() => cur);
const fields = form.flatMap((s) => s.fields);

/** The design with the setting set to v, as the settings panel sets it. */
function withValue(f: OptField, base: Design, v: string | number | boolean): Design {
  cur = structuredClone(base);
  const val = f.check ? v === true || v === 'true' : f.choices ? (f.numeric ? Number(v) : String(v)) : f.text ? String(v) : Number(v);
  if (f.set) f.set(val); else cur.options = { ...cur.options, [f.key]: val } as Design['options'];
  return cur;
}
const ctxOf = (d: Design): OptCtx => { const o = { ...APP, ...d.options } as PieceOptions; return { o, ballast: o.ballast !== 'none', fdb: o.mechStyle !== 'tines', switches: undefined }; };
/** What was built, in a number: every piece's triangles (weighted, so a part moved or changed shows). */
const sig = (b: ReturnType<typeof buildDesign>) => {
  let h = b.pieces.length;
  for (const p of b.pieces) { h += p.positions.length * 7 + p.stl.length; for (let i = 0; i < p.positions.length; i++) h += p.positions[i] * ((i % 97) + 1); }
  return Math.round(h * 1000) / 1000;
};

/** The settings' own checks: their help, and an example of each. */
export function checkForm() {
describe('the settings', () => {
    it('each has its help (or each choice says what it does)', () => {
      const none = fields.filter((f) => !f.help && !(f.choices?.length && f.choices.every((ch) => ch.tip))).map((f) => f.key);
      expect(none).toEqual([]);
    });
    it('each has an example, with every choice in it', () => {
      expect(fields.filter((f) => !SPECS.some((s) => s.key === f.key)).map((f) => f.key)).toEqual([]);
      const missing = fields.flatMap((f) => (f.choices ?? []).filter((ch) => !SPECS.find((s) => s.key === f.key)?.values.map(String).includes(ch.v)).map((ch) => `${f.key}-${ch.v}`));
      expect(missing).toEqual([]);
      expect(SPECS.filter((s) => !fields.some((f) => f.key === s.key)).map((s) => s.key)).toEqual([]);
    });
  });
}

/** The settings of these sections (by title; only: just these of them): each changes what's built, where it applies. */
export function checkSettings(sections: string[], only?: string[]) {
  const keys = new Set(form.filter((sec) => sections.includes(sec.title)).flatMap((sec) => sec.fields.map((f) => f.key)).filter((k) => !only || only.includes(k)));
  describe(`each setting changes what's built, where it applies: ${sections.join(', ')}`, { timeout: 900000 }, () => {
  for (const s of SPECS.filter((x) => keys.has(x.key))) {
    it(s.key, async () => {
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        const w = await kernel(), f = fields.find((x) => x.key === s.key)!;
        const sigs: number[] = [];
        for (const v of s.values) {
          const d = withValue(f, s.base, v);
          // (not greyed out: it applies here)
          expect(f.off?.(ctxOf(d)), `${s.key} = ${v}`).toBeUndefined();
          for (const ch of f.choices ?? []) if (ch.v === String(v)) expect(ch.no?.(ctxOf(d)), `${s.key} = ${v}`).toBeUndefined();
          sigs.push(sig(buildDesign(w, d)));
          // (its solids let go: one kernel builds them all)
          clearBuildCache();
        }
        const n = s.values.length - (s.alike && sigs[s.values.map(String).indexOf(s.alike[0])] === sigs[s.values.map(String).indexOf(s.alike[1])] ? 1 : 0);
        if (s.known) console.warn(`${s.key}: ${s.known}`);
        else expect(new Set(sigs).size, `${s.key}: ${s.values.join(', ')} built ${sigs.join(', ')}`).toBe(n);
      } finally { Object.assign(OPTION_DEFAULTS, saved); }
    });
  }
});
}
