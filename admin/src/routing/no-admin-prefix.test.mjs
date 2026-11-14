import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyTree } from '../../scripts/lib/classify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('admin page URL prefix guard', () => {
  it('contains no browser PAGE literal beginning with /admin', () => {
    const { hits } = classifyTree(path.resolve(here, '..'));
    const remaining = hits.filter((hit) => hit.classification === 'PAGE');
    expect(remaining.map((hit) => `${path.relative(path.resolve(here, '../..'), hit.file)}:${hit.line} ${hit.literal}`)).toEqual([]);
  });
});
