import { describe, expect, it } from 'vitest';
import { TEMPLATES, TEMPLATE_GROUPS, type Design } from '../src/app/design';
import {
  KINDS, KIND_LABEL, REFERENCE_GROUP, REFERENCE_SECTIONS, buildCatalog, cardFor, cardsOf, countOf, describe as describeCard, filterCards, handOf,
  kindOf, kindsOf, noFilters, planPicture, radiiIn, radiiOf, sectionsOf, swapHand, withoutHand, type Filters,
} from '../src/app/templatecatalog';

const infos = buildCatalog();
const byName = new Map(infos.map((t) => [t.name, t]));
const info = (n: string) => byName.get(n)!;

describe('the template catalog', () => {
  it('has every template once, in its group', () => {
    const all = TEMPLATE_GROUPS.flatMap(([, ns]) => ns);
    expect(infos.map((t) => t.name)).toEqual(all);
    for (const [g, ns] of TEMPLATE_GROUPS) for (const n of ns) expect(info(n).group).toBe(g);
  });

  it('gives every template a kind (none unknown) and a section', () => {
    for (const t of infos) {
      expect(KINDS, t.name).toContain(t.kind);
      expect(t.section, t.name).toBeTruthy();
    }
    // every kind in use has a plain label
    for (const k of kindsOf(infos)) expect(KIND_LABEL[k]).toBeTruthy();
  });

  it('reads kinds from names', () => {
    const k = (n: string, g = 'Reference trackwork') => kindOf(n, g);
    expect(k('Switch R104 left')).toBe('switch');
    expect(k('Left switch (LEGO)', 'Switches')).toBe('switch');
    expect(k('Narrow-gauge switch R36 left')).toBe('switch');
    expect(k('Yard switch R40 left')).toBe('switch');
    expect(k('Curved switch R40 90° left')).toBe('curved switch');
    expect(k('Wye R40 left, R56 right')).toBe('wye');
    expect(k('Wye R104, 8-stud gap')).toBe('wye');
    expect(k('Three-way R40')).toBe('three-way');
    expect(k('Three-way, 2-stud gap')).toBe('next-track switch');
    expect(k('Switch, 2-stud gap, left')).toBe('next-track switch');
    expect(k('Switch to the next track, no gap, right')).toBe('next-track switch');
    expect(k('Crossing 45° left')).toBe('crossing');
    expect(k('Curved crossing R56')).toBe('curved crossing');
    expect(k('Pass-through crossing R72 (A) left')).toBe('curved crossing');
    expect(k('Double slip R40 45°')).toBe('slip');
    expect(k('Single slip R40 45°')).toBe('slip');
    expect(k('Crossover, 4-stud gap, left')).toBe('crossover');
    expect(k('Narrow-gauge double crossover R36')).toBe('crossover');
    expect(k('Buffer stop')).toBe('buffer');
    expect(k('Oval (LEGO R40)', 'Layouts')).toBe('layout');
    expect(k('Banked curve', 'Features')).toBe('feature');
    expect(k('Anything', 'Test prints')).toBe('test print');
    expect(k('Wye with a crossover', 'Layouts')).toBe('layout');
    expect(k('Some switch', 'Monorail')).toBe('monorail');
  });

  it('reads hand from names, and swaps it', () => {
    expect(handOf('Switch R104 left')).toBe('left');
    expect(handOf('Right switch (LEGO)')).toBe('right');
    expect(handOf('Double-track return loop (turning right)')).toBe('right');
    expect(handOf('Switch, 2-stud gap, left')).toBe('left');
    expect(handOf('Wye R40 left, R56 right')).toBe('none');
    expect(handOf('Wye R40')).toBe('none');
    expect(handOf('Playwright')).toBe('none');
    expect(swapHand('Left switch (LEGO)')).toBe('Right switch (LEGO)');
    expect(swapHand('Switch R104 left, lever on the straight side')).toBe('Switch R104 right, lever on the straight side');
    expect(swapHand('Double-track return loop (turning right)')).toBe('Double-track return loop (turning left)');
    expect(withoutHand('Left switch (LEGO)')).toBe('Switch (LEGO)');
    expect(withoutHand('Switch R104 left, lever on the straight side')).toBe('Switch R104, lever on the straight side');
    expect(withoutHand('Switch to the next track, no gap, left')).toBe('Switch to the next track, no gap');
    expect(withoutHand('Double-track return loop (turning left)')).toBe('Double-track return loop');
    expect(withoutHand('Wye R40 left, R56 right')).toBe('Wye R40 left, R56 right');
  });

  it('every left or right pair exists both ways, and no card has a hand word left in its title', () => {
    for (const t of infos) {
      if (t.hand === 'none') { expect(t.twin, t.name).toBeUndefined(); continue; }
      expect(t.twin, `${t.name} has no other hand`).toBeTruthy();
      expect(TEMPLATES[t.twin!], `${t.name}'s twin ${t.twin} is not a template`).toBeTruthy();
      const o = info(t.twin!);
      expect(o.twin, t.name).toBe(t.name);
      expect(o.hand, t.name).toBe(t.hand === 'left' ? 'right' : 'left');
      expect(o.kind, t.name).toBe(t.kind);
      expect(o.title, t.name).toBe(t.title);
      expect(o.group, t.name).toBe(t.group);
      expect(handOf(t.title), t.name).toBe('none');
    }
  });

  it('shows a pair once, and counts every template once', () => {
    const cards = cardsOf(infos);
    expect(cards.every((c) => c.hand !== 'right' || !c.twin)).toBe(true);
    expect(cards.reduce((a, c) => a + countOf(c), 0)).toBe(infos.length);
    expect(cardFor(infos, 'Right switch (LEGO)')!.name).toBe('Left switch (LEGO)');
    expect(cardFor(infos, 'Wye R40')!.name).toBe('Wye R40');
    expect(cardFor(infos, 'nope')).toBeUndefined();
  });

  it('reads radius, gauge, track system, size and routes', () => {
    expect(radiiIn('Wye R40 left, R56 right')).toEqual([40, 56]);
    expect(info('Switch R104 left').radius).toBe(104);
    expect(info('Left switch (LEGO)').radius).toBe(40);        // from its curves
    expect(info('Switch, 2-stud gap, left').radius).toBeUndefined(); // fitted, not a whole radius
    expect(info('Narrow-gauge switch R36 left').gauge).toBe('narrow');
    expect(info('Dual gauge switch R40 left').gauge).toBe('dual');
    expect(info('Narrow gauge beside and across standard track').gauge).toBe('mixed');
    expect(info('Switch R40 left').gauge).toBe('standard');
    expect(info('Monorail oval on supports').system).toBe('monorail');
    expect(info('Switch R40 left').system).toBe('train');
    expect(info('Switch R40 left').routes).toBe(2);
    expect(info('Three-way R40').routes).toBe(3);
    for (const t of infos) {
      expect(t.length, t.name).toBeGreaterThanOrEqual(t.width);
      expect(t.length, t.name).toBeGreaterThan(0);
      if (/^Narrow-gauge/.test(t.name)) expect(['narrow', 'mixed'], t.name).toContain(t.gauge);
      if (/^Dual gauge/.test(t.name)) expect(t.gauge, t.name).toBe('dual');
    }
    expect(info('Switch R104 left').length).toBeGreaterThan(30);
  });

  it('describes a card in plain words', () => {
    expect(describeCard(info('Switch R104 left'))).toMatch(/^Switch · R104 · \d+ × \d+ studs$/);
    expect(describeCard(info('Narrow-gauge switch R36 left'))).toMatch(/^Switch · narrow gauge · R36 · /);
    expect(describeCard(info('Buffer stop'))).toMatch(/^Buffer stop · \d+ × \d+ studs$/);
    for (const t of infos) expect(describeCard(t), t.name).not.toMatch(/openscad|undefined|NaN/i);
  });
});

