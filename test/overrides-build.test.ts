// (expert) Tracks with settings of their own, built (build.ts buildGroups): each group of tracks is exactly what the
// design builds with that group's settings; a part takes its first track's own, said; bought or printed per track;
// and a track's own taken off again builds byte-identical files (apply, then reset, is the automatic result).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, TEMPLATES } from '../src/app/design';
import { expandStretches } from '../src/app/stretches';

const hashes = (b: ReturnType<typeof buildDesign>) => b.pieces.map((p) => createHash('sha1').update(p.stl ?? new Uint8Array()).update(p.lego ? JSON.stringify(p.lego) : '').digest('hex')).sort();
const noOwn = (d: Design): Design => ({ ...d, routes: d.routes.map(({ own: _o, ...r }) => r) });

describe('tracks with settings of their own, built', { timeout: 600000 }, () => {
  it('each group is what the design builds with its settings, and taking the own settings off again is byte-identical', async () => {
    const w = await kernel(), t = structuredClone(TEMPLATES['Double track, one on sleepers, one on ballast']);
    clearBuildCache();
    const plain = buildDesign(w, noOwn(t));
    const both = buildDesign(w, structuredClone(t));
    // (the inner alone with the design's settings, the outer alone on ballast: together, the design's parts)
    const inner = buildDesign(w, { ...noOwn(t), routes: [noOwn(t).routes[0]] }), outer = buildDesign(w, { ...noOwn(t), routes: [noOwn(t).routes[1]], options: { ...t.options, ballast: 'buddy' } });
    expect(hashes(both)).toEqual([...hashes(inner), ...hashes(outer)].sort());
    expect(both.info.warnings).toEqual([]);
    expect(new Set(both.pieces.map((p) => p.name)).size).toBe(both.pieces.length);
    // (taken off: as without; set to the design's own value: as without; from nothing too)
    const reset = buildDesign(w, noOwn(t));
    expect(hashes(reset)).toEqual(hashes(plain));
    const same = structuredClone(t); same.routes[1].own = { ballast: t.options!.ballast ?? 'none' };
    clearBuildCache();
    expect(hashes(buildDesign(w, same))).toEqual(hashes(plain));
    expect(buildDesign(w, noOwn(t)).pieces.map((p) => p.name)).toEqual(plain.pieces.map((p) => p.name));
  });
  it('tracks that are one part take the first one\'s own, and the warning says so by name', async () => {
    const w = await kernel(), t = structuredClone(TEMPLATES['Left switch (LEGO)']);
    t.routes[1].own = { ballast: 'ballast' };
    const b = buildDesign(w, t), all = buildDesign(w, { ...noOwn(t), options: { ...t.options, ballast: 'ballast' } });
    expect(hashes(b)).toEqual(hashes(all));
    expect(b.info.warnings).toContain("Straight and Branch are one part (they meet in points or a crossing, or lie side by side): both take Branch's Ballast");
  });
  it('bought or printed, per track', async () => {
    const w = await kernel();
    const d: Design = { version: 1, gaugeStuds: 4, options: { legoTrack: 'lego', splitTrack: 'lengths' }, routes: [
      { name: 'Bought', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
      { name: 'Printed', x: 24, y: 0, heading: 0, own: { legoTrack: 'print' }, segs: [{ kind: 'straight', studs: 16 }] }] };
    const b = buildDesign(w, d);
    expect(b.pieces.filter((p) => p.lego).length).toBe(1);
    expect(b.pieces.filter((p) => !p.lego).length).toBeGreaterThan(0);
    const printed = buildDesign(w, { ...noOwn(d), routes: [noOwn(d).routes[1]], options: { ...d.options, legoTrack: 'print' } });
    expect(hashes({ ...b, pieces: b.pieces.filter((p) => !p.lego) })).toEqual(hashes(printed));
  });
  it('a stretch with its own settings is built as a track of its own; taken off again, byte-identical', async () => {
    const w = await kernel(), t = structuredClone(TEMPLATES['Track on sleepers, a stretch of it on a solid bed']);
    const noSt = (d: Design): Design => ({ ...d, routes: d.routes.map(({ stretches: _s, ...r }) => r) });
    clearBuildCache();
    const plain = buildDesign(w, noSt(t));
    const b = buildDesign(w, structuredClone(t));
    // (the three pieces as tracks drawn one after another, the middle one with the stretch's settings as its own)
    const x = expandStretches(t).design;
    expect(x.routes.map((r) => [r.name, r.own])).toEqual([['Track', undefined], ['Track (8 to 24)', { sleepers: 'bed' }], ['Track (24 to 55.4)', undefined]]);
    const each = x.routes.map((r) => buildDesign(w, { ...noOwn(x), routes: [noOwn({ ...x, routes: [r] }).routes[0]], options: { ...t.options, ...r.own } }));
    expect(hashes(b)).toEqual(each.flatMap(hashes).sort());
    expect(b.info.warnings).toEqual([]);
    expect(new Set(b.pieces.map((p) => p.name)).size).toBe(b.pieces.length);
    expect(hashes(b)).not.toEqual(hashes(plain));
    expect(hashes(buildDesign(w, noSt(t)))).toEqual(hashes(plain));
    // (a stretch with nothing of its own yet: the track cut there, no more)
    const bare = structuredClone(t); bare.routes[0].stretches![0].own = {};
    expect(hashes(buildDesign(w, bare))).toEqual(hashes(buildDesign(w, noOwn(x))));
    // (points on a stretch's track: the plan's trackwork is said of the design's own tracks)
    const sw = structuredClone(TEMPLATES['Left switch (LEGO)']);
    sw.routes[0].stretches = [{ from: 24, to: 32, own: { sleepers: 'bed' } }];
    const ids = new Set(sw.routes.map((r) => r.name));
    for (const it of buildDesign(w, sw).overlay.items) for (const id of it.routes ?? []) expect(ids.has(id), id).toBe(true);
  });
});
