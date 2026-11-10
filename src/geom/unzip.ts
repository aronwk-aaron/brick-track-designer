// A minimal zip reader for the archives zip.ts writes (stored, no compression): from the central directory, each
// file's bytes, its checksum checked. Anything else (compressed entries, a damaged file) is turned away by throwing.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** Does this look like a zip (its first bytes)? */
export const isZip = (b: Uint8Array) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;

/** The files of a stored zip: name to bytes. Throws with a plain message if it isn't one this can read. */
export function unzip(b: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = new Map<string, Uint8Array>();
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("it isn't a zip file, or it is cut short");
  const n = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('the zip is damaged');
    const method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true), size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true), at = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error(`${name} is compressed: only zips made by this app can be opened`);
    const start = at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true), data = b.slice(start, start + size);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`${name} in the zip is damaged`);
    out.set(name, data);
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
