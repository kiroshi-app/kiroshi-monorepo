# Agent sidecar — the protocol the host speaks

Every conversation turn goes through the sidecar (`apps/app/sidecar`), a single
compiled Bun binary carrying its provider's own agent SDK. The host never spawns
an agent itself: it spawns the sidecar, and the sidecar decides how its provider
is spelled. Nothing below names a CLI flag, because the host no longer sets any —
a second provider is one more module inside the sidecar.

The host resolves no executable of its own. Its connection state and its model
catalogue are both asked of the sidecar, so nothing here reads a `PATH`.

## Process shape

```
kiroshi-agent --serve [--provider=<id>]
```

**One process for every session.** stdin is NDJSON commands from the host, stdout
is NDJSON frames back, stderr is a separate pipe the host drains and discards. A
session is a lane on that one pipe, opened and closed by command, and the process
outlives every one of them.

## Handshake

The sidecar's first stdout line, before any session exists:

```json
{"type":"ready","provider":"<id>","version":"2.1.237","sdkVersion":"0.3.237",
 "capabilities":["partialMessages","resume","interactivePermissions","modelCatalogue",
 "toolCatalogue"]}
```

Same payload `--probe` prints. `capabilities` is a contract, not a description:
what the sidecar does not announce, the host does not ask for — a build that
names no `partialMessages` is opened with `includePartialMessages: false`, and
the reader sees whole messages instead of a stream that would never arrive.

A sidecar that never announces itself surfaces as `startupTimeout`; one that dies
first, as `crashed`.

## Host → sidecar

These commands name no session, because they are about the install or about one MCP
server rather than about a conversation. The first three are asked once per launch
and cached by the host.

Each is answered under the type it was asked, so one name stands for the ask and
its answer both.

| `type` | Answered with | Becomes |
| --- | --- | --- |
| `check` | `{"type":"check","authenticated":bool,"authMethod"?:string,"detail"?:string,"account"?:{"email"?:string,"plan"?:string}}` | the `CheckReport` for `agent_check`, and for `agent_account` the `CheckReport` plus its `account` |
| `sign_in` | `{"type":"sign_in","signedIn":bool,"error"?:{"kind":"busy"\|"cancelled"\|"timedOut"\|"failed","detail"?:string}}` | the outcome `agent_sign_in` resolves on |
| `sign_in_code` | nothing | the `text` it carries, written to the stdin of the running sign-in |
| `sign_in_cancel` | nothing | the pending `sign_in`, its child killed and the ask settled `cancelled` |
| `models` | `{"type":"models","models":[…]}` | the model catalogue |
| `tools` | `{"type":"tools","tools":[…]}` | the tool catalogue |
| `mcp_oauth_authorize` | `{"type":"mcp_oauth_authorize","credentials"?:{…},"error"?:{"kind":…}}` | the grant `mcp_oauth_connect` stores |
| `mcp_oauth_cancel` | — | the pending `mcp_oauth_authorize`, settled `cancelled` |
| `mcp_oauth_revoke` | `{"type":"mcp_oauth_revoke","revoked":bool,"detail"?:string}` | the `Disconnected` a `mcp_oauth_disconnect` answers |
| `mcp_oauth_refresh` | `{"type":"mcp_oauth_refresh","credentials"?:{…},"error"?:{"kind":"rejected"\|"failed",…}}` | the grant written before a session opens, or what the refusal code costs it |

An `error` whose refused request answered a body that reads as an OAuth error carries
that error's `error` value as `code`, beside `detail`, `step`, `status` and `body`. A
redirect carrying an `error` parameter carries that parameter as `code` too.

`mcp_oauth_refresh` answers `rejected` only when the token endpoint names `invalid_grant`,
`invalid_client` or `unauthorized_client`. Any other OAuth error, an answer carrying none,
and an authority that was never reached are `failed`. The host reads what a refusal costs
from `code` alone, the rule the SDK's own `auth()` applies:

- `invalid_grant` deletes `KIROSHI_OAUTH_ACCESS_TOKEN`, `KIROSHI_OAUTH_REFRESH_TOKEN` and
  `KIROSHI_OAUTH_EXPIRES_AT`, and keeps `KIROSHI_OAUTH_CLIENT_ID` and
  `KIROSHI_OAUTH_CLIENT_SECRET`, so the next connect reuses the registration.
- `invalid_client` and `unauthorized_client` delete every reserved name of the scope.
- any other code, or none, leaves every reserved name as it stands.

A refusal that deleted a name stores its reason under `KIROSHI_OAUTH_REASON`, on one line
and with every stored secret redacted. The application row of that server reads
`needsAuthorization` carrying that reason until a grant is stored again, which deletes it.
No environment listing names it. A grant that moved under the refresh, a connect having
stored another meanwhile, is left as it stands. The
sidecar bounds the whole refresh at 10000 ms and answers `failed` once it outlasts that.
The host waits 12000 ms, longer than the sidecar's bound, so an answer never lands late on
the ask of the next refresh.

