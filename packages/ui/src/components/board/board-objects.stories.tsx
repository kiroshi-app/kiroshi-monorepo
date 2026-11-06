import { type ReactNode, useState } from "react"
import { expect, fn, userEvent, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	LAPTOP_WINDOW,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { CASA_DO_RIO_TERRACE } from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import {
	AGENT_AUTHOR,
	LIBRARY_DOCUMENT,
	LIBRARY_ITEMS,
	LINK_CARD,
	PERSON_AUTHOR,
	STICKY_TEXT,
} from "@workspace/ui/components/board/board.fixtures"
import { BoardImage } from "@workspace/ui/components/board/board-image"
import { BoardLibraryCard } from "@workspace/ui/components/board/board-library-card"
import { BoardLinkCard } from "@workspace/ui/components/board/board-link-card"
import { BoardSection } from "@workspace/ui/components/board/board-section"
import { BoardShape } from "@workspace/ui/components/board/board-shape"
import { BoardSticky } from "@workspace/ui/components/board/board-sticky"
import { BoardText } from "@workspace/ui/components/board/board-text"
import { BoardCanvas } from "@workspace/ui/components/board-canvas"
import type {
	BoardItem,
	BoardItemKind,
	BoardSize,
} from "@workspace/ui/components/board-view"

type PlayContext = { canvasElement: HTMLElement }

type PlacedProps = { x: number; y: number; children: ReactNode }

const Placed = ({ x, y, children }: PlacedProps) => (
	<div className="absolute" style={{ left: x, top: y }}>
		{children}
	</div>
)

const OBJECT_SLOTS = [
	"board-text",
	"board-section",
	"board-sticky",
	"board-shape",
	"board-link-card",
	"board-image",
	"board-image-source",
	"board-library-card",
]

const LinkAndImagePastedBoard = () => (
	<div className="relative" style={{ width: 1120, height: 680 }}>
		<Placed x={40} y={40}>
			<BoardText
				body="Everything the team needs before Friday: the plan, the open questions and who owns each one."
				heading="Launch week"
			/>
		</Placed>
		<Placed x={40} y={170}>
			<BoardSection height={470} tint="blue" title="Research" width={560} />
		</Placed>
		<Placed x={64} y={226}>
			<BoardSticky author={AGENT_AUTHOR} colour="yellow" text={STICKY_TEXT} />
		</Placed>
		<Placed x={240} y={226}>
			<BoardSticky
				author={PERSON_AUTHOR}
				colour="green"
				text="Ask support which onboarding step loses people"
			/>
		</Placed>
		<Placed x={416} y={226}>
			<BoardSticky
				author={AGENT_AUTHOR}
				colour="pink"
				text="Three teams asked for a calmer empty state"
			/>
		</Placed>
		<Placed x={64} y={420}>
			<BoardLinkCard {...LINK_CARD} />
		</Placed>
		<Placed x={384} y={420}>
			<BoardImage
				alt="A rooftop pool above the city"
				height={136}
				src={LINK_CARD.preview}
				width={200}
			/>
		</Placed>
		<Placed x={640} y={40}>
			<BoardSection height={300} tint="purple" title="Ideas" width={440} />
		</Placed>
		<Placed x={664} y={96}>
			<BoardShape
				height={80}
				kind="rounded-rectangle"
				label="Research"
				width={144}
			/>
		</Placed>
		<Placed x={840} y={92}>
			<BoardShape height={88} kind="ellipse" label="Ship" width={136} />
		</Placed>
		<Placed x={664} y={220}>
			<BoardShape
				height={72}
				kind="rounded-rectangle"
				label="Measure"
				width={152}
			/>
		</Placed>
		<Placed x={640} y={380}>
			<BoardImage
				alt="A terrace over the river at dusk"
				height={136}
				source="example.com/terrace-at-dusk"
				src={CASA_DO_RIO_TERRACE}
				width={200}
			/>
		</Placed>
		<Placed x={864} y={380}>
			<BoardLibraryCard {...LIBRARY_DOCUMENT} />
		</Placed>
	</div>
)

const playEveryObject = async ({ canvasElement }: PlayContext) => {
	for (const slot of OBJECT_SLOTS) {
		await expect(slotsIn(canvasElement, slot).length, slot).toBeGreaterThan(0)
	}
}

const meta = preview.meta({
	title: "Board/BoardObjects",
	render: () => <LinkAndImagePastedBoard />,
	parameters: { layout: "padded" },
	play: playEveryObject,
})

export const LinkAndImagePasted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every board object placed together, after a link and an image were pasted: text, two sections, stickies by an agent and a person, three shapes, a link card, an image with and without its source, and a Library card at rest. Reach for it to review the objects side by side with the 5b artboard.",
			},
		},
	},
})

