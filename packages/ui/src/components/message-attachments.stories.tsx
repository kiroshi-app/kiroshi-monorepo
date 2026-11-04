import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	GARDEN_PATIO,
	LOBBY,
	ROOFTOP_POOL,
	ROOM_DOUBLE,
} from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import {
	type MessageAttachment,
	MessageAttachments,
	type MessageAttachmentsProps,
} from "@workspace/ui/components/message-attachments"
import {
	MessageBubble,
	MessageBubbleContent,
	MessageBubbleGroup,
} from "@workspace/ui/components/message-bubble"

const SCREENSHOT_PREVIEW =
	"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22480%22%20height%3D%22320%22%20viewBox%3D%220%200%2096%2064%22%3E%3Crect%20width%3D%2296%22%20height%3D%2264%22%20fill%3D%22%231e293b%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2210%22%20width%3D%2252%22%20height%3D%228%22%20rx%3D%224%22%20fill%3D%22%23f97316%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2226%22%20width%3D%2280%22%20height%3D%226%22%20rx%3D%223%22%20fill%3D%22%23475569%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2240%22%20width%3D%2264%22%20height%3D%226%22%20rx%3D%223%22%20fill%3D%22%23475569%22%2F%3E%3C%2Fsvg%3E"

const TALL_PREVIEW =
	"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22320%22%20height%3D%22800%22%20viewBox%3D%220%200%2048%20120%22%3E%3Crect%20width%3D%2248%22%20height%3D%22120%22%20fill%3D%22%230f766e%22%2F%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2232%22%20r%3D%2214%22%20fill%3D%22%23a7f3d0%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2260%22%20width%3D%2232%22%20height%3D%2248%22%20rx%3D%226%22%20fill%3D%22%23134e4a%22%2F%3E%3C%2Fsvg%3E"

const DIAGRAM_PREVIEW =
	"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22240%22%20height%3D%22240%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20fill%3D%22%23312e81%22%2F%3E%3Ccircle%20cx%3D%2240%22%20cy%3D%2224%22%20r%3D%2214%22%20fill%3D%22%23c7d2fe%22%2F%3E%3C%2Fsvg%3E"

const BROKEN_PREVIEW = "data:image/png;base64,bm90LWFuLWltYWdl"

const ONE_IMAGE: MessageAttachment[] = [
	{
		id: "screenshot",
		name: "composer-empty.png",
		previewUrl: SCREENSHOT_PREVIEW,
	},
]

const SEVERAL_IMAGES: MessageAttachment[] = [
	...ONE_IMAGE,
	{ id: "capture", name: "sidebar-tall.png", previewUrl: TALL_PREVIEW },
	{ id: "diagram", name: "transport-diagram.svg", previewUrl: DIAGRAM_PREVIEW },
]

const MIXED_ITEMS: MessageAttachment[] = [
	...ONE_IMAGE,
	{ id: "notes", name: "release-notes.md" },
	{ id: "manifest", name: "components.json" },
]

const LONG_ITEMS: MessageAttachment[] = [
	...SEVERAL_IMAGES,
	{
		id: "report",
		name: "release-notes-for-the-desktop-shell-and-the-chat-surface.md",
	},
	{ id: "session", name: "session-2026-03-04.log" },
	{ id: "manifest", name: "components.json" },
	{ id: "changelog", name: "CHANGELOG.md" },
	{ id: "trace", name: "scroll-trace-2026-03-04.json" },
]

const THREAD_WIDTH = "w-[34rem] max-w-full"

const USER_PROMPT = "Here is what the composer looks like on my machine."

const AGENT_REPLY = "Thanks — I re-rendered it against the current tokens."

const FILLED_BY_TURN_BODY =
	"`apps/app/src/components/turn-body.tsx:9` hands over the files `apps/app/src/lib/chat/message-attachments.ts` read out of the message text."

const TWO_IMAGES: MessageAttachment[] = SEVERAL_IMAGES.slice(0, 2)

const MANY_IMAGES: MessageAttachment[] = [
	...SEVERAL_IMAGES,
	{ id: "double", name: "room-double.jpg", previewUrl: ROOM_DOUBLE },
	{ id: "pool", name: "rooftop-pool.jpg", previewUrl: ROOFTOP_POOL },
	{ id: "lobby", name: "lobby.jpg", previewUrl: LOBBY },
	{ id: "patio", name: "garden-patio.jpg", previewUrl: GARDEN_PATIO },
]

