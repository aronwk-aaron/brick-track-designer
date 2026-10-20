// The editor's helpers: route names, and what the plan says set each lever's side (checked against the build).
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { type Design, TEMPLATES, freeName } from '../src/app/design';
import { type Overlay, leverSide, leverSlides } from '../src/app/canvas';

describe('route names', () => {
  it('a new route gets a name no route has', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [
      { name: 'T2', x: 0, y: 0, heading: 0, segs: [] }, { name: 'T3', x: 0, y: 0, heading: 0, segs: [] }] };
    expect(freeName(d, 'T')).toBe('T4');
    expect(freeName(d, 'R')).toBe('R3');
    expect(freeName({ ...d, routes: [] }, 'T')).toBe('T1');
  });
});

describe('levers', () => {
  it('slide along only on tines', () => {
    expect(leverSlides({ version: 1, gaugeStuds: 4, routes: [] })).toBe(false);
    expect(leverSlides({ version: 1, gaugeStuds: 4, routes: [], options: { mechStyle: 'tines' } })).toBe(true);
  });
});

/** The plan's overlay for a design (the build stopped as soon as it has it). */
async function overlayOf(d: Design): Promise<Overlay> {
  const w = await kernel();
  let got: Overlay | undefined;
  try { buildDesign(w, d, () => {}, (o) => { got = o as Overlay; throw new Error('enough'); }); } catch (e) { if (!got) throw e; }
  return got!;
}

describe('what set a lever\'s side, as the plan says it', { timeout: 60000 }, () => {
  const left = TEMPLATES['Left switch (LEGO)'];
  const lever = async (d: Design) => {
    const o = await overlayOf(d), it = o.items!.find((i) => i.kind === 'throw')!;
    return leverSide(d, it, o.items!);
  };
  it('auto: away from the branch', async () => {
    const ls = await lever(left);
    expect(ls).toMatchObject({ side: 'right', by: 'auto', main: 'Straight', branch: 'Branch' });
  });
  it("the branch route's own setting", async () => {
    const d = structuredClone(left); d.routes[1].throwSide = 'left';
    expect(await lever(d)).toMatchObject({ side: 'left', by: 'route', branch: 'Branch' });
  });
  it("the main route's setting does nothing (the branch's is the one)", async () => {
    const d = structuredClone(left); d.routes[0].throwSide = 'left';
    expect(await lever(d)).toMatchObject({ side: 'right', by: 'auto' });
  });
  it("the Piece options'", async () => {
    expect(await lever({ ...left, options: { throwSide: 'left' } })).toMatchObject({ side: 'left', by: 'options' });
  });
  it('dragged across by hand beats the rest', async () => {
    const o0 = await overlayOf(left), key = o0.items!.find((i) => i.kind === 'throw')!.key;
    const d: Design = { ...structuredClone(left), options: { throwSide: 'left' }, trackwork: { throw: { [key]: { side: 'right' } } } };
    d.routes[1].throwSide = 'left';
    expect(await lever(d)).toMatchObject({ side: 'right', by: 'hand' });
  });
});
