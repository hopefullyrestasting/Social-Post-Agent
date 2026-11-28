/**
 * UI language catalog for the PostCraft studio shell.
 *
 * Every locale is materialized from the complete English dictionary, so a new
 * interface key can never be missing at runtime. Locale-specific entries
 * override the fallback where available.
 */
export const LANGUAGES = [
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
  { code: "ms", label: "Bahasa Melayu", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "de", label: "Deutsch", dir: "ltr" },
  { code: "zh", label: "中文", dir: "ltr" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export type TextDirection = (typeof LANGUAGES)[number]["dir"];
export const LANGUAGE_STORAGE_KEY = "social-post-agent-language";

const ARABIC_SPEAKING_COUNTRIES = new Set([
  "AE", "BH", "DZ", "EG", "IQ", "JO", "KW", "LB", "LY", "MA", "MR",
  "OM", "PS", "QA", "SA", "SD", "SY", "TN", "YE",
]);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGES.some((language) => language.code === value);
}

export function languageFromLocale(locale?: string | null): LanguageCode | null {
  const base = (locale ?? "").split(/[-_]/)[0]?.toLowerCase();
  return isLanguageCode(base) ? base : null;
}

export function detectLanguage({
  savedLanguage,
  country,
  acceptLanguage,
}: {
  savedLanguage?: unknown;
  country?: string | null;
  acceptLanguage?: string | null;
}): LanguageCode {
  if (isLanguageCode(savedLanguage)) return savedLanguage;
  if (ARABIC_SPEAKING_COUNTRIES.has((country ?? "").toUpperCase())) return "ar";

  const preferredLanguages = (acceptLanguage ?? "")
    .split(",")
    .map((entry, order) => {
      const [locale, ...parameters] = entry.trim().split(";");
      const quality = parameters
        .map((parameter) => /^q=([0-9.]+)$/i.exec(parameter.trim()))
        .find(Boolean)?.[1];
      return { locale, order, quality: quality === undefined ? 1 : Number(quality) };
    })
    .filter((entry) => entry.locale && Number.isFinite(entry.quality) && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.order - right.order);

  for (const preferred of preferredLanguages) {
    const language = languageFromLocale(preferred.locale);
    if (language) return language;
  }
  return "en";
}

export function readLanguagePreference(): LanguageCode | null {
  if (typeof window === "undefined") return null;
  try {
    return languageFromLocale(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistLanguagePreference(language: LanguageCode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Language selection still works for the current page if storage is blocked.
  }
}

const en = {
  language: "Language", languageHint: "Choose interface language", home: "Home", support: "Chat support",
  title: "PostCraft", subtitle: "Upload product photos, review the name, price and offer, then generate two designs per product with no repeats.",
  upload: "Upload product images from phone or computer", uploadHint: "Select multiple images; AI inspects each one and suggests a short punchy sales line.",
  products: "Product library", productsHint: "Products stay in sequence. Already generated products are never selected again.",
  count: "Count", generateNext: "Generate next (2 each)", generateSelected: "Generate selected (2 each)", generating: "Generating...",
  productName: "Product name", price: "Price", pricePlaceholder: "Optional — leave blank for no price", offer: "Offer", offerPlaceholder: "Optional — e.g. 20% off for a limited time",
  generated: "Generated", remaining: "Remaining", generateOne: "Generate 2 designs", generateAgain: "Generate again", empty: "No products yet. Upload images to begin.",
  uploading: "Uploading...", uploadDone: "Products added from images.", uploadFailed: "An image could not be uploaded.", saving: "Saving...", saved: "Saved.", saveFailed: "Could not save the product.", nameRequired: "Enter a product name.",
  generationDone: "Designs generated and pack downloaded.", generationPreparing: "Preparing generation...", generationBatchStatus: "Generating designs", generationSingleStatus: "Generating two designs for the product...", generationComplete: "Generation complete.", generationBusy: "Generation is busy for this key. Retry in", generationSeconds: "seconds", retryGeneration: "Retry now",
  generatedCreativesTitle: "Generated Creatives", generatedCreativesHint: "Saved designs for each product appear here and remain after a page refresh.", noGeneratedCreatives: "No generated creatives yet. Generate a batch or one product to see them here.", galleryLoading: "Loading creatives...", refreshCreatives: "Refresh creatives", viewAllCreatives: "View all creatives", downloadImage: "Download image", downloadAllZip: "Download all (ZIP)", variantLabel: "Variant", creativeProductFallback: "Product", downloadHint: "Each product gets 2 designs; the pack downloads automatically.", queueHint: "Generated products move to the end of the queue and are never repeated.", selectProducts: "Select products", remainingCount: "Remaining", generatedCount: "Generated", salesLine: "Sales line",
  introBadge: "Studio", heroTitle: "Product ads, made simple.", heroSubtitle: "Upload photos, review the details, and get two ready-to-share designs per product — no repeats.", openStudio: "Open studio", introCtaNote: "Works on phone and desktop.", contact: "Contact us",
  accessKey: "Access key", accessKeyPlaceholder: "Enter your annual access key", applyKey: "Save / Apply", keyStatus: "Key", brandStatus: "Brand", keyRequired: "Enter and apply your access key first.", accessKeyInvalid: "The access key is invalid or expired. Update it to continue.", accessKeySaved: "Access key saved and applied.", manageKey: "Manage key",
  brandSetupTitle: "One-time brand setup", brandSetupHint: "Enter your company name and industry once. Saving locks the identity, enables generation immediately, and cannot be changed later.", brandSetupRequired: "Complete one-time brand setup before generating.", brandName: "Brand / company name", industry: "Industry / business category", logoUrl: "Logo URL (optional)", logoFile: "Logo file (optional)", logoFileHint: "Upload a logo from your phone or computer: PNG, JPEG, WebP or SVG.", logoUploading: "Uploading logo...", logoUploaded: "Logo uploaded and ready to save.", logoUploadFailed: "Logo upload failed. Try a smaller file.", logoRemove: "Remove uploaded logo", provisionedDefaults: "Brand and support details were prefilled from your key setup.", contactInfo: "Contact info (optional)", lockBrand: "Lock Brand & Save (One-Time)", lockingBrand: "Locking...", brandLocked: "Brand locked. Creative generation is enabled.",
  productLibrary: "Product library", selectedProduct: "Selected product", selectProductPrompt: "Choose a product from the library to review its details or generate designs.",
} as const;

type Dictionary = Record<keyof typeof en, string>;
export type TranslationKey = keyof Dictionary;
type Overrides = Partial<Dictionary>;
const dictionary = (overrides: Overrides): Dictionary => ({ ...en, ...overrides });

const ar = dictionary({
  language: "اللغة", languageHint: "اختر لغة الواجهة", home: "الرئيسية", support: "الدعم واتساب", title: "PostCraft",
  subtitle: "ارفع صور منتجاتك، راجع الاسم والسعر والعرض، ثم ولّد تصميمين لكل منتج دون تكرار.", upload: "ارفع صور المنتجات من الجوال أو الكمبيوتر", uploadHint: "اختر عدة صور؛ سيحلل الذكاء الاصطناعي كل صورة ويقترح سطر بيع قصيرًا.",
  products: "قائمة المنتجات", productsHint: "المنتجات مرتبة بالتسلسل؛ المنتجات المولّدة لا تُختار مرة أخرى.", count: "العدد", generateNext: "توليد التالي (2 لكل منتج)", generateSelected: "توليد المحدد (2 لكل منتج)", generating: "جارٍ التوليد...", productName: "اسم المنتج", price: "السعر", pricePlaceholder: "اختياري — اتركه فارغًا لعدم عرض السعر", offer: "العرض", offerPlaceholder: "اختياري — مثال: خصم 20% لفترة محدودة", generated: "تم التوليد", remaining: "متبقٍ للتوليد", generateOne: "توليد تصميمين", generateAgain: "توليد مرة أخرى", empty: "لا توجد منتجات بعد. ارفع الصور للبدء.", uploading: "جارٍ الرفع...", uploadDone: "تمت إضافة المنتجات من الصور.", uploadFailed: "تعذر رفع إحدى الصور.", saving: "جارٍ الحفظ...", saved: "تم الحفظ.", saveFailed: "تعذر حفظ المنتج.", nameRequired: "أدخل اسم المنتج.",
  generationDone: "تم توليد التصاميم وتنزيل الحزمة.", generationPreparing: "جارٍ تجهيز التوليد...", generationBatchStatus: "جارٍ توليد التصاميم", generationSingleStatus: "جارٍ توليد تصميمين للمنتج...", generationComplete: "اكتمل التوليد.", generationBusy: "التوليد مشغول لهذا المفتاح. إعادة المحاولة خلال", generationSeconds: "ثانية", retryGeneration: "إعادة المحاولة الآن", generatedCreativesTitle: "التصميمات المولّدة", generatedCreativesHint: "تظهر هنا التصميمات المحفوظة لكل منتج بعد التوليد، وتبقى بعد تحديث الصفحة.", noGeneratedCreatives: "لا توجد تصميمات مولّدة بعد. ولّد دفعة أو منتجًا واحدًا ليظهر هنا.", galleryLoading: "جارٍ تحميل التصميمات...", refreshCreatives: "تحديث التصميمات", viewAllCreatives: "عرض كل التصاميم", downloadImage: "تنزيل الصورة", downloadAllZip: "تنزيل الكل (ZIP)", variantLabel: "النسخة", creativeProductFallback: "منتج", downloadHint: "يُنتج كل منتج تصميمين، وتُنزّل الحزمة تلقائيًا.", queueHint: "المنتجات المولّدة تنتقل إلى نهاية القائمة ولا تُعاد.", selectProducts: "اختر منتجات", remainingCount: "متبقٍ", generatedCount: "مولّد", salesLine: "سطر البيع", introBadge: "الاستوديو", heroTitle: "إعلانات منتجاتك، ببساطة.", heroSubtitle: "ارفع الصور، راجع التفاصيل، واحصل على تصميمين جاهزين لكل منتج — دون تكرار.", openStudio: "افتح الاستوديو", introCtaNote: "يعمل على الجوال والكمبيوتر.", contact: "تواصل معنا",
  accessKey: "مفتاح الوصول", accessKeyPlaceholder: "أدخل مفتاح الوصول السنوي", applyKey: "حفظ وتطبيق", keyStatus: "المفتاح", brandStatus: "العلامة", keyRequired: "أدخل مفتاح الوصول وطبّقه أولاً.", accessKeyInvalid: "مفتاح الوصول غير صالح أو منتهي. حدّث المفتاح للمتابعة.", accessKeySaved: "تم حفظ مفتاح الوصول وتطبيقه.", manageKey: "إدارة المفتاح", brandSetupTitle: "إعداد العلامة التجارية (مرة واحدة)", brandSetupHint: "أدخل اسم الشركة والصناعة مرة واحدة. بعد الحفظ تُثبَّت الهوية ويُفعّل التوليد فورًا ولا يمكن تغييرها لاحقًا.", brandSetupRequired: "يلزم إعداد العلامة التجارية مرة واحدة قبل التوليد.", brandName: "اسم العلامة / الشركة", industry: "الصناعة / فئة النشاط", logoUrl: "رابط الشعار (اختياري)", logoFile: "ملف الشعار (اختياري)", logoFileHint: "ارفع شعارًا من الجوال أو الكمبيوتر: PNG أو JPEG أو WebP أو SVG.", logoUploading: "جارٍ رفع الشعار...", logoUploaded: "تم رفع الشعار وهو جاهز للحفظ.", logoUploadFailed: "تعذّر رفع الشعار. جرّب ملفًا أصغر.", logoRemove: "إزالة الشعار المرفوع", provisionedDefaults: "تم تعبئة إعدادات العلامة والدعم من إعدادات المفتاح.", contactInfo: "بيانات التواصل (اختياري)", lockBrand: "تثبيت العلامة والحفظ (مرة واحدة)", lockingBrand: "جارٍ التثبيت...", brandLocked: "تم تثبيت العلامة. التوليد متاح الآن.", productLibrary: "مكتبة المنتجات", selectedProduct: "المنتج المحدد", selectProductPrompt: "اختر منتجًا من المكتبة لمراجعة تفاصيله أو توليد التصاميم.",
});
const ms = dictionary({ language: "Bahasa", home: "Laman utama", support: "Sokongan sembang", title: "PostCraft", products: "Senarai produk", count: "Bilangan", generateNext: "Jana seterusnya (2 setiap satu)", generateSelected: "Jana yang dipilih (2 setiap satu)", generating: "Menjana...", productName: "Nama produk", price: "Harga", offer: "Tawaran", generated: "Dijana", remaining: "Belum dijana", generateAgain: "Jana semula", empty: "Tiada produk lagi. Muat naik gambar untuk mula.", upload: "Muat naik gambar produk", uploading: "Memuat naik...", saved: "Disimpan.", saveFailed: "Gagal menyimpan produk.", generatedCreativesTitle: "Reka Bentuk Dijana", downloadImage: "Muat turun imej", downloadAllZip: "Muat turun semua (ZIP)", accessKey: "Kunci akses", applyKey: "Simpan / Guna", manageKey: "Urus kunci", brandName: "Nama jenama / syarikat", industry: "Industri / kategori perniagaan", lockBrand: "Kunci Jenama & Simpan", brandLocked: "Jenama dikunci. Penjanaan kreatif kini aktif.", productLibrary: "Pustaka produk", selectedProduct: "Produk dipilih", selectProductPrompt: "Pilih produk daripada pustaka untuk menyemak butiran atau menjana reka bentuk." });
const fr = dictionary({ language: "Langue", home: "Accueil", support: "Assistance", title: "PostCraft", products: "Liste des produits", count: "Nombre", generateNext: "Générer les suivants (2 chacun)", generateSelected: "Générer la sélection (2 chacun)", generating: "Génération...", productName: "Nom du produit", price: "Prix", offer: "Offre", generated: "Généré", remaining: "Restant", generateAgain: "Générer à nouveau", empty: "Aucun produit. Téléchargez des images pour commencer.", upload: "Télécharger des images de produits", uploading: "Téléchargement...", saved: "Enregistré.", saveFailed: "Impossible d'enregistrer le produit.", generatedCreativesTitle: "Créations générées", downloadImage: "Télécharger l'image", downloadAllZip: "Tout télécharger (ZIP)", accessKey: "Clé d'accès", applyKey: "Enregistrer / Appliquer", manageKey: "Gérer la clé", brandName: "Nom de la marque / entreprise", industry: "Secteur / catégorie d'activité", lockBrand: "Verrouiller la marque et enregistrer", brandLocked: "Marque verrouillée. La génération créative est activée.", productLibrary: "Bibliothèque de produits", selectedProduct: "Produit sélectionné", selectProductPrompt: "Choisissez un produit dans la bibliothèque pour consulter ses détails ou générer des visuels." });
const de = dictionary({ language: "Sprache", home: "Startseite", support: "Chat-Support", title: "PostCraft", products: "Produktliste", count: "Anzahl", generateNext: "Nächste generieren (je 2)", generateSelected: "Auswahl generieren (je 2)", generating: "Wird generiert...", productName: "Produktname", price: "Preis", offer: "Angebot", generated: "Generiert", remaining: "Ausstehend", generateAgain: "Erneut generieren", empty: "Noch keine Produkte. Bilder hochladen.", upload: "Produktbilder hochladen", uploading: "Wird hochgeladen...", saved: "Gespeichert.", saveFailed: "Produkt konnte nicht gespeichert werden.", generatedCreativesTitle: "Generierte Designs", downloadImage: "Bild herunterladen", downloadAllZip: "Alle herunterladen (ZIP)", accessKey: "Zugangsschlüssel", applyKey: "Speichern / Anwenden", manageKey: "Schlüssel verwalten", brandName: "Marken- / Firmenname", industry: "Branche / Geschäftskategorie", lockBrand: "Marke sperren und speichern", brandLocked: "Marke gesperrt. Kreative Generierung ist aktiviert.", productLibrary: "Produktbibliothek", selectedProduct: "Ausgewähltes Produkt", selectProductPrompt: "Wählen Sie ein Produkt aus der Bibliothek, um Details zu prüfen oder Designs zu erstellen." });
const zh = dictionary({ language: "语言", home: "首页", support: "在线客服", title: "PostCraft", products: "产品列表", count: "数量", generateNext: "生成接下来 (每个 2 张)", generateSelected: "生成所选 (每个 2 张)", generating: "正在生成...", productName: "产品名称", price: "价格", offer: "优惠", generated: "已生成", remaining: "待生成", generateAgain: "重新生成", empty: "暂无产品。请上传图片开始。", upload: "上传产品图片", uploading: "正在上传...", saved: "已保存。", saveFailed: "无法保存产品。", generatedCreativesTitle: "已生成的设计", downloadImage: "下载图片", downloadAllZip: "全部下载 (ZIP)", accessKey: "访问密钥", applyKey: "保存 / 应用", manageKey: "管理密钥", brandName: "品牌 / 公司名称", industry: "行业 / 业务类别", lockBrand: "锁定品牌并保存", brandLocked: "品牌已锁定，创意生成已启用。", productLibrary: "产品库", selectedProduct: "所选产品", selectProductPrompt: "从产品库中选择产品以查看详情或生成设计。" });

export const I18N: Record<LanguageCode, Dictionary> = { ar, en, ms, fr, de, zh };
export function languageDirection(code: LanguageCode): TextDirection {
  return LANGUAGES.find((language) => language.code === code)?.dir ?? "ltr";
}
export function translate(code: LanguageCode, key: TranslationKey): string {
  return I18N[code]?.[key] ?? I18N.en[key];
}
