const test = require('node:test');
const assert = require('node:assert/strict');
const { cardFamilies } = require('../runtime/snapshot');

const el = (id, tag = 'a') => ({ id, tag });

test('records sharing a prefix are one card family', () => {
    const out = cardFamilies([el('orders-list-e2e1'), el('orders-list-e2e2'), el('orders-list-search-input', 'input')]);
    assert.deepEqual(out, [{ prefix: 'orders-list-', tag: 'a', count: 2 }]);
});

test('calendar days are not a card family', () => {
    const days = ['01', '02', '03'].map((d) => el(`orders-date-input-day-2026-10-${d}`, 'button'));
    assert.deepEqual(cardFamilies([el('orders-list-e2e1'), el('orders-list-e2e2'), ...days]),
        [{ prefix: 'orders-list-', tag: 'a', count: 2 }]);
});
