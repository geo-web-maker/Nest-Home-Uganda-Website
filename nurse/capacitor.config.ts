import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID_NURSE ?? 'ug.nesthomecare.nurse',
  appName: process.env.VITE_APP_NAME_NURSE ?? 'Nest Home Care Nurse',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_nest', iconColor: '#275e4b' },
    Geolocation: { permissions: { location: { title: 'Location for visit verification', message: 'Location is used when you check in or check out of an assigned visit.' } } },
  },
};
export default config;
