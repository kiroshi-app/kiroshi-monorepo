# Per-bot plugins — observed behaviour

Everything below was measured against the real install before any code was written,
the same way `PROTOCOL.md` was. Claude Code **2.1.237** and
`@anthropic-ai/claude-agent-sdk` **0.3.x** on macOS. The SDK's version tracks the
executable's (`0.3.201` ships `2.1.201`), and the SDK translates its options into
the CLI flags below, so a fact measured on one holds on the other.

## Shape

A bot is a plugin directory that is loaded for the session and never installed:

```
<bot>/
  .claude-plugin/plugin.json     name, version, optional "mcpServers": "./.mcp.json"
  agents/<slug>.md               frontmatter + body (the bot's system prompt)
  skills/<name>/SKILL.md         catalogue entries, loaded on demand
  .mcp.json                      servers this bot may reach
```

This app lays those out under one marketplace, so a reader adds a single path and
has every bot rather than one plugin at a time — see `bundles.rs`:

```
<app data>/bots/
  .claude-plugin/marketplace.json   every bot, by id and relative source
  plugins/<bot id>/                 the bundle above, one per bot
```

A name is not an identity — it changes, and two bots can share one — so the plugin is
named by the bot's id and carries the reader's name as `displayName`, the generated
agent marks itself with the id under `metadata`, and the session promotes the
namespaced `<bot id>:<agent>`. The bare form resolves too, and it would race a
`~/.claude/agents/<slug>.md` the reader wrote.

The generated files are the manifest and the one agent. Everything else in a bundle
belongs to whoever put it there, and the agent file on the disk is the truth: a body
edited by hand is adopted, and the stored value is the fallback for a bundle that has
gone missing.

```ts
query({ options: {
  plugins: [{ type: "local", path: bundlePath }],   // → --plugin-dir
  agent: `${pluginName}:${slug}`,                   // → --agent
  systemPrompt: { type: "preset", preset: "claude_code", append },
  settingSources: [...],                            // → --setting-sources
}})
```

## Loading — verified

`--plugin-dir` loads a directory that was never installed. The init frame reports it
as `source: "<name>@inline"` with its path, nothing is written to `~/.claude`, and
the plugin's `.mcp.json` servers connect as `plugin:<name>:<server>`.

`--agent` resolves an agent from that directory under both its bare name (`probe`)
and its namespaced name (`spike:probe`).

## Two plugins in one session — verified

Measured on 2.1.239: two `--plugin-dir` directories load in the same session. The init
frame reports both, each skill is listed under its own plugin's namespace
(`<plugin>:<skill>`), and a skill belonging to the second plugin invokes as readily as
one belonging to the first — neither shadows the other.

That is what a session is built from: the bot's bundle, whose agent the main thread is
promoted to, and the app's own plugin, which carries what the host owns rather than
the bot (`learn` today, shared MCP servers later). The bot's comes first, the app's
second; the app's is never promoted, since nothing in it is an agent. A session opened
without a bot's bundle loads neither.

The two are written differently, and that is the whole shape:

```text
<app data>/bots/plugins/<bot id>/     the bot's — the disk is the truth
  .claude-plugin/plugin.json          name: <bot id>
  agents/<slug>.md                    the brief a session is promoted to,
                                      with the block the bot keeps what it learned in
  skills/<name>/SKILL.md              a procedure a task triggers, the bot's to write

<app data>/system/kiroshi/           the app's — the host is the truth
  .claude-plugin/plugin.json          name: kiroshi
  skills/learn/SKILL.md               the rules every bot remembers under

<app data>/user/me/                   the person's — they are the truth
  .claude-plugin/plugin.json          name: me
  skills/about-me/SKILL.md            what every bot knows about them
```

The bot's bundle is completed rather than written over: a body edited by hand is
adopted, and the memory block and the skills the bot wrote are carried over. The app's
plugin is rewritten whole at every launch from the text in `bundles/system.rs`, and
nothing reads it back — one
text for every bot instead of a copy in each bundle that a bot could edit into
something else. It sits outside `bots/`, so it is in no marketplace and in no bot's
skill listing.

It reaches the sidecar as `systemPluginPath` on the open request, beside the bot's
`pluginPath` and only ever with one — see `PROTOCOL.md`.

The person's plugin is the opposite of the app's: every file is written only when it is
missing, and never rewritten, because what is in it is what the bots wrote there for the
person. It is a git repository of its own, committed at the end of any turn that changed
it with the bot as author, under the title the bot left in `.learned.md` — the same
versioning a bot bundle gets. Two sessions ending together are serialised on one lock, so
neither loses its change. It reaches the sidecar as `userPluginPath`.

