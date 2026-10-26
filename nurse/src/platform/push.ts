import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PushNotifications, type ActionPerformed, type PushNotificationSchema, type Token } from '@capacitor/push-notifications';

export type StopPushRegistration = () => Promise<void>;
export type PushCallbacks = {
  onReceived?: (notification: PushNotificationSchema) => void;
  onAction?: (action: ActionPerformed) => void;
};

/** Register for native push after the listener is installed, and return a cleanup handle. */
export async function registerForPush(
  onToken: (token: string) => Promise<void>,
  callbacks: PushCallbacks = {},
): Promise<StopPushRegistration | undefined> {
  if (!Capacitor.isNativePlatform()) return undefined;
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return undefined;

  let registrationHandle: PluginListenerHandle | undefined;
  let errorHandle: PluginListenerHandle | undefined;
  let receivedHandle: PluginListenerHandle | undefined;
  let actionHandle: PluginListenerHandle | undefined;
  try {
    registrationHandle = await PushNotifications.addListener('registration', (token: Token) => {
      void onToken(token.value).catch(() => {
        // A transient API failure must not crash the native event handler.
        // The next registration event or a later sign-in can register the token again.
      });
    });
    errorHandle = await PushNotifications.addListener('registrationError', () => {
      // Do not include provider payloads in logs because they can contain device details.
    });
    receivedHandle = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      try { callbacks.onReceived?.(notification); } catch { /* A display callback must not crash native delivery. */ }
    });
    actionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      try { callbacks.onAction?.(action); } catch { /* A tap callback must not crash native delivery. */ }
    });
    await PushNotifications.register();
  } catch (error) {
    await Promise.all([registrationHandle?.remove(), errorHandle?.remove(), receivedHandle?.remove(), actionHandle?.remove()]);
    throw error;
  }

  return async () => {
    await Promise.all([registrationHandle?.remove(), errorHandle?.remove(), receivedHandle?.remove(), actionHandle?.remove()]);
  };
}
