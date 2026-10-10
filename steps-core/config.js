// Loads the repo's steps.config.js (searched upward from the working directory) and fills in defaults.
// Everything repo-specific comes from that file; the core never imports from the repo directly.

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
    testsDir: 'tests',
    knowledgeDir: 'knowledge',
    ledger: 'test-data/created.jsonl',
    apps: {},
    defaultApp: undefined,
    packs: [],
    helpers: {},
    timeouts: { test: 120000, multiApp: 360000 },
    probe: { env: 'dev' },
    envName: () => process.env.TEST_ENV,
};

function findRoot(start) {
    for (let dir = start; ; dir = path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'steps.config.js'))) return dir;
        if (path.dirname(dir) === dir) throw new Error(`steps.config.js not found in ${start} or any parent directory`);
    }
}

let cached;
function loadConfig(cwd = process.cwd()) {
    if (cached) return cached;
    const root = findRoot(cwd);
    const user = require(path.join(root, 'steps.config.js'));
    const config = {
        ...DEFAULTS,
        ...user,
        timeouts: { ...DEFAULTS.timeouts, ...user.timeouts },
        probe: { ...DEFAULTS.probe, ...user.probe },
        root,
        abs: (p) => path.resolve(root, p),
    };
    if (config.defaultApp && !config.apps[config.defaultApp]) {
        throw new Error(`steps.config.js: defaultApp "${config.defaultApp}" is not one of apps (${Object.keys(config.apps).join(', ')})`);
    }
    cached = config;
    return config;
}

module.exports = { loadConfig };
