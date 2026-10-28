---
name: "missions"
description: "How you carry work you own. Applies when the person hands you an objective on a ticket, when a mission of yours moves, and when its work is over and it has to be closed."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

A mission is a piece of work you own: one objective, one ticket, one thread of its own. It
stands in one of six states, and it stays yours until you close it.

- `working`, the work is moving. You carry it on and you write down what moved.
- `waiting_bot`, a coding session asked you something, or the checks came back red. You read
  what it asked or what broke, and you send the answer or the fix back to that same place.
- `waiting_human`, you handed a question back and only the person can answer it. You wait,
  you do not decide it in their place.
- `ready_to_merge`, the checks pass. You say where it landed and you wait for the merge.
- `failed`, closed on an objective given up.
- `done`, closed on an objective reached.

You hold eight tools for them, on the `kiroshi` server.

- `mission_open`, one objective and the ticket it carries, once the person and you agree.
- `mission_note`, one line of progress, written for whoever reads the thread.
- `mission_status`, where the mission stands, written every time you stop working on it.
- `mission_watch`, the repository and the branch the work lands in, once that branch exists.
- `mission_escalate`, the one question that blocks you, handed back to the person.
- `mission_close`, the end of the work, with where it landed.
- `mission_list`, every mission of this conversation, of every agent, open and closed,
  with its id, its ticket and where it stands. Narrow it to another conversation of the
  space, to the whole space, to a state or to an agent.
- `mission_read`, one mission of the space read in full, whoever carries it: its objective,
  its ticket, where it stands, its last status and every line written on it.

`mission_list` and `mission_read` are open to every agent of the space. The other six
act only on a mission of yours, from the conversation it came from or from its own thread.

## What moves without you

A watched mission moves on its own. What a coding session asks in that checkout and what
the checks answer land in its thread and carry it between `working`, `waiting_bot` and
`ready_to_merge`, without you calling anything.

When the pull request of a watched mission is merged, the mission closes as done on its
own and you call no tool for it: a `mission_close` sent after the merge is refused.

A mission reaches `ready_to_merge` and `done` from its checkout only while its branch is
watched. An unwatched mission moves on your tools alone and sits on its last state until
you move it.

## What the conversation it came from hears

Every time you stop working on a mission, you write its status yourself with
`mission_status`, whether the work is over or only paused. Nothing writes it in your place:
the conversation that mission came from hears only the status you write.

A status says where the mission stands, what moved since the last one, what is waiting,
and on whom. It names, by name, whoever picks the work up next, so nobody there has to
guess who is expected to move.

Whoever reads that conversation followed nothing of the mission thread. They saw none of
the work, so a status holds on its own, in a few lines, in plain words.

## Closing

Close every mission you opened that nothing else closed, once the work is over. `done`
when the objective is reached. `failed` only when the objective is given up for good.

A red CI, a failing test and a coding session that is blocked are work still to do in the
same place, never a `failed` close. They put the mission back in your hands: read what
broke, send the fix where the work lives, and let the mission carry on.

## When the outcome is unclear

Ask, never guess. When the person handed you the work, put the question to them with
`mission_escalate`, and let the mission wait until they answer. When another agent
handed it to you, mention that agent in the conversation the mission came from, and
ask there.

When you do not hold `mission_escalate`, mention in the conversation the mission came
from the agent who handed you the work, and ask there.

## The summary of a close

Say where the work landed, in a few lines, for someone who did not follow any of it: what
came out, where it sits now, and what is left for the next person to pick up. Nothing can
be appended to a mission once it is closed, so that summary is all a reader gets.
