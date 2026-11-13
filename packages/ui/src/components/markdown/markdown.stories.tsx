import { useState } from "react"
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	BOARD_CARD_TITLE,
	PLANNING_BOARD_SNAPSHOT,
} from "@workspace/ui/components/board/board.fixtures"
import {
	BoardCard,
	type BoardCardSummary,
} from "@workspace/ui/components/board/board-card"
import {
	LIBRARY_STORED_IMAGES,
	resolvedLibraryImageOf,
} from "@workspace/ui/components/library.fixtures"
import { Markdown } from "@workspace/ui/components/markdown"
import type { MarkdownBoardLinkRenderer } from "@workspace/ui/components/markdown/board-link"
import { MarkdownSizeContext } from "@workspace/ui/components/markdown/size"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import { Button } from "@workspace/ui/components/ui/button"

const HEADINGS = `# Nest report
## Occupants
### Arrivals
#### Departures
##### Pending checks
###### Metadata

A paragraph between two headings, so the vertical rhythm is visible.

# Nest with \`readNest()\``

const EMPHASIS = `The sync is **required**, the retry is _optional_, and the old flag is ~~deprecated~~.

Call \`readNest(id)\` before \`summarise(id)\`, never the other way around.`

const LISTS = `Unordered:

- occupants
- arrivals
- departures

Ordered:

1. read the nest
2. summarise it
3. archive it`

const NESTED_LIST = `- occupants
	- resident
		- arrived this week
		- arrived last week
	- visitor
- structure
	- roof
		- repaired`

const TASK_LIST = `- [x] read the nest
- [x] summarise the occupants
- [ ] archive the record
- [ ] notify the owner`

const BLOCKQUOTE = `> The sync ran twice and the second pass found nothing.

Followed by prose.

> An outer quote
>
> > holding an inner one.`

const TABLE_IN_BLOCKQUOTE = `> Counts as of the last sync:
>
> | nest | occupants | archived |
> | --- | --- | --- |
> | nest_42 | 3 | no |
> | nest_43 | 0 | yes |
>
> Two rows changed since yesterday.`

const TABLE = `| nest | occupants | status | archived |
| :--- | ---: | :---: | --- |
| nest_42 | 3 | active | no |
| nest_43 | 0 | empty | yes |
| nest_44 | 12 | active | no |`

const WIDE_TABLE = `| nest | occupants | joined | left | role | invited by | last sync | note |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| nest_42 | 3 | 2026-01-04 | — | resident | nest_01 | 2026-08-18 09:12 | rejoined after the archive pass |
| nest_43 | 0 | 2025-11-27 | 2026-02-02 | visitor | nest_42 | 2026-08-18 09:12 | last occupant left before the sync |
| nest_44 | 12 | 2024-07-19 | — | resident | nest_01 | 2026-08-17 23:58 | the widest roster on record |`

const NARROW_TABLE = `| nest | occupants |
| --- | ---: |
| nest_42 | 3 |`

const AWKWARD_TABLE = `| cell | copies as |
| --- | --- |
| **bold** with \`code\` | inline markdown, flattened |
| left\tright | one field, not two |
| ![nest crest](nest-crest.png) | the alt text |
| pipe \\| inside | the escaped pipe |
|  | an empty field |`

const AWKWARD_TSV = [
	"cell\tcopies as",
	"bold with code\tinline markdown, flattened",
	"left right\tone field, not two",
	"nest crest\tthe alt text",
	"pipe | inside\tthe escaped pipe",
	"\tan empty field",
].join("\n")

const CODE = `Inline \`bun run storybook\` starts it, the fence carries the file:

\`\`\`ts
export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}
\`\`\``

const CODE_RUST = `\`\`\`rust
pub fn summarise(nest: &Nest) -> Summary {
	let occupants = nest.occupants.iter().filter(|o| o.active).count();
	Summary { id: nest.id.clone(), occupants }
}
\`\`\``

const CODE_PYTHON = `\`\`\`python
def summarise(nest_id: str) -> dict:
	nest = read_nest(nest_id)
	return {"id": nest.id, "occupants": len(nest.occupants)}
\`\`\``

const CODE_CSS = `\`\`\`css
.nest-card {
	display: grid;
	gap: 0.5rem;
	color: var(--foreground);
}
\`\`\``

const CODE_HTML = `\`\`\`html
<article class="nest-card">
	<h2>Nest 42</h2>
	<p>3 occupants</p>
</article>
\`\`\``

const CODE_YAML = `\`\`\`yaml
nest: nest_42
occupants: 3
archived: false
\`\`\``

const CODE_MARKDOWN = `\`\`\`md
# Nest 42

- 3 occupants
- archived: **no**
\`\`\``

const CODE_UNKNOWN = `\`\`\`elixir
def summarise(nest_id) do
	nest = Nest.read(nest_id)
	%{id: nest.id, occupants: length(nest.occupants)}
end
\`\`\`

A fence with no label at all:

\`\`\`
nest_42 archived at 18:04
\`\`\``

const CODE_COPY_SOURCE = `bun run test --project=unit\n\n\tbun run lint`

const CODE_COPY = `\`\`\`bash\n${CODE_COPY_SOURCE}\n\`\`\``

const CODE_LONG_SOURCE = `\`\`\`ts
${Array.from(
	{ length: 240 },
	(_, index) =>
		`export const nest${index} = { id: "nest_${index}", occupants: ${index % 7} }`,
).join("\n")}
\`\`\``

const CODE_LONG_LINE = `\`\`\`ts
const migration = { table: "nest_occupants", columns: ["id", "nest_id", "display_name", "joined_at", "left_at", "role"], indexes: ["nest_id_joined_at"] }
\`\`\``

const INLINE_MATH = `The dedupe window is $\\Delta t < 250\\,\\text{ms}$, so a retry inside $2^{-2}$ of a second collapses into the first — and a plan at $5 a month keeps its dollar sign.`

const DISPLAY_MATH = `The cost of a sync grows with the roster:

$$
c(n) = \\sum_{i=1}^{n} \\frac{o_i}{2^{i}} + \\log_2 n
$$

Past $n = 40$ the term on the right stops mattering.`

const MALFORMED_MATH = `An expression that never closes its brace: $\\frac{1}{$.

$$
\\begin{bmatrix} 1 & 2 \\\\ 3
$$

The next one still typesets: $e^{i\\pi} + 1 = 0$.`

const OVERSIZED_MATRIX = (() => {
	const row = Array.from({ length: 20 }, (_, column) => column).join(" & ")
	return Array.from({ length: 20 }, () => row).join(" \\\\ ")
})()

const OVERSIZED_MATH = `A matrix past what an expression may cost:

$$
\\begin{matrix} ${OVERSIZED_MATRIX} \\end{matrix}
$$

The next one still typesets: $e^{i\\pi} + 1 = 0$.`

const MERMAID_FLOWCHART = `\`\`\`mermaid
flowchart TD
	A[Read the nest] --> B{Occupants?}
	B -- yes --> C[Summarise]
	B -- no --> D[Archive]
	C --> E[Notify the owner]
	D --> E
\`\`\``

const MERMAID_WIDE = `\`\`\`mermaid
flowchart LR
	A[Read the nest] --> B[Merge the cache] --> C[Dedupe on client id] --> D[Summarise occupants] --> E[Archive the record] --> F[Notify the owner]
\`\`\``

const MALFORMED_MERMAID = `A diagram that never states its edges:

\`\`\`mermaid
flowchart TD
	A[Read the nest] -->
	--> {{
\`\`\`

The next one still draws:

\`\`\`mermaid
flowchart LR
	A[Read] --> B[Archive]
\`\`\``

const THEMATIC_BREAK = `The first pass finished.

---

The second pass started.`

const FOOTNOTES = `The sync dedupes on the client id[^dedupe], not on the timestamp[^clock].

[^dedupe]: Set in \`useTranscriptSocket\` before the cache merge.
[^clock]: Two hosts can disagree by seconds.`

const AUTOLINKS = `Docs live at https://kiroshi.dev and issues go to nest@kiroshi.dev.

An explicit [link](https://kiroshi.dev/changelog) reads the same.`

const DESTINATIONS = `Every link carries where it goes: [the changelog](https://kiroshi.dev/changelog), [our roadmap](https://www.kiroshi.dev/roadmap), and a URL typed bare, https://kiroshi.dev/docs.

Mail stays with the reader: nest@kiroshi.dev.`

const MANY_HOSTS = `One answer naming seven places at once: [the changelog](https://kiroshi.dev/changelog), [the spec](https://html.spec.whatwg.org/multipage/links.html), [a search](https://www.google.com/search?q=nest), [a paper](https://arxiv.org/abs/2401.00001), [an internal tracker](https://tracker.internal.test/issue/42), [a directory](https://пример.рф/каталог) and [the box on this desk](https://192.168.1.1/admin).`

const DECEPTIVE_LINKS = `Userinfo hides the host: [https://kiroshi.dev@evil.test/reports](https://kiroshi.dev@evil.test/reports).

A text with no scheme parses as nothing: [kiroshi.dev/download](https://evil.test/payload).

A homograph reads as latin: [https://\u043Epennest.dev/login](https://\u043Epennest.dev/login).

Emphasis is an element, not a string: [**https://kiroshi.dev**](https://evil.test/steal).

A protocol-relative href would move this very window: [https://kiroshi.dev](//evil.test/steal).

A mailto under a web address opens a draft, not a page: [https://kiroshi.dev](mailto:steal@evil.test).`

const INERT_SCHEMES = `A scheme this app cannot open is not a link: [join the channel](irc://kiroshi.dev/nest).

Neither is a path that would resolve against this window: [settings](/settings).

Neither is a script: [looks like a link](javascript:alert('nest')).`

const LONG_URL = `https://kiroshi.dev/reports/2026/08/nest_42/occupants?include=arrivals%2Cdepartures&sort=timestamp&cursor=eyJvZmZzZXQiOjEyMCwibGltaXQiOjQwfQ&signature=9f2c1ad4e7b8c05a`

const FRAGMENT_LINK = `The counts come from the last sync[^count], and the method sits in the [summary](#summary) closing this answer.

[^count]: Measured on the client, after the cache merge.`

const RAW_HTML = `The agent answered with <b>bold</b> in the middle of a sentence, and the **markdown** around it still reads as markdown.

The block below is what is being discussed, not the layout of this answer:

<section class="report" data-nest="42">
  <h2>Occupants</h2>
  <p>Three, one of them new.</p>
</section>

Every character it was written with is on screen, its indentation included.`

