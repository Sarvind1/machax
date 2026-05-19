import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "xyz.machax.app",
  appName: "MachaX",
  webDir: "out",
  server: {
    // For development, uncomment to load from dev server:
    // url: "http://10.0.2.2:3000",
    // cleartext: true,
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
};

export default config;
