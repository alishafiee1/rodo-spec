# RODO kit migration notes

Kit 2.1+ is installed and updated by `rodo init` (the 2.0 scripts `rodo-install.cjs` and `rodo-update.cjs` are replaced by it). Do the steps for every version you skipped.

## 2.2.1 → 2.3.0 (two plain project docs)

What changes:
- **New files.** `project/project-overview.md` (for a client, parts with ticks) and `project/how-it-works.md` (for a beginner). The writing rules are in the new skill file `project-docs.md`.
- **Planner and coder.** The planner updates these files before work starts when a new feature or major change does not fit them; the coder makes them true and ticks the part when a card closes.
- **`rodo validate`** warns `PROJECT_DOC_TOO_LONG` when one of them passes its word limit. It never blocks anything.
- **`rodo init`** uses the project's own language when it adds missing files to an existing project.

Steps: run `rodo init`. It adds the two files without touching existing ones. The next planner session fills them in. `RULES.md` is never replaced: compare it with the kit's new one (new section on the two docs). Commit: `git commit -am "chore: RODO kit 2.3.0"`.

## 2.1.0 → 2.2.0 (English templates, rodo new, safer sync)

What changes:
- **English.** New projects choose the plain-language docs language at `rodo init` (`--lang en|fa`, default from the system locale). English projects get `project-template-en/` and the skill templates in `templates/en/`.
- **`rodo new "<title>"`** creates the next cycle folder with the card, `simple.md` and `spec.md`.
- **Card titles** no longer start with the number (the number comes from the folder). Old titles keep working; status and resume no longer print the number twice.
- **MAP checks** accept relative links and English headings (`## Done`, `## Cancelled`); a done cycle missing from MAP gets `CYCLE_DONE_NOT_IN_MAP`.
- **Cards and Git.** Without a board, card files are committed (the `.gitignore` card line is added only when a board is bound).
- **Sync.** Progress notes survive a board edit that drops them; when the board wins a conflict your file is saved in `.rodo/conflicts/`.

Steps: run `rodo init` (unchanged kit files update by themselves; files you changed get a `.rodo-new` copy). `RULES.md` is never replaced: compare it with the kit's new one (new "Quick start" section). Commit: `git commit -am "chore: RODO kit 2.2.0"`.

## 2.0.0 → 2.1.0 (several projects per repo, session protocol, adaptive workflow)

What changes:
- **Layout.** `rodo/MAP.md`, `MEMORY.md`, `RULES.md`, `CHANGELOG.md`, `project/`, `cycles/` and `config.json` move into `rodo/<project>/` (`config.json` becomes `project.json`; `.kit-version` becomes `rodo/kit.json`). One repo can now hold several RODO projects, each bound to one board.
- **Session protocol.** The AI looks at git without pulling, runs `rodo sync` and `rodo resume` at the start, and `rodo sync` at the end.
- **Statuses.** The reason for `blocked` / `cancelled` now goes in the `statusReason` key of the card. Old `- Blocker:` lines still work, and `rodo sync` adds the key for you. Blocked cards also get a `blockerType`.
- **Adaptive workflow.** Three levels (QUICK, STANDARD, MAJOR), at most 5 questions before planning, `design.md` for MAJOR only, and a documentation consistency check in VERIFY. New optional card key `workflow` (local only).
- **New card parts.** `scope`, `test`, and `## Decision:` sections (answered on the web).

Steps:

1. Install the CLI, then in the repo run `rodo init --method-only --project <slug>` (add `--dry-run` first to see the plan). It moves the files, updates unchanged kit files, keeps files you changed as `<file>.rodo-new`, and never touches `scripts/rodo-*.cjs`.
2. Compare each `.rodo-new` file with yours and merge by hand. `RULES.md` is never replaced automatically: compare it with the kit's new `RULES.md` (new sections: session start/end, stuck, decisions, scope, three work sizes, only important questions, docs always match the code).
3. Connect the board: run `rodo init` in your own terminal and type the board name when asked. The AI never creates boards.
4. Old `scripts/rodo-install.cjs`, `rodo-update.cjs` and `scripts/lib/core.cjs` are not needed any more. `rodo doctor` lists them as INFO; delete them when you are ready.
5. Commit: `git add -A && git commit -m "chore: RODO kit 2.1.0"`.


## 1.x → 2.0.0 (method only, no enforcement)

2.0.0 removes every check that could block a commit or stop work. RODO is now a method the AI follows. Card-format checks move to the RODO watcher / CLI (`rodo validate`), which only reports warnings and errors.

What is gone: `.githooks/` (pre-commit, commit-msg), `.github/workflows/rodo.yml`, `.claude/settings.json` + `.claude/hooks/rodo-guard.cjs`, `scripts/rodo-lint.cjs`, `scripts/rodo-lint`, `scripts/rodo-done.cjs`, `scripts/rodo-approval.cjs`, `acceptance-result.json` files, the approval fingerprint `[approval: hash]`, `x-failures`.

Manual steps (in your project folder, in a terminal):

1. **Turn off the old git hooks:**
   ```
   git config --unset core.hooksPath
   ```
   (If it says nothing or "not found", hooks were not on. Fine.)
2. **Delete the old enforcement files** (check first that you did not add your own things to them):
   - Windows PowerShell:
     ```
     Remove-Item -Recurse -Force .githooks, .github/workflows/rodo.yml, .claude/hooks/rodo-guard.cjs, scripts/rodo-lint.cjs, scripts/rodo-lint, scripts/rodo-done.cjs, scripts/rodo-approval.cjs -ErrorAction SilentlyContinue
     ```
   - Linux/macOS:
     ```
     rm -rf .githooks .github/workflows/rodo.yml .claude/hooks/rodo-guard.cjs scripts/rodo-lint.cjs scripts/rodo-lint scripts/rodo-done.cjs scripts/rodo-approval.cjs
     ```
   - `.claude/settings.json`: if it only contains the RODO hooks (`rodo-guard.cjs`), delete it; otherwise remove just the two `rodo-guard.cjs` entries.
   - Delete `rodo/cycles/*/acceptance-result.json` (no longer used).
3. **Config:** in `rodo/config.json`, rename `acceptanceCommand` to `testCommand` and delete `acceptanceItem`, `ciTestCommand`, `approvalRequiresSync`.
4. **Cards:**
   - `[approval: <hash>]` → `[approval]` (or remove the approval line if you do not want approval for that card).
   - Statuses stay five: `todo`, `in_progress`, `blocked`, `cancelled`, `done`. A `blocked` card needs its reason on `- Blocker:` in `## Progress notes`; a `cancelled` card is kept (not deleted) with `- Cancelled: <reason>` in Progress notes and a line under `## لغوشده` in MAP.md. Add these lines to old cards that lack them.
   - The RODO board needs a server that knows `blocked` and `cancelled` (RODO cycle 004); older servers report an error for those two statuses (nothing else is blocked).
   - Delete `x-failures` lines.
5. **CHANGELOG:** new lines use `- YYYY-MM-DD | what | why | files` (old 3-part lines can stay).
6. Compare your `rodo/RULES.md` with the kit's `rodo/RULES.md` and merge by hand (it is never replaced). The new decision rule for "card or CHANGELOG line" is in section 4.
7. Commit: `git add -A && git commit -m "chore: RODO kit 2.0.0 (method only)"`.

## 1.0.0 → 1.1.0

Superseded by 2.0.0. If you are still on 1.0.0, go straight to 2.0.0: do the steps above (step 1 also covers `scripts/hooks`: delete that folder too).
