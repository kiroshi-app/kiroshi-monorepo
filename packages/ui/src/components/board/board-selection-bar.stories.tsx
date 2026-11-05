import { expect, fn, userEvent, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	BoardSelectionBar,
	type BoardSelectionBarProps,
} from "@workspace/ui/components/board/board-selection-bar"

const SWATCHES = ["No colour", "Yellow", "Green", "Blue", "Pink"]

const meta = preview.meta({
	title: "Board/BoardSelectionBar",
	component: BoardSelectionBar,
	args: {
		shapeStyle: { shape: "rounded-rectangle", fill: "surface" },
		onShapeStyleChange: fn(),
	} satisfies BoardSelectionBarProps,
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		const pressed = SWATCHES.map((name) =>
			canvas.getByRole("button", { name }).getAttribute("aria-pressed"),
		)
		await expect(pressed).toEqual(["true", "false", "false", "false", "false"])

		await userEvent.click(canvas.getByRole("button", { name: "Pink" }))
		await expect(args.onShapeStyleChange).toHaveBeenCalledWith({
			shape: "rounded-rectangle",
			fill: "pink",
		})
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The style bar of a selected shape, as Boards 4c draws it: the shape-type pill, the five fill swatches with the current one ringed, the text size and More. Picking a swatch hands the new style back; the canvas sends it as a style intent. Pick DefaultDark for the dark theme.",
			},
		},
	},
})

export const DefaultDark = meta.story({
	globals: { theme: "dark" },
})
