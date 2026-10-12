// Resolves what QA wrote ("First name", "Get OTP") to element ids recorded by probes in <knowledgeDir>/pages.
//
// Pages are shared by all steps files (one per app + path, with wizard steps/dialogs as states). What is specific to a
// steps file is its flow (<knowledgeDir>/flows/<name>.json): the names its own probe resolved, in order, and the pages
// it visited. The resolver remembers the page and state the last step acted on (state.page, state.state): a name is
// looked up in the flow's noted names first (from where the previous step left off), then on the current page, then
// on the other pages, those this flow visited first. That is how "Email Address" on the sign-up form and on the
// basic-details page resolve to different ids in one file, and how a file that was never probed can still use pages
// other files recorded.

// Kinds of element a step can target, by tag/type.
const KINDS = {
    field: (e) => (e.tag === 'input' && !['button', 'submit', 'checkbox', 'radio', 'file', 'hidden'].includes(e.type)) || e.tag === 'textarea',
    clickable: (e) => e.tag === 'button' || e.tag === 'a' || (e.tag === 'input' && ['button', 'submit'].includes(e.type)) || e.clickable,
    checkbox: (e) => e.tag === 'input' && ['checkbox', 'radio'].includes(e.type),
    select: (e) => e.tag === 'select' || e.role === 'combobox',
    file: (e) => e.tag === 'input' && e.type === 'file',
};

const norm = (s) => (s || '').toLowerCase().replace(/[*:.]/g, ' ').replace(/\s+/g, ' ').trim();
const { visibleIn } = require('./pages');
const words = (s) => ` ${norm(s)} `;
const idWords = (id) => ` ${id.toLowerCase().replace(/[-_]+/g, ' ')} `;

// Elements of one page matching the name, best tier first: exact label/text, label/text containing it, id containing
// it (links have no recorded text, e.g. #login-sign-up-link for "Sign up"). `st`: the state to prefer (a page shows
// different elements as a wizard moves on); other states are used only when it has no match. `region`: only elements
// recorded in that region of the layout (sidebar, header, main, ...; see regions.js).
function match(page, kind, name, st, region) {
    const q = norm(name);
    const all = page.elements.filter((e) => e.id && !e.id.includes('*') && KINDS[kind](e) && (!region || e.region === region));
    const tiers = [
        (e) => norm(e.label || e.text) === q,
        (e) => q && words(e.label || e.text).includes(` ${q} `),
        (e) => q && idWords(e.id).includes(` ${q} `),
    ];
    for (const pool of st ? [all.filter((e) => e.in.includes(st)), all] : [all]) {
        for (const tier of tiers) {
            const hits = pool.filter(tier);
            if (!hits.length) continue;
            // prefer elements that were visible, except file inputs (usually hidden behind a button)
            const visible = kind === 'file' ? hits : hits.filter((e) => visibleIn(e, st));
            return (visible.length ? visible : hits).map((e) => e.id);
        }
    }
    return kind === 'file' && !q ? all.map((e) => e.id) : [];
}

// Several matches that differ only by a trailing number are one segmented input (OTP digit boxes).
function segmented(ids) {
    if (ids.length < 2) return null;
    const base = ids[0].replace(/-\d+$/, '');
    if (!ids.every((id) => /-\d+$/.test(id) && id.replace(/-\d+$/, '') === base)) return null;
    return [...ids].sort((a, b) => Number(a.match(/\d+$/)[0]) - Number(b.match(/\d+$/)[0]));
}

// A record in a card family (orders-list-<order number>): on the current page if it has exactly one family, else on
// the latest page this flow visited (or any page) with exactly one. The id is built from the name at run time,
// case-insensitively.
function card(state, pages, current, visited) {
    const one = (p) => p && p.cards && p.cards.length === 1;
    const rank = (p) => visited.lastIndexOf(p.name);
    const page = one(current) ? current : [...pages].sort((a, b) => rank(b) - rank(a)).find(one);
    if (!page) return null;
    state.page = page;
    state.state = null;
    return { cardPrefix: page.cards[0].prefix };
}

