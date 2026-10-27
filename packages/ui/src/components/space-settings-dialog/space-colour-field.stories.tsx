import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	SpaceColourField,
	type SpaceColourFieldProps,
} from "@workspace/ui/components/space-settings-dialog/space-fields"

const ColourHost = (props: SpaceColourFieldProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<SpaceColourField
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			value={value}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Space/SpaceColourField",
	component: SpaceColourField,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The colour a space is recognised by, on its own: the row of swatches drawn as space tints, then the `Your hue` slider with its helper. The space dialog places it under the name in `SpaceFields`, and the focused settings page places it under the name of a space of yours. It reports the bare hue on every pick and every slider step.",
			},
		},
	},
	args: {
		value: 257,
		onValueChange: fn(),
	},
	render: (args) => <ColourHost {...args} />,
})

export const Preset = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A space wearing a preset. Check that its swatch is the checked one, marked by a border and a filled well rather than by colour alone, and that picking another swatch reports that preset's hue. Pick `Colourless` for the choice a space is created with.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByRole("radio", { name: "Blue" })).toBeChecked()

		await userEvent.click(canvas.getByRole("radio", { name: "Green" }))

		await expect(args.onValueChange).toHaveBeenLastCalledWith(132)
		await expect(canvas.getByRole("radio", { name: "Green" })).toBeChecked()
	},
})

export const Colourless = meta.story({
	args: { value: null },
	parameters: {
		docs: {
			description: {
				story:
					"A space carrying no colour. Check that the choice standing for no colour is the checked one while no preset is, and that picking a preset from there reports its hue. Pick `Preset` for a space already coloured.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByRole("radio", { name: "No colour" })).toBeChecked()
		await expect(canvas.getByRole("radio", { name: "Blue" })).not.toBeChecked()

		await userEvent.click(canvas.getByRole("radio", { name: "Pink" }))

		await expect(args.onValueChange).toHaveBeenLastCalledWith(358)
	},
})
