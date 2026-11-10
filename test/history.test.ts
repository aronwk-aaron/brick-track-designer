// Undo and redo (history.ts).
import { describe, expect, it } from 'vitest';
import { History } from '../src/app/history';

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
