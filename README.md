# Automation.Skills

Shared tooling for the Playwright automation repos: Claude Code skills, the generator they drive, and the rules each
project family (and, rarely, each repo) adds on top.

```
skills/steps-to-spec/SKILL.md     generic workflow: probe pages -> write steps -> generate -> run
steps-core/                       the generator (npm package, installed by each repo as file:../Automation.Skills/steps-core)
projects/
  _projects/<project>/rules.md    rules shared by a project family (repos whose .crossrepo.json says "project": "<project>")
  _projects/<project>/pack.js     optional: steps shared by the family (listed in each repo's steps.config.js packs)
  <repo-folder>/rules.md          rare per-repo overrides; win over the family file
```

Generic behaviour goes in the skill or `steps-core`; anything true only for one product goes under `projects/`.

## Install

```bash
ln -s "$PWD/skills/steps-to-spec" ~/.claude/skills/steps-to-spec   # every repo sees the skill
```

Then set up each repo as in `steps-core/README.md` (devDependency + scripts + `steps.config.js`, then `npm install`).
Keep this repo checked out as a sibling of the automation repos (`../Automation.Skills`).
