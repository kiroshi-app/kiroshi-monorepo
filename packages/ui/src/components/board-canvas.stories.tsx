import { useState } from "react"
import {
	expect,
	fn,
	screen,
	spyOn,
	userEvent,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	colourTransitionsOf,
	isInBrowserRunner,
	LAPTOP_WINDOW,
	resolvedRootColor,
	slotIn,
	slotsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { CASA_DO_RIO_TERRACE } from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import {
	DRAWING_AGENT,
	DRAWING_AGENT_POINTER,
	LIBRARY_ITEMS,
	LINK_CARD,
	PERSON_AUTHOR,
	STICKY_TEXT,
} from "@workspace/ui/components/board/board.fixtures"
import type { BoardClientPoint } from "@workspace/ui/components/board/board-dock"
import { BoardImage } from "@workspace/ui/components/board/board-image"
import { BoardLinkCard } from "@workspace/ui/components/board/board-link-card"
import type { BoardObjectOutlineSpec } from "@workspace/ui/components/board/board-presence"
import { BoardShape } from "@workspace/ui/components/board/board-shape"
import { BoardSticky } from "@workspace/ui/components/board/board-sticky"
import { BoardText } from "@workspace/ui/components/board/board-text"
import {
	BoardCanvas,
	type BoardCanvasProps,
} from "@workspace/ui/components/board-canvas"
import type {
	BoardIntent,
	BoardItem,
	BoardObject,
	BoardPaste,
	BoardPoint,
	BoardView,
	BoardViewport,
} from "@workspace/ui/components/board-view"

const COLUMNS = 24
const ROWS = 20
const COLUMN_PITCH = 240
const ROW_PITCH = 192
const NOTE_SIZE = { width: 160, height: 120 }

const NOTES: BoardItem[] = Array.from(
	{ length: COLUMNS * ROWS },
	(_, index) => ({
		id: `note-${index + 1}`,
		kind: "sticky",
		position: {
			x: (index % COLUMNS) * COLUMN_PITCH,
			y: Math.floor(index / COLUMNS) * ROW_PITCH,
		},
		size: NOTE_SIZE,
		zOrder: 1,
		text: `Note ${index + 1}`,
	}),
)

const ROW_LINKS: BoardObject[] = Array.from({ length: ROWS }, (_, row) => ({
	id: `link-${row + 1}`,
	kind: "connector",
	from: `note-${row * COLUMNS + 1}`,
	fromSide: "right",
	to: `note-${row * COLUMNS + 2}`,
	toSide: "left",
	routing: "straight",
	zOrder: 0,
	text: "",
}))

const FIVE_HUNDRED_OBJECTS = { objects: [...NOTES, ...ROW_LINKS] }
const EMPTY_BOARD = { objects: [] }
const LOADED_DOCK_SIZE = [409, 52]
const LOADED_ZOOM_SIZE = [112, 36]
const AT_ORIGIN: BoardViewport = { offset: { x: 24, y: 24 }, zoom: 1 }
const DARK_BOARD_SURFACE = "rgb(22, 22, 24)"
const LAST_NOTE = NOTES.at(-1) as BoardItem

type PlaceholderObjectProps = {
	object: BoardItem
}

const PlaceholderObject = ({ object }: PlaceholderObjectProps) => (
	<div className="flex size-full items-center justify-center rounded-md border border-border bg-card text-muted-foreground text-xs">
		{object.text}
	</div>
)

const PASTED_IMAGE_SOURCE = "example.com/terrace-at-dusk"
const PASTED_LINK = "https://example.com/calm-interfaces"
const LINK_CARD_SIZE = { width: 300, height: 178 }
const PASTED_IMAGE_SIZE = { width: 200, height: 136 }

const pastedItemOf = (
	paste: BoardPaste,
	point: BoardPoint,
	zOrder: number,
): BoardItem | undefined => {
	if (paste.kind === "files") return undefined
	const size = paste.kind === "link" ? LINK_CARD_SIZE : PASTED_IMAGE_SIZE
	return {
		id: `pasted-${zOrder}`,
		kind: paste.kind,
		position: {
			x: point.x - size.width / 2,
			y: point.y - size.height / 2,
		},
		size,
		zOrder,
		text: paste.kind === "link" ? paste.payload : paste.payload.name,
	}
}

const BoardObjectView = ({ object }: PlaceholderObjectProps) => {
	switch (object.kind) {
		case "sticky":
			return (
				<BoardSticky
					author={PERSON_AUTHOR}
					colour="yellow"
					text={object.text}
				/>
			)
		case "shape":
			return (
				<BoardShape
					height={object.size.height}
					fill={object.style?.fill}
					kind={object.style?.shape ?? "rounded-rectangle"}
					label={object.text}
					width={object.size.width}
				/>
			)
		case "text":
			return <BoardText body={object.text} />
		case "link":
			return <BoardLinkCard {...LINK_CARD} />
		case "image":
			return (
				<BoardImage
					alt={object.text}
					height={object.size.height}
					source={PASTED_IMAGE_SOURCE}
					src={CASA_DO_RIO_TERRACE}
					width={object.size.width}
				/>
			)
		default:
			return <PlaceholderObject object={object} />
	}
}

const patchOf = (intent: BoardIntent): Partial<BoardItem> => {
	switch (intent.type) {
		case "move":
			return { position: intent.position }
		case "resize":
			return { position: intent.position, size: intent.size }
		case "edit-text":
			return { text: intent.text }
		case "style":
			return "shape" in intent.style ? { style: intent.style } : {}
		default:
			return {}
	}
}

const patched = (object: BoardObject, intent: BoardIntent): BoardObject => {
	if (object.kind !== "connector") return { ...object, ...patchOf(intent) }
	return intent.type === "style" && "routing" in intent.style
		? { ...object, routing: intent.style.routing }
		: object
}

const applyIntent = (view: BoardView, intent: BoardIntent): BoardView => {
	switch (intent.type) {
		case "create":
			return view
		case "connect": {
			const { type, ...connector } = intent
			return {
				objects: [
					...view.objects,
					{ ...connector, kind: "connector", zOrder: 0, text: "" },
				],
			}
		}
		case "delete":
			return {
				objects: view.objects.filter((object) => object.id !== intent.id),
			}
		default:
			return {
				objects: view.objects.map((object) =>
					object.id === intent.id ? patched(object, intent) : object,
				),
			}
	}
}

const ControlledBoard = ({
	view: initialView,
	viewport: initialViewport,
	onViewportChange,
	onIntent,
	tool: initialTool,
	onToolChange,
	onPaste,
	...props
}: BoardCanvasProps) => {
	const [view, setView] = useState(initialView)
	const [viewport, setViewport] = useState(initialViewport)
	const [tool, setTool] = useState(initialTool)

	return (
		<div className="h-[640px] w-full">
			<BoardCanvas
				{...props}
				onIntent={(intent) => {
					setView((current) => applyIntent(current, intent))
					onIntent(intent)
				}}
				onPaste={(paste, point) => {
					onPaste(paste, point)
					const item = pastedItemOf(paste, point, view.objects.length + 1)
					if (!item) return undefined
					setView((current) => ({ objects: [...current.objects, item] }))
					return item.id
				}}
				onToolChange={(next) => {
					setTool(next)
					onToolChange(next)
				}}
				onViewportChange={(next) => {
					setViewport(next)
					onViewportChange(next)
				}}
				tool={tool}
				view={view}
				viewport={viewport}
			/>
		</div>
	)
}

const wheel = (target: Element, init: WheelEventInit) =>
	target.dispatchEvent(
		new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }),
	)

const objectNode = (root: Element, id: string) =>
	root.querySelector<HTMLElement>(
		`[data-slot="board-object"][data-object-id="${id}"]`,
	)

const centreOf = (element: Element) => {
	const rect = element.getBoundingClientRect()
	return { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }
}

const expectDarkSurface = (root: HTMLElement) =>
	expect(getComputedStyle(slotIn(root, "board-canvas")).backgroundColor).toBe(
		DARK_BOARD_SURFACE,
	)

const meta = preview.meta({
	title: "Navigation/BoardCanvas",
	component: BoardCanvas,
	render: (args) => <ControlledBoard {...args} />,
	args: {
		view: EMPTY_BOARD,
		viewport: AT_ORIGIN,
		onViewportChange: fn(),
		onIntent: fn(),
		renderObject: (object) => <PlaceholderObject object={object} />,
		tool: "select" as const,
		onToolChange: fn(),
		libraryItems: LIBRARY_ITEMS,
		onLibraryItemPick: fn(),
		onLibraryItemDrop: fn(),
		onPaste: fn(),
		onDropFiles: fn(),
		onDropUrl: fn(),
	},
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The board of a Space in its own tab: a dot grid the board slides over, the objects it mounts through `renderObject`, and the zoom control at the bottom end corner. The viewport is controlled: two-finger scroll, the mouse wheel and the arrow keys with nothing selected pan, a pinch zooms around the pointer, the buttons step the zoom around the centre, and every move goes out through `onViewportChange`. Only the objects inside the visible area plus a margin are mounted. A press or Tab selects an object and draws its frame and corner handles in the Space colour, a selected shape gets its style bar above it, and every move, resize, text edit, style pick or delete goes out through `onIntent` as a `BoardIntent`: the canvas never changes the board itself. Connectors are drawn by the canvas from the live rects of their ends, Straight or Elbow: with `isConnecting` on, a hovered object shows its outline and four anchors, a drag from one anchor to another object's anchor sends a connect intent, and the flyout picks the kind of the next connector or of the selected one. The tool dock sits centred at the bottom with the Library picker above it, a Library tile dragged onto the board emits `onLibraryItemDrop` with the board point, a link, an image or files pasted on the focused board emit `onPaste` with the centre of the view and the object whose id it returns gets selected, and files dragged in from the desktop show the drop target and emit `onDropFiles` where they land, and a link dragged in shows it too and emits `onDropUrl` with the first link of the list and the board point whatever its scheme, the app deciding what it becomes.",
			},
		},
	},
})

