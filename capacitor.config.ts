import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.abcleanonme.huntdeer',
  appName: 'Huntdeer',
  webDir: 'dist',
  backgroundColor: '#1d2b1f',
  ios: {
    // The game draws edge to edge and handles the notch itself with env(safe-area-inset-*).
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#1d2b1f',
  },
  plugins: {
    StatusBar: { overlaysWebView: true },
  },
};

export default config;
