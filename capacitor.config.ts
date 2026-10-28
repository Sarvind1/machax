/// <reference types="@capacitor-firebase/authentication" />

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
  plugins: {
    // Native Google sign-in. skipNativeAuth stays false so the native Firebase
    // user exists too; the web SDK is then signed in with the same Google
    // credential (src/lib/firebase.ts) so getIdToken() works the same everywhere.
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com"],
    },
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
};

export default config;
