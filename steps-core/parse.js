// Steps file: one step per line; blank lines and "# comment" lines are ignored; "# test: <title>" sets the test title.
//
// Variations (scenarios.js turns them into one test each):
//   # variant: <name>      starts a variant; the steps above the first variant are shared and run first in every one
//   # examples:            a table of whole steps, one test per row, after the steps of the block it is in:
//   | input | assertion |    header: input, assertion (or assert), name; a column may repeat (two input steps)
//   | I click "Pending" | I should see "Pending" |
//
// Returns { title, steps (the shared steps), blocks: [{ name, line, steps, rows }], errors }. blocks[0] is the shared
// block (name null); each row is { line, name, input: [text], assertion: [text] }.

const COLUMNS = { input: 'input', assertion: 'assertion', assert: 'assertion', name: 'name' };

// "| a | b \| c |" -> ['a', 'b | c']
function cells(line) {
    const inner = line.replace(/^\|/, '').replace(/(?<!\\)\|\s*$/, '');
    return inner.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

function parseSteps(text, fallbackTitle) {
    let title = fallbackTitle;
    const errors = [];
    const shared = { name: null, line: 0, steps: [], rows: [] };
    const blocks = [shared];
    let block = shared;
    let table = null;               // { line, columns } while reading an examples table; columns null until the header

    text.split(/\r?\n/).forEach((raw, i) => {
        const line = raw.trim();
        const n = i + 1;
        if (!line) return;
        const meta = line.match(/^#\s*test:\s*(.*)$/i);
        if (meta) { title = meta[1].trim() || title; return; }
        const variant = line.match(/^#\s*variant:\s*(.*)$/i);
        if (variant) {
            if (!variant[1].trim()) errors.push(`line ${n}: "# variant:" needs a name`);
            block = { name: variant[1].trim() || `variant ${blocks.length}`, line: n, steps: [], rows: [] };
            blocks.push(block);
            table = null;
            return;
        }
        if (/^#\s*examples:\s*$/i.test(line)) { table = { line: n, columns: null }; return; }
        if (line.startsWith('#')) return;

        if (line.startsWith('|')) {
            if (!table) { errors.push(`line ${n}: a table row outside an examples table (add "# examples:" above it)`); return; }
            const row = cells(line);
            if (!table.columns) {
                const unknown = row.filter((c) => !COLUMNS[c.toLowerCase()]);
                if (unknown.length) errors.push(`line ${n}: unknown column${unknown.length > 1 ? 's' : ''} ${unknown.map((c) => `"${c}"`).join(', ')} (columns: input, assertion, name)`);
                table.line = n;
                table.columns = row.map((c) => COLUMNS[c.toLowerCase()] || null);
                if (!table.columns.some((c) => c === 'input' || c === 'assertion')) errors.push(`line ${n}: an examples table needs an input or assertion column`);
                return;
            }
            if (row.length !== table.columns.length) {
                errors.push(`line ${n}: ${row.length} cell(s), but the header at line ${table.line} has ${table.columns.length}`);
                return;
            }
            const entry = { line: n, name: null, input: [], assertion: [] };
            row.forEach((cell, c) => {
                const col = table.columns[c];
                if (!col || !cell) return;
                if (col === 'name') entry.name = cell;
                else entry[col].push(cell);
            });
            if (!entry.input.length && !entry.assertion.length) errors.push(`line ${n}: an examples row with no steps`);
            else block.rows.push(entry);
            return;
        }
        if (table && table.columns) {
            errors.push(`line ${n}: a step after an examples table; put it above "# examples:" (it runs before every row) or start a "# variant:"`);
            return;
        }
        block.steps.push({ text: line, line: n });
    });
    for (const b of blocks.slice(1)) {
        if (!b.steps.length && !b.rows.length) errors.push(`line ${b.line}: variant "${b.name}" has no steps`);
    }
    return { title, steps: shared.steps, blocks, errors };
}

module.exports = { parseSteps };
