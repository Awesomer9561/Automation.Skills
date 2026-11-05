// Run with: node --test projects/_projects/probuy/
const test = require('node:test');
const assert = require('node:assert');
const { buildRegistry } = require('../../../steps-core/registry');
const { PAGE, V } = require('../../../steps-core/intents');
const pack = require('./pack');

const registry = buildRegistry([pack]);
const build = (text, app = 'admin') => {
    const hit = registry.match(text);
    assert.ok(hit && !hit.ambiguous, `"${text}" should match exactly one phrasing`);
    return hit.phrasing.build(hit.m, { app, addWait() {}, error: (msg) => { throw new Error(msg); } });
};

test('theme and language steps call the pack helpers', () => {
    assert.deepEqual(build('I should see the dark theme'), [{ op: 'call', fn: 'expectTheme', args: [PAGE, V('dark')] }]);
    assert.deepEqual(build('see the light mode'), [{ op: 'call', fn: 'expectTheme', args: [PAGE, V('light')] }]);
    assert.deepEqual(build('I switch the language to English'), [{ op: 'call', fn: 'setLanguage', args: [PAGE, V('en')] }]);
    assert.deepEqual(build('change language to Arabic'), [{ op: 'call', fn: 'setLanguage', args: [PAGE, V('ar')] }]);
    for (const fn of ['expectTheme', 'setLanguage']) assert.ok(require('fs').existsSync(pack.helpers[fn]));
});

test('plain "I should see" text is not taken by the theme step', () => {
    assert.equal(build('I should see "dark theme"')[0].op, 'expectVisible');
});

test('verify email step calls the yopmail helper with the portal URL variable', () => {
    assert.deepEqual(build('I verify {email} on yopmail'), [{ op: 'call', fn: 'verifyEmailOnYopmail', args: [PAGE, V('{email}'), { env: 'ADMIN_URL' }] }]);
    assert.ok(require('fs').existsSync(pack.helpers.verifyEmailOnYopmail));
});

test('document card upload builds the card input id from the title (supplier only)', () => {
    assert.deepEqual(build('I upload "documents/a.pdf" to document "New Commercial Document (New Doc)"', 'supplier'),
        [{ op: 'upload', target: { id: 'register-docs-new-commercial-document-new-doc-upload-input' }, file: V('./documents/a.pdf') }]);
    assert.deepEqual(build('I upload "documents/a.pdf" to profile document "Zakat And Tax Certificate"', 'supplier'),
        [{ op: 'upload', target: { id: 'profile-documents-zakat-and-tax-certificate-upload-input' }, file: V('./documents/a.pdf') }]);
    assert.throws(() => build('I upload "documents/a.pdf" to document "Zakat And Tax Certificate"', 'company'), /not mapped/);
});
