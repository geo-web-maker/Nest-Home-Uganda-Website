import { apiClient } from '../../../lib/api/client';
import type { ApiClient } from '../../../lib/api/client';
import { BookingError } from './bookingApi';
import type { BookingResult } from './bookingApi';
import type { BookingPayload } from './bookingSchema';

/**
 * Sends an enquiry through the shared `apiClient` and maps its errors to `BookingError`.
 * Used by every page that renders BookingForm (Contact and the service pages), so the
 * 429 and 422 handling lives in one place.
 */
export async function submitEnquiryViaClient(
  payload: BookingPayload,
  client: Pick<ApiClient, 'post'> = apiClient,
): Promise<BookingResult> {
  try {
    const result = await client.post<{ reference: string; whatsapp_url: string }>(
      '/public/enquiries',
      { ...payload, preferred_start: payload.preferred_start || null },
      { params: { lang: 'en' } },
    );
    return { reference: result.reference, whatsappUrl: result.whatsapp_url };
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error ? (error.status as number) : 0;
    if (status === 429) throw new BookingError('rate_limited');
    if (status === 422 && error && typeof error === 'object' && 'fields' in error)
      throw new BookingError('validation', error.fields as Record<string, string>);
    throw new BookingError('failed');
  }
}
