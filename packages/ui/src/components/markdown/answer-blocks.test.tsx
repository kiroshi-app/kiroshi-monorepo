import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import { Markdown } from "@workspace/ui/components/markdown"
import type { MarkdownAnswerActions } from "@workspace/ui/components/markdown/answer-actions"
import { MarkdownImageResolverContext } from "@workspace/ui/components/markdown/image-resolver"
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

const CHECKLIST = `title: To sort before Thursday
- text: Book the house
  done: yes
  assignee: you
- text: Collect dietary needs
  assignee: Tom
- text: Send the flight options
  done: no`

const BUDGET_TOTAL = "1200 * nights + 45 * people * nights + flight * people"

const BUDGET = `title: Offsite budget
result: ${BUDGET_TOTAL}
result-label: Total for the trip
currency: EUR
note: {(${BUDGET_TOTAL}) / people} a head
meter: (${BUDGET_TOTAL}) / 10000
meter-caption: {10000 - (${BUDGET_TOTAL})} under the €10k budget
source: Prices from the house listing and Taberna da Rua
- name: people
  label: People
  min: 4
  max: 20
  step: 1
  default: 12
- name: nights
  label: Nights
  min: 1
  max: 7
  step: 1
  default: 3
- name: flight
  label: Flight per person
  min: 60
  max: 400
  step: 10
  default: 180
  currency: EUR
- row: House, 3 nights
  value: 1200 * nights
- row: Dinners
  value: 45 * people * nights
- row: Flights
  value: flight * people`

const SECTIONS = `title: The house
value: €3,600 · 49%

Three nights at **Casa do Rio**.

title: Flights
value: €2,160 · 29%

Twelve returns at €180.`

const SOURCED_DETAILS =
	"![Miradouro at sunset](https://images.example.org/miradouro.jpg)\n\nSource: [visitlisboa.example](https://www.visitlisboa.example/en)\nTitle: Miradouro da Senhora do Monte\nFavicon: https://www.visitlisboa.example/favicon.png\nStatus: Free\nChip: Walk: 10 min uphill\nChip: Sunset 18:52"

const slot = (name: string) => `data-slot="${name}"`

const ANSWER_ACTIONS: MarkdownAnswerActions = {
	agentName: "Atlas",
	onPickOption: () => undefined,
	onUseValues: () => undefined,
	onOpenImage: () => undefined,
}

const leftOffsets = (html: string) =>
	[...html.matchAll(/left:(-?[\d.]+)%/g)].map(([, value]) => Number(value))

