// Core phrasings every repo gets, and the IR they produce.
//
// A phrasing is { usage, pattern, build(match, ctx) -> op[] }. build returns plain data (IR ops), never code;
// emit-playwright.js is the only place that knows Playwright. Packs (a project family's pack under
// Automation.Skills/projects/, or a repo's steps.pack.js) add phrasings in the same shape.
// ctx: { app, addWait(ms), generator(name), error(msg), state (an object kept for the whole steps file),
//        probe (compiling for `npm run probe`), resolve(kind, name) (see resolve.js) }.
//
// Ops:
//   { op: 'click'|'check', target }                 { op: 'fill'|'type', target, value }
//   { op: 'select', target, value }                 picks the option with that label
//   { op: 'press', target, key }                    { op: 'upload', target, file }
//   { op: 'waitFor', target, state: 'visible'|'hidden', timeout }
//   { op: 'waitLoad', state: 'load'|'networkidle', timeout }    { op: 'waitUrl', regex, timeout }
//   { op: 'sleep', ms }                             { op: 'reload' }
//   { op: 'expectVisible'|'expectHidden', target, timeout? }    { op: 'expectUrl', regex }
//   { op: 'expectText', target, value, timeout? }   target contains the text
//   { op: 'goto', app, path }                       { op: 'switchApp', app } (may be followed by more ops)
//   { op: 'call', fn, args, construct?, method? }   fn is a helper name mapped in steps.config.js `helpers`;
//                                                   with construct: `new fn(...construct).method(...args)`
//   { op: 'setVar', name, gen }                     gen: { fn } (helper returning the value) | { unique, digits } | { env }
//   { op: 'record', type, key }                     adds the entity to the local test-data ledger
// Targets: { id } | { idPrefix } (first element whose id starts with it) | { idValue: value, ignoreCase? } (id built
//          from {var}s, e.g. orders-list-{orderNumber}) | { text: value } | { regex }
// Values: { v: 'text with {var}s' } | { env: 'VAR_NAME' } (read at run time; fails if unset). Call args: PAGE, a value, or { obj: { key: value } }. Regex: { source, flags }.

const { regionOf, wordsPattern } = require('./regions');

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
const WAIT = '^(?:i )?wait (?:till|until|for)';      // "I" optional: "I wait till ..." reads like the other steps
const SHOWN = '(?: (?:loads|appears|shows|is visible|to load|to appear|to show|to be visible))?';
const GONE = '(?:disappears|goes away|closes|is gone|is hidden|to disappear|to go away|to close|to be hidden)';
const DEFAULT_WAIT_MS = 20000;
const VALUE = '(\\{\\w+\\}|"[^"]*")';        // {var} or "literal"
const NAME = '([^#"{].*?)';                     // a label or button text as shown on screen (not an #id)
const VALUE_OR_NUMBER = '(\\{\\w+\\}|"[^"]*"|\\d+)';  // as VALUE, or a bare number ("I enter 2 in OTP field 1")
// "... in the sidebar" narrows a name to one part of the layout (see regions.js); words are the region aliases
const REGION = `(?: (?:in|from|on|within) the ${wordsPattern()})?`;
const regionKey = (word) => (word ? regionOf(word) : undefined);

// A step that names an element by its label/text: the catalog's id when a probe recorded it; during a probe, a
// runtime lookup by label (which records the page for next time); otherwise an error asking for a probe.
const targetOf = (found, name) => {
    if (found.cardPrefix) return { idValue: V(`${found.cardPrefix}${name.replace(/\s+/g, '-')}`), ignoreCase: true };
    return found.idPrefix ? { idPrefix: found.idPrefix } : { id: found.id };
};
const KIND_WORDS = { field: 'field', clickable: 'button or link', checkbox: 'checkbox', select: 'dropdown', file: 'file input' };
// region: the layout region the name must be in (or undefined); extra: further probe call args after the region.
function byName(ctx, kind, name, withId, probeCall, region, extra = []) {
    const found = ctx.resolve(kind, name, region);
    if (found && found.error) {
        ctx.error(found.error);
        return [];
    }
    if (found) return withId(found);
    if (ctx.probe) return [{ op: 'call', fn: probeCall[0], args: [PAGE, V(ctx.app), ...probeCall.slice(1), V(region || ''), ...extra] }];
    ctx.error(`no ${KIND_WORDS[kind]} "${name}"${region ? ` in the ${region}` : ''} recorded for the ${ctx.app} portal; probe this steps file first (npm run probe -- <file>)`);
    return [];
}

const toMs = (n, unit) => Math.round(parseFloat(n) * (/^m/i.test(unit) ? 60000 : 1000));
// Timeout from the optional "up to N unit" capture pair; an explicit one is added to the test's time budget.
const waitMs = (ctx, n, unit) => {
    const ms = n === undefined ? DEFAULT_WAIT_MS : toMs(n, unit);
    if (n !== undefined) ctx.addWait(ms);
    return ms;
};

