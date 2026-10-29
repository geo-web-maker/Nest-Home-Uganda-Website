import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * jsdom has no layout, so a test cannot measure whether a button sits on the same line as the
 * input beside it. These tests pin the CSS rules that make it so, and fail if a page goes back to
 * drawing its own filter row.
 */
const src = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(src, ...parts), 'utf8');

/** The body of the first rule whose selector is exactly `selector`. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`No rule for ${selector}`);
  return match[1] ?? '';
}
const px = (body: string, property: string) => Number(new RegExp(`${property}:\\s*(\\d+)px`).exec(body)?.[1]);

function walk(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, pattern);
    return pattern.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const admin = join(src, 'features', 'admin');
const adminTsx = walk(admin, /\.tsx$/);
const adminCss = walk(admin, /\.css$/);
const rel = (file: string) => relative(admin, file).replaceAll('\\', '/');
const offenders = (files: string[], pattern: RegExp) => files.filter((f) => pattern.test(readFileSync(f, 'utf8'))).map(rel);

describe('button and input alignment contract', () => {
  const field = read('components', 'ui', 'Field.module.css');
  const button = read('components', 'ui', 'Button.module.css');
  const bar = read('components', 'admin', 'FilterBar.module.css');

  it('lets a container remove the Field gap, which is what pushed buttons below inputs', () => {
    expect(rule(field, '.field')).toMatch(/margin-bottom:\s*var\(--field-gap,\s*12px\)/);
  });

  it('removes the Field gap inside a FilterBar and bottom-aligns the row', () => {
    const body = rule(bar, '.bar');
    expect(body).toMatch(/--field-gap:\s*0/);
    expect(body).toMatch(/align-items:\s*flex-end/);
    expect(rule(bar, '.bar > .actions')).toMatch(/align-items:\s*flex-end/);
  });

  it('makes the control button exactly as tall as a form control', () => {
    const controlHeight = px(rule(field, '.control'), 'min-height');
    expect(controlHeight).toBe(48);
    expect(px(rule(button, '.control'), 'min-height')).toBe(controlHeight);
  });

  it('keeps compact smaller than a control, so row actions do not stretch the table', () => {
    expect(px(rule(button, '.compact'), 'min-height')).toBeLessThan(px(rule(button, '.control'), 'min-height'));
  });

  it('stacks the actions full width on a phone instead of leaving a lone button off to one side', () => {
    expect(bar).toMatch(/@media \(max-width: 560px\)[\s\S]*\.actions[\s\S]*flex:\s*1 1 100%/);
  });
});

describe('admin pages do not draw their own filter rows', () => {
  it('has no page stylesheet that re-implements a filter row or action row', () => {
    const modules = walk(admin, /\.module\.css$/);
    expect(offenders(modules, /\.(filters|searchRow|exportForm|search)\s*\{/)).toEqual([]);
    expect(offenders(adminCss, /\.stage-(row|modal|toolbar)-actions|\.care-(row|data)-actions/)).toEqual([]);
  });

  it('puts every filter field in a FilterBar, not a page-made .stage-toolbar', () => {
    expect(offenders(adminTsx, /className="stage-toolbar"[^\n]*<Field/)).toEqual([]);
  });

  it('has no hand-made label-and-select pairs that skip the shared Field', () => {
    expect(offenders(adminTsx, /<label[^>]*>[^<]*(\{' '\})?\s*<select/)).toEqual([]);
  });

  it('wraps the action rows in ButtonGroup instead of per-page flex divs', () => {
    expect(offenders(adminTsx, /className="(stage-modal-actions|stage-toolbar-actions|care-data-actions|stage-row-actions|care-row-actions)"/)).toEqual([]);
  });

  it('uses FilterBar or SearchBar on the pages that filter a list', () => {
    const pages = [
      'activity/ActivityPage.tsx',
      'enquiries/EnquiriesPage.tsx',
      'reports/ReportsPage.tsx',
      'care/AlertAndTimesheetPages.tsx',
      'care/FlagsAndTeamPages.tsx',
      'care/VisitListAndPhotosPages.tsx',
      'care/CareScreenPage.tsx',
      'care/components/MapPicker.tsx',
      'GovernancePages.tsx',
      'users/UsersPage.tsx',
    ];
    const using = adminTsx.filter((f) => /<(FilterBar|SearchBar)[\s>]/.test(readFileSync(f, 'utf8'))).map(rel);
    for (const page of pages) expect(using).toContain(page);
  });
});
