import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import { PromptQueue } from "@workspace/ui/components/prompt-queue"

const meta = preview.meta({
	title: "Conversation/Prompt/PromptQueue",
	component: PromptQueue,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The tray of messages you sent while an agent still answers, laid above the prompt and 20 narrower on each side. The header says how many wait and for whom, each row names you, the message on one line, and the first says Next, after the agent in the Space colour.",
			},
		},
	},
	args: {
		agentName: "Atlas",
		readerName: "Sam",
		items: [{ id: "split", text: "Can you split it by country?" }],
	},
	decorators: [
		(Story) => (
			<div className="w-180">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while one message waits on Atlas. Check the header reads Queued · 1 · goes once Atlas’s answer is done and the row is 40 high.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByText("Queued · 1 · goes once Atlas’s answer is done"),
		).toBeVisible()
		const [row] = slotsIn(canvasElement, "prompt-queue-item")
		await expect(row.getBoundingClientRect().height).toBe(40)
	},
})
