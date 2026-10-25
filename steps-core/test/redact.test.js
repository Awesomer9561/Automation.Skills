const test = require('node:test');
const assert = require('node:assert');
const { redact } = require('../runtime/snapshot');

const names = new Set(['parvez', 'fiza', 'ali']);

test('name words are replaced by *, whole words only, any case', () => {
    assert.equal(redact('Welcome back, Parvez Fiza Ali!', names), 'Welcome back, * * *!');
    assert.equal(redact('PARVEZ', names), '*');
    assert.equal(redact('Alignment and Alibaba', names), 'Alignment and Alibaba');
});

test('Arabic text next to a name keeps its own letters', () => {
    assert.equal(redact('مرحبا parvez', names), 'مرحبا *');
});

test('nothing to redact leaves text alone, empty and missing are fine', () => {
    assert.equal(redact('Orders', names), 'Orders');
    assert.equal(redact('Orders', new Set()), 'Orders');
    assert.equal(redact(undefined, names), undefined);
    assert.equal(redact('', names), '');
});
