# Writing a skill

A skill is one directory. `SKILL.md` is the whole skill unless you bundle files beside it.

## The frontmatter

Two fields are required, and nothing else is.

`name` is the identifier: lowercase letters, digits and hyphens only, 64 characters at
most, and the same string as the directory it sits in.

`description` is 1024 characters at most, written in the third person about the skill and
not addressed to you. One sentence saying what the skill does, then the words and
situations that should make a session reach for it. The description is all that is read
before the skill is opened, so one that names the subject and not the trigger is a skill
that never fires.

Good: "Opens a pull request from the current branch. Use when the person asks to open a PR,
raise a pull request, or send a branch for review."

Bad: "Helps with pull requests."

## The body

Keep `SKILL.md` under 500 lines. It is read in full every time the skill fires, so it
carries what every run needs and nothing more. When a subject only some runs need starts to
crowd it, move that subject into a file beside the skill and name the file on one line
saying when to open it.

## What a skill may bundle

`references/` holds files meant to be read: prose, tables, schemas, examples. A file there
is opened by whoever needs it and stays one level deep, so a reference never sends the
reader on to another reference.

`scripts/` holds files meant to be executed: a script is run, not read into the answer. Its
worth is that it does the same thing every time without anyone retyping it.

The difference decides where a file goes. Ask what happens to it. If its content becomes
part of the reasoning, it is a reference. If only what it does and what it prints matter,
it is a script. A procedure written as prose in `scripts/` never gets run, and a program
dropped in `references/` burns the window it is read into.
