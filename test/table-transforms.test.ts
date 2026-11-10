// Tables moved with the routes: mirror, turn, and the box that selects them.
import { describe, expect, it } from 'vitest';
import { mirroredTable, movedTable, onTable, type Table, tableInBox, tableMiddle, turnedTable } from '../src/app/tables';

const rect: Table = { shape: 'rect', x: 10, y: 20, w: 30, h: 8 };
const arc: Table = { shape: 'arc', cx: 0, cy: 0, r0: 10, r1: 20, a0: 10, a1: 50 };
const poly: Table = { shape: 'poly', pts: [[0, 0], [10, 0], [10, 5], [0, 5]] };
const mid = (t: Table) => tableMiddle(t);

describe('mirroring a table about x = px', () => {
  it('a rectangle lands on the other side, the same size', () => {
    expect(mirroredTable(rect, 0)).toMatchObject({ shape: 'rect', x: -40, y: 20, w: 30, h: 8 });
  });
  it('twice is where it was', () => {
    for (const t of [rect, arc, poly]) {
      const back = mirroredTable(mirroredTable(t, 7), 7);
      expect(mid(back)[0]).toBeCloseTo(mid(t)[0], 6); expect(mid(back)[1]).toBeCloseTo(mid(t)[1], 6);
    }
  });
  it('a point on the table goes to the mirrored point on the mirrored table', () => {
    for (const [t, q] of [[rect, [12, 22]], [arc, [12, 6]], [poly, [3, 2]]] as [Table, [number, number]][]) {
      expect(onTable(t, q)).toBe(true);
      expect(onTable(mirroredTable(t, 5), [10 - q[0], q[1]])).toBe(true);
    }
  });
  it('an arc keeps its angles in order', () => {
    const m = mirroredTable(arc, 0);
    expect(m).toMatchObject({ shape: 'arc', cx: 0, a0: 130, a1: 170 });
  });
});

describe('turning a table about a point', () => {
  it('a quarter turn of a rectangle: still a rectangle, width and height swapped', () => {
    const t = turnedTable(rect, 0, 0, 90);
    expect(t).toMatchObject({ shape: 'rect', w: 8, h: 30 });
    expect(onTable(t, [-24, 25])).toBe(true);   // (the point 14, 24 turned a quarter turn: -24, 14)
  });
  it('four quarter turns are no turn', () => {
    for (const t of [rect, arc, poly]) {
      let u = t;
      for (let k = 0; k < 4; k++) u = turnedTable(u, 3, -2, 90);
      expect(mid(u)[0]).toBeCloseTo(mid(t)[0], 3); expect(mid(u)[1]).toBeCloseTo(mid(t)[1], 3);
    }
  });
  it('an arc turns its centre and its angles', () => {
    expect(turnedTable(arc, 0, 0, -90)).toMatchObject({ shape: 'arc', a0: -80, a1: -40 });
  });
  it('a point on the table goes where the same turn puts it', () => {
    const q: [number, number] = [3, 2], r: [number, number] = [-2, 3];   // 90 degrees about the origin
    expect(onTable(turnedTable(poly, 0, 0, 90), r)).toBe(true);
    expect(onTable(poly, q)).toBe(true);
  });
  it('an odd angle makes a rectangle an outline', () => {
    expect(turnedTable(rect, 0, 0, 30).shape).toBe('poly');
  });
});

describe('a box and a table', () => {
  it('selects it only when the whole of it is inside', () => {
    expect(tableInBox(rect, 0, 0, 50, 30)).toBe(true);
    expect(tableInBox(rect, 0, 0, 35, 30)).toBe(false);
    expect(tableInBox(arc, -30, -30, 30, 30)).toBe(true);
    expect(tableInBox(arc, 0, 0, 30, 10)).toBe(false);
  });
  it('a moved table is still in step with movedTable', () => {
    expect(tableInBox(movedTable(rect, 100, 0), 0, 0, 50, 30)).toBe(false);
  });
});
