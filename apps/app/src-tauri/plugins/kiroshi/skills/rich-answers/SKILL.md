---
name: "rich-answers"
description: "How you write the blocks the chat draws as components: checklist, options card, illustrated list, large image, quoted selection, interactive view, callouts, collapsible section, web page card and gallery. Applies to every answer whose content has the shape of one of them."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

The chat draws eleven shapes of content as components. Pick a block only when the content has
that shape, and answer in plain prose otherwise. An explanation, an opinion or a single fact is
plain prose. A block never carries the whole answer alone: one sentence before it says what it
is. There is no video block and no map block: link the page instead.

When a person asks for a checklist of steps, write the checklist block. When a person asks for
options to explore, write the options card.

## How a block is written

The checklist, the quoted selection, the large image and the two callouts are plain GFM. Every
other block is a fenced block whose label names it, with a body of `key: value` lines and list
items, never JSON and never HTML.

- A line `key: value` at the start of the line is a field of the block, written before the
  first item.
- A line `- key: value` opens an item, and the lines under it indented by two spaces,
  `  key: value`, are more fields of that item.
- A value is plain text on one line: no Markdown, no HTML inside it.
- A URL is an absolute `https://` URL.

A block with a required field missing, a field it does not take, a field given twice or a URL
that is not `https://` is shown as its source text, never drawn. Write every body so that it
reads well as that text: whole words, one field per line.

## Blocks

### Checklist

Form: `- [ ]`

Use it when the person asks for a checklist of steps, or for a sequence of actions they carry
out themselves. One step per item, `- [x]` for a step already done. The boxes are read-only.

````markdown
- [x] Back up the database
- [ ] Stop the sync service
- [ ] Run the migration
- [ ] Start the sync service again
````

### Quoted selection

Form: `> `

Use it when the answer is about one passage the person must see first. The passage is quoted
word for word, and never opens on `[!`.

````markdown
> The sync dedupes on the client id, not on the timestamp.
````

### Large image

Form: `Source: [`

Use it when one image is itself the answer, found on a page you read. The image alone on its
line with its alt text, a blank line, then `Source: ` linking the page it comes from, all four
parts required. A file of the machine goes through `conversation_attach` instead.

````markdown
![The Lisbon waterfront at dusk](https://images.example.org/lisbon-waterfront.jpg)

Source: [Visit Lisboa](https://www.visitlisboa.com/en/places/waterfront)
````

### Callout note

Form: `> [!NOTE]`

Use it for one aside the person should not miss and that is not the answer itself.

````markdown
> [!NOTE]
> The export keeps the archived rooms too.
````

### Callout warning

Form: `> [!WARNING]`

Use it when the answer leads to something that loses data, costs money or cannot be undone. No
other alert kind is written.

````markdown
> [!WARNING]
> This deletes every message of the room. This can't be undone.
````

### Illustrated list

Form: ` ```illustrated-list `

Use it for two to eight things the person tells apart by how they look. Each item takes `title`
and `image`, required, then `text` (one line) and `link`, optional.

````markdown
```illustrated-list
- title: Lisbon
  image: https://images.example.org/lisbon.jpg
  text: Mild winters and the cheapest flights of the three.
  link: https://www.visitlisboa.com
- title: Porto
  image: https://images.example.org/porto.jpg
  text: Smaller, quieter, two hours north by train.
```
````

### Options card

Form: ` ```options `

Use it when the person asks for options to explore, or when two to five distinct ways forward
are open. `question` is optional, then each item takes `title` and `text`, both required, `text`
saying in one line what the option costs and gives. The card picks nothing: wait for the person
to name an option.

````markdown
```options
question: How should the migration ship?
- title: One release
  text: A single downtime window of about ten minutes, nothing to keep in sync.
- title: Dual write
  text: No downtime, two weeks of writing to both tables before the switch.
```
````

### Interactive view

Form: ` ```interactive `

Use it when the answer is a number that depends on a few others the person wants to try. It
declares only one to five sliders and one result formula, all fields required: `result` and
`result-label` for the block, `name`, `label`, `min`, `max`, `step` and `default` for each
slider. A slider name is a lowercase letter, then lowercase letters, digits or underscores.
`max` is above `min`, `step` above zero, `default` from `min` to `max`.

The formula takes numbers, slider names, `+ - * / ^`, parentheses and these functions only:

Functions: `abs`, `sqrt`, `exp`, `ln`, `log10`, `floor`, `ceil`, `round`, `min`, `max`

`min` and `max` take two arguments separated by a comma, the others one. `^` binds tightest and
groups from the right, then a leading minus, then `*` `/`, then `+` `-`. The result is shown
rounded to two decimals at most.

````markdown
```interactive
result: amount * rate / 1200 / (1 - (1 + rate / 1200) ^ -(years * 12))
result-label: Monthly payment in euros
- name: amount
  label: Amount borrowed
  min: 10000
  max: 500000
  step: 1000
  default: 200000
- name: rate
  label: Yearly rate in percent
  min: 0.5
  max: 8
  step: 0.1
  default: 3.5
- name: years
  label: Length in years
  min: 5
  max: 30
  step: 1
  default: 20
```
````

Never put a script, HTML, a network fetch, a storage access or a name that is not a declared
slider in it. A formula that breaks these rules is shown as its source, with no slider. A valid
formula that gives no finite number at the current values, such as a division by zero, keeps its
sliders and shows the result as not defined until the values change.

### Collapsible section

Form: ` ```collapsible `

Use it for material that supports the answer and that most readers skip: a long list, a log
excerpt, a derivation. `title` is required and shown closed. Everything after the first blank
line is the content, in Markdown, with no fenced block and no HTML.

````markdown
```collapsible
title: Full list of the 14 failing tests

- `sync dedupes on the client id`
- `sync keeps the newest edit`
- and twelve more of the same file.
```
````

### Web page card

Form: ` ```web-page `

Use it when the next thing to read is one page you opened in this session, never a URL you did
not open. One page per block. `url` and `title` are required, `description` (one line), `site`,
`image` and `alt` optional. `image` is the `https://` URL of the page preview and `alt` says what
the preview shows: write `alt` only together with `image`. When you know the preview image of the
page you opened, write both `image` and `alt`.

````markdown
```web-page
url: https://tauri.app/start/
title: What is Tauri?
description: The official introduction, with the supported platforms.
site: Tauri
image: https://images.example.org/tauri-start.jpg
alt: Preview of the Tauri introduction page
```
````

### Gallery

Form: ` ```gallery `

Use it for two to twelve images the person compares by eye. Each item takes `image` and `alt`,
required, then `caption` (one line) and `source`, the page the image comes from, optional.

````markdown
```gallery
- image: https://images.example.org/sofa-green.jpg
  alt: Green velvet sofa, three seats
  caption: Green velvet, 1,290 euros
  source: https://shop.example.org/sofa-green
- image: https://images.example.org/sofa-grey.jpg
  alt: Grey linen sofa, three seats
  caption: Grey linen, 990 euros
```
````
