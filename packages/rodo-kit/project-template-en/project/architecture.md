# Architecture

## Parts

| Part | Technology | Path in the repo | Why this choice |
|---|---|---|---|
| {{e.g. website}} | {{Next.js}} | `{{src/}}` | {{reason}} |

## Main data

{{entities and how they relate, briefly}}

## Tests

- Acceptance tests are optional and recommended. Scenarios live in `rodo/<project>/cycles/*/acceptance.feature`; one cycle runs with `testCommand` in `project.json` (`{NNN}` is replaced by the cycle number). Cancelled cycles are tagged `@cancelled` and skipped.

## Rules everyone must know

- {{e.g. all prices are stored as whole cents}}
