import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Markdown } from "@workspace/ui/components/markdown"
import { MarkdownTaskCheckbox } from "@workspace/ui/components/markdown/task-list"

const TASKS = [
	"- [x] Read the nest",
	"- [x] Summarise the occupants",
	"- [ ] Archive the record",
	"- [ ] Notify the owner",
].join("\n")

const BOX_SIZE = 16

const labelOf = (box: HTMLElement) => {
	const item = box.closest("li")
	if (!item) throw new Error("The box sits in no list item")
	return getComputedStyle(item)
}

const meta = preview.meta({
	title: "Conversation/Markdown/MarkdownTaskCheckbox",
	component: MarkdownTaskCheckbox,
	parameters: {
		docs: {
			description: {
				component:
					"The box GFM emits for a task list item, drawn as the 16 box of the to-do artboard: radius 5, a 1.5 border at foreground 30 percent on the card surface, filled with the Space colour and a 12 check once ticked. A click ticks or unticks it in the message alone: nothing is written back to the message, so a reload shows the agent's state again. A ticked item strikes and mutes its label. The box names its own state, Done or To do, and the item text stays a sibling.",
			},
		},
	},
	render: () => (
		<div className="w-[44rem] max-w-full">
			<Markdown>{TASKS}</Markdown>
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A checklist as an agent reports progress, both states in one list. Check that the list marker is gone, that each box sits centred on the first line of its label, 10 before it, and that the ticked labels are struck and muted in both themes.",
			},
		},
	},
	play: async ({ canvas }) => {
		const done = canvas.getAllByRole("checkbox", { name: "Done" })
		const [todo] = canvas.getAllByRole("checkbox", { name: "To do" })
		if (!todo) throw new Error("No box left to do")

		await expect(done).toHaveLength(2)
		await expect(todo.getBoundingClientRect().width).toBe(BOX_SIZE)
		await expect(todo).toBeEnabled()
		const item = todo.closest("li")
		if (!item) throw new Error("The box sits in no list item")
		await expect(
			todo.getBoundingClientRect().top - item.getBoundingClientRect().top,
		).toBeCloseTo(
			(Number.parseFloat(labelOf(todo).lineHeight) - BOX_SIZE) / 2,
			0,
		)
		for (const box of done) {
			await expect(labelOf(box).textDecorationLine).toBe("line-through")
		}
		await expect(labelOf(todo).textDecorationLine).toBe("none")
	},
})

export const TicksAndUnticksByClick = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader ticks a box, then unticks it. Check that the box fills with the Space colour, that the label strikes and mutes, and that both come back on the second click.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const [box] = canvas.getAllByRole("checkbox", { name: "To do" })
		if (!box) throw new Error("No box left to do")

		await userEvent.click(box)
		await expect(box).toBeChecked()
		await expect(box).toHaveAccessibleName("Done")
		await expect(labelOf(box).textDecorationLine).toBe("line-through")

		await userEvent.click(box)
		await expect(box).not.toBeChecked()
		await expect(box).toHaveAccessibleName("To do")
		await expect(labelOf(box).textDecorationLine).toBe("none")
	},
})

export const TicksFromTheKeyboard = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The first box reached with Tab and unticked with Space. Check that the browser focus ring shows around it.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const [box] = canvas.getAllByRole("checkbox", { name: "Done" })

		await userEvent.tab()
		await expect(box).toHaveFocus()
		await userEvent.keyboard(" ")
		await expect(box).toHaveAccessibleName("To do")
	},
})
