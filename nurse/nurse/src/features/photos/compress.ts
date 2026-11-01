import { copy } from '../../copy';

/** Re-encode photos locally so metadata such as EXIF GPS is not retained. */
export const PHOTO_MAX_DIMENSION = 1280;
export const PHOTO_MAX_BYTES = 400 * 1024;
export const PHOTO_THUMBNAIL_DIMENSION = 160;
export const PHOTO_THUMBNAIL_MAX_BYTES = 60 * 1024;

export type CompressedPhoto = {
  image: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
};

export async function hasJpegSignature(blob: Blob): Promise<boolean> {
  if (blob.size < 3) return false;
  const bytes = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function canvasJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(copy.photos.encodeFailed)), 'image/jpeg', quality);
  });
}

function drawScaled(bitmap: ImageBitmap, maxDimension: number): { canvas: HTMLCanvasElement; width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(copy.photos.compressionUnavailable);
  context.drawImage(bitmap, 0, 0, width, height);
  return { canvas, width, height };
}

export async function compressPhotoBundle(file: File, maxDimension = PHOTO_MAX_DIMENSION, maxBytes = PHOTO_MAX_BYTES): Promise<CompressedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error(copy.photos.badFile);
  if (typeof createImageBitmap !== 'function') {
    if (file.type !== 'image/jpeg' || file.size > maxBytes || !(await hasJpegSignature(file))) {
      throw new Error(copy.photos.prepareUnsupported);
    }
    // A browser without image decoding cannot safely create a thumbnail or strip metadata.
    throw new Error(copy.photos.prepareUnavailable);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scaled = drawScaled(bitmap, maxDimension);
    let image: Blob | undefined;
    for (let quality = 0.7; quality >= 0.399; quality = Math.round((quality - 0.1) * 10) / 10) {
      const candidate = await canvasJpeg(scaled.canvas, quality);
      if (candidate.size <= maxBytes) {
        image = candidate;
        break;
      }
    }
    if (!image) throw new Error(copy.photos.compressedTooLarge);
    if (!(await hasJpegSignature(image))) throw new Error(copy.photos.invalidJpeg);

    const thumbnailScale = Math.min(1, PHOTO_THUMBNAIL_DIMENSION / Math.max(scaled.width, scaled.height));
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = Math.max(1, Math.round(scaled.width * thumbnailScale));
    thumbCanvas.height = Math.max(1, Math.round(scaled.height * thumbnailScale));
    const thumbContext = thumbCanvas.getContext('2d');
    if (!thumbContext) throw new Error(copy.photos.thumbnailUnavailable);
    thumbContext.drawImage(scaled.canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    let thumbnail: Blob | undefined;
    for (let quality = 0.6; quality >= 0.399; quality = Math.round((quality - 0.1) * 10) / 10) {
      const candidate = await canvasJpeg(thumbCanvas, quality);
      if (candidate.size <= PHOTO_THUMBNAIL_MAX_BYTES) { thumbnail = candidate; break; }
    }
    if (!thumbnail || !(await hasJpegSignature(thumbnail))) throw new Error(copy.photos.thumbnailFailed);
    return { image, thumbnail, width: scaled.width, height: scaled.height };
  } finally {
    bitmap.close();
  }
}

export async function compressPhoto(file: File, maxDimension = PHOTO_MAX_DIMENSION, _quality = 0.7, maxBytes = PHOTO_MAX_BYTES): Promise<Blob> {
  return (await compressPhotoBundle(file, maxDimension, maxBytes)).image;
}
