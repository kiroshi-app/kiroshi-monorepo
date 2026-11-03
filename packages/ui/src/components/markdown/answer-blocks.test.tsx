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

const slot = (name: string) => `data-slot="${name}"`

describe("rich answer blocks", () => {
	it.each([
		["options", OPTIONS, "options-card"],
		["illustrated-list", ILLUSTRATED_LIST, "illustrated-list"],
		["gallery", GALLERY, "gallery"],
		["interactive", INTERACTIVE, "interactive-view"],
		["collapsible", COLLAPSIBLE, "collapsible-sections"],
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
	])("draws the source as a plain fence when %s", (_, label, body) => {
		const html = render(fenced(label, body))

		expect(html).toContain(slot("markdown-fence"))
		expect(html).not.toContain(slot("markdown-answer-block"))
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
