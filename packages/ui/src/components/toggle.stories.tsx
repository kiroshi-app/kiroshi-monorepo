import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Icons } from "@workspace/ui/components/icons"
import { Toggle } from "@workspace/ui/components/ui/toggle"

const meta = preview.meta({
	title: "Forms/Toggle",
	component: Toggle,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A button that stays pressed until it is pressed again, as the shadcn registry ships it. Group several with `ToggleGroup` when only one may be pressed at a time.",
			},
		},
	},
	args: { onPressedChange: fn() },
})

export const Default = meta.story({
	render: (args) => (
		<Toggle {...args} aria-label="Pin" variant="outline">
			<Icons.Pin />
		</Toggle>
	),
	parameters: {
		docs: {
			description: {
				story:
					"One outlined toggle, not pressed. Check that a press reports the new state and that a screen reader hears it as pressed rather than only seeing the fill.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const pin = canvas.getByRole("button", { name: "Pin" })
		await expect(pin).toHaveAttribute("aria-pressed", "false")

		await userEvent.click(pin)

		await expect(args.onPressedChange).toHaveBeenCalledWith(
			true,
			expect.anything(),
		)
		await expect(pin).toHaveAttribute("aria-pressed", "true")
	},
})
