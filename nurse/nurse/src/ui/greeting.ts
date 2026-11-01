import { copy } from '../copy';

export function greeting(date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', hour: '2-digit', hourCycle: 'h23' }).format(date));
  if (hour < 12) return copy.today.greeting.morning;
  if (hour < 17) return copy.today.greeting.afternoon;
  return copy.today.greeting.evening;
}
export function initials(name?: string | null, staffNumber?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length) return `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase();
  const suffix = (staffNumber ?? '').trim().slice(-2).toUpperCase();
  return suffix || 'N';
}
export function firstName(name?: string | null): string {
  return (name ?? '').trim().split(/\s+/).filter(Boolean)[0] ?? '';
}
export function greetingDate(date = new Date()): string {
  // Built from parts so the comma never depends on the ICU data bundled with Node or the browser.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')}, ${part('day')} ${part('month')}`;
}
