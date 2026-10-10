#!/usr/bin/env node
// Runs a steps file in probe mode so its `snapshot "name"` steps record pages into <knowledgeDir>/pages/.
//   npm run probe -- steps/probe_supplier_profile.steps.txt
//
// The file uses the normal vocabulary (login, open ..., click, wait till ...) to reach each page, with a
// `snapshot "page-name"` step wherever the catalog should record what is on screen. It runs against whatever URLs
// and credentials the repo has set (e.g. its .env).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { generate, loadConfig } = require('..');
const { parseSteps } = require('../parse');

const input = process.argv[2];
if (!input) {
    console.error('Usage: npm run probe -- <file.steps.txt>');
    process.exit(2);
}

const config = loadConfig();

const names = parseSteps(fs.readFileSync(input, 'utf8'), '').steps
    .map((s) => s.text.match(/^snapshot "([\w-]+)"$/i)).filter(Boolean).map((m) => m[1]);
if (!names.length) {
    console.error('No `snapshot "name"` step in the file; nothing would be recorded.');
    process.exit(1);
}

const { base, code, unmatched, errors } = generate(input, config, { title: (t) => `Probe: ${t}` });
if (unmatched.length || errors.length) {
    [...errors, ...unmatched.map((s) => `unmatched step on line ${s.line}: ${s.text}`)].forEach((e) => console.error(`error: ${e}`));
    process.exit(1);
}

const root = config.root;
const spec = path.join(config.abs(config.testsDir), `_probe_${base}.spec.js`);
const hadResults = fs.existsSync(path.join(root, 'test-results'));
fs.mkdirSync(path.dirname(spec), { recursive: true });
fs.writeFileSync(spec, code);
let status = 1;
try {
    status = spawnSync('npx', ['playwright', 'test', path.relative(root, spec), '--reporter=line'], {
        cwd: root, stdio: 'inherit', env: { ...process.env, PROBE: '1' },
    }).status;
} finally {
    fs.rmSync(spec, { force: true });
    // keep screenshot/trace when the probe failed so the failing page can be inspected (test-results/ is git-ignored)
    if (!hadResults && status === 0) fs.rmSync(path.join(root, 'test-results'), { recursive: true, force: true });
}
if (status !== 0) console.error('\nProbe failed; screenshot and trace are in test-results/. Snapshots reached before the failure were still recorded.');
if (status === 0) console.log(`\nRecorded: ${names.join(', ')}  (see: npm run gen:ids -- <name>)`);
process.exit(status === null ? 1 : status);   // null: killed by a signal or failed to start