describe("rich answer blocks", () => {
	it.each([
		["illustrated-list", ILLUSTRATED_LIST, "illustrated-list"],
		["checklist", CHECKLIST, "checklist"],
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
		[
			"an illustrated-list item has no image",
			"illustrated-list",
			"- title: Lisbon\n  text: Mild winters.",
		],
		[
			"a checklist has no title",
			"checklist",
			CHECKLIST.replace("title: To sort before Thursday\n", ""),
		],
		[
			"a checklist row has no text",
			"checklist",
			"title: To sort\n- assignee: Tom",
		],
		[
			"a checklist row is done neither yes nor no",
			"checklist",
			CHECKLIST.replace("done: yes", "done: maybe"),
		],
		[
			"a gallery image has no alt text",
			"gallery",
			"- image: https://images.example.org/sofa.jpg",
		],
		[
			"an interactive block has no result label",
			"interactive",
			INTERACTIVE.replace("result-label: Monthly payment in euros\n", ""),
		],
		[
			"an interactive block declares a currency and a unit",
			"interactive",
			BUDGET.replace("currency: EUR\n", "currency: EUR\nunit: km\n"),
		],
		[
			"an interactive currency is not a currency code",
			"interactive",
			BUDGET.replace("currency: EUR\n", "currency: euros\n"),
		],
		[
			"the total note names an undeclared slider",
			"interactive",
			BUDGET.replace("/ people} a head", "/ guests} a head"),
		],
		[
			"the total note leaves a brace open",
			"interactive",
			BUDGET.replace("/ people} a head", "/ people a head"),
		],
		[
			"the meter has no caption",
			"interactive",
			BUDGET.replace(/meter-caption: .*\n/, ""),
		],
		[
			"a breakdown formula does not compile",
			"interactive",
			BUDGET.replace("value: 45 * people * nights", "value: 45 * * nights"),
		],
		[
			"a breakdown row has no value",
			"interactive",
			BUDGET.replace("\n  value: flight * people", ""),
		],
		[
			"a breakdown row carries a slider field",
			"interactive",
			BUDGET.replace(
				"value: flight * people",
				"value: flight * people\n  min: 0",
			),
		],
		[
			"only breakdown rows are declared",
			"interactive",
			"result: 1\nresult-label: One\n- row: One\n  value: 1",
		],
		[
			"a later collapsible section has no content",
			"collapsible",
			`${COLLAPSIBLE}\n\ntitle: Empty\nvalue: 0`,
		],
		[
			"a web page has no title",
			"web-page",
			"url: https://www.casadorio.pt/rooms",
		],
		["a field is unknown", "checklist", `${CHECKLIST}\n  price: 10 euros`],
		[
			"a field is given twice",
			"checklist",
			`title: One\ntitle: Two\n- text: A`,
		],
		[
			"a block field follows an item",
			"map",
			`title: Walk\n${MAP_PLACES}\nsubtitle: Late`,
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
		const html = render(`Here it is.\n\n\`\`\`checklist\n${CHECKLIST}`, {
			isWriting: true,
		})

		expect(html).toContain(slot("rich-block-pending"))
		expect(html).not.toContain(slot("checklist"))
	})

	it("draws the block once its fence closes, even while the agent writes on", () => {
		const html = render(`${fenced("checklist", CHECKLIST)}\n\nAnd then`, {
			isWriting: true,
		})

		expect(html).toContain(slot("checklist"))
		expect(html).not.toContain(slot("rich-block-pending"))
	})

	it("keeps a fence labelled options as code, closed or being written", () => {
		const body = "- title: One release\n  text: Ten minutes of downtime."

		expect(render(fenced("options", body))).toContain(slot("markdown-fence"))

		const writing = render(`Here it is.\n\n\`\`\`options\n${body}`, {
			isWriting: true,
		})
		expect(writing).toContain(slot("markdown-fence"))
		expect(writing).not.toContain(slot("rich-block-pending"))
	})

	it("keeps a code fence being written as code", () => {
		const html = render("```ts\nconst a = 1", { isWriting: true })

		expect(html).toContain(slot("markdown-fence"))
		expect(html).not.toContain(slot("rich-block-pending"))
	})
})

describe("fields of the Final page artboards", () => {
	it("draws the badge, the meta and the bold text of an illustrated-list item", () => {
		const html = render(
			fenced(
				"illustrated-list",
				"- title: Casa do Rio\n  image: https://images.example.org/casa.jpg\n  badge: My pick\n  text: Grilled fish and **the best view of the three**.\n  meta: 12 min on foot · Riverside",
			),
		)

		expect(html).toContain("My pick")
		expect(html).toContain("<strong>the best view of the three</strong>")
		expect(html).toContain("12 min on foot · Riverside")
		expect(html).not.toContain("**")
	})

	it("draws a checklist with its title, its counter, each assignee and each state", () => {
		const html = render(fenced("checklist", CHECKLIST))

		expect(html).toContain("To sort before Thursday")
		expect(html).toMatch(/data-slot="checklist-counter"[^>]*>1\/3</)
		expect(html).toContain(">Tom<")
		expect(html.match(/>Done</g)).toHaveLength(1)
		expect(html.match(/>To do</g)).toHaveLength(2)
	})

	it("makes checklist rows checkboxes and shows Copy the list only with their callbacks", () => {
		const plain = render(fenced("checklist", CHECKLIST), {
			answerActions: ANSWER_ACTIONS,
		})
		const wired = render(fenced("checklist", CHECKLIST), {
			answerActions: {
				...ANSWER_ACTIONS,
				onToggleChecklistItem: () => undefined,
				onCopyChecklist: () => undefined,
			},
		})

		expect(plain).not.toContain('role="checkbox"')
		expect(plain).not.toContain("Copy the list")
		expect(wired.match(/role="checkbox"/g)).toHaveLength(3)
		expect(wired).toContain('aria-checked="true"')
		expect(wired).toContain("Copy the list")
	})

	it("draws the title, the favicon, the status and the chips of a sourced image", () => {
		const html = render(SOURCED_DETAILS)

		expect(html).toContain(">Miradouro da Senhora do Monte<")
		expect(html).toContain('src="https://www.visitlisboa.example/favicon.png"')
		expect(html).toMatch(/data-slot="sourced-image-status"[^>]*>.*Free</)
		expect(html).toContain(">Walk: 10 min uphill<")
		expect(html).toContain(">Sunset 18:52<")
		expect(html).not.toContain("Chip:")
	})

	it("titles a sourced image with its alt text when no title is given", () => {
		expect(
			render(
				"![The Lisbon waterfront at dusk](https://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](https://www.visitlisboa.com/en)",
			),
		).toContain(">The Lisbon waterfront at dusk</p>")
	})

	it("shows Save on a sourced image only with the save to Library callback", () => {
		const save = "Save the image"

		expect(
			render(SOURCED_DETAILS, { answerActions: ANSWER_ACTIONS }),
		).not.toContain(save)
		expect(
			render(SOURCED_DETAILS, {
				answerActions: {
					...ANSWER_ACTIONS,
					imageMenu: { onSaveToLibrary: () => undefined },
				},
			}),
		).toContain(save)
	})

	it("shows Save as pending only while the answer actions are saving that image", () => {
		const renderSaving = (savingSrc: string) =>
			render(SOURCED_DETAILS, {
				answerActions: {
					...ANSWER_ACTIONS,
					imageMenu: { onSaveToLibrary: () => undefined },
					isSavingImage: (src) => src === savingSrc,
				},
			})

		const saving = renderSaving("https://images.example.org/miradouro.jpg")
		expect(saving).toContain('aria-label="Saving the image…"')
		expect(saving).toContain('aria-disabled="true"')
		expect(saving).toContain(slot("sourced-image-saving"))

		const resting = renderSaving("https://images.example.org/other.jpg")
		expect(resting).toContain('aria-label="Save the image"')
		expect(resting).not.toContain("aria-disabled")
		expect(resting).not.toContain(slot("sourced-image-saving"))
	})

	it.each([
		[
			"the favicon is not https",
			SOURCED_DETAILS.replace(
				"https://www.visitlisboa.example/favicon",
				"http://www.visitlisboa.example/favicon",
			),
		],
		["a field is unknown", `${SOURCED_DETAILS}\nPrice: Free`],
		["the status is given twice", `${SOURCED_DETAILS}\nStatus: Closed`],
	])("keeps a sourced image as markdown when %s", (_, source) => {
		expect(render(source)).not.toContain(slot("sourced-image"))
	})

	it("draws the interactive title, caption, note, meter, breakdown and source in the declared currency", () => {
		const html = render(fenced("interactive", BUDGET))

		expect(html).toContain(">Offsite budget</h3>")
		expect(html).toContain(">Total for the trip</p>")
		expect(html).toMatch(/data-slot="interactive-view-total"[^>]*>€7,380</)
		expect(html).toContain("€615 a head")
		expect(html).toContain("€2,620 under the €10k budget")
		expect(html).toContain('style="width:73.8%"')
		expect(html).toMatch(/House, 3 nights<\/dt><dd[^>]*>€3,600</)
		expect(html).toMatch(/Dinners<\/dt><dd[^>]*>€1,620</)
		expect(html).toMatch(/Flights<\/dt><dd[^>]*>€2,160</)
		expect(html).toContain("Prices from the house listing and Taberna da Rua")
		expect(html).toMatch(/data-slot="interactive-view-slider-value"[^>]*>12</)
		expect(html).toMatch(/data-slot="interactive-view-slider-value"[^>]*>€180</)
	})

	it("writes the unit after each value of a block declaring one", () => {
		const html = render(
			fenced(
				"interactive",
				"result: legs * 2\nresult-label: Distance\nunit: km\n- name: legs\n  label: Legs\n  min: 1\n  max: 9\n  step: 1\n  default: 3\n  unit: legs",
			),
		)

		expect(html).toMatch(/data-slot="interactive-view-total"[^>]*>6 km</)
		expect(html).toMatch(
			/data-slot="interactive-view-slider-value"[^>]*>3 legs</,
		)
	})

	it("keeps result-label as the title and Result as the caption of a block without title", () => {
		const html = render(fenced("interactive", INTERACTIVE))

		expect(html).toContain(">Monthly payment in euros</h3>")
		expect(html).toContain(">Result</p>")
	})

	it("draws several collapsible sections as one card, each with its label, value and Markdown body", () => {
		const html = render(fenced("collapsible", SECTIONS))

		expect(html.match(/data-slot="collapsible-sections"/g)).toHaveLength(1)
		expect(html.match(/data-slot="collapsible-sections-head"/g)).toHaveLength(2)
		expect(html).toContain("The house")
		expect(html).toContain("€3,600 · 49%")
		expect(html).toContain("€2,160 · 29%")
		expect(html).not.toContain("title: Flights")
	})
})

describe("rich answer blocks written in GFM", () => {
	it.each([
		["NOTE", "note"],
		["TIP", "tip"],
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

	it.each([
		[
			"its text",
			"> [!NOTE] The table is held until Wednesday\n> Pay the deposit by then.",
		],
		[
			"its own paragraph",
			"> [!NOTE] The table is held until Wednesday\n>\n> Pay the deposit by then.",
		],
	])(
		"titles a callout with the text of its marker line, followed by %s",
		(_, source) => {
			const html = render(source)

			expect(html).toContain(">The table is held until Wednesday</p>")
			expect(html).toContain("Pay the deposit by then.")
			expect(html).not.toContain(">Note</p>")
		},
	)

	it("titles a callout without text after its marker by its tone", () => {
		expect(render("> [!WARNING]\n> This can't be undone.")).toContain(
			">Warning</p>",
		)
	})

	it("draws a callout whose text follows in its own paragraph", () => {
		const html = render("> [!NOTE]\n>\n> The export keeps.")

		expect(html).toContain('data-tone="note"')
		expect(html).toContain("The export keeps.")
	})

	it.each([
		["another alert kind", "> [!CAUTION]\n> Try it."],
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
	const SOURCED =
		"![The Lisbon waterfront at dusk](https://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](https://www.visitlisboa.com/en)"
	const PLAIN = "Here: ![A green sofa](https://images.example.org/sofa.jpg)"
	const LINKED =
		"[![A green sofa](https://images.example.org/sofa.jpg)](https://shop.example.org/sofa)"
	const opener = slot("markdown-image-open")

	it("wraps the picture of a sourced image in a button naming the image", () => {
		const html = render(SOURCED, { answerActions: ANSWER_ACTIONS })

		expect(html).toMatch(
			/<figure data-slot="sourced-image".*<button type="button" aria-label="The Lisbon waterfront at dusk" data-slot="sourced-image-open"[^>]*><img/,
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
	const IMAGE_SURFACES = [
		["a gallery", fenced("gallery", GALLERY)],
		["a plain image", PLAIN],
		["a sourced image", SOURCED],
		["an illustrated list", fenced("illustrated-list", ILLUSTRATED_LIST)],
		["a web page preview", fenced("web-page", WEB_PAGE)],
	]
	const menuTrigger = "-webkit-touch-callout:none"
	const IMAGE_MENU_ACTIONS: MarkdownAnswerActions = {
		...ANSWER_ACTIONS,
		imageMenu: { onCopyImage: () => undefined },
	}

	it.each(IMAGE_SURFACES)(
		"puts the image of %s under a context menu when the answer carries imageMenu",
		(_, source) => {
			expect(render(source, { answerActions: IMAGE_MENU_ACTIONS })).toContain(
				menuTrigger,
			)
		},
	)

	it.each(IMAGE_SURFACES)(
		"draws %s without a context menu when no answer actions are given",
		(_, source) => {
			expect(render(source)).not.toContain(menuTrigger)
		},
	)

	it("makes an image inside a link the menu trigger, never a button", () => {
		const html = render(LINKED, { answerActions: IMAGE_MENU_ACTIONS })

		expect(html).toMatch(
			/<a [^>]*>.*<img [^>]*data-slot="context-menu-trigger"[^>]*>.*<\/a>/,
		)
		expect(html).toMatch(/<img [^>]*data-typeset-image/)
		expect(html).not.toContain("<button")
	})
})

const STORED_GALLERY = `- image: images/sofa-green.jpg
  alt: Green velvet sofa
- image: images/sofa-grey.jpg
  alt: Grey linen sofa`

const pendingResolve = () => new Promise<string>(() => {})

const tilesResolvingIn = (html: string) =>
	html.split(slot("gallery-resolving")).length - 1

describe("gallery image resolver", () => {
	it("draws a gallery of stored paths as its source without a resolver", () => {
		const html = render(fenced("gallery", STORED_GALLERY))

		expect(html).toContain(slot("markdown-fence"))
		expect(html).not.toContain(slot("gallery"))
	})

	it("draws every tile resolving while the resolver runs", () => {
		const html = renderToStaticMarkup(
			<I18nProvider>
				<Markdown resolveImage={pendingResolve}>
					{fenced("gallery", STORED_GALLERY)}
				</Markdown>
			</I18nProvider>,
		)

		expect(tilesResolvingIn(html)).toBe(2)
		expect(html).not.toContain("<img")
	})

	it("lends its resolver to a Markdown mounted inside it", () => {
		const html = renderToStaticMarkup(
			<I18nProvider>
				<MarkdownImageResolverContext value={pendingResolve}>
					<Markdown>{fenced("gallery", STORED_GALLERY)}</Markdown>
				</MarkdownImageResolverContext>
			</I18nProvider>,
		)

		expect(tilesResolvingIn(html)).toBe(2)
	})
})