const THREAD_MENU_ORDER = ["Save to Library", "Copy image", "Open in viewer"]

const rowsIn = (canvasElement: HTMLElement) =>
	within(canvasElement).getAllByRole("group", { name: "Attachments" })

const tilesIn = (row: HTMLElement) =>
	Array.from(row.querySelectorAll<HTMLElement>("[data-slot='gallery'] button"))

const expectGalleryInBubble = async (row: HTMLElement, tileCount: number) => {
	const gallery = row.querySelector("[data-slot='gallery']")
	const bubble = row.closest("[data-slot='message-bubble-content']")
	await expect(tilesIn(row)).toHaveLength(tileCount)
	await waitFor(() =>
		expect(gallery?.getBoundingClientRect().width ?? 0).toBeGreaterThan(200),
	)
	await expect(gallery?.getBoundingClientRect().right ?? 0).toBeLessThanOrEqual(
		bubble?.getBoundingClientRect().right ?? 0,
	)
}

const expectBothBubbles = async (canvasElement: HTMLElement) => {
	const rows = rowsIn(canvasElement)
	await expect(rows).toHaveLength(2)
	await expect(rows[0].closest("[data-variant]")).toHaveAttribute(
		"data-variant",
		"solid",
	)
	await expect(rows[1].closest("[data-variant]")).toHaveAttribute(
		"data-variant",
		"soft",
	)
	return rows
}

const renderInBothBubbles = (args: MessageAttachmentsProps) => (
	<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
		<MessageBubble variant="solid" align="end">
			<MessageBubbleContent>
				<MessageAttachments {...args} />
				<p>{USER_PROMPT}</p>
			</MessageBubbleContent>
		</MessageBubble>
		<MessageBubble variant="soft" align="start">
			<MessageBubbleContent>
				<MessageAttachments {...args} />
				<p>{AGENT_REPLY}</p>
			</MessageBubbleContent>
		</MessageBubble>
	</MessageBubbleGroup>
)

const meta = preview.meta({
	title: "Conversation/Message/MessageAttachments",
	component: MessageAttachments,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The files a message carries, drawn inside its bubble above the text. Pictures, from the first one on, land in the answer-block `Gallery`: one large tile, then a 2 by 2 grid whose last tile counts what is hidden as +N. Anything else keeps its file chip, a glyph, its name and its extension, in a wrapping row under the gallery. Activating a tile or a chip reports the item's id: resolving, reading or opening the file is never this row's business. Passing `imageMenu` opens the `ImageMenu` at the pointer on a right-click on a tile; without it, right-click stays the platform's. Colors come from the bubble's own text color, so the row reads on the reader's `solid` bubble and the agent's `soft` one alike.",
			},
		},
	},
	args: { items: ONE_IMAGE, onOpen: fn() },
	render: (args) => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>
					<MessageAttachments {...args} />
					<p>{USER_PROMPT}</p>
				</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
})

export const Default = meta.story({
	render: renderInBothBubbles,
	parameters: {
		docs: {
			description: {
				story:
					"One screenshot, the commonest thing a reader sends, in the reader's bubble and in the agent's. Check that the lone picture fills one gallery tile inside each bubble, that activating it reports the item's id, since the host opens by id and an index would open the wrong file, and that with no `imageMenu` a right-click opens no menu and leaves the platform's own. " +
					FILLED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const rows = await expectBothBubbles(canvasElement)
		for (const row of rows) await expectGalleryInBubble(row, 1)

		const [tile] = tilesIn(rows[0])
		await expect(tile).toHaveAccessibleName("composer-empty.png")
		await userEvent.click(tile)
		await expect(args.onOpen).toHaveBeenCalledWith("screenshot")

		const contextMenu = new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
		})
		tile.dispatchEvent(contextMenu)
		await expect(contextMenu.defaultPrevented).toBe(false)
		await expect(screen.queryByRole("menu")).toBe(null)
	},
})

