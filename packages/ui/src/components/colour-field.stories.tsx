import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	ColourField,
	type ColourFieldProps,
} from "@workspace/ui/components/colour-field"
import { blotOf } from "@workspace/ui/components/companion-colour"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { SpaceTint } from "@workspace/ui/components/space-tint"

type StoryPreviewProps = {
	hue: number | null
}

const StoryPreview = ({ hue }: StoryPreviewProps) => (
	<div
		className="flex justify-end px-3.5 py-3"
		data-hue={hue ?? undefined}
		data-slot="story-colour-preview"
		style={hue === null ? undefined : hueStyle(hue)}
	>
		<span className="rounded-bubble bg-user-bubble px-3 py-2 text-compact text-user-bubble-foreground leading-5">
			Ship it on Friday?
		</span>
	</div>
)

const FieldHost = (props: ColourFieldProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<ColourField
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
	title: "Forms/ColourField",
	component: ColourField,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The one colour picker of the Space, conversation and companion settings. A radio group offers No colour, the eight presets and `Your hue`; `Your hue` opens a slider over the whole circle. The value is a hue from 0 to 359 or null: a preset reports its preset hue, No colour reports null, and a hue outside the presets selects `Your hue` without snapping. Every swatch, the track, the thumb and the preview are painted from the hue recipe, so a hue reads in light and dark alike. The host decides what a tile shows (`mark`), what the strip under the field shows (`preview`), where No colour sits and whether tiles are swatches or avatars.",
			},
		},
	},
	globals: { theme_layout: "side-by-side" },
	args: {
		value: 257,
		onValueChange: fn(),
		mark: (hue) => <SpaceTint className="size-6" tint={blotOf(hue)} />,
		preview: (hue) => <StoryPreview hue={hue} />,
	},
	render: (args) => (
		<div className="w-96">
			<FieldHost {...args} />
		</div>
	),
})

export const NoColour = meta.story({
	args: { value: null },
	parameters: {
		docs: {
			description: {
				story:
					"Nothing picked. Check in both themes that No colour is the checked tile, that no hue panel shows, and that the preview falls back to the default bubble.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const [none] = canvas.getAllByRole("radio", { name: "No colour" })
		await expect(none).toBeChecked()
		await expect(canvas.queryAllByRole("slider")).toHaveLength(0)
		await expect(
			slotIn(canvasElement, "story-colour-preview"),
		).not.toHaveAttribute("data-hue")
	},
})

export const Preset = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A preset picked. Check in both themes that the blue tile wears the foreground border on the muted ground, that hover, press and selection change at once with no transition, that the arrow keys walk the row as one radio group and report each preset's hue, and that the preview repaints on every step.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const [blue] = canvas.getAllByRole("radio", { name: "Blue" })
		if (!blue) throw new Error("The row is missing its blue tile")
		await expect(blue).toBeChecked()
		await expect(slotsIn(canvasElement, "colour-field-hue")).toHaveLength(0)
		for (const tile of slotIn(canvasElement, "colour-field-options").children) {
			await expect(getComputedStyle(tile).transitionDuration).toBe("0s")
		}

		blue.focus()
		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onValueChange).toHaveBeenLastCalledWith(296)
		await expect(slotIn(canvasElement, "story-colour-preview")).toHaveAttribute(
			"data-hue",
			"296",
		)
	},
})

export const OwnHue = meta.story({
	args: { value: 320, hint: "Any hue." },
	parameters: {
		docs: {
			description: {
				story:
					"A hue outside the presets. Check in both themes that `Your hue` is checked with the hue's dot on its rainbow, that the panel reads 320 degrees without snapping to pink, that the thumb is filled with the hue on a rainbow track, and that each arrow step moves the readout, the thumb, the dot and the preview together.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const [ownHue] = canvas.getAllByRole("radio", { name: "Your hue" })
		await expect(ownHue).toBeChecked()
		await expect(args.onValueChange).not.toHaveBeenCalled()

		const [slider] = canvas.getAllByRole("slider", { name: "Your hue" })
		if (!slider) throw new Error("The hue panel is missing its slider")
		await expect(slider).toHaveValue("320")

		slider.focus()
		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onValueChange).toHaveBeenLastCalledWith(321)
		await expect(
			slotIn(canvasElement, "colour-field-readout"),
		).toHaveTextContent("321°")
		await expect(slotIn(canvasElement, "colour-field-hue")).toHaveAttribute(
			"data-hue",
			"321",
		)
		await expect(slotIn(canvasElement, "story-colour-preview")).toHaveAttribute(
			"data-hue",
			"321",
		)
	},
})
