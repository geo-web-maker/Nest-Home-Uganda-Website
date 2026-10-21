import { BookingError } from './bookingApi';
import { submitEnquiryViaClient } from './enquirySubmit';

const payload = { name: 'Ada', preferred_start: '' } as never;

describe('submitEnquiryViaClient', () => {
  it('posts to /public/enquiries, sends an empty start as null, maps the result', async () => {
    const post = vi
      .fn()
      .mockResolvedValue({ reference: 'NHC-1', whatsapp_url: 'https://wa.me/1' });
    const result = await submitEnquiryViaClient(payload, { post });
    expect(post).toHaveBeenCalledWith(
      '/public/enquiries',
      { name: 'Ada', preferred_start: null },
      { params: { lang: 'en' } },
    );
    expect(result).toEqual({ reference: 'NHC-1', whatsappUrl: 'https://wa.me/1' });
  });

  it.each([
    [429, {}, 'rate_limited'],
    [422, { fields: { phone: 'bad' } }, 'validation'],
    [500, {}, 'failed'],
  ])('maps a %s to a BookingError of kind %s', async (status, extra, kind) => {
    const post = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status }, extra));
    await expect(submitEnquiryViaClient(payload, { post })).rejects.toMatchObject({
      name: 'BookingError',
      kind,
    });
    await expect(submitEnquiryViaClient(payload, { post })).rejects.toBeInstanceOf(BookingError);
  });
});
