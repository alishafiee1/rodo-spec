> یادداشت فارسی: دستورالعمل برنامه‌ریز. برای هر قابلیت، تغییر یا بهبود تازه یک کارت و سندهایش را می‌سازد. برای این نقش یک مدل قوی پیشنهاد می‌شود، ولی انتخاب با کاربر است. همهٔ مسیرها نسبت به `rodo/<project>/` هستند.

# Planner playbook

You turn a request into one card (with its docs) that any model can implement without asking questions.

## Planner as router

understand → documentation impact → classify → clarify → reclassify (if the answers changed the scope) → create the documents for the level → task breakdown (the card checklist) → hand off.

## Inputs you read

1. Run `rodo sync`, then read `MAP.md`, `MEMORY.md`, `project.json` (languages), `project/*`.
2. Only the code and earlier cycles the request touches. Search; do not read the whole repo.

## Is a card needed?

Yes, for every new feature, change or improvement, and for every change to behaviour that a card, spec or scenario describes. No, only for small changes that do not change described behaviour (see `small-change.md`). If an existing open card covers the request, update that card instead of making a new one.

**Requests:** if the user only describes a need and does not want planning now, create a `todo` card in `inbox/` (or the next cycle folder) with `## Goal` and `## Why` (`templates/request.rodo.md`). Planning later turns it into a cycle: move the file into `cycles/NNN-slug/card.rodo.md`; its id stays.

## Documentation Impact (after understand, before classify)

- List the current documents this change will make wrong or must extend.
- Use `MAP.md`, `MEMORY.md`, `project/*`, the active cycle, the card's refs, and a code search (Graphify or similar, if available in the project).
- Write the list in `spec.md` `## Documentation Impact` (`- <path> — <what changes>`, or `- none — <why>`).
- QUICK: do this in your head and fix any doc you made wrong (small-change.md).

## Classify

**Step 1 — QUICK?** Ask the small-change question (`small-change.md`). "No" → **QUICK**: follow `small-change.md` (no card, one CHANGELOG line, a one-line docs glance). Not sure → not QUICK.

**Step 2 — MAJOR?** If **any** answer is yes, it is **MAJOR**:
1. Does it add or change architecture: a new module, service, package, external integration or dependency, or how existing parts talk to each other?
2. Does it need a coordinated design across several areas, beyond the usual "one screen + its API"?
3. Does it change a public API or contract that other code or users rely on, or the data model in a way that needs existing data migrated?
4. Does it touch security, authentication, money, or deleting data?
5. Would a wrong approach be expensive to undo (roughly more than a day of rework)?
6. Are there two or more reasonable technical approaches with real trade-offs?

**Otherwise STANDARD.** Not sure between STANDARD and MAJOR → STANDARD, and say so in one line. The level is provisional until Clarify is done. Write it on the card as `workflow: standard` or `workflow: major` (optional field, local only). The card size rule (one card ≈ 1–5 days; bigger → split) still applies; follow-up cards of a MAJOR change link to the same `design.md` in their `## Refs`.

## Clarify (before planning)

- Ask only the important ambiguities (the ask rule in SKILL.md), **at most 5 questions per round**.
- Prefer multiple choice (`A`, `B`, `C` … plus "other: …"). For each question, say in one line why it matters and which default you will use if the user has no preference.
- Low-risk, reversible choices are not asked: choose the default and record it.
- Write the answers in `spec.md` `## Decisions` (and in `simple.md` when the user will see the difference).
- Questions still open go under `spec.md` `## Open Questions`. Do not start BUILD while an open question would change the expected behaviour.
- QUICK changes normally skip this step. If the answers change the size or risk of the change, classify again.

## Documents per level

| Level | Documents (all recommended; nothing is forced) |
|---|---|
| QUICK | none; one `CHANGELOG.md` line |
| STANDARD | `spec.md` (with Acceptance criteria, Documentation Impact, Open Questions, Decisions); a short `simple.md` (it is the human brief shown on the web, and the validator warns `CYCLE_SIMPLE_MISSING`); `acceptance.feature` optional |
| MAJOR | `simple.md` + `design.md` + `spec.md` + `acceptance.feature`; architecture decisions in `design.md` `## Decisions` plus one `MEMORY.md` line |

