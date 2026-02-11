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
      buildNumber: "20",
      usesAppleSignIn: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["remote-notification"],
        // Configuração para Login do Google
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: [
              "com.googleusercontent.apps.541381977382-fj4itntgeofla5l7h31saqb7bq4lsdru"
            ]
          }
        ],
        NSPhotoLibraryAddUsageDescription: "O app precisa salvar imagens dos seus treinos para você compartilhar no Instagram/TikTok.",
        NSPhotoLibraryUsageDescription: "O app precisa acessar a galeria para salvar os stickers de treino."
      }
    },
    
    android: {
      package: "com.mayconmatias.logbookedf",
      versionCode: 20,
      googleServicesFile: "./google-services.json", // Importante para o Login Google Nativo
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png", 
        backgroundColor: "#ffffff"
      },
      permissions: [
        "android.permission.USE_BIOMETRIC",
        "android.permission.USE_FINGERPRINT",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.READ_EXTERNAL_STORAGE"
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
      "expo-web-browser", // [ADICIONADO AQUI]
      "expo-local-authentication",
      "expo-router",
      "expo-localization",
      "expo-apple-authentication",
      [
        "expo-media-library",
        {
          "photosPermission": "O app precisa salvar imagens dos seus treinos para você compartilhar.",
          "savePhotosPermission": "O app precisa salvar imagens dos seus treinos para você compartilhar."
        }
      ],
      [
        "expo-build-properties",
        {
          android: {
            extraMavenRepos: [
              "../../node_modules/@notifee/react-native/android/libs"
            ],
          },
          ios: {
            useFrameworks: "static"
          }
        }
      ],
      "@react-native-google-signin/google-signin",
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