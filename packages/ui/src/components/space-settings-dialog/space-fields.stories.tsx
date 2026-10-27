import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	SpaceFields,
	type SpaceFieldsProps,
	type SpaceFieldsValue,
} from "@workspace/ui/components/space-settings-dialog/space-fields"

const FILLED_SPACE: SpaceFieldsValue = {
	name: "Release desk",
	hue: 257,
}

const FieldsHost = (props: SpaceFieldsProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<SpaceFields
			{...props}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			value={value}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Space/SpaceFields",
	component: SpaceFields,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"What a space is called and the hue it is recognised by, the two fields that make up the space's own entry in its settings. The colour row opens on a colourless choice, then offers the eight presets as swatches rather than names and ends on `Your hue`, which opens a slider over the whole circle; the chosen tile carries a foreground border on the muted ground so the choice survives a reader who cannot tell the pastels apart. Both fields are fully controlled and report the whole value on every keystroke, every pick and every slider step. Deleting the space is not here: it lives in its own danger zone, `DangerZone`.",
			},
		},
	},
	args: {
		value: FILLED_SPACE,
		onValueChange: fn(),
	},
	render: (args) => <FieldsHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal pair on a named space. Check that typing reports the edited name with the hue untouched, and that the chosen swatch is marked by a border and a filled well, not by colour alone. Pick `Recoloured` for the swatch row being used.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Name"), "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			hue: 257,
		})

		await expect(canvas.getAllByRole("radio")).toHaveLength(10)
		await expect(canvas.getByRole("radio", { name: "Blue" })).toBeChecked()
	},
})

export const Recoloured = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The swatch row being used. Check that each of the eight presets is reachable by name to a screen reader though it shows no text, that the arrow keys walk the row as one radio group, and that a pick reports the preset's hue with the name untouched — the two fields never overwrite each other. Pick `Colourless` for the choice the row opens on, `OwnHue` for the slider, `Default` for the pair at rest.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const swatches = canvas.getAllByRole("radio")

		await expect(swatches).toHaveLength(10)

		await userEvent.click(canvas.getByRole("radio", { name: "Green" }))
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk",
			hue: 132,
		})
		await expect(canvas.getByRole("radio", { name: "Green" })).toBeChecked()
	},
})

export const Colourless = meta.story({
	args: { value: { name: "Release desk", hue: null } },
	parameters: {
		docs: {
			description: {
				story:
					"A space carrying no colour, which is what a space is created as. Check that the choice standing for no colour opens the row and is the checked one while none of the eight presets is, and that picking a preset from there reports its hue — a space is never stuck colourless. Pick `Recoloured` for the row being walked.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const [first] = canvas.getAllByRole("radio")

		await expect(first).toHaveAccessibleName("No colour")
		await expect(first).toBeChecked()
		await expect(canvas.getByRole("radio", { name: "Blue" })).not.toBeChecked()

		await userEvent.click(canvas.getByRole("radio", { name: "Pink" }))
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk",
			hue: 358,
		})
	},
})

export const Empty = meta.story({
	args: { value: { name: "", hue: 63 } },
	parameters: {
		docs: {
			description: {
				story:
					"A space nobody has named yet. Check that the field stays empty behind its placeholder rather than being filled with a fallback — the fallback is what the dialog calls the space in its breadcrumb and its confirmation, never a value written into the record.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByLabelText("Name")).toHaveValue("")
		await expect(canvas.getByRole("radio", { name: "Orange" })).toBeChecked()
	},
})

export const OwnHue = meta.story({
	args: { value: { name: "Release desk", hue: 320 } },
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"A space wearing a hue of its own. Check in both themes that `Your hue` is the checked tile with the hue's dot on its rainbow, that the panel under the row reads 320 degrees with the helper beneath the track, and that a step on the slider repaints the readout, the thumb and the dot at once while the panel stays open, even on a preset hue.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const [ownHue] = canvas.getAllByRole("radio", { name: "Your hue" })
		await expect(ownHue).toBeChecked()
		const [slider] = canvas.getAllByRole("slider", { name: "Your hue" })
		if (!slider) throw new Error("The hue panel is missing its slider")
		await expect(slider).toHaveValue("320")
		await expect(
			slotIn(canvasElement, "colour-field-readout"),
		).toHaveTextContent("320°")

		slider.focus()
		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk",
			hue: 319,
		})
		await expect(
			slotIn(canvasElement, "colour-field-readout"),
		).toHaveTextContent("319°")
	},
})

const tileTopsIn = (row: HTMLElement) =>
	new Set(
		Array.from(row.querySelectorAll<HTMLElement>("[data-option]")).map(
			(tile) => tile.offsetTop,
		),
	)

export const OwnHueAtPageWidth = meta.story({
	args: { value: { name: "Release desk", hue: 320 } },
	globals: { theme_layout: "side-by-side" },
	render: (args) => (
		<div className="w-[518px]">
			<FieldsHost {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The panel at the 518px content width the Space settings page gives it, wearing a hue of its own. Check in both themes that the ten tiles hold one row with a 4px gap, and that the readout reads in Geist Mono inside a bordered box with no fill.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const row of slotsIn(canvasElement, "colour-field-options")) {
			await expect(tileTopsIn(row).size).toBe(1)
		}
		for (const readout of slotsIn(canvasElement, "colour-field-readout")) {
			const { fontFamily, backgroundColor, borderTopWidth } =
				getComputedStyle(readout)
			await expect(fontFamily.replaceAll(/["']/g, "")).toMatch(/^Geist Mono/)
			await expect(backgroundColor).toBe("rgba(0, 0, 0, 0)")
			await expect(borderTopWidth).toBe("1px")
		}
	},
})

export const Narrow = meta.story({
	args: { value: { name: "Release desk", hue: 320 } },
	render: (args) => (
		<div className="w-[320px]">
			<FieldsHost {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The panel in a 320px container, narrower than the row. Check that the tiles wrap onto further rows and that nothing is clipped or scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = slotIn(canvasElement, "colour-field-options")
		await expect(tileTopsIn(row).size).toBeGreaterThan(1)
		await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
	},
})

export const OwnHueOverAPreset = meta.story({
	args: { value: { name: "Release desk", hue: 297 } },
	parameters: {
		docs: {
			description: {
				story:
					"The slider passing over a preset hue. Check that landing on purple's 296 degrees reports it but keeps `Your hue` checked and the panel open, rather than jumping back to the purple swatch.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const slider = canvas.getByRole("slider", { name: "Your hue" })
		slider.focus()
		await userEvent.keyboard("{ArrowLeft}")

		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk",
			hue: 296,
		})
		await expect(canvas.getByRole("radio", { name: "Your hue" })).toBeChecked()
		await expect(
			canvas.getByRole("radio", { name: "Purple" }),
		).not.toBeChecked()
		await expect(canvas.getByRole("slider", { name: "Your hue" })).toBeVisible()
	},
})