Both are bridged for servers the same way — `strictMcpConfig` drops what either
declares, so both `.mcp.json` files are read and merged into one `mcpServers` option,
the bot's names applied last so a bot keeps its own on a clash.

The bot is told which directory is its own through the prompt layer, not a hook: with
two plugins loaded, one appended sentence naming `pluginPath` is the only thing that
says where its skills live.

## `agent` without `systemPrompt` is silently ignored — verified

Under the SDK, omitting `systemPrompt` starts a minimal prompt and **the agent's body
is never applied**. The failure is silent: the agent still resolves, its `model` is
still honoured, it still appears in the init frame's agent list, and it answers as
plain Claude.

| Options | Reply to "what is your codename?" |
| --- | --- |
| `agent` only | "Claude." |
| `agent` + `systemPrompt` preset | "ORCHID." |

The preset in `providers/claude/session.ts` is therefore **required for `agent` to do
anything at all**, not merely a way to keep Claude Code's own prompt. Removing it
looks like a simplification and silently strips every bot of its brief.

`append` composes with `agent`: a bot answered `"ORCHID KIROSHI-GLOBAL"` with both set.

## The prompt layer and the output style — verified

Measured on 2.1.239, three findings that between them fix how a session is composed.

| Measured | Result |
| --- | --- |
| `systemPrompt: { preset: "claude_code", append }` with an `agent` | **both answer** — the bot's brief and the appended layer are obeyed in one reply |
| `systemPrompt: "<a string of ours>"` with an `agent` | the preset is **replaced** and the agent is lost with it — the bot answers as plain Claude |
| the built-in `Concise` style, under an `agent` and an `append` | **survives**, in its condensed form (`"Be concise: lead with the result…"`) |

- Consequence: what this app has to say on every turn goes in the `append` and nowhere
  else. A prompt of our own is the one shape that silently costs a bot its brief, and it
  is the shape a "just set the system prompt" change reaches for first.
- Consequence: an output style is a third voice that composes with the other two rather
  than overriding either. It is asked for by name, and the names are the provider's.
- `settingSources: []` means no `settings.json` on the machine is read, so a style has
  only one route left: the SDK's `settings` option, passed inline as
  `{ outputStyle: "<name>" }`. `buildOptions` passes the key only when the host names a
  style — an empty object would still be a settings layer, and the highest-priority one.

The layer itself carries the **speaking situation only** — one reader, that reader's
language, short answers that lead with structure, no path or status report or tool
narration unless asked, and never Claude Code's name or a word about its own machinery.
It grants no capability and names no tool, which is what makes it safe to compile into
every session: a bot exported out of this app loses the chat window it was speaking in,
never anything it can do.

## Frontmatter — what survives promotion

An agent file is written to be *delegated*. Promoting it to the main thread honours
only part of it.

| Field | Delegated | Promoted via `agent` |
| --- | --- | --- |
| body | system prompt | system prompt |
| `model` | honoured | honoured, and `--model` overrides it |
| `tools` / `disallowedTools` | honoured | honoured — `tools` dropped a session to exactly `[Bash, Read]`, and `disallowedTools: [Bash, Edit, Write, NotebookEdit]` took it from 33 tools to 29 |

| `description` | routes delegation | unused |
| `skills` | **preloads full content** | **inert** |
| `permissionMode` | honoured | **ignored** — session stayed `default` under `bypassPermissions` |

A bundle can therefore *reduce* capability but never *raise* it: a bot declaring
`bypassPermissions` cannot escape the host's permission gate. The one surface that
does add capability is the bundle's `.mcp.json`, which starts processes.

Since the key is ignored on the promoted path, the mode is the host's to set, and it
sets `permissionMode: "auto"` on every session — `buildOptions`, bundle or not.
Measured on 2.1.239 in `-p` mode, on the same prompt asking for one file write inside
the working directory:

| Mode | Result |
| --- | --- |
| default | refused — *permission to write … was not granted* |
| `--permission-mode auto` | the write lands, nothing to answer |

- Consequence: a bot acts on its own by default. What `auto` still escalates keeps
  arriving at `canUseTool` and at the reader's dialog, so the gate is unchanged.
- Consequence: "this bot cannot change anything" stays the brake — a bundle naming
  `Write` and `Edit` in `disallowedTools` still refuses them under `auto`.
- Measured beside it: `disallowedTools` binds the promoted thread and not the one
  `Task` starts. A bot denied every changing tool and left free to delegate had a
  subagent write the file — under the default mode that write reached the reader's
  dialog, under `auto` it lands with nothing to answer.
- Consequence: `Task` — the name the `init` frame lists delegation by — is denied
  with the four. A bot that changes nothing starts nothing that changes anything
  either, so the lock writes five names into the key and lifts all five at once.

## A bundle's own hook, and what a bot writes mid-session — verified

