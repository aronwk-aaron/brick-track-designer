// The downloads' contents (exports.ts, zip.ts, stl.ts): the STL zip's files are the parts to print, each a whole
// binary STL; the parts list and the BrickLink wanted list say what the build bought; old designs open as today's.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache, legoParts, type LegoPart } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, upgradeDesign } from '../src/app/design';
import { fileBase, partsCsv, partsDownload, plainKind, printedKinds, stlDownload, TRACK_PARTS, wantedListXml } from '../src/app/exports';
import { zip } from '../src/geom/zip';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

/** A zip's files read back (stored, as zip.ts writes them), from its central directory; each one's checksum checked. */
function unzip(z: Uint8Array): { name: string; data: Uint8Array }[] {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength), dec = new TextDecoder();
  const end = z.length - 22;
  expect(dv.getUint32(end, true)).toBe(0x06054b50);
  const n = dv.getUint16(end + 10, true), cdSize = dv.getUint32(end + 12, true), cdAt = dv.getUint32(end + 16, true);
  expect(cdAt + cdSize).toBe(end);
  const crc = (d: Uint8Array) => { let c = 0xffffffff; for (const b of d) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
  const out: { name: string; data: Uint8Array }[] = [];
  let o = cdAt;
  for (let k = 0; k < n; k++) {
    expect(dv.getUint32(o, true)).toBe(0x02014b50);
    const size = dv.getUint32(o + 24, true), nl = dv.getUint16(o + 28, true), at = dv.getUint32(o + 42, true), name = dec.decode(z.subarray(o + 46, o + 46 + nl));
    // (its local header, then the name, then the bytes)
    expect(dv.getUint32(at, true)).toBe(0x04034b50);
    expect(dec.decode(z.subarray(at + 30, at + 30 + nl))).toBe(name);
    const data = z.subarray(at + 30 + nl, at + 30 + nl + size);
    expect(crc(data)).toBe(dv.getUint32(o + 16, true));
    out.push({ name, data });
    o += 46 + nl;
  }
  expect(o).toBe(end);
  return out;
}
/** A binary STL's triangle count, checked against its length. */
const stlTris = (d: Uint8Array) => { const n = new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(80, true); expect(d.length).toBe(84 + 50 * n); return n; };

describe('zip', () => {
  it('writes files that read back whole, names and bytes (none, one, many; an empty file; a name beyond ASCII)', () => {
    const enc = new TextEncoder();
    const files = [{ name: 'a.txt', data: enc.encode('hello') }, { name: 'dir/22.5° crossing.stl', data: new Uint8Array(1000).map((_, k) => k % 251) }, { name: 'empty', data: new Uint8Array(0) }];
    expect(unzip(zip(files))).toEqual(files);
    expect(unzip(zip([]))).toEqual([]);
    expect(unzip(zip(files.slice(0, 1)))).toEqual(files.slice(0, 1));
  });
});

