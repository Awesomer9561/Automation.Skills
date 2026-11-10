// Page regions: the parts of a portal's layout an element can sit in. A probe tags every element with its region, and
// steps can narrow a name to one ("I click "Orders" in the sidebar") when the same text appears in several.
//
// A region is a CSS selector. `main` has none: it is whatever is not in another region. Precedence is the order of
// the map (first match wins, so a modal inside the main area is "modal"). Selectors come from, later wins: the
// defaults here, each pack's `regions`, steps.config.js `regions`, then `apps.<app>.regions` (a portal whose
// layout differs). A selector of `null` switches a region off for that portal.

const DEFAULT_REGIONS = {
    modal: '[role=dialog], [role=alertdialog]',
    sidebar: 'aside',
    header: 'header, [role=banner]',
};

// What QA may write after "in the", per region. Longest first when matching (see wordsPattern).
const ALIASES = {
    main: ['main', 'main page', 'main content', 'main area', 'content', 'page content'],
    sidebar: ['sidebar', 'side bar', 'sidenav', 'side nav', 'side menu', 'left menu'],
    header: ['header', 'app header', 'page header', 'top bar', 'topbar', 'top nav'],
    modal: ['modal', 'dialog', 'popup', 'pop-up', 'popup dialog'],
    toast: ['toast', 'toast message', 'notification', 'snackbar', 'error toast', 'success toast'],
};

const MAIN = 'main';

// "top-bar", "Top bar" and "topbar" are the same word
const squash = (w) => w.toLowerCase().replace(/[-\s]+/g, '');
const regionOf = (word) => Object.keys(ALIASES).find((k) => ALIASES[k].some((a) => squash(a) === squash(word)));

// Regex source matching any region word (one capture group), e.g. for `in the (sidebar|app header|...)`.
const wordsPattern = () => {
    const words = Object.values(ALIASES).flat().sort((a, b) => b.length - a.length);
    return `(${words.map((w) => w.replace(/[- ]/g, '[- ]?')).join('|')})`;
};

// Region name -> selector for one app, from the config (see the top of this file). `main` is not included.
function regionsFor(config, app) {
    const layers = [DEFAULT_REGIONS, ...(config.packs || []).map((p) => p.regions), config.regions, app && config.apps[app] && config.apps[app].regions];
    const merged = Object.assign({}, ...layers.filter(Boolean));
    return Object.fromEntries(Object.entries(merged).filter(([, sel]) => sel));
}

// CSS matching an element in the region or inside it. `main` is everything outside the other regions.
function cssFor(regions, name) {
    const inside = (sel) => `:is(${sel}) *, :is(${sel})`;
    if (name !== MAIN) {
        if (!regions[name]) throw new Error(`region "${name}" is not defined for this app (regions: ${[MAIN, ...Object.keys(regions)].join(', ')})`);
        return inside(regions[name]);
    }
    const others = Object.values(regions);
    return others.length ? `:not(${others.map(inside).join(', ')})` : '*';
}

module.exports = { DEFAULT_REGIONS, ALIASES, MAIN, regionOf, wordsPattern, regionsFor, cssFor };
