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

import boardSchema from "@workspace/shared/board/board.schema.json"
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
import { BoardSection } from "@workspace/ui/components/board/board-section"
import { BoardShape } from "@workspace/ui/components/board/board-shape"
import { BoardSticky } from "@workspace/ui/components/board/board-sticky"
import { BoardText } from "@workspace/ui/components/board/board-text"
import {
	BoardCanvas,
	type BoardCanvasProps,
} from "@workspace/ui/components/board-canvas"
import type {
	BoardCommentThread,
	BoardOpenCommentThread,
} from "@workspace/ui/components/board-comment-layer"
import type {
	BoardConnector,
	BoardIntent,
	BoardItem,
	BoardObject,
	BoardPaste,
	BoardPoint,
	BoardRect,
	BoardSize,
	BoardView,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import {
	AGENT_REPLY,
	COMMENT_COUNTS,
	COMMENT_PARTICIPANTS,
	FIRST_COMMENT,
	JUNIPER,
	LENA,
	MEMBER_REPLY,
	OPEN_THREADS,
	RESOLVED_THREADS,
	STEVE,
} from "@workspace/ui/components/library-comments.fixtures"
import {
	LibraryCommentsList,
	type LibraryCommentsTab,
} from "@workspace/ui/components/library-comments-list"
import { LibraryDocumentBar } from "@workspace/ui/components/library-document-view"

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
			return { objects: [...view.objects, intent.object] }
		case "connect": {
			const { type, ...connector } = intent
			return {
				objects: [
					...view.objects,
					{ ...connector, kind: "connector", zOrder: 0, text: "" },
				],
			}
		}
		case "set-arrow": {
			const { arrow } = intent
			const isKnown = view.objects.some((object) => object.id === arrow.id)
			return {
				objects: isKnown
					? view.objects.map((object) =>
							object.id === arrow.id ? arrow : object,
						)
					: [...view.objects, arrow],
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
					"The board of a Space in its own tab: a dot grid the board slides over, the objects it mounts through `renderObject`, and the zoom control at the bottom end corner. The viewport is controlled: two-finger scroll, the mouse wheel and the arrow keys with nothing selected pan, a pinch zooms around the pointer, the buttons step the zoom around the centre, and every move goes out through `onViewportChange`. Only the objects inside the visible area plus a margin are mounted. A press or Tab selects an object and draws its frame and corner handles in the Space colour, a selected shape gets its style bar above it, and every move, resize, text edit, style pick or delete goes out through `onIntent` as a `BoardIntent`: the canvas never changes the board itself. Connectors are drawn by the canvas from the live rects of their ends, Straight or Elbow: with `isConnecting` on, a hovered object shows its outline and four anchors, a drag from one anchor to another object's anchor sends a connect intent, and the flyout picks the kind of the next connector, Elbow until changed, or of the selected one. The tool dock sits centred at the bottom with the Library picker above it, a Library tile dragged onto the board emits `onLibraryItemDrop` with the board point, a link, an image or files pasted on the focused board emit `onPaste` with the centre of the view and the object whose id it returns gets selected, and files dragged in from the desktop show the drop target and emit `onDropFiles` where they land, and a link dragged in shows it too and emits `onDropUrl` with the first link of the list and the board point whatever its scheme, the app deciding what it becomes. Comments come in through props: `commentThreads` draws one pin per open thread, on its node or on its board point, a click on a pin sends `onOpenCommentThread`, `openCommentThread` opens the thread card, `commentDraft` the composer, and `isCommentMode` shows the hint and the pin cursor, rings the hovered object and turns a click into `onStartComment` with a node id or a board point. One Esc from the board, the page or the Comment button closes the innermost open thing only: the mention menu, then the composer through `commentDraft.onClose`, then the thread card through `openCommentThread.onClose`, then comment mode through `onLeaveCommentMode`. A composer takes the keyboard focus when it opens and each time its anchor changes.",
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

const OPENING_MARGIN = 64

const stickyAt = (id: string, x: number, y: number): BoardItem => ({
	id,
	kind: "sticky",
	position: { x, y },
	size: NOTE_SIZE,
	zOrder: 1,
	text: id,
})

const SPREAD_BOARD: BoardView = {
	objects: [
		stickyAt("Far west", 4000, -3000),
		stickyAt("Far east", 7400, -2200),
		stickyAt("Far south", 5200, -900),
		{
			id: "Far link",
			kind: "connector",
			from: "Far west",
			fromSide: "right",
			to: "Far east",
			toSide: "left",
			routing: "straight",
			zOrder: 0,
			text: "",
		},
	],
}

const TWO_STICKIES_BOARD: BoardView = {
	objects: [stickyAt("Left", -420, 260), stickyAt("Right", -200, 300)],
}

const innerBoxOf = (board: HTMLElement) => {
	const rect = board.getBoundingClientRect()
	const x = rect.x + board.clientLeft
	const y = rect.y + board.clientTop
	return {
		x,
		y,
		right: x + board.clientWidth,
		bottom: y + board.clientHeight,
	}
}

const shownContentOf = (board: HTMLElement) => {
	const rects = slotsIn(board, "board-object").map((node) =>
		node.getBoundingClientRect(),
	)
	return {
		x: Math.min(...rects.map((rect) => rect.left)),
		y: Math.min(...rects.map((rect) => rect.top)),
		right: Math.max(...rects.map((rect) => rect.right)),
		bottom: Math.max(...rects.map((rect) => rect.bottom)),
	}
}

const expectOpenedCentred = async (
	canvasElement: HTMLElement,
	args: BoardCanvasProps,
	expectedZoomOf: (box: BoardSize, margin: number) => number,
) => {
	const board = slotIn(canvasElement, "board-canvas")
	const objectCount = args.view.objects.filter(
		(object) => object.kind !== "connector",
	).length
	await waitFor(() =>
		expect(slotsIn(board, "board-object")).toHaveLength(objectCount),
	)
	const dockTop = slotIn(board, "board-dock").getBoundingClientRect().top
	const margin = board.getBoundingClientRect().bottom - dockTop + OPENING_MARGIN
	const zoom = expectedZoomOf(
		{ width: board.clientWidth, height: board.clientHeight },
		margin,
	)
	await expect(slotIn(board, "board-zoom-level")).toHaveTextContent(
		`${Math.round(zoom * 100)}%`,
	)
	await expect(args.onViewportChange).toHaveBeenCalledOnce()
	await expect(args.onViewportChange).toHaveBeenCalledWith(
		expect.objectContaining({ zoom }),
	)

	const box = innerBoxOf(board)
	const content = shownContentOf(board)
	const gaps = {
		start: content.x - box.x,
		end: box.right - content.right,
		top: content.y - box.y,
		bottom: box.bottom - content.bottom,
	}
	await expect(Math.abs(gaps.start - gaps.end)).toBeLessThanOrEqual(1)
	await expect(Math.abs(gaps.top - gaps.bottom)).toBeLessThanOrEqual(1)
	return { board, content, dockTop, gaps, margin }
}

const SPREAD_BOUNDS = { width: 3560, height: 2220 }

export const OpensFramedOnSpreadContent = meta.story({
	args: { view: SPREAD_BOARD, viewport: null },
	parameters: {
		docs: {
			description: {
				story:
					"A board whose three stickies and connector sit thousands of pixels from the origin, opened with no viewport placed. Check the content centred in the canvas below 100%, the same margin on the two edges of the axis that limits the fit, wide enough that the content ends 64px above the top of the dock, the zoom control reading that zoom, the placed viewport sent once, and no refit when a sticky then moves. Pick OpensFramedOnSpreadContentDark for the dark theme, OpensAtFullSizeOnTwoStickies for content that already fits.",
			},
		},
	},
	play: async ({ canvasElement, args }) => {
		const { board, content, dockTop, gaps, margin } = await expectOpenedCentred(
			canvasElement,
			args,
			(box, margin) =>
				Math.min(
					(box.width - 2 * margin) / SPREAD_BOUNDS.width,
					(box.height - 2 * margin) / SPREAD_BOUNDS.height,
				),
		)
		await expect(Math.min(gaps.start, gaps.top) - margin).toBeCloseTo(0, 0)
		await expect(content.bottom + OPENING_MARGIN).toBeLessThanOrEqual(
			dockTop + 1,
		)

		const level = slotIn(board, "board-zoom-level").textContent
		await userEvent.click(objectNode(board, "Far west") as HTMLElement)
		await userEvent.keyboard("{ArrowRight}")
		await waitFor(() => expect(args.onIntent).toHaveBeenCalled())
		await expect(args.onViewportChange).toHaveBeenCalledOnce()
		await expect(slotIn(board, "board-zoom-level")).toHaveTextContent(
			level ?? "",
		)
	},
})

export const OpensFramedOnSpreadContentDark = meta.story({
	globals: { theme: "dark" },
	args: OpensFramedOnSpreadContent.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The spread board opening framed in the dark theme. Check the #161618 surface, then the same centring, margin, zoom and single placement as OpensFramedOnSpreadContent.",
			},
		},
	},
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await OpensFramedOnSpreadContent.input.play?.(context)
	},
})

export const OpensFramedThroughConsumerPadding = meta.story({
	tags: ["test-only"],
	args: { ...OpensFramedOnSpreadContent.input.args, className: "p-10" },
	parameters: {
		docs: {
			description: {
				story:
					"The spread board opened with a className that pads the canvas. Check the same fitted zoom, centring and dock clearance as OpensFramedOnSpreadContent: padding never moves the opening.",
			},
		},
	},
	play: async (context) => {
		await OpensFramedOnSpreadContent.input.play?.(context)
	},
})

export const OpensAtFullSizeOnTwoStickies = meta.story({
	args: { view: TWO_STICKIES_BOARD, viewport: null },
	parameters: {
		docs: {
			description: {
				story:
					"Two small stickies away from the origin, opened with no viewport placed. Check the board opening at 100% rather than magnified, the two stickies centred in the canvas, and the placed viewport sent once. Pick OpensAtFullSizeOnTwoStickiesDark for the dark theme.",
			},
		},
	},
	play: async ({ canvasElement, args }) => {
		await expectOpenedCentred(canvasElement, args, () => 1)
	},
})

export const OpensAtFullSizeOnTwoStickiesDark = meta.story({
	globals: { theme: "dark" },
	args: OpensAtFullSizeOnTwoStickies.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The two stickies opening at 100% in the dark theme. Check the #161618 surface, then the same centring and zoom as OpensAtFullSizeOnTwoStickies.",
			},
		},
	},
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await OpensAtFullSizeOnTwoStickies.input.play?.(context)
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

type HeldKeys = {
	altKey?: boolean
	ctrlKey?: boolean
}

const pointerAt = (
	type: string,
	target: EventTarget,
	at: { clientX: number; clientY: number },
	keys: HeldKeys = {},
) =>
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			isPrimary: true,
			pointerId: 1,
			...at,
			...keys,
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

const STRAIGHT_PATH = "M204.8 126.4 L315.2 273.6"
const ELBOW_PATH =
	"M208 120 L252 120 Q260 120 260 128 L260 272 Q260 280 268 280 L312 280"
const DRAWN_STRAIGHT_PATH = "M206.15 125.12 L337.85 234.88"
const DRAWN_ELBOW_PATH = "M208 120 L384 120 Q392 120 392 128 L392 232"
const DRAWN_ARROWHEAD_PATH = "M386 222 L392 232 L398 222"
const MOVED_STRAIGHT_PATH = "M205.35 125.95 L374.65 314.05"
const ANCHOR_SIZE = 10
const HOVER_OUTSET = 4
const HOVER_RADIUS = "7px"

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

const expectElbowChecked = (root: HTMLElement) =>
	expect(within(root).getByRole("radio", { name: "Elbow" })).toBeChecked()

const pickStraight = async (root: HTMLElement) => {
	const straight = within(root).getByRole("radio", { name: "Straight" })
	await userEvent.click(straight)
	await expect(straight).toBeChecked()
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

const ringOn = (root: HTMLElement, id: string) =>
	root.querySelector<HTMLElement>(
		`[data-slot="board-anchor-frame"][data-object-id="${id}"]`,
	)

const dragFromPlanOntoReview = async (root: HTMLElement) => {
	const source = await hoverPlanRightAnchor(root)
	pointerAt("pointerdown", source, centreOf(source))
	const at = centreOf(objectNode(root, "review") as HTMLElement)
	pointerAt("pointermove", document, at)
	await waitFor(() => expect(ringOn(root, "review")).not.toBeNull())
	return at
}

const expectHoverRing = async (root: HTMLElement, id: string) => {
	const object = (objectNode(root, id) as HTMLElement).getBoundingClientRect()
	const outline = slotIn(ringOn(root, id) as HTMLElement, "board-hover-outline")
	const outlineBox = outline.getBoundingClientRect()
	const outlineStyle = getComputedStyle(outline)
	await expect(outlineBox.x).toBeCloseTo(object.x - HOVER_OUTSET, 0)
	await expect(outlineBox.y).toBeCloseTo(object.y - HOVER_OUTSET, 0)
	await expect(outlineBox.width).toBeCloseTo(object.width + HOVER_OUTSET * 2, 0)
	await expect(outlineBox.height).toBeCloseTo(
		object.height + HOVER_OUTSET * 2,
		0,
	)
	await expect(outlineStyle.borderTopWidth).toBe("2px")
	await expect(outlineStyle.borderTopLeftRadius).toBe(HOVER_RADIUS)
	await expect(outlineStyle.borderTopColor).toBe(
		resolvedRootColor("--user-bubble"),
	)
}

const expectAnchorFrame = async (root: HTMLElement, id: string) => {
	await expectHoverRing(root, id)
	const object = (objectNode(root, id) as HTMLElement).getBoundingClientRect()
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
	await within(root).findByRole("radiogroup", { name: "Arrow type" })
}

const connectorDocs = (story: string) => ({
	docs: { description: { story } },
})

export const CreateConnector = meta.story({
	globals: LAPTOP_WINDOW,
	args: CONNECTOR_ARGS,
	parameters: connectorDocs(
		"Connector mode on, the flyout opens with Elbow checked. A drag from the right anchor of the sticky released on empty board sends nothing and leaves no line. With no pick in the flyout, a drag from the same anchor released over Review sends one set-arrow intent tied to the right side of the sticky and to the centre of Review, of the elbow kind, and the committed connector draws in the board shape border colour, 1.5 board units with round caps, rounded corners of 8 and the open chevron 8 off Review. Pick ConnectorBeingDrawn for the drag in progress.",
	),
	play: async ({ canvasElement, args }) => {
		await expectElbowChecked(canvasElement)
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

		const release = await dragFromPlanOntoReview(canvasElement)
		pointerAt("pointerup", document, release)
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "set-arrow",
			arrow: {
				id: expect.any(String),
				kind: "connector",
				from: "plan",
				fromSide: "right",
				to: "review",
				routing: "elbow",
				zOrder: 0,
				text: "",
			},
		})
		await expect(slotsIn(canvasElement, "board-connector-draft")).toHaveLength(
			0,
		)
		await expect(connectorPaths(canvasElement, "board-connector")).toEqual([
			DRAWN_ELBOW_PATH,
		])
		const line = slotIn(canvasElement, "board-connector")
		const look = getComputedStyle(line)
		await expect(look.stroke).toBe(resolvedRootColor("--board-shape-border"))
		await expect(look.strokeWidth).toBe("1.5px")
		await expect(look.strokeLinecap).toBe("round")
		await expect(look.strokeLinejoin).toBe("round")
		await expect(
			slotIn(line, "board-connector-arrowhead").getAttribute("d"),
		).toBe(DRAWN_ARROWHEAD_PATH)
	},
})