export const TwoImages = meta.story({
	args: { items: TWO_IMAGES },
	render: renderInBothBubbles,
	parameters: {
		docs: {
			description: {
				story:
					"Two pictures in the reader's bubble and in the agent's: the large tile and one full-height tile beside it, the tall capture cropped to its tile instead of stretching the bubble. Check both bubbles draw the same two tiles and the second one reports its own id. `ManyImages` covers the +N tile. " +
					FILLED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const rows = await expectBothBubbles(canvasElement)
		for (const row of rows) await expectGalleryInBubble(row, 2)

		await userEvent.click(tilesIn(rows[1])[1])
		await expect(args.onOpen).toHaveBeenCalledWith("capture")
	},
})

export const SeveralImages = meta.story({
	args: { items: SEVERAL_IMAGES },
	parameters: {
		docs: {
			description: {
				story:
					"Three pictures in one turn, one of them twice as tall as it is wide. Check that the large tile sits beside two stacked tiles, that the tall one is cropped to its tile instead of pushing the bubble down, and that every picture keeps its file name as its accessible name. " +
					FILLED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [row] = rowsIn(canvasElement)
		await expectGalleryInBubble(row, SEVERAL_IMAGES.length)
		await expect(
			within(row)
				.getAllByRole("img")
				.map((picture) => picture.getAttribute("alt")),
		).toEqual(SEVERAL_IMAGES.map((item) => item.name))
	},
})

export const ManyImages = meta.story({
	args: { items: MANY_IMAGES },
	render: renderInBothBubbles,
	parameters: {
		docs: {
			description: {
				story:
					"Seven pictures in the reader's bubble and in the agent's: five tiles, the last one counting the two left out as +2. Check that the +N tile still opens its own picture, the fifth, rather than the first hidden one. " +
					FILLED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const rows = await expectBothBubbles(canvasElement)
		for (const row of rows) {
			await expectGalleryInBubble(row, 5)
			await expect(
				row.querySelector("[data-slot='gallery-more']"),
			).toHaveTextContent("+2")
		}

		await userEvent.click(tilesIn(rows[0])[4])
		await expect(args.onOpen).toHaveBeenCalledWith("pool")
	},
})

export const MixedKinds = meta.story({
	args: { items: MIXED_ITEMS },
	parameters: {
		docs: {
			description: {
				story:
					"A screenshot next to two documents: the gallery and the file chips in one message. Check that the picture keeps its gallery tile while each document keeps its chip, glyph, name and extension, and that the chips wrap in a row under the gallery rather than squeezing beside it. `Error` covers a picture that fails to load. " +
					FILLED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const [row] = rowsIn(canvasElement)
		await expectGalleryInBubble(row, 1)
		await expect(canvas.getByText("release-notes.md")).toBeVisible()
		await expect(canvas.getByText("JSON")).toBeVisible()

		const gallery = row.querySelector("[data-slot='gallery']")
		const chips = within(row).getAllByRole("listitem")
		await expect(chips).toHaveLength(2)
		await expect(chips[0].getBoundingClientRect().top).toBeGreaterThanOrEqual(
			gallery?.getBoundingClientRect().bottom ?? 0,
		)
	},
})

export const States = meta.story({
	args: { items: MIXED_ITEMS },
	parameters: {
		docs: {
			description: {
				story:
					"The row under the keyboard: tabbing walks it in reading order, the gallery tile first, then each chip. Check that Enter on the tile and on a chip reports its id like a click, that the focus ring reads on the bubble's blue, and that hovering a chip shades it without moving it. " +
					FILLED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "composer-empty.png" }),
		).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpen).toHaveBeenLastCalledWith("screenshot")

		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Open release-notes.md" }),
		).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpen).toHaveBeenLastCalledWith("notes")
	},
})

export const LongContent = meta.story({
	args: { items: LONG_ITEMS },
	parameters: {
		docs: {
			description: {
				story:
					"More files than fit on one line, one named far past the width of a chip, under a three-picture gallery. Check that the chip row wraps into a second line instead of scrolling or squeezing, that a long name truncates while its extension stays put, and that the chips keep their reading order. " +
					FILLED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [row] = rowsIn(canvasElement)
		const chips = within(row).getAllByRole("listitem")
		const [first] = chips

		await expect(chips).toHaveLength(
			LONG_ITEMS.filter((item) => !item.previewUrl).length,
		)
		await waitFor(() =>
			expect(
				chips[chips.length - 1].getBoundingClientRect().top,
			).toBeGreaterThan(first.getBoundingClientRect().bottom),
		)
	},
})

export const Error = meta.story({
	args: {
		items: [
			{ id: "screenshot", name: "capture.png", previewUrl: BROKEN_PREVIEW },
			{ id: "notes", name: "release-notes.md" },
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A source the host resolved and no decoder accepts. Check that the broken picture keeps its gallery tile, drawn as an image glyph on a shaded tile rather than a torn-image icon or an empty box, that it keeps the file name as its accessible name, and that it stays activatable so the reader can still open the file. " +
					FILLED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const [row] = rowsIn(canvasElement)

		await waitFor(() =>
			expect(row.querySelector("[data-slot='gallery-broken']")).toBeVisible(),
		)
		await expect(row.querySelector("img")).toBe(null)

		await userEvent.click(canvas.getByRole("button", { name: "capture.png" }))
		await expect(args.onOpen).toHaveBeenCalledWith("screenshot")
	},
})

export const InTranscript = meta.story({
	args: { items: MIXED_ITEMS },
	render: renderInBothBubbles,
	parameters: {
		docs: {
			description: {
				story:
					"The mixed row on both surfaces it ever lands on: the reader's `solid` bubble and the agent's `soft` one. Check that the chip glyph, name and extension stay legible on the blue as well as on the muted grey, and that the chip border reads without turning into a hard edge. Flip the `theme_layout` toolbar to side-by-side before calling a change to these colors done. The row lands on the reader's bubble `packages/ui/src/components/turn.tsx:340` and on the agent's `packages/ui/src/components/turn.tsx:492`, filled both times by `apps/app/src/components/turn-body.tsx:9`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rows = await expectBothBubbles(canvasElement)
		for (const row of rows) await expectGalleryInBubble(row, 1)
	},
})

export const ImageMenuOpen = meta.story({
	args: {
		items: TWO_IMAGES,
		imageMenu: {
			onSaveToLibrary: fn(),
			onCopyImage: fn(),
			onOpenInViewer: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The `ImageMenu` open on a picture in the thread, on a right-click on its tile. Check that it opens at the pointer, lists Save to Library, Copy image, then Open in viewer, that an entry reports the picture's id, and that an entry shades on hover with no color transition. " +
					FILLED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const [row] = rowsIn(canvasElement)
		const tile = tilesIn(row)[1]
		const box = tile.getBoundingClientRect()
		const pointer = { clientX: box.left + 24, clientY: box.top + 32 }
		const openMenu = async () => {
			await userEvent.pointer({
				keys: "[MouseRight]",
				target: tile,
				coords: pointer,
			})
			return screen.findByRole("menu", {
				name: "Actions for sidebar-tall.png",
			})
		}

		let menu = await openMenu()
		const entries = within(menu).getAllByRole("menuitem")
		await expect(entries.map((entry) => entry.textContent)).toEqual(
			THREAD_MENU_ORDER,
		)
		await expect(
			within(menu).getByRole("menuitem", { name: "Open in viewer" }),
		).toBeVisible()
		const popup = menu.getBoundingClientRect()
		await expect(Math.abs(popup.left - pointer.clientX)).toBeLessThan(12)
		await expect(Math.abs(popup.top - pointer.clientY)).toBeLessThan(12)

		const [save, copy] = entries
		const restingBackground = getComputedStyle(copy).backgroundColor
		await userEvent.hover(copy)
		await waitFor(() =>
			expect(getComputedStyle(copy).backgroundColor).not.toBe(
				restingBackground,
			),
		)
		await expect(
			getComputedStyle(copy)
				.transitionDuration.split(",")
				.every((duration) => Number.parseFloat(duration) === 0),
		).toBe(true)

		await userEvent.click(save)
		await expect(args.imageMenu?.onSaveToLibrary).toHaveBeenCalledWith(
			"capture",
		)
		await waitFor(() => expect(screen.queryByRole("menu")).toBe(null))

		menu = await openMenu()
		await expect(menu).toBeVisible()
	},
})

export const Empty = meta.story({
	args: { items: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A message that carries nothing, every turn that is only text. Check that the row renders no element at all rather than an empty box: the bubble stacks its blocks with a gap, so an empty group would still cost the text one. `Default` covers the first file landing in it. " +
					FILLED_BY_TURN_BODY,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.queryByRole("group", { name: "Attachments" }),
		).not.toBeInTheDocument()
	},
})
