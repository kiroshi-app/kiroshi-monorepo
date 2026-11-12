# Animation plans

Written by an audit of `packages/ui` and `apps/app` at commit `fbf3195dd`. The audit found no feel-breaking motion: every plan here is LOW severity polish, and plan 005 starts with a measurement that may conclude nothing needs to change.

Each plan is self-contained: an executor needs the plan file and the repository, nothing else.

| # | Plan | Severity | Category | Status |
| --- | --- | --- | --- | --- |
| 001 | [Land the roster row and bubble press at once under reduced motion](001-press-lands-at-once-under-reduced-motion.md) | LOW | Accessibility | TODO |
| 002 | [Give each reduced motion constant one name and one home](002-one-name-per-reduced-motion-constant.md) | LOW | Cohesion & tokens | TODO |
| 003 | [Drop the geometry transitions the roster rows never run in the app](003-drop-roster-row-geometry-transitions.md) | LOW | Performance | TODO |
| 004 | [Put the History undo control back on the house button recipe](004-history-undo-on-the-house-button-recipe.md) | LOW | Cohesion & tokens | TODO |
| 005 | [Measure the agent avatar paint loop](005-measure-the-avatar-paint-loop.md) | LOW, unconfirmed | Performance | TODO |

## Recommended order

1. 001
2. 003
3. 002
4. 004
5. 005

## Dependencies

- **001 before 003.** Both edit `ROSTER_ROW` in `packages/ui/src/components/sidebar-list-row.tsx:19` and the `Pressed` story in `packages/ui/src/components/sidebar-list-row.stories.tsx`. Each is written as a substring replacement that tolerates the other, but running them in this order keeps the excerpts in 003 closest to what the executor will find.
- 002, 004 and 005 are independent of every other plan and of each other.

## Notes for whoever runs these

- One plan per commit, Conventional Commits; each plan ends with a suggested message. Work on a feature branch, never on `main`.
- 003 has a precondition step that proves the app never renders the collapsible sidebar state. If it fails, the plan stops by design.
- 005 changes code only when its own measurement crosses the threshold written in the plan. "Measured, no change" is a valid way to close it.
- Every plan carries a feel check. Motion can pass lint, types and tests and still feel wrong; do the check in Storybook or the running app before closing a plan.
