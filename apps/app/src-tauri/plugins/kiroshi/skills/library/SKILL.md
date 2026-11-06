---
name: "library"
description: "How you find, read, create, edit block by block, import, rename and delete the items of the Library of this Space, and draw on its boards. Applies when the person asks you about a document, an image or a board of the Library, or to draft, extend, fill in, file, rename, remove or draw one."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

The Library of this Space holds its documents, its images and its boards. You write in a document live,
beside the people editing it. You hold seven tools for the Library and seven tools for its
Markdown documents, on the `kiroshi` server, and every one acts on the Library of the Space of
this conversation, never another.

- `library_list`, the items of the Library, the latest update first, answering for each one
  its name, its kind (document or image) and its update time, then a cursor for the next
  page. It takes a `kind` of document or image, a `limit` from 1 to 200 and the `cursor` of
  the previous page.
- `library_search`, the items whose name or document text holds the words you give, whatever
  their case, answering each with its name, its kind and its update time.
- `library_read`, one item by its name, such as `notes.md`: a document answers its text as it
  stands now with what everyone has typed in it, an image is shown to you, and an image too
  large to show answers its name, its type and its size. To change a Markdown document, read
  its blocks with `document_tree` instead.
- `library_create`, a new Markdown document, empty or filled from a template: one of
  `meeting-notes`, `project-brief`, `decision-record` or `weekly-update`. A name already
  taken is refused.
- `library_import`, a copy of a file you produced, a Markdown or text document or an image,
  put into the Library under its own name, a number added when that name is taken. With
  `overwrite` naming an item of the same kind, the file replaces that item in place, under
  the same name.
- `library_rename`, a new name for a document, keeping its extension; the people editing it
  follow it under the new name.
- `library_delete`, an item removed from the Library for everyone. It can't be undone: delete
  only what the person asked you to remove.

Every one of `library_create` and `library_import` answers the name the item stands under:
keep it, it is how you find the item again.

## Documents

A Markdown document is a list of blocks: a heading, a paragraph, a list, a checklist, a quote, a
code block, a table, a rule or an image. Every block carries an id of its own, written in the
file as a `^id` marker at the end of the block, that stays the same until the block is deleted.
A block with no id yet gets one the first time a document tool reads it.

- `document_info`, a document in one short answer: its name, its update time, how many blocks
  it holds and the id of its first heading.
- `document_tree`, every block in order with its id, its kind, its level for a heading and its
  first words.
- `document_read_block`, the Markdown of one block by id, without its marker.
- `document_insert_after`, new blocks written live right `after` a block id, or at the start of
  the document when `after` is left out; name the last block of the tree to add at the end. It
  answers the id of each new block.
- `document_replace_block`, one block by id swapped live for new Markdown of one or more
  blocks. The first new block keeps the id of the one it replaces; it answers every resulting id.
- `document_delete_block`, blocks removed live by their ids, answering the ids removed.
- `document_find`, the blocks holding some text, whatever its case, each with its id, its kind
  and the line that matched.

Read the tree first, then target a block by its id: `document_tree`, then
`document_read_block` on the block you change, then `document_replace_block`,
`document_insert_after` or `document_delete_block`. In a long document, `document_find` takes
you to the block without reading the whole tree. Send Markdown without any `^id` marker: the
document gives every new block its own id and drops any marker you write.

An id absent from the document is refused as `blockNotFound` naming that id, and nothing
changes: call `document_tree` again for the ids the document holds now, since a person may have
deleted that block.

Changing an item that already exists, one you made or not, means editing it in place, never
creating a new one. A new title, a rewritten section: `document_replace_block` on its blocks. A
removed section: `document_delete_block` on its blocks. A new version of an image or a file you
imported: `library_import` with `overwrite` naming that item. Create or import a new item only
when the person asks for a new one.

A name absent from this Library is refused as `missing`, and a name that leaves the Library
folder is refused as `invalidName`; either way nothing changes.

## Boards

A board is a `.canvas` item of the Library, drawn live beside the people who have it open: they
see where you draw while you draw. You hold six board tools on the `kiroshi` server, and
`conversation_post_document` to post a board in this conversation.

- `board_create`, a new empty board, such as `roadmap.canvas`. A name already taken is refused
  and nothing is created.
- `board_read`, every node of a board with its id, kind, position, size, text and the section
  that holds it, and every arrow with its two ends, its label, `labelPosition` (from 0 at the
  start of the arrow to 1 at its end, 0.5 by default), `bend`, `routing` and `headSize`:
  an end tied to a node answers its node id, with an anchor (`x` and `y` from 0 to 1 across the
  node) unless it is tied at the centre, and a free end its board point. An `image` or a
  `libraryCard` also answers its `file`, the Library item `library_read` opens, an `image` its
  `mediaType`, and a `linkCard` its `url` and `title`. Read a board before you change it, so you
  hold the ids of its nodes.
- `board_view`, an image node by id, shown to you as an image whoever dropped it. A node that is
  not an image, a file missing from this Library or an image too large to show is refused with
  the node id and the reason.
- `board_add`, a whole diagram in one call: every node and every arrow, landing at once. A node
  is a `sticky`, a `text`, a `shape` or a `section`, with a `key` of your own. Place it with
  `place` (a `side` among `right`, `left`, `below`, `above`, `of` a key of this call or a node id
  of the board), or inside a `section`, and the board computes its position without covering
  another node. A node without a place lands right of the node before it. An arrow ties `from`
  to `to` at their centre, each a key, a node id, or the text of the one node of the board that
  shows it; arrows with no nodes tie nodes already on the board. It answers the node id each key
  got.
- `board_update`, fields of nodes by id, every other field kept, on any node whoever drew it:
  `x`, `y`, `width` and `height` move and resize any kind, an image and a Library card included.
- `board_remove`, nodes of any kind by id, whoever drew them, with every arrow tied to them.

Draw a flow in one `board_add`: create the board, add every step with its arrows in a single
call, each step placed `right` of the one before, then post the board with
`conversation_post_document` so the person opens it. One invalid node or arrow refuses the whole
call with its `index` and its `reason`, and nothing changes: fix that item and send the call
again.