export const CreateConnectorDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CONNECTOR_ARGS,
	parameters: connectorDocs(
		"CreateConnector in the dark theme: the same two drags and the same single set-arrow intent.",
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
		"An elbow connector being drawn. Check the hover ring 4px outside the hovered sticky, 2px in the Space colour with 7px corners, its four 10px anchors centred on the middle of each side on the board surface with a 2px Space-colour ring, the anchor under the pointer filled in the Space colour with a 3px ring at 25%. Over Review the target wears the same ring with no anchors, and the line runs in the Space colour from a dot of radius 4 on the source anchor to the open chevron 8 off Review, aimed at its centre, Elbow checked in the flyout from the start. Pick CreateConnector for the release.",
	),
	play: async ({ canvasElement, args }) => {
		await expectElbowChecked(canvasElement)
		await hoverPlanRightAnchor(canvasElement)
		await expectAnchorFrame(canvasElement, "plan")

		const active = anchorOn(canvasElement, "plan", "right") as HTMLElement
		pointerAt("pointerover", active, centreOf(active))
		await waitFor(() => expect(active).toHaveAttribute("data-active", "true"))
		await expect(getComputedStyle(active).boxShadow).toMatch(/\b3px\b/)

		await dragFromPlanOntoReview(canvasElement)
		await expectHoverRing(canvasElement, "review")
		await expect(slotsIn(canvasElement, "board-anchor-frame")).toHaveLength(1)
		await expect(slotsIn(canvasElement, "board-anchor")).toHaveLength(0)

		await expect(
			connectorPaths(canvasElement, "board-connector-draft"),
		).toEqual([DRAWN_ELBOW_PATH])
		const draft = slotIn(canvasElement, "board-connector-draft")
		await expect(getComputedStyle(draft).stroke).toBe(
			resolvedRootColor("--user-bubble"),
		)
		await expect(getComputedStyle(draft).strokeWidth).toBe("1.5px")
		const dot = slotIn(canvasElement, "board-connector-source")
		await expect(
			["cx", "cy", "r"].map((name) => dot.getAttribute(name)),
		).toEqual(["200", "120", "4"])
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

export const CreateStraightConnector = meta.story({
	globals: LAPTOP_WINDOW,
	args: CONNECTOR_ARGS,
	parameters: connectorDocs(
		"Connector mode on, Straight picked in the flyout before drawing: a drag from the right anchor of the sticky released over Review sends one set-arrow intent of the straight kind, and the committed connector runs as one straight line to the open chevron 8 off Review. Pick CreateConnector for the Elbow default.",
	),
	play: async ({ canvasElement, args }) => {
		await pickStraight(canvasElement)
		const release = await dragFromPlanOntoReview(canvasElement)
		pointerAt("pointerup", document, release)
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "set-arrow",
			arrow: expect.objectContaining({
				from: "plan",
				to: "review",
				routing: "straight",
			}),
		})
		await expect(connectorPaths(canvasElement, "board-connector")).toEqual([
			DRAWN_STRAIGHT_PATH,
		])
	},
})

export const CreateStraightConnectorDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CONNECTOR_ARGS,
	parameters: connectorDocs(
		"CreateStraightConnector in the dark theme: the same pick, drag and single set-arrow intent.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await CreateStraightConnector.input.play?.(context)
	},
})

export const SwitchConnectorRouting = meta.story({
	globals: LAPTOP_WINDOW,
	args: CONNECTED_ARGS,
	parameters: connectorDocs(
		"A press on a straight connector selects it, draws it in the Space colour and opens the flyout on Straight. Elbow there sends one set-arrow intent carrying the whole arrow with its new kind and the connector redraws as an elbow, the left arrow key on the focused radio switches it back. The connector itself never takes focus and stays hidden from assistive technology: the flyout is the only way in.",
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
			type: "set-arrow",
			arrow: { ...PLAN_TO_REVIEW, routing: "elbow" },
		})
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector")).toEqual([
				ELBOW_PATH,
			]),
		)
		await expect(elbow).toBeChecked()

		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "set-arrow",
			arrow: { ...PLAN_TO_REVIEW, routing: "straight" },
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
			MOVED_STRAIGHT_PATH,
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
			MOVED_STRAIGHT_PATH,
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
		"Escape while a connector is being drawn drops the line and the ring, and the release that follows over Review sends nothing. Pick CreateConnector for a drag that lands.",
	),
	play: async ({ canvasElement, args }) => {
		const release = await dragFromPlanOntoReview(canvasElement)
		await expect(slotsIn(canvasElement, "board-connector-draft")).toHaveLength(
			1,
		)
		await userEvent.keyboard("{Escape}")
		await waitFor(() =>
			expect(slotsIn(canvasElement, "board-connector-draft")).toHaveLength(0),
		)
		await expect(ringOn(canvasElement, "review")).toBeNull()
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

const AT_BOARD_ORIGIN: BoardViewport = { offset: { x: 0, y: 0 }, zoom: 1 }

const itemAt = (
	id: string,
	kind: BoardItem["kind"],
	text: string,
	rect: BoardRect,
	zOrder: number,
): BoardItem => ({
	id,
	kind,
	position: { x: rect.x, y: rect.y },
	size: { width: rect.width, height: rect.height },
	zOrder,
	text,
})

const arrowBetween = (
	id: string,
	from: string,
	to: string,
	more: Partial<BoardConnector> = {},
): BoardConnector => ({
	id,
	kind: "connector",
	from,
	to,
	routing: "straight",
	zOrder: 0,
	text: "",
	...more,
})

const shapeOf = (id: string, text: string, x: number, y: number) =>
	itemAt(id, "shape", text, { x, y, width: 160, height: 120 }, 1)

const BRIEF = shapeOf("brief", "Brief", 80, 126)
const DRAFT = shapeOf("draft", "Draft", 400, 126)
const LAUNCH = shapeOf("launch", "Launch", 720, 126)
const BRIEF_TO_DRAFT = "brief-to-draft"

const ArrowBoardObject = ({ object }: PlaceholderObjectProps) =>
	object.kind === "section" ? (
		<BoardSection
			height={object.size.height}
			tint="blue"
			title={object.text}
			width={object.size.width}
		/>
	) : (
		<BoardObjectView object={object} />
	)

const arrowArgs = (objects: readonly BoardObject[]) => ({
	view: { objects },
	viewport: AT_BOARD_ORIGIN,
	renderObject: (object: BoardItem) => <ArrowBoardObject object={object} />,
})

const arrowLine = (root: HTMLElement, id: string) => {
	const hits = Array.from(
		root.querySelectorAll(
			'[data-slot="board-connector-hits"] [data-connector-id]',
		),
	)
	const index = hits.findIndex(
		(hit) => hit.getAttribute("data-connector-id") === id,
	)
	return slotsIn(root, "board-connector")[index]
}

const pathOf = (line: Element, slot: string) =>
	line.querySelector(`[data-slot="${slot}"]`)?.getAttribute("d")

const selectArrow = async (root: HTMLElement, id: string) => {
	const hit = root.querySelector(
		`[data-slot="board-connector-hits"] [data-connector-id="${id}"]`,
	) as SVGPathElement
	pointerAt("pointerdown", hit, centreOf(hit))
	await within(root).findByRole("radiogroup", { name: "Arrow type" })
}

const expectArrowAtRest = async (line: Element) => {
	const look = getComputedStyle(line)
	await expect(look.stroke).toBe(resolvedRootColor("--board-shape-border"))
	await expect(look.strokeWidth).toBe("1.5px")
	await expect(look.strokeLinecap).toBe("round")
	await expect(look.strokeLinejoin).toBe("round")
	await expect(line.querySelectorAll("circle")).toHaveLength(0)
	await expect(
		slotsIn(line as HTMLElement, "board-connector-halo"),
	).toHaveLength(0)
}

const attributesOf = (element: Element, names: readonly string[]) =>
	names.map((name) => Number(element.getAttribute(name)))

const expectArrowSelected = async (
	line: Element,
	ends: readonly BoardPoint[],
	middle: BoardPoint,
) => {
	await expect(getComputedStyle(line).stroke).toBe(
		resolvedRootColor("--user-bubble"),
	)
	const halo = getComputedStyle(
		slotIn(line as HTMLElement, "board-connector-halo"),
	)
	await expect(halo.stroke).toBe(resolvedRootColor("--board-surface"))
	await expect(halo.strokeWidth).toBe("4.5px")
	const handles = slotsIn(line as HTMLElement, "board-connector-end-handle")
	await expect(
		handles.map((handle) => attributesOf(handle, ["cx", "cy", "r"])),
	).toEqual(ends.map(({ x, y }) => [x, y, 4]))
	for (const handle of handles) {
		const look = getComputedStyle(handle)
		await expect(look.fill).toBe(resolvedRootColor("--board-surface"))
		await expect(look.stroke).toBe(resolvedRootColor("--user-bubble"))
		await expect(look.strokeWidth).toBe("1.5px")
	}
	const handle = slotIn(line as HTMLElement, "board-connector-middle-handle")
	await expect(attributesOf(handle, ["cx", "cy", "r"])).toEqual([
		middle.x,
		middle.y,
		5.5,
	])
	await expect(getComputedStyle(handle).fill).toBe(
		resolvedRootColor("--user-bubble"),
	)
}

const arrowDocs = (story: string) => ({
	docs: { description: { story } },
})

const ARTBOARD_NOTE =
	"The Dark story sits side by side with its artboard of the Paper file Kiroshi, Board arrows."

export const ArrowQuickRelease = meta.story({
	args: arrowArgs([
		BRIEF,
		DRAFT,
		arrowBetween(BRIEF_TO_DRAFT, "brief", "draft"),
	]),
	parameters: arrowDocs(
		`Board arrows 1.2 Quick release: an arrow bound to the centres of two shapes stops 8 before each outline, from 248 to 392 on 186, in the board shape border colour at 1.5 with round caps and joins, ending on the medium open chevron, 10 long and 6 to each side. ${ARTBOARD_NOTE}`,
	),
	play: async ({ canvasElement }) => {
		const line = arrowLine(canvasElement, BRIEF_TO_DRAFT)
		await expect(pathOf(line, "board-connector-path")).toBe("M248 186 L392 186")
		await expect(pathOf(line, "board-connector-arrowhead")).toBe(
			"M382 192 L392 186 L382 180",
		)
		await expectArrowAtRest(line)
	},
})

export const ArrowQuickReleaseDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowQuickRelease.input.args,
	parameters: arrowDocs(
		"ArrowQuickRelease in the dark theme, the line #E5E5E5 on the #161618 board as the artboard draws it.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowQuickRelease.input.play?.(context)
	},
})

export const ArrowExactPoint = meta.story({
	args: arrowArgs([
		BRIEF,
		DRAFT,
		arrowBetween(BRIEF_TO_DRAFT, "brief", "draft", {
			toAnchor: { x: 0.25, y: 0.5 },
		}),
	]),
	parameters: arrowDocs(
		`Board arrows 1.3 Exact point, selected: the end bound to an exact point of Draft reaches it with no gap, the line and the head tip both on 440, 186. Selected, the line wears the Space colour over a 4.5 halo in the board colour, both ends carry a handle of radius 4 in the board colour ringed 1.5 in the Space colour, and the middle carries a handle of radius 5.5 filled in the Space colour. ${ARTBOARD_NOTE}`,
	),
	play: async ({ canvasElement }) => {
		const line = arrowLine(canvasElement, BRIEF_TO_DRAFT)
		await expect(pathOf(line, "board-connector-path")).toBe("M248 186 L440 186")
		await expect(pathOf(line, "board-connector-arrowhead")).toBe(
			"M430 192 L440 186 L430 180",
		)
		await selectArrow(canvasElement, BRIEF_TO_DRAFT)
		await expectArrowSelected(
			arrowLine(canvasElement, BRIEF_TO_DRAFT),
			[
				{ x: 248, y: 186 },
				{ x: 440, y: 186 },
			],
			{ x: 344, y: 186 },
		)
	},
})

export const ArrowExactPointDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowExactPoint.input.args,
	parameters: arrowDocs(
		"ArrowExactPoint in the dark theme, selected as the artboard draws it.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowExactPoint.input.play?.(context)
	},
})

export const ArrowCurve = meta.story({
	args: arrowArgs([
		BRIEF,
		DRAFT,
		arrowBetween(BRIEF_TO_DRAFT, "brief", "draft", { bend: 66 }),
	]),
	parameters: arrowDocs(
		`Board arrows 2.1 Curve, selected: a bend of 66 turns the straight arrow into a quadratic from 248, 186 to 392, 186 through the control point 320, 54, so its midpoint 320, 120 sits 66 off the chord and carries the middle handle. The head follows the tangent at the tip. ${ARTBOARD_NOTE}`,
	),
	play: async ({ canvasElement }) => {
		const line = arrowLine(canvasElement, BRIEF_TO_DRAFT)
		await expect(pathOf(line, "board-connector-path")).toBe(
			"M248 186 Q320 54 392 186",
		)
		await selectArrow(canvasElement, BRIEF_TO_DRAFT)
		await expectArrowSelected(
			arrowLine(canvasElement, BRIEF_TO_DRAFT),
			[
				{ x: 248, y: 186 },
				{ x: 392, y: 186 },
			],
			{ x: 320, y: 120 },
		)
	},
})

export const ArrowCurveDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowCurve.input.args,
	parameters: arrowDocs(
		"ArrowCurve in the dark theme, selected as the artboard draws it.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowCurve.input.play?.(context)
	},
})

export const ArrowElbow = meta.story({
	args: arrowArgs([
		BRIEF,
		DRAFT,
		LAUNCH,
		arrowBetween("brief-to-launch", "brief", "launch", { routing: "elbow" }),
	]),
	parameters: arrowDocs(
		`Board arrows 2.2 Elbow: an elbow arrow from Brief to Launch leaves and enters through the middle of the top sides 8 off the outline, and runs 48 above Draft, the shape in its way, with axis-aligned segments and corners of radius 8. ${ARTBOARD_NOTE}`,
	),
	play: async ({ canvasElement }) => {
		const line = arrowLine(canvasElement, "brief-to-launch")
		await expect(pathOf(line, "board-connector-path")).toBe(
			"M160 118 L160 86 Q160 78 168 78 L792 78 Q800 78 800 86 L800 118",
		)
		await expect(pathOf(line, "board-connector-arrowhead")).toBe(
			"M794 108 L800 118 L806 108",
		)
		await expectArrowAtRest(line)
	},
})

export const ArrowElbowDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowElbow.input.args,
	parameters: arrowDocs("ArrowElbow in the dark theme."),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowElbow.input.play?.(context)
	},
})

const expectLabelCentredOn = async (
	root: HTMLElement,
	label: HTMLElement,
	at: BoardPoint,
) => {
	const box = label.getBoundingClientRect()
	const origin = boardAt(root, 0, 0)
	await expect(box.x + box.width / 2 - origin.clientX).toBeCloseTo(at.x, 0)
	await expect(box.y + box.height / 2 - origin.clientY).toBeCloseTo(at.y, 0)
}

