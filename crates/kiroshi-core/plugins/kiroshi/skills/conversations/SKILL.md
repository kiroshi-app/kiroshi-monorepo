---
name: "conversations"
description: "How you find, read, open and close a room of this space, who you seat in it, and what you say back where the work came from. Applies when a subject belongs to agents who are not in this conversation, when work runs long, and when you answer about what was said elsewhere."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

A room is a conversation of this space with a subject of its own and a seat for each
agent the subject belongs to. You hold nine tools for them, on the `kiroshi` server.

- `conversation_open`, a new room led by you, answering the id of that room, its title and
  the agents seated in it. It takes the title and the icon of the room in the same call.
  The agents to seat go in `with`, beside the first message.
- `conversation_say`, one message in a room you already hold a seat in, answering the id of
  that room and its title. It takes the id of the room and the message.
- `conversation_list`, the conversations of this space, the latest activity first, answering
  for each one its id, its kind, its title, its icon, its colour, its agents, its last
  message and whether it is archived, then a cursor for the next page. It takes
  `everywhere` true to list the rooms you hold no seat in too, a `kind` of main, topic or
  mission, a `limit` from 1 to 200 and the `cursor` of the previous page.
- `conversation_read`, one conversation of this space, seated or not, answering its
  details and its last messages oldest to newest, each with its seq, its author, its time
  and its full text, then a cursor for older messages. It takes the id of the
  conversation, a `limit` from 1 to 100 and the `before` cursor of the previous read.
- `conversation_search`, where something was said in this space, answering the
  conversations whose title or agent names match and the messages whose text matches,
  each message with its room, its author, its time and a snippet around the match. It
  takes the words to look for and a `kind` of main, topic or mission.
- `conversation_attach`, one file stored for your message, here or in a room you hold a
  seat in, answering the path it was stored under, the id of that conversation and the
  markdown line that shows the file inside your message. It takes the path of the file, a caption that labels the line
  and the id of the room, left out for this conversation.
- `conversation_post_document`, one document of the Library of this Space posted here as a
  message of yours the person opens it from, answering the name of the document, the id of
  this conversation and the id of the message. It takes the name of the document; a name
  that is not a document of this Library is refused and nothing is posted.
- `conversation_update`, the title, the icon, the colour and the seats of a conversation
  you hold a seat in, every field given landing in one call or none of them, answering that
  conversation as it stands after the call. It takes the id of the conversation, left out
  for this one, and only the fields that change. The icon is the name of a Keyline icon,
  such as Rocket, spelled as listed in `packages/shared/conversation-icons.json`. The
  colour is a hue, a whole number from 0 to 359 around the colour wheel, or one of red,
  orange, yellow, green, cyan, blue, purple or pink for the hue that name stands for, or
  null to give the room back its default colour. A field left out keeps what the room
  wears.
- `conversation_close`, the archive of a room you lead once its subject is settled,
  answering the id of that room, its title and whether it is archived. It takes the id of
  the room. Every message of the room is kept. A main conversation and the thread of a
  mission still open are never closed. An archived room comes back with `archived` false
  on `conversation_update`, and `archived` true there is refused: only
  `conversation_close` archives.
- `companion_list`, every agent of this space, answering for each one its id, its
  name and its job. It takes nothing.

`conversation_update` seats agents with `add` and takes them out with `remove`, in this
conversation, and in another room of the caller when a room id is passed.

## When a room is worth opening

Two cases, and no others.

- The subject belongs to agents who are not in this conversation.
- The work runs long and does not belong in the thread it was raised in.

A question you can answer on the spot opens no room: you answer it here.

No room is opened for the convenience of the agent opening it. A room is not a place
to think out loud, to park a task or to keep a note out of the way.

Before you open one, look for it: a room on the same subject may already stand. Find it
with `conversation_list` or `conversation_search`, and carry on there.

## The title and the first message

The title is the subject in a few words, read by someone who followed none of it. Not your
name, not the name of the person, not the word you happened to open on.

A room is opened with its title and its icon chosen together, the icon picked from
`packages/shared/conversation-icons.json` for the subject the title names. A name off that
list is refused with the accepted names. A title change carries its icon in the same call,
never the title alone.

The first message is written by you in your own words, and it is read in your name. Say
what the subject is, what you already know and what you are asking for. Whoever reads it
followed nothing of where it came from.

## Who is seated and who is summoned

An agent is seated by `with`, and it is summoned by an at sign followed by its exact
name inside the message. The two are separate: a seat lets an agent read and answer, a
summons is what makes it read now.

An agent passed to `with`, `add` and `remove` is named by its name or by its id. A
name two agents of this space share is refused, and the refusal answers their ids: pass
the id of the one you want in place of that name.

A room opened with nobody mentioned is a room where nothing happens. Seat the agents
the subject belongs to, and mention in the message each one you expect an answer from.

## Where you speak

You speak only in a room you hold a seat in, and you seat yourself in no room. Your seats
are the ones you were given: this conversation, every room you opened yourself, and every
room an agent seated you in.

A room is found with `conversation_list` and read with `conversation_read` before an
answer is sent in it. Whatever you no longer hold, the id of a room or what was said
there, `conversation_list` lists and `conversation_read` reads again: answer from what the
room holds, never from memory.

When you answer about what was said somewhere in this space, find it with
`conversation_search` and read the room it points to with `conversation_read`.

## Changing and leaving a room

A room is changed with `conversation_update`: its title with its icon, its colour, the
agents seated in it. A room you no longer belong in is left by passing yourself to
`remove` on `conversation_update`. You hold no seat there afterwards and say nothing more
in it.

A room whose subject is settled is closed with `conversation_close`, by the agent who
leads it. Every message stays readable with `conversation_read`.

## What the person reads

Reading an image with `Read` shows it to you and never to the person. A file you show sits
inside your message as the markdown line `conversation_attach` answers, never as its path.

Store the file with `conversation_attach`, then write that line, exactly as answered, where
your reply cites the file: an image is shown inline there, every other file as a link the
person opens. A line no reply of yours carries is added at the end of your last reply. In a
room, the line is posted there for you.

The person does not read the new room unless they open it. Nothing you say there reaches
them here on its own.

Whatever the person decides is asked in the conversation the person is talking in. When a
room turns up a question only they can settle, bring it back here and ask it here.

## Reporting back

Opening a room is reported in one line carrying its title, in the conversation the room
was opened from. Say that you opened it, say what it is called, and carry on.
