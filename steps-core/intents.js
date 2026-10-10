// Core phrasings every repo gets, and the IR they produce.
//
// A phrasing is { usage, pattern, build(match, ctx) -> op[] }. build returns plain data (IR ops), never code;
// emit-playwright.js is the only place that knows Playwright. Packs (a project family's pack under
// Automation.Skills/projects/, or a repo's steps.pack.js) add phrasings in the same shape.
// ctx: { app, addWait(ms), generator(name), error(msg) }.
//
// Ops:
//   { op: 'click'|'check', target }                 { op: 'fill'|'type', target, value }
//   { op: 'press', target, key }                    { op: 'upload', target, file }
//   { op: 'waitFor', target, state: 'visible'|'hidden', timeout }
//   { op: 'waitLoad', state: 'load'|'networkidle', timeout }    { op: 'waitUrl', regex, timeout }
//   { op: 'sleep', ms }                             { op: 'reload' }
//   { op: 'expectVisible'|'expectHidden', target, timeout? }    { op: 'expectUrl', regex }
//   { op: 'goto', app, path }                       { op: 'switchApp', app }
//   { op: 'call', fn, args, construct?, method? }   fn is a helper name mapped in steps.config.js `helpers`;
//                                                   with construct: `new fn(...construct).method(...args)`
//   { op: 'setVar', name, gen }                     gen: { fn } (helper returning the value) | { unique, digits } | { env }
//   { op: 'record', type, key }                     adds the entity to the local test-data ledger
// Targets: { id } | { idPrefix } (first element whose id starts with it) | { text: value } | { regex }
// Values: { v: 'text with {var}s' }. Call args: PAGE, a value, or { obj: { key: value } }. Regex: { source, flags }.

