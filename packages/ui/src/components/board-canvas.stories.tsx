import { useState } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	colourTransitionsOf,
	isInBrowserRunner,
	slotIn,
	slotsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	BoardCanvas,
	type BoardCanvasProps,
} from "@workspace/ui/components/board-canvas"
import type {
	BoardItem,
	BoardObject,
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
	to: `note-${row * COLUMNS + 2}`,
	zOrder: 0,
	text: "",
}))

const FIVE_HUNDRED_OBJECTS = { objects: [...NOTES, ...ROW_LINKS] }
const EMPTY_BOARD = { objects: [] }
const AT_ORIGIN: BoardViewport = { offset: { x: 24, y: 24 }, zoom: 1 }
const LAST_NOTE = NOTES.at(-1) as BoardItem

type PlaceholderObjectProps = {
	object: BoardObject
}

const PlaceholderObject = ({ object }: PlaceholderObjectProps) =>
	object.kind === "connector" ? (
		<div className="size-full rounded-md border border-border border-dashed" />
	) : (
		<div className="flex size-full items-center justify-center rounded-md border border-border bg-card text-muted-foreground text-xs">
			{object.text}
		</div>
	)

const ControlledBoard = ({
	viewport: initialViewport,
	onViewportChange,
	...props
}: BoardCanvasProps) => {
	const [viewport, setViewport] = useState(initialViewport)

	return (
		<div className="h-[640px] w-full">
			<BoardCanvas
				{...props}
				onViewportChange={(next) => {
					setViewport(next)
					onViewportChange(next)
				}}
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

const meta = preview.meta({
	title: "Navigation/BoardCanvas",
	component: BoardCanvas,
	render: (args) => <ControlledBoard {...args} />,
	args: {
		view: EMPTY_BOARD,
		viewport: AT_ORIGIN,
		onViewportChange: fn(),
		renderObject: (object) => <PlaceholderObject object={object} />,
	},
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The board of a Space in its own tab: a dot grid the board slides over, the objects it mounts through `renderObject`, and the zoom control at the bottom end corner. The viewport is controlled: two-finger scroll and the mouse wheel pan, a pinch zooms around the pointer, the buttons step the zoom around the centre, and every move goes out through `onViewportChange`. Only the objects inside the visible area plus a margin are mounted.",
			},
		},
	},
})

export const Empty = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A board with nothing on it yet. Check the two stickies, the title and the body centred in the canvas and staying put while the grid pans, the dots on a 24px pitch at 100%, and the zoom control: Zoom out and Zoom in by name, a focus ring from the keyboard, a hover and a press colour landing with no transition, the percentage following each step, and a screen reader hearing the percentage once per button press and never during a pinch. Pick EmptyDark for the dark theme, FiveHundredObjects for a board with content.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const board = slotIn(canvasElement, "board-canvas")
		const hint = slotIn(canvasElement, "board-empty-hint")
		const pattern = board.querySelector("pattern") as SVGPatternElement
		const hintBefore = hint.getBoundingClientRect()

		await expect(canvas.getByText("An empty board")).toBeVisible()
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

const DARK_BOARD_SURFACE = "rgb(22, 22, 24)"

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
		await expect(
			getComputedStyle(slotIn(context.canvasElement, "board-canvas"))
				.backgroundColor,
		).toBe(DARK_BOARD_SURFACE)
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
		await expect(objectNode(board, "link-1")).not.toBeNull()

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
		await expect(
			getComputedStyle(slotIn(context.canvasElement, "board-canvas"))
				.backgroundColor,
		).toBe(DARK_BOARD_SURFACE)
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
			expect(slotsIn(board, "board-object")).toHaveLength(
				FIVE_HUNDRED_OBJECTS.objects.length,
			),
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
