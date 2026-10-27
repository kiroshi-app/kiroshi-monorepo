import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import {
	BLOT_HUES,
	BLOT_TINTS,
} from "@workspace/ui/components/companion-colour"
import { hueTone } from "@workspace/ui/components/hue-palette"
import {
	SpaceTint,
	type SpaceTintProps,
} from "@workspace/ui/components/space-tint"

const BLUE_TINT = { tint: BLOT_HUES.blue } satisfies SpaceTintProps

const meta = preview.meta({
	title: "Branding/SpaceTint",
	component: SpaceTint,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The mark a space is recognised by: one dot filled with the bubble tone of the space hue and edged in its accent, drawn from one of the eight named hues a companion is painted in, so a space and the companions living in it read as one family. A space carrying no colour gets an empty well instead, which is what the dot draws when no tint is given. It draws nothing but colour, which is why it is decorative to a screen reader: whatever names the space names it in words next to the dot. Reach for it wherever a space has to be told apart at a glance — the breadcrumb of its settings, the row that chooses its tint.",
			},
		},
	},
	args: BLUE_TINT,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The dot at its resting size, in one tint. Check that it stays a circle rather than an ellipse when a flex row squeezes it, and that it is hidden from the accessibility tree — a colour is not a name. Pick `Untinted` for a space carrying no colour, `Variants` for all eight at once.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [dot] = slotsIn(canvasElement, "space-tint")

		await expect(dot).toHaveAttribute("aria-hidden", "true")
		await expect(dot?.getBoundingClientRect().width).toBe(
			dot?.getBoundingClientRect().height,
		)
	},
})

export const Untinted = meta.story({
	args: { tint: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A space carrying no colour. Check that the well reads as an empty slot against both schemes — flip `theme_layout` to side-by-side — rather than borrowing a tint, and that it keeps the size and the circle of a tinted dot so a row of spaces stays even. Pick `Default` for a tinted one.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [dot] = slotsIn(canvasElement, "space-tint")

		await expect(dot).not.toHaveAttribute("data-hue")
		await expect(dot?.style.backgroundColor).toBe("")
	},
})

export const Variants = meta.story({
	render: () => (
		<div className="flex items-center gap-2">
			{BLOT_TINTS.map((tint) => (
				<SpaceTint className="size-6" key={tint} tint={BLOT_HUES[tint]} />
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every tint a space can wear, in the order the swatch row offers them. Check that each dot reads as its own colour against both schemes — flip `theme_layout` to side-by-side — and that the row is derived from `BLOT_TINTS` rather than hand-listed, so a ninth tint shows up here on its own.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const dots = slotsIn(canvasElement, "space-tint")

		await expect(dots.map((dot) => Number(dot.dataset.hue))).toEqual(
			BLOT_TINTS.map((tint) => BLOT_HUES[tint]),
		)
	},
})

export const FreeHue = meta.story({
	args: { tint: 210 },
	parameters: {
		docs: {
			description: {
				story:
					"A space given a hue outside the eight presets, 210. Check that the dot wears that hue, between cyan and blue, rather than the nearest preset.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [dot] = slotsIn(canvasElement, "space-tint")

		await expect(dot).toHaveAttribute("data-hue", "210")
		await expect(dot?.style.getPropertyValue("--hue-light-bubble")).toBe(
			hueTone(210, "light", "bubble").hex,
		)
	},
})
