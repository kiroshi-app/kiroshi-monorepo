import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	JUNIPER,
	SPACE_COMPANIONS,
} from "@workspace/ui/components/space-settings-dialog/companions.fixtures"
import { CompanionsSection } from "@workspace/ui/components/space-settings-dialog/companions-section"

const CARD_WIDTH = 312

const cardsIn = (root: HTMLElement) => slotsIn(root, "companion-card")

const COMPANIONS_WITHOUT_COUNTS = SPACE_COMPANIONS.map((companion) => ({
	...companion,
	skillsCount: undefined,
	applicationsCount: undefined,
}))

const COUNTS_TEXT = /skill|application/

const backgroundOf = (element: Element) =>
	getComputedStyle(element).backgroundColor

const mutedSurfaceIn = (root: HTMLElement) => {
	const probe = document.createElement("span")
	probe.className = "bg-muted"
	root.append(probe)
	const background = backgroundOf(probe)
	probe.remove()
	return background
}

const realPointer = async () => (await import("vitest/browser")).userEvent

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
	args: { spaceName: "Studio" },
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
				"Every companion in Studio. Pick one to change how it works.",
			),
		).toBeVisible()
		await expect(canvas.getByText("3 skills · 2 applications")).toBeVisible()
		await expect(canvas.getByText("5 skills · 1 application")).toBeVisible()
		await expect(canvas.getByText("8 skills · 3 applications")).toBeVisible()
		await expect(canvas.getByText("2 skills · no applications")).toBeVisible()
		await expect(canvas.getAllByText("Accept edits")).toHaveLength(2)
		await expect(canvas.getByText("Plan first")).toBeVisible()
		await expect(canvas.getByText("Ask every time")).toBeVisible()

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

export const NoCounts = meta.story({
	globals: { theme: "dark" },
	args: { companions: COMPANIONS_WITHOUT_COUNTS, spaceName: "Studio" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H01 before the space reports how many skills and applications each companion carries. Check that no count shows, that each footer keeps its top border and the approval mode on the right, and that cards of one row stay at the same height.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const cards = cardsIn(canvasElement)

		await expect(cards).toHaveLength(4)
		await expect(canvas.queryByText(COUNTS_TEXT)).toBeNull()
		await expect(canvas.getAllByText("Accept edits")).toHaveLength(2)
		await expect(canvas.getByText("Plan first")).toBeVisible()
		await expect(canvas.getByText("Ask every time")).toBeVisible()

		for (const card of cards) {
			const mode = slotIn(card, "companion-card-mode")
			const footer = mode.parentElement as HTMLElement
			await expect(footer.childElementCount).toBe(1)
			await expect(getComputedStyle(footer).borderTopWidth).toBe("1px")
			await expect(mode.getBoundingClientRect().right).toBe(
				footer.getBoundingClientRect().right,
			)
		}
		await expect(cards[0].getBoundingClientRect().height).toBe(
			cards[1].getBoundingClientRect().height,
		)
	},
})

export const OneCount = meta.story({
	tags: ["test-only"],
	args: {
		companions: [
			{ ...SPACE_COMPANIONS[0], applicationsCount: undefined },
			{ ...SPACE_COMPANIONS[3], skillsCount: undefined },
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A companion with only its skills counted and one with only its applications counted. Check that each footer shows its one count alone, with no separator dot, and that a count of zero still reads as none.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const cards = cardsIn(canvasElement)

		await expect(within(cards[0]).getByText("3 skills")).toBeVisible()
		await expect(within(cards[1]).getByText("no applications")).toBeVisible()
		await expect(canvas.queryByText(/·/)).toBeNull()
		await expect(cards[0].getBoundingClientRect().height).toBe(
			cards[1].getBoundingClientRect().height,
		)
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
					"Juniper under the pointer, as drawn on H01. Check that its card sits on the full muted surface while the others keep the lighter one, with no colour transition. The play hovers with a real pointer, which needs the Vitest browser runner; in Storybook, hover by hand.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [hovered, rest] = cardsIn(canvasElement)
		const muted = mutedSurfaceIn(canvasElement)

		await expect(getComputedStyle(hovered).transitionDuration).toBe("0s")
		if (!isInBrowserRunner()) return

		const pointer = await realPointer()
		try {
			await pointer.hover(hovered)
			await waitFor(() => expect(hovered.matches(":hover")).toBe(true))
			await expect(backgroundOf(hovered)).toBe(muted)
			await expect(backgroundOf(rest)).not.toBe(muted)
		} finally {
			await pointer.unhover(hovered)
		}
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
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(getComputedStyle(title).textOverflow).toBe("ellipsis")
		await expect(getComputedStyle(title).whiteSpace).toBe("nowrap")
		await expect(title.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			name.getBoundingClientRect().top,
		)
		await expect(title.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			name.getBoundingClientRect().bottom,
		)
		await expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(
			card.getBoundingClientRect().right,
		)
	},
})
