// app.config.cts

// NENHUM 'dotenv' importado. Chaves coladas diretamente.

export default {
  expo: {
    name: "treino-mvp",
    slug: "treino-mvp",
    scheme: "treinomvp",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: { image: "./assets/splash.png", resizeMode: "contain", backgroundColor: "#ffffff" },
    ios: { supportsTablet: true },
    android: { adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#ffffff" } },
    web: { bundler: "metro" },
    extra: {
      // CHAVES COLADAS DIRETAMENTE (PLANO B)
      SUPABASE_URL: "https://ojkfzowzuyyxgmmljbsc.supabase.co",
      SUPABASE_ANON_KEY: "eyJhbGciOiJIZDA5ZTAxMS0yYjQ3LTRjYjQtYWFmYi01YWYxYjM3Y2QxODkiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY5NTM5NjE5MiwiZXhwIjoyMDEwOTcyMTkyfQ.Fj0lY6Pkyf-D2n3vIUEMi6DAA1nGUdYc-w2l3HEqYvA"
    }
  }
} as const;