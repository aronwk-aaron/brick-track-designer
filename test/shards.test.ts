// CI runs the tests in shards (ci.yml: vitest --shard=k/n), each stopped at 25 minutes (scripts/ci-tests.mjs). vitest
// deals the files out by their names alone (sorted by the SHA-1 of each path, cut into n runs), so a new or renamed
// file moves others from shard to shard: here the dealing is worked out as vitest does it, and no shard may hold two of
// the slow files (the ones that put a whole layout together: minutes each). Where it fails: rename the new file, or
// one of the slow ones (each is a one-line file).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The files that take minutes: the big layouts put together, and built; the X yard built shared out among helpers (two files of it); the saved monster switches (designs.shared.ts). */
const SLOW = ['assembled-xyard', 'assembled-loop-left', 'assembled-loop-right', 'assembled-yard', 'templates-xyard', 'templates-heavy', 'parallel', 'build-workers', 'designs-monster-plain', 'designs-monster-double-slips'];

/** The double slip's print test (one test of every printed part, near its 15-minute limit on a loaded runner): in a shard
 * with none of the files that take five minutes or so (the combo sets' builds, the tables, the crossover sweeps...), so its
 * runner has its two workers to spare. */
const ALONE = 'printed-double-slip';
const MEDIUM = ['templates-ref-combos1', 'templates-ref-combos2', 'templates-ref-combos3', 'templates-ref-combos4', 'templates-ref-loops1', 'templates-ref-loops2', 'templates-ref-loops3', 'templates-heavy', 'tables', 'printable-crossings', 'printable-track', 'crossover-sweep-8', 'crossover-sweep-9', 'crossover-sweep-16', 'bought-switches', 'designs-saved', 'assembled-features', 'assembled-ref3'];

/** The shards as vitest deals them (its BaseSequencer.shard): n runs of the files sorted by their paths' hashes, the first ones a file longer where they don't divide. */
export function shards(files: string[], n: number): string[][] {
  const sorted = files.map((f) => ({ f, h: createHash('sha1').update(`/test/${f}`).digest('hex') })).sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0)).map((x) => x.f);
  const base = Math.floor(sorted.length / n), rem = sorted.length % n, out: string[][] = [];
  for (let k = 0, at = 0; k < n; k++) { const size = base + (k < rem ? 1 : 0); out.push(sorted.slice(at, at + size)); at += size; }
  return out;
}

describe('the CI shards', () => {
  it('no shard holds two of the slow files', () => {
    const dir = new URL('.', import.meta.url).pathname, files = readdirSync(dir).filter((f) => /\.test\.ts$/.test(f));
    const n = /shard: \[([\d, ]+)\]/.exec(readFileSync(`${dir}../.github/workflows/ci.yml`, 'utf8'))![1].split(',').length;
    for (const s of SLOW) expect(files, `${s}.test.ts is gone or renamed: bring SLOW up to date`).toContain(`${s}.test.ts`);
    const crowded = shards(files, n).map((sh, k) => ({ k: k + 1, slow: sh.filter((f) => SLOW.includes(f.replace(/\.test\.ts$/, ''))) })).filter((x) => x.slow.length > 1);
    expect(crowded.map((x) => `shard ${x.k}: ${x.slow.join(', ')}`).join('; ')).toBe('');
  });
  it("the double slip's print test is dealt with light files", () => {
    const dir = new URL('.', import.meta.url).pathname, files = readdirSync(dir).filter((f) => /\.test\.ts$/.test(f));
    const n = /shard: \[([\d, ]+)\]/.exec(readFileSync(`${dir}../.github/workflows/ci.yml`, 'utf8'))![1].split(',').length;
    for (const m of [ALONE, ...MEDIUM]) expect(files, `${m}.test.ts is gone or renamed: bring ALONE / MEDIUM up to date`).toContain(`${m}.test.ts`);
    const sh = shards(files, n).find((x) => x.includes(`${ALONE}.test.ts`))!;
    expect(sh.filter((f) => MEDIUM.includes(f.replace(/\.test\.ts$/, ''))).join(', ')).toBe('');
  });
});