`sign_in` spawns the bundled executable as `auth login`, its stdin, stdout and stderr
piped, with the environment a session is given (`inheritedEnv`), `BROWSER` set to `true`,
and nothing else in it. `BROWSER` is none of the keys `inheritedEnv` reads from the host
environment, so the value the sign-in sets is the only one the child ever sees, and `true`
opens nothing: the binary opens no browser of its own, the url of `sign_in_started` is the
only url of the flow and the one url a person visits, and the flow completes through
`sign_in_code`, the code that url ends on, never through the loopback callback of a second
url the binary would have opened. `auth status`, the probe behind `check`, is spawned with
the same environment and no `BROWSER` in it. Neither spawn sets `CLAUDE_CONFIG_DIR`: the
credential lands where the binary keeps it, and the host keeps no copy. When the child writes the stdout line offering a url to visit, the
sidecar writes one sessionless frame naming it, the terminal hyperlink markup around it
read past, before the ask settles:

```json
{"type":"sign_in_started","url":"https://claude.com/cai/oauth/authorize?…"}
```

A child exiting with status 0 answers `{"signedIn":true}`. Any other status answers
`failed`, its `detail` the reason the child printed on the line reporting the failed login
(`Login failed: …`), or the exit status when it printed no such line. `sign_in_code`
writes its `text` and one newline to the child's stdin, the code the person pasted from
the page the url opened. `sign_in_cancel` kills the child and settles the ask
`cancelled`. A child still running 300000 ms after it was spawned is killed and the ask
settles `timedOut`. One sign-in at a time: a second `sign_in` is answered `busy` and the
running one is left alone. Nothing of the child's output reaches any frame except the url
of `sign_in_started` and the `detail` of a failed answer.

`agent_sign_in` asks for a sign-in, emits the url of `sign_in_started` on
`agent://sign-in-started` as `{"url":…}`, and resolves on the settle: nothing on
`signedIn`, a `SignInError` otherwise (`alreadyRunning`, `cancelled`, `timedOut`,
`failed`, `notRunning`, `refusedUrl`, `flowTimedOut`, `transport`). A url under a scheme
other than `http` or `https` emits nothing and resolves `refusedUrl`, naming it. The host
opens no browser either: the emitted url is the only one of the flow, the front is the one
place it is opened, and the code the page it lands on ends with comes back through
`agent_sign_in_code`. The host holds the 310000 ms deadline of the MCP flow, longer than
the sidecar's bound, and refuses a second `agent_sign_in` while one runs as
`alreadyRunning`. A sign-in the host lets go of before
it saw the settle sends `sign_in_cancel` on its way out, so a dropped invoke leaves no
child running. `agent_sign_in_code` and `agent_sign_in_cancel` reach the running sign-in,
and resolve `notRunning` without sending anything to the sidecar when none runs: the host
holds that state, and `sign_in_code` and `sign_in_cancel` answer nothing that could
report it.

`mcp_oauth_authorize` carries the `url` of an HTTP MCP server, and the `clientId` and
`clientSecret` its scope still stores, when it stores a client id. It runs the OAuth 2.1
flow of `@modelcontextprotocol/sdk` against it: RFC 9728 discovery, dynamic client
registration, PKCE, and the code exchange. A flow handed a client registers none and
asks under that client, relying on the authorization server taking any port on a
loopback `redirect_uri` (RFC 8252, section 7.3). When that flow settles with no grant,
the host sends a second `mcp_oauth_authorize` naming no client inside the same
`mcp_oauth_connect`, which registers one; the grant stored names the client it was
granted under. An authorization server that no longer knows the client never redirects,
so a `timedOut` settle counts as a refusal of the client. A settle `cancelled` or `busy`,
or `denied` without a `code` of `invalid_client` or `unauthorized_client`, is returned as
it is. One connect registers at most one new client. A flow handed
no client registers one whose `redirect_uri` names the port that flow bound. The
redirect listener binds `127.0.0.1` on a port the operating system picks, and nothing
else: `http://127.0.0.1:<port>/oauth/callback`.

Once the authorization url is built, the sidecar writes one sessionless frame naming
it, before the flow settles:

```json
{"type":"oauth_started","url":"https://…/authorize?…"}
```

The host opens that url in the person's browser. A request reaching the listener whose
`Host` header names neither `127.0.0.1` nor `localhost`, with or without a port, is
answered `400` and leaves the flow waiting: nothing else than the loopback names that
port, so a name resolved to it is a rebinding attempt. So is a request on another path,
or one carrying a state other than the one that flow generated. A redirect carrying an
`error` parameter settles the ask as `denied`, naming it. No redirect within 300000 ms
settles it as `timedOut`, and a `mcp_oauth_cancel` settles it as `cancelled`. However a
flow settles, its listener is closed and its port freed. One flow at a time: a second
`mcp_oauth_authorize` is answered `busy`, since one queue of pending answers per command
type would cross two flows' answers.

An authorization url the metadata builds under a scheme other than `http` or `https` is
refused before any frame is written: the ask settles naming that scheme and no
`oauth_started` crosses, since the SDK's own metadata schema turns away `javascript:`,
`data:` and `vbscript:` and nothing else. The host refuses the same url a second time
before it reaches a browser, `refusedUrl` naming it.

Once the redirect is answered, the flow settles on the next turn of the loop and the
listener is closed with its connections rather than waiting on one: a browser holding the
socket open never delays the connect.

