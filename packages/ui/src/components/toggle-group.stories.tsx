import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/ui/toggle-group"

const CHOICES = ["Day", "Week", "Month"]

const meta = preview.meta({
	title: "Forms/ToggleGroup",
	component: ToggleGroup,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A row of toggles sharing one value, as the shadcn registry ships it. Without `multiple` a single item is pressed at a time and the arrow keys walk the row. Reach for `Tabs` when each choice owns a panel of its own.",
			},
		},
	},
	args: { onValueChange: fn() },
})

export const SingleSelection = meta.story({
	render: (args) => (
		<ToggleGroup
			{...args}
			aria-label="Range"
			defaultValue={["Day"]}
			variant="outline"
		>
			{CHOICES.map((choice) => (
				<ToggleGroupItem key={choice} value={choice}>
					{choice}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Three choices, Day pressed. Check that pressing Week reports it, releases Day, and that Right arrow moves focus along the row.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const day = canvas.getByRole("button", { name: "Day" })
		const week = canvas.getByRole("button", { name: "Week" })
		await expect(day).toHaveAttribute("aria-pressed", "true")

		await userEvent.click(week)

		await expect(args.onValueChange).toHaveBeenCalledWith(
			["Week"],
			expect.anything(),
		)
		await expect(week).toHaveAttribute("aria-pressed", "true")
		await expect(day).toHaveAttribute("aria-pressed", "false")

		await userEvent.keyboard("{ArrowRight}")
		await expect(canvas.getByRole("button", { name: "Month" })).toHaveFocus()
	},
})
