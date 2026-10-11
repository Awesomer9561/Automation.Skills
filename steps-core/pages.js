// Page records: one file per app + path in <knowledgeDir>/pages/<app>/<slug>.json, shared by every steps file and
// updated in place by each probe. Pure functions (no I/O) so they can be tested and reused by the migration.
//
// A page is a route. Wizard steps, tabs and dialogs shown at that route are its `states` (s1, s2, ...); every element
// remembers the states it was in (`in`) and the ones it was visible in (`vis`). A new snapshot joins the state it
// mostly overlaps (so a re-probe updates it) or becomes a new one.

const SAME_STATE = 0.8;   // share of ids (intersection / union) above which a snapshot is the same state

// an id segment (normalized to *) reads as "details": /orders/* -> orders-details
const slugOf = (p) => (!p || p === '/' ? 'index' : p.replace(/^\/|\/$/g, '').replace(/\*/g, 'details').replace(/[^\w-]+/g, '-'));
const pageName = (app, p) => `${app || '_'}/${slugOf(p)}`;
const elKey = (e) => e.id || `${e.tag}:${e.name}:${e.type}`;

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const add = (list, v) => (list.includes(v) ? list : [...list, v]);
const drop = (list, v) => list.filter((x) => x !== v);

function bestState(page, snapIds) {
    let best = null;
    let bestScore = 0;
    for (const s of page.states) {
        const ids = new Set(page.elements.filter((e) => e.id && e.in.includes(s.id)).map((e) => e.id));
        const inter = [...snapIds].filter((id) => ids.has(id)).length;
        const union = ids.size + snapIds.size - inter;
        const score = union ? inter / union : 1;
        if (score > bestScore) { best = s; bestScore = score; }
    }
    return best && bestScore >= SAME_STATE ? best : null;
}

// snap: { app, path, headings, cards, elements: [{..., visible}] } as read from the live page (ids already normalized).
// existing: the page record or null. Returns { page, state, isNewPage, isNewState, changed }.
function mergeSnapshot(existing, snap, today = new Date().toISOString().slice(0, 10)) {
    const before = existing ? JSON.stringify({ ...existing, capturedAt: undefined }) : null;
    const page = existing ? JSON.parse(JSON.stringify(existing))
        : { name: pageName(snap.app, snap.path), app: snap.app, path: snap.path, states: [], elements: [] };

    const snapIds = new Set(snap.elements.filter((e) => e.id).map((e) => e.id));
    let state = bestState(page, snapIds);
    const isNewState = !state;
    if (!state) {
        const n = Math.max(0, ...page.states.map((s) => Number(s.id.slice(1)))) + 1;
        state = { id: `s${n}` };
        page.states.push(state);
    }
    state.headings = snap.headings;

    const byKey = new Map(page.elements.map((e) => [elKey(e), e]));
    for (const { visible, ...attrs } of snap.elements) {
        const prev = byKey.get(elKey(attrs));
        const next = { ...clean(attrs), in: add(prev ? prev.in : [], state.id), vis: prev ? prev.vis : [] };
        next.vis = visible ? add(next.vis, state.id) : drop(next.vis, state.id);
        if (prev) page.elements[page.elements.indexOf(prev)] = next;
        else page.elements.push(next);
    }

    if (snap.cards && snap.cards.length) {
        const cards = new Map((page.cards || []).map((c) => [c.prefix, c]));
        for (const c of snap.cards) cards.set(c.prefix, c);
        page.cards = [...cards.values()];
    }

    const changed = JSON.stringify({ ...page, capturedAt: undefined }) !== before;
    if (changed || !page.capturedAt) page.capturedAt = today;
    return { page, state, isNewPage: !existing, isNewState, changed };
}

// Whether an element was visible in the given state (any state when none is given).
const visibleIn = (e, state) => (state ? e.vis.includes(state) : e.vis.length > 0);

module.exports = { mergeSnapshot, pageName, slugOf, visibleIn, SAME_STATE };