The host holds one deadline for the whole flow and none of its own for `oauth_started`:
a flow the sidecar settles before it ever built a url, discovery having been refused,
fails the connect with that reason rather than waiting. Outlasting that deadline is
`flowTimedOut`, a reason of the flow's own, never the `startupTimeout` a sidecar that
never announced itself gives. A flow the host lets go of before it saw the settle sends
`mcp_oauth_cancel` on its way out, so an abandoned invoke never leaves a listener bound.

`credentials` carries `accessToken`, `refreshToken`, `expiresAt` (milliseconds since
the epoch, and only when the token answer named an `expires_in`), `clientId` and
`clientSecret`. It is the only place a token, a code verifier or a client secret is
ever written: nothing of them reaches stderr, disk or any other frame.

`mcp_oauth_revoke` carries the `url`, the `token`, the `refreshToken`, and the `clientId`
and `clientSecret` the flow registered. It discovers the authorization server again and
posts each token it was given to the `revocation_endpoint` the metadata advertises, per
RFC 7009, under its own `token_type_hint`: `access_token`, then `refresh_token`. A
metadata naming none is answered `{"revoked":false,"detail":…}` rather than a failure,
and so is the first post to answer a status outside 2xx, that status named.

`check`, `models`, `tools` and `title` each carry `connection`, the held connection
source: one name at the most, `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`, read
from the connection scope alone. Each spawns the binary with that source, under the
environment a session gets, and reads the provider's own credential store when the
field is absent; `authMethod` is the method the probe names, carried to the
`CheckReport` unchanged and left out when it names none. `detail` says the question
could not be answered at all, which reaches the frontend as `authCheckFailed`
rather than as `notAuthenticated`. `models` is `Query.supportedModels()`, asked of
a session opened for nothing else and closed again — there is no file to read and
no endpoint to ask. Each entry of the answer is `{ value, supportedEffortLevels }`,
`default` left out: `supportedEffortLevels` is the SDK list when `supportsEffort` is
true and empty otherwise. The host drops a level it has no name for, and writes a
companion's `effort` into its `agent.md` only when the catalogue lists that level for
its model, or has not answered for that model at all.

`tools` is the `tools` of the `init` frame, taken off a session opened for nothing
else and closed the moment the frame lands. No control request answers it, and the
frame is only emitted once a turn has begun — so unlike `models` the ask costs a
turn that is started and never finished. What an MCP server provides is filtered
out before the answer is written: those tools belong to a server rather than to
the install.

`title` answers `{"type":"title","title":…,"icon":…}`. The model is asked for the
title on its first line and one icon name on its second, offered from
`packages/shared/conversation-icons.json`, and shown one literal two-line answer.
`title` is the first non-blank line, cut to sixty characters, or `null` when the
answer holds none. `icon` is the first later line that names a listed icon once a
leading `label:` and the punctuation and symbols around it are stripped (`Icon: Rocket`,
`**Rocket**`, `` `Rocket` ``, `Rocket.`) and compared without case, spelled as the list
spells it. When no later line does, a first line closing on a separator and a listed
icon (`Ship the beta | Rocket`) gives that icon, and the title is what comes before the
separator. Otherwise `icon` is `null`. The host reads a frame without `icon` as no
icon, and `agent_title` answers `{ title, icon }`, or `null` when no title came back.

Every write of a conversation's `icon` goes through the repository, which refuses a
name absent from that same file (`unlistedIcon`, carrying the accepted names) and a
colour outside the eight tints (`unknownColour`), and leaves the row as it was. An
update that resends the icon the row already stores is not checked against the list,
so a room still wearing an icon stored before the list was enforced can be renamed
and moved.

Every other command names its session.

| `type` | Carries | Becomes |
| --- | --- | --- |
| `open` | `cwd`, `resume?`, `pluginPath?`, `systemPluginPath?`, `userPluginPath?`, `agent?`, `identity?`, `outputStyle?`, `settingsPath?`, `partialMessages`, `env?`, `outputSchema?`, `missionThread?` | `query()` options |
| `prompt` | `text` | one `SDKUserMessage` on the session's prompt stream |
| `interrupt` | — | `Query.interrupt()` |
| `permission` | `requestId`, `decision` | the `canUseTool` promise's answer |
| `host_response` | `requestId`, `result` or `error` | the `askHost` promise's answer |
| `close` | — | the prompt stream ends and `Query.close()` runs |

`open` maps to SDK options directly:

- `outputSchema` is the JSON schema a caller wants the turn's answer shaped by. It
  reaches the SDK as `outputFormat: { type: "json_schema", schema }` and is read by
  nothing on the way: a session opened without one asks for no `outputFormat` at all.
- `missionThread` is carried, as `true`, only when the conversation the session opens
  on has kind `mission`, and is omitted when that kind is any other or cannot be read.
  It gives `query()` one `Stop` hook and no other: a turn that ends without an
  `mcp__kiroshi__mission_status` tool use in the message stream is blocked once, told
  to write the status of this mission, and let go when `stop_hook_active` is true.
  The mark is dropped at every answer, so each turn is judged on its own calls, and the
  transcript file is never read. A session without it passes no hooks at all.
- `resume` is the SDK's `resume`. The stored id is tried first; a refusal falls
  back to a fresh session and the id is given up on only when the refusal was a
  crash — see `commands.rs::start_with_fallback`.
