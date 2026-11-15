import { AL_RAHMA_BRAND_CONFIG } from "@/lib/al-rahma/brand-core";

export function AlRahmaStudio() {
  return (
    <section
      dir="rtl"
      className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-slate-900"
    >
      <h2 className="text-xl font-extrabold">إنتاج الحملات متوقف مؤقتًا</h2>
      <p className="mt-3 leading-7">
        لن يتم إنشاء إعلان قبل توثيق المنتج ومراجعة مصدره وصوره ومعلوماته.
        يجب التأكد من وجود صور مرجعية ومعلومات موثّقة للمنتج في قاعدة البيانات،
        وإعداد مزود الصور والتخزين الآمن قبل بدء الإنتاج.
      </p>
      <p className="mt-3 text-sm text-slate-700">
        لن تُفعّل أي جدولة تلقائية، ولن تُستخدم بيانات أو صور تجريبية. عند
        استكمال التحقق والإعداد، يجب أن تعتمد الحملة على بيانات المنتج الموثّقة
        فقط.
      </p>
      <p className="mt-4 font-bold">{AL_RAHMA_BRAND_CONFIG.brandName}</p>
    </section>
  );
}
