# Space archive

`space_export` writes one Space to a single uncompressed tar file; `space_import` recreates it
from that file under the application data directory of any machine.

## Layout

```
manifest.json                 the format version, the exported space id and the secret names
rows.json                     every sqlite row of the space, keyed by table name
space/                        the space plugin directory (spaces/<space id>)
bots/<bot id>/                the plugin directory of each bot seated in the space, .git included
attachments/<conversation id>/  the attachment files of each conversation of the space
avatars/<file name>           the avatar image named by avatar_image_path of each exported bot
```

No env file travels. `manifest.json` lists the key names held by the space, by each MCP server
of the space, by each seated bot and by each MCP server of that bot, grouped by scope, and never a
value:

```json
{
  "format_version": 2,
  "space_id": "<exported space id>",
  "env": {
    "space": { "names": ["SPACE_TOKEN"], "servers": { "<server>": ["REGION"] } },
    "bots": {
      "<bot id>": { "names": ["BOT_TOKEN"], "servers": { "<server>": ["API_KEY"] } }
    }
  }
}
```

A name declared and unset on the exporting machine is listed like a name holding a value. The
names an OAuth grant writes and the connection names are never listed.

An avatar whose file is missing, or lies outside the avatars directory, is not carried: its bot
travels with `avatar_image_path` null.

`manifest.json` is always the first entry and `rows.json` the second. Symbolic links inside a
plugin directory are not carried.

`rows.json` holds the rows of `spaces`, `space_settings`, `sections`, `bots`, `bot_spaces`,
`conversations`, `conversation_participants`, `turns`, `messages`, `message_pins`, `activities`,
`context_checkpoints`, `conversation_arrivals`, `application_installs`, `routines`,
`routine_runs`, `routine_dedupe_values`, `missions` and `mission_events`, read inside one read
transaction. The bots are those seated in the space plus every participant of its conversations.

`runtime_sessions` rows are left out, as are the checkpoints tied to one, and
`messages.runtime_session_id` travels as null: an imported companion starts a new session on its
next message.

## `format_version`

An integer, currently `2`. The importer reads versions `1` and `2` and refuses any other value with
`unsupportedArchive`, naming the version found and the version it writes, before it writes anything.
Bump it whenever the layout or the meaning of a row changes.

Version `1` carried the env files themselves, values in clear, under `env/space/`,
`env/space-servers/<server>/`, `env/bots/<bot id>/` and `env/bot-servers/<bot id>/<server>/`.
Importing one reads each name those files hold and discards every value: the names land exactly as
those of a version `2` manifest. A version `2` archive holding a path under `env/` is refused.

## Import

- An id already present on the target (a row, or a directory named after it) is replaced by a
  fresh one, and every row, directory name and env path that references it is rewritten.
- The imported space is appended at the end of the space order.
- Each seated bot is seated in the imported space only. A participant that was not seated in the
  exported space arrives retired.
- Each carried avatar is laid into the avatars directory of the target under its own name, or
  under a fresh one when that name is taken, and `avatar_image_path` is rewritten to it.
- Attachment paths quoted in message contents are rewritten to the attachment directory of the
  target.
- Each listed name is declared and unset in the env store of its scope, under the minted id when
  one was minted: `env_list` returns it with `isUnset: true`, and `store::resolve` leaves it out,
  so a server reading it as `${NAME}` is not started until a value is written with `env_set`.
- Files and declared names are laid down first, then the rows are written in one transaction. If
  any step fails, every directory and avatar file the import created, declared names included, is
  removed and no row lands.

## Export

The archive is streamed through a tar builder into an owner-only temporary file beside the target,
then renamed onto the target path; it is never held whole in memory. A failed export removes the
temporary file and leaves the target path untouched.

## Security

No env value travels: the archive carries the names of the secrets of the space and its bots, never
their values, so whoever imports it types each value again. The archive is still written
owner-only, since its rows and plugin directories hold the conversations of the space.