describe('the downloads', { timeout: 300000 }, () => {
  it('file names from the design\'s name, without what a file name can\'t have', () => {
    expect(fileBase(undefined)).toBe('track-piece');
    expect(fileBase('')).toBe('track-piece');
    expect(fileBase('Yard: east/west?')).toBe('Yard- east-west-');
    expect(fileBase('  my yard ')).toBe('my yard');
    expect(fileBase('***')).toBe('-');
  });
  it('a switch\'s parts to print: a zip of every printed part\'s STL, each whole, named after the design and the part', async () => {
    const w = await kernel();
    clearBuildCache();
    const b = buildDesign(w, structuredClone(TEMPLATES['Left switch (LEGO)']));
    const d = stlDownload(b.pieces, 'my-switch')!;
    expect([d.name, d.type]).toEqual(['my-switch.zip', 'application/zip']);
    const files = unzip(d.data);
    expect(files.map((f) => f.name)).toEqual(b.pieces.map((p) => `my-switch-${p.name}.stl`));
    expect(files.length).toBeGreaterThan(3);
    for (const [k, f] of files.entries()) { expect(stlTris(f.data)).toBeGreaterThan(10); expect(f.data).toEqual(b.pieces[k].stl); }
    // (each lying on the bed: nothing below z 0, something at it)
    for (const f of files) {
      const dv = new DataView(f.data.buffer, f.data.byteOffset, f.data.byteLength);
      let lo = Infinity;
      for (let t = 0, n = stlTris(f.data); t < n; t++) for (let k = 0; k < 3; k++) lo = Math.min(lo, dv.getFloat32(84 + t * 50 + 12 + k * 12 + 8, true));
      expect(lo).toBeCloseTo(0, 4);
    }
    expect(printedKinds(b.pieces).reduce((t, [, n]) => t + n, 0)).toBe(b.pieces.length);
    clearBuildCache();
  });
  it('one part to print: its STL as it is; none: nothing', async () => {
    const w = await kernel();
    clearBuildCache();
    const b = buildDesign(w, structuredClone(TEMPLATES['90° crossing']));
    expect(b.pieces).toHaveLength(1);
    const d = stlDownload(b.pieces, 'x')!;
    expect([d.name, d.type]).toEqual(['x.stl', 'model/stl']);
    expect(d.data).toEqual(b.pieces[0].stl);
    expect(stlTris(d.data)).toBeGreaterThan(100);
    expect(stlDownload([], 'x')).toBeUndefined();
    expect(stlDownload([{ name: 'track-bought-53401-1', stl: new Uint8Array(0), lego: [{ part: '53401', name: 'Train Track Straight', qty: 1 }] }], 'x')).toBeUndefined();
    clearBuildCache();
  });
  it('bought track: the list and the wanted list say what the build bought; the STL zip has only what\'s printed', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      // (the app's defaults: an oval of LEGO's own straights and R40 curves, all bought)
      const b = buildDesign(w, structuredClone(TEMPLATES['Oval (LEGO R40)']));
      const parts = legoParts(b.pieces);
      expect(parts.length).toBeGreaterThan(0);
      const d = partsDownload(b.pieces, 'oval')!;
      expect(d.name).toBe('oval-lego-parts.zip');
      const files = unzip(d.data), dec = new TextDecoder();
      expect(files.map((f) => f.name)).toEqual(['oval-lego-parts.csv', 'oval-bricklink-wanted-list.xml']);
      const csv = dec.decode(files[0].data).split('\n');
      expect(csv[0]).toBe('Part,Name,Quantity,From');
      expect(csv).toHaveLength(parts.length + 1);
      for (const p of parts) expect(csv).toContain(`${p.part},"${p.name}",${p.qty},LEGO (BrickLink)`);
      // (16 R40 curves a circle, and its straights)
      expect(parts.find((p) => /curve/i.test(p.name))?.qty).toBe(16);
      const xml = dec.decode(files[1].data);
      expect(xml.match(/<ITEM>/g)).toHaveLength(parts.length);
      for (const p of parts) expect(xml).toContain(`<ITEMID>${p.part}</ITEMID>${TRACK_PARTS.has(p.part) ? '<COLOR>85</COLOR>' : ''}<MINQTY>${p.qty}</MINQTY>`);
      // (and nothing bought is in the files to print)
      const stl = stlDownload(b.pieces, 'oval');
      const printed = b.pieces.filter((p) => !p.lego);
      if (printed.length > 1) expect(unzip(stl!.data).map((f) => f.name)).toEqual(printed.map((p) => `oval-${p.name}.stl`));
      else if (!printed.length) expect(stl).toBeUndefined();
      clearBuildCache();
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
  it('nothing bought: no parts list', () => {
    expect(partsDownload([{ name: 'track', stl: new Uint8Array(84) }], 'x')).toBeUndefined();
  });
  it('the list quotes names, says where each part\'s from, and the wanted list leaves out what BrickLink doesn\'t sell', () => {
    const parts: LegoPart[] = [{ part: '53401', name: 'Train Track Straight', qty: 12 }, { part: 'BrickTracks R104', name: 'BrickTracks R104 curve, 11.25"', qty: 3, shop: 'bricktracks' }];
    expect(partsCsv(parts)).toBe('Part,Name,Quantity,From\n53401,"Train Track Straight",12,LEGO (BrickLink)\nBrickTracks R104,"BrickTracks R104 curve, 11.25""",3,BrickTracks');
    expect(wantedListXml(parts)).toBe('<INVENTORY>\n  <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>53401</ITEMID><COLOR>85</COLOR><MINQTY>12</MINQTY></ITEM>\n</INVENTORY>\n');
    // (the track in its one colour; plates and bricks in any: no colour said)
    expect(wantedListXml([{ part: '3795', name: 'Plate 2 x 6', qty: 4 }])).toBe('<INVENTORY>\n  <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3795</ITEMID><MINQTY>4</MINQTY></ITEM>\n</INVENTORY>\n');
    // (a zip's files are dated when they're made, not 1980)
    const z = zip([{ name: 'a.txt', data: new Uint8Array(3) }], new Date(2026, 10, 9, 14, 30, 8)), dv = new DataView(z.buffer);
    expect([dv.getUint16(10, true), dv.getUint16(12, true)]).toEqual([(14 << 11) | (30 << 5) | 4, ((2026 - 1980) << 9) | (11 << 5) | 9]);
  });
  it('printed parts by kind: their names without the numbers, the most first', () => {
    const p = (name: string, lego = false) => ({ name, stl: new Uint8Array(0), ...(lego && { lego: [{ part: '53401', name: 'x', qty: 1 }] }) });
    expect(printedKinds([p('track1'), p('track2'), p('track3-2'), p('switch1-points-a'), p('switch2-points-a'), p('track1-ballast'), p('lever'), p('track-bought-53401-1', true)]))
      .toEqual([['track', 3], ['switch-points-a', 2], ['track-ballast', 1], ['lever', 1]]);
    // (in plain words for the parts list; a kind it doesn't know stays as it is)
    expect(['track', 'switch-points-a', 'points-b', 'points-throw', 'points-lever', 'track-ballast', 'track-track', 'switch-base', 'track-support', 'gantry'].map(plainKind))
      .toEqual(['Track', 'Points blade (first of the two)', 'Points blade (second of the two)', 'Throw (the slider that moves the points)', 'Lever', 'Ballast (printed apart from its track)', 'Track (seated in its ballast)', 'Track', 'Pillar under raised track', 'gantry']);
  });
});

describe('a design saved by an older version (upgradeDesign)', () => {
  const routes: Design['routes'] = [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }];
  const old = (more: object, options?: object): Design => ({ version: 1, gaugeStuds: 4, routes, ...more, ...(options && { options }) } as Design);
  it('today\'s design: handed back as it is (the same object)', () => {
    const d = old({}, { ballast: 'buddy', joint: 'lego', bladeStyle: 'sprung' });
    expect(upgradeDesign(d)).toBe(d);
    const bare = old({});
    expect(upgradeDesign(bare)).toBe(bare);
  });
  it('the grip and the points\' parts, once on the design: piece options now; the design itself left alone', () => {
    const d = old({ grip: 'all', pointsPieces: 2 }), before = JSON.stringify(d), u = upgradeDesign(d);
    expect(u.options).toMatchObject({ grip: 'all', pointsPieces: 2 });
    expect('grip' in u || 'pointsPieces' in u).toBe(false);
    expect(u.routes).toEqual(routes);
    expect(JSON.stringify(d)).toBe(before);
  });
  it('the old joint "ends": long track cut into track pieces, the joint the default', () => {
    const u = upgradeDesign(old({}, { joint: 'ends', ballast: 'ballast' }));
    expect(u.options).toEqual({ ballast: 'ballast', splitTrack: 'lengths' });
  });
  it('the old Rails at cuts: Cut flat: straight cuts and axles; with straight cuts already, as it was', () => {
    expect(upgradeDesign(old({}, { cutRails: 'flat', joint: 'axle' })).options).toEqual({ joint: 'flataxle' });
    expect(upgradeDesign(old({}, { cutRails: 'flat' })).options).toEqual({ joint: 'flataxle' });
    expect(upgradeDesign(old({}, { cutRails: 'flat', joint: 'butt' })).options).toEqual({ joint: 'butt' });
    expect(upgradeDesign(old({}, { cutRails: 'tongue', joint: 'axle' })).options).toEqual({ joint: 'axle' });
  });
  it('a blade shape no longer offered, the blades\' hold-down setting and the spring-back throw: sprung blades', () => {
    expect(upgradeDesign(old({}, { bladeStyle: 'some old shape', pointBlades: 1 })).options).toEqual({ pointBlades: 1, bladeStyle: 'sprung' });
    expect(upgradeDesign(old({}, { bladeHold: 'bracket', bladeStyle: 'simple' })).options).toEqual({ bladeStyle: 'simple' });
    expect(upgradeDesign(old({}, { throwAction: 'springback', throwStyle: 'built-in' })).options).toEqual({ throwStyle: 'built-in', throwAction: 'detent', bladeStyle: 'sprung' });
  });
  it('all of it at once (a design saved in the first weeks), and it builds', async () => {
    const d = old({ grip: 'edges', pointsPieces: 1, name: 'old', trackwork: {} }, { bottomStyle: 'antistud', ballast: 'none', baseplate: 32, printBedX: 250, printBedY: 250, cutRails: 'flat', joint: 'axle', throwAction: 'springback', throwStyle: 'built-in', bladeHold: 'bracket', curveStuds: 'follow' });
    const u = upgradeDesign(d);
    expect(u.options).toEqual({ grip: 'edges', pointsPieces: 1, bottomStyle: 'antistud', ballast: 'none', baseplate: 32, printBedX: 250, printBedY: 250, throwStyle: 'built-in', curveStuds: 'follow', joint: 'flataxle', throwAction: 'detent', bladeStyle: 'sprung' });
    expect([u.name, u.trackwork]).toEqual(['old', {}]);
    // (upgraded once, it's today's: a second pass changes nothing)
    expect(upgradeDesign(u)).toBe(u);
    const w = await kernel();
    clearBuildCache();
    expect(buildDesign(w, d).pieces.length).toBeGreaterThan(0);
    clearBuildCache();
  });
});
