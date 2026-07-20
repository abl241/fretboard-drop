import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: "com.guitarrise.fretboarddrop",
  appName: "Fretboard Drop",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
  },
};

export default config;
