// IR -> Playwright spec source. The only module that knows Playwright; another emitter (e.g. playwright-bdd
// feature files + generic step definitions) can consume the same IR.

const path = require('path');

const VAR_RE = /\{(\w+)\}/g;

const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const escapeTemplate = (s) => s.replace(/[`\\]|\$\{/g, (c) => `\\${c}`);

// A value as a JS expression: { env } reads an env var; { v } is a plain string, bare variable, or template
// literal with ${var}s.
function str(value) {
    if (value.env) return `process.env.${value.env} || missingEnv('${value.env}')`;
    const { v: text } = value;
    const vars = [...text.matchAll(VAR_RE)].map((m) => m[1]);
    if (!vars.length) return quote(text);
    if (text === `{${vars[0]}}`) return vars[0];
    return '`' + escapeTemplate(text).replace(VAR_RE, '${$1}') + '`';
}

const regex = (r) => `/${r.source}/${r.flags}`;

function locator(t) {
    if (t.id) return `locator('#${t.id}')`;
    if (t.idPrefix) return `locator('[id^="${t.idPrefix}"]').first()`;
    if (t.idValue) return `locator(${str({ v: `[id="${t.idValue.v}"${t.ignoreCase ? ' i' : ''}]` })}).first()`;
    if (t.text && t.css) return `locator(${quote(t.css)}).getByText(${str(t.text)}).first()`;
    if (t.text) return `getByText(${str(t.text)}).first()`;
    if (t.regex) return `getByText(${regex(t.regex)}).first()`;
    throw new Error(`unknown target ${JSON.stringify(t)}`);
}

function arg(a, page) {
    if (a === '$page') return page;
    if (a.obj) return `{ ${Object.entries(a.obj).map(([k, v]) => `${k}: ${str(v)}`).join(', ')} }`;
    return str(a);
}

function genExpr(gen) {
    if (gen.fn) return `${gen.fn}()`;
    if (gen.env) return `process.env.${gen.env} || missingEnv('${gen.env}')`;
    if (gen.letters) {
        const lower = (n) => `Array.from({ length: ${n} }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')`;
        return gen.capitalize
            ? `String.fromCharCode(65 + Math.floor(Math.random() * 26)) + ${lower(gen.letters - 1)}`
            : lower(gen.letters);
    }
    const digits = `\${Date.now().toString().slice(-${gen.digits})}`;
    return '`' + escapeTemplate(gen.unique).replace('{unique}', digits) + '`';
}

const timeoutOpt = (t, lead = '') => (t ? `${lead}{ timeout: ${t} }` : '');

function opLines(op, page, apps) {
    const at = (t) => `${page}.${locator(t)}`;
    switch (op.op) {
        case 'click': return [`await ${at(op.target)}.click();`];
        case 'check': return [`await ${at(op.target)}.check();`];
        case 'select': return [`await ${at(op.target)}.selectOption({ label: ${str(op.value)} });`];
        case 'pickOption': return [`await ${at(op.target)}.click();`, `await ${page}.getByRole('option', { name: ${str(op.value)}, exact: true }).click();`];
        case 'fill': return [`await ${at(op.target)}.fill(${str(op.value)});`];
        case 'type': return [`await ${at(op.target)}.pressSequentially(${str(op.value)});`];
        case 'press': return [`await ${at(op.target)}.press(${quote(op.key)});`];
        case 'upload': return [`await ${at(op.target)}.setInputFiles(${str(op.file)});`];
        case 'waitFor': return [`await ${at(op.target)}.waitFor({ state: '${op.state}', timeout: ${op.timeout} });`];
        case 'waitLoad': return [`await ${page}.waitForLoadState('${op.state}', { timeout: ${op.timeout} });`];
        case 'waitUrl': return [`await ${page}.waitForURL(${regex(op.regex)}, { timeout: ${op.timeout} });`];
        case 'sleep': return [`await ${page}.waitForTimeout(${op.ms});`];
        case 'reload': return [`await ${page}.reload({ waitUntil: 'domcontentloaded' });`];
        case 'expectVisible': return [`await expect(${at(op.target)}).toBeVisible(${timeoutOpt(op.timeout)});`];
        case 'expectText': return [`await expect(${at(op.target)}).toContainText(${str(op.value)}${timeoutOpt(op.timeout, ', ')});`];
        case 'expectHidden': return [`await expect(${at(op.target)}).toHaveCount(0${timeoutOpt(op.timeout, ', ')});`];
        case 'expectUrl': return [`await expect(${page}).toHaveURL(${regex(op.regex)});`];
        case 'goto': return [`await ${page}.goto(\`\${${apps[op.app].urlEnv}}${escapeTemplate(op.path)}\`, { waitUntil: 'domcontentloaded' });`];
        case 'setVar': return [`const ${op.name} = ${genExpr(op.gen)};`];
        case 'record': return [`recordCreated(${quote(op.type)}, ${arg({ obj: op.key }, page)});`];
        case 'call': {
            const args = op.args.map((a) => arg(a, page)).join(', ');
            if (!op.construct) return [`await ${op.fn}(${args});`];
            return [`await new ${op.fn}(${op.construct.map((a) => arg(a, page)).join(', ')}).${op.method}(${args});`];
        }
        default: throw new Error(`unknown op ${op.op}`);
    }
}

function importPath(module, testsDir) {
    if (!path.isAbsolute(module)) return module;   // package specifier (core runtime)
    const rel = path.relative(testsDir, module).replace(/\\/g, '/').replace(/\.js$/, '');
    return rel.startsWith('.') ? rel : `./${rel}`;
}

// opts: { testsDir (absolute), apps (from config) }
function emit(ir, { testsDir, apps }) {
    const body = [];
    const used = {};                // JS identifier -> count, to keep context/page names unique
    const unique = (base) => {
        used[base] = (used[base] || 0) + 1;
        return used[base] === 1 ? base : `${base}${used[base]}`;
    };
    let page = 'page';
    let ctxVar = null;
    let currentApp = null;

    for (const step of ir.steps) {
        if (step.kind === 'switchApp') {
            if (!ir.multi || step.app === currentApp) continue;
            currentApp = step.app;
            if (ctxVar) body.push(`await ${ctxVar}.close();`, '');
            ctxVar = unique(`${step.app}Ctx`);
            page = unique(`${step.app}Page`);
            body.push(
                `// --- ${step.app[0].toUpperCase() + step.app.slice(1)} portal ---`,
                `const ${ctxVar} = await browser.newContext();`,
                `const ${page} = await ${ctxVar}.newPage();`
            );
        } else if (step.kind === 'unmatched') {
            body.push(
                `// TODO(unmatched step): ${step.src.text}`,
                `throw new Error(${quote(`Unmatched step: ${step.src.text}`)});`
            );
        } else if (step.kind === 'declare') {
            // top level, so later steps can use the variable
            body.push(`// ${step.src.text}`, ...step.ops.flatMap((op) => opLines(op, page, apps)));
        } else {
            // variables a step sets are declared before it, at test level, so later steps can use them
            const vars = step.ops.filter((op) => op.op === 'setVar');
            body.push(
                ...vars.flatMap((op) => opLines(op, page, apps)),
                `await test.step(${quote(step.src.text)}, async () => {`,
                ...step.ops.filter((op) => op.op !== 'setVar').flatMap((op) => opLines(op, page, apps)).map((l) => `    ${l}`),
                '});'
            );
        }
    }
    if (ir.multi && ctxVar) body.push('', `await ${ctxVar}.close();`);

    const lines = [
        "const { test, expect } = require('@playwright/test');",
        ...ir.imports.map(({ module, names }) => `const { ${names.join(', ')} } = require('${importPath(module, testsDir)}');`),
        "require('dotenv').config();",
        ...(usesEnv(ir, apps) ? ["const missingEnv = (name) => { throw new Error(`${name} is not set (see .env)`); };"] : []),
        ...urlVars(ir, apps).map((name) => `const ${name} = process.env.${name} || missingEnv('${name}');`),
        '',
        `// ${ir.title}`,
        `// Generated from ${ir.source} by \`npm run gen\`. Do not edit: change the steps file and regenerate.`,
        `test(${quote(ir.title)}, async (${ir.multi ? '{ browser }' : '{ page }'}) => {`,
        ...(ir.timeoutMs ? [`    test.setTimeout(${ir.timeoutMs});`] : []),
        ...ir.preamble.flatMap((op) => opLines(op, page, apps)).map((l) => `    ${l}`),
        ...body.map((l) => (l ? `    ${l}` : '')),
        '});',
        '',
    ];
    return lines.join('\n');
}

const allOps = (ir) => [...ir.preamble, ...ir.steps.flatMap((s) => s.ops)];
// env variables holding the root URL of each app the test opens, in first-use order
const urlVars = (ir, apps) => [...new Set(allOps(ir).filter((op) => op.op === 'goto' && apps[op.app]).map((op) => apps[op.app].urlEnv))];
// any { env } value or env-backed variable, however deeply nested in an op
const hasEnv = (node) => !!node && typeof node === 'object' && (typeof node.env === 'string' || Object.values(node).some(hasEnv));
const usesEnv = (ir, apps) => urlVars(ir, apps).length > 0 || allOps(ir).some(hasEnv);

const GENERATED_RE = /^\/\/ Generated from (\S+) by `npm run gen`/m;

module.exports = { emit, GENERATED_RE };
