// Copies skills/steps-to-spec (the single source of truth, at the repo root) into ./skill so `npm pack` ships it.
// ./skill is build output (gitignored). Runs from `prepack`; a no-op outside the repo checkout.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'skills', 'steps-to-spec');
const dest = path.join(__dirname, '..', 'skill');
if (!fs.existsSync(src)) process.exit(0);
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`skill: copied ${path.relative(process.cwd(), src) || src} -> ${path.relative(process.cwd(), dest) || dest}`);
