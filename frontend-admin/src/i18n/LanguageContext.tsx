import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSettings } from '../api/endpoints';
import { dictionaries, LANGUAGES, type Language, type TranslationKey } from './dictionaries';

type Translate = (key: TranslationKey) => string;

const LanguageContext = createContext<{ language: Language; t: Translate } | undefined>(undefined);

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

// Til kafe sozlamalaridan olinadi (businesses.language) — shu bitta ['settings']
// so'rovi SettingsPage bilan birgalikda ishlatiladi, shuning uchun til saqlanganda
// (invalidateQueries) interfeys sahifani qayta yuklamasdan darhol yangilanadi.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  const value = useMemo(() => {
    const language: Language =
      settings?.language && isLanguage(settings.language) ? settings.language : 'uz';
    return { language, t: (key: TranslationKey) => dictionaries[language][key] };
  }, [settings?.language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useTranslation LanguageProvider ichida ishlatilishi kerak');
  return ctx;
}
