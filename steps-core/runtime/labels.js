// Probe-time actions by what QA wrote ("First name", "Get OTP"), for pages the catalog does not know yet. The probe
// records each page (autoSnapshot) before acting on it, so the next `gen` can resolve the same names to ids.
// Generated specs never use these: they get the ids from the catalog.

const { autoSnapshot, noteName, visibleIds } = require('./snapshot');
const { loadConfig } = require('../config');
const { regionsFor, cssFor } = require('../regions');

const TIMEOUT = 60000;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = (text) => new RegExp(`^\\s*${esc(text.trim())}\\s*\\*?\\s*$`, 'i');
const loose = (text) => new RegExp(esc(text.trim()), 'i');
const slug = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

// Narrows a locator to a layout region ("in the sidebar"); no region leaves it alone. See regions.js.
const inRegion = (page, app, region) => {
    if (!region) return (loc) => loc;
    const css = cssFor(regionsFor(loadConfig(), app), region);
    return (loc) => loc.and(page.locator(css));
};

// The first candidate locator that matches anything, polling until the page shows one.
async function firstMatch(candidates, what, scope = (loc) => loc) {
    const end = Date.now() + TIMEOUT;
    for (;;) {
        for (const make of candidates) {
            const loc = scope(make());
            if (await loc.count()) return loc;
        }
        if (Date.now() > end) throw new Error(`probe: no ${what} on the page`);
        await new Promise((r) => setTimeout(r, 250));
    }
}

const fieldCandidates = (page, label) => [
    () => page.getByLabel(exact(label)).or(page.getByPlaceholder(exact(label))),
    () => page.getByLabel(loose(label)).or(page.getByPlaceholder(loose(label))),
    () => page.locator(`input[id*="${slug(label)}"], textarea[id*="${slug(label)}"], select[id*="${slug(label)}"]`),
];
const fieldLocator = (page, label, scope) => firstMatch(fieldCandidates(page, label), `field "${label}"`, scope);

// buttons and links first, then suggestion/menu/tab items (dropdown results, tabs); one role at a time, so a
// sidebar link "Orders" wins over a tab or option that also says "Orders"
const ROLES = ['button', 'link', 'option', 'menuitem', 'tab'];
const byRoles = (page, name) => ROLES.map((role) => () => page.getByRole(role, { name }));

const clickableLocator = (page, text, scope) => firstMatch([
    ...byRoles(page, exact(text)),
    ...byRoles(page, loose(text)),
    () => page.locator(`button[id*="${slug(text)}" i], a[id*="${slug(text)}" i]`),
    // anything else showing that text (cards and list items built from divs; the nearest id around it is recorded)
    () => page.getByText(exact(text)),
    () => page.getByText(loose(text)),
    // cards whose id carries the name, e.g. "TestOrder518" -> #orders-list-testorder518
    () => page.locator(`[id$="${slug(text)}" i]`),
    () => page.locator(`[id*="${slug(text)}" i]`),
], `button, link, card or text "${text}"`, scope);

// The id to record for a name: the element's own; if it has none or an auto-generated one (radix-:r1:, :r5:,
// headlessui-..., mui-...) the first stable id inside it (a dropdown option wrapping create-order-supplier-result-<id>);
// else the nearest stable ancestor within a few levels (the card around a text), never a page-level container.
const idOf = (loc) => loc.evaluate((el) => {
    const stable = (id) => id && !/:|^(radix|headlessui|mui|react-aria|rc-|downshift)/i.test(id);
    if (stable(el.id)) return el.id;
    const inner = [...el.querySelectorAll('[id]')].find((c) => stable(c.id));
    if (inner) return inner.id;
    for (let node = el.parentElement, depth = 1; node && depth < 4; node = node.parentElement, depth++) if (stable(node.id)) return node.id;
    return null;
});

// After a click, wait until the page stops changing (same visible ids twice in a row, up to 10s), so the next step
// looks at the page the click led to, not the one it is leaving (e.g. "Orders" then "Create Order").
async function settle(page) {
    const end = Date.now() + 10000;
    let last = '';
    let same = 0;
    while (Date.now() < end && same < 2) {
        await new Promise((r) => setTimeout(r, 300));
        const now = (await visibleIds(page).catch(() => [])).join(',');
        same = now === last ? same + 1 : 0;
        last = now;
    }
}

