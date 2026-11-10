// A parsed steps file (parse.js) -> the tests it declares, each with its own steps and probe flow name.
//
//   no variants, no table : one test, the file's title, flow <base> (exactly as before variations existed)
//   # variant: blocks     : one test per variant: shared steps + the variant's steps
//   # examples: rows      : one test per row: the block's steps + the row's input steps + its assertion steps
//                           (a table inside a variant makes one test per row of that variant)
//
// grouped (any variant or table) -> the spec wraps its tests in test.describe(<file title>), and each test records its
// own flow, <base>--<slug of the test title>, since each one visits pages in its own order.

const flowName = (s) => s.replace(/[^\w-]+/g, '-');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'test';

function expandScenarios(parsed, base) {
    const errors = [];
    const [shared, ...variants] = parsed.blocks;
    const grouped = variants.length > 0 || shared.rows.length > 0;
    if (!grouped) return { grouped, errors, scenarios: [{ title: parsed.title, flow: flowName(base), steps: shared.steps, line: 0 }] };

    const rowSteps = (r) => [...r.input, ...r.assertion].map((text) => ({ text, line: r.line }));
    const rowTitle = (r) => r.name || r.input[0] || r.assertion[0];
    const tests = [];
    if (variants.length && shared.rows.length) {
        errors.push(`line ${shared.rows[0].line}: an examples table above the first "# variant:" belongs to no variant; move it into one`);
    }
    if (!variants.length) {
        shared.rows.forEach((r) => tests.push({ title: rowTitle(r), steps: [...shared.steps, ...rowSteps(r)], line: r.line }));
    }
    for (const v of variants) {
        const steps = [...shared.steps, ...v.steps];
        if (!v.rows.length) tests.push({ title: v.name, steps, line: v.line });
        v.rows.forEach((r) => tests.push({ title: `${v.name} — ${rowTitle(r)}`, steps: [...steps, ...rowSteps(r)], line: r.line }));
    }

    const seen = new Map();
    for (const t of tests) {
        if (seen.has(t.title)) errors.push(`line ${t.line}: two tests are titled "${t.title}" (also line ${seen.get(t.title)}); add a name column or rename the variant`);
        else seen.set(t.title, t.line);
    }
    // flow names must be unique even when two titles slug the same (punctuation only)
    const used = new Set();
    const scenarios = tests.map((t) => {
        let flow = flowName(`${base}--${slug(t.title)}`);
        for (let i = 2; used.has(flow); i++) flow = flowName(`${base}--${slug(t.title)}-${i}`);
        used.add(flow);
        return { ...t, flow };
    });
    return { grouped, errors, scenarios };
}

module.exports = { expandScenarios, flowName };