export const Empty = meta.story({
	args: { status: "ready" },
	parameters: {
		docs: {
			description: {
				story:
					"A board with nothing on it yet. Check the two stickies in their 88 by 72 box, green behind at 8 degrees and yellow in front at -5, the title at weight 600 and the body, all centred in the canvas and staying put while the grid pans, the dots on a 24px pitch at 100%, and the zoom control: Zoom out and Zoom in by name, a focus ring from the keyboard, a hover and a press colour landing with no transition, the percentage following each step, and a screen reader hearing the percentage once per button press and never during a pinch. Pick EmptyDark for the dark theme, FiveHundredObjects for a board with content.",
			},
		},
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		const board = slotIn(canvasElement, "board-canvas")
		const hint = slotIn(canvasElement, "board-empty-hint")
		const pattern = board.querySelector("pattern") as SVGPatternElement
		const hintBefore = hint.getBoundingClientRect()

		await expect(args.status).toBe("ready")
		await expect(hint).toBeVisible()
		await expect(board).not.toHaveAttribute("aria-busy")

		const title = canvas.getByRole("heading", { name: "An empty board" })
		await expect(title).toBeVisible()
		await expect(getComputedStyle(title).fontWeight).toBe("600")
		const stickies = slotIn(canvasElement, "board-empty-stickies")
		const stickyBox = stickies.getBoundingClientRect()
		await expect([stickyBox.width, stickyBox.height]).toEqual([88, 72])
		await expect(
			Array.from(stickies.children as HTMLCollectionOf<HTMLElement>).map(
				(sticky) => [sticky.offsetLeft, sticky.offsetTop],
			),
		).toEqual([
			[30, 6],
			[10, 12],
		])
		await expect(pattern.getAttribute("width")).toBe("24")

		wheel(board, { deltaX: 50, deltaY: 30 })
		await waitFor(() => expect(pattern.getAttribute("x")).toBe("-26"))
		await expect(pattern.getAttribute("y")).toBe("-6")
		await expect(hint.getBoundingClientRect()).toEqual(hintBefore)

		const zoomOut = canvas.getByRole("button", { name: "Zoom out" })
		const zoomIn = canvas.getByRole("button", { name: "Zoom in" })
		const level = slotIn(canvasElement, "board-zoom-level")
		const announced = canvas.getByRole("status")
		await expect(level).toHaveTextContent("100%")
		await expect(announced).toBeEmptyDOMElement()

		zoomOut.focus()
		await userEvent.tab()
		await expect(zoomIn).toHaveFocus()
		await expect(zoomIn.matches(":focus-visible")).toBe(true)
		await waitFor(() =>
			expect(getComputedStyle(zoomIn).boxShadow).toMatch(/\b3px\b/),
		)

		await userEvent.click(zoomIn)
		await expect(level).toHaveTextContent("150%")
		await expect(announced).toHaveTextContent("150%")
		await expect(pattern.getAttribute("width")).toBe("36")
		await userEvent.click(zoomOut)
		await userEvent.click(zoomOut)
		await expect(level).toHaveTextContent("75%")
		await expect(announced).toHaveTextContent("75%")
		await expect(hint.getBoundingClientRect()).toEqual(hintBefore)

		wheel(board, { ctrlKey: true, deltaY: -20, ...centreOf(board) })
		await waitFor(() => expect(level).toHaveTextContent("92%"))
		await expect(announced).toHaveTextContent("75%")

		if (!isInBrowserRunner()) return
		await expect(colourTransitionsOf(zoomIn)).toEqual([])
		await withMotionAllowed(async () => {
			await expect(colourTransitionsOf(zoomIn)).toEqual([])
		})
		const { userEvent: pointer } = await import("vitest/browser")
		const restingColour = getComputedStyle(zoomIn).backgroundColor
		await pointer.hover(zoomIn)
		const hoverColour = getComputedStyle(zoomIn).backgroundColor
		await expect(hoverColour).not.toBe(restingColour)
		await pointer.unhover(zoomIn)
		await expect(getComputedStyle(zoomIn).backgroundColor).toBe(restingColour)

		zoomIn.focus()
		await pointer.keyboard("[Space>]")
		const pressedColour = getComputedStyle(zoomIn).backgroundColor
		await pointer.keyboard("[/Space]")
		await expect(pressedColour).not.toBe(restingColour)
		await expect(pressedColour).not.toBe(hoverColour)
	},
})

export const EmptyDark = meta.story({
	globals: { theme: "dark" },
	args: Empty.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The empty board in the dark theme. Check the #161618 surface, the dots, the zoom control on its own raised ground and the hint, then the same pan, zoom, focus, hover, press and announcement as Empty.",
			},
		},
	},
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await Empty.input.play?.(context)
	},
})

const sizeOf = (element: Element) => {
	const rect = element.getBoundingClientRect()
	return [rect.width, rect.height]
}

export const Loading = meta.story({
	args: {
		status: "loading",
		view: FIVE_HUNDRED_OBJECTS,
		pointers: [DRAWING_AGENT_POINTER],
		outlines: [{ objectId: "note-1", owner: DRAWING_AGENT, state: "writing" }],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A board whose objects have not arrived yet. Check the surface and its dot grid filling the whole canvas, a still placeholder where the dock sits, centred at the bottom, and another where the zoom control sits at the bottom end corner, each at its loaded size, no hint, no object, no connector, no pointer and no outline even though the view holds them, and a screen reader hearing Loading the board. A pan, a pinch, a click, a key, a paste or a file drop does nothing. Pick LoadingDark for the dark theme, Empty and LoadedWithObjects for the board once loaded.",
			},
		},
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		const board = slotIn(canvasElement, "board-canvas")
		const skeleton = slotIn(canvasElement, "board-skeleton")

		await expect(
			canvas.getByRole("region", { name: "Loading the board…" }),
		).toBe(board)
		await expect(board).toHaveAttribute("aria-busy", "true")
		for (const slot of [
			"board-empty-hint",
			"board-object",
			"board-object-outline",
			"board-connectors",
			"board-connector-hits",
			"board-pointers",
			"board-dock",
			"board-zoom-control",
		])
			await expect(slotsIn(canvasElement, slot)).toHaveLength(0)

		const box = board.getBoundingClientRect()
		const covered = skeleton.getBoundingClientRect()
		await expect([covered.x, covered.y, covered.width, covered.height]).toEqual(
			[
				box.x + board.clientLeft,
				box.y + board.clientTop,
				board.clientWidth,
				board.clientHeight,
			],
		)
		await expect(
			slotIn(skeleton, "board-dot-grid").getBoundingClientRect(),
		).toEqual(covered)

		const dock = slotIn(skeleton, "board-dock-skeleton")
		const dockBox = dock.getBoundingClientRect()
		await expect(sizeOf(dock)).toEqual(LOADED_DOCK_SIZE)
		await expect(dockBox.bottom).toBe(covered.bottom - 20)
		await expect(dockBox.x + dockBox.width / 2).toBeCloseTo(
			covered.x + covered.width / 2,
		)
		const zoom = slotIn(skeleton, "board-zoom-skeleton")
		const zoomBox = zoom.getBoundingClientRect()
		await expect(sizeOf(zoom)).toEqual(LOADED_ZOOM_SIZE)
		await expect([zoomBox.right, zoomBox.bottom]).toEqual([
			covered.right - 20,
			covered.bottom - 20,
		])
		for (const node of [skeleton, ...skeleton.querySelectorAll("*")])
			await expect(getComputedStyle(node).animationName).toBe("none")

		await expect(board).not.toHaveAttribute("tabindex")
		wheel(board, { deltaX: 50, deltaY: 30 })
		wheel(board, { ctrlKey: true, deltaY: -20, ...centreOf(board) })
		await userEvent.click(board)
		await userEvent.keyboard("{ArrowRight}{Delete}")
		pasteOn(board, (transfer) =>
			transfer.setData("text/plain", "https://kiroshi.app"),
		)
		const files = [new File(["x"], "plan.png", { type: "image/png" })]
		dragFiles("dragover", board, transferOf(files), centreOf(board))
		dragFiles("drop", board, transferOf(files), centreOf(board))

		await expect(args.onViewportChange).not.toHaveBeenCalled()
		await expect(args.onIntent).not.toHaveBeenCalled()
		await expect(args.onPaste).not.toHaveBeenCalled()
		await expect(args.onDropFiles).not.toHaveBeenCalled()
		await expect(args.onToolChange).not.toHaveBeenCalled()
		await expect(slotsIn(canvasElement, "board-file-drop")).toHaveLength(0)
	},
})

export const LoadingDark = meta.story({
	globals: { theme: "dark" },
	args: Loading.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The loading board in the dark theme. Check the dots and both placeholders over the #161618 surface, then the same coverage, silence and refusal of input as Loading.",
			},
		},
	},
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await Loading.input.play?.(context)
	},
})

export const LoadedWithObjects = meta.story({
	args: { status: "ready", view: { objects: NOTES.slice(0, 3) } },
	parameters: {
		docs: {
			description: {
				story:
					"A loaded board holding a few notes. Check that no empty-board hint shows, the notes render, and the dock and the zoom control stand at the sizes the Loading placeholders hold.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const board = slotIn(canvasElement, "board-canvas")
		await waitFor(() => expect(objectNode(board, "note-1")).not.toBeNull())
		await expect(slotsIn(canvasElement, "board-empty-hint")).toHaveLength(0)
		await expect(board).not.toHaveAttribute("aria-busy")
		await expect(
			slotsIn(canvasElement, "board-object").length,
		).toBeGreaterThanOrEqual(1)
		await expect(sizeOf(slotIn(board, "board-dock"))).toEqual(LOADED_DOCK_SIZE)
		await expect(sizeOf(slotIn(board, "board-zoom-control"))).toEqual(
			LOADED_ZOOM_SIZE,
		)
	},
})

export const FiveHundredObjects = meta.story({
	args: { view: FIVE_HUNDRED_OBJECTS },
	parameters: {
		docs: {
			description: {
				story:
					"A board of 480 notes and 20 connectors spread far past the screen. Check that only the objects near the visible area have a node, that a small pan keeps the same node for an object still on screen, that a long pan mounts the far corner and unmounts the origin, and that a pinch keeps the note under the pointer where it was. Pick ZoomAtMinimum to see the whole board at once.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const board = slotIn(canvasElement, "board-canvas")
		await waitFor(() => expect(objectNode(board, "note-2")).not.toBeNull())

		await expect(objectNode(board, LAST_NOTE.id)).toBeNull()
		await expect(
			board.querySelectorAll('[data-slot="board-object"]').length,
		).toBeLessThan(FIVE_HUNDRED_OBJECTS.objects.length / 2)
		await expect(
			board.querySelector('[data-connector-id="link-1"]'),
		).not.toBeNull()

		const kept = objectNode(board, "note-2") as HTMLElement
		const keptX = kept.getBoundingClientRect().x
		wheel(board, { deltaX: 40, deltaY: 20 })
		await waitFor(() =>
			expect(kept.getBoundingClientRect().x).toBeCloseTo(keptX - 40),
		)
		await expect(objectNode(board, "note-2")).toBe(kept)

		const target = LAST_NOTE.position
		wheel(board, { deltaX: target.x - 40, deltaY: target.y - 20 })
		await waitFor(() => expect(objectNode(board, LAST_NOTE.id)).not.toBeNull())
		await expect(objectNode(board, "note-1")).toBeNull()

		const pinned = objectNode(board, LAST_NOTE.id) as HTMLElement
		const before = centreOf(pinned)
		wheel(board, { ctrlKey: true, deltaY: -40, ...before })
		await waitFor(() =>
			expect(pinned.getBoundingClientRect().width).toBeGreaterThan(
				NOTE_SIZE.width,
			),
		)
		const after = centreOf(pinned)
		await expect(after.clientX).toBeCloseTo(before.clientX, 0)
		await expect(after.clientY).toBeCloseTo(before.clientY, 0)
	},
})

export const FiveHundredObjectsDark = meta.story({
	globals: { theme: "dark" },
	args: FiveHundredObjects.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The 500-object board in the dark theme. Check the dots and the placeholders over the #161618 surface, then the same culling, node reuse and pinch as FiveHundredObjects.",
			},
		},
	},
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await FiveHundredObjects.input.play?.(context)
	},
})

