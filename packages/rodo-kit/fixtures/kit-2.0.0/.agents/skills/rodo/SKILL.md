---
name: rodo
description: RODO project method. Use whenever the repo has a rodo/ folder or .rodo.md cards, or the user asks to plan a feature, code a card, onboard an existing project, fix a bug, or make a small change. Tells you what to read first (rodo/MAP.md, rodo/MEMORY.md), when a card is needed, and which playbook to follow.
---

> یادداشت فارسی: این مهارت برای AI است و انگلیسی نوشته شده. نسخهٔ انسانی همین قواعد در `rodo/RULES.md` است. روش RODO فقط یک «روش کار» است: هیچ ابزاری جلوی commit یا کار را نمی‌گیرد.

# RODO method (kit 2.0.0)

RODO is a way of working, not a gate. Nothing in this kit blocks a commit or stops work. You follow it because it keeps the project understandable for the user, for other people and for the next AI session. Card-format problems are reported by the RODO watcher (`rodo` CLI) as warnings or errors; they never block anything either.

## What you always do

1. **Read first.** `rodo/MAP.md`, then `rodo/MEMORY.md`, at the start of every session.
2. **Keep the docs true.** You build and maintain the project docs in `rodo/` (`project/brief.md`, `architecture.md`, `glossary.md`, cycle docs). When code changes something a doc describes, update that doc in the same piece of work.
3. **A card for every new feature, change or improvement.** Create it before you start (planner.md) and work from it (coder.md). The only exception is a small change that does not change behaviour (small-change.md): it gets one line in `rodo/CHANGELOG.md` instead.
4. **Never delete files** without the user's OK. Propose moves and deletions and wait.

## Pick your role, then open one playbook

| Situation | Playbook |
|---|---|
| New feature, change or improvement; a change to behaviour a card or scenario describes; a stuck card the user sent back | `planner.md` |
| You were given a card to implement or continue | `coder.md` |
| The folder has code but no `rodo/` yet | `onboarding.md` |
| Typo, style, refactor or fix that does not change described behaviour | `small-change.md` |
| You write or fix tests (optional but recommended) | `testing.md` (in addition to your role) |

If you cannot tell which role you have, ask the user. Model choice is the user's; a strong model is recommended for planning only.

## Project layout

```
AGENTS.md                      pointer to this skill
rodo/
  .kit-version                 kit version installed
  config.json                  languages, test command, steps folders, kit repo
  MAP.md                       short: what, where we are, done / cancelled / next
  MEMORY.md                    key decisions, one line each with a reason
  CHANGELOG.md                 one line per small change without a card
  RULES.md                     the method for humans (Persian)
  project/{brief,architecture,glossary}.md
  cycles/
    NNN-slug/                  one card and its docs (never moved)
      card.rodo.md             the card, synced with the RODO board, NOT in git
      simple.md                what and why, in simple words (recommended)
      spec.md                  technical details, rules marked **R1**, **R2** ... (recommended for features)
      acceptance.feature       Playwright scenarios tagged @R1 ... (optional, recommended)
```

A "cycle" is simply a card plus its docs. Small work may have only `card.rodo.md` and `simple.md`.

## Languages (`rodo/config.json` → `language`)

- `simple` (default `fa`): MAP, MEMORY, brief, glossary, simple.md, scenario text, CHANGELOG, card description and step titles.
- `technical` (default `en`): spec.md, architecture.md, step definitions, code comments, commit messages.
- Gherkin keywords are always English (`Feature`, `Rule`, `Scenario`, `Given`, `When`, `Then`, `And`).

## Card format (`card.rodo.md`)

The exact format is defined by the RODO board (DATA-MODEL §3) and checked by the RODO watcher. In short:

- Frontmatter between `---` lines. Required: `schemaVersion: 1`, `boardId` (from `.rodo.json`; if the folder is not bound yet, write `SET-AFTER-RODO-INIT` and `rodo init` fills it in), `title` (1-200 chars), `status` (`todo` | `in_progress` | `blocked` | `cancelled` | `done`, see below). Optional: `id` (written ONLY by the watcher), `list`, `priority` (`none|low|medium|high|urgent`), `members` (`[username, ...]`), `labels`, `startAt`, `dueAt` (`YYYY-MM-DD`), `coverColor`, `hours` (`H:MM`), `financial`, `locked` (server only), and local-only `x-*` keys.
- Body: description (2-5 simple lines), then optional `## Progress notes`, then `## Refs`, then `## Checklist: قدم‌ها`.
- `## Refs`: `- [title](/repo/relative/path)` lines to the files the coder must read (simple.md, spec.md, acceptance.feature, code). Paths start with `/`; no `..`; max 20.
- Checklist items: `- [ ] title @username [hours: H:MM]`. `hours` = real time, never an estimate.
- `<!-- rodo:... -->` comments and a first line `<!-- RODO_ERROR: ... -->` belong to the watcher. Do not write them. If you see `RODO_ERROR`, fix the cause.

