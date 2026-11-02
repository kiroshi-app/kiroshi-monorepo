import type { ReactNode } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	hueScopeOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import { hueTone } from "@workspace/ui/components/hue-palette"
import { HUE_PRESETS } from "@workspace/ui/components/hue-tones"
import { LIBRARY_ITEMS } from "@workspace/ui/components/library.fixtures"
import type { LibraryItem } from "@workspace/ui/components/library-grid"
import {
	LibraryPanel,
	type LibraryPanelProps,
} from "@workspace/ui/components/library-panel"

type LibraryStoryFrameProps = {
	hue: keyof typeof HUE_PRESETS
	children: ReactNode
}

const LibraryStoryFrame = ({ hue, children }: LibraryStoryFrameProps) => (
	<div
		className="flex h-[832px] w-[1280px] bg-background ps-15 pe-1.5 pt-2 pb-2"
		{...hueScopeOf(hue)}
	>
		<ContentCard isLandmark={false}>{children}</ContentCard>
	</div>
)

const LONG_NAMED_ITEMS: LibraryItem[] = [
	{
		...LIBRARY_ITEMS[0],
		id: "long-image",
		name: "hero-dunes-final-final-approved-by-marketing-and-legal-v12-export-2x.png",
	},
	{
		...LIBRARY_ITEMS[2],
		id: "long-document",
		name: "Spring launch brief for the partner newsletter, the pricing page and the onboarding emails",
	},
	...LIBRARY_ITEMS.slice(3, 6),
]

const rgbOf = (hex: string) => {
	const probe = document.createElement("span")
	probe.style.color = hex
	document.body.append(probe)
	const rgb = getComputedStyle(probe).color
	probe.remove()
	return rgb
}

const PANEL_STORY_ARGS: LibraryPanelProps = {
	state: "ready",
	items: LIBRARY_ITEMS,
	filter: "all",
	searchQuery: "",
	onFilterChange: fn(),
	onOpenItem: fn(),
	onSearchQueryChange: fn(),
	onImport: fn(),
	onNewDocument: fn(),
	onStartTemplate: fn(),
}

const meta = preview.meta({
	title: "Navigation/LibraryPanel",
	component: LibraryPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The Library tab of a Space: every image and document the Space holds, read-only. The header carries the search, Import and New document, each drawn only when its callback is passed; the filters are one radio group whose checked pill wears the Space colour; each grid item is a single button that hands the item to `onOpenItem`. A Library with nothing in it trades the grid for the Start a document templates and the Bring in files strip, and while the Library loads a grid skeleton fills the card. Pass a `LibraryLightbox` as `overlay` so it covers the card.",
			},
		},
	},
	globals: { theme: "dark" },
	args: PANEL_STORY_ARGS,
	render: (args) => (
		<LibraryStoryFrame hue="blue">
			<LibraryPanel {...args} />
		</LibraryStoryFrame>
	),
})

export const GridAll = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The Library as artboard 1 draws it at a 1280 by 832 window: four columns of 271, All checked. Check that All wears the Space colour and carries no count, that a keyboard reader reaches an item with Tab and sees its ring, and that pressing it hands the item to `onOpenItem`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const filters = canvas.getByRole("radiogroup", { name: "Show" })
		const all = within(filters).getByRole("radio", { name: "All" })
		await expect(all).toHaveAttribute("aria-checked", "true")
		await expect(all).toHaveTextContent(/^All$/)

		const accent = getComputedStyle(slotIn(canvasElement, "library-panel"))
			.getPropertyValue("--primary")
			.trim()
		await expect(getComputedStyle(all).backgroundColor).toBe(rgbOf(accent))
		await userEvent.hover(all)
		await expect(getComputedStyle(all).backgroundColor).toBe(rgbOf(accent))
		await userEvent.unhover(all)
		await expect(
			getComputedStyle(slotIn(canvasElement, "library-thumbnail"))
				.backgroundColor,
		).toBe(rgbOf(hueTone(HUE_PRESETS.blue, "dark", "avatar-ground").hex))

		const columns = getComputedStyle(
			slotIn(canvasElement, "library-grid"),
		).gridTemplateColumns.split(" ")
		await expect(columns).toHaveLength(4)
		await expect(Number.parseFloat(columns[0] ?? "")).toBeCloseTo(271, 0)

		const first = canvas.getByRole("button", { name: /hero-dunes\.png/ })
		for (let press = 0; press < 8 && document.activeElement !== first; press++)
			await userEvent.tab()
		await expect(first).toHaveFocus()
		await expect(first.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(first).outlineStyle).toBe("solid")
		await expect(getComputedStyle(first).transitionDuration).toBe("0s")
		await expect(
			getComputedStyle(canvas.getByRole("button", { name: "New document" }))
				.transitionProperty,
		).toBe("none")

		await userEvent.click(first)
		await expect(args.onOpenItem).toHaveBeenCalledWith(LIBRARY_ITEMS[0])

		await userEvent.click(
			within(filters).getByRole("radio", { name: /Images/ }),
		)
		await expect(args.onFilterChange).toHaveBeenCalledWith("images")
	},
})

