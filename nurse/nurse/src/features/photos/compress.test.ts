import { describe, expect, it } from 'vitest';
import { compressPhoto } from './compress';

describe('photo compression input validation', () => {
  it('rejects non-image files before attempting compression', async () => {
    await expect(compressPhoto(new File(['text'], 'notes.txt', { type: 'text/plain' }))).rejects.toThrow('Choose an image file.');
  });
});

import { hasJpegSignature, PHOTO_MAX_BYTES, PHOTO_MAX_DIMENSION, PHOTO_THUMBNAIL_DIMENSION } from './compress';

describe('photo preparation safeguards', () => {
  it('recognises JPEG bytes rather than trusting a filename or MIME type', async () => {
    expect(await hasJpegSignature(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])]))).toBe(true);
    expect(await hasJpegSignature(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]))).toBe(false);
    expect(await hasJpegSignature(new Blob(['short']))).toBe(false);
  });

  it('pins the approved local image and thumbnail limits', () => {
    expect(PHOTO_MAX_DIMENSION).toBe(1280);
    expect(PHOTO_MAX_BYTES).toBe(400 * 1024);
    expect(PHOTO_THUMBNAIL_DIMENSION).toBe(160);
  });
});
