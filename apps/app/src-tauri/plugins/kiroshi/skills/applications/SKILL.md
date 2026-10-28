---
name: "applications"
description: "How you install an application from the conversation. Applies when the person asks for an application or an MCP server, and when the work needs a tool you do not hold."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

An application is an MCP server added where you work: one this app curates, or one the
public registry lists. You hold three tools for them, on the `kiroshi` server.

- `application_search`, the applications matching a query, the curated ones first, each with
  its name, what it does and the install case it needs.
- `application_install`, one application written under its name in one destination.
- `application_status`, where an application stands in one destination: not installed,
  connected, needs authorization, connecting or failed.

The path below applies when the person asks for an application or asks for one to be
installed. When you hold no tool for what is asked and the person asked for no install,
go to `When no tool of yours does it`.

## Search first

Search before you install. Install only an application `application_search` answered, under
the exact name it answered. When the search names a registry failure, say the registry
could not be read and offer the curated matches it still answered.

## Ask where it goes

The destination is the one thing you ask. Ask it with `AskUserQuestion`, naming you, the
space of this conversation and the person, as these three destinations and no other:

- `companion`, you alone, in every conversation you are part of.
- `space`, every agent of the space of this conversation.
- `user`, the person, in every space and for every agent.

Ask it with `metadata.source` set to `application-scope:` followed by the name
`application_search` answered, exactly as it answered it, so `application-scope:superset` or
`application-scope:com.notion/mcp`. It is never shown to the person.

Install only in the destination the person picked, once, and never in a second one. Never
pick it in their place.

## Keys stay out of the conversation

Never ask for a key, a token or a password, and never repeat one. When the person types a
key anyway, do not repeat it and do not use it: tell them it is entered in Settings.

## What you say once it is installed

The install answers its case. Say what follows for that case, and nothing more.

- `nothing`: it is installed and there is nothing left to do.
- `key`: say the name of the secret the install answered, and that the person enters it in
  the Settings panel of that destination: yours for `companion`, the space's for `space`,
  their own for `user`.
- `oauth`: say that Connect lives in the Settings panel of that destination, and that the
  person signs in from there.

When the install answers `alreadyInstalled`, say it is already there and change nothing.
When the person asks whether it works, read it with `application_status` and say what it
answered.

## When no tool of yours does it

The person asks for something no tool of this session does: a capability none of your
tools holds. Not a refusal of scope, not a rule you follow, not something the person
already ruled out.

You look yourself: call `application_search` on that capability. Never ask the person
whether to look.

When the search answers no match, you name the capability that is out of reach, you say
you cannot do it, and the search stays unmentioned.

When the search answers a match, you name one application and say in one line what it
unblocks, and that the person installs it from Settings. One offer per subject, never a
second application. Never call `application_install` here.

When the person has turned an offer down, you never raise it again in this conversation.
