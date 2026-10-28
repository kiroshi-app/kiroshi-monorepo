import { useState } from "react"
import { flushSync } from "react-dom"
import { expect, fn, type Mock, waitFor } from "storybook/test"

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
			flushSync(() => {
				document.dispatchEvent(new PointerEvent("pointermove", pointAt(share)))
			}),
		releaseAt: (share: number) =>
			document.dispatchEvent(
				new PointerEvent("pointerup", { ...pointAt(share), buttons: 0 }),
			),
	}
}

const hueSliderOf = (field: HTMLElement) => {
	const slider = field.querySelector<HTMLInputElement>('input[type="range"]')
	if (!slider) throw new Error("The hue panel is missing its slider")
	return slider
}

const emissionsOf = (onValueChange: ColourFieldProps["onValueChange"]) =>
	(onValueChange as Mock).mock.calls.length

const renderOnStaleHost = (args: ColourFieldProps) => (
	<div className="w-96">
		<ColourField {...args} />
	</div>
)

const OUTSIDE_HUE = 320

const OutsideChangeHost = (props: ColourFieldProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<div className="flex w-96 flex-col gap-3">
			<ColourField
				{...props}
				onValueChange={(next) => {
					setValue(next)
					props.onValueChange(next)
				}}
				value={value}
			/>
			<button onClick={() => setValue(OUTSIDE_HUE)} type="button">
				Another member sets 320
			</button>
		</div>
	)
}

const HeldRepliesHost = (props: ColourFieldProps) => {
	const [value, setValue] = useState(props.value)
	const [heldReplies, setHeldReplies] = useState<ColourFieldProps["value"][]>(
		[],
	)
	const [nextReply, ...laterReplies] = heldReplies

	return (
		<div className="flex w-96 flex-col gap-3">
			<ColourField
				{...props}
				onValueChange={(next) => {
					setHeldReplies((replies) => [...replies, next])
					props.onValueChange(next)
				}}
				value={value}
			/>
			<button
				disabled={nextReply === undefined}
				onClick={() => {
					if (nextReply === undefined) return
					setValue(nextReply)
					setHeldReplies(laterReplies)
				}}
				type="button"
			>
				Play the next reply
			</button>
		</div>
	)
}

const ClosableHost = (props: ColourFieldProps) => {
	const [isOpen, setIsOpen] = useState(true)

	return (
		<div className="flex w-96 flex-col gap-3">
			{isOpen ? <FieldHost {...props} /> : null}
			<button onClick={() => setIsOpen(false)} type="button">
				Close the field
			</button>
		</div>
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
		await waitFor(() =>
			expect(args.onValueChange).toHaveBeenLastCalledWith(321),
		)
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
	render: renderOnStaleHost,
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
		const slider = hueSliderOf(field)
		const readout = slotIn(field, "colour-field-readout")
		const drag = pressHueThumb(field)
		const shown = [0.7, 0.6, 0.5, 0.4].map((share) => {
			drag.moveTo(share)
			return { hue: Number(slider.value), readout: readout.textContent }
		})
		const emissionsDuringMoves = emissionsOf(args.onValueChange)

		await expect(emissionsDuringMoves).toBe(0)
		const hues = shown.map(({ hue }) => hue)
		await expect(hues).toEqual([...new Set(hues)].sort((a, b) => b - a))
		await expect(hues).not.toContain(320)
		for (const { hue, readout: text } of shown) {
			await expect(text).toBe(`${hue}°`)
		}

		const lastHue = hues.at(-1)
		await waitFor(() => expect(args.onValueChange).toHaveBeenCalledTimes(1))
		await expect(args.onValueChange).toHaveBeenCalledWith(lastHue)
		await expect(readout).toHaveTextContent(`${lastHue}°`)

		drag.releaseAt(0.4)
		await pause(EMISSION_PAUSE_MS)
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
	},
})