### Progress notes (recommended for every card in progress)

Update at the end of every session so the next session (or person, or model) can continue:
```
## Progress notes

- Updated: YYYY-MM-DD
- Done: ...
- Remaining: ...
- Blocker: none
```
When the card is `blocked`, `- Blocker:` holds the reason instead of `none`. When it is `cancelled`, add `- Cancelled: <reason>`.

### Optional: human approval

If the user wants to approve a card before coding (recommended when user-visible behaviour changes), the first step is `- [ ] تأیید کاربر: simple.md و سناریوها [approval]`. Only a person can tick it, in the web app; never tick it yourself. While it is unticked, wait. If the user does not want approval for this card, leave the line out. If you change `simple.md` or the scenarios after approval, tell the user what changed so they can look again.

### Optional: tests

Scenarios in `acceptance.feature` and Playwright step definitions are recommended, especially for features. If the card has them, the last step is `- [ ] تست پذیرش پاس شد`, ticked only after a real passing run (`testCommand` in `rodo/config.json`). Never weaken, delete or skip a scenario or test to make code pass. See `testing.md`.

## Statuses

A card has exactly one of five statuses:

| Status | Meaning | Who sets it |
|---|---|---|
| `todo` | Planned, not started | planner |
| `in_progress` | Being worked on | coder, when work starts |
| `blocked` | Work cannot go on: you failed twice on the same problem, or you are waiting for something (an answer from the user, an access key, another card). `- Blocker:` in Progress notes says why, in plain words | you, by yourself; tell the user |
| `cancelled` | The user decided not to do it. The card stays (never delete it); `- Cancelled: <reason>` in Progress notes; MAP gets a line under `## لغوشده` | only with the user's OK |
| `done` | Finished (and tests passed, if the card has tests) | coder |

- **Stuck:** after 2 failed attempts at the same problem (same failing test, same error), stop. Set `status: blocked`, write the problem on `- Blocker:`, and ask the user: clarify, try a stronger model, or cancel.
- **Waiting:** if you cannot continue until something arrives (an answer, a key, another card), set `status: blocked` with `- Blocker: waiting for ...`.
- **Unblocked:** when the problem is solved, set `status: in_progress` again and `- Blocker: none`.
- **Cancelled:** with the user's OK, set `status: cancelled`, add `- Cancelled: <reason>` to Progress notes, add the cycle to MAP under `## لغوشده` with the reason after `—`, and add a MEMORY line. Keep the card file, the cycle folder and its docs. Tag its scenarios `@cancelled`. A cancelled card is reopened only if the user asks: status back to `todo`, add `- Reopened: YYYY-MM-DD <why>`, move the MAP line out of `## لغوشده`.
- The RODO board shows `blocked` and `cancelled` as their own statuses. Older RODO servers that know only `todo`/`in_progress`/`done` report an error for the other two; keep the status in the file anyway and tell the user.

## Scope changes

| When | What to do |
|---|---|
| Before coding | Edit the same card and its docs |
| During coding, small change in the same feature | Update the card, scenario and spec; tell the user; continue (wait if the card has an unticked approval) |
| A big new feature | A new card. Never stretch a running card |

## MAP.md and MEMORY.md

Update them when a card is finished or cancelled (and during onboarding). Not in every coding step: many cards may run at the same time and these shared files would cause merge conflicts. The current state of work lives in the cards.

## Bugs

- The fix changes behaviour that a card, spec or scenario describes (or users will see something different) → a card (planner.md).
- Otherwise (the code simply did not do what the docs already say) → fix it + one CHANGELOG line (small-change.md).

## Tools in this kit

| Command | What it does |
|---|---|
| `node scripts/rodo-install.cjs --target DIR` | Adds the method files to a project; never overwrites a file |
| `node scripts/rodo-update.cjs` | Updates the skill and scripts from GitHub; never touches `rodo/` |
| `rodo init` (RODO CLI, when installed) | Binds the folder to a board and installs these method files the same way (never overwrites); `--method-only` needs no board |
| `rodo validate` (RODO CLI, when installed) | Reports card-format warnings and errors; never blocks |

Templates for every file are in `templates/`.
