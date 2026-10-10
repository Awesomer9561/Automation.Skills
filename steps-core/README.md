# steps-core

Generic steps -> Playwright spec pipeline. Nothing here knows about a product or a repo: it reads the consuming repo's
`steps.config.js` (found upward from the working directory) and never imports from the repo, so every automation repo
shares this one copy.

```
steps file ─ parse.js ─► compile.js ──► IR ──► emit-playwright.js ─► spec
                            │  registry.js: core phrasings (intents.js) + packs, later layers override,
                            │               two matches in one layer = ambiguity error
                            └─ catalog.js: knowledge/pages/*.json (written by runtime/snapshot.js via `probe`)
```

- **IR** (op list at the top of `intents.js`) is plain data: ids, values with `{var}`s, helper names. No code. The
  emitter is the only Playwright-aware module; another emitter (e.g. playwright-bdd) can consume the same IR.
- **Packs** (`{ name, phrasings, generators, autoVars }`) add steps. A phrasing is
  `{ usage, pattern, build(match, ctx) -> op[] }`; ctx is `{ app, addWait(ms), generator(name), error(msg) }`.
  Helpers are referenced by name (`{ op: 'call', fn: 'LoginPage', construct: [PAGE], method: 'login', args: [] }`)
  and mapped to files by the repo's `helpers` config. Layers: core < project family pack
  (`../projects/_projects/<project>/pack.js`) < the repo's `steps.pack.js`.
- **Config** (`steps.config.js`): `testsDir`, `knowledgeDir`, `ledger`, `apps` (`{ name: { urlEnv: 'ENV_VAR_WITH_ROOT_URL' } }`),
  `defaultApp`, `packs`, `helpers`, optional `timeouts`. Runs use whatever the app URL variables hold.
- **Runtime** (imported by generated specs as `steps-core/runtime/...`): `snapshot.js` (probe snapshots, no-op unless
  `PROBE=1`) and `ledger.js` (`recordCreated(type, key)` appends to the repo's local ledger). Both load the repo's own
  `@playwright/test`.
- **CLIs**: `steps-gen` (`--report`, `--list-steps`, `--check`), `steps-probe`, `steps-ids`.

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
