import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { LIBRARY_DOCUMENT } from "@workspace/ui/components/board/board.fixtures"
import { BoardLibraryCard } from "@workspace/ui/components/board/board-library-card"

type PlayContext = { canvasElement: HTMLElement }

const DRAGGING_OPACITY = "0.94"

const playResting = async ({ canvasElement }: PlayContext) => {
	const card = slotIn(canvasElement, "board-library-card")
	const style = getComputedStyle(card)
	await expect(style.rotate === "none" || style.rotate === "").toBe(true)
	await expect(style.opacity).toBe("1")
	await expect(slotIn(card, "board-library-card-meta")).toHaveTextContent(
		"Document · from the Library",
	)
}

const playDragging = async ({ canvasElement }: PlayContext) => {
	const card = slotIn(canvasElement, "board-library-card")
	const style = getComputedStyle(card)
	await expect(style.rotate).toBe("-2deg")
	await expect(style.opacity).toBe(DRAGGING_OPACITY)
}

const meta = preview.meta({
	title: "Board/BoardLibraryCard",
	component: BoardLibraryCard,
	args: LIBRARY_DOCUMENT,
})

export const Resting = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A Library document placed on the board, at rest: upright, opaque, with the link card's resting shadow. Pick `Dragging` while it is carried onto the board.",
			},
		},
	},
	play: playResting,
})

export const RestingDark = meta.story({
	globals: { theme: "dark" },
	play: playResting,
})

export const Dragging = meta.story({
	args: { isDragging: true },
	parameters: {
		docs: {
			description: {
				story:
					"A Library document carried onto the board: tilted two degrees, slightly see-through and lifted on a deeper shadow.",
			},
		},
	},
	play: playDragging,
})

export const DraggingDark = meta.story({
	args: { isDragging: true },
	globals: { theme: "dark" },
	play: playDragging,
})
