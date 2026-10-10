// Steps file: one step per line; blank lines and "# comment" lines are ignored; "# test: <title>" sets the test title.

function parseSteps(text, fallbackTitle) {
    let title = fallbackTitle;
    const steps = [];
    text.split(/\r?\n/).forEach((raw, i) => {
        const line = raw.trim();
        if (!line) return;
        const meta = line.match(/^#\s*test:\s*(.+)$/i);
        if (meta) { title = meta[1].trim(); return; }
        if (line.startsWith('#')) return;
        steps.push({ text: line, line: i + 1 });
    });
    return { title, steps };
}

module.exports = { parseSteps };
