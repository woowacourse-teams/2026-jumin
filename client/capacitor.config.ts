import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID || 'com.parkingpeople.app',
  appName: '주차의 민족',
  webDir: 'dist',
  backgroundColor: '#4356d8',
  ios: {
    preferredContentMode: 'mobile',
  },
};

export default config;
