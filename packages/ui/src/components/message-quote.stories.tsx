import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { lineHeightOf } from "@workspace/storybook/story-utils"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import {
	MessageQuote,
	type MessageQuoteProps,
} from "@workspace/ui/components/message-quote"

const AUTHOR = "Ada Martin"

const EXCERPT =
	"The whole migration runs inside one transaction, so a failure rolls back every statement including the drop."

const SHORT_EXCERPT = "Is any of that destructive?"

const ANSWER =
	"Only the memberships change, and the drop is the last statement."

const QUESTION = "Then what happens to the invites table?"

interface QuotedBubbleProps extends MessageQuoteProps {
	variant: "solid" | "soft"
	text: string
}

const QuotedBubble = ({ variant, text, ...quote }: QuotedBubbleProps) => (
	<MessageBubble variant={variant}>
		<MessageQuote {...quote}>
			<MessageBubbleContent>{text}</MessageBubbleContent>
		</MessageQuote>
	</MessageBubble>
)

const meta = preview.meta({
	title: "Conversation/Message/MessageQuote",
	component: MessageQuote,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The frame a message wears when it answers another one: the quoted author with the first line of what they wrote, above whatever the frame is given to hold — a bubble in the transcript, the composer in `AI/PromptReply`. It takes the fill of the side it quotes, not its own: `from` is who wrote the quoted message, so answering the reader wears the reader's fill and answering a companion wears the companion's. A tenth of the background is laid over that fill, which is what keeps the quote readable as a separate surface from the bubble sitting in it even when both sides are the same. Resolving an id to an author and an excerpt is the screen's business, never this frame's, and pressing the quote reports a jump the host performs. The excerpt is always one line: a longer one is clipped rather than allowed to grow what it wraps. `trailing` takes one control beside the quote — the composer puts its dismiss there. Given no quote it keeps the same two elements around what it holds and drops every mark of its own, so a host that wraps something long-lived can leave the frame mounted and let only the quote come and go.",
			},
		},
	},
	args: {
		author: AUTHOR,
		excerpt: EXCERPT,
		from: "user" as const,
		onJump: fn(),
	},
	decorators: [
		(Story) => (
			<div className="w-[28rem] max-w-full">
				<Story />
			</div>
		),
	],
	render: (args) => <QuotedBubble {...args} variant="soft" text={ANSWER} />,
})

export const Default = meta.story({
	args: { excerpt: SHORT_EXCERPT },
	parameters: {
		docs: {
			description: {
				story:
					"The nominal frame: the companion answering the reader, so the quote wears the reader's fill while the bubble under it keeps the companion's. The bubble always takes every pixel the frame offers — the frame is what the transcript caps, never the bubble inside it. Check that the quote reads above the bubble and inside the frame, that the reply glyph marks it as an answer, and that pressing the quote reports a jump — the frame never scrolls anything itself. It is a real button, so it is reachable by Tab and takes Enter and Space. `packages/ui/src/components/turn.tsx:273` wraps the body of a turn in it whenever the row it renders replies to another message.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const quote = canvas.getByRole("button")
		const frame = canvas.getByRole("group")
		const answer = canvas.getByText(ANSWER)

		await expect(quote).toHaveAccessibleName(`${AUTHOR} ${SHORT_EXCERPT}`)
		await expect(quote.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			answer.getBoundingClientRect().top,
		)
		const bubble = answer.closest('[data-slot="message-bubble-content"]')
		const filled =
			frame.getBoundingClientRect().width -
			(bubble?.getBoundingClientRect().width ?? 0)

		await expect(filled).toBeLessThanOrEqual(8)

		await userEvent.click(quote)
		await expect(args.onJump).toHaveBeenCalledTimes(1)
	},
})

export const LongContent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"An excerpt far past the width it is given — the common case, since a quoted message is a whole message. Check that it stays on one line and is clipped at the width of the frame instead of wrapping or widening it: the quote must cost the same height whatever it holds. The excerpt is the one `apps/app/src/lib/chat/screen-model.ts:184` trims off the quoted message and hands to `packages/ui/src/components/turn.tsx:273`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const excerpt = canvas.getByText(EXCERPT)

		await expect(excerpt.scrollWidth).toBeGreaterThan(excerpt.clientWidth)
		await expect(excerpt.getBoundingClientRect().height).toBeLessThanOrEqual(
			lineHeightOf(excerpt),
		)
	},
})

export const Tones = meta.story({
	render: (args) => (
		<div className="flex flex-col gap-4">
			<QuotedBubble
				{...args}
				from="assistant"
				author="Skippy"
				variant="solid"
				text={QUESTION}
			/>
			<QuotedBubble {...args} from="user" variant="soft" text={ANSWER} />
		</div>
	),
	args: { excerpt: SHORT_EXCERPT },
	parameters: {
		docs: {
			description: {
				story:
					"The two fills, one per side, each shown under the bubble it would carry. The reader quoting a companion takes the companion's fill under the reader's own bubble; the companion quoting the reader takes the reader's fill under the companion's bubble. Check that the quote never matches the bubble it holds, that the background wash keeps it a step apart from the bubble it holds, and that the author and the excerpt are told apart by weight rather than by a dimmed colour — the excerpt keeps the full foreground of the fill it sits on, which is what holds it above the contrast floor on the reader's accent. Both fills come from `packages/ui/src/components/turn.tsx:273`, which passes the role of the message being quoted.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [fromBot, fromReader] = canvas.getAllByRole("group")

		await expect(fromBot).toHaveAttribute("data-from", "assistant")
		await expect(fromReader).toHaveAttribute("data-from", "user")
	},
})

export const Sizes = meta.story({
	tags: ["test-only"],
	render: (args) => (
		<div className="flex flex-col gap-4">
			<QuotedBubble {...args} variant="soft" text={ANSWER} />
			<QuotedBubble {...args} size="md" variant="soft" text={ANSWER} />
		</div>
	),
	args: { excerpt: SHORT_EXCERPT },
	parameters: {
		docs: {
			description: {
				story:
					"The two gutters, compact above and comfortable below. Check that the glyph grows from 14px loose in the row to 16px inside a 32px box, that the quote moves right with it, and that the air above the quote and under it opens from 4px to 8px — the second is what lets the frame sit around a composer without either row looking inset from the other. The quote costs two clipped lines in both. No screen shows the two gutters together: `packages/ui/src/components/turn.tsx:273` takes the compact one inside a bubble and `packages/ui/src/components/prompt-reply.tsx:33` the comfortable one around the composer, so this one is here to hold the two apart.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [compact, comfortable] = canvas.getAllByRole("group")

		await expect(compact).toHaveAttribute("data-size", "sm")
		await expect(comfortable).toHaveAttribute("data-size", "md")
		await expect(
			comfortable.querySelector("span")?.getBoundingClientRect().width,
		).toBe(32)
	},
})
