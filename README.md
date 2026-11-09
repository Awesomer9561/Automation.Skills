# Automation.Skills

Shared tooling for the Playwright automation repos: Claude Code skills, the generator they drive, and the rules each
project family (and, rarely, each repo) adds on top.

```
skills/steps-to-spec/SKILL.md     generic workflow: probe pages -> write steps -> generate -> run
steps-core/                       the generator (npm package, installed by each repo as file:../Automation.Skills/steps-core)
projects/
  _projects/<project>/rules.md    rules shared by a project family (repos whose .crossrepo.json says "project": "<project>")
  _projects/<project>/*.js        optional packs: steps shared by the family (probuy: pack.js, the login for all
                                  portals), listed in each repo's steps.config.js packs
  <repo-folder>/rules.md          rare per-repo overrides; win over the family file
```

Generic behaviour goes in the skill or `steps-core`; anything true only for one product goes under `projects/`.

## Install

macOS / Linux / Git Bash:
```bash
ln -s "$PWD/skills/steps-to-spec" ~/.claude/skills/steps-to-spec   # every repo sees the skill
```

Windows (PowerShell; a junction needs no admin rights, unlike `ln -s`/symlinks):
```powershell
New-Item -ItemType Junction -Path "$HOME\.claude\skills\steps-to-spec" -Target "$PWD\skills\steps-to-spec"
```

Needs Node 18+ and Git on both systems. Everything the tools run is Node, so the same `npm run` scripts work in
PowerShell, cmd, Git Bash and zsh. A `.gitattributes` keeps files LF, and `gen:check` ignores CRLF, so specs generated on
one OS verify on the other.

Then set up each repo as in `steps-core/README.md` (devDependency + scripts + `steps.config.js`, then `npm install`).
Keep this repo checked out as a sibling of the automation repos (`../Automation.Skills`).
