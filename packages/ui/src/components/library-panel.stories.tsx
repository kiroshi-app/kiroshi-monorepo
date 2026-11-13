import { type ReactNode, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { expect, fn, mocked, spyOn, waitFor, within } from "storybook/test"
import { decorators as pseudoStateDecorators } from "storybook-addon-pseudo-states/preview"

import preview from "@workspace/storybook/preview"
import {
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
	narrow: "w-[560px]",
	reflow: "w-[320px]",
	tight: "w-[920px]",
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

const islandsIn = (canvasElement: HTMLElement) => {
	const [title, actions, filters] = slotsIn(canvasElement, "header-island")
	if (!title) throw new Error("The header lost its title island")
	return { title, actions, filters }
}

const actionsIn = (canvasElement: HTMLElement) => {
	const { actions } = islandsIn(canvasElement)
	if (!actions) throw new Error("The header lost its actions island")
	return within(actions)
}

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
					"The Library tab of a Space: every image, document and board the Space holds, read-only. The header floats over the grid as two islands: the title and the filters on one side, the search, Import, New board and New document on the other, each drawn only when its callback is passed. The filters are one single-selection toggle group whose pressed segment wears the Space colour, and they move to an island of their own on a second row once the panel is too narrow for one row; each grid item is a single button that hands the item to `onOpenItem`, and a right-click on it opens the item action menu, listing only the actions whose callback is given. A Library with nothing in it trades the grid for the Start a document templates and the Bring in files strip, and while the Library loads a grid skeleton fills the card. Pass a `LibraryLightbox` as `overlay` so it covers the card.",
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
					"The Library as artboard 1 draws it at a 1280 by 832 window: four columns of 279, All checked. Check that All wears the Space colour and carries the total count, that a keyboard reader reaches an item with Tab and sees its ring, and that pressing it hands the item to `onOpenItem`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const filters = canvas.getByRole("group", { name: "Show" })
		const all = within(filters).getByRole("button", {
			name: `All ${LIBRARY_ITEMS.length}`,
		})
		await expect(all).toHaveAttribute("aria-pressed", "true")
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
		await expect(Number.parseFloat(columns[0] ?? "")).toBeCloseTo(279, 0)

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
					"The header as artboard 1a draws it, dark theme: New board, a ghost button identical to Import with the board glyph, between Import and New document in the actions island. Check that it reports `onNewBoard`.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const buttons = actionsIn(canvasElement).getAllByRole("button")
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
		onNewBoard: undefined,
		onStartTemplate: undefined,
		onSearchQueryChange: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"An empty Library before Import, New board, New document and the templates exist in the app: the title island alone. Check that no control, no empty island and no section title is left behind by an absent callback, so the empty Library never offers a press that does nothing.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.queryAllByRole("button")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "header-island")).toHaveLength(1)
		await expect(
			within(islandsIn(canvasElement).title).getByRole("heading", {
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
					"An empty Library as artboard 6c draws it, dark theme: the header keeps its actions, then Blank document, Blank board and the three templates under Start a document, then the Bring in files strip. Check that only the filters drop, that Blank board follows Blank document on the dot grid ground with its yellow sticky, and that each card reports its own callback. The artboard's Blank document glyph and its absent templates are left to their own tickets.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.queryByRole("group", { name: "Show" })).toBe(null)
		await expect(slotsIn(canvasElement, "header-island")).toHaveLength(2)
		await expect(
			canvas.getByRole("heading", { level: 1, name: "Library" }),
		).toBeVisible()
		await expect(canvas.getByRole("searchbox")).toBeVisible()
		await expect(
			actionsIn(canvasElement)
				.getAllByRole("button")
				.map((button) => button.textContent),
		).toEqual(["Import", "New board", "New document"])

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
					"The Library before its first read lands, as artboard 6b draws it, dark theme: the two islands and their actions stay, and once the read has been slow for 300ms the four filters are drawn as a skeleton in the title island and the grid as a skeleton under the islands, whose tiles keep the loaded tile geometry and reach the bottom of the card. Check that nothing is drawn under the header at first, that the grid skeleton then runs from under the islands to the card's bottom edge in more than one row, and that the panel says it is busy throughout.",
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
		await waitFor(() =>
			expect(
				slotIn(islandsIn(canvasElement).title, "library-filters-skeleton")
					.children,
			).toHaveLength(4),
		)
		await expect(canvas.queryByRole("group", { name: "Show" })).toBe(null)
		await expect(
			slotIn(canvasElement, "library-grid-skeleton").getBoundingClientRect()
				.top,
		).toBe(islandsIn(canvasElement).title.getBoundingClientRect().bottom + 8)
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
				getComputedStyle(canvas.getByRole("button", { name: /^All/ }))
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

const PRIMARY_HOVER_FILL =
	"bg-[color-mix(in_oklch,var(--primary),var(--foreground)_20%)]"

const PRIMARY_PRESSED_FILL =
	"bg-[color-mix(in_oklch,var(--primary),var(--foreground)_40%)]"

const headerIn = (canvasElement: HTMLElement) => {
	const { title, actions, filters } = islandsIn(canvasElement)
	if (!(actions && filters)) throw new Error("The header lost an island")
	const buttons = within(actions).getAllByRole("button")
	const [newBoard, newDocument] = buttons
	if (!(newBoard && newDocument)) throw new Error("The header lost an action")

	return {
		panel: slotIn(canvasElement, "library-panel"),
		title,
		actions,
		filters,
		heading: within(title).getByRole("heading", { level: 1, name: "Library" }),
		searchField: slotIn(actions, "library-search"),
		search: within(actions).getByRole("searchbox", {
			name: "Search the Library",
		}),
		buttons,
		newBoard,
		newDocument,
	}
}

const expectIslandsAtTheEdges = async (canvasElement: HTMLElement) => {
	const { panel, title, actions } = headerIn(canvasElement)
	const [frame, left, right] = [boxOf(panel), boxOf(title), boxOf(actions)]

	await expect([
		left.left - frame.left,
		left.top - frame.top,
		left.height,
	]).toEqual([8, 8, 40])
	await expect([
		frame.right - right.right,
		right.top - frame.top,
		right.height,
	]).toEqual([8, 8, 40])
}

const expectHeaderOnOneRow = async (
	canvasElement: HTMLElement,
	items: LibraryItem[],
) => {
	const {
		panel,
		title,
		actions,
		filters,
		heading,
		searchField,
		search,
		buttons,
		newBoard,
		newDocument,
	} = headerIn(canvasElement)
	const frame = boxOf(panel)

	await expectIslandsAtTheEdges(canvasElement)
	await expect(filters).not.toBeVisible()
	await expect(slotsIn(canvasElement, "screen-layout-fade")).toHaveLength(0)

	const isDark = isDarkAround(panel)
	for (const island of [title, actions]) {
		const style = getComputedStyle(island)
		await expect([
			Number.parseFloat(style.paddingTop) +
				Number.parseFloat(style.borderTopWidth),
			style.columnGap,
			style.borderTopLeftRadius,
			style.borderTopColor,
			style.boxShadow,
		]).toEqual([
			4,
			"4px",
			"12px",
			tokenStyleIn(
				island,
				"border border-selection-toolbar-border",
				"borderTopColor",
			),
			tokenStyleIn(island, "shadow-selection-toolbar", "boxShadow"),
		])
		await expectFill(island, isDark ? "bg-card-raised" : "bg-card")
	}

	await expect([
		boxOf(heading).height,
		getComputedStyle(heading).fontSize,
		getComputedStyle(heading).lineHeight,
		getComputedStyle(heading).fontWeight,
	]).toEqual([32, "14px", "16px", "500"])

	const group = within(title).getByRole("group", { name: "Show" })
	const segments = within(group).getAllByRole("button")
	const [all, images] = segments
	if (!(all && images)) throw new Error("The filters lost a segment")
	await expect(boxOf(group).left - boxOf(heading).right).toBe(4)
	await expect(segments.map((segment) => segment.textContent)).toEqual([
		`All${items.length}`,
		`Images${countOf(items, "image")}`,
		`Documents${countOf(items, "document")}`,
		`Boards${countOf(items, "board")}`,
	])
	await expect([
		boxOf(group).height,
		getComputedStyle(group).borderTopLeftRadius,
	]).toEqual([32, "8px"])
	await expectFill(group, "bg-muted")

	await expect(all).toHaveAttribute("aria-pressed", "true")
	await expect([
		boxOf(all).height,
		getComputedStyle(all).borderTopLeftRadius,
		getComputedStyle(all).fontSize,
		getComputedStyle(all).lineHeight,
		getComputedStyle(all).fontWeight,
	]).toEqual([28, "6px", "12px", "16px", "500"])
	await expectFill(all, "bg-primary")
	await expect(getComputedStyle(all).color).toBe(
		tokenStyleIn(all, "text-primary-foreground", "color"),
	)
	await expect(
		getComputedStyle(slotIn(all, "library-filter-count")).color,
	).toBe(
		tokenStyleIn(all, SELECTED_COUNT_INK[isDark ? "dark" : "light"], "color"),
	)
	await expect(getComputedStyle(images).fontWeight).toBe("400")
	await expect(getComputedStyle(images).backgroundColor).toBe(TRANSPARENT)
	await expect(
		getComputedStyle(slotIn(images, "library-filter-count")).color,
	).toBe(tokenStyleIn(images, "text-muted-foreground", "color"))

	await expect(actions.firstElementChild).toBe(searchField)
	await expect([
		boxOf(search).width,
		boxOf(search).height,
		getComputedStyle(search).borderTopLeftRadius,
	]).toEqual([200, 32, "8px"])
	await expectFill(search, "bg-muted", searchField)
	const icon = searchField.querySelector("svg")
	if (!icon) throw new Error("The search lost its icon")
	await expect([
		boxOf(icon).width,
		boxOf(icon).left - boxOf(search).left,
	]).toEqual([14, 8])
	await expect(getComputedStyle(icon).color).toBe(
		tokenStyleIn(searchField, "text-muted-foreground", "color"),
	)
	await expect([
		getComputedStyle(search, "::placeholder").fontSize,
		getComputedStyle(search, "::placeholder").color,
	]).toEqual([
		"13px",
		tokenStyleIn(
			searchField,
			isDark ? "text-placeholder-foreground" : "text-muted-foreground",
			"color",
		),
	])

	await expect(buttons.map((button) => button.textContent)).toEqual([
		"New board",
		"New document",
	])
	await expect(boxOf(newBoard).left - boxOf(search).right).toBe(4)
	await expect([
		boxOf(newBoard).height,
		getComputedStyle(newBoard).borderTopLeftRadius,
		getComputedStyle(newBoard).fontSize,
		getComputedStyle(newBoard).lineHeight,
		getComputedStyle(newBoard).fontWeight,
		newBoard.querySelector("svg")?.getBoundingClientRect().width,
	]).toEqual([32, "8px", "13px", "16px", "500", 14])
	await expect(getComputedStyle(newBoard).backgroundColor).toBe(TRANSPARENT)
	await expect(
		getComputedStyle(newBoard.querySelector("svg") as SVGElement).color,
	).toBe(tokenStyleIn(newBoard, "text-soft-foreground", "color"))
	await expect(boxOf(newDocument).height).toBe(32)
	await expectFill(newDocument, "bg-primary")
	await expect(getComputedStyle(newDocument).color).toBe(
		tokenStyleIn(newDocument, "text-primary-foreground", "color"),
	)

	for (const control of [all, images, search, newBoard, newDocument])
		await expect(getComputedStyle(control).transitionProperty).toBe("none")

	const grid = slotIn(canvasElement, "library-grid")
	await expect([
		boxOf(grid).left - frame.left,
		boxOf(grid).top - frame.top,
		getComputedStyle(grid).columnGap,
	]).toEqual([24, 56, "16px"])
}

const ARTBOARD_ARGS = {
	items: LIBRARY_ITEMS_WITH_BOARDS,
	onImport: undefined,
} satisfies Partial<LibraryPanelProps>

export const FloatingHeader = meta.story({
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
					"The Library header as artboard 5a draws it, 960 wide, light theme: two islands 8 px from the top and side edges. Check that the left island holds the title then the four filters with All carrying the total count on the Space colour, that the right island holds the 200 px search, then New board as a ghost button, then New document on the Space colour, with no Import since the app passes none, and that the grid starts 56 px from the top and 24 px from the side.",
			},
		},
	},
	play: ({ args, canvasElement }) =>
		expectHeaderOnOneRow(canvasElement, args.items),
})

export const FloatingHeaderDark = FloatingHeader.extend({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The Library header as artboard 5b draws it, 960 wide, dark theme: the same two islands on the raised card surface. Check the same geometry, order and Space colour fills as the light theme.",
			},
		},
	},
})

