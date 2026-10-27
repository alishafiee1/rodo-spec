> یادداشت فارسی: برای پوشه‌ای که از قبل کد دارد ولی هنوز `rodo/` ندارد. هیچ چیزی پاک نمی‌شود و جابه‌جایی‌ها اول پیشنهاد می‌شوند.

# Onboarding playbook (existing folder)

Goal: create `rodo/` so the project can follow the method, without changing any existing file.

## Steps

1. **Read, do not write.** Read README, existing docs, package files, folder structure, git log (last ~100 commits), and TODO/FIXME comments. Skim code by folder; do not read every file.
2. **Create the skeleton**: run `node <kit>/scripts/rodo-install.cjs --target .` (it creates missing files from `templates/`, `rodo/config.json`, `rodo/.kit-version`, and never overwrites). Set `language` in `rodo/config.json` if the user wants other languages.
3. **brief.md and architecture.md**: describe what exists today. Mark guesses with `(حدس)` so the user can confirm.
4. **MEMORY.md**: decisions visible in the code or docs (framework, database, auth method...). One line each with the reason if known, else `چون: نامعلوم`.
5. **Finished work → done cycles.** For each finished feature a user can see, create `rodo/cycles/NNN-slug/` with:
   - `simple.md` whose FIRST line is `<!-- rodo:onboarded -->`, then 3-6 simple lines;
   - `card.rodo.md` with `status: done`, refs to `simple.md` and the main code files, and steps as ticked items if they are known. No approval item: past work is not re-approved.
   List each one under "انجام‌شده" in `MAP.md`.
   No `spec.md` or `acceptance.feature` is needed for onboarded done cycles.
6. **Unfinished work → pending cycles.** For each TODO, half-done feature, or open issue, create `rodo/cycles/NNN-slug/` with the same two files and `status: todo`, listed under "بعدی" in `MAP.md`. Before anyone codes it, the planner completes it like any new card (`spec.md` with rules `**R1**`..., optional `acceptance.feature` and approval item) and removes the `rodo:onboarded` line.
7. **MAP.md**: sections `## انجام‌شده`, `## لغوشده` (abandoned work, with the reason after `—`), `## بعدی`, plus "الان کجاییم" in a few lines. Onboarded done cycles need no `acceptance-result.json`.
8. **Proposals, not actions.** Write `rodo/onboarding-report.md` with: docs that could move into `rodo/project/`, duplicated or outdated docs, and files that look unused. Each line: current path → proposed action → reason. Do NOT move or delete anything until the user approves each line.
9. Add `*.rodo.md` and `.rodo/` to `.gitignore` only if the user agrees (rodo-install does it unless `--no-gitignore`). If they decline, tell them cards may end up in git and continue.
10. Show the user MAP.md and the report. If the RODO CLI is installed, `rodo validate` lists card-format warnings; fix what it reports.

## Never

- Never delete, rename, or rewrite existing files during onboarding.
- Never invent history. If you are unsure whether something is finished, make it a pending cycle and say so.
