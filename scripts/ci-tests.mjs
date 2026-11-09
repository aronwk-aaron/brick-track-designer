// The tests with a watchdog: vitest run (any arguments passed on, e.g. --shard=1/10), stopped if it runs past a time
// limit (TEST_MINUTES, default 25), saying which test files hadn't finished. A geometry build that never ends (a helix
// swept over itself, once) blocks its worker in the kernel, where vitest's own timeouts can't stop it: a shard sat
// stuck for its job's whole 90 minutes. Here it fails in minutes, and says where.
//   node scripts/ci-tests.mjs --shard=1/10
import { spawn, spawnSync } from 'node:child_process';

const args = process.argv.slice(2), minutes = Number(process.env.TEST_MINUTES ?? 25);
const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
// (the files this run takes: a dry run that matches no test lists them)
const dry = spawnSync(bin, ['vitest', 'run', ...args, '-t', '^$no test is called this^', '--reporter=verbose'], { encoding: 'utf8' });
const dryOut = (dry.stdout ?? '') + (dry.stderr ?? '');
// (each file's tests, from the dry run's list of them skipped: a file's done when as many have passed or failed)
const expected = new Map();
for (const m of dryOut.matchAll(/↓\s+(test\/[\w.-]+\.test\.ts) >/g)) expected.set(m[1], (expected.get(m[1]) ?? 0) + 1);
const files = [...expected.keys()], seen = new Map(), done = new Set();
// (in a process group of its own, so stopping it stops its workers too)
const child = spawn(bin, ['vitest', 'run', ...args, '--reporter=verbose'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
const watch = (chunk, out) => {
  out.write(chunk);
  // (a file's tests, each reported as it passes or fails, its name first: a file reported is under way or done)
  for (const m of chunk.toString().matchAll(/(?:✓|×|↓)\s+(test\/[\w.-]+\.test\.ts) >/g)) {
    const n = (seen.get(m[1]) ?? 0) + 1;
    seen.set(m[1], n);
    if (n >= (expected.get(m[1]) ?? Infinity)) done.add(m[1]);
  }
};
child.stdout.on('data', (c) => watch(c, process.stdout));
child.stderr.on('data', (c) => watch(c, process.stderr));
const timer = setTimeout(() => {
  const unfinished = files.filter((f) => !done.has(f));
  const where = unfinished.map((f) => `${f} (${seen.get(f) ?? 0} of ${expected.get(f)} tests done)`);
  console.error(`\n::error::the tests ran past ${minutes} minutes and were stopped. Not finished: ${where.join(', ') || '(unknown)'}`);
  try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  process.exit(124);
}, minutes * 60_000);
child.on('exit', (code) => { clearTimeout(timer); process.exit(code ?? 1); });
