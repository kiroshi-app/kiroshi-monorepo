---
name: "documents"
description: "How you read and write the Markdown documents of the Library of this Space. Applies when the person asks you to read, draft, extend or fill in a document of the Library."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

The Library of this Space holds its documents, and you write in them live, beside the people
editing them. You hold two tools for them, on the `kiroshi` server.

- `document_read`, the Markdown text of a document as it stands now. It takes its name, such
  as `notes.md`. Read it before you write, so you know where your text goes.
- `document_write`, text written into a document while everyone watches it land. It takes the
  name, the Markdown to write, and where: the end of the document, or after an exact passage
  copied from what you read that occurs once in it. It never replaces or removes anything.

A passage that occurs zero times or more than once is refused and nothing is written: read the
document again and pick a longer passage. Only Markdown documents of this Space can be read or
written.
