// Undo and redo (history.ts).
import { describe, expect, it } from 'vitest';
import { hashOf, History, HISTORY_KEY, type HistoryStore, keptHistory, loadHistory, saveHistory } from '../src/app/history';

describe('undo and redo', () => {
  it('steps back and forward through the changes', () => {
    const h = new History('a');
    expect([h.canUndo, h.canRedo, h.current]).toEqual([false, false, 'a']);
    h.record('b'); h.record('c');
    expect([h.canUndo, h.canRedo, h.current]).toEqual([true, false, 'c']);
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeUndefined();
    expect([h.canUndo, h.canRedo, h.current]).toEqual([false, true, 'a']);
    expect(h.redo()).toBe('b');
    expect(h.redo()).toBe('c');
    expect(h.redo()).toBeUndefined();
    expect(h.current).toBe('c');
  });
  it('no step for a change that changed nothing', () => {
    const h = new History('a');
    h.record('a');
    expect(h.canUndo).toBe(false);
    h.record('b'); h.record('b');
    expect(h.undo()).toBe('a');
    expect(h.canUndo).toBe(false);
  });
  it('a new change forgets what was undone', () => {
    const h = new History('a');
    h.record('b'); h.record('c');
    h.undo();
    h.record('d');
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe('b');
    expect(h.redo()).toBe('d');
  });
  it('a change that isn\'t a step (the design\'s name) replaces the current one', () => {
    const h = new History('a');
    h.record('b');
    h.amend('b named');
    expect(h.current).toBe('b named');
    expect(h.undo()).toBe('a');
    expect(h.redo()).toBe('b named');
  });
  it('keeps the last steps only: the oldest dropped past its limit', () => {
    const h = new History('0', 5);
    for (let k = 1; k <= 20; k++) h.record(String(k));
    const back: string[] = [];
    for (let j = h.undo(); j !== undefined; j = h.undo()) back.push(j);
    expect(back).toEqual(['19', '18', '17', '16']);
    expect(h.current).toBe('16');
  });
});

/** A browser's storage that keeps text, and can be told to refuse writes over a size. */
function fake(room = Infinity, throwing: Partial<Record<'getItem' | 'setItem' | 'removeItem', boolean>> = {}): HistoryStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => { if (throwing.getItem) throw new Error('blocked'); return data.get(k) ?? null; },
    setItem: (k, v) => { if (throwing.setItem || v.length > room) throw new DOMException('full', 'QuotaExceededError'); data.set(k, v); },
    removeItem: (k) => { if (throwing.removeItem) throw new Error('blocked'); data.delete(k); },
  };
}
const made = (...js: string[]) => { const h = new History(js[0]); for (const j of js.slice(1)) h.record(j); return h; };

describe('history kept across a reload', () => {
  it('comes back with its steps, undo and redo', () => {
    const h = made('a', 'b', 'c', 'd'); h.undo();
    const st = fake();
    expect(saveHistory(st, h)).toBe(true);
    const back = loadHistory(st, 'c')!;
    expect(back.current).toBe('c');
    expect([back.canUndo, back.canRedo]).toEqual([true, true]);
    expect(back.undo()).toBe('b'); expect(back.undo()).toBe('a'); expect(back.undo()).toBeUndefined();
    expect(back.redo()).toBe('b'); expect(back.redo()).toBe('c'); expect(back.redo()).toBe('d');
  });
  it('is thrown away when it is not of the design stored (and removed)', () => {
    const st = fake(); saveHistory(st, made('a', 'b'));
    expect(loadHistory(st, 'x')).toBeUndefined();
    expect(st.data.has(HISTORY_KEY)).toBe(false);
    saveHistory(st, made('a', 'b'));
    expect(loadHistory(st, null)).toBeUndefined();
  });
  it('is thrown away when the text is not a history', () => {
    for (const junk of ['not json', '{}', '{"v":1}', '{"v":2,"hash":"x","past":["a"],"future":[]}', '{"v":1,"hash":"x","past":[],"future":[]}', '{"v":1,"hash":"x","past":[1],"future":[]}', 'null']) {
      const st = fake(); st.data.set(HISTORY_KEY, junk);
      expect(loadHistory(st, 'a')).toBeUndefined();
      expect(st.data.has(HISTORY_KEY)).toBe(false);
    }
  });
  it('a stored hash that is not the design\'s is thrown away', () => {
    const st = fake(); st.data.set(HISTORY_KEY, JSON.stringify({ v: 1, hash: hashOf('zzz'), past: ['a', 'b'], future: [] }));
    expect(loadHistory(st, 'b')).toBeUndefined();
  });
  it('drops the oldest steps to stay within the budget, never the current one', () => {
    const big = (c: string) => c.repeat(400);
    const h = made(big('a'), big('b'), big('c'), big('d'));
    const k = JSON.parse(keptHistory(h, 900));
    expect(k.past).toEqual([big('c'), big('d')]);
    expect(JSON.parse(keptHistory(h, 10)).past).toEqual([big('d')]);
    h.undo(); h.undo();
    const k2 = JSON.parse(keptHistory(h, 900));
    expect(k2.past.at(-1)).toBe(big('b')); expect(k2.past.length + k2.future.length).toBeLessThanOrEqual(2);
  });
  it('the whole of what is kept is about 1 MB at most', () => {
    const h = new History('x'.repeat(100_000));
    for (let i = 0; i < 30; i++) h.record(`${i}`.padEnd(100_000, 'y'));
    expect(keptHistory(h).length).toBeLessThan(1_050_000);
  });
  it('a full browser: tried again with less, then given up on without throwing', () => {
    const h = made('a'.repeat(300_000), 'b'.repeat(300_000), 'c'.repeat(300_000));
    const st = fake(500_000);
    expect(saveHistory(st, h)).toBe(true);
    expect(st.data.get(HISTORY_KEY)!.length).toBeLessThanOrEqual(500_000);
    expect(loadHistory(st, 'c'.repeat(300_000))!.current.length).toBe(300_000);
    const none = fake(10);
    expect(saveHistory(none, h)).toBe(false);
    expect(none.data.has(HISTORY_KEY)).toBe(false);
  });
  it('storage that throws on every call does not throw out of here', () => {
    const st = fake(Infinity, { getItem: true, setItem: true, removeItem: true });
    expect(() => saveHistory(st, made('a', 'b'))).not.toThrow();
    expect(saveHistory(st, made('a', 'b'))).toBe(false);
    expect(loadHistory(st, 'b')).toBeUndefined();
    const st2 = fake(); saveHistory(st2, made('a', 'b'));
    const bad = { ...st2, getItem: st2.getItem, removeItem: () => { throw new Error('blocked'); } };
    expect(() => loadHistory(bad, 'zzz')).not.toThrow();
  });
});

