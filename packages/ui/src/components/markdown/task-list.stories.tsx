import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { Markdown } from "@workspace/ui/components/markdown"
import { MarkdownTaskCheckbox } from "@workspace/ui/components/markdown/task-list"

const TASKS = [
	"- [x] Read the nest",
	"- [x] Summarise the occupants",
	"- [ ] Archive the record",
	"- [ ] Notify the owner",
].join("\n")

const NESTED_TASKS = [
	"- [x] Book the venue",
	"  - [ ] Confirm the caterer",
	"- [ ] Send the invites",
	"  - [x] Draft the guest list",
].join("\n")

const LOOSE_TASKS = [
	"Here is where the move stands.",
	"",
	"- [x] Read the nest",
	"",
	"- [ ] Archive the record",
	"",
	"  Keep the occupants list with it, the owner asks for that one first.",
	"",
	"- [ ] Notify the owner",
].join("\n")

const BOX_SIZE = 16

const LABEL_GAP = 10

const ROW_GAP = 6

const LEAD_IN_GAP = 8

const labelElementOf = (box: HTMLElement) => {
	const label = box.closest<HTMLElement>('[data-slot="markdown-task-label"]')
	if (!label) throw new Error("The box sits in no task label")
	return label
}

const gapToLabelOf = (box: HTMLElement) => {
	const words = box.closest("label")?.nextSibling
	if (!words || words.nodeType !== Node.TEXT_NODE)
		throw new Error("No words follow the box")
	const firstLetterAt = words.textContent?.search(/\S/) ?? -1
	if (firstLetterAt === -1) throw new Error("The words after the box are blank")
	const firstLetter = document.createRange()
	firstLetter.setStart(words, firstLetterAt)
	firstLetter.setEnd(words, firstLetterAt + 1)
	return (
		firstLetter.getBoundingClientRect().left - box.getBoundingClientRect().right
	)
}

const labelOf = (box: HTMLElement) => getComputedStyle(labelElementOf(box))

const isStruckFromAnyAncestor = (element: HTMLElement) => {
	for (
		let current: HTMLElement | null = element;
		current && current.dataset.slot !== "markdown";
		current = current.parentElement
	) {
		if (getComputedStyle(current).textDecorationLine.includes("line-through"))
			return true
	}
	return false
}

const meta = preview.meta({
	title: "Conversation/Markdown/MarkdownTaskCheckbox",
	component: MarkdownTaskCheckbox,
	parameters: {
		docs: {
			description: {
				component:
					"The box GFM emits for a task list item, drawn as the 16 box of the to-do artboard: radius 5, a 1.5 border at foreground 30 percent on the card surface, filled with the Space colour and a 12 check once ticked. A click ticks or unticks it in the message alone: nothing is written back to the message, so a reload shows the agent's state again. A ticked item strikes and mutes its own label alone, never the sub-tasks nested under it. The box names its own state, Done or To do, and the item text stays a sibling.",
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
		await expect(gapToLabelOf(todo)).toBeCloseTo(LABEL_GAP, 0)
	},
})

export const LooseChecklist = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A checklist written with blank lines between the items under a lead-in sentence, so each label is a paragraph, one item carrying a second paragraph. Check that the first row sits 8 below the lead-in, that the rows sit 6 apart as in the tight checklist, that each box sits 10 before its label, that the ticked label is struck and muted, and that the second paragraph keeps its own start.",
			},
		},
	},
	render: () => (
		<div className="w-[44rem] max-w-full">
			<Markdown>{LOOSE_TASKS}</Markdown>
		</div>
	),
	play: async ({ canvas }) => {
		const boxes = canvas.getAllByRole("checkbox")

		await expect(boxes).toHaveLength(3)
		for (const box of boxes) {
			await expect(gapToLabelOf(box)).toBeCloseTo(LABEL_GAP, 0)
		}
		const [first, second] = boxes
		const firstRow = first?.closest("p")
		if (!first || !second || !firstRow)
			throw new Error("The checklist draws no two rows")
		const leadIn = canvas.getByText(/^Here is where the move stands/)
		await expect(
			firstRow.getBoundingClientRect().top -
				leadIn.getBoundingClientRect().bottom,
		).toBeCloseTo(LEAD_IN_GAP, 0)
		await expect(
			second.getBoundingClientRect().top - first.getBoundingClientRect().top,
		).toBeCloseTo(
			Number.parseFloat(getComputedStyle(firstRow).lineHeight) + ROW_GAP,
			0,
		)
		const done = canvas.getByRole("checkbox", { name: "Done" }).closest("p")
		if (!done) throw new Error("The ticked box sits in no paragraph")
		await expect(getComputedStyle(done).textDecorationLine).toBe("line-through")
		const note = canvas.getByText(/^Keep the occupants list/)
		await expect(note.tagName).toBe("P")
		await expect(note.querySelector("label")).toBeNull()
	},
})

export const LooseChecklistDark = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The loose checklist in the dark theme. Check that each box sits 10 before its label and that the ticked label is struck and muted.",
			},
		},
	},
	render: LooseChecklist.input.render,
	play: LooseChecklist.input.play,
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

export const NestedChecklist = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Sub-tasks under a ticked and an unticked parent. Check that Book the venue is struck and muted while Confirm the caterer under it stays in the foreground, and that Draft the guest list is struck and muted while Send the invites above it is not.",
			},
		},
	},
	render: () => (
		<div className="w-[44rem] max-w-full">
			<Markdown>{NESTED_TASKS}</Markdown>
		</div>
	),
	play: async ({ canvas, canvasElement }) => {
		const [bookVenue, draftList] = canvas.getAllByRole("checkbox", {
			name: "Done",
		})
		const [confirmCaterer, sendInvites] = canvas.getAllByRole("checkbox", {
			name: "To do",
		})
		if (!bookVenue || !draftList || !confirmCaterer || !sendInvites)
			throw new Error("Four boxes expected")
		const foreground = getComputedStyle(slotIn(canvasElement, "markdown")).color

		await expect(labelElementOf(confirmCaterer)).toHaveTextContent(
			"Confirm the caterer",
		)
		await expect(isStruckFromAnyAncestor(labelElementOf(confirmCaterer))).toBe(
			false,
		)
		await expect(labelOf(confirmCaterer).color).toBe(foreground)
		await expect(labelOf(bookVenue).textDecorationLine).toBe("line-through")
		await expect(labelOf(bookVenue).color).not.toBe(foreground)

		await expect(isStruckFromAnyAncestor(labelElementOf(sendInvites))).toBe(
			false,
		)
		await expect(labelOf(sendInvites).color).toBe(foreground)
		await expect(labelOf(draftList).textDecorationLine).toBe("line-through")
		await expect(labelOf(draftList).color).not.toBe(foreground)
	},
})