describe('sections', () => {
  const cards = cardsOf(infos), secs = sectionsOf(cards);
  it('lists every card once, stock groups first, reference trackwork by kind', () => {
    expect(secs.reduce((a, s) => a + s.cards.length, 0)).toBe(cards.length);
    const stock = TEMPLATE_GROUPS.map(([g]) => g).filter((g) => g !== REFERENCE_GROUP);
    expect(secs.slice(0, stock.length).map((s) => s.title)).toEqual(stock);
    expect(secs.slice(stock.length).every((s) => s.parent === REFERENCE_GROUP)).toBe(true);
    expect(secs.slice(stock.length).map((s) => s.title)).toEqual(REFERENCE_SECTIONS.filter((t) => secs.some((s) => s.title === t && s.parent)));
    expect(new Set(secs.map((s) => s.id)).size).toBe(secs.length);
  });
  it('has no "Other parts" pile of more than a few', () => {
    expect(secs.find((s) => s.title === 'Other parts')?.cards.length ?? 0).toBeLessThan(4);
  });
  it('orders switches by radius', () => {
    const r = secs.find((s) => s.title === 'Switches' && s.parent)!.cards.map((c) => c.radius!);
    expect(r).toEqual([...r].sort((a, b) => a - b));
  });
  it('puts narrow gauge and dual or mixed gauge in sections of their own', () => {
    for (const s of secs.filter((x) => x.parent)) for (const c of s.cards) {
      if (c.gauge === 'narrow') expect(s.title).toBe('Narrow gauge');
      if (c.gauge === 'dual' || c.gauge === 'mixed') expect(s.title).toBe('Dual and mixed gauge');
    }
  });
  it('leaves out sections with no cards', () => {
    expect(sectionsOf([]).length).toBe(0);
    expect(sectionsOf(cards.filter((c) => c.kind === 'wye')).every((s) => s.cards.length)).toBe(true);
  });
});

