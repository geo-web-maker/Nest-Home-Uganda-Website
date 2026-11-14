import { describe, expect, it } from 'vitest';
import { manifest } from './manifest';

describe('admin PWA manifest', () => {
  it('launches the standalone admin at its root-path mail screen', () => {
    expect(manifest.start_url).toBe('/mail');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('includes standard and maskable application icons', () => {
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icons/icon-192.png', purpose: 'any' }),
      expect.objectContaining({ src: '/icons/icon-512.png', purpose: 'any' }),
      expect.objectContaining({ src: '/icons/maskable-512.png', purpose: 'maskable' }),
    ]));
  });
});
