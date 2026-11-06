import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import { CASA_DO_RIO_TERRACE } from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import { BoardImage } from "@workspace/ui/components/board/board-image"

type PlayContext = { canvasElement: HTMLElement }

const SOURCE = "example.com/terrace-at-dusk"

const playWithoutSource = async ({ canvasElement }: PlayContext) => {
	await expect(slotsIn(canvasElement, "board-image")).toHaveLength(1)
	await expect(slotIn(canvasElement, "board-image")).toHaveAttribute(
		"draggable",
		"false",
	)
	await expect(slotsIn(canvasElement, "board-image-source")).toHaveLength(0)
}

const playWithSource = async ({ canvasElement }: PlayContext) => {
	await expect(slotIn(canvasElement, "board-image-source")).toHaveTextContent(
		SOURCE,
	)
}

const meta = preview.meta({
	title: "Board/BoardImage",
	component: BoardImage,
	args: {
		src: CASA_DO_RIO_TERRACE,
		alt: "A terrace over the river at dusk",
		width: 200,
		height: 136,
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"An image pasted with no source: the picture alone. Pick `WithSource` when the image came from a page.",
			},
		},
	},
	play: playWithoutSource,
})

export const DefaultDark = meta.story({
	globals: { theme: "dark" },
	play: playWithoutSource,
})

export const WithSource = meta.story({
	args: { source: SOURCE },
	parameters: {
		docs: {
			description: {
				story:
					"An image pasted from a page: the source line under it names the url it came from.",
			},
		},
	},
	play: playWithSource,
})

export const WithSourceDark = meta.story({
	args: { source: SOURCE },
	globals: { theme: "dark" },
	play: playWithSource,
})
