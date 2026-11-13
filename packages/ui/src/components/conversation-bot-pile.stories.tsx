import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectGlazeBorders,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ConversationBotPile } from "@workspace/ui/components/conversation-bot-pile"
import type { GlazeTheme } from "@workspace/ui/components/glaze-border"
import { SidebarListRow } from "@workspace/ui/components/sidebar-list-row"
import {
	SidebarMenu,
	SidebarMenuItem,
	SidebarProvider,
} from "@workspace/ui/components/ui/sidebar"

const BOTS = [
	{ id: "atlas", name: "Atlas", blot: BLOT_HUES.blue },
	{ id: "beacon", name: "Beacon", blot: BLOT_HUES.yellow },
	{ id: "cinder", name: "Cinder", blot: BLOT_HUES.red },
	{ id: "dune", name: "Dune", blot: BLOT_HUES.green },
	{ id: "ember", name: "Ember", blot: BLOT_HUES.pink },
] as const

const meta = preview.meta({
	title: "Navigation/ConversationBotPile",
	component: ConversationBotPile,
	parameters: {
		docs: {
			description: {
				component:
					"The bots of a conversation as a row of 14px hexagons on a 16px line, 10px apart. Each later hexagon sits over the earlier one behind a 1.5px knockout cut through to whatever lies beneath, so the ring always wears the row's own colour. Four bots or more show two and a counter. Every hexagon wears the compact C edge, a translucent line inside its outline.",
			},
		},
	},
})

const widthOf = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "conversation-bot-pile").getBoundingClientRect().width

const leftsOf = (canvasElement: HTMLElement) => {
	const origin = slotIn(
		canvasElement,
		"conversation-bot-pile",
	).getBoundingClientRect().left
	return slotsIn(
		slotIn(canvasElement, "conversation-bot-pile"),
		"conversation-bot-pile-bot",
	).map((slot) => slot.getBoundingClientRect().left - origin)
}

const coveredIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "conversation-bot-pile-bot").map((slot) =>
		getComputedStyle(slot).maskComposite.startsWith("exclude"),
	)

export const OneBot = meta.story({
	args: { bots: BOTS.slice(0, 1) },
	play: async ({ canvasElement }) => {
		await expect(leftsOf(canvasElement)).toEqual([0])
		await expect(widthOf(canvasElement)).toBe(14)
		await expect(coveredIn(canvasElement)).toEqual([false])
	},
})

export const TwoBots = meta.story({
	args: { bots: BOTS.slice(0, 2) },
	play: async ({ canvasElement }) => {
		await expect(leftsOf(canvasElement)).toEqual([0, 10])
		await expect(widthOf(canvasElement)).toBe(24)
		await expect(coveredIn(canvasElement)).toEqual([true, false])
	},
})

export const ThreeBots = meta.story({
	args: { bots: BOTS.slice(0, 3) },
	play: async ({ canvasElement }) => {
		await expect(leftsOf(canvasElement)).toEqual([0, 10, 20])
		await expect(widthOf(canvasElement)).toBe(34)
		await expect(coveredIn(canvasElement)).toEqual([true, true, false])
		await expect(
			canvasElement.querySelector(
				'[data-slot="conversation-bot-pile-overflow"]',
			),
		).toBeNull()
		await expect(
			slotIn(canvasElement, "conversation-bot-pile"),
		).toHaveAttribute("aria-hidden", "true")
		await expect(within(canvasElement).queryByRole("img")).toBeNull()
	},
})

export const FiveBotsShowTwoAndACounter = meta.story({
	args: { bots: [...BOTS] },
	play: async ({ canvasElement }) => {
		const pile = slotIn(canvasElement, "conversation-bot-pile")
		const overflow = slotIn(pile, "conversation-bot-pile-overflow")
		await expect(leftsOf(canvasElement)).toEqual([0, 10])
		await expect(coveredIn(canvasElement)).toEqual([true, true])
		await expect(widthOf(canvasElement)).toBe(34)
		await expect(overflow).toHaveTextContent("+3")
		await expect(pile).not.toHaveAttribute("aria-hidden")
		await expect(within(canvasElement).getByRole("img", { name: "+3" })).toBe(
			pile,
		)
		const counter = overflow.querySelector("text") as SVGTextElement
		await expect(getComputedStyle(counter).fontVariantNumeric).toBe(
			"tabular-nums",
		)
		await expect(getComputedStyle(counter).fontWeight).toBe("700")
	},
})

const expectEdgedMembers = async (
	canvasElement: HTMLElement,
	theme: GlazeTheme,
) => {
	await expect(slotsIn(canvasElement, "outlined-hexagon")).toHaveLength(3)
	await expect(coveredIn(canvasElement)).toEqual([true, true])
	await expectGlazeBorders(canvasElement, theme)
}