// A probe step must not hang on a disabled button (Playwright would wait for the whole test timeout).
const ENABLE_MS = 15000;
async function whenEnabled(loc, what) {
    const end = Date.now() + ENABLE_MS;
    while (await loc.isDisabled().catch(() => false)) {
        if (Date.now() > end) {
            throw new Error(`probe: ${what} stays disabled; a value entered before it is probably missing or not accepted `
                + '(e.g. below a minimum). Check the screenshot in test-results/.');
        }
        await new Promise((r) => setTimeout(r, 250));
    }
}
async function note(kind, name, loc) {
    noteName(kind, name, await idOf(loc).catch(() => null));
}

// region: layout region to look in ('' = anywhere); index: box number (1-based) of a segmented input ('0' = not given)
async function probeFill(page, app, label, value, region, index) {
    const loc = await fieldLocator(page, label, inRegion(page, app, region));
    await autoSnapshot(page, app, loc.first());
    await note('field', label, loc.first());
    const n = await loc.count();
    if (Number(index)) {
        if (Number(index) > n) throw new Error(`probe: "${label}" has ${n} box(es), there is no box ${index}`);
        await loc.nth(Number(index) - 1).pressSequentially(String(value));
    } else if (n > 1 && String(value).length === n) {
        // segmented input (OTP boxes): one character per box
        for (let i = 0; i < n; i++) await loc.nth(i).pressSequentially(String(value)[i]);
    } else {
        await loc.first().fill(String(value));
    }
}

async function probeClick(page, app, text, region) {
    const loc = (await clickableLocator(page, text, inRegion(page, app, region))).first();
    await autoSnapshot(page, app, loc);
    await note('clickable', text, loc);
    await whenEnabled(loc, `"${text}"`);
    await loc.click();
    await settle(page);
}

async function probeCheck(page, app, label, region) {
    const loc = (await firstMatch([
        () => page.getByLabel(exact(label)),
        () => page.getByLabel(loose(label)),
        () => page.getByRole('checkbox', { name: loose(label) }),
    ], `checkbox "${label}"`, inRegion(page, app, region))).first();
    await autoSnapshot(page, app, loc);
    await note('checkbox', label, loc);
    await loc.check();
}

// A custom dropdown (shadcn/Radix Select) is a button[role=combobox] whose title is a <label> next to it, not linked
// to it; also its aria-label or title. Found by that text, then opened to pick the option.
const comboCandidates = (page, label) => [
    () => page.getByRole('combobox', { name: exact(label) }),
    () => page.locator('label').filter({ hasText: exact(label) }).locator('xpath=..').locator('[role=combobox]'),
    () => page.getByRole('combobox', { name: loose(label) }),
    () => page.locator('label').filter({ hasText: loose(label) }).locator('xpath=..').locator('[role=combobox]'),
    () => page.locator(`[role=combobox][title*="${label.trim()}" i]`),
];

async function probeSelect(page, app, label, option, region) {
    const loc = (await firstMatch([...comboCandidates(page, label), ...fieldCandidates(page, label)],
        `dropdown "${label}"`, inRegion(page, app, region))).first();
    await autoSnapshot(page, app, loc);
    await note('select', label, loc);
    if (await loc.evaluate((el) => el.tagName === 'SELECT')) {
        await loc.selectOption({ label: option });
        return;
    }
    await whenEnabled(loc, `"${label}"`);
    await loc.click();
    const item = page.getByRole('option', { name: exact(option) }).first();
    await autoSnapshot(page, app, item);        // records the open dropdown's options
    await item.click();
    await settle(page);
}

async function probeUpload(page, app, file, label) {
    const loc = (await firstMatch([
        () => (label ? page.getByLabel(loose(label)).and(page.locator('input[type=file]')) : page.locator('input[type=file]')),
        () => page.locator('input[type=file]'),
    ], 'file input')).first();
    await autoSnapshot(page, app, loc);
    await note('file', label, loc);
    await loc.setInputFiles(file);
}

module.exports = { probeFill, probeClick, probeCheck, probeSelect, probeUpload };
