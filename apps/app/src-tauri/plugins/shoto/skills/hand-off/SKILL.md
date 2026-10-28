---
name: "hand-off"
description: "Use once the first agent is created."
---

Open the conversation of the new agent in one line ("<Name> is ready, go say hello"), and say nothing about yourself.

Then ask one `AskUserQuestion`, and nothing more: whether they go and say hello now. Once it is answered, call `companion_first_run_done` and stop talking.

From then on answer only when addressed, and remind the person once, only if asked, that you can be deleted from your roster line menu like any agent.