describe('search and filters', () => {
  const cards = cardsOf(infos);
  const f = (o: Partial<Filters>): Filters => ({ ...noFilters(), ...o });
  const names = (o: Partial<Filters>) => filterCards(cards, f(o)).map((c) => c.name);
  it('passes everything with no filters', () => { expect(filterCards(cards, noFilters())).toEqual(cards); });
  it('needs every word, in any case, in the name or the kind', () => {
    expect(names({ query: 'switch r104' }).every((n) => /r104/i.test(n))).toBe(true);
    expect(names({ query: 'switch r104' }).length).toBeGreaterThan(1);
    expect(names({ query: 'SWITCH r104 straight' })).toEqual(['Switch R104 left, lever on the straight side']);
    expect(names({ query: 'wye' }).length).toBeGreaterThan(5);
    expect(names({ query: 'pass-through' }).length).toBe(4);
    expect(names({ query: 'curved crossing' }).length).toBeGreaterThan(5);
    expect(names({ query: 'zzzz' })).toEqual([]);
    expect(names({ query: 'switch zzzz' })).toEqual([]);
  });
  it('finds a card by its other hand\'s name too', () => {
    expect(names({ query: 'right switch lego' })).toEqual(['Left switch (LEGO)']);
  });
  it('filters by kind, gauge, track and radius, and combines them', () => {
    expect(names({ kinds: new Set(['wye']) }).every((n) => /wye/i.test(n))).toBe(true);
    expect(names({ kinds: new Set(['wye', 'three-way']) }).length).toBeGreaterThan(names({ kinds: new Set(['wye']) }).length);
    expect(names({ gauges: new Set(['narrow']) }).every((n) => /^Narrow-gauge/.test(n))).toBe(true);
    expect(names({ systems: new Set(['monorail']) }).length).toBe(4);
    const r104 = names({ radii: new Set([104]) });
    expect(r104.length).toBeGreaterThan(3);
    const both = names({ radii: new Set([104]), kinds: new Set(['switch']), query: 'lever' });
    expect(both).toEqual(['Switch R104 left, lever on the straight side']);
    expect(names({ radii: new Set([104]), gauges: new Set(['narrow']) })).toEqual([]);
  });
  it('lists the radii and kinds present', () => {
    const rs = radiiOf(cards);
    expect(rs).toEqual([...rs].sort((a, b) => a - b));
    expect(rs).toContain(104);
    expect(kindsOf(cards)).toContain('wye');
  });
});

describe('the plan picture', () => {
  const sw = TEMPLATES['Switch R104 left'];
  it('draws each route: centre line and two rails, in studs', () => {
    const p = planPicture(sw);
    expect(p.lines.length).toBe(2);
    for (const l of p.lines) {
      expect(l.centre.length).toBeGreaterThan(1);
      expect(l.rails.length).toBe(2);
      expect(l.rails[0].length).toBe(l.centre.length);
      expect(l.gauge).toBe(5);
      for (const [x, y] of l.centre) { expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true); }
    }
    const [x0, y0, x1, y1] = p.box;
    expect(Math.max(x1 - x0, y1 - y0)).toBeGreaterThan(40);
    expect(Math.min(x1 - x0, y1 - y0)).toBeGreaterThan(5);
  });
  it('puts the rails half the gauge either side of a straight', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 10 }] }] };
    const [l] = planPicture(d).lines;
    const [a, b] = l.rails;
    expect(Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1])).toBeCloseTo(5, 6);
    expect(Math.hypot(l.centre[0][0] - l.centre.at(-1)![0], l.centre[0][1] - l.centre.at(-1)![1])).toBeCloseTo(10, 6);
  });
  it('draws a curve in small steps, a monorail as a beam, and every template without trouble', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 90 }] }] };
    expect(planPicture(d).lines[0].centre.length).toBeGreaterThan(20);
    const m = planPicture(TEMPLATES['Monorail oval on supports']);
    expect(m.lines.every((l) => l.mono && l.rails.length === 0)).toBe(true);
    for (const name of Object.keys(TEMPLATES)) {
      const p = planPicture(TEMPLATES[name]);
      expect(p.lines.length, name).toBe(TEMPLATES[name].routes.length);
      expect(p.box.every(Number.isFinite), name).toBe(true);
    }
  });
});
