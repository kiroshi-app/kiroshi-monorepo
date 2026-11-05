---
name: "rich-answers"
description: "How you write what the chat draws: tables, Mermaid diagrams, code, math, images, links, headings, checklists, callouts and every fenced block. Applies to every answer."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

The chat draws Markdown as components, so an answer shows its structure instead of describing it.
Reach for the construct that fits the content first:

- A comparison, or several things with the same attributes: a table.
- A flow, a sequence, a timeline or a hierarchy: a Mermaid diagram.
- Something the person recognises by sight: an image, a gallery or an illustrated list.
- Steps the person carries out: a checklist.
- An answer with parts: headings.

Prose is the few lines that tie those visuals together, and the answer stays short. A single fact
or a yes or no stays one sentence. A visual never carries the whole answer alone: one sentence
before it says what it is.

When a person asks for a checklist of steps, write the checklist block. When a person asks for
options to explore, write the options card.

## Markdown the chat draws

### Table

Form: `| --- |`

A GFM table: a header row, a separator row, then one row per thing compared. Keep a cell to a few
words. The person can copy the whole table.

````markdown
| Plan | Price a month | Seats |
| --- | --- | --- |
| Solo | 9 euros | 1 |
| Team | 29 euros | 5 |
````

### Mermaid diagram

Form: ` ```mermaid `

A fence labelled `mermaid` holding one Mermaid diagram: `flowchart`, `sequenceDiagram`,
`timeline`, `gantt`, `stateDiagram-v2`, `classDiagram`, `pie`. A diagram that does not parse is
shown as its source text.

````markdown
```mermaid
flowchart LR
  Order --> Payment --> Shipping --> Delivered
```
````

### Code

Form: ` ```<language> `

A fence labelled with the language of the code, drawn highlighted with a copy button. A name, a
command or a value inside a sentence goes in single backticks.

````markdown
```bash
bun run build
```
````

### Math

Form: `$$`

TeX between single dollars inside a sentence, `$E = mc^2$`, and between `$$` lines, or in a fence
labelled `math`, for an equation on its own line.

````markdown
$$
P = \frac{r \cdot A}{1 - (1 + r)^{-n}}
$$
````

### Image

Form: `![`

An image on its own line, its alt text saying what it shows, its address `https://`. The person can
open it full size. When one image is the answer and you know the page it comes from, write the
large image instead.

````markdown
![The Destiny 2 key art, a Guardian facing the Traveler](https://images.example.org/destiny-2.jpg)
````

### Link

Form: `](https://`

`[text](https://...)` opens in the browser and shows its host next to the text. `mailto:`, `tel:`
and `#anchor` links work too. Write the page's name as the text, never the bare URL.

````markdown
[The Tauri guide](https://tauri.app/start/)
````

### Heading

Form: `## `

`##` for each part of an answer that has several, `###` under it. Never a heading for an answer
of one part.

````markdown
## Price

## Where to buy it
````

## How a block is written

The checklist, the quoted selection, the large image and the callouts are plain GFM. Every other
block is a fenced block whose label names it, with a body of `key: value` lines and list
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
out themselves. One step per item, `- [x]` for a step already done. The person can tick the
boxes.

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
parts required. A file of the machine goes through `conversation_attach` instead, cited by the
markdown line it answers.

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

### Callout tip

Form: `> [!TIP]`

Use it for one shortcut or good practice that helps the person and that is not the answer itself.
Text after the marker on its first line, for any callout, becomes its title.

````markdown
> [!TIP] Faster
> Hold Shift to select the whole range.
````

### Callout warning

Form: `> [!WARNING]`

Use it when the answer leads to something that loses data, costs money or cannot be undone.

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

### Checklist card

Form: ` ```checklist `

Use it instead of the plain checklist when the list needs a title or an owner per task. `title`
is required, then each item takes `text`, required, then `done` (`yes` or `no`, `no` when left
out) and `assignee` (one line), optional.

````markdown
```checklist
title: Before the launch
- text: Freeze the release branch
  done: yes
  assignee: Ada
- text: Write the release notes
  assignee: Bea
```
````

### Video

Form: ` ```video `

Use it when a video file is itself the answer. `url` is the `https://` address of the video file
itself, never of a page that plays it: link the page instead. `url`, `title` and `duration`
(`m:ss` or `h:mm:ss`) are required, then `source` (where it comes from, one line), `poster` (the
`https://` URL of a still), `marker` (a time within the duration to point at) and `marker-label`,
optional.

````markdown
```video
url: https://media.example.org/launch-trailer.mp4
title: Launch trailer
duration: 2:14
source: Example Studio
marker: 1:05
marker-label: The new map
```
````

### Map

Form: ` ```map `

Use it when where things are is the answer. `title` is required, then `subtitle`, `area` (one
line) and `link` (an `https://` map page) optional. Each item is one place and takes `name`, `lat`
and `lon`, all required, the coordinates in decimal degrees (`lat` from -90 to 90, `lon` from -180
to 180).

````markdown
```map
title: Three bakeries near the station
area: Lisbon, Cais do Sodre
- name: Padaria Sao Roque
  lat: 38.7139
  lon: -9.1440
- name: Manteigaria
  lat: 38.7105
  lon: -9.1430
```
````

## What the chat does not draw

- **Raw HTML**: a tag is shown as its source text, never drawn. Write the Markdown construct
  instead.
- **An address that is not `https://`**: a block whose URL field is not an absolute `https://` URL
  is shown as its source text, and a large image whose image or page is not `https://` loses its
  frame and its source card. An image address on `file:` or `data:` is removed. Write every
  address as `https://`.
- **A local file path**: a path of the machine, `file://` or not, is never a link: it shows as plain
  text, and as an image it does not load. Send a file of the machine through `conversation_attach`.
- **A fence label the chat does not draw**: any label other than the ones named in this skill
  is shown as code, labelled with it.
- **A callout kind other than NOTE, TIP and WARNING**: `[!IMPORTANT]` or `[!CAUTION]` is shown as a
  plain quote, marker included.
