import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/ui/collapsible"

const meta = preview.meta({
	title: "Primitives/Collapsible",
	component: Collapsible,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The registry collapsible on Base UI: one trigger reports its panel through aria-expanded and shows or hides it, the open state controlled through `open` or left to the root. It draws nothing; compose it rather than editing it, as `WebSources` does.",
			},
		},
	},
	render: () => (
		<Collapsible>
			<CollapsibleTrigger>Shipping</CollapsibleTrigger>
			<CollapsibleContent>
				Orders leave the warehouse within two days.
			</CollapsibleContent>
		</Collapsible>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Closed, then opened by a click. Check the trigger moves aria-expanded from false to true and the panel text appears.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Shipping" })
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
		await expect(canvas.queryByText(/warehouse/)).toBeNull()
		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "true")
		await expect(canvas.getByText(/warehouse/)).toBeVisible()
	},
})