// flowData: this steps file's flow ({visits, names}), or undefined when it was never probed
function createResolver(catalog, { flowData }) {
    const visited = ((flowData && flowData.visits) || []).map((v) => v.page);
    const noted = (flowData && flowData.names) || [];
    // returns { id } | { ids } (segmented) | { error } | null (not in the catalog at all)
    return function resolve(state, app, kind, name, region) {
        const pages = catalog.filter((p) => !p.app || p.app === app);
        const current = state.page && pages.includes(state.page) ? state.page : null;
        const pick = (page, ids, st) => {
            state.page = page;
            state.state = st || null;
            const seg = kind === 'field' ? segmented(ids) : null;
            if (seg) return { ids: seg };
            if (ids.length > 1) {
                // the same text in different parts of the layout: tell QA how to narrow it
                const regions = [...new Set(ids.map((id) => (page.elements.find((e) => e.id === id) || {}).region).filter(Boolean))];
                const hint = regions.length > 1 ? `; add ${regions.map((r) => `"in the ${r}"`).join(' or ')}` : '';
                return { error: `"${name}" matches ${ids.length} elements on page ${page.name}: ${ids.map((i) => `#${i}`).join(', ')}${hint}` };
            }
            if (kind === 'select') {
                const el = page.elements.find((e) => e.id === ids[0]) || {};
                if (el.role === 'combobox') return { id: ids[0], combobox: true };
            }
            // an id recorded as a pattern (per-record, e.g. create-order-supplier-result-*) is matched by its prefix
            return ids[0].includes('*') ? { idPrefix: ids[0].split('*')[0] } : { id: ids[0] };
        };
        // This file's own probe recorded which element each name hit, in order: follow that first, from where the
        // previous step left off (the same name can mean different elements later, e.g. "Sign up" twice).
        const q = norm(name);
        const hit = (n) => n.kind === kind && norm(n.name) === q && pages.some((p) => p.name === n.page);
        // (the probe did not record which region a name was in: a step that names one is looked up in the pages)
        let at = region ? -1 : noted.findIndex((n, i) => i >= (state.noteAt || 0) && hit(n));
        if (at < 0 && !region) at = noted.findIndex(hit);
        if (at >= 0) {
            state.noteAt = at + 1;
            const { id, state: st } = noted[at];
            const page = pages.find((p) => p.name === noted[at].page);
            // the probe noted the first box of a segmented input (OTP digits): all its boxes are the field
            const group = kind === 'field' ? segmented(match(page, kind, name, st)) : null;
            return pick(page, group && group.includes(id) ? group : [id], st);
        }
        if (current) {
            const here = match(current, kind, name, state.state, region);
            if (here.length) return pick(current, here, state.state);
        }
        const found = pages.map((p) => ({ p, ids: match(p, kind, name, null, region) })).filter((c) => c.ids.length);
        // only a {var} or a name with digits (a record number) may be a card; anything else stays "not recorded"
        if (!found.length) return kind === 'clickable' && /\{\w+\}|\d/.test(name) ? card(state, pages, current, visited) : null;
        // rank: pages this steps file's probe visited, those after the current page first
        const currentAt = current ? visited.lastIndexOf(current.name) : -1;
        const rank = ({ p }) => {
            const i = visited.indexOf(p.name);
            const later = visited.indexOf(p.name, currentAt + 1);
            return [i >= 0 ? 0 : 1, later >= 0 ? 0 : 1, later >= 0 ? later : i >= 0 ? i : Infinity];
        };
        const cmp = (a, b) => { const x = rank(a); const y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
        found.sort(cmp);
        const [best, next] = found;
        if (next && cmp(best, next) === 0 && best.ids.join() !== next.ids.join()) {
            return { error: `"${name}" is on several pages (${found.filter((f) => cmp(best, f) === 0).map((f) => f.p.name).join(', ')}); probe this steps file so its pages are recorded in order` };
        }
        return pick(best.p, best.ids);
    };
}

module.exports = { createResolver, KINDS };
