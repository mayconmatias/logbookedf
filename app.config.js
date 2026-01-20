import 'dotenv/config';

export default {
  expo: {
    name: "Logbook EdF",
    slug: "logbookedf",
    scheme: "logbookedf",
    version: "1.0.3",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.mayconmatias.logbookedf", 
      buildNumber: "11", 
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["remote-notification"] // Necessário para notificações avançadas
      }
    },
    
    android: {
      package: "com.mayconmatias.logbookedf",
      versionCode: 11,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png", 
        backgroundColor: "#ffffff"
      },
      permissions: [
        "android.permission.USE_BIOMETRIC",
        "android.permission.USE_FINGERPRINT",
        "android.permission.FOREGROUND_SERVICE", // Para o Timer na tela bloqueada
        "android.permission.FOREGROUND_SERVICE_DATA_SYNC"
      ]
    },

    web: {
      bundler: "metro",
      favicon: "./assets/favicon.png"
    },

    updates: {
      enabled: true,
      url: "https://u.expo.dev/c69323ab-c81d-444e-821a-4dad327e89f8",
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      requestHeaders: {
        'expo-channel-name': 'production' 
      }
    },

    runtimeVersion: "1.0.3",

    extra: {
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      eas: {
        projectId: "c69323ab-c81d-444e-821a-4dad327e89f8"
      }
    },

    plugins: [
      "expo-font",
      "expo-asset",
      "expo-local-authentication",
      "expo-router",
      "expo-localization", // i18n
      [
        "expo-build-properties",
        {
          android: {
            extraMavenRepos: [
              "../../node_modules/@notifee/react-native/android/libs"
            ],
            // Aumenta compatibilidade do Kotlin para libs modernas
          },
          ios: {
            useFrameworks: "static"
          }
        }
      ],
      [
        "expo-updates",
        {
          username: "profmaycon",
          url: "https://u.expo.dev/c69323ab-c81d-444e-821a-4dad327e89f8",
          enabled: true,
          checkOnLaunch: "ALWAYS",
          requestHeaders: {
            "expo-channel-name": "production"
          }
        }
      ]
    ]
  }
};