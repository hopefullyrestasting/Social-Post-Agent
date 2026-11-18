import os

path = r'C:\Users\Ahmed Raouf\.antigravity-ide\1st-bot\Social-Post-Agent\functions\api\ai\studio-scene.ts'
with open(path, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Add "no product" constraint to architectural-brand-frame style
old_prompt = '''      "architectural-brand-frame": `A dark basalt stone slab with warm golden-amber rim lighting and subtle atmospheric mist and haze. Cinematic directional shadows and colored glass light caustics. The upper 35% zone is completely clean and open for headline typography, and the bottom 15% ground zone is left clean and dark for contact information. The prompt avoids the words Arabic/letters/numbers/typography to prevent FLUX from rendering garbled sky artifacts. Upper zone: pure minimalist commercial product photography backdrop. Lower zone: clean uninterrupted ground. No text, no watermarks, no floating words appear in the generated image.`'''

new_prompt = '''      "architectural-brand-frame": `A dark basalt stone slab with warm golden-amber rim lighting and subtle atmospheric mist and haze. Cinematic directional shadows and colored glass light caustics. The upper 35% zone is completely clean and open for headline typography, and the bottom 15% ground zone is left clean and dark for contact information. No product or bottle should appear in the scene. The prompt avoids the words Arabic/letters/numbers/typography to prevent FLUX from rendering garbled sky artifacts. Upper zone: pure minimalist commercial product photography backdrop. Lower zone: clean uninterrupted ground. No text, no watermarks, no floating words appear in the generated image.`'''

if old_prompt in content:
    content = content.replace(old_prompt, new_prompt)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Prompt updated successfully')
else:
    print('Pattern not found')
    # Show what's around architectural-brand-frame
    idx = content.find('architectural-brand-frame')
    if idx >= 0:
        print('Found at index', idx)
        print(content[idx:idx+300])