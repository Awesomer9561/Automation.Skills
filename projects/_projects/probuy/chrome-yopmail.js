#!/usr/bin/env node
// Starts the dedicated Chrome used for yopmail verification (see YOPMAIL-SETUP.md): remote-debugging port 9222 and a
// profile that keeps the Cloudflare tick. Finds Chrome on macOS, Windows and Linux. Run from anywhere:
//   node <path to Automation.Skills>/projects/_projects/probuy/chrome-yopmail.js [port]
// A repo can wrap it: "chrome:yopmail": "node ../Automation.Skills/projects/_projects/probuy/chrome-yopmail.js"
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const port = process.argv[2] || process.env.YOPMAIL_CDP_PORT || '9222';
const profile = process.env.YOPMAIL_CHROME_PROFILE || path.join(os.homedir(), '.yopmail-chrome');

function candidates() {
    if (process.env.CHROME_PATH) return [process.env.CHROME_PATH];
    switch (process.platform) {
        case 'darwin':
            return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')];
        case 'win32':
            return ['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA']
                .filter((v) => process.env[v])
                .map((v) => path.join(process.env[v], 'Google', 'Chrome', 'Application', 'chrome.exe'));
        default:
            return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].flatMap((n) =>
                (process.env.PATH || '').split(path.delimiter).map((d) => path.join(d, n)));
    }
}

const chrome = candidates().find((p) => fs.existsSync(p));
if (!chrome) {
    console.error('Google Chrome not found. Set CHROME_PATH to its executable and run again.');
    process.exit(1);
}

// Already running on that port? Then there is nothing to start.
const probe = spawnSync(process.execPath, ['-e', `fetch('http://localhost:${port}/json/version').then(()=>process.exit(0),()=>process.exit(1))`]);
if (probe.status === 0) {
    console.log(`Chrome is already answering on port ${port}.`);
    process.exit(0);
}

spawn(chrome, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'https://yopmail.com'], { detached: true, stdio: 'ignore' }).unref();
console.log(`Started Chrome (${chrome}) on port ${port}, profile ${profile}.\nTick the Cloudflare box on yopmail.com once, then set YOPMAIL_CDP_URL=http://localhost:${port} in the repo's .env.`);
