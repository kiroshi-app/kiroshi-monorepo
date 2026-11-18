import { type ReactNode, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
	expect,
	fn,
	mocked,
	screen,
	spyOn,
	waitFor,
	within,
} from "storybook/test"
import { decorators as pseudoStateDecorators } from "storybook-addon-pseudo-states/preview"

import preview from "@workspace/storybook/preview"
import {
	expectBarDragsTheWindow,
	expectBarLeavesTheWindowInPlace,
	expectContentAtBarInset,
	hueScopeOf,
	isInBrowserRunner,
	middleClick,
	realPointer,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { CONVERSATION_BOTS } from "@workspace/ui/components/bots.fixtures"
import {
	CompanionMenuContent,
	CompanionMenuProvider,
} from "@workspace/ui/components/companion-menu"
import { CompanionSelectProvider } from "@workspace/ui/components/companion-select"
import { ContentCard } from "@workspace/ui/components/content-card"
import { hueTone } from "@workspace/ui/components/hue-palette"
import { HUE_PRESETS } from "@workspace/ui/components/hue-tones"
import {
	LIBRARY_BOARDS,
	LIBRARY_DRAG_PREVIEW,
	LIBRARY_DROPPED_NAMES,
	LIBRARY_EMPTY_BOARD,
	LIBRARY_ITEMS,
	LIBRARY_ITEMS_AFTER_IMPORT,
	LIBRARY_ITEMS_WITH_BOARDS,
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
import { RosterProvider } from "@workspace/ui/components/roster"
import type { RosterMenuSection } from "@workspace/ui/components/roster-menu-items"
import type { Space } from "@workspace/ui/components/space"
import { DEFAULT_LANGUAGE, i18n } from "@workspace/ui/lib/i18n"
import { cn } from "@workspace/ui/lib/utils"

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

const ARTBOARD_FRAMES = {
	wide: "w-[960px]",
	narrow: "w-[480px]",
	reflow: "w-[320px]",
}

type LibraryArtboardFrameProps = {
	width: keyof typeof ARTBOARD_FRAMES
	children: ReactNode
}

const LibraryArtboardFrame = ({
	width,
	children,
}: LibraryArtboardFrameProps) => (
	<div
		className={cn("flex h-[640px]", ARTBOARD_FRAMES[width])}
		data-slot="library-artboard-frame"
		{...hueScopeOf("blue")}
	>
		<ContentCard isLandmark={false}>{children}</ContentCard>
	</div>
)

const pressedFillOf = (segment: HTMLElement) =>
	slotIn(segment.parentElement as HTMLElement, "sliding-tabs-pill")

const barActionsIn = (canvasElement: HTMLElement) =>
	within(slotIn(canvasElement, "app-header")).queryAllByRole("button")

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
	"imageUnreadable",
	"refused",
	"generic",
] as const

const URL_IMPORT_FAILURE_REASONS = [
	"unsupportedScheme",
	"privateAddress",
	"networkFailure",
	"tooLarge",
	"unknownSpace",
] as const

const IMPORT_FAILURES = [
	...URL_IMPORT_FAILURE_REASONS.map((reason) => ({
		key: `url.${reason}` as const,
		name: "https://example.com/launch-photo.png",
	})),
	...IMPORT_FAILURE_REASONS.map((reason) => ({
		key: reason,
		name: "launch-plan.md",
	})),
]

const RAW_REASON_CODE = new RegExp(
	`\\b(${[...IMPORT_FAILURE_REASONS, ...URL_IMPORT_FAILURE_REASONS].join("|")})\\b`,
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
	onNewBoard: fn(),
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
					"The Library tab of a Space: every image, document and board the Space holds, read-only. A static bar tops the panel: a muted line over the Library title on one side, Import, New board and New document on the other, each drawn only when its callback is passed, Import and New board dropping to their glyph and a tooltip once the panel is too narrow for their label, New document following once its label would cut the title. The filters and the search open the content under the bar and scroll away with the grid, the search moving under the filters once the row is too narrow for both. The filters are one single-selection toggle group whose pressed segment wears the Space colour; each grid item is a single button that hands the item to `onOpenItem`, and a right-click on it opens the item action menu, listing only the actions whose callback is given. A Library with nothing in it trades the grid for the Start a document templates and the Bring in files strip, and while the Library loads a grid skeleton fills the card. Pass a `LibraryLightbox` as `overlay` so it covers the card.",
			},
		},
	},
	globals: { theme: "dark" },
	decorators: pseudoStateDecorators,
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
					"The Library as artboard 1 draws it at a 1280 by 832 window: four columns of 285, All checked. Check that All wears the Space colour and carries the total count, that a keyboard reader reaches an item with Tab and sees its ring, and that pressing it hands the item to `onOpenItem`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const filters = canvas.getByRole("group", { name: "Show" })
		const all = within(filters).getByRole("button", {
			name: `All ${LIBRARY_ITEMS.length}`,
		})
		await expect(all).toHaveAttribute("aria-pressed", "true")
		await expect(all.getBoundingClientRect().height).toBe(26)
		await expect(getComputedStyle(all).transitionProperty).toBe("none")
		await expectContentAtBarInset(
			slotIn(canvasElement, "library-panel"),
			slotIn(canvasElement, "library-controls"),
		)

		const accent = getComputedStyle(slotIn(canvasElement, "library-panel"))
			.getPropertyValue("--primary")
			.trim()
		await expect(getComputedStyle(pressedFillOf(all)).backgroundColor).toBe(
			rgbOf(accent),
		)
		if (isInBrowserRunner()) {
			const pointer = await realPointer()
			try {
				await pointer.hover(all)
				await waitFor(() => expect(all.matches(":hover")).toBe(true))
				await expect(all).toHaveAttribute("aria-pressed", "true")
				await expect(getComputedStyle(pressedFillOf(all)).backgroundColor).toBe(
					rgbOf(accent),
				)
				await expect(getComputedStyle(all).backgroundColor).toBe(TRANSPARENT)
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
		await expect(Number.parseFloat(columns[0] ?? "")).toBeCloseTo(285, 0)

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

export const GridMiddleClick = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A middle-click on a ready image and on a ready document. Check that each hands its item to `onOpenItem` once, while the auxclick is still dispatching, and that the middle button pressed down keeps no autoscroll cursor.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const opened: [string | undefined, LibraryItem][] = []
		mocked(args.onOpenItem).mockImplementation((item) => {
			opened.push([window.event?.type, item])
		})

		const image = canvas.getByRole("button", { name: /hero-dunes\.png/ })
		await expect(middleClick(image)).toBe(false)
		const brief = canvas.getByRole("button", { name: /Spring launch brief/ })
		await expect(middleClick(brief)).toBe(false)

		await expect(opened).toEqual([
			["auxclick", LIBRARY_ITEMS[0]],
			["auxclick", LIBRARY_ITEMS[2]],
		])
	},
})

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
		await expect(args.onOpenItem).not.toHaveBeenCalled()
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

