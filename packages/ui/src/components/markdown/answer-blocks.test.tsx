import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import { Markdown } from "@workspace/ui/components/markdown"
import type { MarkdownAnswerActions } from "@workspace/ui/components/markdown/answer-actions"
import { prepareHighlighter } from "@workspace/ui/lib/code-highlight"

prepareHighlighter()

type RenderOptions = {
	isWriting?: boolean
	answerActions?: MarkdownAnswerActions
}

const render = (
	source: string,
	{ isWriting = false, answerActions }: RenderOptions = {},
) =>
	renderToStaticMarkup(
		<I18nProvider>
			<Markdown answerActions={answerActions} isWriting={isWriting}>
				{source}
			</Markdown>
		</I18nProvider>,
	)

const fenced = (label: string, body: string) =>
	`Here it is.\n\n\`\`\`${label}\n${body}\n\`\`\``

const OPTIONS = `question: How should the migration ship?
- title: One release
  text: A single downtime window of about ten minutes.
- title: Dual write
  text: No downtime, two weeks of writing to both tables.`

const ILLUSTRATED_LIST = `- title: Lisbon
  image: https://images.example.org/lisbon.jpg
  text: Mild winters.
  link: https://www.visitlisboa.com
- title: Porto
  image: https://images.example.org/porto.jpg`

const GALLERY = `- image: https://images.example.org/sofa-green.jpg
  alt: Green velvet sofa
  caption: Green velvet, 1,290 euros
  source: https://shop.example.org/sofa-green
- image: https://images.example.org/sofa-grey.jpg
  alt: Grey linen sofa`

const INTERACTIVE = `result: amount * rate / 1200 / (1 - (1 + rate / 1200) ^ -(years * 12))
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
  default: 20`

const COLLAPSIBLE = `title: Full list of the 14 failing tests

- \`sync dedupes on the client id\`
- and twelve more of the same file.`

const WEB_PAGE_TEXT = `url: https://www.casadorio.pt/rooms
title: Casa do Rio, rooms and rates
description: Eight rooms on the river, breakfast included.`

const WEB_PAGE = `${WEB_PAGE_TEXT}
image: https://images.example.org/casa-do-rio.jpg
alt: Terrace of Casa do Rio over the river`

const VIDEO_REQUIRED = `url: https://media.example.org/standup-0312.mp4
title: standup-0312.mp4
duration: 4:32`

const VIDEO = `${VIDEO_REQUIRED}
source: Recorded in Meet
poster: https://images.example.org/standup-0312.jpg
marker: 2:16
marker-label: Release plan`

const MAP_PLACES = `- name: Casa do Rio
  lat: 38.7105
  lon: -9.1302
- name: Time Out Market
  lat: 38.7069
  lon: -9.1459`

const MAP = `title: 1.9 km · 25 min walk
subtitle: Alfama, Lisbon · © OpenStreetMap contributors
area: Rio Tejo
link: https://www.openstreetmap.org/directions?from=38.7105,-9.1302&to=38.7069,-9.1459
${MAP_PLACES}`

const slot = (name: string) => `data-slot="${name}"`

const leftOffsets = (html: string) =>
	[...html.matchAll(/left:(-?[\d.]+)%/g)].map(([, value]) => Number(value))

