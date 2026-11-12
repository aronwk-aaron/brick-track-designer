// (expert, stage 5c) Points with settings of their own: one set of a crossover with rigid, realistic blades while the
// design's aren't, the other's throw bar moved along by hand. Each set is built as it says, the other as the design's; taken off
// again, the files are byte for byte what they were.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, TEMPLATES } from '../src/app/design';

type Built = ReturnType<typeof buildDesign>;
const hashes = (b: Built) => b.pieces.map((p) => createHash('sha1').update(p.stl ?? new Uint8Array()).digest('hex')).sort();

describe('points with settings of their own, built', { timeout: 900000 }, () => {
  it('the template\'s two edits are on its two sets of points; built, then reset, byte for byte the crossover', async () => {
    const w = await kernel(), d = structuredClone(TEMPLATES['Crossover with points of their own']), plainD: Design = { ...structuredClone(d), trackwork: undefined };
    clearBuildCache();
    const plain = buildDesign(w, structuredClone(plainD));
    const keys = plain.overlay.items.filter((it) => it.kind === 'points').map((it) => it.key).sort();
    expect(keys).toEqual(['0,64', '128,448']);
    expect(plain.overlay.items.some((it) => it.kind === 'throw' && it.key === '128,448')).toBe(true);
    const own = buildDesign(w, structuredClone(d));
    expect(own.info.warnings).toEqual(plain.info.warnings);
    expect(hashes(own)).not.toEqual(hashes(plain));
    // (one set's blades planed and tucked under: not the crossover with all its blades so either, nor with none so)
    const rigid = buildDesign(w, { ...structuredClone(plainD), options: { ...plainD.options, bladeStyle: 'prototype' } });
    expect(hashes(own)).not.toEqual(hashes(rigid));
    expect(hashes(rigid)).not.toEqual(hashes(plain));
    // (the throw bar moved alone: different parts from the crossover's)
    const shifted = buildDesign(w, { ...structuredClone(plainD), trackwork: { throw: { '128,448': { throwShift: 2 } } } });
    expect(hashes(shifted)).not.toEqual(hashes(plain));
    clearBuildCache();
    expect(hashes(buildDesign(w, structuredClone(plainD)))).toEqual(hashes(plain));
  });
});
