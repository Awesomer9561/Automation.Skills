const test = require('node:test');
const assert = require('node:assert');
const { regionOf, regionsFor, cssFor } = require('../regions');
const { buildRegistry } = require('../registry');
const { createResolver } = require('../resolve');

const registry = buildRegistry([]);

// Builds a step the way compile.js does, with a fake resolver that records what it was asked for.
function build(text, found) {
    const hit = registry.match(text);
    assert.ok(hit && !hit.ambiguous, `"${text}" should match exactly one phrasing`);
    const asked = [];
    const errors = [];
    const ctx = {
        app: 'supplier', addWait() {}, generator() {}, state: {}, probe: false,
        error: (m) => errors.push(m),
        resolve: (kind, name, region) => { asked.push({ kind, name, region }); return found; },
    };
    return { ops: hit.phrasing.build(hit.m, ctx), asked, errors };
}

test('region words map to a region, spacing and case tolerant', () => {
    assert.equal(regionOf('Side bar'), 'sidebar');
    assert.equal(regionOf('app header'), 'header');
    assert.equal(regionOf('pop-up'), 'modal');
    assert.equal(regionOf('Main Content'), 'main');
    assert.equal(regionOf('top-bar'), 'header');
    assert.equal(regionOf('side-nav'), 'sidebar');
    assert.equal(regionOf('Pop up'), 'modal');
    assert.equal(regionOf('footer'), undefined);
});

test('"in the <region>" narrows click, check, select and enter', () => {
    assert.deepEqual(build('I click "Orders" in the sidebar', { id: 'sidenav-orders-link' }).asked, [{ kind: 'clickable', name: 'Orders', region: 'sidebar' }]);
    assert.equal(build('click Save button in the modal', { id: 'x' }).asked[0].region, 'modal');
    for (const w of ['top-bar', 'side-bar', 'pop-up', 'main-page', 'app-header']) {
        assert.ok(build(`I click Save in the ${w}`, { id: 'x' }).asked[0].region, `${w} must narrow, not be ignored`);
    }
    assert.equal(build('I check Terms in the main page', { id: 'x' }).asked[0].region, 'main');
    assert.equal(build('I select "Riyadh" in City in the app header', { id: 'x' }).asked[0].region, 'header');
    const enter = build('I enter "a" in Search in the top bar', { id: 'x' });
    assert.deepEqual(enter.asked, [{ kind: 'field', name: 'Search', region: 'header' }]);
});

test('without "in the <region>" nothing changes, and a label that merely contains a region word stays whole', () => {
    assert.equal(build('I click "Orders"', { id: 'x' }).asked[0].region, undefined);
    const field = build('I enter "a" in Main contact', { id: 'x' });
    assert.deepEqual(field.asked, [{ kind: 'field', name: 'Main contact', region: undefined }]);
});

test('"field N" fills box N of a split input; other labels ending in a number are untouched', () => {
    const otp = { ids: ['o-0', 'o-1', 'o-2', 'o-3'] };
    const second = build('I enter 0 in OTP field 2', otp);
    assert.deepEqual(second.asked, [{ kind: 'field', name: 'OTP', region: undefined }]);
    assert.deepEqual(second.ops, [{ op: 'type', target: { id: 'o-1' }, value: { v: '0' } }]);
    assert.deepEqual(build('I enter "7" in OTP box 4', otp).ops[0].target, { id: 'o-3' });
    assert.equal(build('I enter {digit} in OTP digit 1', otp).ops[0].value.v, '{digit}');
    assert.equal(build('I enter "x" in Address line 2', { id: 'a2' }).asked[0].name, 'Address line 2');
    assert.match(build('I enter 1 in OTP field 9', otp).errors[0], /no box 9/);
    assert.match(build('I enter 1 in First name field 1', { id: 'fn' }).errors[0], /single field/);
});