Measured on the real binary, 2.1.239. Three findings, and the whole reason a bot is
handed its directory rather than left to look for it. No bundle carries a hook any
more — the appended prompt layer names the directory, which is one file fewer in every
bot's bundle — and this is what was measured before that.

| Measured | Result |
| --- | --- |
| `hooks/hooks.json` in a loaded bundle | fires at `SessionStart` with `CLAUDE_PLUGIN_ROOT` set, and its `additionalContext` is in context at turn zero |
| `echo $CLAUDE_PLUGIN_ROOT` in the bot's own `Bash` | **empty** |
| a `SKILL.md` written mid-session | `Unknown skill` until the next session; visible on resume |

- Consequence: the path of a bundle reaches the bot through the prompt layer or not at
  all. Its own shell cannot tell it, and a hook — the only other route — is one
  generated file in every reader's bundle for one sentence the layer says for free.
- Consequence: a skill a bot writes is memory for the *next* session. Nothing recompiles
  mid-turn, so a bot that reads its own write back is reading a file the session has not
  loaded — which is why the rule it writes under says the write lands at the next
  message.
- A hook is a command, not a value: a script printing `PLUGIN_ROOT=$CLAUDE_PLUGIN_ROOT`
  said the right thing in every bundle whatever the reader's disk called it — which is
  what the layer does now without writing anything.

## `skills:` does not preload on the promoted path — verified

The documentation states the field injects "the full skill content, not only the
description". That holds when the agent is delegated, and not when it is promoted.
Four converging measurements:

| Path | `skills:` declared | `Skill` tool called | Content present at turn 0 |
| --- | --- | --- | --- |
| delegated via `Task` | yes | no | yes |
| promoted, non-triggering skill | yes | no | never received |
| promoted, plain fact to recall | yes | **yes** | no |
| promoted, no field at all | no | yes | no |

The third row is decisive: the skill held `Build 7741 has the codename ORCHID-SPICE`,
no instruction and so no injection smell, and the promoted agent had to fetch it.

Skills still work: a skill whose `description` is imperative is loaded at turn 1 and
stays resident afterwards (turn 2 required no reload). But the loading is the model's
judgement, it costs a round trip, and it lives in the conversation, so compaction can
evict it. A body full of "answer in one short line" was enough to stop an agent from
loading its own skills at all.

## The compiled body — the mechanism this repo uses

What must be true on every turn goes in the agent's body, which is the system prompt
on both paths.

- A 42 KB body was loaded whole; a fact buried in its middle came back with no tool call.
- The same compiled agent, **delegated**, answered from its body too. Promoted and
  delegated behave identically.
- Consequence: `skills:` must be **absent** from a compiled agent. Left in, a delegated
  run would preload the content that the body already carries, doubling it and making
  the bot behave differently depending on who called it.
- `permissionMode` must likewise never appear in a bundle; the host owns permissions.

With those two rules, one file behaves the same whether Kiroshi promotes it, Superset
launches it, or an orchestrator delegates to it.

### It is worth the tokens

`frontend-engineer` (17 declared skills, 47 KB compiled) was asked the same question in
both forms. Neither called `Skill`. On disabling a submit button:

- classic: "Save disabled unless `isDirty && isValid`"
- compiled: "submit disabled on `isSubmitting` only, never on `!isValid`"

Its own `forms-validation` skill, line 17: *"Disable submit during `isSubmitting`; never
gate it on `!isValid`"*. The classic form contradicts its own doctrine, with confidence
and without ever consulting it. Cost: about 11k extra prompt tokens, 0.9 s, and prompt
cache engaged from the second call.

### A carried skill is still in the catalogue — verified

A skill copied into the body does not leave the session: it is still a
`skills/<name>/SKILL.md` in the bundle, so it is still listed for the `Skill` tool. Same
bundle, same question, only the skill's frontmatter differing:

| Skill frontmatter | `Skill` tool called | Answer |
| --- | --- | --- |
| carried in the body | **yes** | correct, after a round trip |
| carried, plus `disable-model-invocation: true` | no | correct, straight from the body |

The first row is the cost: the model fetched what it had already been given, paying a
round trip for it and leaving the same text in context twice.

- Consequence: **preloading and model invocation are contradictory settings.** A skill
  whose body is in the system prompt has nothing left to be invoked for, and leaving it
  invocable buys a duplicate.
- Whatever writes `metadata.kiroshi.preload` should write `disable-model-invocation`
  beside it. That is a decision about a file the reader owns, so it belongs to the
  interface that marks a skill, not to the writer that carries one.

### The app's own skills ride the layer, not a body

The compiled body is a bot's mechanism. The app's plugin has no agent to compile into,
and copying its text into every bundle would put the app's words in files a bot owns —
so the app's preloaded skills reach the model through the same `append` the layer rides.