export const FloatingHeaderScrolled = FloatingHeader.extend({
	parameters: {
		docs: {
			description: {
				story:
					"The grid scrolled as artboard 5c draws it. Check that both islands stay 8 px from the edges, that the top fade appears over the grid, that the first row passes under the islands, and that the pointer still reaches the grid between the islands.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { panel, title, actions } = headerIn(canvasElement)
		const scroller = slotIn(canvasElement, "screen-layout-scroller")
		const firstItem = slotIn(canvasElement, "library-item")
		const frame = boxOf(panel)

		await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
		await expect(slotsIn(canvasElement, "screen-layout-fade")).toHaveLength(0)
		await expect(boxOf(firstItem).top).toBeGreaterThanOrEqual(
			boxOf(title).bottom,
		)

		scroller.scrollTo({ top: SCROLLED_AWAY })
		const fade = await waitFor(() =>
			slotIn(canvasElement, "screen-layout-fade"),
		)

		await expect(scroller.scrollTop).toBe(SCROLLED_AWAY)
		await expectIslandsAtTheEdges(canvasElement)
		await expect([
			boxOf(fade).top,
			boxOf(fade).width,
			boxOf(fade).height,
		]).toEqual([frame.top, frame.width, 64])
		await expect(getComputedStyle(fade).backgroundImage).toContain(
			`${tokenStyleIn(panel, "bg-card", "backgroundColor")} 50%, ${TRANSPARENT} 100%`,
		)
		await expect(boxOf(firstItem).top).toBeLessThan(boxOf(title).top)
		await expect(
			scroller.contains(
				document.elementFromPoint(
					(boxOf(title).right + boxOf(actions).left) / 2,
					frame.top + 28,
				),
			),
		).toBe(true)
	},
})

export const FloatingHeaderNarrow = FloatingHeader.extend({
	render: (args) => (
		<LibraryArtboardFrame width="narrow">
			<LibraryPanel {...args} />
		</LibraryArtboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The Library header as artboard 5d draws it, 560 wide: too narrow for one row. Check that the left island holds the title alone, that the right island holds a 160 px search and its labelled buttons, that the filters sit in an island of their own 56 px from the top and 8 px from the side, read once by assistive technology, and that the grid starts below that second row.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const { panel, title, filters, search, buttons } = headerIn(canvasElement)
		const frame = boxOf(panel)

		await expectIslandsAtTheEdges(canvasElement)
		await expect(within(title).queryByRole("group")).toBe(null)
		await expect(boxOf(search).width).toBe(160)
		for (const button of buttons)
			await expect(boxOf(button).width).toBeGreaterThan(32)

		await expect(canvas.getAllByRole("group", { name: "Show" })).toHaveLength(1)
		await expect(
			within(filters).getByRole("group", { name: "Show" }),
		).toBeVisible()
		await expect([
			boxOf(filters).left - frame.left,
			boxOf(filters).top - frame.top,
			boxOf(filters).height,
		]).toEqual([8, 56, 40])
		await expect(
			boxOf(slotIn(canvasElement, "library-grid")).top - frame.top,
		).toBe(104)
	},
})

export const FloatingHeaderAt320 = FloatingHeader.extend({
	render: (args) => (
		<LibraryArtboardFrame width="reflow">
			<LibraryPanel {...args} />
		</LibraryArtboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The Library header in a 320 px panel, the narrowest it reflows to. Check that the search stays a visible field between the title and the actions, that New board and New document drop to their glyph and keep their name, and that neither island nor the filters row crosses the panel edge.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { panel, title, actions, filters, search, buttons } =
			headerIn(canvasElement)
		const frame = boxOf(panel)

		await expectIslandsAtTheEdges(canvasElement)
		await expect(boxOf(title).right).toBeLessThan(boxOf(actions).left)
		await expect(search).toBeVisible()
		await expect(boxOf(search).width).toBeGreaterThan(96)
		await expect(
			buttons.map((button) => [button.textContent, boxOf(button).width]),
		).toEqual([
			["New board", 30],
			["New document", 30],
		])
		await expect(boxOf(filters).right).toBeLessThanOrEqual(frame.right - 8)
	},
})

export const FloatingHeaderNarrowScrolled = FloatingHeaderNarrow.extend({
	parameters: {
		docs: {
			description: {
				story:
					"The grid scrolled under the two rows of the 560 wide header. Check that the three islands stay in place, that the top fade is solid down to 32 px from its end and reaches past the bottom of the filters island, so no tile shows between or around the two rows, and that the first row passes under the islands.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { panel, title, filters } = headerIn(canvasElement)
		const scroller = slotIn(canvasElement, "screen-layout-scroller")
		const firstItem = slotIn(canvasElement, "library-item")
		const frame = boxOf(panel)

		await expect(slotsIn(canvasElement, "screen-layout-fade")).toHaveLength(0)

		scroller.scrollTo({ top: SCROLLED_AWAY })
		const fade = await waitFor(() =>
			slotIn(canvasElement, "screen-layout-fade"),
		)
		const solidBottom = boxOf(fade).bottom - 32

		await expectIslandsAtTheEdges(canvasElement)
		await expect([
			boxOf(filters).left - frame.left,
			boxOf(filters).top - frame.top,
		]).toEqual([8, 56])
		await expect([
			boxOf(fade).top,
			boxOf(fade).width,
			boxOf(fade).height,
		]).toEqual([frame.top, frame.width, 112])
		await expect(getComputedStyle(fade).backgroundImage).toContain(
			`${tokenStyleIn(panel, "bg-card", "backgroundColor")} calc(100% - 32px), ${TRANSPARENT} 100%`,
		)
		await expect(solidBottom).toBeGreaterThan(boxOf(filters).top)
		await expect(boxOf(fade).bottom).toBeGreaterThanOrEqual(
			boxOf(filters).bottom,
		)
		await expect(boxOf(firstItem).top).toBeLessThan(boxOf(title).top)
	},
})

const CONTROL_STATE_ROWS = [
	{ row: "rest", label: "At rest" },
	{ row: "hover", label: "Hover" },
	{ row: "focus", label: "Keyboard focus" },
	{ row: "pressed", label: "Pressed" },
] as const

type ControlStateRow = (typeof CONTROL_STATE_ROWS)[number]["row"]

type HeaderControlState =
	| "filter-hover"
	| "filter-focus"
	| "search-focus-typing"
	| "primary-rest"
	| "primary-hover"
	| "primary-pressed"
	| "primary-focus"
	| "ghost-hover"

const controlStateRowId = (row: ControlStateRow | HeaderControlState) =>
	`library-header-${row}`

const inRow = (row: ControlStateRow | HeaderControlState, selector: string) =>
	`#${controlStateRowId(row)} ${selector}`

const IMAGES_SEGMENT = "[data-slot=library-filter]:nth-child(2)"
const NEW_BOARD_ACTION = "[data-slot=button]:nth-last-child(2)"
const NEW_DOCUMENT_ACTION = "[data-slot=button]:last-child"

export const FloatingHeaderControlStates = meta.story({
	args: ARTBOARD_ARGS,
	globals: { theme: "light" },
	render: (args) => (
		<div className="flex flex-col gap-2" {...hueScopeOf("blue")}>
			{CONTROL_STATE_ROWS.map(({ row, label }) => (
				<section
					aria-label={label}
					className="flex h-28 w-[960px]"
					id={controlStateRowId(row)}
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
			hover: [
				inRow("hover", IMAGES_SEGMENT),
				inRow("hover", NEW_BOARD_ACTION),
				inRow("hover", NEW_DOCUMENT_ACTION),
				inRow("pressed", NEW_DOCUMENT_ACTION),
			],
			focusVisible: [
				inRow("focus", IMAGES_SEGMENT),
				inRow("focus", "[data-slot=input]"),
				inRow("focus", NEW_DOCUMENT_ACTION),
			],
			focusWithin: [inRow("focus", "[data-slot=library-search]")],
			active: [inRow("pressed", NEW_DOCUMENT_ACTION)],
		},
		docs: {
			description: {
				story:
					"The header controls as artboard 5e draws them, four headers one under the other: at rest, hovered, focused from the keyboard, pressed. Check on the header at rest that a hovered filter takes the pressed island control fill and a hovered ghost button the muted fill, that a hovered ghost button draws its glyph in full ink, that a hovered New document goes one step darker than the Space colour, then two steps darker and 1 px down while pressed, and that a filter, the search and New document each wear a 1 px ring plus a 4 px ring at 30 percent in the Space colour, the focused search dropping its muted fill and darkening its icon one step.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const atRest = canvasElement.querySelector<HTMLElement>(
			`#${controlStateRowId("rest")}`,
		)
		if (!atRest) throw new Error("The header at rest is missing")
		const { title, heading, searchField, search, newBoard, newDocument } =
			headerIn(atRest)
		const [all, images] = within(title).getAllByRole("button")
		const icon = searchField.querySelector("svg")
		if (!(all && images && icon)) throw new Error("The header lost a control")
		const pointer = await realPointer()

		const isDark = images.closest(".dark") !== null
		await pointer.hover(images)
		await expectFill(
			images,
			isDark
				? "bg-header-island-control-hover"
				: "bg-header-island-control-pressed",
		)
		await expect(getComputedStyle(images).backgroundColor).not.toBe(
			tokenStyleIn(images, "bg-muted", "backgroundColor"),
		)
		await expect(getComputedStyle(images).transitionProperty).toBe("none")
		await pointer.hover(all)
		await expectFill(all, "bg-primary")
		const boardGlyph = newBoard.querySelector("svg") as SVGElement
		await expect(getComputedStyle(boardGlyph).color).toBe(
			tokenStyleIn(newBoard, "text-soft-foreground", "color"),
		)
		await pointer.hover(newBoard)
		await expectFill(newBoard, "bg-muted")
		await expect(getComputedStyle(boardGlyph).color).toBe(
			tokenStyleIn(newBoard, "text-foreground", "color"),
		)
		await expect(getComputedStyle(images).backgroundColor).toBe(TRANSPARENT)

		await pointer.hover(newDocument)
		await expectFill(newDocument, PRIMARY_HOVER_FILL)
		await expect(getComputedStyle(newDocument).translate).toBe("none")
		newDocument.focus()
		await pointer.keyboard("{Space>}")
		await expect(newDocument.matches(":hover:active")).toBe(true)
		await expectFill(newDocument, PRIMARY_PRESSED_FILL)
		await expect(getComputedStyle(newDocument).translate).toBe("0px 1px")
		await pointer.keyboard("{/Space}")
		await pointer.unhover(newDocument)

		await pointer.click(heading)
		await pointer.tab()
		await expect(all).toHaveFocus()
		await expectSpaceColourRing(all)

		await expect(getComputedStyle(icon).color).toBe(
			tokenStyleIn(searchField, "text-muted-foreground", "color"),
		)
		for (let press = 0; press < 4 && document.activeElement !== search; press++)
			await pointer.tab()
		await expect(search).toHaveFocus()
		await expectSpaceColourRing(search, searchField)
		await expect(getComputedStyle(search).backgroundColor).toBe(TRANSPARENT)
		await expect(getComputedStyle(icon).color).toBe(
			tokenStyleIn(searchField, "text-soft-foreground", "color"),
		)

		for (
			let press = 0;
			press < 4 && document.activeElement !== newDocument;
			press++
		)
			await pointer.tab()
		await expect(newDocument).toHaveFocus()
		await expectSpaceColourRing(newDocument)
	},
})

export const FloatingHeaderControlStatesDark =
	FloatingHeaderControlStates.extend({
		globals: { theme: "dark" },
		parameters: {
			docs: {
				description: {
					story:
						"The header controls of artboard 5e in the dark theme, where the artboard draws none: the same four headers on the raised card surface. Check the same fills and rings as the light theme.",
				},
			},
		},
	})

const headerStateStory = (state: HeaderControlState) => ({
	args: ARTBOARD_ARGS,
	globals: { theme: "light" },
	render: (args: LibraryPanelProps) => (
		<div
			className="flex h-28 w-[960px]"
			id={controlStateRowId(state)}
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryPanel {...args} />
			</ContentCard>
		</div>
	),
})

const headerControlsIn = (canvasElement: HTMLElement) => {
	const header = headerIn(canvasElement)
	const [all, images] = within(header.title).getAllByRole("button")
	const searchGlyph = header.searchField.querySelector("svg")
	const boardGlyph = header.newBoard.querySelector("svg")
	if (!(all && images && searchGlyph && boardGlyph))
		throw new Error("The header lost a control")
	return { ...header, all, images, searchGlyph, boardGlyph }
}

type RealPointer = Awaited<ReturnType<typeof realPointer>>

const tabTo = async (pointer: RealPointer, control: HTMLElement) => {
	for (let press = 0; press < 8 && document.activeElement !== control; press++)
		await pointer.tab()
	await expect(control).toHaveFocus()
}

export const FloatingHeaderFilterHover = meta.story({
	...headerStateStory("filter-hover"),
	parameters: {
		pseudo: { hover: [inRow("filter-hover", IMAGES_SEGMENT)] },
		docs: {
			description: {
				story:
					"The filter hover of artboard 5e: the pointer rests on Images, a filter that is not the selected one. Check that Images takes the pressed island control fill, one step darker than the muted track, that All keeps the Space colour under the pointer, and that the fill lands with no colour transition.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { all, images } = headerControlsIn(canvasElement)
		const pointer = await realPointer()

		await pointer.hover(images)
		await expectFill(
			images,
			isDarkAround(images)
				? "bg-header-island-control-hover"
				: "bg-header-island-control-pressed",
		)
		await expect(getComputedStyle(images).backgroundColor).not.toBe(
			tokenStyleIn(images, "bg-muted", "backgroundColor"),
		)
		await expect(getComputedStyle(images).transitionProperty).toBe("none")
		await pointer.hover(all)
		await expectFill(all, "bg-primary")
		await pointer.unhover(all)
	},
})

export const FloatingHeaderFilterHoverDark = FloatingHeaderFilterHover.extend({
	globals: { theme: "dark" },
})

export const FloatingHeaderFilterFocus = meta.story({
	...headerStateStory("filter-focus"),
	parameters: {
		pseudo: { focusVisible: [inRow("filter-focus", IMAGES_SEGMENT)] },
		docs: {
			description: {
				story:
					"The filter keyboard focus of artboard 5e: Images reached from the keyboard, Tab into the filters then the right arrow. Check that it wears a 1 px ring plus a 4 px ring at 30 percent, both in the Space colour, and that it takes no fill.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { heading, all, images } = headerControlsIn(canvasElement)
		const pointer = await realPointer()

		await pointer.click(heading)
		await tabTo(pointer, all)
		await pointer.keyboard("{ArrowRight}")
		await expect(images).toHaveFocus()
		await expectSpaceColourRing(images)
		await expect(getComputedStyle(images).backgroundColor).toBe(TRANSPARENT)
	},
})

export const FloatingHeaderFilterFocusDark = FloatingHeaderFilterFocus.extend({
	globals: { theme: "dark" },
})

export const FloatingHeaderSearchFocusTyping = meta.story({
	...headerStateStory("search-focus-typing"),
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
					"The search of artboard 5e, focused with a query typed in. Check that the field drops its muted fill for the island surface, that it wears the 1 px ring plus the 4 px ring at 30 percent in the Space colour, that its icon darkens one step, and that the typed text is in full ink.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { heading, searchField, search, searchGlyph } =
			headerControlsIn(canvasElement)
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

export const FloatingHeaderSearchFocusTypingDark =
	FloatingHeaderSearchFocusTyping.extend({
		globals: { theme: "dark" },
	})

export const FloatingHeaderPrimaryRest = meta.story({
	...headerStateStory("primary-rest"),
	parameters: {
		docs: {
			description: {
				story:
					"New document at rest, as artboard 5e draws the primary button. Check that it sits on the Space colour with the ink that colour carries, 32 px high, with no ring, and that it has not moved.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { newDocument } = headerControlsIn(canvasElement)

		await expectFill(newDocument, "bg-primary")
		await expect(getComputedStyle(newDocument).color).toBe(
			tokenStyleIn(newDocument, "text-primary-foreground", "color"),
		)
		await expect([
			boxOf(newDocument).height,
			getComputedStyle(newDocument).translate,
			getComputedStyle(newDocument).boxShadow,
		]).toEqual([32, "none", "none"])
	},
})

export const FloatingHeaderPrimaryRestDark = FloatingHeaderPrimaryRest.extend({
	globals: { theme: "dark" },
})

export const FloatingHeaderPrimaryHover = meta.story({
	...headerStateStory("primary-hover"),
	parameters: {
		pseudo: { hover: [inRow("primary-hover", NEW_DOCUMENT_ACTION)] },
		docs: {
			description: {
				story:
					"New document under the pointer, as artboard 5e draws the primary hover. Check that its fill is the Space colour mixed one step towards the ink, that it has not moved, and that the fill lands with no colour transition.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { newDocument } = headerControlsIn(canvasElement)
		const pointer = await realPointer()

		await pointer.hover(newDocument)
		await expectFill(newDocument, PRIMARY_HOVER_FILL)
		await expect(getComputedStyle(newDocument).backgroundColor).not.toBe(
			tokenStyleIn(newDocument, "bg-primary", "backgroundColor"),
		)
		await expect(getComputedStyle(newDocument).translate).toBe("none")
		await expect(getComputedStyle(newDocument).transitionProperty).toBe("none")
		await pointer.unhover(newDocument)
	},
})

export const FloatingHeaderPrimaryHoverDark = FloatingHeaderPrimaryHover.extend(
	{ globals: { theme: "dark" } },
)

export const FloatingHeaderPrimaryPressed = meta.story({
	...headerStateStory("primary-pressed"),
	parameters: {
		pseudo: {
			hover: [inRow("primary-pressed", NEW_DOCUMENT_ACTION)],
			active: [inRow("primary-pressed", NEW_DOCUMENT_ACTION)],
		},
		docs: {
			description: {
				story:
					"New document held down, as artboard 5e draws the primary pressed. Check that its fill is the Space colour mixed two steps towards the ink, one more than the hover, and that the button sits 1 px lower.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { newDocument } = headerControlsIn(canvasElement)
		const pointer = await realPointer()

		await pointer.hover(newDocument)
		newDocument.focus()
		await pointer.keyboard("{Space>}")
		await expect(newDocument.matches(":hover:active")).toBe(true)
		await expectFill(newDocument, PRIMARY_PRESSED_FILL)
		await expect(getComputedStyle(newDocument).backgroundColor).not.toBe(
			tokenStyleIn(newDocument, PRIMARY_HOVER_FILL, "backgroundColor"),
		)
		await expect(getComputedStyle(newDocument).translate).toBe("0px 1px")
		await pointer.keyboard("{/Space}")
		await pointer.unhover(newDocument)
	},
})

export const FloatingHeaderPrimaryPressedDark =
	FloatingHeaderPrimaryPressed.extend({
		globals: { theme: "dark" },
	})

export const FloatingHeaderPrimaryFocus = meta.story({
	...headerStateStory("primary-focus"),
	parameters: {
		pseudo: { focusVisible: [inRow("primary-focus", NEW_DOCUMENT_ACTION)] },
		docs: {
			description: {
				story:
					"New document reached with Tab, as artboard 5e draws the primary focus. Check that it keeps the Space colour and wears the same 1 px ring plus 4 px ring at 30 percent as the filters and the search.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { heading, newDocument } = headerControlsIn(canvasElement)
		const pointer = await realPointer()

		await pointer.click(heading)
		await tabTo(pointer, newDocument)
		await expectSpaceColourRing(newDocument)
		await expectFill(newDocument, "bg-primary")
	},
})

export const FloatingHeaderPrimaryFocusDark = FloatingHeaderPrimaryFocus.extend(
	{ globals: { theme: "dark" } },
)

export const FloatingHeaderGhostHover = meta.story({
	...headerStateStory("ghost-hover"),
	parameters: {
		pseudo: { hover: [inRow("ghost-hover", NEW_BOARD_ACTION)] },
		docs: {
			description: {
				story:
					"New board under the pointer, as artboard 5e draws the ghost hover, which Import wears too. Check that it takes the muted fill, that its glyph goes from the soft ink to the full ink, and that the fill lands with no colour transition.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { newBoard, boardGlyph } = headerControlsIn(canvasElement)
		const pointer = await realPointer()

		await pointer.hover(newBoard)
		await expectFill(newBoard, "bg-muted")
		await expect(getComputedStyle(boardGlyph).color).toBe(
			tokenStyleIn(newBoard, "text-foreground", "color"),
		)
		await expect(getComputedStyle(newBoard).transitionProperty).toBe("none")
		await pointer.unhover(newBoard)
	},
})

export const FloatingHeaderGhostHoverDark = FloatingHeaderGhostHover.extend({
	globals: { theme: "dark" },
})

const inFrench = async () => {
	await i18n.changeLanguage("fr")
	return () => i18n.changeLanguage(DEFAULT_LANGUAGE)
}

const expectIslandsFit = async (canvasElement: HTMLElement) => {
	const header = boxOf(slotIn(canvasElement, "library-header"))
	const { title, actions, filters } = islandsIn(canvasElement)
	if (!(actions && filters)) throw new Error("The header lost an island")

	for (const island of [title, actions, filters]) {
		if (island.getClientRects().length === 0) continue
		await expect(boxOf(island).left).toBeGreaterThanOrEqual(header.left)
		await expect(boxOf(island).right).toBeLessThanOrEqual(header.right)
	}
	for (const island of [title, actions])
		await expect(island.scrollWidth).toBeLessThanOrEqual(island.clientWidth)
	await expect(boxOf(actions).left - boxOf(title).right).toBeGreaterThanOrEqual(
		8,
	)
}

const FRENCH_ONE_ROW_PANEL_WIDTH = { withoutImport: 900, withImport: 992 }

const expectFrenchHeaderFits = async (
	canvasElement: HTMLElement,
	oneRowPanelWidth: number,
) => {
	const frame = slotIn(canvasElement, "library-artboard-frame")
	const { title, actions, filters } = islandsIn(canvasElement)
	if (!(actions && filters)) throw new Error("The header lost an island")
	const search = slotIn(actions, "library-search")
	const frameEdges =
		boxOf(frame).width - boxOf(slotIn(canvasElement, "library-panel")).width
	const setPanelWidth = (width: number) => {
		frame.style.width = `${width + frameEdges}px`
	}

	await expect(
		within(title).getByRole("heading", { level: 1, name: "Bibliothèque" }),
	).toBeVisible()
	await expectIslandsFit(canvasElement)

	try {
		setPanelWidth(oneRowPanelWidth)
		await expect(
			within(title).getByRole("group", { name: "Afficher" }),
		).toBeVisible()
		await expect(filters).not.toBeVisible()
		await expect(boxOf(search).width).toBeGreaterThanOrEqual(160)
		await expectIslandsFit(canvasElement)

		setPanelWidth(oneRowPanelWidth - 1)
		await expect(within(title).queryByRole("group")).toBe(null)
		await expect(
			within(filters).getByRole("group", { name: "Afficher" }),
		).toBeVisible()
		await expectIslandsFit(canvasElement)

		for (let width = oneRowPanelWidth + 64; width >= 320; width -= 8) {
			setPanelWidth(width)
			await expectIslandsFit(canvasElement)
		}
	} finally {
		frame.style.width = ""
	}
}

export const FloatingHeaderFrenchImport = meta.story({
	args: { items: LIBRARY_ITEMS_WITH_BOARDS },
	globals: { theme: "light" },
	beforeEach: inFrench,
	render: (args) => (
		<LibraryArtboardFrame width="tight">
			<LibraryPanel {...args} />
		</LibraryArtboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The widest header the Library draws: French, with Import beside the search, New board and New document, in a 920 px panel, where the filters already sit on their second row. Reach for this when a label, a locale or an action changes. Check that no island crosses the header edge or spills its content and that the two first-row islands stay at least 8 px apart, here, at the 992 px that are the narrowest panel keeping the filters beside the title, 1 px under it where they move to their own island, and at every width down to 320 px.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			actionsIn(canvasElement)
				.getAllByRole("button")
				.map((button) => button.textContent),
		).toEqual(["Importer", "Nouveau tableau", "Nouveau document"])
		await expectFrenchHeaderFits(
			canvasElement,
			FRENCH_ONE_ROW_PANEL_WIDTH.withImport,
		)
	},
})

export const FloatingHeaderFrench = FloatingHeaderFrenchImport.extend({
	args: { onImport: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The French header as the app draws it today, without Import, in a 920 px panel, where the filters still sit beside the title. Check that no island crosses the header edge or spills its content and that the two first-row islands stay at least 8 px apart, here, at the 900 px that are the narrowest panel keeping the filters beside the title, 1 px under it where they move to their own island, and at every width down to 320 px. `FloatingHeaderFrenchImport` covers the wider header Import makes.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			actionsIn(canvasElement)
				.getAllByRole("button")
				.map((button) => button.textContent),
		).toEqual(["Nouveau tableau", "Nouveau document"])
		await expectFrenchHeaderFits(
			canvasElement,
			FRENCH_ONE_ROW_PANEL_WIDTH.withoutImport,
		)
	},
})
