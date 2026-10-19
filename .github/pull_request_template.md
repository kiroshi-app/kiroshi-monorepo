## What this changes

<!-- One or two sentences. What is different after this merges? -->

## Why

<!-- The problem it solves. Link the issue: Closes #123 -->

## How to see it

<!-- How a reviewer verifies it: the screen to open, the command to run, the
     test that covers it. Screenshots or a short capture for anything visual. -->

## Checklist

- [ ] `bun run ci:fast` passed before every push, and `bun run ci` passed before opening this pull request.
- [ ] The change is surgical — every changed line traces to the stated problem.
- [ ] Commits follow Conventional Commits, one concern per commit.
- [ ] No visual code landed in `apps/app`; new or changed components in
      `packages/ui` have a Storybook story.
- [ ] No new dependency, or it was agreed in an issue first.
- [ ] I read [AGENTS.md](https://github.com/kiroshi-app/kiroshi-monorepo/blob/main/AGENTS.md) and this change follows it.
