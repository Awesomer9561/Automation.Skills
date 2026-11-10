const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseSteps } = require('../parse');
const { expandScenarios } = require('../scenarios');
const { generate } = require('..');

const expand = (text, base = 'login') => {
    const parsed = parseSteps(text, 'fallback');
    const out = expandScenarios(parsed, base);
    return { ...out, errors: [...parsed.errors, ...out.errors], parsed };
};
const texts = (sc) => sc.steps.map((s) => s.text);

// A throwaway repo: steps.config.js values plus optional recorded pages/flows; returns generate(file) for a steps text.
function repo({ pages = [], flows = {} } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'steps-variants-'));
    for (const p of pages) {
        fs.mkdirSync(path.join(root, 'knowledge/pages', p.app), { recursive: true });
        fs.writeFileSync(path.join(root, 'knowledge/pages', p.app, `${p.name.split('/')[1]}.json`), JSON.stringify(p));
    }
    fs.mkdirSync(path.join(root, 'knowledge/flows'), { recursive: true });
    for (const [name, f] of Object.entries(flows)) fs.writeFileSync(path.join(root, 'knowledge/flows', `${name}.json`), JSON.stringify(f));
    const config = {
        root, abs: (p) => path.resolve(root, p), testsDir: 'tests', knowledgeDir: 'knowledge', apps: { web: { urlEnv: 'WEB_URL' } },
        defaultApp: 'web', packs: [], helpers: {}, regions: { toast: '[id^="toast-"]' }, timeouts: { test: 120000, multiApp: 360000 },
    };
    return (name, text, opts) => {
        const file = path.join(root, 'steps', name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
        return generate(file, config, opts);
    };
}

test('a file without variants or a table is one test, as before', () => {
    const { grouped, scenarios, errors } = expand('# test: Login\nopen the portal\nI should see "Hi"\n');
    assert.equal(grouped, false);
    assert.deepEqual(errors, []);
    assert.deepEqual(scenarios.map((s) => [s.title, s.flow]), [['Login', 'login']]);
    assert.deepEqual(texts(scenarios[0]), ['open the portal', 'I should see "Hi"']);
});

test('variants: shared steps first, then each variant\'s own', () => {
    const { grouped, scenarios, errors } = expand(`# test: Login
open the portal
# variant: wrong password
I should see "Invalid"
# a comment inside a variant
# variant: valid account
I should see "Dashboard"
`);
    assert.equal(grouped, true);
    assert.deepEqual(errors, []);
    assert.deepEqual(scenarios.map((s) => s.title), ['wrong password', 'valid account']);
    assert.deepEqual(texts(scenarios[0]), ['open the portal', 'I should see "Invalid"']);
    assert.deepEqual(texts(scenarios[1]), ['open the portal', 'I should see "Dashboard"']);
    assert.deepEqual(scenarios.map((s) => s.flow), ['login--wrong-password', 'login--valid-account']);
});

test('examples rows: block steps, then input cells left to right, then assertions; row line kept', () => {
    const { scenarios, errors } = expand(`# test: Status filter
open the portal

# examples:
| input             | input                    | assertion              |
| I click "Pending" | I wait till page loads   | I should see "Pending" |
| I click "All"     |                          | I should see "a \\| b"  |
`, 'filters');
    assert.deepEqual(errors, []);
    assert.deepEqual(scenarios.map((s) => s.title), ['I click "Pending"', 'I click "All"']);
    assert.deepEqual(texts(scenarios[0]), ['open the portal', 'I click "Pending"', 'I wait till page loads', 'I should see "Pending"']);
    assert.deepEqual(texts(scenarios[1]), ['open the portal', 'I click "All"', 'I should see "a | b"']);
    assert.deepEqual(scenarios[0].steps.slice(1).map((s) => s.line), [6, 6, 6]);
    assert.equal(scenarios[0].flow, 'filters--i-click-pending');
});

test('a name column titles the row; a table inside a variant belongs to that variant only', () => {
    const { scenarios, errors } = expand(`open the portal
# variant: valid
I should see "Dashboard"
# variant: filters
I click "Orders"
# examples:
| name    | input             | assert                 |
| pending | I click "Pending" | I should see "Pending" |
`);
    assert.deepEqual(errors, []);
    assert.deepEqual(scenarios.map((s) => s.title), ['valid', 'filters — pending']);
    assert.deepEqual(texts(scenarios[1]), ['open the portal', 'I click "Orders"', 'I click "Pending"', 'I should see "Pending"']);
});