export const ArrowLabel = meta.story({
	args: arrowArgs([
		BRIEF,
		DRAFT,
		arrowBetween(BRIEF_TO_DRAFT, "brief", "draft", { text: "Hands over" }),
	]),
	parameters: arrowDocs(
		`Board arrows 4.1 Label: the label sits on a chip centred on the arrow at its label position, the middle when none is set, with 4 of padding, corners of 4 and the board colour behind it, its text 13 over 16 at weight 500 in the board foreground. Selected, the chip takes a 1.5 ring in the Space colour. ${ARTBOARD_NOTE}`,
	),
	play: async ({ canvasElement }) => {
		const label = slotIn(canvasElement, "board-connector-label")
		await expect(label).toHaveTextContent("Hands over")
		await expectLabelCentredOn(canvasElement, label, { x: 320, y: 186 })
		const look = getComputedStyle(label)
		await expect(look.padding).toBe("4px")
		await expect(look.borderTopLeftRadius).toBe("4px")
		await expect(look.backgroundColor).toBe(
			resolvedRootColor("--board-surface"),
		)
		await expect([look.fontSize, look.lineHeight, look.fontWeight]).toEqual([
			"13px",
			"16px",
			"500",
		])
		await expect(look.color).toBe(resolvedRootColor("--board-foreground"))
		await expect(look.boxShadow).toBe("none")

		await selectArrow(canvasElement, BRIEF_TO_DRAFT)
		const ring = getComputedStyle(label).boxShadow
		await expect(ring).toMatch(/\b1\.5px\b/)
		await expect(ring).toContain(resolvedRootColor("--user-bubble"))
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(getComputedStyle(label).boxShadow).toBe("none"))
	},
})

export const ArrowLabelDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowLabel.input.args,
	parameters: arrowDocs(
		"ArrowLabel in the dark theme, the text #EDEDED on the #161618 chip as the artboard draws it.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowLabel.input.play?.(context)
	},
})

const HEAD_SIZES = ["small", "medium", "large"] as const
const HEAD_ROW_PITCH = 160

const HEAD_SIZE_BOARD = HEAD_SIZES.flatMap((headSize, row) => [
	shapeOf(`${headSize}-from`, "From", 80, 46 + row * HEAD_ROW_PITCH),
	shapeOf(`${headSize}-to`, "To", 400, 46 + row * HEAD_ROW_PITCH),
	arrowBetween(headSize, `${headSize}-from`, `${headSize}-to`, { headSize }),
])

const HEAD_PATHS = {
	small: "M385 110 L392 106 L385 102",
	medium: "M382 272 L392 266 L382 260",
	large: "M378 434 L392 426 L378 418",
}

export const ArrowHeadSizes = meta.story({
	args: arrowArgs(HEAD_SIZE_BOARD),
	parameters: arrowDocs(
		`Board arrows 5.1 Three head sizes: the same open chevron at the stroke of the line, small 7 long and 4 to each side, medium 10 by 6, the size of an arrow with none set, and large 14 by 8. ${ARTBOARD_NOTE}`,
	),
	play: async ({ canvasElement }) => {
		for (const headSize of HEAD_SIZES)
			await expect(
				pathOf(arrowLine(canvasElement, headSize), "board-connector-arrowhead"),
			).toBe(HEAD_PATHS[headSize])
	},
})

export const ArrowHeadSizesDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowHeadSizes.input.args,
	parameters: arrowDocs("ArrowHeadSizes in the dark theme."),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowHeadSizes.input.play?.(context)
	},
})

const stickyOf = (id: string, text: string, x: number, y: number) =>
	itemAt(id, "sticky", text, { x, y, width: 160, height: 160 }, 1)

const frameOf = (id: string, text: string, rect: BoardRect) =>
	itemAt(id, "section", text, rect, 0)

const AFTER_BOARD: readonly BoardObject[] = [
	frameOf("desktop", "Application de bureau", {
		x: 40,
		y: 80,
		width: 608,
		height: 232,
	}),
	frameOf("sidecar", "Sidecar", { x: 40, y: 400, width: 408, height: 232 }),
	frameOf("cloud", "Cloud", { x: 720, y: 80, width: 408, height: 232 }),
	stickyOf("interface-react", "Interface React", 64, 128),
	stickyOf("host-rust", "Hôte Rust", 264, 128),
	stickyOf("local-storage", "Stockage local", 464, 128),
	stickyOf("relay", "Relais", 744, 128),
	stickyOf("iphone-app", "App iPhone", 944, 128),
	stickyOf("agent-sdk", "Agent SDK", 64, 448),
	stickyOf("bot-plugin", "Plugin du bot", 264, 448),
	arrowBetween("react-to-host", "interface-react", "host-rust"),
	arrowBetween("host-to-storage", "host-rust", "local-storage"),
	arrowBetween("relay-to-iphone", "relay", "iphone-app"),
	arrowBetween("agent-to-plugin", "agent-sdk", "bot-plugin"),
	arrowBetween("host-to-agent", "host-rust", "agent-sdk", { routing: "elbow" }),
	arrowBetween("host-to-relay", "host-rust", "relay", { routing: "elbow" }),
]

const AFTER_BOARD_PATHS = {
	"react-to-host": "M232 208 L256 208",
	"host-to-storage": "M432 208 L456 208",
	"relay-to-iphone": "M912 208 L936 208",
	"agent-to-plugin": "M232 528 L256 528",
	"host-to-agent":
		"M344 296 L344 360 Q344 368 336 368 L152 368 Q144 368 144 376 L144 440",
	"host-to-relay":
		"M344 120 L344 64 Q344 56 352 56 L816 56 Q824 56 824 64 L824 120",
}

const AFTER_BOARD_ITEM_IDS = AFTER_BOARD.flatMap((object) =>
	object.kind === "connector" ? [] : [object.id],
)

const PATH_SAMPLES = 240

const isStrictlyInside = (point: DOMPoint, box: DOMRect) =>
	box.left < point.x &&
	point.x < box.right &&
	box.top < point.y &&
	point.y < box.bottom

const textBoxesOf = (root: HTMLElement) =>
	Array.from(
		root.querySelectorAll(
			'[data-board-text], [data-slot="board-sticky"], [data-slot="board-section-title"]',
		),
	).map((box) => box.getBoundingClientRect())

const clientPointsOf = (path: SVGPathElement) => {
	const matrix = path.getScreenCTM() as DOMMatrix
	const length = path.getTotalLength()
	return Array.from({ length: PATH_SAMPLES + 1 }, (_, step) => {
		const { x, y } = path.getPointAtLength((length * step) / PATH_SAMPLES)
		return new DOMPoint(x, y).matrixTransform(matrix)
	})
}

export const ArrowsAfterBoard = meta.story({
	globals: LAPTOP_WINDOW,
	args: arrowArgs(AFTER_BOARD),
	parameters: arrowDocs(
		`Board arrows, the After board of the Before / after page: three frames, Application de bureau, Sidecar and Cloud, seven stickies and six arrows. The four straight arrows join neighbours 8 off each outline, Hôte Rust to Agent SDK runs its elbow on the lane midway between the two rows, and Hôte Rust to Relais goes over the top, 24 above the frames, since its bottom side already leads to Agent SDK. No arrow crosses a sticky or a frame title. ${ARTBOARD_NOTE}`,
	),
	play: async ({ canvasElement }) => {
		for (const [id, path] of Object.entries(AFTER_BOARD_PATHS))
			await expect(
				pathOf(arrowLine(canvasElement, id), "board-connector-path"),
			).toBe(path)
		await expect(
			slotsIn(canvasElement, "board-object").map(
				(object) => object.dataset.objectId,
			),
		).toEqual(AFTER_BOARD_ITEM_IDS)
		await expect(
			within(canvasElement)
				.getAllByRole("option")
				.map((option) => option.textContent),
		).toEqual(
			AFTER_BOARD_ITEM_IDS.map((id) =>
				expect.stringContaining(
					(AFTER_BOARD.find((object) => object.id === id) as BoardItem).text,
				),
			),
		)
		const boxes = textBoxesOf(canvasElement)
		await expect(boxes).toHaveLength(17)
		const paths = canvasElement.querySelectorAll<SVGPathElement>(
			'[data-slot="board-connector"] [data-slot="board-connector-path"]',
		)
		await expect(paths).toHaveLength(6)
		for (const path of paths)
			for (const point of clientPointsOf(path))
				await expect(boxes.some((box) => isStrictlyInside(point, box))).toBe(
					false,
				)
	},
})

export const ArrowsAfterBoardDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: ArrowsAfterBoard.input.args,
	parameters: arrowDocs("ArrowsAfterBoard in the dark theme."),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowsAfterBoard.input.play?.(context)
	},
})

const LOOSE_POINT = { x: 480, y: 426 }

export const ArrowLooseEnd = meta.story({
	args: arrowArgs([
		BRIEF,
		arrowBetween("brief-to-point", "brief", "", { toPoint: LOOSE_POINT }),
	]),
	parameters: arrowDocs(
		"An arrow whose to end is a board point with no object, as a deleted shape leaves it: the line leaves Brief 8 off its outline and ends on the point itself with no gap, the head tip on it.",
	),
	play: async ({ canvasElement }) => {
		const line = arrowLine(canvasElement, "brief-to-point")
		await expect(pathOf(line, "board-connector-path")).toBe(
			"M246.4 250.8 L480 426",
		)
		await expect(pathOf(line, "board-connector-arrowhead")).toBe(
			"M468.4 424.8 L480 426 L475.6 415.2",
		)
		await expectArrowAtRest(line)
	},
})

export const ArrowLooseEndDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowLooseEnd.input.args,
	parameters: arrowDocs("ArrowLooseEnd in the dark theme."),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowLooseEnd.input.play?.(context)
	},
})

export const ArrowCrossingShape = meta.story({
	args: arrowArgs([
		BRIEF,
		DRAFT,
		LAUNCH,
		arrowBetween("brief-to-launch", "brief", "launch"),
	]),
	parameters: arrowDocs(
		"A straight arrow from Brief to Launch across Draft, a shape that is neither of its ends: the line passes behind Draft, so Draft and its label stay painted above it, while both ends keep their 8 gap.",
	),
	play: async ({ canvasElement }) => {
		const line = arrowLine(canvasElement, "brief-to-launch")
		await expect(pathOf(line, "board-connector-path")).toBe("M248 186 L712 186")
		const holes = slotsIn(line as HTMLElement, "board-connector-mask-hole")
		await expect(
			holes.map((hole) => attributesOf(hole, ["x", "y", "width", "height"])),
		).toEqual([[400, 126, 160, 120]])
		const mask = slotIn(line as HTMLElement, "board-connector-mask")
		const masked = (
			line.querySelector('[data-slot="board-connector-path"]') as SVGElement
		).parentElement as Element
		await expect(masked.getAttribute("mask")).toBe(`url(#${mask.id})`)
		await expectArrowAtRest(line)
	},
})

export const ArrowCrossingShapeDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowCrossingShape.input.args,
	parameters: arrowDocs("ArrowCrossingShape in the dark theme."),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowCrossingShape.input.play?.(context)
	},
})

const handShapeOf = (id: string, text: string, x: number, y: number) =>
	itemAt(id, "shape", text, { x, y, width: 160, height: 160 }, 1)

const START = handShapeOf("start", "Start", 80, 120)
const FINISH = handShapeOf("finish", "Finish", 400, 120)
const START_TO_FINISH = "start-to-finish"
const TIED_ARROW = arrowBetween(START_TO_FINISH, "start", "finish")
const LABELLED_ARROW = arrowBetween(START_TO_FINISH, "start", "finish", {
	text: "Hands over",
})
const CENTRE_PATH = "M248 200 L392 200"
const EXACT_POINT_PATH = "M247.84 201.57 L440 240"
const INSIDE_FINISH = { x: 440, y: 240 }
const OVER_FINISH = { x: 470, y: 230 }
const EXACT_POINT_WAIT = { timeout: 2000 }

const drawingArgs = {
	...arrowArgs([START, FINISH]),
	isConnecting: true,
}

const handDocs = (story: string) =>
	arrowDocs(
		`${story} The Dark story sits side by side with its artboard of the Paper page Arrow behaviour.`,
	)

const atBoard = (root: HTMLElement, { x, y }: BoardPoint) => boardAt(root, x, y)

const pressStartRightAnchor = async (root: HTMLElement) => {
	hoverObject(root, "start")
	const anchor = await waitFor(() => {
		const found = anchorOn(root, "start", "right")
		expect(found).not.toBeNull()
		return found as HTMLElement
	})
	pointerAt("pointerdown", anchor, centreOf(anchor))
}

const draftLine = (root: HTMLElement) => slotIn(root, "board-connector-draft")

const expectHalo = async (line: HTMLElement) => {
	const halo = getComputedStyle(slotIn(line, "board-connector-halo"))
	await expect(halo.stroke).toBe(resolvedRootColor("--board-surface"))
	await expect(halo.strokeWidth).toBe("4.5px")
}

const expectExactPointMarker = async (root: HTMLElement, at: BoardPoint) => {
	const marker = slotIn(root, "board-connector-exact-point")
	const [ring, dot] = Array.from(marker.querySelectorAll("circle"))
	const colour = resolvedRootColor("--board-arrow-marker")
	await expect(attributesOf(ring, ["cx", "cy", "r"])).toEqual([at.x, at.y, 9])
	await expect(getComputedStyle(ring).stroke).toBe(colour)
	await expect(getComputedStyle(ring).strokeWidth).toBe("2px")
	await expect(getComputedStyle(ring).fill).toBe("none")
	await expect(attributesOf(dot, ["cx", "cy", "r"])).toEqual([at.x, at.y, 3])
	await expect(getComputedStyle(dot).fill).toBe(colour)
}

const drawnArrow = (more: Partial<BoardConnector>) => ({
	type: "set-arrow",
	arrow: {
		id: expect.any(String),
		kind: "connector",
		from: "start",
		fromSide: "right",
		to: "finish",
		routing: "straight",
		zOrder: 0,
		text: "",
		...more,
	},
})

export const ArrowAimedAtShape = meta.story({
	args: drawingArgs,
	parameters: handDocs(
		"Arrow behaviour 1.1 Hover target: with the Arrow tool on, a shape under the pointer wears a ring 2 wide, 4 outside its outline with corners of 7, in the Space colour. Drawn from the right anchor of Start and held over Finish, the draft arrow in the Space colour aims at the centre of Finish and stops 8 before its outline, with no halo and no marker, and nothing is sent yet.",
	),
	play: async ({ canvasElement, args }) => {
		hoverObject(canvasElement, "finish")
		await waitFor(() => expect(ringOn(canvasElement, "finish")).not.toBeNull())
		await expectHoverRing(canvasElement, "finish")

		await pressStartRightAnchor(canvasElement)
		pointerAt("pointermove", document, atBoard(canvasElement, OVER_FINISH))
		await waitFor(() => expect(ringOn(canvasElement, "finish")).not.toBeNull())
		await expectHoverRing(canvasElement, "finish")
		await expect(slotsIn(canvasElement, "board-anchor")).toHaveLength(0)
		await expect(
			connectorPaths(canvasElement, "board-connector-draft"),
		).toEqual([CENTRE_PATH])
		const draft = draftLine(canvasElement)
		await expect(getComputedStyle(draft).stroke).toBe(
			resolvedRootColor("--user-bubble"),
		)
		await expect(slotsIn(draft, "board-connector-halo")).toHaveLength(0)
		await expect(
			slotsIn(canvasElement, "board-connector-exact-point"),
		).toHaveLength(0)
		await expect(args.onIntent).not.toHaveBeenCalled()
		await userEvent.keyboard("{Escape}")
	},
})

export const ArrowAimedAtShapeDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowAimedAtShape.input.args,
	parameters: arrowDocs(
		"ArrowAimedAtShape in the dark theme, the ring and the draft in #88BAFF.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowAimedAtShape.input.play?.(context)
	},
})

