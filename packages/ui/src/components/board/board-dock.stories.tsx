import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	colourTransitionsOf,
	isInBrowserRunner,
	resolvedRootColor,
	slotIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { LIBRARY_ITEMS } from "@workspace/ui/components/board/board.fixtures"
import {
	BOARD_TOOLS,
	BoardDock,
	type BoardDockProps,
	type BoardTool,
} from "@workspace/ui/components/board/board-dock"

const TOOL_NAME: Record<BoardTool, string> = {
	select: "Select",
	hand: "Hand",
	sticky: "Sticky note",
	shape: "Shape",
	text: "Text",
	connector: "Connector",
	section: "Section",
	image: "Image",
	library: "Library",
}

const PICKER_NAME = "From the Library"

type PlayContext = { canvasElement: HTMLElement; args: BoardDockProps }

const storyLibrary = { keepFirst: (_count: number) => {} }

const ControlledDock = ({
	tool: initialTool,
	onToolChange,
	libraryItems: initialItems,
	...props
}: BoardDockProps) => {
	const [tool, setTool] = useState(initialTool)
	const [libraryItems, setLibraryItems] = useState(initialItems)
	storyLibrary.keepFirst = (count) =>
		setLibraryItems(initialItems.slice(0, count))

	return (
		<div
			className="relative h-[520px] w-full bg-board-surface"
			data-slot="board-dock-frame"
		>
			<BoardDock
				{...props}
				libraryItems={libraryItems}
				onToolChange={(next) => {
					setTool(next)
					onToolChange(next)
				}}
				tool={tool}
			/>
		</div>
	)
}

const dockIn = (root: HTMLElement) =>
	within(root).getByRole("toolbar", { name: "Board tools" })

const toolNamed = (root: HTMLElement, tool: BoardTool) =>
	within(dockIn(root)).getByRole("button", { name: TOOL_NAME[tool] })

const pressedNames = (root: HTMLElement) =>
	within(dockIn(root))
		.getAllByRole("button", { pressed: true })
		.map((button) => button.getAttribute("aria-label"))

const box = (element: Element) => element.getBoundingClientRect()

const arrowTo = async (from: BoardTool, to: BoardTool) => {
	const steps = BOARD_TOOLS.indexOf(to) - BOARD_TOOLS.indexOf(from)
	const key = steps > 0 ? "{ArrowRight}" : "{ArrowLeft}"
	for (let step = 0; step < Math.abs(steps); step++)
		await userEvent.keyboard(key)
}

const expectDockGeometry = async (root: HTMLElement) => {
	const dock = dockIn(root)
	const frame = slotIn(root, "board-dock-frame")
	const style = getComputedStyle(dock)
	await expect(style.borderRadius).toBe("14px")
	await expect(style.padding).toBe("6px")
	await expect(style.columnGap).toBe("4px")
	await expect(box(frame).bottom - box(dock).bottom).toBe(20)
	await expect(
		Math.abs(
			box(dock).left +
				box(dock).width / 2 -
				(box(frame).left + box(frame).width / 2),
		),
	).toBeLessThanOrEqual(0.5)
	for (const button of within(dock).getAllByRole("button")) {
		await expect([box(button).width, box(button).height]).toEqual([40, 40])
		await expect(getComputedStyle(button).borderRadius).toBe("10px")
	}
	const divider = slotIn(root, "board-dock-divider")
	await expect([box(divider).width, box(divider).height]).toEqual([1, 24])
	const swatch = slotIn(root, "board-dock-sticky-swatch")
	await expect([box(swatch).width, box(swatch).height]).toEqual([22, 22])
	await expect(getComputedStyle(swatch).borderRadius).toBe("3px")
	const glyph = toolNamed(root, "select").querySelector("svg") as SVGElement
	await expect([box(glyph).width, box(glyph).height]).toEqual([20, 20])
}

const expectSpaceColour = async (button: HTMLElement) => {
	await expect(getComputedStyle(button).backgroundColor).toBe(
		resolvedRootColor("--user-bubble"),
	)
	await expect(getComputedStyle(button).color).toBe(
		resolvedRootColor("--user-bubble-foreground"),
	)
}