export const GridImageMenu = meta.story({
	args: {
		onOpen: fn(),
		onDelete: fn(),
		onSaveToLibrary: fn(),
		onCopyImage: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"An image and a document right-clicked in one grid, item actions and the image actions given. Check that the image menu lists the item actions, then Save to Library and Copy image under one rule, that Copy image hands the image item to `onCopyImage`, and that the document menu lists the item actions alone.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const menuOf = async (name: string) => {
			await userEvent.pointer({
				keys: "[MouseRight]",
				target: canvas.getByRole("button", { name: new RegExp(name) }),
			})
			return within(document.body).findByRole("menu", {
				name: `Actions for ${name}`,
			})
		}
		const entriesOf = (menu: HTMLElement) =>
			within(menu)
				.getAllByRole("menuitem")
				.map((entry) => entry.textContent)

		const imageMenu = await menuOf("hero-dunes.png")
		await expect(entriesOf(imageMenu)).toEqual([
			"Open",
			"Delete",
			"Save to Library",
			"Copy image",
		])
		await expect(
			within(imageMenu).getByRole("menuitem", { name: "Save to Library" })
				.previousElementSibling,
		).toHaveAttribute("role", "separator")
		await userEvent.click(
			within(imageMenu).getByRole("menuitem", { name: "Copy image" }),
		)
		await expect(args.onCopyImage).toHaveBeenCalledWith(LIBRARY_ITEMS[0])
		await waitFor(() =>
			expect(within(document.body).queryByRole("menu")).toBe(null),
		)

		await expect(entriesOf(await menuOf("Spring launch brief"))).toEqual([
			"Open",
			"Delete",
		])
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

const resolvedColourOf = (root: HTMLElement, value: string) => {
	const probe = document.createElement("span")
	probe.style.backgroundColor = value
	root.append(probe)
	const colour = getComputedStyle(probe).backgroundColor
	probe.remove()
	return colour
}

const boardTileIn = (root: HTMLElement, name: string) =>
	within(root).getByRole("button", { name: new RegExp(`^${name}`) })

export const GridWithBoards = meta.story({
	args: { items: LIBRARY_ITEMS_WITH_BOARDS },
	parameters: {
		docs: {
			description: {
				story:
					"The Library as artboard 6a draws it, dark theme: two boards among the images and documents, each a miniature of the board drawn with the board objects themselves over the dot grid. Check that Boards and its count follow Documents, that a board tile shares the document tile's border, hover and ring, and that pressing it hands the board to `onOpenItem`. The tile keeps the shipped 180px preview and 10px caption gap rather than the artboard's 184 and 12, so mixed rows stay aligned.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const filters = canvas.getByRole("group", { name: "Show" })
		const pills = within(filters).getAllByRole("button")
		await expect(pills.map((pill) => pill.textContent)).toEqual([
			`All${LIBRARY_ITEMS_WITH_BOARDS.length}`,
			"Images8",
			"Documents4",
			"Boards2",
		])

		const tile = boardTileIn(canvasElement, "Launch plan")
		await expect(tile).toHaveAccessibleName(
			"Launch plan Board · 6 items · 2 min ago",
		)
		const thumbnail = slotIn(tile, "library-thumbnail")
		await expect(getComputedStyle(thumbnail).backgroundColor).toBe(
			resolvedColourOf(canvasElement, "var(--board-surface)"),
		)
		const miniature = slotIn(thumbnail, "board-miniature")
		await expect(miniature).toHaveAttribute("aria-hidden", "true")
		await expect(getComputedStyle(miniature).pointerEvents).toBe("none")
		await expect(slotIn(miniature, "board-dot-grid")).toBeVisible()
		await waitFor(() =>
			expect(slotsIn(miniature, "board-sticky")).toHaveLength(3),
		)
		await expect(slotsIn(miniature, "board-section")).toHaveLength(1)
		await expect(slotsIn(miniature, "board-shape")).toHaveLength(1)
		await expect(slotsIn(miniature, "board-text")).toHaveLength(1)
		await expect(miniature.querySelector("img")).toBe(null)

		const documentTile = canvas.getByRole("button", {
			name: /Spring launch brief/,
		})
		await expect(tile.className).toBe(documentTile.className)
		await expect(thumbnail.className.replace("bg-board-surface", "")).toBe(
			slotIn(documentTile, "library-thumbnail").className.replace(
				"bg-(--document-ground)",
				"",
			),
		)

		for (let press = 0; press < 12 && document.activeElement !== tile; press++)
			await userEvent.tab()
		await expect(tile).toHaveFocus()
		await expect(tile.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(tile).outlineStyle).toBe("solid")

		await userEvent.click(tile)
		await expect(args.onOpenItem).toHaveBeenCalledWith(LIBRARY_BOARDS[0])

		await userEvent.click(
			within(filters).getByRole("button", { name: /Boards/ }),
		)
		await expect(args.onFilterChange).toHaveBeenLastCalledWith("boards")
	},
})

export const GridWithBoardsLight = GridWithBoards.extend({
	globals: { theme: "light" },
})

export const GridBoardContextMenu = meta.story({
	args: {
		items: LIBRARY_ITEMS_WITH_BOARDS,
		onOpen: fn(),
		onRename: fn(),
		onDelete: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A board tile right-clicked: the same item action menu a document opens, listing only the actions given. Check that an entry hands the board to its callback and that the right-click never opens it.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await userEvent.pointer({
			keys: "[MouseRight]",
			target: boardTileIn(canvasElement, "Launch plan"),
		})
		const menu = await within(document.body).findByRole("menu", {
			name: "Actions for Launch plan",
		})
		await expect(
			within(menu)
				.getAllByRole("menuitem")
				.map((entry) => entry.textContent),
		).toEqual(["Open", "Rename", "Delete"])
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Rename" }),
		)
		await expect(args.onRename).toHaveBeenCalledWith(LIBRARY_BOARDS[0])
		await expect(args.onOpenItem).not.toHaveBeenCalled()
	},
})

export const GridBoards = meta.story({
	args: { items: LIBRARY_ITEMS_WITH_BOARDS, filter: "boards" },
	parameters: {
		docs: {
			description: {
				story:
					"The Boards filter checked: only the boards stay in the grid. Check that the checked pill moves to Boards and that no image or document page is left.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("button", { name: "Boards 2" }),
		).toHaveAttribute("aria-pressed", "true")
		await expect(slotsIn(canvasElement, "library-item")).toHaveLength(2)
		await expect(slotsIn(canvasElement, "board-miniature")).toHaveLength(2)
		await expect(slotsIn(canvasElement, "library-page")).toHaveLength(0)
	},
})

export const GridBoardWithEmptySnapshot = meta.story({
	args: { items: [LIBRARY_EMPTY_BOARD, ...LIBRARY_ITEMS_WITH_BOARDS] },
	parameters: {
		docs: {
			description: {
				story:
					"A board with nothing on it yet, first in the grid, dark theme: the dot grid ground alone, at the same height as every other tile.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const tile = boardTileIn(canvasElement, "Sprint retro")
		const miniature = slotIn(tile, "board-miniature")
		await expect(slotIn(miniature, "board-dot-grid")).toBeVisible()
		await expect(slotsIn(miniature, "board-miniature-object")).toHaveLength(0)
		await expect(
			slotIn(tile, "library-thumbnail").getBoundingClientRect().height,
		).toBe(180)
	},
})

export const GridBoardWithEmptySnapshotLight =
	GridBoardWithEmptySnapshot.extend({ globals: { theme: "light" } })

export const NewBoardAction = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The bar with its three buttons, dark theme: New board, a bordered button identical to Import with the board glyph, between Import and New document. Check that it reports `onNewBoard`.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const buttons = barActionsIn(canvasElement)
		await expect(buttons.map((button) => button.textContent)).toEqual([
			"Import",
			"New board",
			"New document",
		])
		const [importPill, newBoard] = buttons
		if (!(importPill && newBoard)) throw new Error("The header lost an action")
		await expect(newBoard.className).toBe(importPill.className)
		await expect(newBoard.getBoundingClientRect().height).toBe(32)
		const glyph = newBoard.querySelector("svg")
		await expect(glyph?.getAttribute("aria-hidden")).toBe("true")
		await expect(glyph?.getBoundingClientRect().width).toBe(
			importPill.querySelector("svg")?.getBoundingClientRect().width,
		)

		await userEvent.click(newBoard)
		await expect(args.onNewBoard).toHaveBeenCalledOnce()
	},
})

export const NewBoardActionLight = NewBoardAction.extend({
	globals: { theme: "light" },
})

const [ATLAS] = CONVERSATION_BOTS

const CONTROLS_DOCUMENT: LibraryItem = {
	kind: "document",
	id: "launch-checklist",
	name: "Launch checklist",
	detail: "Document · 2 KB · 5 min ago",
	excerpt: [
		"# Launch checklist",
		`Read the [partner brief](https://example.com/brief) before the call with <@${ATLAS.id}>.`,
		"- [x] Draft the pricing page\n- [ ] Book the onboarding emails",
		"| Channel | Owner |\n| --- | --- |\n| Newsletter | Mara |",
		'```ts\nconst launch = "spring"\n```',
	].join("\n\n"),
}

const NEXT_DOCUMENT: LibraryItem = {
	...CONTROLS_DOCUMENT,
	id: "launch-notes",
	name: "Launch notes",
	excerpt: "Notes from the partner call.",
}

const NO_SPACES: Space[] = []

const NO_MEMBERSHIPS: string[] = []

const NO_SECTIONS: RosterMenuSection[] = []

const companionMenuFor = (companionId: string) =>
	companionId === ATLAS.id ? (
		<CompanionMenuContent
			companion={{ id: ATLAS.id, name: ATLAS.name }}
			isPinned={false}
			memberships={NO_MEMBERSHIPS}
			onDelete={fn()}
			sections={NO_SECTIONS}
			spaces={NO_SPACES}
		/>
	) : null

const INTERACTIVE_ELEMENTS =
	"button, a, input, select, textarea, summary, [tabindex]"

const NESTED_INTERACTIVE_WARNING =
	/cannot (be a descendant of|contain a nested)/

export const GridDocumentPreviewHoldsNoControl = meta.story({
	args: { items: [CONTROLS_DOCUMENT, NEXT_DOCUMENT] },
	render: (args) => (
		<CompanionMenuProvider menuFor={companionMenuFor}>
			<CompanionSelectProvider onSelect={fn()}>
				<RosterProvider bots={CONVERSATION_BOTS}>
					<LibraryStoryFrame hue="blue">
						<LibraryPanel {...args} />
					</LibraryStoryFrame>
				</RosterProvider>
			</CompanionSelectProvider>
		</CompanionMenuProvider>
	),
	beforeEach: () => {
		const consoleError = spyOn(console, "error")
		return () => consoleError.mockRestore()
	},
	parameters: {
		docs: {
			description: {
				story:
					"A document whose start holds a link, a mention of Atlas, a task list, a table and a code block, under the companion select and menu providers the workspace mounts. Check that the page draws each of them as a still picture: the link as plain text, the mention as its pill with no button and no menu, each box in its state, the table and the code without their copy control, and that the item stays one Tab stop that opens on a press anywhere on its page.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const item = canvas.getByRole("button", { name: /^Launch checklist/ })
		const page = slotIn(item, "library-page")

		await expect(item.querySelectorAll(INTERACTIVE_ELEMENTS)).toHaveLength(0)
		await expect(page).toHaveTextContent("Read the partner brief before")
		const mention = slotIn(page, "bot-mention")
		await expect(mention.tagName).toBe("SPAN")
		await expect(mention).toHaveTextContent(ATLAS.name)
		await expect(
			item.querySelectorAll("[data-slot=context-menu-trigger]"),
		).toHaveLength(0)
		await expect(page.querySelector("table")).toHaveTextContent("Newsletter")
		await expect(page.querySelector("pre")).toHaveTextContent(
			'const launch = "spring"',
		)
		const boxes = slotsIn(page, "markdown-task-box")
		await expect(boxes.map((box) => box.hasAttribute("data-checked"))).toEqual([
			true,
			false,
		])
		await expect(
			mocked(console.error).mock.calls.filter((call) =>
				NESTED_INTERACTIVE_WARNING.test(call.map(String).join(" ")),
			),
		).toHaveLength(0)

		item.focus()
		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: /^Launch notes/ }),
		).toHaveFocus()

		await userEvent.click(slotIn(item, "library-thumbnail"))
		await expect(args.onOpenItem).toHaveBeenCalledOnce()
		await expect(args.onOpenItem).toHaveBeenCalledWith(CONTROLS_DOCUMENT)
	},
})

const SIDE_BY_SIDE_SPACE_HUES = ["pink", "green"] as const

const DOCUMENT_ITEMS = LIBRARY_ITEMS.filter((item) => item.kind === "document")

export const GridDocumentsAcrossSpaces = meta.story({
	render: (args) => (
		<div className="flex h-[832px] w-[1280px] gap-1.5 bg-background p-2">
			{SIDE_BY_SIDE_SPACE_HUES.map((hue) => (
				<div className="flex min-w-0 flex-1" key={hue} {...hueScopeOf(hue)}>
					<ContentCard isLandmark={false}>
						<div className="p-6">
							<LibraryGrid
								items={DOCUMENT_ITEMS}
								onOpenItem={args.onOpenItem}
							/>
						</div>
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
	play: async ({ canvasElement }) => {
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
	},
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
					"A search that found items: the app hands over the matching items with the query set. Check that the field is 32 px high and led by the search icon, that the query sits at 13 px on a 16 px line, that the field keeps its name and placeholder, and that a keyboard reader reaching it sees its focus ring.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const search = canvas.getByRole("searchbox", { name: "Search the Library" })
		await expect(search).toHaveValue("dashboard")
		await expect(search).toHaveAttribute("placeholder", "Search the Library")
		await expect(search.getBoundingClientRect().height).toBe(32)
		await expect(getComputedStyle(search).fontSize).toBe("13px")
		await expect(getComputedStyle(search).lineHeight).toBe("16px")
		await expect(getComputedStyle(search).transitionProperty).toBe("none")

		const icon = slotIn(canvasElement, "library-search").querySelector("svg")
		await expect(icon?.getBoundingClientRect().left).toBeLessThan(
			search.getBoundingClientRect().left + 16,
		)
		await expect(slotsIn(canvasElement, "library-item").length).toBeGreaterThan(
			0,
		)

		for (let press = 0; press < 8 && document.activeElement !== search; press++)
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
		onNewBoard: undefined,
		onStartTemplate: undefined,
		onSearchQueryChange: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"An empty Library before Import, New board, New document and the templates exist in the app: the bar with its title alone. Check that no control, no empty button group, no content row and no section title is left behind by an absent callback, so the empty Library never offers a press that does nothing.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.queryAllByRole("button")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "library-actions")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "library-controls")).toHaveLength(0)
		await expect(
			within(slotIn(canvasElement, "app-header")).getByRole("heading", {
				level: 1,
				name: "Library",
			}),
		).toBeVisible()
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
					"An empty Library as artboard 6c draws it, dark theme: the bar keeps its buttons, then Blank document, Blank board and the three templates under Start a document, then the Bring in files strip. Check that the filters and the search drop with their row, that Blank board follows Blank document on the dot grid ground with its yellow sticky, and that each card reports its own callback. The artboard's Blank document glyph and its absent templates are left to their own tickets.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.queryByRole("group", { name: "Show" })).toBe(null)
		await expect(slotsIn(canvasElement, "library-controls")).toHaveLength(0)
		await expect(canvas.queryByRole("searchbox")).toBe(null)
		await expect(
			canvas.getByRole("heading", { level: 1, name: "Library" }),
		).toBeVisible()
		await expect(
			barActionsIn(canvasElement).map((button) => button.textContent),
		).toEqual(["Import", "New board", "New document"])
		await expectContentAtBarInset(
			slotIn(canvasElement, "library-panel"),
			slotIn(canvasElement, "screen-layout-column")
				.firstElementChild as Element,
		)

		const cards = slotsIn(canvasElement, "library-template")
		await expect(cards.slice(0, 2).map((card) => card.textContent)).toEqual([
			"Blank document",
			"Blank board",
		])
		const blankBoard = cards[1]
		if (!blankBoard) throw new Error("Blank board is missing")
		await expect(blankBoard.getBoundingClientRect().width).toBe(200)
		await expect(slotIn(blankBoard, "board-dot-grid")).toHaveAttribute(
			"aria-hidden",
			"true",
		)
		const sticky = slotIn(blankBoard, "library-blank-board-sticky")
		await expect(sticky).toHaveAttribute("aria-hidden", "true")
		await expect(getComputedStyle(sticky).rotate).toBe("-4deg")
		await expect(sticky.offsetWidth).toBe(40)
		await userEvent.click(blankBoard)
		await expect(args.onNewBoard).toHaveBeenCalledOnce()

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
					"The Library before its first read lands, as artboard 6b draws it, dark theme: the bar and its buttons stay, and once the read has been slow for 300ms the four filters are drawn as a skeleton in the content row, beside the search, and the grid as a skeleton 16 px under that row, whose tiles keep the loaded tile geometry and reach the bottom of the card. Check that nothing is drawn under the bar at first, that the grid skeleton then runs from under the content row to the card's bottom edge in more than one row, and that the panel says it is busy throughout.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelector("[aria-busy=true]")).not.toBe(null)
		await expect(
			canvas.getByRole("button", { name: "New board" }),
		).toBeVisible()
		await expect(slotsIn(canvasElement, "library-grid-skeleton")).toHaveLength(
			0,
		)
		await expect(slotsIn(canvasElement, "library-controls")).toHaveLength(0)
		await waitFor(() =>
			expect(
				slotIn(
					slotIn(canvasElement, "library-controls"),
					"library-filters-skeleton",
				).children,
			).toHaveLength(4),
		)
		await expect(canvas.getByRole("searchbox")).toBeVisible()
		await expect(canvas.queryByRole("group", { name: "Show" })).toBe(null)
		await expectContentAtBarInset(
			slotIn(canvasElement, "library-panel"),
			slotIn(canvasElement, "library-controls"),
		)
		await expect(
			slotIn(canvasElement, "library-grid-skeleton").getBoundingClientRect()
				.top,
		).toBe(
			slotIn(canvasElement, "library-controls").getBoundingClientRect().bottom +
				16,
		)
		await expect(canvasElement.querySelector("[aria-busy=true]")).not.toBe(null)
		await expect(
			slotIn(canvasElement, "list-skeleton").getBoundingClientRect().bottom,
		).toBe(
			slotIn(canvasElement, "library-panel").getBoundingClientRect().bottom,
		)
		await waitFor(() =>
			expect(
				slotsIn(canvasElement, "list-skeleton-row").length,
			).toBeGreaterThan(1),
		)
	},
})

export const LoadingLight = Loading.extend({
	globals: { theme: "light" },
})

const WHITESPACE_NAMED_DOCUMENT: LibraryItem = {
	kind: "document",
	id: "whitespace",
	name: "   ",
	detail: "Document · 1 KB · 2 min ago",
	excerpt: "Notes that never got a title.",
}

export const EmptyWithEveryCallbackLight = EmptyWithEveryCallback.extend({
	globals: { theme: "light" },
})

export const WhitespaceNameReadsUntitled = meta.story({
	args: {
		items: [WHITESPACE_NAMED_DOCUMENT],
		onRename: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A document whose name holds only spaces. Check that its caption and its item action menu say Untitled, and that Rename still hands the item its own name.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const item = canvas.getByRole("button", { name: /^Untitled/ })
		await expect(within(item).getByTitle("Untitled")).toHaveTextContent(
			"Untitled",
		)

		await userEvent.pointer({ keys: "[MouseRight]", target: item })
		const menu = await within(document.body).findByRole("menu", {
			name: "Actions for Untitled",
		})
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Rename" }),
		)
		await expect(args.onRename).toHaveBeenCalledWith(WHITESPACE_NAMED_DOCUMENT)
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
				getComputedStyle(
					pressedFillOf(canvas.getByRole("button", { name: /^All/ })),
				).backgroundColor,
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
		middleClick(tile)
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
					"The notice raised when a dropped link or a file fails to import, once per reason the host or the size check can answer, then the generic sentence for any other failure, which stays on screen. The title names the link or the file from `common:library.failure.import.title`, the second line is `common:library.failure.import.url.<reason>` for a link and `common:library.failure.import.<reason>` for a file. Check that each second line says what went wrong and the gesture that fixes it, and that no raw reason code reaches the screen.",
			},
		},
	},
	play: async () => {
		const en = i18n.getFixedT("en", "common")
		const fr = i18n.getFixedT("fr", "common")

		for (const [index, { key: reason, name }] of IMPORT_FAILURES.entries()) {
			const title = en("library.failure.import.title", { name })
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

			if (index < IMPORT_FAILURES.length - 1) endNotice(notice)
		}
	},
})

const TRANSPARENT = "rgba(0, 0, 0, 0)"

const SCROLLED_AWAY = 240

const boxOf = (element: Element) => element.getBoundingClientRect()

const countOf = (items: LibraryItem[], kind: LibraryItem["kind"]) =>
	items.filter((item) => item.kind === kind).length

const expectFill = (control: HTMLElement, fill: string, host = control) =>
	expect(getComputedStyle(control).backgroundColor).toBe(
		tokenStyleIn(host, fill, "backgroundColor"),
	)

const expectSpaceColourRingDrawn = async (
	control: HTMLElement,
	host = control,
) => {
	await expect(getComputedStyle(control).boxShadow).toBe(
		tokenStyleIn(host, "ring-4 ring-primary/30", "boxShadow"),
	)
	await expect(getComputedStyle(control).borderTopWidth).toBe("1px")
	await expect(getComputedStyle(control).borderTopColor).toBe(
		tokenStyleIn(host, "border border-primary", "borderTopColor"),
	)
}

const expectSpaceColourRing = async (control: HTMLElement, host = control) => {
	await expect(control.matches(":focus-visible")).toBe(true)
	await expectSpaceColourRingDrawn(control, host)
}

const isDarkAround = (element: Element) => element.closest(".dark") !== null

const SELECTED_COUNT_INK = {
	light: "text-primary-foreground",
	dark: "text-[color-mix(in_oklab,var(--primary-foreground)_70%,var(--primary))]",
}

const SECONDARY_HOVER_FILL = "bg-foreground/5"

const SECONDARY_PRESSED_FILL = "bg-foreground/10"

const SECONDARY_REST_FILL = { light: "bg-card", dark: "bg-foreground/4" }

const PRIMARY_AT_REST = {
	light: { fill: "bg-primary", ink: "text-primary-foreground" },
	dark: {
		fill: "bg-(--hue-dark-bubble)",
		ink: "text-(--hue-dark-bubble-foreground)",
	},
}

const BLUE_NEW_DOCUMENT_FILL = {
	light: { rest: "#2d62ac", hover: "#27579a", pressed: "#214b86" },
	dark: { rest: "#2b5288", hover: "#254879", pressed: "#1f3e69" },
}

const themeAround = (element: Element) =>
	isDarkAround(element) ? "dark" : "light"

const paintedFillOf = (control: HTMLElement) => {
	const context = document.createElement("canvas").getContext("2d")
	if (!context) throw new Error("Nothing here can paint a colour")
	context.fillStyle = getComputedStyle(control).backgroundColor
	context.fillRect(0, 0, 1, 1)
	const { data } = context.getImageData(0, 0, 1, 1)
	const channels = Array.from(data.slice(0, 3), (channel) =>
		channel.toString(16).padStart(2, "0"),
	)
	return `#${channels.join("")}`
}

const barIn = (canvasElement: HTMLElement) => {
	const bar = slotIn(canvasElement, "app-header")

	return {
		panel: slotIn(canvasElement, "library-panel"),
		bar,
		heading: within(bar).getByRole("heading", { level: 1 }),
		topLine: slotIn(bar, "app-header-top-line"),
		actions: barActionsIn(canvasElement),
	}
}

const controlsIn = (canvasElement: HTMLElement) => {
	const controls = slotIn(canvasElement, "library-controls")
	const segments = within(controls).getAllByRole("button")
	const [all, images] = segments
	const searchField = slotIn(controls, "library-search")
	const searchGlyph = searchField.querySelector("svg")
	if (!(all && images && searchGlyph))
		throw new Error("The content row lost a control")

	return {
		controls,
		filters: slotIn(controls, "library-filters"),
		segments,
		all,
		images,
		searchField,
		search: within(controls).getByRole("searchbox"),
		searchGlyph,
	}
}

const glyphOf = (action: HTMLElement) => {
	const glyph = action.querySelector("svg")
	if (!glyph) throw new Error("The action lost its glyph")
	return glyph
}

type RealPointer = Awaited<ReturnType<typeof realPointer>>

const tabTo = async (pointer: RealPointer, control: HTMLElement) => {
	for (let press = 0; press < 8 && document.activeElement !== control; press++)
		await pointer.tab()
	await expect(control).toHaveFocus()
}

const expectNoHorizontalOverflow = async (canvasElement: HTMLElement) => {
	const { panel, bar, heading, actions } = barIn(canvasElement)
	const frame = boxOf(panel)
	const scroller = slotIn(canvasElement, "screen-layout-scroller")
	const [first] = actions
	if (!first) throw new Error("The bar lost its actions")

	for (const box of [panel, bar, scroller])
		await expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth)
	for (const action of actions) {
		await expect(boxOf(action).left).toBeGreaterThanOrEqual(frame.left + 12)
		await expect(boxOf(action).right).toBeLessThanOrEqual(frame.right - 12)
	}
	await expect(boxOf(heading).left - frame.left).toBe(12)
	await expect(boxOf(first).left - boxOf(heading).right).toBeGreaterThanOrEqual(
		12,
	)
}

const expectSecondaryAtRest = async (action: HTMLElement) => {
	await expectFill(action, SECONDARY_REST_FILL[themeAround(action)])
	await expect(getComputedStyle(action).borderTopWidth).toBe("1px")
	await expect(getComputedStyle(action).borderTopColor).toBe(
		tokenStyleIn(action, "border border-foreground/12", "borderTopColor"),
	)
	await expect(getComputedStyle(action).color).toBe(
		tokenStyleIn(action, "text-foreground", "color"),
	)
	await expect(getComputedStyle(glyphOf(action)).color).toBe(
		tokenStyleIn(action, "text-soft-foreground", "color"),
	)
}

const expectPrimaryAtRest = async (action: HTMLElement) => {
	const { fill, ink } = PRIMARY_AT_REST[themeAround(action)]
	await expectFill(action, fill)
	await expect(getComputedStyle(action).color).toBe(
		tokenStyleIn(action, ink, "color"),
	)
	await expect(getComputedStyle(glyphOf(action)).color).toBe(
		getComputedStyle(action).color,
	)
	await expect(getComputedStyle(action).borderTopWidth).toBe("0px")
}

const expectBarAsDrawn = async (
	canvasElement: HTMLElement,
	items: LibraryItem[],
	labels: string[],
) => {
	const { panel, bar, heading, topLine, actions } = barIn(canvasElement)
	const frame = boxOf(panel)

	await expect(slotIn(canvasElement, "screen-layout").firstElementChild).toBe(
		bar,
	)
	await expect([
		boxOf(bar).top - frame.top,
		boxOf(bar).width,
		boxOf(bar).height,
		getComputedStyle(bar).paddingLeft,
		getComputedStyle(bar).borderBottomWidth,
	]).toEqual([0, frame.width, 56, "12px", "1px"])

	await expect(topLine).toHaveTextContent(
		"Every image and document in this Space.",
	)
	await expect([
		boxOf(topLine).height,
		getComputedStyle(topLine).fontSize,
		getComputedStyle(topLine).lineHeight,
		getComputedStyle(topLine).color,
	]).toEqual([
		16,
		"12px",
		"16px",
		tokenStyleIn(bar, "text-muted-foreground", "color"),
	])
	await expect(heading).toHaveTextContent("Library")
	await expect([
		boxOf(heading).top,
		getComputedStyle(heading).fontSize,
		getComputedStyle(heading).lineHeight,
		getComputedStyle(heading).fontWeight,
	]).toEqual([boxOf(topLine).bottom, "14px", "18px", "600"])

	await expect(actions.map((action) => action.textContent)).toEqual(labels)
	const newDocument = actions.at(-1)
	if (!newDocument) throw new Error("The bar lost New document")
	await expect(frame.right - boxOf(newDocument).right).toBe(12)
	for (const [index, action] of actions.entries()) {
		const previous = actions[index - 1]
		if (previous)
			await expect(boxOf(action).left - boxOf(previous).right).toBeCloseTo(8)
		await expect([
			boxOf(action).height,
			boxOf(action).top - frame.top,
			getComputedStyle(action).borderTopLeftRadius,
			getComputedStyle(action).paddingLeft,
			getComputedStyle(action).columnGap,
			getComputedStyle(action).fontSize,
			getComputedStyle(action).lineHeight,
			getComputedStyle(action).fontWeight,
			boxOf(glyphOf(action)).width,
			getComputedStyle(action).transitionProperty,
		]).toEqual([
			32,
			12,
			tokenStyleIn(action, "rounded-full", "borderTopLeftRadius"),
			"12px",
			"6px",
			"13px",
			"16px",
			"500",
			14,
			"none",
		])
	}
	for (const secondary of actions.slice(0, -1))
		await expectSecondaryAtRest(secondary)
	await expectPrimaryAtRest(newDocument)

	const {
		controls,
		filters,
		segments,
		all,
		images,
		searchField,
		search,
		searchGlyph,
	} = controlsIn(canvasElement)
	const isDark = isDarkAround(panel)

	await expect(
		slotIn(canvasElement, "screen-layout-column").firstElementChild,
	).toBe(controls)
	await expect([
		boxOf(controls).top - boxOf(bar).bottom,
		boxOf(controls).left - frame.left,
		frame.right - boxOf(controls).right,
		boxOf(controls).height,
	]).toEqual([12, 12, 12, 32])
	await expect([
		boxOf(filters).left,
		boxOf(filters).top,
		boxOf(filters).height,
	]).toEqual([boxOf(controls).left, boxOf(controls).top, 32])
	await expectFill(filters, "bg-muted")
	await expect(segments.map((segment) => segment.textContent)).toEqual([
		`All${items.length}`,
		`Images${countOf(items, "image")}`,
		`Documents${countOf(items, "document")}`,
		`Boards${countOf(items, "board")}`,
	])
	await expect(all).toHaveAttribute("aria-pressed", "true")
	await expect([
		boxOf(all).height,
		getComputedStyle(all).fontSize,
		getComputedStyle(all).lineHeight,
		getComputedStyle(all).fontWeight,
	]).toEqual([26, "12px", "16px", "500"])
	await expectFill(pressedFillOf(all), "bg-primary", all)
	await expect(getComputedStyle(all).color).toBe(
		tokenStyleIn(all, "text-primary-foreground", "color"),
	)
	await expect(getComputedStyle(slotIn(all, "sliding-tab-count")).color).toBe(
		tokenStyleIn(all, SELECTED_COUNT_INK[isDark ? "dark" : "light"], "color"),
	)
	await expect(getComputedStyle(images).fontWeight).toBe("400")
	await expect(getComputedStyle(images).backgroundColor).toBe(TRANSPARENT)
	await expect(
		getComputedStyle(slotIn(images, "sliding-tab-count")).color,
	).toBe(tokenStyleIn(images, "text-muted-foreground", "color"))

	await expect([
		boxOf(search).width,
		boxOf(search).height,
		boxOf(search).top,
		boxOf(search).right,
	]).toEqual([240, 32, boxOf(controls).top, boxOf(controls).right])
	await expect(
		boxOf(search).left - boxOf(filters).right,
	).toBeGreaterThanOrEqual(12)
	await expectFill(search, "bg-foreground/3", searchField)
	await expect([
		getComputedStyle(search).borderTopWidth,
		getComputedStyle(search).borderTopColor,
		Number.parseFloat(getComputedStyle(search).borderTopLeftRadius) >= 16,
	]).toEqual([
		"1px",
		tokenStyleIn(searchField, "border-foreground/12", "borderTopColor"),
		true,
	])
	await expect([
		boxOf(searchGlyph).width,
		boxOf(searchGlyph).left - boxOf(search).left,
		boxOf(search).left +
			Number.parseFloat(getComputedStyle(search).borderLeftWidth) +
			Number.parseFloat(getComputedStyle(search).paddingLeft) -
			boxOf(searchGlyph).right,
		getComputedStyle(search).paddingRight,
	]).toEqual([14, 13, 8, "12px"])
	await expect(getComputedStyle(searchGlyph).color).toBe(
		tokenStyleIn(searchField, "text-muted-foreground", "color"),
	)
	await expect([
		getComputedStyle(search, "::placeholder").fontSize,
		getComputedStyle(search, "::placeholder").color,
	]).toEqual([
		"13px",
		tokenStyleIn(searchField, "text-muted-foreground", "color"),
	])
	for (const control of [all, images, search])
		await expect(getComputedStyle(control).transitionProperty).toBe("none")

	const grid = slotIn(canvasElement, "library-grid")
	await expect([
		boxOf(grid).left - frame.left,
		boxOf(grid).top - boxOf(controls).bottom,
		getComputedStyle(grid).columnGap,
	]).toEqual([12, 16, "16px"])
}

const ARTBOARD_ARGS = {
	items: LIBRARY_ITEMS_WITH_BOARDS,
	onImport: undefined,
} satisfies Partial<LibraryPanelProps>

export const Bar = meta.story({
	args: ARTBOARD_ARGS,
	globals: { theme: "light" },
	render: (args) => (
		<LibraryArtboardFrame width="wide">
			<LibraryPanel {...args} />
		</LibraryArtboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The Library as the app draws it today, artboard I5a without its Import button, 960 wide, light theme. Check that the bar is 56 px high across the panel, that the muted line sits over the Library title, that New board with its hairline border then New document on the Space colour end 12 px from the edge and 8 px apart, and that the filters on the left and the 240 px search on the right open the content 12 px under the bar and 12 px from the edge, as far as the bar title, 16 px over the grid.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectBarAsDrawn(canvasElement, args.items, [
			"New board",
			"New document",
		])
		await expectBarLeavesTheWindowInPlace(barIn(canvasElement).bar)
	},
})

export const BarDark = Bar.extend({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The Library as artboard I5b draws it without its Import button, 960 wide, dark theme. Check the same bar and content row as the light theme, each on the dark value of the same token, that New board sits on a 4 percent foreground fill under its hairline border, and that New document wears the dark bubble colour of the Space with its label and plus in the bubble ink.",
			},
		},
	},
})