export const ArrowReleasedOnCentre = meta.story({
	args: drawingArgs,
	parameters: handDocs(
		"Arrow behaviour 1.2 Quick release: released over Finish right after reaching it, the end ties to the centre of Finish. One set-arrow intent goes out with the end on Finish and no side, anchor or point, and the committed arrow rests in the board shape border colour, 8 before the outline of Finish on the line between the two centres. Straight is picked in the flyout first, as the artboard draws it.",
	),
	play: async ({ canvasElement, args }) => {
		await pickStraight(canvasElement)
		await pressStartRightAnchor(canvasElement)
		const over = atBoard(canvasElement, OVER_FINISH)
		pointerAt("pointermove", document, over)
		pointerAt("pointerup", document, over)
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith(drawnArrow({}))
		await expect(slotsIn(canvasElement, "board-connector-draft")).toHaveLength(
			0,
		)
		const line = slotIn(canvasElement, "board-connector")
		await expect(pathOf(line, "board-connector-path")).toBe(CENTRE_PATH)
		await expectArrowAtRest(line)
	},
})

export const ArrowReleasedOnCentreDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowReleasedOnCentre.input.args,
	parameters: arrowDocs(
		"ArrowReleasedOnCentre in the dark theme, the committed arrow #E5E5E5.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowReleasedOnCentre.input.play?.(context)
	},
})

export const ArrowHeldOnExactPoint = meta.story({
	args: drawingArgs,
	parameters: handDocs(
		"Arrow behaviour 1.3 Exact point: the pointer resting still over Finish for half a second ties the end to the point under it. The ring stays, the draft reaches the point with no gap over a 4.5 halo in the board colour, and the point carries the marker, a ring of radius 9 stroked 2 around a dot of radius 3, in the darker step of the Space colour. The release sends one set-arrow intent with the point as an anchor of Finish. Straight is picked in the flyout first, as the artboard draws it.",
	),
	play: async ({ canvasElement, args }) => {
		await pickStraight(canvasElement)
		await pressStartRightAnchor(canvasElement)
		const inside = atBoard(canvasElement, INSIDE_FINISH)
		pointerAt("pointermove", document, inside)
		await waitFor(
			() =>
				expect(
					slotsIn(canvasElement, "board-connector-exact-point"),
				).toHaveLength(1),
			EXACT_POINT_WAIT,
		)
		await expectExactPointMarker(canvasElement, INSIDE_FINISH)
		await expect(ringOn(canvasElement, "finish")).not.toBeNull()
		await expect(
			connectorPaths(canvasElement, "board-connector-draft"),
		).toEqual([EXACT_POINT_PATH])
		await expectHalo(draftLine(canvasElement))

		pointerAt("pointerup", document, inside)
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith(
			drawnArrow({ toAnchor: { x: 0.25, y: 0.75 } }),
		)
		await expect(
			pathOf(slotIn(canvasElement, "board-connector"), "board-connector-path"),
		).toBe(EXACT_POINT_PATH)
		await expect(
			slotsIn(canvasElement, "board-connector-exact-point"),
		).toHaveLength(0)
	},
})

export const ArrowHeldOnExactPointDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowHeldOnExactPoint.input.args,
	parameters: arrowDocs(
		"ArrowHeldOnExactPoint in the dark theme, the marker #2D62AC under the #88BAFF draft.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowHeldOnExactPoint.input.play?.(context)
	},
})

export const ArrowDrawnWithAlt = meta.story({
	args: drawingArgs,
	parameters: handDocs(
		"Arrow behaviour 1.4 Alt held: while Alt is held the end sits exactly at the cursor inside Finish, still tied to it. The ring stays, the draft reaches the cursor over its halo and no marker shows, even with the pointer still. Alt pressed or let go without moving the pointer moves the end at once, and the release sends one set-arrow intent with the cursor as an anchor of Finish. Straight is picked in the flyout first, as the artboard draws it.",
	),
	play: async ({ canvasElement, args }) => {
		await pickStraight(canvasElement)
		await pressStartRightAnchor(canvasElement)
		const inside = atBoard(canvasElement, INSIDE_FINISH)
		pointerAt("pointermove", document, inside)
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector-draft")).toEqual([
				CENTRE_PATH,
			]),
		)
		await userEvent.keyboard("{Alt>}")
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector-draft")).toEqual([
				EXACT_POINT_PATH,
			]),
		)
		await expect(ringOn(canvasElement, "finish")).not.toBeNull()
		await expectHalo(draftLine(canvasElement))
		pointerAt("pointermove", document, inside, { altKey: true })
		await new Promise((resolve) =>
			setTimeout(resolve, EXACT_POINT_WAIT.timeout / 2),
		)
		await expect(
			slotsIn(canvasElement, "board-connector-exact-point"),
		).toHaveLength(0)

		pointerAt("pointerup", document, inside, { altKey: true })
		await userEvent.keyboard("{/Alt}")
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith(
			drawnArrow({ toAnchor: { x: 0.25, y: 0.75 } }),
		)
		await expect(
			pathOf(slotIn(canvasElement, "board-connector"), "board-connector-path"),
		).toBe(EXACT_POINT_PATH)
	},
})

export const ArrowDrawnWithAltDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowDrawnWithAlt.input.args,
	parameters: arrowDocs("ArrowDrawnWithAlt in the dark theme."),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowDrawnWithAlt.input.play?.(context)
	},
})

export const ArrowDrawnWithCtrl = meta.story({
	args: drawingArgs,
	parameters: handDocs(
		"Arrow behaviour 1.5 Ctrl held: while Ctrl is held no shape takes the end. Finish loses its ring, the draft reaches the cursor over its halo with no marker, and the release sends one set-arrow intent with the end left untied on the board point under the cursor. Straight is picked in the flyout first, as the artboard draws it.",
	),
	play: async ({ canvasElement, args }) => {
		await pickStraight(canvasElement)
		await pressStartRightAnchor(canvasElement)
		const inside = atBoard(canvasElement, INSIDE_FINISH)
		pointerAt("pointermove", document, inside, { ctrlKey: true })
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector-draft")).toEqual([
				EXACT_POINT_PATH,
			]),
		)
		await expect(slotsIn(canvasElement, "board-anchor-frame")).toHaveLength(0)
		await expectHalo(draftLine(canvasElement))
		await expect(
			slotsIn(canvasElement, "board-connector-exact-point"),
		).toHaveLength(0)

		pointerAt("pointerup", document, inside, { ctrlKey: true })
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith(
			drawnArrow({ to: "", toPoint: INSIDE_FINISH }),
		)
		await expect(
			pathOf(slotIn(canvasElement, "board-connector"), "board-connector-path"),
		).toBe(EXACT_POINT_PATH)
	},
})

export const ArrowDrawnWithCtrlDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowDrawnWithCtrl.input.args,
	parameters: arrowDocs("ArrowDrawnWithCtrl in the dark theme."),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowDrawnWithCtrl.input.play?.(context)
	},
})

const pressOn = (element: Element, root: HTMLElement, at: BoardPoint) =>
	pointerAt("pointerdown", element, atBoard(root, at))

export const ArrowBentByHand = meta.story({
	args: arrowArgs([START, FINISH, TIED_ARROW]),
	parameters: handDocs(
		"Arrow behaviour 2.1 Curve: the middle handle of the selected arrow dragged 66 up bends the arrow through it live, the handle of radius 5.5 riding the apex of the curve and the end handles of radius 4 staying on their ends. Nothing goes out before the release, which sends one set-arrow intent with the bend of 66, and the bend stays.",
	),
	play: async ({ canvasElement, args }) => {
		await selectArrow(canvasElement, START_TO_FINISH)
		const handle = slotIn(canvasElement, "board-connector-middle-handle")
		pressOn(handle, canvasElement, { x: 320, y: 200 })
		pointerAt(
			"pointermove",
			document,
			atBoard(canvasElement, { x: 320, y: 134 }),
		)
		const curve = "M248 200 Q320 68 392 200"
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector")).toEqual([curve]),
		)
		await expect(args.onIntent).not.toHaveBeenCalled()

		pointerAt("pointerup", document, atBoard(canvasElement, { x: 320, y: 134 }))
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "set-arrow",
			arrow: { ...TIED_ARROW, bend: 66 },
		})
		await expect(connectorPaths(canvasElement, "board-connector")).toEqual([
			curve,
		])
		await expectArrowSelected(
			arrowLine(canvasElement, START_TO_FINISH),
			[
				{ x: 248, y: 200 },
				{ x: 392, y: 200 },
			],
			{ x: 320, y: 134 },
		)
	},
})

export const ArrowBentByHandDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowBentByHand.input.args,
	parameters: arrowDocs("ArrowBentByHand in the dark theme."),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowBentByHand.input.play?.(context)
	},
})

const LOW_FINISH = handShapeOf("finish", "Finish", 400, 360)
const SIDED_ARROW = arrowBetween(START_TO_FINISH, "start", "finish", {
	fromSide: "right",
	toSide: "left",
})
const FLYOUT_GAP = 16

export const ArrowReroutedByHand = meta.story({
	args: arrowArgs([START, LOW_FINISH, SIDED_ARROW]),
	parameters: handDocs(
		"Arrow behaviour 2.2 Elbow: the flyout of the selected arrow sits centred 16 above it, Straight then Elbow. Elbow sends one set-arrow intent with the elbow kind and the arrow reroutes, the middle handle on the middle of its lane, and the chosen item is filled in the selected control colour with its icon in the Space colour and its text at 600.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await selectArrow(canvasElement, START_TO_FINISH)
		const line = slotIn(
			arrowLine(canvasElement, START_TO_FINISH) as HTMLElement,
			"board-connector-path",
		).getBoundingClientRect()
		const flyout = slotIn(canvasElement, "board-connector-flyout")
		const box = flyout.getBoundingClientRect()
		await expect(box.bottom).toBeCloseTo(line.top - FLYOUT_GAP, 0)
		await expect(box.x + box.width / 2).toBeCloseTo(line.x + line.width / 2, 0)
		const options = within(flyout).getAllByRole("radio")
		await expect(options.map((option) => option.textContent)).toEqual([
			"Straight",
			"Elbow",
		])

		const elbow = canvas.getByRole("radio", { name: "Elbow" })
		await userEvent.click(elbow)
		await expect(args.onIntent).toHaveBeenCalledTimes(1)
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "set-arrow",
			arrow: { ...SIDED_ARROW, routing: "elbow" },
		})
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector")).toEqual([
				"M248 200 L312 200 Q320 200 320 208 L320 432 Q320 440 328 440 L392 440",
			]),
		)
		const handle = slotIn(canvasElement, "board-connector-middle-handle")
		await expect(attributesOf(handle, ["cx", "cy"])).toEqual([320, 320])
		await expect(elbow).toBeChecked()
		const chosen = getComputedStyle(elbow)
		await expect(chosen.backgroundColor).toBe(
			resolvedRootColor("--board-control-selected"),
		)
		await expect(chosen.fontWeight).toBe("600")
		await expect(chosen.color).toBe(resolvedRootColor("--primary"))
	},
})

export const ArrowReroutedByHandDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowReroutedByHand.input.args,
	parameters: arrowDocs(
		"ArrowReroutedByHand in the dark theme, the chosen item filled #2A2A2D with its icon in #88BAFF.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowReroutedByHand.input.play?.(context)
		const elbow = within(context.canvasElement).getByRole("radio", {
			name: "Elbow",
		})
		await expect(getComputedStyle(elbow).backgroundColor).toBe(
			"rgb(42, 42, 45)",
		)
	},
})

const MOVING_OUTSET = 3

const BENT_LABELLED_ARROW = arrowBetween(START_TO_FINISH, "start", "finish", {
	bend: 40,
	text: "Hands over",
	labelPosition: 0.3,
})

export const ArrowFollowsMovedShape = meta.story({
	args: arrowArgs([START, FINISH, BENT_LABELLED_ARROW]),
	parameters: handDocs(
		"Arrow behaviour 3.1 Moving: Finish dragged by the pointer is lifted on a shadow of 0 2 4 and 0 16 32 over a dashed 1.5 ghost of itself at its start, outlined 1.5 in the Space colour 3 outside it with corners of 6 in place of the selection frame, and redraws the arrow tied to it in the same frame, at rest, with its bend of 40 and its label at 0.3 of the way, before the release sends one move intent, drops the ghost and the shadow and gives Finish its selection frame back. Moved again with Shift and the down arrow key, the arrow follows the same way.",
	),
	play: async ({ canvasElement, args }) => {
		const finish = objectNode(canvasElement, "finish") as HTMLElement
		const from = centreOf(finish)
		const to = shifted(from, { x: 60, y: 40 })
		pointerAt("pointerdown", finish, from)
		pointerAt("pointermove", document, to)
		const moved = "M247.96 209.26 Q358.37 140.44 452.04 230.74"
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector")).toEqual([moved]),
		)
		await expectArrowAtRest(arrowLine(canvasElement, START_TO_FINISH))
		const ghost = slotIn(canvasElement, "board-move-ghost")
		const ghostBox = ghost.getBoundingClientRect()
		const origin = boardAt(canvasElement, FINISH.position.x, FINISH.position.y)
		await expect([ghostBox.x, ghostBox.y]).toEqual([
			origin.clientX,
			origin.clientY,
		])
		await expect([ghostBox.width, ghostBox.height]).toEqual([160, 160])
		const ghostLook = getComputedStyle(ghost)
		await expect(ghostLook.borderTopStyle).toBe("dashed")
		await expect(ghost).toHaveClass("border-[1.5px]")
		await expect(ghostLook.borderTopColor).toBe(
			resolvedRootColor("--board-move-ghost"),
		)
		await expect(getComputedStyle(finish).filter).toMatch(
			/drop-shadow.*0px 2px 4px.*drop-shadow.*0px 16px 32px/,
		)
		await expect(slotsIn(canvasElement, "board-selection-frame")).toHaveLength(
			0,
		)
		const outline = slotIn(canvasElement, "board-moving-outline")
		const outlineBox = outline.getBoundingClientRect()
		const movedBox = finish.getBoundingClientRect()
		await expect(outlineBox.x).toBeCloseTo(movedBox.x - MOVING_OUTSET, 0)
		await expect(outlineBox.y).toBeCloseTo(movedBox.y - MOVING_OUTSET, 0)
		await expect(outlineBox.width).toBeCloseTo(
			movedBox.width + MOVING_OUTSET * 2,
			0,
		)
		await expect(outlineBox.height).toBeCloseTo(
			movedBox.height + MOVING_OUTSET * 2,
			0,
		)
		const outlineLook = getComputedStyle(outline)
		await expect(outlineLook.borderTopLeftRadius).toBe("6px")
		await expect(outlineLook.boxShadow).toMatch(/\binset\b/)
		await expect(outlineLook.boxShadow).toMatch(/\b1\.5px\b/)
		await expect(outlineLook.boxShadow).toContain(
			resolvedRootColor("--user-bubble"),
		)
		const label = slotIn(canvasElement, "board-connector-label")
		await expectLabelCentredOn(canvasElement, label, { x: 312.7, y: 182.29 })
		await expect(args.onIntent).not.toHaveBeenCalled()
		pointerAt("pointerup", document, to)
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "move",
			id: "finish",
			position: { x: 460, y: 160 },
		})
		await expect(slotsIn(canvasElement, "board-move-ghost")).toHaveLength(0)
		await expect(getComputedStyle(finish).filter).toBe("none")
		await expect(slotsIn(canvasElement, "board-moving-outline")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "board-selection-frame")).toHaveLength(
			1,
		)

		finish.focus()
		await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}")
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(2))
		await waitFor(() =>
			expect(connectorPaths(canvasElement, "board-connector")).toEqual([
				"M247.93 211.57 Q360.44 145.68 452.07 238.43",
			]),
		)
		await expectLabelCentredOn(canvasElement, label, { x: 313.56, y: 186.32 })
	},
})

export const ArrowFollowsMovedShapeDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowFollowsMovedShape.input.args,
	parameters: arrowDocs(
		"ArrowFollowsMovedShape in the dark theme, the arrow #E5E5E5 while Finish moves.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowFollowsMovedShape.input.play?.(context)
	},
})

