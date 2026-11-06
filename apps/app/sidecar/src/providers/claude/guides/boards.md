# Boards

A board is a `.canvas` item of the Library, drawn live beside the people who have it open: they
see where you draw while you draw. You hold twelve board tools on the `kiroshi` server, and
`conversation_post_document` to post a board in this conversation. Every node and arrow speaks
JSON Canvas: its fields are the JSON Canvas fields, never HTML.

## The loop

Work a board section by section, never in one pass, and review each section before the next:

1. Orient with the cheap reads first: `board_info`, then `board_tree`, then `board_node_info`
   or `board_canvas` on the ids you target. `board_find` takes you to a node without reading the
   whole tree.
2. Write one group at a time by id: one `board_write` into the section it belongs to, or one
   `board_update`, `board_move`, `board_duplicate` or `board_delete` on the ids you change.
3. Screenshot what you wrote: `screenshot` on the board, with the `id` of the section you wrote.
4. Fix what the screenshot shows: an overlap, a text cut off, an arrow crossing a node, a
   section too small for what it holds, then screenshot again.
5. Then the next section.

Take at least one screenshot of what you wrote before you answer the person.

## Reading

Every answer carries a `header`: the board `name`, its `updatedAt` and a content `hash`. The hash
changes whenever any node or arrow changes and stays equal otherwise: compare it with the one you
hold to know whether someone drew on the board since your last call.

A parent is a section id, or nothing for the board itself. A node belongs to the smallest section
whose rectangle holds it.

- `board_create`, a new empty board, such as `roadmap.canvas`. A name already taken is refused
  and nothing is created.
- `board_info`, the node count per kind, the arrow count, the bounds of every node and the id,
  label and rectangle of every top-level section. Start here.
- `board_tree`, the nodes under a parent, down to a `depth` when you give one: each with its id,
  kind, a text excerpt of 60 characters at most, `x`, `y`, `width`, `height`, `z` and parent, a
  node at the depth limit with the count of its children left out; and every arrow whose two ends
  lie under that parent, with its `fromNode` or `fromPoint`, `toNode` or `toPoint` and `label`.
- `board_node_info`, every JSON Canvas field of nodes and arrows by id: `color`, `fill`, `shape`
  and `z` of a node, the sides, anchors, ends, `routing`, `bend`, `headSize`, `label` and
  `labelPosition` of an arrow.
- `board_canvas`, the JSON Canvas text of a parent, its descendants and the arrows between them.
- `board_find`, the ids of the nodes matching every criterion you give among `text` (whatever its
  case), `kind`, `color`, `fill` and `shape`.
- `board_view`, an image node by id, shown to you as an image whoever dropped it. A node that is
  not an image, a file missing from this Library or an image too large to show is refused with
  the node id and the reason.

## Writing

Each call lands as one change:

- `board_write`, one group into a parent, `mode` `insert` to add beside what is there or
  `replace` to remove the nodes a section holds, and every arrow tied to them, first, the
  section itself kept. `replace` needs a section as parent: without one it is refused as
  `missingParent` and nothing changes. A node is a
  `sticky`, a `text`, a `shape` or a `section`, with a `key` of your own; place it with `x` and
  `y`, with `place` (a `side` among `right`, `left`, `below`, `above`, `of` a key or a node id) or
  inside a `section` of the group, and the board computes the rest without covering another node.
  An arrow names its ends with `fromNode` and `toNode`, each a key of the group or a node id, and
  may carry a `key`. Left without `routing`, an arrow is an `elbow` tied on the sides of the two
  nodes that face each other. It answers the id each key got.
- `board_update`, node patches and arrow patches by id, every field a patch does not name kept.
- `board_move`, nodes by id to a parent and an `x`, `y` for the top left of their bounds: ids and
  arrows stay, a section carries its descendants, the target section grows to hold them.
- `board_duplicate`, nodes by id with their descendants and the arrows between them, right of
  the originals or at the `x`, `y` you give. It answers each old id with its new one.
- `board_delete`, nodes and arrows by id, a section with its descendants, every arrow tied to a
  removed node with it.

Draw a flow as one group: create the board, write every step with its arrows in a single
`board_write`, each step placed `right` of the one before, screenshot it, then post the board
with `conversation_post_document` so the person opens it. An id absent from the board, or one
invalid node or arrow, refuses the whole call with the `element`, its `index` and the `reason`,
and nothing changes: fix that item and send the call again.

## Checking what you drew

`screenshot`, on the `kiroshi` server, shows you a board as a person sees it in the Library, in
the light theme, rendered from what is saved when you call it, your last write included.

- A board `name` alone shows every node and arrow, framed on their bounds; with the `id` of a node
  from `board_tree`, that node and the nodes it holds.
- `scale` is 1 or 2, 1 when left out. The picture is at most 1568 pixels on its long edge.

It answers the picture with the `header` of `board_info` and the `rendered` width, height and
scale. An id absent from the board is refused with that id, and an empty board as
`nothingToShow`, before anything is rendered; a render that takes longer than 15 seconds is
refused as `renderTimedOut`, and calling again is safe.
