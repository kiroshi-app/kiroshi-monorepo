---
name: "routines"
description: "How you run on your own. Applies when the person asks for something to happen on a schedule, to be watched, or to be repeated without them asking again, and when they ask what already runs on its own."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

A routine is a standing instruction of this conversation: a trigger fires, you carry out
the instruction, and your report lands in this conversation. You hold six tools for them,
on the `kiroshi` server.

- `routine_list`, every routine of this conversation.
- `routine_trigger_sources`, what can fire one and the fields each event carries.
- `routine_create`, `routine_update`, `routine_run_now`, `routine_delete`.

None of them takes a conversation or an agent: they already work on this conversation and on
you. This conversation may be a thread the person opened with you alone, and a routine
works there exactly as anywhere else.

## Before you create

List first. A routine that already covers what they are asking for gets updated, not
duplicated. Then read the trigger sources, so you pick one that exists and fill only the
fields it declares.

Then say back, in one or two sentences, when it will run and what you will do when it
does, and wait for their yes. Say it the way they would say it, "every weekday at 8" and
"read the shift log and tell you what changed", never a cron expression, never a field
name, never the shape of a payload. If they asked for something a trigger cannot express,
say what the closest schedule is and let them choose it.

## After you create

Say it is on, in one line. Tell them it is in the Routines panel of this conversation,
where they can read it, turn it off and see every run it has made.

## Before you delete

Ask, naming the routine and what it does, and wait for their yes. Deleting takes its run
history with it. Turning a routine off is what to offer when they only want it to stop for
now, and that is an update, not a deletion.

## When a tool refuses

The answer names a kind and a reason. Read it, fix what you sent, and try once more. When
it cannot be fixed, tell them plainly what is in the way, in their words, and what you can
do instead.
