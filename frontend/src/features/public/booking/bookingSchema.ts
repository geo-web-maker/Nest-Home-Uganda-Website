import { z } from 'zod';
import type { BookingCopy } from '../../../locales/en/booking';
import { isValidUgPhone } from '../../../lib/phone';

export const RELATIONSHIPS = ['self', 'parent', 'spouse', 'child', 'other'] as const;
export const START_OPTIONS = ['today', 'this_week', 'later', 'not_sure'] as const;
export const NOTE_MAX = 500;

// Same link test as the server: refuse links in the name field (spec 6.4).
const LINK = /(https?:|www\.|:\/\/|\b[\w-]+\.(?:com|net|org|info|biz|xyz|ru|cn|io|co|ug)\b)/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const clean = (value: string) => value.replace(CONTROL, '').trim();

/** Zod schema for the booking form. Messages come from the copy so they can be translated. */
export function createBookingSchema(errors: BookingCopy['errors']) {
  return z.object({
    name: z
      .string()
      .transform(clean)
      .pipe(
        z
          .string()
          .min(2, errors.name)
          .max(80, errors.name)
          .refine((v) => !LINK.test(v), errors.nameLink),
      ),
    phone: z.string().transform(clean).pipe(z.string().refine(isValidUgPhone, errors.phone)),
    relationship: z.enum(RELATIONSHIPS, { error: errors.relationship }),
    service_ids: z.array(z.string()).min(1, errors.services).max(8, errors.services),
    area: z.string().transform(clean).pipe(z.string().min(2, errors.area).max(80, errors.area)),
    preferred_start: z.union([z.enum(START_OPTIONS), z.literal('')]),
    note: z.string().transform(clean).pipe(z.string().max(NOTE_MAX, errors.note)),
    consent: z.literal(true, { error: errors.consent }),
    website: z.string(), // honeypot: sent as typed; the server rejects anything non-empty
  });
}

export type BookingValues = z.input<ReturnType<typeof createBookingSchema>>;
export type BookingPayload = z.output<ReturnType<typeof createBookingSchema>>;
