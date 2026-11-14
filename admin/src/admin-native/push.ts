import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
export async function registerAdminPush(onToken: (token: string) => Promise<void>) {
  if (!Capacitor.isNativePlatform()) return;
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;
  await PushNotifications.register();
  await PushNotifications.addListener('registration', (token) => {
    void onToken(token.value);
  });
}
