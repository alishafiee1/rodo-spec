# RODO kit migration notes

Run `node scripts/rodo-update.cjs` first (it replaces kit files only), then do the manual steps for every version you skipped.

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
