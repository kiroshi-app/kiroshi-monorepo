import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectGlazeBorders,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ConversationBotPile } from "@workspace/ui/components/conversation-bot-pile"

const BOTS = [
	{ id: "atlas", name: "Atlas", blot: "blue" },
	{ id: "beacon", name: "Beacon", blot: "yellow" },
	{ id: "cinder", name: "Cinder", blot: "red" },
	{ id: "dune", name: "Dune", blot: "green" },
	{ id: "ember", name: "Ember", blot: "pink" },
] as const

const meta = preview.meta({
	title: "Navigation/ConversationBotPile",
	component: ConversationBotPile,
	parameters: {
		docs: {
			description: {
				component:
					"The bots of a conversation as a row of 14px hexagons on a 16px line, 10px apart. Each later hexagon sits over the earlier one behind a 1.5px knockout cut through to whatever lies beneath, so the ring always wears the row's own colour. Four bots or more show two and a counter. Every hexagon wears the compact C edge, a translucent line inside its outline. The `side-by-side` layout, worn by the Needs you line, draws 16px hexagons 2px apart with no overlap or knockout.",
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

const sideBySideBoxesOf = (canvasElement: HTMLElement) => {
	const pile = slotIn(canvasElement, "conversation-bot-pile")
	const origin = pile.getBoundingClientRect().left
	return [
		...slotsIn(pile, "conversation-bot-pile-bot"),
		...slotsIn(pile, "conversation-bot-pile-overflow"),
	].map((slot) => {
		const box = slot.getBoundingClientRect()
		return [box.left - origin, box.width, box.height]
	})
}

export const SideBySideThreeBots = meta.story({
	args: { bots: BOTS.slice(0, 3), layout: "side-by-side" },
	play: async ({ canvasElement }) => {
		await expect(sideBySideBoxesOf(canvasElement)).toEqual([
			[0, 16, 16],
			[18, 16, 16],
			[36, 16, 16],
		])
		await expect(widthOf(canvasElement)).toBe(52)
		await expect(coveredIn(canvasElement)).toEqual([false, false, false])
		await expect(
			slotIn(canvasElement, "conversation-bot-pile"),
		).toHaveAttribute("aria-hidden", "true")
	},
})

export const SideBySideFiveBotsShowTwoAndACounter = meta.story({
	args: { bots: [...BOTS], layout: "side-by-side" },
	play: async ({ canvasElement }) => {
		const pile = slotIn(canvasElement, "conversation-bot-pile")
		await expect(sideBySideBoxesOf(canvasElement)).toEqual([
			[0, 16, 16],
			[18, 16, 16],
			[36, 16, 16],
		])
		await expect(coveredIn(canvasElement)).toEqual([false, false])
		await expect(
			slotIn(pile, "conversation-bot-pile-overflow"),
		).toHaveTextContent("+3")
		await expect(within(canvasElement).getByRole("img", { name: "+3" })).toBe(
			pile,
		)
	},
})

const BothLayouts = () => (
	<span className="flex flex-col gap-3">
		<ConversationBotPile bots={[...BOTS]} />
		<ConversationBotPile bots={[...BOTS]} layout="side-by-side" />
	</span>
)

const expectEdgedMembers = async (
	canvasElement: HTMLElement,
	theme: "light" | "dark",
) => {
	const [overlapping, sideBySide] = slotsIn(
		canvasElement,
		"conversation-bot-pile",
	)
	await expect(slotsIn(overlapping, "outlined-hexagon")).toHaveLength(3)
	await expect(slotsIn(sideBySide, "outlined-hexagon")).toHaveLength(3)
	await expect(coveredIn(overlapping)).toEqual([true, true])
	await expectGlazeBorders(canvasElement, theme)
}

export const EdgedMembers = meta.story({
	render: () => <BothLayouts />,
	parameters: {
		docs: {
			description: {
				story:
					"Both layouts of a five bot pile: each member and the counter wear the compact C edge, no lip, and the overlapping layout keeps its knockout. Pick `EdgedMembersDark` for the dark theme.",
			},
		},
	},
	play: ({ canvasElement }) => expectEdgedMembers(canvasElement, "light"),
})

export const EdgedMembersDark = meta.story({
	globals: { theme: "dark" },
	render: () => <BothLayouts />,
	parameters: {
		docs: {
			description: {
				story: "The same piles in the dark theme, edged in white.",
			},
		},
	},
	play: ({ canvasElement }) => expectEdgedMembers(canvasElement, "dark"),
})