export const HueDragReleasedBeforeThePauseEmitsOnce = meta.story({
	tags: ["test-only"],
	args: { value: 320 },
	render: renderOnStaleHost,
	parameters: {
		docs: {
			description: {
				story:
					"A drag released before the pause on a host still writing. Check that the final hue is emitted once at release, that nothing follows when the timer would have fired, and that the readout stays on the released hue instead of snapping back.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const field = slotIn(canvasElement, "colour-field")
		const slider = hueSliderOf(field)
		const drag = pressHueThumb(field)
		drag.moveTo(0.6)
		drag.moveTo(0.5)
		const finalHue = Number(slider.value)
		const emissionsBeforeRelease = emissionsOf(args.onValueChange)
		drag.releaseAt(0.5)
		const emissionsAtRelease = emissionsOf(args.onValueChange)

		await expect(emissionsBeforeRelease).toBe(0)
		await expect(emissionsAtRelease).toBe(1)
		await expect(args.onValueChange).toHaveBeenCalledWith(finalHue)

		await pause(EMISSION_PAUSE_MS)
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
		await expect(slotIn(field, "colour-field-readout")).toHaveTextContent(
			`${finalHue}°`,
		)
	},
})

export const HeldArrowKeyEmitsOnceAfterTheLastRepeat = meta.story({
	tags: ["test-only"],
	args: { value: 320 },
	parameters: {
		docs: {
			description: {
				story:
					"An arrow key held on the hue slider. Check that every repeat moves the readout, that nothing is emitted while the key repeats, and that one emission follows the last repeat.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const field = slotIn(canvasElement, "colour-field")
		const slider = hueSliderOf(field)
		const readout = slotIn(field, "colour-field-readout")
		slider.focus()
		const shown = Array.from({ length: 5 }, (_, index) => {
			flushSync(() => {
				slider.dispatchEvent(
					new KeyboardEvent("keydown", {
						bubbles: true,
						key: "ArrowRight",
						repeat: index > 0,
					}),
				)
			})
			return readout.textContent
		})
		const emissionsDuringRepeats = emissionsOf(args.onValueChange)

		await expect(emissionsDuringRepeats).toBe(0)
		await expect(shown).toEqual(["321°", "322°", "323°", "324°", "325°"])
		await waitFor(() => expect(args.onValueChange).toHaveBeenCalledTimes(1))
		await expect(args.onValueChange).toHaveBeenCalledWith(325)

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

export const HueEmittedAgainAfterAnOutsideChange = meta.story({
	tags: ["test-only"],
	args: { value: 320 },
	globals: { theme_layout: "single" },
	render: (args) => <OutsideChangeHost {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Another member changes the hue between two of your edits. Check that the field shows their hue, and that stepping back to the hue you last sent sends it again.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const field = slotIn(canvasElement, "colour-field")
		const slider = hueSliderOf(field)
		const readout = slotIn(field, "colour-field-readout")

		slider.focus()
		await userEvent.keyboard("{ArrowRight}")
		await waitFor(() => expect(args.onValueChange).toHaveBeenCalledWith(321))

		await userEvent.click(
			canvas.getByRole("button", { name: "Another member sets 320" }),
		)
		await expect(readout).toHaveTextContent(`${OUTSIDE_HUE}°`)

		slider.focus()
		await userEvent.keyboard("{ArrowRight}")
		await waitFor(() => expect(args.onValueChange).toHaveBeenCalledTimes(2))
		await expect(args.onValueChange).toHaveBeenLastCalledWith(321)
	},
})

export const HueDragBackToAnInFlightHueEmitsItOnce = meta.story({
	tags: ["test-only"],
	args: { value: 320 },
	render: renderOnStaleHost,
	parameters: {
		docs: {
			description: {
				story:
					"A drag that leaves a hue still in flight and comes back to rest on it. Check that the hue is emitted once in total, at the first pause, and never again.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const field = slotIn(canvasElement, "colour-field")
		const slider = hueSliderOf(field)
		const drag = pressHueThumb(field)
		drag.moveTo(0.5)
		const inFlightHue = Number(slider.value)
		await waitFor(() => expect(args.onValueChange).toHaveBeenCalledTimes(1))
		await expect(args.onValueChange).toHaveBeenCalledWith(inFlightHue)

		drag.moveTo(0.6)
		const leftHue = Number(slider.value)
		drag.moveTo(0.5)
		await expect(leftHue).not.toBe(inFlightHue)
		await expect(Number(slider.value)).toBe(inFlightHue)

		await pause(EMISSION_PAUSE_MS)
		drag.releaseAt(0.5)
		await pause(EMISSION_PAUSE_MS)
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
	},
})

export const HeldRepliesKeepTheNewerOwnHue = meta.story({
	tags: ["test-only"],
	args: { value: 320 },
	globals: { theme_layout: "single" },
	render: (args) => <HeldRepliesHost {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Two of your hues in flight on a host that holds its replies, then plays them in order. Check that the older reply leaves the thumb and the readout on the newer hue, and that the newer reply is shown as it lands.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const field = slotIn(canvasElement, "colour-field")
		const slider = hueSliderOf(field)
		const readout = slotIn(field, "colour-field-readout")
		const drag = pressHueThumb(field)
		drag.moveTo(0.5)
		const olderHue = Number(slider.value)
		await waitFor(() => expect(args.onValueChange).toHaveBeenCalledTimes(1))
		drag.moveTo(0.4)
		const newerHue = Number(slider.value)
		await waitFor(() => expect(args.onValueChange).toHaveBeenCalledTimes(2))
		drag.releaseAt(0.4)
		await expect(args.onValueChange).toHaveBeenNthCalledWith(1, olderHue)
		await expect(args.onValueChange).toHaveBeenNthCalledWith(2, newerHue)

		const playNextReply = canvas.getByRole("button", {
			name: "Play the next reply",
		})
		await userEvent.click(playNextReply)
		await expect(readout).toHaveTextContent(`${newerHue}°`)
		await expect(slider).toHaveValue(String(newerHue))

		await userEvent.click(playNextReply)
		await expect(readout).toHaveTextContent(`${newerHue}°`)
		await expect(slider).toHaveValue(String(newerHue))
		await expect(playNextReply).toBeDisabled()

		await pause(EMISSION_PAUSE_MS)
		await expect(args.onValueChange).toHaveBeenCalledTimes(2)
	},
})

export const UnmountMidDragEmitsThePendingHueOnce = meta.story({
	tags: ["test-only"],
	args: { value: 320 },
	globals: { theme_layout: "single" },
	render: (args) => <ClosableHost {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The field closed in the middle of a drag, before the pause. Check that the hue waiting is emitted once as the field goes, and that nothing follows.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const field = slotIn(canvasElement, "colour-field")
		const slider = hueSliderOf(field)
		const drag = pressHueThumb(field)
		drag.moveTo(0.5)
		const waitingHue = Number(slider.value)
		const emissionsBeforeClose = emissionsOf(args.onValueChange)

		canvas.getByRole("button", { name: "Close the field" }).click()
		await expect(emissionsBeforeClose).toBe(0)
		await waitFor(() => expect(args.onValueChange).toHaveBeenCalledTimes(1))
		await expect(args.onValueChange).toHaveBeenCalledWith(waitingHue)

		drag.releaseAt(0.5)
		await pause(EMISSION_PAUSE_MS)
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
	},
})
