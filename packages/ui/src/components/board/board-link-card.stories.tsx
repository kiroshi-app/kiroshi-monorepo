import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { LINK_CARD } from "@workspace/ui/components/board/board.fixtures"
import { BoardLinkCard } from "@workspace/ui/components/board/board-link-card"

type PlayContext = { canvasElement: HTMLElement }

const LONG_LINK = {
	title:
		"Designing calm interfaces for busy teams who share one workspace across every timezone",
	description:
		"How quiet defaults, fewer modes and honest empty states keep a shared workspace readable as it grows, with notes from six teams who moved their planning onto one board and the habits that stuck.",
}

const playTruncates = async ({ canvasElement }: PlayContext) => {
	const title = slotIn(canvasElement, "board-link-card-title")
	const description = slotIn(canvasElement, "board-link-card-description")
	await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
	await expect(getComputedStyle(title).textOverflow).toBe("ellipsis")
	await expect(description.scrollHeight).toBeGreaterThan(
		description.clientHeight,
	)
	await expect(getComputedStyle(description).webkitLineClamp).toBe("2")
}

const meta = preview.meta({
	title: "Board/BoardLinkCard",
	component: BoardLinkCard,
	args: LINK_CARD,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A link pasted on the board: preview, title, description and source row. Pick `LongContent` to check the title holds one line and the description two.",
			},
		},
	},
})

export const DefaultDark = meta.story({
	globals: { theme: "dark" },
})

export const LongContent = meta.story({
	args: LONG_LINK,
	parameters: {
		docs: {
			description: {
				story:
					"A page whose title and description run long: the title ends on one line with an ellipsis, the description on its second line.",
			},
		},
	},
	play: playTruncates,
})

export const LongContentDark = meta.story({
	args: LONG_LINK,
	globals: { theme: "dark" },
	play: playTruncates,
})
