// Reads the page catalog in <knowledgeDir>/pages/ (written by `npm run probe`).

const fs = require('fs');
const path = require('path');

const pagesDir = (config) => path.join(config.abs(config.knowledgeDir), 'pages');

function loadCatalog(config) {
    const dir = pagesDir(config);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

// id -> names of the pages it was seen on. Ids stored as patterns (orders-order-card-*) match by prefix.
function knownIds(catalog) {
    const ids = new Map();
    for (const page of catalog) {
        for (const el of page.elements) {
            if (!el.id) continue;
            ids.set(el.id, [...(ids.get(el.id) || []), page.name]);
        }
    }
    return ids;
}

// Known if seen exactly, if it matches a stored pattern (orders-order-card-*), or if it is the prefix of a
// numbered family (register-otp for register-otp-0..3, used by the `enter otp` step).
const isKnown = (id, ids) => ids.has(id)
    || [...ids.keys()].some((k) => (k.endsWith('*') && id.startsWith(k.slice(0, -1))) || k.startsWith(`${id}-`));

function describe(page) {
    const lines = [`${page.name}  (${page.path}, captured ${page.capturedAt})`];
    if (page.headings.length) lines.push(`  headings: ${page.headings.join(' | ')}`);
    for (const e of page.elements) {
        const bits = [e.id ? `#${e.id}` : `${e.tag}[name=${e.name}]`, e.tag + (e.type ? `:${e.type}` : '')];
        if (e.label) bits.push(`label "${e.label}"`);
        if (e.text) bits.push(`text "${e.text}"`);
        if (e.options) bits.push(`options ${e.options.length}`);
        if (e.readonly) bits.push('readonly');
        if (e.disabled) bits.push('disabled');
        if (!e.visible) bits.push('hidden');
        lines.push(`  ${bits.join('  ')}`);
    }
    return lines.join('\n');
}

module.exports = { pagesDir, loadCatalog, knownIds, isKnown, describe };
