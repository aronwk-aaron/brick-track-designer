// The layout parts export: a parts library for the layout designer (BlueBrick's format).
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { type Design, TEMPLATES } from '../src/app/design';
import { PX_PER_STUD, keyName, layoutParts } from '../src/app/layoutparts';
import { gifBytes } from '../src/geom/gif';

// ---- a small XML reader: throws on anything not well-formed ----
interface El { name: string; attrs: Record<string, string>; kids: El[]; text: string }
function parseXml(src: string): El {
  let i = 0;
  const root: El = { name: '#doc', attrs: {}, kids: [], text: '' }, stack = [root];
  src = src.replace(/^\uFEFF/, '');
  if (!src.startsWith('<?xml')) throw new Error('no XML declaration');
  while (i < src.length) {
    if (src.startsWith('<?', i)) { const e = src.indexOf('?>', i); if (e < 0) throw new Error('bad <?'); i = e + 2; continue; }
    if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i); if (e < 0) throw new Error('bad comment'); i = e + 3; continue; }
    if (src[i] === '<') {
      const e = src.indexOf('>', i); if (e < 0) throw new Error('unclosed tag');
      const body = src.slice(i + 1, e); i = e + 1;
      if (body.startsWith('/')) {
        const top = stack.pop()!;
        if (top.name !== body.slice(1).trim()) throw new Error(`</${body.slice(1)}> closes <${top.name}>`);
        continue;
      }
      const self = body.endsWith('/'), m = /^([A-Za-z_][\w.-]*)((?:\s+[\w.-]+="[^"<]*")*)\s*\/?$/.exec(body);
      if (!m) throw new Error(`bad tag <${body}>`);
      const attrs: Record<string, string> = {};
      for (const a of m[2].matchAll(/([\w.-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
      const el: El = { name: m[1], attrs, kids: [], text: '' };
      stack[stack.length - 1].kids.push(el);
      if (!self) stack.push(el);
      continue;
    }
    const e = src.indexOf('<', i), t = src.slice(i, e < 0 ? undefined : e);
    if (/[<>]/.test(t) || /&(?!amp;|lt;|gt;|quot;|apos;)/.test(t)) throw new Error('bad text');
    if (t.trim() && stack.length === 1) throw new Error('text outside the root');
    stack[stack.length - 1].text += t; i = e < 0 ? src.length : e;
  }
  if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1].name}> not closed`);
  if (root.kids.length !== 1) throw new Error('not one root element');
  return root.kids[0];
}
const kid = (e: El, n: string) => { const k = e.kids.find((x) => x.name === n); if (!k) throw new Error(`no <${n}> in <${e.name}>`); return k; };
const num = (e: El, n: string) => { const v = Number(kid(e, n).text.trim()); expect(Number.isFinite(v)).toBe(true); return v; };

// ---- a GIF reader: the size, and the pixels decoded ----
function readGif(b: Uint8Array) {
  expect(String.fromCharCode(...b.slice(0, 6))).toBe('GIF89a');
  const w = b[6] | (b[7] << 8), h = b[8] | (b[9] << 8), ct = 2 ** ((b[10] & 7) + 1);
  let p = 13 + 3 * ct, transparent = -1;
  if (b[p] === 0x21 && b[p + 1] === 0xf9) { if (b[p + 3] & 1) transparent = b[p + 6]; p += 8; }
  expect(b[p]).toBe(0x2c); p += 10;
  const minCode = b[p++], data: number[] = [];
  while (b[p]) { const n = b[p++]; for (let k = 0; k < n; k++) data.push(b[p++]); }
  expect(b[p + 1]).toBe(0x3b);
  // LZW
  const clear = 2 ** minCode, eoi = clear + 1;
  const out: number[] = [];
  let width = minCode + 1, dict: number[][] = [], prev: number[] | undefined, bit = 0;
  const reset = () => { dict = Array.from({ length: eoi + 1 }, (_, k) => [k]); width = minCode + 1; prev = undefined; };
  reset();
  for (;;) {
    let code = 0;
    for (let k = 0; k < width; k++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << k;
    if (code === clear) { reset(); continue; }
    if (code === eoi) break;
    const entry = code < dict.length ? dict[code] : [...prev!, prev![0]];
    out.push(...entry);
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === (1 << width) && width < 12) width++;
  }
  return { w, h, transparent, px: out };
}

const parseSet = (x: ReturnType<typeof layoutParts>) => {
  const f = x.files.find((q) => q.name === `${x.folder}/${x.setId}.set.xml`)!;
  const g = parseXml(new TextDecoder().decode(f.data));
  expect(g.name).toBe('group');
  expect(kid(g, 'CanUngroup').text).toBe('true');
  return kid(g, 'SubPartList').kids.map((s) => ({ id: s.attrs.id, x: num(kid(s, 'position'), 'x'), y: num(kid(s, 'position'), 'y'), angle: num(s, 'angle') }));
};
const parsePart = (x: ReturnType<typeof layoutParts>, id: string) => {
  const f = x.files.find((q) => q.name === `${x.folder}/${id}.xml`)!;
  const p = parseXml(new TextDecoder().decode(f.data));
  expect(p.name).toBe('part');
  expect(kid(kid(p, 'Description'), 'en').text.length).toBeGreaterThan(0);
  const list = p.kids.find((k) => k.name === 'ConnexionList')?.kids ?? [];
  return list.map((c, k) => {
    expect(c.name).toBe('connexion');
    expect(num(c, 'nextConnexionPreference')).toBe((k + 1) % list.length);
    return { type: kid(c, 'type').text, x: num(kid(c, 'position'), 'x'), y: num(kid(c, 'position'), 'y'), angle: num(c, 'angle') };
  });
};

/** Every part's connections in the set's frame (studs, y down). */
function connectionsInSet(x: ReturnType<typeof layoutParts>) {
  const subs = parseSet(x);
  expect(subs.map((s) => s.id)).toEqual(x.parts.map((p) => p.id));
  return subs.flatMap((s) => parsePart(x, s.id).map((c) => {
    const r = (s.angle * Math.PI) / 180;
    return { part: s.id, type: c.type, x: s.x + c.x * Math.cos(r) - c.y * Math.sin(r), y: s.y + c.x * Math.sin(r) + c.y * Math.cos(r), angle: c.angle + s.angle };
  }));
}
/** The connections that meet one of another part's, facing it, and the rest (free). */
function pairUp(cs: ReturnType<typeof connectionsInSet>) {
  const used = new Set<number>(), pairs: [number, number][] = [];
  cs.forEach((c, i) => {
    if (used.has(i)) return;
    const j = cs.findIndex((d, k) => k !== i && !used.has(k) && d.part !== c.part && Math.hypot(d.x - c.x, d.y - c.y) < 0.01 && Math.abs((((d.angle - c.angle) % 360) + 360) % 360 - 180) < 0.01);
    if (j >= 0) { used.add(i); used.add(j); pairs.push([i, j]); }
  });
  return { pairs, free: cs.filter((_, i) => !used.has(i)) };
}

describe('GIF writer', () => {
  it('decodes to what was written, long enough to fill the code table and clear it', () => {
    const w = 300, h = 200, px = new Uint8Array(w * h).map((_, k) => ((k * 7919) >> 3) % 37);
    const g = readGif(gifBytes(w, h, px, Array.from({ length: 37 }, (_, k) => [k, k, k] as [number, number, number]), 0));
    expect([g.w, g.h, g.transparent]).toEqual([w, h, 0]);
    expect(g.px).toEqual([...px]);
  });
});

describe('layout parts', { timeout: 120000 }, () => {
  it('a long straight cut to the bed: parts that join at their cuts, two free ends', async () => {
    const d: Design = { version: 1, gaugeStuds: 4, name: 'Long run', options: { printBedX: 200, printBedY: 200 }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] }] };
    const b = buildDesign(await kernel(), d);
    const x = layoutParts(d, b.pieces, d.name);
    expect(x.parts.length).toBeGreaterThan(2);
    expect(x.parts.map((p) => p.id)).toEqual(b.pieces.map((p) => `Long_run.${p.name}`));
    expect(new Set(x.parts.map((p) => p.id.toLowerCase())).size).toBe(x.parts.length);
    // the files: each part's XML and picture, the set, the list, the version, the README
    const names = x.files.map((f) => f.name);
    for (const p of x.parts) expect(names).toEqual(expect.arrayContaining([`Long run/${p.id}.xml`, `Long run/${p.id}.gif`]));
    expect(names).toEqual(expect.arrayContaining(['Long run/Long_run.whole.set.xml', 'Long run/_partlist.txt', 'Long run/config/About.txt', 'README.txt']));
    for (const p of x.parts) {
      // the picture: the part's box at 8 px a stud, see-through round the track
      const g = readGif(p.gif);
      expect([g.w, g.h]).toEqual([(p.box[2] - p.box[0]) / 8 * PX_PER_STUD, (p.box[3] - p.box[1]) / 8 * PX_PER_STUD]);
      expect(g.px.length).toBe(g.w * g.h);
      const clear = g.px.filter((v) => v === g.transparent).length;
      expect(clear).toBeGreaterThan(0); expect(clear).toBeLessThan(g.px.length * 0.6);
      // (the track 4 studs gauge, about 8 studs wide with its sleepers: the picture's that wide, the length of the part long)
      expect(g.w).toBeGreaterThanOrEqual(6 * PX_PER_STUD); expect(g.w).toBeLessThanOrEqual(10 * PX_PER_STUD);
    }
    const cs = connectionsInSet(x), { pairs, free } = pairUp(cs);
    expect(cs.every((c) => c.type === '1')).toBe(true);
    expect(pairs).toHaveLength(x.parts.length - 1);
    expect(free).toHaveLength(2);
    // the free ends: 64 studs apart, along the track, facing out (down the screen at the start, up at the far end)
    const [s, e] = [...free].sort((a, b2) => b2.y - a.y);
    expect(Math.hypot(e.x - s.x, e.y - s.y)).toBeCloseTo(64, 3);
    expect(s.angle).toBeCloseTo(90, 3); expect(e.angle).toBeCloseTo(-90, 3);
    // each part: two connections, at its ends
    for (const p of x.parts) expect(parsePart(x, p.id)).toHaveLength(2);
  });
  it('a switch: one part (its moving parts drawn on it) with three ends, in the library\'s frame', async () => {
    const d: Design = { ...structuredClone(TEMPLATES['Left switch (LEGO)']), options: { printBedX: 500, printBedY: 500 } };
    const b = buildDesign(await kernel(), d);
    const x = layoutParts(d, b.pieces, 'My switch');
    expect(x.parts.map((p) => p.id)).toEqual(['My_switch.switch-base']);
    expect(x.parts[0].guests).toEqual(expect.arrayContaining(['switch-throw', 'switch-lever', 'switch-points-a', 'switch-points-b']));
    const cs = connectionsInSet(x);
    expect(cs).toHaveLength(3);
    const p = x.parts[0];
    // in the design (mm, y up) from each connection: the toe at (0, 0) facing down, the straight's end 32 studs up facing up,
    // the branch's end to the left (16 studs over, as LEGO's) facing up and left 22.5 degrees
    const world = parsePart(x, p.id).map((c) => ({ x: (p.centre[0] + c.x) * 8, y: -(p.centre[1] + c.y) * 8, angle: c.angle }));
    const toe = world.find((c) => Math.hypot(c.x, c.y) < 0.5)!;
    expect(toe.angle).toBeCloseTo(90, 3);
    const straight = world.find((c) => Math.hypot(c.x, c.y - 256) < 0.5)!;
    expect(straight.angle).toBeCloseTo(-90, 3);
    const branch = world.find((c) => c !== toe && c !== straight)!;
    expect(branch.x).toBeLessThan(-8 * 6);
    expect(branch.angle).toBeCloseTo(-90 - 22.5, 2);
  });
  it('keys: letters, digits, - and _ only', () => {
    expect(keyName(' My yard: v2 ')).toBe('My_yard_v2');
    expect(keyName('***')).toBe('track');
  });
});
