// @vitest-environment happy-dom

import { cleanup, render as mount } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import { Markdown, type MarkdownProps } from "@workspace/ui/components/markdown"
import type { MarkdownBoardLinkRenderer } from "@workspace/ui/components/markdown/board-link"

const render = (props: MarkdownProps) =>
	renderToStaticMarkup(
		<I18nProvider>
			<Markdown {...props} />
		</I18nProvider>,
	)

const renderBoard: MarkdownBoardLinkRenderer = ({ name, words }) => (
	<article data-name={name}>{words}</article>
)

const renderNothing: MarkdownBoardLinkRenderer = () => null

const MINTED = "0b6f3c2e-8d41-4a7e-9c15-2f7d9e4a1b30"

const LABEL = /<label[^>]*>.*?<\/label>/s

const containing = (link: string) =>
	`- [ ] Review ${link} today\n- See ${link} first\n- ${link}\n\n| Board |\n| - |\n| ${link} |`

const CONTAINED = containing("[the plan](plan.canvas)")

const KEY_WARNING = /unique "key" prop/

const CARD_PLACES = [
	[
		"alone in a paragraph",
		"[Plan](plan.canvas)",
		"[One](one.canvas)\n\n[Two](two.canvas)",
	],
	[
		"inside a sentence",
		"See [the plan](plan.canvas) first.",
		"See [one](one.canvas) then [two](two.canvas).",
	],
	[
		"in a checklist item",
		"- [ ] Review [the plan](plan.canvas) today",
		"- [ ] Review [one](one.canvas) then [two](two.canvas)",
	],
	[
		"in a list item",
		"- See [the plan](plan.canvas) first",
		"- See [one](one.canvas) then [two](two.canvas)",
	],
	[
		"alone in a list item",
		"- [Plan](plan.canvas)",
		"- [One](one.canvas)\n- [Two](two.canvas)",
	],
	[
		"in a table cell",
		"| Board |\n| - |\n| [the plan](plan.canvas) |",
		"| Board |\n| - |\n| [one](one.canvas) then [two](two.canvas) |",
	],
]

const keyWarningsWhileMounting = (source: string, cardCount: number) => {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
	const { container } = mount(
		<I18nProvider>
			<Markdown renderBoardLink={renderBoard}>{source}</Markdown>
		</I18nProvider>,
	)
	expect(container.querySelectorAll("article")).toHaveLength(cardCount)
	return consoleError.mock.calls.filter((args) =>
		args.some((arg) => KEY_WARNING.test(String(arg))),
	)
}

