import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Notice } from '@shared/components/dialogs/Notice';
import { PUSH_OPEN_EVENT, PUSH_RECEIVED_EVENT } from '../../admin-native/push';

/** Where a tapped push opens. Only paths inside this app are followed. */
function targetFor(data: Record<string, unknown>): string | null {
  const link = typeof data.deep_link === 'string' ? data.deep_link : '';
  if (link.startsWith('/') && !link.startsWith('//')) return link;
  if (typeof data.case_id === 'string') return '/care/sos';
  if (typeof data.alert_id === 'string') return '/care/alerts';
  return null;
}

/** Shows a push that arrives while the app is open (floating, like every other admin notice) and opens the right screen on a tap. */
export function PushNotifier() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  useEffect(() => {
    const onReceived = (event: Event) => {
      const { title, body } = (event as CustomEvent<{ title: string; body: string }>).detail;
      setMessage([title, body].filter(Boolean).join(': '));
    };
    const onOpen = (event: Event) => {
      const target = targetFor((event as CustomEvent<Record<string, unknown>>).detail ?? {});
      if (target) navigate(target);
    };
    window.addEventListener(PUSH_RECEIVED_EVENT, onReceived);
    window.addEventListener(PUSH_OPEN_EVENT, onOpen);
    return () => { window.removeEventListener(PUSH_RECEIVED_EVENT, onReceived); window.removeEventListener(PUSH_OPEN_EVENT, onOpen); };
  }, [navigate]);
  return message ? <Notice floating onDismiss={() => setMessage('')}>{message}</Notice> : null;
}
