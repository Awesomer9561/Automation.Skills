#!/usr/bin/env node
// Installs the steps-to-spec Claude skill from this package, so nobody has to clone the repo.
//
//   npx steps-to-specs                 install to ~/.claude/skills/steps-to-spec (every project)
//   npx steps-to-specs install --project   install to ./.claude/skills/steps-to-spec (this repo only, commit it)
//   npx steps-to-specs uninstall [--project]
//
// A copy, not a symlink: works the same on macOS, Linux and Windows without admin rights. Re-run after upgrading
// the package to refresh the skill.

const fs = require('fs');
const os = require('os');
const path = require('path');

const NAME = 'steps-to-spec';
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('-')));
const command = args.find((a) => !a.startsWith('-')) || 'install';
const pkgRoot = path.join(__dirname, '..');

// Packed: ./skill. Running from the repo checkout: ../skills/steps-to-spec.
const sources = [path.join(pkgRoot, 'skill'), path.join(pkgRoot, '..', 'skills', NAME)];
const source = sources.find((p) => fs.existsSync(path.join(p, 'SKILL.md')));

const base = flags.has('--project') ? path.join(process.cwd(), '.claude', 'skills') : path.join(os.homedir(), '.claude', 'skills');
const target = path.join(base, NAME);

if (flags.has('--help') || flags.has('-h') || !['install', 'uninstall'].includes(command)) {
    console.log('usage: steps-to-specs [install|uninstall] [--project]');
    process.exit(flags.has('--help') || flags.has('-h') ? 0 : 1);
}

if (command === 'uninstall') {
    fs.rmSync(target, { recursive: true, force: true });   // removes a copy, or just the link if it is a symlink/junction
    console.log(`removed ${target}`);
    process.exit(0);
}

if (!source) {
    console.error('steps-to-specs: the skill files are missing from this install.');
    process.exit(1);
}

// Replace what is there: an older copy, or a symlink/junction from the old clone-based setup (removing a link leaves
// the clone it pointed at untouched).
fs.mkdirSync(base, { recursive: true });
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
const { version } = require('../package.json');
console.log(`installed ${NAME} (steps-to-specs ${version}) -> ${target}`);
console.log('Next: in each automation repo, `npm i -D steps-to-specs`, add the scripts and steps.config.js (see the package README).');
