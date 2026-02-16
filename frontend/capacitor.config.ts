import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tmt.emergency',
  appName: 'TMT - Emergency Response',
  webDir: 'dist',

  // Server configuration
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: 'tmt.local',
  },

  // iOS specific configuration
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    backgroundColor: '#1f2937',
    preferredContentMode: 'mobile'
  },

  // Android specific configuration
  android: {
    backgroundColor: '#1f2937',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },

  // Plugin configurations
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1f2937',
      androidSplashResourceName: 'splash',
      showSpinner: false
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
