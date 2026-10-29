import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const admin = join(__dirname, '..', '..', 'features', 'admin');

function walk(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, pattern);
    return pattern.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const tsx = walk(admin, /\.tsx$/);
const css = walk(admin, /\.css$/);
const rel = (file: string) => relative(admin, file).replaceAll('\\', '/');
const read = (file: string) => readFileSync(file, 'utf8');
const offenders = (files: string[], pattern: RegExp) => files.filter((file) => pattern.test(read(file))).map(rel);

describe('admin pages use the shared components', () => {
  it('has no page-made dialogs: every dialog is the shared Modal', () => {
    // AdminLayout owns the mobile "More" drawer, which is navigation rather than a dialog form.
    expect(offenders(tsx, /role="dialog"/)).toEqual(['AdminLayout.tsx']);
  });

  it('has no page-made message boxes or status pills', () => {
    expect(offenders(tsx, /stage-message|care-error|care-notice|care-note\b|stage-status|stage-modal-backdrop|className="stage-modal"/)).toEqual([]);
  });

  it('has no leftover styles for the pieces that moved into shared components', () => {
    expect(offenders(css, /\.stage-message|\.stage-status|\.stage-modal-backdrop|\.stage-modal \{|\.care-error|\.care-notice|\.care-tabs/)).toEqual([]);
  });

  it('builds buttons from the shared Button, not raw <button>, outside the navigation shell and two icon-style triggers', () => {
    // AdminLayout: sidebar and drawer controls. The other two are a photo thumbnail that opens its
    // viewer and an inline text action in the alerts table; neither is a pill button.
    const allowed = new Set(['AdminLayout.tsx', 'care/VisitListAndPhotosPages.tsx', 'care/AlertAndTimesheetPages.tsx']);
    expect(offenders(tsx, /<button[\s>]/).filter((file) => !allowed.has(file))).toEqual([]);
  });

  it('builds the Care panels from the shared Field, not hand-made label and input pairs', () => {
    const panels = tsx.filter((file) => /care\/(places|clients\/CreateClientPanel|visits|flags|data)/.test(rel(file)) || /care\/clients\/CreateClientPanel/.test(rel(file)));
    expect(offenders(panels, /<label>[^<]*<(input|select|textarea)/)).toEqual([]);
    expect(offenders(panels, /<(select|textarea)[\s>]/)).toEqual([]);
  });

  it('keeps the list of pages that still draw their own <table> from growing', () => {
    // Debt list. Move each page onto DataTable and delete it from here; never add to it.
    const stillHandDrawn = [
      'GovernancePages.tsx',
      'care/AlertAndTimesheetPages.tsx',
      'care/CareWorkspace.tsx',
      'care/FlagsAndTeamPages.tsx',
      'care/NotificationAndSmsPages.tsx',
      'care/SafetyAndSetupPages.tsx',
      'care/VisitListAndPhotosPages.tsx',
      'care/VisitSchedulePage.tsx',
    ];
    const found = offenders(tsx, /<table[\s>]/);
    expect(found.filter((file) => !stillHandDrawn.includes(file))).toEqual([]);
  });

  it('has no label-and-select pairs and no raw selects: dropdowns come from Field', () => {
    expect(offenders(tsx, /<select[\s>]/)).toEqual([]);
  });

  it('has no per-page action rows: they are ButtonGroup', () => {
    expect(offenders(tsx, /className="(stage-modal-actions|stage-toolbar-actions|care-data-actions|stage-row-actions|care-row-actions)"/)).toEqual([]);
    expect(offenders(css, /\.stage-(row|modal)-actions|\.stage-toolbar-actions|\.care-(row|data)-actions/)).toEqual([]);
  });

  it('sets the sidebar current item from navItemFor, never from NavLink prefix matching', () => {
    const layout = read(join(admin, 'AdminLayout.tsx'));
    expect(layout).toMatch(/navItemFor/);
    expect(layout).not.toMatch(/NavLink/);
  });
});
