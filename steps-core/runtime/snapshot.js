const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../config');
const { pagesDir } = require('../catalog');

const NAME_RE = /^[\w-]+$/;

// Ids with uuids or long digit runs are per-record (e.g. orders-order-card-<uuid>); store them as a pattern.
const normalize = (s) => (s || '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '*')
    .replace(/\d{4,}/g, '*');

// Records the interactive elements of the current page into <knowledgeDir>/pages/<name>.json.
// Does nothing unless PROBE=1 (set by `npm run probe`), so snapshot steps are harmless in normal runs.
// Never records input values: the data on these pages is real-looking and may be personal.
async function snapshotPage(page, name) {
    if (!process.env.PROBE) return;
    if (!NAME_RE.test(name)) throw new Error(`snapshot name must match ${NAME_RE}: ${name}`);
    await page.waitForLoadState('load');

    const data = await page.evaluate(() => {
        const labelOf = (el) => {
            const aria = el.getAttribute('aria-label');
            if (aria) return aria.trim();
            if (el.labels && el.labels[0]) return el.labels[0].innerText.trim();
            const scope = el.closest('div');
            const near = scope && scope.querySelector('label');
            return (near && near.innerText.trim()) || el.getAttribute('placeholder') || undefined;
        };
        const seen = new Set();
        const elements = [];
        for (const el of document.querySelectorAll('[id], input, textarea, select, button, a[href]')) {
            if (!(el instanceof HTMLElement) || el.id === 'root') continue;
            const key = el.id || `${el.tagName}:${el.getAttribute('name')}:${el.getAttribute('type')}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const tag = el.tagName.toLowerCase();
            const isField = ['input', 'textarea', 'select'].includes(tag);
            elements.push({
                id: el.id || undefined,
                tag,
                type: el.getAttribute('type') || undefined,
                name: el.getAttribute('name') || undefined,
                label: isField ? labelOf(el) : undefined,
                // visible text only for buttons and sidebar links; other links show user names and other data
                text: tag === 'button' || el.id.startsWith('sidenav-') ? el.innerText.trim().slice(0, 40) || undefined : undefined,
                options: tag === 'select' ? [...el.options].slice(0, 30).map((o) => o.text.trim()) : undefined,
                readonly: el.readOnly || undefined,
                disabled: el.disabled || undefined,
                visible: el.getClientRects().length > 0,
            });
        }
        const headings = [...document.querySelectorAll('h1, h2, h3')].map((h) => h.innerText.trim()).filter(Boolean);
        return { path: location.pathname, headings, elements };
    });

    const out = {
        name,
        path: normalize(data.path),
        capturedAt: new Date().toISOString().slice(0, 10),
        headings: data.headings,
        elements: data.elements.map((e) => ({ ...e, id: e.id && normalize(e.id) })),
    };
    const dir = pagesDir(loadConfig());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(out, null, 2) + '\n');
    console.log(`Snapshot "${name}": ${out.elements.length} elements at ${out.path}`);
}

module.exports = { snapshotPage };