export const EdgedMembers = meta.story({
	args: { bots: [...BOTS] },
	parameters: {
		docs: {
			description: {
				story:
					"A five bot pile: each member and the counter wear the compact C edge, no lip, and the pile keeps its knockout. Pick `EdgedMembersDark` for the dark theme.",
			},
		},
	},
	play: ({ canvasElement }) => expectEdgedMembers(canvasElement, "light"),
})

export const EdgedMembersDark = meta.story({
	globals: { theme: "dark" },
	args: { bots: [...BOTS] },
	parameters: {
		docs: {
			description: {
				story: "The same pile in the dark theme, edged in white.",
			},
		},
	},
	play: ({ canvasElement }) => expectEdgedMembers(canvasElement, "dark"),
})

const ROW_PILES = [BOTS.slice(0, 1), BOTS.slice(0, 2), [...BOTS]]

const PILE_ROWS = [false, true].flatMap((isSelected) =>
	ROW_PILES.map((bots) => ({
		bots,
		isSelected,
		name: `${isSelected ? "Selected" : "Resting"} row of ${bots.length}`,
	})),
)

const PilesOnRowsBoard = () => (
	<SidebarProvider className="min-h-0 w-70">
		<SidebarMenu className="gap-px">
			{PILE_ROWS.map(({ bots, isSelected, name }) => (
				<SidebarMenuItem key={name}>
					<SidebarListRow
						geometry="compact"
						isActive={isSelected}
						name={name}
						previewTrailing={<ConversationBotPile bots={bots} isCompact />}
						timestamp="1h"
					/>
				</SidebarMenuItem>
			))}
		</SidebarMenu>
	</SidebarProvider>
)

const itemsOf = (pile: HTMLElement) => [
	...slotsIn(pile, "conversation-bot-pile-bot"),
	...slotsIn(pile, "conversation-bot-pile-overflow"),
]

const drawnBoxOf = (item: HTMLElement) => {
	const slot = item.getBoundingClientRect()
	const edge = slotIn(item, "outlined-hexagon").getBoundingClientRect()
	return [edge.width, edge.height, edge.left - slot.left, edge.top - slot.top]
}

const edgeOf = (item: HTMLElement, theme: GlazeTheme) => {
	const edge = getComputedStyle(
		item.querySelector(
			`[data-theme="${theme}"] [data-slot="outlined-hexagon-edge"]`,
		) as Element,
	)
	return [edge.stroke, edge.strokeOpacity, edge.strokeWidth]
}

const expectPilesOnRows = async (
	canvasElement: HTMLElement,
	theme: GlazeTheme,
) => {
	const piles = slotsIn(canvasElement, "conversation-bot-pile")
	await expect(piles.map((pile) => itemsOf(pile).length)).toEqual([
		1, 2, 3, 1, 2, 3,
	])
	const rows = slotsIn(canvasElement, "sidebar-menu-button")
	await expect(rows.map((row) => row.hasAttribute("aria-current"))).toEqual([
		false,
		false,
		false,
		true,
		true,
		true,
	])
	const first = itemsOf(piles[1])[0]
	for (const pile of piles) {
		const items = itemsOf(pile)
		for (const item of items) {
			await expect(drawnBoxOf(item)).toEqual([14, 14, 0, 0])
			await expect(drawnBoxOf(item)).toEqual(drawnBoxOf(first))
			await expect(edgeOf(item, theme)).toEqual(edgeOf(first, theme))
			await expect(
				slotIn(item, "outlined-hexagon").getBoundingClientRect().right,
			).toBeLessThanOrEqual(pile.getBoundingClientRect().right)
		}
		await expect(
			items.map((item) =>
				getComputedStyle(item).maskComposite.startsWith("exclude"),
			),
		).toEqual(items.map((_item, rank) => rank < items.length - 1))
	}
}

const PILES_ON_ROWS =
	"Three piles, one avatar, two avatars, two avatars and a counter, on three compact sidebar rows at rest and on three selected ones. Check the last item of every pile, a lone avatar and the counter included, draws its edge in the 14px box of its hexagon like the first item, with the same stroke, nothing reaching past the pile, and that every item but the last keeps its knockout."

export const PilesOnRows = meta.story({
	render: () => <PilesOnRowsBoard />,
	parameters: { docs: { description: { story: PILES_ON_ROWS } } },
	play: ({ canvasElement }) => expectPilesOnRows(canvasElement, "light"),
})

export const PilesOnRowsDark = meta.story({
	globals: { theme: "dark" },
	render: () => <PilesOnRowsBoard />,
	parameters: {
		docs: {
			description: { story: `${PILES_ON_ROWS} Dark theme.` },
		},
	},
	play: ({ canvasElement }) => expectPilesOnRows(canvasElement, "dark"),
})
