import { type ReactNode, useState } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import type {
	BoardObjectOutlineSpec,
	BoardPointerPlacement,
	BoardPresenceOwner,
} from "@workspace/ui/components/board/board-presence"
import { BoardShape } from "@workspace/ui/components/board/board-shape"
import {
	BoardSticky,
	type BoardStickyAuthor,
} from "@workspace/ui/components/board/board-sticky"
import { BoardText } from "@workspace/ui/components/board/board-text"
import { BoardCanvas } from "@workspace/ui/components/board-canvas"
import type {
	BoardItem,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import { LibraryDocumentPresence } from "@workspace/ui/components/library-document-agents"
import { contrastRatio, type Rgb } from "@workspace/ui/lib/contrast"

const ATLAS: BoardPresenceOwner = {
	kind: "agent",
	id: "agent-atlas",
	name: "Atlas",
	hue: 220,
}

const JUNIPER: BoardPresenceOwner = {
	kind: "agent",
	id: "agent-juniper",
	name: "Juniper",
	hue: 130,
}

const LENA: BoardPresenceOwner = {
	kind: "person",
	id: "person-lena",
	name: "Lena",
	hue: 257,
}

const MAXIMILIAN: BoardPresenceOwner = {
	kind: "person",
	id: "person-maximilian",
	name: "Maximilian Alexander Featherstonehaugh-Montgomery",
	hue: 296,
}

const authorOf = ({
	kind,
	name,
	hue,
}: BoardPresenceOwner): BoardStickyAuthor =>
	kind === "agent" ? { kind, name, hue } : { kind, name }

const ATLAS_INK = "rgb(0, 128, 164)"
const LENA_ACCENT = "rgb(45, 98, 172)"
const NAME_CONTRAST_MIN = 4.5
const WHOLE_PIXEL_DRIFT = 0.5

const item = (
	id: string,
	kind: BoardItem["kind"],
	x: number,
	y: number,
	width: number,
	height: number,
): BoardItem => ({
	id,
	kind,
	position: { x, y },
	size: { width, height },
	zOrder: 1,
	text: "",
})

const BOARD = {
	objects: [
		item("heading", "text", 0, 0, 400, 56),
		item("sticky-atlas", "sticky", 0, 96, 160, 160),
		item("sticky-lena", "sticky", 192, 96, 160, 160),
		item("sticky-juniper", "sticky", 384, 96, 160, 160),
		item("shape-juniper", "shape", 600, 112, 160, 88),
		item("shape-ship", "shape", 600, 240, 136, 88),
	],
}

const AT_ORIGIN: BoardViewport = { offset: { x: 40, y: 40 }, zoom: 1 }

const ATLAS_POINTER: BoardPointerPlacement = {
	owner: ATLAS,
	position: { x: 132, y: 154 },
}

const JUNIPER_POINTER: BoardPointerPlacement = {
	owner: JUNIPER,
	position: { x: 756, y: 196 },
}

const LENA_POINTER: BoardPointerPlacement = {
	owner: LENA,
	position: { x: 300, y: 300 },
}

const ATLAS_WRITING: BoardObjectOutlineSpec = {
	objectId: "sticky-atlas",
	owner: ATLAS,
	state: "writing",
}

const JUNIPER_DRAWING: BoardObjectOutlineSpec = {
	objectId: "shape-juniper",
	owner: JUNIPER,
	state: "drawing",
}

const sceneObject = (id: string, isAgentWriting: boolean): ReactNode => {
	switch (id) {
		case "heading":
			return <BoardText heading="Launch week" />
		case "sticky-atlas":
			return (
				<BoardSticky
					author={authorOf(ATLAS)}
					colour="yellow"
					isAgentWriting={isAgentWriting}
					text="Draft the launch plan before Friday"
				/>
			)
		case "sticky-lena":
			return (
				<BoardSticky
					author={authorOf(LENA)}
					colour="green"
					text="Ask support which onboarding step loses people"
				/>
			)
		case "sticky-juniper":
			return (
				<BoardSticky
					author={authorOf(JUNIPER)}
					colour="pink"
					text="Three teams asked for a calmer empty state"
				/>
			)
		case "shape-juniper":
			return (
				<BoardShape
					height={88}
					kind="rounded-rectangle"
					label="Measure"
					width={160}
				/>
			)
		default:
			return <BoardShape height={88} kind="ellipse" label="Ship" width={136} />
	}
}

type PresenceBoardProps = {
	outlines: BoardObjectOutlineSpec[]
	pointers: BoardPointerPlacement[]
	people: BoardPresenceOwner[]
	onStopAll: () => void
}

const PresenceBoard = ({
	outlines,
	pointers,
	people,
	onStopAll,
}: PresenceBoardProps) => {
	const [viewport, setViewport] = useState(AT_ORIGIN)
	const drawing = outlines.map(({ owner }) => ({ agent: owner }))

	return (
		<div className="flex h-[640px] w-full flex-col bg-background">
			<div className="flex h-12 shrink-0 items-center justify-end gap-2 px-4">
				<LibraryDocumentPresence
					activity="drawing"
					onStopAll={onStopAll}
					people={people}
					writers={drawing}
				/>
			</div>
			<div className="min-h-0 flex-1">
				<BoardCanvas
					onIntent={fn()}
					onViewportChange={setViewport}
					outlines={outlines}
					pointers={pointers}
					renderObject={(object) =>
						sceneObject(
							object.id,
							outlines.some(
								({ objectId, state }) =>
									objectId === object.id && state === "writing",
							),
						)
					}
					view={BOARD}
					viewport={viewport}
				/>
			</div>
		</div>
	)
}

type PlayContext = { canvasElement: HTMLElement }

const toRgb = (color: string) =>
	(color.match(/\d+/g) ?? []).slice(0, 3).map(Number) as Rgb

const pointerOf = (root: Element, name: string) => {
	const pointer = slotsIn(root, "board-pointer").find(
		(node) => slotIn(node, "board-pointer-name").textContent === name,
	)
	if (!pointer) throw new Error(`No pointer for ${name}`)
	return pointer as HTMLElement
}

const ownerFillOf = (pointer: Element) => {
	const arrow = slotIn(pointer, "board-pointer-arrow").querySelector("path")
	if (!arrow) throw new Error("The pointer has no arrow")
	return {
		arrow: getComputedStyle(arrow).fill,
		tag: getComputedStyle(slotIn(pointer, "board-pointer-tag")).backgroundColor,
		name: getComputedStyle(slotIn(pointer, "board-pointer-name")).color,
	}
}

const expectPointersPainted = async (root: HTMLElement) => {
	const pointers = slotsIn(root, "board-pointer")
	await expect(pointers.length).toBeGreaterThan(0)
	for (const pointer of pointers) {
		const { arrow, tag, name } = ownerFillOf(pointer)
		await expect(arrow).toBe(tag)
		await expect(name).toBe("rgb(255, 255, 255)")
		await expect(contrastRatio(toRgb(name), toRgb(tag))).toBeGreaterThanOrEqual(
			NAME_CONTRAST_MIN,
		)
		await expect(getComputedStyle(pointer).pointerEvents).toBe("none")
	}
}

const objectIn = (root: Element, id: string) =>
	slotsIn(root, "board-object").find(
		(node) => node.getAttribute("data-object-id") === id,
	) as HTMLElement

const ringOf = (root: Element, id: string) =>
	getComputedStyle(
		objectIn(root, id).firstElementChild?.firstElementChild as Element,
	).boxShadow

const expectChipLabel = async (root: HTMLElement, label: string) =>
	expect(
		within(slotIn(root, "library-document-presence")).getByText(label),
	).toBeVisible()

const meta = preview.meta({
	title: "Board/BoardPresence",
	component: PresenceBoard,
	args: {
		outlines: [ATLAS_WRITING],
		pointers: [ATLAS_POINTER],
		people: [],
		onStopAll: fn(),
	},
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Who is on a board. Each agent and each person gets a pointer, the arrow and a name tag in the owner colour, at a constant on-screen size whatever the zoom, above every object and out of hit testing. The object an agent works on wears a 2px ring and a caret while the agent writes in it, a soft 4px ring while it draws. The header shows the people stack, then the agents drawing chip with Stop all, the same chip a Library document shows while agents write.",
			},
		},
	},
})

