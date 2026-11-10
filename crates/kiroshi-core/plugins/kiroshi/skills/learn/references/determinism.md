# How much freedom to leave

## Three degrees

Choose one per step, by what changes between two runs.

A literal command, when the step is the same on every run. Write the command itself:
`git push --set-upstream origin "$BRANCH"`, never "push the branch upstream". Any step that
does not vary is written as the command rather than as a description of it, because a
described command is retyped from memory each run and drifts, while a written one cannot.

A template with named parameters, when the step keeps its shape and a few values change.
Write the command with those values as named placeholders, and declare every placeholder
under Inputs.

Open judgment, when the step cannot be written as a command because the right move depends
on what the run finds. Say what to reach and what to weigh, and leave the how alone. Keep
it for the steps that need it: reaching for it because writing the command is tedious turns
a procedure into a suggestion.

## The shape

Write a repeated procedure in three parts.

Inputs lists every value that differs from one run to the next, one line each, with where
it comes from. A value absent from that list is a constant, and a constant belongs written
into the Procedure.

Procedure is numbered steps in order, each one a literal command or a template whose
placeholders are all declared in Inputs.

Verify says how the run knows it worked: the command to run and the output that counts as
success.

## Opening a pull request

### Inputs

- `BRANCH`, the branch name, from the person or from the change being sent.
- `MESSAGE`, the commit message, one Conventional Commits line.
- `BODY`, the pull request body.

### Procedure

1. `git switch -c "$BRANCH"`
2. `git add -A`
3. `git commit -m "$MESSAGE"`
4. `git push --set-upstream origin "$BRANCH"`
5. `gh pr create --base main --head "$BRANCH" --title "$MESSAGE" --body "$BODY"`

### Verify

`gh pr view --json url,state` prints a state of `OPEN` and the address of the new pull
request.

Nothing else there varies. The base branch, the remote and the five commands are the same
on every run, so they are written out instead of described.
