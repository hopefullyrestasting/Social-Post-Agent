path = r'C:\Users\Ahmed Raouf\.antigravity-ide\1st-bot\Social-Post-Agent\functions\api\ai\studio-scene.ts'
with open(path, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Add 'no text' at the end of the architectural-brand-frame scenePrompt
old = 'Rich warm ambient lighting with subtle industry-watermark icons in the distance"'
new = 'Rich warm ambient lighting with subtle industry-watermark icons in the distance. no text"'

if old in content:
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced successfully')
else:
    print('old not found')