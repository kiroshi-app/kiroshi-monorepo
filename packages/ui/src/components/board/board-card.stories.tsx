import { useState } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	resolvedRootColor,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	AGENT_AUTHOR,
	BOARD_CARD_TITLE,
	DRAWING_AGENT,
	DRAWING_AGENT_POINTER,
	PLANNING_BOARD_SNAPSHOT,
	STICKY_TEXT,
} from "@workspace/ui/components/board/board.fixtures"
import {
	BoardCard,
	type BoardCardProps,
} from "@workspace/ui/components/board/board-card"
import type { BoardSnapshot } from "@workspace/ui/components/board/board-miniature"

type PlayContext = { canvasElement: HTMLElement }

const INTRO = "I put the launch week on a board."
const DRAWING_LINE = "Board · Atlas is drawing · 6 items"
const AT_REST_LINE = "Board · 14 items · edited just now"
const NARROW_COLUMN = 432
const LONG_TITLE =
	"Launch week plan for the spring release across support, sales and the docs team"
const TITLE_LINE_HEIGHT = 20

const DRAWING: Partial<BoardCardProps> = {
	itemCount: 6,
	drawing: { agent: DRAWING_AGENT, objectId: "planning-ship" },
}

const AT_REST: Partial<BoardCardProps> = {
	itemCount: 14,
	drawing: undefined,
}

const cardOf = (root: HTMLElement, line: string) =>
	within(root).getByRole("article", { name: `${BOARD_CARD_TITLE} ${line}` })

const expectDrawing = async ({ canvasElement }: PlayContext) => {
	const card = cardOf(canvasElement, DRAWING_LINE)
	await expect(slotIn(card, "board-card-line")).toHaveTextContent(DRAWING_LINE)
	await waitFor(() => expect(slotsIn(card, "board-pointer")).toHaveLength(1))
	const pointers = slotsIn(card, "board-pointer")
	await expect(slotIn(pointers[0], "board-pointer-name")).toHaveTextContent(
		DRAWING_AGENT.name,
	)
	await expect(slotsIn(card, "board-object-outline")).toHaveLength(1)
	const miniature = slotIn(card, "board-miniature")
	await expect(miniature.inert).toBe(true)
	await expect(getComputedStyle(miniature).pointerEvents).toBe("none")
}

const expectAtRest = async ({ canvasElement }: PlayContext) => {
	const card = cardOf(canvasElement, AT_REST_LINE)
	await expect(slotIn(card, "board-card-line")).toHaveTextContent(AT_REST_LINE)
	await waitFor(() =>
		expect(slotsIn(card, "board-miniature-object")).toHaveLength(
			PLANNING_BOARD_SNAPSHOT.objects.length,
		),
	)
	await expect(slotsIn(card, "board-pointer")).toHaveLength(0)
	await expect(slotsIn(card, "board-object-outline")).toHaveLength(0)
}

const expectOpenBeside = async ({ canvasElement }: PlayContext) => {
	const card = slotIn(canvasElement, "board-card")
	const style = getComputedStyle(card)
	await expect(style.borderTopWidth).toBe("2px")
	await expect(style.borderTopColor).toBe(resolvedRootColor("--primary"))
	await expect(style.borderTopLeftRadius).toBe("12px")
}

const expectLongTitleWraps = async ({ canvasElement }: PlayContext) => {
	const card = slotIn(canvasElement, "board-card")
	const title = slotIn(card, "board-card-title")
	const open = within(card).getByRole("button", {
		name: "Open",
		description: LONG_TITLE,
	})
	await expect(title.getBoundingClientRect().height).toBeGreaterThan(
		TITLE_LINE_HEIGHT,
	)
	await expect(open.getBoundingClientRect().top).toBe(
		slotIn(card, "board-glyph").getBoundingClientRect().top,
	)
	await expect(open.scrollWidth).toBeLessThanOrEqual(open.clientWidth)
	await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
}

const meta = preview.meta({
	title: "Board/BoardCard",
	component: BoardCard,
	args: {
		title: BOARD_CARD_TITLE,
		editedLabel: "edited just now",
		snapshot: PLANNING_BOARD_SNAPSHOT,
		pointers: [DRAWING_AGENT_POINTER],
		onOpen: fn(),
		...DRAWING,
	},
	parameters: {
		docs: {
			description: {
				component:
					"A board posted in a message, live: the board glyph, the title, the line that says who draws or when it was last edited, Open, and the board itself drawn small with the same object components as the canvas, fitted to a 184px preview and inert. While an agent draws, its pointer and the ring on the object it draws move inside the preview. The card wears a 2px ring in the Space colour while its board is open beside the thread.",
			},
		},
	},
	render: (args) => (
		<AgentAnswerFrame intro={INTRO}>
			<BoardCard {...args} />
		</AgentAnswerFrame>
	),
})