// "OTP field 2" -> box 2 of the segmented input "OTP" (the keyword keeps labels like "Address line 2" whole)
const INDEXED = /^(.+?) (?:field|box|digit|input|cell) (\d+)$/i;

// Fills a field; a segmented input (OTP boxes) gets one character per box, or one box when the step names it.
function enterValue(ctx, label, value, region) {
    const indexed = label.match(INDEXED);
    const name = indexed ? indexed[1] : label;
    const index = indexed ? Number(indexed[2]) : 0;
    return byName(ctx, 'field', name, (found) => {
        if (index) {
            if (!found.ids) ctx.error(`"${name}" is a single field, not boxes; write "${name}" without "${label.slice(name.length + 1)}"`);
            else if (index > found.ids.length) ctx.error(`"${name}" has ${found.ids.length} boxes, there is no box ${index}`);
            else return [{ op: 'type', target: { id: found.ids[index - 1] }, value }];
            return [];
        }
        if (!found.ids) return [{ op: 'fill', target: targetOf(found), value }];
        if (/\{\w+\}/.test(value.v || '')) {
            ctx.error(`"${name}" is split into ${found.ids.length} boxes; give the value literally, e.g. "2024", or fill one box: "${name} field 1"`);
            return [];
        }
        return found.ids.map((id, i) => ({ op: 'type', target: { id }, value: V((value.v || '')[i] || '') }));
    }, ['probeFill', V(name), value], region, [V(String(index))]);
}

