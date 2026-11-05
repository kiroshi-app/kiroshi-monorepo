import { useState } from "react"
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test"

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
import {
	PERSON_AUTHOR,
	STICKY_TEXT,
} from "@workspace/ui/components/board/board.fixtures"
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
	...props
}: BoardCanvasProps) => {
	const [view, setView] = useState(initialView)
	const [viewport, setViewport] = useState(initialViewport)

	return (
		<div className="h-[640px] w-full">
			<BoardCanvas
				{...props}
				onIntent={(intent) => {
					setView((current) => applyIntent(current, intent))
					onIntent(intent)
				}}
				onViewportChange={(next) => {
					setViewport(next)
					onViewportChange(next)
				}}
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
	},
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The board of a Space in its own tab: a dot grid the board slides over, the objects it mounts through `renderObject`, and the zoom control at the bottom end corner. The viewport is controlled: two-finger scroll, the mouse wheel and the arrow keys with nothing selected pan, a pinch zooms around the pointer, the buttons step the zoom around the centre, and every move goes out through `onViewportChange`. Only the objects inside the visible area plus a margin are mounted. A press or Tab selects an object and draws its frame and corner handles in the Space colour, a selected shape gets its style bar above it, and every move, resize, text edit, style pick or delete goes out through `onIntent` as a `BoardIntent`: the canvas never changes the board itself. Connectors are drawn by the canvas from the live rects of their ends, Straight or Elbow: with `isConnecting` on, a hovered object shows its outline and four anchors, a drag from one anchor to another object's anchor sends a connect intent, and the flyout picks the kind of the next connector or of the selected one.",
			},
		},
	},
})

export const Empty = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A board with nothing on it yet. Check the two stickies in their 88 by 72 box, green behind at 8 degrees and yellow in front at -5, the title at weight 600 and the body, all centred in the canvas and staying put while the grid pans, the dots on a 24px pitch at 100%, and the zoom control: Zoom out and Zoom in by name, a focus ring from the keyboard, a hover and a press colour landing with no transition, the percentage following each step, and a screen reader hearing the percentage once per button press and never during a pinch. Pick EmptyDark for the dark theme, FiveHundredObjects for a board with content.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const board = slotIn(canvasElement, "board-canvas")
		const hint = slotIn(canvasElement, "board-empty-hint")
		const pattern = board.querySelector("pattern") as SVGPatternElement
		const hintBefore = hint.getBoundingClientRect()

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
