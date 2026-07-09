import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: "com.guitarrise.fretboarddrop",
  appName: "Fretboard Drop",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
  },

  server: {
    url: "http://192.168.86.209:5174/",
    cleartext: true,
  }
};

export default config;
