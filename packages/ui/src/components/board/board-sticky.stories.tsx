import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	listExhaustively,
	Row,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	AGENT_AUTHOR,
	PERSON_AUTHOR,
	STICKY_TEXT,
} from "@workspace/ui/components/board/board.fixtures"
import {
	BoardSticky,
	type BoardStickyProps,
} from "@workspace/ui/components/board/board-sticky"
import type { BoardStickyColour } from "@workspace/ui/foundations/board-palette"

const STICKY_COLOURS = listExhaustively<BoardStickyColour>({
	yellow: true,
	green: true,
	pink: true,
	blue: true,
	orange: true,
})

const STICKY_FILL: Record<BoardStickyColour, string> = {
	yellow: "rgb(255, 229, 143)",
	green: "rgb(194, 235, 180)",
	pink: "rgb(255, 201, 222)",
	blue: "rgb(188, 216, 255)",
	orange: "rgb(255, 211, 168)",
}

const STICKY_FOREGROUND = "rgb(26, 26, 26)"

const LONG_STICKY_TEXT =
	"Draft the launch plan before Friday, list every open question for the pricing page, check the onboarding copy with the support team, and book a review with design for the new empty states."

type PlayContext = { canvasElement: HTMLElement }

const meta = preview.meta({
	title: "Board/BoardSticky",
	component: BoardSticky,
	args: {
		colour: "yellow",
		text: STICKY_TEXT,
		author: AGENT_AUTHOR,
	} satisfies BoardStickyProps,
})

const playColours = async ({ canvasElement }: PlayContext) => {
	const stickies = slotsIn(canvasElement, "board-sticky")
	await expect(stickies).toHaveLength(STICKY_COLOURS.length)
	for (const sticky of stickies) {
		const colour = sticky.dataset.colour as BoardStickyColour
		const style = getComputedStyle(sticky)
		await expect(style.backgroundColor, `${colour} fill`).toBe(
			STICKY_FILL[colour],
		)
		await expect(style.color, `${colour} foreground`).toBe(STICKY_FOREGROUND)
	}
}

const playAgentAuthor = async ({ canvasElement }: PlayContext) => {
	const author = slotIn(canvasElement, "board-sticky-author")
	await expect(slotsIn(author, "bot-identity-avatar")).toHaveLength(1)
	await expect(slotsIn(author, "user-avatar")).toHaveLength(0)
}

const playPersonAuthor = async ({ canvasElement }: PlayContext) => {
	const author = slotIn(canvasElement, "board-sticky-author")
	const avatar = slotIn(author, "user-avatar")
	await expect(slotsIn(author, "bot-identity-avatar")).toHaveLength(0)
	await expect(getComputedStyle(avatar).borderTopLeftRadius).not.toBe("0px")
}

const playLongContent = async ({ canvasElement }: PlayContext) => {
	const sticky = slotIn(canvasElement, "board-sticky")
	const text = slotIn(sticky, "board-sticky-text")
	const author = slotIn(sticky, "board-sticky-author")
	const lineHeight = Number.parseFloat(getComputedStyle(text).lineHeight)
	const paddingBottom = Number.parseFloat(
		getComputedStyle(sticky).paddingBottom,
	)
	await expect(text.scrollHeight).toBeGreaterThan(text.clientHeight)
	await expect(
		text.clientHeight % lineHeight,
		"visible text ends on a line box boundary",
	).toBe(0)
	await expect(text.getBoundingClientRect().bottom).toBeLessThanOrEqual(
		author.getBoundingClientRect().top,
	)
	await expect(
		author.getBoundingClientRect().bottom,
		"author chip on the bottom edge",
	).toBe(sticky.getBoundingClientRect().bottom - paddingBottom)
	await expect(author).toBeVisible()
}

const renderColours = () => (
	<Row>
		{STICKY_COLOURS.map((colour) => (
			<BoardSticky
				author={AGENT_AUTHOR}
				colour={colour}
				key={colour}
				text={STICKY_TEXT}
			/>
		))}
	</Row>
)

export const Colours = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The five sticky colours. A sticky paints the same fill and ink in both themes: compare with `ColoursDark`, the play holds every fill and foreground to the same values there.",
			},
		},
	},
	render: renderColours,
	play: playColours,
})

export const ColoursDark = meta.story({
	globals: { theme: "dark" },
	render: renderColours,
	play: playColours,
})

export const AgentAuthor = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A sticky an agent wrote: the author chip carries the hexagonal agent avatar. Pick `PersonAuthor` for a sticky a person wrote.",
			},
		},
	},
	play: playAgentAuthor,
})

export const AgentAuthorDark = meta.story({
	globals: { theme: "dark" },
	play: playAgentAuthor,
})

export const PersonAuthor = meta.story({
	args: { colour: "green", author: PERSON_AUTHOR },
	parameters: {
		docs: {
			description: {
				story:
					"A sticky a person wrote: the author chip carries round initials, never the hexagon an agent wears.",
			},
		},
	},
	play: playPersonAuthor,
})

export const PersonAuthorDark = meta.story({
	args: { colour: "green", author: PERSON_AUTHOR },
	globals: { theme: "dark" },
	play: playPersonAuthor,
})

export const LongContent = meta.story({
	args: { colour: "pink", text: LONG_STICKY_TEXT, author: AGENT_AUTHOR },
	parameters: {
		docs: {
			description: {
				story:
					"Text longer than the sticky holds. Check it clips above the author chip and the chip stays whole at the bottom.",
			},
		},
	},
	play: playLongContent,
})

export const LongContentDark = meta.story({
	args: { colour: "pink", text: LONG_STICKY_TEXT, author: AGENT_AUTHOR },
	globals: { theme: "dark" },
	play: playLongContent,
})
