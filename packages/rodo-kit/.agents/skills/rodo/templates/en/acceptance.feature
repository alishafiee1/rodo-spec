# Acceptance scenarios (optional, recommended). Never weaken a scenario to make the code pass.
# Keywords are English (for the tools); tag each scenario with the spec.md rule it proves (@R1).
@cycle-{{NNN}}
Feature: {{cycle title}}

  @R1
  Rule: {{one rule from simple.md}}

    Scenario: {{main path}}
      Given {{starting state with real values}}
      When {{what the user does}}
      Then {{what the user sees}}

    @R2
    Scenario: {{error case}}
      Given {{...}}
      When {{...}}
      Then {{the exact message the user sees}}