const RAW_HTML_IN_LIST = `- \`\`\`ts
  const nest = readNest(42)
  \`\`\`
  <section class="report">
    <h2>Occupants</h2>
  </section>
- | nest | occupants |
  | --- | --- |
  | nest_42 | 3 |
  <section class="report">
    <h2>Arrivals</h2>
  </section>
- > The second pass found one change.
  <section class="report">
    <h2>Departures</h2>
  </section>
- - a nested item
  <section class="report">
    <h2>Pending</h2>
  </section>`

const HOSTILE_PAYLOADS = [
	`<script>document.documentElement.dataset.nest = "owned"</script>`,
	`<style>[data-slot="markdown"] { display: none }</style>`,
	`<iframe src="https://evil.test/frame"></iframe>`,
	`<img src="https://evil.test/pixel.png" onerror="document.documentElement.dataset.nest = 'owned'" />`,
]

const HOSTILE = `${HOSTILE_PAYLOADS.join("\n\n")}

[looks like a link](javascript:alert('nest'))

\`\`\`mermaid
flowchart TD
	A["<script>alert(1)</script>"] --> B["<span onclick='alert(1)'>tap</span>"]
\`\`\`

Prose after the payload still renders.`

const MALFORMED = `# unclosed **bold and \`code

| nest | occupants
| ---
| nest_42

[broken](https://kiroshi.dev

:::unknown-block
content
:::`

const FULL = `# Nest report

The sync ran **twice** and the second pass found ~~nothing~~ one change[^1].

## Occupants

1. read the nest
2. summarise it
	- resident
		- arrived this week

Progress:

- [x] read the nest
- [ ] archive the record

> | nest | occupants |
> | --- | --- |
> | nest_42 | 3 |

---

Run \`bun run test\` — docs at https://kiroshi.dev.

[^1]: nest_43 lost its last occupant.`

const USER_BLOCK = `Run \`bun run test\` before merging — the dedupe now lives in \`useTranscriptSocket\`, next to the cache merge, and not in the store, see [the changelog](https://kiroshi.dev/changelog):

\`\`\`bash
bun run test --project=unit
\`\`\``

const ADJACENT_BLOCKS = `The archive pass finished at 09:12, and every block below follows the one before it with nothing between them but the margin the prose rules declare.

- read the nest
- summarise the occupants
- archive the record

\`\`\`ts
export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}
\`\`\`

| nest | occupants |
| :--- | ---: |
| nest_42 | 3 |
| nest_43 | 0 |

Two nests archived since the last pass.`

const NESTED_BLOCKS = `> The sync ran twice.
>
> The second pass found nothing.

1. Read the nest.

   Then summarise what it holds.

   - resident
   - visitor

2. Archive the record.`

const PRESERVED_WHITESPACE = `Walk me through every package.

Start with the design system,
then the Tauri shell,
and anything crossing between them.

nest_42   active
nest_43       empty

A code span keeps its own run: \`a     b\` beside \`a b\`.

- one item, pasted
  across two lines

| cell | padded |
| --- | --- |
| a     b | a b |

> quoted line one
> and quoted line two`

const TYPESET_BUBBLE = `## Nest report

The nest answers to \`readNest(id)\` and holds three occupants.

- occupants
	- resident
		- arrived this week
	- visitor
- structure

> The sync ran twice and the second pass found nothing.

\`\`\`ts
export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}
\`\`\`

${WIDE_TABLE}`

const STREAMED_BODY = `## Nest report

The archive pass finished at 09:12.

- read the nest
- summarise the occupants

> The sync ran twice and the second pass found nothing.

\`\`\`ts
export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}
\`\`\``

const STREAMED_NEXT_BLOCK = `

Two nests archived since the last pass.`

const alignmentOf = (cell: HTMLElement) => getComputedStyle(cell).textAlign

const bubbleContentsOf = (canvasElement: HTMLElement) => [
	...canvasElement.querySelectorAll<HTMLElement>(
		'[data-slot="message-bubble-content"]',
	),
]

const bubbleContentOf = (canvasElement: HTMLElement) =>
	bubbleContentsOf(canvasElement)[0]

const firstBlockOf = (content: HTMLElement) =>
	content.querySelector('[data-slot="markdown"]')
		?.firstElementChild as HTMLElement

const topInsetOf = (content: HTMLElement, block: HTMLElement) =>
	block.getBoundingClientRect().top - content.getBoundingClientRect().top

const paddingTopOf = (element: HTMLElement) =>
	Number.parseFloat(getComputedStyle(element).paddingTop)

const fragmentOf = (reference: HTMLElement) =>
	reference.getAttribute("href")?.slice(1) ?? ""

const definitionFor = (canvasElement: HTMLElement, fragment: string) =>
	canvasElement.querySelector(`[id="${fragment}"]`)

const clearanceOf = (viewport: HTMLElement, copy: HTMLElement) =>
	copy.getBoundingClientRect().left - viewport.getBoundingClientRect().right

const BLANK_LINE = 24

const MARK_BOX = 14

const SPACE_RUN = 8

const EXPECTED_MARKS = ["k", "h", "g", "a", "t", "п", "•"]

const FETCHING_ELEMENTS = "img, iframe, object, embed, source, [srcset]"

const offsiteTransfersSince = (start: number) =>
	performance
		.getEntriesByType("resource")
		.filter((entry) => entry.startTime >= start)
		.map(({ name }) => name)
		.filter(
			(name) =>
				name.startsWith("http") && new URL(name).origin !== location.origin,
		)

const watchForRequests = () => {
	const start = performance.now()
	const inserted: string[] = []
	const collect = (records: MutationRecord[]) => {
		for (const { addedNodes } of records) {
			for (const node of addedNodes) {
				if (!(node instanceof Element)) continue

				const fetching = [
					...(node.matches(FETCHING_ELEMENTS) ? [node] : []),
					...node.querySelectorAll(FETCHING_ELEMENTS),
				]

				inserted.push(...fetching.map(({ outerHTML }) => outerHTML))
			}
		}
	}
	const observer = new MutationObserver(collect)

	observer.observe(document.body, { childList: true, subtree: true })

	return () => {
		collect(observer.takeRecords())
		observer.disconnect()

		return [...inserted, ...offsiteTransfersSince(start)]
	}
}

let requestsSinceRender = () => ["the request watch never started"]

const linkMarksOf = (canvasElement: HTMLElement) => [
	...canvasElement.querySelectorAll('[data-slot="markdown-link-mark"]'),
]

const markdownRootsOf = (canvasElement: HTMLElement) =>
	canvasElement.querySelectorAll<HTMLElement>('[data-slot="markdown"]')

const gapsBetweenChildren = (element: Element) => {
	const rects = [...element.children].map((child) =>
		child.getBoundingClientRect(),
	)

	return rects.slice(1).map((rect, index) => rect.top - rects[index].bottom)
}

const blockGapsIn = (root: HTMLElement) =>
	[root, ...root.querySelectorAll("blockquote, li, ul, ol")].flatMap(
		gapsBetweenChildren,
	)

const blockOffsetsIn = (root: HTMLElement) => {
	const origin = root.getBoundingClientRect().top

	return [...root.children].map(
		(block) => block.getBoundingClientRect().top - origin,
	)
}

const contentRangeOf = (element: Element) => {
	const range = document.createRange()
	range.selectNodeContents(element)

	return range
}

const renderedLinesOf = (element: Element) =>
	new Set(
		[...contentRangeOf(element).getClientRects()].map(({ top }) =>
			Math.round(top),
		),
	).size

const textWidthOf = (element: Element) =>
	contentRangeOf(element).getBoundingClientRect().width

const textNodesOf = (element: Element) => {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
	const nodes: Text[] = []

	while (walker.nextNode()) nodes.push(walker.currentNode as Text)

	return nodes
}

const wordLeftOf = (element: Element, word: string) => {
	const text = textNodesOf(element).find(({ data }) =>
		data.includes(word),
	) as Text
	const start = text.data.indexOf(word)
	const range = document.createRange()
	range.setStart(text, start)
	range.setEnd(text, start + word.length)

	return range.getBoundingClientRect().left
}

const paintedTokens = (fence: HTMLElement) =>
	fence.querySelectorAll("[style*='--code-token-light']").length

const RENDERER_ARRIVES = { timeout: 10_000 }

const typesetIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelectorAll(".katex")

const diagramFramesIn = (canvasElement: HTMLElement) => [
	...canvasElement.querySelectorAll('[role="group"][aria-label="Diagram"]'),
]

const diagramsIn = (canvasElement: HTMLElement) =>
	diagramFramesIn(canvasElement).flatMap((frame) => [
		...(frame.shadowRoot?.querySelectorAll("svg") ?? []),
	])

const destinationsIn = (root: HTMLElement) =>
	root.querySelectorAll("[href], [src], [srcset]")

const loosePayloadIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelectorAll(
		":is(script, style, iframe, [onerror], [onclick])",
	)

const rulesOf = (sheet: CSSStyleSheet) => {
	try {
		return [...sheet.cssRules]
	} catch {
		return []
	}
}

const globalKeyframeNames = () =>
	[...document.styleSheets]
		.flatMap(rulesOf)
		.filter((rule) => rule instanceof CSSKeyframesRule)
		.map((rule) => rule.name)

const RENDERED_BY_TURN_BODY =
	"The source reaches the renderer through `apps/app/src/components/turn-body.tsx:10`."

