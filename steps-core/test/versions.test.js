// The version is written in three places (package.json and the two plugin manifests); scripts/bump-version.js
// keeps them in step. This fails if someone edits one by hand.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (...p) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8'));

test('package.json and the plugin manifests carry the same version', () => {
    const pkg = read('steps-core', 'package.json').version;
    assert.match(pkg, /^\d+\.\d+\.\d+$/);
    assert.strictEqual(read('.claude-plugin', 'plugin.json').version, pkg);
    const [plugin] = read('.claude-plugin', 'marketplace.json').plugins;
    assert.strictEqual(plugin.version, pkg);
});
