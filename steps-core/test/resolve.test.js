const test = require('node:test');
const assert = require('node:assert');
const { createResolver } = require('../resolve');

const page = {
    name: 'admin/orders', app: 'admin', path: '/orders', states: [{ id: 's1' }],
    elements: [
        { id: 'f-select', tag: 'button', role: 'combobox', label: 'Client Order Filter', in: ['s1'], vis: ['s1'],
            options: [{ text: 'Pending', id: 'f-pending-item' }] },
        { id: 'plain-select', tag: 'select', label: 'City', in: ['s1'], vis: ['s1'], options: ['Riyadh'] },
    ],
};

test('a custom dropdown is found by its label and carries its options', () => {
    const resolve = createResolver([page], { flowData: undefined });
    const found = resolve({}, 'admin', 'select', 'Client Order Filter');
    assert.deepEqual(found, { id: 'f-select', combobox: true, options: [{ text: 'Pending', id: 'f-pending-item' }] });
});

test('a native select resolves as before', () => {
    const resolve = createResolver([page], { flowData: undefined });
    assert.deepEqual(resolve({}, 'admin', 'select', 'City'), { id: 'plain-select' });
});