const labelEditorIn = (root: HTMLElement) =>
	within(root).queryByRole("textbox", { name: "Arrow label" })

export const ArrowLabelEdited = meta.story({
	args: arrowArgs([START, FINISH, LABELLED_ARROW]),
	parameters: handDocs(
		"A double click on an arrow opens its label in place, on the chip at its label position ringed 1.5 in the Space colour, the text selected at its end. Enter sends one set-arrow intent with the new label and closes the field. Enter on the selected arrow opens it again, and Escape closes it with nothing sent and the label as it was.",
	),
	play: async ({ canvasElement, args }) => {
		const hit = canvasElement.querySelector(
			`[data-slot="board-connector-hits"] [data-connector-id="${START_TO_FINISH}"]`,
		) as SVGPathElement
		await userEvent.dblClick(hit)
		const editor = await waitFor(() => {
			const field = labelEditorIn(canvasElement)
			expect(field).not.toBeNull()
			return field as HTMLTextAreaElement
		})
		await expect(editor).toHaveFocus()
		await expect(editor).toHaveValue("Hands over")
		await expect(slotsIn(canvasElement, "board-connector-label")).toHaveLength(
			0,
		)
		await expectLabelCentredOn(canvasElement, editor, { x: 320, y: 200 })
		const look = getComputedStyle(editor)
		await expect(look.boxShadow).toMatch(/\b1\.5px\b/)
		await expect(look.backgroundColor).toBe(
			resolvedRootColor("--board-surface"),
		)
		await expect([look.fontSize, look.fontWeight]).toEqual(["13px", "500"])

		await userEvent.keyboard(" soon{Enter}")
		await waitFor(() => expect(labelEditorIn(canvasElement)).toBeNull())
		await expect(args.onIntent).toHaveBeenCalledTimes(1)
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "set-arrow",
			arrow: { ...LABELLED_ARROW, text: "Hands over soon" },
		})
		await expect(
			slotIn(canvasElement, "board-connector-label"),
		).toHaveTextContent("Hands over soon")

		await userEvent.keyboard("{Enter}")
		const again = await waitFor(() => {
			const field = labelEditorIn(canvasElement)
			expect(field).not.toBeNull()
			return field as HTMLTextAreaElement
		})
		await expect(again).toHaveValue("Hands over soon")
		await userEvent.keyboard("!{Escape}")
		await waitFor(() => expect(labelEditorIn(canvasElement)).toBeNull())
		await expect(args.onIntent).toHaveBeenCalledTimes(1)
		await expect(
			slotIn(canvasElement, "board-connector-label"),
		).toHaveTextContent("Hands over soon")
	},
})

export const ArrowLabelEditedDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowLabelEdited.input.args,
	parameters: arrowDocs("ArrowLabelEdited in the dark theme."),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowLabelEdited.input.play?.(context)
	},
})

const resolvedStroke = (root: HTMLElement, value: string) => {
	const probe = document.createElement("span")
	probe.style.color = value
	root.append(probe)
	const colour = getComputedStyle(probe).color
	probe.remove()
	return colour
}

export const ArrowLabelSlid = meta.story({
	args: arrowArgs([START, FINISH, LABELLED_ARROW]),
	parameters: handDocs(
		"Arrow behaviour 4.1 Label: a dragged label slides along the arrow only, its chip ringed 1.5 in the Space colour, while a dashed tick 16 long in the Space colour at 60%, dashes of 2 and gaps of 3, marks the middle of the arrow across it. The release sends one set-arrow intent with the new label position and the tick goes. Released near the tick, the label snaps back to the middle.",
	),
	play: async ({ canvasElement, args }) => {
		const label = slotIn(canvasElement, "board-connector-label")
		pressOn(label, canvasElement, { x: 320, y: 200 })
		pointerAt(
			"pointermove",
			document,
			atBoard(canvasElement, { x: 284, y: 240 }),
		)
		await waitFor(() =>
			expectLabelCentredOn(canvasElement, label, { x: 284, y: 200 }),
		)
		await expect(getComputedStyle(label).boxShadow).toMatch(/\b1\.5px\b/)
		const tick = slotIn(canvasElement, "board-connector-middle-tick")
		await expect(attributesOf(tick, ["x1", "y1", "x2", "y2"])).toEqual([
			320, 192, 320, 208,
		])
		await expect(tick.getAttribute("stroke-dasharray")).toBe("2 3")
		await expect(getComputedStyle(tick).stroke).toBe(
			resolvedStroke(
				canvasElement,
				"color-mix(in oklab, var(--user-bubble) 60%, transparent)",
			),
		)
		await expect(args.onIntent).not.toHaveBeenCalled()

		pointerAt("pointerup", document, atBoard(canvasElement, { x: 284, y: 240 }))
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "set-arrow",
			arrow: { ...LABELLED_ARROW, labelPosition: 0.25 },
		})
		await expect(
			slotsIn(canvasElement, "board-connector-middle-tick"),
		).toHaveLength(0)

		pressOn(label, canvasElement, { x: 284, y: 200 })
		pointerAt(
			"pointermove",
			document,
			atBoard(canvasElement, { x: 324, y: 210 }),
		)
		await waitFor(() =>
			expect(
				slotsIn(canvasElement, "board-connector-middle-tick"),
			).toHaveLength(1),
		)
		pointerAt("pointerup", document, atBoard(canvasElement, { x: 324, y: 210 }))
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(2))
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "set-arrow",
			arrow: { ...LABELLED_ARROW, labelPosition: 0.5 },
		})
		await expectLabelCentredOn(canvasElement, label, { x: 320, y: 200 })
	},
})

export const ArrowLabelSlidDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowLabelSlid.input.args,
	parameters: arrowDocs(
		"ArrowLabelSlid in the dark theme, the tick #88BAFF at 60% and the text #EDEDED.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowLabelSlid.input.play?.(context)
	},
})

const ASIDE_LABELLED_ARROW = arrowBetween(START_TO_FINISH, "start", "finish", {
	text: "Hands over",
	labelPosition: 0.25,
})

const cancelledByEscape = async (
	root: HTMLElement,
	press: Element,
	from: BoardPoint,
	to: BoardPoint,
	expectHeld: () => Promise<void>,
) => {
	pressOn(press, root, from)
	pointerAt("pointermove", document, atBoard(root, to))
	await waitFor(expectHeld)
	await userEvent.keyboard("{Escape}")
	await waitFor(() =>
		expect(connectorPaths(root, "board-connector")).toEqual([CENTRE_PATH]),
	)
	pointerAt("pointerup", document, atBoard(root, to))
	await expectLabelCentredOn(root, slotIn(root, "board-connector-label"), {
		x: 284,
		y: 200,
	})
	await expect(within(root).getByRole("radiogroup")).toBeVisible()
}

export const ArrowGestureCancelled = meta.story({
	args: arrowArgs([START, FINISH, ASIDE_LABELLED_ARROW]),
	parameters: handDocs(
		"Escape during a drag of an end, of the middle handle or of the label puts the arrow back as it was, still selected, and the release that follows sends nothing.",
	),
	play: async ({ canvasElement, args }) => {
		await selectArrow(canvasElement, START_TO_FINISH)
		const line = arrowLine(canvasElement, START_TO_FINISH) as HTMLElement
		const end = line.querySelector('[data-end="to"]') as Element
		await cancelledByEscape(
			canvasElement,
			end,
			{ x: 392, y: 200 },
			{ x: 640, y: 420 },
			() =>
				expect(connectorPaths(canvasElement, "board-connector")).toEqual([
					"M247.27 240 L640 420",
				]),
		)
		await cancelledByEscape(
			canvasElement,
			slotIn(line, "board-connector-middle-handle"),
			{ x: 320, y: 200 },
			{ x: 320, y: 134 },
			() =>
				expect(connectorPaths(canvasElement, "board-connector")).toEqual([
					"M248 200 Q320 68 392 200",
				]),
		)
		await cancelledByEscape(
			canvasElement,
			slotIn(canvasElement, "board-connector-label"),
			{ x: 284, y: 200 },
			{ x: 356, y: 200 },
			() =>
				expectLabelCentredOn(
					canvasElement,
					slotIn(canvasElement, "board-connector-label"),
					{ x: 356, y: 200 },
				),
		)
		await expect(args.onIntent).not.toHaveBeenCalled()
	},
})

export const ArrowGestureCancelledDark = meta.story({
	globals: { theme: "dark" },
	args: ArrowGestureCancelled.input.args,
	parameters: arrowDocs("ArrowGestureCancelled in the dark theme."),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await ArrowGestureCancelled.input.play?.(context)
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

const DRAFT_EVENTS = [
	"pointermove",
	"pointerup",
	"pointercancel",
	"keydown",
	"keyup",
]

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

const SPOT: BoardPoint = { x: 100, y: 50 }

const clientPointOf = (
	board: HTMLElement,
	point: BoardPoint,
	viewport: BoardViewport,
) => {
	const rect = board.getBoundingClientRect()
	const left = rect.left + board.clientLeft
	const top = rect.top + board.clientTop
	return {
		clientX: left + viewport.offset.x + point.x * viewport.zoom,
		clientY: top + viewport.offset.y + point.y * viewport.zoom,
	}
}

export const PointerReported = meta.story({
	globals: LAPTOP_WINDOW,
	args: { ...SELECTION_ARGS, onPointerMove: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"The person's own pointer, reported for the others on the board. Check `onPointerMove` receiving the board point under the pointer, the same point once the board is panned and zoomed with the pointer back on the same spot, and null when the pointer leaves the canvas.",
			},
		},
	},
	play: async ({ canvasElement, args }) => {
		const board = slotIn(canvasElement, "board-canvas")
		const onViewportChange = args.onViewportChange as ReturnType<typeof fn>

		pointerAt("pointermove", board, clientPointOf(board, SPOT, AT_ORIGIN))
		await expect(args.onPointerMove).toHaveBeenLastCalledWith(SPOT)

		wheel(board, { deltaX: 40, deltaY: 30 })
		await userEvent.click(
			within(canvasElement).getByRole("button", { name: "Zoom in" }),
		)
		const moved = onViewportChange.mock.lastCall?.[0] as BoardViewport
		await expect(moved.zoom).not.toBe(AT_ORIGIN.zoom)
		await expect(moved.offset).not.toEqual(AT_ORIGIN.offset)

		pointerAt("pointermove", board, clientPointOf(board, SPOT, moved))
		await expect(args.onPointerMove).toHaveBeenLastCalledWith(SPOT)

		board.dispatchEvent(
			new PointerEvent("pointerout", {
				bubbles: true,
				pointerId: 1,
				relatedTarget: document.body,
			}),
		)
		await expect(args.onPointerMove).toHaveBeenLastCalledWith(null)
	},
})

export const SelectionReported = meta.story({
	globals: LAPTOP_WINDOW,
	args: { ...SELECTION_ARGS, onSelectionChange: fn() },
	parameters: selectionDocs(
		"The person's own selection, reported for the others on the board. Check `onSelectionChange` receiving the plan sticky once for the press and the focus it brings, then an empty list once when a press on the empty board clears it, and nothing more on a second press there.",
	),
	play: async ({ canvasElement, args }) => {
		const board = slotIn(canvasElement, "board-canvas")

		await userEvent.click(optionNamed(canvasElement, PLAN_NAME))
		await expect(args.onSelectionChange).toHaveBeenCalledTimes(1)
		await expect(args.onSelectionChange).toHaveBeenLastCalledWith([PLAN.id])

		await userEvent.click(board)
		await userEvent.click(board)
		await expect(args.onSelectionChange).toHaveBeenCalledTimes(2)
		await expect(args.onSelectionChange).toHaveBeenLastCalledWith([])
	},
})

const WITHOUT_PLAN = {
	objects: SMALL_BOARD.objects.filter((object) => object.id !== PLAN.id),
}

const BoardChangedElsewhere = (props: BoardCanvasProps) => {
	const [view, setView] = useState(props.view)

	return (
		<div className="flex h-[640px] w-full flex-col">
			<div className="flex gap-2 p-2">
				<button onClick={() => setView(WITHOUT_PLAN)} type="button">
					Remove the plan sticky
				</button>
				<button onClick={() => setView(SMALL_BOARD)} type="button">
					Restore the plan sticky
				</button>
			</div>
			<div className="min-h-0 flex-1">
				<BoardCanvas {...props} view={view} />
			</div>
		</div>
	)
}

export const SelectedObjectRemovedElsewhere = meta.story({
	tags: ["test-only"],
	globals: LAPTOP_WINDOW,
	args: { ...SELECTION_ARGS, onSelectionChange: fn() },
	render: (args) => <BoardChangedElsewhere {...args} />,
	parameters: selectionDocs(
		"The selected sticky deleted by someone else, its removal arriving through `view`. Check `onSelectionChange` receiving an empty list once, the frame gone, and the same sticky added back unselected with no further call.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)

		await userEvent.click(optionNamed(canvasElement, PLAN_NAME))
		await expect(args.onSelectionChange).toHaveBeenLastCalledWith([PLAN.id])

		await userEvent.click(
			canvas.getByRole("button", { name: "Remove the plan sticky" }),
		)
		await expect(args.onSelectionChange).toHaveBeenCalledTimes(2)
		await expect(args.onSelectionChange).toHaveBeenLastCalledWith([])
		await expect(slotsIn(canvasElement, "board-selection-frame")).toHaveLength(
			0,
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Restore the plan sticky" }),
		)
		await expect(optionNamed(canvasElement, PLAN_NAME)).toHaveAttribute(
			"aria-selected",
			"false",
		)
		await expect(selectedOptions(canvasElement)).toEqual([])
		await expect(args.onSelectionChange).toHaveBeenCalledTimes(2)
	},
})

const CREATION_TOOLS = [
	{ tool: "Sticky note", kind: "sticky" },
	{ tool: "Shape", kind: "shape" },
	{ tool: "Text", kind: "text" },
	{ tool: "Section", kind: "section" },
] as const

type CreationTool = (typeof CREATION_TOOLS)[number]

const EMPTY_SPOT = { x: 700, y: 480 }
const HAND_DRAG = { x: 120, y: -60 }
const CHOSEN_IMAGES = [pngNamed("terrace.png"), pngNamed("courtyard.png")]

const toolButton = (root: HTMLElement, name: string) =>
	within(root).getByRole("button", { name })

const pickTool = async (root: HTMLElement, name: string) => {
	const button = toolButton(root, name)
	await userEvent.click(button)
	await expect(button).toHaveAttribute("aria-pressed", "true")
}

const pressBoard = async (root: HTMLElement, spot: BoardPoint) => {
	const at = boardAt(root, spot.x, spot.y)
	await userEvent.pointer({
		keys: "[MouseLeft]",
		target: slotIn(root, "board-canvas"),
		coords: at,
	})
	return at
}

const expectCentredOn = async (
	object: Element,
	at: { clientX: number; clientY: number },
) => {
	const box = object.getBoundingClientRect()
	await expect(box.x + box.width / 2).toBeCloseTo(at.clientX, 0)
	await expect(box.y + box.height / 2).toBeCloseTo(at.clientY, 0)
}

const zIndexOf = (object: HTMLElement) => Number(object.style.zIndex)

const expectZRank = async (
	root: HTMLElement,
	object: HTMLElement,
	rank: "above" | "below",
) => {
	const own = zIndexOf(object)
	const outranking = within(root)
		.getAllByRole("option")
		.filter((option) => option !== object)
		.map(zIndexOf)
		.filter((z) => (rank === "above" ? z >= own : z <= own))
	await expect(outranking).toEqual([])
}

