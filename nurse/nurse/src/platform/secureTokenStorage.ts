import { Capacitor } from '@capacitor/core';
const REFRESH_KEY='nest.nurse.refresh';
type SecurePlugin={set(options:{key:string;value:string}):Promise<unknown>;get(options:{key:string}):Promise<{value:string}>;remove(options:{key:string}):Promise<unknown>};
async function plugin():Promise<SecurePlugin>{const loaded=await import('capacitor-secure-storage-plugin') as unknown as {SecureStoragePlugin?:SecurePlugin};if(!loaded.SecureStoragePlugin)throw new Error('Secure token storage is unavailable.');return loaded.SecureStoragePlugin;}
export async function saveRefreshToken(value:string){if(Capacitor.isNativePlatform()) await (await plugin()).set({key:REFRESH_KEY,value});}
export async function readRefreshToken():Promise<string|null>{if(!Capacitor.isNativePlatform())return null;try{return (await (await plugin()).get({key:REFRESH_KEY})).value;}catch{return null;}}
export async function clearRefreshToken(){if(!Capacitor.isNativePlatform())return;try{await (await plugin()).remove({key:REFRESH_KEY});}catch{/* Already absent. */}}
