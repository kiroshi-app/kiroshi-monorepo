# Rich answer blocks

An agent answers in Markdown. Eleven shapes of content earn a block of their own, drawn by the
chat as a component instead of as text. This document is the syntax of each block, the fields it
takes and when an agent writes it. The system skill `skills/rich-answers/SKILL.md` of the `kiroshi`
plugin states the same syntax to every agent, and a test in `apps/app/src-tauri/src/bundles/system.rs`
fails when a form named here is missing from it.

There is no video block and no map block.

## Two kinds of block

A block GFM already expresses is written in plain GFM: the checklist, the quoted selection, the
large image and the two callouts. Every other block is a fenced block whose info string is the
label of the block, and its body is made of `key: value` lines and list items, never JSON and
never HTML.

The chat already routes a fenced block by its label (`math`, `mermaid`) in
`packages/ui/src/components/markdown/code.tsx`. A label no renderer knows falls back to a plain code
fence, so every body is written to be read as it stands: whole words, one field per line, no
escaping.

## Body of a fenced block

- A line `key: value` at the start of the line is a field of the block.
- A line `- key: value` opens an item. The lines under it indented by two spaces, `  key: value`,
  are more fields of that item.
- The fields of the block come before its first item.
- A key is lowercase letters and hyphens. The value is the rest of the line after the first colon
  and its space, trimmed, on one line.
- A value is plain text. The renderer shows it as text: Markdown and HTML inside a value are
  never interpreted.
- A URL is an absolute `https://` URL.
- Blank lines are ignored, except in `collapsible`, where the first one ends the fields.

A block with a required field missing, a field it does not take, a field given twice or a URL that
is not `https://` is drawn as its source, exactly like a label no renderer knows. Nothing of it is
drawn partly.

## Picking a block

A block is picked only when the content already has its shape. An answer that is an explanation,
an opinion or a single fact is plain prose. A block never carries the whole answer alone: one
sentence before it says what it is.

## Blocks

### Checklist

Form: `- [ ]`

A GFM task list, one item per step, `- [ ]` for a step to do and `- [x]` for a step already done.
The boxes are read-only in the chat.

| Field | Type | Required |
| --- | --- | --- |
| step | text after the box, one line | yes |
| done | `[x]` in place of `[ ]` | no |

````markdown
- [x] Back up the database
- [ ] Stop the sync service
- [ ] Run the migration
- [ ] Start the sync service again
````

When: the person asks for a checklist of steps, or the answer is a sequence of actions the person
carries out themselves.

### Quoted selection

Form: `> `

A GFM blockquote holding the passage word for word, never opening on `[!`.

| Field | Type | Required |
| --- | --- | --- |
| text | the quoted passage, every line opening on `> ` | yes |

````markdown
> The sync dedupes on the client id, not on the timestamp.
````

When: the answer is about one passage, of an earlier message or of a document, and the person
needs to see which one before reading the answer.

### Large image

Form: `Source: [`

A GFM image alone on its line, then a blank line, then one line opening on `Source: ` that links
the page the image comes from.

| Field | Type | Required |
| --- | --- | --- |
| alt | text, what the image shows | yes |
| image | `https://` URL of the image | yes |
| source name | text, the name of the page or site | yes |
| source page | `https://` URL of the page | yes |