export const ZoomAtMinimum = meta.story({
	args: {
		view: FIVE_HUNDRED_OBJECTS,
		viewport: { offset: { x: 24, y: 24 }, zoom: 0.1 },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The board zoomed all the way out to 10%, the dots spread so they never fill in. Check that all 500 objects have a node, that Zoom out is disabled while Zoom in is not, and that a pinch out holds the zoom at 10% without announcing it. Pick ZoomAtMaximum for the other bound.",
			},
		},
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		const board = slotIn(canvasElement, "board-canvas")
		const level = slotIn(canvasElement, "board-zoom-level")

		await waitFor(() =>
			expect(slotsIn(board, "board-object")).toHaveLength(NOTES.length),
		)
		await expect(slotsIn(board, "board-connector")).toHaveLength(
			ROW_LINKS.length,
		)
		await expect(level).toHaveTextContent("10%")
		await expect(
			canvas.getByRole("button", { name: "Zoom out" }),
		).toHaveAttribute("aria-disabled", "true")
		await expect(
			canvas.getByRole("button", { name: "Zoom in" }),
		).not.toHaveAttribute("aria-disabled", "true")

		wheel(board, { ctrlKey: true, deltaY: 200, ...centreOf(board) })
		await waitFor(() => expect(args.onViewportChange).toHaveBeenCalled())
		await expect(level).toHaveTextContent("10%")
		await expect(canvas.getByRole("status")).toBeEmptyDOMElement()
	},
})

export const ZoomAtMaximum = meta.story({
	args: {
		view: FIVE_HUNDRED_OBJECTS,
		viewport: { offset: { x: -240, y: -160 }, zoom: 4 },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The board zoomed all the way in to 400%, a few notes filling the canvas. Check that Zoom in is disabled while Zoom out is not, and that a pinch in holds the zoom at 400% without announcing it. Pick ZoomAtMinimum for the other bound.",
			},
		},
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		const board = slotIn(canvasElement, "board-canvas")
		const level = slotIn(canvasElement, "board-zoom-level")

		await expect(level).toHaveTextContent("400%")
		await expect(
			canvas.getByRole("button", { name: "Zoom in" }),
		).toHaveAttribute("aria-disabled", "true")
		await expect(
			canvas.getByRole("button", { name: "Zoom out" }),
		).not.toHaveAttribute("aria-disabled", "true")

		wheel(board, { ctrlKey: true, deltaY: -200, ...centreOf(board) })
		await waitFor(() => expect(args.onViewportChange).toHaveBeenCalled())
		await expect(level).toHaveTextContent("400%")
		await expect(canvas.getByRole("status")).toBeEmptyDOMElement()
	},
})

const PLAN: BoardItem = {
	id: "plan",
	kind: "sticky",
	position: { x: 40, y: 40 },
	size: { width: 160, height: 160 },
	zOrder: 1,
	text: STICKY_TEXT,
}

const RESEARCH: BoardItem = {
	id: "research",
	kind: "shape",
	position: { x: 280, y: 72 },
	size: { width: 144, height: 80 },
	zOrder: 2,
	text: "Research",
}

const SHIP: BoardItem = {
	id: "ship",
	kind: "shape",
	position: { x: 480, y: 72 },
	size: { width: 136, height: 88 },
	zOrder: 3,
	text: "Ship",
	style: { shape: "ellipse", fill: "surface" },
}

const KICKOFF: BoardItem = {
	id: "kickoff",
	kind: "text",
	position: { x: 40, y: 260 },
	size: { width: 300, height: 48 },
	zOrder: 4,
	text: "Kickoff notes",
}

const SMALL_BOARD = { objects: [PLAN, RESEARCH, SHIP, KICKOFF] }
const PLAN_NAME = `Sticky note: ${STICKY_TEXT}`
const FRAME_OUTSET = 4
const FRAME_BORDER = 2
const HANDLE_SIZE = 10
const BAR_HEIGHT = 40
const BAR_GAP = 16

const SELECTION_ARGS = {
	view: SMALL_BOARD,
	renderObject: (object: BoardItem) => <BoardObjectView object={object} />,
}

const pointerAt = (
	type: string,
	target: EventTarget,
	at: { clientX: number; clientY: number },
) =>
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			isPrimary: true,
			pointerId: 1,
			...at,
		}),
	)

const shifted = (
	at: { clientX: number; clientY: number },
	by: { x: number; y: number },
) => ({ clientX: at.clientX + by.x, clientY: at.clientY + by.y })

const optionNamed = (root: HTMLElement, name: string) =>
	within(root).getByRole("option", { name })

const selectedOptions = (root: HTMLElement) =>
	within(root)
		.getAllByRole("option")
		.filter((option) => option.getAttribute("aria-selected") === "true")

const announcementIn = (root: HTMLElement) => slotIn(root, "board-announcement")

const expectSelectionChrome = async (root: HTMLElement, object: Element) => {
	const box = object.getBoundingClientRect()
	const frame = slotIn(root, "board-selection-frame")
	const frameBox = frame.getBoundingClientRect()
	const frameStyle = getComputedStyle(frame)
	await expect(frameBox.x).toBeCloseTo(box.x - FRAME_OUTSET, 0)
	await expect(frameBox.y).toBeCloseTo(box.y - FRAME_OUTSET, 0)
	await expect(frameBox.width).toBeCloseTo(box.width + FRAME_OUTSET * 2, 0)
	await expect(frameBox.height).toBeCloseTo(box.height + FRAME_OUTSET * 2, 0)
	await expect(frameStyle.borderTopWidth).toBe(`${FRAME_BORDER}px`)
	await expect(frameStyle.borderTopLeftRadius).toBe("2px")
	await expect(frameStyle.borderTopColor).toBe(
		resolvedRootColor("--user-bubble"),
	)

	const handles = slotsIn(root, "board-selection-handle")
	await expect(handles).toHaveLength(4)
	const borderMiddle = FRAME_BORDER / 2
	const corners = [
		[frameBox.left + borderMiddle, frameBox.top + borderMiddle],
		[frameBox.right - borderMiddle, frameBox.top + borderMiddle],
		[frameBox.left + borderMiddle, frameBox.bottom - borderMiddle],
		[frameBox.right - borderMiddle, frameBox.bottom - borderMiddle],
	]
	for (const [index, handle] of handles.entries()) {
		const handleBox = handle.getBoundingClientRect()
		const handleStyle = getComputedStyle(handle)
		await expect([handleBox.width, handleBox.height]).toEqual([
			HANDLE_SIZE,
			HANDLE_SIZE,
		])
		await expect(handleBox.x + HANDLE_SIZE / 2).toBeCloseTo(
			corners[index][0],
			0,
		)
		await expect(handleBox.y + HANDLE_SIZE / 2).toBeCloseTo(
			corners[index][1],
			0,
		)
		await expect(handleStyle.borderTopWidth).toBe("2px")
		await expect(handleStyle.borderTopColor).toBe(
			resolvedRootColor("--user-bubble"),
		)
		await expect(handleStyle.backgroundColor).toBe(resolvedRootColor("--card"))
	}
}

const expectBarAbove = async (root: HTMLElement, object: Element) => {
	const box = object.getBoundingClientRect()
	const bar = slotIn(root, "board-selection-bar")
	const barBox = bar.getBoundingClientRect()
	const barStyle = getComputedStyle(bar)
	await expect(barBox.height).toBe(BAR_HEIGHT)
	await expect(barBox.bottom).toBeCloseTo(box.top - FRAME_OUTSET - BAR_GAP, 0)
	await expect(barBox.x + barBox.width / 2).toBeCloseTo(
		box.x + box.width / 2,
		0,
	)
	await expect(barStyle.paddingTop).toBe("6px")
	await expect(barStyle.columnGap).toBe("4px")
	await expect(barStyle.borderTopLeftRadius).toBe("12px")
	await expect(barStyle.backgroundColor).toBe(
		resolvedRootColor("--board-selection-bar"),
	)
}

const expectBoxAt = async (box: DOMRect, resting: DOMRect) => {
	await expect(box.x).toBeCloseTo(resting.x, 1)
	await expect(box.y).toBeCloseTo(resting.y, 1)
	await expect(box.width).toBeCloseTo(resting.width, 1)
}

const expectEditorInPlace = async (
	object: HTMLElement,
	editor: HTMLTextAreaElement,
	resting: DOMRect,
) => {
	const text = slotIn(object, "board-sticky-text")
	const look = getComputedStyle(editor)
	await expect(look.backgroundColor).toBe(
		getComputedStyle(slotIn(object, "board-sticky")).backgroundColor,
	)
	await expect(look.fontSize).toBe(getComputedStyle(text).fontSize)
	await expect(look.lineHeight).toBe(getComputedStyle(text).lineHeight)
	await expect(look.color).toBe(getComputedStyle(text).color)
	await expectBoxAt(editor.getBoundingClientRect(), resting)
	await expect(getComputedStyle(text).visibility).toBe("hidden")
}

const expectTextAtRest = async (object: HTMLElement, resting: DOMRect) => {
	const text = slotIn(object, "board-sticky-text")
	await expect(getComputedStyle(text).visibility).toBe("visible")
	await expectBoxAt(text.getBoundingClientRect(), resting)
}

const selectionDocs = (story: string) => ({
	docs: { description: { story } },
})

export const ShapeSelected = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"Boards 4c: the Research shape selected. Check the frame 4px outside the shape with a 2px Space-colour border and 2px corners, the four 10px handles centred on its corners and filled with the panel surface, and the style bar 40px tall, 16px above the frame and centred on the shape: the shape-type pill, five fill swatches with the current one ringed, the text size and More. Picking a swatch or a shape type sends a style intent, rings the pick and paints the shape in it, every control changes colour on hover and press with no transition, the bar hides while the shape is dragged, and a sticky gets the frame but no bar. Pick ShapeSelectedDark for the dark theme.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		const research = await canvas.findByRole("option", {
			name: "Shape: Research",
		})

		await userEvent.click(research)
		await expect(research).toHaveAttribute("aria-selected", "true")
		await expectSelectionChrome(canvasElement, research)
		await expectBarAbove(canvasElement, research)
		await expect(
			canvas.getByRole("toolbar", { name: "Shape style" }),
		).toBeVisible()

		const swatch = (name: string) => canvas.getByRole("button", { name })
		await expect(swatch("No colour")).toHaveAttribute("aria-pressed", "true")
		await userEvent.click(swatch("Yellow"))
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "style",
			id: "research",
			style: { shape: "rounded-rectangle", fill: "yellow" },
		})
		await expect(swatch("Yellow")).toHaveAttribute("aria-pressed", "true")
		await expect(
			getComputedStyle(slotIn(research, "board-shape")).backgroundColor,
		).toBe(resolvedRootColor("--board-sticky-yellow"))
		await expect(swatch("No colour")).toHaveAttribute("aria-pressed", "false")
		const ring = swatch("Yellow").querySelector("span") as HTMLElement
		await expect(getComputedStyle(ring).boxShadow).toMatch(/\b2px\b/)

		await userEvent.click(canvas.getByRole("button", { name: "Shape type" }))
		await userEvent.click(
			await within(document.body).findByRole("menuitemradio", {
				name: "Ellipse",
			}),
		)
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "style",
			id: "research",
			style: { shape: "ellipse", fill: "yellow" },
		})
		await expect(
			canvas.getByRole("button", { name: "Text size M" }),
		).toBeVisible()
		await expect(canvas.getByRole("button", { name: "More" })).toBeVisible()

		const from = centreOf(research)
		pointerAt("pointerdown", research, from)
		pointerAt("pointermove", document, shifted(from, { x: 30, y: 0 }))
		await waitFor(() =>
			expect(slotsIn(canvasElement, "board-selection-bar")).toHaveLength(0),
		)
		pointerAt("pointerup", document, shifted(from, { x: 30, y: 0 }))
		await waitFor(() =>
			expect(slotsIn(canvasElement, "board-selection-bar")).toHaveLength(1),
		)

		await userEvent.click(optionNamed(canvasElement, PLAN_NAME))
		await expect(slotsIn(canvasElement, "board-selection-frame")).toHaveLength(
			1,
		)
		await expect(slotsIn(canvasElement, "board-selection-bar")).toHaveLength(0)

		if (!isInBrowserRunner()) return
		await userEvent.click(
			canvas.getByRole("option", { name: "Shape: Research" }),
		)
		const pill = canvas.getByRole("button", { name: "Shape type" })
		const controls = [
			pill,
			swatch("Pink"),
			canvas.getByRole("button", { name: "More" }),
		]
		await withMotionAllowed(async () => {
			for (const control of controls)
				await expect(colourTransitionsOf(control)).toEqual([])
		})
		const { userEvent: pointer } = await import("vitest/browser")
		for (const control of controls) {
			const resting = getComputedStyle(control).backgroundColor
			await pointer.hover(control)
			const hovered = getComputedStyle(control).backgroundColor
			await expect(hovered).not.toBe(resting)
			await pointer.unhover(control)
		}
	},
})

