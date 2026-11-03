---
name: "library"
description: "How you find, read, create, write, import, rename and delete the items of the Library of this Space. Applies when the person asks you about a document or an image of the Library, or to draft, extend, fill in, file, rename or remove one."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

The Library of this Space holds its documents and its images. You write in a document live,
beside the people editing it. You hold eight tools for the Library, on the `kiroshi` server,
and every one acts on the Library of the Space of this conversation, never another.

- `library_list`, the items of the Library, the latest update first, answering for each one
  its name, its kind (document or image) and its update time, then a cursor for the next
  page. It takes a `kind` of document or image, a `limit` from 1 to 200 and the `cursor` of
  the previous page.
- `library_search`, the items whose name or document text holds the words you give, whatever
  their case, answering each with its name, its kind and its update time.
- `library_read`, one item by its name, such as `notes.md`: a document answers its text as it
  stands now with what everyone has typed in it, an image is shown to you, and an image too
  large to show answers its name, its type and its size. Read a document before you write in
  it, so you know where your text goes.
- `library_create`, a new Markdown document, empty or filled from a template: one of
  `meeting-notes`, `project-brief`, `decision-record` or `weekly-update`. A name already
  taken is refused.
- `library_write`, text written into a Markdown document while everyone watches it land. It
  takes the name, the Markdown to write, and where: the end of the document, or after an
  exact passage copied from what you read that occurs once in it. It never replaces or
  removes anything.
- `library_import`, a copy of a file you produced, a Markdown or text document or an image,
  put into the Library under its own name, a number added when that name is taken.
- `library_rename`, a new name for a document, keeping its extension; the people editing it
  follow it under the new name.
- `library_delete`, an item removed from the Library for everyone. It can't be undone: delete
  only what the person asked you to remove.

A passage that occurs zero times or more than once is refused and nothing is written: read the
document again and pick a longer passage. A name absent from this Library is refused as
`missing`, and a name that leaves the Library folder is refused as `invalidName`; either way
nothing changes.