const expectInstantColours = async (button: HTMLElement) => {
	await expect(colourTransitionsOf(button)).toEqual([])
	if (!isInBrowserRunner()) return
	await withMotionAllowed(async () => {
		await expect(colourTransitionsOf(button)).toEqual([])
	})
	const { userEvent: pointer } = await import("vitest/browser")
	const resting = getComputedStyle(button).backgroundColor
	await pointer.hover(button)
	await expect(getComputedStyle(button).backgroundColor).not.toBe(resting)
	await expect(await screen.findByRole("tooltip")).toHaveTextContent(
		button.getAttribute("aria-label") ?? "",
	)
	await pointer.unhover(button)
	await expect(getComputedStyle(button).backgroundColor).toBe(resting)
}

const expectInstantTileColours = async (tile: HTMLElement) => {
	await expect(colourTransitionsOf(tile)).toEqual([])
	if (!isInBrowserRunner()) return
	const { userEvent: pointer } = await import("vitest/browser")
	const resting = getComputedStyle(tile).boxShadow
	await pointer.hover(tile)
	await expect(getComputedStyle(tile).boxShadow).not.toBe(resting)
	await pointer.unhover(tile)
	await expect(getComputedStyle(tile).boxShadow).toBe(resting)
}

const playToolActive =
	(tool: BoardTool) =>
	async ({ canvasElement, args }: PlayContext) => {
		const other: BoardTool = tool === "select" ? "hand" : "select"
		await expect(
			within(dockIn(canvasElement))
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label")),
		).toEqual(BOARD_TOOLS.map((id) => TOOL_NAME[id]))
		await expect(pressedNames(canvasElement)).toEqual([TOOL_NAME[tool]])
		await expectSpaceColour(toolNamed(canvasElement, tool))
		await expectDockGeometry(canvasElement)
		await expectInstantColours(toolNamed(canvasElement, other))

		await userEvent.click(toolNamed(canvasElement, other))
		await expect(args.onToolChange).toHaveBeenLastCalledWith(other)
		await expect(pressedNames(canvasElement)).toEqual([TOOL_NAME[other]])

		await arrowTo(other, tool)
		await expect(toolNamed(canvasElement, tool)).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onToolChange).toHaveBeenLastCalledWith(tool)
		await arrowTo(tool, other)
		await userEvent.keyboard(" ")
		await expect(args.onToolChange).toHaveBeenLastCalledWith(other)
		await arrowTo(other, tool)
		await userEvent.keyboard(" ")
		await expect(args.onToolChange).toHaveBeenLastCalledWith(tool)
		await expect(pressedNames(canvasElement)).toEqual([TOOL_NAME[tool]])

		await userEvent.tab()
		await expect(dockIn(canvasElement).contains(document.activeElement)).toBe(
			false,
		)
		await userEvent.tab({ shift: true })
		await expect(toolNamed(canvasElement, tool)).toHaveFocus()
		toolNamed(canvasElement, tool).blur()
	}

const meta = preview.meta({
	title: "Board/BoardDock",
	component: BoardDock,
	render: (args) => <ControlledDock {...args} />,
	args: {
		tool: "select" as const,
		onToolChange: fn(),
		libraryItems: LIBRARY_ITEMS,
		onLibraryItemPick: fn(),
		onLibraryItemDrop: fn(),
	},
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The tool dock centred 20px above the bottom of a board: Select and Hand, a divider, then Sticky note, Shape, Text, Connector, Section, Image and Library. It is one toolbar and one tab stop, Left and Right move between tools, and pressing a tool by pointer, Enter or Space emits `onToolChange`. The active tool wears the Space colour. Library opens the Library picker above it: Escape or a press outside closes it and focus goes back to Library, arrows move between tiles, Enter emits `onLibraryItemPick`, and a tile dragged out emits `onLibraryItemDrop` with the pointer when released.",
			},
		},
	},
})