- `pluginPath` is the bot's own plugin bundle, loaded for the session and never
  installed, and `agent` is the agent inside it the main thread is promoted to,
  namespaced as `<plugin>:<agent>` so it cannot resolve to one of the reader's own.
  What the bot was told is that agent's body — see `PLUGINS.md` for what was
  measured, and `bundles.rs` for what is written. Both are re-sent on every spawn,
  a resume included: neither is carried across one.
- `systemPluginPath` is the app's own plugin bundle, loaded beside the bot's for the
  same session and never promoted — nothing in it is an agent. Measured on 2.1.239,
  two local plugins load together and each namespaces its own skills. It is passed
  second, after the bot's, and only carried when a `pluginPath` is: a session with no
  bot bundle loads no plugin at all. Its `.mcp.json` servers are bridged the same way
  the bot's are, with the bot's names winning a clash.
- `userPluginPath` is the person's own plugin bundle, laid down once and owned by them,
  loaded third beside the other two and never promoted. Its `.mcp.json` is not read: the
  person's plugin declares no server. Its preloaded skills ride the layer like the app's,
  above the sentence naming the bot's directory.
- the provider's own preset system prompt stays set on every spawn that names an
  `agent`. Measured, not documented: without it the agent resolves and its body is
  never applied. Its `append` is the Kiroshi layer, the same text on every session:
  the speaking situation of a chat, no capability and no tool name, so an exported
  bot loses the chat and nothing else. It is not editable by anyone. A spawn carrying
  a `pluginPath` appends one more sentence, naming that directory as where the bot's
  own skills live — with two plugins loaded, nothing else says which is the bot's.
- `identity` is who the bot is: the host's own sentences over the bot's own name and
  title, rendered on the host side — see `bundles.rs::identity`. It is appended to the
  layer above the Kiroshi sentences, and it travels on the request rather than in the
  bundle because the sentences are the app's: no bot's file carries a copy, and a
  rename reaches the next session with nothing rewritten. Left out for a session
  opened with no bot to name, which is a session that carries no plugin either.
- `outputStyle` is the style the answer is written in, by the name the provider knows
  it under (`Concise`…). Named, it is passed as `settings: { outputStyle }` — an
  inline settings object, since `settingSources: []` closes every settings file on the
  machine. Left out, no `settings` key is passed at all.
- `settingsPath` is the `settings.json` lying at the root of the bot's own bundle, sent
  only when the file is there — see `bundles.rs::settings_file`. The sidecar reads it and
  keeps `permissions.allow`, `permissions.ask`, `permissions.deny`,
  `permissions.defaultMode` and `outputStyle`; every other key is dropped —
  `permissions.additionalDirectories` among them, since a bot widening its own reach is
  the thing the floor exists to prevent — `disableBypassPermissionsMode` is forced to
  `disable`, and a `defaultMode` of `bypassPermissions` is refused. What is kept becomes
  the inline `settings` object and `permissionMode` becomes the declared `defaultMode` or
  `auto`. A file the bot's own settings name wins over `outputStyle` on the request. Unreadable or not a JSON object, the session opens
  without it. Anything refused — the file itself, a `bypassPermissions` mode, or a key outside
  the allowlist, named — rides a `settings_rejected` frame to the reader's notice.
  `disableBypassPermissionsMode` is forced to `disable` even for a bot carrying no file at all,
  and `settingSources: []` stays set either way: this is the only settings file a session reads.
- `appDataDir` is the directory the host keeps its own data in, sent when the host knows
  it. The sidecar never reads it: it hands it to the security floor, which the session
  carries as `managedSettings`, the policy tier a bot's own settings cannot loosen. The
  floor denies reading `conversations.sqlite3`, its `-wal`/`-shm` companions and the
  `attachments` directory — at the permission layer and in `sandbox.filesystem.denyRead`
  both. It keeps `bots` and
  `spaces` in `sandbox.filesystem.denyRead`, lists the session's own plugin paths in
  `allowRead`, and denies the `Read` tool on every other bundle it finds under
  `bots/plugins` and `spaces`. Left out, the rest of the floor still applies: the home
  credential paths, the environment files and the sandbox itself.
- `env` is read by the fake sidecar of the integration tests and by no session the
  provider opens: the provider builds the agent's environment from `connection` alone.
- `connection` is the held connection source, one name at the most: `ANTHROPIC_API_KEY`
  or `CLAUDE_CODE_OAUTH_TOKEN`, absent while none is held. The environment of the agent
  process is the sidecar's allowlist, `CLAUDE_CONFIG_DIR` among it, plus that field alone,
  never a name of `serverEnv`. While the field is absent the agent gets neither name.
