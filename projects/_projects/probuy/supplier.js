// Supplier portal steps, shared by every ProBuy repo that drives the supplier UI (SupplierPortal.Automation,
// CompanyPortal.Automation). Repos list this file in steps.config.js `packs`, after pack.js.
//
// Id sources: [dev] probed on dev (local build), 2026-10-10. [qa] taken from CompanyPortal.Automation's QA specs, not yet
// probed on dev (the order details page did not render for the probe account): probe it before relying on them, and
// move the tag to [dev] once verified.

const { V, byId, varOrText } = require('../../../steps-core/intents');

const APP = 'supplier';
const VALUE = '(\\{\\w+\\}|"[^"]*")';     // {var} or "literal"
const PAGE_MS = 30000;
const SIGNUP_MS = 60000;
const DEFAULT_DOCUMENT = 'documents/Albilad 2024 F2 TotalF.pdf';

// Supplier steps act on the supplier page; they never switch app on their own.
const onSupplier = (ctx, step) => {
    if (ctx.app !== APP) ctx.error(`"${step}" is a supplier portal step; start with "I login with supplier user" or "I open the supplier portal"`);
};

// sidebar: section name -> link id [dev]
const SECTIONS = {
    dashboard: 'sidenav-dashboard-link',
    orders: 'sidenav-orders-link',
    'settlement report': 'sidenav-reports-link',
    reports: 'sidenav-reports-link',
    'supplier profile': 'sidenav-supplier-profile-link',
    integrations: 'sidenav-integrations-link',
    profile: 'sidenav-profile-link',
};

// Keycloak sign-up form, then the wizard opens on /auth. [dev]
function signupOps(ctx) {
    ctx.addWait(2 * SIGNUP_MS);
    return [
        { op: 'setVar', name: 'supplierEmail', gen: { unique: 'test{unique}@yopmail.com', digits: 8 } },
        { op: 'goto', app: APP, path: '/' },
        { op: 'waitFor', target: byId('#login-sign-up-link'), state: 'visible', timeout: SIGNUP_MS },
        { op: 'click', target: byId('#login-sign-up-link') },
        { op: 'waitFor', target: byId('#register-first-name-input'), state: 'visible', timeout: PAGE_MS },
        { op: 'fill', target: byId('#register-first-name-input'), value: V('Abdul') },
        { op: 'fill', target: byId('#register-last-name-input'), value: V('Khan') },
        { op: 'fill', target: byId('#register-email-input'), value: V('{supplierEmail}') },
        { op: 'fill', target: byId('#register-password-input'), value: V('Pass@1234') },
        { op: 'fill', target: byId('#register-password-confirm-input'), value: V('Pass@1234') },
        { op: 'click', target: byId('#register-submit-btn') },
        { op: 'waitFor', target: byId('#register-cr-input'), state: 'visible', timeout: SIGNUP_MS },
    ];
}

// Registration wizard from the entity-number page to "in verification". [dev] (local build; see rules.md)
function wizardOps(ctx, document) {
    ctx.addWait(5 * PAGE_MS);
    const wait = (id) => ({ op: 'waitFor', target: byId(id), state: 'visible', timeout: PAGE_MS });
    const fill = (id, value) => ({ op: 'fill', target: byId(id), value: V(value) });
    const click = (id) => ({ op: 'click', target: byId(id) });
    return [
        { op: 'setVar', name: 'supplierCr', gen: { unique: '70{unique}', digits: 8 } },
        { op: 'setVar', name: 'supplierVat', gen: { unique: '3000000{unique}', digits: 8 } },
        fill('#register-cr-input', '{supplierCr}'),
        click('#register-cr-submit-btn'),
        wait('#register-otp-0'),
        ...'2024'.split('').map((digit, i) => ({ op: 'type', target: byId(`#register-otp-${i}`), value: V(digit) })),
        click('#register-otp-submit-btn'),
        wait('#register-basic-email-input'),
        fill('#register-basic-email-input', '{supplierEmail}'),
        fill('#register-basic-tax-number-input', '{supplierVat}'),
        fill('#register-basic-iban-input', 'SA0380000000608010167519'),
        click('#register-next-btn'),
        wait('#register-address-line1-input'),
        fill('#register-address-line1-input', '102'),
        fill('#register-address-line2-input', 'Olaya Street'),
        fill('#register-address-district-input', 'Al Olaya District'),
        fill('#register-address-postal-code-input', '12211'),
        fill('#register-address-additional-no-input', '4532679777'),
        click('#register-submit-btn'),
        wait('#register-docs-new-commercial-document-new-doc-upload-btn'),
        { op: 'upload', target: byId('#register-docs-new-commercial-document-new-doc-upload-input'), file: V(`./${document}`) },
        click('#register-docs-submit-btn'),
        { op: 'waitUrl', regex: { source: '\\/dashboard', flags: '' }, timeout: PAGE_MS },
        { op: 'expectVisible', target: { text: V('Account is in the verification process') }, timeout: PAGE_MS },
        { op: 'record', type: 'supplier-account', key: { email: V('{supplierEmail}') } },
    ];
}

