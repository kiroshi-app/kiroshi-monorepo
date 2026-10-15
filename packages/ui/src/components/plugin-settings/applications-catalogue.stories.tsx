import { useState } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { expectSkeletonClippedAtBottomOf } from "@workspace/storybook/story-utils"
import {
	CATALOGUE_APPLICATIONS,
	CLAMPED_APPLICATION,
	LONG_NAME_APPLICATION,
	REFUSED_APPLICATION,
	UNDESCRIBED_APPLICATION,
} from "@workspace/ui/components/plugin-settings/applications.fixtures"
import {
	ApplicationsCatalogue,
	type ApplicationsCatalogueProps,
	CATALOGUE_CATEGORIES,
	type CatalogueApplication,
	type CatalogueCategory,
} from "@workspace/ui/components/plugin-settings/applications-catalogue"

const [EVERYTHING, ON_THIS_MACHINE] = CATALOGUE_CATEGORIES

const CARD_GAP = 12

const CARD_PADDING = 12

const CARD_EDGE = 13

const CARD_RADIUS = 12

const DESCRIPTION_HEIGHT = 32

const RAIL_WIDTH = 208

const LOGO_SLOT = 28

const CATEGORY_LABELS = [
	"Everything",
	"On this machine",
	"Commerce & shopping",
	"Communication",
	"Consumer health",
	"Creative",
	"Data & analytics",
	"Developer tools",
	"Education",
	"Financial services",
	"Health & life sciences",
	"Legal",
	"Media & entertainment",
	"Nonprofit",
	"Productivity",
	"Sales & marketing",
	"Travel",
	"Other",
]

const slotsOf = (root: Element, slot: string) => [
	...root.querySelectorAll(`[data-slot="${slot}"]`),
]

const boxOf = (element: Element) => element.getBoundingClientRect()

const matching = (applications: CatalogueApplication[], query: string) =>
	applications.filter((application) =>
		application.name.toLowerCase().includes(query.trim().toLowerCase()),
	)

const CatalogueHost = (props: ApplicationsCatalogueProps) => {
	const [query, setQuery] = useState(props.query)
	const [category, setCategory] = useState<CatalogueCategory>(props.category)

	return (
		<ApplicationsCatalogue
			{...props}
			applications={matching(props.applications, query)}
			category={category}
			onCategoryChange={(next) => {
				setCategory(next)
				props.onCategoryChange(next)
			}}
			onQueryChange={(next) => {
				setQuery(next)
				props.onQueryChange(next)
			}}
			query={query}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Plugins/ApplicationsCatalogue",
	component: ApplicationsCatalogue,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The page Add an application pushes over the whole dialog body, rail included. The rail reads as a directory: the way back, then Everything, On this machine and the sixteen categories, no count beside any of them. The body draws the applications it is handed as one grid of cards, three across, under the head of the category that is selected.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[34rem] w-[52rem] overflow-hidden rounded-2xl border border-border">
				<Story />
			</div>
		),
	],
	args: {
		category: EVERYTHING,
		onCategoryChange: fn(),
		query: "",
		onQueryChange: fn(),
		applications: CATALOGUE_APPLICATIONS,
		onRetry: fn(),
		onPick: fn(),
		onBack: fn(),
	},
	render: (args) => <CatalogueHost {...args} />,
})

export const AtRest = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The catalogue as it opens on Everything. Check the way back above a separator, the eighteen entries in the order the directory reads, no number and no badge beside any of them, no way to paste a configuration in the rail, no section head over Everything, and the cards three across at their drawn geometry.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const tabs = canvas.getAllByRole("tab")

		await expect(tabs.map((tab) => tab.textContent)).toEqual(CATEGORY_LABELS)
		await expect(tabs[0]).toHaveAttribute("aria-selected", "true")
		await expect(
			tabs.filter((tab) => tab.getAttribute("aria-selected") === "true"),
		).toHaveLength(1)
		await expect(canvasElement.textContent).not.toMatch(/\d/)
		await expect(
			canvas.queryByRole("button", { name: "Paste a configuration" }),
		).not.toBeInTheDocument()
		await expect(
			canvas.queryByText("From the curated directory."),
		).not.toBeInTheDocument()

		const rail = canvasElement.querySelector('[data-slot="settings-rail"]')
		await expect(Math.round(boxOf(rail as Element).width)).toBe(RAIL_WIDTH)

		const cards = canvas.getAllByRole("listitem")
		const top = boxOf(cards[0]).top
		const row = cards.filter((card) => boxOf(card).top === top)
		await expect(row).toHaveLength(3)
		await expect(Math.round(boxOf(row[1]).left - boxOf(row[0]).right)).toBe(
			CARD_GAP,
		)

		const [shell] = within(row[0]).getAllByRole("button")
		const style = getComputedStyle(shell)
		await expect(style.padding).toBe(`${CARD_PADDING}px`)
		await expect(style.borderRadius).toBe(`${CARD_RADIUS}px`)

		const [logo] = slotsOf(row[0], "application-mark")
		await expect(Math.round(boxOf(logo).width)).toBe(LOGO_SLOT)

		await userEvent.click(canvas.getByRole("button", { name: /^Linear\b/ }))
		await expect(args.onPick).toHaveBeenCalledWith(CATALOGUE_APPLICATIONS[0])

		await userEvent.click(
			canvas.getByRole("button", { name: "All applications" }),
		)
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
})

