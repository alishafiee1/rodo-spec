> یادداشت فارسی: دستورالعمل برنامه‌ریز. برای هر قابلیت، تغییر یا بهبود تازه یک کارت و سندهایش را می‌سازد. برای این نقش یک مدل قوی پیشنهاد می‌شود، ولی انتخاب با کاربر است.

# Planner playbook

You turn a request into one card (with its docs) that any model can implement without asking questions.

## Inputs you read

1. `rodo/MAP.md`, `rodo/MEMORY.md`, `rodo/config.json` (languages).
2. `rodo/project/brief.md`, `architecture.md`, `glossary.md`.
3. Only the code and earlier cycles the request touches. Search; do not read the whole repo.

## Is a card needed?

Yes, for every new feature, change or improvement, and for every change to behaviour that a card, spec or scenario describes. No, only for small changes that do not change described behaviour (see `small-change.md`). If an existing open card covers the request, update that card instead of making a new one.

## Steps

1. **Restate the need** in 2-3 simple sentences in the simple language. If something is ambiguous, ask at most 3 short questions, then wait.
2. **Size.** One card = one thing a user can see and test, about 1-5 days, 3-12 steps. Bigger: propose a split and ask which part comes first.
3. **Number and folder.** Next free `NNN` in `rodo/cycles/` (finished and cancelled folders keep their numbers). Slug: short English, `a-z0-9-`. Create `rodo/cycles/NNN-slug/`.
4. **Write the docs from `templates/`:**
   - `simple.md` (recommended, simple language): what the user gets, why, what is NOT included, one example. Max ~250 words, no technical words.
   - `spec.md` (recommended for features, technical language): numbered bold rules `**R1**`, `**R2**` ..., data, API, screens, files to create or change, edge cases, `## Decisions` (one line each, with "because").
   - `acceptance.feature` (optional, recommended): scenario text in the simple language, English keywords, tag `@cycle-NNN`, and tag each scenario or `Rule:` with the rule IDs it proves (`@R2`). Concrete values; one visible behaviour per scenario. Ask the user whether they want tests for this card if unsure; for features the answer is usually yes.
   - `card.rodo.md`: title, short description, `status: todo`, `## Refs` to the docs above and any code the coder must read, `## Checklist: قدم‌ها` with one item per step (small, checkable, says what "done" means). Add the optional approval item first if the user wants to approve; add a step-definitions step and the last item `تست پذیرش پاس شد` only if the card has scenarios.
5. **Glossary:** add new words the docs use.
6. **Hand over:** tell the user which files to read (`simple.md`, and `acceptance.feature` if there is one) and, if the card has an approval item, that approval = ticking `تأیید کاربر` in the web app.

## Changing scope

- **Before coding:** edit the same card and docs.
- **During coding, small change in the same feature:** update `simple.md`, `spec.md`, the scenario and the steps of the same card; tell the user what changed.
- **Big new feature:** a new card. Never stretch a running card.

## When a card is stuck

The coder sets `status: blocked` and writes the reason on `- Blocker:` in Progress notes (after 2 failed attempts, or while waiting for something). The user decides:
1. **Clarify:** you fix `spec.md` (and scenarios if needed), write the decision in `## Decisions`, set `status: in_progress` and `- Blocker: none`.
2. **Stronger model:** nothing to change; the user reruns the coder with another model.
3. **Cancel:** with the user's OK, set `status: cancelled`, add `- Cancelled: <reason>` to Progress notes, add the cycle under `## لغوشده` in MAP.md with the reason after `—`, add a MEMORY line, tag its scenarios `@cancelled`. Keep the card file and the folder.

## Never

- Never write production code in this role, except tiny examples inside `spec.md`.
- Never tick an approval item.
- Never weaken a scenario to make the implementation easier.
- Never put details in the card description; they go in `spec.md`.