export const SelectActive = meta.story({
	args: { tool: "select" },
	play: playToolActive("select"),
})

export const SelectActiveDark = meta.story({
	args: { tool: "select" },
	globals: { theme: "dark" },
	play: playToolActive("select"),
})

export const HandActive = meta.story({
	args: { tool: "hand" },
	play: playToolActive("hand"),
})

export const HandActiveDark = meta.story({
	args: { tool: "hand" },
	globals: { theme: "dark" },
	play: playToolActive("hand"),
})

export const StickyActive = meta.story({
	args: { tool: "sticky" },
	play: playToolActive("sticky"),
})

export const StickyActiveDark = meta.story({
	args: { tool: "sticky" },
	globals: { theme: "dark" },
	play: playToolActive("sticky"),
})

export const ShapeActive = meta.story({
	args: { tool: "shape" },
	play: playToolActive("shape"),
})

export const ShapeActiveDark = meta.story({
	args: { tool: "shape" },
	globals: { theme: "dark" },
	play: playToolActive("shape"),
})

export const TextActive = meta.story({
	args: { tool: "text" },
	play: playToolActive("text"),
})

export const TextActiveDark = meta.story({
	args: { tool: "text" },
	globals: { theme: "dark" },
	play: playToolActive("text"),
})

export const ConnectorActive = meta.story({
	args: { tool: "connector" },
	play: playToolActive("connector"),
})

export const ConnectorActiveDark = meta.story({
	args: { tool: "connector" },
	globals: { theme: "dark" },
	play: playToolActive("connector"),
})

export const SectionActive = meta.story({
	args: { tool: "section" },
	play: playToolActive("section"),
})

export const SectionActiveDark = meta.story({
	args: { tool: "section" },
	globals: { theme: "dark" },
	play: playToolActive("section"),
})

export const ImageActive = meta.story({
	args: { tool: "image" },
	play: playToolActive("image"),
})

export const ImageActiveDark = meta.story({
	args: { tool: "image" },
	globals: { theme: "dark" },
	play: playToolActive("image"),
})

const pickerOpen = () => screen.findByRole("dialog", { name: PICKER_NAME })

const expectPickerClosedOnLibrary = async (root: HTMLElement) => {
	await waitFor(() =>
		expect(screen.queryByRole("dialog", { name: PICKER_NAME })).toBeNull(),
	)
	await expect(toolNamed(root, "library")).toHaveFocus()
	await expect(pressedNames(root)).toEqual([TOOL_NAME.library])
}

const expectPickerGeometry = async (root: HTMLElement, picker: HTMLElement) => {
	const library = toolNamed(root, "library")
	const style = getComputedStyle(picker)
	await expect(box(picker).width).toBe(328)
	await expect(style.padding).toBe("12px")
	await expect(style.rowGap).toBe("12px")
	await expect(style.borderRadius).toBe("14px")
	await expect(box(dockIn(root)).top - box(picker).bottom).toBe(12)
	await expect(
		Math.abs(
			box(picker).left +
				box(picker).width / 2 -
				(box(library).left + box(library).width / 2),
		),
	).toBeLessThanOrEqual(0.5)
}