export const OneAgent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Atlas writes in a sticky, alone on the board. Check the arrow and tag in Atlas teal, the white name, the 2px ring kept with the sticky shadow, the teal caret at the end of the text, the 1 agent drawing chip, and Stop all calling back once while the pointer and ring stay. Pick SeveralAgents for a drawing ring next to a writing one.",
			},
		},
	},
	play: async ({ canvasElement, args }) => {
		await expectPointersPainted(canvasElement)
		await expect(ownerFillOf(pointerOf(canvasElement, "Atlas")).tag).toBe(
			ATLAS_INK,
		)
		const ring = ringOf(canvasElement, "sticky-atlas")
		await expect(ring).toContain(`${ATLAS_INK} 0px 0px 0px 2px`)
		await expect(ring).toContain("0px 6px 14px 0px")
		const caret = slotIn(canvasElement, "board-sticky-caret")
		await expect(getComputedStyle(caret).backgroundColor).toBe(ATLAS_INK)
		await expect(caret.getBoundingClientRect()).toMatchObject({
			width: 2,
			height: 20,
		})
		await expectChipLabel(canvasElement, "1 agent drawing")

		await userEvent.click(
			within(canvasElement).getByRole("button", { name: "Stop all" }),
		)
		await expect(args.onStopAll).toHaveBeenCalledTimes(1)
		await expect(slotsIn(canvasElement, "board-pointer")).toHaveLength(1)
		await expect(slotsIn(canvasElement, "board-object-outline")).toHaveLength(1)
		await expect(ringOf(canvasElement, "sticky-atlas")).toBe(ring)
	},
})

