import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { AnswerStack } from "@workspace/ui/components/answer-stack"
import {
	BOARD_CARD_TITLE,
	PLANNING_BOARD_SNAPSHOT,
} from "@workspace/ui/components/board/board.fixtures"
import { BoardCard } from "@workspace/ui/components/board/board-card"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"

const ANSWER = "I put the launch week on a board."
const GAP_UNDER_TEXT = 12

const meta = preview.meta({
	title: "Conversation/Message/AnswerStack",
	component: AnswerStack,
	parameters: {
		docs: {
			description: {
				component:
					"The column of an agent answer: the text, then what the answer posted under it, a board card for one, 12px apart.",
			},
		},
	},
})

export const WithBoardCard = meta.story({
	render: () => (
		<MessageBubble className="w-170" variant="soft">
			<MessageBubbleContent>
				<AnswerStack>
					<p>{ANSWER}</p>
					<BoardCard
						editedLabel="edited just now"
						onOpen={fn()}
						pointers={[]}
						summary={{
							status: "loaded",
							itemCount: 14,
							snapshot: PLANNING_BOARD_SNAPSHOT,
						}}
						title={BOARD_CARD_TITLE}
					/>
				</AnswerStack>
			</MessageBubbleContent>
		</MessageBubble>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An answer with a board card under its text, as artboard 2a draws it. Check the 12px between the bottom of the text and the top of the card.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const text = within(canvasElement).getByText(ANSWER)
		const card = slotIn(canvasElement, "board-card")
		await expect(
			card.getBoundingClientRect().top - text.getBoundingClientRect().bottom,
		).toBe(GAP_UNDER_TEXT)
	},
})
