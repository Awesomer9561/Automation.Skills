const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../config');

// Appends one JSON line per entity a test created (account, order, ...) to the ledger file from steps.config.js,
// so leftovers in the target environment can be found later. Called right after the creating step, so a test that
// fails afterwards still records what it left behind. Local only (gitignored). Keys are identifiers, never secrets.
function recordCreated(type, key) {
    const config = loadConfig();
    // the repo's own @playwright/test: this package may live outside the repo (file: dependency), and test.info()
    // only works on the instance running the test
    const { test } = require(require.resolve('@playwright/test', { paths: [config.root] }));
    const info = test.info();
    const entry = {
        at: new Date().toISOString(),
        env: config.envName(),
        spec: path.relative(config.root, info.file).replace(/\\/g, '/'),
        test: info.title,
        type,
        key,
    };
    const file = config.abs(config.ledger);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

module.exports = { recordCreated };
