path = r'C:\Users\Ahmed Raouf\.antigravity-ide\1st-bot\Social-Post-Agent\functions\api\ai\studio-scene.ts'
with open(path, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find the architectural-brand-frame scene prompt and add "No product or bottle should appear"
target = 'lower 15% ground zone is left clean and dark for contact information. The prompt avoids'
if target in content:
    new_target = 'lower 15% ground zone is left clean and dark for contact information. No product or bottle should appear in the scene. The prompt avoids'
    content = content.replace(target, new_target)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced successfully')
else:
    print('Target not found')
    # Try another phrase
    target2 = 'bottom 15% ground zone is left clean and dark for contact information'
    if target2 in content:
        new_target2 = 'bottom 15% ground zone is left clean and dark for contact information. No product or bottle should appear in the scene'
        content = content.replace(target2, new_target2)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Replaced with target2')
    else:
        print('target2 not found either')