const placeWithTool = async (
	{ canvasElement, args }: CanvasPlayContext,
	{ tool, kind }: CreationTool,
	spot: BoardPoint,
) => {
	const board = slotIn(canvasElement, "board-canvas")
	await pickTool(canvasElement, tool)
	await expect(getComputedStyle(board).cursor).toBe("crosshair")

	const at = await pressBoard(canvasElement, spot)
	const size = boardSchema.kinds[kind].size
	const centre = boardPointOf(board, at)
	await expect(args.onIntent).toHaveBeenLastCalledWith({
		type: "create",
		object: expect.objectContaining({
			kind,
			size,
			position: {
				x: centre.x - size.width / 2,
				y: centre.y - size.height / 2,
			},
			text: "",
		}),
	})
	const placed = selectedOptions(canvasElement)
	await expect(placed).toHaveLength(1)
	const [object] = placed as [HTMLElement]
	await expect(object).toHaveAccessibleName(tool)
	await expectCentredOn(object, at)
	await expectZRank(
		canvasElement,
		object,
		kind === "section" ? "below" : "above",
	)
	await expect(args.onToolChange).toHaveBeenLastCalledWith("select")
	await expect(toolButton(canvasElement, "Select")).toHaveAttribute(
		"aria-pressed",
		"true",
	)
	await expect(getComputedStyle(board).cursor).not.toBe("crosshair")
	return object
}

const toolDocs = (story: string) => ({
	docs: { description: { story } },
})

const placeOneWith =
	(creation: CreationTool) => async (context: CanvasPlayContext) => {
		await placeWithTool(context, creation, EMPTY_SPOT)
		await expect(context.args.onIntent).toHaveBeenCalledTimes(1)
	}

export const PlaceStickyWithTool = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: toolDocs(
		"Sticky note picked in the dock: the board shows the crosshair, a press on the empty board sends one create intent for a sticky at the board's sticky size centred on the press, selects it and hands the tool back to Select.",
	),
	play: placeOneWith(CREATION_TOOLS[0]),
})

export const PlaceShapeWithTool = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: toolDocs(
		"Shape picked in the dock: a press on the empty board sends one create intent for a shape at the board's shape size centred on the press, selects it with its style bar and hands the tool back to Select.",
	),
	play: placeOneWith(CREATION_TOOLS[1]),
})

export const PlaceTextWithTool = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: toolDocs(
		"Text picked in the dock: a press on the empty board creates a text centred on the press and opens it in editing with the caret inside, so typing then Escape sends one edit-text intent.",
	),
	play: async (context) => {
		const { canvasElement, args } = context
		const object = await placeWithTool(context, CREATION_TOOLS[2], EMPTY_SPOT)
		const editor = within(canvasElement).getByRole("textbox", {
			name: "Edit text",
		})
		await expect(editor).toHaveFocus()

		await userEvent.keyboard("Agenda")
		await userEvent.keyboard("{Escape}")
		await expect(args.onIntent).toHaveBeenLastCalledWith({
			type: "edit-text",
			id: object.dataset.objectId,
			text: "Agenda",
		})
	},
})

export const PlaceSectionWithTool = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: toolDocs(
		"Section picked in the dock: a press on the empty board sends one create intent for a section at the board's section size centred on the press and below every object, selects it and hands the tool back to Select.",
	),
	play: placeOneWith(CREATION_TOOLS[3]),
})

const chooseImagesAt = async (
	{ canvasElement, args }: CanvasPlayContext,
	spot: BoardPoint,
) => {
	const board = slotIn(canvasElement, "board-canvas")
	const chooser = slotIn(
		canvasElement,
		"board-image-chooser",
	) as HTMLInputElement
	const opened = spyOn(chooser, "click").mockImplementation(() => undefined)
	await pickTool(canvasElement, "Image")
	await expect(getComputedStyle(board).cursor).toBe("crosshair")

	const at = await pressBoard(canvasElement, spot)
	await expect(opened).toHaveBeenCalledTimes(1)
	opened.mockRestore()
	await userEvent.upload(chooser, CHOSEN_IMAGES)
	await expect(args.onDropFiles).toHaveBeenCalledWith(
		CHOSEN_IMAGES,
		boardPointOf(board, at),
	)
	await expect(args.onToolChange).toHaveBeenLastCalledWith("select")
}

export const PlaceImagesWithTool = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: toolDocs(
		"Image picked in the dock: a press on the empty board opens the system file chooser, the chosen images go out through `onDropFiles` at the pressed board point, the app placing them there, and the tool goes back to Select.",
	),
	play: (context) => chooseImagesAt(context, EMPTY_SPOT),
})

export const DrawConnectorWithTool = meta.story({
	globals: LAPTOP_WINDOW,
	args: { ...CONNECTOR_ARGS, isConnecting: false },
	parameters: toolDocs(
		"Connector picked in the dock, with no `isConnecting` from the app: a hovered object shows its anchors and a drag from the sticky's right anchor released over Review sends one set-arrow intent and draws the connector to its centre, elbowed since the flyout starts on Elbow.",
	),
	play: async ({ canvasElement, args }) => {
		await pickTool(canvasElement, "Arrow")
		await expectElbowChecked(canvasElement)
		const release = await dragFromPlanOntoReview(canvasElement)
		pointerAt("pointerup", document, release)
		await waitFor(() => expect(args.onIntent).toHaveBeenCalledTimes(1))
		await expect(args.onIntent).toHaveBeenCalledWith({
			type: "set-arrow",
			arrow: expect.objectContaining({
				from: "plan",
				to: "review",
				routing: "elbow",
			}),
		})
		await expect(connectorPaths(canvasElement, "board-connector")).toEqual([
			DRAWN_ELBOW_PATH,
		])
	},
})

const panWithHand = async (
	{ canvasElement, args }: CanvasPlayContext,
	spot: BoardPoint,
) => {
	const board = slotIn(canvasElement, "board-canvas")
	await pickTool(canvasElement, "Hand")
	await expect(getComputedStyle(board).cursor).toBe("grab")
	const start = boardAt(canvasElement, spot.x, spot.y)
	pointerAt("pointerdown", board, start)
	pointerAt("pointermove", document, shifted(start, HAND_DRAG))
	await waitFor(() => expect(getComputedStyle(board).cursor).toBe("grabbing"))
	pointerAt("pointerup", document, shifted(start, HAND_DRAG))
	await waitFor(() => expect(getComputedStyle(board).cursor).toBe("grab"))
	await expect(args.onViewportChange).toHaveBeenLastCalledWith({
		zoom: AT_ORIGIN.zoom,
		offset: {
			x: AT_ORIGIN.offset.x + HAND_DRAG.x,
			y: AT_ORIGIN.offset.y + HAND_DRAG.y,
		},
	})
}

export const PanWithHandTool = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: toolDocs(
		"Hand picked in the dock with the sticky selected: the board shows the grab cursor, a drag on the empty board shows grabbing, pans the view by the drag and the sticky stays selected, with no intent sent.",
	),
	play: async (context) => {
		const { canvasElement, args } = context
		const plan = optionNamed(canvasElement, PLAN_NAME)
		await userEvent.click(plan)
		await panWithHand(context, EMPTY_SPOT)
		await expect(selectedOptions(canvasElement)).toEqual([plan])
		await expect(args.onIntent).not.toHaveBeenCalled()
	},
})

const SPOT_OF_TOOL = {
	sticky: { x: 800, y: 200 },
	shape: { x: 1100, y: 150 },
	text: { x: 1100, y: 400 },
	section: { x: 400, y: 420 },
}
const IMAGE_SPOT = { x: 1100, y: 540 }
const HAND_SPOT = { x: 900, y: 500 }
const EMPTY_AFTER_PAN = { x: 60, y: 600 }

export const ToolPickedWhileSelected = meta.story({
	globals: LAPTOP_WINDOW,
	args: SELECTION_ARGS,
	parameters: toolDocs(
		"The sticky selected, then every tool of the dock picked in turn: each creation tool places its object at the next press as with nothing selected, Image opens the chooser, Hand pans keeping the selection, Connector shows the anchors of a hovered object, and Select clears the selection on a press on the empty board.",
	),
	play: async (context) => {
		const { canvasElement } = context
		await userEvent.click(optionNamed(canvasElement, PLAN_NAME))

		for (const creation of CREATION_TOOLS) {
			await expect(selectedOptions(canvasElement)).toHaveLength(1)
			await placeWithTool(context, creation, SPOT_OF_TOOL[creation.kind])
			if (creation.kind === "text") await userEvent.keyboard("{Escape}")
		}

		await expect(selectedOptions(canvasElement)).toHaveLength(1)
		await chooseImagesAt(context, IMAGE_SPOT)

		const selected = selectedOptions(canvasElement)
		await panWithHand(context, HAND_SPOT)
		await expect(selectedOptions(canvasElement)).toEqual(selected)

		await pickTool(canvasElement, "Arrow")
		await hoverPlanRightAnchor(canvasElement)

		await pickTool(canvasElement, "Select")
		await pressBoard(canvasElement, EMPTY_AFTER_PAN)
		await expect(selectedOptions(canvasElement)).toEqual([])
	},
})

const SESSION: BoardItem = {
	id: "session",
	kind: "sticky",
	position: { x: 80, y: 40 },
	size: { width: 160, height: 160 },
	zOrder: 1,
	text: "Second session ends 16:30",
}

const BOAT: BoardItem = {
	id: "boat",
	kind: "shape",
	position: { x: 400, y: 40 },
	size: { width: 200, height: 96 },
	zOrder: 2,
	text: "Boat to the island",
	style: { shape: "rounded-rectangle", fill: "surface" },
}

const DINNER: BoardItem = {
	id: "dinner",
	kind: "sticky",
	position: { x: 640, y: 220 },
	size: { width: 160, height: 160 },
	zOrder: 3,
	text: "Dinner on the terrace at 20:00",
}

const OFFSITE_BOARD = { objects: [SESSION, BOAT, DINNER] }
const OFFSITE_BOARD_ITEM = { name: "Lisbon offsite" }
const MARKET_POINT = { x: 100, y: 330 }
const EMPTY_POINT = { x: 860, y: 60 }
const BOAT_PIN_POINT = { x: 590, y: 50 }
const BOAT_ANCHOR_LINE = "On “Boat to the island”"
const PIN_SIZE = 32
const PIN_INSET = 10
const RING_OUTSET = 6
const BOAT_DRAWN_RADIUS = 12
const BOAT_RING_RADIUS = `${BOAT_DRAWN_RADIUS}px`
const STICKY_RING_RADIUS = "6px"
const CARD_GAP_UNDER_RING = 12
const CARD_GAP_BEFORE_PIN = 12

const DINNER_THREAD: BoardCommentThread = {
	id: "thread-dinner",
	author: LENA,
	anchor: DINNER.id,
	lastPoint: { x: 790, y: 230 },
}

const MARKET_THREAD: BoardCommentThread = {
	id: "thread-market",
	author: JUNIPER,
	anchor: MARKET_POINT,
}

const BOAT_THREAD: BoardCommentThread = {
	id: "thread-budget",
	author: STEVE,
	anchor: BOAT.id,
	lastPoint: BOAT_PIN_POINT,
}

const OFFSITE_THREADS = [DINNER_THREAD, MARKET_THREAD, BOAT_THREAD]
const LISTED_THREADS = { open: OPEN_THREADS, resolved: RESOLVED_THREADS }

const OPEN_BOAT_THREAD: BoardOpenCommentThread = {
	id: BOAT_THREAD.id,
	comments: [FIRST_COMMENT, MEMBER_REPLY, AGENT_REPLY],
	participants: COMMENT_PARTICIPANTS,
	reply: "",
	onReplyChange: fn(),
	onReply: fn(),
	onResolve: fn(),
	onReopen: fn(),
	onMore: fn(),
	onClose: fn(),
}

const COMMENT_DRAFT = {
	author: STEVE,
	value: "",
	onValueChange: fn(),
	onSubmit: fn(),
	onClose: fn(),
	participants: COMMENT_PARTICIPANTS,
}

const CommentedBoard = ({
	isCommentMode: isInitiallyOn = false,
	onLeaveCommentMode,
	...props
}: BoardCanvasProps) => {
	const [isCommentMode, setCommentMode] = useState(isInitiallyOn)
	const [tab, setTab] = useState<LibraryCommentsTab>("open")

	return (
		<>
			<LibraryDocumentBar
				comments={{
					counts: COMMENT_COUNTS,
					isCommentMode,
					onCommentModeChange: setCommentMode,
					list: (
						<LibraryCommentsList
							counts={COMMENT_COUNTS}
							onOpenThread={(id) => props.onOpenCommentThread?.(id)}
							onTabChange={setTab}
							tab={tab}
							threads={LISTED_THREADS[tab]}
						/>
					),
				}}
				item={OFFSITE_BOARD_ITEM}
				onBack={() => undefined}
			/>
			<ControlledBoard
				{...props}
				isCommentMode={isCommentMode}
				onLeaveCommentMode={() => {
					setCommentMode(false)
					onLeaveCommentMode?.()
				}}
			/>
		</>
	)
}

const COMMENT_ARGS = {
	view: OFFSITE_BOARD,
	renderObject: (object: BoardItem) => <BoardObjectView object={object} />,
	commentThreads: OFFSITE_THREADS,
	onOpenCommentThread: fn(),
	onStartComment: fn(),
	onLeaveCommentMode: fn(),
}

const commentDocs = (story: string) => ({
	docs: { description: { story } },
})

const renderCommentedBoard = (args: BoardCanvasProps) => (
	<CommentedBoard {...args} />
)

const commentMarkOf = (root: HTMLElement, threadId: string) => {
	const mark = slotsIn(root, "board-comment-mark").find(
		(candidate) => candidate.dataset.threadId === threadId,
	)
	if (!mark) throw new Error(`No pin is drawn for ${threadId}`)
	return mark
}

const pinIn = (mark: HTMLElement) => slotIn(mark, "library-comment-pin")

const zoomOf = (root: HTMLElement) =>
	Number.parseInt(slotIn(root, "board-zoom-level").textContent ?? "", 10) / 100

const expectPinTailAt = async (mark: HTMLElement, at: BoardClientPoint) => {
	const box = mark.getBoundingClientRect()
	await expect([box.width, box.height]).toEqual([PIN_SIZE, PIN_SIZE])
	await expect(box.left).toBeCloseTo(at.clientX, 1)
	await expect(box.bottom).toBeCloseTo(at.clientY, 1)
}

const expectPinOnNode = async (
	root: HTMLElement,
	mark: HTMLElement,
	id: string,
) => {
	const node = (objectNode(root, id) as HTMLElement).getBoundingClientRect()
	await expectPinTailAt(mark, {
		clientX: node.right - PIN_INSET,
		clientY: node.top + PIN_INSET,
	})
}

const boardPointOnScreen = (root: HTMLElement, point: BoardPoint) =>
	boardAt(root, AT_ORIGIN.offset.x + point.x, AT_ORIGIN.offset.y + point.y)

const expectRingAround = async (
	root: HTMLElement,
	id: string,
	radius: string,
) => {
	const rings = slotsIn(root, "board-comment-ring")
	await expect(rings).toHaveLength(1)
	const [ring] = rings as [HTMLElement]
	const box = ring.getBoundingClientRect()
	const node = (objectNode(root, id) as HTMLElement).getBoundingClientRect()
	await expect(box.left).toBeCloseTo(node.left - RING_OUTSET, 1)
	await expect(box.top).toBeCloseTo(node.top - RING_OUTSET, 1)
	await expect(box.right).toBeCloseTo(node.right + RING_OUTSET, 1)
	await expect(box.bottom).toBeCloseTo(node.bottom + RING_OUTSET, 1)
	const style = getComputedStyle(ring)
	await expect(style.borderTopWidth).toBe("2px")
	await expect(style.borderTopColor).toBe(resolvedRootColor("--primary"))
	await waitFor(() => expect(style.borderTopLeftRadius).toBe(radius))
	return box
}

