import * as XLSX from "xlsx";

export interface ImportedProductRow {
  name_arabic: string;
  name_english?: string;
  category?: string;
  subcategory?: string;
  packaging_size?: string;
  variant?: string;
  description?: string;
  sku?: string;
  price?: number;
}

const HEADER_ALIASES: Record<string, keyof ImportedProductRow> = {
  name: "name_arabic",
  title: "name_arabic",
  "product name": "name_arabic",
  "product_name": "name_arabic",
  "اسم المنتج": "name_arabic",
  "الاسم": "name_arabic",
  name_english: "name_english",
  "english name": "name_english",
  "اسم انجليزي": "name_english",
  category: "category",
  type: "category",
  "product type": "category",
  "الفئة": "category",
  "القسم": "category",
  "الصنف": "category",
  subcategory: "subcategory",
  "sub category": "subcategory",
  "sub-category": "subcategory",
  "الفئة الفرعية": "subcategory",
  packaging_size: "packaging_size",
  size: "packaging_size",
  "package size": "packaging_size",
  "الحجم": "packaging_size",
  "الحجم/العبوة": "packaging_size",
  variant: "variant",
  "النوع": "variant",
  description: "description",
  specs: "description",
  "الوصف": "description",
  "المواصفات": "description",
  sku: "sku",
  code: "sku",
  "الكود": "sku",
  "رمز": "sku",
  price: "price",
  offer: "price",
  "السعر": "price",
  "العرض": "price",
};

export function parseSpreadsheetFile(file: File): Promise<ImportedProductRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: "",
        });
        const rows: ImportedProductRow[] = [];
        for (const raw of json) {
          const row: ImportedProductRow = { name_arabic: "" };
          for (const [key, value] of Object.entries(raw)) {
            const normalized = key.trim().toLowerCase();
            const field = HEADER_ALIASES[normalized] ?? HEADER_ALIASES[key.trim()];
            if (field && value !== null && value !== undefined && String(value).trim() !== "") {
              if (field === "price") {
                const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
                if (Number.isFinite(n)) (row as ImportedProductRow).price = n;
              } else {
                (row as unknown as Record<string, string>)[field] = String(value).trim();
              }
            }
          }
          // Flexible: if a 'description'/'specs'/'الوصف' column exists, ignore (not in schema) but don't crash.
          if (!row.name_arabic) {
            // Try any column containing 'name'/'اسم'
            for (const [key, value] of Object.entries(raw)) {
              if (/name|اسم/i.test(key) && value) {
                row.name_arabic = String(value).trim();
                break;
              }
            }
          }
          if (row.name_arabic) rows.push(row);
        }
        resolve(rows);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to parse spreadsheet."));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function isSpreadsheetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls");
}
