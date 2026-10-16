# The relay member socket

A member socket joins a Kiroshi space that someone else hosts. The host desktop
keeps a host socket open on the kiroshi-cloud relay; every member opens a member
socket on the same relay room. The relay carries calls from members to the host,
answers back to the caller, and events from the host to every member.

Two files make the contract:

- this document: connection, frames, close codes, reconnection;
- [`member-socket.schema.json`](member-socket.schema.json): JSON Schema 2020-12 of
  the frames, of every command a member may call (its args, its answer body, its
  error) and of every event a member may hear (its payload).

The schema is generated from the Rust types of the host. Never edit it by hand:
from the repository root, run

```sh
bun run snapshots
```

A cargo test fails when the file drifts from the types, when a command or event a
member can reach has no entry, or when an entry outlives its reach.

## Connecting

### URL

```
wss://api.kiroshi.app/instances/{instanceId}/relay/member
```

`{instanceId}` is the cloud instance the host registered for the space; the
account's instance list on kiroshi-cloud names it. Against another API base, the
socket URL is that base with `http` replaced by `ws` (`https` by `wss`).

### Credential

The WebSocket upgrade request carries the account session token of kiroshi-cloud:

```
Authorization: Bearer <account session token>
```

No other header and no query parameter is read.

### Handshake

The upgrade answers with one of:

| Upgrade status | Meaning | What the client does |
|---|---|---|
| 101 | The socket is open. | Go online. Reset the backoff. |
| 401 | The relay refused the account. | Stop. Reconnect only after a new sign-in. |
| 403 | The account is invited to this instance but has not accepted its invitation yet. | Retry with backoff; the upgrade opens once the invitation is accepted. |
| 404 | The instance is unknown, or the account holds no membership of it. | The membership ended: stop and forget the space. |
| other, timeout, network error | The relay is unreachable. | Retry with backoff. |

The desktop client gives the upgrade 20 seconds.

