import { describe, expect, it } from 'vitest';
import type { Design } from '../src/app/design';
import { deleteMine, designOfSelection, importMine, listMine, MINE_KEY, MINE_MAX_COUNT, renameMine, type StorageLike, saveMine, uniqueName, UNAVAILABLE, usedText } from '../src/app/mytemplates';

const fake = (): StorageLike & { data: Map<string, string> } => { const data = new Map<string, string>(); return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }; };
const d = (name = 'Yard', extra: Partial<Design> = {}): Design => ({ version: 1, gaugeStuds: 4, name, routes: [{ name: 'R1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }] }], ...extra });

describe('saving templates', () => {
  it('saves, lists and reads back through readDesign, with the design’s settings', () => {
    const st = fake(), res = saveMine(st, 'My yard', d('x', { options: { ballast: 'ballast' } }), 1000);
    expect(res).toMatchObject({ ok: true, name: 'My yard' });
    const l = listMine(st);
    expect(l.entries.length).toBe(1);
    expect(l.entries[0]).toMatchObject({ name: 'My yard', at: 1000 });
    expect(l.entries[0].design?.options).toEqual({ ballast: 'ballast' });
    expect(usedText(l)).toMatch(/^1 of 60 templates, \d+ KB of \d+ KB$/);
  });
  it('makes names unique: "name 2"', () => {
    const st = fake();
    saveMine(st, 'Loop', d(), 1); saveMine(st, 'loop', d(), 2); saveMine(st, 'Loop', d(), 3);
    expect(listMine(st).entries.map((e) => e.name).sort()).toEqual(['Loop', 'Loop 3', 'loop 2']);
    expect(uniqueName(['a', 'a 2'], 'a')).toBe('a 3');
    expect(uniqueName([], '  ')).toBe('Template');
  });
  it('lists the newest first', () => {
    const st = fake(); saveMine(st, 'old', d(), 1); saveMine(st, 'new', d(), 9);
    expect(listMine(st).entries.map((e) => e.name)).toEqual(['new', 'old']);
  });
  it('renames (unique among the others) and deletes', () => {
    const st = fake(), a = saveMine(st, 'A', d(), 1), b = saveMine(st, 'B', d(), 2);
    if (!a.ok || !b.ok) throw new Error('save');
    expect(renameMine(st, b.id, 'A')).toMatchObject({ ok: true, name: 'A 2' });
    expect(renameMine(st, a.id, 'A')).toMatchObject({ ok: true, name: 'A' });
    expect(deleteMine(st, a.id)).toMatchObject({ ok: true });
    expect(listMine(st).entries.map((e) => e.name)).toEqual(['A 2']);
    expect(deleteMine(st, 'nope')).toMatchObject({ ok: false });
    expect(renameMine(st, 'nope', 'x')).toMatchObject({ ok: false });
  });
});

describe('importing a file', () => {
  it('reads a design, named by it or the file', () => {
    const st = fake();
    expect(importMine(st, JSON.stringify(d('From file')), 'x.btd.json', 5)).toMatchObject({ ok: true, name: 'From file' });
    expect(importMine(st, JSON.stringify({ ...d(), name: undefined }), 'loop.btd.json', 6)).toMatchObject({ ok: true, name: 'loop' });
  });
  it('refuses what is not a design, with a reason, and saves nothing', () => {
    const st = fake();
    for (const [text, re] of [['not json {', /isn't JSON|isn't a track design/], ['[]', /isn't a track design/], ['{"routes":[{"x":1}]}', /route 1/], [JSON.stringify({ version: 1, gaugeStuds: 4, routes: [] }), /no routes or tables/]] as const) {
      const r = importMine(st, text, 'bad.btd.json');
      expect(r.ok).toBe(false); expect(!r.ok && r.why).toMatch(re);
    }
    expect(listMine(st).entries.length).toBe(0);
  });
});

describe('when storage fails or is full', () => {
  it('says so with no storage, and throwing storage', () => {
    expect(listMine(undefined).unavailable).toBe(UNAVAILABLE);
    expect(saveMine(undefined, 'x', d())).toEqual({ ok: false, why: UNAVAILABLE });
    const boom: StorageLike = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(listMine(boom).unavailable).toBe(UNAVAILABLE);
    expect(saveMine(boom, 'x', d())).toEqual({ ok: false, why: UNAVAILABLE });
    expect(deleteMine(boom, 'x')).toEqual({ ok: false, why: UNAVAILABLE });
  });
  it('a quota error on write is a plain reason, nothing lost', () => {
    const st = fake(); saveMine(st, 'kept', d(), 1);
    const full: StorageLike = { getItem: (k) => st.getItem(k), setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } };
    const r = saveMine(full, 'more', d(), 2);
    expect(!r.ok && r.why).toMatch(/no room/);
    expect(listMine(st).entries.map((e) => e.name)).toEqual(['kept']);
  });
  it('stops at the cap, saying how much it keeps', () => {
    const st = fake();
    for (let k = 0; k < MINE_MAX_COUNT; k++) expect(saveMine(st, `t${k}`, d(), k).ok).toBe(true);
    const r = saveMine(st, 'one too many', d(), 99);
    expect(!r.ok && r.why).toMatch(/60 saved templates/);
    const big = d('big', { routes: Array.from({ length: 1 }, () => ({ name: 'R', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight' as const, studs: 1 }], pad: 'x'.repeat(1_100_000) })) as never });
    const r2 = saveMine(fake(), 'big', big);
    expect(!r2.ok && r2.why).toMatch(/KB it keeps/);
  });
});

describe('damaged entries', () => {
  it('are listed as damaged, can be deleted, and do not break the rest', () => {
    const st = fake(); saveMine(st, 'good', d(), 1);
    const list = JSON.parse(st.data.get(MINE_KEY)!);
    list.push({ v: 1, id: 'bad1', name: 'broken', at: 5, design: { routes: 'none' } }, { v: 7, id: 'bad2', name: 'future', at: 4, design: {} }, { id: 'bad3', name: 'no version', at: 3 });
    st.setItem(MINE_KEY, JSON.stringify(list));
    const l = listMine(st);
    expect(l.entries.map((e) => [e.name, !!e.damaged])).toEqual([['broken', true], ['future', true], ['no version', true], ['good', false]]);
    expect(l.entries[0].damaged).toMatch(/isn't a track design/);
    expect(l.entries[1].damaged).toMatch(/newer version/);
    expect(deleteMine(st, 'bad1')).toMatchObject({ ok: true });
    expect(listMine(st).entries.length).toBe(3);
  });
  it('a blob that is not a list at all lists as empty (and saving starts again)', () => {
    const st = fake(); st.setItem(MINE_KEY, '{{{');
    expect(listMine(st).entries).toEqual([]);
    expect(saveMine(st, 'x', d(), 1).ok).toBe(true);
    expect(listMine(st).entries.length).toBe(1);
  });
});

describe('a selection as a template', () => {
  it('takes the routes, tables and the edits on them, the design’s settings', () => {
    const base: Design = { version: 1, gaugeStuds: 4, options: { ballast: 'ballast' }, routes: [
      { name: 'A', x: 0, y: 0, heading: 0, locked: true, segs: [{ kind: 'straight', studs: 8 }] }, { name: 'B', x: 20, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }] }],
      tables: [{ shape: 'rect', x: 0, y: 0, w: 4, h: 4, locked: true }, { shape: 'rect', x: 50, y: 0, w: 4, h: 4 }],
      trackwork: { throw: { '10,10': { on: ['A', 's', 10, 0], side: 'left' }, '300,10': { on: ['B', 's', 10, 0], side: 'right' } } } as never };
    const s = designOfSelection(base, [0], [0]);
    expect(s.routes.map((r) => r.name)).toEqual(['A']); expect(s.routes[0].locked).toBeUndefined();
    expect(s.tables?.length).toBe(1); expect(s.tables?.[0].locked).toBeUndefined();
    expect(s.options).toEqual({ ballast: 'ballast' });
    expect(Object.keys((s.trackwork as unknown as { throw: object }).throw)).toEqual(['10,10']);
  });
});