export const Drawing = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Atlas draws on the board, as artboard 2a draws it. Check the line naming Atlas and the item count, Atlas's arrow and name tag in the preview, the ring on the shape it draws, and Open calling back once on a click, then once on Enter and once on Space.",
			},
		},
	},
	play: async (context) => {
		await expectDrawing(context)
		const open = within(context.canvasElement).getByRole("button", {
			name: "Open",
			description: BOARD_CARD_TITLE,
		})
		await userEvent.click(open)
		await expect(context.args.onOpen).toHaveBeenCalledOnce()
		await userEvent.keyboard("{Enter}")
		await expect(context.args.onOpen).toHaveBeenCalledTimes(2)
		await userEvent.keyboard(" ")
		await expect(context.args.onOpen).toHaveBeenCalledTimes(3)
	},
})

export const DrawingDark = meta.story({
	globals: { theme: "dark" },
	play: expectDrawing,
})

export const AtRest = meta.story({
	args: AT_REST,
	parameters: {
		docs: {
			description: {
				story:
					"Nobody draws, as artboard 2b draws it. Check the line with the item count and when the board was last edited, and no pointer and no ring in the preview, even with a pointer passed in.",
			},
		},
	},
	play: async (context) => {
		await expectAtRest(context)
		await expect(
			within(context.canvasElement).getByRole("button", { name: "Open" }),
		).toHaveAccessibleDescription(BOARD_CARD_TITLE)
	},
})

export const AtRestDark = meta.story({
	args: AT_REST,
	globals: { theme: "dark" },
	play: expectAtRest,
})

export const OpenBeside = meta.story({
	args: { isOpenBeside: true },
	parameters: {
		docs: {
			description: {
				story:
					"The board of the card open beside the thread, as artboard 3a draws the card. Check the 2px ring in the Space colour at the 12px radius, with the content not moving from where Drawing puts it.",
			},
		},
	},
	play: expectOpenBeside,
})

export const OpenBesideDark = meta.story({
	args: { isOpenBeside: true },
	globals: { theme: "dark" },
	play: expectOpenBeside,
})

const longTitleRender = (args: BoardCardProps) => (
	<AgentAnswerFrame intro={INTRO} width={NARROW_COLUMN}>
		<BoardCard {...args} />
	</AgentAnswerFrame>
)

export const LongTitle = meta.story({
	args: { title: LONG_TITLE },
	render: longTitleRender,
	parameters: {
		docs: {
			description: {
				story:
					"A long title in a 432 column. Check the title wrapping on two lines, the line wrapping under it, and Open staying whole on the first row.",
			},
		},
	},
	play: expectLongTitleWraps,
})

export const LongTitleDark = meta.story({
	args: { title: LONG_TITLE },
	globals: { theme: "dark" },
	render: longTitleRender,
	play: expectLongTitleWraps,
})

const MOVED_POINTER = { ...DRAWING_AGENT_POINTER, position: { x: 120, y: 80 } }

const GROWN_SNAPSHOT: BoardSnapshot = {
	...PLANNING_BOARD_SNAPSHOT,
	objects: [
		...PLANNING_BOARD_SNAPSHOT.objects,
		{
			kind: "sticky",
			x: 620,
			y: 0,
			width: 80,
			height: 80,
			props: { colour: "orange", text: STICKY_TEXT, author: AGENT_AUTHOR },
		},
	],
}

const LiveCard = (args: BoardCardProps) => {
	const [isMoved, setMoved] = useState(false)
	return (
		<AgentAnswerFrame intro={INTRO}>
			<BoardCard
				{...args}
				pointers={[isMoved ? MOVED_POINTER : DRAWING_AGENT_POINTER]}
				snapshot={isMoved ? GROWN_SNAPSHOT : PLANNING_BOARD_SNAPSHOT}
			/>
			<button onClick={() => setMoved(true)} type="button">
				Move Atlas
			</button>
		</AgentAnswerFrame>
	)
}

export const UpdatesInPlace = meta.story({
	tags: ["test-only"],
	render: (args) => <LiveCard {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Atlas moves and adds a sticky while the card is on screen. Check that the card and its preview stay the same nodes while the pointer moves and the new object appears.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const card = slotIn(canvasElement, "board-card")
		const miniature = slotIn(card, "board-miniature")
		await waitFor(() => expect(slotsIn(card, "board-pointer")).toHaveLength(1))
		const before = slotIn(card, "board-pointer").style.transform
		await userEvent.click(
			within(canvasElement).getByRole("button", { name: "Move Atlas" }),
		)
		await expect(slotIn(canvasElement, "board-card")).toBe(card)
		await expect(slotIn(card, "board-miniature")).toBe(miniature)
		await expect(slotIn(card, "board-pointer").style.transform).not.toBe(before)
		await expect(slotsIn(card, "board-miniature-object")).toHaveLength(
			GROWN_SNAPSHOT.objects.length,
		)
	},
})
