import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Slider } from "@workspace/ui/components/ui/slider"

const meta = preview.meta({
	title: "Forms/Slider",
	component: Slider,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The slider as the shadcn registry ships it, on Base UI: the full prop surface, a value given as an array with one entry per thumb. The thumb takes its name from `aria-labelledby` on the root, since the registry wrapper passes nothing to it. `ColourField` restyles its track and thumb into the hue slider.",
			},
		},
	},
	args: {
		"aria-labelledby": "slider-story-label",
		defaultValue: [40],
		onValueChange: fn(),
	},
	render: (args) => (
		<div className="flex w-72 flex-col gap-2">
			<span className="text-sm" id="slider-story-label">
				Volume
			</span>
			<Slider {...args} />
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"One thumb at rest. Check that the arrow keys move it one step and report the new value.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const slider = canvas.getByRole("slider", { name: "Volume" })
		await expect(slider).toHaveValue("40")

		slider.focus()
		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onValueChange).toHaveBeenCalled()
		await expect(slider).toHaveValue("41")
	},
})
