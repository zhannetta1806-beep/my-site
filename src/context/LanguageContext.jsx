import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { list, readStoredLang, setActiveLang, storeLang, text } from "../lib/siteCopy";

const LanguageContext = createContext(null);

function applyDocument(lang) {
  document.documentElement.lang = lang === "kk" ? "kk" : "ru";
  const description = text(lang, "metaDescription");
  const title = text(lang, "metaTitle");
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", description);
  const ogLocale = document.querySelector('meta[property="og:locale"]');
  if (ogLocale) ogLocale.setAttribute("content", lang === "kk" ? "kk_KZ" : "ru_RU");
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", title);
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription) ogDescription.setAttribute("content", description);
  if (!document.title || document.title === text(lang === "kk" ? "ru" : "kk", "metaTitle")) {
    document.title = title;
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => setActiveLang(readStoredLang()));

  const setLang = (value) => {
    setLangState(storeLang(value));
  };

  useEffect(() => {
    applyDocument(lang);
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (key) => text(lang, key),
      items: (key) => list(lang, key),
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("Язык сайта недоступен");
  return value;
}
