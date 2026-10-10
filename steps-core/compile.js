// Steps -> IR. Matches each line to a phrasing, builds its ops, checks variables, apps and helper mappings,
// and works out imports and the test timeout. No code is produced here; see emit-playwright.js.
//
// IR: { title, source, multi, timeoutMs, preamble: op[], steps: [{ src: { line, text }, app, kind, ops }],
//       imports: [{ module (absolute path, or a package specifier for core runtime helpers), names }] }
// kind: 'action' (wrapped in test.step), 'declare' (setVar only), 'switchApp', 'unmatched'.

const { buildRegistry } = require('./registry');
const { loadCatalog, knownIds, isKnown } = require('./catalog');
const { CORE_HELPERS } = require('./intents');

const VAR_RE = /\{(\w+)\}/g;

// Every { v } value in an op, however deeply nested (targets, call args, record keys).
function valuesOf(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (typeof node.v === 'string') out.push(node.v);
    else Object.values(node).forEach((child) => valuesOf(child, out));
    return out;
}

function helpersOf(op) {
    if (op.op === 'call') return [op.fn];
    if (op.op === 'setVar' && op.gen.fn) return [op.gen.fn];
    if (op.op === 'record') return ['recordCreated'];
    return [];
}

function compile({ title, steps, source }, config) {
    const registry = buildRegistry(config.packs);
    const catalog = loadCatalog(config);
    const ids = knownIds(catalog);
    const errors = [];
    const warnings = [];
    const unmatched = [];
    const declared = new Set();
    const preamble = [];
    const out = [];
    let budgetMs = 0;
    let app = config.defaultApp;

    const useVars = (op, line) => {
        for (const value of valuesOf(op)) {
            for (const [, name] of value.matchAll(VAR_RE)) {
                if (declared.has(name)) continue;
                if (registry.autoVars[name]) {
                    declared.add(name);
                    preamble.push({ op: 'setVar', name, gen: registry.autoVars[name] });
                } else {
                    errors.push(`line ${line}: variable {${name}} is used before "set {${name}} to ..."`);
                }
            }
        }
    };

    for (const step of steps) {
        const src = { line: step.line, text: step.text };
        const found = registry.match(step.text);
        if (!found) {
            unmatched.push(step);
            out.push({ src, app, kind: 'unmatched', ops: [] });
            continue;
        }
        if (found.ambiguous) {
            errors.push(`line ${step.line}: "${step.text}" matches more than one step: ${found.ambiguous.map((p) => `${p.usage} [${p.pack}]`).join(' / ')}`);
            continue;
        }
        const ctx = {
            app,
            addWait: (ms) => { budgetMs += ms; },
            generator: (name) => registry.generators[name],
            error: (msg) => errors.push(`line ${step.line}: ${msg}`),
        };
        const ops = found.phrasing.build(found.m, ctx);

        const switchTo = ops.find((op) => op.op === 'switchApp');
        if (switchTo) {
            if (!config.apps[switchTo.app]) errors.push(`line ${step.line}: unknown app "${switchTo.app}" (apps: ${Object.keys(config.apps).join(', ')})`);
            app = switchTo.app;
            out.push({ src, app, kind: 'switchApp', ops });
            continue;
        }
        for (const op of ops) {
            if (op.op === 'goto' && !(config.apps[op.app] && config.apps[op.app].urlEnv)) {
                errors.push(`line ${step.line}: app "${op.app}" has no urlEnv in steps.config.js (apps)`);
            }
            useVars(op, step.line);
            if (op.op !== 'setVar') continue;
            if (declared.has(op.name)) errors.push(`line ${step.line}: variable {${op.name}} is set twice`);
            declared.add(op.name);
        }
        // Once pages have been probed, flag ids the catalog has never seen (typos, or a page not probed yet).
        if (catalog.length) {
            for (const [id] of step.text.matchAll(/#[\w-]+/g)) {
                if (!isKnown(id.slice(1), ids)) warnings.push(`line ${step.line}: ${id} is not in ${config.knowledgeDir}/pages (probe that page first)`);
            }
        }
        out.push({ src, app, kind: ops.every((op) => op.op === 'setVar') ? 'declare' : 'action', ops });
    }

    const apps = new Set(out.filter((s) => s.kind === 'switchApp').map((s) => s.app));
    const multi = apps.size > 1;
    if (multi) {
        const first = out.findIndex((s) => s.kind === 'switchApp');
        out.slice(0, first).forEach((s) => errors.push(
            `line ${s.src.line}: add a "portal ${Object.keys(config.apps).join('|')}" step before "${s.src.text}"`));
    }

    // Imports, grouped by module in first-use order.
    const modules = new Map();
    for (const op of [...preamble, ...out.flatMap((s) => s.ops)]) {
        for (const name of helpersOf(op)) {
            const mod = CORE_HELPERS[name] || (config.helpers[name] && config.abs(config.helpers[name]));
            if (!mod) {
                const msg = `helper "${name}" is not mapped in steps.config.js (helpers)`;
                if (!errors.includes(msg)) errors.push(msg);
                continue;
            }
            if (!modules.has(mod)) modules.set(mod, []);
            if (!modules.get(mod).includes(name)) modules.get(mod).push(name);
        }
    }

    const timeoutMs = multi || budgetMs ? (multi ? config.timeouts.multiApp : config.timeouts.test) + budgetMs : null;
    const ir = {
        title,
        source,
        multi,
        timeoutMs,
        preamble,
        steps: out,
        imports: [...modules].map(([module, names]) => ({ module, names })),
    };
    return { ir, unmatched, errors, warnings };
}

module.exports = { compile };
