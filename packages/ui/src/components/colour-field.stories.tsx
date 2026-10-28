import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	ColourField,
	type ColourFieldProps,
} from "@workspace/ui/components/colour-field"
import { HUE_PRESETS } from "@workspace/ui/components/hue-tones"
import { SpaceTint } from "@workspace/ui/components/space-tint"

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

const EMISSION_PAUSE_MS = 200

const pause = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms)
	})

const pressHueThumb = (field: HTMLElement) => {
	const track = slotIn(field, "slider-track").getBoundingClientRect()
	const thumb = slotIn(field, "slider-thumb").getBoundingClientRect()
	const clientY = track.top + track.height / 2
	const pointAt = (share: number) => ({
		bubbles: true,
		button: 0,
		buttons: 1,
		clientX: track.left + track.width * share,
		clientY,
	})

	slotIn(field, "slider-thumb").dispatchEvent(
		new PointerEvent("pointerdown", {
			...pointAt(0),
			clientX: thumb.left + thumb.width / 2,
		}),
	)

	return {
		moveTo: (share: number) =>
			document.dispatchEvent(new PointerEvent("pointermove", pointAt(share))),
		releaseAt: (share: number) =>
			document.dispatchEvent(
				new PointerEvent("pointerup", { ...pointAt(share), buttons: 0 }),
			),
	}
}

const meta = preview.meta({
	title: "Forms/ColourField",
	component: ColourField,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The one colour picker of the Space, conversation and companion settings. A radio group offers No colour, the eight presets and `Your hue`; `Your hue` opens a slider over the whole circle. The value is a hue from 0 to 359 or null: a preset reports its preset hue, No colour reports null, and a hue outside the presets selects `Your hue` without snapping. Every swatch, the track and the thumb are painted from the hue recipe, so a hue reads in light and dark alike. The host decides what a tile shows (`mark`), where No colour sits and whether tiles are swatches or avatars.",
			},
		},
	},
	globals: { theme_layout: "side-by-side" },
	args: {
		value: 257,
		onValueChange: fn(),
		mark: (hue) => <SpaceTint className="size-6" tint={hue} />,
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
					"Nothing picked. Check in both themes that No colour is the checked tile, and that no hue panel shows.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [none] = canvas.getAllByRole("radio", { name: "No colour" })
		await expect(none).toBeChecked()
		await expect(canvas.queryAllByRole("slider")).toHaveLength(0)
	},
})

export const Preset = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A preset picked. Check in both themes that the blue tile wears the foreground border on the muted ground, that hover, press and selection change at once with no transition, and that the arrow keys walk the row as one radio group and report each preset's hue.",
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
	},
})

export const OwnHue = meta.story({
	args: { value: 320, hint: "Any hue." },
	parameters: {
		docs: {
			description: {
				story:
					"A hue outside the presets. Check in both themes that `Your hue` is checked with the hue's dot on its rainbow, that the panel reads 320 degrees without snapping to pink, that the thumb is filled with the hue on a rainbow track, and that each arrow step moves the readout, the thumb and the dot together.",
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
	},
})

export const HueDragEmitsOnceAfterAPause = meta.story({
	tags: ["test-only"],
	args: { value: 320 },
	render: (args) => (
		<div className="w-96">
			<ColourField {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A drag on a host whose value never catches up. Check that the readout follows every move on the local hue, that nothing is emitted while the pointer keeps moving, that one emission follows the pause, and that releasing on the same hue emits nothing more.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const field = slotIn(canvasElement, "colour-field")
		const slider = field.querySelector<HTMLInputElement>('input[type="range"]')
		if (!slider) throw new Error("The hue panel is missing its slider")
		const readout = slotIn(field, "colour-field-readout")
		const drag = pressHueThumb(field)
		const shownHues: number[] = []

		for (const share of [0.7, 0.6, 0.5, 0.4]) {
			const previous = Number(slider.value)
			drag.moveTo(share)
			await waitFor(() => expect(Number(slider.value)).toBeLessThan(previous))
			const hue = Number(slider.value)
			await expect(hue).not.toBe(320)
			await expect(readout).toHaveTextContent(`${hue}°`)
			shownHues.push(hue)
		}
		await expect(args.onValueChange).not.toHaveBeenCalled()

		const lastHue = shownHues.at(-1)
		await waitFor(() => expect(args.onValueChange).toHaveBeenCalledTimes(1))
		await expect(args.onValueChange).toHaveBeenCalledWith(lastHue)
		await expect(readout).toHaveTextContent(`${lastHue}°`)

		drag.releaseAt(0.4)
		await pause(EMISSION_PAUSE_MS)
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
	},
})

export const PresetPickEmitsAtOnce = meta.story({
	tags: ["test-only"],
	args: { value: 320 },
	parameters: {
		docs: {
			description: {
				story:
					"A preset picked in the middle of a hue drag. Check that the pending hue is dropped and that the preset is emitted once, at once.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const field = slotIn(canvasElement, "colour-field")
		const drag = pressHueThumb(field)
		drag.moveTo(0.5)

		const green = field.querySelector<HTMLInputElement>('input[value="green"]')
		if (!green) throw new Error("The row is missing its green tile")
		green.click()
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
		await expect(args.onValueChange).toHaveBeenCalledWith(HUE_PRESETS.green)

		drag.releaseAt(0.5)
		await pause(EMISSION_PAUSE_MS)
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
	},
})
