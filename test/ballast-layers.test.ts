// Ballast layers: 0 (track only), 1 (stepped shoulder), 2 (with a wider bottom layer). A design keeps them as it always
// did ('none', 'ballast', 'buddy'), so one saved before the setting was renamed opens and builds as it was: 'buddy'
// is two layers.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, readDesign } from '../src/app/design';
import { optionForm } from '../src/app/settings';
import { bedSummary } from '../src/app/cardsections';
import { OWN_CHOICES, ownName } from '../src/app/routeown';

// (a file as the app saved it before the rename, word for word)
const OLD = '{"version":1,"gaugeStuds":4,"options":{"legoTrack":"print","ballast":"buddy"},"routes":[{"name":"A","x":0,"y":0,"heading":0,"segs":[{"kind":"straight","studs":16}]}]}';

describe('ballast layers', { timeout: 120000 }, () => {
  it('the setting: Ballast layers, 0, 1 or 2, none of them called a buddy', () => {
    const d = readDesign(JSON.parse(OLD));
    const fields = optionForm(() => d).form.flatMap((s) => s.fields), f = fields.find((x) => x.key === 'ballast')!;
    expect(f.label).toBe('Ballast layers');
    expect(f.choices!.map((c) => [c.v, c.t])).toEqual([['none', '0 (track only)'], ['ballast', '1 (stepped shoulder)'], ['buddy', '2 (with a wider bottom layer)']]);
    expect(OWN_CHOICES.ballast).toEqual(f.choices!.map((c) => c.v));
    expect(ownName('ballast')).toBe('Ballast layers');
    // (no setting's label, choice, help or reason says "buddy")
    const said = (x: unknown): string => (typeof x === 'string' ? x : Array.isArray(x) ? x.map(said).join(' ') : x && typeof x === 'object' ? Object.entries(x).filter(([k]) => k !== 'v' && k !== 'key').map(([, v]) => said(v)).join(' ') : '');
    expect(said(fields)).not.toMatch(/buddy/i);
  });
  it('a design saved with ballast "buddy" opens unchanged and builds on two layers', async () => {
    const d = readDesign(JSON.parse(OLD));
    expect(JSON.stringify(d)).toBe(OLD);
    expect(bedSummary(d, d.routes[0])).toMatch(/^ballast, 2 layers/);
    const w = await kernel(), z = (ballast: NonNullable<Design['options']>['ballast']) => {
      clearBuildCache();
      const b = buildDesign(w, { ...structuredClone(d), options: { ...d.options, ballast } });
      let lo = Infinity; for (const p of b.pieces) for (let i = 2; i < p.positions.length; i += 3) lo = Math.min(lo, p.positions[i]);
      return lo;
    };
    // (each layer a plate, 3.2 mm, under the track)
    expect(z('buddy')).toBeCloseTo(-6.4, 3); expect(z('ballast')).toBeCloseTo(-3.2, 3); expect(z('none')).toBeCloseTo(0, 3);
    clearBuildCache();
  });
});
