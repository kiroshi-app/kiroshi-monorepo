import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { isInBrowserRunner, slotIn } from "@workspace/storybook/story-utils"
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

const LINKED_TASKS = [
	"- [ ] Read [the brief](https://brief.invalid/) before the call",
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
	const words = box.closest('[data-slot="markdown-task-checkbox"]')?.nextSibling
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
					"The box GFM emits for a task list item, drawn as the 16 box of the to-do artboard: radius 5, a 1.5 border at foreground 30 percent on the card surface, filled with the Space colour and a 12 check once ticked. A click ticks or unticks it in the message alone: nothing is written back to the message, so a reload shows the agent's state again. A ticked item strikes and mutes its own label alone, never the sub-tasks nested under it. The item text is the label of its box and names it: a click anywhere on that text ticks the box, a link inside it opens without ticking, and the box stays the one tab stop of its row.",
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
		const done = canvas.getAllByRole("checkbox", { checked: true })
		const [todo] = canvas.getAllByRole("checkbox", { checked: false })
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
		const done = canvas.getByRole("checkbox", { name: "Read the nest" })
		await expect(done).toBeChecked()
		await expect(labelOf(done).textDecorationLine).toBe("line-through")
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
		const box = canvas.getByRole("checkbox", { name: "Archive the record" })

		await userEvent.click(box)
		await expect(box).toBeChecked()
		await expect(labelOf(box).textDecorationLine).toBe("line-through")

		await userEvent.click(box)
		await expect(box).not.toBeChecked()
		await expect(labelOf(box).textDecorationLine).toBe("none")
	},
})

export const TicksAndUnticksByClickingTheLabel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader ticks a row by clicking its words, then unticks it the same way. Check that the box fills with the Space colour and the label strikes and mutes, exactly as a click on the box does, and that nothing on the row changes on hover or press.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const box = canvas.getByRole("checkbox", { name: "Archive the record" })
		const words = canvas.getByText("Archive the record")

		await userEvent.click(words)
		await expect(box).toBeChecked()
		await expect(labelOf(box).textDecorationLine).toBe("line-through")

		await userEvent.click(words)
		await expect(box).not.toBeChecked()
		await expect(labelOf(box).textDecorationLine).toBe("none")
	},
})

export const TicksALooseRowByClickingTheLabel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader ticks a row of the loose checklist by clicking its words. Check that the box fills and the label strikes, and that a click on the second paragraph of the item leaves the row as it is.",
			},
		},
	},
	render: LooseChecklist.input.render,
	play: async ({ canvas, userEvent }) => {
		const box = canvas.getByRole("checkbox", { name: "Archive the record" })

		await userEvent.click(canvas.getByText("Archive the record"))
		await expect(box).toBeChecked()
		await expect(labelOf(box).textDecorationLine).toBe("line-through")

		await userEvent.click(canvas.getByText(/^Keep the occupants list/))
		await expect(box).toBeChecked()
	},
})

export const OpensALinkInTheLabelWithoutTicking = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A row whose label carries a link. A click on the link follows it and leaves the row unticked, while a click on the words around it still ticks the row. Check that the box is named by the whole label. The play drives a real pointer through the Vitest browser runner, so it only asserts there; in Storybook, click the link and the words by hand.",
			},
		},
	},
	render: () => (
		<div className="w-[44rem] max-w-full">
			<Markdown>{LINKED_TASKS}</Markdown>
		</div>
	),
	play: async ({ canvas }) => {
		if (!isInBrowserRunner()) return
		const pointer = (await import("vitest/browser")).userEvent
		const box = canvas.getByRole("checkbox", {
			name: /^Read the brief .* before the call$/,
		})
		const link = canvas.getByRole("link", { name: /^the brief/ })
		const clicks: MouseEvent[] = []
		const recordClick = (event: MouseEvent) => clicks.push(event)
		window.addEventListener("click", recordClick)

		try {
			await pointer.click(link)
		} finally {
			window.removeEventListener("click", recordClick)
		}
		await expect(clicks).toHaveLength(1)
		await expect(link.contains(clicks[0]?.target as Node)).toBe(true)
		await expect(clicks[0]?.defaultPrevented).toBe(false)
		await expect(box).not.toBeChecked()
		await expect(labelOf(box).textDecorationLine).toBe("none")

		await pointer.click(canvas.getByText(/before the call$/))
		await expect(box).toBeChecked()
	},
})

export const TicksFromTheKeyboard = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The first box reached with Tab and unticked with Space, then the next row reached with a second Tab. Check that the browser focus ring shows around the box alone, never around the label.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const box = canvas.getByRole("checkbox", { name: "Read the nest" })

		await userEvent.tab()
		await expect(box).toHaveFocus()
		await userEvent.keyboard(" ")
		await expect(box).not.toBeChecked()

		await userEvent.tab()
		await expect(
			canvas.getByRole("checkbox", { name: "Summarise the occupants" }),
		).toHaveFocus()
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
		const bookVenue = canvas.getByRole("checkbox", { name: "Book the venue" })
		const draftList = canvas.getByRole("checkbox", {
			name: "Draft the guest list",
		})
		const confirmCaterer = canvas.getByRole("checkbox", {
			name: "Confirm the caterer",
		})
		const sendInvites = canvas.getByRole("checkbox", {
			name: "Send the invites",
		})
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

export const TicksASubTaskAlone = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader clicks the words of a sub-task, then the words of another. Check that each sub-task ticks or unticks on its own while the row above it keeps its state.",
			},
		},
	},
	render: NestedChecklist.input.render,
	play: async ({ canvas, userEvent }) => {
		const bookVenue = canvas.getByRole("checkbox", { name: "Book the venue" })
		const sendInvites = canvas.getByRole("checkbox", {
			name: "Send the invites",
		})

		await userEvent.click(canvas.getByText("Confirm the caterer"))
		await expect(
			canvas.getByRole("checkbox", { name: "Confirm the caterer" }),
		).toBeChecked()
		await expect(bookVenue).toBeChecked()

		await userEvent.click(canvas.getByText("Draft the guest list"))
		await expect(
			canvas.getByRole("checkbox", { name: "Draft the guest list" }),
		).not.toBeChecked()
		await expect(sendInvites).not.toBeChecked()
	},
})
