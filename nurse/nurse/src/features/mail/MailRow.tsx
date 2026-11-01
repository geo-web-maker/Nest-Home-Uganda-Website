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

export function MailRow({ message, onOpen, onSwipe }: Props) {
  const swipe = useSwipe(onSwipe);
  return <li className="mail-item" {...swipe}>
    <PillButton type="button" tone="ghost" size="full" showArrow={false} className={`mail-row${message.is_read ? '' : ' mail-row--unread'}`} onClick={onOpen}>
      <span className="mail-row__main">
        <span className="mail-row__from">{message.from_name || message.from_address}{message.is_starred ? ' ★' : ''}</span>
        <span className="mail-row__subject">{message.subject || copy.mail.noSubject}</span>
        <span className="mail-row__time">{new Date(message.received_at).toLocaleString()}</span>
      </span>
      {!message.is_read && <span className="mail-row__flag">{copy.mail.unread}</span>}
    </PillButton>
  </li>;
}
