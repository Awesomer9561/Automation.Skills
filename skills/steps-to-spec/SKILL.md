---
name: steps-to-spec
description: Generate a Playwright spec from plain-text steps in an automation repo (steps-core pipeline, steps.config.js). Use when the user gives test steps (or a steps file) and wants a spec, when a new page/flow needs probing first, when `npm run gen` reports unmatched steps or unknown ids, or when setting up steps-core in a Playwright repo.
---

# steps-to-spec

The shared repo holding this skill (`SKILLS=$(cd -P ~/.claude/skills/steps-to-spec/../.. && pwd)`) has:

- `steps-core/`: the generator, an npm package each automation repo installs as
  `"steps-core": "file:../Automation.Skills/steps-core"`. Its README covers the IR, packs, config and CLIs.
- `projects/`: rules per project family and per repo (Step 0). Project facts go there, never into this file.

In a repo: steps live in `steps/<name>.steps.txt`; paths, apps, packs and helper mappings in `steps.config.js`; page
knowledge in `knowledge/pages/<app>/<slug>.json`, one record per app + path shared by all steps files (the real ids,
labels, button texts and headings of probed pages, never input values or dropdown options; wizard steps and dialogs are `states` of a page),
plus `knowledge/flows/<name>.json` for the order one steps file visited them in. Never guess ids; they come from there.

## Step 0: Load the rules

```bash
ROOT=$(git rev-parse --show-toplevel)
basename "$ROOT"                          # repo folder, e.g. SupplierPortal.Automation
cat "$ROOT/.crossrepo.json" 2>/dev/null   # project family, e.g. {"project": "probuy", ...}
```

1. **Project family**: if `.crossrepo.json` has a `project`, read `$SKILLS/projects/_projects/<project>/rules.md`.
   This is the normal case.
2. **Repo override**: if `$SKILLS/projects/<repo-folder>/rules.md` exists, read it too; it wins over the family file.
3. **Neither**: continue with this file's defaults and offer to create the family rules file. Never create a per-repo
   file unprompted; it is for genuine differences only.

When a probe or run proves or disproves something in those files, update the right one (the family file if every repo
in the project is affected, otherwise the repo override) and mark it *verified on <env>, <date>*. Anything not marked
verified is a hypothesis.

## Setup (repo without `steps.config.js`)

Say the repo is not set up and offer to add the `steps-core` devDependency and the `gen`, `gen:list`, `gen:check`,
`probe`, `gen:ids` scripts (see the steps-core README), write `steps.config.js` (apps and their base-URL helpers from
the repo's env module), and run `npm install`. Don't improvise a generator.

## Workflow

QA writes steps the way they read the screen; the generator turns them into an id-only spec.

1. **Write the steps** in `steps/<snake_case_name>.txt` (one per line, `# test: <title>` first). Name fields by their
   label and buttons/links by their text, values in quotes or as `{variables}`:
   ```
   set {email} to unique "test{unique}@yopmail.com"
   I open the supplier portal
   I click "Sign up"
   I enter "Abdul" in First name
   I enter {email} in Email Address
   I enter OTP "2024"                  (or box by box: I enter 2 in OTP field 1)
   I click "Orders" in the sidebar     (when the same text is in several places: sidebar, app header, modal, toast, main page)
   I select "Riyadh" in City
   I check Terms and conditions
   I upload "documents/file.pdf"
   I click {orderNumber}          (a card in a list, e.g. the order created earlier in the test)
   I should see "Account is in the verification process" up to 30 seconds
   ```
   `npm run gen:list` shows every phrasing (core, plus pack one-liners like `I login with supplier user`). Credentials:
   `set {x} to env NAME`. A test that creates data ends with `record <type> {key}`. `#id` steps still work but are
   rarely needed.
2. **Probe the steps file itself:** `npm run probe -- steps/<name>.txt`. It runs the steps in a browser, finding each
   field/button by its label/text in the live page, and records every page it reaches in that page's shared record (no
   `snapshot` lines needed): a page another flow already recorded, such as login, is updated in place, not recreated;
   re-probing replaces only this file's flow log. A probe runs the whole flow: if the
   flow saves or creates something, the probe does too, so tell the user first. If it fails part-way, the pages
   reached are kept; `test-results/` has the screenshot, fix the step and re-run.
   - Check `npm run gen:ids -- <page or path>`: each page's path and headings should be the screen you expect.
   - Snapshots never store input values or link text. Still skim new `knowledge/pages/*.json` for anything personal
     before it is committed.
3. **Generate:** `npm run gen -- steps/<name>.txt`. Each label/text is resolved to the recorded id, on the page the
   test is on (the flow log keeps the pages in the order the probe reached them, so a name used on two pages resolves to the right
   one; a steps file never probed can still use pages other files recorded). A name that
   was never recorded, is misspelt, or is ambiguous is an error naming the problem; fix the step or re-probe. Never
   overwrite an existing spec without the user's OK (`--force`); afterwards `npm run gen:check` must pass.
4. **Unmatched steps** (non-zero exit): run with `--report` to get them as JSON. Rephrase to a listed phrasing where
   the meaning is the same; otherwise add a phrasing `{ usage, pattern, build }` whose `build` returns IR ops (data,
   never code strings; op list in `steps-core/intents.js`):
   - generic to any web app: the core, `$SKILLS/steps-core/intents.js`;
   - shared by a project family: `$SKILLS/projects/_projects/<project>/*.js`, listed in the repo's `steps.config.js` `packs`;
   - this repo only, one-offs included: the repo's `steps.pack.js`.

   Show the user the new entry before adding it. Never hand-edit a generated spec: `npm run gen:check` fails on any
   spec that differs from its steps file.
5. Conventions (plus the repo's CLAUDE.md and the rules): ids only in specs, state-based waits (no fixed sleeps), no
   `test.only`, credentials only through `process.env`, never read or print `.env*`, unique data per run.
6. Run `npx playwright test tests/<name>.spec.js` against the environment active in the repo (see the rules) and
   report the real result; if it fails, say so with the output. Tell the user when a run creates or changes data;
   `record` steps also log it to the repo's local ledger.
7. Don't commit unless asked, and follow the review process in the rules when you do. Steps files and `knowledge/`
   are meant to be committed so the recorded pages are shared.
