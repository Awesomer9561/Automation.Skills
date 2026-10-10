// Public entry point of the steps core: steps file -> IR -> Playwright spec source.

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');
const { parseSteps } = require('./parse');
const { compile } = require('./compile');
const { emit } = require('./emit-playwright');

const baseName = (file) => path.basename(file).replace(/\.steps\.txt$|\.txt$|\.md$/, '');

// opts.title overrides the title from the file (probe uses it).
function generate(file, config = loadConfig(), opts = {}) {
    const base = baseName(file);
    const parsed = parseSteps(fs.readFileSync(file, 'utf8'), base.replace(/[_-]+/g, ' '));
    const title = opts.title ? opts.title(parsed.title) : parsed.title;
    const source = path.relative(config.root, path.resolve(file)).replace(/\\/g, '/');
    const { ir, unmatched, errors, warnings } = compile({ title, steps: parsed.steps, source }, config);
    const code = emit(ir, { testsDir: config.abs(config.testsDir), apps: config.apps });
    return { base, code, ir, unmatched, errors, warnings };
}

module.exports = { generate, baseName, loadConfig };