test('shape errors name the line', () => {
    const errs = (text) => expand(text).errors.join('\n');
    assert.match(errs('| I click "x" |'), /line 1: a table row outside an examples table/);
    assert.match(errs('# examples:\n| input | expected |\n| a | b |'), /line 2: unknown column "expected"/);
    assert.match(errs('# examples:\n| input | assertion |\n| a |'), /line 3: 1 cell\(s\), but the header at line 2 has 2/);
    assert.match(errs('# examples:\n| input | assertion |\n|  |  |'), /line 3: an examples row with no steps/);
    assert.match(errs('# examples:\n| input |\n| a |\nopen the portal'), /line 4: a step after an examples table/);
    assert.match(errs('open the portal\n# variant: empty\n# variant: x\nI click "A"'), /line 2: variant "empty" has no steps/);
    assert.match(errs('# variant: same\nI click "A"\n# variant: same\nI click "B"'), /line 3: two tests are titled "same" \(also line 1\)/);
    assert.match(errs('# examples:\n| input |\n| a |\n# variant: v\nI click "A"'), /line 3: an examples table above the first "# variant:"/);
});

test('a file without variants generates the same spec as before (no describe)', () => {
    const gen = repo();
    const { code, grouped, errors } = gen('plain.txt', '# test: Plain\nopen the portal\nI should see "Hi"\n');
    assert.deepEqual(errors, []);
    assert.equal(grouped, false);
    assert.ok(!code.includes('test.describe'));
    assert.match(code, /^\/\/ Plain\n\/\/ Generated from steps\/plain\.txt by `npm run gen`/m);
    assert.match(code, /\ntest\('Plain', async \(\{ page \}\) => \{\n    await test\.step\('open the portal'/);
});

test('variants generate one test per variant inside a describe, header shared', () => {
    const gen = repo();
    const { code, errors, unmatched } = gen('login.txt', `# test: Login
open the portal
# variant: wrong password
I see "Invalid" in the error toast
# variant: valid account
I should see "Dashboard"
`);
    assert.deepEqual(errors, []);
    assert.deepEqual(unmatched, []);
    assert.equal(code.match(/const WEB_URL = /g).length, 1);
    assert.match(code, /\/\/ Generated from steps\/login\.txt by `npm run gen`.*\ntest\.describe\('Login', \(\) => \{\n    test\.describe\.configure\(\{ mode: 'default' \}\);\n\n    test\('wrong password', async \(\{ page \}\) => \{\n        await test\.step\('open the portal'/);
    assert.match(code, /\n    \}\);\n\n    test\('valid account', async \(\{ page \}\) => \{/);
    assert.match(code, /\n\}\);\n$/);
});

test('an unmatched step in a row is reported once at the row line; shared errors are not repeated per test', () => {
    const gen = repo();
    const { unmatched, errors } = gen('f.txt', `open the portal
I enter {nope} in Name
# examples:
| input             | assertion     |
| I click "A"       | frobnicate it |
| I click "B"       | I see "B"     |
`);
    assert.deepEqual(unmatched.map((s) => [s.line, s.text]), [[5, 'frobnicate it']]);
    // line 2 is a shared step: its error is listed once, without a test prefix; row errors carry their test's title
    assert.deepEqual(errors.filter((e) => e.includes('line 2:')).map((e) => e.slice(0, 7)), ['line 2:']);
    assert.ok(errors.some((e) => e.startsWith('[I click "B"] line 6:')));
});

test('each test resolves names from its own flow, falling back to the file\'s flow', () => {
    const el = (id, text) => ({ id, tag: 'button', text, in: ['s1'], vis: ['s1'] });
    const pages = [{ name: 'web/a', app: 'web', path: '/a', states: [{ id: 's1' }], elements: [el('a-save', 'Save'), el('b-save', 'Save')] }];
    const note = (id) => ({ visits: [{ page: 'web/a', state: 's1' }], names: [{ page: 'web/a', state: 's1', kind: 'clickable', name: 'Save', id }] });
    const gen = repo({ pages, flows: { save: note('a-save'), 'save--second': note('b-save') } });
    const { code, errors } = gen('save.txt', '# variant: first\nI click "Save"\n# variant: second\nI click "Save"\n');
    assert.deepEqual(errors, []);
    const [first, second] = code.split("test('second'");
    assert.match(first, /#a-save/);     // no save--first flow: the file's own flow
    assert.match(second, /#b-save/);    // its own flow
});

test('a probe starts each test\'s flow', () => {
    const gen = repo();
    const { code } = gen('p.txt', '# variant: one\nopen the portal\n# variant: two\nopen the portal\n', { probe: true, title: (t) => `Probe: ${t}` });
    assert.match(code, /test\.describe\('Probe: p', /);
    assert.match(code, /test\('one', async \(\{ page \}\) => \{\n(?:.*\n)*?\s+await startFlow\('p--one'\);/);
    assert.match(code, /await startFlow\('p--two'\);/);
    assert.match(code, /const \{ startFlow, autoSnapshot \} = require\('steps-to-specs\/runtime\/snapshot'\);|const \{ startFlow.*\} = require\('steps-to-specs\/runtime\/snapshot'\);/);
});