export const BarWithImport = Bar.extend({
	args: { onImport: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"The Library as artboard I5a draws it, Import included, which the app does not pass yet. Check that Import comes first, wears the same hairline border as New board over the surface colour, and reports `onImport`, that its glyph is an arrow landing on a baseline, and that the New board glyph is a rounded frame holding a short line over a long one.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await expectBarAsDrawn(canvasElement, args.items, [
			"Import",
			"New board",
			"New document",
		])
		const [importAction] = barActionsIn(canvasElement)
		if (!importAction) throw new Error("The bar lost Import")

		await userEvent.click(importAction)
		await expect(args.onImport).toHaveBeenCalledOnce()
	},
})

export const BarWithImportDark = BarWithImport.extend({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The Library as artboard I5b draws it, Import included, 960 wide, dark theme. Check that Import and New board sit on a 4 percent foreground fill under their hairline border, their label in the foreground and their glyph in the soft ink, and that New document wears the dark bubble colour of the Space with its label and plus in the bubble ink.",
			},
		},
	},
})

export const BarDragsTheWindow = BarWithImport.extend({
	args: { dragRegion: "deep" },
	parameters: {
		docs: {
			description: {
				story:
					"The Library given `dragRegion`, as the frameless window mounts it, Import included so the bar holds its three actions. Check that the bar is drawn as in `BarWithImport` and carries the deep drag region, so a press on its empty stretch moves the window, and that Import, New board and New document are native buttons with no drag region of their own, so a press on one of them stays a click. Leave `dragRegion` out wherever a title bar already moves the window.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectBarAsDrawn(canvasElement, args.items, [
			"Import",
			"New board",
			"New document",
		])
		await expectBarDragsTheWindow(barIn(canvasElement).bar)
	},
})

