import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID_ADMIN ?? 'ug.nesthomecare.admin',
  appName: process.env.VITE_APP_NAME_ADMIN ?? 'Well Nest Home Care Uganda Admin',
  webDir: 'dist-admin-native',
  server: {
    androidScheme: 'https',
  },
};

export default config;
