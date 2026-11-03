import { type ReactNode, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	hueScopeOf,
	isInBrowserRunner,
	realPointer,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import { hueTone } from "@workspace/ui/components/hue-palette"
import { HUE_PRESETS } from "@workspace/ui/components/hue-tones"
import {
	LIBRARY_DRAG_PREVIEW,
	LIBRARY_DROPPED_NAMES,
	LIBRARY_ITEMS,
	LIBRARY_ITEMS_AFTER_IMPORT,
} from "@workspace/ui/components/library.fixtures"
import {
	LibraryGrid,
	type LibraryItem,
} from "@workspace/ui/components/library-grid"
import {
	LibraryDragGhost,
	LibraryDropOverlay,
} from "@workspace/ui/components/library-import"
import {
	LibraryPanel,
	type LibraryPanelProps,
} from "@workspace/ui/components/library-panel"
import {
	endNotice,
	NoticeSurface,
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

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

const DRAG_CURSOR = { x: 742, y: 436 }

const LONG_DROPPED_NAME =
	"usage-march-final-final-approved-by-finance-and-legal-v12-export-2x.png"

const LONG_DROPPED_NAMES = [
	LONG_DROPPED_NAME,
	...LIBRARY_DROPPED_NAMES.slice(1),
]

const LONG_NAMED_IMPORT: LibraryItem[] = [
	{
		...LIBRARY_ITEMS_AFTER_IMPORT[1],
		name: LONG_DROPPED_NAME,
	},
	...LIBRARY_ITEMS.slice(0, 5),
]

const HeldAddedNotice = () => {
	const { t } = useTranslation("common")

	useEffect(() => {
		const id = raiseTransientNotice({
			title: t("library.added.title", { count: 2 }),
			description: t("library.added.stillImporting", {
				count: 1,
				name: "usage-march.png",
			}),
		})
		return () => endNotice(id)
	}, [t])

	return <NoticeSurface transientDelay={0} />
}

const IMPORT_FAILURE_REASONS = [
	"tooLarge",
	"invalidName",
	"unsupported",
	"undecodable",
	"notUtf8",
	"missing",
	"unwritable",
	"unreadable",
	"unknownSpace",
	"unavailable",
	"storage",
	"generic",
] as const

const RAW_REASON_CODE = new RegExp(
	`\\b(${IMPORT_FAILURE_REASONS.join("|")})\\b`,
)

const expectOutOfFocusOrder = async (element: HTMLElement) => {
	await expect(
		element.querySelectorAll("a, button, input, select, textarea, [tabindex]"),
	).toHaveLength(0)
	await expect(getComputedStyle(element).pointerEvents).toBe("none")
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
					"The Library tab of a Space: every image and document the Space holds, read-only. The header carries the search, Import and New document, each drawn only when its callback is passed; the filters are one single-selection toggle group whose pressed pill wears the Space colour; each grid item is a single button that hands the item to `onOpenItem`, and a right-click on it opens the item action menu, listing only the actions whose callback is given. A Library with nothing in it trades the grid for the Start a document templates and the Bring in files strip, and while the Library loads a grid skeleton fills the card. Pass a `LibraryLightbox` as `overlay` so it covers the card.",
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
		const filters = canvas.getByRole("group", { name: "Show" })
		const all = within(filters).getByRole("button", { name: "All" })
		await expect(all).toHaveAttribute("aria-pressed", "true")
		await expect(all).toHaveTextContent(/^All$/)
		await expect(all.getBoundingClientRect().height).toBe(28)
		await expect(getComputedStyle(all).transitionProperty).toBe("none")

		const accent = getComputedStyle(slotIn(canvasElement, "library-panel"))
			.getPropertyValue("--primary")
			.trim()
		await expect(getComputedStyle(all).backgroundColor).toBe(rgbOf(accent))
		if (isInBrowserRunner()) {
			const pointer = await realPointer()
			try {
				await pointer.hover(all)
				await waitFor(() => expect(all.matches(":hover")).toBe(true))
				await expect(all).toHaveAttribute("aria-pressed", "true")
				await expect(getComputedStyle(all).backgroundColor).toBe(rgbOf(accent))
			} finally {
				await pointer.unhover(all)
			}
		}
		await expect(
			getComputedStyle(slotIn(canvasElement, "library-thumbnail"))
				.backgroundColor,
		).toBe(rgbOf(hueTone(HUE_PRESETS.blue, "dark", "avatar-ground").hex))

		const columns = getComputedStyle(
			slotIn(canvasElement, "library-grid"),
		).gridTemplateColumns.split(" ")
		await expect(columns).toHaveLength(4)
		await expect(Number.parseFloat(columns[0] ?? "")).toBeCloseTo(271, 0)

		for (let press = 0; press < 8 && document.activeElement !== all; press++)
			await userEvent.tab()
		await expect(all).toHaveFocus()
		await expect(all.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(all).boxShadow).not.toBe("none")

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
			within(filters).getByRole("button", { name: /Images/ }),
		)
		await expect(args.onFilterChange).toHaveBeenLastCalledWith("images")

		await userEvent.click(all)
		await expect(args.onFilterChange).toHaveBeenLastCalledWith("all")
		await expect(all).toHaveAttribute("aria-pressed", "true")
	},
})

