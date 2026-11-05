import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { adminEn } from '../../../locales/en/admin';
import { ADMIN_NAV } from '../nav';
import { FOLDERS } from './types';

/** Pins what the mail screens must share with the rest of admin, so they cannot drift again. */
const dir = __dirname;
const designDir = join(dir, '..', '..', '..', 'design');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const pages = ['MailPage.tsx', 'MailCompose.tsx', 'MailSettingsPage.tsx'];
const everyTsx = readdirSync(dir).filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx') && name !== 'mailUiKit.tsx');

describe('mail screens use the shared admin components', () => {
  it('has no raw buttons, selects, checkboxes or page-made dialogs', () => {
    for (const file of everyTsx) {
      const source = read(file);
      expect(source, `${file}: <button`).not.toMatch(/<button[\s>]/);
      expect(source, `${file}: <select`).not.toMatch(/<select[\s>]/);
      expect(source, `${file}: checkbox`).not.toMatch(/type="checkbox"/);
      expect(source, `${file}: dialog`).not.toMatch(/role="dialog"/);
      expect(source, `${file}: window.confirm`).not.toMatch(/window\.confirm|\bconfirm\(/);
    }
  });

  it('builds each page from the shared header, notice, button and field', () => {
    expect(read('MailPage.tsx')).toMatch(/components\/admin\/PageHeader/);
    expect(read('MailPage.tsx')).toMatch(/components\/admin\/FilterTabs/);
    expect(read('MailPage.tsx')).toMatch(/components\/admin\/SearchBar/);
    expect(read('MailSettingsPage.tsx')).toMatch(/components\/admin\/PageHeader/);
    expect(read('MailSettingsPage.tsx')).toMatch(/components\/ui\/Checkbox/);
    expect(read('MailCompose.tsx')).toMatch(/components\/admin\/Modal/);
    for (const file of pages) {
      expect(read(file), file).toMatch(/components\/ui\/Button/);
      expect(read(file), file).toMatch(/components\/admin\/Notice|components\/ui\/Field/);
    }
  });

  it('keeps mail out of the first nav slot so it never becomes the landing page', () => {
    expect(ADMIN_NAV[0]?.path).toBe('/admin');
  });
});

describe('mail stylesheet', () => {
  const css = read('MailPage.module.css');
  const tokens = readFileSync(join(designDir, 'tokens.css'), 'utf8');
  const defined = new Set([...tokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));

  it('only reads colour, shadow and spacing tokens that tokens.css defines', () => {
    const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });

  it('does not use the undefined radius tokens that flattened the first version', () => {
    expect(css).not.toMatch(/--r-(sm|md|lg)/);
  });

  it('does not use !important to fight the shared Button', () => {
    expect(css).not.toMatch(/!important/);
  });
});

describe('mail copy', () => {
  const copy = adminEn as unknown as Record<string, Record<string, unknown>>;
  const lookup = (path: string): unknown => path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], copy);

  it('defines every literal translation key the mail screens call', () => {
    const missing: string[] = [];
    for (const file of everyTsx) {
      for (const match of read(file).matchAll(/\bt\(\s*'((?:mail|mailSettings)\.[A-Za-z.]+)'/g)) {
        const key = match[1] as string;
        if (typeof lookup(key) !== 'string') missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('labels every folder and every recipient kind used through a template key', () => {
    for (const folder of FOLDERS) expect(typeof lookup(`mail.folders.${folder}`)).toBe('string');
    for (const kind of ['to', 'cc', 'bcc']) expect(typeof lookup(`mail.${kind}`)).toBe('string');
  });

  it('names both nav entries', () => {
    expect(lookup('nav.mail')).toBe('Mail');
    expect(lookup('nav.mailSettings')).toBe('Mail settings');
  });

  it('names every check the backend can report, so none shows as a raw id', () => {
    const ids = ['enabled', 'domain', 'provider', 'suspended', 'external', 'inbound', 'webhook', 'database', 'mailboxes', 'systemMailbox', 'queue', 'storage', 'dnsMx', 'dnsSpf', 'dnsDmarc', 'dnsDkim', 'loopback', 'inboundTest'];
    for (const id of ids) expect(typeof lookup(`mailSettings.checks.${id}`), id).toBe('string');
    for (const status of ['pass', 'warn', 'fail', 'skip']) expect(typeof lookup(`mailSettings.statusLabel.${status}`)).toBe('string');
  });
});