- `serverEnv` is what the environment store serves this bot's MCP servers, read once
  when the session opens: `base`, the space scope under the bot scope, and `perServer`,
  one overlay per server name holding that server's own scope — the narrowest
  definition winning. The sidecar expands `${VAR}` and `${VAR:-default}` in the
  `command`, `args`, `env`, `url` and `headers` of every server the bundle declares; a
  declaration holding no `${` is handed over untouched. A variable with neither value
  nor default leaves its server out of the options and rides a `server_env_rejected`
  frame naming the server and the variable. `failure`, set when the store could not be
  read, leaves out every server declaring a variable and rides the same frame. A server
  carrying a `url` whose own scope holds `KIROSHI_OAUTH_ACCESS_TOKEN` is handed the header
  `Authorization: Bearer <that token>`, a server declaring no `${` included; a server
  already declaring a header named `authorization` under any letter case keeps the value
  the person wrote. No `.mcp.json` on disk is rewritten for any of it. The five
  `KIROSHI_OAUTH_` names and the two connection names are the store's own: `env_list`
  leaves every one of them out at every scope, so neither a grant nor a connection source
  reads as a variable the person wrote. The connection source lives at the connection
  scope, wider than every space, written by `connection_set`. Neither name ever reaches
  `base` or an overlay, not even when a space scope or a bot scope still holds one on
  disk: the session is handed the value of
  the connection scope and no value of that narrower scope. A server declaring
  `${ANTHROPIC_API_KEY}` or `${CLAUDE_CODE_OAUTH_TOKEN}` is therefore left out of the
  session, that name reported as defined by no scope. A `failure` leaves
  out a server carrying a `url` and no `authorization` header of its own even when it
  declares no `${`, because the grant it would have been handed is exactly what could not
  be read: connecting it unauthorized would only settle `needs-auth`. One carrying its own
  `authorization` header needs nothing of the store and is kept. A server
  the options did keep is read once the session is initialized, for the 5000 ms of the
  poll budget. What that budget settles rides the first prompt: a server it read
  `needs-auth` as waiting for its authorization, on a frame of its own, one it read failed
  as having read failed with a reconnection under way, and one it left pending as still
  connecting after the time the read spent, both of those reaching the bot's section and
  no frame at all. A server whose outcome the watch is about to decide raises no frame
  until it is decided: one frame per server at the most, across the read and its watch. The frame carries the
  servers this session is without, and the CLI is still dialling that one: its tools can
  land later in the session, which the section says in its own words, and its frame comes
  later too, when a read names it failed, `needs-auth` or disabled, or the pass gives up
  on it. A line never counts connection attempts: the
  CLI retries a failing server on its own, several times per read, so no number the
  sidecar could state would be true. A server the budget read failed earns one
  reconnection, taken after the budget so no prompt waits on it, and a second line of its
  own which overtakes the first. That line comes from one more status call, taken once the
  reconnection answered: the server reads connected and holds its tools again, or left out
  with the reason its status and the reconnection give. Still connecting on that call, it
  goes back under the watch, read every second until it settles or the watch bound
  elapses, and reported by the status that settles it, with no second reconnection and
  with the answer its reconnection gave, which the watch holds for it. A reason names the
  source that gave it: the reconnection when it threw, and the status call that followed
  it when that call is the one that threw. A server
  the budget left pending is watched past it, one status call every second, until it reads
  connected, failed or `needs-auth`, or 60000 ms pass and it is given up on: a stderr line
  naming it, and a frame saying it never settled while it was watched, with the answer its
  reconnection gave when one was asked for. A dial still running when that bound passes is
  waited on, and the server it hands back is given up on then, never left on the line the
  first prompt carried.
  Connected, it earns a line naming it as holding its tools for the rest of the session,
  carried to the bot by the next prompt and framed to nobody: good news is no notice;
  failed, it earns the same one reconnection and frame; `needs-auth` and `disabled`, it
  earns that frame with the reason of its own. One frame per server at the most after the budget,
  and none once the session closed. A frame raised after a prompt was handed rides the
  next prompt's section, so the bot reads what the screen reads. The section reads the
  state each line was built for, never the words of a line: a reason quoting the CLI can
  say anything without moving the opening or the closing lines that frame it. A slash command is handed
  over untouched, its line waiting for the next prompt that is not one; a line is framed
  once, whichever prompt ends up carrying it. A server named by a line and then by a later
  one rides the later line alone, on the screen and in the section both: a standing the
  reads have overtaken is never handed over. The section itself follows what its lines
  say: it claims a server was left out only when every line says so, it sends the bot to
  each line when they differ, and it tells the bot where a server still connecting or
  freshly reconnected stands. A still connecting line carries the status a read gave and
  the time that read landed at, never what a reconnection answered. A reconnection holds
  no other server back: the servers left pending are read again while it runs. A status read carries a
  name and a status alone, so that reason is built from the status the last read named,
  the time the read had spent, and the message the reconnection threw, and from nothing
  else: the cause the CLI knows, a 401 or a refused socket, never crosses the control
  protocol. That frame goes out in the very call
  that hands the prompt carrying the same line over, once per session, so the notice
  lands while a turn is live. The frames raised after the budget go out at once, and their
  lines wait for the next prompt. The session opens without waiting on any of it: the
  `opened` frame goes out first and the prompts wait behind the budget, in the order they
  were received, never longer than it. No deadline covers that read as a whole: each status
  call taken while polling is bounded by what is left of the 5000 ms poll budget, and the
  reconnections and the call taken after them by 30000 ms each, what the CLI gives an MCP
  request of its own. The polls stop once the time left, taken from a clock and not
  counted in sleeps, no longer covers a 250 ms wait and a call after it, so the last call
  of a read is always given a bound it can land in. No session option bounds the
  dial: neither `MCP_TIMEOUT` nor `MCP_CONNECT_TIMEOUT_MS` is set, the CLI keeping its
  own defaults. A status call that outlasts
  its bound ends the polls there and keeps what the earlier calls named: only the very
  first call has nothing to fall back on, and it ends the read on a stderr line with
  nothing reported. The call taken after the reconnections is the same: outlasting, it
  leaves the servers the earlier calls left unconnected reported, and rides a stderr line
  of its own. A stderr line names only the servers the read holds no status for: one the
  earlier calls already named is reported, not given up on, and a give up naming no server
  is not written. A give up does not stop at stderr: every server it names rides a frame
  and the next prompt's section with the same reason, because nothing in a live session
  reads that stream. A pass whose very first status call throws names no server at all: no
  call ever said anything about them, so it reports once that the status could not be
  read, with its cause. That is a diagnostic of ours, not a state of a server: it stays on
  stderr, raises no frame and reaches no section, every server of the session being left
  unjudged and possibly connected. A status call the watch takes and loses says as little:
  same stderr line, no frame, no server named, and the watch keeps reading until its
  bound. The call taken after the reconnections is the exception: outlasting, it
  names on stderr every server the read reconnected, those lines being the only trace it
  left. A server no status call has named yet is polled for 1000 ms only, then
  left to the stderr line. An interrupt drops what is held and leaves
  the read running: the CLI never received that prompt, so no interrupt is sent to it and
  the sidecar rides a `result` frame of subtype `interrupted` instead, which ends the
  host's turn as cancelled. An interrupt with nothing held reaches the CLI as before. A
  close abandons the read, frame, stderr line and timers included. A server
  reading `needs-auth` is named as waiting for its authorization, and no reconnection is
  attempted on it. A server no read ever named rides no frame: the sidecar writes one
  stderr line naming it, as it does when the read throws or outlasts its deadline. No
  resolved value is ever named in a frame or a log line: the message a reconnection
  throws is cut at 300 characters and every value of eight characters or more the store
  holds reads `[redacted]` in it.