const ITEM_ACTION_NAMES = [
	"Open",
	"Open in new tab",
	"Rename",
	"Copy",
	"Download",
	"Show in folder",
	"Delete",
]

export const GridContextMenu = meta.story({
	args: {
		onOpen: fn(),
		onOpenInNewTab: fn(),
		onRename: fn(),
		onCopy: fn(),
		onDownload: fn(),
		onShowInFolder: fn(),
		onDelete: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A grid item right-clicked on the host, every item action given. Check that the menu lists Open, Open in new tab, Rename, Copy, Download, Show in folder, then Delete under a rule and drawn as destructive, that the highlight follows the pointer with no colour transition, and that an entry hands the item to its callback.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const item = canvas.getByRole("button", { name: /hero-dunes\.png/ })
		await userEvent.pointer({ keys: "[MouseRight]", target: item })

		const menu = await within(document.body).findByRole("menu", {
			name: "Actions for hero-dunes.png",
		})
		const entries = within(menu).getAllByRole("menuitem")
		await expect(entries.map((entry) => entry.textContent)).toEqual(
			ITEM_ACTION_NAMES,
		)
		await expect(entries.at(-1)?.previousElementSibling).toHaveAttribute(
			"role",
			"separator",
		)
		await expect(entries.at(-1)).toHaveAttribute("data-variant", "destructive")
		for (const entry of entries)
			await expect(getComputedStyle(entry).transitionDuration).toBe("0s")

		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Rename" }),
		)
		await expect(args.onRename).toHaveBeenCalledWith(LIBRARY_ITEMS[0])
		await waitFor(() =>
			expect(within(document.body).queryByRole("menu")).toBe(null),
		)
	},
})

export const GridActionsPerItem = meta.story({
	args: {
		onOpen: fn(),
		onOpenInNewTab: fn(),
		onRename: fn(),
		onCopy: fn(),
		onDownload: fn(),
		onShowInFolder: fn(),
		onDelete: fn(),
		isActionShown: (item, action) =>
			action !== "onRename" || item.kind === "document",
	},
	parameters: {
		docs: {
			description: {
				story:
					"An image and a document right-clicked in one grid, every item action given and Rename kept for documents. Check that the image menu lists no Rename and that the document menu lists Rename in its place.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const menuOf = async (name: string) => {
			await userEvent.pointer({
				keys: "[MouseRight]",
				target: canvas.getByRole("button", { name: new RegExp(name) }),
			})
			const menu = await within(document.body).findByRole("menu", {
				name: `Actions for ${name}`,
			})
			return within(menu)
				.getAllByRole("menuitem")
				.map((entry) => entry.textContent)
		}

		await expect(await menuOf("hero-dunes.png")).toEqual(
			ITEM_ACTION_NAMES.filter((name) => name !== "Rename"),
		)
		await userEvent.keyboard("{Escape}")
		await waitFor(() =>
			expect(within(document.body).queryByRole("menu")).toBe(null),
		)

		await expect(await menuOf("Spring launch brief")).toEqual(ITEM_ACTION_NAMES)
	},
})

export const GridWithoutItemActions = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A grid item right-clicked with no item action given. Check that no menu opens, so a right-click never offers an empty menu.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const item = canvas.getByRole("button", { name: /hero-dunes\.png/ })
		await userEvent.pointer({ keys: "[MouseRight]", target: item })
		await expect(within(document.body).queryByRole("menu")).toBe(null)
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
			canvas.getByRole("button", { name: "Images 8" }),
		).toHaveAttribute("aria-pressed", "true")
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
					"The Documents filter checked: every thumbnail is a page drawn from the start of the document, bleeding off the bottom of the fixed blue document ground. Check that the page title, heading and body keep their artboard sizes and that no image is left in the grid.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("button", { name: "Documents 4" }),
		).toHaveAttribute("aria-pressed", "true")
		await expect(slotsIn(canvasElement, "library-page")).toHaveLength(4)
		await expect(
			canvasElement.querySelector("[data-slot=library-thumbnail] img"),
		).toBe(null)
	},
})

