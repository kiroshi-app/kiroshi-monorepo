import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { BOT_MEMORY } from "@workspace/ui/components/bot-settings-dialog/memory.fixtures"
import { MemoryPanel } from "@workspace/ui/components/bot-settings-dialog/memory-panel"

const meta = preview.meta({
	title: "Settings/Bot/MemoryPanel",
	component: MemoryPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"What a companion has written down for itself, opened for the person it wrote it about. It sits under the instructions because the two read as one page and are told apart by their author: the instructions are what the user asks of the companion, the memory is what the companion noticed on its own. It is a draft rather than a live field — the companion keeps writing while it is open, so nothing is reported until the reader saves, and saving stays out of reach while the text is the one they were handed. Clearing is the other way out and asks its question first: the memory is written by a hand that is not in the room, so it is never wiped on a single press.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex w-[36rem] flex-col gap-4 p-5">
				<Story />
			</div>
		),
	],
	args: {
		memory: BOT_MEMORY,
		onSave: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A companion that has been working long enough to have noticed things. Check that the memory arrives as editable text under its own label rather than as a read-only block, and that saving is disabled until the reader has actually changed something — reopening the dialog and pressing Save must not write a new version of the same text. One keystroke is enough to arm it, and what it reports is the whole memory, not the edit.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const memory = canvas.getByLabelText("Memory")
		await expect(memory).toHaveValue(BOT_MEMORY)

		const save = canvas.getByRole("button", { name: "Save memory" })
		await expect(save).toBeDisabled()

		await userEvent.type(memory, " Always.")
		await expect(save).toBeEnabled()

		await userEvent.click(save)
		await expect(args.onSave).toHaveBeenCalledWith(`${BOT_MEMORY} Always.`)
	},
})

export const Empty = meta.story({
	args: { memory: "" },
	parameters: {
		docs: {
			description: {
				story:
					"A companion that has not written anything down yet. One sentence in place of the field: there is nothing to edit and nothing to clear, and offering an empty box would read as an invitation to write the companion's memory for it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("This agent has no memories yet."),
		).toBeVisible()
		await expect(canvas.queryByLabelText("Memory")).not.toBeInTheDocument()
		await expect(
			canvas.queryByRole("button", { name: "Save memory" }),
		).not.toBeInTheDocument()
	},
})

export const Clearing = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The way back to an empty memory. Check that the press alone reports nothing: the question says what is lost and that the companion starts learning again, and only the second press empties it. Cancelling leaves the memory exactly as it was.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Clear" }))

		const question = await screen.findByRole("alertdialog")
		await expect(question).toHaveTextContent("Clear this agent’s memory?")
		await expect(args.onSave).not.toHaveBeenCalled()

		await userEvent.click(
			within(question).getByRole("button", { name: "Clear the memory" }),
		)

		await expect(args.onSave).toHaveBeenCalledWith("")
	},
})