## Sidecar → host

Every line is an envelope:

```json
{"session":"<key>","frame":{…}}
```

The frame is an `SDKMessage` verbatim, plus the four the sidecar adds itself.

| `frame.type` | Source | Mapped to |
| --- | --- | --- |
| `opened` | the sidecar, once `initializationResult()` returns | the start's readiness gate |
| `closed` | the sidecar, when the query ends or throws | `crashed` |
| `system` / `init` | `SDKSystemMessage` — `session_id` | `sessionReady` |
| `commands` | the sidecar, from `initializationResult().commands` | `commandsListed` (only when the frame names one) |
| `stream_event` | `SDKPartialAssistantMessage` — one Messages API streaming event | `messageStarted` / `messageDelta` / `activity` |
| `assistant` | `SDKAssistantMessage` — `text` and/or `tool_use` blocks | `messageCompleted` / `activity` |
| `user` | `SDKUserMessage` — `tool_result` with `is_error` | `activity` (succeeded / failed) |
| `result` | `SDKResultMessage` — `subtype`, `session_id`, `is_error`, or the sidecar when a stop lands on a prompt still held | `turnEnded` |
| `host_request` | the sidecar, from `askHost` | nothing — it is answered, not read |
| `control_request` / `can_use_tool` | the sidecar, from `canUseTool` | `permissionRequested` |
| `control_request` / `can_use_tool`, tool `AskUserQuestion` | the sidecar, from `canUseTool` | `questionRequested` |
| `settings_rejected` | the sidecar, when the bot's `settings.json` is refused in part or in whole | `failed` — `settingsRejected`, the frame's `detail` as its reason |
| `server_env_rejected` | the sidecar, when a declared MCP server is left out for want of a variable, or when a kept server has not connected | `failed` — `serverEnvRejected`, raised as a non terminal notice reading the frame's `detail` and telling the reader the conversation carries on with the other servers |

Every other `SDKMessage` type is dropped: `translate.rs` reads what the contract
needs and nothing else, so a new SDK message is inert until it is asked for.

## Permissions

`canUseTool` is a promise the SDK blocks the tool on. The sidecar answers it out
of band: it emits the request under the SDK's own `requestId`, and the host's
`permission` command resolves it.

```json
{"type":"permission","session":"…","requestId":"…",
 "decision":{"behavior":"allow","updatedInput":{…}}}
```

`AskUserQuestion` is the same ask read differently: it travels as
`questionRequested` and is answered by allowing the tool with the reader's
replies written into its input, keyed by the question they answer.

```json
{"type":"permission","session":"…","requestId":"…",
 "decision":{"behavior":"allow","updatedInput":{"questions":[…],"answers":{"Which library?":"date-fns"}}}}
```

`{"behavior":"deny","message":"…"}` produces a `tool_result` with `is_error:
true` and the turn continues. A session closing settles every promise it still
holds as a denial: an unanswered one would block its tool forever, since a
permission prompt has no deadline of its own.

## Host requests

`canUseTool` asks the reader; `host_request` asks the host itself. The sidecar
emits it under a `requestId` it owns, and the host answers with exactly one
`host_response` carrying that same id, either a `result` or an `error`.

```json
{"session":"…","frame":{"type":"host_request","requestId":"…",
 "request":{"subtype":"routine","operation":"create","payload":{…}}}}
```

