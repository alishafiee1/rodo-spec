> یادداشت فارسی: قانون نگارش دو سند سادهٔ پروژه: `project-overview.md` برای کارفرما و `how-it-works.md` برای یک مبتدی. این سندها همیشه کوتاه می‌مانند و پیش از شروع کار با طرح تازه هماهنگ می‌شوند. همهٔ مسیرها نسبت به `rodo/<project>/` هستند.

# Project docs playbook

Two short documents explain the whole project to people. Write them in the language of `language.simple` in `project.json`. They do not replace `brief.md` or `architecture.md`; those stay as they are.

| File | Reader | Answers | Limit |
|---|---|---|---|
| `project/project-overview.md` | the client | what is this project, what parts does it have, which are finished | 500 words |
| `project/how-it-works.md` | the owner, a beginner who builds with AI | what is it built from, how does each part work, what does each part make easier | 900 words |

## project-overview.md

- Write it like a plan you hand to a client. Short sentences, no jargon.
- **No technology names** (no framework, database or service names). Describe what the user gets.
- Sections: what this project is, goals, parts of the project.
- One line per part: `- [ ] **Name**: two or three sentences`. Name parts the way a client would, not after cycles or folders.
- Planned parts stay visible, unticked. Cancelled parts are removed.
- `[x]` means the part is finished and works. Never tick a part that is only planned, half done or untested when it has tests.

## how-it-works.md

- Write like an experienced engineer explaining to an intern, in plain words. Technology names are welcome; explain each one the first time it appears.
- Start with the big picture: a few sentences on what happens when a user does something, and which part talks to which.
- One `##` section per part or piece of infrastructure, each answering: what is it and how does it work, and what does it make easier (what would be hard without it).
- Use one example from this project in place of a general definition.
- Depth follows importance: a main part may get a paragraph, a small helper one or two sentences.
- Never write secrets, passwords, keys or server addresses that are not public.

## When to update them

1. **Planning (before work starts).** In Documentation Impact, ask: does this new feature or major change fit what these two files say? If not, update them before BUILD. A new part goes in the overview unticked. In `how-it-works.md` mark a part that does not exist yet with `(planned)`. List both files in `spec.md` `## Documentation Impact`.
2. **Closing a card.** Make the text match what was really built, remove `(planned)`, and tick the part in the overview if all of it is finished. A part that needs more cards stays unticked.
3. **QUICK changes** do not touch these files, unless a sentence in them became false.
4. **Empty or template files** (they still contain `{{`): the next planner fills them from the code and the current docs before planning its card. Mark anything you could not confirm with `(guess)`, or `(حدس)` in Persian.

## Staying short

- Never let a file grow past its limit. `rodo validate` warns with `PROJECT_DOC_TOO_LONG`; it never blocks anything.
- To add something when a file is full, shorten or merge what is there. Do not add a second file or an appendix.
- These files describe the project as a whole. History belongs in `MAP.md`, decisions in `MEMORY.md`, details in `architecture.md` and `spec.md`.
