---
name: commercial-art-director
description: Use when designing or debugging Al Rahma 1080x1920 WhatsApp Status product posters, studio-scene compositing, Arabic RTL ad typography, packshot grounding, and sales-copy placement for the in-house ad engine.
---

# Commercial Art Director (Al Rahma Posters)

Apply this skill when composing, reviewing, or fixing 1080×1920 commercial product posters (SVG/PNG pipeline, FLUX studio backgrounds, cutout packshots, Arabic RTL copy).

## Non-negotiable visual rules

1. **Photorealistic stage first**
   - Use real AI studio photography (FLUX/Workers AI or approved fallback image) as the scene whenever available.
   - Fallback must still look like a real studio render (multi-stop radial lighting, 3D-perspective podium with top highlight/front bevel, depth-of-field bokeh, layered botanical shadows) — never flat primitive shapes.
   - Never let AI redraw or alter the product bottle, label, logo, or Arabic text. AI is for the empty stage/background only.

2. **Hero packshot scale & grounding**
   - Packshot is the hero: render height **620px–680px** (prominent scale), centered on the product stage.
   - Bottom edge must sit **flush on the podium surface** (target bottom `y ≈ 1360`, podium top/surface around `y ≈ 1280–1400`).
   - Add a realistic multi-stage contact shadow directly underneath and a soft studio rim glow behind the packshot so it is grounded (no floating bottle).

3. **Zero truncation (ellipsis forbidden)**
   - Never append `...` to headlines or sales copy.
   - Dynamically scale font size (headline **42px–54px**) and wrap cleanly across **max 2 lines** within safe width (~880px centered at x=540) so every word renders completely.

4. **Sales copy discipline**
   - Sales copy shown on the creative must be pulled **only** from verified `benefit` claims or category/value propositions — **never** from `usage` instructions.
   - Format as a punchy **4–8 word** Egyptian commercial phrase.
   - Place in a sleek frosted-glass card/pill below the podium (target `y ≈ 1430–1560`) with subtle shadow.

5. **Arabic RTL punctuation**
   - Render the contact label as `للتواصل:` with proper RTL handling (prepend Unicode RLM `\u200F` / ensure bidi-correct output) so the colon sits correctly to the left of the Arabic word.
   - Keep Arabic text direction `rtl` semantics and avoid clipping at canvas edges.

## Reference layout geometry (1080×1920)

- **Top header (`y = 60..210`)**: sleek dark-emerald glass header bar with brand logo + `مستحضرات تجميل ومستلزمات الصيدليات - متاح توصيل`.
- **Hero headline (`y = 260..410`)**: bold dark-slate/emerald Cairo 800 headline (48–54px), full product name, no truncation, max 2 lines.
- **Center stage (`y = 480..1380`)**: photorealistic studio podium `y ≈ 1280..1400`; large cutout packshot `height ≈ 660px` standing directly on podium top (`bottom ≈ 1350`) with rim glow and grounded shadow; add 2 floating frosted-glass benefit badges flanking the bottle (e.g. `تركيبة طبيعية` / `جودة مضمونة`) when space allows.
- **Sales copy glass card (`y = 1440..1560`)**: frosted white card with subtle shadow displaying the 4–8 word benefit headline.
- **Bottom contact bar (`y = 1710..1920`)**: bold emerald footer with `للتواصل:` (proper RTL) and large crisp phone number flanked by Phone and WhatsApp vector icons.

## Verification checklist

- No `...` appears anywhere in rendered headline or sales copy.
- Sales copy contains no usage instructions and is 4–8 words.
- Contact label renders as `للتواصل:` with correct RTL colon placement.
- Packshot height within 620–680px and visually grounded on podium (correct y/bottom coordinates).
- Background is embedded/photorealistic (or high-craft shader fallback), never flat primitive-only art when a scene is required.
- `npm test`, `npm run typecheck`, `npm run lint` (0 errors), `npm run build` all pass.
