"use client";

import { useState } from "react";
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
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-[#1D4ED8] transition hover:bg-blue-50"
      >
        {current.label} <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div
          className={`absolute z-30 mt-1 w-44 rounded-xl border border-blue-100 bg-white p-1 shadow-lg ${
            dir === "rtl" ? "right-0" : "left-0"
          }`}
        >
          {LANGUAGES.map((item) => (
            <button
              key={item.code}
              type="button"
              lang={item.code}
              dir={item.dir}
              onClick={() => {
                onChange(item.code);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-start text-sm transition hover:bg-blue-50 ${
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
