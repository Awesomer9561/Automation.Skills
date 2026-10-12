// Reads the knowledge written by `npm run probe`:
//   <knowledgeDir>/pages/<app>/<slug>.json   one record per app + path, shared by all steps files (see pages.js)
//   <knowledgeDir>/flows/<steps-name>.json   what one steps file's last probe did: pages visited in order, names resolved

const fs = require('fs');
const path = require('path');

const pagesDir = (config) => path.join(config.abs(config.knowledgeDir), 'pages');
const flowsDir = (config) => path.join(config.abs(config.knowledgeDir), 'flows');

function jsonFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = path.join(dir, d.name);
        return d.isDirectory() ? jsonFiles(p) : d.name.endsWith('.json') ? [p] : [];
    }).sort();
}

function loadCatalog(config) {
    return jsonFiles(pagesDir(config)).map((f) => {
        const page = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (!page.states) throw new Error(`${path.relative(config.root, f)} is in the old per-flow format; run: npx steps-migrate`);
        return page;
    });
}

// flow name -> { flow, visits: [{page, state}], names: [{page, state, kind, name, id}] }
function loadFlows(config) {
    const flows = {};
    for (const f of jsonFiles(flowsDir(config))) flows[path.basename(f, '.json')] = JSON.parse(fs.readFileSync(f, 'utf8'));
    return flows;
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

// Known if seen exactly, or if it matches a stored pattern (orders-order-card-*).
const isKnown = (id, ids) => ids.has(id)
    || [...ids.keys()].some((k) => k.endsWith('*') && id.startsWith(k.slice(0, -1)));

function describe(page) {
    const lines = [`${page.name}  (${page.path}, captured ${page.capturedAt})`];
    for (const s of page.states) lines.push(`  ${s.id}: ${(s.headings || []).join(' | ') || '(no headings)'}`);
    for (const e of page.elements) {
        const bits = [e.id ? `#${e.id}` : `${e.tag}[name=${e.name}]`, e.tag + (e.type ? `:${e.type}` : '')];
        if (e.region) bits.push(e.region);
        if (e.label) bits.push(`label "${e.label}"`);
        if (e.text) bits.push(`text "${e.text}"`);
        if (e.options) bits.push(`options ${e.options.length}`);
        if (e.role) bits.push(`role ${e.role}`);
        if (e.clickable) bits.push('clickable');
        if (e.readonly) bits.push('readonly');
        if (e.disabled) bits.push('disabled');
        if (!e.vis.length) bits.push('hidden');
        bits.push(`in ${e.in.join(',')}`);
        lines.push(`  ${bits.join('  ')}`);
    }
    return lines.join('\n');
}

module.exports = { pagesDir, flowsDir, loadCatalog, loadFlows, knownIds, isKnown, describe };