const meta = preview.meta({
	title: "Conversation/Markdown/Markdown",
	component: Markdown,
	parameters: {
		docs: {
			description: {
				component:
					"Renders one markdown block, the payload of a single chat bubble, as GFM. Every author goes through the same allowlist: raw HTML is never turned into nodes and reads as the source text it was written with, `script`, `style` and `iframe` included, while `on*` attributes and `javascript:` URLs are dropped from everything markdown itself produced, so user prose and agent prose are equally safe. Typography comes from the prose class this module owns, which MessageBubbleContent also applies, so a block reads the same inside or outside a bubble. It comes in two sizes read from `MarkdownSizeContext`: `chat`, 14 on 24, the default, and `answer`, 16 on 28, which a bubbleless agent reply asks for. A fenced block goes through the bundled highlighter and carries its own copy control, and a table is framed, scrollable and copyable through `markdown/table.tsx`. Links are read as destinations, never as text: every web link opens outside the app with no referrer and carries the host taken from its href alone, a fragment stays in the answer, a scheme the app cannot open renders as plain text, and a long link is clipped at the bubble width rather than widening it, its destination the last thing to go. Math and diagrams are the two blocks that need code this renderer does not carry: `$…$`, `$$…$$` and a `mermaid` fence each fetch their renderer the first time a document holds one, keep the source on screen until it lands, and keep that same source when it cannot be parsed.",
			},
		},
	},
	args: { children: FULL },
	argTypes: { children: { control: "text" } },
	decorators: [
		(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>,
	],
})

interface StreamedBodyProps {
	source: string
}

const StreamedBody = ({ source }: StreamedBodyProps) => {
	const [appended, setAppended] = useState(false)

	return (
		<div className="flex flex-col items-start gap-4">
			<MessageBubble>
				<MessageBubbleContent>
					<Markdown>
						{appended ? `${source}${STREAMED_NEXT_BLOCK}` : source}
					</Markdown>
				</MessageBubbleContent>
			</MessageBubble>
			<Button onClick={() => setAppended(true)} size="sm" variant="outline">
				Append the next block
			</Button>
		</div>
	)
}

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every construction at once, the way a long agent answer arrives. Check the vertical rhythm between blocks, that the first block has no top margin, and that headings, quote and footnote section all read in both themes — flip the theme layout toolbar to side-by-side. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const Headings = meta.story({
	args: { children: HEADINGS },
	parameters: {
		docs: {
			description: {
				story:
					"Six levels plus a heading carrying inline code. Check that the scale stays legible at chat size — h1 and h2 take the slab heading face, h4 steps down in weight, h5 and h6 dim to a secondary tone — and that the code chip inside a heading keeps the heading weight while shrinking to 0.9em instead of breaking the line box. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

const typeOf = (element: Element) => {
	const { fontSize, lineHeight, fontWeight } = getComputedStyle(element)
	return [fontSize, lineHeight, fontWeight]
}

const firstIn = (root: HTMLElement, tag: string) => {
	const node = root.querySelector<HTMLElement>(tag)
	if (!node) throw new Error(`This block holds no ${tag}`)
	return node
}

export const AnswerSize = meta.story({
	args: { children: HEADINGS },
	render: (args) => (
		<MarkdownSizeContext value="answer">
			<Markdown {...args} />
		</MarkdownSizeContext>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The answer size a bubbleless agent reply asks for. Check that the body reads 16 on 28, an h2 20 on 28 and an h3 17 on 28, both semibold. Pick `Headings` for the same block at chat size.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(typeOf(firstIn(canvasElement, "p"))).toEqual([
			"16px",
			"28px",
			"400",
		])
		await expect(typeOf(firstIn(canvasElement, "h2"))).toEqual([
			"20px",
			"28px",
			"600",
		])
		await expect(typeOf(firstIn(canvasElement, "h3"))).toEqual([
			"17px",
			"28px",
			"600",
		])
	},
})

export const Emphasis = meta.story({
	args: { children: EMPHASIS },
	parameters: {
		docs: {
			description: {
				story:
					"Bold, italic, strikethrough and inline code inside running prose. Check that struck text dims instead of disappearing, and that a code chip is readable on both the light and the dark surface. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const Lists = meta.story({
	args: { children: LISTS },
	parameters: {
		docs: {
			description: {
				story:
					"Ordered and unordered lists after a lead-in paragraph. Check that the markers sit inside the content column rather than hanging into the gutter, and that the gap between a paragraph and the list it introduces stays tighter than the gap between two blocks. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const NestedList = meta.story({
	args: { children: NESTED_LIST },
	parameters: {
		docs: {
			description: {
				story:
					"Three levels of nesting. Check that each level changes marker — disc, circle, square — so depth is readable without counting indents, and that a nested list hugs its parent item instead of taking a full block margin. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const TaskList = meta.story({
	args: { children: TASK_LIST },
	parameters: {
		docs: {
			description: {
				story:
					"A GFM checklist as an agent reports progress. A reader can tick or untick a box for themselves, in the message alone: nothing is written back. Check that the list marker is gone, that the box sits on the first line of its label, and that a ticked label is struck and muted. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas }) => {
		const boxes = canvas.getAllByRole("checkbox")

		await expect(boxes).toHaveLength(4)
		await expect(boxes[0]).toBeChecked()
		await expect(boxes[0]).toBeEnabled()
	},
})

export const Blockquote = meta.story({
	args: { children: BLOCKQUOTE },
	parameters: {
		docs: {
			description: {
				story:
					"A quote, prose, then a quote inside a quote. Check that the rule and the dimmed text mark the quote without boxing it, and that the nested level indents from the outer rule instead of restarting at the margin. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const TableInBlockquote = meta.story({
	args: { children: TABLE_IN_BLOCKQUOTE },
	parameters: {
		docs: {
			description: {
				story:
					"The mixed case that breaks naive renderers: a GFM table nested in a quote, between two quoted paragraphs. Check that the framed table stays inside the quote rule, that the quote keeps its dimmed colour across the cells, and that the frame shrinks to the table rather than filling the quote. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const Table = meta.story({
	args: { children: TABLE },
	parameters: {
		docs: {
			description: {
				story:
					"All three declared alignments — left, right, centre — plus a column that declares none. Check that each column body follows its own header, that the undeclared column reads left rather than centred, and that the rules and the header fill hold in both themes: they are mixed from the foreground, so the same table reads on the page and on a solid bubble. Hover the table to raise the copy button. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas }) => {
		const [left, right, centre, plain] = canvas.getAllByRole("columnheader")

		await expect(alignmentOf(left)).toBe("left")
		await expect(alignmentOf(right)).toBe("right")
		await expect(alignmentOf(centre)).toBe("center")
		await expect(alignmentOf(plain)).toBe("left")
	},
})

export const TableWide = meta.story({
	args: { children: WIDE_TABLE },
	parameters: {
		docs: {
			description: {
				story:
					"Eight columns in a column built for prose. The table keeps every cell on one line and scrolls on its own axis instead of squeezing each column into wrapped fragments. Check that the frame stops at the container edge, that the scroll ends flush with the last column, and that `Tab` reaches the table itself — the viewport is a tab stop with a visible ring, so the arrow keys scroll it without a mouse. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("group", { name: "Table" })

		await expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth)

		await userEvent.tab()
		await expect(viewport).toHaveFocus()

		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Copy table" }),
		).toHaveFocus()
	},
})

export const TableNarrow = meta.story({
	args: { children: NARROW_TABLE },
	parameters: {
		docs: {
			description: {
				story:
					"The other end: two short columns. The frame shrinks to the table rather than stretching a hairline box across the whole bubble, so a small table reads as a small object. Check that nothing scrolls here. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas }) => {
		const viewport = canvas.getByRole("group", { name: "Table" })

		await expect(viewport.scrollWidth).toBe(viewport.clientWidth)
	},
})

export const TableCopy = meta.story({
	args: { children: AWKWARD_TABLE },
	parameters: {
		docs: {
			description: {
				story:
					"The copy action against the cells that break a naive extraction: inline markdown, an escaped pipe, an image with no text of its own, an empty cell, and a literal tab sitting inside a field. The clipboard is stubbed so the story never touches the real one. Every row must copy as exactly two fields — the tab inside a cell flattens to a space rather than opening a third column, and the image yields its alt text rather than a hole. Check that the button is reachable by keyboard, that the icon swaps to a check, and that the result is announced in the polite live region rather than by the icon alone. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await userEvent.click(canvas.getByRole("button", { name: "Copy table" }))

		await expect(writeText).toHaveBeenCalledWith(AWKWARD_TSV)
		await expect(
			await canvas.findByText("Table copied to clipboard"),
		).toBeInTheDocument()

		writeText.mockRestore()
	},
})

export const TableInBubble = meta.story({
	args: { children: WIDE_TABLE },
	parameters: {
		docs: {
			description: {
				story:
					"The host case: a table wider than the bubble that carries it. The bubble must not grow to fit the table and must not spill it — the table scrolls inside it. Check that the frame sits inside the bubble padding and that the copy button clears the bubble edge. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	render: (args) => (
		<MessageBubble>
			<MessageBubbleContent>
				<Markdown {...args} />
			</MessageBubbleContent>
		</MessageBubble>
	),
	play: async ({ canvas, canvasElement }) => {
		const viewport = canvas.getByRole("group", { name: "Table" })
		const content = bubbleContentOf(canvasElement)

		await expect(content.scrollWidth).toBe(content.clientWidth)
		await expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth)
	},
})

export const CodeFence = meta.story({
	args: { children: CODE },
	parameters: {
		docs: {
			description: {
				story:
					"Inline code next to a fenced block. The fence label picks the grammar and the block is tokenised through the same bundled highlighter the standalone `CodeBlock` uses — no grammar is fetched, so the same source always paints the same colours. Check that the tokens read in both themes, that inline code keeps its chip while the fence drops it, and that the code viewport stops before the copy control instead of running under it. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const CodeFenceRust = meta.story({
	args: { children: CODE_RUST },
	parameters: {
		docs: {
			description: {
				story:
					"Rust, the language of the Tauri host. Check that `pub fn`, the borrow and the closure are coloured apart from the identifiers, and that the sample keeps its shape at chat size. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const CodeFencePython = meta.story({
	args: { children: CODE_PYTHON },
	parameters: {
		docs: {
			description: {
				story:
					"Python, the most common fence a model reaches for after TypeScript. Check that the keyword, the type hints and the dict literal separate, and that the indentation survives the token spans. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const CodeFenceCss = meta.story({
	args: { children: CODE_CSS },
	parameters: {
		docs: {
			description: {
				story:
					"CSS, the language a companion answers styling questions in. Check that the selector, the properties and the `var()` reference are told apart, so a custom property is readable at a glance. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const CodeFenceHtml = meta.story({
	args: { children: CODE_HTML },
	parameters: {
		docs: {
			description: {
				story:
					"Markup inside a fence — the case where highlighting and sanitizing meet. The tags are code, never elements: check that the snippet renders as text with coloured tags and attributes, and that nothing in it reaches the DOM as markup. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const CodeFenceYaml = meta.story({
	args: { children: CODE_YAML },
	parameters: {
		docs: {
			description: {
				story:
					"YAML, the shape a config answer takes. Check that keys, string values and booleans separate, and that the two-space rhythm of the source is preserved. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const CodeFenceMarkdown = meta.story({
	args: { children: CODE_MARKDOWN },
	parameters: {
		docs: {
			description: {
				story:
					"Markdown inside markdown, written with the `md` alias. Check that the fence shows the source — heading marker, list markers and the literal asterisks — instead of rendering it as a heading and a list. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const CodeFenceUnknownLanguage = meta.story({
	args: { children: CODE_UNKNOWN },
	parameters: {
		docs: {
			description: {
				story:
					"A fence for a grammar we do not bundle. Check that the block renders the source verbatim in the foreground colour instead of blanking or throwing on the missing grammar — a fence with no label at all lands here too. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const CodeFenceOverflow = meta.story({
	args: { children: CODE_LONG_LINE },
	parameters: {
		docs: {
			description: {
				story:
					"One line far wider than the bubble. Check that the fence scrolls on its own instead of stretching the bubble, that the scroll region takes focus from the keyboard with a visible ring, and that arrow keys move it. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	render: (args) => (
		<MessageBubble>
			<MessageBubbleContent>
				<Markdown {...args} />
			</MessageBubbleContent>
		</MessageBubble>
	),
	play: async ({ canvas, userEvent }) => {
		const fence = canvas.getByRole("group", { name: /^Code snippet/ })
		const copy = canvas.getByRole("button", { name: "Copy code" })
		const bubble = fence.closest("[data-slot='message-bubble']")
		const resting = getComputedStyle(fence).boxShadow

		await expect(fence.scrollWidth).toBeGreaterThan(fence.clientWidth)
		await expect(bubble?.scrollWidth).toBe(bubble?.clientWidth)
		await expect(clearanceOf(fence, copy)).toBeGreaterThan(0)

		fence.scrollLeft = fence.scrollWidth

		await expect(fence.scrollLeft).toBeGreaterThan(0)
		await expect(clearanceOf(fence, copy)).toBeGreaterThan(0)

		await userEvent.tab()

		await expect(fence).toHaveFocus()
		await expect(getComputedStyle(fence).boxShadow).not.toBe(resting)
	},
})

export const CodeFenceCopy = meta.story({
	args: { children: CODE_COPY },
	parameters: {
		docs: {
			description: {
				story:
					"The copy affordance a fence carries, driven here through a stubbed clipboard so the story never touches the real one. The source keeps a blank line and a tab so the assertion is byte-level: check that the button is reachable by keyboard, that its name swaps to Copied, and that what leaves is exactly what the author typed — not the highlighted markup, not a retabbed line, not the trailing newline the parser adds. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const writeText = fn()
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		})

		await userEvent.click(canvas.getByRole("button", { name: "Copy code" }))
		await canvas.findByRole("button", { name: "Copied" })
		Reflect.deleteProperty(navigator, "clipboard")

		await expect(writeText).toHaveBeenCalledWith(CODE_COPY_SOURCE)
	},
})

export const CodeFenceLongSource = meta.story({
	args: { children: CODE_LONG_SOURCE },
	parameters: {
		docs: {
			description: {
				story:
					"240 lines — past the budget where tokenising the whole fence would hold the first frame. Such a fence paints its source text first and takes its colours on the pass after, so a long answer appears at once instead of after the highlighter. Check that every line is there from the start and that the colours land without the block jumping. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas }) => {
		const fence = canvas.getByRole("group", { name: /^Code snippet/ })

		await expect(fence.textContent).toContain("nest239")
		await waitFor(() => expect(paintedTokens(fence)).toBeGreaterThan(0))
	},
})

export const MathInline = meta.story({
	args: { children: INLINE_MATH },
	parameters: {
		docs: {
			description: {
				story:
					"`$…$` inside running prose. The typesetter is fetched the first time a block carries math and never before, so the expression appears as the source the author typed and is replaced in place a moment later — the paragraph keeps its box throughout. Glyphs paint in `currentColor`, so one render reads in both themes; flip the theme layout toolbar to side-by-side. Check that a bare dollar amount in the same sentence stays prose. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await waitFor(
			() => expect(typesetIn(canvasElement)).toHaveLength(2),
			RENDERER_ARRIVES,
		)
		await expect(canvas.getByText(/keeps its dollar sign/)).toBeInTheDocument()
	},
})

export const MathDisplay = meta.story({
	args: { children: DISPLAY_MATH },
	parameters: {
		docs: {
			description: {
				story:
					"`$$…$$` as a block of its own, centred between the paragraphs it belongs to. A sum wider than the bubble scrolls on its own axis rather than widening the block. Check that the block rhythm above and below matches the other block elements, and that the inline `$n = 40$` in the closing line sits on the text baseline instead of pushing the line box open. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(
			() =>
				expect(
					canvasElement.querySelector(".katex-display"),
				).toBeInTheDocument(),
			RENDERER_ARRIVES,
		)
		await expect(typesetIn(canvasElement)).toHaveLength(2)
	},
})

export const MathMalformed = meta.story({
	args: { children: MALFORMED_MATH },
	parameters: {
		docs: {
			description: {
				story:
					"An unclosed fraction and a matrix with no end — what a stream mid-flight produces. Neither throws and neither blanks the bubble: each keeps the source the author typed, flagged in the destructive tone, and the expression after them still typesets. Check that the failed expressions read as text rather than as a gap. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(
			() =>
				expect(
					canvasElement.querySelectorAll(".katex-error").length,
				).toBeGreaterThan(0),
			RENDERER_ARRIVES,
		)
		await expect(canvasElement.textContent).toContain("\\frac{1}{")
	},
})

export const MathOversized = meta.story({
	args: { children: OVERSIZED_MATH },
	parameters: {
		docs: {
			description: {
				story:
					"An expression is bounded by what it costs, not only by whether it parses. This 20×20 matrix is under two kilobytes to type and typesets to ninety-six of DOM; a 100×100 one reaches 2.2 MB. Past the bound the source stands as text — the same thing shown for an expression that cannot be parsed — and the expression after it still typesets. Check that the bubble stays scrollable and responsive instead of paying for a matrix nobody can read. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await waitFor(
			() => expect(typesetIn(canvasElement)).toHaveLength(1),
			RENDERER_ARRIVES,
		)
		await expect(canvas.getByText(/begin{matrix}/)).toBeInTheDocument()
	},
})

export const MermaidFlowchart = meta.story({
	args: { children: MERMAID_FLOWCHART },
	parameters: {
		docs: {
			description: {
				story:
					"A fence labelled `mermaid` is a drawing, not code: it takes no highlighter and no copy control, and mermaid itself is fetched only once a document declares one. The palette follows the `--diagram-scheme` token, so the diagram is drawn for the theme of the surface it sits on and is redrawn when that theme changes — flip the theme layout toolbar to side-by-side and check both. The source holds the block until the diagram replaces it. Mermaid ships a stylesheet with every diagram, prefixed selectors and unprefixed keyframes alike, so the drawing goes into a shadow root: the CSS reaches this diagram and nothing else, while the type and the tokens it inherits still cross the boundary. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(
			() => expect(diagramsIn(canvasElement)).toHaveLength(1),
			RENDERER_ARRIVES,
		)

		const [diagram] = diagramsIn(canvasElement)
		const keyframes = globalKeyframeNames()

		await expect(diagram.textContent).toContain("Read the nest")
		await expect(loosePayloadIn(canvasElement)).toHaveLength(0)
		await expect(keyframes).not.toContain("edge-animation-frame")
		await expect(keyframes).not.toContain("dash")
	},
})

export const MermaidMalformed = meta.story({
	args: { children: MALFORMED_MERMAID },
	parameters: {
		docs: {
			description: {
				story:
					"An edge that points nowhere. The diagram cannot be drawn, so its source stays on screen exactly as written and the diagram below it still draws — one bad fence never costs the reader the rest of the answer. Check that nothing throws and that the failed source keeps the code surface rather than collapsing. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await waitFor(
			() => expect(diagramsIn(canvasElement)).toHaveLength(1),
			RENDERER_ARRIVES,
		)
		await expect(canvas.getByText(/--> {{/)).toBeInTheDocument()
	},
})

export const MermaidInBubble = meta.story({
	args: { children: MERMAID_WIDE },
	parameters: {
		docs: {
			description: {
				story:
					"The host case: a diagram wider than the bubble that carries it. The bubble must not grow to fit it and must not spill it — the diagram scrolls inside its frame, which is a tab stop so a keyboard reaches the far end. Check that the frame sits inside the bubble padding and that the labels keep their size instead of being scaled down to fit. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	render: (args) => (
		<MessageBubble>
			<MessageBubbleContent>
				<Markdown {...args} />
			</MessageBubbleContent>
		</MessageBubble>
	),
	play: async ({ canvas, canvasElement }) => {
		await waitFor(
			() => expect(diagramsIn(canvasElement)).toHaveLength(1),
			RENDERER_ARRIVES,
		)

		const viewport = canvas.getByRole("group", { name: "Diagram" })
		const content = bubbleContentOf(canvasElement)

		await expect(content.scrollWidth).toBe(content.clientWidth)
		await expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth)
	},
})

export const ThematicBreak = meta.story({
	args: { children: THEMATIC_BREAK },
	parameters: {
		docs: {
			description: {
				story:
					"A horizontal rule between two passages. Check that the rule uses the border token — visible on light, not glaring on dark — and that it breathes more than a paragraph gap. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const Footnotes = meta.story({
	args: { children: FOOTNOTES },
	parameters: {
		docs: {
			description: {
				story:
					"Two footnotes and the section GFM appends. Check that each reference jumps to its definition and back — the ids are scoped to this block, so the anchor resolves inside it and nowhere else — and that the section reads as an aside: rule on top, smaller dimmed text. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const fragment = fragmentOf(canvas.getByRole("link", { name: "1" }))

		await expect(fragment).not.toBe("")
		await expect(definitionFor(canvasElement, fragment)).toBeInTheDocument()
		await expect(canvas.getByText("Footnotes")).toBeInTheDocument()
	},
})

export const FootnotesTwice = meta.story({
	args: { children: FOOTNOTES },
	parameters: {
		docs: {
			description: {
				story:
					"Two blocks on one page, each carrying its own footnotes — the shape a transcript takes. Footnote ids are fixed strings in GFM, so they are scoped per block: check that clicking the first reference of the second block scrolls to that block's definition instead of jumping back up to the first one. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-6">
			<Markdown {...args} />
			<Markdown {...args} />
		</div>
	),
	play: async ({ canvas, canvasElement }) => {
		const fragments = canvas.getAllByRole("link", { name: "1" }).map(fragmentOf)

		await expect(new Set(fragments).size).toBe(fragments.length)
		for (const fragment of fragments) {
			await expect(definitionFor(canvasElement, fragment)).toBeInTheDocument()
		}
	},
})

export const Autolinks = meta.story({
	args: { children: AUTOLINKS },
	parameters: {
		docs: {
			description: {
				story:
					"A bare URL, a bare email and an explicit link. What the parser inferred gets the same treatment as what an author typed: both web links leave in a new window with no referrer and state their host, while the email opens a mail client in place rather than an empty tab. Check that all three underline identically — a reader should not be able to tell which one was typed as markdown — and that they stay reachable by keyboard with a visible focus ring. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas }) => {
		const autolink = canvas.getByRole("link", {
			name: "https://kiroshi.dev (kiroshi.dev)",
		})

		await expect(autolink).toHaveAttribute("target", "_blank")
		await expect(autolink).toHaveAttribute("rel", "noreferrer noopener")
		await expect(
			canvas.getByRole("link", { name: "nest@kiroshi.dev" }),
		).not.toHaveAttribute("target")
	},
})

export const Destinations = meta.story({
	args: { children: DESTINATIONS },
	parameters: {
		docs: {
			description: {
				story:
					"The rule, stated plainly: a web link always ends with the host its href resolves to, whether the text is a label, a subdomain or the URL itself. Nothing is compared, so nothing can be fooled — the repetition on a bare URL is the price of never guessing. The host separates itself by weight and parentheses rather than by a dimmer colour: a destination is what a reader checks before clicking, so it never trades contrast for hierarchy, least of all on a solid bubble. Ahead of it sits a mark carrying the initial of that same host, drawn from the href and fetched from no one: an icon would have to be asked of the destination or of a service answering for it, and either one would learn that this message was read, from which address, at what time. The letter is decoration and the host beside it is the part that cannot lie. Check that mail keeps the reader inside their own client, and that the mark reaches neither a screen reader nor a copied transcript. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("link", { name: "the changelog (kiroshi.dev)" }),
		).toHaveAttribute("target", "_blank")
		await expect(
			canvas.getByRole("link", { name: "our roadmap (www.kiroshi.dev)" }),
		).toBeInTheDocument()

		await expect(
			linkMarksOf(canvasElement).map((mark) => mark.textContent),
		).toEqual(["k", "k", "k"])
	},
})

export const DestinationsFetchNothing = meta.story({
	args: { children: MANY_HOSTS },
	parameters: {
		docs: {
			description: {
				story:
					"Seven hosts in one answer, in both bubbles a transcript is made of. Rendering them sends nothing: no request goes to the sites themselves, and none to the service that used to answer for every site — which would have received the whole guest list, with the reader's address and the hour they read it. Each mark is the initial of its own host, tinted from the text so it holds on the muted surface and on the solid one, in either theme, and sized exactly as the icon was so no line moves. The last two are the ones a punycode host and an address would get wrong: the Cyrillic name is decoded for the mark and still spelled out in punycode beside it, and the IP literal takes a neutral dot rather than opening with a digit. Flip the theme layout toolbar to side-by-side, and check the marks against the blue bubble. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-6">
			<MessageBubble>
				<MessageBubbleContent>
					<Markdown {...args} />
				</MessageBubbleContent>
			</MessageBubble>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>
					<Markdown {...args} />
				</MessageBubbleContent>
			</MessageBubble>
		</div>
	),
	beforeEach: () => {
		requestsSinceRender = watchForRequests()

		return () => {
			requestsSinceRender()
		}
	},
	play: async ({ canvas, canvasElement }) => {
		const marks = linkMarksOf(canvasElement)

		await expect(marks.map((mark) => mark.textContent)).toEqual([
			...EXPECTED_MARKS,
			...EXPECTED_MARKS,
		])
		await expect([
			...new Set(marks.map((mark) => mark.getBoundingClientRect().width)),
		]).toEqual([MARK_BOX])

		await expect(
			canvas.getAllByRole("link", {
				name: "a directory (xn--e1afmkfd.xn--p1ai)",
			}),
		).toHaveLength(2)
		await expect(requestsSinceRender()).toEqual([])
	},
})

export const DeceptiveLinks = meta.story({
	args: { children: DECEPTIVE_LINKS },
	parameters: {
		docs: {
			description: {
				story:
					"The six pairs a review used to defeat comparing text with href. Userinfo, a missing scheme, a punycode homograph, emphasis instead of a plain string, a protocol-relative href aimed at this very window, and a mailto wearing a web address — each one reads truthfully now, because the host comes from the href and the text is never consulted. Check that the homograph reports its punycode form, and that the protocol-relative link leaves in a new window instead of replacing the app. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByText("(evil.test)")).toHaveLength(4)
		await expect(canvas.getByText("(xn--pennest-8ig.dev)")).toBeInTheDocument()
		await expect(
			canvas.getByRole("link", { name: "https://kiroshi.dev" }),
		).not.toHaveAttribute("target")
	},
})

export const InertSchemes = meta.story({
	args: { children: INERT_SCHEMES },
	parameters: {
		docs: {
			description: {
				story:
					"Only http, https, mailto, tel and a same-document fragment stay clickable. An unknown scheme, a path that would resolve against the app window and a script URL all keep their words and lose their anchor. Check that the text reads as prose — no underline, no pointer, nothing to click — and that the sentence around it is untouched. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("link")).not.toBeInTheDocument()
		await expect(canvas.getByText(/join the channel/)).toBeInTheDocument()
	},
})

export const LongUrl = meta.story({
	args: { children: LONG_URL },
	parameters: {
		docs: {
			description: {
				story:
					"A signed report URL pasted alone, the shape that stretches a bubble across the transcript. The URL is clipped with an ellipsis at the bubble width and the destination follows it, wrapping to a second line rather than being cut: the one part a reader cannot afford to lose is where the link goes. Check that the bubble keeps the width of the surrounding turns and that the host reads in full. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	render: (args) => (
		<MessageBubble>
			<MessageBubbleContent>
				<Markdown {...args} />
			</MessageBubbleContent>
		</MessageBubble>
	),
	play: async ({ canvas, canvasElement }) => {
		const link = canvas.getByRole("link")
		const host = canvas.getByText("(kiroshi.dev)")
		const text = link.firstElementChild as HTMLElement
		const bubble = canvasElement.querySelector(
			'[data-slot="message-bubble-content"]',
		) as HTMLElement

		await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth)
		await expect(host.scrollWidth).toBe(host.clientWidth)
		await expect(host.getBoundingClientRect().right).toBeLessThanOrEqual(
			Math.ceil(bubble.getBoundingClientRect().right),
		)
	},
})

export const FragmentLink = meta.story({
	args: { children: FRAGMENT_LINK },
	parameters: {
		docs: {
			description: {
				story:
					"A footnote reference, its backlink and an explicit `#` link. None of them leaves the app, so none opens a window and none states a host: they move the reader inside the answer they are already reading. Check that the footnote reference and the return arrow both scroll within the block. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas }) => {
		const inDocument = canvas
			.getAllByRole("link")
			.filter((link) => link.getAttribute("href")?.startsWith("#"))

		await expect(inDocument.length).toBeGreaterThan(1)
		for (const link of inDocument) {
			await expect(link).not.toHaveAttribute("target")
		}
	},
})

export const RawHtml = meta.story({
	args: { children: RAW_HTML },
	parameters: {
		docs: {
			description: {
				story:
					"HTML in a message is content being discussed, so it reads as the source it was written with. The parser never turns it into nodes: what a reader sees is the characters, inside a sentence that is still rendered as markdown around them, or as a block of its own that keeps its line breaks and its indentation. Check that the `<b>` reads as four characters while the `**markdown**` beside it is bold, and that the section below stands on four lines with its children indented under it. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const source = canvas.getByText(/^<section/)

		await expect(
			canvas.getByText("markdown", { selector: "strong" }),
		).toBeVisible()
		await expect(canvasElement.querySelector("b, section")).toBeNull()

		await expect(renderedLinesOf(source)).toBe(4)
		await expect(wordLeftOf(source, "<h2>")).toBeGreaterThan(
			wordLeftOf(source, "<section"),
		)
	},
})

export const RawHtmlInList = meta.story({
	args: { children: RAW_HTML_IN_LIST },
	parameters: {
		docs: {
			description: {
				story:
					"The same source, in the one place its line breaks were being collapsed: a tight list item holding a fence, a table, a quote or a nested list beside it. An item like that reads its whitespace from itself, and it stops preserving whitespace the moment it holds blocks — so the source keeps a block of its own instead of dissolving into the item. Check that each `<section>` stands on three lines with its heading indented, exactly as when it stands alone. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas }) => {
		const sources = canvas.getAllByText(/^<section/)

		await expect(sources).toHaveLength(4)

		for (const source of sources) {
			await expect(renderedLinesOf(source)).toBe(3)
			await expect(wordLeftOf(source, "<h2>")).toBeGreaterThan(
				wordLeftOf(source, "<section"),
			)
		}
	},
})

export const HostileMarkup = meta.story({
	args: { children: HOSTILE },
	parameters: {
		docs: {
			description: {
				story:
					"The security contract, rendered. A script, a style, an iframe, an `onerror` image, a `javascript:` link and a diagram whose labels are markup all go in; every one of them comes out as the characters it was written with, beside the inert link text and a diagram of two empty boxes. Showing the source is not relaxing anything: the parser still never builds a node from HTML, and the allowlist behind it is unchanged. The diagram is the one place markup is injected rather than built from the tree, so mermaid draws it under its strict level: the script and the event handlers are gone by the time the SVG reaches the DOM, and what a label may still carry is what the allowlist already grants ordinary markdown — an element, never a handler on it. The play proves the three ways this could fail: no script ran, no rule applied — a surviving `style` would hide the block — and no request was attempted. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const [block] = markdownRootsOf(canvasElement)

		for (const payload of HOSTILE_PAYLOADS) {
			await expect(canvas.getByText(payload)).toBeVisible()
		}

		await expect(block).toBeVisible()
		await expect(
			canvasElement.ownerDocument.documentElement.dataset.nest,
		).toBeUndefined()
		await expect(destinationsIn(block)).toHaveLength(0)
		await expect(loosePayloadIn(canvasElement)).toHaveLength(0)

		await expect(
			canvas.getByText("Prose after the payload still renders."),
		).toBeInTheDocument()
		await expect(canvas.queryByRole("link")).not.toBeInTheDocument()

		await waitFor(
			() => expect(diagramsIn(canvasElement)).toHaveLength(1),
			RENDERER_ARRIVES,
		)
		await expect(loosePayloadIn(canvasElement)).toHaveLength(0)
	},
})

export const Malformed = meta.story({
	args: { children: MALFORMED },
	parameters: {
		docs: {
			description: {
				story:
					"Unclosed emphasis, a truncated table, a half-written link and a block syntax we do not support — what a stream mid-flight or a distracted typist produces. Check that every line stays readable as source text: the renderer degrades to prose instead of blanking the bubble. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
})

export const InMessageBubble = meta.story({
	args: { children: FULL },
	parameters: {
		docs: {
			description: {
				story:
					"The real host: one block inside one bubble. The bubble applies the same prose class the renderer owns, so nothing shifts when the HTML starts coming from here. Check the code chips and the quote rule against the muted bubble surface, and that long tables and fences stay inside the bubble width. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	render: (args) => (
		<MessageBubble>
			<MessageBubbleContent>
				<Markdown {...args} />
			</MessageBubbleContent>
		</MessageBubble>
	),
})

export const InSolidBubble = meta.story({
	args: { children: USER_BLOCK },
	parameters: {
		docs: {
			description: {
				story:
					"What a reader types, in the solid bubble that carries their own turn. The bubble surface is `bg-primary`, the hardest case for a code chip and for a link destination: both are tinted from the foreground rather than the background, so the chip and the host stay visible on blue in both themes instead of dissolving into it. Flip the theme layout toolbar to side-by-side and check the inline chip, the fence and the dimmed host against the bubble. The source reaches the renderer through `apps/app/src/components/turn-body.tsx:10`, which renders what the reader typed the same way it renders an answer.",
			},
		},
	},
	render: (args) => (
		<MessageBubble variant="solid" align="end">
			<MessageBubbleContent>
				<Markdown {...args} />
			</MessageBubbleContent>
		</MessageBubble>
	),
})

export const AdjacentBlocks = meta.story({
	args: { children: ADJACENT_BLOCKS },
	parameters: {
		docs: {
			description: {
				story:
					"Paragraph, list, fence and table one after another, in the two turns a transcript is made of. A turn sets `whitespace-pre-wrap` so a pasted prompt keeps what its author typed, and the parser leaves a newline between every two blocks — inherited by the container holding them, each of those newlines paints as a blank line. The containers collapse it instead, so the only space between two blocks is the margin the prose rules declare, while the opening paragraph still wraps on words at the bubble edge and the fence keeps its tabs from `pre` alone. Check that the rhythm is identical on the solid bubble and the muted one. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-6">
			<UserTurn>
				<Markdown {...args} />
			</UserTurn>
			<AssistantTurn>
				<Markdown {...args} />
			</AssistantTurn>
		</div>
	),
	play: async ({ canvasElement }) => {
		const roots = markdownRootsOf(canvasElement)

		await expect(roots).toHaveLength(2)

		for (const root of roots) {
			const [opening] = root.querySelectorAll("p")
			const [code] = root.querySelectorAll('[data-slot="markdown-fence"] code')
			const [signature, body] = code.children

			await expect(Math.max(...blockGapsIn(root))).toBeLessThan(BLANK_LINE)
			await expect(renderedLinesOf(opening)).toBeGreaterThan(1)
			await expect(opening.scrollWidth).toBe(opening.clientWidth)
			await expect(renderedLinesOf(code)).toBe(4)
			await expect(wordLeftOf(body, "const")).toBeGreaterThan(
				wordLeftOf(signature, "export"),
			)
		}
	},
})

export const NestedBlocks = meta.story({
	args: { children: NESTED_BLOCKS },
	parameters: {
		docs: {
			description: {
				story:
					"The same boundary one level down: a quote holding two paragraphs, and a numbered item holding a paragraph and a list of its own. A list item is the one element that is both a container and a leaf — it collapses only once it wraps its content in blocks, which is exactly when a newline inside it would show. Check that the quote reads as two paragraphs rather than four, and that the nested list sits under its item at the same rhythm as any other pair of blocks. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	render: (args) => (
		<AssistantTurn>
			<Markdown {...args} />
		</AssistantTurn>
	),
	play: async ({ canvasElement }) => {
		const [root] = markdownRootsOf(canvasElement)

		await expect(root.querySelectorAll("blockquote p")).toHaveLength(2)
		await expect(Math.max(...blockGapsIn(root))).toBeLessThan(BLANK_LINE)
	},
})

export const PreservedWhitespace = meta.story({
	args: { children: PRESERVED_WHITESPACE },
	parameters: {
		docs: {
			description: {
				story:
					"What the reader typed, kept: a paste broken across three lines, a column padded to line up, a list item wrapped by hand, a code span holding a run of spaces, a table cell holding another, and a quote written across two lines. Whitespace is markup between blocks and text inside them, so only what holds blocks collapses it — every leaf here reads it as the author's. A proportional face cannot make padded columns meet, but it must not swallow the padding either. Check that nothing reflows into fewer lines than it was written on. The source reaches the renderer through `apps/app/src/components/turn-body.tsx:10`, which renders what the reader typed the same way it renders an answer.",
			},
		},
	},
	render: (args) => (
		<UserTurn>
			<Markdown {...args} />
		</UserTurn>
	),
	play: async ({ canvasElement }) => {
		const [root] = markdownRootsOf(canvasElement)
		const [, pasted, padded, spans] = root.querySelectorAll("p")
		const [item] = root.querySelectorAll("li")
		const [paddedCode, plainCode] = spans.querySelectorAll("code")
		const [paddedCell, plainCell] = root.querySelectorAll("td")
		const [quoted] = root.querySelectorAll("blockquote p")

		await expect(renderedLinesOf(pasted)).toBe(3)
		await expect(renderedLinesOf(padded)).toBe(2)
		await expect(
			wordLeftOf(padded, "empty") - wordLeftOf(padded, "active"),
		).toBeGreaterThan(SPACE_RUN)
		await expect(renderedLinesOf(item)).toBe(2)
		await expect(
			textWidthOf(paddedCode) - textWidthOf(plainCode),
		).toBeGreaterThan(SPACE_RUN)
		await expect(
			textWidthOf(paddedCell) - textWidthOf(plainCell),
		).toBeGreaterThan(SPACE_RUN)
		await expect(renderedLinesOf(quoted)).toBe(2)
	},
})

export const TypesetInBubble = meta.story({
	args: { children: TYPESET_BUBBLE },
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"The whole rhythm inside the surface it ships on, drawn in both schemes at once. Heading, nested list, quote, fence, wide table and inline code all take their type from the vendored `typeset` stylesheet, while the fence and the table keep their own frame through the `not-typeset` escape hatch. Check that the heading opens flush with the bubble padding rather than pushing a blank line above itself, that the table scrolls on its own axis instead of widening the bubble, and that every tone — heading ink, quote rule, list markers, code chip — holds on the bubble surface in both schemes. " +
					RENDERED_BY_TURN_BODY,
			},
		},
	},
	render: (args) => (
		<MessageBubble>
			<MessageBubbleContent>
				<Markdown {...args} />
			</MessageBubbleContent>
		</MessageBubble>
	),
	play: async ({ canvasElement }) => {
		const contents = bubbleContentsOf(canvasElement)

		await expect(contents).toHaveLength(2)

		for (const content of contents) {
			const first = firstBlockOf(content)
			const viewport = content.querySelector(
				'[data-slot="markdown-table"] [role="group"]',
			) as HTMLElement

			await expect(first.tagName).toBe("H2")
			await expect(getComputedStyle(first).marginBlockStart).toBe("0px")
			await expect(Math.round(topInsetOf(content, first))).toBe(
				Math.round(paddingTopOf(content)),
			)

			await expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth)
			await expect(content.scrollWidth).toBe(content.clientWidth)
		}
	},
})

export const AppendedBlock = meta.story({
	tags: ["test-only"],
	args: { children: STREAMED_BODY },
	parameters: {
		docs: {
			description: {
				story:
					"A body growing the way a streamed answer grows. Appending a paragraph must not move a single block already on screen: the rhythm is carried by the top margin each block owns, so nothing above the insertion point is asked to reflow. The fence is the block to watch — it drops its closing margin while it is last and takes it back once a paragraph follows, which changes what sits below it and nothing above. Press the button and check that the heading, the paragraph, the list and the quote all stay where they were. The growing source is the one `apps/app/src/components/turn-body.tsx:10` re-renders on every frame of a stream; the button under the bubble is the story's driver and no screen carries it.",
			},
		},
	},
	render: ({ children }) => <StreamedBody source={children} />,
	play: async ({ canvas, canvasElement, userEvent }) => {
		const [root] = markdownRootsOf(canvasElement)
		const before = blockOffsetsIn(root)

		await userEvent.click(
			canvas.getByRole("button", { name: "Append the next block" }),
		)

		await waitFor(() =>
			expect(blockOffsetsIn(root)).toHaveLength(before.length + 1),
		)

		await expect(blockOffsetsIn(root).slice(0, before.length)).toEqual(before)
	},
})

const STORED_IMAGES = LIBRARY_STORED_IMAGES.slice(0, 3)

const [, UNRESOLVABLE_IMAGE] = STORED_IMAGES

const STORED_GALLERY = [
	"```gallery",
	...STORED_IMAGES.map(({ src, alt }) => `- image: ${src}\n  alt: ${alt}`),
	"```",
].join("\n")

const resolveAllButUnresolvable = async (src: string) => {
	if (src === UNRESOLVABLE_IMAGE.src) throw new Error("No such Library image")
	return resolvedLibraryImageOf(src)
}

const galleryTileOf = (canvasElement: HTMLElement, alt: string) =>
	within(
		canvasElement.querySelector<HTMLElement>('[data-slot="gallery"]') ??
			canvasElement,
	).getByRole("img", { name: alt })

const resolvedTileOf = (canvasElement: HTMLElement, alt: string) =>
	waitFor(() => {
		const tile = galleryTileOf(canvasElement, alt)
		expect(tile.getAttribute("src")).toBe(
			resolvedLibraryImageOf(
				STORED_IMAGES.find((image) => image.alt === alt)?.src ?? "",
			),
		)
		return tile
	})

export const GalleryImageFailsToResolve = meta.story({
	args: {
		children: STORED_GALLERY,
		resolveImage: fn(resolveAllButUnresolvable),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A gallery of stored Library paths whose second image `resolveImage` cannot turn into an address. Check that tile is the broken image tile with its icon, and every other tile shows the address it resolved to.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(() =>
			expect(
				galleryTileOf(canvasElement, UNRESOLVABLE_IMAGE.alt),
			).toHaveAttribute("data-slot", "gallery-broken"),
		)
		for (const { alt } of STORED_IMAGES.filter(
			(image) => image !== UNRESOLVABLE_IMAGE,
		))
			await resolvedTileOf(canvasElement, alt)
	},
})

export const GalleryResolvedImageOpens = meta.story({
	tags: ["test-only"],
	args: {
		children: STORED_GALLERY,
		resolveImage: fn(async (src: string) => resolvedLibraryImageOf(src)),
		answerActions: {
			agentName: "Atlas",
			onUseValues: fn(),
			onOpenImage: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A gallery of stored Library paths, given answer actions. Check opening a tile hands `onOpenImage` the resolved addresses, never the stored paths.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const [, opened] = STORED_IMAGES
		await waitFor(() =>
			expect(args.resolveImage).toHaveBeenCalledTimes(STORED_IMAGES.length),
		)
		await waitFor(() =>
			expect(
				canvas.getByRole("button", { name: opened.alt }).querySelector("img"),
			).toHaveAttribute("src", resolvedLibraryImageOf(opened.src)),
		)
		await userEvent.click(canvas.getByRole("button", { name: opened.alt }))
		await expect(args.answerActions?.onOpenImage).toHaveBeenCalledWith(
			STORED_IMAGES.map(({ src }) =>
				expect.objectContaining({ src: resolvedLibraryImageOf(src) }),
			),
			1,
		)
	},
})

export const GalleryResolvingNotOpenable = meta.story({
	tags: ["test-only"],
	args: {
		children: STORED_GALLERY,
		resolveImage: fn(() => new Promise<string>(() => {})),
		answerActions: {
			agentName: "Atlas",
			onUseValues: fn(),
			onOpenImage: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A gallery of stored Library paths whose `resolveImage` never settles, given answer actions. Check every tile is the resolving surface and none is a button, so `onOpenImage` never receives a stored path.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await waitFor(() =>
			expect(args.resolveImage).toHaveBeenCalledTimes(STORED_IMAGES.length),
		)
		for (const { alt } of STORED_IMAGES)
			await expect(galleryTileOf(canvasElement, alt)).toHaveAttribute(
				"data-slot",
				"gallery-resolving",
			)
		await expect(canvas.queryAllByRole("button")).toHaveLength(0)
		await userEvent.click(galleryTileOf(canvasElement, STORED_IMAGES[0].alt))
		await expect(args.answerActions?.onOpenImage).not.toHaveBeenCalled()
	},
})

const ATTACHMENT_STORE = "/Users/ana/Library/Kiroshi/attachments/conversation-7"

const SPACED_ATTACHMENT_STORE =
	"/Users/ana/Library/Application Support/Kiroshi/attachments/conversation 7"

const CITED_IMAGE_PATH = `${ATTACHMENT_STORE}/4f9a2c1e-7b3d-4e8a-9f61-0c2d5b7e3a14.jpg`

const CITED_SPACED_IMAGE_PATH = `${SPACED_ATTACHMENT_STORE}/8e1d6b30-2c5f-4a97-b8e4-61f0a3c9d725.jpg`

const CITED_FILE_PATH = `${ATTACHMENT_STORE}/0b6f3c2e-8d41-4a7e-9c15-2f7d9e4a1b30.pdf`

const CITED_SPACED_FILE_PATH = `${SPACED_ATTACHMENT_STORE}/d3a7e9f2-5b18-4c60-a2d4-9e7f1b6c0a58.pdf`

const CITED_IMAGE_CAPTION = "The patio at noon"

const CITED_FILE_TEXT = "the Q3 report"

const resolvedAttachmentOf = (path: string) =>
	`data:image/svg+xml,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 8 5"><title>${path}</title><rect width="8" height="5" fill="#5b7a55"/><circle cx="6" cy="1.5" r="0.8" fill="#f3d17a"/></svg>`,
	)}`

const resolveCitedAttachment = async (path: string) =>
	resolvedAttachmentOf(path)

const IMAGE_CITED_MID_ANSWER = `Here is the patio the way it looked on Thursday.

![${CITED_IMAGE_CAPTION}](<${CITED_IMAGE_PATH}>)

The shade reaches the table around two, so lunch is better under the vine.`

const FILE_CITED_MID_ANSWER = `I went through [${CITED_FILE_TEXT}](<${CITED_FILE_PATH}>) and the revenue line matches the ledger, so nothing is left to reconcile before Friday.`

const PATHS_WITH_SPACES = `The photo you sent:

![${CITED_IMAGE_CAPTION}](<${CITED_SPACED_IMAGE_PATH}>)

And the final numbers sit in [${CITED_FILE_TEXT}](<${CITED_SPACED_FILE_PATH}>).`

const CODE_PATH_TEXT = "host.ts"

const RELATIVE_PATH_TEXT = "the plan"

const WEB_LINK_TEXT = "the ledger guide"

const FILE_CITED_AMONG_CODE_PATHS = `The revenue line in [${CITED_FILE_TEXT}](<${CITED_FILE_PATH}>) matches the ledger. The reader lives in [${CODE_PATH_TEXT}](src/lib/host.ts), the next steps are in [${RELATIVE_PATH_TEXT}](../notes/plan.md), and the rounding rule follows [${WEB_LINK_TEXT}](https://example.org/ledger).`

const ATTACHMENT_FAKES =
	"The resolver and the opener are story fakes: the app wires the real ones later."

export const AttachmentImageMidAnswer = meta.story({
	args: {
		children: IMAGE_CITED_MID_ANSWER,
		resolveAttachment: fn(resolveCitedAttachment),
		onOpenAttachment: fn(),
	},
	parameters: {
		docs: {
			description: {
				story: `An answer citing a stored image between two paragraphs, as \`![caption](<path>)\`. Check the image sits at the place of the citation, drawn from the address \`resolveAttachment\` answered and never from the stored path, named by its caption, and that activating it hands \`onOpenAttachment\` the cited path. ${ATTACHMENT_FAKES}`,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const image = await canvas.findByRole("img", { name: CITED_IMAGE_CAPTION })
		await expect(image).toHaveAttribute(
			"src",
			resolvedAttachmentOf(CITED_IMAGE_PATH),
		)
		const first = canvas.getByText(/^Here is the patio/)
		const last = canvas.getByText(/^The shade reaches the table/)
		await expect(
			first.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(
			image.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await userEvent.click(
			canvas.getByRole("button", { name: CITED_IMAGE_CAPTION }),
		)
		await expect(args.onOpenAttachment).toHaveBeenCalledWith(CITED_IMAGE_PATH)
	},
})

export const AttachmentFileMidAnswer = meta.story({
	args: {
		children: FILE_CITED_MID_ANSWER,
		onOpenAttachment: fn(),
	},
	parameters: {
		docs: {
			description: {
				story: `An answer citing a stored file mid-sentence, as \`[text](<path>)\`. Check the attachments-row file chip sits inside the sentence, the words before and after it still on its line, labelled by the link text with the extension the path carries, and that clicking it hands \`onOpenAttachment\` the cited path. ${ATTACHMENT_FAKES}`,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const chip = canvas.getByRole("button", {
			name: `Open ${CITED_FILE_TEXT}`,
		})
		await expect(chip.closest("p")).not.toBeNull()
		await expect(getComputedStyle(chip).display).toBe("inline-flex")
		await expect(chip).toHaveTextContent("PDF")
		await userEvent.click(chip)
		await expect(args.onOpenAttachment).toHaveBeenCalledWith(CITED_FILE_PATH)
	},
})

export const AttachmentFileAmongCodePaths = meta.story({
	args: {
		children: FILE_CITED_AMONG_CODE_PATHS,
		onOpenAttachment: fn(),
	},
	parameters: {
		docs: {
			description: {
				story: `An answer citing one stored file beside a code path, a relative path and a web link. Check only the stored file reads as a file chip, the code path and the relative path read as their plain text, the web link keeps its host, and the opener only ever receives the stored path. ${ATTACHMENT_FAKES}`,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const [chip, ...others] = canvas.getAllByRole("button")
		await expect(others).toHaveLength(0)
		await expect(chip).toHaveAccessibleName(`Open ${CITED_FILE_TEXT}`)
		const [link, ...otherLinks] = canvas.getAllByRole("link")
		await expect(otherLinks).toHaveLength(0)
		await expect(link).toHaveAttribute("href", "https://example.org/ledger")
		await expect(link).toHaveTextContent(WEB_LINK_TEXT)
		await expect(chip.closest("p")).toHaveTextContent(
			`The reader lives in ${CODE_PATH_TEXT}, the next steps are in ${RELATIVE_PATH_TEXT}, and`,
		)
		await userEvent.click(chip)
		await expect(args.onOpenAttachment).toHaveBeenCalledOnce()
		await expect(args.onOpenAttachment).toHaveBeenCalledWith(CITED_FILE_PATH)
	},
})

export const AttachmentUnresolved = meta.story({
	args: {
		children: IMAGE_CITED_MID_ANSWER,
		resolveAttachment: fn(() =>
			Promise.reject(new Error("No such attachment")),
		),
	},
	parameters: {
		docs: {
			description: {
				story: `An answer citing a stored image \`resolveAttachment\` cannot turn into an address. Check the caption reads as text at the place of the citation and no image asks for the stored path. ${ATTACHMENT_FAKES}`,
			},
		},
	},
	play: async ({ args, canvas }) => {
		await waitFor(() =>
			expect(args.resolveAttachment).toHaveBeenCalledWith(CITED_IMAGE_PATH),
		)
		await expect(
			await canvas.findByText(CITED_IMAGE_CAPTION),
		).toBeInTheDocument()
		await expect(canvas.queryByRole("img")).toBeNull()
	},
})

export const AttachmentPathWithSpaces = meta.story({
	args: {
		children: PATHS_WITH_SPACES,
		resolveAttachment: fn(resolveCitedAttachment),
		onOpenAttachment: fn(),
	},
	parameters: {
		docs: {
			description: {
				story: `An answer citing an image and a file whose stored paths hold spaces, each written between angle brackets. Check each reads as a single attachment, the resolver and the opener receiving the paths with their spaces rather than escaped. ${ATTACHMENT_FAKES}`,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const image = await canvas.findByRole("img", { name: CITED_IMAGE_CAPTION })
		await expect(image).toHaveAttribute(
			"src",
			resolvedAttachmentOf(CITED_SPACED_IMAGE_PATH),
		)
		await expect(args.resolveAttachment).toHaveBeenCalledWith(
			CITED_SPACED_IMAGE_PATH,
		)
		const [chip, ...others] = canvas.getAllByRole("button", {
			name: `Open ${CITED_FILE_TEXT}`,
		})
		await expect(others).toHaveLength(0)
		await userEvent.click(chip)
		await expect(args.onOpenAttachment).toHaveBeenCalledWith(
			CITED_SPACED_FILE_PATH,
		)
	},
})

const BOARD_FILE = "boards/Launch week plan.canvas"

const BOARD_ALONE = `Here is the board for the launch.

[${BOARD_CARD_TITLE}](<${BOARD_FILE}>)

Open it beside the thread to move things around.`

const BOARD_IN_SENTENCE = `I sketched [${BOARD_CARD_TITLE}](<${BOARD_FILE}>) so we can split the work before Friday.`

const BOARD_SENTENCE = `I sketched ${BOARD_CARD_TITLE} so we can split the work before Friday.`

const LOADED_BOARD: BoardCardSummary = {
	status: "loaded",
	itemCount: 14,
	snapshot: PLANNING_BOARD_SNAPSHOT,
}

const LOADING_BOARD: BoardCardSummary = { status: "loading" }

const openBoard = fn()

const boardSlotOf =
	(summary: BoardCardSummary): MarkdownBoardLinkRenderer =>
	({ words }) => (
		<BoardCard
			editedLabel="edited just now"
			onOpen={openBoard}
			pointers={[]}
			summary={summary}
			title={words}
		/>
	)

const BOARD_SLOT_FAKES =
	"The host slot here draws `BoardCard` from the board fixtures; in the app it reads the board from the Library."

type BoardLinkPlayContext = { canvasElement: HTMLElement }

const expectBoardInPlaceOfLink = async ({
	canvasElement,
}: BoardLinkPlayContext) => {
	const canvas = within(canvasElement)
	const card = canvas.getByRole("article")
	await expect(card.closest("p")).toBeNull()
	await expect(card.parentElement).toHaveAttribute("data-slot", "markdown")
	await expect(canvasElement.querySelector("a")).toBeNull()
	await expect(canvas.queryByText(BOARD_FILE, { exact: false })).toBeNull()
	return card
}

const expectLoadedBoardLink = async (context: BoardLinkPlayContext) => {
	openBoard.mockClear()
	const card = await expectBoardInPlaceOfLink(context)
	await expect(card).not.toHaveAttribute("aria-busy")
	await userEvent.click(
		within(card).getByRole("button", {
			name: "Open",
			description: BOARD_CARD_TITLE,
		}),
	)
	await expect(openBoard).toHaveBeenCalledOnce()
}

const expectLoadingBoardLink = async (context: BoardLinkPlayContext) => {
	const card = await expectBoardInPlaceOfLink(context)
	await expect(card).toHaveAttribute("aria-busy", "true")
	await expect(
		card.querySelector('[data-slot="board-card-preview-skeleton"]'),
	).not.toBeNull()
}

const expectBoardAfterSentence = async (context: BoardLinkPlayContext) => {
	const card = await expectBoardInPlaceOfLink(context)
	const sentence = within(context.canvasElement).getByText(BOARD_SENTENCE)
	await expect(sentence.tagName).toBe("P")
	await expect(sentence.nextElementSibling).toBe(card)
	for (const paragraph of context.canvasElement.querySelectorAll("p")) {
		await expect(paragraph).not.toContainElement(card)
	}
}

export const BoardLinkLoaded = meta.story({
	args: { children: BOARD_ALONE, renderBoardLink: boardSlotOf(LOADED_BOARD) },
	parameters: {
		docs: {
			description: {
				story: `An answer posting a Library board as a link alone in its paragraph, \`[title](<board.canvas>)\`. Check the board card stands in place of that paragraph, between the prose before and after it, that no link and no file name is left behind, and that Open calls back once. ${BOARD_SLOT_FAKES}`,
			},
		},
	},
	play: expectLoadedBoardLink,
})

export const BoardLinkLoadedDark = meta.story({
	args: { children: BOARD_ALONE, renderBoardLink: boardSlotOf(LOADED_BOARD) },
	globals: { theme: "dark" },
	play: expectLoadedBoardLink,
})

export const BoardLinkLoading = meta.story({
	args: { children: BOARD_ALONE, renderBoardLink: boardSlotOf(LOADING_BOARD) },
	parameters: {
		docs: {
			description: {
				story: `The same answer while the host still reads the board. Check the loading card holds the place of the paragraph, its line and preview drawn as skeletons, and no link is left behind. ${BOARD_SLOT_FAKES}`,
			},
		},
	},
	play: expectLoadingBoardLink,
})

export const BoardLinkLoadingDark = meta.story({
	args: { children: BOARD_ALONE, renderBoardLink: boardSlotOf(LOADING_BOARD) },
	globals: { theme: "dark" },
	play: expectLoadingBoardLink,
})

export const BoardLinkInSentence = meta.story({
	args: {
		children: BOARD_IN_SENTENCE,
		renderBoardLink: boardSlotOf(LOADED_BOARD),
	},
	parameters: {
		docs: {
			description: {
				story: `An answer naming a Library board mid-sentence. Check the link words stay in the sentence as plain words, and the board card follows that paragraph as its own block, never inside it. ${BOARD_SLOT_FAKES}`,
			},
		},
	},
	play: expectBoardAfterSentence,
})

export const BoardLinkInSentenceDark = meta.story({
	args: {
		children: BOARD_IN_SENTENCE,
		renderBoardLink: boardSlotOf(LOADED_BOARD),
	},
	globals: { theme: "dark" },
	play: expectBoardAfterSentence,
})

const BOARD_LINK = `[${BOARD_CARD_TITLE}](<${BOARD_FILE}>)`

const BOARD_IN_CHECKLIST = `- [ ] Review ${BOARD_LINK} with the team
  - [ ] Book the launch room`

const BOARD_CHECKLIST_LABEL = `Review ${BOARD_CARD_TITLE} with the team`

const BOARD_IN_LIST_SENTENCE = `- Split ${BOARD_LINK} into owners before Friday
  - Ana takes the timeline`

const BOARD_LIST_SENTENCE = `Split ${BOARD_CARD_TITLE} into owners before Friday`

const BOARD_IN_TABLE_CELL = `| Board | Owner |
| - | - |
| Draft in ${BOARD_LINK} | Ana |`

const BOARD_TABLE_CELL = `Draft in ${BOARD_CARD_TITLE}`

const expectBoardWithoutLink = async ({
	canvasElement,
}: BoardLinkPlayContext) => {
	const card = within(canvasElement).getByRole("article")
	await expect(card).not.toHaveAttribute("aria-busy")
	await expect(canvasElement.querySelector("a")).toBeNull()
	await expect(
		within(canvasElement).queryByText(BOARD_FILE, { exact: false }),
	).toBeNull()
	return card
}

const expectBoardAfterChecklistLabel = async (
	context: BoardLinkPlayContext,
) => {
	openBoard.mockClear()
	const card = await expectBoardWithoutLink(context)
	const label = within(context.canvasElement).getByText(BOARD_CHECKLIST_LABEL)
	await expect(label).toHaveAttribute("data-slot", "markdown-task-label")
	await expect(label).not.toContainElement(card)
	await expect(label.nextElementSibling).toBe(card)
	await expect(card.parentElement).toBe(label.closest("li"))
	await expect(card.nextElementSibling?.tagName).toBe("UL")

	const box = within(label).getByRole("checkbox")
	await userEvent.click(label)
	await expect(box).toBeChecked()
	await userEvent.click(
		within(card).getByRole("button", {
			name: "Open",
			description: BOARD_CARD_TITLE,
		}),
	)
	await expect(openBoard).toHaveBeenCalledOnce()
	await expect(box).toBeChecked()
}

const expectBoardAfterListSentence = async (context: BoardLinkPlayContext) => {
	const card = await expectBoardWithoutLink(context)
	const item = within(context.canvasElement).getByText(BOARD_LIST_SENTENCE)
	await expect(item.tagName).toBe("LI")
	await expect(card.parentElement).toBe(item)
	await expect(item.firstChild?.textContent).toBe("Split ")
	await expect(card.nextElementSibling?.tagName).toBe("UL")
	await expect(card.closest("p")).toBeNull()
}

const expectBoardAfterTable = async (context: BoardLinkPlayContext) => {
	const card = await expectBoardWithoutLink(context)
	const canvas = within(context.canvasElement)
	const cell = canvas.getByText(BOARD_TABLE_CELL)
	await expect(cell.tagName).toBe("TD")
	await expect(cell).not.toContainElement(card)
	await expect(canvas.getByRole("cell", { name: "Ana" })).toBeVisible()
	const frame = cell.closest('[data-slot="markdown-table"]')
	await expect(frame).not.toContainElement(card)
	await expect(frame?.nextElementSibling).toBe(card)
}

export const BoardLinkInChecklist = meta.story({
	args: {
		children: BOARD_IN_CHECKLIST,
		renderBoardLink: boardSlotOf(LOADED_BOARD),
	},
	parameters: {
		docs: {
			description: {
				story: `A checklist item naming a Library board. Check the link words stay in the task label as plain words, the board card follows the label inside the same item and before the nested list, a click on the words ticks the box, and Open on the card calls back once without touching the box. ${BOARD_SLOT_FAKES}`,
			},
		},
	},
	play: expectBoardAfterChecklistLabel,
})

export const BoardLinkInChecklistDark = meta.story({
	args: {
		children: BOARD_IN_CHECKLIST,
		renderBoardLink: boardSlotOf(LOADED_BOARD),
	},
	globals: { theme: "dark" },
	play: expectBoardAfterChecklistLabel,
})

export const BoardLinkInListSentence = meta.story({
	args: {
		children: BOARD_IN_LIST_SENTENCE,
		renderBoardLink: boardSlotOf(LOADED_BOARD),
	},
	parameters: {
		docs: {
			description: {
				story: `A list item naming a Library board mid-sentence. Check the link words stay in the item as plain words and the board card follows them inside the same item, before the nested list. ${BOARD_SLOT_FAKES}`,
			},
		},
	},
	play: expectBoardAfterListSentence,
})

export const BoardLinkInListSentenceDark = meta.story({
	args: {
		children: BOARD_IN_LIST_SENTENCE,
		renderBoardLink: boardSlotOf(LOADED_BOARD),
	},
	globals: { theme: "dark" },
	play: expectBoardAfterListSentence,
})

export const BoardLinkInTableCell = meta.story({
	args: {
		children: BOARD_IN_TABLE_CELL,
		renderBoardLink: boardSlotOf(LOADED_BOARD),
	},
	parameters: {
		docs: {
			description: {
				story: `A table cell naming a Library board. Check the link words stay in the cell as plain words and the board card follows the table as its own block, never inside a cell. ${BOARD_SLOT_FAKES}`,
			},
		},
	},
	play: expectBoardAfterTable,
})

export const BoardLinkInTableCellDark = meta.story({
	args: {
		children: BOARD_IN_TABLE_CELL,
		renderBoardLink: boardSlotOf(LOADED_BOARD),
	},
	globals: { theme: "dark" },
	play: expectBoardAfterTable,
})