export const ShapeSelectedDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"Boards 4c in the dark theme: the frame and handles in the Space colour over the #161618 board, the handles filled with the dark panel surface, and the bar on its raised dark ground with its white ring. Same selection, swatch, shape type, drag and colour checks as ShapeSelected.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ShapeSelected.input.play?.(context)
	},
})

export const SelectByPointer = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"A press on an object selects it: check the frame and the four handles around the sticky, aria-selected on it and on nothing else, no bar since it is not a shape, then a press on the empty board clearing the selection without sending any intent. Pick SelectByKeyboard for the same with Tab.",
	),
	play: async ({ canvasElement, args }) => {
		const board = slotIn(canvasElement, "board-canvas")
		const plan = optionNamed(canvasElement, PLAN_NAME)

		await userEvent.click(plan)
		await expect(plan).toHaveAttribute("aria-selected", "true")
		await expect(selectedOptions(canvasElement)).toEqual([plan])
		await expectSelectionChrome(canvasElement, plan)
		await expect(slotsIn(canvasElement, "board-selection-bar")).toHaveLength(0)

		await userEvent.click(board)
		await expect(selectedOptions(canvasElement)).toEqual([])
		await expect(slotsIn(canvasElement, "board-selection-frame")).toHaveLength(
			0,
		)
		await expect(args.onIntent).not.toHaveBeenCalled()
	},
})

export const SelectByPointerDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"SelectByPointer in the dark theme: the same press to select and press on the empty board to clear.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await SelectByPointer.input.play?.(context)
	},
})

export const MoveByPointer = meta.story({
	globals: LAPTOP_WINDOW,
	args: { ...SELECTION_ARGS, viewport: { offset: { x: 24, y: 24 }, zoom: 2 } },
	parameters: selectionDocs(
		"A drag at 200% moves the sticky under the pointer and sends one move intent on release, in board pixels: 100 by 60 on screen is 50 by 30 on the board. Check the frame and handles staying 2px and 10px at this zoom, and the bar of a shape keeping its 40px. Pick MoveByKeyboard for the arrow keys.",
	),
	play: async ({ canvasElement, args }) => {
		const plan = optionNamed(canvasElement, PLAN_NAME)
		const before = plan.getBoundingClientRect()
		const from = centreOf(plan)
		const to = shifted(from, { x: 100, y: 60 })

		pointerAt("pointerdown", plan, from)
		pointerAt("pointermove", document, to)
		await waitFor(() =>
			expect(plan.getBoundingClientRect().x).toBeCloseTo(before.x + 100, 0),
		)
		await expect(plan.getBoundingClientRect().y).toBeCloseTo(before.y + 60, 0)
		await expectSelectionChrome(canvasElement, plan)
		await expect(args.onIntent).not.toHaveBeenCalled()

		pointerAt("pointerup", document, to)
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "move",
			id: "plan",
			position: { x: 90, y: 70 },
		})
		await expect(plan.getBoundingClientRect().x).toBeCloseTo(before.x + 100, 0)

		const research = optionNamed(canvasElement, "Shape: Research")
		await userEvent.click(research)
		await expectSelectionChrome(canvasElement, research)
		await expectBarAbove(canvasElement, research)
	},
})

export const MoveByPointerDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: MoveByPointer.input.args,
	parameters: selectionDocs(
		"MoveByPointer in the dark theme: the same drag at 200% and the same single move intent.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await MoveByPointer.input.play?.(context)
	},
})

export const ResizeByPointer = meta.story({
	globals: LAPTOP_WINDOW,
	args: {
		...SELECTION_ARGS,
		viewport: { offset: { x: 24, y: 24 }, zoom: 0.5 },
	},
	parameters: selectionDocs(
		"A drag on the top left handle at 50% grows the Research shape with its bottom right corner fixed, then sends one resize intent on release: 40 by 20 on screen is 80 by 40 on the board. Check the handles keeping their 10px at this zoom. Pick ResizeByKeyboard for Alt and the arrow keys.",
	),
	play: async ({ canvasElement, args }) => {
		const research = optionNamed(canvasElement, "Shape: Research")
		await userEvent.click(research)
		const before = research.getBoundingClientRect()
		await expectSelectionChrome(canvasElement, research)

		const [topLeft] = slotsIn(canvasElement, "board-selection-handle")
		const from = centreOf(topLeft)
		const to = shifted(from, { x: -40, y: -20 })
		pointerAt("pointerdown", topLeft, from)
		pointerAt("pointermove", document, to)
		await waitFor(() =>
			expect(research.getBoundingClientRect().x).toBeCloseTo(before.x - 40, 0),
		)
		const during = research.getBoundingClientRect()
		await expect(during.right).toBeCloseTo(before.right, 0)
		await expect(during.bottom).toBeCloseTo(before.bottom, 0)
		await expect(slotsIn(canvasElement, "board-selection-bar")).toHaveLength(0)

		pointerAt("pointerup", document, to)
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "resize",
			id: "research",
			position: { x: 200, y: 32 },
			size: { width: 224, height: 120 },
		})
		await expectSelectionChrome(canvasElement, research)
	},
})

export const ResizeByPointerDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: ResizeByPointer.input.args,
	parameters: selectionDocs(
		"ResizeByPointer in the dark theme: the same handle drag at 50% and the same single resize intent.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ResizeByPointer.input.play?.(context)
	},
})

export const EditByPointer = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"A double click on the sticky edits its text in place, on the sticky's own colour and over the exact spot, size and type of the resting text, with the caret at the end and no jump on the way in or out. Escape sends one edit-text intent with the new text and keeps the sticky selected and focused; a second edit left unchanged by a press on the empty board sends nothing and keeps the sticky selected. Pick EditByKeyboard for Enter.",
	),
	play: async ({ canvasElement, args }) => {
		const plan = optionNamed(canvasElement, PLAN_NAME)
		const board = slotIn(canvasElement, "board-canvas")
		const resting = slotIn(plan, "board-sticky-text").getBoundingClientRect()

		await userEvent.dblClick(plan)
		const editor = within(canvasElement).getByRole("textbox", {
			name: "Edit text",
		}) as HTMLTextAreaElement
		await expect(editor).toHaveFocus()
		await expectEditorInPlace(plan, editor, resting)
		await expect([editor.selectionStart, editor.selectionEnd]).toEqual([
			STICKY_TEXT.length,
			STICKY_TEXT.length,
		])
		await expect(slotsIn(canvasElement, "board-selection-handle")).toHaveLength(
			0,
		)

		await userEvent.keyboard(" today")
		await userEvent.keyboard("{Escape}")
		await expect(args.onIntent).toHaveBeenCalledTimes(1)
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "edit-text",
			id: "plan",
			text: `${STICKY_TEXT} today`,
		})
		await expect(
			within(canvasElement).queryByRole("textbox"),
		).not.toBeInTheDocument()
		const edited = optionNamed(canvasElement, `${PLAN_NAME} today`)
		await expect(edited).toHaveFocus()
		await expect(edited).toHaveAttribute("aria-selected", "true")
		await expectTextAtRest(edited, resting)

		await userEvent.dblClick(edited)
		await expect(within(canvasElement).getByRole("textbox")).toHaveFocus()
		await userEvent.click(board)
		await expect(
			within(canvasElement).queryByRole("textbox"),
		).not.toBeInTheDocument()
		await expect(args.onIntent).toHaveBeenCalledTimes(1)
		await expect(edited).toHaveAttribute("aria-selected", "true")
	},
})

export const EditByPointerDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"EditByPointer in the dark theme: the same in-place edit, Escape and press outside.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await EditByPointer.input.play?.(context)
	},
})

export const SelectByKeyboard = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"From the focused board, Tab and Shift+Tab walk the objects top to bottom then left to right, each one selected as it takes focus and named by its kind and text. Escape clears the selection and hands focus back to the board, where the arrow keys pan. Pick SelectByPointer for the same with a press.",
	),
	play: async ({ canvasElement, args }) => {
		const board = slotIn(canvasElement, "board-canvas")
		const plan = optionNamed(canvasElement, PLAN_NAME)
		const research = optionNamed(canvasElement, "Shape: Research")
		const ship = optionNamed(canvasElement, "Shape: Ship")
		const kickoff = optionNamed(canvasElement, "Text: Kickoff notes")

		board.focus()
		for (const object of [plan, research, ship, kickoff]) {
			await userEvent.tab()
			await expect(object).toHaveFocus()
			await expect(selectedOptions(canvasElement)).toEqual([object])
		}
		await userEvent.tab({ shift: true })
		await expect(ship).toHaveFocus()
		await expect(selectedOptions(canvasElement)).toEqual([ship])
		await expectSelectionChrome(canvasElement, ship)

		await userEvent.keyboard("{Escape}")
		await expect(selectedOptions(canvasElement)).toEqual([])
		await expect(board).toHaveFocus()

		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onViewportChange).toHaveBeenLastCalledWith({
			offset: { x: -24, y: 24 },
			zoom: 1,
		})
		await expect(args.onIntent).not.toHaveBeenCalled()
	},
})

export const SelectByKeyboardDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"SelectByKeyboard in the dark theme: the same Tab order, Escape and arrow pan.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await SelectByKeyboard.input.play?.(context)
	},
})

export const MoveByKeyboard = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"With the sticky selected by Tab, an arrow moves it 1 board pixel and Shift+arrow 10, each press sending one move intent and announcing the new position politely. Delete then sends one delete intent and hands focus back to the board. Pick MoveByPointer for a drag.",
	),
	play: async ({ canvasElement, args }) => {
		const board = slotIn(canvasElement, "board-canvas")
		board.focus()
		await userEvent.tab()
		await expect(optionNamed(canvasElement, PLAN_NAME)).toHaveFocus()

		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "move",
			id: "plan",
			position: { x: 41, y: 40 },
		})
		await expect(announcementIn(canvasElement)).toHaveTextContent(
			"Moved to 41, 40",
		)
		await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}")
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "move",
			id: "plan",
			position: { x: 41, y: 50 },
		})
		await expect(announcementIn(canvasElement)).toHaveTextContent(
			"Moved to 41, 50",
		)
		await expect(args.onIntent).toHaveBeenCalledTimes(2)
		await expect(args.onViewportChange).not.toHaveBeenCalled()

		await userEvent.keyboard("{Delete}")
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "delete",
			id: "plan",
		})
		await expect(args.onIntent).toHaveBeenCalledTimes(3)
		await expect(
			within(canvasElement).queryByRole("option", { name: PLAN_NAME }),
		).not.toBeInTheDocument()
		await expect(board).toHaveFocus()
	},
})