test('the whole value still goes box by box, but a {var} must be literal', () => {
    const otp = { ids: ['o-0', 'o-1'] };
    assert.deepEqual(build('I enter OTP "20"', otp).ops.map((o) => o.value.v), ['2', '0']);
    assert.match(build('I enter {code} in OTP', otp).errors[0], /field 1/);
});

test('region selectors: defaults, then packs, config and the app override', () => {
    const config = {
        packs: [{ regions: { toast: '[id^="toast-"]' } }],
        regions: { sidebar: 'aside, #layout-sidebar' },
        apps: { admin: { regions: { header: null } }, supplier: {} },
    };
    assert.deepEqual(Object.keys(regionsFor(config, 'supplier')), ['modal', 'sidebar', 'header', 'toast']);
    assert.equal(regionsFor(config, 'supplier').sidebar, 'aside, #layout-sidebar');
    assert.ok(!('header' in regionsFor(config, 'admin')));
    assert.match(cssFor(regionsFor(config, 'supplier'), 'sidebar'), /^:is\(aside, #layout-sidebar\) \*, :is\(aside, #layout-sidebar\)$/);
    assert.match(cssFor(regionsFor(config, 'supplier'), 'main'), /^:not\(/);
    assert.throws(() => cssFor(regionsFor(config, 'supplier'), 'toolbar'), /not defined/);
});

const page = {
    name: 'supplier/dashboard', app: 'supplier', states: [{ id: 's1' }],
    elements: [
        { id: 'sidenav-orders-link', tag: 'a', text: 'Orders', region: 'sidebar', in: ['s1'], vis: ['s1'] },
        { id: 'dashboard-orders-btn', tag: 'button', text: 'Orders', region: 'main', in: ['s1'], vis: ['s1'] },
        { id: 'header-search-input', tag: 'input', type: 'text', label: 'Search', region: 'header', in: ['s1'], vis: ['s1'] },
    ],
};

test('the resolver keeps to the region, and tells QA which regions an ambiguous name is in', () => {
    const resolve = createResolver([page], { flowData: undefined });
    assert.deepEqual(resolve({}, 'supplier', 'clickable', 'Orders', 'sidebar'), { id: 'sidenav-orders-link' });
    assert.deepEqual(resolve({}, 'supplier', 'clickable', 'Orders', 'main'), { id: 'dashboard-orders-btn' });
    assert.equal(resolve({}, 'supplier', 'clickable', 'Orders', 'modal'), null);
    const both = resolve({}, 'supplier', 'clickable', 'Orders');
    assert.match(both.error, /matches 2 elements/);
    assert.match(both.error, /"in the sidebar" or "in the main"/);
});

test('a name the probe noted is not forced onto a different region', () => {
    const flow = { visits: [], names: [{ page: 'supplier/dashboard', state: 's1', kind: 'clickable', name: 'Orders', id: 'dashboard-orders-btn' }] };
    const resolve = createResolver([page], { flowData: flow });
    assert.deepEqual(resolve({}, 'supplier', 'clickable', 'Orders'), { id: 'dashboard-orders-btn' });
    assert.deepEqual(resolve({}, 'supplier', 'clickable', 'Orders', 'sidebar'), { id: 'sidenav-orders-link' });
});

test('a noted first box of a split input resolves to every box', () => {
    const otp = {
        name: 'supplier/auth', app: 'supplier', states: [{ id: 's2' }],
        elements: [0, 1, 2, 3].map((i) => ({ id: `register-otp-${i}`, tag: 'input', type: 'text', label: `OTP digit ${i + 1}`, in: ['s2'], vis: ['s2'] })),
    };
    const flow = { visits: [], names: [{ page: 'supplier/auth', state: 's2', kind: 'field', name: 'OTP', id: 'register-otp-0' }] };
    const resolve = createResolver([otp], { flowData: flow });
    assert.equal(resolve({}, 'supplier', 'field', 'OTP').ids.length, 4);
});
