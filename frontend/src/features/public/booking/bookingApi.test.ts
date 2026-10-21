import { BookingError, submitEnquiry, trackClick } from './bookingApi';
import type { BookingPayload } from './bookingSchema';

const PAYLOAD: BookingPayload = {
  name: 'Mary Atim',
  phone: '0787 499 988',
  relationship: 'parent',
  service_ids: ['a'.repeat(24)],
  area: 'Ntinda',
  preferred_start: '',
  note: '',
  consent: true,
  website: '',
};

const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('submitEnquiry', () => {
  it('posts JSON to the public endpoint and maps the reply', async () => {
    const fetchImpl = reply(201, {
      reference: 'NHC-000001',
      whatsapp_url: 'https://wa.me/1?text=x',
    });
    const out = await submitEnquiry(PAYLOAD, { baseUrl: 'https://api.test', fetchImpl });
    expect(out).toEqual({ reference: 'NHC-000001', whatsappUrl: 'https://wa.me/1?text=x' });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/api/v1/public/enquiries?lang=en');
    expect(JSON.parse(String(init?.body))).toMatchObject({ preferred_start: null, consent: true });
  });

  it('maps 429, 422 with fields, other statuses and network errors', async () => {
    const opts = (fetchImpl: typeof fetch) => ({ baseUrl: '', fetchImpl });
    await expect(submitEnquiry(PAYLOAD, opts(reply(429, {})))).rejects.toMatchObject({
      kind: 'rate_limited',
    });
    await expect(
      submitEnquiry(PAYLOAD, opts(reply(422, { error: { fields: { phone: 'bad' } } }))),
    ).rejects.toMatchObject({ kind: 'validation', fields: { phone: 'bad' } });
    await expect(
      submitEnquiry(PAYLOAD, opts(reply(422, { error: { message: 'We couldn’t send that.' } }))),
    ).rejects.toMatchObject({ kind: 'failed' });
    await expect(submitEnquiry(PAYLOAD, opts(reply(500, {})))).rejects.toBeInstanceOf(BookingError);
    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    await expect(submitEnquiry(PAYLOAD, opts(down))).rejects.toMatchObject({ kind: 'failed' });
  });
});

describe('trackClick', () => {
  it('sends a beacon and never throws', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    trackClick('call', '/contact', 'https://api.test', { sendBeacon });
    expect(sendBeacon).toHaveBeenCalledWith(
      'https://api.test/api/v1/public/clicks',
      expect.any(Blob),
    );
    const broken = {
      sendBeacon: () => {
        throw new Error('no');
      },
    };
    expect(() => trackClick('whatsapp', '/', '', broken)).not.toThrow();
  });
});