const SIDE_BY_SIDE_SPACE_HUES = ["pink", "green"] as const

const DOCUMENT_ITEMS = LIBRARY_ITEMS.filter((item) => item.kind === "document")

const expectOneDocumentGroundAcrossSpaces = async (
	canvasElement: HTMLElement,
) => {
	const [first, second] = Array.from(
		canvasElement.querySelectorAll<HTMLElement>("[data-hue]"),
	)
	await expect(first?.dataset.hue).not.toBe(second?.dataset.hue)

	const ground = rgbOf(
		getComputedStyle(canvasElement).getPropertyValue("--document-ground"),
	)
	const thumbnails = slotsIn(canvasElement, "library-thumbnail")
	await expect(thumbnails).toHaveLength(8)
	for (const thumbnail of thumbnails)
		await expect(getComputedStyle(thumbnail).backgroundColor).toBe(ground)
}

export const GridDocumentsAcrossSpaces = meta.story({
	render: (args) => (
		<div className="flex h-[832px] w-[1280px] gap-1.5 bg-background p-2">
			{SIDE_BY_SIDE_SPACE_HUES.map((hue) => (
				<div className="flex min-w-0 flex-1" key={hue} {...hueScopeOf(hue)}>
					<ContentCard isLandmark={false}>
						<LibraryGrid items={DOCUMENT_ITEMS} onOpenItem={args.onOpenItem} />
					</ContentCard>
				</div>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The document grid in a pink Space and a green Space side by side, dark theme. Check that every document thumbnail sits on the same blue ground in both, whatever the Space colour.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectOneDocumentGroundAcrossSpaces(canvasElement),
})

export const GridDocumentsAcrossSpacesLight = GridDocumentsAcrossSpaces.extend({
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The document grid in a pink Space and a green Space side by side, light theme. Check that every document thumbnail sits on the same blue ground in both, whatever the Space colour.",
			},
		},
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
			canvas.getByRole("button", { name: "Documents 0" }),
		).toHaveAttribute("aria-pressed", "true")
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

export const SearchFilled = meta.story({
	args: {
		items: LIBRARY_ITEMS.filter((item) => item.name.includes("dashboard")),
		searchQuery: "dashboard",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A search that found items: the app hands over the matching items with the query set. Check that the field is a 32 px pill led by the search icon, that the query sits at 13 px on an 18 px line, that the field keeps its name and placeholder, and that a keyboard reader reaching it sees its focus ring.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const search = canvas.getByRole("searchbox", { name: "Search the Library" })
		await expect(search).toHaveValue("dashboard")
		await expect(search).toHaveAttribute("placeholder", "Search the Library")
		await expect(search.getBoundingClientRect().height).toBe(32)
		await expect(getComputedStyle(search).fontSize).toBe("13px")
		await expect(getComputedStyle(search).lineHeight).toBe("18px")
		await expect(getComputedStyle(search).transitionProperty).toBe("none")

		const icon = slotIn(canvasElement, "library-search").querySelector("svg")
		await expect(icon?.getBoundingClientRect().left).toBeLessThan(
			search.getBoundingClientRect().left + 16,
		)
		await expect(slotsIn(canvasElement, "library-item").length).toBeGreaterThan(
			0,
		)

		for (let press = 0; press < 4 && document.activeElement !== search; press++)
			await userEvent.tab()
		await expect(search).toHaveFocus()
		await expect(search.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(search).boxShadow).not.toBe("none")

		await userEvent.type(search, "s")
		await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith(
			"dashboards",
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
		await expect(canvas.queryByRole("group", { name: "Show" })).toBe(null)
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
		await expect(canvas.queryByRole("group", { name: "Show" })).toBe(null)
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
					"Names longer than their slot, in a pink Space. Check that each name stays on one line with an ellipsis and keeps the full name on hover, and that the checked filter and the image thumbnail ground follow the Space hue rather than a fixed blue.",
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
				getComputedStyle(canvas.getByRole("button", { name: "All" }))
					.backgroundColor,
			).toBe(rgbOf(hueTone(HUE_PRESETS.pink, "dark", "accent").hex)),
		)
		await expect(
			getComputedStyle(slotIn(canvasElement, "library-thumbnail"))
				.backgroundColor,
		).toBe(rgbOf(hueTone(HUE_PRESETS.pink, "dark", "avatar-ground").hex))
	},
})

export const DroppingFiles = meta.story({
	args: {
		overlay: (
			<>
				<LibraryDropOverlay fileCount={LIBRARY_DROPPED_NAMES.length} />
				<LibraryDragGhost
					names={LIBRARY_DROPPED_NAMES}
					position={DRAG_CURSOR}
					previewSrc={LIBRARY_DRAG_PREVIEW}
				/>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Three files dragged over the Library, as artboard 6 draws it: the card surface at 86% over the whole card with the grid still showing through, a dashed drop zone, its badge and the ghost count pill in the Space colour, and the ghost 14px below the cursor. Check that the drop target is announced politely, that neither the overlay nor the ghost takes focus or a pointer, and that the ghost lists the first name, and 2 more, and 3.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const panel = slotIn(canvasElement, "library-panel")
		const overlay = slotIn(canvasElement, "library-drop-overlay")
		const accent = rgbOf(hueTone(HUE_PRESETS.blue, "dark", "accent").hex)

		await expect(overlay.getBoundingClientRect()).toEqual(
			panel.getBoundingClientRect(),
		)
		await expect(slotIn(canvasElement, "library-grid")).toBeVisible()
		await expect(getComputedStyle(overlay).backgroundColor).toMatch(
			/\/ 0\.86\)$/,
		)

		const zone = canvas.getByRole("status")
		await expect(zone).toHaveTextContent(
			"Drop to add 3 files to the LibraryPNG, JPG, Markdown and plain text.",
		)
		await expect(getComputedStyle(zone).borderTopColor).toBe(accent)
		await expect(getComputedStyle(zone).borderTopStyle).toBe("dashed")
		await expect(
			getComputedStyle(slotIn(canvasElement, "library-drop-badge"))
				.backgroundColor,
		).toBe(accent)
		await expectOutOfFocusOrder(overlay)

		const ghost = slotIn(canvasElement, "library-drag-ghost")
		await expect(ghost).toHaveAttribute("aria-hidden", "true")
		await expectOutOfFocusOrder(ghost)
		await expect(ghost).toHaveTextContent("usage-march.pngand 2 more3")
		await expect(
			getComputedStyle(slotIn(canvasElement, "library-drag-count"))
				.backgroundColor,
		).toBe(accent)
		const box = ghost.getBoundingClientRect()
		await expect(box.left).toBeCloseTo(DRAG_CURSOR.x, 0)
		await expect(box.top).toBeCloseTo(DRAG_CURSOR.y + 14, 0)
	},
})

export const DroppingOneFile = meta.story({
	args: {
		overlay: (
			<>
				<LibraryDropOverlay fileCount={1} />
				<LibraryDragGhost
					names={LIBRARY_DROPPED_NAMES.slice(0, 1)}
					position={DRAG_CURSOR}
					previewSrc={LIBRARY_DRAG_PREVIEW}
				/>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"One file dragged over the Library. Check that the title reads the singular, in English and in French, and that the ghost drops its and N more line while its pill still counts 1.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent(
			/^Drop to add 1 file to the Library/,
		)
		const french = i18n.getFixedT("fr", "common")
		await expect(french("library.drop.title", { count: 1 })).toBe(
			"Déposez pour ajouter 1 fichier à la Bibliothèque",
		)
		await expect(french("library.drop.title", { count: 3 })).toBe(
			"Déposez pour ajouter 3 fichiers à la Bibliothèque",
		)

		const ghost = slotIn(canvasElement, "library-drag-ghost")
		await expect(ghost).toHaveTextContent(/^usage-march\.png1$/)
		await expect(within(ghost).queryByText(/more/)).toBe(null)
	},
})

export const AddedToTheGrid = meta.story({
	args: { items: LIBRARY_ITEMS_AFTER_IMPORT },
	render: (args) => (
		<LibraryStoryFrame hue="blue">
			<LibraryPanel {...args} />
			<HeldAddedNotice />
		</LibraryStoryFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Two files added, as artboard 7 draws it: the new items first, detail Just now, one still importing under the card surface at 72% with a Space-coloured progress fill, and the success notice above the window. Check that the importing tile exposes a named progressbar at 64, reads Importing… 64%, and does not open on a press since its file is not written yet.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const progress = canvas.getByRole("progressbar", {
			name: "Importing usage-march.png",
		})
		await expect(progress).toHaveAttribute("aria-valuenow", "64")
		const fill = slotIn(canvasElement, "library-import-progress")
		await expect(
			fill.getBoundingClientRect().width /
				progress.getBoundingClientRect().width,
		).toBeCloseTo(0.64, 2)
		await expect(getComputedStyle(fill).backgroundColor).toBe(
			rgbOf(hueTone(HUE_PRESETS.blue, "dark", "accent").hex),
		)
		await expect(
			getComputedStyle(slotIn(canvasElement, "library-import-scrim"))
				.backgroundColor,
		).toMatch(/\/ 0\.72\)$/)

		const tile = progress.closest<HTMLElement>("[data-slot=library-item]")
		if (!tile) throw new Error("The importing tile is not drawn")
		await expect(tile).toHaveTextContent("usage-march.pngImporting… 64%")
		await expect(canvas.queryByRole("button", { name: /usage-march/ })).toBe(
			null,
		)
		await userEvent.click(tile)
		await expect(args.onOpenItem).not.toHaveBeenCalled()
		await expect(
			canvas.getByRole("button", { name: /pricing-grid\.png.*Just now/ }),
		).toBeVisible()

		const notice = await within(document.body).findByText("2 files added")
		const card = notice.closest<HTMLElement>("[data-slot=toast]")
		if (!card) throw new Error("The notice is not drawn")
		await Promise.all(
			card.getAnimations({ subtree: true }).map(({ finished }) => finished),
		)
		await expect(
			within(card).getByText("usage-march.png is still importing."),
		).toBeVisible()
		await expect(card.getBoundingClientRect().width).toBe(384)
		await expect(
			i18n.getFixedT("fr", "common")("library.added.stillImporting", {
				count: 2,
				name: "usage-march.png",
			}),
		).toBe("2 fichiers sont encore en cours d’importation.")
	},
})

export const ImportLongNames = meta.story({
	args: {
		items: LONG_NAMED_IMPORT,
		overlay: (
			<LibraryDragGhost names={LONG_DROPPED_NAMES} position={DRAG_CURSOR} />
		),
	},
	render: (args) => (
		<LibraryStoryFrame hue="pink">
			<LibraryPanel {...args} />
		</LibraryStoryFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A long file name being imported and dragged, in a pink Space. Check that the name stays on one line with an ellipsis in the importing tile and in the ghost, each keeping the full name in its title, and that the ghost pill and the progress fill follow the Space hue rather than a fixed blue.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const slot of ["library-item", "library-drag-ghost"]) {
			const name = within(slotIn(canvasElement, slot)).getByTitle(
				LONG_DROPPED_NAME,
			)
			await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
			await expect(getComputedStyle(name).whiteSpace).toBe("nowrap")
		}

		const accent = rgbOf(hueTone(HUE_PRESETS.pink, "dark", "accent").hex)
		await waitFor(() =>
			expect(
				getComputedStyle(slotIn(canvasElement, "library-drag-count"))
					.backgroundColor,
			).toBe(accent),
		)
		await expect(
			getComputedStyle(slotIn(canvasElement, "library-import-progress"))
				.backgroundColor,
		).toBe(accent)
	},
})

