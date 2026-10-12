const test = require('node:test');
const assert = require('node:assert');
const { createResolver } = require('../resolve');

const page = {
    name: 'admin/orders', app: 'admin', path: '/orders', states: [{ id: 's1' }],
    elements: [
        { id: 'f-select', tag: 'button', role: 'combobox', label: 'Client Order Filter', in: ['s1'], vis: ['s1'] },
        { id: 'plain-select', tag: 'select', label: 'City', in: ['s1'], vis: ['s1'], options: ['Riyadh'] },
    ],
};

test('a custom dropdown is found by its label', () => {
    const resolve = createResolver([page], { flowData: undefined });
    const found = resolve({}, 'admin', 'select', 'Client Order Filter');
    assert.deepEqual(found, { id: 'f-select', combobox: true });
});

test('a native select resolves as before', () => {
    const resolve = createResolver([page], { flowData: undefined });
    assert.deepEqual(resolve({}, 'admin', 'select', 'City'), { id: 'plain-select' });
});

test('a custom dropdown picks its option by text at run time, a native select by label', () => {
    const { buildRegistry } = require('../registry');
    const { emit } = require('../emit-playwright');
    const registry = buildRegistry([]);
    const build = (text, found) => {
        const hit = registry.match(text);
        return hit.phrasing.build(hit.m, { app: 'admin', addWait() {}, error() {}, state: {}, probe: false, resolve: () => found });
    };
    assert.deepEqual(build('I select "Pending" in Client Order Filter', { id: 'f-select', combobox: true }),
        [{ op: 'pickOption', target: { id: 'f-select' }, value: { v: 'Pending' } }]);
    assert.deepEqual(build('I select {status} in Client Order Filter', { id: 'f-select', combobox: true })[0].value, { v: '{status}' });
    assert.equal(build('I select "Riyadh" in City', { id: 'plain-select' })[0].op, 'select');
    const ir = (op) => ({ title: 't', source: 's.txt', multi: false, timeoutMs: null, preamble: [], imports: [],
        steps: [{ src: { line: 1, text: 'x' }, app: 'admin', kind: 'action', ops: [op] }] });
    const code = emit(ir({ op: 'pickOption', target: { id: 'f-select' }, value: { v: '{status}' } }), { testsDir: '/t', apps: {} });
    assert.match(code, /await page\.locator\('#f-select'\)\.click\(\);\n\s+await page\.getByRole\('option', \{ name: status, exact: true \}\)\.click\(\);/);
});
