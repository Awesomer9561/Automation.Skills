// Steps shared by every ProBuy portal (supplier, company, admin): their Keycloak login pages use the same ids.
// Repos list this file in steps.config.js `packs`. Ids verified by probes on dev, 2026-10-10 (supplier, company).

const path = require('path');
const { byId, V, PAGE } = require('../../../steps-core/intents');

const LOGIN_MS = 60000;
const YOPMAIL_MS = 300000;   // mail wait (90s) + a person ticking yopmail's human check (180s) + page loads

// Document cards: one card per document type the admin configured; each card's file input has an id built from the card
// title ("New Commercial Document (New Doc)" -> new-commercial-document-new-doc). Verified on the Supplier portal (dev,
// 2026-11-05): registration (/register/documents) and resubmission (/auth/upload-documents) share the register-docs-* ids; the
// profile page (/profile) shows one input per still-missing card after the "missing documents" banner action is clicked.
// Other portals are added here once probed.
const DOC_INPUT_ID = {
    supplier: {
        page: (slug) => `register-docs-${slug}-upload-input`,
        profile: (slug) => `profile-documents-${slug}-upload-input`,
    },
};
const slugOf = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Open the portal's root, sign in on the Keycloak form, and wait for the form to go.
const loginOps = (app, email, password, ctx) => {
    ctx.addWait(2 * LOGIN_MS);
    return [
        { op: 'switchApp', app },
        { op: 'goto', app, path: '/' },
        { op: 'waitFor', target: byId('#login-username-input'), state: 'visible', timeout: LOGIN_MS },
        { op: 'fill', target: byId('#login-username-input'), value: email },
        { op: 'fill', target: byId('#login-password-input'), value: password },
        { op: 'click', target: byId('#login-submit-btn') },
        // signed in once Keycloak's form is gone; the landing page differs per account
        { op: 'waitFor', target: byId('#login-password-input'), state: 'hidden', timeout: LOGIN_MS },
    ];
};

module.exports = {
    name: 'probuy',
    // Helper modules the steps below call. Core ignores this field; a repo maps them in steps.config.js with
    // `helpers: { ...require('../Automation.Skills/projects/_projects/probuy/pack').helpers }`.
    helpers: {
        expectTheme: path.join(__dirname, 'helpers.js'),
        setLanguage: path.join(__dirname, 'helpers.js'),
        verifyEmailOnYopmail: path.join(__dirname, 'helpers.js'),
    },
    // Layout regions (steps-core/regions.js) beyond the defaults. All three portals have a <header> and an <aside>
    // (the sidebar); their modals are Radix dialogs (role=dialog, id <name>-modal), already a default; toasts have
    // no role, only ids toast-<type>-<random>-*. There is no <main>: the main area is whatever is outside the others.
    regions: {
        sidebar: 'aside, #layout-sidebar',
        toast: '[id^="toast-"]',
    },
    phrasings: [
        {
            usage: 'I login as "ADMIN" user | I login with "SUPPLIER_CUSTOM_PLAN" credentials|account   (the quoted name is the .env prefix: credentials are <NAME>_EMAIL / <NAME>_PASSWORD, and its first word is the portal)',
            pattern: /^(?:i )?(?:log ?in|sign ?in)(?: as| with| using)? (?:the |a |an )?"([^"]+)"(?: user| account| credentials)?$/i,
            build: (m, ctx) => {
                const prefix = m[1].trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                const app = prefix.split('_')[0].toLowerCase();
                if (!app) {
                    ctx.error(`account "${m[1]}" must start with its portal, e.g. "ADMIN" or "SUPPLIER_CUSTOM_PLAN"`);
                    return [];
                }
                return loginOps(app, { env: `${prefix}_EMAIL` }, { env: `${prefix}_PASSWORD` }, ctx);
            },
        },
        {
            usage: 'I should see the dark theme | see the light theme   (the active theme, from the class on <html>)',
            pattern: /^(?:i )?(?:should )?see (?:the )?(dark|light) (?:theme|mode)$/i,
            build: (m) => [{ op: 'call', fn: 'expectTheme', args: [PAGE, V(m[1].toLowerCase())] }],
        },
        {
            usage: 'I switch the language to English | change language to Arabic   (sets it, whichever language the account was saved with)',
            pattern: /^(?:i )?(?:switch|change|set) (?:the )?language to (english|arabic)$/i,
            build: (m) => [{ op: 'call', fn: 'setLanguage', args: [PAGE, V(m[1].toLowerCase() === 'arabic' ? 'ar' : 'en')] }],
        },
        {
            usage: 'I verify {email} on yopmail   (Keycloak sign-up sends a verification mail: opens yopmail.com, that inbox, clicks "Verify Email Address", then returns to the portal root, <APP>_URL; if yopmail shows its human check, run headed and tick the box)',
            pattern: /^(?:i )?verify (?:the )?(?:email )?(\{\w+\}|"[^"]*")(?: (?:on|in|through|via) yopmail)?$/i,
            build: (m, ctx) => ctx.addWait(YOPMAIL_MS) || [{ op: 'call', fn: 'verifyEmailOnYopmail', args: [PAGE, V(m[1].replace(/^"|"$/g, '')), { env: `${ctx.app.toUpperCase()}_URL` }] }],
        },
        {
            usage: 'I upload "documents/file.pdf" to document "Zakat And Tax Certificate" | to profile document "..."   (the document card with that title: on the registration / resubmission documents page, or with "profile" on the profile page; one step per card; supplier portal)',
            pattern: /^(?:i )?upload "([^"]+)" (?:to|for|in|into) (?:the )?(profile )?document(?: card)? "([^"]+)"$/i,
            build: (m, ctx) => {
                const ids = DOC_INPUT_ID[ctx.app];
                if (!ids) {
                    ctx.error(`document card uploads are not mapped for the ${ctx.app} portal yet (probuy/pack.js DOC_INPUT_ID)`);
                    return [];
                }
                const slug = slugOf(m[3]);
                if (!slug) {
                    ctx.error(`document card title "${m[3]}" has no letters or digits`);
                    return [];
                }
                const idOf = m[2] ? ids.profile : ids.page;
                return [{ op: 'upload', target: byId(`#${idOf(slug)}`), file: V(m[1].startsWith('.') ? m[1] : `./${m[1]}`) }];
            },
        },
    ],
};
