import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Logbook EdF",
  slug: "logbookedf",
  scheme: "logbookedf",
  version: "1.0.2",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.mayconmatias.logbookedf", 
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false
    }
  },
  
  android: {
    package: "com.mayconmatias.logbookedf",
    versionCode: 2,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png", 
      backgroundColor: "#ffffff"
    }
  },

  web: {
    bundler: "metro",
    favicon: "./assets/favicon.png"
  },

  updates: {
    enabled: true,
    url: "https://u.expo.dev/c69323ab-c81d-444e-821a-4dad327e89f8"
  },

  runtimeVersion: {
    policy: "appVersion"
  },

  extra: {
    EXPO_PUBLIC_SUPABASE_URL: "https://ojkfzowzuyyxgmmljbsc.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIZDA5ZTAxMS0yYjQ3LTRjYjQtYWFmYi01YWYxYjM3Y2QxODkiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY5NTM5NjE5MiwiZXhwIjoyMDEwOTcyMTkyfQ.Fj0lY6Pkyf-D2n3vIUEMi6DAA1nGUdYc-w2l3HEqYvA",
    eas: {
      projectId: "c69323ab-c81d-444e-821a-4dad327e89f8"
    }
  }
});