import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	JUNIPER,
	SPACE_COMPANIONS,
} from "@workspace/ui/components/space-settings-dialog/companions.fixtures"
import { CompanionsSection } from "@workspace/ui/components/space-settings-dialog/companions-section"

const CARD_WIDTH = 312

const cardsIn = (root: HTMLElement) => slotsIn(root, "companion-card")

const meta = preview.meta({
	title: "Settings/Space/CompanionsSection",
	component: CompanionsSection,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Every companion of a space, as cards two to a row under a muted title, a caption naming the space and Create a companion. A card shows the companion's avatar, name and title, two lines of its instructions, how many skills and applications it carries and how it answers a request. The whole card is one button that reports the companion picked.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-160">
				<Story />
			</div>
		),
	],
	args: {
		companions: SPACE_COMPANIONS,
		spaceName: "Release desk",
		onSelect: fn(),
		onCreate: fn(),
	},
})

export const FourCompanions = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H01: four companions in two columns of 312. Check the counts, the approval mode on the right of each footer, cards of one row at the same height, and that a card and Create a companion each report themselves.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const canvas = within(canvasElement)
		const cards = cardsIn(canvasElement)

		await expect(cards).toHaveLength(4)
		await expect(
			canvas.getByRole("heading", { level: 2, name: "Companions" }),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"Every companion in Release desk. Pick one to change how it works.",
			),
		).toBeVisible()
		await expect(canvas.getByText("3 skills · 2 applications")).toBeVisible()
		await expect(canvas.getByText("1 skill · 1 application")).toBeVisible()
		await expect(canvas.getByText("5 skills · no applications")).toBeVisible()
		await expect(canvas.getByText("Ask every time")).toBeVisible()
		await expect(canvas.getByText("Plan first")).toBeVisible()

		for (const card of cards) {
			await expect(card.getBoundingClientRect().width).toBe(CARD_WIDTH)
		}
		await expect(cards[0].getBoundingClientRect().height).toBe(
			cards[1].getBoundingClientRect().height,
		)
		await expect(cards[2].getBoundingClientRect().top).toBeGreaterThan(
			cards[0].getBoundingClientRect().bottom,
		)

		const excerpt = slotIn(cards[0], "companion-card-excerpt")
		await expect(excerpt).toHaveClass("line-clamp-2")
		await expect(excerpt.scrollHeight).toBeGreaterThan(excerpt.clientHeight)

		await userEvent.click(cards[1])
		await expect(args.onSelect).toHaveBeenCalledWith("atlas")

		await userEvent.click(
			canvas.getByRole("button", { name: "Create a companion" }),
		)
		await expect(args.onCreate).toHaveBeenCalledOnce()
	},
})

export const OneCompanion = meta.story({
	args: { companions: [JUNIPER] },
	parameters: {
		docs: {
			description: {
				story:
					"A space with a single companion. Check that the card keeps its 312 width instead of stretching across the row.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const cards = cardsIn(canvasElement)

		await expect(cards).toHaveLength(1)
		await expect(cards[0].getBoundingClientRect().width).toBe(CARD_WIDTH)
	},
})

export const NoCompanion = meta.story({
	args: { companions: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A space with no companion yet. Check that the title, the caption and Create a companion stay, and one muted line takes the place of the cards.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const canvas = within(canvasElement)

		await expect(cardsIn(canvasElement)).toHaveLength(0)
		await expect(canvas.queryByRole("list")).toBeNull()
		await expect(
			canvas.getByText("No companions in this space yet."),
		).toBeVisible()
		await expect(
			canvas.getByRole("heading", { level: 2, name: "Companions" }),
		).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Create a companion" }),
		)
		await expect(args.onCreate).toHaveBeenCalledOnce()
	},
})

export const HoveredCard = meta.story({
	globals: { theme: "dark" },
	parameters: {
		pseudo: { hover: "li:first-child > [data-slot=companion-card]" },
		docs: {
			description: {
				story:
					"Juniper under the pointer, as drawn on H01. Check that its card sits on the full muted surface while the others keep the lighter one, with no colour transition.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [hovered] = cardsIn(canvasElement)

		await expect(hovered).toHaveClass("bg-muted/40", "hover:bg-muted")
		await expect(getComputedStyle(hovered).transitionDuration).toBe("0s")
	},
})

export const KeyboardFocus = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A card reached by the keyboard. Check that Tab lands on the first card after Create a companion, that it wears the focus ring, and that Enter and Space both pick it.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const [first] = cardsIn(canvasElement)

		await userEvent.tab()
		await userEvent.tab()
		await expect(first).toHaveFocus()
		await expect(getComputedStyle(first).boxShadow).not.toBe("none")

		await userEvent.keyboard("{Enter}")
		await userEvent.keyboard(" ")
		await expect(args.onSelect).toHaveBeenNthCalledWith(1, "juniper")
		await expect(args.onSelect).toHaveBeenNthCalledWith(2, "juniper")
	},
})

export const LongNameAndTitle = meta.story({
	args: {
		companions: [
			{
				...JUNIPER,
				name: "Juniper the long-winded release notes companion",
				title: "Writer of every changelog and announcement",
			},
			SPACE_COMPANIONS[1],
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A name and a title longer than the card. Check that both stay on one line, cut with an ellipsis, inside the 312 card.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [card] = cardsIn(canvasElement)
		const name = slotIn(card, "companion-card-name")
		const title = slotIn(card, "bot-title-badge")

		await expect(card.getBoundingClientRect().width).toBe(CARD_WIDTH)
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(name.getBoundingClientRect().height).toBe(20)
		await expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(
			card.getBoundingClientRect().right,
		)
	},
})