describe("rich answer blocks", () => {
	it.each([
		["options", OPTIONS, "options-card"],
		["illustrated-list", ILLUSTRATED_LIST, "illustrated-list"],
		["gallery", GALLERY, "gallery"],
		["interactive", INTERACTIVE, "interactive-view"],
		["collapsible", COLLAPSIBLE, "collapsible-sections"],
		["web-page", WEB_PAGE, "web-page-card"],
		["video", VIDEO, "video-player"],
		["map", MAP, "map-card"],
	])("draws a %s block with its component", (label, body, component) => {
		const html = render(fenced(label, body))

		expect(html).toContain(slot(component))
		expect(html).not.toContain(slot("markdown-fence"))
	})

	it("draws the option titles and the question of an options card", () => {
		const html = render(fenced("options", OPTIONS))

		expect(html).toContain("How should the migration ship?")
		expect(html).toContain("One release")
		expect(html).toContain("Dual write")
	})

	it("computes the interactive result at the default values, two decimals at most", () => {
		expect(render(fenced("interactive", INTERACTIVE))).toContain("1,159.92")
	})

	it("keeps the sliders and shows the result as not defined where the formula gives no number", () => {
		const html = render(
			fenced(
				"interactive",
				`result: 1 / x\nresult-label: Inverse\n- name: x\n  label: X\n  min: 0\n  max: 4\n  step: 1\n  default: 0`,
			),
		)

		expect(html).toContain(slot("interactive-view-slider-value"))
		expect(html).toContain("Not defined for these values")
	})

	it.each([
		["a required field is missing", "options", "- title: One release"],
		["a field is unknown", "options", `${OPTIONS}\n  price: 10 euros`],
		[
			"a field is given twice",
			"options",
			`question: One?\nquestion: Two?\n- title: A\n  text: B`,
		],
		[
			"a block field follows an item",
			"options",
			`- title: A\n  text: B\nquestion: Late?`,
		],
		[
			"a URL is not https",
			"illustrated-list",
			"- title: Lisbon\n  image: http://images.example.org/lisbon.jpg",
		],
		[
			"a URL is a script",
			"gallery",
			"- image: javascript:alert(1)\n  alt: Nothing",
		],
		[
			"the formula calls an unlisted function",
			"interactive",
			INTERACTIVE.replace("amount * rate", "pow(amount, 1) * rate"),
		],
		[
			"the formula names an undeclared slider",
			"interactive",
			INTERACTIVE.replace("amount * rate", "loan * rate"),
		],
		[
			"the formula reaches for script",
			"interactive",
			INTERACTIVE.replace("amount * rate", "this.constructor"),
		],
		[
			"a default lies outside its slider",
			"interactive",
			INTERACTIVE.replace(/default: 20$/, "default: 40"),
		],
		[
			"two sliders share a name",
			"interactive",
			INTERACTIVE.replace("name: years", "name: rate"),
		],
		[
			"six sliders are declared",
			"interactive",
			`result: a\nresult-label: A\n${["a", "b", "c", "d", "e", "f"]
				.map(
					(name) =>
						`- name: ${name}\n  label: ${name}\n  min: 0\n  max: 1\n  step: 1\n  default: 0`,
				)
				.join("\n")}`,
		],
		["the content is missing", "collapsible", "title: Nothing under it"],
		[
			"the content holds a fenced block",
			"collapsible",
			"title: Logs\n\n~~~\nerror\n~~~",
		],
		[
			"a web page preview is not https",
			"web-page",
			`${WEB_PAGE_TEXT}\nimage: http://images.example.org/casa-do-rio.jpg`,
		],
		["a video has no duration", "video", VIDEO.replace("duration: 4:32\n", "")],
		[
			"a video address is not https",
			"video",
			VIDEO.replace("https://media", "http://media"),
		],
		[
			"a video duration is not a time",
			"video",
			VIDEO.replace("duration: 4:32", "duration: four minutes"),
		],
		[
			"a video marker lies past the end",
			"video",
			VIDEO.replace("marker: 2:16", "marker: 5:00"),
		],
		["a map has no place", "map", "title: 1.9 km · 25 min walk"],
		["a map place has no longitude", "map", MAP.replace("  lon: -9.1459", "")],
		[
			"a map latitude lies off the globe",
			"map",
			MAP.replace("lat: 38.7105", "lat: 98.7105"),
		],
		[
			"a map link is not https",
			"map",
			MAP.replace("https://www.openstreetmap", "http://www.openstreetmap"),
		],
	])("draws the source as a plain fence when %s", (_, label, body) => {
		const html = render(fenced(label, body))

		expect(html).toContain(slot("markdown-fence"))
		expect(html).not.toContain(slot("markdown-answer-block"))
	})

	it("draws a web page preview with its alt text", () => {
		expect(render(fenced("web-page", WEB_PAGE))).toContain(
			'<img src="https://images.example.org/casa-do-rio.jpg" alt="Terrace of Casa do Rio over the river"',
		)
	})

	it("draws a web page preview without alt text as decorative", () => {
		const html = render(
			fenced(
				"web-page",
				`${WEB_PAGE_TEXT}\nimage: https://images.example.org/casa-do-rio.jpg`,
			),
		)

		expect(html).toContain(
			'<img src="https://images.example.org/casa-do-rio.jpg" alt=""',
		)
	})

	it("draws a web page without an image as a card without preview, named by its host", () => {
		const html = render(fenced("web-page", WEB_PAGE_TEXT))

		expect(html).toContain(slot("web-page-card"))
		expect(html).not.toContain("<img")
		expect(html).toContain(">casadorio.pt<")
		expect(html).not.toContain("Eight rooms on the river")
	})

	it("ignores a web page alt given without an image", () => {
		const html = render(
			fenced("web-page", `${WEB_PAGE_TEXT}\nalt: Terrace over the river`),
		)

		expect(html).toContain(slot("web-page-card"))
		expect(html).not.toContain("<img")
		expect(html).not.toContain("Terrace over the river")
	})

	it("captions a video with its title, source and marker label", () => {
		const html = render(fenced("video", VIDEO))

		expect(html).toContain(
			"standup-0312.mp4 · Recorded in Meet · Release plan</figcaption>",
		)
		expect(html).toContain('aria-label="Play standup-0312.mp4"')
		expect(html).toContain(">0:00<")
		expect(html).toContain(">4:32<")
	})

	it("places the video marker at its time over the duration", () => {
		const html = render(fenced("video", VIDEO))

		expect(html).toContain('aria-label="Go to 2:16"')
		expect(leftOffsets(html)).toEqual([50])
	})

	it("draws a video without poster or marker on its slate", () => {
		const html = render(fenced("video", VIDEO_REQUIRED))

		expect(html).toContain(slot("video-player"))
		expect(html).not.toContain("poster=")
		expect(html).not.toContain("Go to")
		expect(html).toContain(">standup-0312.mp4</figcaption>")
	})

	it("draws the map route through its places, in order, inside the surface", () => {
		const html = render(fenced("map", MAP))
		const [start, destination] = leftOffsets(html)

		expect(html.match(/<line /g)).toHaveLength(1)
		expect(html.indexOf("Casa do Rio")).toBeLessThan(
			html.indexOf("Time Out Market"),
		)
		expect(start).toBeCloseTo(80)
		expect(destination).toBeCloseTo(20)
		expect(html).toContain(
			'href="https://www.openstreetmap.org/directions?from=38.7105,-9.1302&amp;to=38.7069,-9.1459"',
		)
	})

	it("draws a map with one place at the centre, with no route and no link", () => {
		const html = render(
			fenced("map", `title: Casa do Rio\n${MAP_PLACES.split("\n- ")[0]}`),
		)

		expect(html).toContain(slot("map-card"))
		expect(leftOffsets(html)).toEqual([50])
		expect(html).not.toContain("<line")
		expect(html).not.toContain("<a ")
	})

	it("draws the map without loading anything", () => {
		const html = render(fenced("map", MAP))

		expect(html).not.toMatch(/<img|<iframe|src=|url\(/)
	})

	it("draws the pending frame while the agent is still writing a block", () => {
		const html = render(`Here it is.\n\n\`\`\`options\n${OPTIONS}`, {
			isWriting: true,
		})

		expect(html).toContain(slot("rich-block-pending"))
		expect(html).not.toContain(slot("options-card"))
	})

	it("draws the block once its fence closes, even while the agent writes on", () => {
		const html = render(`${fenced("options", OPTIONS)}\n\nAnd then`, {
			isWriting: true,
		})

		expect(html).toContain(slot("options-card"))
		expect(html).not.toContain(slot("rich-block-pending"))
	})

	it("keeps a code fence being written as code", () => {
		const html = render("```ts\nconst a = 1", { isWriting: true })

		expect(html).toContain(slot("markdown-fence"))
		expect(html).not.toContain(slot("rich-block-pending"))
	})
})

describe("rich answer blocks written in GFM", () => {
	it.each([
		["NOTE", "note"],
		["WARNING", "warning"],
	])(
		"draws a [!%s] quote as a %s callout without its marker",
		(marker, tone) => {
			const html = render(
				`> [!${marker}]\n> The export keeps the archived rooms.`,
			)

			expect(html).toContain(`data-tone="${tone}"`)
			expect(html).toContain("The export keeps the archived rooms.")
			expect(html).not.toContain(`[!${marker}]`)
		},
	)

	it("draws a callout whose text follows in its own paragraph", () => {
		const html = render("> [!NOTE]\n>\n> The export keeps.")

		expect(html).toContain('data-tone="note"')
		expect(html).toContain("The export keeps.")
	})

	it.each([
		["another alert kind", "> [!TIP]\n> Try it."],
		["a marker with no text", "> [!NOTE]"],
		["a marker sharing its line", "> [!NOTE] The export keeps."],
	])("keeps %s as a plain quote", (_, source) => {
		const html = render(source)

		expect(html).toContain("<blockquote>")
		expect(html).not.toContain(slot("callout"))
	})

	it("draws an image with its source line as a sourced image", () => {
		const html = render(
			"![The Lisbon waterfront at dusk](https://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](https://www.visitlisboa.com/en)",
		)

		expect(html).toContain(slot("sourced-image"))
		expect(html).toContain("Visit Lisboa")
		expect(html).not.toContain("Source: ")
	})

	it.each([
		[
			"its image is not https",
			"![Waterfront](http://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](https://www.visitlisboa.com)",
		],
		[
			"its source page is not https",
			"![Waterfront](https://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](http://www.visitlisboa.com)",
		],
		[
			"its alt text is missing",
			"![](https://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](https://www.visitlisboa.com)",
		],
		[
			"its source line carries more than the link",
			"![Waterfront](https://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](https://www.visitlisboa.com) and more",
		],
	])("keeps a large image as markdown when %s", (_, source) => {
		const html = render(source)

		expect(html).not.toContain(slot("sourced-image"))
		expect(html).toContain("Source: ")
	})
})

describe("images of an agent answer", () => {
	const ANSWER_ACTIONS: MarkdownAnswerActions = {
		agentName: "Atlas",
		onPickOption: () => undefined,
		onUseValues: () => undefined,
		onOpenImage: () => undefined,
	}
	const SOURCED =
		"![The Lisbon waterfront at dusk](https://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](https://www.visitlisboa.com/en)"
	const PLAIN = "Here: ![A green sofa](https://images.example.org/sofa.jpg)"
	const LINKED =
		"[![A green sofa](https://images.example.org/sofa.jpg)](https://shop.example.org/sofa)"
	const opener = slot("markdown-image-open")

	it("wraps a sourced image in a button naming the image", () => {
		const html = render(SOURCED, { answerActions: ANSWER_ACTIONS })

		expect(html).toMatch(
			/<button type="button" aria-label="The Lisbon waterfront at dusk" data-slot="markdown-image-open"[^>]*><figure data-slot="sourced-image"/,
		)
	})

	it("wraps a plain image in a button", () => {
		const html = render(PLAIN, { answerActions: ANSWER_ACTIONS })

		expect(html).toMatch(
			/<button type="button" aria-label="A green sofa" data-slot="markdown-image-open"[^>]*><img/,
		)
	})

	it("names a plain image without alt text as an image", () => {
		const html = render("![](https://images.example.org/sofa.jpg)", {
			answerActions: ANSWER_ACTIONS,
		})

		expect(html).toContain('aria-label="Image"')
	})

	it("leaves an image inside a link to its link", () => {
		const html = render(LINKED, { answerActions: ANSWER_ACTIONS })

		expect(html).not.toContain(opener)
		expect(html).toContain("<img")
	})

	it.each([
		["a sourced image", SOURCED],
		["a plain image", PLAIN],
	])(
		"draws %s exactly as before when no answer actions are given",
		(_, source) => {
			const html = render(source)

			expect(html).not.toContain(opener)
			expect(html).not.toContain("<button")
		},
	)
})
