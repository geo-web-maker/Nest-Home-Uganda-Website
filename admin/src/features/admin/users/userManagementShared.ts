import type { Delivery, UserInvite } from './types';

export type InviteKind = UserInvite['kind'];
export type InviteReach = UserInvite['reach'];

export const DELIVERIES: Delivery[] = ['email', 'sms', 'temp_password'];

export function toggleDelivery(list: Delivery[], item: Delivery, on: boolean): Delivery[] {
  if (on) return [...list.filter((delivery) => delivery !== item), item];
  return list.filter((delivery) => delivery !== item);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Translate = (...args: any[]) => string;
