import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
	resolvedRootColor,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	Checklist,
	type ChecklistItem,
} from "@workspace/ui/components/answer-blocks/checklist"

const BEFORE_LISBON: ChecklistItem[] = [
	{
		id: "transfer",
		label: "Book the airport transfer",
		isChecked: true,
		assignee: "Ada",
	},
	{
		id: "passes",
		label: "Print the boarding passes",
		isChecked: true,
		assignee: "Leo",
	},
	{
		id: "dinner",
		label: "Reserve dinner at Casa do Rio",
		isChecked: true,
		assignee: "Ada",
	},
	{
		id: "cards",
		label: "Buy two Viva Viagem cards",
		isChecked: false,
		assignee: "Leo",
	},
	{
		id: "adapters",
		label: "Pack the plug adapters",
		isChecked: false,
		assignee: "Ada",
	},
	{
		id: "address",
		label: "Share the flat address",
		isChecked: false,
		assignee: "Leo",
	},
]

const ALL_DONE = BEFORE_LISBON.map((item) => ({ ...item, isChecked: true }))

const UNBROKEN_LABELS: ChecklistItem[] = [
	{
		id: "unbroken",
		label: "Confirmreservationnumber4F7Q2ZKLMNOPWXYZ",
		isChecked: true,
		assignee: "Bartholomew",
	},
	...BEFORE_LISBON.slice(3),
]

const meta = preview.meta({
	title: "Conversation/Markdown/Checklist",
	component: Checklist,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A to-do list the agent hands over, with a done counter, a progress bar, an assignee per item and a copy button. Reach for it when the answer is a list someone ticks off; a markdown task list covers a passing mention. It ticks only when `onToggle` is passed, and shows the copy button only when `onCopy` is.",
			},
		},
	},
	args: {
		title: "Before we leave for Lisbon",
		items: BEFORE_LISBON,
		onToggle: fn(),
		onCopy: fn(),
	},
	render: (args) => (
		<AgentAnswerFrame intro="Here is what is left before Friday. Tick items off as you go.">
			<Checklist {...args} />
		</AgentAnswerFrame>
	),
})

export const Ticking = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 3. Half the list is done: the counter reads 3/6 and the bar fills half in the Space colour. Check the checked rows draw the filled mark and the struck muted label, and that a click hands the item and its next state to `onToggle`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const checked = canvas.getByRole("checkbox", {
			name: /Book the airport transfer/,
		})
		await expect(checked).toHaveAttribute("aria-checked", "true")
		await expect(
			canvas.getByRole("checkbox", { name: /Pack the plug adapters/ }),
		).toHaveAttribute("aria-checked", "false")
		await expect(
			getComputedStyle(canvas.getByText("Book the airport transfer"))
				.textDecorationLine,
		).toBe("line-through")
		await expect(slotIn(canvasElement, "checklist-counter")).toHaveTextContent(
			"3/6",
		)
		await expect(
			getComputedStyle(slotIn(canvasElement, "checklist-progress"))
				.backgroundColor,
		).toBe(resolvedRootColor("--primary-strong"))

		await userEvent.click(
			canvas.getByRole("checkbox", { name: /Buy two Viva Viagem cards/ }),
		)
		await expect(args.onToggle).toHaveBeenCalledWith("cards", true)

		const copy = canvas.getByRole("button", { name: "Copy the list" })
		await expect(getComputedStyle(copy).transitionDuration).toBe("0s")
		await userEvent.click(copy)
		await expect(args.onCopy).toHaveBeenCalledOnce()
	},
})

export const AllDone = meta.story({
	globals: { theme: "dark" },
	args: { items: ALL_DONE },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 4. Every item is ticked: the counter and the full bar turn to the success token. Pick `Ticking` for the list in progress.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const success = resolvedRootColor("--success")
		const counter = slotIn(canvasElement, "checklist-counter")
		await expect(counter).toHaveTextContent("6/6")
		await expect(getComputedStyle(counter).color).toBe(success)
		await expect(
			getComputedStyle(slotIn(canvasElement, "checklist-progress"))
				.backgroundColor,
		).toBe(success)
	},
})

export const ReadOnly = meta.story({
	args: { onToggle: undefined, onCopy: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"No `onToggle` and no `onCopy`: the list a past answer shows once nothing can tick it any more. Check each item is still announced as a checkbox with its state, but takes no focus stop and shows no pointer, and that the copy button is gone.",
			},
		},
	},
	play: async ({ canvas }) => {
		const items = canvas.getAllByRole("checkbox")
		await expect(items).toHaveLength(6)
		for (const item of items) {
			await expect(item).toHaveAttribute("aria-readonly", "true")
			await expect(item.tabIndex).toBe(-1)
			await expect(getComputedStyle(item).cursor).not.toBe("pointer")
		}
		await expect(canvas.queryByRole("button")).toBeNull()
	},
})

export const InNarrowColumn = meta.story({
	args: { items: UNBROKEN_LABELS },
	render: (args) => (
		<AgentAnswerFrame intro="Here is what is left before Friday." width={320}>
			<Checklist {...args} />
		</AgentAnswerFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column with an unbroken label and an assignee longer than its 64 column. Check the label wraps, the assignee truncates, and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
	},
})
