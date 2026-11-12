// The settings panel's grouping (src/app/settingsgroups.ts): every setting in one group, a feature that's off listed as
// its switch alone, groups the design doesn't use marked, what's changed counted, every lock saying why.
import { describe, expect, it } from 'vitest';
import { type Design, OPTION_DEFAULTS, type PieceOptions } from '../src/app/design';
import { type OptCtx, optionForm } from '../src/app/settings';
import { designFacts, GROUPS, groupFields, groupView, resetFields, unusedWhy } from '../src/app/settingsgroups';

const base = (): Design => ({ version: 1, gaugeStuds: 4, routes: [{ name: 'R1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }] }] });
let cur = base();
const { form } = optionForm(() => cur);
const ctxOf = (d: Design, switches?: boolean): OptCtx => { const o = { ...OPTION_DEFAULTS, ...d.options } as PieceOptions; return { o, ballast: o.ballast !== 'none', fdb: o.mechStyle !== 'tines', switches }; };
const view = (d: Design, q = '', switches?: boolean) => { cur = d; return groupView(form, ctxOf(d, switches), designFacts(d, switches), q); };
const rowKeys = (d: Design, id: string, q = '') => view(d, q).find((g) => g.group.id === id)?.rows.map((r) => r.f.key) ?? [];

describe('settings groups', () => {
  it('every setting is in exactly one group, and every group key is a setting', () => {
    const keys = form.flatMap((s) => s.fields.map((f) => f.key)), grouped = GROUPS.flatMap((g) => g.keys);
    expect(keys.length).toBeGreaterThan(70);
    expect(keys.filter((k) => !grouped.includes(k))).toEqual([]);
    expect(grouped.filter((k) => !keys.includes(k))).toEqual([]);
    expect(grouped.filter((k, i) => grouped.indexOf(k) !== i)).toEqual([]);
    expect(new Set(GROUPS.map((g) => g.id)).size).toBe(GROUPS.length);
    expect(new Set(GROUPS.map((g) => g.title)).size).toBe(GROUPS.length);
  });
  it('every locked state has a reason, in words', () => {
    // (each setting's lock asked in every combination of the choices that other settings lock on)
    const axes: [keyof PieceOptions, unknown[]][] = [['ballast', ['none', 'ballast', 'buddy']], ['sleepers', ['bed', 'sleepers']], ['trackBallast', ['together', 'apart']], ['bottomStyle', ['antistud', 'float']], ['undersideGrid', ['baseplate', 'track']],
      ['mechStyle', ['plates', 'tines']], ['bladeStyle', ['sprung', 'simple', 'prototype']], ['throwStyle', ['built-in', 'nail', 'stand']], ['joint', ['lego', 'butt', 'axle', 'flataxle']], ['splitTrack', ['bed', 'lengths']], ['monoAxleHoles', [true, false]], ['monoSupportStuds', [0, 16]], ['labelText', ['', 'X']]];
    let combos: Partial<PieceOptions>[] = [{}];
    for (const [k, vs] of axes) combos = combos.flatMap((c) => vs.map((v) => ({ ...c, [k]: v })));
    const reasons = new Set<string>();
    for (const opts of combos.filter((_, i) => i % 7 === 0)) {
      const d = { ...base(), options: opts }; cur = d;
      for (const f of form.flatMap((s) => s.fields)) {
        const c = ctxOf(d, true), why = f.off?.(c);
        if (why !== undefined) { expect(why.trim().length, f.key).toBeGreaterThan(6); reasons.add(`${f.key}: ${why}`); }
        for (const ch of f.choices ?? []) { const w = ch.no?.(c); if (w !== undefined) expect(w.trim().length, `${f.key}-${ch.v}`).toBeGreaterThan(6); }
      }
    }
    expect(reasons.size).toBeGreaterThan(10);
  });
  it('a feature that is off is its switch alone', () => {
    const d = base();
    expect(rowKeys({ ...d, options: { ballast: 'none' } }, 'ballast')).toEqual(['sleepers', 'ballast']);
    expect(rowKeys({ ...d, options: { ballast: 'ballast', trackBallast: 'together' } }, 'ballast')).toEqual(['sleepers', 'ballast', 'ballastLeftStuds', 'ballastRightStuds', 'ballastEnds', 'trackBallast']);
    expect(rowKeys({ ...d, options: { ballast: 'none', sleepers: 'sleepers' } }, 'ballast')).toEqual(['sleepers', 'sleeperWidthStuds', 'sleeperGapStuds', 'ballast']);
    expect(rowKeys({ ...d, options: { monoSupportStuds: 0 } }, 'monosup')).toEqual(['monoSupportStuds']);
    expect(rowKeys({ ...d, options: { monoSupportStuds: 32 } }, 'monosup')).toHaveLength(9);
    expect(rowKeys({ ...d, options: { labelText: '' } }, 'labels')).not.toContain('labelSize');
    expect(rowKeys({ ...d, options: { labelText: 'A' } }, 'labels')).toContain('labelSize');
    // (the points' mechanism: only its own settings)
    expect(rowKeys({ ...d, options: { mechStyle: 'plates' } }, 'points')).toContain('pointBlades');
    expect(rowKeys({ ...d, options: { mechStyle: 'plates' } }, 'points')).not.toContain('springLength');
    expect(rowKeys({ ...d, options: { mechStyle: 'tines' } }, 'points')).toContain('springLength');
    expect(rowKeys({ ...d, options: { mechStyle: 'tines' } }, 'points')).not.toContain('bladeStyle');
  });
  it('searching finds a setting whose feature is off, locked, in its group', () => {
    const d = { ...base(), options: { ballast: 'none' as const } };
    expect(rowKeys(d, 'fits', 'seat')).toContain('trackFitTol');
    const g = view(d, 'seat');
    expect(g.every((x) => x.rows.length > 0)).toBe(true);
    expect(g.flatMap((x) => x.rows).find((r) => r.f.key === 'trackFitTol')?.off).toMatch(/ballast/);
    expect(view(d, 'zzzz nothing')).toEqual([]);
  });
  it('groups the design cannot use are marked, and still hold their settings', () => {
    const train = base();
    const f = designFacts(train, undefined);
    expect(unusedWhy(GROUPS.find((g) => g.id === 'mono')!, f)).toMatch(/monorail/);
    expect(unusedWhy(GROUPS.find((g) => g.id === 'bank')!, f)).toMatch(/banked/);
    expect(unusedWhy(GROUPS.find((g) => g.id === 'buffer')!, f)).toMatch(/buffer/);
    expect(unusedWhy(GROUPS.find((g) => g.id === 'points')!, designFacts(train, false))).toMatch(/switches/);
    expect(unusedWhy(GROUPS.find((g) => g.id === 'points')!, designFacts(train, undefined))).toBeUndefined();
    expect(unusedWhy(GROUPS.find((g) => g.id === 'track')!, f)).toBeUndefined();
    const marked = view(train, '', false).filter((g) => g.unused).map((g) => g.group.id);
    expect(marked).toEqual(['points', 'bank', 'buffer', 'mono', 'monosup']);
    // (a monorail-only design has no use for the train track groups; an empty design marks nothing)
    const mono = { ...base(), routes: [{ ...base().routes[0], system: 'monorail' as const }] } as Design;
    expect(view(mono).filter((g) => g.unused).map((g) => g.group.id)).toContain('ballast');
    expect(view({ ...base(), routes: [] }).filter((g) => g.unused)).toEqual([]);
    // (their settings are not locked: they're the design's defaults)
    for (const id of ['mono', 'bank', 'buffer']) for (const r of view(train).find((g) => g.group.id === id)!.rows) expect(r.off, r.f.key).toBeUndefined();
  });
  it('counts what is away from the default, and a group resets', () => {
    const d: Design = { ...base(), gaugeStuds: 5, options: { ballast: 'buddy', printBedX: 300, joint: 'dovetail' } };
    const by = (g: string) => view(d).find((x) => x.group.id === g)!;
    expect(by('ballast').changed).toBe(1); expect(by('ballast').summary).toBe('1 changed');
    expect(by('bed').changed).toBe(1);
    expect(by('track').changed).toBe(1); // (the gauge)
    expect(by('fits').summary).toBe('');
    resetFields(d, groupFields(form, by('track').group));
    expect(d.gaugeStuds).toBe(4);
    resetFields(d, groupFields(form, by('ballast').group));
    expect(d.options).toEqual({ printBedX: 300, joint: 'dovetail' });
    expect(view(d).reduce((n, g) => n + g.changed, 0)).toBe(2);
  });
});
