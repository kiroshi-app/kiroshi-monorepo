import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { lineHeightOf } from "@workspace/storybook/story-utils"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import {
	SelectionQuote,
	type SelectionQuoteProps,
} from "@workspace/ui/components/selection-quote"

const LONG_QUOTE =
	"The sync finished, but two devices needed a full pass instead of the usual delta. The Da Lat laptop had been offline since Monday, and the studio tablet came back with a clock drift of about four minutes, which is enough to make the queue reorder itself."

const InInput = (props: SelectionQuoteProps) => (
	<div className="mx-auto w-full max-w-2xl px-6">
		<PromptInput
			aria-label="Message"
			attachments={<SelectionQuote {...props} />}
		/>
	</div>
)

const quotedTextOf = (canvasElement: HTMLElement) => {
	const text = canvasElement.querySelector<HTMLElement>(
		'[data-slot="selection-quote-text"]',
	)
	if (!text) throw new Error("The card drew no quoted text")
	return text
}

const meta = preview.meta({
	title: "Conversation/Prompt/SelectionQuote",
	component: SelectionQuote,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A selection quoted from an agent answer, waiting in the input above the message being written. It names the agent and clamps the quote to two lines; the cross removes it. `QuotableAnswer` is where the selection comes from.",
			},
		},
	},
	args: {
		agentName: "Atlas",
		text: "the studio tablet came back with a clock drift of about four minutes",
		onRemove: fn(),
	},
	render: (args) => <InInput {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story: "A one-line quote. The cross removes it through `onRemove`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Selection · Atlas")).toBeVisible()
		await expect(
			canvas.getByRole("group", { name: "Selection quoted from Atlas" }),
		).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Remove the selection" }),
		)
		await expect(args.onRemove).toHaveBeenCalledOnce()
	},
})

export const LongContent = meta.story({
	args: { text: LONG_QUOTE },
	parameters: {
		docs: {
			description: {
				story:
					"A quote far longer than the card: it stops at two lines with an ellipsis, and the card keeps its height.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const text = quotedTextOf(canvasElement)

		await expect(text.getBoundingClientRect().height).toBeLessThanOrEqual(
			lineHeightOf(text) * 2,
		)
		await expect(text.scrollHeight).toBeGreaterThan(text.clientHeight)
	},
})

export const LongContentDark = LongContent.extend({
	globals: { theme: "dark" },
})

export const NarrowLongContent = meta.story({
	tags: ["test-only"],
	args: {
		agentName: "Atlas, release manager for the whole desktop platform",
		text: `${LONG_QUOTE} https://example.com/sync/logs/da-lat-laptop/2026-11-02/full-pass`,
	},
	render: (args) => (
		<div style={{ width: 320 }}>
			<SelectionQuote {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const card = canvasElement.querySelector<HTMLElement>(
			'[data-slot="selection-quote"]',
		)
		if (!card) throw new Error("No selection card drawn")

		await expect(card.scrollWidth).toBe(card.clientWidth)
		const text = quotedTextOf(canvasElement)
		await expect(text.scrollWidth).toBe(text.clientWidth)
	},
})
