import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import {
	BoardSection,
	type BoardSectionProps,
} from "@workspace/ui/components/board/board-section"

type PlayContext = { canvasElement: HTMLElement }

const TITLE_CHIP_INSET = 12

const playTitleChipInCorner = async ({ canvasElement }: PlayContext) => {
	const section = slotIn(canvasElement, "board-section")
	const title = slotIn(section, "board-section-title")
	const sectionBox = section.getBoundingClientRect()
	const titleBox = title.getBoundingClientRect()
	await expect(titleBox.left - sectionBox.left - section.clientLeft).toBe(
		TITLE_CHIP_INSET,
	)
	await expect(titleBox.top - sectionBox.top - section.clientTop).toBe(
		TITLE_CHIP_INSET,
	)
}

const meta = preview.meta({
	title: "Board/BoardSection",
	component: BoardSection,
	args: {
		tint: "blue",
		title: "Research",
		width: 420,
		height: 240,
	} satisfies BoardSectionProps,
	play: playTitleChipInCorner,
})

export const Blue = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A section in the blue tint, its title chip inside the top-left corner. Pick `Purple` for the other tint.",
			},
		},
	},
})

export const BlueDark = meta.story({
	globals: { theme: "dark" },
})

export const Purple = meta.story({
	args: { tint: "purple", title: "Ideas" },
	parameters: {
		docs: {
			description: {
				story:
					"A section in the purple tint, its title chip inside the top-left corner.",
			},
		},
	},
})

export const PurpleDark = meta.story({
	args: { tint: "purple", title: "Ideas" },
	globals: { theme: "dark" },
})
