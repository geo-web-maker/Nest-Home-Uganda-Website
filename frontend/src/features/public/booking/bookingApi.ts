import type { BookingPayload } from './bookingSchema';

export type BookingResult = { reference: string; whatsappUrl: string };

export type BookingErrorKind = 'rate_limited' | 'validation' | 'failed';

/** Thrown by `submitEnquiry`. `fields` holds server field messages for a 422. */
export class BookingError extends Error {
  constructor(
    public readonly kind: BookingErrorKind,
    public readonly fields: Record<string, string> = {},
  ) {
    super(kind);
    this.name = 'BookingError';
  }
}

type Options = {
  /** Origin of the API, e.g. import.meta.env.VITE_API_URL. */
  baseUrl: string;
  lang?: string;
  fetchImpl?: typeof fetch;
};

/**
 * POST /api/v1/public/enquiries. Self-contained on purpose: when S3's apiClient exists,
 * the page passes `(payload) => apiClient.post(...)` to BookingForm instead and this file
 * can go. The server error shape is {error: {code, message, fields}} (spec 9.1).
 */
export async function submitEnquiry(
  payload: BookingPayload,
  { baseUrl, lang = 'en', fetchImpl = fetch }: Options,
): Promise<BookingResult> {
  let response: Response;
  try {
    response = await fetchImpl(
      `${baseUrl}/api/v1/public/enquiries?lang=${encodeURIComponent(lang)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          preferred_start: payload.preferred_start || null,
        }),
      },
    );
  } catch {
    throw new BookingError('failed');
  }
  if (response.status === 429) throw new BookingError('rate_limited');
  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as {
      error?: { fields?: Record<string, string> };
    } | null;
    const fields = body?.error?.fields ?? {};
    throw new BookingError(Object.keys(fields).length > 0 ? 'validation' : 'failed', fields);
  }
  if (!response.ok) throw new BookingError('failed');
  const data = (await response.json()) as { reference: string; whatsapp_url: string };
  return { reference: data.reference, whatsappUrl: data.whatsapp_url };
}

/** Call and WhatsApp clicks (spec 6.2). Fire and forget; never blocks the click. */
export function trackClick(
  channel: 'call' | 'whatsapp',
  page: string,
  baseUrl: string,
  beacon: Pick<Navigator, 'sendBeacon'> = navigator,
): void {
  try {
    const body = new Blob([JSON.stringify({ channel, page })], { type: 'application/json' });
    beacon.sendBeacon(`${baseUrl}/api/v1/public/clicks`, body);
  } catch {
    // Tracking must never break the page.
  }
}