export const MoveByKeyboardDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"MoveByKeyboard in the dark theme: the same arrow moves, announcements and Delete.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await MoveByKeyboard.input.play?.(context)
	},
})

export const ResizeByKeyboard = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"With the Research shape selected by Tab, Alt+arrow grows or shrinks it from its bottom right corner by 1 board pixel and Alt+Shift+arrow by 10, each press sending one resize intent and announcing the new size politely. Pick ResizeByPointer for a handle drag.",
	),
	play: async ({ canvasElement, args }) => {
		const board = slotIn(canvasElement, "board-canvas")
		board.focus()
		await userEvent.tab()
		await userEvent.tab()
		await expect(optionNamed(canvasElement, "Shape: Research")).toHaveFocus()

		await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}")
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "resize",
			id: "research",
			position: { x: 280, y: 72 },
			size: { width: 145, height: 80 },
		})
		await expect(announcementIn(canvasElement)).toHaveTextContent(
			"Resized to 145 by 80",
		)
		await userEvent.keyboard("{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}")
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "resize",
			id: "research",
			position: { x: 280, y: 72 },
			size: { width: 145, height: 90 },
		})
		await expect(announcementIn(canvasElement)).toHaveTextContent(
			"Resized to 145 by 90",
		)
		await expect(args.onIntent).toHaveBeenCalledTimes(2)
	},
})

export const ResizeByKeyboardDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"ResizeByKeyboard in the dark theme: the same Alt+arrow resizes and announcements.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ResizeByKeyboard.input.play?.(context)
	},
})

export const EditByKeyboard = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"With the sticky selected by Tab, Enter edits its text in place, on the sticky's own colour and over the resting text with no jump, the caret at the end, and Escape sends one edit-text intent and keeps it selected and focused. A second Enter and Escape with nothing typed sends nothing. Pick EditByPointer for a double click.",
	),
	play: async ({ canvasElement, args }) => {
		const board = slotIn(canvasElement, "board-canvas")
		const plan = optionNamed(canvasElement, PLAN_NAME)
		const resting = slotIn(plan, "board-sticky-text").getBoundingClientRect()
		board.focus()
		await userEvent.tab()
		await userEvent.keyboard("{Enter}")
		const editor = within(canvasElement).getByRole("textbox", {
			name: "Edit text",
		}) as HTMLTextAreaElement
		await expect(editor).toHaveFocus()
		await expectEditorInPlace(plan, editor, resting)
		await expect(editor.value).toBe(STICKY_TEXT)
		await expect(editor.selectionStart).toBe(STICKY_TEXT.length)

		await userEvent.keyboard(" today{Escape}")
		await expect(args.onIntent).toHaveBeenCalledTimes(1)
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "edit-text",
			id: "plan",
			text: `${STICKY_TEXT} today`,
		})
		const edited = optionNamed(canvasElement, `${PLAN_NAME} today`)
		await expect(edited).toHaveFocus()
		await expect(edited).toHaveAttribute("aria-selected", "true")
		await expectTextAtRest(edited, resting)

		await userEvent.keyboard("{Enter}{Escape}")
		await expect(edited).toHaveFocus()
		await expect(args.onIntent).toHaveBeenCalledTimes(1)
	},
})

export const EditByKeyboardDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: SELECTION_ARGS,
	parameters: selectionDocs(
		"EditByKeyboard in the dark theme: the same Enter, typing and Escape.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await EditByKeyboard.input.play?.(context)
	},
})

const PICKER_NAME = "From the Library"

type CanvasPlayContext = { canvasElement: HTMLElement; args: BoardCanvasProps }
const DRAGGED_ITEM = LIBRARY_ITEMS[1] as (typeof LIBRARY_ITEMS)[number]

const boardPointOf = (board: HTMLElement, at: BoardClientPoint) => {
	const rect = board.getBoundingClientRect()
	return {
		x: Math.round(
			at.clientX - rect.left - board.clientLeft - AT_ORIGIN.offset.x,
		),
		y: Math.round(at.clientY - rect.top - board.clientTop - AT_ORIGIN.offset.y),
	}
}

const viewportCentreOf = (board: HTMLElement) => ({
	x: Math.round(board.clientWidth / 2 - AT_ORIGIN.offset.x),
	y: Math.round(board.clientHeight / 2 - AT_ORIGIN.offset.y),
})

const ghostIn = () =>
	document.querySelector<HTMLElement>('[data-slot="board-library-ghost"]')

const startTileDrag = (tile: HTMLElement, to: BoardClientPoint) => {
	const from = centreOf(tile)
	pointerAt("pointerdown", tile, from)
	pointerAt("pointermove", window, shifted(from, { x: 8, y: -8 }))
	pointerAt("pointermove", window, to)
}

const playTileDragged = async ({ canvasElement, args }: CanvasPlayContext) => {
	const board = slotIn(canvasElement, "board-canvas")
	const picker = await screen.findByRole("dialog", { name: PICKER_NAME })
	const tile = within(picker).getByRole("button", { name: DRAGGED_ITEM.title })
	const boardBox = board.getBoundingClientRect()
	const over = { clientX: boardBox.left + 360, clientY: boardBox.top + 200 }

	startTileDrag(tile, over)
	await waitFor(() => expect(tile).toHaveAttribute("data-dragging", "true"))
	const slot = getComputedStyle(tile)
	await expect(slot.borderTopStyle).toBe("dashed")
	await expect(slot.borderTopWidth).toBe(
		`${Math.floor(1.5 * devicePixelRatio) / devicePixelRatio}px`,
	)
	await expect(slot.borderTopColor).toBe(resolvedRootColor("--user-bubble"))
	const ghost = ghostIn() as HTMLElement
	const ghostBox = ghost.getBoundingClientRect()
	await expect(ghostBox.left + ghostBox.width / 2).toBeCloseTo(over.clientX, 0)
	await expect(ghostBox.top + ghostBox.height / 2).toBeCloseTo(over.clientY, 0)
	const card = slotIn(ghost, "board-library-card")
	await expect(card.offsetWidth).toBe(236)
	await expect(getComputedStyle(card).opacity).toBe("0.94")
	await expect(getComputedStyle(card).rotate).toBe("-2deg")

	pointerAt("pointerup", window, over)
	await expect(args.onLibraryItemDrop).toHaveBeenLastCalledWith(
		DRAGGED_ITEM.id,
		boardPointOf(board, over),
	)
	await waitFor(() => expect(ghostIn()).toBeNull())
	await expect(tile).not.toHaveAttribute("data-dragging")

	startTileDrag(tile, centreOf(picker))
	pointerAt("pointerup", window, centreOf(picker))
	await waitFor(() => expect(ghostIn()).toBeNull())
	await expect(args.onLibraryItemDrop).toHaveBeenCalledTimes(1)
	await expect(args.onLibraryItemPick).not.toHaveBeenCalled()

	startTileDrag(tile, over)
	await waitFor(() => expect(ghostIn()).not.toBeNull())
}

export const TileDragged = meta.story({
	args: { tool: "library" },
	parameters: {
		docs: {
			description: {
				story:
					"Boards 5a: a Library document dragged out of the picker onto the board. Check its slot left as a 1.5px dashed Space-colour border on a faint Space-colour fill, and the Library card under the pointer, 236px wide, tilted -2 degrees at 94 percent opacity. Released over the board it emits `onLibraryItemDrop` with the item and the board point; released over the picker it emits nothing and picks nothing.",
			},
		},
	},
	play: playTileDragged,
})

export const TileDraggedDark = meta.story({
	args: { tool: "library" },
	globals: { theme: "dark" },
	play: playTileDragged,
})

export const LibraryItemPickedOnSecondCanvas = meta.story({
	tags: ["test-only"],
	args: { status: "ready", tool: "library" },
	render: (args) => (
		<div className="grid grid-cols-[3fr_2fr] gap-4">
			<ControlledBoard {...args} tool="select" />
			<ControlledBoard {...args} />
		</div>
	),
	play: async ({ canvasElement, args }) => {
		const [first, second] = slotsIn(canvasElement, "board-canvas") as [
			HTMLElement,
			HTMLElement,
		]
		await expect(viewportCentreOf(second)).not.toEqual(viewportCentreOf(first))
		const picker = await screen.findByRole("dialog", { name: PICKER_NAME })
		await userEvent.click(
			within(picker).getByRole("button", { name: DRAGGED_ITEM.title }),
		)
		await expect(args.onLibraryItemPick).toHaveBeenCalledTimes(1)
		await expect(args.onLibraryItemPick).toHaveBeenLastCalledWith(
			DRAGGED_ITEM.id,
			viewportCentreOf(second),
		)
	},
})

const pasteOn = (
	target: HTMLElement,
	fill: (transfer: DataTransfer) => void,
) => {
	const transfer = new DataTransfer()
	fill(transfer)
	target.dispatchEvent(
		new ClipboardEvent("paste", {
			bubbles: true,
			cancelable: true,
			clipboardData: transfer,
		}),
	)
}

const PASTE_ARGS = {
	...SELECTION_ARGS,
	view: { objects: [PLAN, RESEARCH] },
}

const playLinkPasted = async ({ canvasElement, args }: CanvasPlayContext) => {
	const board = slotIn(canvasElement, "board-canvas")
	const tool = within(canvasElement).getByRole("button", { name: "Select" })

	tool.focus()
	pasteOn(tool, (transfer) => transfer.setData("text/plain", PASTED_LINK))
	await expect(args.onPaste).not.toHaveBeenCalled()

	board.focus()
	pasteOn(board, (transfer) =>
		transfer.setData("text/plain", "Calm interfaces"),
	)
	await expect(args.onPaste).not.toHaveBeenCalled()

	pasteOn(board, (transfer) => transfer.setData("text/plain", PASTED_LINK))
	await expect(args.onPaste).toHaveBeenLastCalledWith(
		{ kind: "link", payload: PASTED_LINK },
		viewportCentreOf(board),
	)
	const pasted = await within(canvasElement).findByRole("option", {
		name: `Link: ${PASTED_LINK}`,
	})
	await expect(pasted).toHaveAttribute("aria-selected", "true")
	await expect(slotIn(pasted, "board-link-card").offsetHeight).toBe(
		LINK_CARD_SIZE.height,
	)
	await expectSelectionChrome(canvasElement, pasted)
}

export const LinkPasted = meta.story({
	globals: LAPTOP_WINDOW,
	args: PASTE_ARGS,
	parameters: {
		docs: {
			description: {
				story:
					"Boards 5b: a link pasted on the focused board. Check `onPaste` receiving the link and the board point at the centre of the view, the link card landing there in the selection frame, plain text and a paste while a dock tool has focus emitting nothing.",
			},
		},
	},
	play: playLinkPasted,
})

