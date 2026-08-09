import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from '@/localization/locales/en';
import { es } from '@/localization/locales/es';
import { ptBR } from '@/localization/locales/pt-BR';

export const translationResources = { en, 'pt-BR': ptBR, es } as const;
export const appI18n = createInstance();

void appI18n.use(initReactI18next).init({
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
  keySeparator: false,
  lng: 'en',
  resources: Object.fromEntries(
    Object.entries(translationResources).map(([language, translation]) => [
      language,
      { translation },
    ]),
  ),
  supportedLngs: Object.keys(translationResources),
});
