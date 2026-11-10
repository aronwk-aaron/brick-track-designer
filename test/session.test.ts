// When replacing the design asks first, and what happens when another tab writes the browser's kept design.
import { describe, expect, it } from 'vitest';
import { TabStore, unsaved } from '../src/app/session';

const d = (n: number) => JSON.stringify({ version: 1, gaugeStuds: 4, routes: Array.from({ length: n }, (_, k) => ({ name: `R${k}` })) });

describe('changes not saved to a file', () => {
  it('an empty plan has none; a design as last saved, opened or loaded has none; a changed one has', () => {
    expect(unsaved(d(0), null)).toBe(false);
    expect(unsaved(d(2), d(2))).toBe(false);
    expect(unsaved(d(2), null)).toBe(true);
    expect(unsaved(d(3), d(2))).toBe(true);
    expect(unsaved(JSON.stringify({ routes: [], tables: [{}] }), null)).toBe(true); // (tables alone are work too)
    expect(unsaved('not json', null)).toBe(true);
  });
});

describe('two tabs on the one kept design', () => {
  it("another tab's newer design stops this one writing until one is chosen", () => {
    const t = new TabStore(d(1));
    expect(t.mayWrite).toBe(true);
    expect(t.changedElsewhere(d(1), d(1))).toBe(false); // (the same design: nothing to ask)
    expect(t.changedElsewhere(null, d(1))).toBe(false); // (the store cleared)
    t.wrote(d(2));
    expect(t.changedElsewhere(d(2), d(3))).toBe(false); // (this tab's own last write, come back)
    expect(t.changedElsewhere(d(5), d(2))).toBe(true);
    expect(t.mayWrite).toBe(false);
    expect(t.choose('other')).toBe(d(5));
    expect(t.mayWrite).toBe(true);
    expect(t.changedElsewhere(d(6), d(5))).toBe(true);
    expect(t.choose('mine')).toBeUndefined();
    expect(t.mayWrite).toBe(true);
  });
});
