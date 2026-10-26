const test = require('node:test');
const assert = require('node:assert');
const { buildRegistry } = require('../registry');
const { emit } = require('../emit-playwright');

const registry = buildRegistry([]);

function specFor(stepText) {
    const hit = registry.match(stepText);
    assert.ok(hit && !hit.ambiguous, `"${stepText}" should match exactly one phrasing`);
    const ctx = { app: 'supplier', addWait() {}, generator: (n) => registry.generators[n], state: {}, probe: false, error: (m) => assert.fail(m) };
    const ir = { title: 'T', source: 'steps/t.txt', ops: hit.phrasing.build(hit.m, ctx).map((op) => ({ ...op })) };
    return { ir, ops: ir.ops };
}

test('"set {x} to random name" uses the core letters generator', () => {
    const { ops } = specFor('set {lastName} to random name');
    assert.deepEqual(ops, [{ op: 'setVar', name: 'lastName', gen: { letters: 8, capitalize: true } }]);
});

test('an unknown random kind is an error', () => {
    const hit = registry.match('set {x} to random colour');
    const errors = [];
    hit.phrasing.build(hit.m, { generator: (n) => registry.generators[n], error: (m) => errors.push(m) });
    assert.deepEqual(errors, ['no generator "random colour"']);
});

test('the emitted expression gives 8 letters starting with a capital', () => {
    const { ir } = specFor('set {lastName} to random name');
    const code = emit({ title: ir.title, source: ir.source, multi: false, imports: [], preamble: [], steps: [{ src: { text: 'set {lastName} to random name' }, ops: ir.ops }] }, { testsDir: '/tmp', apps: {} });
    const line = code.split('\n').find((l) => l.includes('const lastName ='));
    assert.ok(line, 'the spec declares lastName');
    for (let i = 0; i < 50; i++) {
        const value = eval(line.replace('const lastName =', '').replace(/;\s*$/, ''));
        assert.match(value, /^[A-Z][a-z]{7}$/);
    }
});
