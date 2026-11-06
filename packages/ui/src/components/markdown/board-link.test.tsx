import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

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

describe("Markdown board links", () => {
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

	it.each([
		["without a slot", undefined, false],
		["when the slot returns null", renderNothing, false],
		["while static", renderBoard, true],
	])("renders the link as today %s", (_, renderBoardLink, isStatic) => {
		const source = "See [the plan](plan.canvas).\n\n[Plan](plan.canvas)"
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
	])("leaves %s rendering as today", (source) => {
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
			"# See [the plan](plan.canvas)\n\n### [Plan](plan.canvas)",
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