// The design's JSON carries its settings (options, gauge), so one history holds both kinds of change.
const D = (o: Record<string, unknown>, segs: number) => JSON.stringify({ version: 1, gaugeStuds: 4, options: o, routes: [{ name: 'R1', segs: Array.from({ length: segs }, () => ({ kind: 'straight', studs: 8 })) }] });
describe('settings and track edits in one history', () => {
  it('undo and redo walk back and forward through both, in the order they were made', () => {
    const h = new History(D({}, 0), 200);
    h.record(D({ ballast: 'ballast' }, 0), 'ballast');
    h.record(D({ ballast: 'ballast' }, 1));
    h.record(D({ ballast: 'ballast', joint: 'dovetail' }, 1), 'joint');
    expect(h.undo()).toBe(D({ ballast: 'ballast' }, 1));
    expect(h.undo()).toBe(D({ ballast: 'ballast' }, 0));
    expect(h.undo()).toBe(D({}, 0));
    expect(h.redo()).toBe(D({ ballast: 'ballast' }, 0));
    expect(h.redo()).toBe(D({ ballast: 'ballast' }, 1));
    expect(h.redo()).toBe(D({ ballast: 'ballast', joint: 'dovetail' }, 1));
  });
  it('changes to one setting within a second are one step; another setting, or later, is another', () => {
    const h = new History(D({}, 0));
    h.record(D({ printBedX: 201 }, 0), 'printBedX', 1000);
    h.record(D({ printBedX: 202 }, 0), 'printBedX', 1400);
    h.record(D({ printBedX: 203 }, 0), 'printBedX', 1900);
    h.record(D({ printBedX: 203, printBedY: 201 }, 0), 'printBedY', 2000);
    h.record(D({ printBedX: 203, printBedY: 202 }, 0), 'printBedY', 3500);
    expect(h.undo()).toBe(D({ printBedX: 203, printBedY: 201 }, 0));
    expect(h.undo()).toBe(D({ printBedX: 203 }, 0));
    expect(h.undo()).toBe(D({}, 0));
    expect(h.canUndo).toBe(false);
  });
  it('a track edit between two changes of a setting keeps them apart, and so does an undo', () => {
    const h = new History(D({}, 0));
    h.record(D({ a: 1 }, 0), 'a', 1000);
    h.record(D({ a: 1 }, 1), undefined, 1100);
    h.record(D({ a: 2 }, 1), 'a', 1200);
    expect(h.steps().past.length).toBe(4);
    h.undo();
    h.record(D({ a: 3 }, 1), 'a', 1300);
    expect(h.steps().past.length).toBe(4);
    expect(h.undo()).toBe(D({ a: 1 }, 1));
  });
  it('a kept history is of the stored design and its settings: a different setting, or one kept before settings were in it, is dropped', () => {
    const store = (() => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } satisfies HistoryStore; })();
    const h = new History(D({}, 0)); h.record(D({ ballast: 'ballast' }, 0), 'ballast');
    saveHistory(store, h);
    expect(loadHistory(store, D({ ballast: 'ballast' }, 0))?.current).toBe(D({ ballast: 'ballast' }, 0));
    expect(loadHistory(store, D({ ballast: 'buddy' }, 0))).toBeUndefined();
    expect(store.getItem(HISTORY_KEY)).toBeNull();
    store.setItem(HISTORY_KEY, JSON.stringify({ v: 1, hash: 'x', past: ['a'], future: [] }));
    expect(loadHistory(store, D({}, 0))).toBeUndefined();
  });
});