const CURSOR_LOOK = {
	light: {
		ring: "rgb(255, 255, 255) 0px 0px 0px 2px",
		shadow: "rgba(0, 0, 0, 0.2) 0px 2px 6px 0px",
	},
	dark: {
		ring: "rgb(10, 10, 10) 0px 0px 0px 2px",
		shadow: "rgba(0, 0, 0, 0.4) 0px 2px 6px 0px",
	},
}

const expectCursorRingAndShadow = async (cursor: HTMLElement) => {
	const look = CURSOR_LOOK[cursor.closest(".dark") ? "dark" : "light"]
	const drawn = getComputedStyle(cursor).boxShadow
	await expect(drawn).toContain(look.ring)
	await expect(drawn).toContain(look.shadow)
	await expect(cursor.className).not.toMatch(/white|black|#/)
}

const expectTabLandsIn = async (from: HTMLElement, card: HTMLElement) => {
	from.focus()
	await userEvent.tab()
	const focused = document.activeElement as HTMLElement
	await expect(card).toContainElement(focused)
	return focused
}

const expectComposerFieldFocused = async (root: HTMLElement) => {
	const field = slotIn(
		slotIn(root, "library-comment-composer"),
		"library-comment-field",
	).querySelector("textarea")
	await expect(field).toHaveFocus()
}

const expectComposerBesidePin = async (
	root: HTMLElement,
	anchorLine: string,
) => {
	const mark = slotIn(root, "board-comment-draft-mark")
	const pin = pinIn(mark)
	await expect(pin).toHaveAttribute("data-state", "selected")
	const composer = slotIn(root, "library-comment-composer")
	const box = composer.getBoundingClientRect()
	const pinBox = mark.getBoundingClientRect()
	await expect(box.width).toBe(320)
	await expect(box.left).toBeCloseTo(pinBox.right + 8, 1)
	await expect(box.top).toBeCloseTo(pinBox.top, 1)
	await expect(within(composer).getByText(anchorLine)).toBeVisible()
	const field = await expectTabLandsIn(pin, composer)
	await expect(field).toHaveAttribute("placeholder", "Comment, @ to mention")
	return mark
}

const expectHintAboveDock = async (root: HTMLElement) => {
	const hint = slotIn(root, "library-comment-mode-hint").getBoundingClientRect()
	const dock = slotIn(root, "board-dock").getBoundingClientRect()
	const board = slotIn(root, "board-canvas").getBoundingClientRect()
	await expect(dock.top - hint.bottom).toBeCloseTo(64, 1)
	await expect(hint.left + hint.width / 2).toBeCloseTo(
		board.left + board.width / 2,
		0,
	)
}

export const CommentPins = meta.story({
	globals: LAPTOP_WINDOW,
	args: COMMENT_ARGS,
	render: renderCommentedBoard,
	parameters: commentDocs(
		"Artboard Board 1: three open threads, one on the Dinner sticky, one on the Boat shape and one on a free point of the board, under the Library bar with its counter and its Comment button. Check each pin at 32px with its tail 10 screen px inside the top right corner of its object, or on its board point, staying 32px and at the same 10 screen px at 75% and after a pan, a click or Enter on a pin sending its thread id and selecting nothing, the focus ring from the keyboard, and no colour transition.",
	),
	play: async ({ canvasElement, args }) => {
		const board = slotIn(canvasElement, "board-canvas")
		const dinner = commentMarkOf(canvasElement, DINNER_THREAD.id)
		const market = commentMarkOf(canvasElement, MARKET_THREAD.id)
		const boat = commentMarkOf(canvasElement, BOAT_THREAD.id)

		await expect(slotsIn(canvasElement, "board-comment-mark")).toHaveLength(3)
		await expect(slotsIn(canvasElement, "board-comment-ring")).toEqual([])
		await expect(pinIn(dinner)).toHaveAttribute("data-state", "rest")
		await expectPinOnNode(canvasElement, dinner, DINNER.id)
		await expectPinOnNode(canvasElement, boat, BOAT.id)
		await expectPinTailAt(
			market,
			boardPointOnScreen(canvasElement, MARKET_POINT),
		)

		await userEvent.click(
			within(canvasElement).getByRole("button", { name: "Zoom out" }),
		)
		await waitFor(() => expect(zoomOf(canvasElement)).toBe(0.75))
		await expectPinOnNode(canvasElement, dinner, DINNER.id)
		await expectPinOnNode(canvasElement, boat, BOAT.id)

		const boatBefore = boat.getBoundingClientRect()
		wheel(board, { deltaX: 40, deltaY: 30 })
		await waitFor(() =>
			expect(boat.getBoundingClientRect().left).toBeCloseTo(
				boatBefore.left - 40,
				1,
			),
		)
		await expectPinOnNode(canvasElement, dinner, DINNER.id)
		await expectPinOnNode(canvasElement, boat, BOAT.id)

		await userEvent.click(pinIn(dinner))
		await expect(args.onOpenCommentThread).toHaveBeenLastCalledWith(
			DINNER_THREAD.id,
		)
		await expect(selectedOptions(canvasElement)).toEqual([])
		await expect(args.onIntent).not.toHaveBeenCalled()

		const lastObject = objectNode(canvasElement, DINNER.id) as HTMLElement
		lastObject.focus()
		await userEvent.tab()
		const firstPin = pinIn(dinner)
		await expect(firstPin).toHaveFocus()
		await expect(firstPin.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(firstPin).outlineStyle).toBe("solid")
		await expect(getComputedStyle(firstPin).outlineWidth).toBe("2px")
		await userEvent.tab()
		await expect(pinIn(market)).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpenCommentThread).toHaveBeenLastCalledWith(
			MARKET_THREAD.id,
		)

		await expect(colourTransitionsOf(firstPin)).toEqual([])
	},
})

export const CommentPinsDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CommentPins.input.args,
	render: renderCommentedBoard,
	parameters: commentDocs(
		"CommentPins in the dark theme: the same three pins on the dark pin ground, the same geometry at 75% and after a pan.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await CommentPins.input.play?.(context)
	},
})

export const CommentMode = meta.story({
	globals: LAPTOP_WINDOW,
	args: { ...COMMENT_ARGS, isCommentMode: true },
	render: renderCommentedBoard,
	parameters: commentDocs(
		"Artboard Board 2: comment mode on, the Comment button of the bar pressed. Check the hint pill centred 64 above the dock, the dock unchanged and without a Comment tool, the 20px pin cursor in the Space colour with its tail on the pointer in place of the system cursor, with its 2px ring and its shadow read from the cursor tokens of the theme, the ring 6 outside a hovered object, 2 wide, in the Space colour and at the radius the object is drawn with, a press and a drag on an object selecting and moving nothing, a click on an object sending its id, a click on the empty board sending the board point, Enter on a focused object sending its id, a creation tool creating nothing, and Esc leaving the mode from the board, from the page, and right after a click on the Comment button.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		const board = slotIn(canvasElement, "board-canvas")
		const surface = slotIn(canvasElement, "board-comment-surface")
		const dock = slotIn(canvasElement, "board-dock")
		const boat = objectNode(canvasElement, BOAT.id) as HTMLElement
		const overBoat = centreOf(boat)
		const commentButton = canvas.getByRole("button", { name: "Comment" })

		await expect(commentButton).toHaveAttribute("aria-pressed", "true")
		await expectHintAboveDock(canvasElement)
		await expect(sizeOf(dock)).toEqual(LOADED_DOCK_SIZE)
		await expect(dock).not.toContainElement(commentButton)
		const dockInCommentMode = dock.outerHTML
		await expect(getComputedStyle(surface).cursor).toBe("none")
		await expect(slotsIn(canvasElement, "board-comment-ring")).toEqual([])

		await expect(
			document.elementFromPoint(overBoat.clientX, overBoat.clientY),
		).toBe(surface)
		pointerAt("pointermove", surface, overBoat)
		await waitFor(() =>
			expect(slotsIn(canvasElement, "board-comment-ring")).toHaveLength(1),
		)
		await expectRingAround(canvasElement, BOAT.id, BOAT_RING_RADIUS)
		const cursor = slotIn(canvasElement, "board-comment-cursor")
		const cursorBox = cursor.getBoundingClientRect()
		await expect([cursorBox.width, cursorBox.height]).toEqual([20, 20])
		await expect(cursorBox.left).toBeCloseTo(overBoat.clientX, 1)
		await expect(cursorBox.bottom).toBeCloseTo(overBoat.clientY, 1)
		await expect(getComputedStyle(cursor).backgroundColor).toBe(
			resolvedRootColor("--primary"),
		)
		await expect(getComputedStyle(cursor).borderBottomLeftRadius).toBe("2px")
		await expectCursorRingAndShadow(cursor)

		const boatBefore = boat.getBoundingClientRect()
		const dragged = shifted(overBoat, { x: 80, y: 40 })
		pointerAt("pointerdown", surface, overBoat)
		pointerAt("pointermove", document, dragged)
		pointerAt("pointerup", document, dragged)
		await expect(boat.getBoundingClientRect()).toEqual(boatBefore)
		await expect(selectedOptions(canvasElement)).toEqual([])

		await userEvent.pointer({
			keys: "[MouseLeft]",
			target: surface,
			coords: overBoat,
		})
		await expect(args.onStartComment).toHaveBeenLastCalledWith(BOAT.id)

		const onEmptyBoard = boardPointOnScreen(canvasElement, EMPTY_POINT)
		await userEvent.pointer({
			keys: "[MouseLeft]",
			target: surface,
			coords: onEmptyBoard,
		})
		await expect(args.onStartComment).toHaveBeenLastCalledWith(EMPTY_POINT)
		await expect(args.onStartComment).toHaveBeenCalledTimes(2)
		await expect(selectedOptions(canvasElement)).toEqual([])
		await expect(args.onIntent).not.toHaveBeenCalled()

		board.focus()
		await userEvent.keyboard("{Escape}")
		await expect(args.onLeaveCommentMode).toHaveBeenCalledTimes(1)
		await waitFor(() =>
			expect(slotsIn(canvasElement, "library-comment-mode-hint")).toEqual([]),
		)
		await expect(slotsIn(canvasElement, "board-comment-surface")).toEqual([])
		await expect(commentButton).toHaveAttribute("aria-pressed", "false")
		await expect(dock.outerHTML).toBe(dockInCommentMode)

		await userEvent.click(commentButton)
		await expectHintAboveDock(canvasElement)
		await pickTool(canvasElement, "Sticky note")
		await userEvent.pointer({
			keys: "[MouseLeft]",
			target: slotIn(canvasElement, "board-comment-surface"),
			coords: onEmptyBoard,
		})
		await expect(args.onStartComment).toHaveBeenCalledTimes(3)
		await expect(args.onIntent).not.toHaveBeenCalled()

		boat.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onStartComment).toHaveBeenLastCalledWith(BOAT.id)
		await expect(slotsIn(canvasElement, "board-text-editor")).toEqual([])
		boat.blur()
		await expect(document.body).toHaveFocus()
		await userEvent.keyboard("{Escape}")
		await expect(args.onLeaveCommentMode).toHaveBeenCalledTimes(2)
		await expect(commentButton).toHaveAttribute("aria-pressed", "false")

		await userEvent.click(commentButton)
		await expect(commentButton).toHaveAttribute("aria-pressed", "true")
		await expect(commentButton).toHaveFocus()
		await userEvent.keyboard("{Escape}")
		await expect(args.onLeaveCommentMode).toHaveBeenCalledTimes(3)
		await expect(commentButton).toHaveAttribute("aria-pressed", "false")
	},
})

export const CommentModeDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CommentMode.input.args,
	render: renderCommentedBoard,
	parameters: commentDocs(
		"CommentMode in the dark theme: the hint pill, the pin cursor and the hover ring in the dark Space colour, the same intents.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await CommentMode.input.play?.(context)
	},
})

export const CommentDraftOnNode = meta.story({
	globals: LAPTOP_WINDOW,
	args: {
		...COMMENT_ARGS,
		isCommentMode: true,
		commentDraft: { ...COMMENT_DRAFT, anchor: BOAT.id },
	},
	render: renderCommentedBoard,
	parameters: commentDocs(
		"Artboard Board 3: a comment being written on the Boat shape. Check the ring kept around the shape, the new pin in its selected state on the corner of the shape, the composer 320 wide, 8 right of the pin with its top on the pin top, its line naming the shape in curly quotes, the field holding the focus as soon as the composer opens so typing writes into it, Tab going from the pin into the field, and Esc from the field closing the composer alone, comment mode kept.",
	),
	play: async ({ canvasElement, args }) => {
		await expectComposerFieldFocused(canvasElement)
		await userEvent.keyboard("a")
		await expect(args.commentDraft?.onValueChange).toHaveBeenLastCalledWith("a")
		await expectRingAround(canvasElement, BOAT.id, BOAT_RING_RADIUS)
		const mark = await expectComposerBesidePin(canvasElement, BOAT_ANCHOR_LINE)
		await expectPinOnNode(canvasElement, mark, BOAT.id)
		await expect(slotsIn(canvasElement, "board-comment-mark")).toHaveLength(3)
		await userEvent.keyboard("{Escape}")
		await expect(args.commentDraft?.onClose).toHaveBeenCalledTimes(1)
		await expect(args.onLeaveCommentMode).not.toHaveBeenCalled()
		await expect(
			within(canvasElement).getByRole("button", { name: "Comment" }),
		).toHaveAttribute("aria-pressed", "true")
	},
})

export const CommentDraftOnNodeDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CommentDraftOnNode.input.args,
	render: renderCommentedBoard,
	parameters: commentDocs(
		"CommentDraftOnNode in the dark theme: the ring in the dark Space colour and the composer on the dark card ground, at the same placement.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await CommentDraftOnNode.input.play?.(context)
	},
})

export const CommentDraftOnBoard = meta.story({
	globals: LAPTOP_WINDOW,
	args: {
		...COMMENT_ARGS,
		isCommentMode: true,
		commentDraft: { ...COMMENT_DRAFT, anchor: EMPTY_POINT },
	},
	render: renderCommentedBoard,
	parameters: commentDocs(
		"Artboard Board 4: a comment being written on a free point. Check that nothing is ringed, the new pin in its selected state with its tail on the point, the composer 320 wide, 8 right of the pin with its top on the pin top, its line reading On the board, and the field holding the focus as soon as the composer opens.",
	),
	play: async ({ canvasElement }) => {
		await expectComposerFieldFocused(canvasElement)
		await expect(slotsIn(canvasElement, "board-comment-ring")).toEqual([])
		const mark = await expectComposerBesidePin(canvasElement, "On the board")
		await expectPinTailAt(mark, boardPointOnScreen(canvasElement, EMPTY_POINT))
	},
})

export const CommentDraftOnBoardDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CommentDraftOnBoard.input.args,
	render: renderCommentedBoard,
	parameters: commentDocs(
		"CommentDraftOnBoard in the dark theme: the same pin and composer on the dark grounds.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await CommentDraftOnBoard.input.play?.(context)
	},
})

const DraftFollowingClicks = ({
	commentDraft,
	onStartComment,
	...props
}: BoardCanvasProps) => {
	const [anchor, setAnchor] = useState(commentDraft?.anchor)

	return (
		<CommentedBoard
			{...props}
			commentDraft={
				commentDraft && anchor ? { ...commentDraft, anchor } : undefined
			}
			onStartComment={(next) => {
				setAnchor(next)
				onStartComment?.(next)
			}}
		/>
	)
}

