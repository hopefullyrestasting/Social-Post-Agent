---
name: typography-and-layout-craft
description: Use when designing or refining Al Rahma 1080x1920 poster layout, RTL header lockups, hero packshot staging, and high-impact Arabic sales typography for the in-house ad engine.
---

# Typography and Layout Craft (Al Rahma Posters)

Apply this skill when composing or adjusting 1080×1920 product posters to achieve agency-level, scroll-stopping graphic design craft.

## Layout rules (1080×1920)

1. **Header Lockup (`y = 45..205`) — balanced 3-part RTL hierarchy**
   - **Right:** Brand/logo emblem in a rounded glass badge.
   - **Center:** Brand title `مخزن الرحمة` (**44px ExtraBold/Cairo 800**) with activity subtitle `مستحضرات تجميل ومستلزمات الصيدليات` (**24px**) stacked cleanly.
   - **Left:** `متاح توصيل` styled as an independent highlighted gold/mint pill badge with a delivery truck/check icon.
   - Keep clear spacing, crisp alignment, and RTL reading flow.

2. **Product Name (`y = 235..365`)**
   - Clean, authoritative product title: **44px–48px Cairo Bold (700/800)**, dark slate `#0F172A`.
   - Max **2 lines**, **zero ellipsis/truncation**; dynamically fit/wrap within safe width.

3. **Dominant Hero Stage (`y = 390..1190`)**
   - Large **760px-tall** authentic cutout packshot (dominant hero area), e.g. `x=220, y=410, width=640, height=760`, **bottom seated at `y=1170`**.
   - Crisp 3D architectural podium around **`y=1140..1215`**.
   - Realistic **dual contact shadow** (tight dark + wide soft ambient) and subtle soft rim glow so the product is grounded and pops.

4. **High-Impact Sales Copy (`y = 1245..1540`)**
   - **No cramped white pill/box.** Render bold, high-impact editorial Arabic typography at **~60px (58–64px) Cairo Black/ExtraBold**.
   - Dual-tone emphasis: highlight the primary benefit phrase in rich emerald **`#047857`** while keeping secondary words in deep charcoal **`#1E293B`**.
   - Frame with subtle geometric accent bars/lines; maintain readable line spacing and zero truncation.
   - Sales copy must remain benefit-only, verified/category-value, 4–8 words (per commercial rules).

5. **Contact Footer (`y = 1690..1920`)**
   - Bold emerald footer with `\u200Fللتواصل:` (proper RTL) and crisp `01000017548` flanked by Phone and WhatsApp icons.

## Production/craft notes

- Use neural background removal (e.g. `@imgly/background-removal`) in browser for clean cutouts that preserve white bottles, followed by alpha bounding-box auto-trim; keep safe fallback for non-browser/headless contexts.
- Prefer crisp bundled studio stages (`/studio-scenes/*.svg`) or verified sharp AI base64 scenes; avoid blurry external fallback URLs.
- Never redraw product packaging/labels/logos/Arabic text via AI. Keep verified, benefit-only copy and brand details from config.