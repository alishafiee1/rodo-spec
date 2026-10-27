> یادداشت فارسی: دستورالعمل کدنویس. از روی کارت کار کن، فقط ارجاع‌ها را بخوان، قدم‌به‌قدم جلو برو، سندها را درست نگه دار، و آخر هر جلسه «Progress notes» را به‌روز کن. همهٔ مسیرها نسبت به `rodo/<project>/` هستند.

# Coder playbook

You implement one card. Any model may do this; the user chooses.

## Before you start (every session)

Follow "Session start" in SKILL.md (git check without pulling → rodo sync → rodo resume → refs only → approval check → answered decisions). Then set `status: in_progress`.

## Doing the steps

For each unticked step, in order:
1. Do only what the step says.
2. Check it (unit test, build, or the command the step names).
3. Tick it `- [x]`; add `[hours: H:MM]` only if you know the real time.
4. Commit with the card number in the message, e.g. `feat: discount code input [cycle 002]`, so people can find the work later.

If your change makes a project doc wrong (`project/*`, the card's `spec.md`), fix the doc in the same commit.

## Tests (if the card has scenarios)

- Step definitions go in the folder from `project.json` `stepsDirs`. They must really drive the app (browser, API or CLI) and really assert. See `testing.md`.
- Run the card's tests with `rodo test` (it uses the card's `test.command`, or `testCommand` from `project.json`). Tick `تست پذیرش پاس شد` only after a real passing run.
- **Never weaken a scenario or test to make code pass:** no deleting scenarios, loosening assertions, `@skip`/`.only`/`test.fixme`, or changing an expected value to match buggy output. If a scenario looks wrong, explain why to the user; change it only if they agree.

## Scope changes while coding

- Out of the card's `scope` or a new requirement: do not do it silently. Write `- Out of scope: <item> → new card` in Progress notes and tell the user.
- Small change in the same feature: update the scenario/spec/steps of this card, tell the user, continue (wait if there is an unticked approval item).
- Big new feature: do not add it. Write it under `- Remaining:` as "needs a new card" and tell the user.

## Stuck

Use the stuck rule in SKILL.md: same failure signature twice → `status: blocked`, `blockerType: test` or `technical`, a plain `statusReason:`, ask the user. Waiting for an answer, a key or another card → `status: blocked` with the matching `blockerType` (`decision`, `permission`, `external`). If only the user can choose, write a `## Decision:` section (SKILL.md). When solved: `status: in_progress`, remove `statusReason` and `blockerType`. Never set `cancelled` yourself; only with the user's OK.

## Verify and fix

**VERIFY** — pick the checks that fit this change and run them with the project's own tools (RODO runs nothing itself):
- build, typecheck, lint;
- unit, integration, e2e;
- architecture rules, security checks;
- acceptance (the card's `test` command via `rodo test`, or the acceptance criteria checked one by one);
- documentation consistency (below).

Write the result in Progress notes as `- Verified: <check> ✓/✗, …`.

**Documentation Consistency** (part of VERIFY):
- Check that every file listed under Documentation Impact was updated.
- Check that the CURRENT docs and the active cycle docs still describe the code.
- If something does not match: FIX, then VERIFY again.
- If a current doc contradicts a `MEMORY.md` decision, stop and ask the user (as small-change.md already says).

**REVIEW (optional; recommended for MAJOR)** — an independent AI session or model reads the change and checks:
- requirement coverage; acceptance criteria;
- regressions; architecture fit;
- missing tests; maintainability;
- unintended changes.

A review never replaces tests. Its findings go back to FIX.

**FIX loop** — FIX → VERIFY until everything passes (→ DONE) or the stuck rule applies: the **same failure twice** (same failure signature, or the same error at the same place) → `status: blocked` with `blockerType: test` or `technical` (SKILL.md "Stuck rule"). Different failures do not count.

## End of every session

Follow "Session close" in SKILL.md. Always finish with `rodo sync`.

## Close (all steps ticked)

The folder does not move.
1. Card: `status: done`.
2. `MAP.md`: add the cycle under `## انجام‌شده` (one line, link to simple.md or the card folder) and update "الان کجاییم".
3. `MEMORY.md`: append each `## Decisions` line of spec.md as `- YYYY-MM-DD — <decision>. چون <reason>. (cycle NNN)`.
4. Commit the MAP and MEMORY change. Later changes to this behaviour need a new card; changes that do not touch behaviour go to `small-change.md`.

## Rules

- Never tick an approval item or change its text. Only a person can approve, in the web app. Never answer a `## Decision:` yourself.
- Never edit `id:` lines or `<!-- rodo:... -->` comments.
- Do not change `members`, `startAt`, `dueAt`, `priority` unless the user asks: the team owns them.
- Never delete files you did not create in this card without asking.
- Keep changes inside the steps. Unrelated fixes go to `small-change.md` or a new card.