export const OneAgentDark = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Atlas writing in a sticky in the dark theme. Check the same owner colour, white name, ring, caret and chip as OneAgent: the tag never follows the theme, so the name keeps its contrast.",
			},
		},
	},
	play: async (context) => {
		await OneAgent.input.play?.(context)
	},
})

const expectSeveralAgents = async ({ canvasElement }: PlayContext) => {
	await expectPointersPainted(canvasElement)
	await expect(ringOf(canvasElement, "sticky-atlas")).toContain(
		`${ATLAS_INK} 0px 0px 0px 2px`,
	)
	const drawingRing = ringOf(canvasElement, "shape-juniper")
	await expect(drawingRing).toMatch(/0\.25\) 0px 0px 0px 4px/)
	await expect(slotsIn(canvasElement, "board-sticky-caret")).toHaveLength(1)
	await expectChipLabel(canvasElement, "2 agents drawing")
}

export const SeveralAgents = meta.story({
	args: {
		outlines: [ATLAS_WRITING, JUNIPER_DRAWING],
		pointers: [ATLAS_POINTER, JUNIPER_POINTER],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Atlas writes in a sticky while Juniper draws a shape. Check the two pointers each in its own colour, the solid 2px ring with a caret on the sticky, the soft 4px ring at 25 percent on the shape, and the 2 agents drawing chip with two avatars. Pick PersonWithAgents to add a person.",
			},
		},
	},
	play: expectSeveralAgents,
})

export const SeveralAgentsDark = meta.story({
	globals: { theme: "dark" },
	args: SeveralAgents.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"Atlas writing and Juniper drawing in the dark theme. Check the same pointers, rings and chip as SeveralAgents over the dark board.",
			},
		},
	},
	play: expectSeveralAgents,
})

const pointerOrigin = (pointer: Element) => {
	const rect = pointer.getBoundingClientRect()
	return { x: rect.x, y: rect.y }
}

const expectPointerFollows = async (root: HTMLElement) => {
	const pointer = pointerOf(root, "Atlas")
	const tagSize = () => {
		const { width, height } = slotIn(
			pointer,
			"board-pointer-tag",
		).getBoundingClientRect()
		return { width, height }
	}
	const anchor = () => objectIn(root, "sticky-atlas").getBoundingClientRect()
	const atZoomOne = tagSize()
	const expectAnchored = async (zoom: number) => {
		await waitFor(() =>
			expect(
				within(slotIn(root, "board-zoom-level")).getByText(`${zoom * 100}%`),
			).toBeVisible(),
		)
		const { x, y } = anchor()
		const origin = pointerOrigin(pointerOf(root, "Atlas"))
		await expect(
			Math.abs(origin.x - (x + ATLAS_POINTER.position.x * zoom)),
		).toBeLessThanOrEqual(WHOLE_PIXEL_DRIFT)
		await expect(
			Math.abs(origin.y - (y + (ATLAS_POINTER.position.y - 96) * zoom)),
		).toBeLessThanOrEqual(WHOLE_PIXEL_DRIFT)
		await expect(tagSize()).toEqual(atZoomOne)
		await expect(pointerOf(root, "Atlas").style.transform).toMatch(
			/^translate\(-?\d+px, -?\d+px\)$/,
		)
	}
	const zoomOut = within(root).getByRole("button", { name: "Zoom out" })
	const zoomIn = within(root).getByRole("button", { name: "Zoom in" })

	await userEvent.click(zoomOut)
	await userEvent.click(zoomOut)
	await expectAnchored(0.5)
	for (let step = 0; step < 4; step += 1) await userEvent.click(zoomIn)
	await expectAnchored(2)

	const before = pointerOrigin(pointerOf(root, "Atlas"))
	slotIn(root, "board-canvas").dispatchEvent(
		new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			deltaX: 30,
			deltaY: 20,
		}),
	)
	await waitFor(() =>
		expect(pointerOrigin(pointerOf(root, "Atlas"))).toEqual({
			x: before.x - 30,
			y: before.y - 20,
		}),
	)
}