export const LinkAndImagePastedDark = meta.story({
	globals: { theme: "dark" },
})

const FIT_ID = "fitted"
const FIT_ORIGIN = { x: 40, y: 40 }
const FRAME_OUTSET = 4
const KEY_STEP_LARGE = 10

type FitCase = {
	kind: BoardItemKind
	text: string
	size: BoardSize
	render: (item: BoardItem) => ReactNode
}

type FittedBoardProps = { fit: FitCase }

const FittedBoard = ({ fit }: FittedBoardProps) => {
	const [item, setItem] = useState<BoardItem>({
		id: FIT_ID,
		kind: fit.kind,
		position: FIT_ORIGIN,
		size: fit.size,
		zOrder: 1,
		text: fit.text,
	})

	return (
		<div className="h-[640px] w-full">
			<BoardCanvas
				libraryItems={LIBRARY_ITEMS}
				onDropFiles={fn()}
				onDropUrl={fn()}
				onIntent={(intent) => {
					if (intent.type !== "resize") return
					setItem((current) => ({
						...current,
						position: intent.position,
						size: intent.size,
					}))
				}}
				onLibraryItemDrop={fn()}
				onLibraryItemPick={fn()}
				onPaste={() => undefined}
				onToolChange={fn()}
				onViewportChange={fn()}
				renderObject={fit.render}
				tool="select"
				view={{ objects: [item] }}
				viewport={{ offset: { x: 0, y: 0 }, zoom: 1 }}
			/>
		</div>
	)
}

const fittedObjectIn = (root: HTMLElement) =>
	root.querySelector<HTMLElement>(
		`[data-slot="board-object"][data-object-id="${FIT_ID}"]`,
	) as HTMLElement

const contentOf = (object: HTMLElement) =>
	object.firstElementChild as HTMLElement

const expectContentInFrame = async (root: HTMLElement, size: BoardSize) => {
	const object = fittedObjectIn(root)
	const frame = object.getBoundingClientRect()
	const selection = slotIn(
		root,
		"board-selection-frame",
	).getBoundingClientRect()
	const content = contentOf(object)
	const box = content.getBoundingClientRect()
	await expect(frame.width).toBeCloseTo(size.width, 0)
	await expect(frame.height).toBeCloseTo(size.height, 0)
	await expect(selection.width).toBeCloseTo(frame.width + FRAME_OUTSET * 2, 0)
	await expect(selection.height).toBeCloseTo(frame.height + FRAME_OUTSET * 2, 0)
	await expect(box.left).toBeCloseTo(frame.left, 0)
	await expect(box.top).toBeCloseTo(frame.top, 0)
	await expect(box.width).toBeCloseTo(frame.width, 0)
	await expect(box.height).toBeCloseTo(frame.height, 0)
	await expect(getComputedStyle(content).overflow).toBe("hidden")
}

