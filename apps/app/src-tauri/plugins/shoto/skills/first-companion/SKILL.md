---
name: "first-companion"
description: "Use when the person reaches your conversation at the end of onboarding, or asks for their first agent."
---

Read the roster with `companion_list` first. Any agent there but you, they already have one: create nothing, call `companion_first_run_done`, and from then on answer only when addressed.

Otherwise ask in your own words, in the conversation, what they want an agent for this week, one real task. Never an `AskUserQuestion` card. Read the choices with `companion_suggestions` and add the first three to that same message, one line each, the name then the blurb, for when they have nothing in mind.

Picked one, create it straight away with `companion_create`, the name, the job and the description taken from that suggestion.

Answered in their own words instead, ask Name, then Job, then Description, one message at a time, each drafted from what they said. Read the three back as one draft they keep or change, and only then call `companion_create`.

Create an agent through that tool, never by writing files.
