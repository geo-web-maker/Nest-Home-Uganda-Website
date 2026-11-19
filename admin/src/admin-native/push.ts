import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/** The server names these channels in every push. Android drops to a silent default channel if they do not exist yet. */
async function ensurePushChannels() {
  try {
    await PushNotifications.createChannel({ id: 'nest_normal', name: 'Updates', description: 'Mail and care updates', importance: 3, visibility: 1, vibration: true });
    await PushNotifications.createChannel({ id: 'nest_critical', name: 'Urgent safety alerts', description: 'SOS and critical care alerts', importance: 5, visibility: 1, vibration: true });
  } catch { /* Channels only exist on Android 8 and later. */ }
}

/** The layout (inside the router) listens for these, so a tap can open the right screen and a push can show while the app is open. */
export const PUSH_OPEN_EVENT = 'nest:push-open';
export const PUSH_RECEIVED_EVENT = 'nest:push-received';

export async function registerAdminPush(onToken: (token: string) => Promise<void>) {
  if (!Capacitor.isNativePlatform()) return;
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;
  await ensurePushChannels();
  await PushNotifications.addListener('registration', (token) => {
    void onToken(token.value);
  });
  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    window.dispatchEvent(new CustomEvent(PUSH_RECEIVED_EVENT, { detail: { title: notification.title ?? '', body: notification.body ?? '' } }));
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    window.dispatchEvent(new CustomEvent(PUSH_OPEN_EVENT, { detail: action.notification.data ?? {} }));
  });
  await PushNotifications.register();
}
