"use client";

import { useState } from "react";
import GlobeIcon from "@/components/idesign/globe-icon";
import { LANGUAGES, type LanguageCode, type TextDirection } from "@/lib/al-rahma/i18n";

export default function LanguageSwitcher({
  language,
  onChange,
  label,
  dir,
}: {
  language: LanguageCode;
  onChange: (code: LanguageCode) => void;
  label: string;
  dir: TextDirection;
}) {
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((item) => item.code === language) ?? LANGUAGES[0];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`${label}: ${current.label}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-[#1D4ED8] shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
      >
        <GlobeIcon size={18} />
        <span>{current.label}</span>
        <svg aria-hidden="true" viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none">
          <path d="m2 4.5 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          className={`absolute z-30 mt-1 w-44 rounded-xl border border-blue-100 bg-white p-1 shadow-lg ${
            dir === "rtl" ? "right-0" : "left-0"
          }`}
          role="group"
          aria-label={label}
        >
          {LANGUAGES.map((item) => (
            <button
              key={item.code}
              type="button"
              lang={item.code}
              dir={item.dir}
              aria-pressed={item.code === language}
              onClick={() => {
                onChange(item.code);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-start text-sm transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-[#1D4ED8] ${
                item.code === language
                  ? "bg-blue-50 font-bold text-[#1D4ED8]"
                  : "text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
