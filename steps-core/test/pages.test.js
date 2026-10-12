const test = require('node:test');
const assert = require('node:assert');
const { mergeSnapshot, pageName } = require('../pages');

const el = (id, extra = {}) => ({ id, tag: 'input', type: 'text', visible: true, ...extra });
const ids = (n, prefix = 'f') => Array.from({ length: n }, (_, i) => el(`${prefix}-${i}`));
const snap = (elements, headings = ['H']) => ({ app: 'supplier', path: '/register', headings, elements });

test('page name is app + slug of the path', () => {
    assert.equal(pageName('supplier', '/'), 'supplier/index');
    assert.equal(pageName('company', '/orders/*'), 'company/orders-details');
});

test('the same snapshot twice updates the record instead of adding a state', () => {
    const a = mergeSnapshot(null, snap(ids(10)), '2026-01-01');
    assert.ok(a.isNewPage && a.isNewState);
    const b = mergeSnapshot(a.page, snap(ids(10)), '2026-02-02');
    assert.ok(!b.isNewPage && !b.isNewState && !b.changed);
    assert.equal(b.page.capturedAt, '2026-01-01');   // unchanged content keeps the date: no diff churn
    assert.equal(b.page.states.length, 1);
});

test('a mostly different set of ids at the same path is a new state', () => {
    const a = mergeSnapshot(null, snap(ids(10)));
    const b = mergeSnapshot(a.page, snap([...ids(3), ...ids(8, 'g')]));
    assert.ok(b.isNewState);
    assert.equal(b.state.id, 's2');
    assert.equal(b.page.elements.find((e) => e.id === 'f-0').in.join(), 's1,s2');
});

test('attributes refresh and visibility is tracked per state', () => {
    const a = mergeSnapshot(null, snap([el('x', { label: 'Old' }), ...ids(9)]));
    const b = mergeSnapshot(a.page, snap([el('x', { label: 'New', visible: false }), ...ids(9)]));
    const x = b.page.elements.find((e) => e.id === 'x');
    assert.equal(x.label, 'New');
    assert.deepEqual(x.vis, []);
    assert.ok(b.changed);
});

test('a closed custom dropdown keeps the options an earlier open snapshot recorded', () => {
    const combo = (extra = {}) => el('f-select', { tag: 'button', type: undefined, role: 'combobox', label: 'Filter', ...extra });
    const options = [{ text: 'Pending', id: 'f-pending-item' }];
    const a = mergeSnapshot(null, snap([combo({ options }), ...ids(9)]));
    const b = mergeSnapshot(a.page, snap([combo(), ...ids(9)]));
    assert.deepEqual(b.page.elements.find((e) => e.id === 'f-select').options, options);
});