const handleCentre = (root: HTMLElement) => {
	const [, , , bottomRight] = slotsIn(root, "board-selection-handle")
	const rect = bottomRight.getBoundingClientRect()
	return {
		handle: bottomRight,
		at: { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 },
	}
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

const dragBottomRightTo = async (
	root: HTMLElement,
	from: BoardSize,
	to: BoardSize,
) => {
	await userEvent.click(fittedObjectIn(root))
	await expectContentInFrame(root, from)
	const { handle, at } = handleCentre(root)
	const end = {
		clientX: at.clientX + to.width - from.width,
		clientY: at.clientY + to.height - from.height,
	}
	pointerAt("pointerdown", handle, at)
	pointerAt("pointermove", document, end)
	await waitFor(() =>
		expect(fittedObjectIn(root).getBoundingClientRect().width).toBeCloseTo(
			to.width,
			0,
		),
	)
	await expectContentInFrame(root, to)
	pointerAt("pointerup", document, end)
	await expectContentInFrame(root, to)
}

const pressRepeatedly = (key: string, times: number) =>
	`{Alt>}{Shift>}${`{${key}}`.repeat(times)}{/Shift}{/Alt}`

const resizeByKeyboardTo = async (
	root: HTMLElement,
	from: BoardSize,
	to: BoardSize,
) => {
	await userEvent.click(fittedObjectIn(root))
	await expectContentInFrame(root, from)
	const across = (to.width - from.width) / KEY_STEP_LARGE
	const down = (to.height - from.height) / KEY_STEP_LARGE
	await userEvent.keyboard(
		pressRepeatedly(across < 0 ? "ArrowLeft" : "ArrowRight", Math.abs(across)),
	)
	await userEvent.keyboard(
		pressRepeatedly(down < 0 ? "ArrowUp" : "ArrowDown", Math.abs(down)),
	)
	await expectContentInFrame(root, to)
}

type FitStory = {
	fit: FitCase
	to: BoardSize
	description: string
	resize?: typeof dragBottomRightTo
}

const fitStory = ({
	fit,
	to,
	description,
	resize = dragBottomRightTo,
}: FitStory) => ({
	globals: LAPTOP_WINDOW,
	render: () => <FittedBoard fit={fit} />,
	parameters: {
		layout: "fullscreen" as const,
		docs: { description: { story: description } },
	},
	play: ({ canvasElement }: PlayContext) => resize(canvasElement, fit.size, to),
})

const STICKY_FIT: FitCase = {
	kind: "sticky",
	text: STICKY_TEXT,
	size: { width: 160, height: 160 },
	render: (item) => (
		<BoardSticky author={AGENT_AUTHOR} colour="yellow" text={item.text} />
	),
}

const TEXT_FIT: FitCase = {
	kind: "text",
	text: "Everything the team needs before Friday: the plan, the open questions and who owns each one.",
	size: { width: 300, height: 96 },
	render: (item) => <BoardText body={item.text} heading="Launch week" />,
}

const SHAPE_FIT: FitCase = {
	kind: "shape",
	text: "Research",
	size: { width: 144, height: 80 },
	render: ({ text, size }) => (
		<BoardShape
			height={size.height}
			kind="rounded-rectangle"
			label={text}
			width={size.width}
		/>
	),
}

const SECTION_FIT: FitCase = {
	kind: "shape",
	text: "Research",
	size: { width: 440, height: 300 },
	render: ({ text, size }) => (
		<BoardSection
			height={size.height}
			tint="blue"
			title={text}
			width={size.width}
		/>
	),
}

const IMAGE_FIT: FitCase = {
	kind: "image",
	text: "A terrace over the river at dusk",
	size: { width: 220, height: 146 },
	render: ({ text, size }) => (
		<BoardImage
			alt={text}
			height={size.height}
			source="example.com/terrace-at-dusk"
			src={CASA_DO_RIO_TERRACE}
			width={size.width}
		/>
	),
}

const LINK_CARD_FIT: FitCase = {
	kind: "link",
	text: LINK_CARD.title,
	size: { width: 300, height: 178 },
	render: () => <BoardLinkCard {...LINK_CARD} />,
}

const LIBRARY_CARD_FIT: FitCase = {
	kind: "link",
	text: "Terrace at dusk",
	size: { width: 236, height: 131 },
	render: ({ text }) => <BoardLibraryCard excerpt="" title={text} />,
}

const DOCUMENT_CARD_FIT: FitCase = {
	kind: "link",
	text: LIBRARY_DOCUMENT.title,
	size: { width: 236, height: 131 },
	render: () => <BoardLibraryCard {...LIBRARY_DOCUMENT} />,
}

export const StickyWiderAndShorter = meta.story(
	fitStory({
		fit: STICKY_FIT,
		to: { width: 320, height: 96 },
		description:
			"A sticky dragged by its bottom right handle to twice its width and a lower height: the sticky fills the frame during the drag and after release, its text clipped at the bottom edge.",
	}),
)

export const StickyNarrowerAndTaller = meta.story(
	fitStory({
		fit: STICKY_FIT,
		to: { width: 96, height: 280 },
		description:
			"A sticky dragged narrower and taller: its text reflows to the frame width and the sticky fills the frame.",
	}),
)

export const TextWiderAndShorter = meta.story(
	fitStory({
		fit: TEXT_FIT,
		to: { width: 480, height: 56 },
		description:
			"A text block dragged wider and shorter: the text reflows to the frame width and whatever runs past the bottom edge is clipped.",
	}),
)

export const TextNarrowerAndTaller = meta.story(
	fitStory({
		fit: TEXT_FIT,
		to: { width: 160, height: 240 },
		description:
			"A text block dragged narrower and taller: the heading and body wrap inside the frame.",
	}),
)

export const ShapeWiderAndShorter = meta.story(
	fitStory({
		fit: SHAPE_FIT,
		to: { width: 288, height: 48 },
		description:
			"A shape dragged wider and shorter: the outline follows the frame during the drag, not only after release.",
	}),
)

export const ShapeNarrowerAndTaller = meta.story(
	fitStory({
		fit: SHAPE_FIT,
		to: { width: 96, height: 160 },
		description:
			"A shape dragged narrower and taller, its label centred inside.",
	}),
)

export const SectionWiderAndShorter = meta.story(
	fitStory({
		fit: SECTION_FIT,
		to: { width: 640, height: 200 },
		description:
			"A section dragged wider and shorter: its tinted area matches the frame.",
	}),
)

export const SectionNarrowerAndTaller = meta.story(
	fitStory({
		fit: SECTION_FIT,
		to: { width: 240, height: 420 },
		description:
			"A section dragged narrower and taller, its title chip truncated inside it.",
	}),
)

export const ImageWiderAndShorter = meta.story(
	fitStory({
		fit: IMAGE_FIT,
		to: { width: 400, height: 96 },
		description:
			"An image with its source dragged wider and shorter: the picture shrinks so the picture and its caption both stay inside the frame.",
	}),
)

export const ImageNarrowerAndTaller = meta.story(
	fitStory({
		fit: IMAGE_FIT,
		to: { width: 120, height: 240 },
		description:
			"An image with its source dragged narrower and taller, cropped to cover the frame above its caption.",
	}),
)

export const LinkCardWiderAndShorter = meta.story(
	fitStory({
		fit: LINK_CARD_FIT,
		to: { width: 480, height: 120 },
		description:
			"A link card dragged wider and shorter: the card fills the frame and its text is cut at the bottom edge.",
	}),
)

export const LinkCardNarrowerAndTaller = meta.story(
	fitStory({
		fit: LINK_CARD_FIT,
		to: { width: 200, height: 280 },
		description:
			"A link card dragged narrower and taller: the card fills the frame and its title truncates to the width.",
	}),
)

export const LibraryCardWiderAndShorter = meta.story(
	fitStory({
		fit: LIBRARY_CARD_FIT,
		to: { width: 400, height: 80 },
		description:
			"A Library card dragged wider and shorter by its handle: the four corner handles show and the card fills the frame.",
	}),
)

export const LibraryCardNarrowerAndTaller = meta.story(
	fitStory({
		fit: LIBRARY_CARD_FIT,
		to: { width: 136, height: 261 },
		resize: resizeByKeyboardTo,
		description:
			"A Library card resized narrower and taller with Alt+Shift and the arrow keys, like every other kind: the card fills the frame at each step.",
	}),
)

export const DocumentCardWiderAndShorter = meta.story(
	fitStory({
		fit: DOCUMENT_CARD_FIT,
		to: { width: 472, height: 64 },
		description:
			"The reported case: a Library document stretched wide and short. The card fills the frame and its excerpt is cut at the bottom edge, nothing painted below it.",
		resize: async (root, from, to) => {
			await dragBottomRightTo(root, from, to)
			const frame = fittedObjectIn(root).getBoundingClientRect()
			const excerpt = slotIn(
				root,
				"board-library-card-excerpt",
			).getBoundingClientRect()
			await expect(excerpt.top).toBeLessThan(frame.bottom)
			await expect(excerpt.bottom).toBeGreaterThan(frame.bottom)
		},
	}),
)

export const DocumentCardNarrowerAndTaller = meta.story(
	fitStory({
		fit: DOCUMENT_CARD_FIT,
		to: { width: 160, height: 240 },
		description:
			"A Library document dragged narrower and taller: its excerpt reflows to the width and the card fills the frame.",
	}),
)
