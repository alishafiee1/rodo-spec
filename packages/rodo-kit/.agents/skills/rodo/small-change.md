> یادداشت فارسی: تغییر کوچکی که رفتار توضیح‌داده‌شده در کارت‌ها، spec یا سناریوها را عوض نمی‌کند کارت نمی‌خواهد؛ فقط یک خط در `rodo/<project>/CHANGELOG.md` (تاریخ، چه، چرا، فایل‌ها).

# Small change playbook (no card)

This is the QUICK level.

## The decision rule

Ask one question before you start:

> **After this change, would any sentence in a card, a `simple.md`, a `spec.md` rule or an `acceptance.feature` scenario become false, or would a user see or be able to do something different?**

- **No → small change.** No card. Make the change and add ONE line to `CHANGELOG.md`.
- **Yes → card.** If an open card (`todo`, `in_progress` or `blocked`) describes this behaviour, update that card and its docs. Otherwise create a new card (`planner.md`). Finished (`done`) and `cancelled` cards are not reopened; a new card refers to the old one.
- **Not sure → treat it as "Yes"**, or ask the user.

## Examples

| Change | Card? | Why |
|---|---|---|
| Typo in a code comment or a doc | No | Behaviour is the same |
| Typo in a page text that no scenario or spec quotes | No | Nothing described becomes false |
| Rename variables, split a function, move a file (refactor); tests still pass | No | Same behaviour |
| Colour, spacing or font that no scenario or spec mentions | No | Style only |
| Dependency update with no visible change | No | Same behaviour |
| Bug: the code did not do what the spec/scenario already says, and the fix makes it do exactly that | No | The docs were already right |
| Button text that a scenario quotes (e.g. «اعمال» → «اعمال کد») | **Yes** | The scenario sentence becomes false |
| An error message that a spec rule lists word for word | **Yes** | The rule changes |
| Minimum order 200,000 → 150,000 toman | **Yes** | A rule's value changes |
| A new button, field, page or option | **Yes** | New behaviour = new card |
| A bug fix that changes what users see compared to the spec | **Yes** | Described behaviour changes |

## Steps

1. Read `MAP.md` and `MEMORY.md` (or run `rodo resume`).
2. Apply the decision rule. If the answer is "Yes", stop here and go to `planner.md`.
3. Make the change.
4. **Docs glance (one line):** if the change makes a project doc wrong (`rodo/<project>/project/*`, `MAP.md`, a `spec.md` file path or name), fix that doc too. If it contradicts a line in `MEMORY.md`, stop and ask the user.
5. Append ONE line to `CHANGELOG.md`, newest at the bottom:
   `- YYYY-MM-DD | what changed | why | files`
   Example: `- 2026-10-14 | رنگ دکمهٔ «افزودن به سبد» سبز شد | خواستهٔ مریم برای دیده شدن بهتر | src/catalog.css`
6. Commit (code + CHANGELOG line together).

A small change needs no `rodo sync` unless a card changed.
