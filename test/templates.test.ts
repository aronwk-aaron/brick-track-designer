// Every template is in a group of the Templates list, once; the crossings and switches build.
import { describe, expect, it } from 'vitest';
import { TEMPLATE_GROUPS, TEMPLATES } from '../src/app/design';
import { templatesBuild } from './templates.shared';

describe('templates', { timeout: 600000 }, () => {
  it('each one in a group of the list, once', () => {
    const listed = TEMPLATE_GROUPS.flatMap(([, ns]) => ns);
    expect([...listed].sort()).toEqual(Object.keys(TEMPLATES).sort());
  });
  templatesBuild(['Crossings', 'Switches']);
});
