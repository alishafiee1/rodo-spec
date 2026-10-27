# {{NNN}} — {{title}}: technical spec

> Source of truth for the coder. Written in the technical language (`rodo/config.json`). Anything not here is not expected.
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

Optional. `testCommand` from `rodo/config.json` with `{NNN}` = `{{NNN}}`.

## Decisions

- {{decision}}. Because {{reason}}.
