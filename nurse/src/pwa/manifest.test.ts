import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKGROUND_COLOR, THEME_COLOR, manifest } from './manifest';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../public');
const repoRoot = path.resolve(here, '../../..');

function pngSize(file: string): { width: number; height: number } {
  const bytes = fs.readFileSync(file);
  // PNG signature (8 bytes), then the IHDR chunk: length(4) type(4) width(4) height(4).
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('nurse PWA manifest', () => {
  it('is installable: name, standalone display, start URL and scope', () => {
    expect(manifest.name).toBe('Well Nest Home Care Uganda Nurse');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
  });

  it('uses the design token colours', () => {
    const tokens = JSON.parse(fs.readFileSync(path.join(repoRoot, 'design/tokens.json'), 'utf8'));
    expect(THEME_COLOR.toLowerCase()).toBe(String(tokens.color.light.forest).toLowerCase());
    expect(BACKGROUND_COLOR.toLowerCase()).toBe(String(tokens.color.light.bg).toLowerCase());
  });

  it('declares 192 and 512 icons plus a maskable icon', () => {
    const sizes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`);
    expect(sizes).toContain('192x192:any');
    expect(sizes).toContain('512x512:any');
    expect(sizes).toContain('512x512:maskable');
  });

  it('points every icon at a real PNG of the declared size', () => {
    for (const icon of manifest.icons) {
      const file = path.join(publicDir, icon.src);
      expect(fs.existsSync(file), `${icon.src} is missing`).toBe(true);
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(file)).toEqual({ width: w, height: h });
    }
  });

  it('ships the apple touch icon and the SVG favicon', () => {
    expect(pngSize(path.join(publicDir, 'icons/apple-touch-icon-180.png'))).toEqual({ width: 180, height: 180 });
    expect(fs.existsSync(path.join(publicDir, 'icons/icon.svg'))).toBe(true);
  });

  it('has no second manifest file that could shadow the generated one', () => {
    expect(fs.existsSync(path.join(publicDir, 'manifest.webmanifest'))).toBe(false);
  });

  it('index.html has one manifest-free head with the icon links', () => {
    const html = fs.readFileSync(path.resolve(here, '../../index.html'), 'utf8');
    expect(html).not.toMatch(/rel="manifest"/);
    expect(html.match(/name="viewport"/g)).toHaveLength(1);
    expect(html.match(/name="robots"/g)).toHaveLength(1);
    expect(html.match(/name="theme-color"/g)).toHaveLength(1);
    expect(html).toContain('apple-touch-icon');
  });
});