```json
{"type":"host_response","session":"…","requestId":"…","result":{…}}
{"type":"host_response","session":"…","requestId":"…","error":{"kind":"routineOfAnotherBot","id":"…","botId":"…"}}
```

A `host_request` never reaches the translator: it raises no `AgentEvent`, it ends
no turn, and it does not promote a session to `Running`.

`subtype` names who serves the request. `routine` is served by
`routines::host::RoutineHost`, over the six operations `list`, `triggerSources`,
`create`, `update`, `runNow` and `delete`, which the sidecar exposes to the agent
as the tools of the `kiroshi` MCP server:

- the conversation and the bot come from the scope the session was opened with,
  never from the payload — a payload naming a field its operation does not
  declare is refused, that field named, and nothing is written;
- `list` answers every routine of that conversation, whatever bot owns one;
- `triggerSources` answers the sources that bot may be triggered by, each with
  the fields its events carry;
- `update`, `runNow` and `delete` refuse a routine of another conversation or of
  another bot, that routine named;
- every conversation is served the same way, a bot's own solo thread included:
  nothing here reads the kind of a conversation;
- every write emits `routine://changed` with the conversation id, whatever asked
  for it.

An `error` is a `RoutineError`, the same taxonomy the front's own invokes are
refused with. A session opened with no host attached answers every request with
one, so a request is never left hanging. So does the end of a session: a `close`
command, a `closed` frame, or an `open` reusing the same session key settles
every request that channel still awaits as `undeliverable`, since a host answer
has no deadline of its own.

`companion` is served by `companions::host::CompanionHost`. Its operation
`conversationAttach` shows one image file to the person, from the tool
`conversation_attach`, with `path`, an optional `caption` and an optional
`conversation`:

- the sidecar resolves `path` against the working directory, symlinks
  included, and refuses it as `deniedPath` without asking the host when the
  security floor denies that bot to read it, or as `unreadableFile` when it
  does not resolve; the host is sent the resolved path;
- the host refuses a file that is missing, unreadable or a directory
  (`unreadableFile`), an extension outside the image set of
  `message-attachments.ts` (`notAnImage`, the accepted extensions listed), and a
  file or a block past the limits of `attachments` (`attachmentRefused`, the
  size and the limit named); a refusal stores nothing and changes no message;
- without `conversation`, the file is copied to
  `attachments/<conversation id>/<uuid>.<ext>` and held for the turn: when the
  turn ends, completed, cancelled or failed, the last reply of the turn ends
  with one attachment block listing every file held, in call order, each
  caption on its own line above it; a turn that wrote no reply gets one carrying
  the block alone;
- with `conversation`, the seat checks of `conversationSay` apply, the file is
  copied under that room id, and one `companion://spoke` carries the caption
  then the block, the way `conversationSay` posts;
- the answer is `{ "path", "conversationId" }`, the stored absolute path and the
  conversation it was shown in.

`conversationOpen`, `conversationSay`, `conversationUpdate`, `conversationList` and `conversationRead`
answer one Conversation shape, read through the same rows as the front's
`conversation_page`, missions included:

```json
{"conversationId":"…","kind":"topic","title":"…","icon":"Rocket","colour":null,
 "companions":[{"id":"…","name":"…"}],
 "lastMessage":{"author":"…","text":"…","time":1700000000000},"archived":false}
```

`kind` is `main`, `topic` or `mission`; `companions` are the seats held and not
left, by a companion still standing; `lastMessage` is the newest settled message,
its author's name (`null` for a person the message names no one for), its text
cut to 200 characters and its time in epoch milliseconds, or `null` when nothing
was said; `archived` reads `conversations.archived_at`. A `main` chat whose
companion is gone from the space is never answered.

Its operation `conversationList`, from the tool `conversation_list`, takes an
optional `everywhere`, `kind`, `limit` and `cursor`:

- without `everywhere`, or with it `false`, it answers only the conversations of
  the caller's space it holds a seat in and has not left; with `true`, every
  conversation of that space, seated or not; never one of another space;
- `kind` keeps only `main`, `topic` or `mission`, and any other value is refused
  as `unknownConversationKind`, the accepted kinds listed;
- the answer is `{ "conversations", "cursor" }`, ordered by last activity, newest
  first, pins ignored; `limit` defaults to 50, is refused as `limitOutOfRange`
  (`minimum` 1, `maximum` 200) past its bounds, and `cursor` is `null` on the
  last page; a cursor that does not decode is refused as `unreadableCursor`.

Its operation `conversationRead`, from the tool `conversation_read`, takes a
`conversation` id, an optional `limit` and an optional `before`:

- it answers a conversation of the caller's space whether the caller holds a
  seat there or not; an id matching nothing and an id of another space are both
  refused as `unknownConversation` with that id and nothing else;
- the answer is `{ "conversation", "messages", "cursor" }`: the Conversation
  shape, then its last messages, newest last, each
  `{ "seq", "author": { "kind", "id", "name" }, "time", "text" }`, `kind`
  `person` (its account id and name, either `null` when unknown) or
  `companion` (its bot id and name), the text in full;
- `limit` defaults to 20 and is refused as `limitOutOfRange` (`minimum` 1,
  `maximum` 100) past its bounds; `before` answers the messages strictly older
  than that seq, and `cursor` is the seq to pass next, `null` once the first
  message is reached.

