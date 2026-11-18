#!/usr/bin/env python3
import os

path = r'C:\Users\Ahmed Raouf\.antigravity-ide\1st-bot\Social-Post-Agent\functions\api\ai\studio-scene.ts'
with open(path, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Read the file and find the architectural-brand-frame scenePrompt
# Add ' no text' before the closing quote at the end
# The pattern we're looking for is the end of the architectural-brand-frame prompt

# Search for 'distance"' and add ' no text' before the quote
import re
# Find all occurrences of distance" and check which one is in architectural-brand-frame
matches = [(m.start(), m.end()) for m in re.finditer(r'distance"', content)]
print(f'Found {len(matches)} occurrences of distance"')

for i, (start, end) in enumerate(matches):
    # Check if this is within the architectural-brand-frame section
    # by looking for 'architectural-brand-frame' before this position
    before = content[:start]
    if 'architectural-brand-frame' in before:
        print(f'Match {i+1} at position {start} is in architectural-brand-frame section')
        # Replace distance" with distance. no text"
        new_content = content[:start] + 'distance. no text"' + content[end:]
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print('Replaced successfully')
        break
else:
    print('No match found in architectural-brand-frame section')