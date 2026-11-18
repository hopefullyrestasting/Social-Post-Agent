const fs = require('fs');
let c = fs.readFileSync('functions/api/ai/studio-scene.ts', 'utf-8');

// Simple: replace the architectural-brand-frame BOTTOM 15% line to include bottom 12%
// Find 'BOTTOM 15%: COMPLETELY FREE' in the architectural section and add bottom 12%

// We'll search for the pattern and do a targeted replacement
// First, find the index of architectural-brand-frame section
const archIdx = c.indexOf('"architectural-brand-frame"');
if (archIdx >= 0) {
    // Find the BOTTOM 15% line within this section
    const bottomSection = c.indexOf('BOTTOM 15%: COMPLETELY FREE', archIdx);
    if (bottomSection >= 0) {
        // Replace this line to include bottom 12%
        const oldLine = 'BOTTOM 15%: COMPLETELY FREE OF ANY TEXT, LETTERS, NUMBERS, OR WATERMARKS';
        const newLine = 'BOTTOM 15%: COMPLETELY FREE OF ANY TEXT, LETTERS, NUMBERS, OR WATERMARKS. Bottom 12% darker for contact area.';
        c = c.replace(oldLine, newLine);
        console.log('Replaced BOTTOM 15% line');
    }
}
fs.writeFileSync('functions/api/ai/studio-scene.ts', c);
console.log('Done fix_bottom12');