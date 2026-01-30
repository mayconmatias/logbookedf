import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import 'intl-pluralrules'; // Necessário para Android

// Importa suas traduções
import pt from './pt';

// Extrai o código de idioma (ex: "pt-BR" -> "pt")
const deviceLanguage = Localization.getLocales()[0]?.languageCode || 'pt';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      // Futuro: en: { translation: en }
    },
    lng: deviceLanguage, // Idioma inicial
    fallbackLng: 'pt',   // Se não achar, usa português
    interpolation: {
      escapeValue: false, // React já protege contra XSS
    },
    compatibilityJSON: 'v4', // Compatibilidade com Android
  });

export default i18n;