import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import { BoardText } from "@workspace/ui/components/board/board-text"

type PlayContext = { canvasElement: HTMLElement }

const HEADING = "Launch week"
const BODY =
	"Everything the team needs before Friday: the plan, the open questions and who owns each one."

const expectParts =
	(heading: number, body: number) =>
	async ({ canvasElement }: PlayContext) => {
		await expect(slotsIn(canvasElement, "board-text-heading")).toHaveLength(
			heading,
		)
		await expect(slotsIn(canvasElement, "board-text-body")).toHaveLength(body)
	}

const meta = preview.meta({
	title: "Board/BoardText",
	component: BoardText,
	args: { heading: HEADING, body: BODY },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A text object with its heading and its body. Pick `HeadingOnly` or `BodyOnly` when one of the two is left out.",
			},
		},
	},
	play: expectParts(1, 1),
})

export const DefaultDark = meta.story({
	globals: { theme: "dark" },
	play: expectParts(1, 1),
})

export const HeadingOnly = meta.story({
	args: { heading: HEADING, body: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A text object with a heading and no body: no empty line under it.",
			},
		},
	},
	play: expectParts(1, 0),
})

export const HeadingOnlyDark = meta.story({
	args: { heading: HEADING, body: undefined },
	globals: { theme: "dark" },
	play: expectParts(1, 0),
})

export const BodyOnly = meta.story({
	args: { heading: undefined, body: BODY },
	parameters: {
		docs: {
			description: {
				story: "A text object with a body and no heading: no gap above it.",
			},
		},
	},
	play: expectParts(0, 1),
})

export const BodyOnlyDark = meta.story({
	args: { heading: undefined, body: BODY },
	globals: { theme: "dark" },
	play: expectParts(0, 1),
})