const PHRASINGS = [
    {
        usage: 'portal <app>   (switch app; using more than one app gives each its own browser context)',
        pattern: /^(?:portal|app) (\w+)$/i,
        build: (m) => [{ op: 'switchApp', app: m[1].toLowerCase() }],
    },
    {
        usage: 'I wait for 5 seconds | wait 2 minutes  (fixed sleep; prefer a "wait till ..." step)',
        pattern: new RegExp(`^(?:i )?wait (?:for )?(\\d+(?:\\.\\d+)?) ${UNIT}$`, 'i'),
        build: (m, ctx) => {
            const ms = toMs(m[1], m[2]);
            ctx.addWait(ms);
            return [{ op: 'sleep', ms }];
        },
    },
    {
        usage: 'I wait till "text" appears [up to 30 seconds]   (also: until|for, loads|shows|is visible, wait for "text" to appear)',
        pattern: new RegExp(`${WAIT} ${Q}${SHOWN}${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitFor', target: { text: V(m[1]) }, state: 'visible', timeout: waitMs(ctx, m[2], m[3]) }],
    },
    {
        usage: 'I wait till #element-id loads [up to 1 minute]   (also: appears|shows|is visible, to load|to appear)',
        pattern: new RegExp(`${WAIT} ${ID}${SHOWN}${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitFor', target: byId(m[1]), state: 'visible', timeout: waitMs(ctx, m[2], m[3]) }],
    },
    {
        usage: 'I wait till #element-id|"text" disappears [up to 30 seconds]   (also: goes away|closes|is gone|is hidden, to disappear)',
        pattern: new RegExp(`${WAIT} (?:${ID}|${Q}) ${GONE}${UP_TO}$`, 'i'),
        build: (m, ctx) => [{
            op: 'waitFor',
            target: m[1] ? byId(m[1]) : { text: V(m[2]) },
            state: 'hidden',
            timeout: waitMs(ctx, m[3], m[4]),
        }],
    },
    {
        usage: 'I wait till page loads [up to 30 seconds]   (also: is loaded, wait for the page to load)',
        pattern: new RegExp(`${WAIT} (?:the )?page (?:loads|is loaded|to load)${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitLoad', state: 'load', timeout: waitMs(ctx, m[1], m[2]) }],
    },
    {
        usage: 'I wait till network is idle [up to 30 seconds]   (also: wait for the network to be idle)',
        pattern: new RegExp(`${WAIT} (?:the )?network (?:is |to be )?idle${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitLoad', state: 'networkidle', timeout: waitMs(ctx, m[1], m[2]) }],
    },
    {
        usage: 'I wait till url /regex/ [up to 30 seconds]',
        pattern: new RegExp(`${WAIT} url \\/(.+)\\/${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitUrl', regex: re(m[1]), timeout: waitMs(ctx, m[2], m[3]) }],
    },
    {
        usage: 'I wait till /regex/ appears [up to 30 seconds]   (text matched by regex, e.g. toasts whose wording varies by env)',
        pattern: new RegExp(`${WAIT} \\/(.+)\\/${SHOWN}${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'waitFor', target: { regex: re(m[1]) }, state: 'visible', timeout: waitMs(ctx, m[2], m[3]) }],
    },
    {
        usage: 'open the portal | I open the company portal | open portal link   (an app\'s root URL; switches app if named)',
        pattern: /^(?:i )?open (?:the )?(?:(\w+) )?portal(?: link| url| home(?: ?page)?)?$/i,
        build: (m, ctx) => {
            const app = m[1] ? m[1].toLowerCase() : ctx.app;
            ctx.state.page = null;
            return [...(m[1] ? [{ op: 'switchApp', app }] : []), { op: 'goto', app, path: '/' }];
        },
    },
    {
        usage: 'open /path   (relative to the current app\'s base URL)',
        pattern: /^open (\/\S*)$/i,
        build: (m, ctx) => [{ op: 'goto', app: ctx.app, path: m[1] }],
    },
    {
        usage: 'snapshot "page-name"   (records the page into knowledge/pages/ when run via npm run probe; no-op otherwise)',
        pattern: /^snapshot "([\w-]+)"$/i,
        build: (m, ctx) => [{ op: 'call', fn: 'snapshotPage', args: [PAGE, V(m[1]), V(ctx.app)] }],
    },
    // ---- steps by label / button text (resolved to ids from probed pages; see resolve.js) ----
    {
        usage: 'I enter "Abdul" in First name | I enter {email} into Email Address | I enter 2 in OTP field 1   (a field by its label; "field N" is box N of a split input; add "in the sidebar|header|modal|main" to narrow)',
        pattern: new RegExp(`^(?:i )?(?:enter|type|fill in|input) ${VALUE_OR_NUMBER} (?:in|into) (?:the )?${NAME}(?: field| box| input)?${REGION}$`, 'i'),
        build: (m, ctx) => enterValue(ctx, m[2], varOrText(m[1]), regionKey(m[3])),
    },
    {
        usage: 'I enter OTP "2024" | I fill Last name with "Khan"   (a field by its label, value last)',
        pattern: new RegExp(`^(?:i )?(?:enter|type|fill(?: in)?) (?:the )?${NAME} (?:with |as )?${VALUE}$`, 'i'),
        build: (m, ctx) => enterValue(ctx, m[1], varOrText(m[2])),
    },
    {
        usage: 'I click "Get OTP" | click Sign up | I click {orderNumber} | I click "Orders" in the sidebar   (a button, link or card by its text; a {var} or unknown name clicks the card with that number)',
        pattern: new RegExp(`^(?:i )?(?:click|press|tap)(?: on)? (?:the )?(?:"([^"]+)"|(\\{\\w+\\})|${NAME})(?: button| link| tab| card)?${REGION}$`, 'i'),
        build: (m, ctx) => {
            const name = m[1] || m[2] || m[3];
            return byName(ctx, 'clickable', name, (found) => [{ op: 'click', target: targetOf(found, name) }], ['probeClick', V(name)], regionKey(m[4]));
        },
    },
    {
        usage: 'I check Terms and conditions | tick "Remember me"   (a checkbox by its label)',
        pattern: new RegExp(`^(?:i )?(?:check|tick) (?:the )?(?:"([^"]+)"|${NAME})(?: checkbox| box)?${REGION}$`, 'i'),
        build: (m, ctx) => {
            const name = m[1] || m[2];
            return byName(ctx, 'checkbox', name, (found) => [{ op: 'check', target: targetOf(found) }], ['probeCheck', V(name)], regionKey(m[3]));
        },
    },
    {
        usage: 'I select "Riyadh" in City | choose "Monthly" from Plan   (a dropdown option by its label)',
        pattern: new RegExp(`^(?:i )?(?:select|choose) ${VALUE} (?:in|from) (?:the )?${NAME}(?: dropdown| list)?${REGION}$`, 'i'),
        build: (m, ctx) => byName(ctx, 'select', m[2], (found) => [{ op: 'select', target: targetOf(found), value: varOrText(m[1]) }],
            ['probeSelect', V(m[2]), varOrText(m[1])], regionKey(m[3])),
    },
    {
        usage: 'I upload "documents/file.pdf" [in Commercial document]   (the page\'s file input, or the one with that label)',
        pattern: new RegExp(`^(?:i )?upload "([^"]+)"(?: (?:in|into|as|for) (?:the )?${NAME})?$`, 'i'),
        build: (m, ctx) => {
            const file = V(m[1].startsWith('.') ? m[1] : `./${m[1]}`);
            return byName(ctx, 'file', m[2] || '', (found) => [{ op: 'upload', target: targetOf(found), file }],
                ['probeUpload', file, V(m[2] || '')]);
        },
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
        usage: 'I should see "text" [up to 30 seconds]',
        pattern: new RegExp(`^(?:i )?should see (?:the text )?${Q}${UP_TO}$`, 'i'),
        build: (m, ctx) => [{ op: 'expectVisible', target: { text: V(m[1]) }, timeout: waitMs(ctx, m[2], m[3]) }],
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
    autoSnapshot: `${PKG}/runtime/snapshot`,
    recordCreated: `${PKG}/runtime/ledger`,
    probeFill: `${PKG}/runtime/labels`,
    probeClick: `${PKG}/runtime/labels`,
    probeCheck: `${PKG}/runtime/labels`,
    probeSelect: `${PKG}/runtime/labels`,
    probeUpload: `${PKG}/runtime/labels`,
};

module.exports = {
    core: { name: 'core', phrasings: PHRASINGS },
    CORE_HELPERS,
    // for packs
    V, PAGE, re, byId, varOrText, Q, ID,
};
