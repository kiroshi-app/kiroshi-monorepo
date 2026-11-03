import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import { MessageActions } from "@workspace/ui/components/message-actions"
import {
	MessageBubble,
	type MessageBubbleAlign,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import {
	type MessageSide,
	MessageSideContext,
} from "@workspace/ui/components/message-side-context"

const ANSWER =
	"Two packages: the design system holds every visual, the shell composes them."

type TurnProps = {
	align?: MessageBubbleAlign
}

const Turn = ({ align }: TurnProps) => (
	<MessageBubble align={align} variant="soft">
		<MessageActions>
			<MessageBubbleContent>{ANSWER}</MessageBubbleContent>
		</MessageActions>
	</MessageBubble>
)

const SIDES: MessageSide[] = ["start", "end"]

const meta = preview.meta({
	title: "Conversation/Message/MessageSideContext",
	component: MessageSideContext.Provider,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Which side of the transcript a turn belongs to, published once and read by everything inside it. `Message` provides it — `end` for the reader, `start` for the companion — so `MessageBubble` knows which corner to grow from and `MessageActions` knows which way to lay its row, and no caller repeats the side on every child. It is the seam that keeps a turn's parts consistent: change the side in one place and the bubble, its tail and its actions all follow. Consumers fall back to `start` when no provider stands above them, so a bubble rendered on its own still renders.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-full max-w-md">
				<Story />
			</div>
		),
	],
	args: { value: "start" as MessageSide },
	argTypes: {
		value: { control: "inline-radio", options: SIDES },
	},
	render: ({ value }) => (
		<MessageSideContext.Provider value={value}>
			<Turn />
		</MessageSideContext.Provider>
	),
})

export const BotSide = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"`start`, what `Message` publishes for an agent turn. The bubble grows from its bottom-left and the actions sit after it, so the copy button lands on the right of the answer. Check that the row is only as wide as the bubble — the actions belong to the turn, not to the transcript's edge. `packages/ui/src/components/message.tsx:50` publishes it for every companion row.",
			},
		},
	},
})

export const ReaderSide = meta.story({
	args: { value: "end" },
	parameters: {
		docs: {
			description: {
				story:
					"`end`, what `Message` publishes for the reader's own turn. The same markup flips: the bubble grows from its bottom-right and the action row reverses, putting the buttons on the left of the bubble so they stay inside the transcript rather than off its edge. Check that no child received an alignment prop to make this happen. `packages/ui/src/components/message.tsx:50` publishes it for every reader row.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [bubble] = slotsIn(canvasElement, "message-bubble")

		await expect(bubble).toHaveAttribute("data-align", "end")
	},
})

export const WithoutProvider = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The fallback: a turn rendered with no provider above it, as happens in a preview, a story, or a one-off notice outside the transcript. Both consumers read `undefined` and settle on `start`, so nothing renders sideways and nothing throws. Reach for this to check a bubble in isolation. `packages/ui/src/components/mission-event-row.tsx:187` mounts a bubble with no `Message` above it, and this is what it reads.",
			},
		},
	},
	render: () => <Turn />,
	play: async ({ canvasElement }) => {
		const [bubble] = slotsIn(canvasElement, "message-bubble")

		await expect(bubble).toHaveAttribute("data-align", "start")
	},
})

export const OverriddenByProp = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The escape hatch. `MessageBubble` takes the context only when its own `align` is absent, so a bubble that must lean the other way inside a reader's turn — a quoted answer, a system aside — says so explicitly and wins. The action row still follows the context, which is the point: the override is local to the bubble and does not rewrite the turn. No caller overrides the side today — `packages/ui/src/components/turn.tsx:340` and `packages/ui/src/components/turn.tsx:492` both let the context decide — so this one holds the precedence rather than a state a reader meets.",
			},
		},
	},
	render: () => (
		<MessageSideContext.Provider value="end">
			<Turn align="start" />
		</MessageSideContext.Provider>
	),
	play: async ({ canvasElement }) => {
		const [bubble] = slotsIn(canvasElement, "message-bubble")

		await expect(bubble).toHaveAttribute("data-align", "start")
	},
})