const expectComposerOn = async (root: HTMLElement, anchorLine: string) => {
	await waitFor(() =>
		expect(
			within(slotIn(root, "library-comment-composer")).getByText(anchorLine),
		).toBeVisible(),
	)
	await expectComposerFieldFocused(root)
}

export const CommentDraftMovesWithAnchor = meta.story({
	tags: ["test-only"],
	globals: LAPTOP_WINDOW,
	args: CommentDraftOnNode.input.args,
	render: (args) => <DraftFollowingClicks {...args} />,
	parameters: commentDocs(
		"A comment being written on the Boat shape, then a click on the Dinner sticky and a click on the empty board, each moving the draft. Check the composer following to the new anchor with its line renamed, the ring around the sticky at 6, and its field holding the focus again each time, so typing writes into it without a click or a Tab.",
	),
	play: async ({ canvasElement, args }) => {
		const surface = slotIn(canvasElement, "board-comment-surface")
		const dinner = objectNode(canvasElement, DINNER.id) as HTMLElement

		await expectComposerOn(canvasElement, BOAT_ANCHOR_LINE)
		await userEvent.pointer({
			keys: "[MouseLeft]",
			target: surface,
			coords: centreOf(dinner),
		})
		await expectComposerOn(canvasElement, "On “Dinner on the terrace at 20:00”")
		await expectRingAround(canvasElement, DINNER.id, STICKY_RING_RADIUS)
		await userEvent.pointer({
			keys: "[MouseLeft]",
			target: surface,
			coords: boardPointOnScreen(canvasElement, EMPTY_POINT),
		})
		await expectComposerOn(canvasElement, "On the board")
		await userEvent.keyboard("a")
		await expect(args.commentDraft?.onValueChange).toHaveBeenLastCalledWith("a")
	},
})

export const CommentModeSurvivesListEscape = meta.story({
	tags: ["test-only"],
	globals: LAPTOP_WINDOW,
	args: {
		...COMMENT_ARGS,
		isCommentMode: true,
		openCommentThread: OPEN_BOAT_THREAD,
	},
	render: renderCommentedBoard,
	parameters: commentDocs(
		"Comment mode on, the comments list opened from the counter of the bar, then Esc. Check the list closing while the hint stays and the Comment button stays pressed, the focus back on the counter, outside the board, and a second Esc there doing nothing, then Esc from the reply field of the open thread card closing that card alone, the mode kept.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		const counter = canvas.getByRole("button", { name: "3 open comments" })
		const commentButton = canvas.getByRole("button", { name: "Comment" })

		await userEvent.click(counter)
		await screen.findByRole("tablist", { name: "Comments" })
		await userEvent.keyboard("{Escape}")
		await waitFor(() =>
			expect(screen.queryByRole("tablist", { name: "Comments" })).toBeNull(),
		)
		await expect(counter).toHaveAttribute("aria-expanded", "false")
		await userEvent.keyboard("{Escape}")
		await expect(args.onLeaveCommentMode).not.toHaveBeenCalled()
		await expect(commentButton).toHaveAttribute("aria-pressed", "true")
		await expect(
			slotIn(canvasElement, "library-comment-mode-hint"),
		).toBeVisible()

		const card = slotIn(canvasElement, "library-comment-thread")
		within(card).getByPlaceholderText("Reply, @ to mention").focus()
		await userEvent.keyboard("{Escape}")
		await expect(args.openCommentThread?.onClose).toHaveBeenCalledTimes(1)
		await expect(args.onLeaveCommentMode).not.toHaveBeenCalled()
		await expect(commentButton).toHaveAttribute("aria-pressed", "true")
	},
})

const EscapeLadderBoard = ({
	commentDraft,
	openCommentThread,
	...props
}: BoardCanvasProps) => {
	const [value, setValue] = useState("")
	const [reply, setReply] = useState("")
	const [isDrafting, setDrafting] = useState(true)
	const [isThreadOpen, setThreadOpen] = useState(false)

	return (
		<CommentedBoard
			{...props}
			commentDraft={
				commentDraft && isDrafting
					? {
							...commentDraft,
							value,
							onValueChange: setValue,
							onClose: () => {
								setDrafting(false)
								commentDraft.onClose()
							},
						}
					: undefined
			}
			onOpenCommentThread={(id) => {
				setThreadOpen(true)
				props.onOpenCommentThread?.(id)
			}}
			openCommentThread={
				openCommentThread && isThreadOpen
					? {
							...openCommentThread,
							reply,
							onReplyChange: setReply,
							onClose: () => {
								setThreadOpen(false)
								openCommentThread.onClose()
							},
						}
					: undefined
			}
		/>
	)
}

const expectMentionMenuClosedByEscape = async (
	root: HTMLElement,
	field: HTMLElement,
) => {
	field.focus()
	await userEvent.keyboard("@")
	await within(root).findByRole("listbox", { name: "Mention" })
	await userEvent.keyboard("{Escape}")
	await waitFor(() =>
		expect(within(root).queryByRole("listbox", { name: "Mention" })).toBeNull(),
	)
	await expect(field).toHaveValue("@")
	await expect(field).toHaveFocus()
}

export const CommentEscapeClosesInnermost = meta.story({
	tags: ["test-only"],
	globals: LAPTOP_WINDOW,
	args: {
		...COMMENT_ARGS,
		isCommentMode: true,
		commentDraft: { ...COMMENT_DRAFT, anchor: BOAT.id },
		openCommentThread: OPEN_BOAT_THREAD,
	},
	render: (args) => <EscapeLadderBoard {...args} />,
	parameters: commentDocs(
		"Comment mode on with a comment being written on the Boat shape and the mention menu open, then Esc pressed again and again. Check the first Esc closing the menu alone with the draft and its @ kept, the second closing the composer alone, the same two steps on a thread card opened from its pin, comment mode kept all along, and one more Esc from the page leaving the mode.",
	),
	play: async ({ canvasElement, args }) => {
		const commentButton = within(canvasElement).getByRole("button", {
			name: "Comment",
		})
		const expectStillCommenting = async () => {
			await expect(args.onLeaveCommentMode).not.toHaveBeenCalled()
			await expect(commentButton).toHaveAttribute("aria-pressed", "true")
		}

		const composer = slotIn(canvasElement, "library-comment-composer")
		await expectMentionMenuClosedByEscape(
			canvasElement,
			within(composer).getByPlaceholderText("Comment, @ to mention"),
		)
		await expect(args.commentDraft?.onClose).not.toHaveBeenCalled()
		await expectStillCommenting()

		await userEvent.keyboard("{Escape}")
		await waitFor(() =>
			expect(slotsIn(canvasElement, "library-comment-composer")).toEqual([]),
		)
		await expect(args.commentDraft?.onClose).toHaveBeenCalledTimes(1)
		await expectStillCommenting()

		await userEvent.click(pinIn(commentMarkOf(canvasElement, BOAT_THREAD.id)))
		const card = slotIn(canvasElement, "library-comment-thread")
		await expectMentionMenuClosedByEscape(
			canvasElement,
			within(card).getByPlaceholderText("Reply, @ to mention"),
		)
		await expect(args.openCommentThread?.onClose).not.toHaveBeenCalled()
		await expectStillCommenting()

		await userEvent.keyboard("{Escape}")
		await waitFor(() =>
			expect(slotsIn(canvasElement, "library-comment-thread")).toEqual([]),
		)
		await expect(args.openCommentThread?.onClose).toHaveBeenCalledTimes(1)
		await expectStillCommenting()

		await userEvent.keyboard("{Escape}")
		await expect(args.onLeaveCommentMode).toHaveBeenCalledTimes(1)
		await expect(commentButton).toHaveAttribute("aria-pressed", "false")
	},
})

const expectThreadCardNamed = async (root: HTMLElement, anchorLine: string) => {
	const boat = commentMarkOf(root, BOAT_THREAD.id)
	await expect(pinIn(boat)).toHaveAttribute("data-state", "selected")
	await expect(pinIn(commentMarkOf(root, DINNER_THREAD.id))).toHaveAttribute(
		"data-state",
		"rest",
	)
	const card = slotIn(root, "library-comment-thread")
	await expect(card).toHaveAccessibleName(anchorLine)
	await expect(card.getBoundingClientRect().width).toBe(360)
	const resolve = await expectTabLandsIn(pinIn(boat), card)
	await expect(resolve).toHaveAccessibleName("Resolve")
	await expect(resolve.matches(":focus-visible")).toBe(true)
	await userEvent.click(within(card).getByRole("button", { name: "Close" }))
	return { card: card.getBoundingClientRect(), pin: boat }
}

export const CommentThreadOpen = meta.story({
	globals: LAPTOP_WINDOW,
	args: { ...COMMENT_ARGS, openCommentThread: OPEN_BOAT_THREAD },
	render: renderCommentedBoard,
	parameters: commentDocs(
		"Artboard Board 5: the thread on the Boat shape open. Check its pin in the selected state and the two others at rest, the ring around the shape, the thread card 12 under the ring with its right edge on the ring right edge, named after the shape in curly quotes, Tab going from the pin into the card, and Close calling its callback.",
	),
	play: async ({ canvasElement, args }) => {
		const ring = await expectRingAround(
			canvasElement,
			BOAT.id,
			BOAT_RING_RADIUS,
		)
		const { card, pin } = await expectThreadCardNamed(
			canvasElement,
			BOAT_ANCHOR_LINE,
		)
		await expectPinOnNode(canvasElement, pin, BOAT.id)
		await expect(card.top).toBeCloseTo(ring.bottom + CARD_GAP_UNDER_RING, 1)
		await expect(card.right).toBeCloseTo(ring.right, 1)
		await expect(args.openCommentThread?.onClose).toHaveBeenCalledTimes(1)
	},
})

export const CommentThreadOpenDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CommentThreadOpen.input.args,
	render: renderCommentedBoard,
	parameters: commentDocs(
		"CommentThreadOpen in the dark theme: the selected pin, the ring in the dark Space colour and the thread card on the dark card ground, at the same placement.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await CommentThreadOpen.input.play?.(context)
	},
})

export const CommentOnGoneShape = meta.story({
	globals: LAPTOP_WINDOW,
	args: {
		...COMMENT_ARGS,
		commentThreads: [
			DINNER_THREAD,
			MARKET_THREAD,
			{ ...BOAT_THREAD, anchor: "boat-first-draft" },
		],
		openCommentThread: OPEN_BOAT_THREAD,
	},
	render: renderCommentedBoard,
	parameters: commentDocs(
		"Artboard Edge 2: the thread is on a shape that left the board. Check its pin staying on the last board point it had, here over the Boat shape drawn since, nothing ringed, the thread card 12 left of the pin with its top on the pin top, and its line saying the shape is no longer on the board.",
	),
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "board-comment-ring")).toEqual([])
		const { card, pin } = await expectThreadCardNamed(
			canvasElement,
			"On a shape that’s no longer on the board",
		)
		await expectPinTailAt(
			pin,
			boardPointOnScreen(canvasElement, BOAT_PIN_POINT),
		)
		const pinBox = pin.getBoundingClientRect()
		await expect(card.right).toBeCloseTo(pinBox.left - CARD_GAP_BEFORE_PIN, 1)
		await expect(card.top).toBeCloseTo(pinBox.top, 1)
	},
})

export const CommentOnGoneShapeDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CommentOnGoneShape.input.args,
	render: renderCommentedBoard,
	parameters: commentDocs(
		"CommentOnGoneShape in the dark theme: the pin on its last point and the thread card left of it, on the dark grounds.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await CommentOnGoneShape.input.play?.(context)
	},
})

export const CommentPinFollowsMovedNode = meta.story({
	globals: LAPTOP_WINDOW,
	args: COMMENT_ARGS,
	render: renderCommentedBoard,
	parameters: commentDocs(
		"The Dinner sticky dragged with its thread on it. Check the pin riding the corner of the sticky while the pointer is still down, before any move intent, and sitting on the same corner once the move is sent.",
	),
	play: async ({ canvasElement, args }) => {
		const dinner = objectNode(canvasElement, DINNER.id) as HTMLElement
		const mark = commentMarkOf(canvasElement, DINNER_THREAD.id)
		const before = dinner.getBoundingClientRect()
		const from = centreOf(dinner)
		const to = shifted(from, { x: -120, y: 60 })

		await expectPinOnNode(canvasElement, mark, DINNER.id)
		pointerAt("pointerdown", dinner, from)
		pointerAt("pointermove", document, to)
		await waitFor(() =>
			expect(dinner.getBoundingClientRect().x).toBeCloseTo(before.x - 120, 0),
		)
		await expectPinOnNode(canvasElement, mark, DINNER.id)
		await expect(args.onIntent).not.toHaveBeenCalled()

		pointerAt("pointerup", document, to)
		await waitFor(() =>
			expect(args.onIntent).toHaveBeenCalledWith({
				type: "move",
				id: DINNER.id,
				position: { x: DINNER.position.x - 120, y: DINNER.position.y + 60 },
			}),
		)
		await expectPinOnNode(canvasElement, mark, DINNER.id)
		await expect(dinner.getBoundingClientRect().x).toBeCloseTo(
			before.x - 120,
			0,
		)
	},
})

const expectCommentedNodeAt = async (root: HTMLElement, zoom: number) => {
	await waitFor(() => expect(zoomOf(root)).toBe(zoom))
	await expectPinOnNode(root, commentMarkOf(root, BOAT_THREAD.id), BOAT.id)
	await expectPinOnNode(root, commentMarkOf(root, DINNER_THREAD.id), DINNER.id)
	const ring = await expectRingAround(
		root,
		BOAT.id,
		`${Math.max(BOAT_DRAWN_RADIUS * zoom, RING_OUTSET)}px`,
	)
	const card = slotIn(root, "library-comment-thread").getBoundingClientRect()
	await expect(card.top).toBeCloseTo(ring.bottom + CARD_GAP_UNDER_RING, 1)
	await expect(card.right).toBeCloseTo(ring.right, 1)
}

export const CommentedNodeAcrossZoom = meta.story({
	globals: LAPTOP_WINDOW,
	args: { ...COMMENT_ARGS, openCommentThread: OPEN_BOAT_THREAD },
	render: renderCommentedBoard,
	parameters: commentDocs(
		"The thread on the Boat shape open, at 100% then at 150% and at 25%. Check the pin tail of each commented node staying 10 screen px left of its right edge and 10 screen px under its top at every zoom, the ring keeping its 6 screen px outset with the radius the shape is drawn with at that zoom, 12 then 18, and never under 6, and the thread card staying 12 under the ring with their right edges aligned.",
	),
	play: async ({ canvasElement }) => {
		const zoomIn = within(canvasElement).getByRole("button", {
			name: "Zoom in",
		})
		const zoomOut = within(canvasElement).getByRole("button", {
			name: "Zoom out",
		})

		await expectCommentedNodeAt(canvasElement, 1)
		await userEvent.click(zoomIn)
		await expectCommentedNodeAt(canvasElement, 1.5)
		for (const step of [1, 0.75, 0.5, 0.25]) {
			await userEvent.click(zoomOut)
			await waitFor(() => expect(zoomOf(canvasElement)).toBe(step))
		}
		await expectCommentedNodeAt(canvasElement, 0.25)
	},
})

export const CommentedNodeAcrossZoomDark = meta.story({
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	args: CommentedNodeAcrossZoom.input.args,
	render: renderCommentedBoard,
	parameters: commentDocs(
		"CommentedNodeAcrossZoom in the dark theme: the same pin distance, ring radius and card placement at each zoom, on the dark grounds.",
	),
	play: async (context) => {
		await expectDarkSurface(context.canvasElement)
		await CommentedNodeAcrossZoom.input.play?.(context)
	},
})
