#!/usr/bin/env node
// One-off: converts the old per-flow recordings (knowledge/pages/<flow>-NN.json) into shared page records
// (pages/<app>/<slug>.json) plus a flow file per steps file (flows/<flow>.json). Old files are removed.
//   npx steps-migrate

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../config');
const { pagesDir, flowsDir } = require('../catalog');
const { mergeSnapshot, pageName } = require('../pages');

const config = loadConfig();
const dir = pagesDir(config);
const old = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ file: path.join(dir, f), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }))
    : [];
const legacy = old.filter((p) => !p.states);
if (!legacy.length) {
    console.log('Nothing to migrate.');
    process.exit(0);
}

const pages = new Map();     // page name -> record
const flows = new Map();     // flow -> { flow, visits, names }
for (const snap of legacy.sort((a, b) => (a.flow || '').localeCompare(b.flow || '') || (a.seq || 0) - (b.seq || 0))) {
    const key = pageName(snap.app, snap.path);
    const { page, state } = mergeSnapshot(pages.get(key) || null, snap, snap.capturedAt);
    pages.set(key, page);
    const flowName = snap.flow || snap.name.replace(/-\d+$/, '');
    const flow = flows.get(flowName) || { flow: flowName, visits: [], names: [] };
    const last = flow.visits[flow.visits.length - 1];
    if (!last || last.page !== page.name || last.state !== state.id) flow.visits.push({ page: page.name, state: state.id });
    for (const n of snap.names || []) flow.names.push({ page: page.name, state: state.id, kind: n.kind, name: n.name, id: n.id });
    flows.set(flowName, flow);
}

for (const [name, page] of pages) {
    const file = path.join(dir, `${name}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(page, null, 2) + '\n');
}
fs.mkdirSync(flowsDir(config), { recursive: true });
for (const [name, flow] of flows) fs.writeFileSync(path.join(flowsDir(config), `${name}.json`), JSON.stringify(flow, null, 2) + '\n');
for (const p of legacy) fs.rmSync(p.file, { force: true });
console.log(`Migrated ${legacy.length} recording(s) into ${pages.size} page(s) and ${flows.size} flow(s).`);
