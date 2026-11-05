import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { resolvedRootColor, slotIn } from "@workspace/storybook/story-utils"
import {
	BoardShape,
	type BoardShapeFill,
	type BoardShapeProps,
} from "@workspace/ui/components/board/board-shape"

type PlayContext = { canvasElement: HTMLElement }

const centreOf = (element: Element) => {
	const { left, top, width, height } = element.getBoundingClientRect()
	return { x: left + width / 2, y: top + height / 2 }
}

const playLabelCentred = async ({ canvasElement }: PlayContext) => {
	const shape = slotIn(canvasElement, "board-shape")
	const label = shape.querySelector("p")
	await expect(label).not.toBeNull()
	const shapeCentre = centreOf(shape)
	const labelCentre = centreOf(label as Element)
	await expect(Math.abs(labelCentre.x - shapeCentre.x)).toBeLessThanOrEqual(1)
	await expect(Math.abs(labelCentre.y - shapeCentre.y)).toBeLessThanOrEqual(1)
}

const playFilled =
	(fill: BoardShapeFill) =>
	async ({ canvasElement }: PlayContext) => {
		await playLabelCentred({ canvasElement })
		const shape = slotIn(canvasElement, "board-shape")
		await expect(shape).toHaveAttribute("data-fill", fill)
		await expect(getComputedStyle(shape).backgroundColor).toBe(
			resolvedRootColor(`--board-sticky-${fill}`),
		)
		await expect(getComputedStyle(shape).color).toBe(
			resolvedRootColor("--board-sticky-foreground"),
		)
	}

const meta = preview.meta({
	title: "Board/BoardShape",
	component: BoardShape,
	args: {
		kind: "rounded-rectangle",
		label: "Research",
		width: 144,
		height: 80,
	} satisfies BoardShapeProps,
	play: playLabelCentred,
})

export const RoundedRectangle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A rounded rectangle at its 5b size. Check the label sits centred on both axes; pick `Ellipse` for the round outline.",
			},
		},
	},
})

export const RoundedRectangleDark = meta.story({
	globals: { theme: "dark" },
})

export const Ellipse = meta.story({
	args: { kind: "ellipse", label: "Ship", width: 136, height: 88 },
	parameters: {
		docs: {
			description: {
				story:
					"An ellipse at its 5b size, its outline a true ellipse rather than a pill, the label centred on both axes.",
			},
		},
	},
})

export const EllipseDark = meta.story({
	args: { kind: "ellipse", label: "Ship", width: 136, height: 88 },
	globals: { theme: "dark" },
})

export const FillYellow = meta.story({
	args: { fill: "yellow" },
	parameters: {
		docs: {
			description: {
				story:
					"A rounded rectangle filled yellow from the selection bar, on the yellow sticky colour with the sticky ink, its outline and label placement unchanged. Pick FillYellowDark for the dark theme.",
			},
		},
	},
	play: playFilled("yellow"),
})

export const FillYellowDark = meta.story({
	args: { fill: "yellow" },
	globals: { theme: "dark" },
	play: playFilled("yellow"),
})

export const FillGreen = meta.story({
	args: { fill: "green" },
	parameters: {
		docs: {
			description: {
				story:
					"A rounded rectangle filled green from the selection bar, on the green sticky colour with the sticky ink, its outline and label placement unchanged. Pick FillGreenDark for the dark theme.",
			},
		},
	},
	play: playFilled("green"),
})

export const FillGreenDark = meta.story({
	args: { fill: "green" },
	globals: { theme: "dark" },
	play: playFilled("green"),
})

export const FillBlue = meta.story({
	args: { fill: "blue" },
	parameters: {
		docs: {
			description: {
				story:
					"A rounded rectangle filled blue from the selection bar, on the blue sticky colour with the sticky ink, its outline and label placement unchanged. Pick FillBlueDark for the dark theme.",
			},
		},
	},
	play: playFilled("blue"),
})

export const FillBlueDark = meta.story({
	args: { fill: "blue" },
	globals: { theme: "dark" },
	play: playFilled("blue"),
})

export const FillPink = meta.story({
	args: { fill: "pink" },
	parameters: {
		docs: {
			description: {
				story:
					"A rounded rectangle filled pink from the selection bar, on the pink sticky colour with the sticky ink, its outline and label placement unchanged. Pick FillPinkDark for the dark theme.",
			},
		},
	},
	play: playFilled("pink"),
})

export const FillPinkDark = meta.story({
	args: { fill: "pink" },
	globals: { theme: "dark" },
	play: playFilled("pink"),
})
