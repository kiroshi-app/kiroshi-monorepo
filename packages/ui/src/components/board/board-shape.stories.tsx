import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import {
	BoardShape,
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
