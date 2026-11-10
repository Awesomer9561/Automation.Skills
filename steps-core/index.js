// Public entry point of the steps core: steps file -> IR -> Playwright spec source.

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');
const { parseSteps } = require('./parse');
const { expandScenarios } = require('./scenarios');
const { compile } = require('./compile');
const { emit, emitGroup } = require('./emit-playwright');

const baseName = (file) => path.basename(file).replace(/\.steps\.txt$|\.txt$|\.md$/, '');

// Messages from several tests of one file: a message every test has (a shared step) is listed once; one only some
// tests have is prefixed with their titles.
function mergeMessages(perTest, titles) {
    const byMsg = new Map();
    perTest.forEach((msgs, i) => msgs.forEach((m) => {
        if (!byMsg.has(m)) byMsg.set(m, []);
        if (!byMsg.get(m).includes(titles[i])) byMsg.get(m).push(titles[i]);
    }));
    return [...byMsg].map(([m, who]) => (who.length === titles.length ? m : `[${who.join(' / ')}] ${m}`));
}

// opts.title overrides the title from the file; opts.probe compiles for `npm run probe` (both used by the probe CLI).
// A file with variants or an examples table gives one test per variant/row (see scenarios.js), inside one describe.
function generate(file, config = loadConfig(), opts = {}) {
    const base = baseName(file);
    const parsed = parseSteps(fs.readFileSync(file, 'utf8'), base.replace(/[_-]+/g, ' '));
    const title = opts.title ? opts.title(parsed.title) : parsed.title;
    const source = path.relative(config.root, path.resolve(file)).replace(/\\/g, '/');
    const { scenarios, grouped, errors: shapeErrors } = expandScenarios(parsed, base);
    const emitOpts = { testsDir: config.abs(config.testsDir), apps: config.apps };

    const results = scenarios.map((sc) => compile(
        { title: grouped ? sc.title : title, steps: sc.steps, source, flow: sc.flow }, config, { probe: opts.probe }));
    const titles = scenarios.map((sc) => sc.title);
    const errors = [...parsed.errors, ...shapeErrors, ...mergeMessages(results.map((r) => r.errors), titles)];
    const warnings = mergeMessages(results.map((r) => r.warnings), titles);
    const seen = new Set();
    const unmatched = results.flatMap((r) => r.unmatched).filter((s) => !seen.has(`${s.line}:${s.text}`) && seen.add(`${s.line}:${s.text}`));

    const irs = results.map((r) => r.ir);
    const code = !grouped ? emit(irs[0], emitOpts) : emitGroup({ title, source, tests: irs }, emitOpts);
    return { base, code, ir: grouped ? undefined : irs[0], irs, scenarios, grouped, unmatched, errors, warnings };
}

module.exports = { generate, baseName, loadConfig };