export const CategorySelected = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A category picked in the rail. Check that the change is reported, that the entry alone is active, and that one head names the category and says where the listing comes from.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("tab", { name: "Developer tools" }))

		await expect(args.onCategoryChange).toHaveBeenLastCalledWith(
			"developer-tools",
		)
		await expect(
			canvas.getByRole("tab", { name: "Developer tools" }),
		).toHaveAttribute("aria-selected", "true")

		const head = canvas.getByRole("heading", { name: "Developer tools" })
		await expect(head).toBeVisible()
		await expect(canvas.getByText("From the curated directory.")).toBeVisible()
	},
})

export const OnThisMachineSelected = meta.story({
	args: { category: ON_THIS_MACHINE },
	parameters: {
		docs: {
			description: {
				story:
					"The entry that is not a category of the directory. Check that no head is drawn over the grid, the way Everything carries none.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("tab", { name: "On this machine" }),
		).toHaveAttribute("aria-selected", "true")
		await expect(
			canvas.queryByText("From the curated directory."),
		).not.toBeInTheDocument()
	},
})

export const RailScrolls = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The eighteen entries are taller than the rail. Check that they scroll inside it while the way back and the separator stay above them.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const list = canvasElement.querySelector('[role="tablist"]') as HTMLElement
		const back = canvas.getByRole("button", { name: "All applications" })

		await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
		await expect(list.contains(back)).toBe(false)
		await expect(boxOf(back).bottom).toBeLessThanOrEqual(boxOf(list).top)
	},
})

export const CardHovered = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The card under the pointer. The test browser places no real pointer, so the surface it takes is read off the class that draws it; hover a card in Storybook to see it.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const card = canvas.getByRole("button", { name: /^Linear\b/ })

		await expect(getComputedStyle(card).backgroundColor).toBe(
			"rgba(0, 0, 0, 0)",
		)
		await expect(card).toHaveClass("hover:bg-muted")

		await userEvent.hover(card)
		await expect(card).toBeVisible()
	},
})

export const CardFocused = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The card reached by the keyboard from the search field. Check that the card takes the focus and wears the ring rather than losing the outline.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		canvas.getByRole("textbox", { name: "Search applications" }).focus()

		await userEvent.tab()
		const card = canvas.getByRole("button", { name: /^Linear\b/ })
		await expect(card).toHaveFocus()
		await expect(card).toHaveClass(
			"focus-visible:ring-2",
			"focus-visible:ring-ring",
		)
	},
})

export const CardNameTooLong = meta.story({
	args: { applications: [LONG_NAME_APPLICATION] },
	parameters: {
		docs: {
			description: {
				story:
					"A name wider than the line it is drawn on. Check that it stays on one line and truncates rather than growing the card.",
			},
		},
	},
	play: async ({ canvas }) => {
		const name = canvas.getByText(LONG_NAME_APPLICATION.name)

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(Math.round(boxOf(name).height)).toBeLessThan(24)
	},
})

export const CardDescriptionClamps = meta.story({
	args: { applications: [CLAMPED_APPLICATION] },
	parameters: {
		docs: {
			description: {
				story:
					"A description longer than the two lines the card keeps for it. Check that it clamps at two lines and that the posture line stays on the bottom edge of the card.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const [description] = slotsOf(canvasElement, "catalogue-card-description")
		const [setup] = slotsOf(canvasElement, "catalogue-card-setup")
		const card = canvas.getByRole("button", { name: /^inbox-reader\b/ })

		await expect(Math.round(boxOf(description).height)).toBe(DESCRIPTION_HEIGHT)
		await expect(description.scrollHeight).toBeGreaterThan(
			description.clientHeight,
		)
		await expect(Math.round(boxOf(card).bottom - boxOf(setup).bottom)).toBe(
			CARD_EDGE,
		)
	},
})

export const CardWithoutDescription = meta.story({
	args: { applications: [UNDESCRIBED_APPLICATION] },
	parameters: {
		docs: {
			description: {
				story:
					"An application that describes itself nowhere. Check that no description node is drawn and that the posture line sits directly under the name.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const [setup] = slotsOf(canvasElement, "catalogue-card-setup")
		const name = canvas.getByText(UNDESCRIBED_APPLICATION.name)

		await expect(
			slotsOf(canvasElement, "catalogue-card-description"),
		).toHaveLength(0)
		await expect(
			Math.round(boxOf(setup).top - boxOf(name).bottom),
		).toBeLessThan(DESCRIPTION_HEIGHT)
		await expect(canvas.queryByText("Verified")).not.toBeInTheDocument()
	},
})

export const SetupUnavailable = meta.story({
	args: { applications: [REFUSED_APPLICATION] },
	parameters: {
		docs: {
			description: {
				story:
					"An application Kiroshi refuses to add. Check that the card says it can’t be added here, on the blocked glyph in the destructive colour rather than the check of nothing to set up.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [setup] = slotsOf(canvasElement, "catalogue-card-setup")

		await expect(setup).toHaveTextContent("Can’t be added here")
		await expect(setup.querySelector("svg")).toHaveClass("text-destructive")
	},
})

export const Searching = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A search reported to the caller. Check that every keystroke is reported and that only the applications handed back are drawn.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(
			canvas.getByRole("textbox", { name: "Search applications" }),
			"lin",
		)

		await expect(args.onQueryChange).toHaveBeenLastCalledWith("lin")
		await expect(canvas.getByText("Linear")).toBeVisible()
		await expect(canvas.queryByText("Notion")).not.toBeInTheDocument()
	},
})

export const NothingMatched = meta.story({
	args: { query: "zebra", applications: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A search that matches nothing. Check that the line repeats the words typed and names no control the catalogue does not draw.",
			},
		},
	},
	play: async ({ canvas }) => {
		const nothing = canvas.getByText("Nothing matched zebra. Try another name.")

		await expect(nothing).toBeVisible()
		await expect(nothing).toHaveAttribute("aria-live", "polite")
	},
})

export const CategoryEmpty = meta.story({
	args: { category: "travel" satisfies CatalogueCategory, applications: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A category the directory answers nothing for, nothing typed. Check the head naming it and, in the shell the no-match line uses, a line saying the category is empty.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { name: "Travel" })).toBeVisible()

		const empty = canvas.getByText("Nothing in this category yet.")

		await expect(empty).toBeVisible()
		await expect(empty).toHaveAttribute("aria-live", "polite")
		await expect(canvas.queryByRole("listitem")).not.toBeInTheDocument()
	},
})

