import os

path = r'C:\Users\Ahmed Raouf\.antigravity-ide\1st-bot\Social-Post-Agent\scripts\test-phase16.ts'
with open(path, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# 1. Add architectural-brand-frame to the array
old = '      "noir-basalt-golden-rim",\n    ],'
new = '      "noir-basalt-golden-rim",\n      "architectural-brand-frame",\n    ],'
content = content.replace(old, new)

# 2. Change 'three' to 'four' in the message
content = content.replace('Exactly the three rotating luxury art directions must be configured.', 'Exactly the four rotating luxury art directions must be configured.')

# 3. Change the uniqueness check from 3 to 4
content = content.replace('assert.equal(new Set(ART_DIRECTION_STYLE_IDS).size, 3, "Style ids must be unique.")', 'assert.equal(new Set(ART_DIRECTION_STYLE_IDS).size, 4, "Style ids must be unique.")')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done fixed test-phase16.ts')