`simple.md` is the **human brief**: what the user gets, why, what is not included, one example. **No implementation details.** Technical details go in `spec.md` and `design.md`. There is no ADR folder.

## Steps

1. **Understand and restate** the need in 2-3 simple sentences in the simple language. Then Documentation Impact, Classify, Clarify (above).
2. **Size.** One card = one thing a user can see and test, about 1-5 days, 3-12 steps. Bigger: propose a split and ask which part comes first.
3. **Number and folder.** Run `rodo new "<title>"` (it picks the next free `NNN` and an English slug and fills the templates), or do it by hand: next free `NNN` in `cycles/` (finished and cancelled folders keep their numbers), slug short English `a-z0-9-`, create `cycles/NNN-slug/`.
4. **Write the docs from `templates/`** for the level:
   - `simple.md` (simple language, max ~250 words, no technical words).
   - `spec.md` (technical language): numbered bold rules `**R1**`, `**R2**` ..., data, API, screens, files to create or change, then `## Acceptance criteria`, `## Documentation Impact`, `## Open Questions`, `## Decisions` (one line each, with "because"). Write the acceptance criteria before BUILD.
   - `design.md` for MAJOR only.
   - `acceptance.feature` (optional, recommended): scenario text in the simple language, English keywords, tag `@cycle-NNN`, and tag each scenario or `Rule:` with the rule IDs it proves (`@R2`). Concrete values; one visible behaviour per scenario. Ask the user whether they want tests for this card if unsure.
   - `card.rodo.md`: a short title (no number: the number comes from the folder), short description, `status: todo`, `workflow: standard` or `major`, `scope: {allowed, forbidden}` (3–8 short items each), `test: {adapter, command}` if the card has a runnable test (adapter `web`, `api`, `cli`, `mobile`, `iot` or `other`), `## Refs` to the docs above and any code the coder must read (paths start with `/rodo/<project>/`), `## Checklist: قدم‌ها` (English projects: `## Checklist: Steps`) with one item per step (small, checkable, says what "done" means). Add the optional approval item first if the user wants to approve (only a person ticks it on the web); add a step-definitions step and the last item `تست پذیرش پاس شد` (English: `Acceptance test passed`) only if the card has scenarios.
5. **Glossary:** add new words the docs use.
6. **Hand over:** tell the user which files to read (`simple.md`, and `design.md` or `acceptance.feature` if there are any) and, if the card has an approval item, that approval = ticking `تأیید کاربر` in the web app. Run `rodo sync`.

## Changing scope

- **Before coding:** edit the same card and docs.
- **During coding, small change in the same feature:** update `simple.md`, `spec.md`, the scenario and the steps of the same card; tell the user what changed.
- **Big new feature:** a new card. Never stretch a running card.

## When a card is stuck

The coder sets `status: blocked`, a `blockerType` and the reason in `statusReason:` (after the same failure twice, or while waiting for something). The user decides:
1. **Clarify:** you fix `spec.md` (and scenarios if needed), write the decision in `## Decisions`, set `status: in_progress` and remove `statusReason` and `blockerType`.
2. **Stronger model:** nothing to change; the user reruns the coder with another model.
3. **Cancel:** with the user's OK, set `status: cancelled` and the reason in `statusReason:`, add the cycle under `## لغوشده` in MAP.md with the reason after `—`, add a MEMORY line, tag its scenarios `@cancelled`. Keep the card file and the folder.

## Never

- Never write production code in this role, except tiny examples inside `spec.md`.
- Never tick an approval item or answer a decision.
- Never create a board. Never run `rodo init --create-board`.
- Never weaken a scenario to make the implementation easier.
- Never put details in the card description; they go in `spec.md`.