const V = (text) => ({ v: text });
const PAGE = '$page';
const re = (source, flags = '') => ({ source, flags });
const byId = (hashId) => ({ id: hashId.replace(/^#/, '') });
// {var} or "quoted literal" -> value
const varOrText = (s) => V(s.startsWith('"') ? s.slice(1, -1) : s);

const Q = '"([^"]*)"';
const ID = '(#[\\w-]+)';
const UNIT = '(seconds?|secs?|minutes?|mins?)';
const UP_TO = `(?:\\s+up to (\\d+(?:\\.\\d+)?) ${UNIT})?`;
const WAIT = '^wait (?:till|until|for)';
const DEFAULT_WAIT_MS = 20000;

const toMs = (n, unit) => Math.round(parseFloat(n) * (/^m/i.test(unit) ? 60000 : 1000));
// Timeout from the optional "up to N unit" capture pair; an explicit one is added to the test's time budget.
const waitMs = (ctx, n, unit) => {
    const ms = n === undefined ? DEFAULT_WAIT_MS : toMs(n, unit);
    if (n !== undefined) ctx.addWait(ms);
    return ms;
};

const PHRASINGS = [
    {
        usage: 'portal <app>   (switch app; using more than one app gives each its own browser context)',
        pattern: /^(?:portal|app) (\w+)$/i,
        build: (m) => [{ op: 'switchApp', app: m[1].toLowerCase() }],
    },
    {
        usage: 'wait 30 seconds | wait for 2 minutes  (fixed sleep; prefer a "wait till ..." step)',
        pattern: new RegExp(`^wait (?:for )?(\\d+(?:\\.\\d+)?) ${UNIT}$`, 'i'),
        build: (m, ctx) => {
            const ms = toMs(m[1], m[2]);
            ctx.addWait(ms);
            return [{ op: 'sleep', ms }];
        },
    },
    {
        usage: 'wait till "text" loads [up to 30 seconds]   (also: until|for, appears|shows|is visible)',
        pattern: new RegExp(`${WAIT} ${Q}(?: (?:loads|appears|shows|is visible))?${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitFor', target: { text: V(m[1]) }, state: 'visible', timeout: waitMs(ctx, m[2], m[3]) }],
    },
    {
        usage: 'wait till #element-id loads [up to 1 minute]   (also: appears|shows|is visible)',
        pattern: new RegExp(`${WAIT} ${ID}(?: (?:loads|appears|shows|is visible))?${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitFor', target: byId(m[1]), state: 'visible', timeout: waitMs(ctx, m[2], m[3]) }],
    },
    {
        usage: 'wait till #element-id|"text" disappears [up to 30 seconds]   (also: goes away|closes|is gone|is hidden)',
        pattern: new RegExp(`${WAIT} (?:${ID}|${Q}) (?:disappears|goes away|closes|is gone|is hidden)${UP_TO}$`, 'i'),
        build: (m, ctx) => [{
            op: 'waitFor',
            target: m[1] ? byId(m[1]) : { text: V(m[2]) },
            state: 'hidden',
            timeout: waitMs(ctx, m[3], m[4]),
        }],
    },
    {
        usage: 'wait till page loads [up to 30 seconds]   (also: is loaded)',
        pattern: new RegExp(`${WAIT} (?:the )?page (?:loads|is loaded)${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitLoad', state: 'load', timeout: waitMs(ctx, m[1], m[2]) }],
    },
    {
        usage: 'wait till network is idle [up to 30 seconds]',
        pattern: new RegExp(`${WAIT} (?:the )?network (?:is )?idle${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitLoad', state: 'networkidle', timeout: waitMs(ctx, m[1], m[2]) }],
    },
    {
        usage: 'wait till url /regex/ [up to 30 seconds]',
        pattern: new RegExp(`${WAIT} url \\/(.+)\\/${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitUrl', regex: re(m[1]), timeout: waitMs(ctx, m[2], m[3]) }],
    },
    {
        usage: 'wait till /regex/ appears [up to 30 seconds]   (text matched by regex, e.g. toasts whose wording varies by env)',
        pattern: new RegExp(`${WAIT} \\/(.+)\\/(?: (?:loads|appears|shows|is visible))?${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitFor', target: { regex: re(m[1]) }, state: 'visible', timeout: waitMs(ctx, m[2], m[3]) }],
    },
    {
        usage: 'open /path   (relative to the current app\'s base URL)',
        pattern: /^open (\/\S*)$/i,
        build: (m, ctx) => [{ op: 'goto', app: ctx.app, path: m[1] }],
    },
    {
        usage: 'snapshot "page-name"   (records the page into knowledge/pages/ when run via npm run probe; no-op otherwise)',
        pattern: /^snapshot "([\w-]+)"$/i,
        build: (m) => [{ op: 'call', fn: 'snapshotPage', args: [PAGE, V(m[1])] }],
    },
    {
        usage: 'enter otp "2024" in #register-otp   (types one digit into #register-otp-0, -1, ...)',
        pattern: new RegExp(`^enter otp ${Q} in (#[\\w-]+)$`, 'i'),
        build: (m) => m[1].split('').map((digit, i) => ({ op: 'type', target: byId(`${m[2]}-${i}`), value: V(digit) })),
    },
    {
        usage: 'upload #file-input-id "documents/file.pdf"',
        pattern: new RegExp(`^upload ${ID} ${Q}$`, 'i'),
        build: (m) => [{ op: 'upload', target: byId(m[1]), file: V(m[2].startsWith('.') ? m[2] : `./${m[2]}`) }],
    },
    {
        usage: 'check #checkbox-id',
        pattern: new RegExp(`^check ${ID}$`, 'i'),
        build: (m) => [{ op: 'check', target: byId(m[1]) }],
    },
    {
        usage: 'reload page',
        pattern: /^reload page$/i,
        build: () => [{ op: 'reload' }],
    },
    {
        usage: 'set {name} to unique "text" (digits appended, or placed at {unique})',
        pattern: /^set \{(\w+)\} to unique "([^"]*)"$/i,
        build: (m) => [{ op: 'setVar', name: m[1], gen: { unique: m[2].includes('{unique}') ? m[2] : `${m[2]}{unique}`, digits: 8 } }],
    },
    {
        usage: 'set {name} to env VAR_NAME   (credentials and other secrets; the test fails if VAR_NAME is not set)',
        pattern: /^set \{(\w+)\} to env ([A-Z][A-Z0-9_]*)$/,
        build: (m) => [{ op: 'setVar', name: m[1], gen: { env: m[2] } }],
    },
    {
        usage: 'record <type> {var}   (logs data the test created to the local ledger, e.g. record supplier-account {email})',
        pattern: /^record ([\w-]+) \{(\w+)\}$/i,
        build: (m) => [{ op: 'record', type: m[1], key: { [m[2]]: V(`{${m[2]}}`) } }],
    },
    {
        usage: 'set {name} to random <kind>   (kinds come from packs; see "generators" below)',
        pattern: /^set \{(\w+)\} to random (.+)$/i,
        build: (m, ctx) => {
            const name = `random ${m[2].toLowerCase()}`;
            const gen = ctx.generator(name);
            if (!gen) {
                ctx.error(`no generator "${name}"`);
                return [];
            }
            return [{ op: 'setVar', name: m[1], gen }];
        },
    },
    {
        usage: 'click #element-id',
        pattern: new RegExp(`^click ${ID}$`, 'i'),
        build: (m) => [{ op: 'click', target: byId(m[1]) }],
    },
    {
        usage: 'fill #element-id with "value"',
        pattern: new RegExp(`^fill ${ID} with ${Q}$`, 'i'),
        build: (m) => [{ op: 'fill', target: byId(m[1]), value: V(m[2]) }],
    },
    {
        usage: 'expect text "text"',
        pattern: new RegExp(`^expect text ${Q}$`, 'i'),
        build: (m) => [{ op: 'expectVisible', target: { text: V(m[1]) } }],
    },
    {
        usage: 'expect visible #element-id',
        pattern: new RegExp(`^expect visible ${ID}$`, 'i'),
        build: (m) => [{ op: 'expectVisible', target: byId(m[1]) }],
    },
    {
        usage: 'expect hidden #element-id',
        pattern: new RegExp(`^expect hidden ${ID}$`, 'i'),
        build: (m) => [{ op: 'expectHidden', target: byId(m[1]) }],
    },
    {
        usage: 'expect url /regex/',
        pattern: /^expect url \/(.+)\/$/i,
        build: (m) => [{ op: 'expectUrl', regex: re(m[1]) }],
    },
];

// Helpers the core provides itself (runtime/), imported by package name so generated specs carry no machine
// paths; repo helpers are mapped in steps.config.js.
const PKG = require('./package.json').name;
const CORE_HELPERS = {
    snapshotPage: `${PKG}/runtime/snapshot`,
    recordCreated: `${PKG}/runtime/ledger`,
};

module.exports = {
    core: { name: 'core', phrasings: PHRASINGS },
    CORE_HELPERS,
    // for packs
    V, PAGE, re, byId, varOrText, Q, ID,
};