describe("Markdown board links", () => {
	afterEach(() => {
		cleanup()
		vi.restoreAllMocks()
	})

	it.each(CARD_PLACES)("logs no key warning for one board %s", (_, oneLink) => {
		expect(keyWarningsWhileMounting(oneLink, 1)).toEqual([])
	})

	it.each(CARD_PLACES)(
		"logs no key warning for two boards %s",
		(_, _oneLink, twoLinks) => {
			expect(keyWarningsWhileMounting(twoLinks, 2)).toEqual([])
		},
	)

	it.each([
		["[Plan](plan.canvas)", "plan.canvas"],
		["[Plan](boards/Plan.CANVAS)", "boards/Plan.CANVAS"],
		["[Plan](<Launch week.canvas>)", "Launch week.canvas"],
		["[Plan](Launch%20week.canvas)", "Launch week.canvas"],
	])(
		"hands the slot the decoded name of %s in place of the paragraph",
		(source, name) => {
			const html = render({ children: source, renderBoardLink: renderBoard })
			expect(html).toContain(
				`"><article data-name="${name}">Plan</article></div>`,
			)
			expect(html).not.toContain("<p")
		},
	)

	it("keeps the words in the sentence and puts the board after the paragraph", () => {
		const html = render({
			children: "See [the plan](plan.canvas) before Friday.",
			renderBoardLink: renderBoard,
		})
		expect(html).toContain(
			'<p>See the plan before Friday.</p><article data-name="plan.canvas">the plan</article>',
		)
	})

	it("renders one board per link, in reading order", () => {
		const html = render({
			children:
				"[One](one.canvas) then [two](two.canvas).\n\n[Three](three.canvas)",
			renderBoardLink: renderBoard,
		})
		expect(html).toContain(
			'<p>One then two.</p><article data-name="one.canvas">One</article><article data-name="two.canvas">two</article>\n<article data-name="three.canvas">Three</article>',
		)
	})

	it("renders a board in place of a link in a tight list item", () => {
		expect(
			render({
				children: "- [Plan](plan.canvas)",
				renderBoardLink: renderBoard,
			}),
		).toContain('<li><article data-name="plan.canvas">Plan</article></li>')
	})

	it("renders a lone board in place of the link, before a nested list", () => {
		expect(
			render({
				children: "- [Plan](plan.canvas)\n  - Sketch",
				renderBoardLink: renderBoard,
			}),
		).toContain(
			'<li><article data-name="plan.canvas">Plan</article>\n<ul>\n<li>Sketch</li>',
		)
	})

	it("keeps the words in the checklist label and puts the board after it", () => {
		const html = render({
			children: "- [ ] Review [the plan](plan.canvas) today\n  - [ ] Sketch",
			renderBoardLink: renderBoard,
		})
		const [label] = html.match(LABEL) ?? []
		expect(label).toContain("Review the plan today")
		expect(label).not.toContain("<article")
		expect(html).toContain(
			'</label><article data-name="plan.canvas">the plan</article><ul',
		)
		expect(html).not.toContain("<a ")
	})

	it("keeps the words in a loose checklist label and puts the board after its paragraph", () => {
		const html = render({
			children: "- [ ] Review [the plan](plan.canvas) today\n\n- [ ] Sketch",
			renderBoardLink: renderBoard,
		})
		const [label] = html.match(LABEL) ?? []
		expect(label).toContain("Review the plan today")
		expect(label).not.toContain("<article")
		expect(html).toContain(
			'</label></p><article data-name="plan.canvas">the plan</article>\n</li>',
		)
		expect(html).not.toContain("<a ")
	})

	it("keeps the words in a list sentence and puts the board after them", () => {
		expect(
			render({
				children: "- See [the plan](plan.canvas) first\n  - Sketch",
				renderBoardLink: renderBoard,
			}),
		).toContain(
			'<li>See the plan first\n<article data-name="plan.canvas">the plan</article><ul>\n<li>Sketch</li>',
		)
	})

	it("keeps the words in a table cell and puts the boards after the table, in reading order", () => {
		const html = render({
			children:
				"| Board | Owner |\n| - | - |\n| [One](one.canvas) | Ana |\n| Two | [two](two.canvas) |",
			renderBoardLink: renderBoard,
		})
		expect(html).toContain("<td>One</td><td>Ana</td>")
		expect(html).toContain("<td>Two</td><td>two</td>")
		expect(html).toContain(
			'</div><article data-name="one.canvas">One</article><article data-name="two.canvas">two</article></div>',
		)
		expect(html.indexOf("<article")).toBeGreaterThan(html.indexOf("</table>"))
	})

	it("hands the slot a nested board link from its own item only", () => {
		const renderBoardLink = vi.fn(renderBoard)
		const html = render({
			children:
				"- See [one](one.canvas) first\n  - [ ] Then [two](two.canvas) here\n    - Last [three](three.canvas) one",
			renderBoardLink,
		})
		expect(renderBoardLink.mock.calls).toEqual([
			[{ name: "one.canvas", words: "one" }],
			[{ name: "two.canvas", words: "two" }],
			[{ name: "three.canvas", words: "three" }],
		])
		expect(html).toContain(
			'</label><article data-name="two.canvas">two</article><ul>\n<li>Last three one<article data-name="three.canvas">three</article></li>',
		)
	})

	it.each([
		["without a slot", undefined, false],
		["when the slot returns null", renderNothing, false],
		["while static", renderBoard, true],
	])("renders the link as today %s", (_, renderBoardLink, isStatic) => {
		const source = `See [the plan](plan.canvas).\n\n[Plan](plan.canvas)\n\n${CONTAINED}`
		expect(render({ children: source, renderBoardLink, isStatic })).toBe(
			render({ children: source, isStatic }),
		)
	})

	it.each([
		"[Docs](https://example.org/plan.canvas)",
		"[Top](#plan.canvas)",
		"[Plan](//example.org/plan.canvas)",
		`[Board](</Users/ana/attachments/conversation-7/${MINTED}.canvas>)`,
		"[Notes](plan.md)",
	])("leaves %s rendering as today", (link) => {
		const source = `${link}\n\n${containing(link)}`
		expect(
			render({
				children: source,
				renderBoardLink: renderBoard,
				onOpenAttachment: () => {},
			}),
		).toBe(render({ children: source, onOpenAttachment: () => {} }))
	})

	it.each([
		[
			"a heading",
			"# See [the plan](plan.canvas)\n\n### [Plan](plan.canvas)\n\n- ## See [the plan](plan.canvas)",
			"the plan",
		],
		[
			"an answer-block option label",
			'```options\nquestion: Which board?\n- title: "[Plan](plan.canvas)"\n  text: "[Plan](plan.canvas)"\n```',
			"[Plan](plan.canvas)",
		],
		[
			"an illustrated-list description",
			"```illustrated-list\n- title: Lisbon\n  image: https://images.example.org/lisbon.jpg\n  text: See [the plan](plan.canvas) first.\n```",
			"See the plan first.",
		],
	])("never hands the slot a link inside %s", (_, source, words) => {
		const renderBoardLink = vi.fn(renderBoard)
		const html = render({ children: source, renderBoardLink })
		expect(renderBoardLink).not.toHaveBeenCalled()
		expect(html).toContain(words)
		expect(html).toBe(render({ children: source }))
	})
})
