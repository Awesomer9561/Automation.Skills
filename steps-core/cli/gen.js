#!/usr/bin/env node
// Generates a Playwright spec from a plain-text steps file.
//
//   npm run gen -- steps/my_flow.steps.txt [--out tests/my_flow.spec.js] [--force]
//   npm run gen -- steps/my_flow.steps.txt --report   # unmatched steps and errors as JSON, no file written
//   npm run gen -- --list-steps                        # the vocabulary (core + packs)
//   npm run gen -- --check                             # every generated spec still matches its steps file
//
// Steps the vocabulary does not know are written as a line that throws (so the spec fails instead of silently
// passing) and the command exits non-zero. Generated specs are build output: change the steps file and regenerate.

const fs = require('fs');
const path = require('path');
const { generate, loadConfig } = require('..');
const { buildRegistry } = require('../registry');
const { GENERATED_RE } = require('../emit-playwright');

function listSteps(config) {
    const registry = buildRegistry(config.packs);
    for (const [i, layer] of registry.layers.entries()) {
        console.log(`# ${layer.name}`);
        registry.phrasings.filter((p) => p.layer === i).forEach((p) => console.log(p.usage));
        console.log('');
    }
    console.log(`# apps: ${Object.keys(config.apps).join(', ')}   generators: ${Object.keys(registry.generators).join(', ')}`);
    console.log(`# variables created automatically when used: ${Object.keys(registry.autoVars).map((v) => `{${v}}`).join(', ') || 'none'}`);
    console.log('# variations: "# variant: <name>" blocks (shared steps above the first one), and/or "# examples:" with a');
    console.log('#   | input | assertion | table of whole steps (optional name column); each variant or row is its own test');
}

// Regenerates every spec carrying the "Generated from" header and reports any that differ from their source.
function check(config) {
    const testsDir = config.abs(config.testsDir);
    let failed = 0;
    let checked = 0;
    const files = fs.existsSync(testsDir) ? fs.readdirSync(testsDir) : [];
    for (const file of files.filter((f) => f.endsWith('.spec.js') && !f.startsWith('_probe_'))) {
        const spec = path.join(testsDir, file);
        const current = fs.readFileSync(spec, 'utf8').replace(/\r\n/g, '\n');   // git on Windows may check out CRLF
        const header = current.match(GENERATED_RE);
        if (!header) continue;
        checked++;
        const rel = path.relative(config.root, spec);
        const source = config.abs(header[1]);
        if (!fs.existsSync(source)) {
            console.error(`${rel}: source ${header[1]} no longer exists`);
            failed++;
            continue;
        }
        const { code, errors } = generate(source, config);
        if (errors.length) {
            console.error(`${rel}: ${header[1]} has errors:\n  ${errors.join('\n  ')}`);
            failed++;
        } else if (code !== current) {
            console.error(`${rel}: differs from ${header[1]} (edited by hand, or the steps/packs/catalog changed). Regenerate: npm run gen -- ${header[1]} --out ${rel} --force`);
            failed++;
        }
    }
    console.log(`${checked} generated spec(s) checked, ${failed} out of date.`);
    return failed ? 1 : 0;
}

function main(argv) {
    const args = argv.slice(2);
    const flag = (name) => args.includes(name);
    const valueOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
    const config = loadConfig();

    if (flag('--list-steps')) {
        listSteps(config);
        return 0;
    }
    if (flag('--check')) return check(config);

    const outFlag = valueOf('--out');
    const input = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
    if (!input) {
        console.error('Usage: npm run gen -- <file.steps.txt> [--out <spec>] [--force] [--report] | --list-steps | --check');
        return 2;
    }

    const { base, code, unmatched, errors, warnings } = generate(input, config);
    warnings.forEach((w) => console.error(`warning: ${w}`));

    if (flag('--report')) {
        console.log(JSON.stringify({ unmatched: unmatched.map((s) => s.text), errors, warnings }, null, 2));
        return unmatched.length || errors.length ? 1 : 0;
    }
    if (errors.length) {
        errors.forEach((e) => console.error(`error: ${e}`));
        return 1;
    }

    const out = outFlag || path.join(config.testsDir, `${base}.spec.js`);
    if (fs.existsSync(out) && !flag('--force')) {
        console.error(`${out} already exists; pass --force to overwrite or --out to choose another path.`);
        return 1;
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, code);
    console.log(`Wrote ${out}`);

    if (unmatched.length) {
        console.error(`\n${unmatched.length} unmatched step(s) written as failing placeholders:`);
        unmatched.forEach((s) => console.error(`  line ${s.line}: ${s.text}`));
        console.error('Run with --list-steps to see the vocabulary, or use the steps-to-spec skill to resolve them.');
        return 1;
    }
    return 0;
}

if (require.main === module) process.exit(main(process.argv));
