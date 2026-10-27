> یادداشت فارسی: دستورالعمل کدنویس. از روی کارت کار کن، فقط ارجاع‌ها را بخوان، قدم‌به‌قدم جلو برو، سندها را درست نگه دار، و آخر هر جلسه «Progress notes» را به‌روز کن.

# Coder playbook

You implement one card. Any model may do this; the user chooses.

## Before you start (every session)

1. Read `rodo/MAP.md` and `rodo/MEMORY.md`.
2. Open the card `rodo/cycles/NNN-slug/card.rodo.md`. Read `## Progress notes` first if it exists.
3. If the card has an approval item (`[approval]`) and it is not ticked, stop and tell the user the card waits for their approval in the web app. If it has no approval item, go on.
4. Read ONLY the files under `## Refs`, plus the code files `spec.md` names.
5. Set `status: in_progress`.

## Doing the steps

For each unticked step, in order:
1. Do only what the step says.
2. Check it (unit test, build, or the command the step names).
3. Tick it `- [x]`; add `[hours: H:MM]` only if you know the real time.
4. Commit with the card number in the message, e.g. `feat: discount code input [cycle 002]`, so people can find the work later.

If your change makes a project doc wrong (`rodo/project/*`, the card's `spec.md`), fix the doc in the same commit.

## Tests (if the card has scenarios)

- Step definitions go in the folder from `rodo/config.json` `stepsDirs`. They must really drive the app (browser, API or CLI) and really assert. See `testing.md`.
- Run the card's tests with `testCommand` from `rodo/config.json` (replace `{NNN}`). Tick `تست پذیرش پاس شد` only after a real passing run.
- **Never weaken a scenario or test to make code pass:** no deleting scenarios, loosening assertions, `@skip`/`.only`/`test.fixme`, or changing an expected value to match buggy output. If a scenario looks wrong, explain why to the user; change it only if they agree.

## Scope changes while coding

- Small change in the same feature: update the scenario/spec/steps of this card, tell the user, continue (wait if there is an unticked approval item).
- Big new feature: do not add it. Write it under `- Remaining:` as "needs a new card" and tell the user.

## Stuck

After the **second** failed attempt at the same problem (same failing test, same error), stop: set `status: blocked`, write the problem in plain words a non-programmer understands on `- Blocker:` (plus the one-line error), and ask the user: clarify, try a stronger model, or cancel.

If you must wait for something you cannot do yourself (an answer, an access key, another card), also set `status: blocked` with `- Blocker: waiting for ...`. When the problem is solved, set `status: in_progress` and `- Blocker: none`. Never set `cancelled` yourself; only with the user's OK (see `SKILL.md`).

## End of every session

Update `## Progress notes` (before `## Refs`):
```
- Updated: YYYY-MM-DD
- Done: ...
- Remaining: ...
- Blocker: none
```

## Close (all steps ticked)

The folder does not move.
1. Card: `status: done`.
2. `rodo/MAP.md`: add the cycle under `## انجام‌شده` (one line, link to simple.md or the card folder) and update "الان کجاییم".
3. `rodo/MEMORY.md`: append each `## Decisions` line of spec.md as `- YYYY-MM-DD — <decision>. چون <reason>. (cycle NNN)`.
4. Commit the MAP and MEMORY change. Later changes to this behaviour need a new card; changes that do not touch behaviour go to `small-change.md`.

## Rules

- Never tick an approval item or change its text. Only a person can approve, in the web app.
- Never edit `id:` lines or `<!-- rodo:... -->` comments.
- Do not change `members`, `startAt`, `dueAt`, `priority` unless the user asks: the team owns them.
- Never delete files you did not create in this card without asking.
- Keep changes inside the steps. Unrelated fixes go to `small-change.md` or a new card.
