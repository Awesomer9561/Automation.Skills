#!/usr/bin/env node
// Runs a steps file in probe mode and records every page it reaches into <knowledgeDir>/pages/.
//   npm run probe -- steps/supplier_registration.txt [--headed]   (extra args go to playwright test)
//   npm run probe -- steps/login.txt -g "wrong password"          (one variant / examples row of a file)
//
// Any steps file works, including the one QA wrote for the test: steps that name fields and buttons by label/text
// ("I enter "Abdul" in First name", "I click "Get OTP"") are looked up in the live page, and each new page is
// recorded in the page's shared record (one per app + path, created or updated in place), and the order reached is
// logged in knowledge/flows/<file>.json, so `npm run gen` can turn the same steps into ids.
// Explicit `snapshot "name"` steps still work. Runs against whatever URLs and credentials the repo has set (.env).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { generate, loadConfig } = require('..');
const { loadFlows, flowsDir } = require('../catalog');

// Runs the repo's own Playwright CLI through node, so it behaves the same on macOS, Linux and Windows (spawning `npx`
// directly fails on Windows, where it is npx.cmd). Falls back to npx (through the shell on Windows) if it can't be resolved.
function playwrightCommand(root, args) {
    try {
        return { cmd: process.execPath, args: [require.resolve('@playwright/test/cli', { paths: [root] }), ...args], shell: false };
    } catch {
        const win = process.platform === 'win32';
        return { cmd: win ? 'npx.cmd' : 'npx', args: ['playwright', ...args], shell: win };
    }
}

const input = process.argv[2];
if (!input) {
    console.error('Usage: npm run probe -- <file.steps.txt>');
    process.exit(2);
}

const config = loadConfig();

const { base, code, unmatched, errors, scenarios } = generate(input, config, { title: (t) => `Probe: ${t}`, probe: true });
if (unmatched.length || errors.length) {
    [...errors, ...unmatched.map((s) => `unmatched step on line ${s.line}: ${s.text}`)].forEach((e) => console.error(`error: ${e}`));
    process.exit(1);
}

// Pages are shared by all steps files and updated by each probe; only this file's flows (visit order and resolved
// names) are replaced, each by the first snapshot of its test. A file with variants or an examples table has one flow
// per test (<base>--<test>); flows of tests that no longer exist (renamed or removed variants/rows) are deleted.
const flow = base.replace(/[^\w-]+/g, '-');
const testFlows = scenarios.map((sc) => sc.flow);
const flowDir = flowsDir(config);
if (fs.existsSync(flowDir)) {
    for (const f of fs.readdirSync(flowDir)) {
        const name = f.replace(/\.json$/, '');
        if (name.startsWith(`${flow}--`) && !testFlows.includes(name)) fs.rmSync(path.join(flowDir, f));
    }
}

const root = config.root;
const spec = path.join(config.abs(config.testsDir), `_probe_${base}.spec.js`);
const hadResults = fs.existsSync(path.join(root, 'test-results'));
fs.mkdirSync(path.dirname(spec), { recursive: true });
fs.writeFileSync(spec, code);

// A probe explores pages from a clean start, so it must not inherit the repo's own run setup: projects (and their
// `dependencies`, e.g. login setup specs), globalSetup/globalTeardown, a saved storageState and retries. It runs under
// a temporary config that keeps the repo's other settings (testDir, timeouts, `use`) and drops those.
const repoConfig = ['js', 'ts', 'mjs', 'cjs'].map((e) => `playwright.config.${e}`).find((f) => fs.existsSync(path.join(root, f)));
const probeConfig = path.join(root, '_probe.playwright.config.js');
if (repoConfig) {
    fs.writeFileSync(probeConfig, `const { devices } = require('@playwright/test');
const mod = require('./${repoConfig}');
const repo = mod.default || mod;
module.exports = {
    ...repo,
    projects: [{ name: 'probe', use: { ...devices['Desktop Chrome'] } }],
    globalSetup: undefined,
    globalTeardown: undefined,
    testIgnore: [],
    retries: 0,
    // tests of one steps file (variants, examples rows) run one after another so they don't race on the page records
    workers: 1,
    fullyParallel: false,
    use: { ...(repo.use || {}), storageState: { cookies: [], origins: [] } },
};
`);
}
let status = 1;
try {
    const configArgs = repoConfig ? ['--config', path.relative(root, probeConfig)] : [];
    const args = ['test', path.relative(root, spec), ...configArgs, '--reporter=line', ...process.argv.slice(3)];
    const pw = playwrightCommand(root, args);
    status = spawnSync(pw.cmd, pw.args, {
        shell: pw.shell, cwd: root, stdio: 'inherit', env: { ...process.env, PROBE: '1', PROBE_FLOW: base },
    }).status;
} finally {
    fs.rmSync(spec, { force: true });
    fs.rmSync(probeConfig, { force: true });
    // keep screenshot/trace when the probe failed so the failing page can be inspected (test-results/ is git-ignored)
    if (!hadResults && status === 0) fs.rmSync(path.join(root, 'test-results'), { recursive: true, force: true });
}
if (status !== 0) console.error('\nProbe failed; screenshot and trace are in test-results/. Snapshots reached before the failure were still recorded.');
const flows = loadFlows(config);
for (const sc of scenarios) {
    const visits = ((flows[sc.flow] || {}).visits || []).map((v) => `${v.page} ${v.state}`);
    const label = scenarios.length > 1 || sc.flow !== flow ? `${base} / ${sc.title}` : base;
    console.log(`\nProbed ${visits.length} page visit(s) for ${label}:\n  ${visits.join('\n  ')}`);
}
console.log('(see: npm run gen:ids -- <page>)');
process.exit(status === null ? 1 : status);   // null: killed by a signal or failed to start
