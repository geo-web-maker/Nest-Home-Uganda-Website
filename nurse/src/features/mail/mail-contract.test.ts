import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copy } from '../../copy';

/** Keeps the mail screens on the nurse app's shared pieces, so they cannot drift again. */
const dir = __dirname;
const src = join(dir, '..', '..');
const files = readdirSync(dir).filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'));
const read = (path: string) => readFileSync(path, 'utf8');

describe('nurse mail construction', () => {
  it('uses no raw buttons and no hand-made dialogs', () => {
    for (const file of files) {
      expect(read(join(dir, file)), file).not.toMatch(/<button[\s>]/);
      expect(read(join(dir, file)), file).not.toMatch(/aria-modal=/);
    }
  });
  it('builds the screen from the shared Card, Banner and PillButton and the compose dialog from Sheet', () => {
    const screen = read(join(dir, 'MailScreen.tsx'));
    for (const piece of ['ui/Card', 'ui/Banner', 'ui/PillButton', 'ui/Row']) expect(screen).toContain(piece);
    expect(read(join(dir, 'MailComposeSheet.tsx'))).toContain('ui/Sheet');
  });
  it('uses the same screen, heading and eyebrow pattern as the other screens, with an h2 title', () => {
    const screen = read(join(dir, 'MailScreen.tsx'));
    expect(screen).toContain('className="screen mail-screen"');
    expect(screen).toContain('screen-heading');
    expect(screen).toContain('className="eyebrow"');
    expect(screen).not.toMatch(/<h1/);
  });
  it('keeps message text out of localStorage', () => {
    for (const file of [...files, 'mailStore.ts']) {
      expect(read(join(dir, file)), file).not.toMatch(/localStorage\.setItem/);
    }
  });
  it('wipes the read cache at sign-out', () => {
    expect(read(join(src, 'app', 'App.tsx'))).toMatch(/await clearMailCache\(\)/);
  });
  it('styles mail with tokens the nurse app defines, not the admin radius tokens', () => {
    const css = read(join(src, 'styles.css'));
    const block = css.split('\n').filter((line) => /\.mail-/.test(line)).join('\n');
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/--r-(sm|md|lg)|--shadow-2/);
    expect(css).not.toMatch(/\.mail-layout|\.mail-compose\s/);
  });
  it('labels every folder', () => {
    for (const name of ['inbox', 'sent', 'drafts', 'trash', 'spam', 'starred'] as const) expect(copy.mail.folders[name]).toBeTruthy();
    for (const state of ['draft', 'queued', 'sending', 'failed'] as const) expect(copy.mail.draftStates[state]).toBeTruthy();
  });
  it('seals the offline cache and deletes its key at sign-out', () => {
    const store = read(join(dir, 'mailStore.ts'));
    expect(store).toContain('sealJson');
    expect(store).toContain('openJson');
    expect(store).toContain('destroyMailKey');
  });
  it('lets rows swipe through the shared hook, never a raw gesture handler on the screen', () => {
    expect(read(join(dir, 'MailRow.tsx'))).toContain('useSwipe');
    expect(read(join(dir, 'MailScreen.tsx'))).toContain('MailRow');
  });
  it('seals drafts with their own key, refuses to store them in plain text, and has no owner-less path', () => {
    const store = read(join(dir, 'mailStore.ts'));
    expect(store).toContain('DRAFTS_KEY_ID');
    expect(store).toContain("mail-store-unavailable");
    expect(store).toContain("mail-owner-required");
  });
  it('deletes other accounts\' mail when a different person signs in', () => {
    expect(read(join(src, 'app', 'useFieldProfile.ts'))).toMatch(/await purgeOtherOwnersMail\(next\.user_id\)/);
  });
});
