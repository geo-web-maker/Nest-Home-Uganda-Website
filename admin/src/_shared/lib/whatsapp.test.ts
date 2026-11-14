/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { PLAIN_WHATSAPP_MESSAGE, plainWhatsappUrl, whatsappUrl } from './whatsapp';

describe('whatsapp links', () => {
  it('encodes the message', () => {
    expect(whatsappUrl('256787499988', 'Hi there & more')).toBe(
      'https://wa.me/256787499988?text=Hi%20there%20%26%20more',
    );
  });

  it('builds the plain chat link from the spec text', () => {
    expect(plainWhatsappUrl('256787499988')).toBe(
      `https://wa.me/256787499988?text=${encodeURIComponent(PLAIN_WHATSAPP_MESSAGE)}`,
    );
  });
});