Once open, the client asks which space the host shares (see
[The shared-space frame](#the-shared-space-frame)). The desktop client does it
right after joining and gives it 30 seconds.

### Keepalive

The client sends a WebSocket ping every 30 seconds. Any frame received, pong
included, proves the socket alive. After 90 seconds without any frame, the client
drops the socket and reconnects.

The relay pings the member socket every 30 seconds too; a WebSocket library
answers those pings by itself. The relay closes a socket idle for 120 seconds,
and one whose unsent frames exceed 4 MiB because the client reads too slowly.

## Frames

Every frame is one WebSocket text frame holding one JSON object. The schema's
root `oneOf` lists the three shapes, defined in `$defs` as `CallFrame`,
`AnswerFrame` and `EventFrame`.

A member sends call frames only. It receives answer frames and event frames, and
tells them apart this way: a frame with an `event` key is an event frame; a frame
with `id` and `status` is an answer frame. Anything else is ignored.

### The call frame

```json
{ "id": 7, "command": "conversation_send_turn", "args": { "message": {}, "summoned": ["bot-1"] } }
```

- `id`: a string or a number, unique among the client's calls still awaiting an
  answer. The answer echoes it unchanged. The desktop client uses increasing
  integers.
- `command`: a key of the schema's `commands` object.
- `args`: an object shaped by `commands.<command>.args`. Absent means `{}`. Keys are
  camelCase. An optional arg (nullable in the schema) may be omitted.

### The answer frame

```json
{ "id": 7, "status": 200, "body": 42 }
```

- `id`: the call's `id`, or `null` when the call carried none usable.
- `status`: an HTTP status code.
- `body`: any JSON value, read according to the status:

| Status | `body` |
|---|---|
| 200 | `commands.<command>.ok` |
| 500 | `commands.<command>.error`, or a string when the host could not read the args |
| 400 | a string: the frame is not `{id, command, args}` with `args` an object |
| 400 | `{ "error": "<reason>" }`, `id` null: the relay refused the frame (see [Frames the relay refuses](#frames-the-relay-refuses)) |
| 403 | `"this command belongs to the host"`: the command is not open to members, or no command bears this name |
| 403 | `"this command reaches outside the shared space"`: an id in `args` names something outside the shared space |
| 403 | `{ "kind": "refusedToAMember" }`: the command would reach what belongs to the host person |
| 413 | a string: the call is larger than the host accepts |
| 502 | a string: the host could not run the call on its side |

The host bounds each call at 300 seconds. A client that hears no answer by then
fails the call.

A command whose schema entry has no `error` key never answers 500 with a typed
body.

### The event frame

```json
{ "event": { "event": "conversation://deleted", "payload": { "spaceId": "s-1", "conversationId": "c-1" } }, "epoch": "6f1c…", "seq": 42 }
```

- `event.event`: a key of the schema's `events` object.
- `event.payload`: shaped by `events.<event>.payload`.
- `epoch`: drawn once per hosting run of the space, and drawn again when the host
  loses events of its own. A client that ignores replay may ignore it.
- `seq`: 1 for the first frame of the epoch, then one more per frame. A client
  that ignores replay may ignore it.
- `token`: present only on a frame replayed for a `relay_resume` call, and equal
  to the token of that call. A client that ignores replay drops every frame that
  carries it.

The host forwards an event only when it concerns the shared space: an event about
another space, or a host-wide `agent://event` (its `scope` is `null`), never
reaches a member.

### Conversation events

| Event | Payload | Fired by |
|---|---|---|
| `conversation://created` | `{ "spaceId", "conversation" }` | `conversation_create` |
| `conversation://updated` | `{ "spaceId", "conversation" }` | `conversation_update`; a companion seated in a conversation it was not seated in (`conversation_add_participant`, or a companion inviting another); `conversation_remove_participant`; `conversation_set_lead` |
| `conversation://deleted` | `{ "spaceId", "conversationId" }` | `conversation_delete` |

- `conversation` is the whole conversation as stored once the write landed, the
  same shape `conversation_list` returns. A member replaces its row with it.
- `conversation.participants` lists every seat the conversation ever had: a
  companion still seated has `leftAt: null`, a removed one carries the time it
  left. The lead is the seat whose `role` is `"lead"`.
- Each write fires its event once, after it is stored. Seating a companion
  already seated fires nothing, and a write that fails fires nothing.

### Space-level commands

A member holds the same rights as the host on the shared space. These commands
are open to it, each kept inside the shared space:

| Command | Kept in the shared space by |
|---|---|
| `hosting_members` | `spaceId` |
| `hosting_invite_member` | `spaceId` |
| `hosting_withdraw_invitation` | `spaceId` |
| `hosting_remove_member` | `spaceId` |
| `search_messages` | `query.spaceId` |
| `agent_shutdown` | `scope.conversationId` and `scope.botId` |
| `agent_live_sessions_in_space` | `spaceId` |
| `env_list` | `scope` |
| `env_set` | `scope` |
| `env_delete` | `scope` |
| `mcp_application_status` | `owner` |
| `mcp_oauth_disconnect` | `owner` |

- `scope` and `owner` are `{ "kind": "space", "id" }` with the shared space id, or
  `{ "kind": "bot", "id", "spaceId" }` with a companion of the shared space and the
  shared space id. Any other kind, `user` included, answers 403.
- `env_set`, `env_delete` and `mcp_oauth_disconnect` on a companion also held by
  another space of the host answer 403: its env is one file for every space.
- A scope of the host person is one of kind `user`, `person` or `account`, or a
  `server` scope whose `owner` has kind `user`.
- `env_list` never answers an entry whose `definedIn` or `servedFrom` is a scope
  of the host person.
- `mcp_application_status` never answers a row whose `scope` is a scope of the
  host person, nor a server only the plugin of the host person declares.
- `mcp_oauth_disconnect` on a server whose grant is a scope of the host person
  answers 403 with `{ "kind": "refusedToAMember" }` and keeps the grant.
- `agent_live_sessions_in_space` answers the live sessions whose conversation
  belongs to `spaceId`, each `{ "botId", "conversationId", "runtimeSessionId", "startedAt" }`.
- `hosting://members-changed` reaches a member only when its `spaceId` is the
  shared space.

### The avatar frame

A member reads the avatar picture of a bot through the socket. It is a call frame
with a command that is not in the schema's `commands`:

```json
{ "id": 8, "command": "relay_avatar", "args": { "file": "owl-1.png" } }
```

`file` is the last path segment of a bot's `avatarImagePath`. The host answers
avatars one at a time.

| Status | `body` |
|---|---|
| 200 | `{ "contentType": "image/png", "base64": "<the picture, base64>" }` |
| 400 | a string: `id` or `args.file` is missing |
| 404 | `"no avatar of the shared space bears this name"` |
| 413 | `"the avatar is too large to cross the relay"` (the cap is 1 MiB) |
| 500 | `{ "error": "the avatar was not read" }` |
| 502 | `{ "error": "<reason>" }` |

### The shared-space frame

```json
{ "id": 1, "command": "relay_shared_space" }
```

answers

```json
{ "id": 1, "status": 200, "body": { "spaceId": "s-1" } }
```

`spaceId` is the space the host shares. Every `spaceId` a member sends in `args`
must be this one. The call takes no args.

### The sender stamp

The relay writes a `sender` object on every frame a member sends before it hands
the frame to the host:

```json
{ "id": 7, "command": "conversation_send_turn", "args": {}, "sender": { "accountId": "acc-1", "name": "Ada", "image": null } }
```

- `accountId`: the kiroshi-cloud account that opened the member socket.
- `name`: that account's name.
- `image`: that account's picture URL, or `null` when the account has none.

The relay writes it over any `sender` the member put in the frame, and leaves
every other key unchanged; a client has no reason to send one. The host reads
`sender.accountId` and takes it as the author of what the call writes. A call
that reaches the host without it still runs, with no member named as its author.

### Frames the relay refuses

When a member sends a binary frame, or text that is not a JSON object, the relay
does not forward it: nothing reaches the host. The relay alone answers that
member:

```json
{ "id": null, "status": 400, "body": { "error": "Frame must be a JSON object" } }
```

`body.error` is `"Frame must be text"` for a binary frame and `"Frame must be a
JSON object"` otherwise. `id` is `null` because the relay reads no id from such a
frame: a client fails the call it was sending, if any, by itself.

## Close codes

| Code | Sent to | Meaning | What the client does |
|---|---|---|---|
| 4001 | the host socket | Another host took the instance over. | A member never receives it. The replaced host stops hosting and does not reconnect. |
| 4002 | a member socket | The relay room has no host: the host left, or none was there when the socket opened. | Treat the space as offline; reconnect with backoff. |
| 4003 | a member socket | The account's membership ended, or the instance was deleted. | Stop; do not reconnect; forget the space. |
| 4005 | the host socket and every member socket | The relay is restarting for a deploy. | Reconnect with backoff. |
| 1000 | the relay | The client leaves on purpose. | Sent by the client when it closes the socket. |

Any other close code, and a socket that ends without a close frame, mean the
connection dropped: reconnect with backoff.

## Reconnection

- The backoff starts at 1 second, doubles on each failed attempt, and caps at 60
  seconds. It resets once a socket opens.
- On a close, every call still awaiting its answer fails: its answer will never
  come, not even after reconnecting. A call is not resent automatically; the
  caller decides.
- Stop reconnecting on 4003, on a 404 upgrade, and on a 401 upgrade until a new
  sign-in. Reconnect on everything else.

## Replay of missed events

The relay keeps no history; the host does. It keeps the last 1024 event frames of
the space, at most 4 MiB of them, and drops the oldest first.

A client keeps the `epoch` and the `seq` of the last event frame it applied:

- A frame carrying a `token` that is not the one of its own pending resume was
  replayed for another member: drop it, and change nothing.
- A frame of the same epoch whose `seq` is at most the last applied is a
  duplicate: drop it.
- A frame whose `seq` is the last applied plus one: apply it.
- A frame whose `seq` jumps further: hold it, and every next frame, and resume.
- A frame of another epoch: adopt its `epoch` and `seq`, apply it, and re-read.

To resume, on each socket open while it holds an epoch, or on a jump, the client
sends:

```json
{ "id": 9, "command": "relay_resume", "args": { "epoch": "6f1c…", "since": 41, "token": "a-random-token" } }
```

The host sends every frame it kept with a `seq` above `since`, in order, as
event frames carrying the call's `token`, then answers:

```json
{ "id": 9, "status": 200, "body": { "token": "a-random-token", "replayed": 3 } }
```

The client applies the held frames in `seq` order, dropping duplicates.
When the host socket comes back on the same epoch, the host first sends every
frame it recorded while it was away, without a `token`, so a member socket that
stayed open only sees the `seq` continue. When the
epoch is no longer the host's, or `since` is older than what the host kept, the
host replays nothing and answers `{ "token": "a-random-token", "tooOld": true }`.

The relay hands every answer to every member, so a client takes a resume answer
only when its `token` is the one it sent. On `tooOld`, or when no answer comes
within 300 seconds, the client adopts the `epoch` and `seq` of the next frame and
re-reads with calls the state it shows (for example `conversation_list`,
`conversation_message_page`, `mission_list`). A client with no epoch yet re-reads
on each socket open. Neither the epoch nor the seq survives an app restart.

## Reading the schema

- `commands.<name>.args` is the object schema of the call's `args`.
- `commands.<name>.ok` is the answer body on 200. `commands.<name>.error`, when
  present, is the typed answer body on 500.
- `events.<name>.payload` is the payload of that event.
- `$defs` holds the shared types every entry refers to. A name ending in
  `_Deserialize` is the shape the host reads (args); `_Serialize` is the shape the
  host writes (answers and payloads). A type with one shape in both directions
  has no suffix.
- 64-bit integers are plain JSON numbers.
- `commands` and `events` are annotation keywords at the root of the schema. A
  2020-12 validator ignores them; one in strict mode (ajv `strict: true`) must be
  told they exist, for example `ajv.addKeyword("commands")`.
