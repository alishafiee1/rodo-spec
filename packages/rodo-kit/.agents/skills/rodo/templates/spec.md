# {{NNN}} — {{title}}: technical spec

> Source of truth for the coder. Written in the technical language (`project.json`). Anything not here is not expected.
> Every rule has a bold ID (**R1**, **R2** ...). If the card has scenarios, tag each scenario with the rules it proves (`@R1`) and try to cover every rule.

## 1. Summary

{{three lines}}

## 2. Rules

- **R1** {{rule}}
- **R2** {{rule, including the exact error message the user sees}}

## 3. Data

{{new tables/fields, types, constraints}}

## 4. API / logic

{{endpoints, inputs, outputs, errors}}

## 5. Screens

{{what is shown where; exact message texts}}

## 6. Files to create or change

- `{{path}}` — {{what}}

## 7. Edge cases

- {{case}}

## 8. Acceptance run (if the card has scenarios)

Optional. `rodo test` (the card's `test.command`, or `testCommand` from `project.json` with `{NNN}` = `{{NNN}}`).

## Acceptance criteria

- **Must happen:** {{observable results; link rules, e.g. R1, R2}}
- **Must not happen:** {{regressions or side effects that would be wrong}}
- **Done when:** {{how we know: which checks pass, what the user can see}}

## Documentation Impact

- {{path}} — {{what changes}}   <!-- or: - none — why -->

## Open Questions

- {{question}} — default if no answer: {{default}}   <!-- or: - none -->

## Decisions

- {{decision}}. Because {{reason}}.