export const LinkPastedDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: PASTE_ARGS,
	play: playLinkPasted,
})

const pngNamed = (name: string) =>
	new File(["png"], name, { type: "image/png" })
const pdfNamed = (name: string) =>
	new File(["pdf"], name, { type: "application/pdf" })

const playImagePasted = async ({ canvasElement, args }: CanvasPlayContext) => {
	const board = slotIn(canvasElement, "board-canvas")
	const image = pngNamed("terrace-at-dusk.png")
	const brief = pdfNamed("launch-brief.pdf")

	await userEvent.click(board)
	await expect(board).toHaveFocus()
	pasteOn(board, (transfer) => {
		transfer.items.add(image)
		transfer.items.add(brief)
	})
	await expect(args.onPaste).toHaveBeenLastCalledWith(
		{ kind: "files", payload: [image, brief] },
		viewportCentreOf(board),
	)

	pasteOn(board, (transfer) => transfer.items.add(image))
	await expect(args.onPaste).toHaveBeenLastCalledWith(
		{ kind: "image", payload: image },
		viewportCentreOf(board),
	)
	const pasted = await within(canvasElement).findByRole("option", {
		name: `Image: ${image.name}`,
	})
	await expect(pasted).toHaveAttribute("aria-selected", "true")
	await expect(slotIn(pasted, "board-image-source")).toHaveTextContent(
		PASTED_IMAGE_SOURCE,
	)
	await expectSelectionChrome(canvasElement, pasted)
}

export const ImagePasted = meta.story({
	globals: LAPTOP_WINDOW,
	args: PASTE_ARGS,
	parameters: {
		docs: {
			description: {
				story:
					"Boards 5b: an image pasted on the board after a press on it. Check `onPaste` receiving the image file and the centre of the view, the image landing there with its source caption in the selection frame, and two files pasted together arriving as files.",
			},
		},
	},
	play: playImagePasted,
})

export const ImagePastedDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: PASTE_ARGS,
	play: playImagePasted,
})

const transferOf = (files: readonly File[]) => {
	const transfer = new DataTransfer()
	for (const file of files) transfer.items.add(file)
	return transfer
}

const transferHidingFiles = () => {
	const transfer = new DataTransfer()
	Object.defineProperty(transfer, "types", { value: ["Files"] })
	return transfer
}

const dragFiles = (
	type: string,
	board: HTMLElement,
	transfer: DataTransfer,
	at: BoardClientPoint,
) => {
	const event = new DragEvent(type, {
		bubbles: true,
		cancelable: true,
		dataTransfer: transfer,
		...at,
	})
	board.dispatchEvent(event)
	return event
}

const GHOST_TILTS = ["-3deg", "2deg", "7deg"]

const playFilesDraggedOver =
	(files: readonly File[], label: string, isCountHidden = false) =>
	async ({ canvasElement, args }: CanvasPlayContext) => {
		const board = slotIn(canvasElement, "board-canvas")
		const at = shifted(centreOf(board), { x: -120, y: -60 })
		const dropState = () =>
			board.querySelector<HTMLElement>('[data-slot="board-file-drop"]')
		const dragging = () =>
			isCountHidden ? transferHidingFiles() : transferOf(files)

		dragFiles("dragenter", board, dragging(), at)
		dragFiles("dragover", board, dragging(), at)
		await waitFor(() => expect(dropState()).not.toBeNull())
		const boardBox = board.getBoundingClientRect()
		const target = slotIn(board, "board-drop-target")
		const targetBox = target.getBoundingClientRect()
		await expect(targetBox.left - boardBox.left).toBe(8)
		await expect(boardBox.right - targetBox.right).toBe(8)
		await expect(getComputedStyle(target).borderTopStyle).toBe("dashed")
		await expect(getComputedStyle(target).borderTopWidth).toBe("2px")
		await expect(getComputedStyle(target).borderTopLeftRadius).toBe("10px")
		await expect(getComputedStyle(target).borderTopColor).toBe(
			resolvedRootColor("--user-bubble"),
		)

		const thumbnails = slotsIn(board, "board-drop-thumbnail")
		await expect(thumbnails).toHaveLength(
			isCountHidden ? 1 : Math.min(files.length, 3),
		)
		await expect(
			thumbnails.map((thumbnail) => thumbnail.dataset.kind).reverse(),
		).toEqual(
			isCountHidden
				? ["file"]
				: files
						.slice(0, 3)
						.map((file) => (file.type.startsWith("image/") ? "image" : "file")),
		)
		await expect(
			thumbnails
				.map((thumbnail) => getComputedStyle(thumbnail).rotate)
				.reverse(),
		).toEqual(GHOST_TILTS.slice(0, thumbnails.length))
		for (const thumbnail of thumbnails) {
			await expect([thumbnail.offsetWidth, thumbnail.offsetHeight]).toEqual([
				132, 92,
			])
		}
		const pill = slotIn(board, "board-drop-pill")
		await expect(pill).toHaveTextContent(label)
		await expect(getComputedStyle(pill).backgroundColor).toBe(
			resolvedRootColor("--user-bubble"),
		)
		await expect(getComputedStyle(pill).color).toBe(
			resolvedRootColor("--user-bubble-foreground"),
		)
		const ghostBox = slotIn(board, "board-drop-ghost").getBoundingClientRect()
		await expect(ghostBox.left + ghostBox.width / 2).toBeCloseTo(at.clientX, 0)

		board.dispatchEvent(
			new DragEvent("dragleave", { bubbles: true, relatedTarget: null }),
		)
		await waitFor(() => expect(dropState()).toBeNull())

		dragFiles("dragenter", board, dragging(), at)
		dragFiles("drop", board, transferOf(files), at)
		await waitFor(() => expect(dropState()).toBeNull())
		await expect(args.onDropFiles).toHaveBeenLastCalledWith(
			files,
			boardPointOf(board, at),
		)

		dragFiles("dragover", board, dragging(), at)
		await waitFor(() => expect(dropState()).not.toBeNull())
	}

const THREE_IMAGES = [
	pngNamed("terrace.png"),
	pngNamed("rooftop-pool.png"),
	pngNamed("garden-patio.png"),
]
const MIXED_FILES = [
	pngNamed("terrace.png"),
	pdfNamed("launch-brief.pdf"),
	pngNamed("garden-patio.png"),
]
const ONE_FILE = [pdfNamed("launch-brief.pdf")]

export const FilesDraggedOverImages = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Boards 5c: three images dragged from the desktop over the board. Check the whole-board target 8px in with a 2px dashed Space-colour border, three 132 by 92 thumbnails tilted -3, 2 and 7 degrees under the pointer, the pill reading Drop to add 3 images here, the state leaving with the drag, and a drop emitting `onDropFiles` with the files and the board point. Pick FilesDraggedOverMixed when one file is not an image, FilesDraggedOverOneFile for a single file.",
			},
		},
	},
	play: playFilesDraggedOver(THREE_IMAGES, "Drop to add 3 images here"),
})

export const FilesDraggedOverImagesDark = meta.story({
	globals: { theme: "dark" },
	play: playFilesDraggedOver(THREE_IMAGES, "Drop to add 3 images here"),
})

export const FilesDraggedOverMixed = meta.story({
	play: playFilesDraggedOver(MIXED_FILES, "Drop to add 3 files here"),
})

export const FilesDraggedOverMixedDark = meta.story({
	globals: { theme: "dark" },
	play: playFilesDraggedOver(MIXED_FILES, "Drop to add 3 files here"),
})

export const FilesDraggedOverOneFile = meta.story({
	play: playFilesDraggedOver(ONE_FILE, "Drop to add 1 file here"),
})

export const FilesDraggedOverOneFileDark = meta.story({
	globals: { theme: "dark" },
	play: playFilesDraggedOver(ONE_FILE, "Drop to add 1 file here"),
})

export const FilesDraggedOverUnknownCount = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Boards 5c when the webview hides the dragged files until the drop: one file thumbnail under the pointer and the pill reading Drop to add files here, with no number. The drop still emits `onDropFiles` with the files it carries.",
			},
		},
	},
	play: playFilesDraggedOver(MIXED_FILES, "Drop to add files here", true),
})

export const FilesDraggedOverUnknownCountDark = meta.story({
	globals: { theme: "dark" },
	play: playFilesDraggedOver(MIXED_FILES, "Drop to add files here", true),
})

const DROPPED_IMAGE_URL = "https://images.example.com/terrace-at-dusk.jpg"
const DROPPED_FILE_URL = "file:///Users/mira/terrace.jpg"
const DROPPED_MAIL_URL = "mailto:mira@example.com"

const urlTransferOf = (uriList: string) => {
	const transfer = new DataTransfer()
	transfer.setData("text/uri-list", uriList)
	return transfer
}

const playUrlDraggedOver = async ({
	canvasElement,
	args,
}: CanvasPlayContext) => {
	const board = slotIn(canvasElement, "board-canvas")
	const at = shifted(centreOf(board), { x: -120, y: -60 })
	const dropState = () =>
		board.querySelector<HTMLElement>('[data-slot="board-file-drop"]')
	const dragging = () => urlTransferOf(DROPPED_IMAGE_URL)

	dragFiles("dragenter", board, dragging(), at)
	dragFiles("dragover", board, dragging(), at)
	await waitFor(() => expect(dropState()).not.toBeNull())
	await expect(
		slotsIn(board, "board-drop-thumbnail").map(
			(thumbnail) => thumbnail.dataset.kind,
		),
	).toEqual(["image"])
	await expect(slotIn(board, "board-drop-pill")).toHaveTextContent(
		"Drop to add 1 image here",
	)
	const ghostBox = slotIn(board, "board-drop-ghost").getBoundingClientRect()
	await expect(ghostBox.left + ghostBox.width / 2).toBeCloseTo(at.clientX, 0)

	board.dispatchEvent(
		new DragEvent("dragleave", { bubbles: true, relatedTarget: null }),
	)
	await waitFor(() => expect(dropState()).toBeNull())

	dragFiles("dragover", board, dragging(), at)
	dragFiles("drop", board, urlTransferOf(DROPPED_FILE_URL), at)
	await waitFor(() => expect(dropState()).toBeNull())
	await expect(args.onDropUrl).toHaveBeenCalledTimes(1)
	await expect(args.onDropUrl).toHaveBeenLastCalledWith(
		DROPPED_FILE_URL,
		boardPointOf(board, at),
	)

	dragFiles("drop", board, urlTransferOf(DROPPED_MAIL_URL), at)
	await expect(args.onDropUrl).toHaveBeenCalledTimes(2)
	await expect(args.onDropUrl).toHaveBeenLastCalledWith(
		DROPPED_MAIL_URL,
		boardPointOf(board, at),
	)

	dragFiles("dragover", board, dragging(), at)
	await waitFor(() => expect(dropState()).not.toBeNull())
	await expect(
		dragFiles("drop", board, urlTransferOf("# terrace\r\n\r\n  \r\n"), at)
			.defaultPrevented,
	).toBe(true)
	await waitFor(() => expect(dropState()).toBeNull())
	await expect(args.onDropUrl).toHaveBeenCalledTimes(2)

	dragFiles("dragover", board, dragging(), at)
	dragFiles(
		"drop",
		board,
		urlTransferOf(
			`# terrace\r\n${DROPPED_IMAGE_URL}\r\nhttps://example.com/rooftop.jpg`,
		),
		at,
	)
	await waitFor(() => expect(dropState()).toBeNull())
	await expect(args.onDropUrl).toHaveBeenCalledTimes(3)
	await expect(args.onDropUrl).toHaveBeenLastCalledWith(
		DROPPED_IMAGE_URL,
		boardPointOf(board, at),
	)
	await expect(args.onDropFiles).not.toHaveBeenCalled()

	const image = pngNamed("terrace.png")
	const fileWithUrl = transferOf([image])
	fileWithUrl.setData("text/uri-list", DROPPED_IMAGE_URL)
	dragFiles("drop", board, fileWithUrl, at)
	await expect(args.onDropFiles).toHaveBeenLastCalledWith(
		[image],
		boardPointOf(board, at),
	)
	await expect(args.onDropUrl).toHaveBeenCalledTimes(3)

	const fromBoard = dragging()
	slotIn(board, "board-image").dispatchEvent(
		new DragEvent("dragstart", {
			bubbles: true,
			cancelable: true,
			dataTransfer: fromBoard,
		}),
	)
	await expect(
		dragFiles("dragover", board, fromBoard, at).defaultPrevented,
	).toBe(false)
	await expect(dropState()).toBeNull()
	dragFiles("drop", board, fromBoard, at)
	await expect(dropState()).toBeNull()
	await expect(args.onDropUrl).toHaveBeenCalledTimes(3)
	await expect(args.onDropFiles).toHaveBeenCalledTimes(1)

	dragFiles("dragover", board, dragging(), at)
	await waitFor(() => expect(dropState()).not.toBeNull())
}

