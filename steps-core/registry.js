// Combines core phrasings with the packs from steps.config.js. Later layers override earlier ones
// (core < packs in config order), so a repo pack can redefine a phrase on purpose. Two matches in the same
// layer are an ambiguity error rather than a silent first-match.

const { core } = require('./intents');

function buildRegistry(packs) {
    const layers = [core, ...packs];
    const phrasings = layers.flatMap((pack, layer) => (pack.phrasings || []).map((p) => ({ ...p, layer, pack: pack.name })));
    const generators = Object.assign({}, ...layers.map((p) => p.generators || {}));
    const autoVars = Object.assign({}, ...layers.map((p) => p.autoVars || {}));

    function match(text) {
        const hits = phrasings.map((p) => ({ phrasing: p, m: text.match(p.pattern) })).filter((h) => h.m);
        if (!hits.length) return null;
        const top = Math.max(...hits.map((h) => h.phrasing.layer));
        const best = hits.filter((h) => h.phrasing.layer === top);
        return best.length > 1 ? { ambiguous: best.map((h) => h.phrasing) } : best[0];
    }

    return { layers, phrasings, generators, autoVars, match };
}

module.exports = { buildRegistry };
