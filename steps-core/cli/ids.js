#!/usr/bin/env node
// Lists the page catalog written by `npm run probe`.
//   npm run gen:ids [-- filter]     known pages and their elements (filter: page name, path or id substring)

const { loadConfig } = require('../config');
const { loadCatalog, describe } = require('../catalog');

const filter = (process.argv[2] || '').toLowerCase();
const catalog = loadCatalog(loadConfig());
const pages = catalog.filter((p) => !filter || p.name.toLowerCase().includes(filter) || p.path.toLowerCase().includes(filter)
    || p.elements.some((e) => (e.id || '').toLowerCase().includes(filter)));
if (!pages.length) {
    console.log(catalog.length ? `No page or id matches "${filter}".` : 'Catalog is empty. Probe a page: npm run probe -- steps/<name>.txt');
} else {
    console.log(pages.map(describe).join('\n\n'));
}