const TERRACE: BoardItem = {
	id: "terrace",
	kind: "image",
	position: { x: 40, y: 40 },
	size: PASTED_IMAGE_SIZE,
	zOrder: 1,
	text: "terrace-at-dusk.png",
}

const URL_DRAG_ARGS = {
	view: { objects: [TERRACE] },
	renderObject: (object: BoardItem) => <BoardObjectView object={object} />,
}

export const UrlDraggedOver = meta.story({
	args: URL_DRAG_ARGS,
	parameters: {
		docs: {
			description: {
				story:
					"Boards 5c for a web image dragged from a browser: the drag carries a link and no file, so the board shows its drop target with one image thumbnail under the pointer and the pill reading Drop to add 1 image here. Check the state leaving with the drag, a drop emitting `onDropUrl` once with the first link of the list and the board point, a `file:///` or `mailto:` link reaching `onDropUrl` just the same since the app decides what a dropped link becomes, a list of only blank or comment lines claiming the drop and emitting nothing, and a drag carrying files keeping to `onDropFiles`.",
			},
		},
	},
	play: playUrlDraggedOver,
})

export const UrlDraggedOverDark = meta.story({
	args: URL_DRAG_ARGS,
	globals: { theme: "dark" },
	play: playUrlDraggedOver,
})

const REVIEW: BoardItem = {
	id: "review",
	kind: "shape",
	position: { x: 320, y: 240 },
	size: { width: 144, height: 80 },
	zOrder: 2,
	text: "Review",
}

const PLAN_TO_REVIEW: BoardObject = {
	id: "plan-to-review",
	kind: "connector",
	from: "plan",
	fromSide: "right",
	to: "review",
	toSide: "left",
	routing: "straight",
	zOrder: 0,
	text: "",
}

const CONNECTOR_ARGS = {
	view: { objects: [PLAN, REVIEW] },
	renderObject: (object: BoardItem) => <BoardObjectView object={object} />,
	isConnecting: true,
}

const CONNECTED_ARGS = {
	view: { objects: [PLAN, REVIEW, PLAN_TO_REVIEW] },
	renderObject: (object: BoardItem) => <BoardObjectView object={object} />,
}

const STRAIGHT_PATH = "M224 144 L344 304"
const ELBOW_PATH =
	"M224 144 L276 144 Q284 144 284 152 L284 296 Q284 304 292 304 L344 304"
const ARROWHEAD_PATH = "M334 310 L344 304 L334 298"
const ANCHOR_SIZE = 10
const HOVER_OUTSET = 4
const HOVER_RADIUS = "14px"

const anchorOn = (root: HTMLElement, id: string, side: string) =>
	root.querySelector<HTMLElement>(
		`[data-slot="board-anchor"][data-anchor-object="${id}"][data-side="${side}"]`,
	)

const boardAt = (root: HTMLElement, x: number, y: number) => {
	const board = slotIn(root, "board-canvas")
	const box = board.getBoundingClientRect()
	return {
		clientX: box.x + board.clientLeft + x,
		clientY: box.y + board.clientTop + y,
	}
}

const connectorPaths = (root: HTMLElement, slot: string) =>
	Array.from(
		root.querySelectorAll<SVGPathElement>(
			`[data-slot="${slot}"] [data-slot="board-connector-path"]`,
		),
	).map((path) => path.getAttribute("d"))

const pickElbow = async (root: HTMLElement) => {
	const elbow = within(root).getByRole("radio", { name: "Elbow" })
	await userEvent.click(elbow)
	await expect(elbow).toBeChecked()
}

const hoverObject = (root: HTMLElement, id: string) =>
	pointerAt(
		"pointerover",
		objectNode(root, id) as HTMLElement,
		centreOf(objectNode(root, id) as HTMLElement),
	)

const hoverPlanRightAnchor = (root: HTMLElement) => {
	hoverObject(root, "plan")
	return waitFor(() => {
		const anchor = anchorOn(root, "plan", "right")
		expect(anchor).not.toBeNull()
		return anchor as HTMLElement
	})
}

const dragFromPlanToReviewAnchor = async (root: HTMLElement) => {
	const source = await hoverPlanRightAnchor(root)
	pointerAt("pointerdown", source, centreOf(source))
	pointerAt(
		"pointermove",
		document,
		centreOf(objectNode(root, "review") as HTMLElement),
	)
	const target = await waitFor(() => {
		const anchor = anchorOn(root, "review", "left")
		expect(anchor).not.toBeNull()
		return anchor as HTMLElement
	})
	const at = centreOf(target)
	pointerAt("pointermove", document, at)
	await waitFor(() => expect(target).toHaveAttribute("data-active", "true"))
	return at
}

const expectAnchorFrame = async (root: HTMLElement, id: string) => {
	const object = (objectNode(root, id) as HTMLElement).getBoundingClientRect()
	const outline = slotIn(root, "board-hover-outline")
	const outlineBox = outline.getBoundingClientRect()
	const outlineStyle = getComputedStyle(outline)
	await expect(outlineBox.x).toBeCloseTo(object.x - HOVER_OUTSET, 0)
	await expect(outlineBox.width).toBeCloseTo(object.width + HOVER_OUTSET * 2, 0)
	await expect(outlineStyle.borderTopWidth).toBe("2px")
	await expect(outlineStyle.borderTopLeftRadius).toBe(HOVER_RADIUS)
	const middles = {
		top: [object.x + object.width / 2, object.y],
		right: [object.right, object.y + object.height / 2],
		bottom: [object.x + object.width / 2, object.bottom],
		left: [object.x, object.y + object.height / 2],
	}
	for (const [side, [x, y]] of Object.entries(middles)) {
		const anchor = anchorOn(root, id, side) as HTMLElement
		const box = anchor.getBoundingClientRect()
		const look = getComputedStyle(anchor)
		await expect([box.width, box.height]).toEqual([ANCHOR_SIZE, ANCHOR_SIZE])
		await expect(box.x + box.width / 2).toBeCloseTo(x, 0)
		await expect(box.y + box.height / 2).toBeCloseTo(y, 0)
		await expect(look.borderTopWidth).toBe("2px")
		await expect(look.borderTopColor).toBe(resolvedRootColor("--user-bubble"))
		await expect(look.backgroundColor).toBe(
			resolvedRootColor(
				anchor.dataset.active === "true" ? "--user-bubble" : "--board-surface",
			),
		)
	}
}

const selectPlanToReview = async (root: HTMLElement) => {
	const hit = root.querySelector(
		'[data-slot="board-connector-hits"] [data-connector-id="plan-to-review"]',
	) as SVGPathElement
	pointerAt("pointerdown", hit, boardAt(root, 284, 224))
	await within(root).findByRole("radiogroup", { name: "Connector type" })
}

const connectorDocs = (story: string) => ({
	docs: { description: { story } },
})

export const CreateConnector = meta.story({
	globals: LAPTOP_WINDOW,
	args: CONNECTOR_ARGS,
	parameters: connectorDocs(
		"Connector mode on. A drag from the right anchor of the sticky released on empty board sends nothing and leaves no line. Elbow picked in the flyout, a drag from the same anchor released on the left anchor of Review sends one connect intent with both ids, both sides and the elbow kind, and the committed connector draws in the board shape border colour, 2px with round caps, rounded corners of 8 and the open chevron at Review. Pick ConnectorBeingDrawn for the drag in progress.",
	),
	play: async ({ canvasElement, args }) => {
		const source = await hoverPlanRightAnchor(canvasElement)
		pointerAt("pointerdown", source, centreOf(source))
		const empty = boardAt(canvasElement, 640, 520)
		pointerAt("pointermove", document, empty)
		await waitFor(() =>
			expect(slotsIn(canvasElement, "board-connector-draft")).toHaveLength(1),
		)
		pointerAt("pointerup", document, empty)
		await waitFor(() =>
			expect(slotsIn(canvasElement, "board-connector-draft")).toHaveLength(0),
		)
		await expect(args.onIntent).not.toHaveBeenCalled()

		await pickElbow(canvasElement)
		const release = await dragFromPlanToReviewAnchor(canvasElement)
		pointerAt("pointerup", document, release)
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "connect",
			id: expect.any(String),
			from: "plan",
			fromSide: "right",
			to: "review",
			toSide: "left",
			routing: "elbow",
		})
		await expect(slotsIn(canvasElement, "board-connector-draft")).toHaveLength(
			0,
		)
		await expect(connectorPaths(canvasElement, "board-connector")).toEqual([
			ELBOW_PATH,
		])
		const line = slotIn(canvasElement, "board-connector")
		const look = getComputedStyle(line)
		await expect(look.stroke).toBe(resolvedRootColor("--board-shape-border"))
		await expect(look.strokeWidth).toBe("2px")
		await expect(look.strokeLinecap).toBe("round")
		await expect(look.strokeLinejoin).toBe("round")
		await expect(
			slotIn(line, "board-connector-arrowhead").getAttribute("d"),
		).toBe(ARROWHEAD_PATH)
	},
})

export const CreateConnectorDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CONNECTOR_ARGS,
	parameters: connectorDocs(
		"CreateConnector in the dark theme: the same two drags and the same single connect intent.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await CreateConnector.input.play?.(context)
	},
})