export const GridImages = meta.story({
	args: { filter: "images" },
	parameters: {
		docs: {
			description: {
				story:
					"The Images filter checked: only the images stay in the grid, and the counts beside Images and Documents still describe the whole Library. Check that the checked pill moves to Images and its count turns dark on the Space colour.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("radio", { name: "Images 8" }),
		).toHaveAttribute("aria-checked", "true")
		await expect(slotsIn(canvasElement, "library-item")).toHaveLength(8)
		await expect(slotsIn(canvasElement, "library-page")).toHaveLength(0)
	},
})

export const GridDocuments = meta.story({
	args: { filter: "documents" },
	parameters: {
		docs: {
			description: {
				story:
					"The Documents filter checked: every thumbnail is a page drawn from the start of the document, bleeding off the bottom of a Space-tinted ground. Check that the page title, heading and body keep their artboard sizes and that no image is left in the grid.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("radio", { name: "Documents 4" }),
		).toHaveAttribute("aria-checked", "true")
		await expect(slotsIn(canvasElement, "library-page")).toHaveLength(4)
		await expect(
			canvasElement.querySelector("[data-slot=library-thumbnail] img"),
		).toBe(null)
	},
})

export const FilterWithNoMatch = meta.story({
	args: {
		items: LIBRARY_ITEMS.filter((item) => item.kind === "image"),
		filter: "documents",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A Library holding only images, read through the Documents filter. Check that the filters stay so the reader can step back to All, and that one muted line says there are no documents instead of an empty grid. `Empty` stories cover a Library with nothing in it at all.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("radio", { name: "Documents 0" }),
		).toHaveAttribute("aria-checked", "true")
		await expect(slotsIn(canvasElement, "library-item")).toHaveLength(0)
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"No documents in this Library yet.",
		)
	},
})

export const SearchWithNoMatch = meta.story({
	args: { items: [], searchQuery: "quarterly roadmap" },
	parameters: {
		docs: {
			description: {
				story:
					"A search the Library has nothing for: the app hands over no items with the query still set. Check that the search field keeps the query, that the empty state does not take over, and that one muted line names the query that found nothing.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("searchbox")).toHaveValue("quarterly roadmap")
		await expect(canvas.queryByRole("button", { name: "Blank document" })).toBe(
			null,
		)
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Nothing matches “quarterly roadmap”.",
		)
	},
})

export const EmptyWithNoCallbacks = meta.story({
	args: {
		items: [],
		onImport: undefined,
		onNewDocument: undefined,
		onStartTemplate: undefined,
		onSearchQueryChange: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"An empty Library before Import, New document and the templates exist in the app: the title and subtitle alone. Check that no control and no section title is left behind by an absent callback, so the empty Library never offers a press that does nothing.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.queryAllByRole("button")).toHaveLength(0)
		await expect(canvas.queryByRole("radiogroup")).toBe(null)
		await expect(canvas.queryByRole("searchbox")).toBe(null)
		await expect(canvas.queryByRole("heading", { level: 2 })).toBe(null)
		await expect(
			canvasElement.querySelector("[data-slot=library-empty-state]"),
		).toBe(null)
	},
})

export const EmptyWithEveryCallback = meta.story({
	args: { items: [] },
	parameters: {
		docs: {
			description: {
				story:
					"An empty Library as artboard 2 draws it: Blank document and the three templates under Start a document, then the Bring in files strip. Check that the header drops its actions and filters, that the Blank document plus wears the Space colour, and that each card reports its own callback.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.queryByRole("radiogroup")).toBe(null)
		await expect(canvas.queryByRole("searchbox")).toBe(null)
		await expect(canvas.queryByRole("button", { name: "Import" })).toBe(null)

		await userEvent.click(
			canvas.getByRole("button", { name: "Blank document" }),
		)
		await expect(args.onNewDocument).toHaveBeenCalledOnce()
		await userEvent.click(canvas.getByRole("button", { name: "Meeting notes" }))
		await expect(args.onStartTemplate).toHaveBeenCalledWith("meetingNotes")
		await userEvent.click(canvas.getByRole("button", { name: "Import files…" }))
		await expect(args.onImport).toHaveBeenCalledOnce()
	},
})

export const Loading = meta.story({
	args: { state: "loading", items: [] },
	parameters: {
		docs: {
			description: {
				story:
					"The Library before its first read lands: the header stays, the filters and the grid are drawn as a skeleton that reaches the bottom of the card. Check that the last skeleton row crosses the card's bottom edge and that the panel says it is busy.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector("[aria-busy=true]")).not.toBe(null)
		await expectSkeletonFilledTo(canvasElement, "bottom")
	},
})

export const LongNames = meta.story({
	args: { items: LONG_NAMED_ITEMS },
	render: (args) => (
		<LibraryStoryFrame hue="pink">
			<LibraryPanel {...args} />
		</LibraryStoryFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Names longer than their slot, in a pink Space. Check that each name stays on one line with an ellipsis and keeps the full name on hover, and that the checked filter and the thumbnail ground follow the Space hue rather than a fixed blue.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const name = within(
			canvas.getByRole("button", { name: /hero-dunes-final/ }),
		).getByTitle(/^hero-dunes-final/)
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(getComputedStyle(name).whiteSpace).toBe("nowrap")
		await expect(name).toHaveAttribute(
			"title",
			"hero-dunes-final-final-approved-by-marketing-and-legal-v12-export-2x.png",
		)

		await waitFor(() =>
			expect(
				getComputedStyle(canvas.getByRole("radio", { name: "All" }))
					.backgroundColor,
			).toBe(rgbOf(hueTone(HUE_PRESETS.pink, "dark", "accent").hex)),
		)
		await expect(
			getComputedStyle(slotIn(canvasElement, "library-thumbnail"))
				.backgroundColor,
		).toBe(rgbOf(hueTone(HUE_PRESETS.pink, "dark", "avatar-ground").hex))
	},
})
