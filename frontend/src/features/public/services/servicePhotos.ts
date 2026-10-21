import type { ServicePublic } from '../../../types';

// TODO(media): the API gives only `photo_media_id` and there is no media URL builder yet. Until
// there is, the four photos shipped in public/images/services are matched by service number
// (file number = service number - 1). Replace this file's body with the media URL when it exists.
const PHOTOS: Record<number, string> = {
  1: '/images/services/service-0-elderly.jpg',
  2: '/images/services/service-1-postnatal.jpg',
  3: '/images/services/service-2-wound-care.jpg',
  6: '/images/services/service-5-chronic.jpg',
};

export function servicePhotoUrl(service: ServicePublic): string | null {
  return PHOTOS[service.number] ?? null;
}