`preloadedSkills` in `sidecar/src/providers/claude/system-skills.ts` reads
`<pluginPath>/skills/*/SKILL.md`, keeps the ones whose frontmatter carries
`metadata.kiroshi.preload: true` and whose body is not empty, and `layerFor` in
`system-layer.ts` appends each body under a `# <name>` heading. The app's land below the
sentence naming the bot's own directory; the person's land above it, under a sentence
naming the directory the bot writes what it learns about them into.

- The `append` composes with `agent` and `skills:` preloads nothing on the promoted path
  — both measured above — so the layer is the only route the app's text has.
- The plugin is rewritten at every launch, so an edit to `learn` is in force at the next
  session of every bot: no bundle is rewritten, and no exported bot carries app text.
- A session with no `systemPluginPath`, or one whose plugin marks nothing, appends
  nothing for it.
- The bot's own preloaded skills stay compiled in its body. The two mechanisms carry
  different texts and never the same one.
- `learn` is written with `disable-model-invocation: true` beside its preload mark, so
  the body the layer already carries is never fetched a second time — the duplicate the
  row above prices. The two marks are written together by whatever writes the plugin,
  `bundles/system.rs`.

## Resume — flags are not sticky

`--resume` **without** re-passing `--plugin-dir` and `--agent` replays the conversation
but reloads neither: the plugin is absent from the init frame and the agent no longer
exists. The bot still sounds like itself because it reads its own transcript, so the
loss is invisible. Re-passing both restores everything, brief included.

**Every option is rebuilt on every spawn.** Never once at first launch.

## Isolation

Every session is built with **`settingSources: []`** and **`strictMcpConfig: true`**,
with or without a bundle. That is what makes an exported bot the same bot anywhere.

`--setting-sources project --strict-mcp-config` cut a session from 203 tools to 33,
100 skills to 17, 24 agents to 6 and 14 MCP servers to 0, leaving only the bundle.
`[]` goes one step further than `project`: it drops the `CLAUDE.md` files too, which
`project` still reads. Default (no `settingSources`) inherits the user's whole
configuration, including `SessionStart` hooks.

`strictMcpConfig` ignores every MCP configuration that was not passed as an option —
project `.mcp.json`, user settings, **and plugins**. **Plugin servers do not survive
it**: measured, a bundle declaring a stdio server through its own `.mcp.json` reached a
child that answered there was no such tool. **They are bridged instead** — the sidecar
reads `<bundle>/.mcp.json` and passes its `mcpServers` map as an option, under the names
the bundle gives them, so a bot's own servers are the only ones a session holds.

`settingSources: []` closes the settings and the `CLAUDE.md` files, and leaves one thing
open: the memory the CLI derives from the working directory. `autoMemoryEnabled` sits in
a settings file no longer read, so the child is given
**`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`** in its environment instead — otherwise two bots
sharing a working directory read each other's memory.

Measured live (`tests/real_claude.rs`, `#[ignore]`), a word planted in each place a
session reads from, and a word only the bundle's server can answer:

| Planted in | Reaches the child |
| --- | --- |
| `CLAUDE.md` of the session's cwd | **no** — the child answers `NONE` |
| `~/.claude/projects/<cwd-slug>/memory/MEMORY.md` | **no**, with the variable set; **yes** without it |
| the bundle's own `.mcp.json`, as a stdio server | **yes**, through `mcpServers`; **no** through the plugin |

The bundle's own brief survives all of it — the same turns obeyed it.

## The tool names come off the `init` frame — verified

There is no control request that lists tools: `initializationResult()` carries
commands, agents, models and the account, and no tool names. The `system` / `init`
message carries `tools`, and nothing else does.

The frame is emitted **when a turn begins**, never before it. A streaming session
opened and left unprompted for 20s produced two `hook_started` / `hook_response`
pairs and no `init`; the same session prompted with one character produced `init`
3.9s later, ahead of any reply. Reading the catalogue therefore costs a turn that
is started and closed on the frame, unlike `supportedModels()`, which costs a
handshake.

The list is the *effective* one: it holds every built-in the session was given plus
every `mcp__<server>__<tool>` its configuration reached, and it leaves out whatever
`disallowedTools` denied — which is why a bot's own session cannot be asked what it
denies. The catalogue is taken from a session of the install's own, in a temporary
directory, with the `mcp__` names filtered out.

## Deliberately not used

- `--append-system-prompt-file` works and takes any size, but it is absent from `--help`
  and only mentioned inside the `--bare` blurb. The compiled body removes the need for it.
- `@path` imports inside an agent body are **not** resolved. The model receives the path
  as text and tries to `Read` it.
