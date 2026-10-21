/** wa.me links (spec 6.2). `digits` is business.whatsapp: digits only, e.g. "256787499988". */

export const PLAIN_WHATSAPP_MESSAGE = 'Hello Nest Home Care, I would like to ask about home care.';

export function whatsappUrl(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** The plain "Chat on WhatsApp" button: no enquiry, just a conversation. */
export function plainWhatsappUrl(digits: string): string {
  return whatsappUrl(digits, PLAIN_WHATSAPP_MESSAGE);
}