export const ImportFailures = meta.story({
	render: (args) => (
		<LibraryStoryFrame hue="blue">
			<LibraryPanel {...args} />
			<NoticeSurface />
		</LibraryStoryFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The notice raised when a file fails to import, once per reason the host or the size check can answer, then the generic sentence for any other failure, which stays on screen. The title names the file from `common:library.failure.import.title`, the second line is `common:library.failure.import.<reason>`. Check that each second line says what went wrong and the gesture that fixes it, and that no raw reason code reaches the screen.",
			},
		},
	},
	play: async () => {
		const en = i18n.getFixedT("en", "common")
		const fr = i18n.getFixedT("fr", "common")
		const title = en("library.failure.import.title", { name: "launch-plan.md" })

		for (const [index, reason] of IMPORT_FAILURE_REASONS.entries()) {
			const sentence = en(`library.failure.import.${reason}`)
			const notice = raiseFailureNotice({ title, description: sentence })

			const shown = await waitFor(() => {
				const line = slotsIn(document.body, "toast-description").find(
					({ textContent }) => textContent === sentence,
				)
				if (!line) throw new Error(`The ${reason} sentence is not drawn`)
				expect(line).toBeVisible()
				return line
			})
			const card = shown.closest<HTMLElement>("[data-slot=toast]")
			if (!card) throw new Error(`The ${reason} notice is not drawn`)
			await Promise.all(
				card.getAnimations({ subtree: true }).map(({ finished }) => finished),
			)
			await expect(card).toHaveTextContent(title)
			await expect(card.textContent).not.toMatch(RAW_REASON_CODE)
			await expect(fr(`library.failure.import.${reason}`)).not.toBe(sentence)

			if (index < IMPORT_FAILURE_REASONS.length - 1) endNotice(notice)
		}
	},
})
