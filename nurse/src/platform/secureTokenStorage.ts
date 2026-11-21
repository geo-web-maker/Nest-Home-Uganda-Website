import { Capacitor } from '@capacitor/core';
const REFRESH_KEY='nest.nurse.refresh';
type SecurePlugin={set(options:{key:string;value:string}):Promise<unknown>;get(options:{key:string}):Promise<{value:string}>;remove(options:{key:string}):Promise<unknown>};
// Never return the plugin itself from an async function: Capacitor sends the promise's `.then` check to the
// native side, which never answers, so callers wait forever (blank screen on launch). Wrap it in an object.
async function plugin():Promise<{api:SecurePlugin}>{const loaded=await import('capacitor-secure-storage-plugin') as unknown as {SecureStoragePlugin?:SecurePlugin};if(!loaded.SecureStoragePlugin)throw new Error('Secure token storage is unavailable.');return {api:loaded.SecureStoragePlugin};}
export async function saveRefreshToken(value:string){if(Capacitor.isNativePlatform()) await (await plugin()).api.set({key:REFRESH_KEY,value});}
export async function readRefreshToken():Promise<string|null>{if(!Capacitor.isNativePlatform())return null;try{return (await (await plugin()).api.get({key:REFRESH_KEY})).value;}catch{return null;}}
export async function clearRefreshToken(){if(!Capacitor.isNativePlatform())return;try{await (await plugin()).api.remove({key:REFRESH_KEY});}catch{/* Already absent. */}}
