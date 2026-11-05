import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	EMPTY_BOARD_SNAPSHOT,
	PLANNING_BOARD_SNAPSHOT,
	REFERENCES_BOARD_SNAPSHOT,
} from "@workspace/ui/components/board/board.fixtures"
import { BoardMiniature } from "@workspace/ui/components/board/board-miniature"

type PlayContext = { canvasElement: HTMLElement }

const MARGIN = 20
const SUBPIXEL = 1

const expectFittedWithMargin = async ({ canvasElement }: PlayContext) => {
	const miniature = slotIn(canvasElement, "board-miniature")
	await expect(miniature).toHaveAttribute("aria-hidden", "true")
	await expect(getComputedStyle(miniature).pointerEvents).toBe("none")
	await waitFor(() =>
		expect(slotsIn(miniature, "board-miniature-object").length).toBeGreaterThan(
			0,
		),
	)

	const frame = miniature.getBoundingClientRect()
	const drawn = slotsIn(miniature, "board-miniature-object").flatMap(
		(object) => [object, ...Array.from(object.children)],
	)
	const rects = drawn.map((element) => element.getBoundingClientRect())
	for (const rect of rects) {
		await expect(rect.left).toBeGreaterThanOrEqual(
			frame.left + MARGIN - SUBPIXEL,
		)
		await expect(rect.top).toBeGreaterThanOrEqual(frame.top + MARGIN - SUBPIXEL)
		await expect(rect.right).toBeLessThanOrEqual(
			frame.right - MARGIN + SUBPIXEL,
		)
		await expect(rect.bottom).toBeLessThanOrEqual(
			frame.bottom - MARGIN + SUBPIXEL,
		)
	}

	const left = Math.min(...rects.map((rect) => rect.left)) - frame.left
	const right = frame.right - Math.max(...rects.map((rect) => rect.right))
	const top = Math.min(...rects.map((rect) => rect.top)) - frame.top
	const bottom = frame.bottom - Math.max(...rects.map((rect) => rect.bottom))
	await expect(Math.abs(left - right)).toBeLessThanOrEqual(SUBPIXEL)
	await expect(Math.abs(top - bottom)).toBeLessThanOrEqual(SUBPIXEL)
	await expect(Math.min(left, top)).toBeCloseTo(MARGIN, 0)
}

const expectGroundAlone = async ({ canvasElement }: PlayContext) => {
	const miniature = slotIn(canvasElement, "board-miniature")
	await expect(slotIn(miniature, "board-dot-grid")).toBeVisible()
	await expect(slotsIn(miniature, "board-miniature-object")).toHaveLength(0)
}

const meta = preview.meta({
	title: "Board/BoardMiniature",
	component: BoardMiniature,
	args: { snapshot: PLANNING_BOARD_SNAPSHOT },
	parameters: {
		docs: {
			description: {
				component:
					"A board drawn small, from its snapshot, with the board objects themselves: the bounds fit the box it fills with a 20px margin, centred and never magnified, over the board dot grid at a 12px pitch. Decorative: hidden from assistive technology and from the pointer.",
			},
		},
	},
	render: (args) => (
		<div className="relative h-45 w-[271px] overflow-hidden rounded-control border border-shell-border bg-board-surface">
			<BoardMiniature {...args} />
		</div>
	),
})

export const WideBoard = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A board wider than the preview: it fits the width with 20px either side and centres vertically.",
			},
		},
	},
	play: expectFittedWithMargin,
})

export const WideBoardDark = meta.story({
	globals: { theme: "dark" },
	play: expectFittedWithMargin,
})

export const EveryObjectKind = meta.story({
	args: { snapshot: REFERENCES_BOARD_SNAPSHOT },
	parameters: {
		docs: {
			description: {
				story:
					"An image, a link card, a Library card, a sticky and an ellipse, each drawn whole inside the margin.",
			},
		},
	},
	play: expectFittedWithMargin,
})

export const EveryObjectKindDark = EveryObjectKind.extend({
	globals: { theme: "dark" },
})

export const EmptyBoard = meta.story({
	args: { snapshot: EMPTY_BOARD_SNAPSHOT },
	parameters: {
		docs: {
			description: {
				story: "A board with nothing on it: the dot grid ground alone.",
			},
		},
	},
	play: expectGroundAlone,
})

export const EmptyBoardDark = EmptyBoard.extend({
	globals: { theme: "dark" },
})
