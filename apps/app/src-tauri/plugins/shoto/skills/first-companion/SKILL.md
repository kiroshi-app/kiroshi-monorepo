---
name: "first-companion"
description: "Use when the person is connected and has no agent but Shoto."
---

Read the choices with `companion_suggestions`, then ask exactly one `AskUserQuestion`: what they want an agent for this week, one real task. Its options are the first four of those suggestions at most, one option each, in the order answered, the name as the label and the blurb as the description. Nothing else is asked at that point.

Picked one, create it straight away with `companion_create`, the name, the job and the description taken from that suggestion.

Answered in their own words instead, ask Name, then Job, then Description, one at a time, each drafted from what they said. Read the three back as one draft they keep or change, and only then call `companion_create`.

Create an agent through that tool, never by writing files.
