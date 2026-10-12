# steps-core

Generic steps -> Playwright spec pipeline. Nothing here knows about a product or a repo: it reads the consuming repo's
`steps.config.js` (found upward from the working directory) and never imports from the repo, so every automation repo
shares this one copy.

```
steps file ─ parse.js ─► compile.js ──► IR ──► emit-playwright.js ─► spec
                            │  registry.js: core phrasings (intents.js) + packs, later layers override,
                            │               two matches in one layer = ambiguity error
                            ├─ resolve.js: "First name" / "Get OTP" -> recorded id, tracking the current page
                            └─ catalog.js: knowledge/pages/<app>/<slug>.json + knowledge/flows/<name>.json (written by runtime/snapshot.js via `probe`)
```

- **Steps by label/text** (`I enter "Abdul" in First name`, `I click "Get OTP"`): `gen` resolves them through the
  catalog; `probe` (compile with `{ probe: true }`) instead looks them up in the live page (`runtime/labels.js`) and
  records every page reached (`autoSnapshot`). Pages are shared by all steps files: one record per app + path
  (`pages.js`), created on first sight and updated in place afterwards; wizard steps and dialogs at that path are its
  `states`, and each element lists the states it is in (`in`) and visible in (`vis`). What belongs to one steps file
  is `flows/<name>.json` (pages visited in order, and the names its steps resolved), which is what lets `gen` resolve
  a name used on several pages. A file never probed can still use pages other files recorded (`npx steps-migrate`
  converts old `<name>-NN.json` recordings). The probe finds buttons, links, options/tabs, then any element with the text, then
  cards by id; it records which id each name hit (the flow's `names`), clickable cards (`clickable`), and card families
  (`cards`: sibling ids differing only in the last part, e.g. `orders-list-<order>`), so `I click {orderNumber}`
  becomes `[id="orders-list-<value>" i]`.
- **Regions** (`regions.js`): every probed element is tagged with the part of the layout it sits in (`region`:
  `modal`, `toast`, `sidebar`, `header`, else `main`), by CSS selector, first match wins. Defaults are `[role=dialog]`,
  `aside`, `header`; a pack's `regions`, the config's `regions` and `apps.<app>.regions` override them in that order
  (`null` switches one off for a portal). A step narrows a name with `in the <region>`: `I click "Orders" in the sidebar`,
  `I enter "x" in Search in the app header` (click, check, select, enter). The same text in two regions is otherwise an
  ambiguity error that names the regions. Pages recorded before regions existed carry no `region`; re-probe them.
- **Split inputs** (OTP boxes): `I enter OTP "2024"` fills one character per box; `I enter 2 in OTP field 1` fills
  one box (`field|box|digit|input|cell N`; a {var} here must be one character). Both resolve by the boxes' labels.

- **IR** (op list at the top of `intents.js`) is plain data: ids, values with `{var}`s, helper names. No code. The
  emitter is the only Playwright-aware module; another emitter (e.g. playwright-bdd) can consume the same IR.
- **Packs** (`{ name, phrasings, generators, autoVars, regions }`) add steps. A phrasing is
  `{ usage, pattern, build(match, ctx) -> op[] }`; ctx is `{ app, addWait(ms), generator(name), error(msg) }`.
  Helpers are referenced by name (`{ op: 'call', fn: 'LoginPage', construct: [PAGE], method: 'login', args: [] }`)
  and mapped to files by the repo's `helpers` config. Layers: core < project family pack
  (`../projects/_projects/<project>/pack.js`) < the repo's `steps.pack.js`.
- **Config** (`steps.config.js`): `testsDir`, `knowledgeDir`, `ledger`, `apps` (`{ name: { urlEnv: 'ENV_VAR_WITH_ROOT_URL' } }`),
  `defaultApp`, `packs`, `helpers`, optional `timeouts`. Runs use whatever the app URL variables hold.
- **Runtime** (imported by generated specs as `steps-core/runtime/...`): `snapshot.js` (probe snapshots, no-op unless
  `PROBE=1`), `labels.js` (probe-only lookups by label/text) and `ledger.js` (`recordCreated(type, key)` appends to
  the repo's local ledger). The ledger loads the repo's own `@playwright/test`.
- **CLIs**: `steps-gen` (`--report`, `--list-steps`, `--check`), `steps-probe`, `steps-ids`.
- **Probe isolation**: `steps-probe` runs under a temporary config (`_probe.playwright.config.js`, removed afterwards)
  built from the repo's `playwright.config.*` minus its run setup: `projects`/`dependencies` (e.g. login setup specs),
  `globalSetup`/`globalTeardown`, a saved `storageState` and retries. A probe always starts logged out.

## Using it in a repo

Clone `Automation.Skills` next to the repo, then in the repo:

```jsonc
// package.json
"scripts": {
  "gen": "steps-gen",
  "gen:list": "steps-gen --list-steps",
  "gen:check": "steps-gen --check",
  "probe": "steps-probe",
  "gen:ids": "steps-ids"
},
"devDependencies": { "steps-core": "file:../Automation.Skills/steps-core" }
```

```js
// steps.config.js (minimal)
module.exports = {
    apps: { web: { urlEnv: 'WEB_URL' } },          // `portal <name>`; urlEnv: env var holding the root URL
    defaultApp: 'web',
    packs: [],                                      // e.g. require('../Automation.Skills/projects/_projects/<p>/pack')
    helpers: {},                                    // helper name -> repo module exporting it
};
```

`npm install` links the package (`node_modules/steps-core -> ../Automation.Skills/steps-core`), so edits here apply
to every repo at once. Add the ledger path (`test-data/created.jsonl` by default) to the repo's `.gitignore`.
