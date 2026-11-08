import { copy } from '../../copy';
import { PillButton } from '../../ui/PillButton';
import type { CachedMessage } from './mailStore';
import { useSwipe, type SwipeDirection } from './useSwipe';

type Props = {
  message: CachedMessage;
  onOpen: () => void;
  /** Swipe left and right. The same actions are always available inside the message, so swiping is a shortcut only. */
  onSwipe: (direction: SwipeDirection) => void;
};

/** Today shows the time, this year shows day and month, older mail shows the full date. */
function shortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MailRow({ message, onOpen, onSwipe }: Props) {
  const swipe = useSwipe(onSwipe);
  const sender = message.from_name || message.from_address || '?';
  return <li className="mail-item" {...swipe}>
    <PillButton type="button" tone="ghost" size="full" showArrow={false} className={`mail-row${message.is_read ? '' : ' mail-row--unread'}`} onClick={onOpen} title={new Date(message.received_at).toLocaleString()}>
      <span className="mail-row__avatar" aria-hidden="true">{sender.trim().charAt(0).toUpperCase()}</span>
      <span className="mail-row__main">
        <span className="mail-row__top">
          <span className="mail-row__from">{sender}{message.is_starred ? ' ★' : ''}</span>
          <span className="mail-row__time">{shortTime(message.received_at)}</span>
        </span>
        <span className="mail-row__subject">{message.subject || copy.mail.noSubject}</span>
      </span>
      {!message.is_read && <span className="mail-row__flag">{copy.mail.unread}</span>}
    </PillButton>
  </li>;
}
