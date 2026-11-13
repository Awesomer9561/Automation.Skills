// Bumps the version everywhere it is written, so a release is one command and the files can't drift:
// steps-core/package.json, .claude-plugin/plugin.json, .claude-plugin/marketplace.json.
//
//   node scripts/bump-version.js patch|minor|major|<x.y.z>     prints the new version
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const pkgPath = path.join(root, 'steps-core', 'package.json');
const arg = process.argv[2];

const current = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
const [major, minor, patch] = current.split('.').map(Number);
const next = { patch: `${major}.${minor}.${patch + 1}`, minor: `${major}.${minor + 1}.0`, major: `${major + 1}.0.0` }[arg]
    || (/^\d+\.\d+\.\d+$/.test(arg || '') ? arg : null);
if (!next) {
    console.error('usage: bump-version.js patch|minor|major|<x.y.z>');
    process.exit(2);
}

// Edit the text, not parse + stringify, so formatting in these files stays as written.
function setVersion(file, replace) {
    const text = fs.readFileSync(file, 'utf8');
    const out = replace(text);
    if (out === text) throw new Error(`no version found to update in ${file}`);
    fs.writeFileSync(file, out);
}
const versionLine = (t) => t.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`);
setVersion(pkgPath, versionLine);
setVersion(path.join(root, '.claude-plugin', 'plugin.json'), versionLine);
setVersion(path.join(root, '.claude-plugin', 'marketplace.json'), versionLine);
console.log(next);