export const ConnectorBeingDrawn = meta.story({
	globals: LAPTOP_WINDOW,
	args: CONNECTOR_ARGS,
	parameters: connectorDocs(
		"Boards 4d: an elbow connector being drawn. Check the hover outline 4px outside the hovered object, 2px in the Space colour at 50% with 14px corners, the four 10px anchors centred on the middle of each side on the board surface with a 2px Space-colour ring, the anchor under the pointer filled in the Space colour with a 3px ring at 25%, the line in the Space colour from a 10px dot on the source anchor to the open chevron at the pointer, and Elbow picked in the flyout. Pick CreateConnector for the release.",
	),
	play: async ({ canvasElement, args }) => {
		await pickElbow(canvasElement)
		await hoverPlanRightAnchor(canvasElement)
		await expectAnchorFrame(canvasElement, "plan")

		await dragFromPlanToReviewAnchor(canvasElement)
		await expectAnchorFrame(canvasElement, "review")
		await expect(slotsIn(canvasElement, "board-anchor-frame")).toHaveLength(1)
		const active = anchorOn(canvasElement, "review", "left") as HTMLElement
		await expect(getComputedStyle(active).boxShadow).toMatch(/\b3px\b/)

		await expect(
			connectorPaths(canvasElement, "board-connector-draft"),
		).toEqual([ELBOW_PATH])
		const draft = slotIn(canvasElement, "board-connector-draft")
		await expect(getComputedStyle(draft).stroke).toBe(
			resolvedRootColor("--user-bubble"),
		)
		await expect(getComputedStyle(draft).strokeWidth).toBe("2px")
		const dot = slotIn(canvasElement, "board-connector-source")
		await expect(
			["cx", "cy", "r"].map((name) => dot.getAttribute(name)),
		).toEqual(["224", "144", "4"])
		await expect(getComputedStyle(dot).fill).toBe(
			resolvedRootColor("--board-surface"),
		)
		await expect(args.onIntent).not.toHaveBeenCalled()
	},
})

export const ConnectorBeingDrawnDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CONNECTOR_ARGS,
	parameters: connectorDocs(
		"ConnectorBeingDrawn in the dark theme: the same drag held over the anchor of Review.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ConnectorBeingDrawn.input.play?.(context)
	},
})

export const SwitchConnectorRouting = meta.story({
	globals: LAPTOP_WINDOW,
	args: CONNECTED_ARGS,
	parameters: connectorDocs(
		"A press on a straight connector selects it, draws it in the Space colour and opens the flyout on Straight. Elbow there sends one style intent and the connector redraws as an elbow, the left arrow key on the focused radio switches it back. The connector itself never takes focus and stays hidden from assistive technology: the flyout is the only way in.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await expect(connectorPaths(canvasElement, "board-connector")).toEqual([
			STRAIGHT_PATH,
		])
		await expect(canvas.queryByRole("radiogroup")).toBeNull()
		for (const layer of ["board-connectors", "board-connector-hits"]) {
			const svg = slotIn(canvasElement, layer)
			await expect(svg).toHaveAttribute("aria-hidden", "true")
			await expect(svg.querySelectorAll("[tabindex]")).toHaveLength(0)
		}

		await selectPlanToReview(canvasElement)
		const straight = canvas.getByRole("radio", { name: "Straight" })
		await expect(straight).toBeChecked()
		await expect(
			getComputedStyle(slotIn(canvasElement, "board-connector")).stroke,
		).toBe(resolvedRootColor("--user-bubble"))

		const elbow = canvas.getByRole("radio", { name: "Elbow" })
		await userEvent.click(elbow)
		await expect(args.onIntent).toHaveBeenCalledTimes(1)
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "style",
			id: "plan-to-review",
			style: { routing: "elbow" },
		})
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector")).toEqual([
				ELBOW_PATH,
			]),
		)
		await expect(elbow).toBeChecked()

		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "style",
			id: "plan-to-review",
			style: { routing: "straight" },
		})
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector")).toEqual([
				STRAIGHT_PATH,
			]),
		)
	},
})

export const SwitchConnectorRoutingDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CONNECTED_ARGS,
	parameters: connectorDocs(
		"SwitchConnectorRouting in the dark theme: the same press, pick and arrow key.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await SwitchConnectorRouting.input.play?.(context)
	},
})

export const MoveConnectedObject = meta.story({
	globals: LAPTOP_WINDOW,
	args: CONNECTED_ARGS,
	parameters: connectorDocs(
		"A drag on Review redraws the connector from its new rect in the same frame as the shape moves, before any intent goes out, and the release sends one move intent. Pick SwitchConnectorRouting to change the kind.",
	),
	play: async ({ canvasElement, args }) => {
		const review = objectNode(canvasElement, "review") as HTMLElement
		const before = review.getBoundingClientRect()
		const from = centreOf(review)
		const to = shifted(from, { x: 60, y: 40 })

		pointerAt("pointerdown", review, from)
		pointerAt("pointermove", document, to)
		await waitFor(() =>
			expect(review.getBoundingClientRect().x).toBeCloseTo(before.x + 60, 0),
		)
		await expect(connectorPaths(canvasElement, "board-connector")).toEqual([
			"M224 144 L404 344",
		])
		await expect(args.onIntent).not.toHaveBeenCalled()

		pointerAt("pointerup", document, to)
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "move",
			id: "review",
			position: { x: 380, y: 280 },
		})
		await expect(connectorPaths(canvasElement, "board-connector")).toEqual([
			"M224 144 L404 344",
		])
	},
})

export const MoveConnectedObjectDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CONNECTED_ARGS,
	parameters: connectorDocs(
		"MoveConnectedObject in the dark theme: the same drag and the same single move intent.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await MoveConnectedObject.input.play?.(context)
	},
})

export const ConnectorByKeyboard = meta.story({
	globals: LAPTOP_WINDOW,
	args: CONNECTED_ARGS,
	parameters: connectorDocs(
		"A selected connector answers the keyboard: Escape clears the selection, hides the flyout and draws the line back in the board shape border colour, Delete sends one delete intent for the connector and clears the selection. Pick SwitchConnectorRouting for the flyout.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await selectPlanToReview(canvasElement)
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(canvas.queryByRole("radiogroup")).toBeNull())
		await expect(
			getComputedStyle(slotIn(canvasElement, "board-connector")).stroke,
		).toBe(resolvedRootColor("--board-shape-border"))
		await expect(args.onIntent).not.toHaveBeenCalled()

		await selectPlanToReview(canvasElement)
		await userEvent.keyboard("{Delete}")
		await expect(args.onIntent).toHaveBeenCalledTimes(1)
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "delete",
			id: "plan-to-review",
		})
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector")).toEqual([]),
		)
		await expect(canvas.queryByRole("radiogroup")).toBeNull()
	},
})

export const ConnectorByKeyboardDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CONNECTED_ARGS,
	parameters: connectorDocs(
		"ConnectorByKeyboard in the dark theme: the same Escape and Delete.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ConnectorByKeyboard.input.play?.(context)
	},
})

export const CancelDraftByEscape = meta.story({
	globals: LAPTOP_WINDOW,
	args: CONNECTOR_ARGS,
	parameters: connectorDocs(
		"Escape while a connector is being drawn drops the line, and the release that follows on an anchor of Review sends nothing. Pick CreateConnector for a drag that lands.",
	),
	play: async ({ canvasElement, args }) => {
		const release = await dragFromPlanToReviewAnchor(canvasElement)
		await expect(slotsIn(canvasElement, "board-connector-draft")).toHaveLength(
			1,
		)
		await userEvent.keyboard("{Escape}")
		await waitFor(() =>
			expect(slotsIn(canvasElement, "board-connector-draft")).toHaveLength(0),
		)
		pointerAt("pointerup", document, release)
		await expect(args.onIntent).not.toHaveBeenCalled()
	},
})

export const CancelDraftByEscapeDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CONNECTOR_ARGS,
	parameters: connectorDocs(
		"CancelDraftByEscape in the dark theme: the same drag dropped by Escape.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await CancelDraftByEscape.input.play?.(context)
	},
})

const ATLAS_WRITING_CONNECTOR: BoardObjectOutlineSpec = {
	objectId: "plan-to-review",
	owner: { kind: "agent", id: "agent-atlas", name: "Atlas", hue: 220 },
	state: "writing",
}

export const ConnectorWithPresenceOutline = meta.story({
	globals: LAPTOP_WINDOW,
	args: { ...CONNECTED_ARGS, outlines: [ATLAS_WRITING_CONNECTOR] },
	parameters: connectorDocs(
		"An agent writing on a connector: the presence ring of its owner around the box spanning both ends, as before connectors were drawn by the canvas. The ring stays out of the tab order and hidden from assistive technology.",
	),
	play: async ({ canvasElement }) => {
		const box = slotIn(canvasElement, "board-connector-outline")
		await expect(box).toHaveAttribute("aria-hidden", "true")
		const plan = (
			objectNode(canvasElement, "plan") as HTMLElement
		).getBoundingClientRect()
		const review = (
			objectNode(canvasElement, "review") as HTMLElement
		).getBoundingClientRect()
		const bounds = box.getBoundingClientRect()
		await expect(bounds.x).toBeCloseTo(plan.x, 0)
		await expect(bounds.y).toBeCloseTo(plan.y, 0)
		await expect(bounds.right).toBeCloseTo(review.right, 0)
		await expect(bounds.bottom).toBeCloseTo(review.bottom, 0)
		const outline = slotIn(box, "board-object-outline")
		await expect(outline).toHaveAttribute("data-state", "writing")
		await expect(
			getComputedStyle(outline.firstElementChild as HTMLElement).boxShadow,
		).toMatch(/\b2px\b/)
	},
})

export const ConnectorWithPresenceOutlineDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: ConnectorWithPresenceOutline.input.args,
	parameters: connectorDocs(
		"ConnectorWithPresenceOutline in the dark theme: the same ring around the connector.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ConnectorWithPresenceOutline.input.play?.(context)
	},
})

const RemovableBoard = (props: BoardCanvasProps) => {
	const [isShown, setIsShown] = useState(true)
	return (
		<div className="flex flex-col gap-2">
			<button onClick={() => setIsShown(false)} type="button">
				Remove the board
			</button>
			{isShown ? <ControlledBoard {...props} /> : null}
		</div>
	)
}

const DRAFT_EVENTS = ["pointermove", "pointerup", "pointercancel", "keydown"]

export const UnmountDuringDraft = meta.story({
	tags: ["test-only"],
	globals: LAPTOP_WINDOW,
	args: CONNECTOR_ARGS,
	render: (args) => <RemovableBoard {...args} />,
	play: async ({ canvasElement }) => {
		const added = spyOn(window, "addEventListener")
		const removed = spyOn(window, "removeEventListener")
		try {
			const source = await hoverPlanRightAnchor(canvasElement)
			pointerAt("pointerdown", source, centreOf(source))
			const listeners = added.mock.calls.filter(([type]) =>
				DRAFT_EVENTS.includes(type),
			)
			await expect(listeners.map(([type]) => type).sort()).toEqual(
				[...DRAFT_EVENTS].sort(),
			)

			within(canvasElement)
				.getByRole("button", { name: "Remove the board" })
				.focus()
			await userEvent.keyboard("{Enter}")
			await waitFor(() =>
				expect(slotsIn(canvasElement, "board-canvas")).toHaveLength(0),
			)
			const isRemoved = ([type, listener]: (typeof listeners)[number]) =>
				removed.mock.calls.some(
					([removedType, removedListener]) =>
						removedType === type && removedListener === listener,
				)
			await expect(listeners.every(isRemoved)).toBe(true)
		} finally {
			added.mockRestore()
			removed.mockRestore()
		}
	},
})
