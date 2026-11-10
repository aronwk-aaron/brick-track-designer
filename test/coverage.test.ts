// Nothing left out of the tests by a list that wasn't kept up: every template is in a group and in a templates test
// (some list their templates by name, to spread them over CI's shards), and every setting is in a settings test.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_GROUPS, TEMPLATES } from '../src/app/design';
import { optionForm } from '../src/app/settings';

const files = (rx: RegExp) => readdirSync('test').filter((f) => rx.test(f)).map((f) => readFileSync(`test/${f}`, 'utf8'));
/** the string literals in the source ('…' with \' inside, as the tests write names) */
const strings = (src: string) => new Set([...src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, '\'')));

describe('nothing left out of the tests', () => {
  it('every template is in a group of the Templates list, once', () => {
    const grouped = TEMPLATE_GROUPS.flatMap(([, names]) => names);
    expect(Object.keys(TEMPLATES).filter((n) => !grouped.includes(n))).toEqual([]);
    expect(grouped.filter((n) => !(n in TEMPLATES))).toEqual([]);
    expect(grouped.filter((n, k) => grouped.indexOf(n) !== k)).toEqual([]);
  });
  it('every template is built by a templates test', () => {
    const calls = files(/^templates.*\.test\.ts$/).flatMap((src) => [...src.matchAll(/templatesBuild\(\[([^\]]*)\](\s*,\s*\[)?/g)].map((m) => ({ groups: [...strings(m[1])], listed: !!m[2], names: strings(src) })));
    expect(calls.length).toBeGreaterThan(5);
    expect(calls.filter((c) => c.listed).length).toBeGreaterThan(3);
    const missing = TEMPLATE_GROUPS.flatMap(([g, names]) => names.filter((n) => !calls.some((c) => c.groups.includes(g) && (!c.listed || c.names.has(n)))));
    expect(missing).toEqual([]);
  });
  it('every setting is in a settings test', () => {
    const { form } = optionForm(() => ({ version: 1, gaugeStuds: 4, routes: [] }));
    const calls = files(/^settings-.*\.test\.ts$/).flatMap((src) => [...src.matchAll(/checkSettings\(\[([^\]]*)\](?:\s*,\s*\[([^\]]*)\])?/g)].map((m) => ({ sections: strings(m[1]), only: m[2] === undefined ? undefined : strings(m[2]) })));
    expect(calls.length).toBeGreaterThan(5);
    expect(calls.filter((c) => c.only).length).toBe(2);
    const missing = form.flatMap((sec) => sec.fields.filter((f) => !calls.some((c) => c.sections.has(sec.title) && (!c.only || c.only.has(f.key)))).map((f) => `${sec.title}: ${f.key}`));
    expect(missing).toEqual([]);
  });
});
