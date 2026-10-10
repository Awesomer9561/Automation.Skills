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
knowledge in `knowledge/pages/<page>.json` (the real ids, labels, button texts, select options and headings of probed
pages). Never guess ids; they come from there.

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

1. **Check what is known.** For every page the flow touches, run `npm run gen:ids -- <page-or-id-fragment>` (no
   argument lists everything). If a page is missing or its `capturedAt` is old enough that the UI may have changed,
   probe it (step 2); otherwise go to step 3.
2. **Probe the missing pages** (always first for a new page or flow):
   - Write `steps/probe_<flow>.steps.txt`: steps that navigate to each page, plus `snapshot "page-name"` wherever the
     catalog should record the screen. Snapshot each distinct state (view/edit mode, each wizard step, an open modal).
   - Before each snapshot, wait on something **on the new page** (`wait till #id loads`, or
     `wait till #previous-id disappears` when its ids are not known yet). `wait till network is idle` alone can fire
     before a client-side navigation and record the previous page; use it only as an extra wait for lists that load
     after the page appears. Hidden inputs (file inputs) never become visible: wait on their visible button instead.
   - Probes are read-only and run against whatever URLs and credentials the repo has set (check they point where
     the rules say page knowledge comes from): navigate, open, cancel; don't save or submit. Where reaching a page
     requires creating something (e.g. a new account), tell the user what will be created first.
   - Run `npm run probe -- steps/probe_<flow>.steps.txt`, then check each page with `npm run gen:ids -- <page>`: its
     path and headings must be the page you meant, not the one before it. A probe that fails part-way kept the
     snapshots it reached; fix the steps and re-run.
   - Snapshots never store input values or link text. Still skim new `knowledge/pages/*.json` for anything personal
     before it is committed.
3. **Write the steps** in `steps/<snake_case_name>.steps.txt` (one per line, `# test: <title>` first) using catalog
   ids. `npm run gen:list` shows the vocabulary; rephrase to match it where the meaning is the same. Credentials:
   `set {x} to env NAME`. Unique data: `set {x} to unique "..."`. A test that creates data ends with
   `record <type> {key}`.
   - To learn what the last page of a creating flow looks like, run the steps file once through `npm run probe` with a
     temporary `snapshot` at the end (this creates the data, so say so), then replace it with real assertions.
4. **Generate:** `npm run gen -- steps/<name>.steps.txt`. Never overwrite an existing spec without the user's OK
   (`--force`); afterwards `npm run gen:check` must pass. A warning about an `#id` the catalog has never seen is a typo
   or an un-probed page: fix it, don't ignore it.
5. **Unmatched steps** (non-zero exit): run with `--report` to get them as JSON, then add a phrasing for each,
   `{ usage, pattern, build }` where `build` returns IR ops (data, never code strings; op list in
   `steps-core/intents.js`). Where it goes:
   - generic to any web app: the core, `$SKILLS/steps-core/intents.js`;
   - shared by a project family: `$SKILLS/projects/_projects/<project>/pack.js`, listed in the repo's
     `steps.config.js` `packs`;
   - this repo only, one-offs included: the repo's `steps.pack.js`.

   Prefer a `call` op to an existing helper mapped in `steps.config.js` `helpers`. Show the user the new entry before
   adding it. Never hand-edit a generated spec: `npm run gen:check` fails on any spec that differs from its steps file.
6. Conventions (plus the repo's CLAUDE.md and the rules): stable ids first, state-based waits (no fixed sleeps), no
   `test.only`, credentials only through `process.env`, never read or print `.env*`, unique data per run.
7. Run `npx playwright test tests/<name>.spec.js` against the environment active in the repo (see the rules) and
   report the real result; if it fails, say so with the output. Tell the user when a run creates or changes data; `record` steps also
   log it to the repo's local ledger.
8. Don't commit unless asked, and follow the review process in the rules when you do. Probe steps files and
   `knowledge/` are meant to be committed so the catalog is shared.
