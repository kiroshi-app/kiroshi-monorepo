import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
} from "@workspace/storybook/story-utils"
import {
	type CollapsibleSection,
	CollapsibleSections,
} from "@workspace/ui/components/answer-blocks/collapsible-sections"

const BUDGET: CollapsibleSection[] = [
	{
		id: "lodging",
		label: "Lodging",
		value: "49%",
		body: "Two nights at Casa do Rio, breakfast included, paid in advance.",
	},
	{
		id: "food",
		label: "Food",
		value: "28%",
		body: "Three dinners out and the market on Saturday.",
	},
	{
		id: "transport",
		label: "Transport",
		value: "14%",
		body: "The airport transfer both ways and two Viva Viagem cards.",
	},
	{
		id: "tickets",
		label: "Tickets",
		value: "9%",
		body: "The castle and the tile museum.",
	},
]

const meta = preview.meta({
	title: "Conversation/Markdown/CollapsibleSections",
	component: CollapsibleSections,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Stacked sections the reader opens one by one, each head with a label and an optional trailing value. Reach for it when the answer breaks one total into parts the reader drills into; headings cover sections everyone reads in full.",
			},
		},
	},
	args: { sections: BUDGET, defaultOpen: ["lodging"] },
	render: (args) => (
		<AgentAnswerFrame intro="Here is where the budget for the three days goes.">
			<CollapsibleSections {...args} />
		</AgentAnswerFrame>
	),
})

export const InAgentAnswer = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 11. The first section opens with its body indented under the label. Check a click, Enter and Space each toggle a head, its chevron and `aria-expanded`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const lodging = canvas.getByRole("button", { name: /Lodging/ })
		const food = canvas.getByRole("button", { name: /Food/ })
		await expect(lodging).toHaveAttribute("aria-expanded", "true")
		await expect(canvas.getByText(/Two nights at Casa do Rio/)).toBeVisible()
		await expect(food).toHaveAttribute("aria-expanded", "false")
		await expect(getComputedStyle(food).transitionDuration).toBe("0s")

		await userEvent.click(food)
		await expect(food).toHaveAttribute("aria-expanded", "true")
		await expect(canvas.getByText(/Three dinners out/)).toBeVisible()

		food.focus()
		await userEvent.keyboard("{Enter}")
		await expect(food).toHaveAttribute("aria-expanded", "false")
		await expect(canvas.queryByText(/Three dinners out/)).toBeNull()

		await userEvent.keyboard(" ")
		await expect(food).toHaveAttribute("aria-expanded", "true")
	},
})

export const InNarrowColumn = meta.story({
	args: {
		sections: [
			{
				...BUDGET[0],
				label: "LodgingatCasadoRiobreakfastincludedpaidinadvance",
			},
			...BUDGET.slice(1),
		],
	},
	render: (args) => (
		<AgentAnswerFrame intro="Where the budget goes." width={320}>
			<CollapsibleSections {...args} />
		</AgentAnswerFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column with an unbroken label. Check it wraps between the chevron and the value and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
	},
})