const expectPersonWithAgents = async ({ canvasElement }: PlayContext) => {
	await expectPointersPainted(canvasElement)
	await expect(ownerFillOf(pointerOf(canvasElement, "Lena")).tag).toBe(
		LENA_ACCENT,
	)
	await expect(
		within(slotIn(canvasElement, "library-document-people")).getByRole("img", {
			name: "Lena",
		}),
	).toBeVisible()
	await expectChipLabel(canvasElement, "2 agents drawing")

	const layer = slotIn(canvasElement, "board-pointers")
	await expect(layer).toHaveAttribute("aria-hidden", "true")
	await expect(getComputedStyle(layer).pointerEvents).toBe("none")
	await expect(
		layer.previousElementSibling?.querySelector('[data-slot="board-object"]'),
	).not.toBeNull()
	const tag = slotIn(pointerOf(canvasElement, "Lena"), "board-pointer-tag")
	const { x, y, width, height } = tag.getBoundingClientRect()
	await expect(
		tag.contains(document.elementFromPoint(x + width / 2, y + height / 2)),
	).toBe(false)

	await expectPointerFollows(canvasElement)
}

export const PersonWithAgents = meta.story({
	args: {
		outlines: [ATLAS_WRITING, JUNIPER_DRAWING],
		pointers: [ATLAS_POINTER, JUNIPER_POINTER, LENA_POINTER],
		people: [LENA],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Lena is on the board while Atlas writes and Juniper draws, the 4b artboard. Check Lena's pointer in her blue with her initial on a tint, the people stack before the chip, every pointer passing clicks through to the board, and the pointers keeping their size and their spot on the board through a zoom to 50 and 200 percent and a pan.",
			},
		},
	},
	play: expectPersonWithAgents,
})

export const PersonWithAgentsDark = meta.story({
	globals: { theme: "dark" },
	args: PersonWithAgents.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"Lena with Atlas and Juniper in the dark theme. Check the same pointers, people stack, chip and pan and zoom as PersonWithAgents.",
			},
		},
	},
	play: expectPersonWithAgents,
})

export const AgentsFinished = meta.story({
	args: {
		outlines: [],
		pointers: [LENA_POINTER],
		people: [LENA],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The agents have finished and only Lena is left, the 4e artboard. Check that the chip, the agent pointers, the rings and the caret are gone while the people stack and Lena's pointer stay. Pick PersonWithAgents for the board while agents still draw.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			canvasElement.querySelector('[data-slot="library-document-presence"]'),
		).toBeNull()
		await expect(slotsIn(canvasElement, "board-object-outline")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "board-sticky-caret")).toHaveLength(0)
		await expect(
			slotsIn(canvasElement, "board-pointer").map((pointer) =>
				pointer.getAttribute("data-owner-kind"),
			),
		).toEqual(["person"])
		await expect(slotIn(canvasElement, "library-document-people")).toBeVisible()
	},
})

export const LongContent = meta.story({
	args: {
		outlines: [],
		pointers: [{ owner: MAXIMILIAN, position: { x: 300, y: 300 } }],
		people: [MAXIMILIAN],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A person whose name runs past what the tag holds. Check the name cut with an ellipsis on one line at 160px, the tag keeping its 22px height.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const name = slotIn(canvasElement, "board-pointer-name")
		await expect(getComputedStyle(name).textOverflow).toBe("ellipsis")
		await expect(getComputedStyle(name).whiteSpace).toBe("nowrap")
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(name.getBoundingClientRect().width).toBe(160)
		await expect(
			slotIn(canvasElement, "board-pointer-tag").getBoundingClientRect().height,
		).toBe(22)
	},
})
