/** English copy for the booking form (spec 6.1, 6.2). S3's i18n wiring can serve this as a namespace. */

export type BookingCopy = {
  title: string;
  chatOnWhatsapp: string;
  or: string;
  required: string;
  name: string;
  phone: string;
  relationship: string;
  relationshipOptions: Record<'self' | 'parent' | 'spouse' | 'child' | 'other', string>;
  careNeeded: string;
  area: string;
  preferredStart: string;
  preferredStartPlaceholder: string;
  preferredStartOptions: Record<'today' | 'this_week' | 'later' | 'not_sure', string>;
  note: string;
  noteHint: string;
  noteCount: (used: number, max: number) => string;
  consent: string;
  privacyLink: string;
  honeypotLabel: string;
  send: string;
  sending: string;
  thanksHeading: string;
  continueOnWhatsapp: string;
  referenceLine: (reference: string) => string;
  sendFailed: string;
  callNow: string;
  rateLimited: string;
  errors: {
    name: string;
    nameLink: string;
    phone: string;
    relationship: string;
    services: string;
    area: string;
    note: string;
    consent: string;
  };
};

export const bookingCopyEn: BookingCopy = {
  title: 'Book a home visit',
  chatOnWhatsapp: 'Chat on WhatsApp',
  or: 'or send a request',
  required: '(required)',
  name: 'Your name',
  phone: 'Phone number',
  relationship: 'Who needs care',
  relationshipOptions: {
    self: 'Myself',
    parent: 'My parent',
    spouse: 'My spouse',
    child: 'My child or baby',
    other: 'Someone else',
  },
  careNeeded: 'Care needed',
  area: 'Area',
  preferredStart: 'Preferred start',
  preferredStartPlaceholder: 'Choose one',
  preferredStartOptions: {
    today: 'Today',
    this_week: 'This week',
    later: 'Later',
    not_sure: 'Not sure',
  },
  note: 'Short note',
  noteHint: 'No medical details here. The nurse will ask later.',
  noteCount: (used, max) => `${used} of ${max} characters`,
  consent: 'I agree that Nest Home Care may contact me about this request.',
  privacyLink: 'Privacy',
  honeypotLabel: 'Leave this field empty',
  send: 'Send request',
  sending: 'Sending...',
  thanksHeading: 'Thank you. A nurse will contact you shortly.',
  continueOnWhatsapp: 'Continue on WhatsApp',
  referenceLine: (reference) => `Your request reference is ${reference}.`,
  sendFailed: 'We couldn’t send that. Please try WhatsApp or call us.',
  callNow: 'Call now',
  rateLimited: 'Too many requests from this device. Please try WhatsApp or call us.',
  errors: {
    name: 'Enter your name (2 to 80 characters).',
    nameLink: 'Please enter your name only.',
    phone: 'Enter a valid Uganda phone number, for example 0787 499 988.',
    relationship: 'Choose who needs care.',
    services: 'Choose at least one kind of care.',
    area: 'Enter your area (2 to 80 characters).',
    note: 'Keep the note to 500 characters.',
    consent: 'Please tick the box so we can contact you.',
  },
};