export const PartlyUnreadable = meta.story({
	args: { hasPartlyFailed: true },
	parameters: {
		docs: {
			description: {
				story:
					"One side of the catalogue answered and the other did not. Check that the cards that did return stay on screen and that one line above them says part of the catalogue could not be read, with its Retry.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const warning = canvas.getByText(
			"Couldn\u2019t read part of the catalogue. Retry to see the rest.",
		)
		const cards = canvas.getAllByRole("listitem")

		await expect(warning).toBeVisible()
		await expect(cards.length).toBe(CATALOGUE_APPLICATIONS.length)
		await expect(boxOf(warning).top).toBeLessThan(boxOf(cards[0]).top)

		await canvas.getByRole("button", { name: "Retry" }).click()

		await expect(args.onRetry).toHaveBeenCalledTimes(1)
	},
})

export const ServedStale = meta.story({
	args: { isStale: true },
	parameters: {
		docs: {
			description: {
				story:
					"A listing read more than a day ago, served all the same. Check that the cards stay on screen and that one line above them says how old the listing is, with nothing to press.",
			},
		},
	},
	play: async ({ canvas }) => {
		const notice = canvas.getByText(
			"This listing was read more than a day ago.",
		)
		const cards = canvas.getAllByRole("listitem")

		await expect(notice).toBeVisible()
		await expect(cards.length).toBe(CATALOGUE_APPLICATIONS.length)
		await expect(boxOf(notice).top).toBeLessThan(boxOf(cards[0]).top)
		await expect(
			canvas.queryByRole("button", { name: "Retry" }),
		).not.toBeInTheDocument()
	},
})

export const Loading = meta.story({
	args: { applications: [], isLoading: true },
	parameters: {
		docs: {
			description: {
				story:
					"The catalogue reading. Check that the body draws application row skeletons, the settings list row and not the card grid, filling it to the bottom with the last one cut by the edge, each at the height of a loaded application row, the body marked busy and the polite line announced from outside it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const body = canvas.getByRole("tabpanel")
		await expect(body).toHaveAttribute("aria-busy", "true")

		const list = await expectSkeletonClippedAtBottomOf(body)
		const [firstRow] = slotsOf(list, "list-skeleton-row")
		await expect(firstRow?.getBoundingClientRect().height).toBe(60)
		await expect(body.querySelector("ul")).toBeNull()

		const announcement = canvas.getByRole("status")
		await expect(announcement).toHaveTextContent(
			"Loading the applications catalogue",
		)
		await expect(body.contains(announcement)).toBe(false)
	},
})

export const Unreadable = meta.story({
	args: { applications: [], hasFailed: true },
	parameters: {
		docs: {
			description: {
				story:
					"The catalogue out of reach. Check the line saying so and the one Retry it offers.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const failure = canvas.getByText(
			"Couldn’t reach the applications catalogue.",
		)

		await expect(failure).toBeVisible()
		await expect(failure).toHaveAttribute("aria-live", "polite")

		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))

		await expect(args.onRetry).toHaveBeenCalledTimes(1)
	},
})

export const EveryCategoryIsNamed = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"Every entry of the directory carries a label of its own, in the order the rail reads.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(CATALOGUE_CATEGORIES).toHaveLength(CATEGORY_LABELS.length)

		for (const label of CATEGORY_LABELS) {
			await expect(canvas.getByRole("tab", { name: label })).toBeVisible()
		}
	},
})
