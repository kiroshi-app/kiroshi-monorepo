import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	realPointer,
	slotsIn,
} from "@workspace/storybook/story-utils"
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

const TWO_QUEUED = {
	items: [
		{ id: "city", text: "And by city for France?" },
		{ id: "top", text: "Top three only." },
	],
	onSendNow: fn(),
	onRemove: fn(),
}

const hoverSecondRow = async (canvasElement: HTMLElement) => {
	if (!isInBrowserRunner()) return
	const [, second] = slotsIn(canvasElement, "prompt-queue-item")
	await (await realPointer()).hover(second)
	await expect(
		within(second).getByRole("button", { name: "Send now" }),
	).toBeVisible()
}

export const RowHovered = meta.story({
	args: TWO_QUEUED,
	parameters: {
		docs: {
			description: {
				story:
					"Queue 1 in the light theme: the pointer rests on the second row, which lifts to the prompt surface and shows Send now and remove. Check the queued text keeps its muted colour and still reads at AA on the lifted row.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await hoverSecondRow(canvasElement)
	},
})

export const RowHoveredDark = meta.story({
	args: TWO_QUEUED,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Queue 1 as the artboard draws it: the hovered row takes white at 4% over the tray. Check the queued text reads at AA on that fill.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await hoverSecondRow(canvasElement)
	},
})