Its operation `conversationSearch` finds where something was discussed, from the
tool `conversation_search`, with `query` and an optional `kind` (`main`,
`topic` or `mission`):

- the space searched is the space of the session's conversation, never one the
  payload names;
- a `query` blank once trimmed is refused as `emptyQueryField` and nothing is
  searched; one past `MAX_QUERY_CHARS` is refused as `queryTooLong`, the limit
  named;
- the answer is `{ "conversations", "messages" }`: `conversations` are the
  chats `CatalogueRepository::search` matches by title and participants, each
  `{ "id", "kind", "title", "participants" }`; `messages` are the hits of
  `SearchRepository::messages`, in its order, each `{ "conversationId",
  "conversationTitle", "messageId", "author", "createdAt", "snippet" }`, the
  author `null` for the person and the snippet plain text;
- `kind` is applied inside both searches, before their caps: each list holds up
  to its cap of entries of that kind; nothing matched answers two empty lists.

## Stop and shutdown

- `interrupt` ends the turn with `result.subtype = "error_during_execution"` and
  **leaves the session usable**: a following prompt answers normally.
- `close` ends one session and nothing else — the sidecar serves the others.
- The host's exit is the only thing that ends the process: close stdin →
  `SIGTERM` → `SIGKILL`, on the whole group. The sidecar spawns real
  grandchildren (the agent, its MCP servers), so the group kill is what keeps
  orphans off the machine.

## What is deliberately not forwarded

The sidecar's stderr is read line by line and written to the install's log file
(`kiroshi.log` in the app log directory), tagged `sidecar-stderr`. The Agent SDK
stderr of every session, delegation, title, model and tool probe reaches the same
pipe: the sidecar buffers it into whole lines tagged `[agent <source>]`, so a value
split across two reads is never cut in half. Each line is capped at 2 KB, then passes
through the host scrubber before it reaches the file: every value resolved from
`env/space/*` and `env/bot/*` for a session becomes `[redacted-env]`, and URLs, the
home path, emails and token shapes are masked with the patterns of
`failure-text-scrubber.ts`. The host's own lines carry event names, ids, codes and
durations, never a message body, a prompt or a tool argument. The sign-in probe
returns an email, an org id, an org name and a subscription type; the provider
module keeps the email and the subscription type, as the `email` and the `plan` of
`account`, and drops the org id and the org name before it reaches the pipe. The host
hands that email and that plan to one command alone, `agent_account`, as the `account`
of its `AccountReport`, `null` when the probe names none; `CheckReport`, which
`agent_check` returns to every other caller, carries no account at all. Nothing else
of the account crosses: no token, no credential, no org. The output of `auth login` reaches no frame
but the url of `sign_in_started` and the reason a failed sign-in gave. Search locations are reported as labels
(`$KIROSHI_AGENT_SIDECAR`, the app's own directory) rather than raw environment
values, and `redact` collapses the home directory out of every path *and* every
shell command before it crosses to React.

## The frozen catalogue

Two committed files hold one line per message, `apps/app/contracts/host-commands.ndjson`
and `apps/app/contracts/sidecar-frames.ndjson`, every optional field of a frame populated.
`tests/contracts.rs` reads each frame line into the type the host parses it with,
`sidecar/src/contracts.test.ts` routes each command line to the handler that serves it,
and both refuse a message this section does not name. The catalogue below names each
message and elides the rest of its shape, which the sections above spell out.

Host → sidecar:

```json
{"type":"open","session":"…",…}
{"type":"prompt","session":"…","text":"…"}
{"type":"interrupt","session":"…"}
{"type":"permission","session":"…",…}
{"type":"host_response","session":"…",…}
{"type":"close","session":"…"}
{"type":"check",…}
{"type":"models",…}
{"type":"tools",…}
{"type":"title",…}
{"type":"sign_in"}
{"type":"sign_in_code","text":"…"}
{"type":"sign_in_cancel"}
{"type":"mcp_oauth_authorize",…}
{"type":"mcp_oauth_cancel"}
{"type":"mcp_oauth_revoke",…}
{"type":"mcp_oauth_refresh",…}
```

Sidecar → host, sessionless:

```json
{"type":"ready",…}
{"type":"check",…}
{"type":"models",…}
{"type":"tools",…}
{"type":"title",…}
{"type":"sign_in",…}
{"type":"sign_in_started","url":"…"}
{"type":"oauth_started","url":"…"}
{"type":"mcp_oauth_authorize",…}
{"type":"mcp_oauth_revoke",…}
{"type":"mcp_oauth_refresh",…}
{"type":"unreadable"}
```

Sidecar → host, inside the envelope of a session:

```json
{"type":"opened"}
{"type":"system",…}
{"type":"commands",…}
{"type":"stream_event",…}
{"type":"assistant",…}
{"type":"user",…}
{"type":"control_request",…}
{"type":"host_request",…}
{"type":"control_response",…}
{"type":"result",…}
{"type":"settings_rejected","detail":"…"}
{"type":"server_env_rejected","detail":"…"}
{"type":"closed","detail":"…"}
```

A frame naming none of those reads as `Ignored` and reaches no translator, which the
catalogue stands one line for:

```json
{"type":"unknown_to_the_host"}
```