````markdown
![The Lisbon waterfront at dusk](https://images.example.org/lisbon-waterfront.jpg)

Source: [Visit Lisboa](https://www.visitlisboa.com/en/places/waterfront)
````

When: one image is itself the answer, found on a page the agent read. A file of the machine is
shown with `conversation_attach`, never with this block.

### Callout note

Form: `> [!NOTE]`

A GFM blockquote whose first line is `[!NOTE]` alone, then the note.

| Field | Type | Required |
| --- | --- | --- |
| text | the note, every line opening on `> ` | yes |

````markdown
> [!NOTE]
> The export keeps the archived rooms too.
````

When: one aside the person should not miss and that is not the answer itself.

### Callout warning

Form: `> [!WARNING]`

A GFM blockquote whose first line is `[!WARNING]` alone, then the warning. No other GFM alert
kind is written.

| Field | Type | Required |
| --- | --- | --- |
| text | the warning, every line opening on `> ` | yes |

````markdown
> [!WARNING]
> This deletes every message of the room. This can't be undone.
````

When: the answer leads to something that loses data, costs money or cannot be undone.

### Illustrated list

Form: ` ```illustrated-list `

One item per entry, each one with its picture.

| Field | Type | Required |
| --- | --- | --- |
| title | item, text | yes |
| image | item, `https://` URL, its alt text is the title | yes |
| text | item, text, one line | no |
| link | item, `https://` URL of the page of the item | no |

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

When: two to eight things the person tells apart by how they look, such as places, products or
rooms.

### Options card

Form: ` ```options `

The paths open to the person, each with what it means.

| Field | Type | Required |
| --- | --- | --- |
| question | block, text, what the person is choosing | no |
| title | item, text, the name of the option | yes |
| text | item, text, one line on what it costs and what it gives | yes |

````markdown
```options
question: How should the migration ship?
- title: One release
  text: A single downtime window of about ten minutes, nothing to keep in sync.
- title: Dual write
  text: No downtime, two weeks of writing to both tables before the switch.
```
````

When: the person asks for options to explore, or the answer is two to five distinct ways forward
the person picks from. The card picks nothing: the agent waits for the person to name an option.

### Interactive view

Form: ` ```interactive `

Sliders and one result computed from them. It declares sliders and one result formula, with a
label for that result, and nothing else.

| Field | Type | Required |
| --- | --- | --- |
| result | block, formula over slider names | yes |
| result-label | block, text, what the result is | yes |
| name | item, slider name: a lowercase letter, then lowercase letters, digits or underscores | yes |
| label | item, text, what the slider sets | yes |
| min | item, number | yes |
| max | item, number, above min | yes |
| step | item, number, above zero | yes |
| default | item, number, from min to max | yes |

A number is digits, optionally a dot and more digits, optionally led by a minus in a slider field:
`12`, `0.5`, `-3`. One to five sliders, their names all different.

The formula takes numbers, slider names, `+ - * / ^`, parentheses and these functions only:

Functions: `abs`, `sqrt`, `exp`, `ln`, `log10`, `floor`, `ceil`, `round`, `min`, `max`

`min` and `max` take two arguments separated by a comma, every other function takes one. `^` binds
tightest and groups from the right, then a leading minus, then `*` and `/`, then `+` and `-`, both
grouping from the left: `-x ^ 2` is `-(x ^ 2)`, `2 ^ 3 ^ 2` is `2 ^ 9` and `2 ^ -1` is `0.5`.
Spaces between tokens are ignored.

```text
sum      = product { ("+" | "-") product }
product  = unary { ("*" | "/") unary }
unary    = "-" unary | power
power    = atom [ "^" unary ]
atom     = number | name | call | "(" sum ")"
call     = function "(" sum [ "," sum ] ")"
number   = digit { digit } [ "." digit { digit } ]
name     = lowercase { lowercase | digit | "_" }
```

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

The view never runs a script, renders HTML, fetches from the network or reads or writes storage,
and the formula refers to no name that is not declared as a slider. The renderer evaluates the
formula with its own parser over this grammar, never with `eval` or `Function`. It shows the
result rounded to two decimals at most.

A formula the renderer cannot evaluate is handled in one of two ways:

- A block that breaks this grammar (a formula that does not parse, a name not declared as a
  slider, a function not listed, a wrong number of arguments, a slider whose numbers do not hold)
  is drawn as its source, with no slider.
- A valid formula whose value is not a finite number at the current slider values (a division by
  zero, the root of a negative number) keeps its sliders live and shows the result as not defined
  for those values, until the sliders move back to values that give a number.

When: the answer is a number that depends on a few others the person wants to try, such as a
repayment, a budget or a conversion.

### Collapsible section

Form: ` ```collapsible `

A title shown closed, and content the person opens. The content is everything after the first
blank line, in Markdown: paragraphs, lists, links and inline code, no fenced block and no HTML.

| Field | Type | Required |
| --- | --- | --- |
| title | block, text, shown while closed | yes |
| content | Markdown after the first blank line | yes |

````markdown
```collapsible
title: Full list of the 14 failing tests

- `sync dedupes on the client id`
- `sync keeps the newest edit`
- and twelve more of the same file.
```
````

When: material that supports the answer and that most readers skip, such as a long list, a log
excerpt or a derivation.

### Web page card

Form: ` ```web-page `

One web page, one card. Several pages are several blocks.

| Field | Type | Required |
| --- | --- | --- |
| url | `https://` URL of the page | yes |
| title | text, the title of the page | yes |
| description | text, one line on what the page holds | no |
| site | text, the name of the site, the host of the URL when left out | no |
| image | `https://` URL of the page preview | no |
| alt | text, what the preview shows | no |

`alt` is read only alongside `image`: given alone, it is ignored.

````markdown
```web-page
url: https://tauri.app/start/
title: What is Tauri?
description: The official introduction, with the supported platforms.
site: Tauri
image: https://tauri.app/og.png
alt: The Tauri logo over the words Build smaller, faster, and more secure apps
```
````

When: the next thing the person should read is one page the agent opened in this session. A URL
the agent did not open is never put in a card.

### Gallery

Form: ` ```gallery `

Several images shown together.

| Field | Type | Required |
| --- | --- | --- |
| image | item, `https://` URL of the image | yes |
| alt | item, text, what the image shows | yes |
| caption | item, text, one line | no |
| source | item, `https://` URL of the page the image comes from | no |

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

When: two to twelve images the person compares by eye, where each needs no more than a caption.