export const BarScrolled = Bar.extend({
	parameters: {
		docs: {
			description: {
				story:
					"The grid scrolled as artboard I5c draws it. Check that the bar has not moved, that the filters and the search have left with the grid, that the grid stops at the bar's bottom edge instead of passing under it, and that no fade is drawn.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { panel, bar } = barIn(canvasElement)
		const { controls } = controlsIn(canvasElement)
		const scroller = slotIn(canvasElement, "screen-layout-scroller")
		const frame = boxOf(panel)

		await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
		await expect(boxOf(controls).top).toBeGreaterThan(boxOf(bar).bottom)

		scroller.scrollTo({ top: SCROLLED_AWAY })
		await waitFor(() => expect(scroller.scrollTop).toBe(SCROLLED_AWAY))

		await expect([boxOf(bar).top, boxOf(bar).height]).toEqual([frame.top, 56])
		await expect(boxOf(scroller).top).toBe(boxOf(bar).bottom)
		await expect(boxOf(controls).bottom).toBeLessThan(boxOf(bar).top)
		await expect(
			bar.contains(
				document.elementFromPoint(frame.left + frame.width / 2, frame.top + 28),
			),
		).toBe(true)
	},
})

const expectSearchOnItsOwnLine = async (canvasElement: HTMLElement) => {
	const { controls, filters, search } = controlsIn(canvasElement)

	await expect([
		boxOf(search).top - boxOf(filters).bottom,
		boxOf(search).left,
		boxOf(search).width,
		boxOf(search).height,
	]).toEqual([12, boxOf(controls).left, boxOf(controls).width, 32])
	await expect(
		boxOf(slotIn(canvasElement, "library-grid")).top - boxOf(search).bottom,
	).toBe(16)
}

export const BarNarrow = Bar.extend({
	args: { onImport: fn() },
	render: (args) => (
		<LibraryArtboardFrame width="narrow">
			<LibraryPanel {...args} />
		</LibraryArtboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The Library as artboard I5d draws it, 480 wide, Import included. Check that Import and New board are 32 px round buttons holding their glyph alone, still named by their label, each showing that label in a tooltip under the pointer, that New document keeps its label and shows no tooltip, and that the search has moved under the filters across the full row.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const importAction = canvas.getByRole("button", { name: "Import" })
		const newBoard = canvas.getByRole("button", { name: "New board" })
		const newDocument = canvas.getByRole("button", { name: "New document" })

		await waitFor(() => expect(boxOf(importAction).width).toBe(32))
		await expect(barActionsIn(canvasElement)).toEqual([
			importAction,
			newBoard,
			newDocument,
		])
		for (const iconOnly of [importAction, newBoard]) {
			await expect([boxOf(iconOnly).width, boxOf(iconOnly).height]).toEqual([
				32, 32,
			])
			await expect(boxOf(glyphOf(iconOnly)).width).toBe(14)
			await expectSecondaryAtRest(iconOnly)
		}
		await expect(boxOf(newDocument).width).toBeGreaterThan(100)
		await expect(within(newDocument).getByText("New document")).toBeVisible()
		await expectPrimaryAtRest(newDocument)
		await expectNoHorizontalOverflow(canvasElement)
		await expectSearchOnItsOwnLine(canvasElement)

		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		for (const [iconOnly, label] of [
			[importAction, "Import"],
			[newBoard, "New board"],
		] as const) {
			await pointer.hover(iconOnly)
			await waitFor(() =>
				expect(screen.getByRole("tooltip")).toHaveTextContent(label),
			)
			await pointer.unhover(iconOnly)
			await waitFor(() => expect(screen.queryByRole("tooltip")).toBe(null))
		}
		await pointer.hover(newDocument)
		await waitFor(() => expect(newDocument.matches(":hover")).toBe(true))
		await expect(screen.queryByRole("tooltip")).toBe(null)
		await pointer.unhover(newDocument)
	},
})

const BAR_STATE_ROWS = [
	{ row: "rest", label: "At rest" },
	{ row: "hover", label: "Hover" },
	{ row: "pressed", label: "Pressed" },
	{ row: "focus", label: "Keyboard focus" },
] as const

type BarStateRow = (typeof BAR_STATE_ROWS)[number]["row"]

type ControlState = "filter-hover" | "filter-focus" | "search-focus-typing"

const stateRowId = (row: BarStateRow | ControlState) => `library-${row}`

const inRow = (row: BarStateRow | ControlState, selector: string) =>
	`#${stateRowId(row)} ${selector}`

const IMAGES_SEGMENT = "[data-slot=toggle-group-item]:nth-of-type(2)"

const BAR_ACTION = "[data-slot=library-action]"

const expectBarFocusRing = async (action: HTMLElement) => {
	await expect(action.matches(":focus-visible")).toBe(true)
	await expect([
		getComputedStyle(action).outlineStyle,
		getComputedStyle(action).outlineWidth,
		getComputedStyle(action).outlineOffset,
		getComputedStyle(action).outlineColor,
		getComputedStyle(action).boxShadow,
	]).toEqual([
		"solid",
		"2px",
		"2px",
		tokenStyleIn(action, "text-primary", "color"),
		tokenStyleIn(action, "ring-2 ring-card", "boxShadow"),
	])
}

const holdDown = async (
	pointer: RealPointer,
	action: HTMLElement,
	whileHeld: () => Promise<void>,
) => {
	await pointer.hover(action)
	action.focus()
	await pointer.keyboard("{Space>}")
	await expect(action.matches(":hover:active")).toBe(true)
	await whileHeld()
	await pointer.keyboard("{/Space}")
	await pointer.unhover(action)
}

export const BarButtonStates = meta.story({
	args: { items: LIBRARY_ITEMS_WITH_BOARDS },
	globals: { theme: "light" },
	render: (args) => (
		<div className="flex flex-col gap-2" {...hueScopeOf("blue")}>
			{BAR_STATE_ROWS.map(({ row, label }) => (
				<section
					aria-label={label}
					className="flex h-18 w-[960px]"
					id={stateRowId(row)}
					key={row}
				>
					<ContentCard isLandmark={false}>
						<LibraryPanel {...args} />
					</ContentCard>
				</section>
			))}
		</div>
	),
	parameters: {
		pseudo: {
			hover: [inRow("hover", BAR_ACTION), inRow("pressed", BAR_ACTION)],
			active: [inRow("pressed", BAR_ACTION)],
			focusVisible: [inRow("focus", BAR_ACTION)],
		},
		docs: {
			description: {
				story:
					"The three bar buttons as artboard I5e draws them, one bar per state: at rest, hovered, pressed, focused from the keyboard. Check that Import and New board rest on the surface colour, take a 5 percent foreground fill under the pointer and 10 percent while held, their glyph going from the soft ink to the full ink, that New document goes from the blue Space colour #2D62AC to #27579A under the pointer and #214B86 while held, that no button moves, that all three wear a 2 px ring in the surface colour then a 2 px ring in the Space colour, and that no fill animates. The play drives the real pointer and keyboard on the bar at rest, in the Vitest browser runner only.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const atRest = canvasElement.querySelector<HTMLElement>(
			`#${stateRowId("rest")}`,
		)
		if (!atRest) throw new Error("The bar at rest is missing")
		const { heading, actions } = barIn(atRest)
		const [importAction, newBoard, newDocument] = actions
		if (!(importAction && newBoard && newDocument))
			throw new Error("The bar lost an action")
		const secondaries = [importAction, newBoard]

		const newDocumentFill = BLUE_NEW_DOCUMENT_FILL[themeAround(atRest)]

		for (const secondary of secondaries) await expectSecondaryAtRest(secondary)
		await expectPrimaryAtRest(newDocument)
		await expect(paintedFillOf(newDocument)).toBe(newDocumentFill.rest)
		for (const action of actions)
			await expect([
				getComputedStyle(action).outlineStyle,
				getComputedStyle(action).boxShadow,
				getComputedStyle(action).transitionProperty,
			]).toEqual(["none", "none", "none"])

		if (!isInBrowserRunner()) return
		const pointer = await realPointer()

		for (const secondary of secondaries) {
			const inFullInk = () =>
				expect(getComputedStyle(glyphOf(secondary)).color).toBe(
					tokenStyleIn(secondary, "text-foreground", "color"),
				)

			await pointer.hover(secondary)
			await expectFill(secondary, SECONDARY_HOVER_FILL)
			await inFullInk()
			await holdDown(pointer, secondary, async () => {
				await expectFill(secondary, SECONDARY_PRESSED_FILL)
				await inFullInk()
				await expect(getComputedStyle(secondary).translate).toBe("none")
			})
			await expectSecondaryAtRest(secondary)
		}

		await pointer.hover(newDocument)
		await expect(paintedFillOf(newDocument)).toBe(newDocumentFill.hover)
		await holdDown(pointer, newDocument, async () => {
			await expect(paintedFillOf(newDocument)).toBe(newDocumentFill.pressed)
			await expect(getComputedStyle(newDocument).translate).toBe("none")
		})
		await expectPrimaryAtRest(newDocument)

		await pointer.click(heading)
		for (const action of actions) {
			await tabTo(pointer, action)
			await expectBarFocusRing(action)
		}
		await expect(paintedFillOf(newDocument)).toBe(newDocumentFill.rest)
	},
})

export const BarButtonStatesDark = BarButtonStates.extend({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The three bar buttons of artboard I5e in the dark theme: the same four bars. Check that Import and New board rest on a 4 percent foreground fill, then take the same hover and pressed fills, inks and rings as the light theme on their dark values, and that New document starts from the dark bubble colour of the blue Space #2B5288 and darkens by the same two steps as the light theme.",
			},
		},
	},
})

