import type { BrandConfig, TenantBrandContext } from "./brand-core";

const RAW_FILENAME = /^(?:whatsapp(?:\s+image)?|img|dsc|image|photo|screenshot)[_\s-]*[\d_-]+|^[a-f0-9]{16,}(?:\.[a-z0-9]+)?$/i;

export function isRawFilename(value: string | null | undefined): boolean {
  const text = (value ?? "").trim();
  return RAW_FILENAME.test(text) || /\.(?:jpe?g|png|webp|heic)$/i.test(text) && /(?:^|\s)(?:img|dsc|whatsapp|image|photo)/i.test(text);
}

/** Removes storage/camera filenames before they can enter human-facing creative copy. */
export function cleanMarketingText(value: string | null | undefined, fallback: string): string {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  if (!text || isRawFilename(text)) return fallback;
  return text.slice(0, 120);
}

/** Tenant renders must always carry the locked brand identity—not the legacy default. */
export function assertTenantBrandExclusive(
  tenant: TenantBrandContext | BrandConfig | null | undefined,
  resolved: BrandConfig,
): void {
  if (!tenant || ("visual" in tenant && "brandName" in tenant)) return;
  const locked = (tenant as TenantBrandContext).brand?.brandName?.trim();
  if (!locked || resolved.brandName !== locked) {
    throw new Error("Tenant brand context must resolve to its own locked identity.");
  }
}

export interface RuleZones { logo: Rect; headline: Rect; product: Rect; offer?: Rect; price?: Rect; footer: Rect; }
export interface Rect { x:number; y:number; width:number; height:number; }
const intersects=(a:Rect,b:Rect)=>a.x < b.x+b.width && a.x+a.width>b.x && a.y < b.y+b.height && a.y+a.height>b.y;
export function assertSafeZones(zones: RuleZones, canvas={width:1080,height:1920}): void {
  const entries=Object.values(zones).filter(Boolean) as Rect[];
  for(const zone of entries) if(zone.x<0||zone.y<0||zone.x+zone.width>canvas.width||zone.y+zone.height>canvas.height) throw new Error("Creative zone clips off canvas.");
  for(let i=0;i<entries.length;i+=1) for(let j=i+1;j<entries.length;j+=1) if(intersects(entries[i]!,entries[j]!)) throw new Error("Creative zones overlap.");
}