const playLibraryPicker = async ({ canvasElement, args }: PlayContext) => {
	const picker = await pickerOpen()
	await expectSpaceColour(toolNamed(canvasElement, "library"))
	await expectPickerGeometry(canvasElement, picker)
	await expect(within(picker).getByText("Drag onto the board")).toBeVisible()

	const tiles = within(picker).getAllByRole("button")
	await expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual(
		LIBRARY_ITEMS.map((item) => item.title),
	)
	for (const tile of tiles) {
		await expect([box(tile).width, box(tile).height]).toEqual([94, 70])
		await expect(getComputedStyle(tile).borderRadius).toBe("8px")
	}
	const [first, second, , fourth, fifth] = tiles as HTMLElement[]
	await expect(
		box(second as HTMLElement).left - box(first as HTMLElement).right,
	).toBe(8)
	await expect(
		box(fourth as HTMLElement).top - box(first as HTMLElement).bottom,
	).toBe(8)
	await waitFor(() => expect(first).toHaveFocus())
	await expectInstantTileColours(second as HTMLElement)

	;(first as HTMLElement).focus()
	await userEvent.keyboard("{ArrowRight}")
	await expect(second).toHaveFocus()
	await userEvent.keyboard("{ArrowDown}")
	await expect(fifth).toHaveFocus()
	await userEvent.keyboard("{ArrowLeft}")
	await expect(fourth).toHaveFocus()
	await userEvent.keyboard("{ArrowUp}")
	await expect(first).toHaveFocus()
	await userEvent.keyboard("{Enter}")
	await expect(args.onLibraryItemPick).toHaveBeenLastCalledWith(
		LIBRARY_ITEMS[0]?.id,
	)

	await userEvent.keyboard("{Escape}")
	await expectPickerClosedOnLibrary(canvasElement)

	await userEvent.keyboard("{Enter}")
	await expect(args.onToolChange).toHaveBeenLastCalledWith("library")
	await pickerOpen()
	await userEvent.click(slotIn(canvasElement, "board-dock-frame"))
	await expectPickerClosedOnLibrary(canvasElement)

	await userEvent.click(toolNamed(canvasElement, "library"))
	const reopened = await pickerOpen()
	await userEvent.click(
		within(reopened).getAllByRole("button")[2] as HTMLElement,
	)
	await expect(args.onLibraryItemPick).toHaveBeenLastCalledWith(
		LIBRARY_ITEMS[2]?.id,
	)

	storyLibrary.keepFirst(2)
	await waitFor(() =>
		expect(within(reopened).getAllByRole("button")).toHaveLength(2),
	)
	const kept = within(reopened).getAllByRole("button")
	await expect(kept.map((tile) => tile.tabIndex)).toEqual([-1, 0])
	toolNamed(canvasElement, "library").focus()
	await userEvent.tab()
	await expect(kept[1]).toHaveFocus()
	storyLibrary.keepFirst(LIBRARY_ITEMS.length)
	await waitFor(() =>
		expect(within(reopened).getAllByRole("button")).toHaveLength(
			LIBRARY_ITEMS.length,
		),
	)
}

export const LibraryPicker = meta.story({
	args: { tool: "library" },
	parameters: {
		docs: {
			description: {
				story:
					"Library is the active tool and its picker is open above it: From the Library and Drag onto the board on one row, then the items as 94 by 70 tiles three per row, an image as its cover and a document as a page on the card inset. Check the 328px popover 12px above the dock centred on Library, arrows moving between tiles, Enter picking, Escape and a press outside closing it with focus back on Library, and Library reopening it. Pick LibraryPickerEmpty for a Library with nothing in it.",
			},
		},
	},
	play: playLibraryPicker,
})

export const LibraryPickerDark = meta.story({
	args: { tool: "library" },
	globals: { theme: "dark" },
	play: playLibraryPicker,
})

const playLibraryPickerEmpty = async ({ canvasElement }: PlayContext) => {
	const picker = await pickerOpen()
	await expectPickerGeometry(canvasElement, picker)
	await expect(within(picker).queryAllByRole("button")).toEqual([])
	await expect(
		within(picker).getByText("Nothing in the Library yet."),
	).toBeVisible()
	await userEvent.keyboard("{Escape}")
	await expectPickerClosedOnLibrary(canvasElement)
	await userEvent.click(toolNamed(canvasElement, "library"))
	await pickerOpen()
}

export const LibraryPickerEmpty = meta.story({
	args: { tool: "library", libraryItems: [] },
	parameters: {
		docs: {
			description: {
				story:
					"The picker of a Library with no item yet: the same popover and header row, then one muted line. Check Escape closing it with focus back on Library.",
			},
		},
	},
	play: playLibraryPickerEmpty,
})

export const LibraryPickerEmptyDark = meta.story({
	args: { tool: "library", libraryItems: [] },
	globals: { theme: "dark" },
	play: playLibraryPickerEmpty,
})