const controlStateStory = (state: ControlState) => ({
	args: ARTBOARD_ARGS,
	globals: { theme: "light" },
	render: (args: LibraryPanelProps) => (
		<div
			className="flex h-40 w-[960px]"
			id={stateRowId(state)}
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryPanel {...args} />
			</ContentCard>
		</div>
	),
})

export const FilterHover = meta.story({
	...controlStateStory("filter-hover"),
	parameters: {
		pseudo: { hover: [inRow("filter-hover", IMAGES_SEGMENT)] },
		docs: {
			description: {
				story:
					"The filters keep their look in the content row: the pointer rests on Images, a filter that is not the selected one. Check that Images takes the pressed control fill, one step darker than the muted track, that All keeps the Space colour under the pointer, and that the fill lands with no colour transition.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { all, images } = controlsIn(canvasElement)
		const pointer = await realPointer()

		await pointer.hover(images)
		await expectFill(
			images,
			isDarkAround(images) ? "bg-control-hover" : "bg-control-pressed",
		)
		await expect(getComputedStyle(images).backgroundColor).not.toBe(
			tokenStyleIn(images, "bg-muted", "backgroundColor"),
		)
		await expect(getComputedStyle(images).transitionProperty).toBe("none")
		await pointer.hover(all)
		await expectFill(pressedFillOf(all), "bg-primary", all)
		await expect(getComputedStyle(all).backgroundColor).toBe(TRANSPARENT)
		await pointer.unhover(all)
	},
})

export const FilterHoverDark = FilterHover.extend({
	globals: { theme: "dark" },
})

export const FilterFocus = meta.story({
	...controlStateStory("filter-focus"),
	parameters: {
		pseudo: { focusVisible: [inRow("filter-focus", IMAGES_SEGMENT)] },
		docs: {
			description: {
				story:
					"The filters keep their keyboard focus in the content row: Images reached with Tab past the bar buttons, then the right arrow. Check that it wears a 1 px ring plus a 4 px ring at 30 percent, both in the Space colour, uncut by the row, and that it takes no fill.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { heading } = barIn(canvasElement)
		const { filters, all, images } = controlsIn(canvasElement)
		const strip = filters.parentElement
		if (!strip) throw new Error("The filters lost their strip")
		const pointer = await realPointer()

		await pointer.click(heading)
		await tabTo(pointer, all)
		await expectSpaceColourRing(all)
		await expect([
			boxOf(all).left - boxOf(strip).left,
			boxOf(all).top - boxOf(strip).top,
			boxOf(strip).bottom - boxOf(all).bottom,
		]).toEqual([5, 5, 5])
		await pointer.keyboard("{ArrowRight}")
		await expect(images).toHaveFocus()
		await expectSpaceColourRing(images)
		await expect(getComputedStyle(images).backgroundColor).toBe(TRANSPARENT)
	},
})

export const FilterFocusDark = FilterFocus.extend({
	globals: { theme: "dark" },
})

export const SearchFocusTyping = meta.story({
	...controlStateStory("search-focus-typing"),
	args: {
		items: LIBRARY_ITEMS_WITH_BOARDS.filter((item) =>
			item.name.includes("dashboard"),
		),
		onImport: undefined,
		searchQuery: "dashboard",
	},
	parameters: {
		pseudo: {
			focusVisible: [inRow("search-focus-typing", "[data-slot=input]")],
			focusWithin: [inRow("search-focus-typing", "[data-slot=library-search]")],
		},
		docs: {
			description: {
				story:
					"The search keeps its look in the content row, focused with a query typed in. Check that the pill drops its 3 percent foreground fill for the surface, that it wears the 1 px ring plus the 4 px ring at 30 percent in the Space colour, that its icon darkens one step, and that the typed text is in full ink.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { heading } = barIn(canvasElement)
		const { searchField, search, searchGlyph } = controlsIn(canvasElement)
		const pointer = await realPointer()

		await expect(search).toHaveValue("dashboard")
		await pointer.click(heading)
		await tabTo(pointer, search)
		await expectSpaceColourRing(search, searchField)
		await expect(getComputedStyle(search).backgroundColor).toBe(TRANSPARENT)
		await expect(getComputedStyle(search).color).toBe(
			tokenStyleIn(searchField, "text-foreground", "color"),
		)
		await expect(getComputedStyle(searchGlyph).color).toBe(
			tokenStyleIn(searchField, "text-soft-foreground", "color"),
		)
	},
})

export const SearchFocusTypingDark = SearchFocusTyping.extend({
	globals: { theme: "dark" },
})

const inFrench = async () => {
	await i18n.changeLanguage("fr")
	return () => i18n.changeLanguage(DEFAULT_LANGUAGE)
}

const nextLayout = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	})

const expectFrenchNarrowFits = async (canvasElement: HTMLElement) => {
	const { heading, topLine, actions } = barIn(canvasElement)
	const [newBoard] = actions
	if (!newBoard) throw new Error("The bar lost New board")

	await waitFor(() => expect(boxOf(newBoard).width).toBe(32))
	await expect(heading).toHaveTextContent("Bibliothèque")
	await expect(topLine).toHaveTextContent(
		"Toutes les images et tous les documents de cet espace.",
	)
	await expect(boxOf(topLine).height).toBe(16)
	await expect(newBoard).toHaveAccessibleName("Nouveau tableau")
	await expectNoHorizontalOverflow(canvasElement)
	await expectSearchOnItsOwnLine(canvasElement)
}

const newDocumentIn = (canvasElement: HTMLElement) => {
	const newDocument = barActionsIn(canvasElement).at(-1)
	if (!newDocument) throw new Error("The bar lost New document")
	return newDocument
}

export const BarFrenchNarrow = meta.story({
	args: ARTBOARD_ARGS,
	globals: { theme: "light" },
	beforeEach: inFrench,
	render: (args) => (
		<LibraryArtboardFrame width="narrow">
			<LibraryPanel {...args} />
		</LibraryArtboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The French Library in a 480 px panel, as the app draws it, without Import. Check that Bibliothèque reads in full under its line cut by an ellipsis, that Nouveau tableau is a round glyph button keeping its name, that Nouveau document keeps its label, that nothing crosses the panel edge, and that the search sits under the filters across the full row.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { heading } = barIn(canvasElement)
		const newDocument = newDocumentIn(canvasElement)

		await expectFrenchNarrowFits(canvasElement)
		await expect(heading.scrollWidth).toBeLessThanOrEqual(heading.clientWidth)
		await expect(boxOf(newDocument).width).toBeGreaterThan(100)
		await expect(newDocument.scrollWidth).toBeLessThanOrEqual(
			newDocument.clientWidth,
		)
	},
})

export const BarFrenchAt320 = BarFrenchNarrow.extend({
	render: (args) => (
		<LibraryArtboardFrame width="reflow">
			<LibraryPanel {...args} />
		</LibraryArtboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The French Library in a 320 px panel, the narrowest it reflows to, without Import. Check that Bibliothèque reads in full, that Nouveau document has become a round glyph button on the Space colour, still named by its label and showing it in a tooltip under the pointer, that the filters scroll sideways inside the row when they are wider than it, and that nothing crosses the panel edge.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { heading } = barIn(canvasElement)
		const { controls, filters } = controlsIn(canvasElement)
		const newDocument = newDocumentIn(canvasElement)
		const strip = filters.parentElement
		if (!strip) throw new Error("The filters lost their strip")

		await waitFor(() => expect(boxOf(newDocument).width).toBe(32))
		await expectFrenchNarrowFits(canvasElement)
		await expect(heading.scrollWidth).toBeLessThanOrEqual(heading.clientWidth)
		await expect([
			boxOf(newDocument).height,
			boxOf(glyphOf(newDocument)).width,
		]).toEqual([32, 14])
		await expect(newDocument).toHaveAccessibleName("Nouveau document")
		await expectPrimaryAtRest(newDocument)
		await expect(boxOf(filters).width).toBeGreaterThan(boxOf(controls).width)
		await expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth)
		await expect(boxOf(strip).right).toBeLessThanOrEqual(
			boxOf(controls).right + 2,
		)

		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		await pointer.hover(newDocument)
		await waitFor(() =>
			expect(screen.getByRole("tooltip")).toHaveTextContent("Nouveau document"),
		)
		await pointer.unhover(newDocument)
	},
})

const LABELLED_FROM_WITH_IMPORT = 672

export const BarFrenchWithImport = meta.story({
	args: { items: LIBRARY_ITEMS_WITH_BOARDS },
	globals: { theme: "light" },
	beforeEach: inFrench,
	render: (args) => (
		<LibraryArtboardFrame width="wide">
			<LibraryPanel {...args} />
		</LibraryArtboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The widest bar the Library draws: French, with Import, New board and New document. Reach for this when a label, a locale or an action changes. Check that the three labels read in full at 960 px, that Importer and Nouveau tableau become glyph buttons under a 672 px panel, that Nouveau document keeps its label at 480 px and becomes a glyph button too at 320 px, and that at every width down to 320 px Bibliothèque reads in full and nothing crosses the panel edge.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const frame = slotIn(canvasElement, "library-artboard-frame")
		const { panel, heading, actions } = barIn(canvasElement)
		const [importAction, newBoard, newDocument] = actions
		if (!(importAction && newBoard && newDocument))
			throw new Error("The bar lost an action")
		const frameEdges = boxOf(frame).width - boxOf(panel).width
		const setPanelWidth = async (width: number) => {
			frame.style.width = `${width + frameEdges}px`
			await nextLayout()
		}

		await expect(actions.map((action) => action.textContent)).toEqual([
			"Importer",
			"Nouveau tableau",
			"Nouveau document",
		])
		await expectNoHorizontalOverflow(canvasElement)

		try {
			await setPanelWidth(LABELLED_FROM_WITH_IMPORT)
			await expect(boxOf(newBoard).width).toBeGreaterThan(32)
			await expect(heading.scrollWidth).toBeLessThanOrEqual(heading.clientWidth)
			await expectNoHorizontalOverflow(canvasElement)

			await setPanelWidth(LABELLED_FROM_WITH_IMPORT - 1)
			await waitFor(() =>
				expect([boxOf(importAction).width, boxOf(newBoard).width]).toEqual([
					32, 32,
				]),
			)
			await expect(importAction).toHaveAccessibleName("Importer")
			await expect(newBoard).toHaveAccessibleName("Nouveau tableau")
			await expectNoHorizontalOverflow(canvasElement)

			await setPanelWidth(480)
			await expect(boxOf(newDocument).width).toBeGreaterThan(100)

			for (let width = 960; width >= 320; width -= 16) {
				await setPanelWidth(width)
				await waitFor(() =>
					expect(heading.scrollWidth).toBeLessThanOrEqual(heading.clientWidth),
				)
				await expectNoHorizontalOverflow(canvasElement)
			}

			await waitFor(() => expect(boxOf(newDocument).width).toBe(32))
			await expect(newDocument).toHaveAccessibleName("Nouveau document")
			await expect(heading.scrollWidth).toBeLessThanOrEqual(heading.clientWidth)
		} finally {
			frame.style.width = ""
		}
	},
})
