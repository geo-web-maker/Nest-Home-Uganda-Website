import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', 'features', 'admin');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

describe('admin filter and tab styling', () => {
  it('builds every tab row from the shared FilterTabs, so they all look the same', () => {
    const offenders = sources(root).filter((file) => /role=["']tab(list)?["']/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('has no page-level tab styles left that could drift from the shared ones', () => {
    for (const file of ['content/ContentPage.module.css', 'settings/SettingsPage.module.css']) {
      expect(readFileSync(join(root, file), 'utf8')).not.toMatch(/\.(tab|activeTab|tabs)\b/);
    }
  });
});
