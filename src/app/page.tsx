"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import IDMark from "@/components/idesign/id-mark";
import GlobeIcon from "@/components/idesign/globe-icon";
import StudioEmblem from "@/components/idesign/studio-emblem";
import LanguageSwitcher from "@/components/idesign/language-switcher";
import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";
import {
  detectLanguage,
  languageDirection,
  persistLanguagePreference,
  readLanguagePreference,
  translate,
  type LanguageCode,
  type TranslationKey,
} from "@/lib/al-rahma/i18n";

export default function Home() {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const direction = languageDirection(language);
  const text = (key: TranslationKey) => translate(language, key);

  useEffect(() => {
    let active = true;
    const savedLanguage = readLanguagePreference();
    if (savedLanguage) {
      void Promise.resolve().then(() => {
        if (active) setLanguage(savedLanguage);
      });
      return () => {
        active = false;
      };
    }

    void fetch("/api/locale")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to resolve visitor locale.");
        const result: unknown = await response.json();
        if (
          active &&
          typeof result === "object" &&
          result !== null &&
          "language" in result &&
          typeof result.language === "string"
        ) {
          setLanguage(detectLanguage({ savedLanguage: readLanguagePreference(), acceptLanguage: result.language }));
        }
      })
      .catch(() => {
        if (active && !readLanguagePreference()) {
          setLanguage(detectLanguage({ acceptLanguage: navigator.languages.join(",") }));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [language, direction]);

  const chooseLanguage = (code: LanguageCode) => {
    persistLanguagePreference(code);
    setLanguage(code);
  };

  return (
    <main
      dir={direction}
      className="min-h-screen bg-white text-slate-900"
    >
      <header className="border-b border-blue-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <StudioEmblem />
            <span className="leading-tight">
              <span className="block text-lg font-black text-[#1D4ED8]">
                {IDESIGN_STUDIO_CONFIG.name} · {text("introBadge")}
              </span>
              <span className="block text-xs font-semibold text-slate-500" dir="ltr">
                {IDESIGN_STUDIO_CONFIG.productName}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50"
              aria-hidden="true"
            >
              <GlobeIcon size={20} />
            </span>
            <LanguageSwitcher
              language={language}
              onChange={chooseLanguage}
              label={text("language")}
              dir={direction}
            />
            <Link
              href="/dashboard"
              className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-[#1D4ED8] transition hover:bg-blue-50"
            >
              {text("openStudio")}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-sm font-extrabold tracking-wide text-[#2563EB]">
              {IDESIGN_STUDIO_CONFIG.name} · {IDESIGN_STUDIO_CONFIG.productName}
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight text-slate-900 sm:text-5xl">
              {text("heroTitle")}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              {text("heroSubtitle")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="rounded-xl bg-[#1D4ED8] px-7 py-3 font-extrabold text-white shadow-sm transition hover:bg-[#1E40AF]"
              >
                {text("openStudio")}
              </Link>
              <p className="text-sm text-slate-500">{text("introCtaNote")}</p>
            </div>
          </div>

          <aside className="rounded-3xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-7 shadow-sm">
            <div className="flex items-center gap-3">
              <IDMark size={40} />
              <p className="font-black text-[#1D4ED8]">{text("contact")}</p>
            </div>
            <div className="mt-6 space-y-3 text-sm font-semibold" dir="ltr">
              <a
                href={IDESIGN_STUDIO_CONFIG.websiteUrl}
                className="block text-blue-700 underline"
              >
                {IDESIGN_STUDIO_CONFIG.websiteLabel}
              </a>
              <a
                href={IDESIGN_STUDIO_CONFIG.emailUrl}
                className="block text-blue-700 underline"
              >
                {IDESIGN_STUDIO_CONFIG.email}
              </a>
              <a
                href={IDESIGN_STUDIO_CONFIG.whatsappUrl}
                className="block text-blue-700 underline"
              >
                {IDESIGN_STUDIO_CONFIG.phoneLabel}
              </a>
            </div>
            <p className="mt-6 rounded-xl bg-white p-4 text-xs leading-6 text-slate-500">
              {text("downloadHint")}
            </p>
          </aside>
        </section>
      </div>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-blue-100 px-5 py-6 text-xs text-slate-500">
        <p className="flex items-center gap-2">
          <IDMark small />
          {IDESIGN_STUDIO_CONFIG.productName} · {IDESIGN_STUDIO_CONFIG.tagline}
        </p>
        <p className="flex flex-wrap gap-3" dir="ltr">
          <a href={IDESIGN_STUDIO_CONFIG.websiteUrl} className="text-blue-700 underline">
            {IDESIGN_STUDIO_CONFIG.websiteLabel}
          </a>
          <a href={IDESIGN_STUDIO_CONFIG.emailUrl} className="text-blue-700 underline">
            {IDESIGN_STUDIO_CONFIG.email}
          </a>
          <a href={IDESIGN_STUDIO_CONFIG.whatsappUrl} className="text-blue-700 underline">
            {IDESIGN_STUDIO_CONFIG.phoneLabel}
          </a>
        </p>
      </footer>
    </main>
  );
}
