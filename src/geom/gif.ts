// A minimal GIF writer (GIF89a, one frame, LZW): the layout parts' pictures,
// which the layout designer's part library reads as .gif at 8 px a stud.

/**
 * A picture as a GIF: indices (width x height, row by row, top first) into
 * palette (RGB, at most 256 colours). transparent: the index drawn as see-through.
 */
export function gifBytes(width: number, height: number, indices: Uint8Array, palette: [number, number, number][], transparent = -1): Uint8Array {
  if (palette.length > 256) throw new Error('a GIF has at most 256 colours');
  let bits = 1;
  while ((1 << bits) < palette.length) bits++;
  const size = 2 ** bits;
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
  out.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));
  u16(width); u16(height);
  out.push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0); // (global colour table of 2^bits)
  for (let i = 0; i < size; i++) { const c = palette[i] ?? [0, 0, 0]; out.push(c[0], c[1], c[2]); }
  if (transparent >= 0) out.push(0x21, 0xf9, 4, 1, 0, 0, transparent, 0); // (graphic control: the see-through index)
  out.push(0x2c); u16(0); u16(0); u16(width); u16(height); out.push(0);
  const minCode = Math.max(2, bits);
  out.push(minCode);
  const data = lzw(indices, minCode);
  for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let k = 0; k < n; k++) out.push(data[i + k]); }
  out.push(0, 0x3b);
  return Uint8Array.from(out);
}

/** GIF's LZW: variable-length codes, least significant bit first, a clear code when the table is full. */
function lzw(px: Uint8Array, minCode: number): number[] {
  const clear = 2 ** minCode, eoi = clear + 1;
  const out: number[] = [];
  let acc = 0, nAcc = 0, width = minCode + 1, next = eoi + 1;
  const emit = (code: number) => {
    acc |= code << nAcc; nAcc += width;
    while (nAcc >= 8) { out.push(acc & 0xff); acc >>>= 8; nAcc -= 8; }
  };
  let table = new Map<number, number>(); // (prefix code * 256 + pixel -> code)
  emit(clear);
  if (!px.length) { emit(eoi); if (nAcc > 0) out.push(acc & 0xff); return out; }
  let prefix = px[0];
  for (let i = 1; i < px.length; i++) {
    const k = px[i], key = prefix * 256 + k, got = table.get(key);
    if (got !== undefined) { prefix = got; continue; }
    emit(prefix);
    if (next < 4096) {
      table.set(key, next++);
      // (the decoder widens its codes once the next code needs another bit)
      if (next > (1 << width) && width < 12) width++;
    } else {
      emit(clear); table = new Map(); next = eoi + 1; width = minCode + 1;
    }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (nAcc > 0) out.push(acc & 0xff);
  return out;
}