module.exports = {
    name: 'probuy-supplier',
    phrasings: [
        {
            usage: 'I register a new supplier [with document "documents/x.pdf"]   (sign-up + full registration wizard; creates a real account)',
            pattern: /^(?:i )?register (?:a )?new supplier(?: with document "([^"]+)")?$/i,
            build: (m, ctx) => [
                { op: 'switchApp', app: APP },
                ...signupOps(ctx),
                ...wizardOps(ctx, m[1] || DEFAULT_DOCUMENT),
            ],
        },
        {
            usage: 'I sign up as a new supplier   (Keycloak sign-up only; stops on the registration wizard; sets {supplierEmail})',
            pattern: /^(?:i )?sign ?up as (?:a )?new supplier$/i,
            build: (m, ctx) => [{ op: 'switchApp', app: APP }, ...signupOps(ctx)],
        },
        {
            usage: 'I complete supplier registration [with document "documents/x.pdf"]   (the wizard after "I sign up as a new supplier")',
            pattern: /^(?:i )?complete (?:the )?supplier registration(?: with document "([^"]+)")?$/i,
            build: (m, ctx) => {
                onSupplier(ctx, m[0]);
                return wizardOps(ctx, m[1] || DEFAULT_DOCUMENT);
            },
        },
        {
            usage: `I open the orders page | go to dashboard | open supplier profile   (supplier sidebar: ${Object.keys(SECTIONS).join(', ')})`,
            pattern: new RegExp(`^(?:i )?(?:open|go to|navigate to) (?:the )?(${Object.keys(SECTIONS).join('|')})(?: page| tab| screen)?$`, 'i'),
            build: (m, ctx) => {
                onSupplier(ctx, m[0]);
                return [
                    { op: 'click', target: { id: SECTIONS[m[1].toLowerCase()] } },
                    { op: 'waitLoad', state: 'networkidle', timeout: PAGE_MS },
                ];
            },
        },
        {
            usage: 'I should see the dashboard',
            pattern: /^(?:i )?should see the (?:supplier )?dashboard$/i,
            build: (m, ctx) => {
                onSupplier(ctx, m[0]);
                return [
                    { op: 'waitUrl', regex: { source: '\\/dashboard', flags: '' }, timeout: PAGE_MS },
                    { op: 'waitFor', target: byId('#sidenav-dashboard-link'), state: 'visible', timeout: PAGE_MS },   // [dev]
                ];
            },
        },
        {
            usage: 'I logout | log out | sign out',
            pattern: /^(?:i )?(?:log ?out|sign ?out)$/i,
            build: (m, ctx) => {
                onSupplier(ctx, m[0]);
                return [
                    { op: 'click', target: byId('#sidenav-logout-btn') },                                            // [dev]
                    { op: 'waitFor', target: byId('#sidenav-logout-btn'), state: 'hidden', timeout: PAGE_MS },
                ];
            },
        },
        {
            usage: 'I search for order {orderNumber} | search order "E2E123"   (orders page search box)',
            pattern: new RegExp(`^(?:i )?search (?:for )?order ${VALUE}$`, 'i'),
            build: (m, ctx) => {
                onSupplier(ctx, m[0]);
                return [{ op: 'fill', target: byId('#orders-list-search-input'), value: varOrText(m[1]) }];       // [dev]
            },
        },
        {
            usage: 'I open order {orderNumber}   (clicks its card in the orders list and waits for the details)',
            pattern: new RegExp(`^(?:i )?open (?:the )?order ${VALUE}$`, 'i'),
            build: (m, ctx) => {
                onSupplier(ctx, m[0]);
                const number = varOrText(m[1]).v;
                return [
                    // [dev] cards are orders-list-<order number, lowercased>; QA specs used order-card-<number>
                    { op: 'click', target: { idValue: V(`orders-list-${number}`), ignoreCase: true } },
                    { op: 'waitUrl', regex: { source: '\\/orders\\/[^/]+$', flags: '' }, timeout: PAGE_MS },   // [dev]
                ];
            },
        },
        {
            usage: 'the order status should be "Pending Approval"   (order details badge contains the text)',
            pattern: /^(?:and )?(?:the )?order status should (?:be|contain) "([^"]+)"$/i,
            build: (m, ctx) => {
                onSupplier(ctx, m[0]);
                return [{ op: 'expectText', target: byId('#order-details-status-badge'), value: V(m[1]), timeout: PAGE_MS }];       // [dev]
            },
        },
        {
            usage: 'I accept the order   (order details: accept, confirm in the modal)',
            pattern: /^(?:i )?accept (?:the )?order$/i,
            build: (m, ctx) => {
                onSupplier(ctx, m[0]);
                return [
                    { op: 'click', target: byId('#order-details-accept-btn') },                                       // [qa]
                    { op: 'click', target: byId('#accept-order-modal-confirm-btn') },
                    { op: 'expectHidden', target: byId('#order-details-accept-btn'), timeout: PAGE_MS },
                ];
            },
        },
        {
            usage: 'I cancel the order   (order details: cancel, confirm in the modal)',
            pattern: /^(?:i )?cancel (?:the )?order$/i,
            build: (m, ctx) => {
                onSupplier(ctx, m[0]);
                return [
                    { op: 'click', target: byId('#order-details-cancel-btn') },                                       // [qa]
                    { op: 'click', target: byId('#order-details-cancel-modal-confirm-btn') },
                    { op: 'expectHidden', target: byId('#order-details-cancel-btn'), timeout: PAGE_MS },
                ];
            },
        },
    ],
};
