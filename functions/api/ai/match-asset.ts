/**
 * Graceful Vision Matcher — Zero Fabrication
 * 
 * Extract ONLY clearly legible brand/product attributes from uploaded images.
 * Explicitly omit unreadable small print instead of guessing or inventing claims.
 * Schema-bound: every field must have a corresponding verified source or be omitted.
 */

import { AL_RAHMA_BRAND_CONFIG } from "@/lib/al-rahma/brand-core";

export interface AssetMatchResult {
  productBrand?: string;
  productName?: string;
  productType?: "perfume" | "skincare" | "haircare" | "cleaner" | "other";
  detectedLabel?: string;
  detectedBrand?: string;
  confidence: "high" | "medium" | "low";
  claims: Array<{
    text: string;
    type: "benefit" | "usage" | "unknown";
    verifiable: boolean; // only true if source URL is present and verified
  }>;
  warnings: string[]; // e.g. "small print omitted", "low confidence"
  sourceUrl?: string;
}

/**
 * Analyze an asset image and extract legible attributes.
 * Returns only clearly readable fields; omits small print/low-confidence data.
 */
export async function matchAsset(
  imageUrl: string,
  brandConfig?: typeof AL_RAHMA_BRAND_CONFIG
): Promise<AssetMatchResult> {
  const warnings: string[] = [];

  // Try to fetch and analyze the image
  let fetchOk = false;
  let response: Response | null = null;

  try {
    response = await fetch(imageUrl, {
      method: "GET",
      headers: {
        Accept: "image/png,image/jpeg,image/webp,image/avif",
        "User-Agent": "AlRahma-AssetMatcher/1.0",
      },
      
    });
    fetchOk = response.ok;
  } catch (error) {
    // Network error - return minimal result
  }

  const result: AssetMatchResult = {
    confidence: "low",
    claims: [],
    warnings,
  };

  if (!fetchOk || !response) {
    // Even on error, we can attempt basic heuristics from the URL or return low-confidence result
    result.warnings.push("image could not be fetched; returning low-confidence result");
    return result;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const mime = contentType.split(";")[0].trim().toLowerCase();

  // Decode base64 or proceed with image analysis
  let base64Data: string | null = null;
  if (mime.startsWith("image/")) {
    const buffer = await response.arrayBuffer();
    if (buffer && buffer.byteLength > 0) {
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < buffer.byteLength; i += chunk) {
        const bytes = new Uint8Array(buffer, i, Math.min(chunk, buffer.byteLength - i));
        for (let j = 0; j < bytes.length; j++) {
          binary += String.fromCharCode(bytes[j]);
        }
      }
      base64Data = btoa(binary);
    }
  } else if (mime.startsWith("application/json")) {
    // If somehow a JSON body was sent, treat as metadata
    const text = await response.text();
    // Not our primary use case - return low confidence
    result.warnings.push("non-image asset; returning low-confidence result");
    return result;
  }

  // For now, return a structured result based on what we can deterministically extract
  // without hallucinating. The actual OCR/vision analysis would be done by an external
  // provider (Gemini Workers AI, etc.) with strict schema enforcement.

  // Default: low confidence, no invented claims
  result.warnings.push("asset analysis pending verified vision provider; no claims invented");

  return result;
}

/**
 * Validate that a brand profile's logo tone matches the scene background luminance.
 * Dark backgrounds pair with light/gold logos; light backgrounds pair with dark logos.
 */
export function validateLogoContrast(
  logoTone: "light" | "dark" | "gold-emerald",
  backgroundLuminance: "light" | "dark"
): "match" | "contrast" {
  // Logic: light logo on dark bg, dark logo on light bg, gold-emerald is versatile
  const lightOnDark = logoTone !== "dark"; // light or gold on dark is good
  const darkOnLight = logoTone !== "light"; // dark or gold on light is good
  const goldVersatile = logoTone === "gold-emerald";

  if (goldVersatile) return "match";
  if (logoTone === "light" && backgroundLuminance === "dark") return "match";
  if (logoTone === "dark" && backgroundLuminance === "light") return "match";
  return "contrast";
}

